// ================= AUTHOR L.E.D. AI ASSISTED =================
// SMP 64-bit – Disc / Album Art (Fully Separated Pipelines)

// ---------------- COLOR ----------------
function RGBA(r, g, b, a) {
    return ((a << 24) | (r << 16) | (g << 8) | b);
}

// ---------------- CONFIG ----------------
var TIMER_INTERVAL = 50;
var SPIN_SPEED = 2.5;
var ROTATION_EASE = 0.12;
var PADDING = 10;

// ---------------- STATE ----------------
var discImage = null;
var albumArtImage = null;
var discBuffer = null;

var angle = 0;
var targetAngle = 0;

var drawX = 0, drawY = 0, drawW = 0, drawH = 0;

var discCache = {};
var spinningEnabled = true;
var discOnlyMode = window.GetProperty("DiscOnlyMode", false);
var useAlbumArt = window.GetProperty("UseAlbumArt", false);

// ---------------- PATH HELPERS ----------------
function normalizePath(p) {
    if (!p) return null;
    if (p.indexOf("file:///") === 0)
        p = p.replace("file:///", "").replace(/\//g, "\\");
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

// ---------------- IMAGE CACHE ----------------
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

// ---------------- ALBUM ART ----------------
function loadAlbumArt() {
    albumArtImage = null;
    var metadb = fb.GetNowPlaying();
    if (!metadb) return;

    albumArtImage = utils.GetAlbumArtV2(metadb, 0) || null;
}

// ---------------- DISC BUFFER ----------------
function createDiscBuffer() {
    discBuffer = null;

    if (!discImage || discOnlyMode || useAlbumArt) return;
    if (drawW < 1 || drawH < 1) return;

    var img = gdi.CreateImage(drawW, drawH);
    if (!img) return;

    var gr = img.GetGraphics();
    gr.SetSmoothingMode(2);

    gr.DrawImage(
        discImage,
        0, 0, drawW, drawH,
        0, 0, discImage.Width, discImage.Height
    );

    img.ReleaseGraphics(gr);
    discBuffer = img;
}

// ---------------- LAYOUT ----------------
function computeLayout() {
    var img = useAlbumArt ? albumArtImage : discImage;
    if (!img || img.Width <= 0 || img.Height <= 0) {
        drawW = drawH = 0;
        discBuffer = null;
        return;
    }

    var pad = useAlbumArt ? 0 : PADDING;

    var maxW = Math.max(1, window.Width - pad * 2);
    var maxH = Math.max(1, window.Height - pad * 2);

    var scale = Math.min(maxW / img.Width, maxH / img.Height);
    if (scale <= 0) return;

    drawW = Math.max(1, Math.floor(img.Width * scale));
    drawH = Math.max(1, Math.floor(img.Height * scale));
    drawX = Math.floor((window.Width - drawW) / 2);
    drawY = Math.floor((window.Height - drawH) / 2);

    if (!useAlbumArt) createDiscBuffer();
}

// ---------------- LOAD DISC ----------------
function loadDisc() {
    discImage = null;

    var folder = getTrackFolder();
    if (folder)
        discImage = tryLoadCached(folder + "disc.png") ||
                    tryLoadCached(folder + "disc.jpg");

    if (!discImage) {
        var album = sanitize(fb.TitleFormat("%album%").Eval());
        if (album) {
            var p = fb.ProfilePath + "album\\" + album + "\\";
            discImage = tryLoadCached(p + "disc.png") ||
                        tryLoadCached(p + "disc.jpg");
        }
    }

    if (!discImage) {
        var artist = sanitize(fb.TitleFormat("%artist%").Eval());
        if (artist) {
            var p = fb.ProfilePath + "album\\_artist\\" + artist + "\\";
            discImage = tryLoadCached(p + "disc.png") ||
                        tryLoadCached(p + "disc.jpg");
        }
    }

    if (!discImage) {
        var p = fb.ProfilePath + "album\\default\\";
        discImage = tryLoadCached(p + "disc.png") ||
                    tryLoadCached(p + "disc.jpg");
    }

    angle = targetAngle = 0;
}

// ---------------- MASTER LOAD ----------------
function reloadAll() {
    if (useAlbumArt) loadAlbumArt();
    else loadDisc();

    computeLayout();
    window.Repaint();
}

// ---------------- TIMER ----------------
var timer = window.SetInterval(function () {
    if (!useAlbumArt && !discOnlyMode && spinningEnabled && fb.IsPlaying && !fb.IsPaused && discBuffer) {
        targetAngle += SPIN_SPEED;
        angle += (targetAngle - angle) * ROTATION_EASE;
        window.Repaint();
    }
}, TIMER_INTERVAL);

// ---------------- EVENTS ----------------
function on_playback_new_track() { reloadAll(); }
function on_playback_stop() { angle = targetAngle = 0; window.Repaint(); }
function on_size() { computeLayout(); window.Repaint(); }

// ---------------- PAINT ----------------
function on_paint(gr) {
    gr.FillSolidRect(0, 0, window.Width, window.Height, RGBA(18,18,18,255));

    if (drawW < 1 || drawH < 1) return;

    gr.SetSmoothingMode(2);

    // ---- ALBUM ART PIPELINE ----
    if (useAlbumArt && albumArtImage) {
        gr.DrawImage(
            albumArtImage,
            drawX, drawY, drawW, drawH,
            0, 0, albumArtImage.Width, albumArtImage.Height
        );
        return;
    }

    // ---- DISC ONLY PIPELINE ----
    if (discOnlyMode || !discBuffer) {
        if (!discImage) return;
        gr.DrawImage(
            discImage,
            drawX, drawY, drawW, drawH,
            0, 0, discImage.Width, discImage.Height
        );
        return;
    }

    // ---- SPINNING DISC PIPELINE ----
    var a = angle % 360;
    if (a < 0) a += 360;

    gr.DrawImage(
        discBuffer,
        drawX, drawY, drawW, drawH,
        0, 0, discBuffer.Width, discBuffer.Height,
        a,
        drawX + drawW / 2,
        drawY + drawH / 2
    );
}

// ---------------- MENU ----------------
function on_mouse_rbtn_up(x, y) {
    var m = window.CreatePopupMenu();
    var i = 1;

    m.AppendMenuItem(useAlbumArt ? 0x8 : 0, i++, "Use album art");
    m.AppendMenuItem(discOnlyMode ? 0x8 : 0, i++, "Disc only mode");
    m.AppendMenuSeparator();
    m.AppendMenuItem(0, i++, "Spin speed: Slow");
    m.AppendMenuItem(0, i++, "Spin speed: Normal");
    m.AppendMenuItem(0, i++, "Spin speed: Fast");
    m.AppendMenuSeparator();
    m.AppendMenuItem(0, i++, "Reload image");
    m.AppendMenuItem(0, i++, "Clear cache");

    var r = m.TrackPopupMenu(x, y);

    switch (r) {
        case 1:
            useAlbumArt = !useAlbumArt;
            window.SetProperty("UseAlbumArt", useAlbumArt);
            reloadAll();
            break;
        case 2:
            discOnlyMode = !discOnlyMode;
            window.SetProperty("DiscOnlyMode", discOnlyMode);
            computeLayout();
            break;
        case 3: SPIN_SPEED = 1.0; break;
        case 4: SPIN_SPEED = 2.5; break;
        case 5: SPIN_SPEED = 5.0; break;
        case 6: reloadAll(); break;
        case 7: discCache = {}; reloadAll(); break;
    }

    window.Repaint();
    return true;
}

// ---------------- UNLOAD ----------------
function on_unload() {
    window.ClearInterval(timer);
}

// ---------------- INIT ----------------
reloadAll();
