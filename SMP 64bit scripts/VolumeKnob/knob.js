// ---------------- AUTHOR L.E.D. AI ASSISTED ----------------
// =====================================================
// Spider Monkey Panel v2 (64-bit) – Responsive Volume Knob with Dark Rim
// Smooth animation, drag easing, dynamic marker, tick marks on outer edge
// =====================================================

// ==================== CONFIG =========================
var CONFIG = {
    DRAG_SCALE: 0.5,
    WHEEL_STEP: 2,
    ANGLE_SPEED: 0.2,
    DRAG_EASING: 0.3,
    SNAP_ENABLED: true,
    SNAP_TOLERANCE_DB: 0.5, // very subtle snap
    PADDING: 20
};

// -------------------- COLOR --------------------------
function RGB(r, g, b) {
    return 0xff000000 | (r << 16) | (g << 8) | b;
}

// -------------------- PATH ---------------------------
function getScriptDir() {
    var p = window.ScriptInfo.Path;
    return p.substring(0, p.lastIndexOf("\\") + 1);
}

// -------------------- SWEEP SETTINGS ----------------
var ANGLE_MIN = 120;
var ANGLE_MAX = 420;
var SWEEP_TOTAL = ANGLE_MAX - ANGLE_MIN;
var SWEEP_HALF = SWEEP_TOTAL / 2;
var TICK_COUNT = 21;
var ROTATION_OFFSET = -270;
var DEG2RAD = Math.PI / 180;

// -------------------- INTERNAL -----------------------
var knobImg = null;
var dragging = false;
var lastY = 0;
var uiVolume = 50;
var currentAngle = 0;
var targetAngle = 0;
var dragTargetAngle = 0;
var CURSOR_ARROW = 32512;
var CURSOR_HAND  = 32649;

// =====================================================
// INIT
// =====================================================
function on_init() {
    try {
        knobImg = gdi.Image(getScriptDir() + "knob.png");
    } catch (e) {
        console.log("PNG load failed:", e);
    }
    syncFromFoobar();
}

// =====================================================
// VOLUME ↔ ANGLE MAPPING
// =====================================================
function uiVolumeToAngle(v) {
    return v <= 50
        ? ANGLE_MIN + (v / 50) * SWEEP_HALF
        : ANGLE_MIN + SWEEP_HALF + ((v - 50) / 50) * SWEEP_HALF;
}

function uiVolumeToFbVolume(v) {
    return v <= 50
        ? -100 + (v / 50 * 91.5)
        : -8.5 + ((v - 50) / 50 * 8.5);
}

function fbVolumeToUiVolume(fbVol) {
    return fbVol <= -8.5
        ? (fbVol + 100) / 91.5 * 50
        : 50 + (fbVol + 8.5) / 8.5 * 50;
}

// =====================================================
// SNAP LOGIC (SAFE)
// =====================================================
function applySnap(db) {
    if (!CONFIG.SNAP_ENABLED || dragging) return db;

    if (Math.abs(db - 0) <= CONFIG.SNAP_TOLERANCE_DB) return 0;
    if (Math.abs(db + 8.5) <= CONFIG.SNAP_TOLERANCE_DB) return -8.5;
    if (Math.abs(db + 20) <= CONFIG.SNAP_TOLERANCE_DB) return -20;

    return db;
}

// =====================================================
// SYNC
// =====================================================
function syncFromFoobar() {
    var fbVol = Math.max(-100, Math.min(0, fb.Volume));
    uiVolume = fbVolumeToUiVolume(fbVol);

    targetAngle = uiVolumeToAngle(uiVolume);
    dragTargetAngle = targetAngle;

    window.Repaint();
}

function on_volume_change() {
    syncFromFoobar();
}

