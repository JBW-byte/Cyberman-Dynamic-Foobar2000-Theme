// ---------------- AUTHOR L.E.D. AI ASSISTED ----------------
// =====================================================
// Spider Monkey Panel v2 (64-bit) – Responsive Volume Knob
// =====================================================

// ==================== CONFIG =========================
var CONFIG = {
    DRAG_SCALE: 0.5,
    WHEEL_STEP: 2,
    ANGLE_SPEED: 0.2,
    DRAG_EASING: 0.3,
    SNAP_ENABLED: true,
    SNAP_TOLERANCE_DB: 0.5,
    PADDING: 20
};

// -------------------- COLOR --------------------------
function RGB(r,g,b){ return 0xFF000000 | (r<<16) | (g<<8) | b; }
function RGBA(r,g,b,a){ return (a<<24)|(r<<16)|(g<<8)|b; }

// -------------------- THEMES -------------------------
var THEMES = [
    { name:"Classic Gray", knob:RGB(80,80,80), inner:RGB(50,50,50), tick:RGB(160,160,160), marker:RGB(255,180,180) },
    { name:"Warm Amber",   knob:RGB(90,70,50), inner:RGB(60,45,30), tick:RGB(200,160,100), marker:RGB(255,200,120) },
    { name:"Cool Blue",    knob:RGB(60,70,90), inner:RGB(40,50,70), tick:RGB(140,170,220), marker:RGB(160,200,255) },
    { name:"Mint Green",   knob:RGB(60,90,80), inner:RGB(40,65,55), tick:RGB(140,200,180), marker:RGB(160,255,220) },
    { name:"Purple Haze",  knob:RGB(85,70,95), inner:RGB(55,45,65), tick:RGB(190,160,220), marker:RGB(220,180,255) },
    { name:"Fire Red",     knob:RGB(90,55,55), inner:RGB(60,35,35), tick:RGB(220,150,150), marker:RGB(255,170,170) },
    { name:"Mono Dark",    knob:RGB(50,50,50), inner:RGB(30,30,30), tick:RGB(120,120,120), marker:RGB(200,200,200) },
    { name:"Ocean Teal",   knob:RGB(40,80,85), inner:RGB(25,55,60), tick:RGB(120,190,200), marker:RGB(140,230,240) },
    { name:"Gold Brass",   knob:RGB(95,85,50), inner:RGB(70,60,35), tick:RGB(230,210,150), marker:RGB(255,235,180) },
    { name:"Neon Pink",    knob:RGB(90,50,70), inner:RGB(65,35,50), tick:RGB(230,150,200), marker:RGB(255,170,220) }
];

var currentThemeId = window.GetProperty("VolumeKnob.Theme", 0);

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
function on_init(){
    try {
        knobImg = gdi.Image(window.ScriptInfo.Path.replace(/[^\\]+$/, "") + "knob.png");
    } catch(e){}
    syncFromFoobar();
}

// =====================================================
// VOLUME CURVE (CORRECTED)
// =====================================================
function uiVolumeToFbVolume(v){
    if (v <= 25)  return -100 + (v / 25) * 80;       // -100 → -20
    if (v <= 50)  return -20 + ((v - 25) / 25) * 11.5; // -20 → -8.5
    return -8.5 + ((v - 50) / 50) * 8.5;            // -8.5 → 0
}

function fbVolumeToUiVolume(db){
    if (db <= -20) return (db + 100) / 80 * 25;
    if (db <= -8.5) return 25 + (db + 20) / 11.5 * 25;
    return 50 + (db + 8.5) / 8.5 * 50;
}

function uiVolumeToAngle(v){
    return v <= 50
        ? ANGLE_MIN + (v / 50) * SWEEP_HALF
        : ANGLE_MIN + SWEEP_HALF + ((v - 50) / 50) * SWEEP_HALF;
}

// =====================================================
// SNAP
// =====================================================
function applySnap(db){
    if (!CONFIG.SNAP_ENABLED || dragging) return db;
    if (Math.abs(db) <= CONFIG.SNAP_TOLERANCE_DB) return 0;
    if (Math.abs(db + 10) <= CONFIG.SNAP_TOLERANCE_DB) return -10;
    return db;
}

// =====================================================
// SYNC
// =====================================================
function syncFromFoobar(){
    var fbVol = Math.max(-100, Math.min(0, fb.Volume));
    uiVolume = fbVolumeToUiVolume(fbVol);
    targetAngle = dragTargetAngle = uiVolumeToAngle(uiVolume);
    window.Repaint();
}

function on_volume_change(){ syncFromFoobar(); }

