'use strict';
		  // ======= AUTHOR L.E.D. (AI-assisted) ========\\
		 // ========  SMP 64bit Volume Knob V3.0  ========\\
		// ======= Custom Theme Creator + JSON I/O ========\\

 // ===================*** Foobar2000 64bit ***================== \\
// ======= For Spider Monkey Panel 64bit, author: marc2003 ======= \\

window.DrawMode = 0; // 0 - default GDI+ mode. 1 - D2D

window.DefineScript('SMP 64bit Volume Knob V3.0', { author: 'L.E.D.', options: { grab_focus: true } });

// ====================== HELPER INCLUDES ======================
include(fb.ComponentPath + 'samples\\complete\\js\\lodash.min.js');
include(fb.ComponentPath + 'samples\\complete\\js\\helpers.js');
include(fb.ComponentPath + 'samples\\complete\\js\\panel.js');

const panel = new _panel(false);

// ====================== KEYBOARD INPUT ======================
window.DlgCode = DLGC_WANTALLKEYS;

const SCRIPT_NAME = 'Volume Knob';
const MENU_STRING = 0x0000;
const MENU_SEPARATOR = 0x0800;

// ====================== CONFIG ======================
const CONFIG = Object.freeze({
    DRAG_SCALE: 0.5,
    WHEEL_STEP_DEG: (420 - 120) / (21 - 1) / 2, // 7.5° per half-tick
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
    MARKER_WIDTH_RATIO: 0.015,

    VOL_BREAKPOINT_1: 25,
    VOL_BREAKPOINT_2: 50,
    DB_BREAKPOINT_1: -20,
    DB_BREAKPOINT_2: -8.5
});

// ====================== PRE-CALCULATED CONSTANTS ======================
const SWEEP_TOTAL = CONFIG.ANGLE_MAX - CONFIG.ANGLE_MIN;
const SWEEP_HALF = SWEEP_TOTAL / 2;
const DEG2RAD = Math.PI / 180;

const VOL_SLOPE_1 = 80 / CONFIG.VOL_BREAKPOINT_1;
const VOL_SLOPE_2 = (CONFIG.DB_BREAKPOINT_2 - CONFIG.DB_BREAKPOINT_1) / CONFIG.VOL_BREAKPOINT_1;
const VOL_SLOPE_3 = Math.abs(CONFIG.DB_BREAKPOINT_2) / (100 - CONFIG.VOL_BREAKPOINT_2);
const VOL_RANGE_2 = 100 - CONFIG.VOL_BREAKPOINT_2;

// ====================== UTILITIES & COLOURS ======================
function clamp(value, minimum, maximum) {
    if (minimum > maximum) maximum = minimum;
    return Math.max(minimum, Math.min(maximum, value));
}

function colour(r, g, b) {
    return (((255 << 24) | (clamp(Math.round(r), 0, 255) << 16) | (clamp(Math.round(g), 0, 255) << 8) | clamp(Math.round(b), 0, 255)) >>> 0);
}

function withAlpha(rgb, alpha) {
    return (((clamp(Math.round(alpha), 0, 255) << 24) | (rgb & 0x00ffffff)) >>> 0);
}

// ====================== THEME MANAGER ======================
class ThemeManager {
    constructor() {
        this._builtinDefs = [
            { name: "Classic Gray", bg: [32, 32, 32], knob: [80, 80, 80], inner: [50, 50, 50], tick: [160, 160, 160], marker: [255, 180, 180] },
            { name: "Warm Amber",   bg: [32, 32, 32], knob: [90, 70, 50], inner: [60, 45, 30], tick: [200, 160, 100], marker: [255, 200, 120] },
            { name: "Cool Blue",    bg: [32, 32, 32], knob: [60, 70, 90], inner: [40, 50, 70], tick: [140, 170, 220], marker: [160, 200, 255] },
            { name: "Mint Green",   bg: [32, 32, 32], knob: [60, 90, 80], inner: [40, 65, 55], tick: [140, 200, 180], marker: [160, 255, 220] },
            { name: "Purple Haze",  bg: [32, 32, 32], knob: [85, 70, 95], inner: [55, 45, 65], tick: [190, 160, 220], marker: [220, 180, 255] },
            { name: "Fire Red",     bg: [32, 32, 32], knob: [90, 55, 55], inner: [60, 35, 35], tick: [220, 150, 150], marker: [255, 170, 170] },
            { name: "Mono Dark",    bg: [32, 32, 32], knob: [50, 50, 50], inner: [30, 30, 30], tick: [120, 120, 120], marker: [200, 200, 200] },
            { name: "Ocean Teal",   bg: [32, 32, 32], knob: [40, 80, 85], inner: [25, 55, 60], tick: [120, 190, 200], marker: [140, 230, 240] },
            { name: "Gold Brass",   bg: [32, 32, 32], knob: [95, 85, 50], inner: [70, 60, 35], tick: [230, 210, 150], marker: [255, 235, 180] },
            { name: "Neon Pink",    bg: [32, 32, 32], knob: [90, 50, 70], inner: [65, 35, 50], tick: [230, 150, 200], marker: [255, 170, 220] }
        ];

        this.themes = [];
        this.themeMap = {};
        this._customThemes = [];

        for (let i = 0; i < this._builtinDefs.length; i++) {
            const d = this._builtinDefs[i];
            const t = this.makeTheme(d.name, d.bg, d.knob, d.inner, d.tick, d.marker);
            this.themes.push(t);
            this.themeMap[t.name] = t;
        }

        this.draftTheme = {
            name:   'New Custom Theme',
            bg:     colour(20, 20, 20),
            knob:   colour(80, 80, 80),
            inner:  colour(50, 50, 50),
            tick:   colour(160, 160, 160),
            marker: colour(255, 180, 180)
        };
        this._draftBaseTheme = null;
    }

    updateDraft(key, packed) {
        this.draftTheme[key] = packed >>> 0;
    }

