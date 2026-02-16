'use strict'; 
		  // ======= AUTHOR L.E.D. (AI-assisted) ========\\
		 // ========= SMP 64bit Volume Knob V2.0 =========\\
		// =========== Simple Function + Themes ===========\\

 // ===================*** Foobar2000 64bit ***================== \\
// ======= For Spider Monekey Panel 64bit, author: marc2003 ====== \\

window.DefineScript('SMP 64bit Volume Knob', { author: 'L.E.D.' });

var paintCache = {
    get bgColor() {
        if (window.IsDefaultUI) {
            return window.GetColourDUI(1);
        } else {
            try {
                return window.GetColourCUI(3);
            } catch (e) {
                return window.GetColourDUI(1); // Final fallback
            }
        }
    }
};

function on_colours_changed() {
    window.Repaint();
}

function on_font_changed() {
    window.Repaint();
}


// =====================================================
// CONFIGURATION
// =====================================================
const CONFIG = Object.freeze({
    DRAG_SCALE: 0.5,
    WHEEL_STEP: 2,
    SNAP_ENABLED: true,
    SNAP_TOLERANCE_DB: 0.5,
    PADDING: 20,
    
    // Animation
    DRAG_FOLLOW_SPEED: 1.0,
    RELEASE_EASING: 0.18,
    ANGLE_EPSILON: 0.01,
    ANIMATION_FPS: 60,
    ANIMATION_INTERVAL: Math.floor(1000 / 60),
    
    // Geometry
    ANGLE_MIN: 120,
    ANGLE_MAX: 420,
    TICK_COUNT: 21,
    ROTATION_OFFSET: -270,
    
    // Sizing ratios
    INNER_RATIO: 0.92,
    TICK_LENGTH_RATIO: 0.04,
    MARKER_START_RATIO: 0.225,
    MARKER_END_RATIO: 0.45,
    MARKER_SEGMENTS: 10,
    MARKER_WIDTH_RATIO: 0.015,
    
    // Cursors
    CURSOR_ARROW: 32512,
    CURSOR_HAND: 32649,
    
    // Volume curve breakpoints
    VOL_BREAKPOINT_1: 25,
    VOL_BREAKPOINT_2: 50,
    DB_BREAKPOINT_1: -20,
    DB_BREAKPOINT_2: -8.5
});

// Calculated constants
const SWEEP_TOTAL = CONFIG.ANGLE_MAX - CONFIG.ANGLE_MIN;
const SWEEP_HALF = SWEEP_TOTAL / 2;
const DEG2RAD = Math.PI / 180;

// =====================================================
// COLOR HELPERS
// =====================================================
function RGB(r, g, b) { 
    return 0xFF000000 | (r << 16) | (g << 8) | b; 
}

function RGBA(r, g, b, a) { 
    return (a << 24) | (r << 16) | (g << 8) | b; 
}

// =====================================================
// THEMES
// =====================================================
const THEMES = [
    { name: "Classic Gray", knob: RGB(80, 80, 80), inner: RGB(50, 50, 50), tick: RGB(160, 160, 160), marker: RGB(255, 180, 180) },
    { name: "Warm Amber", knob: RGB(90, 70, 50), inner: RGB(60, 45, 30), tick: RGB(200, 160, 100), marker: RGB(255, 200, 120) },
    { name: "Cool Blue", knob: RGB(60, 70, 90), inner: RGB(40, 50, 70), tick: RGB(140, 170, 220), marker: RGB(160, 200, 255) },
    { name: "Mint Green", knob: RGB(60, 90, 80), inner: RGB(40, 65, 55), tick: RGB(140, 200, 180), marker: RGB(160, 255, 220) },
    { name: "Purple Haze", knob: RGB(85, 70, 95), inner: RGB(55, 45, 65), tick: RGB(190, 160, 220), marker: RGB(220, 180, 255) },
    { name: "Fire Red", knob: RGB(90, 55, 55), inner: RGB(60, 35, 35), tick: RGB(220, 150, 150), marker: RGB(255, 170, 170) },
    { name: "Mono Dark", knob: RGB(50, 50, 50), inner: RGB(30, 30, 30), tick: RGB(120, 120, 120), marker: RGB(200, 200, 200) },
    { name: "Ocean Teal", knob: RGB(40, 80, 85), inner: RGB(25, 55, 60), tick: RGB(120, 190, 200), marker: RGB(140, 230, 240) },
    { name: "Gold Brass", knob: RGB(95, 85, 50), inner: RGB(70, 60, 35), tick: RGB(230, 210, 150), marker: RGB(255, 235, 180) },
    { name: "Neon Pink", knob: RGB(90, 50, 70), inner: RGB(65, 35, 50), tick: RGB(230, 150, 200), marker: RGB(255, 170, 220) }
];

