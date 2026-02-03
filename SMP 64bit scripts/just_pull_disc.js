// ---------------- COLOR HELPER ----------------
function RGBA(r, g, b, a) {
    a = (typeof a === "number") ? a : 255;
    return ((a & 0xFF) << 24) | ((r & 0xFF) << 16) | ((g & 0xFF) << 8) | (b & 0xFF);
}

// Configuration
var PADDING = 10;
var discImage = null;
var discDrawWidth = 0;
var discDrawHeight = 0;
var discX = 0;
var discY = 0;

// Load and display the disc image
function loadDisc() {
    discImage = null;

    // Get the path to the current track's directory
    var trackFolder = getTrackFolder();
    if (trackFolder) {
        discImage = tryLoadImage(trackFolder + "disc.png");
    }

    // Compute parameters for drawing if the image was loaded
    if (discImage) {
        computeDiscDrawParams();
    }

    window.Repaint();
}

// Helper functions
function getTrackFolder() {
    var path = fb.TitleFormat("%path%").Eval();
    if (!path) return null;
    return path.replace(/[^\\\/]+$/, "");
}

function tryLoadImage(path) {
    if (utils.FileExists(path)) {
        return gdi.Image(path);
    }
    return null;
}

function computeDiscDrawParams() {
    if (!discImage) return;

    var maxWidth = window.Width - PADDING * 2;
    var maxHeight = window.Height - PADDING * 2;
    var scale = Math.min(maxWidth / discImage.Width, maxHeight / discImage.Height);

    discDrawWidth = Math.floor(discImage.Width * scale);
    discDrawHeight = Math.floor(discImage.Height * scale);
    discX = Math.floor((window.Width - discDrawWidth) / 2);
    discY = Math.floor((window.Height - discDrawHeight) / 2);
}

// Paint the disc image
function on_paint(gr) {
    gr.FillSolidRect(0, 0, window.Width, window.Height, RGBA(18, 18, 18, 255)); // Background
    if (discImage) {
        // Correct DrawImage call with the right parameters
        gr.DrawImage(discImage, discX, discY, discDrawWidth, discDrawHeight, 0, 0, discImage.Width, discImage.Height);
    }
}

// Events
function on_playback_new_track() { loadDisc(); }
function on_size() { loadDisc(); }

// Initial load
loadDisc();
