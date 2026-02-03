// ---------------- AUTHOR L.E.D. AI ASSISTED ----------------

// ---------------- COLOR HELPER ----------------

function RGB(r, g, b) {
	return (0xff000000 | (r << 16) | (g << 8) | (b));
}

function RGBA(r, g, b, a) {
	return ((a << 24) | (r << 16) | (g << 8) | (b));
}

// ---------------- CONFIG ----------------
var SPIN_SPEED = 2.5;
var TIMER_INTERVAL = 50; // ms
var PADDING = 10;
var MAX_IMAGE_SIZE = 512;
var spinningEnabled = true;

// ---------------- STATE ----------------
var discImage = null;
var discBuffer = null; // Pre-scaled buffer for brightness consistency
var angle = 0;
var discDrawWidth = 0;
var discDrawHeight = 0;
var discX = 0;
var discY = 0;
var discCache = {}; // in-memory caching

// ---------------- Persisted last disc ----------------
var lastDiscPath = window.GetProperty("lastDiscPath", null);

// ---------------- PATH HELPERS ----------------
function normalizePath(p) {
    if (!p) return null;
    if (p.indexOf("file:///") === 0) {
        p = p.replace("file:///", "").replace(/\//g, "\\");
    }
    return p;
}

function getTrackFolder() {
    var path = fb.TitleFormat("%path%").Eval();
    if (!path) return null;
    path = normalizePath(path);
    return path.replace(/[^\\\/]+$/, "");
}

function sanitize(name) {
    if (!name) return "";
    return name.replace(/[\\\/:*?"<>|]/g, "_").trim();
}

// ---------------- IMAGE LOAD & CACHE ----------------
function tryLoadCached(path) {
    if (!path) return null;
    if (discCache[path]) return discCache[path];
    if (utils.FileExists(path)) {
        var img = gdi.Image(path);
        discCache[path] = img;
        lastDiscPath = path;
        window.SetProperty("lastDiscPath", path.replace(/\\/g, "\\\\"));
        return img;
    }
    console.log("Image not found: " + path); // Log the image path
    return null;
}

// ---------------- DISC BUFFER ----------------

function createDiscBuffer() {
    if (!discImage) return;

    var w = Math.max(1, discDrawWidth);
    var h = Math.max(1, discDrawHeight);

    // Create the disc buffer image
    discBuffer = gdi.CreateImage(w, h);
    if (!discBuffer) return;

    var gr = discBuffer.GetGraphics();
    gr.SetSmoothingMode(2);

    // Draw the original image scaled into the buffer
    gr.DrawImage(
        discImage,
        0, 0, w, h,           // Destination rectangle
        0, 0, discImage.Width, discImage.Height // Source rectangle
    );

    // Finalize the graphics context
    discBuffer.ReleaseGraphics(gr);
    // No need for a Render call
}

// ---------------- PRECOMPUTE DRAW POSITIONS ----------------
function computeDiscDrawParams() {
    if (!discImage) return;

    var maxWidth = window.Width - PADDING * 2;
    var maxHeight = window.Height - PADDING * 2;
    var scale = Math.min(maxWidth / discImage.Width, maxHeight / discImage.Height);

    discDrawWidth = Math.floor(discImage.Width * scale);
    discDrawHeight = Math.floor(discImage.Height * scale);
    discX = Math.floor((window.Width - discDrawWidth) / 2);
    discY = Math.floor((window.Height - discDrawHeight) / 2);

    createDiscBuffer(); // refresh buffer after computing positions
}

// ---------------- LOAD DISC ----------------
function loadDisc() {
    discImage = null;

    var trackFolder = getTrackFolder();

    // Track folder
    if (trackFolder) discImage = tryLoadCached(trackFolder + "disc.png") || tryLoadCached(trackFolder + "disc.jpg");

    // Album fallback
    if (!discImage) {
        var album = sanitize(fb.TitleFormat("%album%").Eval());
        if (album) {
            var albumFolder = fb.ProfilePath + "album\\" + album + "\\";
            discImage = tryLoadCached(albumFolder + "disc.png") || tryLoadCached(albumFolder + "disc.jpg");
        }
    }

    // Artist fallback
    if (!discImage) {
        var artist = sanitize(fb.TitleFormat("%artist%").Eval());
        if (artist) {
            var artistFolder = fb.ProfilePath + "album\\_artist\\" + artist + "\\";
            discImage = tryLoadCached(artistFolder + "disc.png") || tryLoadCached(artistFolder + "disc.jpg");
        }
    }

    // Last disc fallback
    if (!discImage && lastDiscPath) {
        var safePath = lastDiscPath.replace(/\\\\/g, "\\");
        if (utils.FileExists(safePath)) discImage = tryLoadCached(safePath);
    }

    // Default fallback
    if (!discImage) {
        var defaultFolder = fb.ProfilePath + "album\\default\\";
        discImage = tryLoadCached(defaultFolder + "disc.png") || tryLoadCached(defaultFolder + "disc.jpg");
    }

    angle = 0;
	
	 // [Your existing logic here]

    if (discImage) {
        computeDiscDrawParams(); // Update positions
        window.Repaint(); // Ensure repaint after loading
    }
}

// ---------------- TIMER ----------------
var timer = window.SetInterval(function () {
    if (spinningEnabled && fb.IsPlaying && !fb.IsPaused) {
        angle = (angle + SPIN_SPEED) % 360; // Angle should always stay within 0-360
        window.Repaint(); // Request a redraw while playing
    }
}, TIMER_INTERVAL);

// ---------------- EVENTS ----------------
function on_playback_new_track() { loadDisc(); }
function on_playback_stop() { angle = 0; window.Repaint(); }
function on_size() { if (discImage) computeDiscDrawParams(); window.Repaint(); }

// ---------------- PAINT ----------------
function on_paint(gr) {
    // Clear the background
    gr.FillSolidRect(0, 0, window.Width, window.Height, RGBA(18, 18, 18, 255));

    if (discBuffer) {
        gr.SetSmoothingMode(2);
        gr.DrawImage(
            discBuffer,
            discX, discY, discDrawWidth, discDrawHeight,
            0, 0, discDrawWidth, discDrawHeight, // No rotation needed here
            angle,
            window.Width / 2,
            window.Height / 2
        );
    }
}

// ---------------- RIGHT-CLICK MENU ----------------
function on_mouse_rbtn_up(x, y) {
    var menu = window.CreatePopupMenu();
    var idx = 1;

    menu.AppendMenuItem(0, idx++, "Spin Speed: Slow");
    menu.AppendMenuItem(0, idx++, "Spin Speed: Normal");
    menu.AppendMenuItem(0, idx++, "Spin Speed: Fast");
    menu.AppendMenuSeparator();
    menu.AppendMenuItem(spinningEnabled ? 0x00000008 : 0, idx++, "Enable Spinning");
    menu.AppendMenuSeparator();
    menu.AppendMenuItem(0, idx++, "Increase Padding");
    menu.AppendMenuItem(0, idx++, "Decrease Padding");
    menu.AppendMenuSeparator();
    menu.AppendMenuItem(0, idx++, "Reload Disc Image");
    menu.AppendMenuItem(0, idx++, "Clear Image Cache");

    var choice = menu.TrackPopupMenu(x, y);

    switch (choice) {
        case 1: SPIN_SPEED = 1.0; break;
        case 2: SPIN_SPEED = 2.5; break;
        case 3: SPIN_SPEED = 5.0; break;
        case 4: spinningEnabled = !spinningEnabled; break;
        case 5: PADDING += 5; computeDiscDrawParams(); break;
        case 6: PADDING = Math.max(0, PADDING - 5); computeDiscDrawParams(); break;
        case 7: loadDisc(); break;
        case 8: discCache = {}; loadDisc(); break;
    }

    window.Repaint();
    return true;
}

// ---------------- UNLOAD ----------------
function on_unload() {
    window.ClearInterval(timer);
}

// ---------------- INIT ----------------
loadDisc();
