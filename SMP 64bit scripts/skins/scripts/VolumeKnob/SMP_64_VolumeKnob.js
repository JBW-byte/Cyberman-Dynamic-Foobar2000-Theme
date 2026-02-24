'use strict';
		  // ======= AUTHOR L.E.D. (AI-assisted) ========\\
		 // ========  SMP 64bit Volume Knob V2.0  ========\\
		// =========== Simple Function + Themes ===========\\

 // ===================*** Foobar2000 64bit ***================== \\
// ======= For Spider Monekey Panel 64bit, author: marc2003 ====== \\

window.DefineScript('SMP 64bit Volume Knob V2', { author: 'L.E.D.' });

// ====================== HELPER INCLUDES ======================
// Lodash first (needed for helpers.js if it uses _)
include(fb.ComponentPath + 'samples\\complete\\js\\lodash.min.js');
include(fb.ComponentPath + 'samples\\complete\\js\\helpers.js');
include(fb.ComponentPath + 'samples\\complete\\js\\panel.js');

// ====================== PANEL INITIALIZATION ======================
const panel = new _panel(false);

// ====================== PROPERTIES ======================
const props = { currentTheme: new _p('VolumeKnob.Theme', 0) };

// ====================== CONFIG ======================
const CONFIG = Object.freeze({
    DRAG_SCALE: 0.5,
    WHEEL_STEP: 2,
    SNAP_ENABLED: true,
    SNAP_TOLERANCE_DB: 0.5,
    PADDING: 20,

    DRAG_FOLLOW_SPEED: 1.0,
    RELEASE_EASING: 0.18,
    ANGLE_EPSILON: 0.05,
    ANIMATION_INTERVAL: Math.floor(1000 / 60),

    ANGLE_MIN: 120,
    ANGLE_MAX: 420,
    TICK_COUNT: 21,
    ROTATION_OFFSET: -270,

    INNER_RATIO: 0.92,
    TICK_LENGTH_RATIO: 0.04,
    MARKER_START_RATIO: 0.225,
    MARKER_END_RATIO: 0.45,
    MARKER_SEGMENTS: 10,
    MARKER_WIDTH_RATIO: 0.015,

    CURSOR_ARROW: 32512,
    CURSOR_HAND: 32649,

    VOL_BREAKPOINT_1: 25,
    VOL_BREAKPOINT_2: 50,
    DB_BREAKPOINT_1: -20,
    DB_BREAKPOINT_2: -8.5
});

// ====================== PRE-CALCULATED CONSTANTS ======================
const SWEEP_TOTAL = CONFIG.ANGLE_MAX - CONFIG.ANGLE_MIN;
const SWEEP_HALF = SWEEP_TOTAL / 2;
const DEG2RAD = Math.PI / 180;

// Precompute volume slopes for fast uiToDb / dbToUi
const VOL_SLOPE_1 = 80 / CONFIG.VOL_BREAKPOINT_1;
const VOL_SLOPE_2 = (CONFIG.DB_BREAKPOINT_2 - CONFIG.DB_BREAKPOINT_1) / CONFIG.VOL_BREAKPOINT_1;
const VOL_SLOPE_3 = Math.abs(CONFIG.DB_BREAKPOINT_2) / (100 - CONFIG.VOL_BREAKPOINT_2);

// ====================== THEMES ======================
const THEMES = [
    { name: "Classic Gray", knob: _RGB(80,80,80), inner: _RGB(50,50,50), tick: _RGB(160,160,160), marker: _RGB(255,180,180) },
    { name: "Warm Amber", knob: _RGB(90,70,50), inner: _RGB(60,45,30), tick: _RGB(200,160,100), marker: _RGB(255,200,120) },
    { name: "Cool Blue", knob: _RGB(60,70,90), inner: _RGB(40,50,70), tick: _RGB(140,170,220), marker: _RGB(160,200,255) },
    { name: "Mint Green", knob: _RGB(60,90,80), inner: _RGB(40,65,55), tick: _RGB(140,200,180), marker: _RGB(160,255,220) },
    { name: "Purple Haze", knob: _RGB(85,70,95), inner: _RGB(55,45,65), tick: _RGB(190,160,220), marker: _RGB(220,180,255) },
    { name: "Fire Red", knob: _RGB(90,55,55), inner: _RGB(60,35,35), tick: _RGB(220,150,150), marker: _RGB(255,170,170) },
    { name: "Mono Dark", knob: _RGB(50,50,50), inner: _RGB(30,30,30), tick: _RGB(120,120,120), marker: _RGB(200,200,200) },
    { name: "Ocean Teal", knob: _RGB(40,80,85), inner: _RGB(25,55,60), tick: _RGB(120,190,200), marker: _RGB(140,230,240) },
    { name: "Gold Brass", knob: _RGB(95,85,50), inner: _RGB(70,60,35), tick: _RGB(230,210,150), marker: _RGB(255,235,180) },
    { name: "Neon Pink", knob: _RGB(90,50,70), inner: _RGB(65,35,50), tick: _RGB(230,150,200), marker: _RGB(255,170,220) }
];