    seedDraftFromTheme(theme) {
        if (!theme) return;
        this.draftTheme.bg     = theme.bg     >>> 0;
        this.draftTheme.knob   = theme.knob   >>> 0;
        this.draftTheme.inner  = theme.inner  >>> 0;
        this.draftTheme.tick   = theme.tick   >>> 0;
        this.draftTheme.marker = theme.marker >>> 0;
    }

    makeTheme(name, bg, knob, inner, tick, marker) {
        function pack(v) {
            if (Array.isArray(v)) {
                return colour(
                    clamp(Number(v[0]) || 0, 0, 255),
                    clamp(Number(v[1]) || 0, 0, 255),
                    clamp(Number(v[2]) || 0, 0, 255)
                );
            }
            return (v >>> 0);
        }
        return {
            name:   name,
            bg:     pack(bg),
            knob:   pack(knob),
            inner:  pack(inner),
            tick:   pack(tick),
            marker: pack(marker),
            custom: false
        };
    }

    get(name) { return this.themeMap[name] || this.themes[0]; }
    names()   { return this.themes.map(t => t.name); }

    removeCustom(name) {
        const t = this.themeMap[name];
        if (!t) return { ok: false, error: 'Theme "' + name + '" not found.' };
        if (!t.custom) return { ok: false, error: 'Theme "' + name + '" is not a custom theme.' };
        const iList = this.themes.indexOf(t);
        if (iList !== -1) this.themes.splice(iList, 1);
        const iCustom = this._customThemes.indexOf(t);
        if (iCustom !== -1) this._customThemes.splice(iCustom, 1);
        delete this.themeMap[name];
        return { ok: true, name: name };
    }

    setPreview(t) { this.themeMap['~Preview'] = t; }
    clearPreview() {
        const p = this.themeMap['~Preview'];
        if (p) {
            const idx = this.themes.indexOf(p);
            if (idx !== -1) this.themes.splice(idx, 1);
            delete this.themeMap['~Preview'];
        }
        return p;
    }

    _isBuiltin(name) {
        for (let i = 0; i < this._builtinDefs.length; i++) {
            if (this._builtinDefs[i].name === name) return true;
        }
        return false;
    }

    loadFromFile(filePath) {
        if (!filePath || String(filePath).trim() === '') {
            return { ok: false, error: 'No file path given.' };
        }
        filePath = String(filePath).trim();
        try {
            if (!utils.IsFile(filePath)) {
                return { ok: false, error: 'File not found:\n' + filePath };
            }
            const raw = utils.ReadTextFile(filePath);
            if (!raw || raw.trim() === '') {
                return { ok: false, error: 'JSON file is empty:\n' + filePath };
            }
            return this._parseAndRegister(raw, filePath);
        } catch (e) {
            return { ok: false, error: 'File read error:\n' + String(e.message || e) };
        }
    }

    _parseAndRegister(jsonText, sourceLabel) {
        let parsed;
        try {
            parsed = JSON.parse(jsonText);
        } catch (e) {
            return { ok: false, error: 'JSON parse error: ' + String(e.message || e) };
        }
        if (!Array.isArray(parsed)) {
            if (typeof parsed === 'object' && parsed !== null && parsed.name) {
                parsed = [parsed];
            } else {
                return { ok: false, error: 'JSON must be an array of theme objects.' };
            }
        }

        let added = 0, updated = 0, errors = [];
        for (let i = 0; i < parsed.length; i++) {
            const d = parsed[i];
            const valid = this._validateThemeDef(d, i);
            if (valid !== true) { errors.push(valid); continue; }

            const name = String(d.name).trim();
            if (name === '~Preview') {
                errors.push('Entry ' + i + ': "~Preview" is a reserved internal name — skipped.');
                continue;
            }
            if (this._isBuiltin(name)) {
                errors.push('Entry ' + i + ': "' + name + '" shadows a built-in theme — skipped.');
                continue;
            }

            const t = this.makeTheme(name, d.bg, d.knob, d.inner, d.tick, d.marker);
            t.custom = true;

            if (this.themeMap[name]) {
                const oldTheme = this.themeMap[name];
                const idx = this.themes.indexOf(oldTheme);
                if (idx !== -1) { this.themes[idx] = t; }
                const ci = this._customThemes.indexOf(oldTheme);
                if (ci !== -1) {
                    this._customThemes[ci] = t;
                } else if (this._customThemes.indexOf(t) === -1) {
                    this._customThemes.push(t);
                }
                this.themeMap[name] = t;
                updated++;
            } else {
                this.themes.push(t);
                this.themeMap[name] = t;
                this._customThemes.push(t);
                added++;
            }
        }

        const summary = 'Loaded from: ' + sourceLabel + '\n' +
                        'Added: ' + added + '  Updated: ' + updated +
                        (errors.length ? '\nWarnings:\n' + errors.join('\n') : '');
        return { ok: (added + updated) > 0, count: added + updated, error: errors.length ? summary : null, summary: summary };
    }

    _validateThemeDef(d, idx) {
        if (typeof d !== 'object' || d === null) return 'Entry ' + idx + ': not an object.';
        if (!d.name || typeof d.name !== 'string' || d.name.trim() === '') return 'Entry ' + idx + ': missing or empty "name" string.';
        function checkChannel(name, arr) {
            if (!Array.isArray(arr) || arr.length < 3) return '"' + name + '" must be an [r,g,b] array with 3 elements.';
            for (let ci = 0; ci < 3; ci++) {
                const v = arr[ci];
                if (typeof v !== 'number' || !isFinite(v)) return '"' + name + '[' + ci + ']" must be a finite number, got: ' + v;
                if (v < 0 || v > 255) return '"' + name + '[' + ci + ']" out of range 0-255, got: ' + v;
            }
            return null;
        }
        for (let key of ['bg', 'knob', 'inner', 'tick', 'marker']) {
            const err = checkChannel(key, d[key]);
            if (err) return 'Entry ' + idx + ' ("' + d.name + '"): ' + err;
        }
        return true;
    }

