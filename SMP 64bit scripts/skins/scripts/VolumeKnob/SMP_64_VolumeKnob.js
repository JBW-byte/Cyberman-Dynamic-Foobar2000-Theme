'use strict';

		  // ======= AUTHOR L.E.D. (AI-assisted) ========\\
		 // ========  SMP 64bit Volume Knob V4.1  ========\\
		// ======= Custom Theme Creator + JSON I/O ========\\

 // ===================*** Foobar2000 64bit ***================== \\
// ======= For Spider Monkey Panel 64bit, author: marc2003 ======= \\

/* 
 * Custom License for foobar2000 Themes
 * Copyright (c) 2026 [L.E.D.]
 * 
 * Allowed: Non-commercial use and modification.
 * Prohibited: Paid themes, subscriptions, or cloud-bundled services.
 */

window.DefineScript('Volume Knob Omni v4.0', { 
    author: 'L.E.D.', 
    version: '4.1',
    features: { grab_focus: true } 
});

window.DrawMode = 0; // 0 = GDI+, 1 = Direct2D
window.DlgCode = 0x0004; // DLGC_WANTALLKEYS: Preserves Ctrl/Shift + Arrow key capture

// ============================================================================================
// 1. HELPERS, MATH & GDI UTILITIES
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
        // Preserve Windows drive root (e.g., "C:\") and UNC root (e.g., "\\server\share\")
        if (/^[a-zA-Z]:[\\\/]?$/.test(clean)) {
            return clean.substring(0, 2) + '\\';
        }
        if (/^\\\\[^\\]+\\[^\\]+[\\\/]?$/.test(clean)) {
            return clean.replace(/[\\\/]+$/, '') + '\\';
        }
        return clean.replace(/[\/\\]+$/, '');
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
    static DIAL_MODE = { SOLID: 0, CONCENTRIC: 1, KNURLED: 2, BEADBLAST: 3, SANDBLAST: 4, STUDIO: 5, IMAGE: 6 };

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
        FULL_LINE: 7 
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

    // Precomputed trigonometric constants for fast shading
    static COS_WEDGE_PHI = Math.cos(Math.PI / 2.2);
    static SIN_WEDGE_PHI = Math.sin(Math.PI / 2.2);

    static getProfilePath() {
        let p = fb.ProfilePath || '';
        return (p && !p.endsWith('\\') && !p.endsWith('/')) ? `${p}\\` : p;
    }

    static PROFILE_BASE = this.getProfilePath();
    static IMG_DIR = `${this.PROFILE_BASE}skins\\scripts\\VolumeKnob\\`;
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

    saveCustomThemesToProperties(propertyManager) {
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
    names()   { return this.#themes.map(t => t.name); }
    isBuiltin(name) { return ThemeManager.BUILTIN_DEFS.some(b => b.name === name); }

    removeCustom(name) {
        const t = this.#themeMap.get(name);
        if (!t) return { ok: false, error: `Theme "${name}" not found.` };
        if (!t.custom) return { ok: false, error: `Theme "${name}" is not a custom theme.` };
        
        const iList = this.#themes.indexOf(t);
        if (iList !== -1) this.#themes.splice(iList, 1);
        const iCustom = this.#customThemes.indexOf(t);
        if (iCustom !== -1) this.#customThemes.splice(iCustom, 1);
        this.#themeMap.delete(name);
        this.saveCustomThemesToProperties();
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

    loadFromFile(filePath, propertyManager, applySettings = true) {
        if (!filePath?.trim()) return { ok: false, error: 'No file path given.' };
        const cleanPath = GdiUtils.sanitizePath(filePath);
        try {
            if (!utils.IsFile(cleanPath)) return { ok: false, error: `File not found:\n${cleanPath}` };
            const raw = (typeof utils.ReadUTF8 === 'function') ? utils.ReadUTF8(cleanPath) : utils.ReadTextFile(cleanPath);
            if (!raw?.trim()) return { ok: false, error: `JSON file is empty or unreadable:\n${cleanPath}` };
            return this.#parseAndRegister(raw, cleanPath, propertyManager, applySettings);
        } catch (e) { 
            return { ok: false, error: `File read error:\n${e.message || e}` }; 
        }
    }

    #parseAndRegister(jsonText, sourceLabel, propertyManager, applySettings) {
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
                    updated++;
                } else {
                    this.#themes.push(t);
                    this.#themeMap.set(name, t);
                    this.#customThemes.push(t);
                    added++;
                }
            }
            this.saveCustomThemesToProperties();
        }

        let settingsCount = 0;
        if (applySettings && settingsObj) {
            propertyManager.applySettings(settingsObj);
            if (typeof settingsObj.theme === 'string') propertyManager.setTheme(settingsObj.theme, this, false);
            settingsCount = Object.keys(settingsObj).length;
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

        const currentSettings = {
            theme:              propertyManager.values.theme !== '~Preview' ? propertyManager.values.theme : propertyManager.lastFinalizedTheme,
            bgMode:             propertyManager.values.bgMode,
            customBgImage:      propertyManager.values.customBgImage,
            dialMode:           propertyManager.values.dialMode,
            customDialImage:    propertyManager.values.customDialImage,
            spinDialImage:      propertyManager.values.spinDialImage,
            showHighlight:      propertyManager.values.showHighlight,
            dialLightStyle:     propertyManager.values.dialLightStyle,
            dialLightStrength:  propertyManager.values.dialLightStrength,
            dialLightAngle:     propertyManager.values.dialLightAngle,
            showDropShadow:     propertyManager.values.showDropShadow,
            showOuterRing:      propertyManager.values.showOuterRing,
            showTicks:          propertyManager.values.showTicks,
            tickStyle:          propertyManager.values.tickStyle,
            majorTickInterval:  propertyManager.values.majorTickInterval,
            tickMargin:         propertyManager.values.tickMargin,
            tickSizeBonus:      propertyManager.values.tickSizeBonus,
            showDialMarker:     propertyManager.values.showDialMarker,
            markerStyle:        propertyManager.values.markerStyle,
            sweepRange:         propertyManager.values.sweepRange,
            volumeScalingMode:  propertyManager.values.volumeScalingMode
        };

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
                const parent = cleanPath.replace(/[\\\/][^\\\/]*$/, '');
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
            out.settings = {
                bgMode: propertyManager.values.bgMode, customBgImage: propertyManager.values.customBgImage, dialMode: propertyManager.values.dialMode, customDialImage: propertyManager.values.customDialImage, spinDialImage: propertyManager.values.spinDialImage, showHighlight: propertyManager.values.showHighlight, dialLightStyle: propertyManager.values.dialLightStyle, dialLightStrength: propertyManager.values.dialLightStrength, dialLightAngle: propertyManager.values.dialLightAngle, showDropShadow: propertyManager.values.showDropShadow, showOuterRing: propertyManager.values.showOuterRing, showTicks: propertyManager.values.showTicks, tickStyle: propertyManager.values.tickStyle, majorTickInterval: propertyManager.values.majorTickInterval, tickMargin: propertyManager.values.tickMargin, tickSizeBonus: propertyManager.values.tickSizeBonus, showDialMarker: propertyManager.values.showDialMarker, markerStyle: propertyManager.values.markerStyle, sweepRange: propertyManager.values.sweepRange, volumeScalingMode: propertyManager.values.volumeScalingMode
            };
        }
        return out;
    }

    exportTemplate(filePath, propertyManager) { return this.saveToFile(filePath, 'template', propertyManager); }
}

// ============================================================================================
// 5. PROPERTY MANAGER
// ============================================================================================
class PropertyManager {
    #pendingSaves = Object.create(null);
    #saveTimer = null;
    #isBatching = false;
    
    keys = {
        theme:              'VolumeKnob.ThemeName',
        customThemeFile:    'VolumeKnob.CustomThemeFile',
        bgMode:             'VolumeKnob.BgMode',
        customBgImage:      'VolumeKnob.CustomBgImage',
        dialMode:           'VolumeKnob.DialMode',
        customDialImage:    'VolumeKnob.CustomDialImage',
        spinDialImage:      'VolumeKnob.SpinDialImage',
        showHighlight:      'VolumeKnob.ShowHighlight',
        dialLightStyle:     'VolumeKnob.DialLightStyle',
        dialLightStrength:  'VolumeKnob.DialLightStrength',
        dialLightAngle:     'VolumeKnob.DialLightAngle',
        showDropShadow:     'VolumeKnob.ShowDropShadow',
        showOuterRing:      'VolumeKnob.ShowOuterRing',
        showTicks:          'VolumeKnob.ShowTicks',
        tickStyle:          'VolumeKnob.TickStyle',
        majorTickInterval:  'VolumeKnob.MajorTickInterval',
        tickMargin:         'VolumeKnob.TickMargin',
        tickSizeBonus:      'VolumeKnob.TickSizeBonus',
        showDialMarker:     'VolumeKnob.ShowDialMarker',
        markerStyle:        'VolumeKnob.MarkerStyle',
        sweepRange:         'VolumeKnob.SweepRange',
        volumeScalingMode:  'VolumeKnob.VolumeScalingMode'
    };

    defaults = {
        theme:              'Classic Gray',
        customThemeFile:    `${VolumeConstants.PROFILE_BASE}volumeknob_config.json`,
        bgMode:             VolumeConstants.BG_MODE.SOLID,
        customBgImage:      '',
        dialMode:           VolumeConstants.DIAL_MODE.SOLID,
        customDialImage:    '',
        spinDialImage:      true,
        showHighlight:      false,
        dialLightStyle:     VolumeConstants.LIGHT_STYLE.AUTO,
        dialLightStrength:  100,
        dialLightAngle:     315,
        showDropShadow:     true,
        showOuterRing:      true,
        showTicks:          true,
        tickStyle:          1,
        majorTickInterval:  VolumeConstants.MAJOR_INTERVAL.QUARTERS,
        tickMargin:         0,
        tickSizeBonus:      0,
        showDialMarker:     true,
        markerStyle:        0,
        sweepRange:         290,
        volumeScalingMode:  0
    };

    values = {};
    lastFinalizedTheme = '';

