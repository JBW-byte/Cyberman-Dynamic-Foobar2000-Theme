'use strict';

		  // ======= AUTHOR L.E.D. (AI-assisted) ========\\
		 // ========  SMP 64bit Volume Knob V5.0  ========\\
		// ======= Custom Theme Creator + JSON I/O ========\\

 // ===================*** Foobar2000 64bit ***================== \\
// ======= For Spider Monkey Panel 64bit, author: marc2003 ======= \\

/* 
 * Custom License for foobar2000 Themes
 * Copyright (c) 2026 [L.E.D.]
 * Allowed: Non-commercial use and modification.
 * Prohibited: Paid products/themes, subscriptions, or cloud-bundled services.
 * See License.txt.
 */

window.DefineScript('Volume Knob', { 
    author: 'L.E.D.', 
    version: '5.0',
    features: { grab_focus: true } 
});

if ('DrawMode' in window) window.DrawMode = 0; // 0 = GDI+, 1 = Direct2D
window.DlgCode = 0x0004; // DLGC_WANTALLKEYS: Preserves Ctrl/Shift + Arrow key capture

// ============================================================================================
// 1. HELPERS, MATH, MENU BUILDER & GDI UTILITIES
// ============================================================================================
class GdiUtils {
    static clamp(val, min, max) {
        const n = Number(val);
        return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : min;
    }

    static colour(r, g, b) {
        const cr = r < 0 ? 0 : r > 255 ? 255 : r | 0;
        const cg = g < 0 ? 0 : g > 255 ? 255 : g | 0;
        const cb = b < 0 ? 0 : b > 255 ? 255 : b | 0;
        return ((255 << 24) | (cr << 16) | (cg << 8) | cb) >>> 0;
    }

    static setAlpha(col, a) {
        const clampedA = (a < 0 ? 0 : a > 255 ? 255 : a) & 0xFF;
        return ((clampedA << 24) | (col & 0x00FFFFFF)) >>> 0;
    }

    static toRGB(col) {
        return [(col >>> 16) & 0xFF, (col >>> 8) & 0xFF, col & 0xFF];
    }

    static scale(size) {
        const sysDpi = (typeof window.DPI === 'number' && window.DPI > 0) ? window.DPI : 96;
        return Math.round(size * (sysDpi / 96));
    }