    saveToFile(filePath, themeName) {
        if (!filePath || String(filePath).trim() === '') {
            return { ok: false, error: 'No file path given.' };
        }
        filePath = String(filePath).trim();
        let list;
        if (themeName === '*') {
            list = this.themes;
        } else if (themeName === null || themeName === undefined) {
            list = this._customThemes;
            if (!list.length) { return { ok: false, error: 'No custom themes to save.' }; }
        } else {
            const t = this.themeMap[themeName];
            if (!t) { return { ok: false, error: 'Theme "' + themeName + '" not found.' }; }
            list = [t];
        }
        try {
            const arr  = list.map(t => this._themeToJson(t));
            const json = JSON.stringify(arr, null, 2);
            const ok = utils.WriteTextFile(filePath, json);
            if (!ok) { return { ok: false, error: 'utils.WriteTextFile returned false — check write permissions:\n' + filePath }; }
            if (!utils.IsFile(filePath)) { return { ok: false, error: 'JSON file could not be verified after saving.' }; }
            return { ok: true, count: arr.length, path: filePath };
        } catch (e) {
            return { ok: false, error: 'File write error:\n' + String(e.message || e) };
        }
    }

    _themeToJson(theme) {
        function rgb(col) {
            return [(col >>> 16) & 255, (col >>> 8) & 255, col & 255];
        }
        return {
            name:   theme.name,
            bg:     rgb(theme.bg),
            knob:   rgb(theme.knob),
            inner:  rgb(theme.inner),
            tick:   rgb(theme.tick),
            marker: rgb(theme.marker)
        };
    }

    exportTemplate(filePath) {
        return this.saveToFile(filePath, '*');
    }
}

const themes = new ThemeManager();

// ====================== PROPERTIES ======================
class PropertyManager {
    constructor() {
        this.keys = {
            theme:           'VolumeKnob.ThemeName',
            customThemeFile: 'VolumeKnob.CustomThemeFile',
            snapEnabled:     'VolumeKnob.SnapEnabled'
        };

        this.defaults = {
            theme:           'Classic Gray',
            customThemeFile: fb.ProfilePath + 'volumeknob_custom_themes.json',
            snapEnabled:     true
        };

        // Migration from legacy integer index property
        let initialTheme = window.GetProperty(this.keys.theme, null);
        if (initialTheme === null) {
            const legacyIdx = window.GetProperty('VolumeKnob.Theme', null);
            if (legacyIdx !== null && typeof legacyIdx === 'number' && themes.themes[legacyIdx]) {
                initialTheme = themes.themes[legacyIdx].name;
            } else {
                initialTheme = this.defaults.theme;
            }
        }

        this.values = {
            theme:           initialTheme,
            customThemeFile: window.GetProperty(this.keys.customThemeFile, this.defaults.customThemeFile),
            snapEnabled:     Boolean(window.GetProperty(this.keys.snapEnabled, this.defaults.snapEnabled))
        };

        this._lastFinalizedTheme = this.values.theme !== '~Preview' ? this.values.theme : this.defaults.theme;
    }

    set(name, value) {
        this.values[name] = value;
        window.SetProperty(this.keys[name], value);
    }

    setTheme(name) {
        if (name !== '~Preview') this._lastFinalizedTheme = name;
        this.set('theme', name);
    }

    reset() {
        this.setTheme(this.defaults.theme);
        this.set('snapEnabled', this.defaults.snapEnabled);
    }
}

const properties = new PropertyManager();

// ====================== STATE MANAGEMENT ======================
const State = {
    dragging: false,
    lastY: 0,
    uiVolume: 50,
    currentAngle: 0,
    targetAngle: 0,
    dragTargetAngle: 0,
    animationTimer: null,
    muteResyncTimer: null,
    needsRepaint: false,
    hasIsMuted: false,
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
        tickAngles: []
    },

    updateGeometryCache(w, h) {
        const cache = this.geometryCache;
        if (cache.valid && cache.width === w && cache.height === h) return;

        cache.width = w;
        cache.height = h;
        cache.cx = w / 2;
        cache.cy = h / 2;
        cache.size = Math.max(10, Math.min(w, h) - CONFIG.PADDING * 2);
        cache.x = cache.cx - cache.size / 2;
        cache.y = cache.cy - cache.size / 2;
        cache.radius = cache.size * 0.5;
        cache.innerSize = cache.size * CONFIG.INNER_RATIO;
        cache.tickLength = cache.size * CONFIG.TICK_LENGTH_RATIO;

        cache.tickAngles = [];
        for (let i = 0; i < CONFIG.TICK_COUNT; i++) {
            cache.tickAngles[i] = (CONFIG.ANGLE_MIN + i / (CONFIG.TICK_COUNT - 1) * SWEEP_TOTAL + CONFIG.ROTATION_OFFSET) * DEG2RAD;
        }

        cache.valid = true;
    },

    invalidateGeometry() { this.geometryCache.valid = false; },

    cleanup() {
        this.stopAnimation();
        if (this.muteResyncTimer) { window.ClearTimeout(this.muteResyncTimer); this.muteResyncTimer = null; }
        this.geometryCache.tickAngles = null;
    },

    stopAnimation() {
        if (this.animationTimer) { window.ClearInterval(this.animationTimer); this.animationTimer = null; }
    },

    startAnimation() {
        if (_unloaded || this.animationTimer) return;
        this.animationTimer = window.SetInterval(() => {
            const settled = Math.abs(this.currentAngle - this.targetAngle) < CONFIG.ANGLE_EPSILON;
            if (this.needsRepaint || !settled) {
                window.Repaint();
                this.needsRepaint = false;
            } else {
                this.stopAnimation();
            }
        }, CONFIG.ANIMATION_INTERVAL);
    },

    requestRepaint() {
        this.needsRepaint = true;
        this.startAnimation();
    }
};