// =====================================================
// STATE MANAGEMENT
// =====================================================
const State = {
    // Resources
    knobImg: null,
    
    // Input state
    dragging: false,
    lastY: 0,
    
    // Volume state
    uiVolume: 50,
    currentAngle: 0,
    targetAngle: 0,
    dragTargetAngle: 0,
    
    // Animation
    animationTimer: null,
    needsRepaint: false,
    
    // Settings
    currentTheme: 0,
    
    // Geometry cache
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
        tickLength: 0
    },
    
    loadSettings() {
        this.currentTheme = window.GetProperty("VolumeKnob.Theme", 0);
        
        // Validate theme
        if (this.currentTheme < 0 || this.currentTheme >= THEMES.length) {
            this.currentTheme = 0;
        }
    },
    
    saveSetting(key, value) {
        window.SetProperty("VolumeKnob." + key, value);
    },
    
    updateGeometryCache(w, h) {
        const cache = this.geometryCache;
        
        if (cache.valid && cache.width === w && cache.height === h) {
            return;
        }
        
        cache.width = w;
        cache.height = h;
        cache.cx = w / 2;
        cache.cy = h / 2;
        cache.size = Math.min(w, h) - CONFIG.PADDING * 2;
        cache.x = cache.cx - cache.size / 2;
        cache.y = cache.cy - cache.size / 2;
        cache.radius = cache.size * 0.5;
        cache.innerSize = cache.size * CONFIG.INNER_RATIO;
        cache.tickLength = cache.size * CONFIG.TICK_LENGTH_RATIO;
        cache.valid = true;
    },
    
    invalidateGeometry() {
        this.geometryCache.valid = false;
    },
    
    cleanup() {
        this.stopAnimation();
        Utils.disposeImage(this.knobImg);
        this.knobImg = null;
    },
    
    stopAnimation() {
        if (this.animationTimer) {
            clearInterval(this.animationTimer);
            this.animationTimer = null;
        }
    },
    
    startAnimation() {
        if (this.animationTimer) return;
        
        this.animationTimer = setInterval(() => {
            if (this.needsRepaint) {
                window.Repaint();
                this.needsRepaint = false;
            }
        }, CONFIG.ANIMATION_INTERVAL);
    }
};

// =====================================================
// UTILITIES
// =====================================================
const Utils = {
    disposeImage(img) {
        if (img && typeof img.Dispose === 'function') {
            try {
                img.Dispose();
            } catch (e) {
                console.log("Error disposing image:", e);
            }
        }
        return null;
    },
    
    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    },
    
    roundTo(value, decimals) {
        const multiplier = Math.pow(10, decimals);
        return Math.round(value * multiplier) / multiplier;
    }
};