    static sanitizePath(str) {
        if (!str || typeof str !== 'string') return '';
        const clean = str.replace(/^["']+|["']+$/g, '').trim();
        if (/^[a-zA-Z]:[\\\/]?$/.test(clean)) {
            return clean.substring(0, 2) + '\\';
        }
        if (/^\\\\[^\\]+\\[^\\]+[\\\/]?$/.test(clean)) {
            return clean.replace(/[\\\/]+$/, '') + '\\';
        }
        return clean.replace(/[\/\\]+$/, '');
    }

    static escapeMenuLabel(str) {
        return String(str ?? '').replace(/&/g, '&&');
    }

    static prompt(promptText, titleText, defaultVal) {
        try {
            const res = utils.InputBox(window.ID, promptText, titleText, String(defaultVal ?? ''), true);
            return (res === null || res === undefined) ? null : res;
        } catch {
            return null;
        }
    }
}

class MenuBuilder {
    #menu;
    #state;

    constructor(state = null, startId = 1) {
        this.#menu = window.CreatePopupMenu();
        this.#state = state || {
            nextId: startId,
            callbacks: new Map(),
            menus: []
        };
        this.#state.menus.push(this.#menu);
    }

    get raw() {
        return this.#menu;
    }

    addItem(label, callback, opts = {}) {
        const id = this.#state.nextId++;
        const flags = opts.disabled ? 0x0001 : 0;
        this.#menu.AppendMenuItem(flags, id, label);
        if (opts.checked || opts.radio) {
            this.#menu.CheckMenuRadioItem(id, id, id);
        }
        if (typeof callback === 'function') {
            this.#state.callbacks.set(id, callback);
        }
        return this;
    }

    addSeparator() {
        this.#menu.AppendMenuSeparator();
        return this;
    }

    addSubMenu(title, buildFn, disabled = false) {
        const sub = new MenuBuilder(this.#state);
        buildFn(sub);
        sub.#menu.AppendTo(this.#menu, disabled ? 0x0001 : 0, title);
        return this;
    }

    track(x, y) {
        let selected = 0;
        try {
            selected = this.#menu.TrackPopupMenu(x, y);
        } finally {
            for (const m of this.#state.menus) {
                try { if (m && typeof m.Dispose === 'function') m.Dispose(); } catch {}
            }
            this.#state.menus.length = 0;
        }
        if (selected > 0) {
            const cb = this.#state.callbacks.get(selected);
            if (cb) cb();
        }
        return selected;
    }
}

window.MinWidth  = GdiUtils.scale(60);
window.MinHeight = GdiUtils.scale(60);

// ============================================================================================
// 2. CONSTANTS & SYSTEM ENUMS
// ============================================================================================
class VolumeConstants {
    static SCRIPT_NAME = 'Volume Knob';
    static LIFECYCLE   = { BOOT: 0, INIT: 1, LIVE: 2, SHUTDOWN: 3 };

    // Backplate Texture Modes
    static BG_MODE = { SOLID: 0, BRUSHED: 1, SANDBLAST: 2, SATIN: 3, IMAGE: 4 };

    // Dial Face Finish Modes
    static DIAL_MODE = { SOLID: 0, CONCENTRIC: 1, KNURLED: 2, BEADBLAST: 3, SANDBLAST: 4, STUDIO: 5, IMAGE: 6, CARBON: 8 };

    // Dial Specular Lighting Styles
    static LIGHT_STYLE = {
        AUTO: 0, ANISOTROPIC: 1, SPOTLIGHT: 2, HAIRLINE: 3, CROSS: 4, 
        STUDIO_SHEEN: 5, ANISO_BEVEL: 6, CONTOUR_DOME: 7, CONCAVE_BOWL: 8, 
        STUDIO_ANISO: 9, SPUN_METAL: 10
    };

    // Dial Marker Pointer Styles
    static MARKER_STYLE = { 
        LINE: 0, 
        CIRCLE: 1, 
        ARROW: 2, 
        SHORT: 3, 
        BEVEL_WEDGE: 4, 
        BEVEL_SLOT: 5, 
        VSHORT: 6,
        FULL_LINE: 7,
        LED_DOT: 8,
        GLOW_LINE: 9,
        GROOVE: 10
    };

    // Marker Tick Styles
    static TICK_STYLE = { UNIFORM: 0, MAJOR: 1, DOTS: 2, BLOCKS: 3, DIAMONDS: 4, BOUNDED: 5, MIN_MAX: 6, DOT_ARC: 7 };

    // Major Scale Marking Intervals
    static MAJOR_INTERVAL = { NONE: 0, MIN_MID_MAX: 1, QUARTERS: 2, TENTHS: 3 };

    static isMajorTick(index, mode) {
        switch (mode) {
            case this.MAJOR_INTERVAL.NONE: return false;
            case this.MAJOR_INTERVAL.MIN_MID_MAX: return (index === 0 || index === 10 || index === 20);
            case this.MAJOR_INTERVAL.QUARTERS: return (index === 0 || index === 5 || index === 10 || index === 15 || index === 20);
            case this.MAJOR_INTERVAL.TENTHS: return (index % 2 === 0);
            default: return (index % 5 === 0);
        }
    }

    static SWEEP_CENTER = 270;
    static DEG2RAD = Math.PI / 180;

    static COS_WEDGE_PHI = Math.cos(Math.PI / 2.2);
    static SIN_WEDGE_PHI = Math.sin(Math.PI / 2.2);

    static getProfilePath() {
        let p = fb.ProfilePath || '';
        return (p && !p.endsWith('\\') && !p.endsWith('/')) ? `${p}\\` : p;
    }

    static PROFILE_BASE = this.getProfilePath();
    static IMG_DIR = `${this.PROFILE_BASE}skins\\scripts\\VolumeKnob\\`;
    static DEFAULT_THEME_FILE = `${this.PROFILE_BASE}volumeknob_config.json`;

    // Shared LCD 20-Theme Table matching Peak Meter and TimerPro
    static LCD_THEMES = [
        { name: 'Classic Green',   color: GdiUtils.colour(30, 180, 30) },
        { name: 'Retro Amber',     color: GdiUtils.colour(190, 110, 0) },
        { name: 'Cyber Blue',      color: GdiUtils.colour(0, 130, 200) },
        { name: 'Cool Blue',       color: GdiUtils.colour(100, 180, 215) },
        { name: 'Deep Red',        color: GdiUtils.colour(170, 15, 15) },
        { name: 'Steel Grey',      color: GdiUtils.colour(160, 160, 160) },
        { name: 'Night Purple',    color: GdiUtils.colour(120, 60, 180) },
        { name: 'Dim White',       color: GdiUtils.colour(180, 180, 180) },
        { name: 'Pioneer Amber',   color: GdiUtils.colour(255, 178, 45) },
        { name: 'Technics Green',  color: GdiUtils.colour(80, 248, 128) },
        { name: 'Sony ES Blue',    color: GdiUtils.colour(68, 180, 255) },
        { name: 'Yamaha Ice',      color: GdiUtils.colour(96, 242, 234) },
        { name: 'Kenwood Red',     color: GdiUtils.colour(255, 79, 57) },
        { name: 'Sansui Lime',     color: GdiUtils.colour(196, 244, 52) },
        { name: 'Marantz Blue',    color: GdiUtils.colour(88, 126, 255) },
        { name: 'Akai Orange',     color: GdiUtils.colour(255, 130, 28) },
        { name: 'Sharp Aqua',      color: GdiUtils.colour(20, 239, 229) },
        { name: 'Aiwa VFD',        color: GdiUtils.colour(52, 222, 183) },
        { name: 'Nakamichi Gold',  color: GdiUtils.colour(247, 193, 67) },
        { name: 'JVC Violet',      color: GdiUtils.colour(210, 102, 255) }
    ];
}

// ============================================================================================
// 3. ASSET MANAGER & IMAGE CACHE
// ============================================================================================
class AssetManager {
    #images = new Map();
    #availableFiles = null;

    constructor() {
        try {
            const cleanPath = GdiUtils.sanitizePath(VolumeConstants.IMG_DIR);
            if (typeof utils.CreateFolder === 'function') utils.CreateFolder(cleanPath);
        } catch {}
    }

    getAvailableImages(forceRefresh = false) {
        if (this.#availableFiles !== null && !forceRefresh) return this.#availableFiles;

        const files = [];
        const exts = ['.png', '.jpg', '.jpeg', '.bmp', '.webp'];
        const cleanDir = GdiUtils.sanitizePath(VolumeConstants.IMG_DIR);

        if (typeof utils.Glob === 'function' && utils.IsDirectory(cleanDir)) {
            try {
                const all = utils.Glob(`${cleanDir}\\*.*`);
                if (Array.isArray(all)) {
                    for (const full of all) {
                        if (typeof utils.IsFile === 'function' && !utils.IsFile(full)) continue;
                        const name = full.split(/[\\\/]/).pop();
                        const dotIdx = name.lastIndexOf('.');
                        if (dotIdx === -1) continue;
                        const ext = name.substring(dotIdx).toLowerCase();
                        if (exts.includes(ext)) files.push(name);
                    }
                    files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
                }
            } catch {}
        }
        this.#availableFiles = files;
        return files;
    }

    getImage(path) {
        if (!path || !utils.IsFile(path)) return null;
        if (this.#images.has(path)) return this.#images.get(path);
        try {
            const img = gdi.Image(path);
            if (img) this.#images.set(path, img);
            return img;
        } catch {
            return null;
        }
    }

    clear() {
        for (const img of this.#images.values()) {
            if (img?.Dispose) { try { img.Dispose(); } catch {} }
        }
        this.#images.clear();
        this.#availableFiles = null;
    }
}

// ============================================================================================
// 4. THEME MANAGER
// ============================================================================================
class ThemeManager {
    static BUILTIN_DEFS = [
        { name: 'Classic Gray',    bg: [32, 32, 32],    knob: [80, 80, 80],    inner: [50, 50, 50],    tick: [160, 160, 160], marker: [255, 180, 180] },
        { name: 'Warm Amber',      bg: [32, 32, 32],    knob: [90, 70, 50],    inner: [60, 45, 30],    tick: [200, 160, 100], marker: [255, 200, 120] },
        { name: 'Cool Blue',       bg: [32, 32, 32],    knob: [60, 70, 90],    inner: [40, 50, 70],    tick: [140, 170, 220], marker: [160, 200, 255] },
        { name: 'Mint Green',      bg: [32, 32, 32],    knob: [60, 90, 80],    inner: [40, 65, 55],    tick: [140, 200, 180], marker: [160, 255, 220] },
        { name: 'Purple Haze',     bg: [32, 32, 32],    knob: [85, 70, 95],    inner: [55, 45, 65],    tick: [190, 160, 220], marker: [220, 180, 255] },
        { name: 'Fire Red',        bg: [32, 32, 32],    knob: [90, 55, 55],    inner: [60, 35, 35],    tick: [220, 150, 150], marker: [255, 170, 170] },
        { name: 'Mono Dark',       bg: [32, 32, 32],    knob: [50, 50, 50],    inner: [30, 30, 30],    tick: [120, 120, 120], marker: [200, 200, 200] },
        { name: 'Ocean Teal',      bg: [32, 32, 32],    knob: [40, 80, 85],    inner: [25, 55, 60],    tick: [120, 190, 200], marker: [140, 230, 240] },
        { name: 'Gold Brass',      bg: [32, 32, 32],    knob: [95, 85, 50],    inner: [70, 60, 35],    tick: [230, 210, 150], marker: [255, 235, 180] },
        { name: 'Neon Pink',       bg: [32, 32, 32],    knob: [90, 50, 70],    inner: [65, 35, 50],    tick: [230, 150, 200], marker: [255, 170, 220] },
        { name: 'Satin Black',     bg: [22, 22, 22],    knob: [45, 45, 45],    inner: [30, 30, 30],    tick: [140, 140, 140], marker: [255, 255, 255], settings: { bgMode: VolumeConstants.BG_MODE.SATIN, dialMode: VolumeConstants.DIAL_MODE.SOLID } },
        { name: 'Satin Silver',    bg: [180, 180, 185], knob: [220, 220, 225], inner: [190, 190, 195], tick: [100, 100, 100], marker: [255, 60, 60],   settings: { bgMode: VolumeConstants.BG_MODE.SATIN, dialMode: VolumeConstants.DIAL_MODE.SOLID } },
        { name: 'Satin Bronze',    bg: [110, 90, 75],   knob: [140, 115, 95],  inner: [120, 95, 80],   tick: [220, 200, 180], marker: [255, 220, 150], settings: { bgMode: VolumeConstants.BG_MODE.SATIN, dialMode: VolumeConstants.DIAL_MODE.BEADBLAST } },
        { name: 'Studio Console',  bg: [26, 28, 32],    knob: [48, 54, 62],    inner: [36, 44, 52],    tick: [170, 185, 200], marker: [255, 70, 70],   settings: { dialMode: VolumeConstants.DIAL_MODE.KNURLED, markerStyle: VolumeConstants.MARKER_STYLE.SHORT } },
        { 
            name: 'Studio Console 1707', 
            bg: [26, 28, 32], 
            knob: [48, 54, 62], 
            inner: [36, 44, 52], 
            tick: [170, 185, 200], 
            marker: [255, 70, 70], 
            settings: { 
                bgMode: VolumeConstants.BG_MODE.SANDBLAST, 
                customBgImage: '', 
                dialMode: VolumeConstants.DIAL_MODE.SOLID, 
                customDialImage: 'Moonwalker.jpg', 
                spinDialImage: false, 
                showHighlight: false, 
                dialLightStyle: VolumeConstants.LIGHT_STYLE.SPOTLIGHT, 
                dialLightStrength: 89, 
                dialLightAngle: 180, 
                showDropShadow: true, 
                showOuterRing: true, 
                showTicks: true, 
                tickStyle: VolumeConstants.TICK_STYLE.MIN_MAX, 
                majorTickInterval: VolumeConstants.MAJOR_INTERVAL.MIN_MID_MAX, 
                tickMargin: 0, 
                tickSizeBonus: 0, 
                showDialMarker: true, 
                markerStyle: VolumeConstants.MARKER_STYLE.LINE, 
                sweepRange: 280, 
                volumeScalingMode: 0 
            } 
        },
        { name: 'Vintage Hi-Fi',   bg: [30, 28, 25],    knob: [88, 82, 70],    inner: [115, 108, 95],  tick: [210, 195, 160], marker: [255, 120, 45],  settings: { bgMode: VolumeConstants.BG_MODE.BRUSHED, dialMode: VolumeConstants.DIAL_MODE.CONCENTRIC } },
        { name: 'Accuphase Gold',  bg: [32, 28, 24],    knob: [95, 88, 72],    inner: [125, 118, 98],  tick: [230, 210, 160], marker: [255, 60, 60],   settings: { bgMode: VolumeConstants.BG_MODE.SATIN, dialMode: VolumeConstants.DIAL_MODE.BEADBLAST } },
        
        // --- 5 Built-in Pastel Color Themes ---
        { 
            name: 'Pastel Rose',     
            bg: [224, 210, 215], knob: [242, 226, 230], inner: [230, 214, 219], 
            tick: [128, 102, 110], marker: [235, 90, 125],   
            settings: { bgMode: VolumeConstants.BG_MODE.SATIN, dialMode: VolumeConstants.DIAL_MODE.SOLID, showHighlight: true, dialLightStyle: VolumeConstants.LIGHT_STYLE.SPOTLIGHT } 
        },
        { 
            name: 'Pastel Mint',     
            bg: [206, 222, 214], knob: [224, 240, 232], inner: [212, 228, 220], 
            tick: [95, 118, 108],  marker: [50, 185, 140],   
            settings: { bgMode: VolumeConstants.BG_MODE.SATIN, dialMode: VolumeConstants.DIAL_MODE.SOLID, showHighlight: true, dialLightStyle: VolumeConstants.LIGHT_STYLE.SPOTLIGHT } 
        },
        { 
            name: 'Pastel Sky',      
            bg: [208, 218, 228], knob: [226, 236, 246], inner: [214, 224, 234], 
            tick: [96, 112, 128],  marker: [70, 155, 235],   
            settings: { bgMode: VolumeConstants.BG_MODE.SATIN, dialMode: VolumeConstants.DIAL_MODE.SOLID, showHighlight: true, dialLightStyle: VolumeConstants.LIGHT_STYLE.SPOTLIGHT } 
        },
        { 
            name: 'Pastel Lavender', 
            bg: [216, 210, 228], knob: [234, 228, 246], inner: [222, 216, 234], 
            tick: [108, 98, 126],  marker: [165, 110, 235],  
            settings: { bgMode: VolumeConstants.BG_MODE.SATIN, dialMode: VolumeConstants.DIAL_MODE.SOLID, showHighlight: true, dialLightStyle: VolumeConstants.LIGHT_STYLE.SPOTLIGHT } 
        },
        { 
            name: 'Pastel Peach',    
            bg: [228, 212, 202], knob: [246, 230, 220], inner: [234, 218, 208], 
            tick: [128, 104, 92],  marker: [255, 120, 80],   
            settings: { bgMode: VolumeConstants.BG_MODE.SATIN, dialMode: VolumeConstants.DIAL_MODE.SOLID, showHighlight: true, dialLightStyle: VolumeConstants.LIGHT_STYLE.SPOTLIGHT } 
        }
    ];

    #themes = [];
    #themeMap = new Map();
    #customThemes = [];
    
    draftTheme = { 
        name: 'Custom', 
        bg: GdiUtils.colour(32, 32, 32), 
        knob: GdiUtils.colour(80, 80, 80), 
        inner: GdiUtils.colour(50, 50, 50), 
        tick: GdiUtils.colour(160, 160, 160), 
        marker: GdiUtils.colour(255, 180, 180) 
    };
    draftBaseTheme = null;

    constructor() {
        for (const d of ThemeManager.BUILTIN_DEFS) {
            const t = this.makeTheme(d.name, d.bg, d.knob, d.inner, d.tick, d.marker, d.settings || null);
            this.#themes.push(t);
            this.#themeMap.set(t.name, t);
        }
    }

    get themes() { return this.#themes; }
    get customThemes() { return this.#customThemes; }
    
    updateDraft(key, packed) { 
        this.draftTheme[key] = (Number(packed) >>> 0); 
        this.saveDraftToProperties();
    }
    
    seedDraftFromTheme(theme) {
        if (!theme) return;
        const baseName = theme.name || 'Custom Theme';
        this.draftTheme.name = (!theme.custom && !baseName.endsWith(' (Custom)')) ? `${baseName} (Custom)` : baseName;
        this.draftTheme.bg = (theme.bg >>> 0);
        this.draftTheme.knob = (theme.knob >>> 0);
        this.draftTheme.inner = (theme.inner >>> 0);
        this.draftTheme.tick = (theme.tick >>> 0);
        this.draftTheme.marker = (theme.marker >>> 0);
        this.draftBaseTheme = theme.name;
        this.saveDraftToProperties();
    }

    saveDraftToProperties() {
        try {
            window.SetProperty('VolumeKnob.DraftTheme', JSON.stringify(this.draftTheme));
        } catch {}
    }

    loadDraftFromProperties() {
        try {
            const raw = window.GetProperty('VolumeKnob.DraftTheme', null);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    Object.assign(this.draftTheme, parsed);
                }
            }
        } catch {}
    }

    saveCustomThemesToProperties(propertyManager = null) {
        try {
            const arr = this.#customThemes.map(t => this.#themeToJson(t, propertyManager));
            window.SetProperty('VolumeKnob.CustomThemes', JSON.stringify(arr));
        } catch {}
    }

    loadCustomThemesFromProperties() {
        try {
            const raw = window.GetProperty('VolumeKnob.CustomThemes', null);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                for (let i = 0; i < parsed.length; i++) {
                    const d = parsed[i];
                    if (!d || !d.name) continue;
                    const t = this.makeTheme(d.name, d.bg, d.knob, d.inner, d.tick, d.marker, d.settings || null);
                    t.custom = true;
                    this.addOrUpdate(t, false);
                }
            }
        } catch {}
    }

    makeTheme(name, bg, knob, inner, tick, marker, settings = null) {
        const pack = (v) => Array.isArray(v) 
            ? GdiUtils.colour(GdiUtils.clamp(Number(v[0])||0, 0, 255), GdiUtils.clamp(Number(v[1])||0, 0, 255), GdiUtils.clamp(Number(v[2])||0, 0, 255))
            : (Number(v) >>> 0);

        return { 
            name: String(name).trim(), 
            bg: pack(bg), knob: pack(knob), inner: pack(inner), tick: pack(tick), marker: pack(marker), 
            custom: false, 
            settings: settings ? { ...settings } : null 
        };
    }

    get(name) { return this.#themeMap.get(name) || this.#themes[0]; }
    has(name) { return this.#themeMap.has(name); }
    names()   { return this.#themes.map(t => t.name); }
    isBuiltin(name) { return ThemeManager.BUILTIN_DEFS.some(b => b.name === name); }

    removeCustom(name, propertyManager = null) {
        const t = this.#themeMap.get(name);
        if (!t) return { ok: false, error: `Theme "${name}" not found.` };
        if (!t.custom) return { ok: false, error: `Theme "${name}" is not a custom theme.` };
        
        const iList = this.#themes.indexOf(t);
        if (iList !== -1) this.#themes.splice(iList, 1);
        const iCustom = this.#customThemes.indexOf(t);
        if (iCustom !== -1) this.#customThemes.splice(iCustom, 1);
        this.#themeMap.delete(name);
        this.saveCustomThemesToProperties(propertyManager);
        return { ok: true, name };
    }

    addOrUpdate(t, persist = true, propertyManager = null) {
        const name = t.name;
        if (this.#themeMap.has(name)) {
            const oldTheme = this.#themeMap.get(name);
            const idx = this.#themes.indexOf(oldTheme);
            if (idx !== -1) this.#themes[idx] = t;
            const ci = this.#customThemes.indexOf(oldTheme);
            if (ci !== -1) {
                this.#customThemes[ci] = t;
            } else {
                this.#customThemes.push(t);
            }
        } else {
            this.#themes.push(t);
            this.#customThemes.push(t);
        }
        this.#themeMap.set(name, t);
        if (persist) this.saveCustomThemesToProperties(propertyManager);
    }

    setPreview(t) { this.#themeMap.set('~Preview', t); }
    clearPreview() {
        const p = this.#themeMap.get('~Preview');
        if (p) {
            const idx = this.#themes.indexOf(p);
            if (idx !== -1) this.#themes.splice(idx, 1);
            this.#themeMap.delete('~Preview');
        }
        return p;
    }

    loadFromFile(filePath, propertyManager, applySettings = true, state = null) {
        if (!filePath?.trim()) return { ok: false, error: 'No file path given.' };
        const cleanPath = GdiUtils.sanitizePath(filePath);
        try {
            if (!utils.IsFile(cleanPath)) return { ok: false, error: `File not found:\n${cleanPath}` };
            const raw = (typeof utils.ReadUTF8 === 'function') ? utils.ReadUTF8(cleanPath) : utils.ReadTextFile(cleanPath);
            if (!raw?.trim()) return { ok: false, error: `JSON file is empty or unreadable:\n${cleanPath}` };
            return this.#parseAndRegister(raw, cleanPath, propertyManager, applySettings, state);
        } catch (e) { 
            return { ok: false, error: `File read error:\n${e.message || e}` }; 
        }
    }

    #parseAndRegister(jsonText, sourceLabel, propertyManager, applySettings, state = null) {
        let parsed;
        try { parsed = JSON.parse(jsonText); } catch (e) { return { ok: false, error: `JSON parse error: ${e.message || e}` }; }

        let themeArray = null;
        let settingsObj = null;

        if (Array.isArray(parsed)) { themeArray = parsed; } 
        else if (typeof parsed === 'object' && parsed !== null) {
            if (parsed.settings && typeof parsed.settings === 'object') settingsObj = parsed.settings;
            if (Array.isArray(parsed.customThemes)) themeArray = parsed.customThemes;
            else if (Array.isArray(parsed.themes)) themeArray = parsed.themes;
            else if (parsed.name && parsed.bg) themeArray = [parsed];
        } else { 
            return { ok: false, error: 'JSON must be an object with settings/themes or an array of themes.' }; 
        }

        let added = 0, updated = 0, errors = [];
        if (themeArray) {
            for (let i = 0; i < themeArray.length; i++) {
                const d = themeArray[i];
                const valid = this.#validateThemeDef(d, i);
                if (valid !== true) { errors.push(valid); continue; }
                const name = String(d.name).trim();
                if (name === '~Preview' || this.isBuiltin(name)) continue;

                const t = this.makeTheme(name, d.bg, d.knob, d.inner, d.tick, d.marker, d.settings || null);
                t.custom = true;
                if (this.#themeMap.has(name)) {
				const oldTheme = this.#themeMap.get(name);
				const idx = this.#themes.indexOf(oldTheme);
				if (idx !== -1) this.#themes[idx] = t;
				const ci = this.#customThemes.indexOf(oldTheme);
				if (ci !== -1) this.#customThemes[ci] = t;
				else this.#customThemes.push(t);
				this.#themeMap.set(name, t);
				updated++;
                } else {
                    this.#themes.push(t);
                    this.#themeMap.set(name, t);
                    this.#customThemes.push(t);
                    added++;
                }
            }
            this.saveCustomThemesToProperties(propertyManager);
        }

        let settingsCount = 0;
        if (applySettings && settingsObj) {
            propertyManager.applySettings(settingsObj);
            if (typeof settingsObj.theme === 'string' && this.#themeMap.has(settingsObj.theme)) {
                propertyManager.setTheme(settingsObj.theme, this, false, state);
            }
            settingsCount = Object.keys(settingsObj).length;
        }

        if (propertyManager?.values?.theme === 'Custom' && this.#themeMap.has('Custom')) {
            this.seedDraftFromTheme(this.#themeMap.get('Custom'));
        }

        return { 
            ok: ((added + updated > 0) || settingsCount > 0), 
            count: added + updated, 
            settingsCount, 
            error: errors.length ? errors.join('\n') : null, 
            summary: `Loaded from: ${sourceLabel}\nThemes added: ${added}  updated: ${updated}${settingsCount ? `\nSettings restored: ${settingsCount}` : ''}` 
        };
    }

    #validateThemeDef(d, idx) {
        if (typeof d !== 'object' || d === null) return `Entry ${idx}: not an object.`;
        if (!d.name || typeof d.name !== 'string' || !d.name.trim()) return `Entry ${idx}: missing name.`;
        const checkChannel = (name, arr) => {
            if (!Array.isArray(arr) || arr.length < 3) return `"${name}" must be an [r,g,b] array.`;
            for (let ci = 0; ci < 3; ci++) { const v = arr[ci]; if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 255) return `"${name}" invalid color channel.`; }
            return null;
        };
        for (const key of ['bg', 'knob', 'inner', 'tick', 'marker']) { const err = checkChannel(key, d[key]); if (err) return `Entry ${idx}: ${err}`; }
        return true;
    }

    saveToFile(filePath, mode, propertyManager) {
        if (!filePath?.trim()) return { ok: false, error: 'No file path given.' };
        const cleanPath = GdiUtils.sanitizePath(filePath);

        const currentSettings = propertyManager.getExportSettings();

        let payload, themeCount = 0;
        if (mode === '*') {
            payload = { settings: currentSettings, themes: this.#themes.map(t => this.#themeToJson(t, propertyManager)) };
            themeCount = this.#themes.length;
        } else if (mode === 'template') {
            payload = ThemeManager.BUILTIN_DEFS.map(d => ({ name: d.name, bg: d.bg, knob: d.knob, inner: d.inner, tick: d.tick, marker: d.marker, settings: d.settings || null }));
            themeCount = payload.length;
        } else {
            payload = { settings: currentSettings, customThemes: this.#customThemes.map(t => this.#themeToJson(t, propertyManager)) };
            themeCount = this.#customThemes.length;
        }

        try {
            if (typeof utils.WriteTextFile === 'function') {
                const parent = GdiUtils.sanitizePath(cleanPath.replace(/[\\\/][^\\\/]*$/, ''));
                if (parent && parent !== cleanPath) {
                    try { utils.CreateFolder(parent); } catch {}
                }
                const ok = utils.WriteTextFile(cleanPath, JSON.stringify(payload, null, 2), false);
                if (!ok) return { ok: false, error: `Write failed to:\n${cleanPath}` };
            }
            return { ok: true, count: themeCount, path: cleanPath };
        } catch (e) { 
            return { ok: false, error: String(e.message || e) }; 
        }
    }

    #themeToJson(theme, propertyManager) {
        const out = { name: theme.name, bg: GdiUtils.toRGB(theme.bg), knob: GdiUtils.toRGB(theme.knob), inner: GdiUtils.toRGB(theme.inner), tick: GdiUtils.toRGB(theme.tick), marker: GdiUtils.toRGB(theme.marker) };
        if (theme.settings) { out.settings = { ...theme.settings }; } 
        else if (theme.custom && propertyManager?.values) {
            out.settings = propertyManager.getStyleSettings();
        }
        return out;
    }

    exportTemplate(filePath, propertyManager) { return this.saveToFile(filePath, 'template', propertyManager); }
}

// ============================================================================================
// 5. PROPERTY MANAGER
// ============================================================================================
class SettingsSchema {
    static FIELDS = [
        { key: 'theme',             prop: 'VolumeKnob.ThemeName',          type: 'str',   def: 'Classic Gray', group: 'core' },
        { key: 'customThemeFile',   prop: 'VolumeKnob.ThemeFilePath',      type: 'path',  def: VolumeConstants.DEFAULT_THEME_FILE, group: 'core', resetAll: true },
        { key: 'currentLcdTheme',   prop: 'VolumeKnob.CurrentLcdTheme',    type: 'str',   def: 'Pioneer Amber', group: 'core', exportable: true, resetAll: true },

        { key: 'bgMode',            prop: 'VolumeKnob.BgMode',             type: 'int',   def: VolumeConstants.BG_MODE.SOLID, min: 0, max: 4, group: 'style' },
        { key: 'customBgImage',     prop: 'VolumeKnob.CustomBgImage',      type: 'image', def: '', group: 'style', resetAll: true, noVisualReset: true },
        { key: 'dialMode',          prop: 'VolumeKnob.DialMode',           type: 'int',   def: VolumeConstants.DIAL_MODE.SOLID, min: 0, max: 8, group: 'style' },
        { key: 'customDialImage',   prop: 'VolumeKnob.CustomDialImage',    type: 'image', def: '', group: 'style', resetAll: true, noVisualReset: true },
        { key: 'spinDialImage',     prop: 'VolumeKnob.SpinDialImage',      type: 'bool',  def: true,  group: 'style' },
        { key: 'showHighlight',     prop: 'VolumeKnob.ShowHighlight',      type: 'bool',  def: false, group: 'style' },
        { key: 'dialLightStyle',    prop: 'VolumeKnob.DialLightStyle',     type: 'int',   def: VolumeConstants.LIGHT_STYLE.AUTO, min: 0, max: 10, group: 'style' },
        { key: 'dialLightStrength', prop: 'VolumeKnob.DialLightStrength',  type: 'int',   def: 100,   min: 0, max: 200, group: 'style' },
        { key: 'dialLightAngle',    prop: 'VolumeKnob.DialLightAngle',     type: 'int',   def: 315,   min: 0, max: 359, group: 'style' },
        { key: 'showDropShadow',    prop: 'VolumeKnob.ShowDropShadow',     type: 'bool',  def: true,  group: 'style' },
        { key: 'showOuterRing',     prop: 'VolumeKnob.ShowOuterRing',      type: 'bool',  def: true,  group: 'style' },
        { key: 'showTicks',         prop: 'VolumeKnob.ShowTicks',          type: 'bool',  def: true,  group: 'style' },
        { key: 'tickStyle',         prop: 'VolumeKnob.TickStyle',          type: 'int',   def: 1,     min: 0, max: 7, group: 'style' },
        { key: 'majorTickInterval', prop: 'VolumeKnob.MajorTickInterval',  type: 'int',   def: VolumeConstants.MAJOR_INTERVAL.QUARTERS, min: 0, max: 3, group: 'style' },
        { key: 'tickMargin',        prop: 'VolumeKnob.TickMargin',         type: 'int',   def: 0,     min: 0, max: 30, group: 'style' },
        { key: 'tickSizeBonus',     prop: 'VolumeKnob.TickSizeBonus',      type: 'int',   def: 0,     min: 0, max: 100, group: 'style' },
        { key: 'showDialMarker',    prop: 'VolumeKnob.ShowDialMarker',     type: 'bool',  def: true,  group: 'style' },
        { key: 'markerStyle',       prop: 'VolumeKnob.MarkerStyle',        type: 'int',   def: 0,     min: 0, max: 10, group: 'style' },
        { key: 'sweepRange',        prop: 'VolumeKnob.SweepRange',         type: 'int',   def: 290,   min: 270, max: 300, group: 'style',
          onApply: (v) => { VolumeConfig.sweepRangeDeg = v; } },
        { key: 'volumeScalingMode', prop: 'VolumeKnob.VolumeScalingMode',  type: 'int',   def: 0,     min: 0, max: 1, group: 'style' },
        { key: 'levelArc',          prop: 'VolumeKnob.LevelArc',           type: 'bool',  def: false, group: 'style' },
        { key: 'litTicks',          prop: 'VolumeKnob.LitTicks',           type: 'bool',  def: false, group: 'style' },
        { key: 'glowSource',        prop: 'VolumeKnob.GlowSource',         type: 'enum',  def: 'theme', values: ['theme', 'lcd', 'custom'], group: 'style' },
        { key: 'customGlowColor',   prop: 'VolumeKnob.CustomGlowColor',    type: 'color', def: GdiUtils.colour(255, 180, 180), group: 'style' },

        { key: 'syncLcdTheme',      prop: 'VolumeKnob.SyncLcdTheme',       type: 'bool',  def: true,  group: 'panel' },
        { key: 'showLcdSyncBtn',    prop: 'VolumeKnob.ShowLcdSyncBtn',     type: 'bool',  def: true,  group: 'panel' },
        { key: 'syncBtnPosition',   prop: 'VolumeKnob.SyncBtnPosition',    type: 'enum',  def: 'top', values: ['top', 'bottom'], group: 'panel' },
        { key: 'syncBtnShowText',   prop: 'VolumeKnob.SyncBtnShowText',    type: 'bool',  def: false, group: 'panel' },
        { key: 'lcdBtnSide',        prop: 'VolumeKnob.LcdBtnSide2',        type: 'enum',  def: 'right', values: ['left', 'right'], group: 'panel' }
    ];

    static keys()     { const o = {}; for (const f of this.FIELDS) o[f.key] = f.prop; return o; }
    static defaults() { const o = {}; for (const f of this.FIELDS) o[f.key] = f.def;  return o; }

    static clampInt(val, min, max) {
        const n = parseInt(val, 10);
        return isNaN(n) ? min : GdiUtils.clamp(n, min, max);
    }

    static parseBool(v) {
        if (typeof v === 'boolean') return v;
        if (typeof v === 'string') return v !== 'false' && v !== '0' && v !== '';
        return Boolean(v);
    }

    static coerce(f, raw) {
        switch (f.type) {
            case 'int': {
                const v = this.clampInt(raw, f.min, f.max);
                return (f.key === 'dialMode' && v === 7) ? f.def : v;
            }
            case 'bool': return this.parseBool(raw);
            case 'enum': return f.values.includes(raw) ? raw : f.def;
            case 'color': {
                if (Array.isArray(raw) && raw.length >= 3) {
                    return GdiUtils.colour(GdiUtils.clamp(Number(raw[0]) || 0, 0, 255), GdiUtils.clamp(Number(raw[1]) || 0, 0, 255), GdiUtils.clamp(Number(raw[2]) || 0, 0, 255));
                }
                const n = Number(raw);
                return Number.isFinite(n) ? ((0xFF000000 | n) >>> 0) : f.def;
            }
            case 'image': {
                let v = String(raw ?? '').trim().replace(/(^"|"$)/g, '');
                const sep = Math.max(v.lastIndexOf('\\'), v.lastIndexOf('/'));
                if (sep !== -1) v = v.substring(sep + 1);
                return v;
            }
            case 'path': {
                let v = GdiUtils.sanitizePath(String(raw || ''));
                if (v) {
                    const rawParent = v.replace(/[\\\/][^\\\/]*$/, '');
                    const parent = GdiUtils.sanitizePath(rawParent);
                    if (!parent || rawParent === v || !utils.IsDirectory(parent)) v = '';
                }
                return v || f.def;
            }
            default: return String(raw);
        }
    }
}

class DialPresets {
    static #D = VolumeConstants.DIAL_MODE;
    static #L = VolumeConstants.LIGHT_STYLE;
    static #M = VolumeConstants.MARKER_STYLE;

    static #byMode() {
        const D = this.#D, L = this.#L, M = this.#M;
        return {
            [D.SOLID]:      { highlight: false, light: L.SPOTLIGHT },
            [D.CONCENTRIC]: { highlight: true,  light: L.ANISOTROPIC },
            [D.KNURLED]:    { highlight: true,  light: L.STUDIO_SHEEN, marker: M.SHORT },
            [D.BEADBLAST]:  { highlight: true,  light: L.SPOTLIGHT },
            [D.SANDBLAST]:  { highlight: false, light: L.SPOTLIGHT, spin: false },
            [D.STUDIO]:     { highlight: false, light: L.SPOTLIGHT, spin: false },
            [D.CARBON]:     { highlight: true,  light: L.ANISOTROPIC }
        };
    }

    static normaliseMarker(properties, mode) {
        const M = this.#M, cur = properties.values.markerStyle;
        if (mode === this.#D.STUDIO) {
            if (cur !== M.ARROW && cur !== M.VSHORT) properties.set('markerStyle', M.VSHORT);
        } else if (cur === M.VSHORT) {
            properties.set('markerStyle', M.LINE);
        }
    }

    static apply(properties, mode) {
        properties.set('dialMode', mode);
        const p = this.#byMode()[mode];
        if (p) {
            if (p.marker !== undefined) properties.set('markerStyle', p.marker);
            properties.set('showHighlight', p.highlight);
            properties.set('dialLightStyle', p.light);
            if (p.spin !== undefined) properties.set('spinDialImage', p.spin);
        }
        this.normaliseMarker(properties, mode);
    }

    static randomLook(mode, rand) {
        const D = this.#D, L = this.#L, M = this.#M;
        let highlight = true, lights = [L.SPOTLIGHT];
        if (mode === D.KNURLED)         { lights = [L.STUDIO_SHEEN, L.STUDIO_ANISO]; }
        else if (mode === D.BEADBLAST)  { /* spotlight */ }
        else if (mode === D.SANDBLAST || mode === D.STUDIO) { highlight = false; }
        else if (mode === D.CONCENTRIC) { lights = [L.ANISOTROPIC, L.ANISO_BEVEL, L.STUDIO_ANISO, L.SPUN_METAL]; }
        else if (mode === D.CARBON)     { lights = [L.ANISOTROPIC, L.ANISO_BEVEL, L.CROSS]; }
        else if (mode === D.SOLID) {
            if (Math.random() < 0.15) lights = [L.STUDIO_SHEEN, L.STUDIO_ANISO, L.SPUN_METAL];
            else { highlight = false; lights = [L.SPOTLIGHT, L.CONTOUR_DOME, L.CONCAVE_BOWL]; }
        }
        const light = lights[rand(0, lights.length - 1)];

        let markers;
        if (mode === D.STUDIO) markers = [M.ARROW, M.VSHORT];
        else if (mode === D.KNURLED || (mode === D.CONCENTRIC && (light === L.ANISO_BEVEL || light === L.STUDIO_ANISO))) {
            markers = [M.SHORT, M.ARROW, M.CIRCLE, M.LED_DOT, M.GLOW_LINE];
        } else {
            markers = [M.LINE, M.CIRCLE, M.ARROW, M.SHORT, M.BEVEL_WEDGE, M.BEVEL_SLOT, M.FULL_LINE, M.LED_DOT, M.GLOW_LINE, M.GROOVE];
        }
        return { highlight, light, markers };
    }
}

class PropertyManager {
    #saveTimer = null;
    #isBatching = false;
    
    keys = SettingsSchema.keys();
    defaults = SettingsSchema.defaults();

    values = {};
    lastFinalizedTheme = '';

    constructor(themeManager) {
        let initialTheme = window.GetProperty(this.keys.theme, null);
        if (initialTheme === null) {
            const legacyIdx = window.GetProperty('VolumeKnob.Theme', null);
            initialTheme = (typeof legacyIdx === 'number' && themeManager.themes[legacyIdx]) ? themeManager.themes[legacyIdx].name : this.defaults.theme;
        }

        this.values = {};
        for (const f of SettingsSchema.FIELDS) {
            if (f.key === 'theme') { this.values.theme = String(initialTheme); continue; }
            this.values[f.key] = SettingsSchema.coerce(f, window.GetProperty(f.prop, f.def));
        }

        this.lastFinalizedTheme = (this.values.theme !== '~Preview' && this.values.theme !== 'Custom') ? this.values.theme : this.defaults.theme;
    }

    clampInt(val, min, max) { return SettingsSchema.clampInt(val, min, max); }

    parseBool(v) { return SettingsSchema.parseBool(v); }

    getStyleSettings() {
        const out = {};
        for (const f of SettingsSchema.FIELDS) if (f.group === 'style') out[f.key] = this.values[f.key];
        return out;
    }

    getExportSettings() {
        const out = { theme: this.values.theme !== '~Preview' ? this.values.theme : this.lastFinalizedTheme };
        for (const f of SettingsSchema.FIELDS) {
            if (f.group === 'style' || f.group === 'panel' || f.exportable) out[f.key] = this.values[f.key];
        }
        return out;
    }

    beginBatch() {
        this.#isBatching = true;
    }

    endBatch() {
        this.#isBatching = false;
        this.persistSync();
    }

    set(name, value, callback = null) {
        this.values[name] = value;
        const propKey = this.keys[name];
        if (propKey) {
            window.SetProperty(propKey, value);
        }
        if (!this.#isBatching && typeof callback === 'function') {
            this.#persistSoon(callback);
        }
    }

    #persistSoon(callback) {
        if (this.#saveTimer) window.ClearTimeout(this.#saveTimer);
        this.#saveTimer = window.SetTimeout(() => { 
            this.#saveTimer = null; 
            if (callback) callback(); 
        }, 250);
    }

    persistSync(themeManager = null) {
        if (this.#saveTimer) { 
            window.ClearTimeout(this.#saveTimer); 
            this.#saveTimer = null; 
        }
        if (themeManager) {
            try { 
                const path = this.values.customThemeFile; 
                if (path?.trim()) themeManager.saveToFile(path.trim(), null, this); 
            } catch {}
        }
    }

    applySettings(s) {
        if (!s || typeof s !== 'object') return;
        const has = (key) => Object.prototype.hasOwnProperty.call(s, key);

        this.beginBatch();
        try {
            for (const f of SettingsSchema.FIELDS) {
                if (f.group !== 'style' && f.group !== 'panel' && !f.exportable) continue;
                if (f.type === 'image' ? typeof s[f.key] !== 'string' : !has(f.key)) continue;
                const v = SettingsSchema.coerce(f, s[f.key]);
                this.set(f.key, v);
                if (f.onApply) f.onApply(v);
            }
        } finally {
            this.endBatch();
        }
    }

    setTheme(name, themeManager, restoreThemeSettings = true, state = null) {
        if (name !== '~Preview' && name !== 'Custom') {
            this.lastFinalizedTheme = name;
            const t = themeManager.get(name);
            if (t) themeManager.seedDraftFromTheme(t);
        }
        this.set('theme', name);
        if (restoreThemeSettings) {
            const t = themeManager.get(name);
            if (t && t.settings) {
                this.applySettings(t.settings);
                if (state) {
                    state.invalidateGeometry();
                    VolumeEngine.syncFromFoobar(state, this.values);
                }
            }
        }
    }

    resetVisuals(themeManager, state = null) {
        this.beginBatch();
        try {
            this.setTheme(this.defaults.theme, themeManager, true, state);
            for (const f of SettingsSchema.FIELDS) {
                if ((f.group === 'style' || f.group === 'panel') && !f.noVisualReset) {
                    this.set(f.key, f.def);
                    if (f.onApply) f.onApply(f.def);
                }
            }
        } finally {
            this.endBatch();
        }
    }

    resetAll(themeManager, state = null) {
        this.beginBatch();
        try {
            this.resetVisuals(themeManager, state);
            for (const f of SettingsSchema.FIELDS) {
                if (f.resetAll) {
                    this.set(f.key, f.def);
                    if (f.onApply) f.onApply(f.def);
                }
            }
        } finally {
            this.endBatch();
        }
    }
}

// ============================================================================================
// 6. HIGH-RES BACKGROUND RENDERER
// ============================================================================================
class BackgroundRenderer {
    #bitmap = null;
    #key = '';
    #sandblastTile = null;
    #satinTile = null;
    #carbonTiles = new Map();

    // Twill weave tile for the Carbon Fibre dial (cell = strand width in px)
    getCarbonTile(cell) {
        const c = Math.max(3, cell | 0);
        const hit = this.#carbonTiles.get(c);
        if (hit) return hit;
        const n = c * 2;
        let img = null;
        try {
            img = gdi.CreateImage(n, n);
            const g = img.GetGraphics();
            try {
                g.FillSolidRect(0, 0, n, n, GdiUtils.setAlpha(GdiUtils.colour(0, 0, 0), 0));
                for (let y = 0; y < n; y++) {
                    for (let x = 0; x < n; x++) {
                        const warp = ((x < c) === (y < c));
                        const u = warp ? (x % c) : (y % c);
                        const v = Math.sin(((u + 0.5) / c) * Math.PI);
                        const hi = Math.round(v * 46), lo = Math.round((1 - v) * 70);
                        if (lo > 0) g.FillSolidRect(x, y, 1, 1, GdiUtils.setAlpha(GdiUtils.colour(0, 0, 0), lo));
                        if (hi > 0) g.FillSolidRect(x, y, 1, 1, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), hi));
                    }
                }
            } finally {
                img.ReleaseGraphics(g);
            }
            this.#carbonTiles.set(c, img);
            return img;
        } catch {
            if (img?.Dispose) { try { img.Dispose(); } catch {} }
            return null;
        }
    }

    getSandblastTile() {
        if (this.#sandblastTile) return this.#sandblastTile;
        const size = 256;
        let img = null;
        try {
            img = gdi.CreateImage(size, size);
            const g = img.GetGraphics();
            try {
                g.FillSolidRect(0, 0, size, size, GdiUtils.setAlpha(GdiUtils.colour(0, 0, 0), 0));
                let seed = 777111;
                const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

                for (let i = 0; i < 24000; i++) {
                    const x = Math.floor(rnd() * size);
                    const y = Math.floor(rnd() * size);
                    const isLight = rnd() > 0.48;
                    const a = Math.floor(rnd() * 7) + 2;
                    g.FillSolidRect(x, y, 1, 1, GdiUtils.setAlpha(isLight ? GdiUtils.colour(255, 255, 255) : GdiUtils.colour(0, 0, 0), a));
                }
            } finally {
                img.ReleaseGraphics(g);
            }
            this.#sandblastTile = img;
            return this.#sandblastTile;
        } catch {
            if (img?.Dispose) { try { img.Dispose(); } catch {} }
            return null;
        }
    }

    getSatinTile() {
        if (this.#satinTile) return this.#satinTile;
        const size = 128;
        let img = null;
        try {
            img = gdi.CreateImage(size, size);
            const g = img.GetGraphics();
            try {
                g.FillSolidRect(0, 0, size, size, GdiUtils.setAlpha(GdiUtils.colour(0, 0, 0), 0));
                let seed = 889911;
                const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

                for (let y = 0; y < size; y++) {
                    for (let x = 0; x < size; x++) {
                        const n = (rnd() + rnd() - 1.0);
                        if (n > 0.04) {
                            g.FillSolidRect(x, y, 1, 1, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), Math.round(n * 16)));
                        } else if (n < -0.04) {
                            g.FillSolidRect(x, y, 1, 1, GdiUtils.setAlpha(GdiUtils.colour(0, 0, 0), Math.round(-n * 18)));
                        }
                    }
                }
            } finally {
                img.ReleaseGraphics(g);
            }
            this.#satinTile = img;
            return this.#satinTile;
        } catch {
            if (img?.Dispose) { try { img.Dispose(); } catch {} }
            return null;
        }
    }

    draw(gr, w, h, bgMode, customImgPath, theme, assetManager) {
        if (w <= 0 || h <= 0) return;

        if (bgMode === VolumeConstants.BG_MODE.SOLID) { 
            gr.FillSolidRect(0, 0, w, h, theme.bg); 
            return; 
        }

        const key = `${w}|${h}|${bgMode}|${theme.bg}|${customImgPath}`;
        if (this.#bitmap && this.#key === key) { 
            gr.SetInterpolationMode(2);
            gr.DrawImage(this.#bitmap, 0, 0, w, h, 0, 0, w, h); 
            return; 
        }

        this.invalidate();
        this.#key = key;

        let bmp = null;
        try {
            bmp = gdi.CreateImage(w, h);
            const g = bmp.GetGraphics();
            try {
                g.SetSmoothingMode(2);

                if (bgMode === VolumeConstants.BG_MODE.BRUSHED) {
                    g.FillSolidRect(0, 0, w, h, theme.bg);
                    let seed = 48271;
                    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

                    for (let y = 0; y < h; y++) {
                        const isLight = rnd() > 0.50;
                        const a = Math.floor(rnd() * 5) + 1;
                        g.FillSolidRect(0, y, w, 1, GdiUtils.setAlpha(isLight ? GdiUtils.colour(255, 255, 255) : GdiUtils.colour(0, 0, 0), a));
                    }
                    const scratchCount = Math.max(160, Math.floor(h * 2.8));
                    for (let i = 0; i < scratchCount; i++) {
                        const y = Math.floor(rnd() * h);
                        const startX = Math.floor(rnd() * (w * 0.40));
                        const len = Math.floor((0.30 + rnd() * 0.70) * w);
                        const drawW = Math.min(len, w - startX);
                        if (drawW <= 0) continue;
                        const isLight = rnd() > 0.47;
                        const a = Math.floor(rnd() * 6) + 2;
                        g.FillSolidRect(startX, y, drawW, 1, GdiUtils.setAlpha(isLight ? GdiUtils.colour(255, 255, 255) : GdiUtils.colour(0, 0, 0), a));
                    }
                    for (let x = 0; x < w; x++) {
                        const nx = x / w;
                        const band1 = Math.exp(-((nx - 0.38) ** 2) * 20);
                        const band2 = Math.exp(-((nx - 0.70) ** 2) * 16);
                        const val = (band1 * 12.0) + (band2 * 8.0);
                        const dither = (rnd() - 0.5) * 1.5;
                        const finalVal = Math.round(val + dither);
                        if (finalVal > 0) g.FillSolidRect(x, 0, 1, h, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), Math.min(255, finalVal)));
                        const shadow = Math.exp(-((nx - 0.92) ** 2) * 14);
                        const shadowVal = Math.round((shadow * 12) + dither);
                        if (shadowVal > 0) g.FillSolidRect(x, 0, 1, h, GdiUtils.setAlpha(GdiUtils.colour(0, 0, 0), Math.min(255, shadowVal)));
                    }
                    g.FillSolidRect(0, 0, w, 1, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), 45));
                    g.FillSolidRect(0, h - 1, w, 1, GdiUtils.setAlpha(GdiUtils.colour(0, 0, 0), 60));

                } else if (bgMode === VolumeConstants.BG_MODE.SANDBLAST) {
                    g.FillSolidRect(0, 0, w, h, theme.bg);
                    const tile = this.getSandblastTile();
                    if (tile) {
                        for (let y = 0; y < h; y += 256) {
                            for (let x = 0; x < w; x += 256) {
                                g.DrawImage(tile, x, y, 256, 256, 0, 0, 256, 256);
                            }
                        }
                    }
                    g.FillSolidRect(0, 0, w, 1, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), 25));
                    g.FillSolidRect(0, h - 1, w, 1, GdiUtils.setAlpha(GdiUtils.colour(0, 0, 0), 45));

                } else if (bgMode === VolumeConstants.BG_MODE.SATIN) {
                    g.FillSolidRect(0, 0, w, h, theme.bg);
                    g.FillGradRect(0, 0, w, h, 90, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), 18), GdiUtils.setAlpha(GdiUtils.colour(0, 0, 0), 22));

                    const tile = this.getSatinTile();
                    if (tile) {
                        for (let y = 0; y < h; y += 128) {
                            for (let x = 0; x < w; x += 128) {
                                g.DrawImage(tile, x, y, 128, 128, 0, 0, 128, 128, 0, 185);
                            }
                        }
                    }

                } else if (bgMode === VolumeConstants.BG_MODE.IMAGE) {
                    const loaded = assetManager.getImage(customImgPath);
                    if (loaded) {
                        g.SetInterpolationMode(7);
                        const scale = Math.max(w / loaded.Width, h / loaded.Height);
                        const renderW = Math.round(loaded.Width * scale);
                        const renderH = Math.round(loaded.Height * scale);
                        const renderX = Math.round((w - renderW) / 2);
                        const renderY = Math.round((h - renderH) / 2);
                        g.DrawImage(loaded, renderX, renderY, renderW, renderH, 0, 0, loaded.Width, loaded.Height);
                    } else { 
                        g.FillSolidRect(0, 0, w, h, theme.bg); 
                    }
                }
            } finally {
                bmp.ReleaseGraphics(g);
            }

            this.#bitmap = bmp;
            bmp = null;
            gr.SetInterpolationMode(2);
            gr.DrawImage(this.#bitmap, 0, 0, w, h, 0, 0, w, h);
        } catch {
            if (bmp?.Dispose) { try { bmp.Dispose(); } catch {} }
            gr.FillSolidRect(0, 0, w, h, theme.bg); 
        }
    }

    invalidate() {
        if (this.#bitmap?.Dispose) { try { this.#bitmap.Dispose(); } catch {} }
        this.#bitmap = null;
        this.#key = '';
    }
    
    cleanup() {
        this.invalidate();
        if (this.#sandblastTile?.Dispose) { try { this.#sandblastTile.Dispose(); } catch {} }
        if (this.#satinTile?.Dispose) { try { this.#satinTile.Dispose(); } catch {} }
        this.#sandblastTile = null;
        this.#satinTile = null;
        for (const t of this.#carbonTiles.values()) { try { t.Dispose(); } catch {} }
        this.#carbonTiles.clear();
    }
}

// ============================================================================================
// 7. SPECULAR & DIAL RENDERER
// ============================================================================================
class DialRenderer {
    #bmpBase = null;
    #bmpLight = null;
    #key = '';

    draw(gr, x, y, size, dialMode, customImgPath, theme, assetManager, bgRenderer, rotationAngleDeg = 0, spinImage = true, lightStyle = 0, lightAngleDeg = 315, lightStrength = 100, showHighlight = true) {
        size = Math.round(size);
        if (size <= 0) return;

        if (dialMode === VolumeConstants.DIAL_MODE.SOLID && (!showHighlight || lightStrength <= 0)) {
            gr.FillEllipse(x, y, size, size, theme.inner);
            return;
        }

        const drawAngle = spinImage ? rotationAngleDeg : 0;
        const strMul = Math.max(0, lightStrength / 100);
        const needLight = Boolean(showHighlight && strMul > 0.01);
        const key = `${size}|${dialMode}|${theme.inner}|${customImgPath}|${lightStyle}|${lightAngleDeg}|${lightStrength}|${showHighlight ? 1 : 0}`;

        if (this.#bmpBase && this.#key === key) {
            gr.SetInterpolationMode(2);
            gr.DrawImage(this.#bmpBase, x, y, size, size, 0, 0, size, size, drawAngle, 255);
            if (needLight && this.#bmpLight) {
                gr.DrawImage(this.#bmpLight, x, y, size, size, 0, 0, size, size, 0, 255);
            }
            return;
        }

        this.invalidate();
        this.#key = key;

        let bmpBase = null, gBase = null;
        let bmpLight = null, gLight = null;
        try {
            bmpBase = gdi.CreateImage(size, size);
            gBase = bmpBase.GetGraphics();
            gBase.SetSmoothingMode(2);

            if (needLight) {
                bmpLight = gdi.CreateImage(size, size);
                gLight = bmpLight.GetGraphics();
                gLight.SetSmoothingMode(2);
            }

            const cx = size / 2;
            const cy = size / 2;
            const R = size / 2;

            let seed = 54321;
            const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

            const lightRad = ((lightAngleDeg % 360 + 360) % 360) * VolumeConstants.DEG2RAD;

            if (dialMode === VolumeConstants.DIAL_MODE.SOLID) {
                gBase.FillSolidRect(0, 0, size, size, theme.inner);

            } else if (dialMode === VolumeConstants.DIAL_MODE.CONCENTRIC) {
                gBase.FillSolidRect(0, 0, size, size, theme.inner);
                const grooveSpacing = Math.max(1.8, size * 0.007);
                const numGrooves = Math.floor(R / grooveSpacing);
                for (let gi = 2; gi <= numGrooves; gi++) {
                    const grR = gi * grooveSpacing;
                    if (grR >= R - 1) continue;
                    const dither = (rnd() - 0.5) * 6;
                    gBase.DrawEllipse(cx - grR, cy - grR, grR * 2, grR * 2, 1, GdiUtils.setAlpha(GdiUtils.colour(0, 0, 0), GdiUtils.clamp(Math.round(18 + dither), 8, 32)));
                    if (grR > 2) gBase.DrawEllipse(cx - (grR - 0.6), cy - (grR - 0.6), (grR - 0.6) * 2, (grR - 0.6) * 2, 1, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), GdiUtils.clamp(Math.round(10 + dither), 4, 22)));
                }

            } else if (dialMode === VolumeConstants.DIAL_MODE.KNURLED) {
                gBase.FillSolidRect(0, 0, size, size, theme.inner);
                const rCollarInner = R * 0.618;
                const fluteCount = 44;
                const fluteAngle = (Math.PI * 2) / fluteCount;
                const subSteps = 7;

                for (let f = 0; f < fluteCount; f++) {
                    const baseA = f * fluteAngle;
                    const isOdd = (f % 2 === 1);

                    for (let s = 0; s < subSteps; s++) {
                        const t = s / (subSteps - 1);
                        const a = baseA + (t - 0.5) * fluteAngle;
                        const sa = Math.sin(a), ca = Math.cos(a);

                        const x1 = cx + sa * rCollarInner, y1 = cy - ca * rCollarInner;
                        const x2 = cx + sa * R,            y2 = cy - ca * R;

                        if (!isOdd) {
                            const shadowA = Math.round((1 - t) * 75);
                            const brightA = Math.round(t * 60);
                            if (shadowA > 0) gBase.DrawLine(x1, y1, x2, y2, 1.5, GdiUtils.setAlpha(GdiUtils.colour(0, 0, 0), shadowA));
                            if (brightA > 0) gBase.DrawLine(x1, y1, x2, y2, 1.5, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), brightA));
                        } else {
                            const brightA = Math.round((1 - t) * 60);
                            const shadowA = Math.round(t * 75);
                            if (brightA > 0) gBase.DrawLine(x1, y1, x2, y2, 1.5, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), brightA));
                            if (shadowA > 0) gBase.DrawLine(x1, y1, x2, y2, 1.5, GdiUtils.setAlpha(GdiUtils.colour(0, 0, 0), shadowA));
                        }
                    }
                    const divA = baseA + fluteAngle * 0.5;
                    gBase.DrawLine(cx + Math.sin(divA) * rCollarInner, cy - Math.cos(divA) * rCollarInner, cx + Math.sin(divA) * R, cy - Math.cos(divA) * R, 1, GdiUtils.setAlpha(GdiUtils.colour(0, 0, 0), 140));
                }

                const trenchW = Math.max(2, Math.round(size * 0.016));
                for (let t = 0; t < trenchW; t++) gBase.DrawEllipse(cx - (rCollarInner - t), cy - (rCollarInner - t), (rCollarInner - t) * 2, (rCollarInner - t) * 2, 1, GdiUtils.setAlpha(GdiUtils.colour(0, 0, 0), Math.round(110 * (1 - t / trenchW))));
                const rimR = rCollarInner - trenchW;
                gBase.DrawEllipse(cx - rimR, cy - rimR, rimR * 2, rimR * 2, 1, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), 50));

                const grooveSpacing = Math.max(1.8, size * 0.007);
                const numGrooves = Math.floor(rimR / grooveSpacing);
                for (let gi = 2; gi <= numGrooves; gi++) {
                    const grR = gi * grooveSpacing;
                    if (grR >= rimR - 1) continue;
                    const dither = (rnd() - 0.5) * 6;
                    gBase.DrawEllipse(cx - grR, cy - grR, grR * 2, grR * 2, 1, GdiUtils.setAlpha(GdiUtils.colour(0, 0, 0), GdiUtils.clamp(Math.round(18 + dither), 8, 32)));
                    if (grR > 2) gBase.DrawEllipse(cx - (grR - 0.6), cy - (grR - 0.6), (grR - 0.6) * 2, (grR - 0.6) * 2, 1, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), GdiUtils.clamp(Math.round(10 + dither), 4, 22)));
                }

            } else if (dialMode === VolumeConstants.DIAL_MODE.BEADBLAST) {
                gBase.FillSolidRect(0, 0, size, size, theme.inner);
                const tile = bgRenderer.getSandblastTile();
                if (tile) {
                    for (let ty = 0; ty < size; ty += 256) {
                        for (let tx = 0; tx < size; tx += 256) gBase.DrawImage(tile, tx, ty, 256, 256, 0, 0, 256, 256);
                    }
                }
                gBase.DrawEllipse(cx - R + 1, cy - R + 1, (R - 1) * 2, (R - 1) * 2, 1.5, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), 65));

            } else if (dialMode === VolumeConstants.DIAL_MODE.SANDBLAST) {
                gBase.FillSolidRect(0, 0, size, size, theme.inner);
                for (let i = 50; i > 0; i--) {
                    let r = (i / 50) * (size * 0.7);
                    gBase.FillEllipse(cx - r - size * 0.15, cy - r - size * 0.15, r * 2, r * 2, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), 1));
                }
                for (let i = 50; i > 0; i--) {
                    let r = (i / 50) * (size * 0.8);
                    gBase.FillEllipse(cx - r + size * 0.15, cy - r + size * 0.15, r * 2, r * 2, GdiUtils.setAlpha(GdiUtils.colour(0, 0, 0), 1));
                }
                const tile = bgRenderer.getSandblastTile();
                if (tile) {
                    for (let ty = 0; ty < size; ty += 256) {
                        for (let tx = 0; tx < size; tx += 256) gBase.DrawImage(tile, tx, ty, 256, 256, 0, 0, 256, 256);
                    }
                }

            } else if (dialMode === VolumeConstants.DIAL_MODE.STUDIO) {
                gBase.FillSolidRect(0, 0, size, size, theme.inner);
                const rBorderOuter = R * 0.80;
                const rBorderInner = R * 0.792;

                const stepGlow = Math.max(0.8, R / 160);
                for (let r = 0; r <= R; r += stepGlow) {
                    const t = 1 - (r / R);
                    const alpha = GdiUtils.clamp(Math.round((t ** 1.6) * 165), 0, 255);
                    if (alpha > 0) {
                        gBase.DrawEllipse(cx - r, cy - r, r * 2, r * 2, 1.5, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), alpha));
                    }
                }
                const rFalloffStart = R * 0.65;
                const stepFalloff = Math.max(0.6, (R - rFalloffStart) / 80);
                for (let r = rFalloffStart; r <= R; r += stepFalloff) {
                    const t = (r - rFalloffStart) / (R - rFalloffStart);
                    const alpha = GdiUtils.clamp(Math.round((t ** 1.4) * 80), 0, 255);
                    if (alpha > 0) {
                        gBase.DrawEllipse(cx - r, cy - r, r * 2, r * 2, 1.5, GdiUtils.setAlpha(GdiUtils.colour(0, 0, 0), alpha));
                    }
                }
                gBase.DrawEllipse(cx - R + 1, cy - R + 1, (R - 1) * 2, (R - 1) * 2, 1.5, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), 45));

                const stepBorder = Math.max(0.95, (rBorderOuter - rBorderInner) / 16);
                for (let r = rBorderInner; r <= rBorderOuter; r += stepBorder) {
                    const t = ((r - rBorderInner) / (rBorderOuter - rBorderInner)) * 2 - 1;
                    const darkA = GdiUtils.clamp(Math.round((1 - t * t) * 35 + 25), 0, 255);
                    gBase.DrawEllipse(cx - r, cy - r, r * 2, r * 2, 1.5, GdiUtils.setAlpha(GdiUtils.colour(0, 0, 0), darkA));
                }
                gBase.DrawEllipse(cx - rBorderOuter, cy - rBorderOuter, rBorderOuter * 2, rBorderOuter * 2, 1, GdiUtils.setAlpha(GdiUtils.colour(0, 0, 0), 230));
                gBase.DrawEllipse(cx - rBorderInner, cy - rBorderInner, rBorderInner * 2, rBorderInner * 2, 1, GdiUtils.setAlpha(GdiUtils.colour(0, 0, 0), 230));

                let coreBmp = null, coreMask = null;
                try {
                    const res = Math.round(rBorderInner * 2);
                    if (res > 4) {
                        coreBmp = gdi.CreateImage(res, res);
                        const cg = coreBmp.GetGraphics();
                        try {
                            cg.SetSmoothingMode(2);
                            const cCenter = res / 2;
                            const cR = res / 2;

                            cg.FillSolidRect(0, 0, res, res, theme.inner);

                            const stepCore = Math.max(0.6, cR / 160);
                            for (let r = 0; r <= cR; r += stepCore) {
                                const t = r / cR;
                                const z = Math.sqrt(Math.max(0, 1 - t * t));

                                const alphaGlow = GdiUtils.clamp(Math.round((z ** 3.5) * 40), 0, 255);
                                if (alphaGlow > 0) {
                                    cg.DrawEllipse(cCenter - r, cCenter - r, r * 2, r * 2, 1.5, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), alphaGlow));
                                }

                                const alphaDark = GdiUtils.clamp(Math.round(((1 - z) ** 1.5) * 160), 0, 255);
                                if (alphaDark > 0) {
                                    cg.DrawEllipse(cCenter - r, cCenter - r, r * 2, r * 2, 1.5, GdiUtils.setAlpha(GdiUtils.colour(0, 0, 0), alphaDark));
                                }
                            }

                            const tile = bgRenderer.getSandblastTile();
                            if (tile) {
                                const tw = tile.Width, th = tile.Height;
                                for (let ty = 0; ty < res; ty += th) {
                                    for (let tx = 0; tx < res; tx += tw) {
                                        cg.DrawImage(tile, tx, ty, tw, th, 0, 0, tw, th, 0, 50);
                                    }
                                }
                            }
                        } finally {
                            coreBmp.ReleaseGraphics(cg);
                        }

                        coreMask = gdi.CreateImage(res, res);
                        const cmg = coreMask.GetGraphics();
                        try {
                            cmg.SetSmoothingMode(2);
                            cmg.FillSolidRect(0, 0, res, res, GdiUtils.colour(255, 255, 255));
                            cmg.FillEllipse(0, 0, res, res, GdiUtils.colour(0, 0, 0));
                        } finally {
                            coreMask.ReleaseGraphics(cmg);
                        }

                        coreBmp.ApplyMask(coreMask);
                        gBase.DrawImage(coreBmp, Math.round(cx - rBorderInner), Math.round(cy - rBorderInner), res, res, 0, 0, res, res);
                    }
                } finally {
                    if (coreMask?.Dispose) { try { coreMask.Dispose(); } catch {} }
                    if (coreBmp?.Dispose) { try { coreBmp.Dispose(); } catch {} }
                }

            } else if (dialMode === VolumeConstants.DIAL_MODE.CARBON) {
                const ic = GdiUtils.toRGB(theme.inner);
                gBase.FillSolidRect(0, 0, size, size, GdiUtils.colour(ic[0] * 0.45, ic[1] * 0.45, ic[2] * 0.45));
                const cell = GdiUtils.clamp(Math.round(size * 0.014), 3, 6);
                const tile = bgRenderer.getCarbonTile(cell);
                if (tile) {
                    const tn = tile.Width;
                    for (let ty = 0; ty < size; ty += tn) {
                        for (let tx = 0; tx < size; tx += tn) gBase.DrawImage(tile, tx, ty, tn, tn, 0, 0, tn, tn);
                    }
                }
                gBase.DrawEllipse(cx - R + 1, cy - R + 1, (R - 1) * 2, (R - 1) * 2, 1.5, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), 50));

            } else if (dialMode === VolumeConstants.DIAL_MODE.IMAGE) {
                const loaded = assetManager.getImage(customImgPath);
                if (loaded) {
                    gBase.SetInterpolationMode(7);
                    const scale = Math.max(size / loaded.Width, size / loaded.Height);
                    const renderW = Math.round(loaded.Width * scale), renderH = Math.round(loaded.Height * scale);
                    gBase.DrawImage(loaded, Math.round((size - renderW) / 2), Math.round((size - renderH) / 2), renderW, renderH, 0, 0, loaded.Width, loaded.Height);
                } else {
                    gBase.FillSolidRect(0, 0, size, size, theme.inner);
                }
            }

            // Render Specular Profiles
            if (needLight) {
                const isAuto = (lightStyle === VolumeConstants.LIGHT_STYLE.AUTO);

                const renderSoftSheen = (intensity, maxRadius = R) => {
                    const gdiAngle = ((lightAngleDeg - 90) % 360 + 360) % 360;
                    const targetAlpha = GdiUtils.clamp(Math.round(intensity * strMul), 0, 255);
                    if (targetAlpha <= 0) return;

                    const dia = Math.round(maxRadius * 2);
                    if (dia <= 4) return;

                    let gradBmp = null, maskBmp = null;
                    try {
                        const res = 128;
                        gradBmp = gdi.CreateImage(res, res);
                        const gi = gradBmp.GetGraphics();
                        try {
                            gi.SetSmoothingMode(2);
                            gi.FillGradRect(0, 0, res, res, gdiAngle, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), 0), GdiUtils.colour(255, 255, 255));
                        } finally {
                            gradBmp.ReleaseGraphics(gi);
                        }

                        maskBmp = gdi.CreateImage(res, res);
                        const gm = maskBmp.GetGraphics();
                        try {
                            gm.SetSmoothingMode(2);
                            gm.FillSolidRect(0, 0, res, res, GdiUtils.colour(255, 255, 255));
                            gm.FillEllipse(0, 0, res, res, GdiUtils.colour(0, 0, 0));
                        } finally {
                            maskBmp.ReleaseGraphics(gm);
                        }

                        gradBmp.ApplyMask(maskBmp);

                        gLight.SetInterpolationMode(2);
                        gLight.DrawImage(
                            gradBmp,
                            Math.round(cx - maxRadius), Math.round(cy - maxRadius), dia, dia,
                            0, 0, res, res,
                            0, targetAlpha
                        );
                    } finally {
                        if (maskBmp?.Dispose) { try { maskBmp.Dispose(); } catch {} }
                        if (gradBmp?.Dispose) { try { gradBmp.Dispose(); } catch {} }
                    }

                    gLight.DrawEllipse(
                        cx - maxRadius + 1, cy - maxRadius + 1,
                        (maxRadius - 1) * 2, (maxRadius - 1) * 2,
                        1, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), GdiUtils.clamp(Math.round(26 * strMul), 0, 255))
                    );
                };

                const renderAnisoCones = (maxRadius = R) => {
                    const rayCount = Math.max(180, Math.round(Math.PI * maxRadius * 2));
                    const stepAngle = (Math.PI * 2) / rayCount;
                    for (let i = 0; i < rayCount; i++) {
                        const angle = i * stepAngle;
                        const diff = angle - lightRad;
                        const cone1 = (Math.abs(Math.sin(diff)) ** 4);
                        const cone2 = (Math.abs(Math.cos(diff)) ** 5);
                        const a1 = GdiUtils.clamp(Math.round(cone1 * 32 * strMul * (0.9 + rnd() * 0.2)), 0, 255);
                        const a2 = GdiUtils.clamp(Math.round(cone2 * 18 * strMul * (0.9 + rnd() * 0.2)), 0, 255);
                        const ex = cx + Math.sin(angle) * maxRadius;
                        const ey = cy - Math.cos(angle) * maxRadius;
                        if (a1 > 0) gLight.DrawLine(cx, cy, ex, ey, 1, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), a1));
                        if (a2 > 0) gLight.DrawLine(cx, cy, ex, ey, 1, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), a2));
                    }
                    gLight.FillEllipse(cx - 1, cy - 1, 2, 2, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), GdiUtils.clamp(Math.round(75 * strMul), 0, 255)));
                    gLight.DrawEllipse(cx - maxRadius + 1, cy - maxRadius + 1, (maxRadius - 1) * 2, (maxRadius - 1) * 2, 1.5, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), GdiUtils.clamp(Math.round(38 * strMul), 0, 255)));
                };

                const renderStudioRim = () => {
                    const fillRad = lightRad + 135 * VolumeConstants.DEG2RAD;
                    const steps = Math.max(180, Math.round(Math.PI * size));
                    const stepA = (Math.PI * 2) / steps;
                    const rCollar = R * 0.618;

                    for (let i = 0; i < steps; i++) {
                        const a = i * stepA;
                        const dotKey = Math.cos(a - lightRad);
                        const dotFill = Math.cos(a - fillRad);
                        const ex = cx + Math.sin(a) * R,        ey = cy - Math.cos(a) * R;
                        const sx = cx + Math.sin(a) * rCollar,  sy = cy - Math.cos(a) * rCollar;

                        if (dotKey > 0) {
                            const intKey = (dotKey ** 2.5) * 70 * strMul;
                            gLight.DrawLine(sx, sy, ex, ey, 1.5, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), GdiUtils.clamp(Math.round(intKey), 0, 255)));
                        }
                        if (dotFill > 0) {
                            const intFill = (dotFill ** 2.2) * 28 * strMul;
                            gLight.DrawLine(sx, sy, ex, ey, 1.5, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), GdiUtils.clamp(Math.round(intFill), 0, 255)));
                        }
                    }
                    gLight.DrawEllipse(cx - R + 1, cy - R + 1, (R - 1) * 2, (R - 1) * 2, 1.5, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), GdiUtils.clamp(Math.round(40 * strMul), 0, 255)));
                    gLight.DrawEllipse(cx - rCollar, cy - rCollar, rCollar * 2, rCollar * 2, 1, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), GdiUtils.clamp(Math.round(30 * strMul), 0, 255)));
                };

                const renderMicroBevel = () => {
                    const steps = Math.max(180, Math.round(Math.PI * size));
                    const stepA = (Math.PI * 2) / steps;
                    const rBevelInner = R * 0.98;
                    for (let i = 0; i < steps; i++) {
                        const a = i * stepA;
                        const dot = Math.cos(a - lightRad);
                        if (dot > 0) {
                            const intense = (dot ** 3.2) * 110 * strMul;
                            const ex = cx + Math.sin(a) * R,          ey = cy - Math.cos(a) * R;
                            const sx = cx + Math.sin(a) * rBevelInner, sy = cy - Math.cos(a) * rBevelInner;
                            gLight.DrawLine(sx, sy, ex, ey, 1.5, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), GdiUtils.clamp(Math.round(intense), 0, 255)));
                        }
                    }
                    gLight.DrawEllipse(cx - R + 0.5, cy - R + 0.5, (R - 0.5) * 2, (R - 0.5) * 2, 1, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), GdiUtils.clamp(Math.round(75 * strMul), 0, 255)));
                };

                const renderContourDome = () => {
                    const stepGlow = Math.max(0.6, R / 160);
                    for (let r = 0; r <= R; r += stepGlow) {
                        const t = 1 - (r / R);
                        const alpha = GdiUtils.clamp(Math.round((t ** 1.6) * 175 * strMul), 0, 255);
                        if (alpha > 0) {
                            gLight.DrawEllipse(cx - r, cy - r, r * 2, r * 2, 1.5, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), alpha));
                        }
                    }

                    const rFalloffStart = R * 0.65;
                    const stepFalloff = Math.max(0.6, (R - rFalloffStart) / 80);
                    for (let r = rFalloffStart; r <= R; r += stepFalloff) {
                        const t = (r - rFalloffStart) / (R - rFalloffStart);
                        const alpha = GdiUtils.clamp(Math.round((t ** 1.4) * 80 * strMul), 0, 255);
                        if (alpha > 0) {
                            gLight.DrawEllipse(cx - r, cy - r, r * 2, r * 2, 1.5, GdiUtils.setAlpha(GdiUtils.colour(0, 0, 0), alpha));
                        }
                    }
                    gLight.DrawEllipse(cx - R + 1, cy - R + 1, (R - 1) * 2, (R - 1) * 2, 1.5, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), GdiUtils.clamp(Math.round(45 * strMul), 0, 255)));
                };

                const renderConcaveBowl = () => {
                    const rShadowEnd = R * 0.82;
                    const stepShadow = Math.max(0.6, rShadowEnd / 140);
                    for (let r = 0; r <= rShadowEnd; r += stepShadow) {
                        const t = 1 - (r / rShadowEnd);
                        const alpha = GdiUtils.clamp(Math.round((t ** 1.5) * 150 * strMul), 0, 255);
                        if (alpha > 0) {
                            gLight.DrawEllipse(cx - r, cy - r, r * 2, r * 2, 1.5, GdiUtils.setAlpha(GdiUtils.colour(0, 0, 0), alpha));
                        }
                    }

                    const rGlintStart = R * 0.45;
                    const stepGlint = Math.max(0.6, (R - rGlintStart) / 100);
                    for (let r = rGlintStart; r <= R; r += stepGlint) {
                        const t = (r - rGlintStart) / (R - rGlintStart);
                        const alpha = GdiUtils.clamp(Math.round((t ** 1.8) * 80 * strMul), 0, 255);
                        if (alpha > 0) {
                            gLight.DrawEllipse(cx - r, cy - r, r * 2, r * 2, 1.5, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), alpha));
                        }
                    }
                    gLight.DrawEllipse(cx - R + 1, cy - R + 1, (R - 1) * 2, (R - 1) * 2, 1.5, GdiUtils.setAlpha(GdiUtils.colour(0, 0, 0), GdiUtils.clamp(Math.round(75 * strMul), 0, 255)));
                };
                
                const renderSpunMetal = (maxRadius = R) => {
                    const hubR = Math.max(3, Math.round(maxRadius * 0.08));
                    const grooveStep = Math.max(3, Math.round(size * 0.010));
                    const maxRFloor = Math.floor(maxRadius);
                    for (let r = maxRFloor; r >= hubR + grooveStep; r -= grooveStep) {
                        gLight.DrawEllipse(cx - r, cy - r, r * 2, r * 2, 1, GdiUtils.setAlpha(GdiUtils.colour(0, 0, 0), GdiUtils.clamp(Math.round(18 * strMul), 0, 255)));
                        if (r > hubR + 1) {
                            gLight.DrawEllipse(cx - (r - 0.5), cy - (r - 0.5), (r - 0.5) * 2, (r - 0.5) * 2, 1, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), GdiUtils.clamp(Math.round(12 * strMul), 0, 255)));
                        }
                    }

                    const rayCount = Math.max(180, Math.round((Math.PI * maxRadius * 2) / 1.1));
                    const stepAngle = (Math.PI * 2) / rayCount;

                    let seedS = 4321;
                    const rndS = () => { seedS = (seedS * 16807) % 2147483647; return (seedS - 1) / 2147483646; };

                    for (let i = 0; i < rayCount; i++) {
                        const angle = i * stepAngle;
                        const diff = angle - lightRad;
                        const highlight = Math.sin(diff * 2) ** 4;
                        const shadow    = Math.cos(diff * 2) ** 4;

                        if (highlight < 0.02 && shadow < 0.02) continue;

                        let rStart;
                        if (i % 8 === 0)      rStart = 0;
                        else if (i % 4 === 0) rStart = maxRadius * 0.09;
                        else if (i % 2 === 0) rStart = maxRadius * 0.09;
                        else                  rStart = 0;

                        const ex = cx + Math.sin(angle) * maxRadius;
                        const ey = cy - Math.cos(angle) * maxRadius;
                        const sx = cx + Math.sin(angle) * rStart;
                        const sy = cy - Math.cos(angle) * rStart;

                        const grain = 0.98 + rndS() * 0.24;
                        const alphaH = GdiUtils.clamp(Math.round(highlight * 26 * grain * strMul), 0, 255);
                        const alphaS = GdiUtils.clamp(Math.round(shadow * 34 * grain * strMul), 0, 255);

                        if (alphaH > 0) gLight.DrawLine(sx, sy, ex, ey, 1, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), alphaH));
                        if (alphaS > 0) gLight.DrawLine(sx, sy, ex, ey, 1, GdiUtils.setAlpha(GdiUtils.colour(0, 0, 0), alphaS));
                    }

                    for (let r = hubR; r > 0; r--) {
                        const t = 1 - (r / hubR);
                        gLight.FillEllipse(cx - r, cy - r, r * 2, r * 2, GdiUtils.setAlpha(GdiUtils.colour(0, 0, 0), GdiUtils.clamp(Math.round(t * 35 * strMul), 0, 255)));
                    }
                    gLight.DrawEllipse(cx - maxRadius + 1, cy - maxRadius + 1, (maxRadius - 1) * 2, (maxRadius - 1) * 2, 1.5, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), GdiUtils.clamp(Math.round(38 * strMul), 0, 255)));
                };

                if (isAuto) {
                    if (dialMode === VolumeConstants.DIAL_MODE.SOLID || dialMode === VolumeConstants.DIAL_MODE.IMAGE) {
                        renderSoftSheen(45);
                    } else if (dialMode === VolumeConstants.DIAL_MODE.BEADBLAST || dialMode === VolumeConstants.DIAL_MODE.SANDBLAST) {
                        renderSoftSheen(55);
                    } else if (dialMode === VolumeConstants.DIAL_MODE.KNURLED) {
                        renderStudioRim();
                    } else if (dialMode === VolumeConstants.DIAL_MODE.STUDIO) {
                        renderSoftSheen(45, R * 0.80);
                    } else {
                        renderAnisoCones(R);
                    }

                } else if (lightStyle === VolumeConstants.LIGHT_STYLE.ANISOTROPIC) {
                    renderAnisoCones(R);

                } else if (lightStyle === VolumeConstants.LIGHT_STYLE.SPOTLIGHT) {
                    renderSoftSheen(55);

                } else if (lightStyle === VolumeConstants.LIGHT_STYLE.HAIRLINE) {
                    const dia = Math.round(R * 2);
                    let barBmp = null, maskBmp = null;
                    try {
                        const res = 128;
                        barBmp = gdi.CreateImage(res, res);
                        const bg = barBmp.GetGraphics();
                        try {
                            bg.SetSmoothingMode(2);
                            const barAlpha = GdiUtils.clamp(Math.round(48 * strMul), 0, 255);
                            bg.FillGradRect(0, 0, res, res, 0, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), 0), GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), barAlpha), 0.5);
                        } finally {
                            barBmp.ReleaseGraphics(bg);
                        }

                        maskBmp = gdi.CreateImage(res, res);
                        const mg = maskBmp.GetGraphics();
                        try {
                            mg.SetSmoothingMode(2);
                            mg.FillSolidRect(0, 0, res, res, GdiUtils.colour(255, 255, 255));
                            mg.FillEllipse(0, 0, res, res, GdiUtils.colour(0, 0, 0));
                        } finally {
                            maskBmp.ReleaseGraphics(mg);
                        }

                        barBmp.ApplyMask(maskBmp);
                        gLight.SetInterpolationMode(2);
                        gLight.DrawImage(barBmp, cx - R, cy - R, dia, dia, 0, 0, res, res, lightAngleDeg, 255);
                    } finally {
                        if (maskBmp?.Dispose) { try { maskBmp.Dispose(); } catch {} }
                        if (barBmp?.Dispose) { try { barBmp.Dispose(); } catch {} }
                    }
                    gLight.DrawEllipse(cx - R + 1, cy - R + 1, (R - 1) * 2, (R - 1) * 2, 1, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), GdiUtils.clamp(Math.round(25 * strMul), 0, 255)));

                } else if (lightStyle === VolumeConstants.LIGHT_STYLE.CROSS) {
                    const rayCount = Math.max(220, Math.round(Math.PI * size * 1.2));
                    const stepAngle = (Math.PI * 2) / rayCount;
                    for (let i = 0; i < rayCount; i++) {
                        const angle = i * stepAngle;
                        const diff = angle - lightRad;
                        const flare = (Math.abs(Math.sin(diff * 2)) ** 6);
                        const aF = GdiUtils.clamp(Math.round(flare * 42 * strMul * (0.92 + rnd() * 0.16)), 0, 255);
                        const ex = cx + Math.sin(angle) * (R + 1);
                        const ey = cy - Math.cos(angle) * (R + 1);
                        if (aF > 0) gLight.DrawLine(cx, cy, ex, ey, 1, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), aF));
                    }
                    gLight.FillEllipse(cx - 2, cy - 2, 4, 4, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), GdiUtils.clamp(Math.round(95 * strMul), 0, 255)));

                } else if (lightStyle === VolumeConstants.LIGHT_STYLE.STUDIO_SHEEN) {
                    renderStudioRim();

                    const rDarkOuter = R * 0.618;
                    const rDarkInner = R * 0.578;
                    const stepRing = Math.max(0.6, (rDarkOuter - rDarkInner) / 30);
                    for (let rRing = rDarkInner; rRing <= rDarkOuter; rRing += stepRing) {
                        const t = ((rRing - rDarkInner) / (rDarkOuter - rDarkInner)) * 2 - 1;
                        const darkAlpha = GdiUtils.clamp(Math.round((1 - t * t) * 140 * strMul), 0, 255);
                        if (darkAlpha > 0) {
                            gLight.DrawEllipse(cx - rRing, cy - rRing, rRing * 2, rRing * 2, 1.5, GdiUtils.setAlpha(GdiUtils.colour(0, 0, 0), darkAlpha));
                        }
                    }
                    gLight.DrawEllipse(cx - rDarkOuter, cy - rDarkOuter, rDarkOuter * 2, rDarkOuter * 2, 1, GdiUtils.setAlpha(GdiUtils.colour(0, 0, 0), GdiUtils.clamp(Math.round(90 * strMul), 0, 255)));
                    gLight.DrawEllipse(cx - rDarkInner, cy - rDarkInner, rDarkInner * 2, rDarkInner * 2, 1, GdiUtils.setAlpha(GdiUtils.colour(0, 0, 0), GdiUtils.clamp(Math.round(90 * strMul), 0, 255)));

                    renderSoftSheen(45, rDarkInner);

                } else if (lightStyle === VolumeConstants.LIGHT_STYLE.ANISO_BEVEL) {
                    renderAnisoCones(R * 0.975);
                    renderMicroBevel();
                    
                } else if (lightStyle === VolumeConstants.LIGHT_STYLE.CONTOUR_DOME) {
                    renderContourDome();
                    
                } else if (lightStyle === VolumeConstants.LIGHT_STYLE.CONCAVE_BOWL) {
                    renderConcaveBowl();
                    
                } else if (lightStyle === VolumeConstants.LIGHT_STYLE.STUDIO_ANISO) {
                    renderStudioRim();
                    renderAnisoCones(R * 0.618);

                } else if (lightStyle === VolumeConstants.LIGHT_STYLE.SPUN_METAL) {
                    renderSpunMetal();
                }
            }

            bmpBase.ReleaseGraphics(gBase);
            gBase = null;
            if (bmpLight && gLight) {
                bmpLight.ReleaseGraphics(gLight);
                gLight = null;
            }

            let mask = null;
            try {
                mask = gdi.CreateImage(size, size);
                const mg = mask.GetGraphics();
                try {
                    mg.SetSmoothingMode(2);
                    mg.FillSolidRect(0, 0, size, size, GdiUtils.colour(255, 255, 255));
                    mg.FillEllipse(0, 0, size, size, GdiUtils.colour(0, 0, 0));
                } finally {
                    mask.ReleaseGraphics(mg);
                }

                bmpBase.ApplyMask(mask);
                if (bmpLight) bmpLight.ApplyMask(mask);
            } finally {
                if (mask?.Dispose) { try { mask.Dispose(); } catch {} }
            }

            this.#bmpBase = bmpBase;
            bmpBase = null;
            this.#bmpLight = bmpLight;
            bmpLight = null;

            gr.SetInterpolationMode(2);
            gr.DrawImage(this.#bmpBase, x, y, size, size, 0, 0, size, size, drawAngle, 255);
            if (needLight && this.#bmpLight) {
                gr.DrawImage(this.#bmpLight, x, y, size, size, 0, 0, size, size, 0, 255);
            }
        } catch {
            if (gBase && bmpBase) { try { bmpBase.ReleaseGraphics(gBase); } catch {} gBase = null; }
            if (gLight && bmpLight) { try { bmpLight.ReleaseGraphics(gLight); } catch {} gLight = null; }
            if (bmpBase?.Dispose) { try { bmpBase.Dispose(); } catch {} }
            if (bmpLight?.Dispose) { try { bmpLight.Dispose(); } catch {} }
            gr.FillEllipse(x, y, size, size, theme.inner);
        }
    }

    invalidate() {
        if (this.#bmpBase?.Dispose) { try { this.#bmpBase.Dispose(); } catch {} }
        if (this.#bmpLight?.Dispose) { try { this.#bmpLight.Dispose(); } catch {} }
        this.#bmpBase = null;
        this.#bmpLight = null;
        this.#key = '';
    }

    cleanup() { this.invalidate(); }
}

// ============================================================================================
// 8. HUD MANAGER (STATIC)
// ============================================================================================
class HudManager {
    static activeSlider = null;
    static #fonts = new Map();
    static #timeoutTimer = null;

    static getFont(sizePt = 11, bold = false) {
        const s = GdiUtils.scale(sizePt);
        const key = `${s}|${bold ? 1 : 0}`;
        if (this.#fonts.has(key)) return this.#fonts.get(key);
        let font = null;
        try {
            font = gdi.Font('Segoe UI', s, bold ? 1 : 0);
            if (font) this.#fonts.set(key, font);
        } catch {
            font = null;
        }
        return font;
    }

    static adjustSlider(propertyManager, dialRenderer, sceneCache, state, target, delta) {
        if (target === 'TickMargin') {
            const cur = propertyManager.values.tickMargin;
            propertyManager.set('tickMargin', GdiUtils.clamp(cur + delta, 0, 30));
        } else if (target === 'TickSize') {
            const cur = propertyManager.values.tickSizeBonus;
            propertyManager.set('tickSizeBonus', GdiUtils.clamp(cur + delta * 5, 0, 100));
        } else if (target === 'LightStrength') {
            const cur = propertyManager.values.dialLightStrength;
            propertyManager.set('dialLightStrength', GdiUtils.clamp(cur + delta * 5, 0, 200));
            if (!propertyManager.values.showHighlight) propertyManager.set('showHighlight', true);
            dialRenderer.invalidate();
        } else if (target === 'LightAngle') {
            let cur = propertyManager.values.dialLightAngle;
            cur = (cur + delta * 5) % 360;
            if (cur < 0) cur += 360;
            propertyManager.set('dialLightAngle', cur);
            if (!propertyManager.values.showHighlight) propertyManager.set('showHighlight', true);
            dialRenderer.invalidate();
        }

        state.invalidateGeometry();
        sceneCache.invalidate(null, dialRenderer);
        state.requestRepaint();

        if (this.#timeoutTimer) window.ClearTimeout(this.#timeoutTimer);
        this.#timeoutTimer = window.SetTimeout(() => {
            this.activeSlider = null;
            this.#timeoutTimer = null;
            window.Repaint();
        }, 3000);
    }

    static clearTimer() {
        if (this.#timeoutTimer) {
            window.ClearTimeout(this.#timeoutTimer);
            this.#timeoutTimer = null;
        }
    }

    static invalidateFont() {
        for (const f of this.#fonts.values()) {
            if (f?.Dispose) {
                try { f.Dispose(); } catch {}
            }
        }
        this.#fonts.clear();
    }
}

// ============================================================================================
// 9. MASTER SCENE CACHE
// ============================================================================================
class SceneCache {
    #bitmap = null;
    #key = '';

    invalidate(bgRenderer, dialRenderer) {
        if (this.#bitmap?.Dispose) {
            try { this.#bitmap.Dispose(); } catch {}
        }
        this.#bitmap = null;
        this.#key = '';
        if (bgRenderer) bgRenderer.invalidate();
        if (dialRenderer) dialRenderer.invalidate();
    }

    cleanup(bgRenderer, dialRenderer) {
        this.invalidate(bgRenderer, dialRenderer);
        if (bgRenderer) bgRenderer.cleanup();
        if (dialRenderer) dialRenderer.cleanup();
    }

    static arcBand(props) { return props && props.levelArc ? Math.max(3, GdiUtils.scale(4)) : 0; }

    static layout(cache, props) {
        const rInner = cache.innerSize / 2;
        const aoPad = props.showDropShadow ? Math.max(2, Math.round(cache.size * 0.014)) : 0;
        const arcBand = SceneCache.arcBand(props);
        const marginPx = GdiUtils.scale(props.tickMargin || 0) + arcBand;
        const sizeMul = 1.0 + (props.tickSizeBonus || 0) / 100;
        const rBase = rInner + aoPad + marginPx;
        const rOuter = Math.min(cache.radius, rBase + (cache.tickLength * 1.6 * sizeMul));
        return {
            rInner, aoPad, arcBand, marginPx, sizeMul, rBase, rOuter,
            span: Math.max(2, rOuter - rBase),
            arcR: rInner + aoPad + arcBand / 2,
            arcW: Math.max(2, arcBand - 1)
        };
    }

    static accentColour(props, theme) {
        if (props.glowSource === 'custom') {
            return (Number(props.customGlowColor) >>> 0) || theme.marker;
        }
        if (props.glowSource === 'lcd') {
            const n = String(props.currentLcdTheme || '').toLowerCase();
            const t = VolumeConstants.LCD_THEMES.find(x => x.name.toLowerCase() === n);
            if (t) return t.color;
        }
        return theme.marker;
    }

    static dimColour(theme, props) {
        const a = GdiUtils.toRGB(theme.tick);
        const b = GdiUtils.toRGB(props.showOuterRing ? theme.knob : theme.bg);
        const k = 0.7;
        return GdiUtils.colour(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k);
    }

    static drawArc(g, cx, cy, r, a0, a1, width, colour) {
        const len = Math.abs(a1 - a0) * r;
        const segs = Math.max(12, Math.ceil(len / 3));
        const step = (a1 - a0) / segs;
        let lx = cx + Math.sin(a0) * r, ly = cy - Math.cos(a0) * r;
        for (let i = 1; i <= segs; i++) {
            const a = a0 + step * i;
            const nx = cx + Math.sin(a) * r, ny = cy - Math.cos(a) * r;
            g.DrawLine(lx, ly, nx, ny, width, colour);
            lx = nx; ly = ny;
        }
    }

    static drawTickMarks(g, o) {
        const { props, cache, config, cx, cy, rBase, span, sizeMul, sweepTotal, iMin, iMax, overlay } = o;
        const theme = Object.assign({}, o.theme, { tick: o.tickCol });
        const drawCustomArcDeg = overlay ? () => {} : (graphics, x, y, radius, startDeg, sweepDeg, strokeWidth, color) => {
            const startRad = startDeg * VolumeConstants.DEG2RAD;
            const sweepRad = sweepDeg * VolumeConstants.DEG2RAD;
            const segments = Math.max(16, Math.round(radius * Math.abs(sweepRad) * 0.8));
            const step = sweepRad / segments;
            let lastX = x + Math.cos(startRad) * radius;
            let lastY = y + Math.sin(startRad) * radius;
            for (let i = 1; i <= segments; i++) {
                const a = startRad + step * i;
                const nx = x + Math.cos(a) * radius;
                const ny = y + Math.sin(a) * radius;
                graphics.DrawLine(lastX, lastY, nx, ny, strokeWidth, color);
                lastX = nx;
                lastY = ny;
            }
        };
        if (props.showTicks && cache.tickAngles) {
            const intervalMode = props.majorTickInterval;

            if (props.tickStyle === VolumeConstants.TICK_STYLE.UNIFORM) {
                const len = Math.min(span, cache.tickLength * 1.5 * sizeMul);
                const r2 = rBase + len;
                const tickStroke = Math.max(1, Math.round(cache.strokeWidth * sizeMul));

                for (let i = iMin; i <= iMax; i++) {
                    const a = cache.tickAngles[i];
                    g.DrawLine(cx + Math.sin(a) * rBase, cy - Math.cos(a) * rBase, cx + Math.sin(a) * r2, cy - Math.cos(a) * r2, tickStroke, theme.tick);
                }
            } else if (props.tickStyle === VolumeConstants.TICK_STYLE.MAJOR) {
                const lenMajor = span;
                const lenMinor = (intervalMode === VolumeConstants.MAJOR_INTERVAL.NONE) ? span : (lenMajor * 0.60);
                const strokeMajor = Math.max(2, Math.round(cache.strokeWidth * 1.5 * sizeMul));
                const strokeMinor = (intervalMode === VolumeConstants.MAJOR_INTERVAL.NONE) ? strokeMajor : Math.max(1, Math.round(cache.strokeWidth * 0.75 * sizeMul));

                for (let i = iMin; i <= iMax; i++) {
                    const a  = cache.tickAngles[i];
                    const isMajor = VolumeConstants.isMajorTick(i, intervalMode);
                    const len = isMajor ? lenMajor : lenMinor;
                    const stroke = isMajor ? strokeMajor : strokeMinor;
                    g.DrawLine(cx + Math.sin(a) * rBase, cy - Math.cos(a) * rBase, cx + Math.sin(a) * (rBase + len), cy - Math.cos(a) * (rBase + len), stroke, theme.tick);
                }
            } else if (props.tickStyle === VolumeConstants.TICK_STYLE.DOTS) {
                const pipRatio = props.showDropShadow ? 0.38 : 0.50;
                const rPip = rBase + span * pipRatio;
                const rMaj = Math.max(2.5, Math.round(span * 0.16 * sizeMul));
                const rMin = (intervalMode === VolumeConstants.MAJOR_INTERVAL.NONE) ? rMaj : Math.max(1.5, Math.round(span * 0.08 * sizeMul));

                for (let i = iMin; i <= iMax; i++) {
                    const a  = cache.tickAngles[i];
                    const isMajor = VolumeConstants.isMajorTick(i, intervalMode);
                    const px = cx + Math.sin(a) * rPip;
                    const py = cy - Math.cos(a) * rPip;

                    if (isMajor || intervalMode === VolumeConstants.MAJOR_INTERVAL.NONE) {
                        g.FillEllipse(px - rMaj, py - rMaj, rMaj * 2, rMaj * 2, theme.tick);
                    } else {
                        g.FillEllipse(px - rMin, py - rMin, rMin * 2, rMin * 2, GdiUtils.setAlpha(theme.tick, 160));
                    }
                }
            } else if (props.tickStyle === VolumeConstants.TICK_STYLE.BLOCKS) {
                const lenMajor = span * 0.88;
                const lenMinor = (intervalMode === VolumeConstants.MAJOR_INTERVAL.NONE) ? lenMajor : (lenMajor * 0.60);

                for (let i = iMin; i <= iMax; i++) {
                    const a  = cache.tickAngles[i];
                    const sa = Math.sin(a);
                    const ca = Math.cos(a);
                    const isMajor = VolumeConstants.isMajorTick(i, intervalMode);
                    const len = isMajor ? lenMajor : lenMinor;
                    const r1 = rBase;
                    const r2 = rBase + len;
                    const w1 = Math.max(1, Math.round((isMajor ? cache.strokeWidth * 0.85 : cache.strokeWidth * 0.5) * sizeMul));
                    const w2 = Math.max(1.5, Math.round((isMajor ? cache.strokeWidth * 1.8 : cache.strokeWidth * 1.1) * sizeMul));

                    const p1x = cx + sa * r1 - ca * w1, p1y = cy - ca * r1 - sa * w1;
                    const p2x = cx + sa * r1 + ca * w1, p2y = cy - ca * r1 + sa * w1;
                    const p3x = cx + sa * r2 + ca * w2, p3y = cy - ca * r2 + sa * w2;
                    const p4x = cx + sa * r2 - ca * w2, p4y = cy - ca * r2 - sa * w2;

                    const flat = [p1x, p1y, p2x, p2y, p3x, p3y, p4x, p4y];
                    const pts2D = [[p1x, p1y], [p2x, p2y], [p3x, p3y], [p4x, p4y]];
                    try {
                        g.FillPolygon(theme.tick, 0, flat);
                    } catch {
                        try { g.FillPolygon(theme.tick, 0, pts2D); } catch {}
                    }
                }
            } else if (props.tickStyle === VolumeConstants.TICK_STYLE.DIAMONDS) {
                const pipRatio = props.showDropShadow ? 0.40 : 0.52;
                const rPip = rBase + span * pipRatio;
                const dRadMaj = Math.max(3, Math.round(span * 0.18 * sizeMul));
                const dRadMin = (intervalMode === VolumeConstants.MAJOR_INTERVAL.NONE) ? dRadMaj : Math.max(1.8, Math.round(span * 0.10 * sizeMul));

                for (let i = iMin; i <= iMax; i++) {
                    const a  = cache.tickAngles[i];
                    const sa = Math.sin(a);
                    const ca = Math.cos(a);
                    const isMajor = VolumeConstants.isMajorTick(i, intervalMode);
                    const dRad = isMajor ? dRadMaj : dRadMin;
                    const px = cx + sa * rPip;
                    const py = cy - ca * rPip;

                    const tX = px + sa * dRad, tY = py - ca * dRad;
                    const bX = px - sa * dRad, bY = py + ca * dRad;
                    const lX = px - ca * (dRad * 0.65), lY = py - sa * (dRad * 0.65);
                    const rX = px + ca * (dRad * 0.65), rY = py + sa * (dRad * 0.65);

                    const col = isMajor ? theme.tick : GdiUtils.setAlpha(theme.tick, 180);
                    const flat = [tX, tY, rX, rY, bX, bY, lX, lY];
                    const pts2D = [[tX, tY], [rX, rY], [bX, bY], [lX, lY]];
                    try {
                        g.FillPolygon(col, 0, flat);
                    } catch {
                        try { g.FillPolygon(col, 0, pts2D); } catch {}
                    }
                }
            } else if (props.tickStyle === VolumeConstants.TICK_STYLE.BOUNDED) {
                const rOuterArc = rBase + span;
                if (!overlay) g.DrawEllipse(cx - rOuterArc, cy - rOuterArc, rOuterArc * 2, rOuterArc * 2, 1, GdiUtils.setAlpha(theme.tick, 120));

                const lenMajor = span * 0.90;
                const lenMinor = (intervalMode === VolumeConstants.MAJOR_INTERVAL.NONE) ? lenMajor : (span * 0.45);
                const strokeMajor = Math.max(1.5, Math.round(cache.strokeWidth * 1.2 * sizeMul));
                const strokeMinor = Math.max(1, Math.round(1 * sizeMul));

                for (let i = iMin; i <= iMax; i++) {
                    const a  = cache.tickAngles[i];
                    const sa = Math.sin(a);
                    const ca = Math.cos(a);
                    const isMajor = VolumeConstants.isMajorTick(i, intervalMode);
                    const len = isMajor ? lenMajor : lenMinor;
                    const rInnerTick = rOuterArc - len;
                    
                    g.DrawLine(cx + sa * rOuterArc, cy - ca * rOuterArc, cx + sa * rInnerTick, cy - ca * rInnerTick, isMajor ? strokeMajor : strokeMinor, isMajor ? theme.tick : GdiUtils.setAlpha(theme.tick, 200));
                }
            } else if (props.tickStyle === VolumeConstants.TICK_STYLE.MIN_MAX) {
                const rArc = rBase + span * 0.5;
                const startDeg = config.ANGLE_MIN + config.ROTATION_OFFSET - 90;
                
                drawCustomArcDeg(g, cx, cy, rArc, startDeg, sweepTotal, Math.max(1, Math.round(cache.strokeWidth * 0.8 * sizeMul)), GdiUtils.setAlpha(theme.tick, 140));

                const aMin = cache.tickAngles[0];
                const aMax = cache.tickAngles[config.TICK_COUNT - 1];
                const majorStroke = Math.max(2, Math.round(cache.strokeWidth * 2 * sizeMul));
                const minorStroke = Math.max(1, Math.round(cache.strokeWidth * sizeMul));

                for (let i = iMin; i <= iMax; i++) {
                    const a = cache.tickAngles[i];
                    if (i === 0 || i === config.TICK_COUNT - 1) {
                        g.DrawLine(cx + Math.sin(a) * rBase, cy - Math.cos(a) * rBase, cx + Math.sin(a) * (rBase + span), cy - Math.cos(a) * (rBase + span), majorStroke, theme.tick);
                    } else if (VolumeConstants.isMajorTick(i, intervalMode) || intervalMode === VolumeConstants.MAJOR_INTERVAL.NONE) {
                        g.DrawLine(cx + Math.sin(a) * rArc, cy - Math.cos(a) * rArc, cx + Math.sin(a) * (rBase + span * 0.8), cy - Math.cos(a) * (rBase + span * 0.8), minorStroke, theme.tick);
                    }
                }
                
                const fontSize = Math.max(8, Math.round(cache.size * 0.048));
                let tinyFont = null;
                if (!overlay) { try { tinyFont = gdi.Font('Segoe UI', fontSize, 1); } catch {} }
                if (tinyFont) {
                    try {
                        g.SetTextRenderingHint(4);
                        const textDist = rBase + span + Math.max(4, Math.round(fontSize * 0.85));
                        const xOffset = Math.max(4, Math.round(fontSize * 0.8)); 

                        const txMin = (cx + Math.sin(aMin) * textDist) - xOffset;
                        const tyMin = cy - Math.cos(aMin) * textDist;

                        const txMax = (cx + Math.sin(aMax) * textDist) + xOffset;
                        const tyMax = cy - Math.cos(aMax) * textDist;

                        const szMin = g.MeasureString("MIN", tinyFont, 0, 0, 500, 200);
                        const szMax = g.MeasureString("MAX", tinyFont, 0, 0, 500, 200);
                        g.DrawString("MIN", tinyFont, theme.tick, txMin - szMin.Width / 2, tyMin - szMin.Height / 2, szMin.Width + 4, szMin.Height + 2);
                        g.DrawString("MAX", tinyFont, theme.tick, txMax - szMax.Width / 2, tyMax - szMax.Height / 2, szMax.Width + 4, szMax.Height + 2);
                    } finally {
                        try { tinyFont.Dispose(); } catch {}
                    }
                }
                
            } else if (props.tickStyle === VolumeConstants.TICK_STYLE.DOT_ARC) {
                const rArc = rBase;
                const startDeg = config.ANGLE_MIN + config.ROTATION_OFFSET - 90;
                
                drawCustomArcDeg(g, cx, cy, rArc, startDeg, sweepTotal, Math.max(1, Math.round(cache.strokeWidth * 0.8 * sizeMul)), GdiUtils.setAlpha(theme.tick, 100));

                const rPip = rBase + span * 0.55;
                const rMaj = Math.max(3.5, Math.round(span * 0.16 * sizeMul));
                const rMin = Math.max(2.5, Math.round(span * 0.08 * sizeMul));

                for (let i = iMin; i <= iMax; i++) {
                    const a = cache.tickAngles[i];
                    const isMajor = VolumeConstants.isMajorTick(i, intervalMode) || intervalMode === VolumeConstants.MAJOR_INTERVAL.NONE;
                    const px = cx + Math.sin(a) * rPip;
                    const py = cy - Math.cos(a) * rPip;
                    const pipR = isMajor ? rMaj : rMin;
                    g.FillEllipse(px - pipR, py - pipR, pipR * 2, pipR * 2, isMajor ? theme.tick : GdiUtils.setAlpha(theme.tick, 160));
                    
                    if (isMajor || intervalMode === VolumeConstants.MAJOR_INTERVAL.NONE) {
                        g.DrawLine(cx + Math.sin(a) * rArc, cy - Math.cos(a) * rArc, cx + Math.sin(a) * (rPip - pipR), cy - Math.cos(a) * (rPip - pipR), Math.max(1, Math.round(cache.strokeWidth * 0.6 * sizeMul)), GdiUtils.setAlpha(theme.tick, 100));
                    }
                }
            }
        }
    }

    getScene(w, h, cache, props, theme, bgRenderer, dialRenderer, assetManager, config) {
        if (w <= 0 || h <= 0) return null;

        const dialBakesIntoBase = !props.spinDialImage; 
        const bgImagePath = props.customBgImage ? `${VolumeConstants.IMG_DIR}${props.customBgImage}` : '';
        const dialImagePath = props.customDialImage ? `${VolumeConstants.IMG_DIR}${props.customDialImage}` : '';

        const key = [
            w, h,
            props.theme, theme.bg, theme.knob, theme.tick, theme.inner,
            props.bgMode, bgImagePath,
            props.showOuterRing,
            props.showTicks, props.tickStyle, props.majorTickInterval,
            props.tickMargin, props.tickSizeBonus, props.sweepRange,
            props.showDropShadow,
            props.dialMode, dialImagePath, dialBakesIntoBase,
            props.showHighlight, props.dialLightStyle, props.dialLightStrength, props.dialLightAngle,
            props.levelArc, props.litTicks
        ].join('|');

        if (this.#bitmap && this.#key === key) return this.#bitmap;

        if (this.#bitmap?.Dispose) {
            try { this.#bitmap.Dispose(); } catch {}
        }
        this.#bitmap = null;
        this.#key = key;

        let bmp = null;
        try {
            bmp = gdi.CreateImage(w, h);
            const g = bmp.GetGraphics();
            try {
                g.SetSmoothingMode(2);

                const cx = cache.cx;
                const cy = cache.cy;

                const L = SceneCache.layout(cache, props);
                const { aoPad, sizeMul, rBase, rOuter, span } = L;

                const sweepTotal = config.ANGLE_MAX - config.ANGLE_MIN;

                // 1. Backplate
                bgRenderer.draw(g, w, h, props.bgMode, bgImagePath, theme, assetManager);

                // 2. Outer Knob Body
                if (props.showOuterRing) {
                    g.FillEllipse(cx - rOuter, cy - rOuter, rOuter * 2, rOuter * 2, theme.knob);
                }

                // 3. Ambient Occlusion Shadow
                if (props.showDropShadow && aoPad > 0) {
                    const aoSteps = Math.max(6, aoPad * 2);
                    for (let s = aoSteps; s >= 1; s--) {
                        const sp = (s / aoSteps) * aoPad;
                        const alpha = Math.round(((1 - (s / aoSteps)) ** 1.4) * 80);
                        if (alpha <= 0) continue;
                        const dia = cache.innerSize + sp * 2;
                        g.FillEllipse(cx - dia / 2, cy - dia / 2, dia, dia, GdiUtils.setAlpha(GdiUtils.colour(16, 16, 16), alpha));
                    }
                }

                // 3b. Level-arc track (dim ring; lit portion is drawn live)
                if (props.levelArc && cache.tickAngles) {
                    SceneCache.drawArc(g, cx, cy, L.arcR, cache.tickAngles[0], cache.tickAngles[config.TICK_COUNT - 1], L.arcW, SceneCache.dimColour(theme, props));
                }

                // 4. Tick Marks (8 Styles)
                if (props.showTicks && cache.tickAngles) {
                    SceneCache.drawTickMarks(g, {
                        props, cache, config, theme, cx, cy, rBase, span, sizeMul, sweepTotal,
                        tickCol: props.litTicks ? SceneCache.dimColour(theme, props) : theme.tick,
                        iMin: 0, iMax: config.TICK_COUNT - 1, overlay: false
                    });
                }

                // 5. Main Dial Face
                if (dialBakesIntoBase) {
                    const innerX = cache.cx - cache.innerSize / 2;
                    const innerY = cy - cache.innerSize / 2;
                    dialRenderer.draw(
                        g, innerX, innerY, cache.innerSize, props.dialMode, dialImagePath, 
                        theme, assetManager, bgRenderer, 0, false, props.dialLightStyle, props.dialLightAngle, props.dialLightStrength, props.showHighlight
                    );
                }
            } finally {
                bmp.ReleaseGraphics(g);
            }

            this.#bitmap = bmp;
            bmp = null;
            return this.#bitmap;
        } catch {
            if (bmp?.Dispose) { try { bmp.Dispose(); } catch {} }
            return null;
        }
    }
}

// ============================================================================================
// 10. DYNAMIC CONFIGURATION & VOLUME MATH
// ============================================================================================
class VolumeConfig {
    static DRAG_SCALE = 0.5;
    static SNAP_TOLERANCE_DB = 0.2;
    static BASE_PADDING = 14;
    static DRAG_FOLLOW_SPEED = 1.0;
    static RELEASE_EASING = 0.20;
    static ANGLE_EPSILON = 0.05;
    static ANIMATION_INTERVAL = Math.floor(1000 / 60);
    static TICK_COUNT = 21;
    static ROTATION_OFFSET = -270;
    static INNER_RATIO = 0.92;
    static TICK_LENGTH_RATIO = 0.058;
    static MARKER_WIDTH_RATIO = 0.010;
    static VOL_BREAKPOINT_1 = 20;
    static VOL_BREAKPOINT_2 = 50;
    static DB_BREAKPOINT_1 = -15;
    static DB_BREAKPOINT_2 = -8.5;

    static sweepRangeDeg = 290;

    static get ANGLE_MIN() { return VolumeConstants.SWEEP_CENTER - this.sweepRangeDeg / 2; }
    static get ANGLE_MAX() { return VolumeConstants.SWEEP_CENTER + this.sweepRangeDeg / 2; }
    static get SWEEP_TOTAL() { return this.ANGLE_MAX - this.ANGLE_MIN; }
    static get WHEEL_STEP_DEG() { return this.SWEEP_TOTAL / (this.TICK_COUNT - 1) / 2; }
}

const VOL_SLOPE_1 = (VolumeConfig.DB_BREAKPOINT_1 + 100) / VolumeConfig.VOL_BREAKPOINT_1;
const VOL_SLOPE_2 = (VolumeConfig.DB_BREAKPOINT_2 - VolumeConfig.DB_BREAKPOINT_1) / (VolumeConfig.VOL_BREAKPOINT_2 - VolumeConfig.VOL_BREAKPOINT_1);
const VOL_SLOPE_3 = Math.abs(VolumeConfig.DB_BREAKPOINT_2) / (100 - VolumeConfig.VOL_BREAKPOINT_2);

// ============================================================================================
// 11. STATE MANAGEMENT (SUB-RECT INVALIDATION & ZERO-IDLE)
// ============================================================================================
class VolumeState {
    dragging = false;
    hasDragged = false;
    dragStartX = 0;
    dragStartY = 0;
    lastX = 0;
    lastY = 0;
    uiVolume = 50;
    currentAngle = 0;
    targetAngle = 0;
    dragTargetAngle = 0;
    needsRepaint = false;
    isMuted = false;

    #animationTimer = null;
    muteResyncTimer = null;

    geometryCache = {
        valid: false, width: 0, height: 0, hasShadow: false, levelArc: false,
        tickMargin: 0, tickSizeBonus: 0, sweepRange: 290,
        cx: 0, cy: 0, size: 0, radius: 0, innerSize: 0,
        rOuter: 0, tickLength: 0, strokeWidth: 2, markerWidth: 2, tickAngles: []
    };

    updateGeometryCache(w, h, props) {
        const cache = this.geometryCache;
        const hasShadow = props ? props.showDropShadow : true;
        const levelArc = props ? Boolean(props.levelArc) : false;
        const tickMargin = props ? (props.tickMargin || 0) : 0;
        const tickSizeBonus = props ? (props.tickSizeBonus || 0) : 0;
        const sweepRange = VolumeConfig.sweepRangeDeg;
        if (
            cache.valid &&
            cache.width === w &&
            cache.height === h &&
            cache.hasShadow === hasShadow &&
            cache.levelArc === levelArc &&
            cache.tickMargin === tickMargin &&
            cache.tickSizeBonus === tickSizeBonus &&
            cache.sweepRange === sweepRange
        ) return;

        const padBase = hasShadow ? Math.max(4, Math.round(VolumeConfig.BASE_PADDING * 0.65)) : VolumeConfig.BASE_PADDING;
        const padding = GdiUtils.scale(padBase);
        const innerRatio = hasShadow ? 0.89 : VolumeConfig.INNER_RATIO;
        
        const marginPx = GdiUtils.scale(tickMargin) + SceneCache.arcBand(props);
        const sizeMul = 1.0 + (tickSizeBonus / 100);
        const tickRatio = VolumeConfig.TICK_LENGTH_RATIO * sizeMul;

        const expansionAllowance = marginPx * 2 + (GdiUtils.scale(20) * (tickSizeBonus / 100));

        cache.width  = w;
        cache.height = h;
        cache.hasShadow = hasShadow;
        cache.levelArc = levelArc;
        cache.tickMargin = tickMargin;
        cache.tickSizeBonus = tickSizeBonus;
        cache.sweepRange = sweepRange;
        cache.cx = Math.floor(w / 2);
        cache.cy = Math.floor(h / 2);
        cache.size = Math.max(10, Math.min(w, h) - padding * 2);
        cache.radius = Math.floor(cache.size * 0.5);
        
        const calculatedInner = Math.max(cache.size * 0.35, (cache.size * innerRatio) - expansionAllowance);
        cache.innerSize = Math.floor(calculatedInner / 2) * 2;
        cache.tickLength = cache.size * tickRatio;
        cache.strokeWidth = Math.max(1, GdiUtils.scale(2));
        cache.markerWidth = Math.max(1, Math.round(cache.size * VolumeConfig.MARKER_WIDTH_RATIO));

        const rInner = cache.innerSize / 2;
        const aoPad = hasShadow ? Math.max(2, Math.round(cache.size * 0.014)) : 0;
        const rBase = rInner + aoPad + marginPx;
        cache.rOuter = Math.min(cache.radius, rBase + (cache.tickLength * 1.6 * sizeMul));

        cache.tickAngles = [];
        for (let i = 0; i < VolumeConfig.TICK_COUNT; i++) {
            cache.tickAngles[i] = (VolumeConfig.ANGLE_MIN + i / (VolumeConfig.TICK_COUNT - 1) * VolumeConfig.SWEEP_TOTAL + VolumeConfig.ROTATION_OFFSET) * VolumeConstants.DEG2RAD;
        }

        cache.valid = true;
    }

    invalidateGeometry() { this.geometryCache.valid = false; }

    cleanup() {
        this.stopAnimation();
        if (this.muteResyncTimer) { window.ClearTimeout(this.muteResyncTimer); this.muteResyncTimer = null; }
        this.geometryCache.tickAngles = null;
    }

    stopAnimation() {
        if (this.#animationTimer) { window.ClearInterval(this.#animationTimer); this.#animationTimer = null; }
    }

    startAnimation() {
        if (this.#animationTimer || !window.IsVisible) return;
        this.#animationTimer = window.SetInterval(() => {
            if (!window.IsVisible) {
                this.stopAnimation();
                return;
            }

            const prev = this.currentAngle;
            if (this.dragging) {
                this.currentAngle += (this.dragTargetAngle - this.currentAngle) * VolumeConfig.DRAG_FOLLOW_SPEED;
            } else {
                this.currentAngle += (this.targetAngle - this.currentAngle) * VolumeConfig.RELEASE_EASING;
            }

            const settled = Math.abs(this.currentAngle - this.targetAngle) < VolumeConfig.ANGLE_EPSILON;
            if (settled) this.currentAngle = this.targetAngle;

            if (this.needsRepaint || Math.abs(this.currentAngle - prev) > 0.001) {
                this.requestSubRectRepaint();
                this.needsRepaint = false;
            } else if (settled && !this.dragging) {
                this.stopAnimation();
            }
        }, VolumeConfig.ANIMATION_INTERVAL);
    }

    requestSubRectRepaint() {
        if (!window.IsVisible) return;

        if (!this.geometryCache.valid || HudManager.activeSlider) {
            window.Repaint();
            return;
        }
        const c = this.geometryCache;
        const pad = Math.max(12, GdiUtils.scale(16));
        const rBound = Math.ceil(c.rOuter || c.radius) + pad;
        const rx = Math.max(0, c.cx - rBound);
        const ry = Math.max(0, c.cy - rBound);
        const rw = Math.min(window.Width - rx, rBound * 2);
        const rh = Math.min(window.Height - ry, rBound * 2);

        if (rw > 0 && rh > 0) {
            window.RepaintRect(rx, ry, rw, rh);
        } else {
            window.Repaint();
        }
    }

    requestRepaint() {
        this.needsRepaint = true;
        this.startAnimation();
        this.requestSubRectRepaint();
    }
}

// ============================================================================================
// 12. VOLUME ENGINE
// ============================================================================================
class VolumeEngine {
    static uiToDb(v, props) {
        if (props && props.volumeScalingMode === 1) return -100 + v;
        if (v <= VolumeConfig.VOL_BREAKPOINT_1) return -100 + v * VOL_SLOPE_1;
        if (v <= VolumeConfig.VOL_BREAKPOINT_2) return VolumeConfig.DB_BREAKPOINT_1 + (v - VolumeConfig.VOL_BREAKPOINT_1) * VOL_SLOPE_2;
        return VolumeConfig.DB_BREAKPOINT_2 + (v - VolumeConfig.VOL_BREAKPOINT_2) * VOL_SLOPE_3;
    }

    static dbToUi(db, props) {
        db = GdiUtils.clamp(db, -100, 0);
        if (props && props.volumeScalingMode === 1) return db + 100;
        if (db <= VolumeConfig.DB_BREAKPOINT_1) return (db + 100) / VOL_SLOPE_1;
        if (db <= VolumeConfig.DB_BREAKPOINT_2) return VolumeConfig.VOL_BREAKPOINT_1 + (db - VolumeConfig.DB_BREAKPOINT_1) / VOL_SLOPE_2;
        return VolumeConfig.VOL_BREAKPOINT_2 + (db - VolumeConfig.DB_BREAKPOINT_2) / VOL_SLOPE_3;
    }

    static uiToAngle(v) { return VolumeConfig.ANGLE_MIN + (v / 100) * VolumeConfig.SWEEP_TOTAL; }
    static angleToUi(angle) { return GdiUtils.clamp(((angle - VolumeConfig.ANGLE_MIN) / VolumeConfig.SWEEP_TOTAL) * 100, 0, 100); }

    static applySnap(db, props) {
        if (Math.abs(db) <= VolumeConfig.SNAP_TOLERANCE_DB) return 0;
        if (props && props.volumeScalingMode !== 1) {
            if (Math.abs(db - VolumeConfig.DB_BREAKPOINT_2) <= VolumeConfig.SNAP_TOLERANCE_DB) return VolumeConfig.DB_BREAKPOINT_2;
        }
        return db;
    }

    static refreshMuteState(state) {
        try {
            state.isMuted = fb.IsMainMenuCommandChecked('Playback/Volume/Mute');
        } catch {
            state.isMuted = false;
        }
    }

    static syncFromFoobar(state, props, snap = true) {
        const prevMuted = state.isMuted;
        const prevTarget = state.targetAngle;
        const prevCurrent = state.currentAngle;
        this.refreshMuteState(state);
        try {
            const fbVol = GdiUtils.clamp(fb.Volume, -100, 0);
            state.uiVolume = this.dbToUi(fbVol, props);
            state.targetAngle = state.dragTargetAngle = this.uiToAngle(state.uiVolume);
            if (snap) state.currentAngle = state.targetAngle;

            const muteChanged = prevMuted !== state.isMuted;
            const angleChanged = Math.abs(prevTarget - state.targetAngle) > 0.001 || Math.abs(prevCurrent - state.currentAngle) > 0.001;
            if (muteChanged || angleChanged) {
                if (snap || Math.abs(state.currentAngle - state.targetAngle) < VolumeConfig.ANGLE_EPSILON) {
                    state.currentAngle = state.targetAngle;
                    state.requestSubRectRepaint();
                } else {
                    state.requestRepaint();
                }
            }
        } catch {}
    }

    static setFoobarVolume(uiVol, skipSnap, state, props) {
        try {
            const db = this.uiToDb(uiVol, props);
            const newDb = skipSnap ? db : this.applySnap(db, props);
            if (Math.abs(newDb - fb.Volume) > 0.001) {
                fb.Volume = newDb;
                if (!skipSnap && newDb !== db) {
                    state.uiVolume = this.dbToUi(newDb, props);
                    state.targetAngle = state.dragTargetAngle = this.uiToAngle(state.uiVolume);
                }
                this.refreshMuteState(state);
            }
        } catch {}
    }
}

// ============================================================================================
// 13. MAIN RENDERER (LOW-ALLOCATION VECTOR PIPELINE)
// ============================================================================================
class MainRenderer {
    #flat3 = [0, 0, 0, 0, 0, 0];
    #pts3  = [[0, 0], [0, 0], [0, 0]];
    #flat4 = [0, 0, 0, 0, 0, 0, 0, 0];
    #pts4  = [[0, 0], [0, 0], [0, 0], [0, 0]];

    draw(gr, w, h, state, themes, properties, sceneCache, dialRenderer, bgRenderer, assetManager) {
        if (w <= 10 || h <= 10 || !window.IsVisible) return;
        state.updateGeometryCache(w, h, properties.values);
        const cache = state.geometryCache;
        const theme = themes.get(properties.values.theme);
        const props = properties.values;

        if (!cache.tickAngles) return;
        gr.SetSmoothingMode(2);

        try {
            const isMuted = state.isMuted;

            gr.SetInterpolationMode(2);
            const baseBmp = sceneCache.getScene(w, h, cache, props, theme, bgRenderer, dialRenderer, assetManager, VolumeConfig);
            if (baseBmp) gr.DrawImage(baseBmp, 0, 0, w, h, 0, 0, w, h);

            if (props.spinDialImage) {
                const rotationAngleDeg = state.currentAngle + VolumeConfig.ROTATION_OFFSET;
                const innerX = cache.cx - cache.innerSize / 2;
                const innerY = cache.cy - cache.innerSize / 2;
                const dialImagePath = props.customDialImage ? `${VolumeConstants.IMG_DIR}${props.customDialImage}` : '';
                dialRenderer.draw(
                    gr, innerX, innerY, cache.innerSize, props.dialMode, dialImagePath, 
                    theme, assetManager, bgRenderer, rotationAngleDeg, true, props.dialLightStyle, props.dialLightAngle, props.dialLightStrength, props.showHighlight
                );
            }

            if (props.levelArc || (props.litTicks && props.showTicks)) {
                const frac = GdiUtils.clamp((state.currentAngle - VolumeConfig.ANGLE_MIN) / VolumeConfig.SWEEP_TOTAL, 0, 1);
                if (!isMuted && frac > 0.002) {
                    const accent = SceneCache.accentColour(props, theme);
                    const L = SceneCache.layout(cache, props);
                    const N = VolumeConfig.TICK_COUNT;
                    if (props.levelArc) {
                        const a0 = cache.tickAngles[0];
                        const a1 = a0 + (cache.tickAngles[N - 1] - a0) * frac;
                        SceneCache.drawArc(gr, cache.cx, cache.cy, L.arcR, a0, a1, L.arcW + 4, GdiUtils.setAlpha(accent, 50));
                        SceneCache.drawArc(gr, cache.cx, cache.cy, L.arcR, a0, a1, L.arcW, accent);
                    }
                    if (props.litTicks && props.showTicks) {
                        let iMax = -1;
                        for (let i = 0; i < N; i++) if (i / (N - 1) <= frac + 1e-6) iMax = i;
                        if (iMax >= 0) {
                            SceneCache.drawTickMarks(gr, {
                                props, cache, config: VolumeConfig, theme,
                                cx: cache.cx, cy: cache.cy, rBase: L.rBase, span: L.span, sizeMul: L.sizeMul,
                                sweepTotal: VolumeConfig.SWEEP_TOTAL, tickCol: accent,
                                iMin: 0, iMax, overlay: true
                            });
                        }
                    }
                }
            }

            if (props.showDialMarker) {
                const rotationAngleDeg = state.currentAngle + VolumeConfig.ROTATION_OFFSET;
                const rad = rotationAngleDeg * VolumeConstants.DEG2RAD;
                const sr  = Math.sin(rad);
                const cr  = Math.cos(rad);
                const markerCol = GdiUtils.setAlpha(theme.marker, isMuted ? 90 : 255);

                const style = props.markerStyle;
                const cx = cache.cx, cy = cache.cy, size = cache.size, rDial = cache.innerSize / 2;

                const f3 = this.#flat3, p3 = this.#pts3;
                const f4 = this.#flat4, p4 = this.#pts4;

                const drawFacet3 = (col, x1, y1, x2, y2, x3, y3, overlayAlpha, isHighlight) => {
                    f3[0] = x1; f3[1] = y1; f3[2] = x2; f3[3] = y2; f3[4] = x3; f3[5] = y3;
                    p3[0][0] = x1; p3[0][1] = y1;
                    p3[1][0] = x2; p3[1][1] = y2;
                    p3[2][0] = x3; p3[2][1] = y3;
                    try {
                        gr.FillPolygon(col, 0, f3);
                    } catch {
                        try { gr.FillPolygon(col, 0, p3); } catch {}
                    }
                    if (overlayAlpha > 0) {
                        const finalAlpha = isMuted ? Math.round(overlayAlpha * 0.35) : overlayAlpha;
                        const overlay = isHighlight 
                            ? GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), finalAlpha) 
                            : GdiUtils.setAlpha(GdiUtils.colour(0, 0, 0), finalAlpha);
                        try {
                            gr.FillPolygon(overlay, 0, f3);
                        } catch {
                            try { gr.FillPolygon(overlay, 0, p3); } catch {}
                        }
                    }
                };

                const drawFacet4 = (col, x1, y1, x2, y2, x3, y3, x4, y4, overlayAlpha, isHighlight) => {
                    f4[0] = x1; f4[1] = y1; f4[2] = x2; f4[3] = y2; f4[4] = x3; f4[5] = y3; f4[6] = x4; f4[7] = y4;
                    p4[0][0] = x1; p4[0][1] = y1;
                    p4[1][0] = x2; p4[1][1] = y2;
                    p4[2][0] = x3; p4[2][1] = y3;
                    p4[3][0] = x4; p4[3][1] = y4;
                    try {
                        gr.FillPolygon(col, 0, f4);
                    } catch {
                        try { gr.FillPolygon(col, 0, p4); } catch {}
                    }
                    if (overlayAlpha > 0) {
                        const finalAlpha = isMuted ? Math.round(overlayAlpha * 0.35) : overlayAlpha;
                        const overlay = isHighlight 
                            ? GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), finalAlpha) 
                            : GdiUtils.setAlpha(GdiUtils.colour(0, 0, 0), finalAlpha);
                        try {
                            gr.FillPolygon(overlay, 0, f4);
                        } catch {
                            try { gr.FillPolygon(overlay, 0, p4); } catch {}
                        }
                    }
                };

                if (style === VolumeConstants.MARKER_STYLE.LINE) {
                    gr.DrawLine(cx + sr * rDial * 0.50, cy - cr * rDial * 0.50, cx + sr * rDial * 0.975, cy - cr * rDial * 0.975, cache.markerWidth, markerCol);
                } else if (style === VolumeConstants.MARKER_STYLE.CIRCLE) {
                    const dotCenter = rDial * 0.80, dotRad = Math.max(3, Math.round(size * 0.028));
                    gr.FillEllipse(cx + sr * dotCenter - dotRad, cy - cr * dotCenter - dotRad, dotRad * 2, dotRad * 2, markerCol);
                } else if (style === VolumeConstants.MARKER_STYLE.ARROW) {
                    const tipX = cx + sr * rDial * 0.95, tipY = cy - cr * rDial * 0.95;
                    const baseDist = rDial * 0.82, halfW = size * 0.030;
                    drawFacet3(
                        markerCol,
                        tipX, tipY,
                        cx + sr * baseDist + cr * halfW, cy - cr * baseDist + sr * halfW,
                        cx + sr * baseDist - cr * halfW, cy - cr * baseDist - sr * halfW,
                        0, false
                    );
                } else if (style === VolumeConstants.MARKER_STYLE.SHORT) {
                    gr.DrawLine(cx + sr * rDial * 0.618, cy - cr * rDial * 0.618, cx + sr * rDial * 0.975, cy - cr * rDial * 0.975, cache.markerWidth, markerCol);
                } else if (style === VolumeConstants.MARKER_STYLE.BEVEL_WEDGE) {
                    const rT = rDial * 0.96, rB = rDial * 0.618, wE = cache.markerWidth * 1.5; 
                    const srRT = sr * rT, crRT = cr * rT;
                    const srRB = sr * rB, crRB = cr * rB;

                    const tX  = cx + srRT,          tY  = cy - crRT;
                    const blX = cx + srRB - cr * wE, blY = cy - crRB - sr * wE;
                    const brX = cx + srRB + cr * wE, brY = cy - crRB + sr * wE;
                    const rC  = rB + rDial * 0.05;
                    const bcX = cx + sr * rC,       bcY = cy - cr * rC;

                    const lightRad = (((props.dialLightAngle ?? 315) % 360 + 360) % 360) * VolumeConstants.DEG2RAD;
                    const sL = Math.sin(lightRad), cL = Math.cos(lightRad);
                    const dotRadial  = sr * sL + cr * cL;
                    const dotTangent = cr * sL - sr * cL;

                    const getShadeFromDot = (dot) => {
                        return dot > 0 ? { a: Math.round(dot * 160), hi: true } : { a: Math.round(-dot * 220), hi: false };
                    };

                    drawFacet3(markerCol, tX, tY, blX, blY, brX, brY, 80, false);

                    const dot1 = dotRadial * VolumeConstants.COS_WEDGE_PHI - dotTangent * VolumeConstants.SIN_WEDGE_PHI;
                    const s1 = getShadeFromDot(dot1);
                    drawFacet3(markerCol, tX, tY, blX, blY, bcX, bcY, s1.a, s1.hi);

                    const dot2 = dotRadial * VolumeConstants.COS_WEDGE_PHI + dotTangent * VolumeConstants.SIN_WEDGE_PHI;
                    const s2 = getShadeFromDot(dot2);
                    drawFacet3(markerCol, tX, tY, bcX, bcY, brX, brY, s2.a, s2.hi);

                    const s3 = getShadeFromDot(dotRadial);
                    drawFacet3(markerCol, blX, blY, brX, brY, bcX, bcY, s3.a, s3.hi);

                } else if (style === VolumeConstants.MARKER_STYLE.BEVEL_SLOT) {
                    const rT = rDial * 0.96, rB = rDial * 0.618, wOut = cache.markerWidth * 1.2, wIn = cache.markerWidth * 0.6, inset = rDial * 0.02;
                    const srRT = sr * rT, crRT = cr * rT;
                    const srRB = sr * rB, crRB = cr * rB;
                    const srWOut = sr * wOut, crWOut = cr * wOut;

                    const tlOX = cx + srRT - crWOut, tlOY = cy - crRT - srWOut;
                    const trOX = cx + srRT + crWOut, trOY = cy - crRT + srWOut;
                    const blOX = cx + srRB - crWOut, blOY = cy - crRB - srWOut;
                    const brOX = cx + srRB + crWOut, brOY = cy - crRB + srWOut;

                    const rTIn = rT - inset, rBIn = rB + inset;
                    const srRTIn = sr * rTIn, crRTIn = cr * rTIn;
                    const srRBIn = sr * rBIn, crRBIn = cr * rBIn;
                    const srWIn = sr * wIn, crWIn = cr * wIn;

                    const tlIX = cx + srRTIn - crWIn, tlIY = cy - crRTIn - srWIn;
                    const trIX = cx + srRTIn + crWIn, trIY = cy - crRTIn + srWIn;
                    const blIX = cx + srRBIn - crWIn, blIY = cy - crRBIn - srWIn;
                    const brIX = cx + srRBIn + crWIn, brIY = cy - crRBIn + srWIn;

                    const lightRad = (((props.dialLightAngle ?? 315) % 360 + 360) % 360) * VolumeConstants.DEG2RAD;
                    const sL = Math.sin(lightRad), cL = Math.cos(lightRad);
                    const dotRadial  = sr * sL + cr * cL;
                    const dotTangent = cr * sL - sr * cL;

                    const getShadeFromDot = (dot) => {
                        return dot > 0 ? { a: Math.round(dot * 160), hi: true } : { a: Math.round(-dot * 220), hi: false };
                    };

                    drawFacet4(markerCol, tlIX, tlIY, trIX, trIY, brIX, brIY, blIX, blIY, 180, false);

                    const sLeft = getShadeFromDot(-dotTangent);
                    drawFacet4(markerCol, tlOX, tlOY, tlIX, tlIY, blIX, blIY, blOX, blOY, sLeft.a, sLeft.hi);

                    const sRight = getShadeFromDot(dotTangent);
                    drawFacet4(markerCol, trOX, trOY, trIX, trIY, brIX, brIY, brOX, brOY, sRight.a, sRight.hi);

                    const sTop = getShadeFromDot(-dotRadial);
                    drawFacet4(markerCol, tlOX, tlOY, trOX, trOY, trIX, trIY, tlIX, tlIY, sTop.a, sTop.hi);

                    const sBottom = getShadeFromDot(dotRadial);
                    drawFacet4(markerCol, blOX, blOY, brOX, brOY, brIX, brIY, blIX, blIY, sBottom.a, sBottom.hi);

                } else if (style === VolumeConstants.MARKER_STYLE.VSHORT) {
                    gr.DrawLine(cx + sr * rDial * 0.80, cy - cr * rDial * 0.80, cx + sr * rDial * 1.00, cy - cr * rDial * 1.00, cache.markerWidth, markerCol);
                } else if (style === VolumeConstants.MARKER_STYLE.LED_DOT) {
                    const glow = SceneCache.accentColour(props, theme);
                    const dc = rDial * 0.82, dr = Math.max(3, Math.round(size * 0.026));
                    const px = cx + sr * dc, py = cy - cr * dc;
                    if (!isMuted) {
                        gr.FillEllipse(px - dr * 1.45, py - dr * 1.45, dr * 2.9, dr * 2.9, GdiUtils.setAlpha(glow, 40));
                        gr.FillEllipse(px - dr * 1.2, py - dr * 1.2, dr * 2.4, dr * 2.4, GdiUtils.setAlpha(glow, 70));
                    }
                    gr.FillEllipse(px - dr, py - dr, dr * 2, dr * 2, GdiUtils.setAlpha(glow, isMuted ? 90 : 255));
                    gr.FillEllipse(px - dr * 0.45, py - dr * 0.85, dr * 0.7, dr * 0.7, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), isMuted ? 40 : 170));
                } else if (style === VolumeConstants.MARKER_STYLE.GLOW_LINE) {
                    const glow = SceneCache.accentColour(props, theme);
                    const x1 = cx + sr * rDial * 0.52, y1 = cy - cr * rDial * 0.52;
                    const x2 = cx + sr * rDial * 0.96, y2 = cy - cr * rDial * 0.96;
                    if (!isMuted) {
                        gr.DrawLine(x1, y1, x2, y2, cache.markerWidth + 6, GdiUtils.setAlpha(glow, 45));
                        gr.DrawLine(x1, y1, x2, y2, cache.markerWidth + 3, GdiUtils.setAlpha(glow, 90));
                    }
                    gr.DrawLine(x1, y1, x2, y2, cache.markerWidth + 1, GdiUtils.setAlpha(glow, isMuted ? 90 : 255));
                    gr.DrawLine(x1, y1, x2, y2, 1, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), isMuted ? 30 : 150));
                } else if (style === VolumeConstants.MARKER_STYLE.GROOVE) {
                    const glow = SceneCache.accentColour(props, theme);
                    const x1 = cx + sr * rDial * 0.60, y1 = cy - cr * rDial * 0.60;
                    const x2 = cx + sr * rDial * 0.96, y2 = cy - cr * rDial * 0.96;
                    const slotW = cache.markerWidth * 2.4 + 2;
                    const off = slotW / 2;
                    gr.DrawLine(x1, y1, x2, y2, slotW, GdiUtils.setAlpha(GdiUtils.colour(0, 0, 0), 150));
                    gr.DrawLine(x1 + cr * off, y1 + sr * off, x2 + cr * off, y2 + sr * off, 1, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), 38));
                    gr.DrawLine(x1, y1, x2, y2, Math.max(1, Math.round(cache.markerWidth * 0.9)), GdiUtils.setAlpha(glow, isMuted ? 90 : 235));
                } else if (style === VolumeConstants.MARKER_STYLE.FULL_LINE) {
                    gr.DrawLine(cx, cy, cx + sr * rDial * 0.975, cy - cr * rDial * 0.975, cache.markerWidth + 2, markerCol);
                }
            }

            if (HudManager.activeSlider) {
                const barW = Math.min(240, Math.round(w * 0.70)), barH = 6, pad = 12, boxW = barW + pad * 2, boxH = 44;
                const bx = Math.floor((w - boxW) / 2), by = h - boxH - 12;
                const font = HudManager.getFont(10, true);
                let valStr = '', ratio = 0;

                if (HudManager.activeSlider === 'TickMargin') {
                    const val = props.tickMargin;
                    valStr = `Tick Margin: ${val} px`;
                    ratio = val / 30;
                } else if (HudManager.activeSlider === 'TickSize') {
                    const val = props.tickSizeBonus;
                    valStr = val === 0 ? 'Tick Size: Default' : `Tick Size: +${val}%`;
                    ratio = val / 100;
                } else if (HudManager.activeSlider === 'LightStrength') {
                    const val = props.dialLightStrength;
                    valStr = val === 0 ? 'Highlight Strength: Off' : `Highlight Strength: ${val}%`;
                    ratio = val / 200;
                } else if (HudManager.activeSlider === 'LightAngle') {
                    const val = props.dialLightAngle;
                    valStr = `Highlight Position: ${val}°`;
                    ratio = val / 359;
                }

                gr.FillSolidRect(bx, by, boxW, boxH, GdiUtils.setAlpha(GdiUtils.colour(14, 15, 18), 225));
                gr.DrawRect(bx, by, boxW, boxH, 1, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), 55));

                if (font) {
                    const lSize = gr.MeasureString(valStr, font, 0, 0, 9999, 9999);
                    gr.DrawString(valStr, font, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), 235), (w - lSize.Width) / 2, by + 6, lSize.Width + 4, lSize.Height + 2);
                }

                const trackX = bx + pad, trackY = by + 26;
                gr.FillSolidRect(trackX, trackY, barW, barH, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), 45));
                gr.FillSolidRect(trackX, trackY, Math.round(barW * ratio), barH, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), 210));
            }

        } catch {}
    }
}