    constructor(themeManager) {
        let initialTheme = window.GetProperty(this.keys.theme, null);
        if (initialTheme === null) {
            const legacyIdx = window.GetProperty('VolumeKnob.Theme', null);
            initialTheme = (typeof legacyIdx === 'number' && themeManager.themes[legacyIdx]) ? themeManager.themes[legacyIdx].name : this.defaults.theme;
        }

        let storedBg = String(window.GetProperty(this.keys.customBgImage, this.defaults.customBgImage)).trim().replace(/(^"|"$)/g, '');
        if (storedBg.includes('\\')) storedBg = storedBg.substring(storedBg.lastIndexOf('\\') + 1);
        
        let storedDial = String(window.GetProperty(this.keys.customDialImage, this.defaults.customDialImage)).trim().replace(/(^"|"$)/g, '');
        if (storedDial.includes('\\')) storedDial = storedDial.substring(storedDial.lastIndexOf('\\') + 1);

        this.values = {
            theme:              String(initialTheme),
            customThemeFile:    GdiUtils.sanitizePath(String(window.GetProperty(this.keys.customThemeFile, this.defaults.customThemeFile))),
            bgMode:             this.clampInt(window.GetProperty(this.keys.bgMode, this.defaults.bgMode), 0, 4),
            customBgImage:      storedBg,
            dialMode:           this.clampInt(window.GetProperty(this.keys.dialMode, this.defaults.dialMode), 0, 6),
            customDialImage:    storedDial,
            spinDialImage:      this.parseBool(window.GetProperty(this.keys.spinDialImage, this.defaults.spinDialImage)),
            showHighlight:      this.parseBool(window.GetProperty(this.keys.showHighlight, this.defaults.showHighlight)),
            dialLightStyle:     this.clampInt(window.GetProperty(this.keys.dialLightStyle, this.defaults.dialLightStyle), 0, 10),
            dialLightStrength:  this.clampInt(window.GetProperty(this.keys.dialLightStrength, this.defaults.dialLightStrength), 0, 200),
            dialLightAngle:     this.clampInt(window.GetProperty(this.keys.dialLightAngle, this.defaults.dialLightAngle), 0, 359),
            showDropShadow:     this.parseBool(window.GetProperty(this.keys.showDropShadow, this.defaults.showDropShadow)),
            showOuterRing:      this.parseBool(window.GetProperty(this.keys.showOuterRing, this.defaults.showOuterRing)),
            showTicks:          this.parseBool(window.GetProperty(this.keys.showTicks, this.defaults.showTicks)),
            tickStyle:          this.clampInt(window.GetProperty(this.keys.tickStyle, this.defaults.tickStyle), 0, 7),
            majorTickInterval:  this.clampInt(window.GetProperty(this.keys.majorTickInterval, this.defaults.majorTickInterval), 0, 3),
            tickMargin:         this.clampInt(window.GetProperty(this.keys.tickMargin, this.defaults.tickMargin), 0, 30),
            tickSizeBonus:      this.clampInt(window.GetProperty(this.keys.tickSizeBonus, this.defaults.tickSizeBonus), 0, 100),
            showDialMarker:     this.parseBool(window.GetProperty(this.keys.showDialMarker, this.defaults.showDialMarker)),
            markerStyle:        this.clampInt(window.GetProperty(this.keys.markerStyle, this.defaults.markerStyle), 0, 7),
            sweepRange:         this.clampInt(window.GetProperty(this.keys.sweepRange, this.defaults.sweepRange), 270, 300),
            volumeScalingMode:  this.clampInt(window.GetProperty(this.keys.volumeScalingMode, this.defaults.volumeScalingMode), 0, 1)
        };

        this.lastFinalizedTheme = (this.values.theme !== '~Preview' && this.values.theme !== 'Custom') ? this.values.theme : this.defaults.theme;
    }

    clampInt(val, min, max) { 
        const n = parseInt(val, 10); 
        return isNaN(n) ? min : GdiUtils.clamp(n, min, max); 
    }
    