// =====================================================
// VOLUME CONVERSION
// =====================================================
const VolumeConverter = {
    // UI Volume (0-100) → Foobar Volume (dB)
    uiToDb(v) {
        if (v <= CONFIG.VOL_BREAKPOINT_1) {
            return -100 + (v / CONFIG.VOL_BREAKPOINT_1) * 80;
        }
        if (v <= CONFIG.VOL_BREAKPOINT_2) {
            return CONFIG.DB_BREAKPOINT_1 + 
                   ((v - CONFIG.VOL_BREAKPOINT_1) / CONFIG.VOL_BREAKPOINT_1) * 
                   (CONFIG.DB_BREAKPOINT_2 - CONFIG.DB_BREAKPOINT_1);
        }
        return CONFIG.DB_BREAKPOINT_2 + 
               ((v - CONFIG.VOL_BREAKPOINT_2) / CONFIG.VOL_BREAKPOINT_2) * 
               Math.abs(CONFIG.DB_BREAKPOINT_2);
    },
    
    // Foobar Volume (dB) → UI Volume (0-100)
    dbToUi(db) {
        if (db <= CONFIG.DB_BREAKPOINT_1) {
            return (db + 100) / 80 * CONFIG.VOL_BREAKPOINT_1;
        }
        if (db <= CONFIG.DB_BREAKPOINT_2) {
            return CONFIG.VOL_BREAKPOINT_1 + 
                   (db - CONFIG.DB_BREAKPOINT_1) / 
                   (CONFIG.DB_BREAKPOINT_2 - CONFIG.DB_BREAKPOINT_1) * 
                   CONFIG.VOL_BREAKPOINT_1;
        }
        return CONFIG.VOL_BREAKPOINT_2 + 
               (db - CONFIG.DB_BREAKPOINT_2) / 
               Math.abs(CONFIG.DB_BREAKPOINT_2) * 
               CONFIG.VOL_BREAKPOINT_2;
    },
    
    // UI Volume (0-100) → Angle (degrees)
    uiToAngle(v) {
        return v <= CONFIG.VOL_BREAKPOINT_2
            ? CONFIG.ANGLE_MIN + (v / CONFIG.VOL_BREAKPOINT_2) * SWEEP_HALF
            : CONFIG.ANGLE_MIN + SWEEP_HALF + 
              ((v - CONFIG.VOL_BREAKPOINT_2) / CONFIG.VOL_BREAKPOINT_2) * SWEEP_HALF;
    },
    
    // Apply snap to 0 dB and -10 dB
    applySnap(db) {
        if (!CONFIG.SNAP_ENABLED || State.dragging) return db;
        if (Math.abs(db) <= CONFIG.SNAP_TOLERANCE_DB) return 0;
        if (Math.abs(db + 10) <= CONFIG.SNAP_TOLERANCE_DB) return -10;
        return db;
    }
};

// =====================================================
// SYNC WITH FOOBAR
// =====================================================
const VolumeSync = {
    syncFromFoobar() {
        try {
            const fbVol = Utils.clamp(fb.Volume, -100, 0);
            State.uiVolume = VolumeConverter.dbToUi(fbVol);
            State.targetAngle = State.dragTargetAngle = VolumeConverter.uiToAngle(State.uiVolume);
            State.currentAngle = State.targetAngle; // Snap immediately on init
            window.Repaint();
        } catch (e) {
            console.log("Error syncing from foobar:", e);
        }
    },
    
    setFoobarVolume(uiVol) {
        try {
            const newDb = VolumeConverter.applySnap(VolumeConverter.uiToDb(uiVol));
            if (Math.abs(newDb - fb.Volume) >= 0.1) {
                fb.Volume = newDb;
            }
        } catch (e) {
            console.log("Error setting foobar volume:", e);
        }
    }
};