// =====================================================
// DRAW
// =====================================================
function on_paint(gr){
    var w = window.Width, h = window.Height;
    if (!w || !h) return;

    var theme = THEMES[currentThemeId];
    var cx = w/2, cy = h/2;
    var size = Math.min(w,h) - CONFIG.PADDING*2;
    var x = cx - size/2, y = cy - size/2;

    gr.FillEllipse(x,y,size,size,theme.knob);

    if (knobImg)
        gr.DrawImage(knobImg,x,y,size,size,0,0,knobImg.Width,knobImg.Height);

    var inner = size*0.92;
    gr.FillEllipse(cx-inner/2,cy-inner/2,inner,inner,theme.inner);

    var radius = size*0.5, tickLen = size*0.04;
    for (var i=0;i<TICK_COUNT;i++){
        var a=(ANGLE_MIN+i/(TICK_COUNT-1)*SWEEP_TOTAL+ROTATION_OFFSET)*DEG2RAD;
        var sa=Math.sin(a), ca=Math.cos(a);
        gr.DrawLine(
            cx+sa*(radius-tickLen), cy-ca*(radius-tickLen),
            cx+sa*radius,          cy-ca*radius,
            2, theme.tick
        );
    }

    currentAngle += (dragTargetAngle-currentAngle)*CONFIG.DRAG_EASING;
    currentAngle += (targetAngle-currentAngle)*CONFIG.ANGLE_SPEED;

    var rad=(currentAngle+ROTATION_OFFSET)*DEG2RAD;
    var sr=Math.sin(rad), cr=Math.cos(rad);
    var alpha = fb.IsMuted ? 90 : 255;

    for (var s=0;s<10;s++){
        var t0=0.5+s/10*0.5, t1=0.5+(s+1)/10*0.5;
        gr.DrawLine(
            cx+sr*size*0.45*t0, cy-cr*size*0.45*t0,
            cx+sr*size*0.45*t1, cy-cr*size*0.45*t1,
            Math.max(1,size*0.015),
            RGBA(
                (theme.marker>>16)&255,
                (theme.marker>>8)&255,
                theme.marker&255,
                alpha
            )
        );
    }

    if (Math.abs(currentAngle-targetAngle)>0.05)
        window.Repaint();
}

// =====================================================
// RIGHT CLICK MENU (RESTORED)
// =====================================================
function on_mouse_rbtn_up(x, y){
    var menu = window.CreatePopupMenu();

    for (var i = 0; i < THEMES.length; i++){
        menu.AppendMenuItem(0, i + 1, THEMES[i].name);
        if (i === currentThemeId)
            menu.CheckMenuItem(i + 1, true);
    }

    var id = menu.TrackPopupMenu(x, y);
    if (id > 0){
        currentThemeId = id - 1;
        window.SetProperty("VolumeKnob.Theme", currentThemeId);
        window.Repaint();
    }
    return true;
}

// =====================================================
// MOUSE INPUT
// =====================================================
function on_mouse_lbtn_down(x,y){
    if (!hitKnob(x,y)) return false;
    dragging = true;
    lastY = y;
    window.SetCursor(CURSOR_HAND);
    return true;
}

function on_mouse_lbtn_up(){
    if (!dragging) return false;
    dragging = false;
    window.SetCursor(CURSOR_ARROW);
    return true;
}

function on_mouse_move(x,y){
    if (!dragging) return false;

    uiVolume = Math.max(0, Math.min(100,
        uiVolume + (lastY - y) * CONFIG.DRAG_SCALE
    ));

    targetAngle = dragTargetAngle = uiVolumeToAngle(uiVolume);
    fb.Volume = applySnap(uiVolumeToFbVolume(uiVolume));

    lastY = y;
    window.Repaint();
    return true;
}

function on_mouse_wheel(step){
    uiVolume = Math.max(0, Math.min(100, uiVolume + step * CONFIG.WHEEL_STEP));
    targetAngle = dragTargetAngle = uiVolumeToAngle(uiVolume);
    fb.Volume = applySnap(uiVolumeToFbVolume(uiVolume));
    window.Repaint();
    return true;
}

function on_mouse_lbtn_dblclk(x,y){
    if (!hitKnob(x,y)) return false;
    fb.RunMainMenuCommand("Playback/Volume/Mute");
    return true;
}

// =====================================================
// HIT TEST
// =====================================================
function hitKnob(x,y){
    var cx=window.Width/2, cy=window.Height/2;
    var r=Math.min(window.Width,window.Height)/2-CONFIG.PADDING;
    var dx=x-cx, dy=y-cy;
    return dx*dx+dy*dy<=r*r;
}

// =====================================================
// CLEANUP
// =====================================================
function on_exit(){
    if (knobImg) knobImg.Dispose();
}