// =====================================================
// DRAW
// =====================================================
function on_paint(gr) {
    var w = window.Width;
    var h = window.Height;
    if (w <= 0 || h <= 0) return;

    var cx = w * 0.5;
    var cy = h * 0.5;

    var size = Math.min(w, h) - CONFIG.PADDING * 2;
    var x = cx - size * 0.5;
    var y = cy - size * 0.5;

    // Knob body
    gr.FillEllipse(x, y, size, size, RGB(80,80,80));

    if (knobImg) {
        gr.DrawImage(knobImg, x, y, size, size, 0, 0, knobImg.Width, knobImg.Height);
    }

    // Inner shading
    var innerSize = size * 0.92;
    gr.FillEllipse(cx - innerSize/2, cy - innerSize/2, innerSize, innerSize, RGB(50,50,50));

    // Tick marks
    var radius = size * 0.5;
    var tickLen = size * 0.04;

    for (var i = 0; i < TICK_COUNT; i++) {
        var a = (ANGLE_MIN + i/(TICK_COUNT-1)*SWEEP_TOTAL + ROTATION_OFFSET) * DEG2RAD;
        var sa = Math.sin(a);
        var ca = Math.cos(a);

        gr.DrawLine(
            cx + sa*(radius - tickLen),
            cy - ca*(radius - tickLen),
            cx + sa*radius,
            cy - ca*radius,
            2,
            RGB(160,160,160)
        );
    }

    // Smooth animation
    currentAngle += (dragTargetAngle - currentAngle) * CONFIG.DRAG_EASING;
    currentAngle += (targetAngle - currentAngle) * CONFIG.ANGLE_SPEED;

    var rad = (currentAngle + ROTATION_OFFSET) * DEG2RAD;
    var sr = Math.sin(rad);
    var cr = Math.cos(rad);

    var len = size * 0.45;
    var thickness = Math.max(1, size * 0.015);
    var segments = 10;

    for (var s = 0; s < segments; s++) {
        var t0 = 0.5 + s/segments * 0.5;
        var t1 = 0.5 + (s+1)/segments * 0.5;

        gr.DrawLine(
            cx + sr*len*t0,
            cy - cr*len*t0,
            cx + sr*len*t1,
            cy - cr*len*t1,
            thickness,
            RGB(255, 100 + 155*s/segments, 100 + 155*s/segments)
        );
    }

    if (Math.abs(currentAngle - targetAngle) > 0.05) {
        window.Repaint();
    }
}

// =====================================================
// HIT TEST
// =====================================================
function hitKnob(x, y) {
    var cx = window.Width * 0.5;
    var cy = window.Height * 0.5;
    var r = Math.min(window.Width, window.Height) * 0.5 - CONFIG.PADDING;
    var dx = x - cx;
    var dy = y - cy;
    return dx*dx + dy*dy <= r*r;
}

// =====================================================
// MOUSE INPUT
// =====================================================
function on_mouse_lbtn_down(x, y) {
    if (hitKnob(x, y)) {
        dragging = true;
        lastY = y;
        window.SetCursor(CURSOR_HAND);
        return true;
    }
    return false;
}

function on_mouse_lbtn_up() {
    if (dragging) {
        dragging = false;
        window.SetCursor(CURSOR_ARROW);
        return true;
    }
    return false;
}

function on_mouse_move(x, y) {
    if (!dragging) return false;

    var dy = lastY - y;
    uiVolume = Math.max(0, Math.min(100, uiVolume + dy * CONFIG.DRAG_SCALE));

    dragTargetAngle = uiVolumeToAngle(uiVolume);
    targetAngle = dragTargetAngle;

    var db = applySnap(uiVolumeToFbVolume(uiVolume));
    fb.Volume = Math.max(-100, Math.min(0, db));

    lastY = y;
    window.Repaint();
    return true;
}

function on_mouse_wheel(step) {
    uiVolume = Math.max(0, Math.min(100, uiVolume + step * CONFIG.WHEEL_STEP));

    targetAngle = uiVolumeToAngle(uiVolume);
    dragTargetAngle = targetAngle;

    fb.Volume = applySnap(uiVolumeToFbVolume(uiVolume));
    window.Repaint();
    return true;
}

function on_mouse_lbtn_dblclk(x, y) {
    if (hitKnob(x, y)) {
        fb.RunMainMenuCommand("Playback/Volume/Mute");
        syncFromFoobar();
        return true;
    }
    return false;
}

// =====================================================
// CLEANUP
// =====================================================
function on_exit() {
    if (knobImg) knobImg.Dispose();
}
