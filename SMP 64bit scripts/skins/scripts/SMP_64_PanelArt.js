'use strict';
		   // ============== AUTHOR L.E.D. ============== \\
		  // ==-== Panel Artwork and Trackinfo v4.9  ==-== \\
         // ====== Staged Resize Pipeline + Full Blur ===== \\

  // ===================*** Foobar2000 64bit ***================== \\
 // ======= For Spider Monkey Panel 64bit, author: marc2003 ======= \\
// === SMP 64bit script samples StackBlur+Panel, author:marc2003 === \\

/* 
 * Custom License for foobar2000 Themes
 * Copyright (c) 2026 [L.E.D.]
 * Allowed: Non-commercial use and modification.
 * Prohibited: Paid products/themes, subscriptions, or cloud-bundled services.
 */

window.DefineScript('SMP 64bit PanelArt', { 
    author: 'L.E.D.', 
    version: '4.9',
    features: { grab_focus: true } 
});

if ('DrawMode' in window) window.DrawMode = 0; // 0 = GDI+, 1 = Direct2D
window.DlgCode = 0x0004; // DLGC_WANTALLKEYS: Captures arrow keys and modifier shortcuts

// ============================================================================================
// 1. HELPERS, MENU BUILDER, ASYNC LOADER & SETTINGS SCHEMA
// ============================================================================================
class GdiUtils {
    static clamp(val, min, max) {
        const n = Number(val);
        return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : min;
    }

    static RGB(r, g, b) {
        return (0xFF000000 | ((r & 0xFF) << 16) | ((g & 0xFF) << 8) | (b & 0xFF)) >>> 0;
    }

    static setAlpha(col, a) {
        const clampedA = (a < 0 ? 0 : a > 255 ? 255 : a) & 0xFF;
        return ((clampedA << 24) | (col & 0x00FFFFFF)) >>> 0;
    }

    static blendWithWhite(col, ratio) {
        const r = Math.floor(((col >>> 16) & 255) + (255 - ((col >>> 16) & 255)) * ratio);
        const g = Math.floor(((col >>> 8) & 255) + (255 - ((col >>> 8) & 255)) * ratio);
        const b = Math.floor((col & 255) + (255 - (col & 255)) * ratio);
        return this.RGB(r, g, b);
    }