// ====================== VOLUME CONVERSION ======================
const VolumeConverter = {
    uiToDb(v) {
        if (v <= CONFIG.VOL_BREAKPOINT_1) return -100 + v * VOL_SLOPE_1;
        if (v <= CONFIG.VOL_BREAKPOINT_2) return CONFIG.DB_BREAKPOINT_1 + (v - CONFIG.VOL_BREAKPOINT_1) * VOL_SLOPE_2;
        return CONFIG.DB_BREAKPOINT_2 + (v - CONFIG.VOL_BREAKPOINT_2) * VOL_SLOPE_3;
    },
    dbToUi(db) {
        db = clamp(db, -100, 0);
        if (db <= CONFIG.DB_BREAKPOINT_1) return (db + 100) / VOL_SLOPE_1;
        if (db <= CONFIG.DB_BREAKPOINT_2) return CONFIG.VOL_BREAKPOINT_1 + (db - CONFIG.DB_BREAKPOINT_1) / VOL_SLOPE_2;
        return CONFIG.VOL_BREAKPOINT_2 + (db - CONFIG.DB_BREAKPOINT_2) / VOL_SLOPE_3;
    },
    uiToAngle(v) {
        if (v <= CONFIG.VOL_BREAKPOINT_2)
            return CONFIG.ANGLE_MIN + (v / CONFIG.VOL_BREAKPOINT_2) * SWEEP_HALF;
        return CONFIG.ANGLE_MIN + SWEEP_HALF + ((v - CONFIG.VOL_BREAKPOINT_2) / VOL_RANGE_2) * SWEEP_HALF;
    },
    angleToUi(angle) {
        const mid = CONFIG.ANGLE_MIN + SWEEP_HALF;
        if (angle <= mid)
            return (angle - CONFIG.ANGLE_MIN) / SWEEP_HALF * CONFIG.VOL_BREAKPOINT_2;
        return CONFIG.VOL_BREAKPOINT_2 + (angle - mid) / SWEEP_HALF * VOL_RANGE_2;
    },
    applySnap(db) {
        if (!properties.values.snapEnabled) return db;
        if (Math.abs(db) <= CONFIG.SNAP_TOLERANCE_DB) return 0;
        if (Math.abs(db + 10) <= CONFIG.SNAP_TOLERANCE_DB) return -10;
        return db;
    }
};

// ====================== VOLUME SYNC ======================
const VolumeSync = {
    syncFromFoobar() {
        try {
            const fbVol = clamp(fb.Volume, -100, 0);
            State.uiVolume = VolumeConverter.dbToUi(fbVol);
            State.targetAngle = State.dragTargetAngle = VolumeConverter.uiToAngle(State.uiVolume);
            State.currentAngle = State.targetAngle;
            State.requestRepaint();
        } catch (e) {
            if (typeof console !== "undefined") console.log("[Volume Knob] Error syncing from foobar:", e);
        }
    },
    setFoobarVolume(uiVol, skipSnap) {
        try {
            const db = VolumeConverter.uiToDb(uiVol);
            const newDb = skipSnap ? db : VolumeConverter.applySnap(db);
            if (Math.abs(newDb - fb.Volume) >= 0.05) {
                fb.Volume = newDb;
                if (!skipSnap && newDb !== db) {
                    State.uiVolume = VolumeConverter.dbToUi(newDb);
                    State.targetAngle = State.dragTargetAngle = VolumeConverter.uiToAngle(State.uiVolume);
                }
            }
        } catch (e) {
            if (typeof console !== "undefined") console.log("[Volume Knob] Error setting foobar volume:", e);
        }
    }
};

// ====================== RENDERER ======================
const Renderer = {
    draw(gr) {
        const w = window.Width, h = window.Height;
        if (!w || !h) return;
        State.updateGeometryCache(w, h);
        const cache = State.geometryCache;
        const theme = themes.get(properties.values.theme);

        if (!cache.tickAngles) return;

        this.updateAnimation();

        try {
            // Outer circle / Knob body
            gr.FillEllipse(cache.x, cache.y, cache.size, cache.size, theme.knob);

            // Inner circle / Main dial face
            const innerX = cache.cx - cache.innerSize / 2, innerY = cache.cy - cache.innerSize / 2;
            gr.FillEllipse(innerX, innerY, cache.innerSize, cache.innerSize, theme.inner);

            // Tick marks
            for (let i = 0; i < CONFIG.TICK_COUNT; i++) {
                const a = cache.tickAngles[i], sa = Math.sin(a), ca = Math.cos(a);
                gr.DrawLine(
                    cache.cx + sa * (cache.radius - cache.tickLength),
                    cache.cy - ca * (cache.radius - cache.tickLength),
                    cache.cx + sa * cache.radius,
                    cache.cy - ca * cache.radius,
                    2,
                    theme.tick
                );
            }

            // Dial marker / Pointer
            const rad = (State.currentAngle + CONFIG.ROTATION_OFFSET) * DEG2RAD;
            const sr = Math.sin(rad), cr = Math.cos(rad);
            let alpha = 255;
            if (State.hasIsMuted) {
                try { if (fb.IsMuted) alpha = 90; } catch (e) {}
            }
            const wMarker = Math.max(1, Math.round(cache.size * CONFIG.MARKER_WIDTH_RATIO));
            const markerCol = withAlpha(theme.marker, alpha);

            gr.DrawLine(
                cache.cx + sr * cache.size * CONFIG.MARKER_START_RATIO,
                cache.cy - cr * cache.size * CONFIG.MARKER_START_RATIO,
                cache.cx + sr * cache.size * CONFIG.MARKER_END_RATIO,
                cache.cy - cr * cache.size * CONFIG.MARKER_END_RATIO,
                wMarker,
                markerCol
            );

        } catch (e) {
            if (typeof console !== "undefined") console.log("[Volume Knob] Paint error:", e);
        }
    },
    updateAnimation() {
        const prev = State.currentAngle;
        if (State.dragging) {
            State.currentAngle += (State.dragTargetAngle - State.currentAngle) * CONFIG.DRAG_FOLLOW_SPEED;
        } else {
            State.currentAngle += (State.targetAngle - State.currentAngle) * CONFIG.RELEASE_EASING;
        }
        if (Math.abs(State.currentAngle - State.targetAngle) < CONFIG.ANGLE_EPSILON) {
            State.currentAngle = State.targetAngle;
        }
        if (Math.abs(State.currentAngle - prev) > CONFIG.ANGLE_EPSILON) {
            State.requestRepaint();
        }
    }
};

