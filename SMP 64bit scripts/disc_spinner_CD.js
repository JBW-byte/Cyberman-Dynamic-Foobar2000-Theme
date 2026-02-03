// ================= AUTHOR L.E.D. AI ASSISTED =================

// ---------------- COLOR HELPERS ----------------
function RGBA(r, g, b, a) {
    return ((a << 24) | (r << 16) | (g << 8) | b);
}

// ---------------- CONFIG ----------------
var SPIN_SPEED = 2.5;
var ROTATION_EASE = 0.12;
var TIMER_INTERVAL = 50;
var PADDING = 10;
var ANGLE_THRESHOLD = 0.05; // minimum angle change to trigger repaint

// ---------------- STATE ----------------
var discImage = null;
var discBuffer = null;

var angle = 0;
var targetAngle = 0;

var discDrawWidth = 0;
var discDrawHeight = 0;
var discX = 0;
var discY = 0;

var discCache = {};
var spinningEnabled = true;
var discOnlyMode = window.GetProperty("DiscOnlyMode", false);

// Track buffer state
var _lastBufferWidth = 0;
var _lastBufferHeight = 0;
var _lastDiscImage = null;

// ---------------- PATH HELPERS ----------------
function normalizePath(p) {
    if (!p) return null;
    if (p.indexOf("file:///") === 0) p = p.replace("file:///", "").replace(/\//g, "\\");
    return p;
}

function getTrackFolder() {
    var path = fb.TitleFormat("%path%").Eval();
    if (!path) return null;
    return normalizePath(path).replace(/[^\\\/]+$/, "");
}

function sanitize(s) {
    return s ? s.replace(/[\\\/:*?"<>|]/g, "_").trim() : "";
}

// ---------------- IMAGE LOAD & CACHE ----------------
function tryLoadCached(path) {
    if (!path) return null;
    if (discCache[path]) return discCache[path];
    if (utils.FileExists(path)) {
        var img = gdi.Image(path);
        discCache[path] = img;
        return img;
    }
    return null;
}

// ---------------- DISC BUFFER ----------------
function createDiscBuffer() {
    if (!discImage || discOnlyMode) {
        discBuffer = null;
        _lastBufferWidth = 0;
        _lastBufferHeight = 0;
        _lastDiscImage = null;
        return;
    }

    if (_lastDiscImage === discImage &&
        _lastBufferWidth === discDrawWidth &&
        _lastBufferHeight === discDrawHeight) return;

    var w = Math.max(1, discDrawWidth);
    var h = Math.max(1, discDrawHeight);

    discBuffer = gdi.CreateImage(w, h);
    if (!discBuffer) return;

    var gr = discBuffer.GetGraphics();
    gr.SetSmoothingMode(2);
    gr.DrawImage(discImage, 0, 0, w, h, 0, 0, discImage.Width, discImage.Height);
    discBuffer.ReleaseGraphics(gr);

    _lastDiscImage = discImage;
    _lastBufferWidth = discDrawWidth;
    _lastBufferHeight = discDrawHeight;
}

// ---------------- LAYOUT ----------------
function computeDiscDrawParams() {
    if (!discImage) return;

    var maxW = window.Width - PADDING * 2;
    var maxH = window.Height - PADDING * 2;
    var scale = Math.min(maxW / discImage.Width, maxH / discImage.Height);

    discDrawWidth  = Math.floor(discImage.Width  * scale);
    discDrawHeight = Math.floor(discImage.Height * scale);
    discX = Math.floor((window.Width  - discDrawWidth)  / 2);
    discY = Math.floor((window.Height - discDrawHeight) / 2);

    createDiscBuffer();
}

// ---------------- LOAD DISC ----------------
function loadDisc() {
    discImage = null;

    var folder = getTrackFolder();
    if (folder) discImage = tryLoadCached(folder + "disc.png") || tryLoadCached(folder + "disc.jpg");

    if (!discImage) {
        var album = sanitize(fb.TitleFormat("%album%").Eval());
        if (album) {
            var p = fb.ProfilePath + "album\\" + album + "\\";
            discImage = tryLoadCached(p + "disc.png") || tryLoadCached(p + "disc.jpg");
        }
    }

    if (!discImage) {
        var artist = sanitize(fb.TitleFormat("%artist%").Eval());
        if (artist) {
            var p = fb.ProfilePath + "album\\_artist\\" + artist + "\\";
            discImage = tryLoadCached(p + "disc.png") || tryLoadCached(p + "disc.jpg");
        }
    }

    if (!discImage) {
        var p = fb.ProfilePath + "album\\default\\";
        discImage = tryLoadCached(p + "disc.png") || tryLoadCached(p + "disc.jpg");
    }

    angle = targetAngle = 0;
    _lastDiscImage = null;

    if (discImage) computeDiscDrawParams();
    window.Repaint();
}

// ---------------- TIMER ----------------
var timer = window.SetInterval(function () {
    if (!discOnlyMode && spinningEnabled && fb.IsPlaying && !fb.IsPaused && discBuffer) {
        targetAngle += SPIN_SPEED;

        var delta = (targetAngle - angle) * ROTATION_EASE;
        if (Math.abs(delta) >= ANGLE_THRESHOLD) {
            angle += delta;
            window.Repaint();
        }
    }
}, TIMER_INTERVAL);

// ---------------- EVENTS ----------------
function on_playback_new_track() { loadDisc(); }
function on_playback_stop() { angle = targetAngle = 0; window.Repaint(); }
function on_size() { computeDiscDrawParams(); window.Repaint(); }

// ---------------- PAINT ----------------
function on_paint(gr) {
    gr.FillSolidRect(0, 0, window.Width, window.Height, RGBA(18,18,18,255));
    if (!discImage) return;

    gr.SetSmoothingMode(2);

    if (discOnlyMode || !discBuffer) {
        gr.DrawImage(discImage, discX, discY, discDrawWidth, discDrawHeight,
                     0, 0, discImage.Width, discImage.Height);
        return;
    }

    var drawAngle = angle % 360;
    if (drawAngle < 0) drawAngle += 360;

    gr.DrawImage(discBuffer, discX, discY, discDrawWidth, discDrawHeight,
                 0, 0, discBuffer.Width, discBuffer.Height,
                 drawAngle, discX + discDrawWidth/2, discY + discDrawHeight/2);
}

// ---------------- MENU ----------------
function on_mouse_rbtn_up(x, y) {
    var m = window.CreatePopupMenu();
    var i = 1;

    m.AppendMenuItem(discOnlyMode ? 0x8 : 0, i++, "Disc only mode");
    m.AppendMenuSeparator();
    m.AppendMenuItem(0, i++, "Spin speed: Slow");
    m.AppendMenuItem(0, i++, "Spin speed: Normal");
    m.AppendMenuItem(0, i++, "Spin speed: Fast");
    m.AppendMenuSeparator();
    m.AppendMenuItem(0, i++, "Reload disc");
    m.AppendMenuItem(0, i++, "Clear image cache");

    var r = m.TrackPopupMenu(x, y);

    switch (r) {
        case 1:
            discOnlyMode = !discOnlyMode;
            window.SetProperty("DiscOnlyMode", discOnlyMode);
            createDiscBuffer();
            break;
        case 2: SPIN_SPEED = 1.0; break;
        case 3: SPIN_SPEED = 2.5; break;
        case 4: SPIN_SPEED = 5.0; break;
        case 5: loadDisc(); break;
        case 6: discCache = {}; loadDisc(); break;
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