// ============================================================================================
// 14. INPUT MANAGER
// ============================================================================================
class InputManager {
    static hitTest(x, y, state, w, h, props) {
        state.updateGeometryCache(w, h, props);
        const c = state.geometryCache;
        return c.valid && (((x - c.cx) ** 2 + (y - c.cy) ** 2) <= c.radius ** 2);
    }

    static handleDragStart(x, y, state, w, h, props) {
        if (HudManager.activeSlider) {
            HudManager.activeSlider = null;
            HudManager.clearTimer();
            window.Repaint();
            return true;
        }
        if (!this.hitTest(x, y, state, w, h, props)) return false;

        state.dragging = true;
        state.hasDragged = false;
        state.dragStartX = x;
        state.dragStartY = y;
        state.lastX = x;
        state.lastY = y;
        return true;
    }

    static handleDragEnd(state, props) {
        if (!state.dragging) return false;
        const didDrag = state.hasDragged;
        state.dragging = false;
        state.hasDragged = false;
        if (!didDrag) return true;

        VolumeEngine.setFoobarVolume(state.uiVolume, false, state, props);
        VolumeEngine.refreshMuteState(state);
        state.targetAngle = state.dragTargetAngle;
        state.requestRepaint();
        return true;
    }

    static handleDragMove(x, y, state, props) {
        if (!state.dragging) return false;

        if (!state.hasDragged) {
            const threshold = Math.max(3, GdiUtils.scale(3));
            if (Math.hypot(x - state.dragStartX, y - state.dragStartY) < threshold) {
                return true;
            }
            state.hasDragged = true;
            state.lastX = x;
            state.lastY = y;
            state.startAnimation();
            return true;
        }

        const delta = ((x - state.lastX) + (state.lastY - y)) * VolumeConfig.DRAG_SCALE;
        if (delta === 0) return true;
        state.lastX = x;
        state.lastY = y;

        const v = GdiUtils.clamp(Math.round((state.uiVolume + delta) * 10) / 10, 0, 100);
        if (v !== state.uiVolume) {
            state.uiVolume = v;
            state.dragTargetAngle = state.targetAngle = VolumeEngine.uiToAngle(v);
            VolumeEngine.setFoobarVolume(v, true, state, props);
            state.needsRepaint = true;
            state.startAnimation();
        }
        return true;
    }