// =====================================================
// RENDERING
// =====================================================
const Renderer = {
    draw(gr) {
        const w = window.Width;
        const h = window.Height;
        
        if (!w || !h) return;
        
        State.updateGeometryCache(w, h);
        const cache = State.geometryCache;
        const theme = THEMES[State.currentTheme];
        
        try {
            // Draw outer knob circle
            gr.FillEllipse(cache.x, cache.y, cache.size, cache.size, theme.knob);
            
            // Draw knob texture if available
            if (State.knobImg) {
                gr.DrawImage(
                    State.knobImg, 
                    cache.x, cache.y, cache.size, cache.size, 
                    0, 0, State.knobImg.Width, State.knobImg.Height
                );
            }
            
            // Draw inner circle
            const innerX = cache.cx - cache.innerSize / 2;
            const innerY = cache.cy - cache.innerSize / 2;
            gr.FillEllipse(innerX, innerY, cache.innerSize, cache.innerSize, theme.inner);
            
            // Draw tick marks
            this.drawTicks(gr, cache, theme);
            
            // Update and draw marker with animation
            this.updateAnimation();
            this.drawMarker(gr, cache, theme);
            
        } catch (e) {
            console.log("Paint error:", e);
        }
    },
    
    drawTicks(gr, cache, theme) {
        for (let i = 0; i < CONFIG.TICK_COUNT; i++) {
            const angle = (CONFIG.ANGLE_MIN + i / (CONFIG.TICK_COUNT - 1) * SWEEP_TOTAL + CONFIG.ROTATION_OFFSET) * DEG2RAD;
            const sa = Math.sin(angle);
            const ca = Math.cos(angle);
            
            gr.DrawLine(
                cache.cx + sa * (cache.radius - cache.tickLength),
                cache.cy - ca * (cache.radius - cache.tickLength),
                cache.cx + sa * cache.radius,
                cache.cy - ca * cache.radius,
                2,
                theme.tick
            );
        }
    },
    
    updateAnimation() {
        const prevAngle = State.currentAngle;
        
        if (State.dragging) {
            State.currentAngle += (State.dragTargetAngle - State.currentAngle) * CONFIG.DRAG_FOLLOW_SPEED;
        } else {
            State.currentAngle += (State.targetAngle - State.currentAngle) * CONFIG.RELEASE_EASING;
        }
        
        if (Math.abs(State.currentAngle - State.targetAngle) < CONFIG.ANGLE_EPSILON) {
            State.currentAngle = State.targetAngle;
        }
        
        // Schedule repaint if still animating
        if (Math.abs(State.currentAngle - prevAngle) > CONFIG.ANGLE_EPSILON) {
            State.needsRepaint = true;
        }
    },
    
    drawMarker(gr, cache, theme) {
        const rad = (State.currentAngle + CONFIG.ROTATION_OFFSET) * DEG2RAD;
        const sr = Math.sin(rad);
        const cr = Math.cos(rad);
        
        // Check if muted (with safe fallback)
        let alpha = 255;
        try {
            if (fb.IsMuted && fb.IsMuted()) {
                alpha = 90;
            }
        } catch (e) {
            // fb.IsMuted might not exist in all versions
        }
        
        const markerColor = theme.marker;
        const r = (markerColor >> 16) & 0xFF;
        const g = (markerColor >> 8) & 0xFF;
        const b = markerColor & 0xFF;
        
        const markerWidth = Math.max(1, cache.size * CONFIG.MARKER_WIDTH_RATIO);
        
        for (let s = 0; s < CONFIG.MARKER_SEGMENTS; s++) {
            const t0 = CONFIG.MARKER_START_RATIO + s / CONFIG.MARKER_SEGMENTS * 
                      (CONFIG.MARKER_END_RATIO - CONFIG.MARKER_START_RATIO);
            const t1 = CONFIG.MARKER_START_RATIO + (s + 1) / CONFIG.MARKER_SEGMENTS * 
                      (CONFIG.MARKER_END_RATIO - CONFIG.MARKER_START_RATIO);
            
            gr.DrawLine(
                cache.cx + sr * cache.size * t0,
                cache.cy - cr * cache.size * t0,
                cache.cx + sr * cache.size * t1,
                cache.cy - cr * cache.size * t1,
                markerWidth,
                RGBA(r, g, b, alpha)
            );
        }
    }
};