// ====================== INPUT HANDLERS ======================
const InputHandler = {
    hitTest(x, y) {
        const c = State.geometryCache;
        return c.valid && (x - c.cx) ** 2 + (y - c.cy) ** 2 <= c.radius ** 2;
    },
    handleDragStart(x, y) {
        if (!this.hitTest(x, y)) return false;
        State.dragging = true;
        State.lastY = y;
        return true;
    },
    handleDragEnd() {
        if (!State.dragging) return false;
        State.dragging = false;
        if (properties.values.snapEnabled) {
            VolumeSync.setFoobarVolume(State.uiVolume, false);
        }
        State.targetAngle = State.dragTargetAngle;
        State.requestRepaint();
        return true;
    },
    handleDragMove(x, y) {
        if (!State.dragging) return false;
        const delta = (State.lastY - y) * CONFIG.DRAG_SCALE;
        let v = clamp(Math.round((State.uiVolume + delta) * 10) / 10, 0, 100);
        if (Math.abs(v - State.uiVolume) >= 0.1) {
            State.uiVolume = v;
            State.dragTargetAngle = State.targetAngle = VolumeConverter.uiToAngle(v);
            VolumeSync.setFoobarVolume(v, true);
            State.requestRepaint();
            State.lastY = y;
        }
        return true;
    },
    handleWheel(step) {
        const rawAngle = VolumeConverter.uiToAngle(State.uiVolume) + step * CONFIG.WHEEL_STEP_DEG;
        const snapped  = Math.round((rawAngle - CONFIG.ANGLE_MIN) / CONFIG.WHEEL_STEP_DEG)
                         * CONFIG.WHEEL_STEP_DEG + CONFIG.ANGLE_MIN;
        const newAngle = clamp(snapped, CONFIG.ANGLE_MIN, CONFIG.ANGLE_MAX);
        const v        = clamp(VolumeConverter.angleToUi(newAngle), 0, 100);
        if (Math.abs(v - State.uiVolume) >= 0.01) {
            State.uiVolume = v;
            State.dragTargetAngle = State.targetAngle = newAngle;
            VolumeSync.setFoobarVolume(v, true);
            State.requestRepaint();
        }
        return true;
    },
    handleDoubleClick(x, y) {
        if (!this.hitTest(x, y)) return false;
        State.dragging = false;
        try {
            fb.RunMainMenuCommand("Playback/Volume/Mute");
            if (State.muteResyncTimer) { window.ClearTimeout(State.muteResyncTimer); State.muteResyncTimer = null; }
            State.muteResyncTimer = window.SetTimeout(() => {
                State.muteResyncTimer = null;
                VolumeSync.syncFromFoobar();
                State.requestRepaint();
            }, 50);
        } catch (e) {
            if (typeof console !== "undefined") console.log("[Volume Knob] Error toggling mute:", e);
        }
        State.requestRepaint();
        return true;
    }
};