const _clampedTheme = Math.max(0, Math.min(THEMES.length - 1, props.currentTheme.value));
if (_clampedTheme !== props.currentTheme.value) props.currentTheme.value = _clampedTheme;

// ====================== STATE MANAGEMENT ======================
const State = {
    dragging: false,
    lastY: 0,
    uiVolume: 50,
    currentAngle: 0,
    targetAngle: 0,
    dragTargetAngle: 0,
    animationTimer: null,
    needsRepaint: false,
    geometryCache: {
        valid: false,
        width: 0,
        height: 0,
        cx: 0,
        cy: 0,
        size: 0,
        x: 0,
        y: 0,
        radius: 0,
        innerSize: 0,
        tickLength: 0,
        tickAngles: [],
        markerSegments: []
    },

    updateGeometryCache(w,h) {
        const cache = this.geometryCache;
        if(cache.valid && cache.width===w && cache.height===h) return;

        cache.width = w;
        cache.height = h;
        cache.cx = w/2;
        cache.cy = h/2;
        cache.size = Math.min(w,h)-CONFIG.PADDING*2;
        cache.x = cache.cx - cache.size/2;
        cache.y = cache.cy - cache.size/2;
        cache.radius = cache.size*0.5;
        cache.innerSize = cache.size*CONFIG.INNER_RATIO;
        cache.tickLength = cache.size*CONFIG.TICK_LENGTH_RATIO;

        // Precompute tick angles
        cache.tickAngles = [];
        for(let i=0;i<CONFIG.TICK_COUNT;i++){
            cache.tickAngles[i] = (CONFIG.ANGLE_MIN + i/(CONFIG.TICK_COUNT-1)*SWEEP_TOTAL + CONFIG.ROTATION_OFFSET) * DEG2RAD;
        }

        // Precompute marker segments
        cache.markerSegments = [];
        const segRange = CONFIG.MARKER_END_RATIO - CONFIG.MARKER_START_RATIO;
        for(let s=0;s<CONFIG.MARKER_SEGMENTS;s++){
            cache.markerSegments[s] = {
                t0: CONFIG.MARKER_START_RATIO + s/CONFIG.MARKER_SEGMENTS*segRange,
                t1: CONFIG.MARKER_START_RATIO + (s+1)/CONFIG.MARKER_SEGMENTS*segRange
            };
        }

        cache.valid=true;
    },

    invalidateGeometry(){ this.geometryCache.valid=false; },

    cleanup(){
        this.stopAnimation();
        this.geometryCache.tickAngles=null;
        this.geometryCache.markerSegments=null;
    },

    stopAnimation(){ if(this.animationTimer){ window.ClearInterval(this.animationTimer); this.animationTimer=null; } },

    startAnimation(){
        if(this.animationTimer) return;
        this.animationTimer = window.SetInterval(()=>{
            if(this.needsRepaint){
                window.Repaint();
                this.needsRepaint=false;
            }
        }, CONFIG.ANIMATION_INTERVAL);
    }
};

// ====================== UTILITIES ======================
const Utils = {
    clamp(value,min,max){ return Math.max(min, Math.min(max,value)); },
    roundTo(value,decimals){ const m=Math.pow(10,decimals); return Math.round(value*m)/m; }
};