    static handleWheel(step, state, props) {
        const stepDeg = VolumeConfig.WHEEL_STEP_DEG;
        const rawAngle = VolumeEngine.uiToAngle(state.uiVolume) + step * stepDeg;
        const snapped  = Math.round((rawAngle - VolumeConfig.ANGLE_MIN) / stepDeg) * stepDeg + VolumeConfig.ANGLE_MIN;
        const newAngle = GdiUtils.clamp(snapped, VolumeConfig.ANGLE_MIN, VolumeConfig.ANGLE_MAX);
        const v        = GdiUtils.clamp(VolumeEngine.angleToUi(newAngle), 0, 100);
        if (v !== state.uiVolume) {
            state.uiVolume = v;
            state.dragTargetAngle = state.targetAngle = newAngle;
            VolumeEngine.setFoobarVolume(v, true, state, props);
            state.requestRepaint();
        }
        return true;
    }

    static handleDoubleClick(x, y, state, w, h, props, mask = 0) {
        if (utils.IsKeyPressed(0x11) || (mask & 8)) return false;

        if (!this.hitTest(x, y, state, w, h, props)) return false;
        state.dragging = false;
        state.hasDragged = false;
        try {
            fb.RunMainMenuCommand('Playback/Volume/Mute');
            VolumeEngine.refreshMuteState(state);
            if (state.muteResyncTimer) { window.ClearTimeout(state.muteResyncTimer); state.muteResyncTimer = null; }
            state.muteResyncTimer = window.SetTimeout(() => {
                state.muteResyncTimer = null;
                VolumeEngine.syncFromFoobar(state, props);
                state.requestRepaint();
            }, 50);
        } catch {}
        state.requestRepaint();
        return true;
    }
}