// =====================================================
// INPUT HANDLERS
// =====================================================
const InputHandler = {
    hitTest(x, y) {
        const cache = State.geometryCache;
        if (!cache.valid) return false;
        
        const dx = x - cache.cx;
        const dy = y - cache.cy;
        return dx * dx + dy * dy <= cache.radius * cache.radius;
    },
    
    handleDragStart(x, y) {
        if (!this.hitTest(x, y)) return false;
        
        State.dragging = true;
        State.lastY = y;
        window.SetCursor(CONFIG.CURSOR_HAND);
        return true;
    },
    
    handleDragEnd() {
        if (!State.dragging) return false;
        
        State.dragging = false;
        State.targetAngle = State.dragTargetAngle;
        window.SetCursor(CONFIG.CURSOR_ARROW);
        State.needsRepaint = true;
        return true;
    },
    
    handleDragMove(x, y) {
        if (!State.dragging) return false;
        
        let newVolume = State.uiVolume + (State.lastY - y) * CONFIG.DRAG_SCALE;
        newVolume = Utils.clamp(newVolume, 0, 100);
        newVolume = Utils.roundTo(newVolume, 1);
        
        if (Math.abs(newVolume - State.uiVolume) >= 0.1) {
            State.uiVolume = newVolume;
            State.dragTargetAngle = State.targetAngle = VolumeConverter.uiToAngle(State.uiVolume);
            VolumeSync.setFoobarVolume(State.uiVolume);
            State.needsRepaint = true;
        }
        
        State.lastY = y;
        return true;
    },
    
    handleWheel(step) {
        let newVolume = State.uiVolume + step * CONFIG.WHEEL_STEP;
        newVolume = Utils.clamp(newVolume, 0, 100);
        newVolume = Utils.roundTo(newVolume, 1);
        
        if (Math.abs(newVolume - State.uiVolume) >= 0.1) {
            State.uiVolume = newVolume;
            State.dragTargetAngle = State.targetAngle = VolumeConverter.uiToAngle(State.uiVolume);
            VolumeSync.setFoobarVolume(State.uiVolume);
            State.needsRepaint = true;
        }
        
        return true;
    },
    
    handleDoubleClick(x, y) {
        if (!this.hitTest(x, y)) return false;
        
        try {
            fb.RunMainMenuCommand("Playback/Volume/Mute");
            
            // Force sync after mute/unmute to ensure UI reflects actual volume
            // Small delay to let foobar process the command
            setTimeout(() => {
                if (!State.dragging) {
                    VolumeSync.syncFromFoobar();
                }
            }, 50);
            
        } catch (e) {
            console.log("Error toggling mute:", e);
        }
        
        return true;
    }
};

// =====================================================
// MENU MANAGER
// =====================================================
const MenuManager = {
    show(x, y) {
        const menu = window.CreatePopupMenu();
        
        try {
            for (let i = 0; i < THEMES.length; i++) {
                menu.AppendMenuItem(0, i + 1, THEMES[i].name);
                if (i === State.currentTheme) {
                    menu.CheckMenuItem(i + 1, true);
                }
            }
            
            const id = menu.TrackPopupMenu(x, y);
            
            if (id > 0) {
                State.currentTheme = id - 1;
                State.saveSetting("Theme", State.currentTheme);
                window.Repaint();
            }
        } catch (e) {
            console.log("Menu error:", e);
        }
        
        return true;
    }
};

// =====================================================
// RESOURCE LOADER
// =====================================================
const ResourceLoader = {
    loadKnobImage() {
        try {
            const scriptPath = window.ScriptInfo.Path;
            const imagePath = scriptPath.replace(/[^\\]+$/, "") + "knob.png";
            
            if (utils.FileTest(imagePath, "e")) {
                State.knobImg = gdi.Image(imagePath);
            }
        } catch (e) {
            console.log("Failed to load knob.png:", e);
        }
    }
};

// =====================================================
// INITIALIZATION
// =====================================================
function init() {
    try {
        State.loadSettings();
        ResourceLoader.loadKnobImage();
        VolumeSync.syncFromFoobar();
        State.startAnimation();
    } catch (e) {
        console.log("Initialization error:", e);
    }
}

// =====================================================
// FOOBAR2000 CALLBACKS
// =====================================================
function on_paint(gr) {
	
	gr.FillSolidRect(0, 0, window.Width, window.Height, paintCache.bgColor);
	
    Renderer.draw(gr);
}

function on_size(w, h) {
    State.invalidateGeometry();
    window.Repaint();
}

function on_volume_change() {
    if (!State.dragging) {
        VolumeSync.syncFromFoobar();
    }
}

function on_mouse_lbtn_down(x, y) {
    return InputHandler.handleDragStart(x, y);
}

function on_mouse_lbtn_up(x, y) {
    return InputHandler.handleDragEnd();
}

function on_mouse_move(x, y) {
    return InputHandler.handleDragMove(x, y);
}

function on_mouse_wheel(step) {
    return InputHandler.handleWheel(step);
}

function on_mouse_lbtn_dblclk(x, y) {
    return InputHandler.handleDoubleClick(x, y);
}

function on_mouse_rbtn_up(x, y) {
    return MenuManager.show(x, y);
}

function on_script_unload() {
    State.cleanup();
}

// =====================================================
// START
// =====================================================
init();