    static sanitizePath(str) {
        if (!str || typeof str !== 'string') return '';
        const clean = str.replace(/^["']+|["']+$/g, '').trim();
        if (/^[a-zA-Z]:[\\\/]?$/.test(clean)) return clean.substring(0, 2) + '\\';
        if (/^\\\\[^\\]+\\[^\\]+[\\\/]?$/.test(clean)) return clean.replace(/[\\\/]+$/, '') + '\\';
        return clean.replace(/[\/\\]+$/, '');
    }

    static escapeMenuLabel(str) {
        return String(str ?? '').replace(/&/g, '&&');
    }

    static normalize(str) {
        if (!str) return '';
        return str.toLowerCase()
            .replace(/[\(\[\{][^\)\]\}]*[\)\]\}]/g, ' ')
            .replace(/[\/\\:*?"<>|\-_.,;!+=&^%$#@~`]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
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

class AsyncImageLoader {
    #pending = new Map();

    load(path) {
        if (!path || !utils.IsFile(path)) return Promise.resolve(null);

        if (typeof gdi.LoadImageAsyncV2 === 'function') {
            try {
                return gdi.LoadImageAsyncV2(window.ID, path).catch(() => null);
            } catch {}
        }

        if (typeof gdi.LoadImageAsync === 'function') {
            return new Promise((resolve) => {
                try {
                    const cookie = gdi.LoadImageAsync(window.ID, path);
                    this.#pending.set(cookie, resolve);
                } catch {
                    resolve(null);
                }
            });
        }

        try {
            return Promise.resolve(gdi.Image(path) || null);
        } catch {
            return Promise.resolve(null);
        }
    }

    onLoadImageDone(cookie, image) {
        const resolve = this.#pending.get(cookie);
        if (resolve) {
            this.#pending.delete(cookie);
            resolve(image || null);
            return true;
        }
        return false;
    }

    clear() {
        for (const resolve of this.#pending.values()) {
            try { resolve(null); } catch {}
        }
        this.#pending.clear();
    }
}

class SettingsSchema {
    static VALID_FLOATS = ['left', 'right', 'top', 'bottom', 'stretch'];

    static FIELDS = [
        { key: 'albumArtEnabled',     prop: 'PA.AlbumArtEnabled',     type: 'bool',  def: true },
        { key: 'albumArtFloat',       prop: 'PA.AlbumArtFloat',       type: 'enum',  def: 'left', values: ['left', 'right', 'top', 'bottom', 'stretch'] },
        { key: 'albumArtPadding',     prop: 'PA.AlbumArtPadding',     type: 'int',   def: 0,      min: 0,  max: 100 },
        { key: 'padLeft',             prop: 'PA.PadLeft',             type: 'int',   def: 10,     min: 0,  max: 100 },
        { key: 'padRight',            prop: 'PA.PadRight',            type: 'int',   def: 10,     min: 0,  max: 100 },
        { key: 'padTop',              prop: 'PA.PadTop',              type: 'int',   def: 10,     min: 0,  max: 100 },
        { key: 'padBottom',           prop: 'PA.PadBottom',           type: 'int',   def: 10,     min: 0,  max: 100 },
        { key: 'borderSize',          prop: 'PA.BorderSize',          type: 'int',   def: 10,     min: 0,  max: 50 },
        { key: 'borderColor',         prop: 'PA.BorderColor',         type: 'color', def: GdiUtils.RGB(32, 32, 32) },
        { key: 'customFolderDepth',   prop: 'PA.CustomFolderDepth',   type: 'int',   def: 2,      min: 1,  max: 4 },

        { key: 'backgroundEnabled',   prop: 'PA.BackgroundEnabled',   type: 'bool',  def: true },
        { key: 'blurEnabled',         prop: 'PA.BlurEnabled',         type: 'bool',  def: true },
        { key: 'blurRadius',          prop: 'PA.BlurRadius',          type: 'int',   def: 240,    min: 0,  max: 254 },
        { key: 'darkenValue',         prop: 'PA.DarkenValue',         type: 'int',   def: 10,     min: 0,  max: 50 },
        { key: 'customBgColor',       prop: 'PA.CustomBgColor',       type: 'color', def: GdiUtils.RGB(25, 25, 25), legacyProp: 'PA.CustomBackgroundColor' },
        { key: 'bgUseUIColor',        prop: 'PA.BgUseUIColor',        type: 'bool',  def: false },

        { key: 'showReflection',      prop: 'PA.ShowReflection',      type: 'bool',  def: true },
        { key: 'opReflection',        prop: 'PA.OpReflection',        type: 'int',   def: 25,     min: 0,  max: 255 },
        { key: 'showGlow',            prop: 'PA.ShowGlow',            type: 'bool',  def: false },
        { key: 'opGlow',              prop: 'PA.OpGlow',              type: 'int',   def: 80,     min: 0,  max: 255 },
        { key: 'showScanlines',       prop: 'PA.ShowScanlines',       type: 'bool',  def: false },
        { key: 'opScanlines',         prop: 'PA.OpScanlines',         type: 'int',   def: 100,    min: 0,  max: 255 },
        { key: 'showPhosphor',        prop: 'PA.ShowPhosphor',        type: 'bool',  def: true },
        { key: 'opPhosphor',          prop: 'PA.OpPhosphor',          type: 'int',   def: 20,     min: 0,  max: 255 },
        { key: 'phosphorTheme',       prop: 'PA.PhosphorTheme',       type: 'int',   def: 8,      min: 0,  max: 10 },
        { key: 'customPhosphorColor', prop: 'PA.CustomPhosphorColor', type: 'color', def: 0xFFFFFFFF, resetAll: true },
        { key: 'overlayAllOff',       prop: 'PA.OverlayAllOff',       type: 'bool',  def: false },

        { key: 'layoutAlignV',        prop: 'PA.LayoutAlignV',        type: 'int',   def: 0,      min: 0,  max: 2, legacyProp: 'PA.LayoutAlign' },
        { key: 'layoutAlignH',        prop: 'PA.LayoutAlignH',        type: 'int',   def: 1,      min: 0,  max: 2 },
        { key: 'textShadowEnabled',   prop: 'PA.TextShadowEnabled',   type: 'bool',  def: true },
        { key: 'extraInfoEnabled',    prop: 'PA.ExtraInfoEnabled',    type: 'bool',  def: true },
        { key: 'glitchEnabled',       prop: 'PA.GlitchEnabled',       type: 'bool',  def: true },

        { key: 'titleFontName',       prop: 'PA.TitleFontName',       type: 'str',   def: 'Segoe UI', nonEmpty: true },
        { key: 'titleFontSize',       prop: 'PA.TitleFontSize',       type: 'int',   def: 42,     min: 12, max: 100 },
        { key: 'artistFontName',      prop: 'PA.ArtistFontName',      type: 'str',   def: 'Segoe UI', nonEmpty: true },
        { key: 'artistFontSize',      prop: 'PA.ArtistFontSize',      type: 'int',   def: 28,     min: 10, max: 80 },
        { key: 'extraFontName',       prop: 'PA.ExtraFontName',       type: 'str',   def: 'Segoe UI', nonEmpty: true },
        { key: 'extraFontSize',       prop: 'PA.ExtraFontSize',       type: 'int',   def: 20,     min: 8,  max: 60 },

        { key: 'imageFolder',         prop: 'PA.ImageFolder',         type: 'path',  def: 'profile\\skins\\images', resetAll: true, fallbackToDef: true },
        { key: 'bezelFolder',         prop: 'PA.BezelFolder',         type: 'path',  def: '',     resetAll: true, fallbackToDef: true },
        { key: 'bezelEnabled',        prop: 'PA.BezelEnabled',        type: 'bool',  def: false },
        { key: 'bezelFile',           prop: 'PA.BezelFile',           type: 'str',   def: '' },
        { key: 'imageMode',           prop: 'PA.ImageMode',           type: 'bool',  def: false,  noPreset: true },
        { key: 'slideMode',           prop: 'PA.SlideMode',           type: 'bool',  def: false,  noPreset: true }
    ];

    static defaults(overrides = null) {
        const o = {};
        for (const f of this.FIELDS) o[f.key] = f.def;
        if (overrides) Object.assign(o, overrides);
        return o;
    }

    static coerce(f, raw, defVal) {
        const fallback = defVal !== undefined ? defVal : f.def;
        if (raw === null || raw === undefined) return fallback;
        switch (f.type) {
            case 'bool':
                if (typeof raw === 'boolean') return raw;
                if (typeof raw === 'string') return raw !== 'false' && raw !== '0' && raw !== '';
                return Boolean(raw);
            case 'int': {
                const n = parseInt(raw, 10);
                return Number.isNaN(n) ? fallback : GdiUtils.clamp(n, f.min, f.max);
            }
            case 'enum':
                return f.values.includes(raw) ? raw : fallback;
            case 'color': {
                const n = Number(raw);
                return (Number.isFinite(n) && (n >>> 0) !== 0) ? (n >>> 0) : fallback;
            }
            case 'path': {
                const s = GdiUtils.sanitizePath(String(raw || ''));
                return f.fallbackToDef ? (s || fallback) : s;
            }
            default: {
                const s = String(raw ?? fallback);
                return f.nonEmpty ? (s.trim() || fallback) : s;
            }
        }
    }

    static sanitize(raw, fallback, { skipNoPreset = false } = {}) {
        const base = fallback || this.defaults();
        const out = { ...base };
        if (!raw || typeof raw !== 'object') return out;
        for (const f of this.FIELDS) {
            if (skipNoPreset && f.noPreset) continue;
            if (Object.prototype.hasOwnProperty.call(raw, f.key)) {
                out[f.key] = this.coerce(f, raw[f.key], base[f.key]);
            }
        }
        return out;
    }

    static loadProperties(fallbackDefaults) {
        const out = {};
        for (const f of this.FIELDS) {
            const def = (fallbackDefaults && f.key in fallbackDefaults) ? fallbackDefaults[f.key] : f.def;
            const fallbackVal = f.legacyProp ? window.GetProperty(f.legacyProp, def) : def;
            out[f.key] = this.coerce(f, window.GetProperty(f.prop, fallbackVal), def);
        }
        return out;
    }

    static saveProperties(config) {
        for (const f of this.FIELDS) {
            if (Object.prototype.hasOwnProperty.call(config, f.key)) {
                window.SetProperty(f.prop, config[f.key]);
            }
        }
    }

    static reset(currentConfig, { includeResetAll = false, defaults = null } = {}) {
        const base = defaults || this.defaults();
        const out = { ...currentConfig };
        for (const f of this.FIELDS) {
            if (f.resetAll && !includeResetAll) continue;
            out[f.key] = base[f.key] ?? f.def;
        }
        return out;
    }
}

// ============================================================================================
// 2. FONT MANAGEMENT (LRU CACHED)
// ============================================================================================
class FontRegistry {
    #cache = new Map();
    #maxSize;

    constructor(maxSize = 150) {
        this.#maxSize = maxSize;
    }

    get(name, size, style = 0) {
        const s = Math.max(4, Math.round(size));
        const fontName = (typeof name === 'string' && name.trim().length > 0) ? name.trim() : 'Segoe UI';
        const key = `${fontName}_${s}_${style}`;

        let f = this.#cache.get(key);
        if (f) {
            this.#cache.delete(key);
            this.#cache.set(key, f);
            return f;
        }

        try {
            f = gdi.Font(fontName, s, style);
        } catch {
            try { f = gdi.Font('Segoe UI', s, style); } catch { f = null; }
        }

        if (f) {
            this.#cache.set(key, f);
            if (this.#cache.size > this.#maxSize) {
                const oldestKey = this.#cache.keys().next().value;
                const evicted = this.#cache.get(oldestKey);
                if (evicted && typeof evicted.Dispose === 'function') {
                    try { evicted.Dispose(); } catch {}
                }
                this.#cache.delete(oldestKey);
            }
        }
        return f;
    }

    fitSize(gr, text, fontName, fontStyle, maxW, maxH, startSize, minSize = 8) {
        const minBound = Math.max(4, Math.round(minSize));
        const maxBound = Math.max(minBound, Math.round(startSize));
        if (maxW <= 0 || maxH <= 0) return minBound;

        const testText = text && text.trim().length > 0 ? text : 'Sample Text';
        const name = (typeof fontName === 'string' && fontName.trim().length > 0) ? fontName.trim() : 'Segoe UI';

        const topFont = this.get(name, maxBound, fontStyle);
        if (topFont) {
            const topM = gr.MeasureString(testText, topFont, 0, 0, 10000, 10000);
            if (topM.Width <= maxW && topM.Height <= maxH) return maxBound;
            if (topM.Width > 0 && topM.Height > 0) {
                const est = Math.round(maxBound * Math.min(maxW / topM.Width, maxH / topM.Height));
                let low = Math.max(minBound, est - 4);
                let high = Math.min(maxBound - 1, est + 4);
                const lowFont = this.get(name, low, fontStyle);
                if (lowFont) {
                    const lowM = gr.MeasureString(testText, lowFont, 0, 0, 10000, 10000);
                    if (lowM.Width > maxW || lowM.Height > maxH) {
                        high = low - 1;
                        low = minBound;
                    }
                }
                let best = minBound;
                while (low <= high) {
                    const mid = (low + high) >>> 1;
                    const f = this.get(name, mid, fontStyle);
                    if (!f) { high = mid - 1; continue; }
                    const m = gr.MeasureString(testText, f, 0, 0, 10000, 10000);
                    if (m.Width <= maxW && m.Height <= maxH) {
                        best = mid;
                        low = mid + 1;
                    } else {
                        high = mid - 1;
                    }
                }
                return Math.max(minBound, best);
            }
        }
        return minBound;
    }

    clear() {
        for (const font of this.#cache.values()) {
            if (font && typeof font.Dispose === 'function') {
                try { font.Dispose(); } catch {}
            }
        }
        this.#cache.clear();
    }
}

// ============================================================================================
// 3. ARTWORK DISCOVERY & FILE CACHE (BUDGET-GUARDED + EMBEDDED/NONE CACHING)
// ============================================================================================
class ArtScanner {
    static EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.bmp'];
    static FAST_NAMES = ['cover', 'front', 'folder', 'albumart'];
    static BLACKLIST  = ['back', 'rear', 'tray', 'inlay', 'booklet', 'case', 'matrix', 'spine', 'inside', 'digipak'];
    static DISC_REGEX = /^(?:cd|disc|disk|side|vinyl|disque|vol|part|volume)[\s_.\-]*\d+$/i;
    static ART_SUBDIRS = ['artwork', 'scans', 'art', 'covers', 'cover', 'images', 'scan', 'disc', 'discs', 'extra', 'extras', 'cd1', 'cd2', 'disc1', 'disc2'];

    #subfolderCache = new Map();
    #dirScanCache   = new Map();
    #artPathCache   = new Map();

    clearCaches() {
        this.#subfolderCache.clear();
        this.#dirScanCache.clear();
        this.#artPathCache.clear();
    }

    isImageFilePath(filePath) {
        if (!filePath || typeof filePath !== 'string') return false;
        const dot = filePath.lastIndexOf('.');
        if (dot === -1) return false;
        return ArtScanner.EXTENSIONS.includes(filePath.substring(dot).toLowerCase());
    }

    getArtworkIdentityKey(trackDir, album, disc, titleOrPath = '') {
        const alb = (album || '').trim().toLowerCase();
        const fallback = alb ? '' : `|${(titleOrPath || '').trim().toLowerCase()}`;
        return `${trackDir || ''}|${alb}|${(disc || '').trim().toLowerCase()}${fallback}`;
    }

    getArtFromMemoryCache(key) {
        if (!this.#artPathCache.has(key)) return null;
        const cached = this.#artPathCache.get(key);
        if (cached) {
            if (cached.embedded || cached.isNone) return cached;
            if (cached.path && this.isImageFilePath(cached.path) && utils.IsFile(cached.path)) return cached;
        }
        this.#artPathCache.delete(key);
        return null;
    }

    setArtMemoryCache(key, entry) {
        if (!entry) return;
        if (typeof entry === 'string') {
            if (!this.isImageFilePath(entry)) return;
            if (this.#artPathCache.size > 500) {
                this.#artPathCache.delete(this.#artPathCache.keys().next().value);
            }
            this.#artPathCache.set(key, { path: entry, embedded: false, isNone: false });
            return;
        }
        if (entry.embedded || entry.isNone) {
            if (this.#artPathCache.size > 500) {
                this.#artPathCache.delete(this.#artPathCache.keys().next().value);
            }
            this.#artPathCache.set(key, {
                path: null,
                embedded: Boolean(entry.embedded),
                isNone: Boolean(entry.isNone)
            });
        }
    }

    getSubfolders(dirPath) {
        if (!dirPath || !utils.IsDirectory(dirPath)) return [];
        if (this.#subfolderCache.has(dirPath)) return this.#subfolderCache.get(dirPath);

        const sep = dirPath.endsWith('\\') ? '' : '\\';
        try {
            const items = utils.Glob(`${dirPath}${sep}*`, 0);
            if (!Array.isArray(items)) return [];
            const dirs = [];
            for (let i = 0; i < items.length; i++) {
                const name = items[i].substring(items[i].lastIndexOf('\\') + 1);
                if (name === '.' || name === '..') continue;
                if (utils.IsDirectory(items[i])) dirs.push(items[i]);
            }
            if (this.#subfolderCache.size > 200) {
                this.#subfolderCache.delete(this.#subfolderCache.keys().next().value);
            }
            this.#subfolderCache.set(dirPath, dirs);
            return dirs;
        } catch {
            return [];
        }
    }

    getFolderImagesList(dirPath) {
        if (!dirPath || !utils.IsDirectory(dirPath)) return [];
        if (this.#dirScanCache.has(dirPath)) return this.#dirScanCache.get(dirPath);

        const sep = dirPath.endsWith('\\') ? '' : '\\';
        try {
            const files = utils.Glob(`${dirPath}${sep}*.*`);
            if (!Array.isArray(files)) return [];
            const result = [];
            for (let i = 0; i < files.length; i++) {
                const dot = files[i].lastIndexOf('.');
                if (dot === -1) continue;
                const ext = files[i].substring(dot).toLowerCase();
                if (ArtScanner.EXTENSIONS.includes(ext)) {
                    result.push({
                        path: files[i],
                        name: files[i].substring(files[i].lastIndexOf('\\') + 1, dot).toLowerCase()
                    });
                }
            }
            if (this.#dirScanCache.size > 100) {
                this.#dirScanCache.delete(this.#dirScanCache.keys().next().value);
            }
            this.#dirScanCache.set(dirPath, result);
            return result;
        } catch {
            return [];
        }
    }

    getFastCover(dirPath) {
        const images = this.getFolderImagesList(dirPath);
        if (!images.length) return null;
        for (const target of ArtScanner.FAST_NAMES) {
            const hit = images.find(img => img.name === target);
            if (hit) return hit.path;
        }
        return null;
    }

    inspectScoredImages(dirPath, specificPatterns) {
        const images = this.getFolderImagesList(dirPath);
        if (images.length === 0) return { bestMatch: null, fallbackImage: null };

        let bestMatch = null;
        let highestScore = -1;
        let bestFallback = null;

        const lowerSpecs = specificPatterns?.map(p => p.toLowerCase().trim()).filter(Boolean) ?? [];

        for (const img of images) {
            let score = 0;
            if (ArtScanner.FAST_NAMES.includes(img.name)) {
                score = 100;
            } else if (lowerSpecs.includes(img.name)) {
                score = 80;
            } else if (img.name.startsWith('cover') || img.name.startsWith('front') || img.name.startsWith('folder')) {
                score = 60;
            } else if (lowerSpecs.some(spec => img.name.startsWith(spec))) {
                score = 50;
            } else {
                const blacklisted = ArtScanner.BLACKLIST.some(kw => img.name.includes(kw));
                if (!blacklisted && !bestFallback) bestFallback = img.path;
                score = blacklisted ? 5 : 20;
            }

            if (score > highestScore) {
                highestScore = score;
                bestMatch = img.path;
            }
        }

        return {
            bestMatch: (highestScore >= 50) ? bestMatch : null,
            fallbackImage: bestFallback
        };
    }

    searchDirectory(dirPath, specificCover, allowFallback = true, isRootCustom = false, maxDepth = 2, deadline = Infinity, _depth = 0) {
        if (!dirPath || Date.now() > deadline || !utils.IsDirectory(dirPath)) return null;

        const inspect = this.inspectScoredImages(dirPath, specificCover);
        if (inspect.bestMatch) return inspect.bestMatch;
        if (isRootCustom && _depth === 0) return null;

        if (_depth < maxDepth && Date.now() <= deadline) {
            const subDirs = this.getSubfolders(dirPath);
            for (const sub of subDirs) {
                if (Date.now() > deadline) break;
                const name = sub.substring(sub.lastIndexOf('\\') + 1).toLowerCase().trim();
                if (ArtScanner.ART_SUBDIRS.includes(name) || ArtScanner.DISC_REGEX.test(name)) {
                    const found = this.searchDirectory(sub, specificCover, allowFallback, false, maxDepth, deadline, _depth + 1);
                    if (found) return found;
                }
            }
            if (subDirs.length <= 60 && _depth < 1 && Date.now() <= deadline) {
                for (const sub of subDirs) {
                    if (Date.now() > deadline) break;
                    const name = sub.substring(sub.lastIndexOf('\\') + 1).toLowerCase().trim();
                    if (!ArtScanner.ART_SUBDIRS.includes(name) && !ArtScanner.DISC_REGEX.test(name)) {
                        const found = this.searchDirectory(sub, specificCover, false, false, maxDepth, deadline, _depth + 1);
                        if (found) return found;
                    }
                }
            }
        }
        return allowFallback ? inspect.fallbackImage : null;
    }

    findInCustomFolder(cFolder, artistVariants, albumVariants, folderVariants, specificCover, maxDepth, deadline = Infinity) {
        if (Date.now() > deadline) return null;

        const sep = cFolder.endsWith('\\') ? '' : '\\';
        const candidateSubfolders = new Set();

        for (const art of artistVariants) {
            for (const alb of albumVariants) {
                candidateSubfolders.add(`${cFolder}${sep}${art} - ${alb}`);
                candidateSubfolders.add(`${cFolder}${sep}${art}\\${alb}`);
                candidateSubfolders.add(`${cFolder}${sep}${art}_${alb}`);
                candidateSubfolders.add(`${cFolder}${sep}${art} ${alb}`);
            }
        }
        for (const art of artistVariants) candidateSubfolders.add(`${cFolder}${sep}${art}`);
        for (const alb of albumVariants) candidateSubfolders.add(`${cFolder}${sep}${alb}`);
        for (const f of folderVariants) candidateSubfolders.add(`${cFolder}${sep}${f}`);

        for (const subDir of candidateSubfolders) {
            if (Date.now() > deadline) return null;
            if (utils.IsDirectory(subDir)) {
                const found = this.searchDirectory(subDir, specificCover, true, false, maxDepth, deadline);
                if (found) return found;
            }
        }

        if (Date.now() <= deadline && specificCover?.length) {
            const rootRes = this.searchDirectory(cFolder, specificCover, false, true, maxDepth, deadline);
            if (rootRes) return rootRes;
        }

        const matchTargets = [];
        for (const art of artistVariants) {
            for (const alb of albumVariants) {
                matchTargets.push(`${art} - ${alb}`, `${art}_${alb}`, `${art} ${alb}`, `${alb} - ${art}`);
            }
        }
        matchTargets.push(...albumVariants, ...artistVariants);

        let foundPath = null;

        const scanLevel = (dir, depth) => {
            if (depth > maxDepth || Date.now() > deadline || foundPath || !utils.IsDirectory(dir)) return;

            const subs = this.getSubfolders(dir);
            if (!subs?.length) return;
            const limit = Math.min(subs.length, 120);

            for (let i = 0; i < limit; i++) {
                if (Date.now() > deadline) return;
                const fName = subs[i].substring(subs[i].lastIndexOf('\\') + 1);
                if (this.#matchesList(fName, matchTargets) || this.#matchesList(fName, artistVariants)) {
                    foundPath = this.searchDirectory(subs[i], specificCover, true, false, maxDepth, deadline);
                    if (foundPath) return;

                    const aSubs = this.getSubfolders(subs[i]);
                    const aLimit = Math.min(aSubs.length, 60);
                    for (let j = 0; j < aLimit; j++) {
                        if (Date.now() > deadline) return;
                        const aName = aSubs[j].substring(aSubs[j].lastIndexOf('\\') + 1);
                        if (this.#matchesList(aName, matchTargets) || this.#matchesList(aName, albumVariants)) {
                            foundPath = this.searchDirectory(aSubs[j], specificCover, true, false, maxDepth, deadline);
                            if (foundPath) return;
                        }
                    }
                }
            }

            if (depth < maxDepth && subs.length <= 60 && Date.now() <= deadline) {
                for (const sub of subs) {
                    if (Date.now() > deadline) return;
                    const fName = sub.substring(sub.lastIndexOf('\\') + 1).toLowerCase();
                    if (!ArtScanner.ART_SUBDIRS.includes(fName)) {
                        scanLevel(sub, depth + 1);
                        if (foundPath) return;
                    }
                }
            }
        };

        scanLevel(cFolder, 1);
        return foundPath;
    }

    #matchesList(folderName, variants) {
        if (!folderName || !variants?.length) return false;
        return variants.some(v => this.#isNameMatch(folderName, v));
    }

    #isNameMatch(folderName, targetName) {
        if (!folderName || !targetName) return false;
        const fRaw = folderName.toLowerCase().trim();
        const tRaw = targetName.toLowerCase().trim();
        if (fRaw === tRaw) return true;

        const f = GdiUtils.normalize(folderName);
        const t = GdiUtils.normalize(targetName);
        if (!f || !t) return false;
        if (f === t) return true;

        if (f.startsWith(`${t} `) || f.endsWith(` ${t}`) || f.includes(` ${t} `)) return true;
        if (t.startsWith(`${f} `) || t.endsWith(` ${f}`) || (t.length >= 3 && f.includes(t)) || (f.length >= 3 && t.includes(f))) return true;

        return false;
    }

    cleanVariants(str) {
        if (!str || !str.trim()) return [];
        const base = str.trim();
        const set = new Set([base]);

        try {
            const cleanUnder = utils.ReplaceIllegalChars(base, true)?.trim();
            if (cleanUnder) set.add(cleanUnder);
        } catch {}

        const cleanDash = base.replace(/[\/\\:*?"<>|]/g, '-').trim();
        if (cleanDash) set.add(cleanDash);

        const cleanSpace = base.replace(/[\/\\:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
        if (cleanSpace) set.add(cleanSpace);

        const cleanNone = base.replace(/[\/\\:*?"<>|]/g, '').trim();
        if (cleanNone) set.add(cleanNone);

        const noParen = base.replace(/\s*[\(\[\{][^\)\]\}]*[\)\]\}]\s*/g, ' ').trim();
        if (noParen && noParen !== base) {
            set.add(noParen);
            try {
                const noParenClean = utils.ReplaceIllegalChars(noParen, true)?.trim();
                if (noParenClean) set.add(noParenClean);
            } catch {}
        }
        return Array.from(set).filter(Boolean);
    }
}

// ============================================================================================
// 4. OVERLAY & BACKDROP ENGINE
// ============================================================================================
class VisualBackdrop {
    #bgBlurredBmp = null;
    #bgCacheBmp   = null;
    #overlayBmp   = null;
    #glowBmp      = null;
    #glowSize     = 0;
    #glowOp       = 0;
    #lastBlurSrc  = null;
    #lastBlurRad  = -1;

    static #disposeBmp(bmp) {
        if (bmp) {
            try { bmp.Dispose(); } catch {}
        }
        return null;
    }

    rebuildBlur(activeImg, w, h, enabled, blurRadius, useUIColor) {
        if (!enabled || useUIColor || !activeImg || w <= 0 || h <= 0) {
            this.#bgBlurredBmp = VisualBackdrop.#disposeBmp(this.#bgBlurredBmp);
            this.#lastBlurSrc = null;
            this.#lastBlurRad = -1;
            return;
        }

        const blurR = GdiUtils.clamp(blurRadius, 0, 254);
        if (blurR <= 0) {
            if (this.#bgBlurredBmp && this.#lastBlurSrc === activeImg && this.#lastBlurRad === -1) return;
            this.#bgBlurredBmp = VisualBackdrop.#disposeBmp(this.#bgBlurredBmp);
            try {
                this.#bgBlurredBmp = activeImg.Clone(0, 0, activeImg.Width, activeImg.Height);
            } catch {
                this.#bgBlurredBmp = null;
            }
            this.#lastBlurSrc = activeImg;
            this.#lastBlurRad = -1;
            return;
        }

        if (this.#bgBlurredBmp && this.#lastBlurSrc === activeImg && this.#lastBlurRad === blurR) return;

        let thumb = null, g = null;
        try {
            const scale = blurR > 60 ? 4 : (blurR > 20 ? 2 : 1);
            const tw = Math.max(32, Math.floor(w / scale));
            const th = Math.max(32, Math.floor(h / scale));

            thumb = gdi.CreateImage(tw, th);
            g = thumb.GetGraphics();
            g.SetInterpolationMode(0);
            g.DrawImage(activeImg, 0, 0, tw, th, 0, 0, activeImg.Width, activeImg.Height);
            thumb.ReleaseGraphics(g);
            g = null;

            const maxSafeRadius = Math.max(0, Math.min(Math.floor(tw / 2) - 1, Math.floor(th / 2) - 1));
            const rawRadius = Math.min(Math.round(blurR / scale), 120, maxSafeRadius);
            const effectiveRadius = (rawRadius >= 2) ? rawRadius : (maxSafeRadius >= 2 ? 2 : 0);
            if (effectiveRadius >= 2) thumb.StackBlur(effectiveRadius);

            this.#bgBlurredBmp = VisualBackdrop.#disposeBmp(this.#bgBlurredBmp);
            this.#bgBlurredBmp = thumb;
            this.#lastBlurSrc = activeImg;
            this.#lastBlurRad = blurR;
        } catch {
            if (g && thumb) { try { thumb.ReleaseGraphics(g); } catch {} }
            if (thumb) { try { thumb.Dispose(); } catch {} }
            this.#bgBlurredBmp = null;
        }
    }

    rebuildCache(w, h, useUIColor, customBgColor, bgEnabled, darkenPct, uiColour) {
        this.#bgCacheBmp = VisualBackdrop.#disposeBmp(this.#bgCacheBmp);
        if (w <= 0 || h <= 0) return;

        let bmp = null, g = null;
        try {
            bmp = gdi.CreateImage(w, h);
            g = bmp.GetGraphics();

            if (useUIColor) {
                g.FillSolidRect(0, 0, w, h, uiColour);
            } else {
                g.FillSolidRect(0, 0, w, h, customBgColor >>> 0);
                if (bgEnabled && this.#bgBlurredBmp) {
                    g.SetInterpolationMode(2);
                    g.DrawImage(this.#bgBlurredBmp, 0, 0, w, h, 0, 0, this.#bgBlurredBmp.Width, this.#bgBlurredBmp.Height);
                }
                if (darkenPct > 0 && bgEnabled && this.#bgBlurredBmp) {
                    g.FillSolidRect(0, 0, w, h, GdiUtils.setAlpha(GdiUtils.RGB(0, 0, 0), Math.floor(darkenPct * 2.55)));
                }
            }
            bmp.ReleaseGraphics(g);
            this.#bgCacheBmp = bmp;
        } catch {
            if (g && bmp) { try { bmp.ReleaseGraphics(g); } catch {} }
            if (bmp) { try { bmp.Dispose(); } catch {} }
            this.#bgCacheBmp = null;
        }
    }

    rebuildOverlay(w, h, config, bezelImg, dpiScale) {
        this.#overlayBmp = VisualBackdrop.#disposeBmp(this.#overlayBmp);
        if (w <= 0 || h <= 0) return;

        let bmp = null, g = null;
        try {
            bmp = gdi.CreateImage(w, h);
            g = bmp.GetGraphics();

            if (config.showPhosphor && config.opPhosphor > 0 && !config.overlayAllOff) {
                const blended = GdiUtils.blendWithWhite(config.phosphorColor, 0.25);
                g.FillSolidRect(0, 0, w, h, GdiUtils.setAlpha(blended, Math.floor(config.opPhosphor * 0.3)));
            }

            if (config.showScanlines && config.opScanlines > 0 && !config.overlayAllOff) {
                const scanCol = GdiUtils.setAlpha(GdiUtils.RGB(0, 0, 0), config.opScanlines);
                const lineH = Math.max(1, Math.round(1 * dpiScale));
                const stepH = Math.max(2, Math.round(3 * dpiScale));
                for (let y = 0; y < h; y += stepH) {
                    g.FillSolidRect(0, y, w, lineH, scanCol);
                }
            }

            if (config.showReflection && config.opReflection > 0 && !config.overlayAllOff) {
                const reflH = Math.floor(h * 0.45);
                for (let y = 0; y < reflH; y++) {
                    const t = 1 - (y / reflH);
                    const a = Math.floor(config.opReflection * (t * t * (3 - 2 * t)) * 0.4);
                    if (a > 0) g.FillSolidRect(0, y, w, 1, GdiUtils.setAlpha(GdiUtils.RGB(255, 255, 255), a));
                }
            }

            const b = Math.round(config.borderSize * dpiScale);
            if (b > 0) {
                const col = config.borderColor >>> 0;
                g.FillSolidRect(0, 0, w, b, col);
                g.FillSolidRect(0, h - b, w, b, col);
                const sideH = Math.max(0, h - b * 2);
                if (sideH > 0) {
                    g.FillSolidRect(0, b, b, sideH, col);
                    g.FillSolidRect(w - b, b, b, sideH, col);
                }
            }

            if (config.bezelEnabled && bezelImg) {
                g.SetInterpolationMode(7);
                g.DrawImage(bezelImg, 0, 0, w, h, 0, 0, bezelImg.Width, bezelImg.Height);
            }

            bmp.ReleaseGraphics(g);
            this.#overlayBmp = bmp;
        } catch {
            if (g && bmp) { try { bmp.ReleaseGraphics(g); } catch {} }
            if (bmp) { try { bmp.Dispose(); } catch {} }
            this.#overlayBmp = null;
        }
    }

    checkGlow(w, h, showGlow, opGlow, overlayAllOff) {
        if (!showGlow || opGlow <= 0 || overlayAllOff || w <= 0 || h <= 0) {
            this.#glowBmp = VisualBackdrop.#disposeBmp(this.#glowBmp);
            this.#glowSize = 0;
            this.#glowOp = 0;
            return;
        }

        const maxR = Math.max(w, h) * 0.7;
        const sz = Math.ceil(maxR * 2);
        if (this.#glowBmp && this.#glowSize === sz && this.#glowOp === opGlow) return;

        this.#glowBmp = VisualBackdrop.#disposeBmp(this.#glowBmp);
        try {
            const bmp = gdi.CreateImage(sz, sz);
            const g = bmp.GetGraphics();
            const center = sz / 2;
            for (let i = 1; i <= 6; i++) {
                const a = Math.floor(opGlow * (1 - i / 6) * 0.2);
                const r = maxR * (i / 6);
                g.FillEllipse(center - r, center - r, r * 2, r * 2, GdiUtils.setAlpha(GdiUtils.RGB(255, 255, 255), a));
            }
            bmp.ReleaseGraphics(g);
            this.#glowBmp = bmp;
            this.#glowSize = sz;
            this.#glowOp = opGlow;
        } catch {
            this.#glowBmp = null;
        }
    }

    get cacheBmp()   { return this.#bgCacheBmp; }
    get overlayBmp() { return this.#overlayBmp; }
    get glowBmp()    { return this.#glowBmp; }
    get glowSize()   { return this.#glowSize; }

    dispose() {
        this.#bgBlurredBmp = VisualBackdrop.#disposeBmp(this.#bgBlurredBmp);
        this.#bgCacheBmp   = VisualBackdrop.#disposeBmp(this.#bgCacheBmp);
        this.#overlayBmp   = VisualBackdrop.#disposeBmp(this.#overlayBmp);
        this.#glowBmp      = VisualBackdrop.#disposeBmp(this.#glowBmp);
        this.#lastBlurSrc  = null;
        this.#lastBlurRad  = -1;
    }
}

// ============================================================================================
// 5. MAIN CONTROLLER & APPLICATION ENGINE
// ============================================================================================
class PanelArtController {
    static LIFECYCLE = { BOOT: 0, INIT: 1, LIVE: 2, SHUTDOWN: 3 };
    static VALID_FLOATS = SettingsSchema.VALID_FLOATS;
    static BEZEL_EXTS = ['.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp'];

    static DIRTY = {
        NONE:       0,
        BACKGROUND: 1 << 0,
        OVERLAY:    1 << 1,
        LAYOUT:     1 << 2,
        TEXT:       1 << 3,
        ALL:        ~0
    };

    static PHOSPHOR_THEMES = [
        { name: 'Classic', color: GdiUtils.RGB(0, 255, 0) },
        { name: 'Neo',     color: GdiUtils.RGB(0, 255, 255) },
        { name: 'Dark',    color: GdiUtils.RGB(0, 200, 0) },
        { name: 'Bright',  color: GdiUtils.RGB(255, 255, 0) },
        { name: 'Retro',   color: GdiUtils.RGB(0, 255, 100) },
        { name: 'Minimal', color: GdiUtils.RGB(0, 180, 0) },
        { name: 'Matrix',  color: GdiUtils.RGB(0, 255, 50) },
        { name: 'Vapor',   color: GdiUtils.RGB(255, 180, 255) },
        { name: 'Cyber',   color: GdiUtils.RGB(0, 255, 255) },
        { name: 'Magenta', color: GdiUtils.RGB(255, 0, 255) }
    ];

    static GLITCH_CHROMA = GdiUtils.RGB(220, 225, 230);
    static GLITCH_SHIFT_COLORS = [
        GdiUtils.RGB(100, 200, 255), GdiUtils.RGB(180, 200, 230),
        GdiUtils.RGB(150, 255, 150), GdiUtils.RGB(255, 255, 100),
        GdiUtils.RGB(255, 100, 100)
    ];
    static GLITCH_SLICE_COLORS = [
        GdiUtils.RGB(100, 180, 255), GdiUtils.RGB(180, 200, 230),
        GdiUtils.RGB(200, 210, 220), GdiUtils.RGB(120, 160, 220),
        GdiUtils.RGB(150, 255, 150), GdiUtils.RGB(255, 255, 100),
        GdiUtils.RGB(255, 100, 100)
    ];
    static GLITCH_TINT_COLORS = [
        GdiUtils.RGB(100, 180, 255), GdiUtils.RGB(180, 200, 230),
        GdiUtils.RGB(200, 210, 220), GdiUtils.RGB(150, 170, 210),
        GdiUtils.RGB(100, 255, 100), GdiUtils.RGB(255, 255, 100),
        GdiUtils.RGB(255, 100, 100)
    ];
    static GLITCH_BLOCK_COLORS = [
        GdiUtils.RGB(0x64, 0xB4, 0xFF), GdiUtils.RGB(0xB4, 0xC8, 0xE6),
        GdiUtils.RGB(0xD2, 0xDA, 0xE6), GdiUtils.RGB(0x78, 0x88, 0xB8),
        GdiUtils.RGB(0xA0, 0xB0, 0xC8), GdiUtils.RGB(0xC8, 0xD0, 0xE0),
        GdiUtils.RGB(0x50, 0xFF, 0x50), GdiUtils.RGB(0xFF, 0xFF, 0x50),
        GdiUtils.RGB(0xFF, 0x50, 0x50)
    ];

    static DEFAULTS = SettingsSchema.defaults();

    #lifecycle = PanelArtController.LIFECYCLE.BOOT;
    #dpiScale  = 1;
    #dirtyFlags = PanelArtController.DIRTY.ALL;

    #artGenerationToken = 0;
    #bezelLoadToken     = 0;
    #asyncArtToken      = 0;
    #asyncArtRawPath    = '';
    #pendingSearchTimer = null;
    #glitchTimer        = null;
    #slideTimer         = null;
    #slideWasHidden     = false;
    #saveTimeout        = null;
    #bezelNotifyTimeout = null;

    #fonts     = new FontRegistry(150);
    #scanner   = new ArtScanner();
    #backdrop  = new VisualBackdrop();
    #imgLoader = new AsyncImageLoader();

    #coverImg       = null;
    #scaledCoverBmp = null;
    #scaledCoverSrc = null;
    #scaledCoverW   = 0;
    #scaledCoverH   = 0;
    #modeImg        = null;
    #bezelBmp       = null;
    #hudFont        = null;

    #currentCoverPath  = '';
    #currentTrackPath  = '';
    #currentArtKey     = '';
    #profileBase       = '';
    #customFolders     = [];
    #bezelNotifyText   = '';
    #opacityTarget     = null;
    #cachedBezelImages = null;
    #cachedBezelFolder = null;
    #slideImages       = null;

    #glitchFrame    = 0;
    #glitchBlackout = false;

    #textBlockBmp = null;
    #textBlockX   = 0;
    #textBlockY   = 0;
    #textBlockW   = 0;
    #textBlockH   = 0;

    #compoundTf = fb.TitleFormat('$directory_path(%path%)\x01%artist%\x01%album%\x01$directory(%path%)\x01%title%\x01%date%\x01%length%\x01%album artist%\x01%discnumber%');

    #trackInfo = { title: 'No track playing', artist: '', extra: '' };
    #layout = {
        artRect: { x: 0, y: 0, w: 0, h: 0 }
    };

    config = { ...PanelArtController.DEFAULTS };

    constructor() {
        const sysDpi = (typeof window.DPI === 'number' && window.DPI > 0) ? window.DPI : 96;
        this.#dpiScale = sysDpi / 96;

        let p = fb.ProfilePath || '';
        if (p && !p.endsWith('\\') && !p.endsWith('/')) p += '\\';
        this.#profileBase = p;
        PanelArtController.DEFAULTS.bezelFolder = `${this.#profileBase}skins\\overlay`;

        this.#loadProperties();
        this.#loadCustomFolders();
    }

    scale(size) {
        return Math.round(size * this.#dpiScale);
    }

    init() {
        this.#lifecycle = PanelArtController.LIFECYCLE.INIT;
        this.loadBezel();
        this.#rebuildOverlay();

        this.#lifecycle = PanelArtController.LIFECYCLE.LIVE;
        window.Repaint();

        window.SetTimeout(() => {
            if (this.#lifecycle !== PanelArtController.LIFECYCLE.LIVE) return;
            if (this.config.slideMode) {
                this.startSlideMode(false);
            } else if (this.config.imageMode) {
                this.startImageMode(false);
            } else {
                try {
                    if (fb.IsPlaying) this.loadArtworkForTrack(fb.GetNowPlaying());
                    else this.clearTrackDisplay();
                } catch {
                    this.clearTrackDisplay();
                }
            }
        }, 0);
    }

    #loadProperties() {
        this.config = SettingsSchema.loadProperties(PanelArtController.DEFAULTS);
    }

    resolveProfileFolder(pathStr) {
        const clean = GdiUtils.sanitizePath(pathStr);
        if (!clean) return '';
        if (/^profile(?:[\\\/]|$)/i.test(clean)) {
            const sub = clean.replace(/^profile[\\\/]?/i, '').replace(/\//g, '\\');
            return GdiUtils.sanitizePath(`${this.#profileBase}${sub}`);
        }
        return clean;
    }

    #loadCustomFolders() {
        this.#scanner.clearCaches();
        try {
            const raw = window.GetProperty('PA.CustomFolders', '[]');
            const parsed = JSON.parse(raw);
            this.#customFolders = Array.isArray(parsed)
                ? parsed.map(GdiUtils.sanitizePath).filter(p => p && utils.IsDirectory(p))
                : [];
        } catch {
            this.#customFolders = [];
        }
    }

    saveAll() {
        SettingsSchema.saveProperties(this.config);
        window.SetProperty('PA.CustomFolders', JSON.stringify(this.#customFolders));
    }

    requestSave() {
        if (this.#saveTimeout) window.ClearTimeout(this.#saveTimeout);
        this.#saveTimeout = window.SetTimeout(() => {
            this.saveAll();
            this.#saveTimeout = null;
        }, 500);
    }

    getHudFont() {
        this.#hudFont ??= gdi.Font('Segoe UI', Math.max(9, this.scale(12)));
        return this.#hudFont;
    }

    #disposeTextBlock() {
        if (this.#textBlockBmp) {
            try { this.#textBlockBmp.Dispose(); } catch {}
            this.#textBlockBmp = null;
        }
    }

    #disposeScaledCover() {
        if (this.#scaledCoverBmp) {
            try { this.#scaledCoverBmp.Dispose(); } catch {}
            this.#scaledCoverBmp = null;
        }
        this.#scaledCoverSrc = null;
        this.#scaledCoverW   = 0;
        this.#scaledCoverH   = 0;
    }

    #ensureScaledCover(ar) {
        if (!this.#coverImg || !this.config.albumArtEnabled || ar.w <= 0 || ar.h <= 0) {
            this.#disposeScaledCover();
            return null;
        }
        if (this.#scaledCoverBmp && this.#scaledCoverSrc === this.#coverImg &&
            this.#scaledCoverW === ar.w && this.#scaledCoverH === ar.h) {
            return this.#scaledCoverBmp;
        }
        this.#disposeScaledCover();
        try {
            this.#scaledCoverBmp = this.#coverImg.Resize(ar.w, ar.h);
            this.#scaledCoverSrc = this.#coverImg;
            this.#scaledCoverW   = ar.w;
            this.#scaledCoverH   = ar.h;
            return this.#scaledCoverBmp;
        } catch {
            this.#disposeScaledCover();
            return null;
        }
    }

    getBezelImages(forceReload = false) {
        const cleanFolder = GdiUtils.sanitizePath(this.config.bezelFolder);
        if (!cleanFolder || !utils.IsDirectory(cleanFolder)) {
            this.#cachedBezelImages = [];
            this.#cachedBezelFolder = cleanFolder;
            return this.#cachedBezelImages;
        }
        if (!forceReload && this.#cachedBezelImages !== null && this.#cachedBezelFolder === cleanFolder) {
            return this.#cachedBezelImages;
        }
        this.#cachedBezelFolder = cleanFolder;
        try {
            const all = utils.Glob(`${cleanFolder}\\*.*`);
            if (!Array.isArray(all)) return [];
            this.#cachedBezelImages = all.filter(f => {
                const dot = f.lastIndexOf('.');
                if (dot === -1) return false;
                const ext = f.substring(dot).toLowerCase();
                return PanelArtController.BEZEL_EXTS.includes(ext);
            }).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
            return this.#cachedBezelImages;
        } catch {
            return [];
        }
    }

    listBezelNames(forceReload = false) {
        return this.getBezelImages(forceReload).map(p => {
            const name = p.substring(p.lastIndexOf('\\') + 1);
            return name.substring(0, name.lastIndexOf('.'));
        });
    }

    resolveBezelPath(name) {
        const folder = this.config.bezelFolder;
        if (!folder || !name) return null;
        const cachedList = this.getBezelImages(false);
        const lower = name.toLowerCase();

        for (let i = 0; i < cachedList.length; i++) {
            const fullPath = cachedList[i];
            const fileName = fullPath.substring(fullPath.lastIndexOf('\\') + 1);
            const baseName = fileName.substring(0, fileName.lastIndexOf('.'));
            if (fileName.toLowerCase() === lower || baseName.toLowerCase() === lower) {
                return fullPath;
            }
        }

        const base = folder.endsWith('\\') ? folder : `${folder}\\`;
        for (const ext of PanelArtController.BEZEL_EXTS) {
            if (lower.endsWith(ext) && utils.IsFile(`${base}${name}`)) return `${base}${name}`;
        }
        for (const ext of PanelArtController.BEZEL_EXTS) {
            const p = `${base}${name}${ext}`;
            if (utils.IsFile(p)) return p;
        }
        return null;
    }

    loadBezel() {
        const bezelToken = ++this.#bezelLoadToken;
        if (!this.config.bezelEnabled || !this.config.bezelFile) {
            if (this.#bezelBmp) { try { this.#bezelBmp.Dispose(); } catch {} this.#bezelBmp = null; }
            return;
        }

        const target = this.resolveBezelPath(this.config.bezelFile);
        if (!target) {
            if (this.#bezelBmp) { try { this.#bezelBmp.Dispose(); } catch {} this.#bezelBmp = null; }
            this.config.bezelEnabled = false;
            this.config.bezelFile = '';
            return;
        }

        this.#imgLoader.load(target).then((img) => {
            if (this.#lifecycle === PanelArtController.LIFECYCLE.SHUTDOWN || bezelToken !== this.#bezelLoadToken || !this.config.bezelEnabled) {
                if (img) { try { img.Dispose(); } catch {} }
                return;
            }
            if (this.#bezelBmp) { try { this.#bezelBmp.Dispose(); } catch {} this.#bezelBmp = null; }
            if (img) {
                this.#bezelBmp = img;
            } else {
                this.config.bezelEnabled = false;
                this.config.bezelFile = '';
            }
            this.#dirtyFlags |= PanelArtController.DIRTY.OVERLAY;
            this.#rebuildOverlay();
            window.Repaint();
        });
    }

    cycleBezel(direction) {
        const bezelNames = this.listBezelNames(true);
        if (!bezelNames.length) {
            this.#bezelNotifyText = 'No bezels found';
            if (this.#bezelNotifyTimeout) window.ClearTimeout(this.#bezelNotifyTimeout);
            this.#bezelNotifyTimeout = window.SetTimeout(() => {
                this.#bezelNotifyText = '';
                this.#bezelNotifyTimeout = null;
                window.Repaint();
            }, 1500);
            window.Repaint();
            return;
        }

        let currentIdx = 0;
        if (this.config.bezelEnabled && this.config.bezelFile) {
            const curClean = (this.config.bezelFile || '').toLowerCase().replace(/\.[^/.]+$/, '');
            const found = bezelNames.findIndex(n => n.toLowerCase() === curClean);
            if (found !== -1) currentIdx = found + 1;
        }

        const count = bezelNames.length + 1;
        const nextIdx = (currentIdx + direction + count) % count;

        if (nextIdx === 0) {
            this.config.bezelEnabled = false;
            this.config.bezelFile = '';
            this.#bezelNotifyText = 'None';
        } else {
            this.config.bezelEnabled = true;
            this.config.bezelFile = bezelNames[nextIdx - 1];
            this.#bezelNotifyText = this.config.bezelFile;
        }

        this.loadBezel();
        this.#dirtyFlags |= PanelArtController.DIRTY.OVERLAY;
        this.requestSave();

        if (this.#bezelNotifyTimeout) window.ClearTimeout(this.#bezelNotifyTimeout);
        this.#bezelNotifyTimeout = window.SetTimeout(() => {
            this.#bezelNotifyText = '';
            this.#bezelNotifyTimeout = null;
            window.Repaint();
        }, 1500);

        window.Repaint();
    }

    loadArtworkForTrack(metadb) {
        const handle = this.#getSafeHandle(metadb);
        if (!handle?.Path) {
            this.clearTrackDisplay();
            return;
        }

        const trackPath = handle.Path;
        this.#currentTrackPath = trackPath;

        let trackDir = '', rawArtist = '', rawAlbum = '', rawFolder = '', rawTitle = '', rawDate = '', rawLen = '', rawAlbArtist = '', rawDisc = '';

        try {
            const raw = this.#compoundTf.EvalWithMetadb(handle) ?? '';
            const parts = raw.split('\x01');
            trackDir     = parts[0] ?? '';
            rawArtist    = parts[1] ?? '';
            rawAlbum     = parts[2] ?? '';
            rawFolder    = parts[3] ?? '';
            rawTitle     = parts[4] ?? '';
            rawDate      = parts[5] ?? '';
            rawLen       = parts[6] ?? '';
            rawAlbArtist = parts[7] ?? '';
            rawDisc      = parts[8] ?? '';
        } catch {}

        this.#trackInfo.title  = rawTitle || 'Playing';
        this.#trackInfo.artist = rawArtist;
        const extraParts = [rawAlbum.trim(), rawDate.trim(), rawLen.trim()].filter(Boolean);
        this.#trackInfo.extra = extraParts.join(' | ');

        if (this.config.glitchEnabled) {
            this.triggerGlitch();
        }

        if (this.config.imageMode || this.config.slideMode) {
            this.#dirtyFlags |= PanelArtController.DIRTY.TEXT;
            window.Repaint();
            return;
        }

        const artKey = this.#scanner.getArtworkIdentityKey(trackDir, rawAlbum, rawDisc, rawTitle || trackPath);

        if (this.#currentArtKey && artKey === this.#currentArtKey) {
            this.#dirtyFlags |= PanelArtController.DIRTY.TEXT;
            window.Repaint();
            return;
        }

        // Keep previous cover visible until new art resolves
        this.#currentArtKey = artKey;
        this.#dirtyFlags |= PanelArtController.DIRTY.TEXT;

        const thisToken = ++this.#artGenerationToken;
        this.#asyncArtToken = 0;
        this.#asyncArtRawPath = '';

        const cached = this.#scanner.getArtFromMemoryCache(artKey);
        if (cached) {
            if (cached.isNone) {
                this.applyNewArtwork(null, thisToken);
                return;
            }
            if (cached.embedded) {
                window.Repaint();
                try {
                    const asyncHandle = this.#getSafeHandle(handle);
                    if (asyncHandle) {
                        this.#asyncArtToken = thisToken;
                        this.#asyncArtRawPath = asyncHandle.RawPath || '';
                        utils.GetAlbumArtAsync(window.ID, asyncHandle, 0, false, false, false);
                        return;
                    }
                } catch {}
                this.applyNewArtwork(null, thisToken);
                return;
            }
            this.applyNewArtwork(cached.path, thisToken);
            return;
        }

        window.Repaint();

        if (this.#pendingSearchTimer) { window.ClearTimeout(this.#pendingSearchTimer); this.#pendingSearchTimer = null; }
        this.#pendingSearchTimer = window.SetTimeout(() => {
            this.#pendingSearchTimer = null;
            if (thisToken !== this.#artGenerationToken || this.#lifecycle !== PanelArtController.LIFECYCLE.LIVE) return;

            const fastCover = this.#scanner.getFastCover(trackDir);
            if (fastCover) {
                this.#scanner.setArtMemoryCache(artKey, fastCover);
                this.applyNewArtwork(fastCover, thisToken);
                return;
            }

            const deadline = Date.now() + 25;
            let coverPath = null;
            const artistVariants = this.#scanner.cleanVariants(rawArtist);
            if (rawAlbArtist && rawAlbArtist !== rawArtist) {
                for (const v of this.#scanner.cleanVariants(rawAlbArtist)) {
                    if (!artistVariants.includes(v)) artistVariants.push(v);
                }
            }
            const albumVariants  = this.#scanner.cleanVariants(rawAlbum);
            const folderVariants = this.#scanner.cleanVariants(rawFolder);

            const specificPatterns = [];
            for (const art of artistVariants) {
                for (const alb of albumVariants) {
                    specificPatterns.push(`${art} - ${alb}`, `${art}_${alb}`, `${art} ${alb}`, `${alb} - ${art}`);
                }
            }
            specificPatterns.push(...albumVariants, ...artistVariants);

            if (trackDir && utils.IsDirectory(trackDir) && Date.now() <= deadline) {
                coverPath = this.#scanner.searchDirectory(trackDir, specificPatterns, true, false, this.config.customFolderDepth, deadline);
            }

            if (!coverPath && this.#customFolders.length > 0 && Date.now() <= deadline) {
                for (const cFolder of this.#customFolders) {
                    if (Date.now() > deadline) break;
                    coverPath = this.#scanner.findInCustomFolder(cFolder, artistVariants, albumVariants, folderVariants, specificPatterns, this.config.customFolderDepth, deadline);
                    if (coverPath) break;
                }
            }

            if (thisToken !== this.#artGenerationToken || this.#lifecycle !== PanelArtController.LIFECYCLE.LIVE) return;

            if (coverPath) {
                this.#scanner.setArtMemoryCache(artKey, coverPath);
                this.applyNewArtwork(coverPath, thisToken);
                return;
            }

            try {
                const asyncHandle = this.#getSafeHandle(handle);
                if (asyncHandle) {
                    this.#asyncArtToken = thisToken;
                    this.#asyncArtRawPath = asyncHandle.RawPath || '';
                    utils.GetAlbumArtAsync(window.ID, asyncHandle, 0, false, false, false);
                } else {
                    this.applyNewArtwork(null, thisToken);
                }
            } catch {
                this.applyNewArtwork(null, thisToken);
            }
        }, 15);
    }

    applyNewArtwork(coverPath, token) {
        if (token && token !== this.#artGenerationToken) return;

        if (coverPath && coverPath === this.#currentCoverPath && this.#coverImg) {
            this.#dirtyFlags |= PanelArtController.DIRTY.TEXT;
            if (!this.#backdrop.cacheBmp) this.#rebuildBackground();
            window.Repaint();
            return;
        }

        if (!coverPath) {
            const hadCover = Boolean(this.#coverImg);
            this.#disposeScaledCover();
            if (this.#coverImg) { try { this.#coverImg.Dispose(); } catch {} this.#coverImg = null; }
            this.#currentCoverPath = '';
            if (hadCover) {
                this.#dirtyFlags |= (PanelArtController.DIRTY.LAYOUT | PanelArtController.DIRTY.TEXT | PanelArtController.DIRTY.BACKGROUND);
                this.#rebuildBackground();
            } else {
                this.#dirtyFlags |= PanelArtController.DIRTY.TEXT;
                if (!this.#backdrop.cacheBmp) this.#rebuildBackground();
            }
            window.Repaint();
            return;
        }

        const expectedToken = token ?? this.#artGenerationToken;
        this.#imgLoader.load(coverPath).then((img) => {
            if (this.#lifecycle !== PanelArtController.LIFECYCLE.LIVE || expectedToken !== this.#artGenerationToken) {
                if (img) { try { img.Dispose(); } catch {} }
                return;
            }

            this.#disposeScaledCover();
            if (this.#coverImg) { try { this.#coverImg.Dispose(); } catch {} this.#coverImg = null; }
            this.#currentCoverPath = '';

            if (img) {
                this.#coverImg = img;
                this.#currentCoverPath = coverPath;
            }

            this.#dirtyFlags |= (PanelArtController.DIRTY.LAYOUT | PanelArtController.DIRTY.TEXT | PanelArtController.DIRTY.BACKGROUND);
            this.#rebuildBackground();
            window.Repaint();
        });
    }

    refreshColours() {
        if (this.config.bgUseUIColor) {
            this.#dirtyFlags |= PanelArtController.DIRTY.BACKGROUND;
            this.#rebuildBackground();
        }
        this.#dirtyFlags |= PanelArtController.DIRTY.OVERLAY;
        this.#rebuildOverlay();
        window.Repaint();
    }

    #rebuildBackground() {
        this.#backdrop.rebuildBlur(
            this.#coverImg,
            window.Width,
            window.Height,
            this.config.backgroundEnabled && this.config.blurEnabled,
            this.config.blurRadius,
            this.config.bgUseUIColor
        );
        this.#backdrop.rebuildCache(
            window.Width,
            window.Height,
            this.config.bgUseUIColor,
            this.config.customBgColor,
            this.config.backgroundEnabled,
            this.config.darkenValue,
            this.#getSafeUIColour()
        );
        this.#dirtyFlags &= ~PanelArtController.DIRTY.BACKGROUND;
    }

    #rebuildOverlay() {
        const themeColor = this.config.phosphorTheme === PanelArtController.PHOSPHOR_THEMES.length
            ? this.config.customPhosphorColor
            : PanelArtController.PHOSPHOR_THEMES[this.config.phosphorTheme].color;

        this.#backdrop.rebuildOverlay(
            window.Width,
            window.Height,
            { ...this.config, phosphorColor: themeColor },
            this.#bezelBmp,
            this.#dpiScale
        );
        this.#dirtyFlags &= ~PanelArtController.DIRTY.OVERLAY;
    }

    clearTrackDisplay() {
        this.#currentTrackPath = '';
        this.#trackInfo.title  = 'No track playing';
        this.#trackInfo.artist = '';
        this.#trackInfo.extra  = '';
        this.#disposeTextBlock();

        if (this.config.imageMode || this.config.slideMode) {
            this.#dirtyFlags |= PanelArtController.DIRTY.TEXT;
            window.Repaint();
            return;
        }

        this.#currentCoverPath = '';
        this.#currentArtKey    = '';
        this.#artGenerationToken++;
        this.#asyncArtToken = 0;
        this.#asyncArtRawPath = '';

        if (this.#pendingSearchTimer) { window.ClearTimeout(this.#pendingSearchTimer); this.#pendingSearchTimer = null; }
        this.#disposeScaledCover();
        if (this.#coverImg) { try { this.#coverImg.Dispose(); } catch {} this.#coverImg = null; }

        this.#dirtyFlags = PanelArtController.DIRTY.ALL;
        this.#backdrop.dispose();
        this.#rebuildBackground();
        window.Repaint();
    }

    // ========================================================================================
    // 6. ENHANCED GLITCH SHADER & VIDEO DROPOUT ENGINE
    // ========================================================================================
    triggerGlitch() {
        if (!this.config.glitchEnabled || !window.IsVisible) return;
        if (this.#glitchTimer) {
            window.ClearInterval(this.#glitchTimer);
            this.#glitchTimer = null;
        }

        let count = 0;
        const totalFrames = 6;

        this.#glitchTimer = window.SetInterval(() => {
            count++;
            if (count >= totalFrames || !window.IsVisible || this.#lifecycle !== PanelArtController.LIFECYCLE.LIVE) {
                this.#glitchFrame = 0;
                this.#glitchBlackout = false;
                window.ClearInterval(this.#glitchTimer);
                this.#glitchTimer = null;
                if (window.IsVisible && this.#lifecycle === PanelArtController.LIFECYCLE.LIVE) window.Repaint();
            } else {
                this.#glitchFrame = Math.random() * 0.65 + 0.35;
                this.#glitchBlackout = (count === 2 || count === 3);
                window.Repaint();
            }
        }, 26);
    }

    #drawGlitch(gr, w, h, intensity) {
        if (intensity <= 0) return;
        const pad = this.scale(this.config.borderSize) || 0;
        const gx = Math.max(pad, 0), gy = Math.max(pad, 0);
        const gw = Math.max(1, w - pad * 2);
        const gh = Math.max(1, h - pad * 2);

        const stepH = Math.max(2, this.scale(3));
        const scanOff = Math.floor(Math.random() * stepH);
        for (let y = gy + scanOff; y < gy + gh; y += stepH) {
            gr.FillSolidRect(gx, y, gw, Math.max(1, this.scale(1)), GdiUtils.setAlpha(GdiUtils.RGB(0, 0, 0), Math.floor(Math.random() * 50) + 40));
        }

        const maxShift = Math.floor(gw * 0.12);
        const shift    = Math.floor(Math.random() * maxShift);
        const shiftDir = Math.random() > 0.5 ? 1 : -1;

        if (intensity > 0.25) {
            const col1 = PanelArtController.GLITCH_SHIFT_COLORS[Math.floor(Math.random() * PanelArtController.GLITCH_SHIFT_COLORS.length)];
            const col2 = PanelArtController.GLITCH_SHIFT_COLORS[Math.floor(Math.random() * PanelArtController.GLITCH_SHIFT_COLORS.length)];
            const sx1  = gx + shift * shiftDir,  rw1 = gw - shift;
            const sx2  = gx + shift * -shiftDir, rw2 = gw - shift;
            if (rw1 > 0) gr.FillSolidRect(Math.max(sx1, gx), gy, rw1, gh, GdiUtils.setAlpha(col1, Math.floor(intensity * 70)));
            gr.FillSolidRect(gx, gy, gw, gh, GdiUtils.setAlpha(PanelArtController.GLITCH_CHROMA, 5));
            if (rw2 > 0) gr.FillSolidRect(Math.max(sx2, gx), gy, rw2, gh, GdiUtils.setAlpha(col2, Math.floor(intensity * 70)));
        }

        const numSlices = Math.floor(intensity * 7) + 2;
        for (let i = 0; i < numSlices; i++) {
            const sy = gy + Math.floor(Math.random() * gh);
            const sh = Math.floor(Math.random() * this.scale(16)) + 2;
            const ms = Math.floor(gw * 0.12);
            let sx   = gx + (Math.floor(Math.random() * ms * 2) - ms);
            let dw   = gw;
            if (sx < gx) { dw -= (gx - sx); sx = gx; }
            if (sx + dw > gx + gw) dw = gx + gw - sx;
            if (dw > 0) {
                const col = PanelArtController.GLITCH_SLICE_COLORS[Math.floor(Math.random() * PanelArtController.GLITCH_SLICE_COLORS.length)];
                gr.FillSolidRect(sx, sy, dw, sh, GdiUtils.setAlpha(col, 130));
            }
        }

        const numBlocks = Math.floor(intensity * 32) + 2;
        for (let i = 0; i < numBlocks; i++) {
            const bh = Math.floor(Math.random() * gh * 0.06) + 2;
            const bw = Math.floor(Math.random() * gw * 0.12) + 4;
            const maxSpanY = Math.max(0, gh - bh);
            const maxSpanX = Math.max(0, gw - bw);
            const by = gy + (maxSpanY > 0 ? Math.floor(Math.random() * maxSpanY) : 0);
            const bx = gx + (maxSpanX > 0 ? Math.floor(Math.random() * maxSpanX) : 0);
            const col = PanelArtController.GLITCH_BLOCK_COLORS[Math.floor(Math.random() * PanelArtController.GLITCH_BLOCK_COLORS.length)];
            const r = Math.floor(((col >>> 16) & 0xFF) * 0.90);
            const g = Math.floor(((col >>>  8) & 0xFF) * 0.90);
            const b = Math.floor((col & 255) * 0.90);
            gr.FillSolidRect(bx, by, bw, bh, GdiUtils.RGB(r, g, b));
        }

        const numInterference = Math.floor(intensity * 12) + 4;
        for (let i = 0; i < numInterference; i++) {
            const iy = gy + Math.floor(Math.random() * gh);
            const ih = Math.floor(Math.random() * 2) + 1;
            const col = PanelArtController.GLITCH_TINT_COLORS[Math.floor(Math.random() * PanelArtController.GLITCH_TINT_COLORS.length)];
            gr.FillSolidRect(gx, iy, gw, ih, GdiUtils.setAlpha(col, Math.floor(Math.random() * 60) + 40));
        }
    }

    #getSafeHandle(metadb) {
        if (metadb) {
            try { if (metadb.Path) return metadb; } catch {}
        }
        if (fb.IsPlaying) {
            try { const h = fb.GetNowPlaying(); if (h?.Path) return h; } catch {}
        }
        try { const s = fb.GetSelection(); if (s?.Path) return s; } catch {}
        return null;
    }

    #getSafeUIColour() {
        try {
            return window.InstanceType === 1 ? window.GetColourDUI(1) : window.GetColourCUI(3);
        } catch {
            return GdiUtils.RGB(32, 32, 32);
        }
    }

    // ========================================================================================
    // SLIDESHOW & DISPLAY MODES (TRUE ZERO-IDLE & ASYNC DECODING)
    // ========================================================================================
    startImageMode(interactive = true) {
        this.stopSlideMode(false);
        const thisToken = ++this.#artGenerationToken;
        let images = this.#scanner.getFolderImagesList(this.resolveProfileFolder(this.config.imageFolder));

        if (!images.length) {
            if (interactive) {
                const f = GdiUtils.prompt('No images found in image folder. Enter a valid path:', 'Set Image Folder', this.config.imageFolder);
                if (f) {
                    const cleaned = GdiUtils.sanitizePath(f);
                    const resolved = this.resolveProfileFolder(cleaned);
                    if (resolved && utils.IsDirectory(resolved)) {
                        this.config.imageFolder = cleaned;
                        this.saveAll();
                        images = this.#scanner.getFolderImagesList(resolved);
                    }
                }
            }
            if (!images.length) {
                this.config.imageMode = false;
                this.requestSave();
                if (fb.IsPlaying) this.loadArtworkForTrack(fb.GetNowPlaying());
                else this.clearTrackDisplay();
                return;
            }
        }

        const pick = images[Math.floor(Math.random() * images.length)];
        this.config.imageMode = true;
        this.requestSave();

        this.#imgLoader.load(pick.path).then((img) => {
            if (this.#lifecycle !== PanelArtController.LIFECYCLE.LIVE || thisToken !== this.#artGenerationToken || !this.config.imageMode) {
                if (img) { try { img.Dispose(); } catch {} }
                return;
            }
            if (this.#modeImg) { try { this.#modeImg.Dispose(); } catch {} this.#modeImg = null; }
            if (img) {
                this.#modeImg = img;
                window.Repaint();
            } else {
                this.stopImageMode(true);
            }
        });
    }

    stopImageMode(restoreTrack = true) {
        this.#artGenerationToken++;
        this.config.imageMode = false;
        if (this.#modeImg) { try { this.#modeImg.Dispose(); } catch {} this.#modeImg = null; }
        this.requestSave();

        if (restoreTrack && fb.IsPlaying) {
            this.loadArtworkForTrack(fb.GetNowPlaying());
        } else {
            window.Repaint();
        }
    }

    #pickNextSlide() {
        if (this.#lifecycle !== PanelArtController.LIFECYCLE.LIVE || !this.config.slideMode) return;
        if (!window.IsVisible) {
            this.#slideWasHidden = true;
            this.#stopSlideTimerOnly();
            return;
        }

        const expectedToken = this.#artGenerationToken;

        if (!this.#slideImages || !this.#slideImages.length) {
            this.#slideImages = this.#scanner.getFolderImagesList(this.resolveProfileFolder(this.config.imageFolder));
        }
        if (!this.#slideImages.length) {
            this.stopSlideMode(true);
            return;
        }

        const pick = this.#slideImages[Math.floor(Math.random() * this.#slideImages.length)];
        this.#imgLoader.load(pick.path).then((img) => {
            if (this.#lifecycle !== PanelArtController.LIFECYCLE.LIVE || expectedToken !== this.#artGenerationToken || !this.config.slideMode) {
                if (img) { try { img.Dispose(); } catch {} }
                return;
            }
            if (this.#modeImg) { try { this.#modeImg.Dispose(); } catch {} this.#modeImg = null; }
            if (img) {
                this.#modeImg = img;
                window.Repaint();
            } else {
                this.stopSlideMode(true);
            }
        });
    }

    #stopSlideTimerOnly() {
        if (this.#slideTimer) {
            window.ClearInterval(this.#slideTimer);
            this.#slideTimer = null;
        }
    }

    #startSlideInterval() {
        this.#stopSlideTimerOnly();
        if (!this.config.slideMode || this.#lifecycle !== PanelArtController.LIFECYCLE.LIVE) return;
        if (!window.IsVisible) {
            this.#slideWasHidden = true;
            return;
        }
        this.#slideWasHidden = false;
        this.#slideTimer = window.SetInterval(() => {
            if (this.#lifecycle !== PanelArtController.LIFECYCLE.LIVE || !this.config.slideMode) {
                this.#stopSlideTimerOnly();
                return;
            }
            if (!window.IsVisible) {
                this.#slideWasHidden = true;
                this.#stopSlideTimerOnly();
                return;
            }
            this.#pickNextSlide();
        }, 12000);
    }

    startSlideMode(interactive = true) {
        this.stopImageMode(false);
        ++this.#artGenerationToken;
        this.#slideImages = this.#scanner.getFolderImagesList(this.resolveProfileFolder(this.config.imageFolder));

        if (!this.#slideImages.length) {
            if (interactive) {
                const f = GdiUtils.prompt('No images found in image folder. Enter a valid path:', 'Set Image Folder', this.config.imageFolder);
                if (f) {
                    const cleaned = GdiUtils.sanitizePath(f);
                    const resolved = this.resolveProfileFolder(cleaned);
                    if (resolved && utils.IsDirectory(resolved)) {
                        this.config.imageFolder = cleaned;
                        this.saveAll();
                        this.#slideImages = this.#scanner.getFolderImagesList(resolved);
                    }
                }
            }
            if (!this.#slideImages.length) {
                this.config.slideMode = false;
                this.requestSave();
                if (fb.IsPlaying) this.loadArtworkForTrack(fb.GetNowPlaying());
                else this.clearTrackDisplay();
                return;
            }
        }

        this.config.slideMode = true;
        this.requestSave();
        this.#pickNextSlide();
        this.#startSlideInterval();
        window.Repaint();
    }

    stopSlideMode(restoreTrack = true) {
        this.#artGenerationToken++;
        this.#stopSlideTimerOnly();
        this.#slideWasHidden = false;
        this.config.slideMode = false;
        this.#slideImages = null;
        if (this.#modeImg) { try { this.#modeImg.Dispose(); } catch {} this.#modeImg = null; }
        this.requestSave();

        if (restoreTrack && fb.IsPlaying) {
            this.loadArtworkForTrack(fb.GetNowPlaying());
        } else {
            window.Repaint();
        }
    }

    // ========================================================================================
    // PAINT PIPELINE & PRE-BAKED COMPOSITE TYPOGRAPHY
    // ========================================================================================
    onPaint(gr) {
        if (this.#lifecycle !== PanelArtController.LIFECYCLE.LIVE) return;
        const w = window.Width, h = window.Height;
        if (!gr || w <= 0 || h <= 0) return;

        // Wake up slide timer if restoring from hidden/minimized state
        if (this.#slideWasHidden && this.config.slideMode) {
            this.#slideWasHidden = false;
            this.#startSlideInterval();
            if (!this.#modeImg) {
                window.SetTimeout(() => this.#pickNextSlide(), 0);
            }
        }

        if (this.config.imageMode || this.config.slideMode) {
            const pad = this.scale(this.config.borderSize) + this.scale(3);
            const dw = Math.max(10, w - pad * 2);
            const dh = Math.max(10, h - pad * 2);

            gr.FillSolidRect(0, 0, w, h, GdiUtils.RGB(5, 5, 5));
            if (this.#modeImg && this.#modeImg.Width > 0 && this.#modeImg.Height > 0) {
                gr.SetInterpolationMode(2);
                gr.DrawImage(this.#modeImg, pad, pad, dw, dh, 0, 0, this.#modeImg.Width, this.#modeImg.Height);
            }

            if (!this.#backdrop.overlayBmp || (this.#dirtyFlags & PanelArtController.DIRTY.OVERLAY) ||
                (this.#backdrop.overlayBmp.Width !== w || this.#backdrop.overlayBmp.Height !== h)) {
                this.#rebuildOverlay();
            }
            if (this.#backdrop.overlayBmp) gr.DrawImage(this.#backdrop.overlayBmp, 0, 0, w, h, 0, 0, this.#backdrop.overlayBmp.Width, this.#backdrop.overlayBmp.Height);

            if (this.#opacityTarget) {
                this.#drawSliderHud(gr, w, h);
            } else if (this.#bezelNotifyText) {
                this.#drawBezelToast(gr, w, h);
            }
            return;
        }

        // Layer 1: Background
        if (this.#glitchBlackout) {
            gr.FillSolidRect(0, 0, w, h, GdiUtils.RGB(6, 6, 8));
        } else {
            if (!this.#backdrop.cacheBmp || (this.#dirtyFlags & PanelArtController.DIRTY.BACKGROUND) ||
                (this.#backdrop.cacheBmp.Width !== w || this.#backdrop.cacheBmp.Height !== h)) {
                this.#rebuildBackground();
            }
            if (this.#backdrop.cacheBmp) {
                gr.DrawImage(this.#backdrop.cacheBmp, 0, 0, w, h, 0, 0, this.#backdrop.cacheBmp.Width, this.#backdrop.cacheBmp.Height);
            } else {
                gr.FillSolidRect(0, 0, w, h, this.config.customBgColor >>> 0);
            }
        }

        if (this.#dirtyFlags & PanelArtController.DIRTY.LAYOUT) {
            this.#updateLayout(gr, w, h);
        } else if (this.#dirtyFlags & PanelArtController.DIRTY.TEXT) {
            this.#bakeTypographyPlate(gr);
        }

        // Layer 2: Cover Art (1:1 blit from pre-scaled bitmap)
        if (this.#coverImg && this.config.albumArtEnabled && this.#layout.artRect.w > 0) {
            const ar = this.#layout.artRect;
            const drawBmp = this.#ensureScaledCover(ar) || this.#coverImg;
            const srcW = drawBmp.Width;
            const srcH = drawBmp.Height;

            if (this.#glitchBlackout) {
                const sliceCount = 5;
                const sliceH = Math.max(6, Math.floor(ar.h / sliceCount));
                const maxJitter = Math.round((this.#glitchFrame - 0.5) * 36);

                for (let sy = 0; sy < ar.h; sy += sliceH) {
                    const curH = Math.min(sliceH, ar.h - sy);
                    const dx = ((Math.floor(sy / sliceH) % 2 === 0) ? maxJitter : -maxJitter);
                    const srcSy = Math.min(srcH - 1, Math.floor((sy / ar.h) * srcH));
                    const srcSh = Math.max(1, Math.min(srcH - srcSy, Math.floor((curH / ar.h) * srcH)));
                    gr.DrawImage(drawBmp, ar.x + dx, ar.y + sy, ar.w, curH, 0, srcSy, srcW, srcSh);
                }
            } else {
                if (this.config.showGlow && this.config.opGlow > 0 && !this.config.overlayAllOff && this.#backdrop.glowBmp) {
                    const gx = Math.floor(ar.x + (ar.w - this.#backdrop.glowSize) / 2);
                    const gy = Math.floor(ar.y + (ar.h - this.#backdrop.glowSize) / 2);
                    gr.DrawImage(this.#backdrop.glowBmp, gx, gy, this.#backdrop.glowSize, this.#backdrop.glowSize, 0, 0, this.#backdrop.glowBmp.Width, this.#backdrop.glowBmp.Height);
                }
                if (drawBmp === this.#coverImg) gr.SetInterpolationMode(2);

                if (this.#glitchFrame > 0 && this.config.glitchEnabled) {
                    const jx = Math.round((Math.random() - 0.5) * 8);
                    const jy = Math.round((Math.random() - 0.5) * 4);
                    gr.DrawImage(drawBmp, ar.x + jx, ar.y + jy, ar.w, ar.h, 0, 0, srcW, srcH);
                } else {
                    gr.DrawImage(drawBmp, ar.x, ar.y, ar.w, ar.h, 0, 0, srcW, srcH);
                }
            }
        }

        // Layer 3: Typography
        if (!this.#glitchBlackout && this.#textBlockBmp && this.#textBlockW > 0 && this.#textBlockH > 0) {
            let tx = this.#textBlockX;
            let ty = this.#textBlockY;
            if (this.#glitchFrame > 0 && this.config.glitchEnabled) {
                tx += Math.round((Math.random() - 0.5) * 10);
                ty += Math.round((Math.random() - 0.5) * 4);
            }
            gr.DrawImage(this.#textBlockBmp, tx, ty, this.#textBlockW, this.#textBlockH, 0, 0, this.#textBlockW, this.#textBlockH);
        }

        // Layer 4: CRT Glitch Noise Shader
        if (this.#glitchFrame > 0 && this.config.glitchEnabled) {
            this.#drawGlitch(gr, w, h, this.#glitchFrame);
        }

        // Layer 5: Overlays & CRT Masks
        if (!this.#backdrop.overlayBmp || (this.#dirtyFlags & PanelArtController.DIRTY.OVERLAY) ||
            (this.#backdrop.overlayBmp.Width !== w || this.#backdrop.overlayBmp.Height !== h)) {
            this.#rebuildOverlay();
        }
        if (this.#backdrop.overlayBmp) gr.DrawImage(this.#backdrop.overlayBmp, 0, 0, w, h, 0, 0, this.#backdrop.overlayBmp.Width, this.#backdrop.overlayBmp.Height);

        // Layer 6: HUD Slider & Toasts
        if (this.#opacityTarget) {
            this.#drawSliderHud(gr, w, h);
        } else if (this.#bezelNotifyText) {
            this.#drawBezelToast(gr, w, h);
        }
    }

    #updateLayout(gr, w, h) {
        const b = this.scale(this.config.borderSize);
        const pad = this.scale(this.config.albumArtPadding);
        const inL = b + pad + this.scale(this.config.padLeft);
        const inR = b + pad + this.scale(this.config.padRight);
        const inT = b + pad + this.scale(this.config.padTop);
        const inB = b + pad + this.scale(this.config.padBottom);
        const contentW = Math.max(10, w - inL - inR);
        const contentH = Math.max(10, h - inT - inB);

        let artRect = { x: 0, y: 0, w: 0, h: 0 };
        let textRect = { x: inL + 8, y: inT + 8, w: Math.max(10, contentW - 16), h: Math.max(10, contentH - 16) };

        if (this.#coverImg && this.config.albumArtEnabled) {
            const flt = this.config.albumArtFloat;
            if (flt === 'left' || flt === 'right') {
                const maxW = Math.max(10, Math.floor(contentW * 0.65) - pad);
                const maxH = Math.max(10, contentH - pad * 2);
                const scale = Math.min(maxW / this.#coverImg.Width, maxH / this.#coverImg.Height);
                const drawW = Math.max(1, Math.floor(this.#coverImg.Width * scale));
                const drawH = Math.max(1, Math.floor(this.#coverImg.Height * scale));
                const drawY = inT + Math.floor((contentH - drawH) / 2);
                const drawX = flt === 'left' ? inL + pad : Math.max(inL, w - inR - pad - drawW);

                artRect = { x: drawX, y: drawY, w: drawW, h: drawH };
                textRect.x = flt === 'left' ? drawX + drawW + pad : inL + 8;
                textRect.w = flt === 'left' ? Math.max(10, w - inR - textRect.x - 8) : Math.max(10, drawX - pad - textRect.x);
            } else if (flt === 'top' || flt === 'bottom') {
                const artRatio = this.config.extraInfoEnabled ? 0.60 : 0.68;
                const maxH = Math.max(10, Math.floor(contentH * artRatio) - Math.floor(pad * 1.5));
                const maxW = Math.max(10, contentW - pad * 2);
                const scale = Math.min(maxW / this.#coverImg.Width, maxH / this.#coverImg.Height);
                const drawW = Math.max(1, Math.floor(this.#coverImg.Width * scale));
                const drawH = Math.max(1, Math.floor(this.#coverImg.Height * scale));
                const drawX = inL + Math.floor((contentW - drawW) / 2);
                const drawY = flt === 'top' ? inT + pad : Math.max(inT, h - inB - pad - drawH);

                artRect = { x: drawX, y: drawY, w: drawW, h: drawH };
                textRect.y = flt === 'top' ? drawY + drawH + Math.floor(pad * 0.5) : inT + 8;
                textRect.h = flt === 'top' ? Math.max(10, h - inB - textRect.y - 4) : Math.max(10, drawY - Math.floor(pad * 0.5) - textRect.y);
            } else if (flt === 'stretch') {
                artRect = { 
                    x: inL + pad, 
                    y: inT + pad, 
                    w: Math.max(10, contentW - pad * 2), 
                    h: Math.max(10, contentH - pad * 2) 
                };
                textRect = { 
                    x: inL + 8, 
                    y: inT + 8, 
                    w: Math.max(10, contentW - 16), 
                    h: Math.max(10, contentH - 16) 
                };
            }
        }

        if (artRect.w > 0 && this.config.showGlow && this.config.opGlow > 0 && !this.config.overlayAllOff) {
            this.#backdrop.checkGlow(artRect.w, artRect.h, this.config.showGlow, this.config.opGlow, this.config.overlayAllOff);
        } else {
            this.#backdrop.checkGlow(0, 0, false, 0, true);
        }

        this.#layout.artRect = artRect;
        this.#ensureScaledCover(artRect);

        this.#textBlockX = textRect.x;
        this.#textBlockY = textRect.y;
        this.#textBlockW = textRect.w;
        this.#textBlockH = textRect.h;

        this.#bakeTypographyPlate(gr);
        this.#dirtyFlags &= ~PanelArtController.DIRTY.LAYOUT;
    }

    #bakeTypographyPlate(gr) {
        this.#disposeTextBlock();
        const rw = this.#textBlockW;
        const rh = this.#textBlockH;
        if (!gr || rw <= 20 || rh <= 20) {
            this.#dirtyFlags &= ~PanelArtController.DIRTY.TEXT;
            return;
        }

        const hasArtist = Boolean(this.#trackInfo.artist && this.#trackInfo.artist.trim());
        const hasExtra  = Boolean(this.config.extraInfoEnabled && this.#trackInfo.extra && this.#trackInfo.extra.trim());

        let titleBudgetH, artistBudgetH, extraBudgetH;
        if (hasArtist && hasExtra) {
            titleBudgetH  = Math.floor(rh * 0.38);
            artistBudgetH = Math.floor(rh * 0.28);
            extraBudgetH  = Math.floor(rh * 0.22);
        } else if (hasArtist || hasExtra) {
            titleBudgetH  = Math.floor(rh * 0.52);
            artistBudgetH = Math.floor(rh * 0.36);
            extraBudgetH  = Math.floor(rh * 0.36);
        } else {
            titleBudgetH  = Math.floor(rh * 0.82);
            artistBudgetH = 0;
            extraBudgetH  = 0;
        }

        let titleFitSize  = this.#fonts.fitSize(gr, this.#trackInfo.title, this.config.titleFontName, 1, rw, titleBudgetH, this.scale(this.config.titleFontSize), this.scale(12));
        let artistFitSize = hasArtist ? this.#fonts.fitSize(gr, this.#trackInfo.artist, this.config.artistFontName, 0, rw, artistBudgetH, this.scale(this.config.artistFontSize), this.scale(10)) : 0;
        let extraFitSize  = hasExtra  ? this.#fonts.fitSize(gr, this.#trackInfo.extra, this.config.extraFontName, 0, rw, extraBudgetH, this.scale(this.config.extraFontSize), this.scale(8)) : 0;

        let fTitle  = this.#fonts.get(this.config.titleFontName, titleFitSize, 1);
        let fArtist = hasArtist ? this.#fonts.get(this.config.artistFontName, artistFitSize, 0) : null;
        let fExtra  = hasExtra  ? this.#fonts.get(this.config.extraFontName, extraFitSize, 0) : null;

        let mTitle  = gr.MeasureString(this.#trackInfo.title, fTitle, 0, 0, 10000, 10000);
        let mArtist = (hasArtist && fArtist) ? gr.MeasureString(this.#trackInfo.artist, fArtist, 0, 0, 10000, 10000) : { Width: 0, Height: 0 };
        let mExtra  = (hasExtra && fExtra)   ? gr.MeasureString(this.#trackInfo.extra, fExtra, 0, 0, 10000, 10000)   : { Width: 0, Height: 0 };

        const gap1 = hasArtist ? this.scale(4) : 0;
        const gap2 = hasExtra  ? this.scale(5) : 0;
        let totalH = mTitle.Height + gap1 + mArtist.Height + gap2 + mExtra.Height;

        const maxAllowedH = rh - this.scale(4);
        if (totalH > maxAllowedH && totalH > 0) {
            const scaleDown = Math.max(0.55, maxAllowedH / totalH);
            titleFitSize  = Math.max(this.scale(10), Math.floor(titleFitSize * scaleDown));
            if (hasArtist) artistFitSize = Math.max(this.scale(9), Math.floor(artistFitSize * scaleDown));
            if (hasExtra)  extraFitSize  = Math.max(this.scale(8), Math.floor(extraFitSize * scaleDown));

            fTitle  = this.#fonts.get(this.config.titleFontName, titleFitSize, 1);
            fArtist = hasArtist ? this.#fonts.get(this.config.artistFontName, artistFitSize, 0) : null;
            fExtra  = hasExtra  ? this.#fonts.get(this.config.extraFontName, extraFitSize, 0) : null;

            mTitle  = gr.MeasureString(this.#trackInfo.title, fTitle, 0, 0, 10000, 10000);
            mArtist = (hasArtist && fArtist) ? gr.MeasureString(this.#trackInfo.artist, fArtist, 0, 0, 10000, 10000) : { Width: 0, Height: 0 };
            mExtra  = (hasExtra && fExtra)   ? gr.MeasureString(this.#trackInfo.extra, fExtra, 0, 0, 10000, 10000)   : { Width: 0, Height: 0 };
            totalH  = mTitle.Height + gap1 + mArtist.Height + gap2 + mExtra.Height;
        }

        let startRelY = 0;
        if (this.config.layoutAlignV === 0) {
            startRelY = Math.max(0, Math.floor((rh - totalH) / 2));
        } else if (this.config.layoutAlignV === 1) {
            startRelY = Math.max(0, rh - totalH - this.scale(2));
        } else {
            startRelY = this.scale(2);
        }

        if (startRelY + totalH > rh) {
            startRelY = Math.max(0, rh - totalH);
        }

        const getAlignedRelX = (wVal) => {
            if (this.config.layoutAlignH === 1) return Math.max(0, Math.floor((rw - wVal) / 2));
            if (this.config.layoutAlignH === 2) return Math.max(0, rw - wVal - 2);
            return 0;
        };

        const shOff = Math.max(1, this.scale(2));

        let bmp = null, g = null;
        try {
            bmp = gdi.CreateImage(rw, rh);
            g = bmp.GetGraphics();
            g.SetTextRenderingHint(4);

            let curY = startRelY;

            if (this.#trackInfo.title && fTitle) {
                const rx = getAlignedRelX(mTitle.Width);
                if (this.config.textShadowEnabled) {
                    g.DrawString(this.#trackInfo.title, fTitle, GdiUtils.setAlpha(GdiUtils.RGB(0, 0, 0), 160), rx + shOff, curY + shOff, mTitle.Width + 4, mTitle.Height + 4);
                }
                g.DrawString(this.#trackInfo.title, fTitle, GdiUtils.RGB(255, 255, 255), rx, curY, mTitle.Width + 4, mTitle.Height + 4);
                curY += mTitle.Height + gap1;
            }

            if (hasArtist && fArtist) {
                const rx = getAlignedRelX(mArtist.Width);
                if (this.config.textShadowEnabled) {
                    g.DrawString(this.#trackInfo.artist, fArtist, GdiUtils.setAlpha(GdiUtils.RGB(0, 0, 0), 160), rx + shOff, curY + shOff, mArtist.Width + 4, mArtist.Height + 4);
                }
                g.DrawString(this.#trackInfo.artist, fArtist, GdiUtils.RGB(200, 200, 200), rx, curY, mArtist.Width + 4, mArtist.Height + 4);
                curY += mArtist.Height + gap2;
            }

            if (hasExtra && fExtra) {
                const rx = getAlignedRelX(mExtra.Width);
                const drawH = Math.max(mExtra.Height + 4, rh - curY);
                if (this.config.textShadowEnabled) {
                    g.DrawString(this.#trackInfo.extra, fExtra, GdiUtils.setAlpha(GdiUtils.RGB(0, 0, 0), 160), rx + shOff, curY + shOff, mExtra.Width + 4, drawH);
                }
                g.DrawString(this.#trackInfo.extra, fExtra, GdiUtils.RGB(170, 170, 170), rx, curY, mExtra.Width + 4, drawH);
            }

            bmp.ReleaseGraphics(g);
            g = null;
            this.#textBlockBmp = bmp;
        } catch {
            if (g && bmp) { try { bmp.ReleaseGraphics(g); } catch {} }
            if (bmp) { try { bmp.Dispose(); } catch {} }
            this.#textBlockBmp = null;
        }
        this.#dirtyFlags &= ~PanelArtController.DIRTY.TEXT;
    }

    #drawSliderHud(gr, w, h) {
        const barW = Math.min(this.scale(220), Math.round(w * 0.6));
        const barH = Math.max(4, this.scale(6));
        const bx = Math.floor((w - barW) / 2);
        const by = h - Math.max(16, this.scale(24));
        const font = this.getHudFont();
        const val = this.getOpacity(this.#opacityTarget);
        const max = this.#opacityTarget === 'Padding' ? 100 : 255;
        const label = `${this.#opacityTarget}: ${val}${this.#opacityTarget === 'Padding' ? 'px' : ''}`;
        const lH = Math.max(16, this.scale(20));

        gr.FillSolidRect(bx, by, barW, barH, GdiUtils.setAlpha(GdiUtils.RGB(255, 255, 255), 60));
        gr.FillSolidRect(bx, by, Math.floor(barW * (val / max)), barH, GdiUtils.setAlpha(GdiUtils.RGB(255, 255, 255), 180));
        gr.DrawString(label, font, GdiUtils.setAlpha(GdiUtils.RGB(255, 255, 255), 230), 0, by - lH - 2, w, lH, 0x11000000);
    }

    #drawBezelToast(gr, w, h) {
        const font = this.getHudFont();
        const text = `Bezel: ${this.#bezelNotifyText}`;
        const boxH = Math.max(20, this.scale(24));
        const boxW = Math.min(w - this.scale(20), Math.max(this.scale(130), text.length * this.scale(7) + this.scale(24)));
        const bx = Math.floor((w - boxW) / 2);
        const by = h - Math.max(24, this.scale(32));
        gr.FillSolidRect(bx, by, boxW, boxH, GdiUtils.setAlpha(GdiUtils.RGB(0, 0, 0), 190));
        gr.DrawString(text, font, GdiUtils.setAlpha(GdiUtils.RGB(255, 255, 255), 240), bx, by, boxW, boxH, 0x11000000);
    }

    // ========================================================================================
    // CONTEXT MENU (DECLARATIVE MENU BUILDER)
    // ========================================================================================
    showContextMenu(x, y) {
        if (this.#opacityTarget) {
            this.#opacityTarget = null;
            window.Repaint();
        }

        const cfg = this.config;
        const m = new MenuBuilder();
        const bezelNames = this.listBezelNames();

        const reloadTrackOrDisplay = () => {
            this.#scanner.clearCaches();
            this.#currentArtKey = '';
            if (fb.IsPlaying) this.loadArtworkForTrack(fb.GetNowPlaying());
            else this.clearTrackDisplay();
        };

        // 1. Bezel / Overlay
        m.addSubMenu('Bezel / Overlay', (bezelM) => {
            bezelM.addItem('Enable Bezel Frame', () => {
                cfg.bezelEnabled = !cfg.bezelEnabled;
                if (cfg.bezelEnabled && !cfg.bezelFile && bezelNames.length > 0) {
                    cfg.bezelFile = bezelNames[0];
                }
                this.loadBezel();
                this.#dirtyFlags |= PanelArtController.DIRTY.OVERLAY;
                this.#rebuildOverlay();
            }, { checked: Boolean(cfg.bezelEnabled && cfg.bezelFile) });

            bezelM.addSeparator();
            const curClean = (cfg.bezelFile || '').toLowerCase().replace(/\.[^/.]+$/, '');
            const selIdx = (cfg.bezelEnabled && curClean)
                ? bezelNames.findIndex(n => n.toLowerCase() === curClean)
                : -1;

            bezelM.addItem('None (No Bezel)', () => {
                cfg.bezelEnabled = false;
                cfg.bezelFile = '';
                this.loadBezel();
                this.#dirtyFlags |= PanelArtController.DIRTY.OVERLAY;
                this.#rebuildOverlay();
            }, { radio: selIdx === -1 });

            bezelNames.forEach((name, bi) => {
                const shortName = name.length > 42 ? `...${name.substring(name.length - 39)}` : name;
                bezelM.addItem(GdiUtils.escapeMenuLabel(shortName), () => {
                    cfg.bezelEnabled = true;
                    cfg.bezelFile = name;
                    this.loadBezel();
                    this.#dirtyFlags |= PanelArtController.DIRTY.OVERLAY;
                    this.#rebuildOverlay();
                }, { radio: selIdx === bi });
            });

            bezelM.addSeparator();
            bezelM.addItem('Set Bezel Folder...', () => {
                const f = GdiUtils.prompt('Enter folder path containing bezel/overlay images:', 'Set Bezel Folder', cfg.bezelFolder);
                if (f) {
                    const cleaned = GdiUtils.sanitizePath(f);
                    if (cleaned && utils.IsDirectory(cleaned)) {
                        cfg.bezelFolder = cleaned;
                        this.#cachedBezelImages = null;
                        this.loadBezel();
                        this.#dirtyFlags |= PanelArtController.DIRTY.OVERLAY;
                        this.#rebuildOverlay();
                        this.saveAll();
                    }
                }
            });
            bezelM.addItem('Reload Bezel List', () => {
                this.#cachedBezelImages = null;
                this.loadBezel();
                this.#dirtyFlags |= PanelArtController.DIRTY.OVERLAY;
                this.#rebuildOverlay();
                this.saveAll();
            });
        });

        m.addSeparator();

        // 2. Overlay Effects
        m.addSubMenu('Overlay Effects', (overlayM) => {
            overlayM.addSubMenu('Phosphor Palette', (phosphorM) => {
                PanelArtController.PHOSPHOR_THEMES.forEach((pt, i) => {
                    phosphorM.addItem(pt.name, () => {
                        cfg.phosphorTheme = i;
                        this.#dirtyFlags |= PanelArtController.DIRTY.OVERLAY;
                        this.#rebuildOverlay();
                    }, { radio: cfg.phosphorTheme === i });
                });
                phosphorM.addSeparator();
                phosphorM.addItem('Custom Color...', () => {
                    const prevCol = cfg.customPhosphorColor >>> 0;
                    const c = utils.ColourPicker(window.ID, prevCol);
                    const newCol = (c | 0xFF000000) >>> 0;
                    if (c !== -1 && newCol !== prevCol) {
                        cfg.customPhosphorColor = newCol;
                        cfg.phosphorTheme = PanelArtController.PHOSPHOR_THEMES.length;
                        this.#dirtyFlags |= PanelArtController.DIRTY.OVERLAY;
                        this.#rebuildOverlay();
                    }
                }, { radio: cfg.phosphorTheme === PanelArtController.PHOSPHOR_THEMES.length });
            });

            overlayM.addSeparator();
            overlayM.addItem('Disable All Overlays', () => {
                cfg.overlayAllOff = !cfg.overlayAllOff;
                this.#dirtyFlags |= PanelArtController.DIRTY.OVERLAY;
                this.#rebuildOverlay();
            }, { checked: cfg.overlayAllOff });
            overlayM.addSeparator();

            overlayM.addItem('Reflection Highlight', () => {
                cfg.showReflection = !cfg.showReflection;
                this.#dirtyFlags |= PanelArtController.DIRTY.OVERLAY;
                this.#rebuildOverlay();
            }, { checked: cfg.showReflection });
            overlayM.addItem('CRT Outer Glow', () => {
                cfg.showGlow = !cfg.showGlow;
                if (this.#layout.artRect.w > 0) {
                    this.#backdrop.checkGlow(this.#layout.artRect.w, this.#layout.artRect.h, cfg.showGlow, cfg.opGlow, cfg.overlayAllOff);
                }
            }, { checked: cfg.showGlow });
            overlayM.addItem('CRT Scanlines', () => {
                cfg.showScanlines = !cfg.showScanlines;
                this.#dirtyFlags |= PanelArtController.DIRTY.OVERLAY;
                this.#rebuildOverlay();
            }, { checked: cfg.showScanlines });
            overlayM.addItem('Phosphor Mask', () => {
                cfg.showPhosphor = !cfg.showPhosphor;
                this.#dirtyFlags |= PanelArtController.DIRTY.OVERLAY;
                this.#rebuildOverlay();
            }, { checked: cfg.showPhosphor });

            overlayM.addSeparator();
            overlayM.addSubMenu('Adjust Opacities', (opacityM) => {
                opacityM.addItem(`Reflection Opacity... (${cfg.opReflection})`, () => this.setOpacityTarget('Reflection'));
                opacityM.addItem(`Glow Opacity... (${cfg.opGlow})`,             () => this.setOpacityTarget('Glow'));
                opacityM.addItem(`Scanlines Opacity... (${cfg.opScanlines})`,   () => this.setOpacityTarget('Scanlines'));
                opacityM.addItem(`Phosphor Opacity... (${cfg.opPhosphor})`,     () => this.setOpacityTarget('Phosphor'));
            });
        });

        // 3. Panel Layout & Art
        m.addSubMenu('Panel Layout & Art', (panelM) => {
            panelM.addSubMenu('Album Art', (artM) => {
                artM.addItem('Enable Album Art', () => {
                    cfg.albumArtEnabled = !cfg.albumArtEnabled;
                    this.#dirtyFlags |= PanelArtController.DIRTY.LAYOUT;
                }, { checked: cfg.albumArtEnabled });
                artM.addSeparator();
                artM.addSubMenu('Placement Float', (floatM) => {
                    PanelArtController.VALID_FLOATS.forEach((flt) => {
                        floatM.addItem(`Float: ${flt.toUpperCase()}`, () => {
                            cfg.albumArtFloat = flt;
                            this.#dirtyFlags |= PanelArtController.DIRTY.LAYOUT;
                        }, { radio: cfg.albumArtFloat === flt });
                    });
                });
                artM.addItem(`Art Padding... (${cfg.albumArtPadding}px)`, () => this.setOpacityTarget('Padding'));
            });

            panelM.addSubMenu('Text & Metadata', (textM) => {
                textM.addSubMenu('Horizontal Alignment', (alignHM) => {
                    ['Left', 'Center', 'Right'].forEach((lbl, i) => {
                        alignHM.addItem(lbl, () => {
                            cfg.layoutAlignH = i;
                            this.#dirtyFlags |= PanelArtController.DIRTY.TEXT;
                        }, { radio: cfg.layoutAlignH === i });
                    });
                });
                textM.addSubMenu('Vertical Alignment', (alignVM) => {
                    [[2, 'Top'], [0, 'Center'], [1, 'Bottom']].forEach(([val, lbl]) => {
                        alignVM.addItem(lbl, () => {
                            cfg.layoutAlignV = val;
                            this.#dirtyFlags |= PanelArtController.DIRTY.TEXT;
                        }, { radio: cfg.layoutAlignV === val });
                    });
                });
                textM.addSeparator();
                textM.addItem('Text Drop Shadow', () => {
                    cfg.textShadowEnabled = !cfg.textShadowEnabled;
                    this.#dirtyFlags |= PanelArtController.DIRTY.TEXT;
                }, { checked: cfg.textShadowEnabled });
                textM.addItem('Show Extra Info (Album/Date/Length)', () => {
                    cfg.extraInfoEnabled = !cfg.extraInfoEnabled;
                    this.#dirtyFlags |= (PanelArtController.DIRTY.LAYOUT | PanelArtController.DIRTY.TEXT);
                }, { checked: cfg.extraInfoEnabled });
                textM.addSeparator();
                textM.addSubMenu('Fonts', (fontM) => {
                    fontM.addItem(`Title Font... (${cfg.titleFontName}, ${cfg.titleFontSize}pt)`, () => {
                        const f = GdiUtils.prompt('Title Font Name:', 'Typography', cfg.titleFontName);
                        if (f === null) return;
                        if (f.trim()) { cfg.titleFontName = f.trim(); this.#dirtyFlags |= PanelArtController.DIRTY.TEXT; }
                        const s = GdiUtils.prompt('Title Font Size (pt):', 'Typography', cfg.titleFontSize);
                        if (s !== null && s.trim() !== '') {
                            const n = parseInt(s, 10);
                            if (!Number.isNaN(n)) {
                                cfg.titleFontSize = GdiUtils.clamp(n, 12, 100);
                                this.#dirtyFlags |= PanelArtController.DIRTY.TEXT;
                            }
                        }
                    });
                    fontM.addItem(`Artist Font... (${cfg.artistFontName}, ${cfg.artistFontSize}pt)`, () => {
                        const f = GdiUtils.prompt('Artist Font Name:', 'Typography', cfg.artistFontName);
                        if (f === null) return;
                        if (f.trim()) { cfg.artistFontName = f.trim(); this.#dirtyFlags |= PanelArtController.DIRTY.TEXT; }
                        const s = GdiUtils.prompt('Artist Font Size (pt):', 'Typography', cfg.artistFontSize);
                        if (s !== null && s.trim() !== '') {
                            const n = parseInt(s, 10);
                            if (!Number.isNaN(n)) {
                                cfg.artistFontSize = GdiUtils.clamp(n, 10, 80);
                                this.#dirtyFlags |= PanelArtController.DIRTY.TEXT;
                            }
                        }
                    });
                    fontM.addItem(`Extra Info Font... (${cfg.extraFontName}, ${cfg.extraFontSize}pt)`, () => {
                        const f = GdiUtils.prompt('Extra Info Font Name:', 'Typography', cfg.extraFontName);
                        if (f === null) return;
                        if (f.trim()) { cfg.extraFontName = f.trim(); this.#dirtyFlags |= PanelArtController.DIRTY.TEXT; }
                        const s = GdiUtils.prompt('Extra Font Size (pt):', 'Typography', cfg.extraFontSize);
                        if (s !== null && s.trim() !== '') {
                            const n = parseInt(s, 10);
                            if (!Number.isNaN(n)) {
                                cfg.extraFontSize = GdiUtils.clamp(n, 8, 60);
                                this.#dirtyFlags |= PanelArtController.DIRTY.TEXT;
                            }
                        }
                    });
                });
            });

            panelM.addSubMenu('Border & Padding', (borderM) => {
                borderM.addItem(`Set Border Size... (${cfg.borderSize}px)`, () => {
                    const val = GdiUtils.prompt('Enter border thickness (0-50 px):', 'Border Frame', cfg.borderSize);
                    if (val !== null && val.trim() !== '') {
                        const n = parseInt(val, 10);
                        if (!Number.isNaN(n)) {
                            cfg.borderSize = GdiUtils.clamp(n, 0, 50);
                            this.#dirtyFlags |= (PanelArtController.DIRTY.LAYOUT | PanelArtController.DIRTY.OVERLAY);
                            this.#rebuildOverlay();
                        }
                    }
                });
                borderM.addItem('Change Border Color...', () => {
                    const c = utils.ColourPicker(window.ID, cfg.borderColor);
                    if (c !== -1) {
                        cfg.borderColor = (c | 0xFF000000) >>> 0;
                        this.#dirtyFlags |= PanelArtController.DIRTY.OVERLAY;
                        this.#rebuildOverlay();
                    }
                });
                borderM.addSeparator();
                const promptPad = (label, key) => {
                    const val = GdiUtils.prompt(`Enter ${label.toLowerCase()} padding (0-100 px):`, `${label} Padding`, cfg[key]);
                    if (val !== null && val.trim() !== '') {
                        const n = parseInt(val, 10);
                        if (!Number.isNaN(n)) {
                            cfg[key] = GdiUtils.clamp(n, 0, 100);
                            this.#dirtyFlags |= PanelArtController.DIRTY.LAYOUT;
                        }
                    }
                };
                borderM.addItem(`Left Padding... (${cfg.padLeft}px)`,     () => promptPad('Left',   'padLeft'));
                borderM.addItem(`Right Padding... (${cfg.padRight}px)`,   () => promptPad('Right',  'padRight'));
                borderM.addItem(`Top Padding... (${cfg.padTop}px)`,       () => promptPad('Top',    'padTop'));
                borderM.addItem(`Bottom Padding... (${cfg.padBottom}px)`, () => promptPad('Bottom', 'padBottom'));
            });

            panelM.addSubMenu('Background', (bgM) => {
                bgM.addItem('Use UI Color', () => {
                    cfg.bgUseUIColor = !cfg.bgUseUIColor;
                    this.#dirtyFlags |= PanelArtController.DIRTY.BACKGROUND;
                    this.#rebuildBackground();
                }, { checked: cfg.bgUseUIColor });
                bgM.addItem('Enable Background Art', () => {
                    cfg.backgroundEnabled = !cfg.backgroundEnabled;
                    this.#dirtyFlags |= PanelArtController.DIRTY.BACKGROUND;
                    this.#rebuildBackground();
                }, { checked: cfg.backgroundEnabled });
                bgM.addItem('Enable Blurred Backdrop', () => {
                    cfg.blurEnabled = !cfg.blurEnabled;
                    this.#dirtyFlags |= PanelArtController.DIRTY.BACKGROUND;
                    this.#rebuildBackground();
                }, { checked: cfg.blurEnabled });
                bgM.addItem('Custom Background Color...', () => {
                    const c = utils.ColourPicker(window.ID, cfg.customBgColor);
                    if (c !== -1) {
                        cfg.customBgColor = (c | 0xFF000000) >>> 0;
                        this.#dirtyFlags |= PanelArtController.DIRTY.BACKGROUND;
                        this.#rebuildBackground();
                    }
                });
                bgM.addSeparator();
                bgM.addSubMenu('Blur Radius', (blurM) => {
                    [20, 60, 100, 140, 180, 220, 240, 254].forEach((rad) => {
                        blurM.addItem(`Blur Radius: ${rad}`, () => {
                            cfg.blurRadius = rad;
                            this.#dirtyFlags |= PanelArtController.DIRTY.BACKGROUND;
                            this.#rebuildBackground();
                        }, { radio: cfg.blurRadius === rad });
                    });
                });
                bgM.addSubMenu('Darken Backdrop', (darkenM) => {
                    [0, 10, 20, 30, 40, 50].forEach((pct) => {
                        darkenM.addItem(`Darken ${pct}%`, () => {
                            cfg.darkenValue = pct;
                            this.#dirtyFlags |= PanelArtController.DIRTY.BACKGROUND;
                            this.#rebuildBackground();
                        }, { radio: cfg.darkenValue === pct });
                    });
                });
            });
        });

        m.addSeparator();

        // 4. Custom Artwork Folders
        m.addSubMenu('Custom Artwork Folders', (customFM) => {
            customFM.addItem('Add Custom Folder Path...', () => {
                const f = GdiUtils.prompt('Enter folder path for artwork search:', 'Add Custom Artwork Folder', '');
                if (f) {
                    const cleaned = GdiUtils.sanitizePath(f);
                    if (cleaned && utils.IsDirectory(cleaned)) {
                        this.#customFolders.push(cleaned);
                        this.saveAll();
                        reloadTrackOrDisplay();
                    }
                }
            });
            customFM.addSeparator();
            customFM.addSubMenu('Folder Match Depth', (depthM) => {
                [1, 2, 3, 4].forEach((d) => {
                    depthM.addItem(`${d} Sub-folder${d > 1 ? 's' : ''} Deep`, () => {
                        cfg.customFolderDepth = d;
                        this.saveAll();
                        reloadTrackOrDisplay();
                    }, { radio: cfg.customFolderDepth === d });
                });
            });
            if (this.#customFolders.length > 0) {
                customFM.addSeparator();
                this.#customFolders.forEach((f, i) => {
                    const shortName = f.length > 45 ? `...${f.substring(f.length - 42)}` : f;
                    customFM.addItem(`Remove: ${GdiUtils.escapeMenuLabel(shortName)}`, () => {
                        this.#customFolders.splice(i, 1);
                        this.saveAll();
                        reloadTrackOrDisplay();
                    });
                });
                customFM.addSeparator();
                customFM.addItem('Clear All Custom Folders', () => {
                    this.#customFolders = [];
                    this.saveAll();
                    reloadTrackOrDisplay();
                });
            }
        });

        const resolvedImageFolder = this.resolveProfileFolder(cfg.imageFolder);
        m.addItem((resolvedImageFolder && utils.IsDirectory(resolvedImageFolder)) ? 'Change Image Folder...' : 'Set Image Folder...', () => {
            const f = GdiUtils.prompt('Enter custom image folder path for slideshow/display:', 'Set Image Folder', cfg.imageFolder);
            if (f) {
                const cleaned = GdiUtils.sanitizePath(f);
                const resolved = this.resolveProfileFolder(cleaned);
                if (resolved && utils.IsDirectory(resolved)) {
                    cfg.imageFolder = cleaned;
                    this.#slideImages = null;
                    this.saveAll();
                    if (cfg.imageMode) this.startImageMode(false);
                    else if (cfg.slideMode) this.startSlideMode(false);
                }
            }
        });
        m.addItem('Show Single Image', () => {
            cfg.imageMode ? this.stopImageMode() : this.startImageMode(true);
        }, { checked: cfg.imageMode });
        m.addItem('Slide Show', () => {
            cfg.slideMode ? this.stopSlideMode() : this.startSlideMode(true);
        }, { checked: cfg.slideMode });

        m.addSeparator();

        // 5. Presets
        m.addSubMenu('Presets', (presetM) => {
            presetM.addSubMenu('Load Preset', (loadM) => {
                [1, 2, 3].forEach((i) => {
                    const hasPreset = Boolean(window.GetProperty(`PA.Preset${i}`, null));
                    loadM.addItem(`Preset ${i}${hasPreset ? '' : ' (Empty)'}`, () => this.loadPreset(i), { disabled: !hasPreset });
                });
            });
            presetM.addSubMenu('Save Preset', (saveM) => {
                [1, 2, 3].forEach((i) => {
                    saveM.addItem(`Preset ${i}`, () => this.savePreset(i));
                });
            });
        });

        m.addSeparator();
        m.addItem('Glitch Effect on Track Change', () => {
            cfg.glitchEnabled = !cfg.glitchEnabled;
            if (cfg.glitchEnabled) this.triggerGlitch();
        }, { checked: cfg.glitchEnabled });

        m.addItem('Reload Artwork', () => {
            this.#scanner.clearCaches();
            this.#slideImages = null;
            this.#cachedBezelImages = null;
            this.#cachedBezelFolder = null;
            this.#currentCoverPath = '';
            this.#currentArtKey = '';
            this.loadBezel();
            if (cfg.slideMode) this.startSlideMode(false);
            else if (cfg.imageMode) this.startImageMode(false);
            else if (fb.IsPlaying) this.loadArtworkForTrack(fb.GetNowPlaying());
            else this.clearTrackDisplay();
        });

        m.addItem('Reset Visual Settings to Defaults', () => {
            this.stopSlideMode(false);
            this.stopImageMode(false);
            this.config = SettingsSchema.reset(this.config, { includeResetAll: false, defaults: PanelArtController.DEFAULTS });
            this.#scanner.clearCaches();
            this.loadBezel();
            this.#dirtyFlags = PanelArtController.DIRTY.ALL;
            this.#rebuildBackground();
            this.#rebuildOverlay();
            if (fb.IsPlaying) this.loadArtworkForTrack(fb.GetNowPlaying());
            else this.clearTrackDisplay();
        });

        m.addItem('Factory Reset (All Settings & Folders)...', () => {
            const confirm = GdiUtils.prompt('Type YES to reset all settings, custom folders and paths to factory defaults:', 'Confirm Factory Reset', '');
            if (confirm?.toUpperCase() === 'YES') {
                this.stopSlideMode(false);
                this.stopImageMode(false);
                this.#customFolders = [];
                for (let p = 1; p <= 3; p++) window.SetProperty(`PA.Preset${p}`, null);
                this.config = SettingsSchema.reset(this.config, { includeResetAll: true, defaults: PanelArtController.DEFAULTS });
                this.config.bezelFolder = `${this.#profileBase}skins\\overlay`;
                this.#scanner.clearCaches();
                this.#cachedBezelImages = null;
                this.#cachedBezelFolder = null;
                this.#slideImages = null;
                this.loadBezel();
                this.#dirtyFlags = PanelArtController.DIRTY.ALL;
                this.#rebuildBackground();
                this.#rebuildOverlay();
                if (fb.IsPlaying) this.loadArtworkForTrack(fb.GetNowPlaying());
                else this.clearTrackDisplay();
            }
        });

        const selected = m.track(x, y);
        if (selected === 0) return true;

        this.requestSave();
        window.Repaint();
        return true;
    }

    // ========================================================================================
    // EVENT DELEGATION
    // ========================================================================================
    onSize() {
        if (this.#lifecycle !== PanelArtController.LIFECYCLE.LIVE) return;
        const w = window.Width, h = window.Height;
        if (w <= 0 || h <= 0) {
            if (this.config.slideMode) {
                this.#slideWasHidden = true;
                this.#stopSlideTimerOnly();
            }
            return;
        }

        this.#dirtyFlags = PanelArtController.DIRTY.ALL;
        this.#rebuildBackground();
        this.#rebuildOverlay();
        window.Repaint();
    }

    onAlbumArtDone(handle, art_id, image, image_path) {
        if (this.#lifecycle !== PanelArtController.LIFECYCLE.LIVE) {
            if (image) { try { image.Dispose(); } catch {} }
            return;
        }

        if (!this.#asyncArtToken || this.#asyncArtToken !== this.#artGenerationToken ||
            (this.#asyncArtRawPath && handle?.RawPath && handle.RawPath !== this.#asyncArtRawPath)) {
            if (image) { try { image.Dispose(); } catch {} }
            return;
        }
        this.#asyncArtToken = 0;
        this.#asyncArtRawPath = '';

        if (image) {
            this.#disposeScaledCover();
            if (this.#coverImg) { try { this.#coverImg.Dispose(); } catch {} }
            this.#coverImg = image;
            this.#currentCoverPath = image_path || '';
            if (this.#currentArtKey) {
                if (this.#scanner.isImageFilePath(this.#currentCoverPath)) {
                    this.#scanner.setArtMemoryCache(this.#currentArtKey, this.#currentCoverPath);
                } else {
                    this.#scanner.setArtMemoryCache(this.#currentArtKey, { embedded: true });
                }
            }
            this.#dirtyFlags |= (PanelArtController.DIRTY.LAYOUT | PanelArtController.DIRTY.TEXT | PanelArtController.DIRTY.BACKGROUND);
            this.#rebuildBackground();
        } else {
            const hadCover = Boolean(this.#coverImg);
            this.#disposeScaledCover();
            if (this.#coverImg) { try { this.#coverImg.Dispose(); } catch {} }
            this.#coverImg = null;
            this.#currentCoverPath = '';
            if (this.#currentArtKey) {
                this.#scanner.setArtMemoryCache(this.#currentArtKey, { isNone: true });
            }
            if (hadCover) {
                this.#dirtyFlags |= (PanelArtController.DIRTY.LAYOUT | PanelArtController.DIRTY.TEXT | PanelArtController.DIRTY.BACKGROUND);
                this.#rebuildBackground();
            } else {
                this.#dirtyFlags |= PanelArtController.DIRTY.TEXT;
                if (!this.#backdrop.cacheBmp) this.#rebuildBackground();
            }
        }

        window.Repaint();
    }

    onLoadImageDone(cookie, image) {
        if (this.#lifecycle === PanelArtController.LIFECYCLE.SHUTDOWN) {
            if (image) { try { image.Dispose(); } catch {} }
            return;
        }
        if (!this.#imgLoader.onLoadImageDone(cookie, image)) {
            if (image) { try { image.Dispose(); } catch {} }
        }
    }

    getOpacity(target) {
        switch (target) {
            case 'Reflection': return this.config.opReflection;
            case 'Glow':       return this.config.opGlow;
            case 'Scanlines':  return this.config.opScanlines;
            case 'Phosphor':   return this.config.opPhosphor;
            case 'Padding':    return this.config.albumArtPadding;
            default:           return 255;
        }
    }

    setOpacity(target, val) {
        const max = target === 'Padding' ? 100 : 255;
        const clamped = GdiUtils.clamp(val, 0, max);
        switch (target) {
            case 'Reflection': this.config.opReflection = clamped; this.#dirtyFlags |= PanelArtController.DIRTY.OVERLAY; this.#rebuildOverlay(); break;
            case 'Glow':
                this.config.opGlow = clamped;
                if (this.#layout.artRect.w > 0) {
                    this.#backdrop.checkGlow(this.#layout.artRect.w, this.#layout.artRect.h, this.config.showGlow, clamped, this.config.overlayAllOff);
                }
                break;
            case 'Scanlines':  this.config.opScanlines = clamped; this.#dirtyFlags |= PanelArtController.DIRTY.OVERLAY; this.#rebuildOverlay(); break;
            case 'Phosphor':   this.config.opPhosphor = clamped; this.#dirtyFlags |= PanelArtController.DIRTY.OVERLAY; this.#rebuildOverlay(); break;
            case 'Padding':    this.config.albumArtPadding = clamped; this.#dirtyFlags |= PanelArtController.DIRTY.LAYOUT; break;
        }
        this.requestSave();
        window.Repaint();
    }

    onMouseWheel(step) {
        if (this.#lifecycle !== PanelArtController.LIFECYCLE.LIVE) return false;
        if (this.#opacityTarget) {
            this.setOpacity(this.#opacityTarget, this.getOpacity(this.#opacityTarget) + (step > 0 ? 5 : -5));
            return true;
        }
        return false;
    }

    setOpacityTarget(target) {
        if (this.#opacityTarget === target) return;
        this.#opacityTarget = target;
        window.Repaint();
    }

    loadPreset(slot) {
        if (slot < 1 || slot > 3) return;
        const raw = window.GetProperty(`PA.Preset${slot}`, null);
        if (!raw) return;
        try {
            const d = JSON.parse(raw);
            if (!d || typeof d !== 'object') return;
            this.config = SettingsSchema.sanitize(d, this.config, { skipNoPreset: true });
            if (!this.config.bezelFolder) this.config.bezelFolder = `${this.#profileBase}skins\\overlay`;

            this.#dirtyFlags = PanelArtController.DIRTY.ALL;
            this.#scanner.clearCaches();
            this.#slideImages = null;
            this.loadBezel();
            this.#rebuildBackground();
            this.#rebuildOverlay();
            this.requestSave();
            window.Repaint();
        } catch (err) {
            console.log(`[PanelArt] Failed to load preset ${slot}: ${err}`);
        }
    }

    savePreset(slot) {
        if (slot < 1 || slot > 3) return;
        window.SetProperty(`PA.Preset${slot}`, JSON.stringify(this.config));
    }

    onNotifyData(name, info) {
        if (this.#lifecycle !== PanelArtController.LIFECYCLE.LIVE) return;
        if (name === 'ArtFolder' && info && !fb.IsPlaying) {
            if (!utils.IsDirectory(info)) return;

            const thisToken = ++this.#artGenerationToken;
            if (this.#pendingSearchTimer) { window.ClearTimeout(this.#pendingSearchTimer); this.#pendingSearchTimer = null; }

            this.#pendingSearchTimer = window.SetTimeout(() => {
                this.#pendingSearchTimer = null;
                if (thisToken !== this.#artGenerationToken || this.#lifecycle !== PanelArtController.LIFECYCLE.LIVE || fb.IsPlaying) return;

                const res = this.#scanner.searchDirectory(info, ArtScanner.FAST_NAMES, true, false, this.config.customFolderDepth, Date.now() + 25);
                if (thisToken !== this.#artGenerationToken || this.#lifecycle !== PanelArtController.LIFECYCLE.LIVE || fb.IsPlaying) return;

                if (res) this.applyNewArtwork(res, thisToken);
            }, 30);
        }
    }

    onMetadbChanged(handle_list, fromhook) {
        if (fromhook || !fb.IsPlaying || !handle_list) return;
        try {
            const np = fb.GetNowPlaying();
            if (!np || handle_list.Find(np) === -1) return;

            let trackDir = '', rawAlbum = '', rawDisc = '', rawTitle = '', rawArtist = '', rawDate = '', rawLen = '';
            try {
                const raw = this.#compoundTf.EvalWithMetadb(np) ?? '';
                const parts = raw.split('\x01');
                trackDir  = parts[0] ?? '';
                rawArtist = parts[1] ?? '';
                rawAlbum  = parts[2] ?? '';
                rawTitle  = parts[4] ?? '';
                rawDate   = parts[5] ?? '';
                rawLen    = parts[6] ?? '';
                rawDisc   = parts[8] ?? '';
            } catch {}

            const newArtKey = this.#scanner.getArtworkIdentityKey(trackDir, rawAlbum, rawDisc, rawTitle || np.Path);

            this.#trackInfo.title  = rawTitle || 'Playing';
            this.#trackInfo.artist = rawArtist;
            const extraParts = [rawAlbum.trim(), rawDate.trim(), rawLen.trim()].filter(Boolean);
            this.#trackInfo.extra = extraParts.join(' | ');

            if (newArtKey === this.#currentArtKey) {
                this.#dirtyFlags |= PanelArtController.DIRTY.TEXT;
                window.Repaint();
            } else {
                this.loadArtworkForTrack(np);
            }
        } catch {}
    }

    onFontChanged() {
        this.#fonts.clear();
        this.#hudFont = null;
        this.#dirtyFlags |= (PanelArtController.DIRTY.LAYOUT | PanelArtController.DIRTY.TEXT);
        window.Repaint();
    }

    onKeyDown(vkey) {
        if (vkey === 0x1B && this.#opacityTarget !== null) { // Escape
            this.setOpacityTarget(null);
            return true;
        }
        if (utils.IsKeyPressed(0x11) && !utils.IsKeyPressed(0x10) && !utils.IsKeyPressed(0x12)) { // Ctrl only
            if (vkey === 0x26) { this.cycleBezel(-1); return true; } // UP
            if (vkey === 0x28) { this.cycleBezel(1);  return true; } // DOWN
        }
        return false;
    }

    dispose() {
        this.saveAll();
        this.#lifecycle = PanelArtController.LIFECYCLE.SHUTDOWN;
        this.#artGenerationToken++;
        this.#bezelLoadToken++;
        this.#imgLoader.clear();

        if (this.#glitchTimer)        window.ClearInterval(this.#glitchTimer);
        if (this.#slideTimer)         window.ClearInterval(this.#slideTimer);
        if (this.#saveTimeout)        window.ClearTimeout(this.#saveTimeout);
        if (this.#bezelNotifyTimeout) window.ClearTimeout(this.#bezelNotifyTimeout);
        if (this.#pendingSearchTimer) window.ClearTimeout(this.#pendingSearchTimer);

        this.#disposeScaledCover();
        if (this.#coverImg) { try { this.#coverImg.Dispose(); } catch {} this.#coverImg = null; }
        if (this.#modeImg)  { try { this.#modeImg.Dispose(); }  catch {} this.#modeImg = null; }
        if (this.#bezelBmp) { try { this.#bezelBmp.Dispose(); } catch {} this.#bezelBmp = null; }
        this.#disposeTextBlock();

        this.#backdrop.dispose();
        this.#fonts.clear();
        this.#scanner.clearCaches();
        this.#slideImages = null;
    }
}

// ============================================================================================
// 7. SMP GLOBAL HOOKS & DISPATCH
// ============================================================================================
const app = new PanelArtController();

function on_paint(gr) {
    app.onPaint(gr);
}

function on_size() {
    app.onSize();
}

function on_playback_new_track(metadb) {
    app.loadArtworkForTrack(metadb);
}

function on_playback_stop(reason) {
    if (reason !== 2) app.clearTrackDisplay();
}

function on_playback_pause()    { window.Repaint(); }
function on_playback_starting() {}
function on_playback_seek()     { window.Repaint(); }

function on_colours_changed() {
    app.refreshColours();
}

function on_font_changed() {
    app.onFontChanged();
}

function on_metadb_changed(handle_list, fromhook) {
    app.onMetadbChanged(handle_list, fromhook);
}

function on_get_album_art_done(handle, art_id, image, image_path) {
    app.onAlbumArtDone(handle, art_id, image, image_path);
}

function on_load_image_done(cookie, image, image_path) {
    app.onLoadImageDone(cookie, image, image_path);
}

function on_mouse_wheel(step) {
    return app.onMouseWheel(step);
}

function on_mouse_rbtn_up(x, y, mask) {
    if (mask & 4) return false;
    return app.showContextMenu(x, y);
}

function on_mouse_lbtn_dblclk() {
    if (app.config.slideMode) {
        app.stopSlideMode();
    } else if (app.config.imageMode) {
        app.stopImageMode();
    } else {
        app.startImageMode(true);
    }
}

function on_mouse_lbtn_up() {
    app.setOpacityTarget(null);
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