// ====================== MENU MANAGER ======================
const MenuManager = {
    _doColorPicker(label, key) {
        const d = themes.draftTheme;
        const applied = properties.values.theme;
        const baseName = applied === '~Preview' ? properties._lastFinalizedTheme : applied;
        if (themes._draftBaseTheme !== baseName) {
            themes._draftBaseTheme = baseName;
            themes.seedDraftFromTheme(themes.get(baseName));
        }
        const startColor = d[key];
        let newColor;
        try {
            newColor = utils.ColourPicker(window.ID, startColor);
        } catch (e) {
            fb.ShowPopupMessage('Color picker unavailable:\n' + String(e.message || e), SCRIPT_NAME);
            return;
        }
        if (newColor === startColor || newColor === -1) return;

        themes.updateDraft(key, newColor);

        const t = themes.makeTheme(
            '~Preview',
            themes.draftTheme.bg,
            themes.draftTheme.knob,
            themes.draftTheme.inner,
            themes.draftTheme.tick,
            themes.draftTheme.marker
        );
        themes.setPreview(t);
        properties.setTheme('~Preview');
        State.requestRepaint();
    },

    _doFinalizeTheme() {
        const draft = themes.draftTheme;
        let name;
        try {
            name = utils.InputBox(window.ID, 'Enter a name for your custom theme:', 'Save Theme', draft.name);
        } catch (e) {
            name = null;
        }
        if (name === false || name === null || name === undefined || String(name).trim() === '') return;
        name = String(name).trim();

        if (name === '~Preview') {
            fb.ShowPopupMessage('"~Preview" is a reserved internal name.\nChoose a different name.', SCRIPT_NAME);
            return;
        }

        if (themes._isBuiltin(name)) {
            fb.ShowPopupMessage('"' + name + '" is a built-in theme name and cannot be overwritten.\nChoose a different name.', SCRIPT_NAME);
            return;
        }

        const d = themes.draftTheme;
        const t = themes.makeTheme(name, d.bg, d.knob, d.inner, d.tick, d.marker);
        t.custom = true;

        if (themes.themeMap[name]) {
            const oldRef = themes.themeMap[name];
            const idx = themes.themes.indexOf(oldRef);
            if (idx !== -1) themes.themes[idx] = t;
            const ci = themes._customThemes.indexOf(oldRef);
            if (ci !== -1) {
                themes._customThemes[ci] = t;
            } else if (themes._customThemes.indexOf(t) === -1) {
                themes._customThemes.push(t);
            }
        } else {
            themes.themes.push(t);
            themes._customThemes.push(t);
        }
        themes.themeMap[name] = t;
        themes.clearPreview();
        themes.draftTheme.name = name;

        properties.setTheme(name);
        State.requestRepaint();

        let savePath = properties.values.customThemeFile;
        if (!savePath || savePath.trim() === '') {
            savePath = this._promptForSavePath('Save Theme File', 'volumeknob_custom_themes.json');
            if (savePath) properties.set('customThemeFile', savePath);
        }

        if (savePath && savePath.trim() !== '') {
            const saveResult = themes.saveToFile(savePath, null);
            if (saveResult.ok) {
                fb.ShowPopupMessage('Theme "' + name + '" saved and written to:\n' + savePath, SCRIPT_NAME);
            } else {
                fb.ShowPopupMessage('Theme "' + name + '" saved to this session, but file write failed:\n' + (saveResult.error || 'Unknown error') + '\n\nUse Theme > Custom Theme JSON > Save custom themes to JSON… to retry.', SCRIPT_NAME);
            }
        }
    },

    _doRemoveCustomTheme(name) {
        const result = themes.removeCustom(name);
        if (!result.ok) {
            fb.ShowPopupMessage(result.error || 'Could not remove theme.', SCRIPT_NAME);
            return;
        }
        if (themes._draftBaseTheme === name) {
            themes._draftBaseTheme = null;
        }

        const current = properties.values.theme;
        const wasInUse = current === name || (current === '~Preview' && properties._lastFinalizedTheme === name);
        if (wasInUse) {
            const fallback = (properties._lastFinalizedTheme !== name)
                ? properties._lastFinalizedTheme
                : (themes.themes.length ? themes.themes[0].name : 'Classic Gray');
            properties._lastFinalizedTheme = fallback;
            themes.clearPreview();
            properties.setTheme(fallback);
        }

        State.requestRepaint();
        fb.ShowPopupMessage('Custom theme "' + name + '" removed.', SCRIPT_NAME);
    },

    _promptForFilePath(title) {
        try {
            const path = utils.InputBox(window.ID, 'Enter the full path to your JSON theme file:', title, properties.values.customThemeFile || '');
            return (path !== false && path !== null && path !== undefined && String(path).trim() !== '') ? String(path).trim() : null;
        } catch (e) {}
        return null;
    },

    _promptForSavePath(title, defaultName) {
        try {
            const path = utils.InputBox(
                window.ID,
                'Enter the full path to save the JSON theme file:',
                title,
                properties.values.customThemeFile || (fb.ProfilePath + (defaultName || 'volumeknob_custom_themes.json'))
            );
            return (path !== false && path !== null && path !== undefined && String(path).trim() !== '') ? String(path).trim() : null;
        } catch (e) {}
        return null;
    },

    _shortPath(p) {
        if (!p) return '';
        const parts = p.replace(/\\/g, '/').split('/');
        return parts.length > 2 ? '…/' + parts[parts.length - 1] : p;
    },

    show(x, y) {
        const menu = window.CreatePopupMenu();
        const themeMenu = window.CreatePopupMenu();
        const themeCustomMenu = window.CreatePopupMenu();
        const creatorMenu = window.CreatePopupMenu();
        const removeThemeMenu = window.CreatePopupMenu();

        const names = themes.names();
        const props = properties.values;
        const mark = (isActive) => isActive ? '✓ ' : '';

        const THEME_BASE               = 100;
        const THEME_LOAD_FILE_ID       = 600;
        const THEME_RELOAD_ID          = 601;
        const THEME_SAVE_CUSTOM_ID     = 602;
        const THEME_SAVE_ALL_ID        = 603;
        const THEME_EXPORT_TEMPLATE_ID = 604;
        const SET_SAVE_PATH_ID         = 605;
        const THEME_CREATOR_BASE       = 700;
        const CREATOR_BG_ID            = THEME_CREATOR_BASE + 1;
        const CREATOR_INNER_ID         = THEME_CREATOR_BASE + 2;
        const CREATOR_KNOB_ID          = THEME_CREATOR_BASE + 3;
        const CREATOR_TICK_ID          = THEME_CREATOR_BASE + 4;
        const CREATOR_MARKER_ID        = THEME_CREATOR_BASE + 5;
        const CREATOR_SAVE_ID          = THEME_CREATOR_BASE + 6;
        const THEME_REMOVE_CUSTOM_BASE = 800;
        const SNAP_TOGGLE_ID           = 900;
        const RESET_ID                 = 950;

        let id = THEME_BASE;
        for (let i = 0; i < names.length; i++, id++) {
            const isCustom = themes.themeMap[names[i]] && themes.themeMap[names[i]].custom;
            themeMenu.AppendMenuItem(MENU_STRING, id, mark(names[i] === props.theme) + names[i] + (isCustom ? '  [custom]' : ''));
        }
        themeMenu.AppendMenuSeparator();

        // Custom Theme JSON Submenu
        themeCustomMenu.AppendMenuItem(MENU_STRING, THEME_LOAD_FILE_ID, 'Load themes from JSON file…');
        const hasFile = props.customThemeFile && props.customThemeFile.trim() !== '';
        themeCustomMenu.AppendMenuItem(hasFile ? MENU_STRING : MF_GRAYED, THEME_RELOAD_ID, 'Reload from last file' + (hasFile ? '  (' + this._shortPath(props.customThemeFile) + ')' : ''));
        themeCustomMenu.AppendMenuSeparator();
        const hasCustom = themes._customThemes.length > 0;
        themeCustomMenu.AppendMenuItem(hasCustom ? MENU_STRING : MF_GRAYED, THEME_SAVE_CUSTOM_ID, 'Save custom themes to JSON…');
        themeCustomMenu.AppendMenuItem(MENU_STRING, THEME_SAVE_ALL_ID, 'Export all themes to JSON…');
        themeCustomMenu.AppendMenuItem(MENU_STRING, THEME_EXPORT_TEMPLATE_ID, 'Export template (all built-ins)…');
        themeCustomMenu.AppendMenuSeparator();
        themeCustomMenu.AppendMenuItem(MENU_STRING, SET_SAVE_PATH_ID, 'Set Default Save Path…' + (hasFile ? '  (' + this._shortPath(props.customThemeFile) + ')' : ''));
        themeCustomMenu.AppendTo(themeMenu, MENU_STRING, 'Custom Theme JSON');

        // Theme Creator Submenu
        const draftName = themes.draftTheme.name;
        creatorMenu.AppendMenuItem(MENU_STRING, CREATOR_BG_ID,     '1. Set Background Color…');
        creatorMenu.AppendMenuItem(MENU_STRING, CREATOR_INNER_ID,  '2. Set Main Dial (Inner Face) Color…');
        creatorMenu.AppendMenuItem(MENU_STRING, CREATOR_KNOB_ID,   '3. Set Outer Ring (Knob Body) Color…');
        creatorMenu.AppendMenuItem(MENU_STRING, CREATOR_TICK_ID,   '4. Set Tick Marks Color…');
        creatorMenu.AppendMenuItem(MENU_STRING, CREATOR_MARKER_ID, '5. Set Dial Marker (Pointer) Color…');
        creatorMenu.AppendMenuSeparator();
        creatorMenu.AppendMenuItem(MENU_STRING, CREATOR_SAVE_ID,   'Save as Custom Theme…  (draft: "' + draftName + '")');

        const customs = themes._customThemes;
        if (customs.length) {
            for (let ci = 0; ci < customs.length; ci++) {
                removeThemeMenu.AppendMenuItem(MENU_STRING, THEME_REMOVE_CUSTOM_BASE + ci, mark(customs[ci].name === props.theme) + customs[ci].name);
            }
        } else {
            removeThemeMenu.AppendMenuItem(MF_GRAYED, THEME_REMOVE_CUSTOM_BASE, 'No custom themes');
        }
        creatorMenu.AppendMenuSeparator();
        removeThemeMenu.AppendTo(creatorMenu, MENU_STRING, 'Remove Custom Theme…');
        creatorMenu.AppendTo(themeMenu, MENU_STRING, 'Theme Creator');

        themeMenu.AppendTo(menu, MENU_STRING, 'Theme');
        menu.AppendMenuSeparator();
        menu.AppendMenuItem(MENU_STRING, SNAP_TOGGLE_ID, mark(props.snapEnabled) + 'Snap to 0 dB && -10 dB');
        menu.AppendMenuSeparator();
        menu.AppendMenuItem(MENU_STRING, RESET_ID, 'Reset Defaults');

        const selected = menu.TrackPopupMenu(x, y);

        if (selected >= THEME_BASE && selected < THEME_BASE + names.length) {
            const chosen = names[selected - THEME_BASE];
            themes.clearPreview();
            properties.setTheme(chosen);
            State.requestRepaint();
        } else if (selected === SNAP_TOGGLE_ID) {
            properties.set('snapEnabled', !props.snapEnabled);
            State.requestRepaint();
        } else if (selected === RESET_ID) {
            properties.reset();
            themes.clearPreview();
            State.requestRepaint();
        } else if (selected === THEME_LOAD_FILE_ID) {
            const path = this._promptForFilePath('Load Theme JSON');
            if (path) {
                const result = themes.loadFromFile(path);
                if (result.ok) {
                    properties.set('customThemeFile', path);
                    State.requestRepaint();
                    fb.ShowPopupMessage(result.summary || ('Loaded ' + result.count + ' theme(s) from:\n' + path), SCRIPT_NAME);
                } else {
                    fb.ShowPopupMessage('Failed to load themes:\n\n' + (result.error || 'Unknown error'), SCRIPT_NAME);
                }
            }
        } else if (selected === THEME_RELOAD_ID) {
            const path = properties.values.customThemeFile;
            if (path) {
                const result = themes.loadFromFile(path);
                if (result.ok) {
                    State.requestRepaint();
                    fb.ShowPopupMessage(result.summary || ('Reloaded ' + result.count + ' theme(s).'), SCRIPT_NAME);
                } else {
                    fb.ShowPopupMessage('Failed to reload:\n\n' + (result.error || 'Unknown error'), SCRIPT_NAME);
                }
            }
        } else if (selected === THEME_SAVE_CUSTOM_ID) {
            const path = this._promptForSavePath('Save Custom Themes', 'volumeknob_custom_themes.json');
            if (path) {
                const result = themes.saveToFile(path, null);
                if (result.ok) {
                    properties.set('customThemeFile', path);
                    fb.ShowPopupMessage('Saved ' + result.count + ' theme(s) to:\n' + path, SCRIPT_NAME);
                } else {
                    fb.ShowPopupMessage('Save failed:\n\n' + (result.error || 'Unknown error'), SCRIPT_NAME);
                }
            }
        } else if (selected === THEME_SAVE_ALL_ID) {
            const path = this._promptForSavePath('Export All Themes', 'volumeknob_all_themes.json');
            if (path) {
                const result = themes.saveToFile(path, '*');
                if (result.ok) fb.ShowPopupMessage('Saved ' + result.count + ' theme(s) to:\n' + path, SCRIPT_NAME);
                else fb.ShowPopupMessage('Save failed:\n\n' + (result.error || 'Unknown error'), SCRIPT_NAME);
            }
        } else if (selected === THEME_EXPORT_TEMPLATE_ID) {
            const path = this._promptForSavePath('Export Built-in Theme Template', 'volumeknob_theme_template.json');
            if (path) {
                const result = themes.exportTemplate(path);
                if (result.ok) {
                    fb.ShowPopupMessage('Template exported (' + result.count + ' built-in themes) to:\n' + path + '\n\nEdit the JSON, customize colours, and load back via\nTheme > Custom Theme JSON > Load themes from JSON file…', SCRIPT_NAME);
                } else {
                    fb.ShowPopupMessage('Export failed:\n\n' + (result.error || 'Unknown error'), SCRIPT_NAME);
                }
            }
        } else if (selected === SET_SAVE_PATH_ID) {
            const result = utils.InputBox(window.ID, 'Enter default path for custom themes JSON file:', 'Set Default Save Path', properties.values.customThemeFile || (fb.ProfilePath + 'volumeknob_custom_themes.json'));
            if (result !== false && result !== null && result !== undefined && String(result).trim() !== '') {
                properties.set('customThemeFile', String(result).trim());
                fb.ShowPopupMessage('Default save path set to:\n' + String(result).trim(), SCRIPT_NAME);
            }
        } else if (selected === CREATOR_BG_ID) {
            this._doColorPicker('Background', 'bg');
        } else if (selected === CREATOR_INNER_ID) {
            this._doColorPicker('Main Dial (Inner Face)', 'inner');
        } else if (selected === CREATOR_KNOB_ID) {
            this._doColorPicker('Outer Ring (Knob Body)', 'knob');
        } else if (selected === CREATOR_TICK_ID) {
            this._doColorPicker('Tick Marks', 'tick');
        } else if (selected === CREATOR_MARKER_ID) {
            this._doColorPicker('Dial Marker (Pointer)', 'marker');
        } else if (selected === CREATOR_SAVE_ID) {
            this._doFinalizeTheme();
        } else if (selected >= THEME_REMOVE_CUSTOM_BASE && selected < THEME_REMOVE_CUSTOM_BASE + themes._customThemes.length) {
            const target = themes._customThemes[selected - THEME_REMOVE_CUSTOM_BASE];
            if (target) this._doRemoveCustomTheme(target.name);
        }

        return true;
    }
};