// ============================================================================================
// 15. CONTEXT MENU MANAGER (DECLARATIVE MENU BUILDER)
// ============================================================================================
class ContextMenuManager {
    constructor(controller) {
        this.controller = controller;
    }

    #doColorPicker(label, key) {
        const applied = this.controller.properties.values.theme;

        if (applied !== 'Custom' && applied !== '~Preview') {
            this.controller.themes.seedDraftFromTheme(this.controller.themes.get(applied));
        }

        const d = this.controller.themes.draftTheme;
        const startArgb = d[key] >>> 0;
        let picked;
        try { picked = utils.ColourPicker(window.ID, startArgb); } catch { return; }
        if (picked === -1) return;

        const newArgb = (0xFF000000 | picked) >>> 0;
        if (newArgb === startArgb) return;

        this.controller.themes.updateDraft(key, newArgb);

        const t = this.controller.themes.makeTheme(
            'Custom',
            this.controller.themes.draftTheme.bg,
            this.controller.themes.draftTheme.knob,
            this.controller.themes.draftTheme.inner,
            this.controller.themes.draftTheme.tick,
            this.controller.themes.draftTheme.marker
        );
        t.custom = true;
        this.controller.themes.addOrUpdate(t, true, this.controller.properties);

        this.controller.properties.setTheme('Custom', this.controller.themes, false);
        this.controller.state.invalidateGeometry();
        this.controller.sceneCache.invalidate(this.controller.bgRenderer, this.controller.dialRenderer);
        this.controller.state.requestRepaint();
    }

    #doFinalizeTheme() {
        const draft = this.controller.themes.draftTheme;
        let name = GdiUtils.prompt('Enter a name for your custom theme:', 'Save Theme', draft.name !== 'Custom' ? draft.name : 'My Custom Theme');
        if (!name?.trim()) return;
        name = name.trim();

        if (name === '~Preview' || this.controller.themes.isBuiltin(name)) {
            fb.ShowPopupMessage(`"${name}" is a reserved name. Choose a different name.`, VolumeConstants.SCRIPT_NAME);
            return;
        }

        const currentStyleSettings = this.controller.properties.getStyleSettings();
        const d = this.controller.themes.draftTheme;
        const t = this.controller.themes.makeTheme(name, d.bg, d.knob, d.inner, d.tick, d.marker, currentStyleSettings);
        t.custom = true;

        this.controller.themes.addOrUpdate(t, true, this.controller.properties);
        this.controller.properties.setTheme(name, this.controller.themes, true, this.controller.state);
        this.controller.state.invalidateGeometry();
        this.controller.sceneCache.invalidate(this.controller.bgRenderer, this.controller.dialRenderer);
        this.controller.state.requestRepaint();

        const savePath = this.controller.properties.values.customThemeFile;
        if (savePath?.trim()) {
            this.controller.themes.saveToFile(savePath, null, this.controller.properties);
        }
        fb.ShowPopupMessage(`Theme "${name}" saved!`, VolumeConstants.SCRIPT_NAME);
    }

    doRandom() {
        const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
        const coin = () => Math.random() < 0.5;

        const names = this.controller.themes.names();
        const chosen = names[Math.floor(Math.random() * names.length)];
        let customDraftMixed = false;

        if (Math.random() < 0.30) {
            const otherThemes = this.controller.themes.themes.filter(t => t.name !== chosen && t.name !== '~Preview');
            if (otherThemes.length > 0) {
                const randOther = otherThemes[rand(0, otherThemes.length - 1)];
                this.controller.themes.seedDraftFromTheme(this.controller.themes.get(chosen));
                this.controller.themes.updateDraft('knob', randOther.knob);
                customDraftMixed = true;
            }
        }

        const availableBgModes = [0, 1, 2, 3];
        this.controller.properties.set('bgMode', availableBgModes[rand(0, availableBgModes.length - 1)]);

        const availableDialModes = [0, 1, 2, 3, 4, 5, 8];
        const chosenDialMode = availableDialModes[rand(0, availableDialModes.length - 1)];
        this.controller.properties.set('dialMode', chosenDialMode);

        const look = DialPresets.randomLook(chosenDialMode, rand);
        this.controller.properties.set('showHighlight', look.highlight);
        this.controller.properties.set('dialLightStyle', look.light);
        this.controller.properties.set('markerStyle', look.markers[rand(0, look.markers.length - 1)]);

        this.controller.properties.set('dialLightStrength', rand(50, 110));
        this.controller.properties.set('dialLightAngle', rand(0, 7) * 45);
        this.controller.properties.set('tickStyle', rand(0, 7));
        this.controller.properties.set('majorTickInterval', rand(0, 3));
        this.controller.properties.set('showTicks', Math.random() < 0.85);
        this.controller.properties.set('showDropShadow', Math.random() < 0.90);
        this.controller.properties.set('spinDialImage', (chosenDialMode !== VolumeConstants.DIAL_MODE.SANDBLAST && chosenDialMode !== VolumeConstants.DIAL_MODE.STUDIO));
        this.controller.properties.set('showOuterRing', coin());
        this.controller.properties.set('showDialMarker', true);

        if (customDraftMixed) {
            const t = this.controller.themes.makeTheme(
                'Custom',
                this.controller.themes.draftTheme.bg,
                this.controller.themes.draftTheme.knob,
                this.controller.themes.draftTheme.inner,
                this.controller.themes.draftTheme.tick,
                this.controller.themes.draftTheme.marker
            );
            t.custom = true;
            this.controller.themes.addOrUpdate(t, true, this.controller.properties);
            this.controller.properties.setTheme('Custom', this.controller.themes, false);
        } else {
            this.controller.themes.clearPreview();
            this.controller.properties.setTheme(chosen, this.controller.themes, false);
        }

        this.controller.dialRenderer.invalidate();
        this.controller.state.invalidateGeometry();
        this.controller.sceneCache.invalidate(this.controller.bgRenderer, this.controller.dialRenderer);
        this.controller.state.requestRepaint();
    }

    #doRemoveCustomTheme(name) {
        const result = this.controller.themes.removeCustom(name, this.controller.properties);
        if (!result.ok) {
            fb.ShowPopupMessage(result.error || 'Could not remove theme.', VolumeConstants.SCRIPT_NAME);
            return;
        }
        if (this.controller.themes.draftBaseTheme === name) this.controller.themes.draftBaseTheme = null;

        const current = this.controller.properties.values.theme;
        const wasInUse = current === name || (current === '~Preview' && this.controller.properties.lastFinalizedTheme === name);
        if (wasInUse) {
            const fallback = (this.controller.properties.lastFinalizedTheme !== name) ? this.controller.properties.lastFinalizedTheme : this.controller.themes.themes[0].name;
            this.controller.properties.lastFinalizedTheme = fallback;
            this.controller.themes.clearPreview();
            this.controller.properties.setTheme(fallback, this.controller.themes, true, this.controller.state);
        }

        if (this.controller.properties.values.customThemeFile) {
            this.controller.themes.saveToFile(this.controller.properties.values.customThemeFile, null, this.controller.properties);
        }

        this.controller.dialRenderer.invalidate();
        this.controller.state.invalidateGeometry();
        this.controller.sceneCache.invalidate(this.controller.bgRenderer, this.controller.dialRenderer);
        this.controller.state.requestRepaint();
        fb.ShowPopupMessage(`Custom theme "${name}" removed.`, VolumeConstants.SCRIPT_NAME);
    }

    #shortPath(p) {
        if (!p) return '';
        const parts = p.replace(/\\/g, '/').split('/');
        return parts.length > 2 ? `…/${parts[parts.length - 1]}` : p;
    }

    #invalidateScene(invalidateDial = false) {
        if (invalidateDial) this.controller.dialRenderer.invalidate();
        this.controller.state.invalidateGeometry();
        this.controller.sceneCache.invalidate(this.controller.bgRenderer, this.controller.dialRenderer);
        this.controller.state.requestRepaint();
    }

    #loadConfigFile(path, isReload) {
        const result = this.controller.themes.loadFromFile(path, this.controller.properties, true, this.controller.state);
        if (result.ok) {
            if (!isReload) this.controller.properties.set('customThemeFile', GdiUtils.sanitizePath(path));
            this.#invalidateScene(true);
            VolumeEngine.syncFromFoobar(this.controller.state, this.controller.properties.values);
            this.controller.state.requestRepaint();
            fb.ShowPopupMessage(
                result.summary || (isReload ? 'Configuration reloaded successfully.' : `Configuration successfully loaded from:\n${path}`),
                VolumeConstants.SCRIPT_NAME
            );
        } else {
            fb.ShowPopupMessage(`Failed to ${isReload ? 'reload' : 'load'} JSON:\n\n${result.error || 'Unknown error'}`, VolumeConstants.SCRIPT_NAME);
        }
    }

    show(x, y) {
        const c = this.controller;
        const props = c.properties.values;

        if (HudManager.activeSlider) {
            HudManager.activeSlider = null;
            HudManager.clearTimer();
            window.Repaint();
        }

        if (props.theme !== '~Preview' && props.theme !== 'Custom') {
            if (c.themes.draftBaseTheme !== props.theme) {
                c.themes.seedDraftFromTheme(c.themes.get(props.theme));
            }
        }

        const names = c.themes.names();
        const availableImages = c.assetManager.getAvailableImages(true);
        const customs = c.themes.customThemes;
        const hasFile = Boolean(props.customThemeFile && props.customThemeFile.trim() !== '');
        const isStudioDial = (props.dialMode === VolumeConstants.DIAL_MODE.STUDIO);

        const m = new MenuBuilder();

        // 1. Theme
        m.addSubMenu('Theme', (themeMenu) => {
            for (const name of names) {
                const isCustom = c.themes.get(name)?.custom;
                const safeName = GdiUtils.escapeMenuLabel(name);
                themeMenu.addItem(`${safeName}${isCustom ? '  [custom]' : ''}`, () => {
                    c.themes.clearPreview();
                    c.properties.setTheme(name, c.themes, true, c.state);
                    this.#invalidateScene(false);
                }, { radio: name === props.theme });
            }
            themeMenu.addSeparator();

            themeMenu.addSubMenu('Settings & Themes (JSON)', (jsonMenu) => {
                const safeShort = GdiUtils.escapeMenuLabel(this.#shortPath(props.customThemeFile));
                jsonMenu.addItem('Load Settings & Themes from JSON…', () => {
                    const path = GdiUtils.prompt('Enter the full path to your JSON configuration file:', 'Load Settings & Themes JSON', props.customThemeFile || '');
                    if (path?.trim()) this.#loadConfigFile(path, false);
                });
                jsonMenu.addItem(`Reload from last file${hasFile ? `  (${safeShort})` : ''}`, () => {
                    if (props.customThemeFile?.trim()) this.#loadConfigFile(props.customThemeFile, true);
                }, { disabled: !hasFile });
                jsonMenu.addItem('Save Settings & Custom Themes to JSON…', () => {
                    const path = GdiUtils.prompt('Enter the full path to save the JSON configuration file:', 'Save Settings & Custom Themes', props.customThemeFile || `${VolumeConstants.PROFILE_BASE}volumeknob_config.json`);
                    if (path?.trim()) {
                        const result = c.themes.saveToFile(path, null, c.properties);
                        if (result.ok) {
                            c.properties.set('customThemeFile', GdiUtils.sanitizePath(path));
                            fb.ShowPopupMessage(`All settings and ${result.count} custom theme(s) saved to:\n${path}`, VolumeConstants.SCRIPT_NAME);
                        } else {
                            fb.ShowPopupMessage(`Save failed:\n\n${result.error || 'Unknown error'}`, VolumeConstants.SCRIPT_NAME);
                        }
                    }
                });
                jsonMenu.addItem('Export All (Settings & All Themes)…', () => {
                    const path = GdiUtils.prompt('Enter the full path to save the JSON configuration file:', 'Export All Settings & Themes', `${VolumeConstants.PROFILE_BASE}volumeknob_all_config.json`);
                    if (path?.trim()) {
                        const result = c.themes.saveToFile(path, '*', c.properties);
                        if (result.ok) fb.ShowPopupMessage(`Exported all settings and ${result.count} theme(s) to:\n${path}`, VolumeConstants.SCRIPT_NAME);
                        else fb.ShowPopupMessage(`Export failed:\n\n${result.error || 'Unknown error'}`, VolumeConstants.SCRIPT_NAME);
                    }
                });
                jsonMenu.addItem('Export Template (Built-in Themes Only)…', () => {
                    const path = GdiUtils.prompt('Enter the full path to save the JSON configuration file:', 'Export Built-in Theme Template', `${VolumeConstants.PROFILE_BASE}volumeknob_theme_template.json`);
                    if (path?.trim()) {
                        const result = c.themes.exportTemplate(path, c.properties);
                        if (result.ok) fb.ShowPopupMessage(`Template exported (${result.count} built-in themes) to:\n${path}`, VolumeConstants.SCRIPT_NAME);
                        else fb.ShowPopupMessage(`Export failed:\n\n${result.error || 'Unknown error'}`, VolumeConstants.SCRIPT_NAME);
                    }
                });
                jsonMenu.addSeparator();
                jsonMenu.addItem(`Set Default JSON File Path…${hasFile ? `  (${safeShort})` : ''}`, () => {
                    const path = GdiUtils.prompt('Enter default path for custom config JSON file:', 'Set Default Save Path', props.customThemeFile || `${VolumeConstants.PROFILE_BASE}volumeknob_config.json`);
                    if (path?.trim()) {
                        c.properties.set('customThemeFile', GdiUtils.sanitizePath(path));
                        fb.ShowPopupMessage(`Default save path set to:\n${path}`, VolumeConstants.SCRIPT_NAME);
                    }
                });
            });

            themeMenu.addSubMenu('Theme Creator', (creatorMenu) => {
                creatorMenu.addItem('1. Set Background Color…', () => this.#doColorPicker('Background', 'bg'));
                creatorMenu.addItem('2. Set Main Dial (Inner Face Color)...', () => this.#doColorPicker('Main Dial (Inner Face)', 'inner'));
                creatorMenu.addItem('3. Set Outer Ring (Knob Body Color)...', () => this.#doColorPicker('Outer Ring (Knob Body)', 'knob'));
                creatorMenu.addItem('4. Set Tick Marks Color…', () => this.#doColorPicker('Tick Marks', 'tick'));
                creatorMenu.addItem('5. Set Dial Marker (Pointer Color)...', () => this.#doColorPicker('Dial Marker (Pointer)', 'marker'));
                creatorMenu.addSeparator();
                creatorMenu.addSubMenu('Remove Custom Theme…', (remMenu) => {
                    if (customs.length) {
                        for (const ct of customs) {
                            remMenu.addItem(GdiUtils.escapeMenuLabel(ct.name), () => this.#doRemoveCustomTheme(ct.name));
                        }
                    } else {
                        remMenu.addItem('No custom themes', null, { disabled: true });
                    }
                });
            });
        });

        // 2. Sync Styles
        m.addSubMenu('Sync Styles', (syncMenu) => {
            syncMenu.addSubMenu('LCD Themes (Peak & Timer)', (lcdMenu) => {
                lcdMenu.addItem('Sync LCD Theme (PeakMeter & Timer)', () => {
                    const next = !props.syncLcdTheme;
                    c.properties.set('syncLcdTheme', next);
                    if (next) {
                        try { window.NotifyOthers('LcdThemeSync', c.properties.values.currentLcdTheme); } catch {}
                    }
                    c.showNotification(`LCD Theme Sync: ${next ? 'ON' : 'OFF'}`);
                    window.Repaint();
                }, { checked: props.syncLcdTheme });

                lcdMenu.addItem('Show LCD Sync Button', () => {
                    c.properties.set('showLcdSyncBtn', !props.showLcdSyncBtn);
                    window.Repaint();
                }, { checked: props.showLcdSyncBtn });

                lcdMenu.addSeparator();
                lcdMenu.addItem('Cycle Next LCD Theme', () => c.cycleLcdTheme(1));
                lcdMenu.addItem('Cycle Previous LCD Theme', () => c.cycleLcdTheme(-1));

                lcdMenu.addSubMenu('Select LCD Theme', (listMenu) => {
                    const lcdCurIdx = VolumeConstants.LCD_THEMES.findIndex(t => t.name.toLowerCase() === String(props.currentLcdTheme).toLowerCase());
                    VolumeConstants.LCD_THEMES.forEach((t, i) => {
                        listMenu.addItem(t.name, () => c.setLcdThemeIndex(i), { radio: i === lcdCurIdx });
                    });
                });
            });

            syncMenu.addSeparator();
            syncMenu.addSubMenu('Button Position', (posMenu) => {
                posMenu.addItem('Top of Panel', () => { c.properties.set('syncBtnPosition', 'top'); window.Repaint(); }, { radio: props.syncBtnPosition !== 'bottom' });
                posMenu.addItem('Bottom of Panel', () => { c.properties.set('syncBtnPosition', 'bottom'); window.Repaint(); }, { radio: props.syncBtnPosition === 'bottom' });
            });
            syncMenu.addSubMenu('LCD Button Side', (sideMenu) => {
                sideMenu.addItem('Left', () => { c.properties.set('lcdBtnSide', 'left'); c.isLcdBtnHovered = false; window.Repaint(); }, { radio: props.lcdBtnSide === 'left' });
                sideMenu.addItem('Right', () => { c.properties.set('lcdBtnSide', 'right'); c.isLcdBtnHovered = false; window.Repaint(); }, { radio: props.lcdBtnSide !== 'left' });
            });
            syncMenu.addItem('Show Button Text (LCD)', () => {
                c.properties.set('syncBtnShowText', !props.syncBtnShowText);
                window.Repaint();
            }, { checked: props.syncBtnShowText });
        });

        // 3. Backplate Finish
        m.addSubMenu('Backplate Finish', (bgMenu) => {
            const bgModes = [
                [VolumeConstants.BG_MODE.SOLID,     'Solid (Theme Color)'],
                [VolumeConstants.BG_MODE.BRUSHED,   'Brushed Aluminum (Horizontal)'],
                [VolumeConstants.BG_MODE.SANDBLAST, 'Sandblast Matte (Bead-Blasted)'],
                [VolumeConstants.BG_MODE.SATIN,     'Satin Velvet (Smooth Matte)']
            ];
            for (const [mode, label] of bgModes) {
                bgMenu.addItem(label, () => {
                    c.properties.set('bgMode', mode);
                    c.sceneCache.invalidate(c.bgRenderer, c.dialRenderer);
                    c.state.requestRepaint();
                }, { radio: props.bgMode === mode });
            }
            bgMenu.addSeparator();
            bgMenu.addSubMenu('Custom Image', (imgMenu) => {
                if (availableImages.length === 0) {
                    imgMenu.addItem('(No images in skins\\scripts\\VolumeKnob)', null, { disabled: true });
                } else {
                    for (const imgName of availableImages) {
                        imgMenu.addItem(GdiUtils.escapeMenuLabel(imgName), () => {
                            c.properties.set('customBgImage', imgName);
                            c.properties.set('bgMode', VolumeConstants.BG_MODE.IMAGE);
                            c.sceneCache.invalidate(c.bgRenderer, c.dialRenderer);
                            c.state.requestRepaint();
                        }, { radio: props.bgMode === VolumeConstants.BG_MODE.IMAGE && props.customBgImage === imgName });
                    }
                }
            });
        });

        // 4. Dial Face Finish
        m.addSubMenu('Dial Face Finish', (dialMenu) => {
            const dialModes = [
                [VolumeConstants.DIAL_MODE.SOLID,      'Solid (Theme Inner Color)'],
                [VolumeConstants.DIAL_MODE.CONCENTRIC, 'Concentric Micro-Groove (Hi-Fi Lathe)'],
                [VolumeConstants.DIAL_MODE.KNURLED,    'Studio Fluted (3D Milled Console Rim)'],
                [VolumeConstants.DIAL_MODE.BEADBLAST,  'Bead-Blasted Matte (Backplate Grain)'],
                [VolumeConstants.DIAL_MODE.SANDBLAST,  'Sandblast (Grainy Dome)'],
                [VolumeConstants.DIAL_MODE.STUDIO,     'Studio Dial (Convex Dome + Sandblast Core)'],
                [VolumeConstants.DIAL_MODE.CARBON,     'Carbon Fibre Weave']
            ];
            for (const [mode, label] of dialModes) {
                dialMenu.addItem(label, () => {
                    DialPresets.apply(c.properties, mode);
                    c.dialRenderer.invalidate();
                    c.sceneCache.invalidate(c.bgRenderer, c.dialRenderer);
                    c.state.requestRepaint();
                }, { radio: props.dialMode === mode });
            }
            dialMenu.addSeparator();
            dialMenu.addSubMenu('Custom Image', (imgMenu) => {
                if (availableImages.length === 0) {
                    imgMenu.addItem('(No images in skins\\scripts\\VolumeKnob)', null, { disabled: true });
                } else {
                    for (const imgName of availableImages) {
                        imgMenu.addItem(GdiUtils.escapeMenuLabel(imgName), () => {
                            c.properties.set('customDialImage', imgName);
                            c.properties.set('dialMode', VolumeConstants.DIAL_MODE.IMAGE);
                            DialPresets.normaliseMarker(c.properties, VolumeConstants.DIAL_MODE.IMAGE);
                            c.dialRenderer.invalidate();
                            c.sceneCache.invalidate(c.bgRenderer, c.dialRenderer);
                            c.state.requestRepaint();
                        }, { radio: props.dialMode === VolumeConstants.DIAL_MODE.IMAGE && props.customDialImage === imgName });
                    }
                }
            });
            dialMenu.addSeparator();
            dialMenu.addItem('Rotate Dial (Procedural & Custom Image)', () => {
                c.properties.set('spinDialImage', !props.spinDialImage);
                c.sceneCache.invalidate(c.bgRenderer, c.dialRenderer);
                c.state.requestRepaint();
            }, { checked: props.spinDialImage });
        });

        // 5. Markers and Shadow
        m.addSubMenu('Markers and Shadow', (effMenu) => {
            effMenu.addItem('Ambient Occlusion (Dial Face Shadow)', () => {
                c.properties.set('showDropShadow', !props.showDropShadow);
                this.#invalidateScene(false);
            }, { checked: props.showDropShadow });
            effMenu.addSeparator();
            effMenu.addItem('Show Outer Ring (Solid Classic)', () => {
                c.properties.set('showOuterRing', !props.showOuterRing);
                c.sceneCache.invalidate(c.bgRenderer, c.dialRenderer);
                c.state.requestRepaint();
            }, { checked: props.showOuterRing });
            effMenu.addSeparator();

            effMenu.addSubMenu('Tick Mark Style', (tickMenu) => {
                const tickLabels = [
                    'Uniform Lines', 'Lines (Major & Minor)', 'Precision Dots / Pips',
                    'Milled Studio Wedges (Blocks)', 'Precision Diamond Pips',
                    'Laboratory Bounded Arc', 'Min / Max Text Arc', 'Precision Dots + Outer Arc'
                ];
                tickLabels.forEach((label, i) => {
                    tickMenu.addItem(label, () => {
                        c.properties.set('tickStyle', i);
                        c.sceneCache.invalidate(c.bgRenderer, c.dialRenderer);
                        c.state.requestRepaint();
                    }, { radio: props.tickStyle === i });
                });
                tickMenu.addSeparator();
                tickMenu.addItem(`Tick Margin Slider... (Current: ${props.tickMargin}px)`, () => {
                    HudManager.activeSlider = 'TickMargin';
                    HudManager.clearTimer();
                    window.Repaint();
                });
                tickMenu.addItem(`Tick Size Slider... (Current: +${props.tickSizeBonus}%)`, () => {
                    HudManager.activeSlider = 'TickSize';
                    HudManager.clearTimer();
                    window.Repaint();
                });
            });

            effMenu.addSubMenu('Major Scale Markings (Large Ticks)', (majMenu) => {
                const majLabels = [
                    'None (All Uniform)',
                    '0%, 50%, 100% (Min / Mid / Max)',
                    '0%, 25%, 50%, 75%, 100% (Quarters)',
                    'Every 10% (0, 10, 20... 100%)'
                ];
                majLabels.forEach((label, i) => {
                    majMenu.addItem(label, () => {
                        c.properties.set('majorTickInterval', i);
                        c.sceneCache.invalidate(c.bgRenderer, c.dialRenderer);
                        c.state.requestRepaint();
                    }, { radio: props.majorTickInterval === i });
                });
            });

            effMenu.addItem('Show Tick Marks', () => {
                c.properties.set('showTicks', !props.showTicks);
                c.sceneCache.invalidate(c.bgRenderer, c.dialRenderer);
                c.state.requestRepaint();
            }, { checked: props.showTicks });
            effMenu.addSeparator();

            effMenu.addSubMenu('Dial Pointer Style', (ptrMenu) => {
                const ptrItems = [
                    [VolumeConstants.MARKER_STYLE.LINE,        'Standard Line',                              isStudioDial],
                    [VolumeConstants.MARKER_STYLE.CIRCLE,      'Dot',                                        isStudioDial],
                    [VolumeConstants.MARKER_STYLE.ARROW,       'Arrow Indicator',                            false],
                    [VolumeConstants.MARKER_STYLE.SHORT,       'Short Line',                                 isStudioDial],
                    [VolumeConstants.MARKER_STYLE.BEVEL_WEDGE, 'Beveled Wedge (Stamped Recessed Chevron)',   isStudioDial],
                    [VolumeConstants.MARKER_STYLE.BEVEL_SLOT,  'Beveled Slot (Stamped Recessed Cavity)',     isStudioDial],
                    [VolumeConstants.MARKER_STYLE.VSHORT,      'Very Short Line (Studio Dial Only: 0.8 - 1.0 R)', !isStudioDial],
                    [VolumeConstants.MARKER_STYLE.FULL_LINE,   'Full Line (Center to 0.975 R)',              isStudioDial],
                    [VolumeConstants.MARKER_STYLE.LED_DOT,     'LED Dot (Glow Colour)',                      isStudioDial],
                    [VolumeConstants.MARKER_STYLE.GLOW_LINE,   'Glow Line (Glow Colour)',                    isStudioDial],
                    [VolumeConstants.MARKER_STYLE.GROOVE,      'Recessed Groove (Glow Inlay)',               isStudioDial]
                ];
                for (const [styleId, label, disabled] of ptrItems) {
                    ptrMenu.addItem(label, () => {
                        c.properties.set('markerStyle', styleId);
                        c.state.requestRepaint();
                    }, { radio: props.markerStyle === styleId, disabled });
                }
            });

            effMenu.addItem('Show Dial Pointer (Indicator)', () => {
                c.properties.set('showDialMarker', !props.showDialMarker);
                c.state.requestRepaint();
            }, { checked: props.showDialMarker });
            effMenu.addSeparator();

            effMenu.addItem('Lit Level Arc (Volume Ring)', () => {
                c.properties.set('levelArc', !props.levelArc);
                this.#invalidateScene(false);
            }, { checked: props.levelArc });
            effMenu.addItem('Lit Tick Marks (Follow Volume)', () => {
                c.properties.set('litTicks', !props.litTicks);
                c.sceneCache.invalidate(c.bgRenderer, c.dialRenderer);
                c.state.requestRepaint();
            }, { checked: props.litTicks });

            effMenu.addSubMenu('Glow Colour (Arc, Ticks, Glow Pointers)', (glowMenu) => {
                glowMenu.addItem('Pointer / Theme Colour', () => { c.properties.set('glowSource', 'theme'); c.state.requestRepaint(); }, { radio: props.glowSource === 'theme' });
                glowMenu.addItem('LCD Theme Colour (follows Sync Styles)', () => { c.properties.set('glowSource', 'lcd'); c.state.requestRepaint(); }, { radio: props.glowSource === 'lcd' });
                glowMenu.addItem('Custom Colour', () => { c.properties.set('glowSource', 'custom'); c.state.requestRepaint(); }, { radio: props.glowSource === 'custom' });
                glowMenu.addSeparator();
                glowMenu.addItem('Set Custom Glow Colour…', () => {
                    const startArgb = (props.customGlowColor >>> 0) || c.themes.get(props.theme).marker;
                    let picked = -1;
                    try { picked = utils.ColourPicker(window.ID, startArgb); } catch { picked = -1; }
                    if (picked !== -1) {
                        const newArgb = (0xFF000000 | picked) >>> 0;
                        if (newArgb !== startArgb) {
                            c.properties.set('customGlowColor', newArgb);
                            c.properties.set('glowSource', 'custom');
                            c.state.requestRepaint();
                        }
                    }
                });
            });
        });

        // 6. Highlight & Specular Engine
        m.addSubMenu('Highlight & Specular Engine', (lightMenu) => {
            lightMenu.addItem('Enable Specular Highlights', () => {
                c.properties.set('showHighlight', !props.showHighlight);
                c.dialRenderer.invalidate();
                c.sceneCache.invalidate(c.bgRenderer, c.dialRenderer);
                c.state.requestRepaint();
            }, { checked: props.showHighlight });
            lightMenu.addSeparator();

            lightMenu.addSubMenu('Specular Style', (styleMenu) => {
                const lightStyles = [
                    'Auto (Material Native - Physically Coupled)',
                    'Dual Anisotropic Cones (Turned Lathe Sheen)',
                    'Directional Soft Sheen (Full Dial Gradient)',
                    'Linear Hairline Sheen (Brushed Metal Bar)',
                    'Quad Cross Specular (4-Axis Diamond Sheen)',
                    'Dual-Zone: Studio Key + Dark Ring + Soft Sheen',
                    'Dual Anisotropic Cones + 0.98 Edge Micro-Bevel',
                    'Convex Contour Dome Gradient (Centered)',
                    'Concave Bowl Gradient (Centered)',
                    'Studio Key Rim + Anisotropic Inner (0.618)',
                    'Spun Metal (Turned Aluminum Texture)'
                ];
                lightStyles.forEach((label, i) => {
                    styleMenu.addItem(label, () => {
                        c.properties.set('dialLightStyle', i);
                        c.dialRenderer.invalidate();
                        c.sceneCache.invalidate(c.bgRenderer, c.dialRenderer);
                        c.state.requestRepaint();
                    }, { radio: props.dialLightStyle === i });
                });
            }, !props.showHighlight);

            lightMenu.addSubMenu('Specular Position (360° Arc)', (angleMenu) => {
                const angles = [
                    [315, 'Top-Left (315° - Audio Console Standard)'],
                    [0,   'Top / Overhead (0° - 12:00)'],
                    [45,  'Top-Right (45° - 1:30)'],
                    [90,  'Right / Side (90° - 3:00)'],
                    [135, 'Bottom-Right (135° - 4:30)'],
                    [180, 'Bottom / Underlit (180° - 6:00)'],
                    [225, 'Bottom-Left (225° - 7:30)'],
                    [270, 'Left / Side (270° - 9:00)']
                ];
                for (const [deg, label] of angles) {
                    angleMenu.addItem(label, () => {
                        c.properties.set('dialLightAngle', deg);
                        c.dialRenderer.invalidate();
                        c.sceneCache.invalidate(c.bgRenderer, c.dialRenderer);
                        c.state.requestRepaint();
                    }, { radio: props.dialLightAngle === deg });
                }
                angleMenu.addSeparator();
                angleMenu.addItem(`Interactive 360° Arc Slider... (Current: ${props.dialLightAngle}°)`, () => {
                    HudManager.activeSlider = 'LightAngle';
                    HudManager.clearTimer();
                    window.Repaint();
                });
            }, !props.showHighlight);

            lightMenu.addSubMenu('Specular Strength', (strMenu) => {
                const strengths = [
                    [0,   'Off (0%)'],
                    [50,  'Subtle (50%)'],
                    [100, 'Standard (100%)'],
                    [150, 'Vivid (150%)'],
                    [200, 'Maximum Sheen (200%)']
                ];
                for (const [val, label] of strengths) {
                    strMenu.addItem(label, () => {
                        c.properties.set('dialLightStrength', val);
                        c.dialRenderer.invalidate();
                        c.sceneCache.invalidate(c.bgRenderer, c.dialRenderer);
                        c.state.requestRepaint();
                    }, { radio: props.dialLightStrength === val });
                }
                strMenu.addSeparator();
                strMenu.addItem(`Interactive Strength Slider... (Current: ${props.dialLightStrength}%)`, () => {
                    HudManager.activeSlider = 'LightStrength';
                    HudManager.clearTimer();
                    window.Repaint();
                });
            }, !props.showHighlight);
        });

        // 7. Dial Sweep Range & Scaling
        m.addSubMenu('Dial Sweep Range & Scaling', (rangeMenu) => {
            const sweeps = [
                [270, '270° (Compact)'],
                [280, '280°'],
                [290, '290° (Default)'],
                [300, '300° (Wide)']
            ];
            for (const [deg, label] of sweeps) {
                rangeMenu.addItem(label, () => {
                    if (deg !== props.sweepRange) {
                        VolumeConfig.sweepRangeDeg = deg;
                        c.properties.set('sweepRange', deg);
                        c.state.invalidateGeometry();
                        c.sceneCache.invalidate(c.bgRenderer, c.dialRenderer);
                        VolumeEngine.syncFromFoobar(c.state, c.properties.values);
                        c.state.requestRepaint();
                    }
                }, { radio: props.sweepRange === deg });
            }
            rangeMenu.addSeparator();
            rangeMenu.addItem('Volume Scale: Non-Linear (Hearing Optimized)', () => {
                c.properties.set('volumeScalingMode', 0);
                VolumeEngine.syncFromFoobar(c.state, c.properties.values);
                c.state.requestRepaint();
            }, { radio: props.volumeScalingMode === 0 });
            rangeMenu.addItem('Volume Scale: Linear dB (-100dB to 0dB)', () => {
                c.properties.set('volumeScalingMode', 1);
                VolumeEngine.syncFromFoobar(c.state, c.properties.values);
                c.state.requestRepaint();
            }, { radio: props.volumeScalingMode === 1 });
        });

        m.addSeparator();
        m.addItem('Randomize', () => this.doRandom());
        m.addItem('Save Custom Theme…', () => this.#doFinalizeTheme());
        m.addSeparator();
        m.addItem('Clear Image Cache & Reload', () => {
            c.assetManager.clear();
            c.assetManager.getAvailableImages(true);
            this.#invalidateScene(false);
        });
        m.addItem('Reset Visual Settings to Defaults', () => {
            c.properties.resetVisuals(c.themes, c.state);
            c.themes.clearPreview();
            this.#invalidateScene(true);
            VolumeEngine.syncFromFoobar(c.state, c.properties.values);
            c.state.requestRepaint();
        });
        m.addItem('Factory Reset (All Settings & Themes)...', () => {
            const confirm = GdiUtils.prompt('Type YES to perform a factory reset (resets all settings, custom images and theme paths):', 'Confirm Factory Reset', '');
            if (confirm?.toUpperCase() === 'YES') {
                c.properties.resetAll(c.themes, c.state);
                c.themes.clearPreview();
                for (const ct of [...c.themes.customThemes]) {
                    c.themes.removeCustom(ct.name);
                }
                try {
                    window.SetProperty('VolumeKnob.CustomThemes', null);
                    window.SetProperty('VolumeKnob.DraftTheme', null);
                } catch {}
                c.themes.seedDraftFromTheme(c.themes.get(c.properties.values.theme));
                c.assetManager.clear();
                this.#invalidateScene(true);
                VolumeEngine.syncFromFoobar(c.state, c.properties.values);
                c.state.requestRepaint();
            }
        });

        const selected = m.track(x, y);
        const wasHovered = c.isLcdBtnHovered;
        c.isLcdBtnHovered = false;
        c.refreshSyncTooltip();
        if (wasHovered && selected === 0) c.repaintLcdBtn();
        return true;
    }
}

// ============================================================================================
// 16. CENTRAL CONTROLLER & SMP HOOKS
// ============================================================================================
class VolumeKnobController {
    #panelState = VolumeConstants.LIFECYCLE.BOOT;
    #notifyText = '';
    #notifyTimeout = null;
    #notifyFont = null;
    isLcdBtnHovered = false;
    #syncTooltip = null;
    #pauseFlash = true;
    #pauseTimer = null;
    #syncTipText = '';

    constructor() {
        this.#panelState = VolumeConstants.LIFECYCLE.INIT;
        this.themes = new ThemeManager();
        this.properties = new PropertyManager(this.themes);
        this.assetManager = new AssetManager();
        this.bgRenderer = new BackgroundRenderer();
        this.dialRenderer = new DialRenderer();
        this.sceneCache = new SceneCache();
        this.state = new VolumeState();
        this.mainRenderer = new MainRenderer();
        this.contextMenu = new ContextMenuManager(this);
    }

    init() {
        this.themes.loadCustomThemesFromProperties();
        this.themes.loadDraftFromProperties();

        VolumeConfig.sweepRangeDeg = this.properties.clampInt(this.properties.values.sweepRange, 270, 300);

        const curTheme = this.properties.values.theme;
        let pendingCustomTheme = '';
        if (curTheme === '~Preview' || curTheme === 'Custom') {
            const d = this.themes.draftTheme;
            const t = this.themes.makeTheme('Custom', d.bg, d.knob, d.inner, d.tick, d.marker);
            t.custom = true;
            this.themes.addOrUpdate(t, false);
            this.properties.set('theme', 'Custom');
        } else if (!this.themes.names().includes(curTheme)) {
            pendingCustomTheme = curTheme;
            this.properties.setTheme('Classic Gray', this.themes);
        } else {
            this.themes.seedDraftFromTheme(this.themes.get(curTheme));
        }

        DialPresets.normaliseMarker(this.properties, this.properties.values.dialMode);

        this.#panelState = VolumeConstants.LIFECYCLE.LIVE;
        VolumeEngine.syncFromFoobar(this.state, this.properties.values);
        this.state.startAnimation();
        this.#updatePauseBlink();

        window.SetTimeout(() => {
            if (this.#panelState === VolumeConstants.LIFECYCLE.SHUTDOWN) return;
            try { 
                const res = this.themes.loadFromFile(this.properties.values.customThemeFile, this.properties, false, this.state);
                if (res?.ok) {
                    if (pendingCustomTheme && this.themes.has(pendingCustomTheme)) {
                        this.properties.setTheme(pendingCustomTheme, this.themes, true, this.state);
                    }
                    this.dialRenderer.invalidate();
                    this.state.invalidateGeometry();
                    this.sceneCache.invalidate(this.bgRenderer, this.dialRenderer);
                    this.state.requestRepaint();
                }
            } catch {}
        }, 60);
    }

    showNotification(text) {
        this.refreshSyncTooltip();
        this.#notifyText = text;
        if (this.#notifyTimeout) window.ClearTimeout(this.#notifyTimeout);
        this.#notifyTimeout = window.SetTimeout(() => {
            this.#notifyText = '';
            this.#notifyTimeout = null;
            window.Repaint();
        }, 1500);
        window.Repaint();
    }

    getSyncBtnMetrics() {
        const showText = this.properties.values.syncBtnShowText;
        const m = GdiUtils.scale(6);
        const h = GdiUtils.scale(18);
        const w = showText ? GdiUtils.scale(54) : GdiUtils.scale(22);
        const y = this.properties.values.syncBtnPosition === 'bottom' ? Math.max(0, window.Height - h - m) : m;
        return { m, w, h, y };
    }

    getLcdBtnRect() {
        const k = this.getSyncBtnMetrics();
        const x = this.properties.values.lcdBtnSide === 'left' ? k.m : Math.max(0, window.Width - k.w - k.m);
        return { x, y: k.y, w: k.w, h: k.h };
    }

    repaintLcdBtn() {
        if (!window.IsVisible || !this.properties.values.showLcdSyncBtn) return;
        const r = this.getLcdBtnRect();
        const pad = GdiUtils.scale(6);
        window.RepaintRect(Math.max(0, r.x - pad), Math.max(0, r.y - pad), r.w + pad * 2, r.h + pad * 2);
    }

    setLcdThemeIndex(idx) {
        const themes = VolumeConstants.LCD_THEMES;
        if (idx < 0 || idx >= themes.length) return;
        const chosen = themes[idx];
        this.properties.set('currentLcdTheme', chosen.name);
        const syncOn = this.properties.values.syncLcdTheme;
        if (syncOn) {
            try { window.NotifyOthers('LcdThemeSync', chosen.name); } catch {}
        }
        this.showNotification(`LCD Theme: ${chosen.name}${syncOn ? '' : ' (Sync OFF)'}`);
        window.Repaint();
    }

    cycleLcdTheme(direction) {
        const themes = VolumeConstants.LCD_THEMES;
        if (!themes || !themes.length) return;
        const curName = this.properties.values.currentLcdTheme;
        let idx = themes.findIndex(t => t.name.toLowerCase() === curName.toLowerCase());
        if (idx === -1) idx = Math.max(0, themes.findIndex(t => t.name === 'Pioneer Amber'));
        const nextIdx = (idx + direction + themes.length) % themes.length;
        const chosen = themes[nextIdx];

        this.properties.set('currentLcdTheme', chosen.name);
        const syncOn = this.properties.values.syncLcdTheme;
        if (syncOn) {
            try { window.NotifyOthers('LcdThemeSync', chosen.name); } catch {}
        }
        this.showNotification(`LCD Theme: ${chosen.name}${syncOn ? '' : ' (Sync OFF)'}`);
        window.Repaint();
    }

    #scaleColour(col, f) {
        const rgb = GdiUtils.toRGB(col);
        return GdiUtils.colour(rgb[0] * f, rgb[1] * f, rgb[2] * f);
    }

    #drawSyncBox(gr, r, hovered) {
        const theme = this.themes.get(this.properties.values.theme);
        const fill = this.#scaleColour(theme.inner, 0.38);
        const edge = this.#scaleColour(theme.knob, 1.35);
        gr.FillSolidRect(r.x, r.y, r.w, r.h, GdiUtils.setAlpha(fill, hovered ? 235 : 190));
        gr.DrawRect(r.x, r.y, r.w, r.h, 1, GdiUtils.setAlpha(edge, hovered ? 230 : 150));
        gr.FillSolidRect(r.x + 1, r.y + 1, r.w - 2, 1, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), hovered ? 28 : 14));
    }

    #drawSyncLed(gr, cx, cy, radius, col, syncOn, blinkWhenPaused = false) {
        const playing = fb.IsPlaying && !fb.IsPaused;
        const blinking = blinkWhenPaused && fb.IsPlaying && fb.IsPaused;
        if (!syncOn && !playing && !blinking) {
            const ring = GdiUtils.setAlpha(this.#scaleColour(col, 0.55), 170);
            gr.FillEllipse(cx - radius, cy - radius, radius * 2, radius * 2, GdiUtils.setAlpha(GdiUtils.colour(0, 0, 0), 150));
            gr.DrawEllipse(cx - radius, cy - radius, radius * 2, radius * 2, 1, ring);
            return;
        }
        const bright = playing || (blinking && this.#pauseFlash);
        const body = bright ? col : this.#scaleColour(col, blinking ? 0.22 : 0.5);
        if (bright) {
            gr.DrawEllipse(cx - radius - 2, cy - radius - 2, (radius + 2) * 2, (radius + 2) * 2, 1, GdiUtils.setAlpha(col, 55));
            gr.DrawEllipse(cx - radius - 1, cy - radius - 1, (radius + 1) * 2, (radius + 1) * 2, 1, GdiUtils.setAlpha(col, 140));
        } else if (!blinking) {
            gr.DrawEllipse(cx - radius - 1, cy - radius - 1, (radius + 1) * 2, (radius + 1) * 2, 1, GdiUtils.setAlpha(col, 45));
        }
        gr.FillEllipse(cx - radius, cy - radius, radius * 2, radius * 2, body);
        if (bright) {
            const hl = Math.max(1, Math.floor(radius / 2));
            gr.FillEllipse(cx - hl, cy - radius + 1, hl, hl, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), 150));
        }
    }

    refreshSyncTooltip() {
        const v = this.properties.values;
        let text = '';
        if (this.isLcdBtnHovered && v.showLcdSyncBtn) {
            text = `LCD Theme: ${v.currentLcdTheme}  |  Sync ${v.syncLcdTheme ? 'ON' : 'OFF'}`;
        }
        if (text === this.#syncTipText) return;
        this.#syncTipText = text;
        try {
            if (!this.#syncTooltip) {
                this.#syncTooltip = window.CreateTooltip('Segoe UI', GdiUtils.scale(12));
                if (this.#syncTooltip) this.#syncTooltip.SetMaxWidth(500);
            }
            if (!this.#syncTooltip) return;
            this.#syncTooltip.Text = text;
            if (text) this.#syncTooltip.Activate();
            else this.#syncTooltip.Deactivate();
        } catch {}
    }

    // True Zero-Idle: Halt pause blink timer when hidden or button disabled; resume onPaint
    #updatePauseBlink() {
        const shouldBlink = fb.IsPlaying && fb.IsPaused && this.properties.values.showLcdSyncBtn && window.IsVisible;
        if (!shouldBlink) {
            if (this.#pauseTimer) { window.ClearInterval(this.#pauseTimer); this.#pauseTimer = null; }
            this.#pauseFlash = true;
            return;
        }
        if (this.#pauseTimer) return;
        this.#pauseFlash = true;
        this.#pauseTimer = window.SetInterval(() => {
            if (this.#panelState !== VolumeConstants.LIFECYCLE.LIVE || !fb.IsPlaying || !fb.IsPaused || !this.properties.values.showLcdSyncBtn || !window.IsVisible) {
                this.#updatePauseBlink();
                return;
            }
            this.#pauseFlash = !this.#pauseFlash;
            this.repaintLcdBtn();
        }, 500);
    }

    onPlaybackStateChange() {
        if (this.#panelState !== VolumeConstants.LIFECYCLE.LIVE) return;
        this.#updatePauseBlink();
        this.repaintLcdBtn();
    }

    drawLcdSyncButton(gr) {
        if (!this.properties.values.showLcdSyncBtn) return;
        const r = this.getLcdBtnRect();
        const syncOn = this.properties.values.syncLcdTheme;
        const curName = this.properties.values.currentLcdTheme;
        const activeTheme = VolumeConstants.LCD_THEMES.find(t => t.name.toLowerCase() === curName.toLowerCase()) || VolumeConstants.LCD_THEMES[8];
        const ledCol = activeTheme.color;

        this.#drawSyncBox(gr, r, this.isLcdBtnHovered);

        const showText = this.properties.values.syncBtnShowText;
        const dotRadius = Math.max(2, GdiUtils.scale(3));
        const dotX = showText ? r.x + GdiUtils.scale(8) : Math.round(r.x + r.w / 2);
        const dotY = Math.round(r.y + r.h / 2);
        this.#drawSyncLed(gr, dotX, dotY, dotRadius, ledCol, syncOn, true);

        const font = showText ? HudManager.getFont(8, true) : null;
        if (font) {
            const textX = dotX + dotRadius + GdiUtils.scale(4);
            const textW = r.x + r.w - textX;
            const textCol = syncOn ? GdiUtils.setAlpha(GdiUtils.colour(225, 230, 235), 230) : GdiUtils.setAlpha(GdiUtils.colour(135, 140, 145), 180);
            gr.SetTextRenderingHint(4);
            gr.DrawString('LCD', font, textCol, textX, r.y - 1, textW, r.h, 0x11000000 | 0x00000004);
        }
    }

    cycleTheme(direction) {
        const names = this.themes.names();
        if (!names.length) return;
        let curIdx = names.indexOf(this.properties.values.theme);
        if (curIdx === -1) curIdx = 0;
        const nextIdx = (curIdx + direction + names.length) % names.length;
        const chosen = names[nextIdx];

        this.themes.clearPreview();
        this.properties.setTheme(chosen, this.themes, true, this.state);
        this.state.invalidateGeometry();
        this.sceneCache.invalidate(this.bgRenderer, this.dialRenderer);
        this.showNotification(`Theme: ${chosen}`);
    }

    cycleDialMode(direction) {
        const availableDialModes = [0, 1, 2, 3, 4, 5, 8];
        const labels = ['Solid', 'Concentric', 'Knurled', 'Beadblast', 'Sandblast', 'Studio', 'Carbon Fibre'];
        let curIdx = availableDialModes.indexOf(this.properties.values.dialMode);
        if (curIdx === -1) curIdx = 0;
        const nextIdx = (curIdx + direction + availableDialModes.length) % availableDialModes.length;
        const nextDialMode = availableDialModes[nextIdx];
        DialPresets.apply(this.properties, nextDialMode);

        this.dialRenderer.invalidate();
        this.sceneCache.invalidate(this.bgRenderer, this.dialRenderer);
        this.showNotification(`Dial Face: ${labels[nextIdx]}`);
    }

    cycleTickStyle(direction) {
        const labels = ['Uniform', 'Major/Minor', 'Dots', 'Blocks', 'Diamonds', 'Bounded Arc', 'Min/Max Arc', 'Dots + Arc'];
        const nextStyle = (this.properties.values.tickStyle + direction + 8) % 8;
        this.properties.set('tickStyle', nextStyle);
        this.sceneCache.invalidate(this.bgRenderer, this.dialRenderer);
        this.showNotification(`Ticks: ${labels[nextStyle]}`);
    }

    cycleMarkerStyle(direction) {
        const labels = ['Line', 'Dot', 'Arrow', 'Short Line', 'Beveled Wedge', 'Beveled Slot', 'Studio Line', 'Full Line', 'LED Dot', 'Glow Line', 'Groove'];
        if (this.properties.values.dialMode === VolumeConstants.DIAL_MODE.STUDIO) {
            const next = (this.properties.values.markerStyle === VolumeConstants.MARKER_STYLE.ARROW) 
                ? VolumeConstants.MARKER_STYLE.VSHORT 
                : VolumeConstants.MARKER_STYLE.ARROW;
            this.properties.set('markerStyle', next);
            this.showNotification(`Pointer: ${labels[next]}`);
        } else {
            const nonStudioStyles = [
                VolumeConstants.MARKER_STYLE.LINE,
                VolumeConstants.MARKER_STYLE.CIRCLE,
                VolumeConstants.MARKER_STYLE.ARROW,
                VolumeConstants.MARKER_STYLE.SHORT,
                VolumeConstants.MARKER_STYLE.BEVEL_WEDGE,
                VolumeConstants.MARKER_STYLE.BEVEL_SLOT,
                VolumeConstants.MARKER_STYLE.FULL_LINE,
                VolumeConstants.MARKER_STYLE.LED_DOT,
                VolumeConstants.MARKER_STYLE.GLOW_LINE,
                VolumeConstants.MARKER_STYLE.GROOVE
            ];
            let curIdx = nonStudioStyles.indexOf(this.properties.values.markerStyle);
            if (curIdx === -1) curIdx = 0;
            const nextIdx = (curIdx + direction + nonStudioStyles.length) % nonStudioStyles.length;
            const nextMarker = nonStudioStyles[nextIdx];
            this.properties.set('markerStyle', nextMarker);
            this.showNotification(`Pointer: ${labels[nextMarker]}`);
        }
        this.state.requestRepaint();
    }

    cycleBgMode(direction) {
        const availableBgModes = [0, 1, 2, 3];
        const labels = ['Solid', 'Brushed Aluminum', 'Sandblast', 'Satin'];
        let curIdx = availableBgModes.indexOf(this.properties.values.bgMode);
        if (curIdx === -1) curIdx = 0;
        const nextIdx = (curIdx + direction + availableBgModes.length) % availableBgModes.length;
        this.properties.set('bgMode', availableBgModes[nextIdx]);
        this.sceneCache.invalidate(this.bgRenderer, this.dialRenderer);
        this.showNotification(`Backplate: ${labels[nextIdx]}`);
    }

    cycleLightStyle(direction) {
        const labels = ['Auto', 'Anisotropic', 'Spotlight', 'Hairline', 'Cross', 'Studio Sheen', 'Aniso Bevel', 'Contour Dome', 'Concave Bowl', 'Studio Aniso', 'Spun Metal'];
        const nextStyle = (this.properties.values.dialLightStyle + direction + 11) % 11;
        this.properties.set('dialLightStyle', nextStyle);
        if (!this.properties.values.showHighlight) this.properties.set('showHighlight', true);
        this.dialRenderer.invalidate();
        this.sceneCache.invalidate(this.bgRenderer, this.dialRenderer);
        this.showNotification(`Lighting: ${labels[nextStyle]}`);
    }

    onPaint(gr) {
        if (this.#panelState !== VolumeConstants.LIFECYCLE.LIVE || !window.IsVisible) return;

        // Re-evaluate zero-idle pause blink & animation when panel visibility is restored
        this.#updatePauseBlink();
        if (this.state.dragging || Math.abs(this.state.currentAngle - this.state.targetAngle) >= VolumeConfig.ANGLE_EPSILON) {
            this.state.startAnimation();
        }

        this.mainRenderer.draw(gr, window.Width, window.Height, this.state, this.themes, this.properties, this.sceneCache, this.dialRenderer, this.bgRenderer, this.assetManager);

        this.drawLcdSyncButton(gr);

        if (this.#notifyText && !HudManager.activeSlider) {
            this.#notifyFont ??= gdi.Font('Segoe UI Semibold', GdiUtils.scale(11), 0);
            if (this.#notifyFont) {
                const boxH = Math.max(20, GdiUtils.scale(24));
                const boxW = Math.min(window.Width - GdiUtils.scale(20), Math.max(GdiUtils.scale(130), this.#notifyText.length * GdiUtils.scale(7) + GdiUtils.scale(24)));
                const bx = Math.floor((window.Width - boxW) / 2);
                const by = window.Height - Math.max(24, GdiUtils.scale(32));
                gr.FillSolidRect(bx, by, boxW, boxH, GdiUtils.setAlpha(GdiUtils.colour(0, 0, 0), 190));
                gr.SetTextRenderingHint(4);
                gr.DrawString(this.#notifyText, this.#notifyFont, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), 240), bx, by, boxW, boxH, 0x11000000);
            }
        }
    }

    onSize() {
        if (this.#panelState !== VolumeConstants.LIFECYCLE.LIVE) return;
        if (this.state.geometryCache.width !== window.Width || this.state.geometryCache.height !== window.Height) {
            this.state.invalidateGeometry();
            this.sceneCache.invalidate(this.bgRenderer, this.dialRenderer);
            this.state.requestRepaint();
        }
    }

    onColoursChanged() {
        if (this.#panelState === VolumeConstants.LIFECYCLE.LIVE) {
            this.dialRenderer.invalidate();
            this.sceneCache.invalidate(this.bgRenderer, this.dialRenderer);
            this.state.requestRepaint();
        }
    }

    onFontChanged() {
        if (this.#panelState === VolumeConstants.LIFECYCLE.LIVE) {
            HudManager.invalidateFont();
            if (this.#notifyFont?.Dispose) {
                try { this.#notifyFont.Dispose(); } catch {}
            }
            this.#notifyFont = null;
            this.state.requestRepaint();
        }
    }

    onVolumeChange() {
        if (this.#panelState === VolumeConstants.LIFECYCLE.LIVE && !this.state.dragging) {
            VolumeEngine.syncFromFoobar(this.state, this.properties.values, false);
        }
    }

    onPlaybackNewTrack() {
        if (this.#panelState === VolumeConstants.LIFECYCLE.LIVE && !this.state.dragging) {
            VolumeEngine.syncFromFoobar(this.state, this.properties.values);
        }
    }

    onMouseLbtnDown(x, y, mask) {
        if (this.#panelState !== VolumeConstants.LIFECYCLE.LIVE) return false;

        if (this.properties.values.showLcdSyncBtn) {
            const r = this.getLcdBtnRect();
            if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
                this.cycleLcdTheme(1);
                return true;
            }
        }

        if (utils.IsKeyPressed(0x11) || (mask && (mask & 8))) {
            if (InputManager.hitTest(x, y, this.state, window.Width, window.Height, this.properties.values)) {
                if (HudManager.activeSlider) {
                    HudManager.activeSlider = null;
                    HudManager.clearTimer();
                }
                this.contextMenu.doRandom();
                return true;
            }
        }
        return InputManager.handleDragStart(x, y, this.state, window.Width, window.Height, this.properties.values);
    }

    onMouseLbtnUp() {
        if (this.#panelState !== VolumeConstants.LIFECYCLE.LIVE) return false;
        return InputManager.handleDragEnd(this.state, this.properties.values);
    }

    onMouseMove(x, y, mask) {
        if (this.#panelState !== VolumeConstants.LIFECYCLE.LIVE) return false;

        if (this.properties.values.showLcdSyncBtn) {
            const r = this.getLcdBtnRect();
            const hovered = (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
            if (hovered !== this.isLcdBtnHovered) {
                this.isLcdBtnHovered = hovered;
                this.refreshSyncTooltip();
                this.repaintLcdBtn();
            }
        }

        if (this.state.dragging && (mask !== undefined && !(mask & 1))) {
            return InputManager.handleDragEnd(this.state, this.properties.values);
        }
        return InputManager.handleDragMove(x, y, this.state, this.properties.values);
    }

    onMouseLeave() {
        if (this.isLcdBtnHovered) {
            this.isLcdBtnHovered = false;
            this.refreshSyncTooltip();
            this.repaintLcdBtn();
        }
    }

    onMouseWheel(step) {
        if (this.#panelState !== VolumeConstants.LIFECYCLE.LIVE) return false;
        if (HudManager.activeSlider) {
            HudManager.adjustSlider(this.properties, this.dialRenderer, this.sceneCache, this.state, HudManager.activeSlider, step > 0 ? 1 : -1);
            return true;
        }
        return InputManager.handleWheel(step, this.state, this.properties.values);
    }

    onMouseLbtnDblclk(x, y, mask) {
        if (this.#panelState !== VolumeConstants.LIFECYCLE.LIVE) return false;
        if (this.properties.values.showLcdSyncBtn) {
            const r = this.getLcdBtnRect();
            if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
                this.cycleLcdTheme(1);
                return true;
            }
        }
        return InputManager.handleDoubleClick(x, y, this.state, window.Width, window.Height, this.properties.values, mask);
    }

    onMouseRbtnUp(x, y, mask) {
        if (this.#panelState !== VolumeConstants.LIFECYCLE.LIVE) return false;
        if (mask & 4) return false;

        if (this.properties.values.showLcdSyncBtn) {
            const r = this.getLcdBtnRect();
            if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
                const nextSync = !this.properties.values.syncLcdTheme;
                this.properties.set('syncLcdTheme', nextSync);
                if (nextSync) {
                    try { window.NotifyOthers('LcdThemeSync', this.properties.values.currentLcdTheme); } catch {}
                }
                this.showNotification(`LCD Theme Sync: ${nextSync ? 'ON' : 'OFF'}`);
                window.Repaint();
                return true;
            }
        }

        this.contextMenu.show(x, y);
        return true;
    }

    onKeyDown(vkey) {
        if (this.#panelState !== VolumeConstants.LIFECYCLE.LIVE) return false;

        if (vkey === 0x1B) { // ESC
            if (HudManager.activeSlider) {
                HudManager.activeSlider = null;
                HudManager.clearTimer();
                window.Repaint();
                return true;
            }
        }

        if (HudManager.activeSlider) {
            if (vkey === 0x26 || vkey === 0x27) {
                HudManager.adjustSlider(this.properties, this.dialRenderer, this.sceneCache, this.state, HudManager.activeSlider, 1);
                return true;
            }
            if (vkey === 0x28 || vkey === 0x25) {
                HudManager.adjustSlider(this.properties, this.dialRenderer, this.sceneCache, this.state, HudManager.activeSlider, -1);
                return true;
            }
        }

        const isCtrl  = utils.IsKeyPressed(0x11);
        const isShift = utils.IsKeyPressed(0x10);
        const isAlt   = utils.IsKeyPressed(0x12);

        if (isCtrl && isAlt && !isShift && (vkey === 0x25 || vkey === 0x27)) {
            this.cycleLcdTheme(vkey === 0x27 ? 1 : -1);
            return true;
        }

        if (isShift && isAlt && (vkey === 0x25 || vkey === 0x27)) return false;

        if ((isCtrl && isShift && (vkey === 0x25 || vkey === 0x27)) || (!isCtrl && !isShift && isAlt && (vkey === 0x25 || vkey === 0x27))) {
            this.cycleTheme(vkey === 0x27 ? 1 : -1);
            return true;
        }

        if ((isCtrl && isShift && (vkey === 0x26 || vkey === 0x28)) || (!isCtrl && !isShift && isAlt && (vkey === 0x26 || vkey === 0x28))) {
            this.cycleLightStyle(vkey === 0x28 ? 1 : -1);
            return true;
        }

        if (isCtrl && !isShift && !isAlt && (vkey === 0x26 || vkey === 0x28)) {
            this.cycleDialMode(vkey === 0x28 ? 1 : -1);
            return true;
        }

        if (isCtrl && !isShift && !isAlt && (vkey === 0x25 || vkey === 0x27)) {
            this.cycleTickStyle(vkey === 0x27 ? 1 : -1);
            return true;
        }

        if (isShift && !isCtrl && !isAlt && (vkey === 0x26 || vkey === 0x28)) {
            this.cycleMarkerStyle(vkey === 0x28 ? 1 : -1);
            return true;
        }

        if (isShift && !isCtrl && !isAlt && (vkey === 0x25 || vkey === 0x27)) {
            this.cycleBgMode(vkey === 0x27 ? 1 : -1);
            return true;
        }

        if (!isCtrl && !isShift && !isAlt) {
            if (vkey === 0x26 || vkey === 0x27) {
                InputManager.handleWheel(1, this.state, this.properties.values);
                return true;
            }
            if (vkey === 0x28 || vkey === 0x25) {
                InputManager.handleWheel(-1, this.state, this.properties.values);
                return true;
            }
        }

        return false;
    }

    onNotifyData(name, info) {
        if (this.#panelState !== VolumeConstants.LIFECYCLE.LIVE) return;

        if (name === 'LcdThemeSync' && typeof info === 'string') {
            if (!this.properties.values.syncLcdTheme) return;
            this.properties.set('currentLcdTheme', info);
            this.refreshSyncTooltip();
            window.Repaint();
        }
    }

    dispose() {
        this.#panelState = VolumeConstants.LIFECYCLE.SHUTDOWN;
        if (this.#notifyTimeout) window.ClearTimeout(this.#notifyTimeout);
        this.properties.persistSync(this.themes);
        this.state.cleanup();
        this.sceneCache.cleanup(this.bgRenderer, this.dialRenderer);
        this.assetManager.clear();
        HudManager.clearTimer();
        HudManager.invalidateFont();
        if (this.#notifyFont?.Dispose) {
            try { this.#notifyFont.Dispose(); } catch {}
        }
        this.#notifyFont = null;
        if (this.#pauseTimer) { window.ClearInterval(this.#pauseTimer); this.#pauseTimer = null; }
        if (this.#syncTooltip) {
            try { this.#syncTooltip.Deactivate(); } catch {}
            try { this.#syncTooltip.Dispose(); } catch {}
            this.#syncTooltip = null;
        }
    }
}

// ============================================================================================
// 17. SMP GLOBAL HOOKS & DISPATCH
// ============================================================================================
const app = new VolumeKnobController();

function on_paint(gr) { 
    app.onPaint(gr); 
}

function on_size() { 
    app.onSize(); 
}

function on_colours_changed() { 
    app.onColoursChanged(); 
}

function on_font_changed() { 
    app.onFontChanged(); 
}

function on_volume_change() { 
    app.onVolumeChange(); 
}

function on_playback_new_track() { 
    app.onPlaybackNewTrack(); 
    app.onPlaybackStateChange();
}

function on_playback_starting() { app.onPlaybackStateChange(); }
function on_playback_pause()    { app.onPlaybackStateChange(); }
function on_playback_stop(reason) { if (reason !== 2) app.onPlaybackStateChange(); }

function on_mouse_lbtn_down(x, y, mask) { 
    return app.onMouseLbtnDown(x, y, mask); 
}

function on_mouse_lbtn_up() { 
    return app.onMouseLbtnUp(); 
}

function on_mouse_move(x, y, mask) { 
    return app.onMouseMove(x, y, mask); 
}

function on_mouse_leave() {
    app.onMouseLeave();
}

function on_mouse_wheel(step) { 
    return app.onMouseWheel(step); 
}

function on_mouse_lbtn_dblclk(x, y, mask) { 
    return app.onMouseLbtnDblclk(x, y, mask); 
}

function on_mouse_rbtn_up(x, y, mask) { 
    return app.onMouseRbtnUp(x, y, mask); 
}

function on_key_down(vkey) { 
    return app.onKeyDown(vkey); 
}

function on_notify_data(name, info) { 
    app.onNotifyData(name, info); 
}

function on_script_unload() { 
    app.dispose(); 
}

// Initialize Controller
app.init();