// ====================== VOLUME CONVERSION ======================
const VolumeConverter = {
    uiToDb(v){
        if(v<=CONFIG.VOL_BREAKPOINT_1) return -100 + v*VOL_SLOPE_1;
        if(v<=CONFIG.VOL_BREAKPOINT_2) return CONFIG.DB_BREAKPOINT_1 + (v-CONFIG.VOL_BREAKPOINT_1)*VOL_SLOPE_2;
        return CONFIG.DB_BREAKPOINT_2 + (v-CONFIG.VOL_BREAKPOINT_2)*VOL_SLOPE_3;
    },
    dbToUi(db){
        if(db<=CONFIG.DB_BREAKPOINT_1) return (db+100)/VOL_SLOPE_1;
        if(db<=CONFIG.DB_BREAKPOINT_2) return CONFIG.VOL_BREAKPOINT_1 + (db-CONFIG.DB_BREAKPOINT_1)/VOL_SLOPE_2;
        return CONFIG.VOL_BREAKPOINT_2 + (db-CONFIG.DB_BREAKPOINT_2)/VOL_SLOPE_3;
    },
    uiToAngle(v){ return v<=CONFIG.VOL_BREAKPOINT_2 ? CONFIG.ANGLE_MIN+(v/CONFIG.VOL_BREAKPOINT_2)*SWEEP_HALF : CONFIG.ANGLE_MIN+SWEEP_HALF+((v-CONFIG.VOL_BREAKPOINT_2)/CONFIG.VOL_BREAKPOINT_2)*SWEEP_HALF; },
    applySnap(db){ if(!CONFIG.SNAP_ENABLED||State.dragging) return db; if(Math.abs(db)<=CONFIG.SNAP_TOLERANCE_DB) return 0; if(Math.abs(db+10)<=CONFIG.SNAP_TOLERANCE_DB) return -10; return db; }
};

// ====================== VOLUME SYNC ======================
const VolumeSync = {
    syncFromFoobar(){
        try{
            const fbVol=Utils.clamp(fb.Volume,-100,0);
            State.uiVolume=VolumeConverter.dbToUi(fbVol);
            State.targetAngle=State.dragTargetAngle=VolumeConverter.uiToAngle(State.uiVolume);
            State.currentAngle=State.targetAngle;
            window.Repaint();
        }catch(e){ console.log("Error syncing from foobar:",e); }
    },
    setFoobarVolume(uiVol){
        try{
            const newDb=VolumeConverter.applySnap(VolumeConverter.uiToDb(uiVol));
            if(Math.abs(newDb-fb.Volume)>=0.1) fb.Volume=newDb;
        }catch(e){ console.log("Error setting foobar volume:",e); }
    }
};

// ====================== RENDERER ======================
const Renderer = {
    draw(gr){
        const w=window.Width,h=window.Height;
        if(!w||!h) return;
        State.updateGeometryCache(w,h);
        const cache=State.geometryCache,theme=THEMES[props.currentTheme.value];

        try{
            // Outer circle
            gr.FillEllipse(cache.x,cache.y,cache.size,cache.size,theme.knob);

            // Inner circle
            const innerX=cache.cx-cache.innerSize/2,innerY=cache.cy-cache.innerSize/2;
            gr.FillEllipse(innerX,innerY,cache.innerSize,cache.innerSize,theme.inner);

            // Ticks
            for(let i=0;i<CONFIG.TICK_COUNT;i++){
                const a=cache.tickAngles[i],sa=Math.sin(a),ca=Math.cos(a);
                gr.DrawLine(
                    cache.cx+sa*(cache.radius-cache.tickLength),
                    cache.cy-ca*(cache.radius-cache.tickLength),
                    cache.cx+sa*cache.radius,
                    cache.cy-ca*cache.radius,
                    2,
                    theme.tick
                );
            }

            // Marker animation
            this.updateAnimation();
            const rad=(State.currentAngle+CONFIG.ROTATION_OFFSET)*DEG2RAD;
            const sr=Math.sin(rad),cr=Math.cos(rad);
            let alpha=255;
            try{ if(fb.IsMuted) alpha=90; }catch(e){}
            const r=(theme.marker>>16)&0xFF,g=(theme.marker>>8)&0xFF,b=theme.marker&0xFF;
            const wMarker=Math.max(1,cache.size*CONFIG.MARKER_WIDTH_RATIO);
            for(let s=0;s<CONFIG.MARKER_SEGMENTS;s++){
                const seg=cache.markerSegments[s];
                gr.DrawLine(
                    cache.cx+sr*cache.size*seg.t0,
                    cache.cy-cr*cache.size*seg.t0,
                    cache.cx+sr*cache.size*seg.t1,
                    cache.cy-cr*cache.size*seg.t1,
                    wMarker,
                    _RGBA(r,g,b,alpha)
                );
            }

        }catch(e){ console.log("Paint error:",e); }
    },
    updateAnimation(){
        const prev=State.currentAngle;
        if(State.dragging) State.currentAngle+=(State.dragTargetAngle-State.currentAngle)*CONFIG.DRAG_FOLLOW_SPEED;
        else State.currentAngle+=(State.targetAngle-State.currentAngle)*CONFIG.RELEASE_EASING;
        if(Math.abs(State.currentAngle-State.targetAngle)<CONFIG.ANGLE_EPSILON) State.currentAngle=State.targetAngle;
        if(Math.abs(State.currentAngle-prev)>CONFIG.ANGLE_EPSILON) State.needsRepaint=true;
    }
};