// ====================== LIFECYCLE GUARD ======================
let _unloaded = false;

// ====================== INITIALIZATION ======================
function init() {
    // Load custom themes from JSON on startup
    const customThemeFile = properties.values.customThemeFile;
    try {
        const result = themes.loadFromFile(customThemeFile);
        if (!result.ok && result.error && result.error.indexOf('File not found') === -1) {
            console.log('[Volume Knob] Custom theme JSON: ' + result.error);
        }
    } catch (e) {
        console.log('[Volume Knob] Custom theme startup load error: ' + String(e.message || e));
    }

    if (properties.values.theme === '~Preview') {
        const fallback = properties._lastFinalizedTheme;
        themes.clearPreview();
        properties.setTheme(fallback && themes.themeMap[fallback] ? fallback : 'Classic Gray');
    }

    if (themes.names().indexOf(properties.values.theme) === -1) {
        properties.setTheme('Classic Gray');
    }

    try {
        State.hasIsMuted = (fb.IsMuted !== undefined);
    } catch (e) {
        State.hasIsMuted = false;
    }

    try {
        VolumeSync.syncFromFoobar();
        State.startAnimation();
    } catch (e) {
        if (typeof console !== "undefined") console.log("[Volume Knob] Initialization error:", e);
    }
}
init();