    parseBool(v) { 
        if (typeof v === 'boolean') return v; 
        if (typeof v === 'string') return v !== 'false' && v !== '0' && v !== ''; 
        return Boolean(v); 
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
        if (!this.#isBatching) {
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

    persistSync(themeManager) {
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
            if (has('bgMode')) this.set('bgMode', this.clampInt(s.bgMode, 0, 4));
            if (typeof s.customBgImage === 'string') this.set('customBgImage', s.customBgImage.trim().replace(/(^"|"$)/g, ''));
            if (has('dialMode')) this.set('dialMode', this.clampInt(s.dialMode, 0, 6));
            if (typeof s.customDialImage === 'string') this.set('customDialImage', s.customDialImage.trim().replace(/(^"|"$)/g, ''));
            if (has('spinDialImage')) this.set('spinDialImage', this.parseBool(s.spinDialImage));
            if (has('showHighlight')) this.set('showHighlight', this.parseBool(s.showHighlight));
            if (has('dialLightStyle')) this.set('dialLightStyle', this.clampInt(s.dialLightStyle, 0, 10));
            if (has('dialLightStrength')) this.set('dialLightStrength', this.clampInt(s.dialLightStrength, 0, 200));
            if (has('dialLightAngle')) this.set('dialLightAngle', this.clampInt(s.dialLightAngle, 0, 359));
            if (has('showDropShadow')) this.set('showDropShadow', this.parseBool(s.showDropShadow));
            if (has('showOuterRing')) this.set('showOuterRing', this.parseBool(s.showOuterRing));
            if (has('showTicks')) this.set('showTicks', this.parseBool(s.showTicks));
            if (has('tickStyle')) this.set('tickStyle', this.clampInt(s.tickStyle, 0, 7));
            if (has('majorTickInterval')) this.set('majorTickInterval', this.clampInt(s.majorTickInterval, 0, 3));
            if (has('tickMargin')) this.set('tickMargin', this.clampInt(s.tickMargin, 0, 30));
            if (has('tickSizeBonus')) this.set('tickSizeBonus', this.clampInt(s.tickSizeBonus, 0, 100));
            if (has('showDialMarker')) this.set('showDialMarker', this.parseBool(s.showDialMarker));
            if (has('markerStyle')) this.set('markerStyle', this.clampInt(s.markerStyle, 0, 7));
            if (has('sweepRange')) {
                const range = this.clampInt(s.sweepRange, 270, 300);
                this.set('sweepRange', range);
                VolumeConfig.sweepRangeDeg = range;
            }
            if (has('volumeScalingMode')) this.set('volumeScalingMode', this.clampInt(s.volumeScalingMode, 0, 1));
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

    resetVisuals(themeManager) {
        this.beginBatch();
        try {
            this.setTheme(this.defaults.theme, themeManager);
            this.set('bgMode', this.defaults.bgMode);
            this.set('dialMode', this.defaults.dialMode);
            this.set('spinDialImage', this.defaults.spinDialImage);
            this.set('showHighlight', this.defaults.showHighlight);
            this.set('dialLightStyle', this.defaults.dialLightStyle);
            this.set('dialLightStrength', this.defaults.dialLightStrength);
            this.set('dialLightAngle', this.defaults.dialLightAngle);
            this.set('showDropShadow', this.defaults.showDropShadow);
            this.set('showOuterRing', this.defaults.showOuterRing);
            this.set('showTicks', this.defaults.showTicks);
            this.set('tickStyle', this.defaults.tickStyle);
            this.set('majorTickInterval', this.defaults.majorTickInterval);
            this.set('tickMargin', this.defaults.tickMargin);
            this.set('tickSizeBonus', this.defaults.tickSizeBonus);
            this.set('showDialMarker', this.defaults.showDialMarker);
            this.set('markerStyle', this.defaults.markerStyle);
            this.set('sweepRange', this.defaults.sweepRange);
            this.set('volumeScalingMode', this.defaults.volumeScalingMode);
        } finally {
            this.endBatch();
        }
    }

    resetAll(themeManager) {
        this.beginBatch();
        try {
            this.resetVisuals(themeManager);
            this.set('customBgImage', this.defaults.customBgImage);
            this.set('customDialImage', this.defaults.customDialImage);
            this.set('customThemeFile', this.defaults.customThemeFile);
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

    getSandblastTile() {
        if (this.#sandblastTile) return this.#sandblastTile;
        const size = 256;
        const img = gdi.CreateImage(size, size);
        const g = img.GetGraphics();
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
        img.ReleaseGraphics(g);
        this.#sandblastTile = img;
        return this.#sandblastTile;
    }

    getSatinTile() {
        if (this.#satinTile) return this.#satinTile;
        const size = 128;
        const img = gdi.CreateImage(size, size);
        const g = img.GetGraphics();
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
        img.ReleaseGraphics(g);
        this.#satinTile = img;
        return this.#satinTile;
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

        try {
            const bmp = gdi.CreateImage(w, h);
            const g = bmp.GetGraphics();
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
                for (let y = 0; y < h; y += 256) {
                    for (let x = 0; x < w; x += 256) {
                        g.DrawImage(tile, x, y, 256, 256, 0, 0, 256, 256);
                    }
                }
                g.FillSolidRect(0, 0, w, 1, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), 25));
                g.FillSolidRect(0, h - 1, w, 1, GdiUtils.setAlpha(GdiUtils.colour(0, 0, 0), 45));

            } else if (bgMode === VolumeConstants.BG_MODE.SATIN) {
                g.FillSolidRect(0, 0, w, h, theme.bg);
                g.FillGradRect(0, 0, w, h, 90, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), 18), GdiUtils.setAlpha(GdiUtils.colour(0, 0, 0), 22));

                const tile = this.getSatinTile();
                for (let y = 0; y < h; y += 128) {
                    for (let x = 0; x < w; x += 128) {
                        g.DrawImage(tile, x, y, 128, 128, 0, 0, 128, 128, 0, 185);
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

            bmp.ReleaseGraphics(g);
            this.#bitmap = bmp;
            gr.SetInterpolationMode(2);
            gr.DrawImage(this.#bitmap, 0, 0, w, h, 0, 0, w, h);
        } catch { 
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
        const key = `${size}|${dialMode}|${theme.inner}|${customImgPath}|${lightStyle}|${lightAngleDeg}|${lightStrength}|${showHighlight ? 1 : 0}`;

        if (this.#bmpBase && this.#key === key) {
            gr.SetInterpolationMode(2);
            gr.DrawImage(this.#bmpBase, x, y, size, size, 0, 0, size, size, drawAngle, 255);
            if (showHighlight && this.#bmpLight) {
                gr.DrawImage(this.#bmpLight, x, y, size, size, 0, 0, size, size, 0, 255);
            }
            return;
        }

        this.invalidate();
        this.#key = key;

        try {
            const bmpBase = gdi.CreateImage(size, size);
            const gBase = bmpBase.GetGraphics();
            gBase.SetSmoothingMode(2);

            const bmpLight = gdi.CreateImage(size, size);
            const gLight = bmpLight.GetGraphics();
            gLight.SetSmoothingMode(2);

            const cx = size / 2;
            const cy = size / 2;
            const R = size / 2;

            let seed = 54321;
            const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

            const lightRad = ((lightAngleDeg % 360 + 360) % 360) * VolumeConstants.DEG2RAD;
            const strMul = Math.max(0, lightStrength / 100);

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
                for (let ty = 0; ty < size; ty += 256) {
                    for (let tx = 0; tx < size; tx += 256) gBase.DrawImage(tile, tx, ty, 256, 256, 0, 0, 256, 256);
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
                for (let ty = 0; ty < size; ty += 256) {
                    for (let tx = 0; tx < size; tx += 256) gBase.DrawImage(tile, tx, ty, 256, 256, 0, 0, 256, 256);
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
                        const tw = tile.Width, th = tile.Height;
                        for (let ty = 0; ty < res; ty += th) {
                            for (let tx = 0; tx < res; tx += tw) {
                                cg.DrawImage(tile, tx, ty, tw, th, 0, 0, tw, th, 0, 50);
                            }
                        }
                        coreBmp.ReleaseGraphics(cg);

                        coreMask = gdi.CreateImage(res, res);
                        const cmg = coreMask.GetGraphics();
                        cmg.SetSmoothingMode(2);
                        cmg.FillSolidRect(0, 0, res, res, GdiUtils.colour(255, 255, 255));
                        cmg.FillEllipse(0, 0, res, res, GdiUtils.colour(0, 0, 0));
                        coreMask.ReleaseGraphics(cmg);

                        coreBmp.ApplyMask(coreMask);
                        gBase.DrawImage(coreBmp, Math.round(cx - rBorderInner), Math.round(cy - rBorderInner), res, res, 0, 0, res, res);
                    }
                } finally {
                    if (coreMask?.Dispose) { try { coreMask.Dispose(); } catch {} }
                    if (coreBmp?.Dispose) { try { coreBmp.Dispose(); } catch {} }
                }

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
            if (showHighlight && strMul > 0.01) {
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
                        gi.SetSmoothingMode(2);
                        gi.FillGradRect(0, 0, res, res, gdiAngle, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), 0), GdiUtils.colour(255, 255, 255));
                        gradBmp.ReleaseGraphics(gi);

                        maskBmp = gdi.CreateImage(res, res);
                        const gm = maskBmp.GetGraphics();
                        gm.SetSmoothingMode(2);
                        gm.FillSolidRect(0, 0, res, res, GdiUtils.colour(255, 255, 255));
                        gm.FillEllipse(0, 0, res, res, GdiUtils.colour(0, 0, 0));
                        maskBmp.ReleaseGraphics(gm);

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
                        bg.SetSmoothingMode(2);
                        const barAlpha = GdiUtils.clamp(Math.round(48 * strMul), 0, 255);
                        bg.FillGradRect(0, 0, res, res, 0, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), 0), GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), barAlpha), 0.5);
                        barBmp.ReleaseGraphics(bg);

                        maskBmp = gdi.CreateImage(res, res);
                        const mg = maskBmp.GetGraphics();
                        mg.SetSmoothingMode(2);
                        mg.FillSolidRect(0, 0, res, res, GdiUtils.colour(255, 255, 255));
                        mg.FillEllipse(0, 0, res, res, GdiUtils.colour(0, 0, 0));
                        maskBmp.ReleaseGraphics(mg);

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
            bmpLight.ReleaseGraphics(gLight);

            let mask = null;
            try {
                mask = gdi.CreateImage(size, size);
                const mg = mask.GetGraphics();
                mg.SetSmoothingMode(2);
                mg.FillSolidRect(0, 0, size, size, GdiUtils.colour(255, 255, 255));
                mg.FillEllipse(0, 0, size, size, GdiUtils.colour(0, 0, 0));
                mask.ReleaseGraphics(mg);

                bmpBase.ApplyMask(mask);
                bmpLight.ApplyMask(mask);
            } finally {
                if (mask?.Dispose) { try { mask.Dispose(); } catch {} }
            }

            this.#bmpBase = bmpBase;
            this.#bmpLight = bmpLight;

            gr.SetInterpolationMode(2);
            gr.DrawImage(this.#bmpBase, x, y, size, size, 0, 0, size, size, drawAngle, 255);
            if (showHighlight) {
                gr.DrawImage(this.#bmpLight, x, y, size, size, 0, 0, size, size, 0, 255);
            }
        } catch {
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
    static #font = null;
    static #fontScale = 0;
    static #timeoutTimer = null;

    static getFont(sizePt = 11, bold = false) {
        const s = GdiUtils.scale(sizePt);
        if (!this.#font || this.#fontScale !== s) {
            this.invalidateFont();
            this.#fontScale = s;
            try { 
                this.#font = gdi.Font('Segoe UI', s, bold ? 1 : 0); 
            } catch { 
                this.#font = null; 
            }
        }
        return this.#font;
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
        if (this.#font?.Dispose) {
            try { this.#font.Dispose(); } catch {}
        }
        this.#font = null;
        this.#fontScale = 0;
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
            props.tickMargin, props.tickSizeBonus,
            props.showDropShadow,
            props.dialMode, dialImagePath, dialBakesIntoBase,
            props.showHighlight, props.dialLightStyle, props.dialLightStrength, props.dialLightAngle
        ].join('|');

        if (this.#bitmap && this.#key === key) return this.#bitmap;

        if (this.#bitmap?.Dispose) {
            try { this.#bitmap.Dispose(); } catch {}
        }
        this.#bitmap = null;
        this.#key = key;

        try {
            const bmp = gdi.CreateImage(w, h);
            const g = bmp.GetGraphics();
            g.SetSmoothingMode(2);

            const cx = cache.cx;
            const cy = cache.cy;
            const rInner = cache.innerSize / 2;

            const aoPad = props.showDropShadow ? Math.max(2, Math.round(cache.size * 0.014)) : 0;
            const marginPx = GdiUtils.scale(props.tickMargin || 0);
            const sizeMul = 1.0 + (props.tickSizeBonus || 0) / 100;
            
            const rBase = rInner + aoPad + marginPx;
            const rOuter = Math.min(cache.radius, rBase + (cache.tickLength * 1.6 * sizeMul));
            const span  = Math.max(2, rOuter - rBase);

            const sweepTotal = config.ANGLE_MAX - config.ANGLE_MIN;

            const drawCustomArcDeg = (graphics, x, y, radius, startDeg, sweepDeg, strokeWidth, color) => {
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

            // 4. Tick Marks (8 Styles)
            if (props.showTicks && cache.tickAngles) {
                const intervalMode = props.majorTickInterval;

                if (props.tickStyle === VolumeConstants.TICK_STYLE.UNIFORM) {
                    const len = Math.min(span, cache.tickLength * 1.5 * sizeMul);
                    const r2 = rBase + len;
                    const tickStroke = Math.max(1, Math.round(cache.strokeWidth * sizeMul));

                    for (let i = 0; i < config.TICK_COUNT; i++) {
                        const a = cache.tickAngles[i];
                        g.DrawLine(cx + Math.sin(a) * rBase, cy - Math.cos(a) * rBase, cx + Math.sin(a) * r2, cy - Math.cos(a) * r2, tickStroke, theme.tick);
                    }
                } else if (props.tickStyle === VolumeConstants.TICK_STYLE.MAJOR) {
                    const lenMajor = span;
                    const lenMinor = (intervalMode === VolumeConstants.MAJOR_INTERVAL.NONE) ? span : (lenMajor * 0.60);
                    const strokeMajor = Math.max(2, Math.round(cache.strokeWidth * 1.5 * sizeMul));
                    const strokeMinor = (intervalMode === VolumeConstants.MAJOR_INTERVAL.NONE) ? strokeMajor : Math.max(1, Math.round(cache.strokeWidth * 0.75 * sizeMul));

                    for (let i = 0; i < config.TICK_COUNT; i++) {
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

                    for (let i = 0; i < config.TICK_COUNT; i++) {
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

                    for (let i = 0; i < config.TICK_COUNT; i++) {
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

                    for (let i = 0; i < config.TICK_COUNT; i++) {
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
                        // Fixed: Tangent vector Y-offset correctly aligned with +sa
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
                    g.DrawEllipse(cx - rOuterArc, cy - rOuterArc, rOuterArc * 2, rOuterArc * 2, 1, GdiUtils.setAlpha(theme.tick, 120));

                    const lenMajor = span * 0.90;
                    const lenMinor = (intervalMode === VolumeConstants.MAJOR_INTERVAL.NONE) ? lenMajor : (span * 0.45);
                    const strokeMajor = Math.max(1.5, Math.round(cache.strokeWidth * 1.2 * sizeMul));
                    const strokeMinor = Math.max(1, Math.round(1 * sizeMul));

                    for (let i = 0; i < config.TICK_COUNT; i++) {
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

                    for (let i = 0; i < config.TICK_COUNT; i++) {
                        const a = cache.tickAngles[i];
                        if (i === 0 || i === config.TICK_COUNT - 1) {
                            g.DrawLine(cx + Math.sin(a) * rBase, cy - Math.cos(a) * rBase, cx + Math.sin(a) * (rBase + span), cy - Math.cos(a) * (rBase + span), majorStroke, theme.tick);
                        } else if (VolumeConstants.isMajorTick(i, intervalMode) || intervalMode === VolumeConstants.MAJOR_INTERVAL.NONE) {
                            g.DrawLine(cx + Math.sin(a) * rArc, cy - Math.cos(a) * rArc, cx + Math.sin(a) * (rBase + span * 0.8), cy - Math.cos(a) * (rBase + span * 0.8), minorStroke, theme.tick);
                        }
                    }
                    
                    const fontSize = Math.max(8, Math.round(cache.size * 0.048));
                    let tinyFont = null;
                    try { tinyFont = gdi.Font('Segoe UI', fontSize, 1); } catch {}
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
                            g.DrawString("MIN", tinyFont, theme.tick, txMin - szMin.Width / 2, tyMin - szMin.Height / 2, szMin.Width, szMin.Height);
                            g.DrawString("MAX", tinyFont, theme.tick, txMax - szMax.Width / 2, tyMax - szMax.Height / 2, szMax.Width, szMax.Height);
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

                    for (let i = 0; i < config.TICK_COUNT; i++) {
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

            // 5. Main Dial Face
            if (dialBakesIntoBase) {
                const innerX = cache.cx - cache.innerSize / 2;
                const innerY = cy - cache.innerSize / 2;
                dialRenderer.draw(
                    g, innerX, innerY, cache.innerSize, props.dialMode, dialImagePath, 
                    theme, assetManager, bgRenderer, 0, false, props.dialLightStyle, props.dialLightAngle, props.dialLightStrength, props.showHighlight
                );
            }

            bmp.ReleaseGraphics(g);
            this.#bitmap = bmp;
            return this.#bitmap;
        } catch {
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

// Fixed: Exactly accounts for -100 dB to -15 dB (85 dB range / 20% = 4.25 dB/%)
const VOL_SLOPE_1 = (VolumeConfig.DB_BREAKPOINT_1 + 100) / VolumeConfig.VOL_BREAKPOINT_1;
const VOL_SLOPE_2 = (VolumeConfig.DB_BREAKPOINT_2 - VolumeConfig.DB_BREAKPOINT_1) / (VolumeConfig.VOL_BREAKPOINT_2 - VolumeConfig.VOL_BREAKPOINT_1);
const VOL_SLOPE_3 = Math.abs(VolumeConfig.DB_BREAKPOINT_2) / (100 - VolumeConfig.VOL_BREAKPOINT_2);

// ============================================================================================
// 11. STATE MANAGEMENT (SUB-RECT INVALIDATION & ZERO-IDLE)
// ============================================================================================
class VolumeState {
    dragging = false;
    lastX = 0;
    lastY = 0;
    uiVolume = 50;
    currentAngle = 0;
    targetAngle = 0;
    dragTargetAngle = 0;
    needsRepaint = false;

    #animationTimer = null;
    muteResyncTimer = null;

    geometryCache = {
        valid: false, width: 0, height: 0, hasShadow: false,
        cx: 0, cy: 0, size: 0, radius: 0, innerSize: 0,
        rOuter: 0, tickLength: 0, strokeWidth: 2, markerWidth: 2, tickAngles: []
    };

    updateGeometryCache(w, h, props) {
        const cache = this.geometryCache;
        const hasShadow = props ? props.showDropShadow : true;
        if (cache.valid && cache.width === w && cache.height === h && cache.hasShadow === hasShadow) return;

        const padBase = hasShadow ? Math.max(4, Math.round(VolumeConfig.BASE_PADDING * 0.65)) : VolumeConfig.BASE_PADDING;
        const padding = GdiUtils.scale(padBase);
        const innerRatio = hasShadow ? 0.89 : VolumeConfig.INNER_RATIO;
        
        const marginPx = GdiUtils.scale(props ? (props.tickMargin || 0) : 0);
        const sizeBonus = props ? (props.tickSizeBonus || 0) : 0;
        const sizeMul = 1.0 + (sizeBonus / 100);
        const tickRatio = VolumeConfig.TICK_LENGTH_RATIO * sizeMul;

        const expansionAllowance = marginPx * 2 + (GdiUtils.scale(20) * (sizeBonus / 100));

        cache.width  = w;
        cache.height = h;
        cache.hasShadow = hasShadow;
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
        if (this.#animationTimer) return;
        this.#animationTimer = window.SetInterval(() => {
            // True Zero-Idle: Suspend timer completely when window is hidden
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
        // Adequate padding ensures MIN/MAX labels and marker tips are never clipped
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

    static syncFromFoobar(state, props) {
        try {
            const fbVol = GdiUtils.clamp(fb.Volume, -100, 0);
            state.uiVolume = this.dbToUi(fbVol, props);
            state.targetAngle = state.dragTargetAngle = this.uiToAngle(state.uiVolume);
            state.currentAngle = state.targetAngle;
            state.requestRepaint();
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
            }
        } catch {}
    }
}

// ============================================================================================
// 13. MAIN RENDERER (LOW-ALLOCATION VECTOR PIPELINE)
// ============================================================================================
class MainRenderer {
    // Pre-allocated coordinate buffers to minimize GC spikes
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

            if (props.showDialMarker) {
                const rotationAngleDeg = state.currentAngle + VolumeConfig.ROTATION_OFFSET;
                const rad = rotationAngleDeg * VolumeConstants.DEG2RAD;
                const sr  = Math.sin(rad);
                const cr  = Math.cos(rad);
                
                let isMuted = false;
                try { isMuted = fb.IsMainMenuCommandChecked('Playback/Volume/Mute'); } catch {}
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
                    const srWE = sr * wE, crWE = cr * wE;

                    const tX  = cx + srRT,          tY  = cy - crRT;
                    const blX = cx + srRB - crWE,   blY = cy - crRB - srWE;
                    const brX = cx + srRB + crWE,   brY = cy - crRB + srWE;
                    const rC  = rB + rDial * 0.05;
                    const bcX = cx + sr * rC,       bcY = cy - cr * rC;

                    const lightRad = ((props.dialLightAngle || 315) % 360) * VolumeConstants.DEG2RAD;
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

                    const lightRad = ((props.dialLightAngle || 315) % 360) * VolumeConstants.DEG2RAD;
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
                    gr.DrawString(valStr, font, GdiUtils.setAlpha(GdiUtils.colour(255, 255, 255), 235), (w - lSize.Width) / 2, by + 6, lSize.Width + 4, lSize.Height);
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
        state.lastX = x;
        state.lastY = y;
        state.startAnimation();
        return true;
    }

    static handleDragEnd(state, props) {
        if (!state.dragging) return false;
        state.dragging = false;
        VolumeEngine.setFoobarVolume(state.uiVolume, false, state, props);
        state.targetAngle = state.dragTargetAngle;
        state.requestRepaint();
        return true;
    }

    static handleDragMove(x, y, state, props) {
        if (!state.dragging) return false;
        
        const delta = ((x - state.lastX) + (state.lastY - y)) * VolumeConfig.DRAG_SCALE;
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
        try {
            fb.RunMainMenuCommand('Playback/Volume/Mute');
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
// 15. CONTEXT MENU MANAGER
// ============================================================================================
class ContextMenuManager {
    constructor(controller) {
        this.controller = controller;
    }

    #doColorPicker(label, key) {
        const applied = this.controller.properties.values.theme;
        
        // Only seed from a base theme if we are NOT already on a customized theme
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

        // 1. Explicitly update the selected channel (knob or inner) and persist to foobar storage
        this.controller.themes.updateDraft(key, newArgb);

        // 2. Build the persistent 'Custom' theme with the discrete outer ring and dial colors intact
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

        // 3. Keep 'Custom' active without letting it overwrite with base theme colors
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

        const currentStyleSettings = {
            bgMode:             this.controller.properties.values.bgMode,
            customBgImage:      this.controller.properties.values.customBgImage,
            dialMode:           this.controller.properties.values.dialMode,
            customDialImage:    this.controller.properties.values.customDialImage,
            spinDialImage:      this.controller.properties.values.spinDialImage,
            showHighlight:      this.controller.properties.values.showHighlight,
            dialLightStyle:     this.controller.properties.values.dialLightStyle,
            dialLightStrength:  this.controller.properties.values.dialLightStrength,
            dialLightAngle:     this.controller.properties.values.dialLightAngle,
            showDropShadow:     this.controller.properties.values.showDropShadow,
            showOuterRing:      this.controller.properties.values.showOuterRing,
            showTicks:          this.controller.properties.values.showTicks,
            tickStyle:          this.controller.properties.values.tickStyle,
            majorTickInterval:  this.controller.properties.values.majorTickInterval,
            tickMargin:         this.controller.properties.values.tickMargin,
            tickSizeBonus:      this.controller.properties.values.tickSizeBonus,
            showDialMarker:     this.controller.properties.values.showDialMarker,
            markerStyle:        this.controller.properties.values.markerStyle,
            sweepRange:         this.controller.properties.values.sweepRange,
            volumeScalingMode:  this.controller.properties.values.volumeScalingMode
        };

        const d = this.controller.themes.draftTheme;
        const t = this.controller.themes.makeTheme(name, d.bg, d.knob, d.inner, d.tick, d.marker, currentStyleSettings);
        t.custom = true;

        this.controller.themes.addOrUpdate(t, true);
        this.controller.properties.setTheme(name, this.controller.themes);
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

        if (Math.random() < 0.30) {
            const otherThemes = this.controller.themes.themes.filter(t => t.name !== chosen && t.name !== '~Preview');
            if (otherThemes.length > 0) {
                const randOther = otherThemes[rand(0, otherThemes.length - 1)];
                this.controller.themes.seedDraftFromTheme(this.controller.themes.get(chosen));
                
                this.controller.themes.updateDraft('knob', randOther.knob);
                
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
			} else {
            // Apply the randomly picked theme for the standard 70% branch
            this.controller.themes.clearPreview();
            this.controller.properties.setTheme(chosen, this.controller.themes, false);
			}
        

        const availableBgModes = [0, 1, 2, 3];
        this.controller.properties.set('bgMode', availableBgModes[rand(0, availableBgModes.length - 1)]);

        const availableDialModes = [0, 1, 2, 3, 4, 5];
        const chosenDialMode = availableDialModes[rand(0, availableDialModes.length - 1)];
        this.controller.properties.set('dialMode', chosenDialMode);

        let chosenLightStyle = VolumeConstants.LIGHT_STYLE.SPOTLIGHT;

        if (chosenDialMode === VolumeConstants.DIAL_MODE.KNURLED) {
            this.controller.properties.set('showHighlight', true);
            const knurlLighting = [VolumeConstants.LIGHT_STYLE.STUDIO_SHEEN, VolumeConstants.LIGHT_STYLE.STUDIO_ANISO];
            chosenLightStyle = knurlLighting[rand(0, knurlLighting.length - 1)];
        } else if (chosenDialMode === VolumeConstants.DIAL_MODE.BEADBLAST) {
            this.controller.properties.set('showHighlight', true);
            chosenLightStyle = VolumeConstants.LIGHT_STYLE.SPOTLIGHT;
        } else if (chosenDialMode === VolumeConstants.DIAL_MODE.SANDBLAST) {
            this.controller.properties.set('showHighlight', false);
            chosenLightStyle = VolumeConstants.LIGHT_STYLE.SPOTLIGHT;
            this.controller.properties.set('spinDialImage', false);
        } else if (chosenDialMode === VolumeConstants.DIAL_MODE.STUDIO) {
            this.controller.properties.set('showHighlight', false);
            chosenLightStyle = VolumeConstants.LIGHT_STYLE.SPOTLIGHT;
            this.controller.properties.set('spinDialImage', false);
        } else if (chosenDialMode === VolumeConstants.DIAL_MODE.CONCENTRIC) {
            this.controller.properties.set('showHighlight', true);
            const concentricLighting = [VolumeConstants.LIGHT_STYLE.ANISOTROPIC, VolumeConstants.LIGHT_STYLE.ANISO_BEVEL, VolumeConstants.LIGHT_STYLE.STUDIO_ANISO, VolumeConstants.LIGHT_STYLE.SPUN_METAL];
            chosenLightStyle = concentricLighting[rand(0, concentricLighting.length - 1)];
        } else if (chosenDialMode === VolumeConstants.DIAL_MODE.SOLID) {
            if (Math.random() < 0.15) {
                this.controller.properties.set('showHighlight', true);
                chosenLightStyle = [VolumeConstants.LIGHT_STYLE.STUDIO_SHEEN, VolumeConstants.LIGHT_STYLE.STUDIO_ANISO, VolumeConstants.LIGHT_STYLE.SPUN_METAL][rand(0, 2)];
            } else {
                this.controller.properties.set('showHighlight', false);
                chosenLightStyle = [VolumeConstants.LIGHT_STYLE.SPOTLIGHT, VolumeConstants.LIGHT_STYLE.CONTOUR_DOME, VolumeConstants.LIGHT_STYLE.CONCAVE_BOWL][rand(0, 2)];
            }
        }
        this.controller.properties.set('dialLightStyle', chosenLightStyle);

        let validMarkers = [];
        if (chosenDialMode === VolumeConstants.DIAL_MODE.STUDIO) {
            validMarkers = [VolumeConstants.MARKER_STYLE.ARROW, VolumeConstants.MARKER_STYLE.VSHORT];
        } else if (chosenDialMode === VolumeConstants.DIAL_MODE.KNURLED) {
            validMarkers = [VolumeConstants.MARKER_STYLE.SHORT, VolumeConstants.MARKER_STYLE.ARROW, VolumeConstants.MARKER_STYLE.CIRCLE];
        } else if (chosenDialMode === VolumeConstants.DIAL_MODE.CONCENTRIC && 
                   (chosenLightStyle === VolumeConstants.LIGHT_STYLE.ANISO_BEVEL || chosenLightStyle === VolumeConstants.LIGHT_STYLE.STUDIO_ANISO)) {
            validMarkers = [VolumeConstants.MARKER_STYLE.SHORT, VolumeConstants.MARKER_STYLE.ARROW, VolumeConstants.MARKER_STYLE.CIRCLE];
        } else {
            validMarkers = [
                VolumeConstants.MARKER_STYLE.LINE,
                VolumeConstants.MARKER_STYLE.CIRCLE,
                VolumeConstants.MARKER_STYLE.ARROW,
                VolumeConstants.MARKER_STYLE.SHORT,
                VolumeConstants.MARKER_STYLE.BEVEL_WEDGE,
                VolumeConstants.MARKER_STYLE.BEVEL_SLOT,
                VolumeConstants.MARKER_STYLE.FULL_LINE
            ];
        }
        this.controller.properties.set('markerStyle', validMarkers[rand(0, validMarkers.length - 1)]);

        this.controller.properties.set('dialLightStrength', rand(50, 110));
        this.controller.properties.set('dialLightAngle', rand(0, 7) * 45);
        this.controller.properties.set('tickStyle', rand(0, 7));
        this.controller.properties.set('majorTickInterval', rand(0, 3));
        this.controller.properties.set('showTicks', Math.random() < 0.85);
        this.controller.properties.set('showDropShadow', Math.random() < 0.90);
        this.controller.properties.set('spinDialImage', (chosenDialMode !== VolumeConstants.DIAL_MODE.SANDBLAST && chosenDialMode !== VolumeConstants.DIAL_MODE.STUDIO));
        this.controller.properties.set('showOuterRing', coin());
        this.controller.properties.set('showDialMarker', true);

        this.controller.dialRenderer.invalidate();
        this.controller.state.invalidateGeometry();
        this.controller.sceneCache.invalidate(this.controller.bgRenderer, this.controller.dialRenderer);
        this.controller.state.requestRepaint();
    }

    #doRemoveCustomTheme(name) {
        const result = this.controller.themes.removeCustom(name);
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
            this.controller.properties.setTheme(fallback, this.controller.themes);
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

    show(x, y) {
        if (this.controller.properties.values.theme !== '~Preview' && this.controller.properties.values.theme !== 'Custom') {
            if (this.controller.themes.draftBaseTheme !== this.controller.properties.values.theme) {
                this.controller.themes.seedDraftFromTheme(this.controller.themes.get(this.controller.properties.values.theme));
            }
        }

        const m = window.CreatePopupMenu();
        const themeMenu = window.CreatePopupMenu();
        const themeCustomMenu = window.CreatePopupMenu();
        const creatorMenu = window.CreatePopupMenu();
        const removeThemeMenu = window.CreatePopupMenu();
        const bgMenu = window.CreatePopupMenu();
        const dialMenu = window.CreatePopupMenu();
        const lightSubMenu = window.CreatePopupMenu();
        const lightStyleMenu = window.CreatePopupMenu();
        const lightAngleMenu = window.CreatePopupMenu();
        const lightStrengthMenu = window.CreatePopupMenu();
        const effectsMenu = window.CreatePopupMenu();
        const tickStyleMenu = window.CreatePopupMenu();
        const majorIntervalMenu = window.CreatePopupMenu();
        const markerStyleMenu = window.CreatePopupMenu();
        const rangeMenu = window.CreatePopupMenu();
        const bgImgSubMenu = window.CreatePopupMenu();
        const dialImgSubMenu = window.CreatePopupMenu();

        const allMenus = [
            m, themeMenu, themeCustomMenu, creatorMenu, removeThemeMenu,
            bgMenu, dialMenu, lightSubMenu, lightStyleMenu, lightAngleMenu, lightStrengthMenu,
            effectsMenu, tickStyleMenu, majorIntervalMenu, markerStyleMenu, rangeMenu, bgImgSubMenu, dialImgSubMenu
        ];

        const names = this.controller.themes.names();
        const props = this.controller.properties.values;
        const availableImages = this.controller.assetManager.getAvailableImages();

        let activeThemeIdx = 0;
        for (let i = 0; i < names.length; i++) {
            const isCustom = this.controller.themes.get(names[i])?.custom;
            themeMenu.AppendMenuItem(0, 100 + i, `${names[i]}${isCustom ? '  [custom]' : ''}`);
            if (names[i] === props.theme) activeThemeIdx = i;
        }
        if (names.length > 0) themeMenu.CheckMenuRadioItem(100, 100 + names.length - 1, 100 + activeThemeIdx);
        themeMenu.AppendMenuSeparator();

        themeCustomMenu.AppendMenuItem(0, 2000, 'Load Settings & Themes from JSON…');
        const hasFile = props.customThemeFile && props.customThemeFile.trim() !== '';
        themeCustomMenu.AppendMenuItem(hasFile ? 0 : 1, 2001, `Reload from last file${hasFile ? `  (${this.#shortPath(props.customThemeFile)})` : ''}`);
        themeCustomMenu.AppendMenuItem(0, 2002, 'Save Settings & Custom Themes to JSON…');
        themeCustomMenu.AppendMenuItem(0, 2003, 'Export All (Settings & All Themes)…');
        themeCustomMenu.AppendMenuItem(0, 2004, 'Export Template (Built-in Themes Only)…');
        themeCustomMenu.AppendMenuSeparator();
        themeCustomMenu.AppendMenuItem(0, 2005, `Set Default JSON File Path…${hasFile ? `  (${this.#shortPath(props.customThemeFile)})` : ''}`);
        themeCustomMenu.AppendTo(themeMenu, 0, 'Settings & Themes (JSON)');

        creatorMenu.AppendMenuItem(0, 3001, '1. Set Background Color…');
        creatorMenu.AppendMenuItem(0, 3002, '2. Set Main Dial (Inner Face Color)...');
        creatorMenu.AppendMenuItem(0, 3003, '3. Set Outer Ring (Knob Body Color)...');
        creatorMenu.AppendMenuItem(0, 3004, '4. Set Tick Marks Color…');
        creatorMenu.AppendMenuItem(0, 3005, '5. Set Dial Marker (Pointer Color)...');

        const customs = this.controller.themes.customThemes;
        if (customs.length) {
            for (let ci = 0; ci < customs.length; ci++) {
                removeThemeMenu.AppendMenuItem(0, 4000 + ci, customs[ci].name);
            }
        } else {
            removeThemeMenu.AppendMenuItem(1, 4000, 'No custom themes');
        }
        creatorMenu.AppendMenuSeparator();
        removeThemeMenu.AppendTo(creatorMenu, 0, 'Remove Custom Theme…');
        creatorMenu.AppendTo(themeMenu, 0, 'Theme Creator');

        bgMenu.AppendMenuItem(0, 6000, 'Solid (Theme Color)');
        bgMenu.AppendMenuItem(0, 6001, 'Brushed Aluminum (Horizontal)');
        bgMenu.AppendMenuItem(0, 6002, 'Sandblast Matte (Bead-Blasted)');
        bgMenu.AppendMenuItem(0, 6003, 'Satin Velvet (Smooth Matte)');
        bgMenu.AppendMenuSeparator();

        if (availableImages.length === 0) {
            bgImgSubMenu.AppendMenuItem(1, 0, '(No images in skins\\scripts\\VolumeKnob)');
        } else {
            for (let i = 0; i < availableImages.length; i++) bgImgSubMenu.AppendMenuItem(0, 10000 + i, availableImages[i]);
        }
        bgImgSubMenu.AppendTo(bgMenu, 0, 'Custom Image');

        if (props.bgMode === VolumeConstants.BG_MODE.IMAGE && availableImages.includes(props.customBgImage)) {
            bgImgSubMenu.CheckMenuRadioItem(10000, 10000 + availableImages.length - 1, 10000 + availableImages.indexOf(props.customBgImage));
        } else {
            bgMenu.CheckMenuRadioItem(6000, 6003, 6000 + props.bgMode);
        }

        dialMenu.AppendMenuItem(0, 6100, 'Solid (Theme Inner Color)');
        dialMenu.AppendMenuItem(0, 6101, 'Concentric Micro-Groove (Hi-Fi Lathe)');
        dialMenu.AppendMenuItem(0, 6102, 'Studio Fluted (3D Milled Console Rim)');
        dialMenu.AppendMenuItem(0, 6103, 'Bead-Blasted Matte (Backplate Grain)');
        dialMenu.AppendMenuItem(0, 6104, 'Sandblast (Grainy Dome)');
        dialMenu.AppendMenuItem(0, 6105, 'Studio Dial (Convex Dome + Sandblast Core)');
        dialMenu.AppendMenuSeparator();

        if (availableImages.length === 0) {
            dialImgSubMenu.AppendMenuItem(1, 0, '(No images in skins\\scripts\\VolumeKnob)');
        } else {
            for (let i = 0; i < availableImages.length; i++) dialImgSubMenu.AppendMenuItem(0, 20000 + i, availableImages[i]);
        }
        dialImgSubMenu.AppendTo(dialMenu, 0, 'Custom Image');

        if (props.dialMode === VolumeConstants.DIAL_MODE.IMAGE && availableImages.includes(props.customDialImage)) {
            dialImgSubMenu.CheckMenuRadioItem(20000, 20000 + availableImages.length - 1, 20000 + availableImages.indexOf(props.customDialImage));
        } else {
            dialMenu.CheckMenuRadioItem(6100, 6105, 6100 + props.dialMode);
        }

        dialMenu.AppendMenuSeparator();
        dialMenu.AppendMenuItem(0, 6120, 'Rotate Dial (Procedural & Custom Image)');
        if (props.spinDialImage) dialMenu.CheckMenuRadioItem(6120, 6120, 6120);

        effectsMenu.AppendMenuItem(0, 7001, 'Ambient Occlusion (Dial Face Shadow)');
        if (props.showDropShadow) effectsMenu.CheckMenuRadioItem(7001, 7001, 7001);
        effectsMenu.AppendMenuSeparator();
        effectsMenu.AppendMenuItem(0, 7002, 'Show Outer Ring (Solid Classic)');
        if (props.showOuterRing) effectsMenu.CheckMenuRadioItem(7002, 7002, 7002);
        effectsMenu.AppendMenuSeparator();

        tickStyleMenu.AppendMenuItem(0, 7200, 'Uniform Lines');
        tickStyleMenu.AppendMenuItem(0, 7201, 'Lines (Major & Minor)');
        tickStyleMenu.AppendMenuItem(0, 7202, 'Precision Dots / Pips');
        tickStyleMenu.AppendMenuItem(0, 7203, 'Milled Studio Wedges (Blocks)');
        tickStyleMenu.AppendMenuItem(0, 7204, 'Precision Diamond Pips');
        tickStyleMenu.AppendMenuItem(0, 7205, 'Laboratory Bounded Arc');
        tickStyleMenu.AppendMenuItem(0, 7206, 'Min / Max Text Arc');
        tickStyleMenu.AppendMenuItem(0, 7207, 'Precision Dots + Outer Arc');
        tickStyleMenu.CheckMenuRadioItem(7200, 7207, 7200 + GdiUtils.clamp(props.tickStyle, 0, 7));
        tickStyleMenu.AppendMenuSeparator();
        tickStyleMenu.AppendMenuItem(0, 7210, `Tick Margin Slider... (Current: ${props.tickMargin}px)`);
        tickStyleMenu.AppendMenuItem(0, 7211, `Tick Size Slider... (Current: +${props.tickSizeBonus}%)`);
        tickStyleMenu.AppendTo(effectsMenu, 0, 'Tick Mark Style');

        majorIntervalMenu.AppendMenuItem(0, 7300, 'None (All Uniform)');
        majorIntervalMenu.AppendMenuItem(0, 7301, '0%, 50%, 100% (Min / Mid / Max)');
        majorIntervalMenu.AppendMenuItem(0, 7302, '0%, 25%, 50%, 75%, 100% (Quarters)');
        majorIntervalMenu.AppendMenuItem(0, 7303, 'Every 10% (0, 10, 20... 100%)');
        majorIntervalMenu.CheckMenuRadioItem(7300, 7303, 7300 + props.majorTickInterval);
        majorIntervalMenu.AppendTo(effectsMenu, 0, 'Major Scale Markings (Large Ticks)');

        effectsMenu.AppendMenuItem(0, 7003, 'Show Tick Marks');
        if (props.showTicks) effectsMenu.CheckMenuRadioItem(7003, 7003, 7003);
        effectsMenu.AppendMenuSeparator();

        const isStudioDial = (props.dialMode === VolumeConstants.DIAL_MODE.STUDIO);
        markerStyleMenu.AppendMenuItem(isStudioDial ? 1 : 0, 7100, 'Standard Line');
        markerStyleMenu.AppendMenuItem(isStudioDial ? 1 : 0, 7101, 'Dot');
        markerStyleMenu.AppendMenuItem(0, 7102, 'Arrow Indicator');
        markerStyleMenu.AppendMenuItem(isStudioDial ? 1 : 0, 7103, 'Short Line');
        markerStyleMenu.AppendMenuItem(isStudioDial ? 1 : 0, 7104, 'Beveled Wedge (Stamped Recessed Chevron)');
        markerStyleMenu.AppendMenuItem(isStudioDial ? 1 : 0, 7105, 'Beveled Slot (Stamped Recessed Cavity)');
        markerStyleMenu.AppendMenuItem(isStudioDial ? 0 : 1, 7106, 'Very Short Line (Studio Dial Only: 0.8 - 1.0 R)');
        markerStyleMenu.AppendMenuItem(isStudioDial ? 1 : 0, 7107, 'Full Line (Center to 0.975 R)');
        markerStyleMenu.CheckMenuRadioItem(7100, 7107, 7100 + props.markerStyle);
        markerStyleMenu.AppendTo(effectsMenu, 0, 'Dial Pointer Style');

        effectsMenu.AppendMenuItem(0, 7004, 'Show Dial Pointer (Indicator)');
        if (props.showDialMarker) effectsMenu.CheckMenuRadioItem(7004, 7004, 7004);

        lightSubMenu.AppendMenuItem(0, 6199, 'Enable Specular Highlights');
        if (props.showHighlight) lightSubMenu.CheckMenuRadioItem(6199, 6199, 6199);
        lightSubMenu.AppendMenuSeparator();

        lightStyleMenu.AppendMenuItem(0, 6200, 'Auto (Material Native - Physically Coupled)');
        lightStyleMenu.AppendMenuItem(0, 6201, 'Dual Anisotropic Cones (Turned Lathe Sheen)');
        lightStyleMenu.AppendMenuItem(0, 6202, 'Directional Soft Sheen (Full Dial Gradient)');
        lightStyleMenu.AppendMenuItem(0, 6203, 'Linear Hairline Sheen (Brushed Metal Bar)');
        lightStyleMenu.AppendMenuItem(0, 6204, 'Quad Cross Specular (4-Axis Diamond Sheen)');
        lightStyleMenu.AppendMenuItem(0, 6205, 'Dual-Zone: Studio Key + Dark Ring + Soft Sheen');
        lightStyleMenu.AppendMenuItem(0, 6206, 'Dual Anisotropic Cones + 0.98 Edge Micro-Bevel');
        lightStyleMenu.AppendMenuItem(0, 6207, 'Convex Contour Dome Gradient (Centered)');
        lightStyleMenu.AppendMenuItem(0, 6208, 'Concave Bowl Gradient (Centered)');
        lightStyleMenu.AppendMenuItem(0, 6209, 'Studio Key Rim + Anisotropic Inner (0.618)');
        lightStyleMenu.AppendMenuItem(0, 6210, 'Spun Metal (Turned Aluminum Texture)');
        lightStyleMenu.CheckMenuRadioItem(6200, 6210, 6200 + props.dialLightStyle);
        lightStyleMenu.AppendTo(lightSubMenu, props.showHighlight ? 0 : 1, 'Specular Style');

        lightAngleMenu.AppendMenuItem(0, 6300, 'Top-Left (315° - Audio Console Standard)');
        lightAngleMenu.AppendMenuItem(0, 6301, 'Top / Overhead (0° - 12:00)');
        lightAngleMenu.AppendMenuItem(0, 6302, 'Top-Right (45° - 1:30)');
        lightAngleMenu.AppendMenuItem(0, 6303, 'Right / Side (90° - 3:00)');
        lightAngleMenu.AppendMenuItem(0, 6304, 'Bottom-Right (135° - 4:30)');
        lightAngleMenu.AppendMenuItem(0, 6305, 'Bottom / Underlit (180° - 6:00)');
        lightAngleMenu.AppendMenuItem(0, 6306, 'Bottom-Left (225° - 7:30)');
        lightAngleMenu.AppendMenuItem(0, 6307, 'Left / Side (270° - 9:00)');
        const angleMap = [315, 0, 45, 90, 135, 180, 225, 270];
        if (angleMap.includes(props.dialLightAngle)) lightAngleMenu.CheckMenuRadioItem(6300, 6307, 6300 + angleMap.indexOf(props.dialLightAngle));
        lightAngleMenu.AppendMenuSeparator();
        lightAngleMenu.AppendMenuItem(0, 6310, `Interactive 360° Arc Slider... (Current: ${props.dialLightAngle}°)`);
        lightAngleMenu.AppendTo(lightSubMenu, props.showHighlight ? 0 : 1, 'Specular Position (360° Arc)');

        lightStrengthMenu.AppendMenuItem(0, 6400, 'Off (0%)');
        lightStrengthMenu.AppendMenuItem(0, 6401, 'Subtle (50%)');
        lightStrengthMenu.AppendMenuItem(0, 6402, 'Standard (100%)');
        lightStrengthMenu.AppendMenuItem(0, 6403, 'Vivid (150%)');
        lightStrengthMenu.AppendMenuItem(0, 6404, 'Maximum Sheen (200%)');
        const strMap = [0, 50, 100, 150, 200];
        if (strMap.includes(props.dialLightStrength)) lightStrengthMenu.CheckMenuRadioItem(6400, 6404, 6400 + strMap.indexOf(props.dialLightStrength));
        lightStrengthMenu.AppendMenuSeparator();
        lightStrengthMenu.AppendMenuItem(0, 6410, `Interactive Strength Slider... (Current: ${props.dialLightStrength}%)`);
        lightStrengthMenu.AppendTo(lightSubMenu, props.showHighlight ? 0 : 1, 'Specular Strength');

        rangeMenu.AppendMenuItem(0, 7400, '270° (Compact)');
        rangeMenu.AppendMenuItem(0, 7401, '280°');
        rangeMenu.AppendMenuItem(0, 7402, '290° (Default)');
        rangeMenu.AppendMenuItem(0, 7403, '300° (Wide)');
        rangeMenu.CheckMenuRadioItem(7400, 7403, 7400 + ((props.sweepRange - 270) / 10));
        rangeMenu.AppendMenuSeparator();
        rangeMenu.AppendMenuItem(0, 7500, 'Volume Scale: Non-Linear (Hearing Optimized)');
        rangeMenu.AppendMenuItem(0, 7501, 'Volume Scale: Linear dB (-100dB to 0dB)');
        rangeMenu.CheckMenuRadioItem(7500, 7501, 7500 + props.volumeScalingMode);

        themeMenu.AppendTo(m, 0, 'Theme');
        bgMenu.AppendTo(m, 0, 'Backplate Finish');
        dialMenu.AppendTo(m, 0, 'Dial Face Finish');
        effectsMenu.AppendTo(m, 0, 'Markers and Shadow');
        lightSubMenu.AppendTo(m, 0, 'Highlight & Specular Engine');
        rangeMenu.AppendTo(m, 0, 'Dial Sweep Range & Scaling');
        m.AppendMenuSeparator();
        m.AppendMenuItem(0, 5100, 'Randomize');
        m.AppendMenuItem(0, 3006, 'Save Custom Theme…');
        m.AppendMenuSeparator();
        m.AppendMenuItem(0, 900, "Clear Image Cache & Reload");
        m.AppendMenuItem(0, 5000, 'Reset Visual Settings to Defaults');
        m.AppendMenuItem(0, 5001, 'Factory Reset (All Settings & Themes)...');

        let selected = 0;
        try {
            selected = m.TrackPopupMenu(x, y);
        } finally {
            allMenus.forEach(menu => { try { if (menu) menu.Dispose(); } catch {} });
        }

        if (selected === 0) return true;
        this.#dispatchMenuCommand(selected, names, availableImages, props, angleMap, strMap);
        return true;
    }

    #dispatchMenuCommand(selected, names, availableImages, props, angleMap, strMap) {
        if (selected >= 100 && selected < 100 + names.length) {
            this.controller.themes.clearPreview();
            this.controller.properties.setTheme(names[selected - 100], this.controller.themes);
            this.controller.state.invalidateGeometry();
            this.controller.sceneCache.invalidate(this.controller.bgRenderer, this.controller.dialRenderer);
            this.controller.state.requestRepaint();
        } else if (selected >= 6000 && selected <= 6003) {
            this.controller.properties.set('bgMode', selected - 6000);
            this.controller.sceneCache.invalidate(this.controller.bgRenderer, this.controller.dialRenderer);
            this.controller.state.requestRepaint();
        } else if (selected >= 10000 && selected < 10000 + availableImages.length) {
            this.controller.properties.set('customBgImage', availableImages[selected - 10000]);
            this.controller.properties.set('bgMode', VolumeConstants.BG_MODE.IMAGE);
            this.controller.sceneCache.invalidate(this.controller.bgRenderer, this.controller.dialRenderer);
            this.controller.state.requestRepaint();
        } else if (selected >= 6100 && selected <= 6105) {
            const newDialMode = selected - 6100;
            this.controller.properties.set('dialMode', newDialMode);

            if (newDialMode === VolumeConstants.DIAL_MODE.KNURLED) {
                this.controller.properties.set('markerStyle', VolumeConstants.MARKER_STYLE.SHORT);
                this.controller.properties.set('showHighlight', true);
                this.controller.properties.set('dialLightStyle', VolumeConstants.LIGHT_STYLE.STUDIO_SHEEN);
            } else if (newDialMode === VolumeConstants.DIAL_MODE.BEADBLAST) {
                this.controller.properties.set('showHighlight', true);
                this.controller.properties.set('dialLightStyle', VolumeConstants.LIGHT_STYLE.SPOTLIGHT);
                if (props.markerStyle === VolumeConstants.MARKER_STYLE.VSHORT) this.controller.properties.set('markerStyle', VolumeConstants.MARKER_STYLE.LINE);
            } else if (newDialMode === VolumeConstants.DIAL_MODE.SANDBLAST) {
                this.controller.properties.set('showHighlight', false);
                this.controller.properties.set('dialLightStyle', VolumeConstants.LIGHT_STYLE.SPOTLIGHT);
                this.controller.properties.set('spinDialImage', false);
                if (props.markerStyle === VolumeConstants.MARKER_STYLE.VSHORT) this.controller.properties.set('markerStyle', VolumeConstants.MARKER_STYLE.LINE);
            } else if (newDialMode === VolumeConstants.DIAL_MODE.STUDIO) {
                this.controller.properties.set('showHighlight', false);
                this.controller.properties.set('dialLightStyle', VolumeConstants.LIGHT_STYLE.SPOTLIGHT);
                this.controller.properties.set('spinDialImage', false);
                if (props.markerStyle !== VolumeConstants.MARKER_STYLE.ARROW && props.markerStyle !== VolumeConstants.MARKER_STYLE.VSHORT) {
                    this.controller.properties.set('markerStyle', VolumeConstants.MARKER_STYLE.VSHORT);
                }
            } else if (newDialMode === VolumeConstants.DIAL_MODE.SOLID) {
                this.controller.properties.set('showHighlight', false);
                this.controller.properties.set('dialLightStyle', VolumeConstants.LIGHT_STYLE.SPOTLIGHT);
                if (props.markerStyle === VolumeConstants.MARKER_STYLE.VSHORT) this.controller.properties.set('markerStyle', VolumeConstants.MARKER_STYLE.LINE);
            } else if (newDialMode === VolumeConstants.DIAL_MODE.CONCENTRIC) {
                this.controller.properties.set('showHighlight', true);
                this.controller.properties.set('dialLightStyle', VolumeConstants.LIGHT_STYLE.ANISOTROPIC);
                // Fixed: Reference error resolved to prevent uncaught TypeError crash
                if (this.controller.properties.values.markerStyle === VolumeConstants.MARKER_STYLE.VSHORT) {
                    this.controller.properties.set('markerStyle', VolumeConstants.MARKER_STYLE.LINE);
                }
            }
            this.controller.dialRenderer.invalidate();
            this.controller.sceneCache.invalidate(this.controller.bgRenderer, this.controller.dialRenderer);
            this.controller.state.requestRepaint();
        } else if (selected >= 20000 && selected < 20000 + availableImages.length) {
            this.controller.properties.set('customDialImage', availableImages[selected - 20000]);
            this.controller.properties.set('dialMode', VolumeConstants.DIAL_MODE.IMAGE);
            if (props.markerStyle === VolumeConstants.MARKER_STYLE.VSHORT) this.controller.properties.set('markerStyle', VolumeConstants.MARKER_STYLE.LINE);
            this.controller.dialRenderer.invalidate();
            this.controller.sceneCache.invalidate(this.controller.bgRenderer, this.controller.dialRenderer);
            this.controller.state.requestRepaint();
        } else if (selected === 6120) {
            this.controller.properties.set('spinDialImage', !props.spinDialImage);
            this.controller.sceneCache.invalidate(this.controller.bgRenderer, this.controller.dialRenderer);
            this.controller.state.requestRepaint();
        } else if (selected === 6199) {
            this.controller.properties.set('showHighlight', !props.showHighlight);
            this.controller.dialRenderer.invalidate();
            this.controller.sceneCache.invalidate(this.controller.bgRenderer, this.controller.dialRenderer);
            this.controller.state.requestRepaint();
        } else if (selected >= 6200 && selected <= 6210) {
            this.controller.properties.set('dialLightStyle', selected - 6200);
            this.controller.dialRenderer.invalidate();
            this.controller.sceneCache.invalidate(this.controller.bgRenderer, this.controller.dialRenderer);
            this.controller.state.requestRepaint();
        } else if (selected >= 6300 && selected <= 6307) {
            this.controller.properties.set('dialLightAngle', angleMap[selected - 6300]);
            this.controller.dialRenderer.invalidate();
            this.controller.sceneCache.invalidate(this.controller.bgRenderer, this.controller.dialRenderer);
            this.controller.state.requestRepaint();
        } else if (selected === 6310) {
            HudManager.activeSlider = 'LightAngle';
            HudManager.clearTimer();
            window.Repaint();
        } else if (selected >= 6400 && selected <= 6404) {
            this.controller.properties.set('dialLightStrength', strMap[selected - 6400]);
            this.controller.dialRenderer.invalidate();
            this.controller.sceneCache.invalidate(this.controller.bgRenderer, this.controller.dialRenderer);
            this.controller.state.requestRepaint();
        } else if (selected === 6410) {
            HudManager.activeSlider = 'LightStrength';
            HudManager.clearTimer();
            window.Repaint();
        } else if (selected >= 7200 && selected <= 7207) {
            this.controller.properties.set('tickStyle', selected - 7200);
            this.controller.sceneCache.invalidate(this.controller.bgRenderer, this.controller.dialRenderer);
            this.controller.state.requestRepaint();
        } else if (selected === 7210) {
            HudManager.activeSlider = 'TickMargin';
            HudManager.clearTimer();
            window.Repaint();
        } else if (selected === 7211) {
            HudManager.activeSlider = 'TickSize';
            HudManager.clearTimer();
            window.Repaint();
        } else if (selected >= 7300 && selected <= 7303) {
            this.controller.properties.set('majorTickInterval', selected - 7300);
            this.controller.sceneCache.invalidate(this.controller.bgRenderer, this.controller.dialRenderer);
            this.controller.state.requestRepaint();
        } else if (selected >= 7100 && selected <= 7107) {
            this.controller.properties.set('markerStyle', selected - 7100);
            this.controller.state.requestRepaint();
        } else if (selected === 7001) {
            this.controller.properties.set('showDropShadow', !props.showDropShadow);
            this.controller.state.invalidateGeometry();
            this.controller.sceneCache.invalidate(this.controller.bgRenderer, this.controller.dialRenderer);
            this.controller.state.requestRepaint();
        } else if (selected === 7002) {
            this.controller.properties.set('showOuterRing', !props.showOuterRing);
            this.controller.sceneCache.invalidate(this.controller.bgRenderer, this.controller.dialRenderer);
            this.controller.state.requestRepaint();
        } else if (selected === 7003) {
            this.controller.properties.set('showTicks', !props.showTicks);
            this.controller.sceneCache.invalidate(this.controller.bgRenderer, this.controller.dialRenderer);
            this.controller.state.requestRepaint();
        } else if (selected === 7004) {
            this.controller.properties.set('showDialMarker', !props.showDialMarker);
            this.controller.state.requestRepaint();
        } else if (selected === 5100) {
            this.doRandom();
        } else if (selected >= 7400 && selected <= 7403) {
            const newRange = 270 + (selected - 7400) * 10;
            if (newRange !== props.sweepRange) {
                VolumeConfig.sweepRangeDeg = newRange;
                this.controller.properties.set('sweepRange', newRange);
                this.controller.state.invalidateGeometry();
                this.controller.sceneCache.invalidate(this.controller.bgRenderer, this.controller.dialRenderer);
                VolumeEngine.syncFromFoobar(this.controller.state, this.controller.properties.values);
                this.controller.state.requestRepaint();
            }
        } else if (selected >= 7500 && selected <= 7501) {
            this.controller.properties.set('volumeScalingMode', selected - 7500);
            VolumeEngine.syncFromFoobar(this.controller.state, this.controller.properties.values);
            this.controller.state.requestRepaint();
        } else if (selected === 900) {
            this.controller.assetManager.clear();
            this.controller.assetManager.getAvailableImages(true);
            this.controller.sceneCache.invalidate(this.controller.bgRenderer, this.controller.dialRenderer);
            this.controller.state.invalidateGeometry();
            this.controller.state.requestRepaint();
        } else if (selected === 5000) {
            this.controller.properties.resetVisuals(this.controller.themes);
            this.controller.themes.clearPreview();
            this.controller.state.invalidateGeometry();
            this.controller.sceneCache.invalidate(this.controller.bgRenderer, this.controller.dialRenderer);
            this.controller.state.requestRepaint();
        } else if (selected === 5001) {
            const confirm = GdiUtils.prompt('Type YES to perform a factory reset (resets all settings, custom images and theme paths):', 'Confirm Factory Reset', '');
            if (confirm?.toUpperCase() === 'YES') {
                this.controller.properties.resetAll(this.controller.themes);
                this.controller.themes.clearPreview();
                this.controller.assetManager.clear();
                this.controller.state.invalidateGeometry();
                this.controller.sceneCache.invalidate(this.controller.bgRenderer, this.controller.dialRenderer);
                this.controller.state.requestRepaint();
            }
        } else if (selected === 2000) {
            const path = GdiUtils.prompt('Enter the full path to your JSON configuration file:', 'Load Settings & Themes JSON', this.controller.properties.values.customThemeFile || '');
            if (path?.trim()) {
                const result = this.controller.themes.loadFromFile(path, this.controller.properties, true);
                if (result.ok) {
                    this.controller.properties.set('customThemeFile', GdiUtils.sanitizePath(path));
                    this.controller.state.invalidateGeometry();
                    this.controller.sceneCache.invalidate(this.controller.bgRenderer, this.controller.dialRenderer);
                    this.controller.state.requestRepaint();
                    fb.ShowPopupMessage(result.summary || `Configuration successfully loaded from:\n${path}`, VolumeConstants.SCRIPT_NAME);
                } else {
                    fb.ShowPopupMessage(`Failed to load JSON:\n\n${result.error || 'Unknown error'}`, VolumeConstants.SCRIPT_NAME);
                }
            }
        } else if (selected === 2001) {
            const path = this.controller.properties.values.customThemeFile;
            if (path?.trim()) {
                const result = this.controller.themes.loadFromFile(path, this.controller.properties, true);
                if (result.ok) {
                    this.controller.state.invalidateGeometry();
                    this.controller.sceneCache.invalidate(this.controller.bgRenderer, this.controller.dialRenderer);
                    this.controller.state.requestRepaint();
                    fb.ShowPopupMessage(result.summary || 'Configuration reloaded successfully.', VolumeConstants.SCRIPT_NAME);
                } else {
                    fb.ShowPopupMessage(`Failed to reload JSON:\n\n${result.error || 'Unknown error'}`, VolumeConstants.SCRIPT_NAME);
                }
            }
        } else if (selected === 2002) {
            const path = GdiUtils.prompt('Enter the full path to save the JSON configuration file:', 'Save Settings & Custom Themes', this.controller.properties.values.customThemeFile || `${VolumeConstants.PROFILE_BASE}volumeknob_config.json`);
            if (path?.trim()) {
                const result = this.controller.themes.saveToFile(path, null, this.controller.properties);
                if (result.ok) {
                    this.controller.properties.set('customThemeFile', GdiUtils.sanitizePath(path));
                    fb.ShowPopupMessage(`All settings and ${result.count} custom theme(s) saved to:\n${path}`, VolumeConstants.SCRIPT_NAME);
                } else {
                    fb.ShowPopupMessage(`Save failed:\n\n${result.error || 'Unknown error'}`, VolumeConstants.SCRIPT_NAME);
                }
            }
        } else if (selected === 2003) {
            const path = GdiUtils.prompt('Enter the full path to save the JSON configuration file:', 'Export All Settings & Themes', `${VolumeConstants.PROFILE_BASE}volumeknob_all_config.json`);
            if (path?.trim()) {
                const result = this.controller.themes.saveToFile(path, '*', this.controller.properties);
                if (result.ok) fb.ShowPopupMessage(`Exported all settings and ${result.count} theme(s) to:\n${path}`, VolumeConstants.SCRIPT_NAME);
                else fb.ShowPopupMessage(`Export failed:\n\n${result.error || 'Unknown error'}`, VolumeConstants.SCRIPT_NAME);
            }
        } else if (selected === 2004) {
            const path = GdiUtils.prompt('Enter the full path to save the JSON configuration file:', 'Export Built-in Theme Template', `${VolumeConstants.PROFILE_BASE}volumeknob_theme_template.json`);
            if (path?.trim()) {
                const result = this.controller.themes.exportTemplate(path, this.controller.properties);
                if (result.ok) fb.ShowPopupMessage(`Template exported (${result.count} built-in themes) to:\n${path}`, VolumeConstants.SCRIPT_NAME);
                else fb.ShowPopupMessage(`Export failed:\n\n${result.error || 'Unknown error'}`, VolumeConstants.SCRIPT_NAME);
            }
        } else if (selected === 2005) {
            const path = GdiUtils.prompt('Enter default path for custom config JSON file:', 'Set Default Save Path', this.controller.properties.values.customThemeFile || `${VolumeConstants.PROFILE_BASE}volumeknob_config.json`);
            if (path?.trim()) {
                this.controller.properties.set('customThemeFile', GdiUtils.sanitizePath(path));
                fb.ShowPopupMessage(`Default save path set to:\n${path}`, VolumeConstants.SCRIPT_NAME);
            }
        } else if (selected === 3001) {
            this.#doColorPicker('Background', 'bg');
        } else if (selected === 3002) {
            this.#doColorPicker('Main Dial (Inner Face)', 'inner');
        } else if (selected === 3003) {
            this.#doColorPicker('Outer Ring (Knob Body)', 'knob');
        } else if (selected === 3004) {
            this.#doColorPicker('Tick Marks', 'tick');
        } else if (selected === 3005) {
            this.#doColorPicker('Dial Marker (Pointer)', 'marker');
        } else if (selected === 3006) {
            this.#doFinalizeTheme();
        } else if (selected >= 4000 && selected < 4000 + this.controller.themes.customThemes.length) {
            const target = this.controller.themes.customThemes[selected - 4000];
            if (target) this.#doRemoveCustomTheme(target.name);
        }
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
        // 1. Instant restore from foobar2000's internal memory properties
        this.themes.loadCustomThemesFromProperties();
        this.themes.loadDraftFromProperties();

        VolumeConfig.sweepRangeDeg = this.properties.clampInt(this.properties.values.sweepRange, 270, 300);

        const curTheme = this.properties.values.theme;
        if (curTheme === '~Preview' || curTheme === 'Custom') {
            const d = this.themes.draftTheme;
            const t = this.themes.makeTheme('Custom', d.bg, d.knob, d.inner, d.tick, d.marker);
            t.custom = true;
            this.themes.addOrUpdate(t, false);
            this.properties.set('theme', 'Custom');
        } else if (!this.themes.names().includes(curTheme)) {
            this.properties.setTheme('Classic Gray', this.themes);
        } else {
            this.themes.seedDraftFromTheme(this.themes.get(curTheme));
        }

        if (this.properties.values.dialMode === VolumeConstants.DIAL_MODE.STUDIO) {
            if (this.properties.values.markerStyle !== VolumeConstants.MARKER_STYLE.ARROW && this.properties.values.markerStyle !== VolumeConstants.MARKER_STYLE.VSHORT) {
                this.properties.set('markerStyle', VolumeConstants.MARKER_STYLE.VSHORT);
            }
        } else {
            if (this.properties.values.markerStyle === VolumeConstants.MARKER_STYLE.VSHORT) {
                this.properties.set('markerStyle', VolumeConstants.MARKER_STYLE.LINE);
            }
        }

        this.#panelState = VolumeConstants.LIFECYCLE.LIVE;
        VolumeEngine.syncFromFoobar(this.state, this.properties.values);
        this.state.startAnimation();

        // 2. Defer JSON disk load to background timer so UI draws instantly
        window.SetTimeout(() => {
            if (this.#panelState === VolumeConstants.LIFECYCLE.SHUTDOWN) return;
            try { 
                this.themes.loadFromFile(this.properties.values.customThemeFile, this.properties, false); 
            } catch {}
        }, 60);
    }

    showNotification(text) {
        this.#notifyText = text;
        if (this.#notifyTimeout) window.ClearTimeout(this.#notifyTimeout);
        this.#notifyTimeout = window.SetTimeout(() => {
            this.#notifyText = '';
            this.#notifyTimeout = null;
            window.Repaint();
        }, 1500);
        window.Repaint();
    }

    // ====================== DEDICATED CYCLE FUNCTIONS ======================
    cycleTheme(direction) {
        const names = this.themes.names();
        if (!names.length) return;
        let curIdx = names.indexOf(this.properties.values.theme);
        if (curIdx === -1) curIdx = 0;
        const nextIdx = (curIdx + direction + names.length) % names.length;
        const chosen = names[nextIdx];

        this.themes.clearPreview();
        this.properties.setTheme(chosen, this.themes);
        this.state.invalidateGeometry();
        this.sceneCache.invalidate(this.bgRenderer, this.dialRenderer);
        this.showNotification(`Theme: ${chosen}`);
    }

    cycleDialMode(direction) {
        const availableDialModes = [0, 1, 2, 3, 4, 5];
        const labels = ['Solid', 'Concentric', 'Knurled', 'Beadblast', 'Sandblast', 'Studio'];
        let curIdx = availableDialModes.indexOf(this.properties.values.dialMode);
        if (curIdx === -1) curIdx = 0;
        const nextIdx = (curIdx + direction + availableDialModes.length) % availableDialModes.length;
        const nextDialMode = availableDialModes[nextIdx];
        this.properties.set('dialMode', nextDialMode);

        if (nextDialMode === VolumeConstants.DIAL_MODE.KNURLED) {
            this.properties.set('markerStyle', VolumeConstants.MARKER_STYLE.SHORT);
            this.properties.set('showHighlight', true);
            this.properties.set('dialLightStyle', VolumeConstants.LIGHT_STYLE.STUDIO_SHEEN);
        } else if (nextDialMode === VolumeConstants.DIAL_MODE.BEADBLAST) {
            this.properties.set('showHighlight', true);
            this.properties.set('dialLightStyle', VolumeConstants.LIGHT_STYLE.SPOTLIGHT);
            if (this.properties.values.markerStyle === VolumeConstants.MARKER_STYLE.VSHORT) this.properties.set('markerStyle', VolumeConstants.MARKER_STYLE.LINE);
        } else if (nextDialMode === VolumeConstants.DIAL_MODE.SANDBLAST) {
            this.properties.set('showHighlight', false);
            this.properties.set('dialLightStyle', VolumeConstants.LIGHT_STYLE.SPOTLIGHT);
            this.properties.set('spinDialImage', false);
            if (this.properties.values.markerStyle === VolumeConstants.MARKER_STYLE.VSHORT) this.properties.set('markerStyle', VolumeConstants.MARKER_STYLE.LINE);
        } else if (nextDialMode === VolumeConstants.DIAL_MODE.STUDIO) {
            this.properties.set('showHighlight', false);
            this.properties.set('dialLightStyle', VolumeConstants.LIGHT_STYLE.SPOTLIGHT);
            this.properties.set('spinDialImage', false);
            if (this.properties.values.markerStyle !== VolumeConstants.MARKER_STYLE.ARROW && this.properties.values.markerStyle !== VolumeConstants.MARKER_STYLE.VSHORT) {
                this.properties.set('markerStyle', VolumeConstants.MARKER_STYLE.VSHORT);
            }
        } else if (nextDialMode === VolumeConstants.DIAL_MODE.SOLID) {
            this.properties.set('showHighlight', false);
            this.properties.set('dialLightStyle', VolumeConstants.LIGHT_STYLE.SPOTLIGHT);
            if (this.properties.values.markerStyle === VolumeConstants.MARKER_STYLE.VSHORT) this.properties.set('markerStyle', VolumeConstants.MARKER_STYLE.LINE);
        } else if (nextDialMode === VolumeConstants.DIAL_MODE.CONCENTRIC) {
            this.properties.set('showHighlight', true);
            this.properties.set('dialLightStyle', VolumeConstants.LIGHT_STYLE.ANISOTROPIC);
            if (this.properties.values.markerStyle === VolumeConstants.MARKER_STYLE.VSHORT) this.properties.set('markerStyle', VolumeConstants.MARKER_STYLE.LINE);
        }

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
        const labels = ['Line', 'Dot', 'Arrow', 'Short Line', 'Beveled Wedge', 'Beveled Slot', 'Studio Line', 'Full Line'];
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
                VolumeConstants.MARKER_STYLE.FULL_LINE
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

    // ====================== RENDER & EVENTS ======================
    onPaint(gr) {
        if (this.#panelState !== VolumeConstants.LIFECYCLE.LIVE || !window.IsVisible) return;
        this.mainRenderer.draw(gr, window.Width, window.Height, this.state, this.themes, this.properties, this.sceneCache, this.dialRenderer, this.bgRenderer, this.assetManager);

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
            VolumeEngine.syncFromFoobar(this.state, this.properties.values);
        }
    }

    onPlaybackNewTrack() {
        if (this.#panelState === VolumeConstants.LIFECYCLE.LIVE && !this.state.dragging) {
            VolumeEngine.syncFromFoobar(this.state, this.properties.values);
        }
    }

    onMouseLbtnDown(x, y, mask) {
        if (this.#panelState !== VolumeConstants.LIFECYCLE.LIVE) return false;
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
        if (this.state.dragging && (mask !== undefined && !(mask & 1))) {
            return InputManager.handleDragEnd(this.state, this.properties.values);
        }
        return InputManager.handleDragMove(x, y, this.state, this.properties.values);
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
        return InputManager.handleDoubleClick(x, y, this.state, window.Width, window.Height, this.properties.values, mask);
    }

    onMouseRbtnUp(x, y, mask) {
        if (this.#panelState !== VolumeConstants.LIFECYCLE.LIVE) return false;
        if (mask & 4) return false;
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

        // Ctrl + Shift + Left/Right OR Alt + Left/Right -> Cycle Themes
        if ((isCtrl && isShift && (vkey === 0x25 || vkey === 0x27)) || (isAlt && (vkey === 0x25 || vkey === 0x27))) {
            this.cycleTheme(vkey === 0x27 ? 1 : -1);
            return true;
        }

        // Ctrl + Shift + Up/Down OR Alt + Up/Down -> Cycle Specular Lighting Styles
        if ((isCtrl && isShift && (vkey === 0x26 || vkey === 0x28)) || (isAlt && (vkey === 0x26 || vkey === 0x28))) {
            this.cycleLightStyle(vkey === 0x28 ? 1 : -1);
            return true;
        }

        // Ctrl + Up/Down -> Cycle Dial Face Finishes
        if (isCtrl && !isShift && (vkey === 0x26 || vkey === 0x28)) {
            this.cycleDialMode(vkey === 0x28 ? 1 : -1);
            return true;
        }

        // Ctrl + Left/Right -> Cycle Tick Marker Styles
        if (isCtrl && !isShift && (vkey === 0x25 || vkey === 0x27)) {
            this.cycleTickStyle(vkey === 0x27 ? 1 : -1);
            return true;
        }

        // Shift + Up/Down -> Cycle Pointer Styles
        if (isShift && !isCtrl && (vkey === 0x26 || vkey === 0x28)) {
            this.cycleMarkerStyle(vkey === 0x28 ? 1 : -1);
            return true;
        }

        // Shift + Left/Right -> Cycle Backplate Styles
        if (isShift && !isCtrl && (vkey === 0x25 || vkey === 0x27)) {
            this.cycleBgMode(vkey === 0x27 ? 1 : -1);
            return true;
        }

        // Standard Volume Wheel Steps
        if (vkey === 0x26 || vkey === 0x27) { 
            InputManager.handleWheel(1, this.state, this.properties.values); 
            return true; 
        }
        if (vkey === 0x28 || vkey === 0x25) { 
            InputManager.handleWheel(-1, this.state, this.properties.values); 
            return true; 
        }

        return false;
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
}

function on_mouse_lbtn_down(x, y, mask) { 
    return app.onMouseLbtnDown(x, y, mask); 
}

function on_mouse_lbtn_up() { 
    return app.onMouseLbtnUp(); 
}

function on_mouse_move(x, y, mask) { 
    return app.onMouseMove(x, y, mask); 
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

function on_script_unload() { 
    app.dispose(); 
}

// Initialize Controller
app.init();