// ====================== INPUT HANDLERS ======================
const InputHandler = {
    hitTest(x,y){ const c=State.geometryCache; return c.valid&&(x-c.cx)**2+(y-c.cy)**2<=c.radius**2; },
    handleDragStart(x,y){ if(!this.hitTest(x,y)) return false; State.dragging=true; State.lastY=y; window.SetCursor(CONFIG.CURSOR_HAND); return true; },
    handleDragEnd(){ if(!State.dragging) return false; State.dragging=false; State.targetAngle=State.dragTargetAngle; window.SetCursor(CONFIG.CURSOR_ARROW); State.needsRepaint=true; return true; },
    handleDragMove(x,y){
        if(!State.dragging) return false;
        let v=State.uiVolume+(State.lastY-y)*CONFIG.DRAG_SCALE;
        v=Utils.clamp(Utils.roundTo(v,1),0,100);
        if(Math.abs(v-State.uiVolume)>=0.1){
            State.uiVolume=v; State.dragTargetAngle=State.targetAngle=VolumeConverter.uiToAngle(v);
            VolumeSync.setFoobarVolume(v); State.needsRepaint=true;
        }
        State.lastY=y; return true;
    },
    handleWheel(step){
        let v=State.uiVolume+step*CONFIG.WHEEL_STEP;
        v=Utils.clamp(Utils.roundTo(v,1),0,100);
        if(Math.abs(v-State.uiVolume)>=0.1){
            State.uiVolume=v; State.dragTargetAngle=State.targetAngle=VolumeConverter.uiToAngle(v);
            VolumeSync.setFoobarVolume(v); State.needsRepaint=true;
        }
        return true;
    },
    handleDoubleClick(x,y){ if(!this.hitTest(x,y)) return false; try{ fb.RunMainMenuCommand("Playback/Volume/Mute"); window.SetTimeout(()=>{ if(!State.dragging) VolumeSync.syncFromFoobar(); },50); }catch(e){console.log("Error toggling mute:",e);} return true; }
};

// ====================== MENU MANAGER ======================
const MenuManager = {
    show(x,y){
        const menu=window.CreatePopupMenu();
        try{
            for(let i=0;i<THEMES.length;i++){
                const theme=THEMES[i];
                menu.AppendMenuItem(0,i+1,theme.name);
                if(i===props.currentTheme.value) menu.CheckMenuItem(i+1,true);
            }
            const id=menu.TrackPopupMenu(x,y);
            if(id>0){ props.currentTheme.value=id-1; window.Repaint(); }
        }catch(e){ console.log("Menu error:",e); }
        return true;
    }
};

// ====================== INITIALIZATION ======================
function init(){ try{ VolumeSync.syncFromFoobar(); State.startAnimation(); }catch(e){console.log("Initialization error:",e);} }
init();

// ====================== FOOBAR CALLBACKS ======================
function on_paint(gr){ panel.paint(gr); Renderer.draw(gr); }
function on_size(){ const w=window.Width,h=window.Height; if(State.geometryCache.width!==w||State.geometryCache.height!==h){ panel.size(); State.invalidateGeometry(); window.Repaint(); } }
function on_colours_changed(){ panel.colours_changed(); window.Repaint(); }
function on_font_changed(){ window.Repaint(); }
function on_volume_change(){ if(!State.dragging) VolumeSync.syncFromFoobar(); }
function on_mouse_lbtn_down(x,y){ return InputHandler.handleDragStart(x,y); }
function on_mouse_lbtn_up(x,y){ return InputHandler.handleDragEnd(); }
function on_mouse_move(x,y){ return InputHandler.handleDragMove(x,y); }
function on_mouse_wheel(step){ return InputHandler.handleWheel(step); }
function on_mouse_lbtn_dblclk(x,y){ return InputHandler.handleDoubleClick(x,y); }
function on_mouse_rbtn_up(x,y){ return MenuManager.show(x,y); }
function on_script_unload(){ State.cleanup(); }