// ====================== FOOBAR CALLBACKS ======================
function on_key_down(vkey) {
    if (_unloaded) return false;
    if (vkey === VK_UP || vkey === VK_RIGHT) {
        InputHandler.handleWheel(1);
        return true;
    }
    if (vkey === VK_DOWN || vkey === VK_LEFT) {
        InputHandler.handleWheel(-1);
        return true;
    }
    return false;
}

function on_paint(gr) {
    if (_unloaded) return;
    const w = window.Width, h = window.Height;
    if (!w || !h) return;

    // Fill themed background
    const theme = themes.get(properties.values.theme);
    if (theme && theme.bg !== undefined) {
        gr.FillSolidRect(0, 0, w, h, theme.bg);
    } else if (panel && panel.paint) {
        panel.paint(gr);
    }

    Renderer.draw(gr);
}

function on_size() {
    if (_unloaded) return;
    if (panel && panel.size) panel.size();
    const w = window.Width, h = window.Height;
    if (State.geometryCache.width !== w || State.geometryCache.height !== h) {
        State.invalidateGeometry();
        State.requestRepaint();
    }
}

function on_colours_changed() {
    if (_unloaded) return;
    if (panel && panel.colours_changed) panel.colours_changed();
    State.requestRepaint();
}

function on_font_changed() {
    if (!_unloaded) State.requestRepaint();
}

function on_volume_change() {
    if (!_unloaded && !State.dragging) VolumeSync.syncFromFoobar();
}

function on_mouse_lbtn_down(x, y) {
    if (_unloaded) return false;
    if (window.SetFocus) window.SetFocus();
    return InputHandler.handleDragStart(x, y);
}

function on_mouse_lbtn_up() {
    if (_unloaded) return false;
    return InputHandler.handleDragEnd();
}

function on_mouse_move(x, y) {
    if (_unloaded) return false;
    return InputHandler.handleDragMove(x, y);
}

function on_mouse_wheel(step) {
    if (_unloaded) return false;
    return InputHandler.handleWheel(step);
}

function on_mouse_lbtn_dblclk(x, y) {
    if (_unloaded) return false;
    if (window.SetFocus) window.SetFocus();
    return InputHandler.handleDoubleClick(x, y);
}

function on_mouse_rbtn_up(x, y) {
    if (_unloaded) return false;
    return MenuManager.show(x, y);
}

function on_script_unload() {
    _unloaded = true;
    State.cleanup();
}

window.MinHeight = 80;
window.MinWidth  = 80;