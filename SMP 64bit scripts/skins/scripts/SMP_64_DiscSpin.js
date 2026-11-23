'use strict';
		      // -============ AUTHOR L.E.D. ===========- \\
		     // -======= SMP 64bit Disc Spin V5.7 =======- \\
		    // -====== Spins Disc + Artwork + Cover ======- \\

    // ===================*** Foobar2000 64bit ***================== \\
   // ======= For Spider Monkey Panel 64bit, author: marc2003 ======= \\
  // ====== Masking All Images, Creates a Disc from Album Art+  ====== \\
 // ======== Sample Code ApplyMask author: T.P Wang / marc2003 ======== \\
// ==-== Inspired by "CD Album Art, @authors "marc2003, Jul23, vnav" =-==\\

/* 
 * Custom License for foobar2000 Themes
 * Copyright (c) 2026 [L.E.D.]
 * Allowed: Non-commercial use and modification.
 * Prohibited: Paid products/themes, subscriptions, or cloud-bundled services.
 */

window.DefineScript('SMP 64bit Disc Spin', { 
    author: 'L.E.D.', 
    version: '5.7',
    features: { grab_focus: true } 
});

if ('DrawMode' in window) window.DrawMode = 0; // 0 - GDI+ mode, 1 - D2D mode Jsplitter etc.
window.DlgCode  = 0x0004; // DLGC_WANTALLKEYS: Captures arrow keys and modifier shortcuts

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
        // Preserve Windows drive root (e.g., "C:\") and UNC root (e.g., "\\server\share\")
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

    static normalize(str) {
        if (!str) return '';
        return str.toLowerCase()
            .replace(/[\(\[\{][^\)\]\}]*[\)\]\}]/g, ' ')
            .replace(/[\/\\:*?"<>|\-_.,;!+=&^%$#@~`]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    static hsvToArgb(h, s, v, alpha) {
        h = ((h % 360) + 360) % 360;
        const c = v * s;
        const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
        const m = v - c;
        let r = 0, g = 0, b = 0;
        if (h < 60)       { r = c; g = x; b = 0; }
        else if (h < 120) { r = x; g = c; b = 0; }
        else if (h < 180) { r = 0; g = c; b = x; }
        else if (h < 240) { r = 0; g = x; b = c; }
        else if (h < 300) { r = x; g = 0; b = c; }
        else              { r = c; g = 0; b = x; }
        return ((alpha << 24) | (Math.round((r + m) * 255) << 16)
                      | (Math.round((g + m) * 255) << 8)
                      | Math.round((b + m) * 255)) >>> 0;
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
    static FIELDS = [
        { key: 'spinningEnabled',     prop: 'RP.SpinningEnabled',         type: 'bool',  def: true,  group: 'style' },
        { key: 'spinSpeed',           prop: 'RP.SpinSpeed',               type: 'float', def: 2.0,   min: 0.5, max: 5.0, group: 'style' },
        { key: 'spinFPS',             prop: 'RP.SpinFPS',                 type: 'enum',  def: 30,    values: [30, 60], num: true, group: 'style' },
        { key: 'useAlbumArtOnly',     prop: 'RP.UseAlbumArtOnly',         type: 'bool',  def: false, group: 'style' },
        { key: 'keepAspectRatio',     prop: 'RP.KeepAspectRatio',         type: 'bool',  def: true,  group: 'style' },
        { key: 'interpolationMode',   prop: 'RP.InterpolationMode',       type: 'int',   def: 0,     min: 0,   max: 2, group: 'style' },
        { key: 'maxImageSize',        prop: 'RP.MaxImageSize',            type: 'int',   def: 500,   min: 125, max: 2000, group: 'style' },
        { key: 'maskType',            prop: 'RP.MaskType',                type: 'int',   def: 0,     min: 0,   max: 2, group: 'style' },
        { key: 'userOverrideMask',    prop: 'RP.UserOverrideMask',        type: 'bool',  def: false, group: 'style' },
        { key: 'customFolderDepth',   prop: 'RP.CustomFolderDepth',       type: 'int',   def: 2,     min: 1,   max: 4, group: 'panel' },

        { key: 'showReflection',      prop: 'Disc.ShowReflection',        type: 'bool',  def: true,  group: 'style' },
        { key: 'opReflection',        prop: 'Disc.OpReflection',          type: 'int',   def: 25,    min: 0,   max: 255, group: 'style' },
        { key: 'showGlow',            prop: 'Disc.ShowGlow',              type: 'bool',  def: false, group: 'style' },
        { key: 'opGlow',              prop: 'Disc.OpGlow',                type: 'int',   def: 80,    min: 0,   max: 255, group: 'style' },
        { key: 'showScanlines',       prop: 'Disc.ShowScanlines',         type: 'bool',  def: false, group: 'style' },
        { key: 'opScanlines',         prop: 'Disc.OpScanlines',           type: 'int',   def: 100,   min: 0,   max: 255, group: 'style' },
        { key: 'showPhosphor',        prop: 'Disc.ShowPhosphor',          type: 'bool',  def: true,  group: 'style' },
        { key: 'opPhosphor',          prop: 'Disc.OpPhosphor',            type: 'int',   def: 20,    min: 0,   max: 255, group: 'style' },
        { key: 'phosphorTheme',       prop: 'Disc.PhosphorTheme',         type: 'int',   def: 8,     min: 0,   max: 10, group: 'style' },
        { key: 'customPhosphorColor', prop: 'Disc.CustomPhosphorColor',   type: 'color', def: 0xFFFFFFFF, group: 'style' },
        { key: 'overlayAllOff',       prop: 'Disc.OverlayAllOff',         type: 'bool',  def: false, group: 'style' },

        { key: 'borderSize',          prop: 'Disc.BorderSize',            type: 'int',   def: 0,     min: 0,   max: 50, group: 'style' },
        { key: 'borderColor',         prop: 'Disc.BorderColor',           type: 'color', def: 0xFF202020, group: 'style' },
        { key: 'discPadding',         prop: 'Disc.Padding',               type: 'int',   def: 20,    min: 0,   max: 100, group: 'style' },
        { key: 'albumPadding',        prop: 'Disc.AlbumPadding',          type: 'int',   def: 0,     min: 0,   max: 100, group: 'style' },
        { key: 'padLeft',             prop: 'Disc.PadLeft',               type: 'int',   def: 0,     min: 0,   max: 100, group: 'style' },
        { key: 'padRight',            prop: 'Disc.PadRight',              type: 'int',   def: 0,     min: 0,   max: 100, group: 'style' },
        { key: 'padTop',              prop: 'Disc.PadTop',                type: 'int',   def: 0,     min: 0,   max: 100, group: 'style' },
        { key: 'padBottom',           prop: 'Disc.PadBottom',             type: 'int',   def: 0,     min: 0,   max: 100, group: 'style' },

        { key: 'bezelFolder',         prop: 'Disc.BezelFolder',           type: 'path',  def: '',    group: 'panel', resetAll: true },
        { key: 'bezelEnabled',        prop: 'Disc.BezelEnabled',          type: 'bool',  def: false, group: 'style' },
        { key: 'bezelFile',           prop: 'Disc.BezelFile',             type: 'str',   def: '',    group: 'style' },

        { key: 'backgroundEnabled',   prop: 'Disc.BackgroundEnabled',     type: 'bool',  def: true,  group: 'style' },
        { key: 'blurRadius',          prop: 'Disc.BlurRadius',            type: 'int',   def: 240,   min: 0,   max: 254, group: 'style' },
        { key: 'blurEnabled',         prop: 'Disc.BlurEnabled',           type: 'bool',  def: true,  group: 'style' },
        { key: 'darkenValue',         prop: 'Disc.DarkenValue',           type: 'int',   def: 10,    min: 0,   max: 50, group: 'style' },
        { key: 'customBgColor',       prop: 'Disc.CustomBackgroundColor', type: 'color', def: 0xFF191919, group: 'style' },
        { key: 'bgUseUIColor',        prop: 'Disc.BgUseUIColor',          type: 'bool',  def: false, group: 'style' }
    ];

    static defaults(overrides = null) {
        const out = {};
        for (const f of this.FIELDS) out[f.key] = f.def;
        if (overrides) Object.assign(out, overrides);
        return out;
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
            case 'float': {
                const n = Number(raw);
                return Number.isFinite(n) ? GdiUtils.clamp(n, f.min, f.max) : fallback;
            }
            case 'enum': {
                const v = f.num ? Number(raw) : raw;
                return f.values.includes(v) ? v : fallback;
            }
            case 'color': {
                const n = Number(raw);
                return (Number.isFinite(n) && (n >>> 0) !== 0) ? (n >>> 0) : fallback;
            }
            case 'path':
                return GdiUtils.sanitizePath(String(raw || fallback));
            default:
                return String(raw ?? fallback);
        }
    }

    static sanitize(raw, fallback) {
        const base = fallback || this.defaults();
        const out = { ...base };
        if (!raw || typeof raw !== 'object') return out;
        for (const f of this.FIELDS) {
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
            out[f.key] = this.coerce(f, window.GetProperty(f.prop, def), def);
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
// 2. ARTWORK & DISCOVERY SCANNER (BUDGET-GUARDED ENGINE)
// ============================================================================================
class ArtScanner {
    static EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.bmp'];
    static FAST_DISC  = ['cd', 'disc', 'vinyl', 'media', 'record', 'cd1', 'disc1'];
    static FAST_COVER = ['cover', 'front', 'folder', 'albumart'];
    static BLACKLIST  = ['back', 'rear', 'tray', 'inlay', 'booklet', 'case', 'matrix', 'spine', 'inside', 'digipak'];
    static DISC_REGEX = /^(?:cd|disc|disk|side|vinyl|disque|vol|part|volume)[\s_.\-]*\d+$/i;
    static MULTI_DISC_PARENT_RE = /[\\/](?:[\s\(\-\[]*)(?:cd|disc|disk|side|vinyl|disque|vol|part|volume)[\s_.\-]*(?:\d+|[ab])[^\\]*$/i;
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

    getMemoryCache(key) {
        if (!this.#artPathCache.has(key)) return null;
        const cached = this.#artPathCache.get(key);
        if (cached) {
            if (cached.embedded || cached.isNone) return cached;
            const discOk  = !cached.disc  || (this.isImageFilePath(cached.disc)  && utils.IsFile(cached.disc));
            const coverOk = !cached.cover || (this.isImageFilePath(cached.cover) && utils.IsFile(cached.cover));
            if (discOk && coverOk && (cached.disc || cached.cover)) return cached;
        }
        this.#artPathCache.delete(key);
        return null;
    }

    setMemoryCache(key, val) {
        if (!val) return;
        if (val.embedded || val.isNone) {
            if (this.#artPathCache.size > 500) {
                this.#artPathCache.delete(this.#artPathCache.keys().next().value);
            }
            this.#artPathCache.set(key, {
                disc: null,
                cover: null,
                embedded: Boolean(val.embedded),
                isNone: Boolean(val.isNone)
            });
            return;
        }
        const disc  = (val.disc  && this.isImageFilePath(val.disc))  ? val.disc  : null;
        const cover = (val.cover && this.isImageFilePath(val.cover)) ? val.cover : null;
        if (!disc && !cover) return;
        if (this.#artPathCache.size > 500) {
            this.#artPathCache.delete(this.#artPathCache.keys().next().value);
        }
        this.#artPathCache.set(key, { disc, cover, embedded: false, isNone: false });
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

    getFastDiscAndCover(dirPath) {
        const images = this.getFolderImagesList(dirPath);
        if (!images.length) return { disc: null, cover: null };

        let disc = null;
        let cover = null;
        for (const target of ArtScanner.FAST_DISC) {
            const hit = images.find(img => img.name === target);
            if (hit) { disc = hit.path; break; }
        }
        for (const target of ArtScanner.FAST_COVER) {
            const hit = images.find(img => img.name === target);
            if (hit) { cover = hit.path; break; }
        }
        return { disc, cover };
    }

    inspectScoredImages(dirPath, specificPatterns, isDiscMode) {
        const images = this.getFolderImagesList(dirPath);
        if (images.length === 0) return { bestMatch: null, fallbackImage: null };

        let bestMatch = null;
        let highestScore = -1;
        let bestFallback = null;

        const lowerSpecs = specificPatterns?.map(p => p.toLowerCase().trim()).filter(Boolean) ?? [];

        for (const img of images) {
            let score = 0;
            if (isDiscMode) {
                if (['disc', 'cd', 'vinyl', 'record', 'media', 'disc1', 'cd1', 'disc 1', 'cd 1'].includes(img.name)) {
                    score = 100;
                } else if (lowerSpecs.includes(img.name)) {
                    score = 80;
                } else if (img.name.startsWith('disc') || img.name.startsWith('cd') || img.name.startsWith('vinyl')) {
                    score = ArtScanner.BLACKLIST.some(kw => img.name.includes(kw)) ? 5 : 60;
                } else if (lowerSpecs.some(spec => img.name.startsWith(spec))) {
                    score = 50;
                }
            } else {
                if (ArtScanner.FAST_COVER.includes(img.name)) {
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

    searchDirectory(dirPath, specificDisc, specificCover, allowFallback = true, isRootCustom = false, maxDepth = 2, deadline = Infinity, _depth = 0) {
        if (!dirPath || Date.now() > deadline || !utils.IsDirectory(dirPath)) {
            return { disc: null, cover: null };
        }

        const discInspect  = this.inspectScoredImages(dirPath, specificDisc, true);
        const coverInspect = this.inspectScoredImages(dirPath, specificCover, false);
        let disc  = discInspect.bestMatch;
        let cover = coverInspect.bestMatch;

        if (isRootCustom && _depth === 0) return { disc, cover };

        if ((!disc || !cover) && _depth < maxDepth && Date.now() <= deadline) {
            const subDirs = this.getSubfolders(dirPath);

            for (const sub of subDirs) {
                if (Date.now() > deadline) break;
                const name = sub.substring(sub.lastIndexOf('\\') + 1).toLowerCase().trim();
                if (ArtScanner.ART_SUBDIRS.includes(name) || ArtScanner.DISC_REGEX.test(name)) {
                    const subRes = this.searchDirectory(sub, specificDisc, specificCover, allowFallback, false, maxDepth, deadline, _depth + 1);
                    disc  ||= subRes.disc;
                    cover ||= subRes.cover;
                    if (disc && cover) break;
                }
            }

            if ((!disc || !cover) && subDirs.length <= 60 && _depth < 1 && Date.now() <= deadline) {
                for (const sub of subDirs) {
                    if (Date.now() > deadline) break;
                    const name = sub.substring(sub.lastIndexOf('\\') + 1).toLowerCase().trim();
                    if (!ArtScanner.ART_SUBDIRS.includes(name) && !ArtScanner.DISC_REGEX.test(name)) {
                        const subRes = this.searchDirectory(sub, specificDisc, specificCover, false, false, maxDepth, deadline, _depth + 1);
                        disc  ||= subRes.disc;
                        cover ||= subRes.cover;
                        if (disc && cover) break;
                    }
                }
            }
        }

        if (!cover && allowFallback) cover = coverInspect.fallbackImage;
        return { disc, cover };
    }

    findInCustomFolder(cFolder, artistVariants, albumVariants, folderVariants, specificDisc, specificCover, maxDepth, deadline = Infinity, needDisc = true, needCover = true) {
        let discPath = null;
        let coverPath = null;
        const done = () => (!needDisc || discPath) && (!needCover || coverPath);

        if (Date.now() > deadline) return { disc: null, cover: null };

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
            if (Date.now() > deadline) return { disc: discPath, cover: coverPath };
            if (utils.IsDirectory(subDir)) {
                const res = this.searchDirectory(subDir, specificDisc, specificCover, true, false, maxDepth, deadline);
                if (needDisc)  discPath  ||= res.disc;
                if (needCover) coverPath ||= res.cover;
                if (done()) return { disc: discPath, cover: coverPath };
            }
        }

        if (Date.now() <= deadline && (specificDisc?.length || specificCover?.length)) {
            const rootRes = this.searchDirectory(cFolder, specificDisc, specificCover, false, true, maxDepth, deadline);
            if (needDisc)  discPath  ||= rootRes.disc;
            if (needCover) coverPath ||= rootRes.cover;
            if (done()) return { disc: discPath, cover: coverPath };
        }

        const matchTargets = [];
        for (const art of artistVariants) {
            for (const alb of albumVariants) {
                matchTargets.push(`${art} - ${alb}`, `${art}_${alb}`, `${art} ${alb}`, `${alb} - ${art}`);
            }
        }
        matchTargets.push(...albumVariants, ...folderVariants);

        const scanLevel = (dir, depth) => {
            if (depth > maxDepth || Date.now() > deadline || done() || !utils.IsDirectory(dir)) return;

            const subs = this.getSubfolders(dir);
            if (!subs?.length) return;
            const limit = Math.min(subs.length, 120);

            for (let i = 0; i < limit; i++) {
                if (Date.now() > deadline) return;
                const fName = subs[i].substring(subs[i].lastIndexOf('\\') + 1);
                if (this.#matchesList(fName, matchTargets) || this.#matchesList(fName, artistVariants)) {
                    const res = this.searchDirectory(subs[i], specificDisc, specificCover, true, false, maxDepth, deadline);
                    if (needDisc)  discPath  ||= res.disc;
                    if (needCover) coverPath ||= res.cover;
                    if (done()) return;

                    const aSubs = this.getSubfolders(subs[i]);
                    const aLimit = Math.min(aSubs.length, 60);
                    for (let j = 0; j < aLimit; j++) {
                        if (Date.now() > deadline) return;
                        const aName = aSubs[j].substring(aSubs[j].lastIndexOf('\\') + 1);
                        if (this.#matchesList(aName, matchTargets) || this.#matchesList(aName, albumVariants)) {
                            const aRes = this.searchDirectory(aSubs[j], specificDisc, specificCover, true, false, maxDepth, deadline);
                            if (needDisc)  discPath  ||= aRes.disc;
                            if (needCover) coverPath ||= aRes.cover;
                            if (done()) return;
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
                        if (done()) return;
                    }
                }
            }
        };

        scanLevel(cFolder, 1);
        return { disc: discPath, cover: coverPath };
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

    isVinylDisc(filePath) {
        if (!filePath) return false;
        const normalized = filePath.replace(/\//g, '\\');
        const lastSlash = normalized.lastIndexOf('\\');
        const fileName = (lastSlash !== -1 ? normalized.substring(lastSlash + 1) : normalized).toLowerCase();
        const baseName = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;

        if (['vinyl', 'record'].includes(baseName) || baseName.startsWith('vinyl') || baseName.endsWith('vinyl') ||
            baseName.includes('_vinyl') || baseName.includes('-vinyl') || baseName.includes(' vinyl') ||
            baseName.includes('vinyl ') || baseName.startsWith('record') || /\b(?:side[\s_.\-]*[ab]|lp\d*)\b/i.test(baseName)) {
            return true;
        }

        if (lastSlash !== -1) {
            const dirPath = normalized.substring(0, lastSlash);
            const parentSlash = dirPath.lastIndexOf('\\');
            const parentDir = (parentSlash !== -1 ? dirPath.substring(parentSlash + 1) : dirPath).toLowerCase().trim();
            if (['vinyl', 'lp', 'records'].includes(parentDir) || /^(?:vinyl|lp)[\s_.\-]*\d+$/i.test(parentDir)) {
                if (!baseName.includes('cd')) return true;
            }
        }
        return false;
    }
}

// ============================================================================================
// 3. PROCEDURAL DISC, MASK & RIM ENGINE (SMP 64-BIT DUAL-PATH FILLPOLYGON)
// ============================================================================================
class ProceduralDiscEngine {
    #maskCache     = new Map();
    #rimCache      = new Map();
    #rimLayerCache = new Map();
    #procDefCache  = new Map();
    #normSrc       = null;
    #normSrcObj    = null;
    #normSrcSize   = 0;

    clearNormalizedCache() {
        if (this.#normSrc) {
            try { this.#normSrc.Dispose(); } catch {}
            this.#normSrc = null;
        }
        this.#normSrcObj = null;
        this.#normSrcSize = 0;
    }

    normalizeSquare(src, baseSize, interpMode) {
        if (!src || src.Width <= 0 || src.Height <= 0) return null;
        const size = Math.max(64, Math.round(baseSize));
        if (this.#normSrc && this.#normSrcObj === src && this.#normSrcSize === size) return this.#normSrc;

        let sq = null, g = null;
        try {
            sq = gdi.CreateImage(size, size);
            g = sq.GetGraphics();
            g.SetInterpolationMode(interpMode === 0 ? 2 : interpMode);

            const minDim = Math.min(src.Width, src.Height);
            const sx = Math.floor((src.Width - minDim) / 2);
            const sy = Math.floor((src.Height - minDim) / 2);

            g.DrawImage(src, 0, 0, size, size, sx, sy, minDim, minDim);
            sq.ReleaseGraphics(g);
            g = null;

            if (this.#normSrc && this.#normSrc !== sq) {
                try { this.#normSrc.Dispose(); } catch {}
            }
            this.#normSrc = sq;
            this.#normSrcObj = src;
            this.#normSrcSize = size;
            return sq;
        } catch {
            if (g && sq) { try { sq.ReleaseGraphics(g); } catch {} }
            if (sq) { try { sq.Dispose(); } catch {} }
            return null;
        }
    }

    loadMask(type, size) {
        if (type >= 2 || size <= 0) return null;
        const key = `${type}:${size}`;
        if (this.#maskCache.has(key)) return this.#maskCache.get(key);

        let mask = null, g = null;
        try {
            mask = gdi.CreateImage(size, size);
            g = mask.GetGraphics();
            g.SetSmoothingMode(2);

            g.FillSolidRect(0, 0, size, size, 0xFFFFFFFF);
            g.FillEllipse(0, 0, size, size, 0xFF000000);

            const cx = size / 2, cy = size / 2;
            const holeRatio = (type === 0) ? 0.15 : 0.025;

            if (holeRatio > 0) {
                const holeSize = Math.max(type === 1 ? 3 : 6, Math.round(size * holeRatio));
                g.FillEllipse(cx - holeSize / 2, cy - holeSize / 2, holeSize, holeSize, 0xFFFFFFFF);
            }

            mask.ReleaseGraphics(g);
            g = null;
            this.#cacheStore(this.#maskCache, key, mask);
            return mask;
        } catch {
            if (g && mask) { try { mask.ReleaseGraphics(g); } catch {} }
            if (mask) { try { mask.Dispose(); } catch {} }
            return null;
        }
    }

    loadCenterRim(size, rimPath) {
        if (size <= 0 || !utils.IsFile(rimPath)) return null;
        const key = `rim:${size}`;
        if (this.#rimCache.has(key)) return this.#rimCache.get(key);

        let raw = null, resized = null;
        try {
            raw = gdi.Image(rimPath);
            if (!raw) return null;
            resized = raw.Resize(size, size);
            try { raw.Dispose(); } catch {}
            raw = null;
            this.#cacheStore(this.#rimCache, key, resized);
            return resized;
        } catch {
            if (raw) { try { raw.Dispose(); } catch {} }
            if (resized) { try { resized.Dispose(); } catch {} }
            return null;
        }
    }

    getProceduralRimLayer(size) {
        if (size <= 0) return null;
        const key = `rimLayer:${size}`;
        if (this.#rimLayerCache.has(key)) return this.#rimLayerCache.get(key);

        let layer = null, g = null;
        try {
            layer = gdi.CreateImage(size, size);
            g = layer.GetGraphics();
            g.SetSmoothingMode(2);
            g.FillSolidRect(0, 0, size, size, 0x00000000);
            this.#drawProceduralRim(g, size);
            layer.ReleaseGraphics(g);
            g = null;
            this.#cacheStore(this.#rimLayerCache, key, layer);
            return layer;
        } catch {
            if (g && layer) { try { layer.ReleaseGraphics(g); } catch {} }
            if (layer) { try { layer.Dispose(); } catch {} }
            return null;
        }
    }

    #drawProceduralRim(g, size) {
        const cx = size / 2, cy = size / 2, R = size / 2;
        const rOuterRim = size * 0.491;
        const lipWidth  = Math.max(1.5, (R - rOuterRim) + 1.5);
        const rMidLip   = rOuterRim + (lipWidth / 2);

        g.DrawEllipse(cx - rMidLip, cy - rMidLip, rMidLip * 2, rMidLip * 2, lipWidth, 0xFFCED2D7);

        const strokeW = Math.max(1, Math.round(size * 0.001));
        g.DrawEllipse(cx - rOuterRim, cy - rOuterRim, rOuterRim * 2, rOuterRim * 2, strokeW, 0xFF9499A0);
        g.DrawEllipse(cx - (rOuterRim - 0.5), cy - (rOuterRim - 0.5), (rOuterRim - 0.5) * 2, (rOuterRim - 0.5) * 2, 1, 0x30FFFFFF);
        g.DrawEllipse(cx - (R - 0.5), cy - (R - 0.5), (R - 0.5) * 2, (R - 0.5) * 2, 1, 0x50FFFFFF);
        g.DrawEllipse(cx - (R - 1.5), cy - (R - 1.5), (R - 1.5) * 2, (R - 1.5) * 2, 1, 0x25000000);

        const rOuterBorder = size * 0.180, rLeadInRing = size * 0.165;
        const rLeadOutRing = size * 0.152, rMirrorBand = size * 0.143;
        const rInnerCollar = size * 0.128, rHoleEdge   = size * 0.082;

        g.FillEllipse(cx - rOuterBorder, cy - rOuterBorder, rOuterBorder * 2, rOuterBorder * 2, 0xEE1E2126);
        g.DrawEllipse(cx - rOuterBorder, cy - rOuterBorder, rOuterBorder * 2, rOuterBorder * 2, 1, 0xFF0D0F12);

        this.#drawMetallicRing(g, cx, cy, rLeadOutRing - 1.0, rLeadInRing);
        g.DrawEllipse(cx - rLeadInRing, cy - rLeadInRing, rLeadInRing * 2, rLeadInRing * 2, 1, 0x558A6D2A);

        g.FillEllipse(cx - rLeadOutRing, cy - rLeadOutRing, rLeadOutRing * 2, rLeadOutRing * 2, 0xEE1E2126);
        g.DrawEllipse(cx - rLeadOutRing, cy - rLeadOutRing, rLeadOutRing * 2, rLeadOutRing * 2, 1, 0xFF0D0F12);

        g.FillEllipse(cx - rMirrorBand, cy - rMirrorBand, rMirrorBand * 2, rMirrorBand * 2, 0xEAE2E5E8);
        g.DrawEllipse(cx - rMirrorBand, cy - rMirrorBand, rMirrorBand * 2, rMirrorBand * 2, 1, 0x55FFFFFF);

        g.FillEllipse(cx - rInnerCollar, cy - rInnerCollar, rInnerCollar * 2, rInnerCollar * 2, 0xEAE2E5E8);
        g.DrawEllipse(cx - rInnerCollar, cy - rInnerCollar, rInnerCollar * 2, rInnerCollar * 2, 1, 0x509DA3AA);
        g.DrawEllipse(cx - rHoleEdge, cy - rHoleEdge, rHoleEdge * 2, rHoleEdge * 2, 1.5, 0x906E7680);
    }

    #drawMetallicRing(g, cx, cy, rInner, rOuter) {
        const steps = 240, green = Math.PI * 0.5;

        for (let i = 0; i < steps; i++) {
            const raw0 = (i / steps) * 2 * Math.PI, raw1 = ((i + 1) / steps) * 2 * Math.PI;
            const overlap = 1.2 / rOuter;
            const a0 = raw0 - overlap, a1 = raw1 + overlap;
            const am = (a0 + a1) / 2;
            const hue = (i / steps) * 360 * 2;
            const spec = 0.5 + 0.5 * Math.cos(am - green);
            const v = 0.6 + 0.38 * Math.pow(spec, 1.2);
            const col = GdiUtils.hsvToArgb(hue, 0.23, v, 0xFF);
            
            const p0 = [cx + Math.cos(a0) * rInner, cy + Math.sin(a0) * rInner];
            const p1 = [cx + Math.cos(a1) * rInner, cy + Math.sin(a1) * rInner];
            const p2 = [cx + Math.cos(a1) * rOuter, cy + Math.sin(a1) * rOuter];
            const p3 = [cx + Math.cos(a0) * rOuter, cy + Math.sin(a0) * rOuter];
            const flat = [p0[0], p0[1], p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]];
            const pts2D = [p0, p1, p2, p3];

            try {
                g.FillPolygon(col, 1, flat);
            } catch {
                try { g.FillPolygon(col, 1, pts2D); } catch {}
            }
        }
    }

    buildProceduralDefaultDisc(size) {
        const key = `procedef:${size}`;
        if (this.#procDefCache.has(key)) {
            const hit = this.#procDefCache.get(key);
            try { return hit.Clone(0, 0, hit.Width, hit.Height); } catch { this.#procDefCache.delete(key); }
        }

        let target = null, g = null;
        try {
            target = gdi.CreateImage(size, size);
            g = target.GetGraphics();
            g.SetSmoothingMode(2);
            g.FillSolidRect(0, 0, size, size, 0xFF000000);

            const cx = size / 2, cy = size / 2, rOuter = size * 0.49;
            g.FillEllipse(cx - rOuter, cy - rOuter, rOuter * 2, rOuter * 2, 0xFFC9CFD6);

            const rayCount = Math.max(180, Math.round((Math.PI * size) / 1.1));
            const stepAngle = (Math.PI * 2) / rayCount;
            let seed = 4321;
            const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

            for (let i = 0; i < rayCount; i++) {
                const rayAngle = i * stepAngle;
                const highlight = Math.pow(Math.sin(rayAngle * 2), 4);
                const shadow    = Math.pow(Math.cos(rayAngle * 2), 4);
                if (highlight < 0.02 && shadow < 0.02) continue;

                const rStart = (i % 2 === 0) ? rOuter * 0.09 : 0;
                const cosA = Math.cos(rayAngle), sinA = Math.sin(rayAngle);
                const sx = cx + cosA * rStart, sy = cy + sinA * rStart;
                const ex = cx + cosA * (rOuter + 1), ey = cy + sinA * (rOuter + 1);

                const grain = 0.98 + rnd() * 0.16;
                const alphaH = Math.round(highlight * 26 * grain);
                const alphaS = Math.round(shadow * 34 * grain);

                if (alphaH > 0) g.DrawLine(sx, sy, ex, ey, 1, (alphaH << 24) | 0xFFFFFF);
                if (alphaS > 0) g.DrawLine(sx, sy, ex, ey, 1, (alphaS << 24) | 0x000000);
            }

            const grooveStep = Math.max(3, Math.round(size * 0.005));
            for (let r = Math.floor(rOuter); r >= grooveStep; r -= grooveStep) {
                g.DrawEllipse(cx - r, cy - r, r * 2, r * 2, 1, (12 << 24) | 0x000000);
                if (r > 1) g.DrawEllipse(cx - (r - 0.5), cy - (r - 0.5), (r - 0.5) * 2, (r - 0.5) * 2, 1, (7 << 24) | 0xFFFFFF);
            }

            this.#drawRainbowGlints(g, cx, cy, size * 0.135, size * 0.49);
            const rimLayer = this.getProceduralRimLayer(size);
            if (rimLayer) g.DrawImage(rimLayer, 0, 0, size, size, 0, 0, rimLayer.Width, rimLayer.Height);

            target.ReleaseGraphics(g);
            g = null;

            this.#cacheStore(this.#procDefCache, key, target);
            return target.Clone(0, 0, target.Width, target.Height);
        } catch {
            if (g && target) { try { target.ReleaseGraphics(g); } catch {} }
            if (target) { try { target.Dispose(); } catch {} }
            return null;
        }
    }

    #drawRainbowGlints(g, cx, cy, rInner, rOuter) {
        const steps = 240, green = Math.PI * 0.5;
        for (let i = 0; i < steps; i++) {
            const a0 = (i / steps) * 2 * Math.PI, a1 = ((i + 1) / steps) * 2 * Math.PI;
            const am = (a0 + a1) / 2;
            const hue = (i / steps) * 360 * 2;
            const spec = 0.5 + 0.5 * Math.cos(am - green);
            const v = 0.55 + 0.28 * Math.pow(spec, 1.2);
            const col = GdiUtils.hsvToArgb(hue, 0.4, v, 0x30);
            
            const p0 = [cx + Math.cos(a0) * rInner, cy + Math.sin(a0) * rInner];
            const p1 = [cx + Math.cos(a1) * rInner, cy + Math.sin(a1) * rInner];
            const p2 = [cx + Math.cos(a1) * rOuter, cy + Math.sin(a1) * rOuter];
            const p3 = [cx + Math.cos(a0) * rOuter, cy + Math.sin(a0) * rOuter];
            const flat = [p0[0], p0[1], p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]];
            const pts2D = [p0, p1, p2, p3];

            try {
                g.FillPolygon(col, 1, flat);
            } catch {
                try { g.FillPolygon(col, 1, pts2D); } catch {}
            }
        }
    }

    processDisc(srcImg, size, isRealDisc, maskType, interpMode, rimPath) {
        if (!srcImg || size <= 0) return null;
        let target = null, g = null;
        try {
            target = gdi.CreateImage(size, size);
            g = target.GetGraphics();
            g.SetInterpolationMode(interpMode === 0 ? 2 : interpMode);
            g.SetSmoothingMode(2);

            if (maskType === 0 && !isRealDisc) {
                g.FillSolidRect(0, 0, size, size, 0xFF000000);
            }

            g.DrawImage(srcImg, 0, 0, size, size, 0, 0, srcImg.Width, srcImg.Height);

            if (maskType === 0 && !isRealDisc) {
                const rim = this.loadCenterRim(size, rimPath);
                if (rim) {
                    g.DrawImage(rim, 0, 0, size, size, 0, 0, rim.Width, rim.Height);
                } else {
                    const rimLayer = this.getProceduralRimLayer(size);
                    if (rimLayer) g.DrawImage(rimLayer, 0, 0, size, size, 0, 0, rimLayer.Width, rimLayer.Height);
                }
            }

            target.ReleaseGraphics(g);
            g = null;

            const mask = this.loadMask(maskType, size);
            if (mask) target.ApplyMask(mask);
            return target;
        } catch {
            if (g && target) { try { target.ReleaseGraphics(g); } catch {} }
            if (target) { try { target.Dispose(); } catch {} }
            return null;
        }
    }

    #cacheStore(map, key, bmp) {
        const existing = map.get(key);
        if (existing && existing !== bmp) {
            try { existing.Dispose(); } catch {}
        }
        map.delete(key);
        map.set(key, bmp);
        while (map.size > 8) {
            const oldestKey = map.keys().next().value;
            const oldest = map.get(oldestKey);
            try { oldest?.Dispose(); } catch {}
            map.delete(oldestKey);
        }
    }

    dispose() {
        this.clearNormalizedCache();
        for (const m of [this.#maskCache, this.#rimCache, this.#rimLayerCache, this.#procDefCache]) {
            for (const bmp of m.values()) { try { bmp?.Dispose(); } catch {} }
            m.clear();
        }
    }
}

// ============================================================================================
// 4. OVERLAY & BACKDROP ENGINE (SEAMLESS COMPOSITOR)
// ============================================================================================
class VisualBackdrop {
    #bgBlurredBmp     = null;
    #bgCacheBmp       = null;
    #overlayBmp       = null;
    #glowBmp          = null;
    #glowSize         = 0;
    #glowOp           = 0;
    #lastBlurSrc      = null;
    #lastBlurRad      = -1;

    static #disposeBmp(bmp) {
        if (bmp) {
            try { bmp.Dispose(); } catch {}
        }
        return null;
    }

    rebuildBlur(activeImg, w, h, enabled, blurRadius, useUIColor, interpMode) {
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
            const tw = Math.max(32, Math.floor(w / scale)), th = Math.max(32, Math.floor(h / scale));

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

    rebuildCache(w, h, useUIColor, customBgColor, bgEnabled, darkenPct, uiColour, interpMode) {
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
                    g.SetInterpolationMode(interpMode === 0 ? 2 : interpMode);
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
                try {
                    g.SetInterpolationMode(7);
                    g.DrawImage(bezelImg, 0, 0, w, h, 0, 0, bezelImg.Width, bezelImg.Height);
                } catch {}
            }

            bmp.ReleaseGraphics(g);
            this.#overlayBmp = bmp;
        } catch {
            if (g && bmp) { try { bmp.ReleaseGraphics(g); } catch {} }
            if (bmp) { try { bmp.Dispose(); } catch {} }
            this.#overlayBmp = null;
        }
    }

    rebuildGlow(discSize, showGlow, opGlow, overlayAllOff) {
        if (!showGlow || opGlow <= 0 || overlayAllOff || discSize <= 0) {
            this.#glowBmp = VisualBackdrop.#disposeBmp(this.#glowBmp);
            this.#glowSize = 0;
            this.#glowOp = 0;
            return;
        }

        const maxR = discSize * 0.7;
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
class DiscSpinController {
    static LIFECYCLE = { BOOT: 0, INIT: 1, LIVE: 2, SHUTDOWN: 3 };
    static BEZEL_EXTS = ['.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp'];

    static MASK_TYPES = [
        { name: 'CD Mask',    id: 0 },
        { name: 'Vinyl Mask', id: 1 },
        { name: 'No Mask',    id: 2 }
    ];
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

    static DEFAULTS = SettingsSchema.defaults();

    #lifecycle        = DiscSpinController.LIFECYCLE.BOOT;
    #dpiScale         = 1;
    #needsFullRepaint = true;
    #wasHidden        = false;

    #artSearchToken     = 0;
    #bezelLoadToken     = 0;
    #expectedAsyncToken = 0;
    #expectedAsyncRawPath = '';
    #pendingSearchTimer = null;
    #spinTimer          = null;
    #saveTimeout        = null;
    #bezelNotifyTimeout = null;

    #scanner   = new ArtScanner();
    #discProc  = new ProceduralDiscEngine();
    #backdrop  = new VisualBackdrop();
    #imgLoader = new AsyncImageLoader();

    #discImg       = null;
    #scaledDiscBmp = null;
    #discImgSource = null;
    #coverImg      = null;
    #bezelBmp      = null;
    #hudFont       = null;

    #currentCoverPath  = '';
    #currentDiscPath   = '';
    #currentArtKey     = '';
    #currentTrackPath  = '';
    #currentMetaStr    = '';
    #profileBase       = '';
    #customFolders     = [];
    #bezelNotifyText   = '';
    #opacityTarget     = null;
    #cachedBezelImages = null;
    #cachedBezelFolder = null;

    #angle        = 0;
    #lastSpinTime = 0;
    #isPaused     = false;
    #isDedicated  = false;
    #isDefault    = false;

    #geom = {
        valid: false, w: 0, h: 0,
        discSize: 0, dx: 0, dy: 0,
        drawW: 0, drawH: 0, drawX: 0, drawY: 0,
        gx: 0, gy: 0
    };

    #tf = {
        compound: fb.TitleFormat('$directory_path(%path%)\x01%artist%\x01%album%\x01$directory(%path%)\x01%discnumber%\x01%album artist%'),
        dirPath:  fb.TitleFormat('$directory_path(%path%)')
    };

    config = { ...DiscSpinController.DEFAULTS };

    constructor() {
        const sysDpi = (typeof window.DPI === 'number' && window.DPI > 0) ? window.DPI : 96;
        this.#dpiScale = sysDpi / 96;

        let p = fb.ProfilePath || '';
        if (p && !p.endsWith('\\') && !p.endsWith('/')) p += '\\';
        this.#profileBase = p;
        DiscSpinController.DEFAULTS.bezelFolder = `${this.#profileBase}skins\\overlay`;

        this.#loadProperties();
        this.#loadCustomFolders();
    }

    scale(size) {
        return Math.round(size * this.#dpiScale);
    }

    init() {
        this.#lifecycle = DiscSpinController.LIFECYCLE.INIT;
        this.#isPaused  = fb.IsPaused;
        this.#needsFullRepaint = true;

        this.loadBezel();

        if (window.Width > 0 && window.Height > 0) {
            this.#updateGeometry(window.Width, window.Height);
        }
        this.#rebuildOverlay();

        // Promote to LIVE only after state initialization is complete
        this.#lifecycle = DiscSpinController.LIFECYCLE.LIVE;
        window.Repaint();

        // Startup load balancing: defer disk and database operations past the first paint
        window.SetTimeout(() => {
            if (this.#lifecycle === DiscSpinController.LIFECYCLE.SHUTDOWN) return;
            if (fb.IsPlaying) {
                this.loadArtworkForTrack(this.#getSafeHandle(null), false);
            } else {
                this.restoreLastAlbum();
            }
        }, 0);
    }

    static sanitizeConfig(raw, fallback = DiscSpinController.DEFAULTS) {
        return SettingsSchema.sanitize(raw, fallback);
    }

    #loadProperties() {
        this.config = SettingsSchema.loadProperties(DiscSpinController.DEFAULTS);
    }

    #loadCustomFolders() {
        this.#scanner.clearCaches();
        try {
            const raw = window.GetProperty('RP.CustomFolders', '[]');
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
        window.SetProperty('RP.CustomFolders', JSON.stringify(this.#customFolders));
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
                const dotIdx = f.lastIndexOf('.');
                if (dotIdx === -1) return false;
                const ext = f.substring(dotIdx).toLowerCase();
                return DiscSpinController.BEZEL_EXTS.includes(ext);
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
        for (const ext of DiscSpinController.BEZEL_EXTS) {
            if (lower.endsWith(ext) && utils.IsFile(`${base}${name}`)) return `${base}${name}`;
        }
        for (const ext of DiscSpinController.BEZEL_EXTS) {
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
            if (this.#lifecycle === DiscSpinController.LIFECYCLE.SHUTDOWN || bezelToken !== this.#bezelLoadToken || !this.config.bezelEnabled) {
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
            this.#rebuildOverlay();
            this.#needsFullRepaint = true;
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
                this.#needsFullRepaint = true;
                window.Repaint();
            }, 1500);
            this.#needsFullRepaint = true;
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
        this.#rebuildOverlay();
        this.requestSave();

        this.#needsFullRepaint = true;

        if (this.#bezelNotifyTimeout) window.ClearTimeout(this.#bezelNotifyTimeout);
        this.#bezelNotifyTimeout = window.SetTimeout(() => {
            this.#bezelNotifyText = '';
            this.#bezelNotifyTimeout = null;
            this.#needsFullRepaint = true;
            window.Repaint();
        }, 1500);

        window.Repaint();
    }

    #updateScaledDisc() {
        if (this.#scaledDiscBmp) {
            try { this.#scaledDiscBmp.Dispose(); } catch {}
            this.#scaledDiscBmp = null;
        }

        if (!this.#discImg || this.#discImg.Width <= 0 || this.#discImg.Height <= 0) return;

        try {
            if (this.config.useAlbumArtOnly) {
                const targetW = this.#geom.drawW, targetH = this.#geom.drawH;
                if (targetW > 0 && targetH > 0) {
                    this.#scaledDiscBmp = this.#discImg.Resize(targetW, targetH);
                }
            } else {
                const targetSize = this.#geom.discSize;
                if (targetSize > 0) {
                    this.#scaledDiscBmp = this.#discImg.Resize(targetSize, targetSize);
                }
            }
        } catch {
            this.#scaledDiscBmp = null;
        }
    }

    updateDiscArtwork() {
        if (this.#discImg) { try { this.#discImg.Dispose(); } catch {} this.#discImg = null; }
        const activeSrc = this.config.useAlbumArtOnly ? (this.#coverImg || this.#discImgSource) : (this.#discImgSource || this.#coverImg);
        if (!activeSrc) {
            this.#updateScaledDisc();
            this.#rebuildBackground();
            return;
        }

        if (this.config.useAlbumArtOnly) {
            this.#discImg = activeSrc.Clone(0, 0, activeSrc.Width, activeSrc.Height);
        } else {
            const discBaseSize = Math.floor(this.config.maxImageSize / 2) * 2;
            const square = this.#discProc.normalizeSquare(activeSrc, discBaseSize, this.config.interpolationMode);
            if (!square) {
                this.#updateScaledDisc();
                this.#rebuildBackground();
                return;
            }
            const rimPath = `${this.#profileBase}skins\\center_album_rim.png`;
            this.#discImg = this.#discProc.processDisc(square, discBaseSize, this.#isDedicated, this.config.maskType, this.config.interpolationMode, rimPath);
        }

        if (window.Width > 0 && window.Height > 0) {
            this.#geom.valid = false;
            this.#updateGeometry(window.Width, window.Height);
        } else {
            this.#updateScaledDisc();
        }

        this.#rebuildBackground();
    }

    #refreshGlow() {
        const glowTargetSize = this.config.useAlbumArtOnly ? Math.max(this.#geom.drawW, this.#geom.drawH) : this.#geom.discSize;
        this.#backdrop.rebuildGlow(
            glowTargetSize,
            this.config.showGlow,
            this.config.opGlow,
            this.config.overlayAllOff
        );
    }

    #updateGeometry(w, h) {
        if (this.#geom.valid && this.#geom.w === w && this.#geom.h === h) return;
        this.#geom.w = w;
        this.#geom.h = h;

        const activePad = this.config.useAlbumArtOnly ? this.config.albumPadding : this.config.discPadding;
        const base = this.scale(activePad) + this.scale(this.config.borderSize);
        const availW = Math.max(10, w - base * 2 - this.scale(this.config.padLeft) - this.scale(this.config.padRight));
        const availH = Math.max(10, h - base * 2 - this.scale(this.config.padTop) - this.scale(this.config.padBottom));

        this.#geom.discSize = Math.floor(Math.min(availW, availH) / 2) * 2;
        const activeImg = this.#discImg || this.#coverImg || this.#discImgSource;

        if (this.config.useAlbumArtOnly && activeImg) {
            let drawW = availW, drawH = availH;
            if (this.config.keepAspectRatio && activeImg.Width > 0 && activeImg.Height > 0) {
                const ratio = Math.min(availW / activeImg.Width, availH / activeImg.Height);
                drawW = Math.max(1, Math.floor(activeImg.Width * ratio));
                drawH = Math.max(1, Math.floor(activeImg.Height * ratio));
            }
            this.#geom.drawX = Math.floor(this.scale(this.config.padLeft) + base + (availW - drawW) / 2);
            this.#geom.drawY = Math.floor(this.scale(this.config.padTop) + base + (availH - drawH) / 2);
            this.#geom.drawW = drawW;
            this.#geom.drawH = drawH;
            this.#refreshGlow();
            this.#geom.gx = Math.floor(this.#geom.drawX + (drawW - this.#backdrop.glowSize) / 2);
            this.#geom.gy = Math.floor(this.#geom.drawY + (drawH - this.#backdrop.glowSize) / 2);
        } else {
            this.#geom.dx = Math.floor(this.scale(this.config.padLeft) + base + (availW - this.#geom.discSize) / 2);
            this.#geom.dy = Math.floor(this.scale(this.config.padTop) + base + (availH - this.#geom.discSize) / 2);
            this.#refreshGlow();
            this.#geom.gx = Math.floor(this.#geom.dx + (this.#geom.discSize - this.#backdrop.glowSize) / 2);
            this.#geom.gy = Math.floor(this.#geom.dy + (this.#geom.discSize - this.#backdrop.glowSize) / 2);
        }

        this.#geom.valid = true;
        this.#updateScaledDisc();
    }

    #rebuildBackground() {
        const activeBackdrop = this.#coverImg || this.#discImgSource;
        this.#backdrop.rebuildBlur(
            activeBackdrop,
            window.Width,
            window.Height,
            this.config.backgroundEnabled && this.config.blurEnabled && !this.config.useAlbumArtOnly,
            this.config.blurRadius,
            this.config.bgUseUIColor,
            this.config.interpolationMode
        );
        this.#backdrop.rebuildCache(
            window.Width,
            window.Height,
            this.config.bgUseUIColor,
            this.config.customBgColor,
            this.config.backgroundEnabled && !this.config.useAlbumArtOnly,
            this.config.darkenValue,
            this.#getSafeUIColour(),
            this.config.interpolationMode
        );
    }

    #rebuildOverlay() {
        const themeColor = this.config.phosphorTheme === DiscSpinController.PHOSPHOR_THEMES.length
            ? this.config.customPhosphorColor
            : DiscSpinController.PHOSPHOR_THEMES[this.config.phosphorTheme].color;

        this.#backdrop.rebuildOverlay(
            window.Width,
            window.Height,
            { ...this.config, phosphorColor: themeColor },
            this.#bezelBmp,
            this.#dpiScale
        );
    }

    autoDetectMask(filePath) {
        if (this.config.userOverrideMask) return;
        this.config.maskType = (filePath && this.#scanner.isVinylDisc(filePath)) ? 1 : 0;
    }

    applyLoadedArtwork(discPath, coverPath, folder = '', expectedToken = null) {
        if ((discPath || '') === this.#currentDiscPath && (coverPath || '') === this.#currentCoverPath && (this.#discImgSource || this.#coverImg)) {
            if (fb.IsPlaying && !this.#isPaused && this.config.spinningEnabled && !this.config.useAlbumArtOnly && !this.#spinTimer) {
                this.startSpinTimer();
            }
            return;
        }

        const loadToken = expectedToken ?? ++this.#artSearchToken;
        if (!discPath && !coverPath) {
            this.loadDefaultArt(loadToken);
            return;
        }

        Promise.all([
            discPath  ? this.#imgLoader.load(discPath)  : Promise.resolve(null),
            coverPath ? this.#imgLoader.load(coverPath) : Promise.resolve(null)
        ]).then(([discImg, coverImg]) => {
            if (this.#lifecycle !== DiscSpinController.LIFECYCLE.LIVE || loadToken !== this.#artSearchToken) {
                if (discImg)  { try { discImg.Dispose(); }  catch {} }
                if (coverImg) { try { coverImg.Dispose(); } catch {} }
                return;
            }

            this.#discProc.clearNormalizedCache();
            if (this.#discImg)       { try { this.#discImg.Dispose(); }       catch {} this.#discImg = null; }
            if (this.#scaledDiscBmp) { try { this.#scaledDiscBmp.Dispose(); } catch {} this.#scaledDiscBmp = null; }
            if (this.#discImgSource) { try { this.#discImgSource.Dispose(); } catch {} this.#discImgSource = null; }
            if (this.#coverImg)      { try { this.#coverImg.Dispose(); }      catch {} this.#coverImg = null; }

            this.#isDedicated = false;
            this.#isDefault   = false;
            this.#currentCoverPath = '';
            this.#currentDiscPath  = '';

            this.autoDetectMask(discImg ? discPath : null);

            if (discImg) {
                this.#discImgSource   = discImg;
                this.#isDedicated     = true;
                this.#currentDiscPath = discPath;
            }

            if (coverImg) {
                this.#coverImg         = coverImg;
                this.#currentCoverPath = coverPath;
            }

            if (!this.#discImgSource && this.#coverImg) {
                try {
                    this.#discImgSource = this.#coverImg.Clone(0, 0, this.#coverImg.Width, this.#coverImg.Height);
                    this.#isDedicated = false;
                } catch {
                    this.#discImgSource = null;
                }
            }

            if (this.#discImgSource && !this.#coverImg) {
                try {
                    this.#coverImg = this.#discImgSource.Clone(0, 0, this.#discImgSource.Width, this.#discImgSource.Height);
                } catch {
                    this.#coverImg = null;
                }
            }

            if (folder) {
                window.SetProperty('RP.SavedFolder', folder);
                window.SetProperty('Last Folder Path', folder);
            }

            if (this.#discImgSource || this.#coverImg) {
                this.updateDiscArtwork();
                this.#needsFullRepaint = true;
                this.startSpinTimer();
                window.Repaint();
            } else {
                this.loadDefaultArt(loadToken);
            }
        });
    }

    loadArtworkForTrack(metadb, isTrackChange = false) {
        const handle = this.#getSafeHandle(metadb);
        const trackPath = handle?.Path ?? '';

        if (!handle || !trackPath) {
            this.#currentTrackPath = '';
            this.#currentArtKey = '';
            this.#currentMetaStr = '';
            if (!this.#discImgSource && !this.#coverImg) this.loadDefaultArt();
            this.#needsFullRepaint = true;
            window.Repaint();
            return;
        }

        let trackDir = '', rawArtist = '', rawAlbum = '', rawFolder = '', rawDisc = '', rawAlbArtist = '';
        let raw = '';
        try {
            raw = this.#tf.compound.EvalWithMetadb(handle) ?? '';
            const parts = raw.split('\x01');
            trackDir     = parts[0] ?? '';
            rawArtist    = parts[1] ?? '';
            rawAlbum     = parts[2] ?? '';
            rawFolder    = parts[3] ?? '';
            rawDisc      = (parts[4] ?? '').trim();
            rawAlbArtist = parts[5] ?? '';
        } catch {}

        const artKey = this.#scanner.getArtworkIdentityKey(trackDir, rawAlbum, rawDisc, trackPath);

        if (this.#currentArtKey && artKey === this.#currentArtKey && (this.#discImgSource || this.#coverImg)) {
            this.#currentTrackPath = trackPath;
            this.#currentMetaStr = raw;
            if (fb.IsPlaying && !this.#isPaused && this.config.spinningEnabled && !this.config.useAlbumArtOnly && !this.#spinTimer) {
                this.startSpinTimer();
            }
            return;
        }

        // Keep existing artwork visible until the new image finishes loading
        this.#currentArtKey    = artKey;
        this.#currentTrackPath = trackPath;
        this.#currentMetaStr   = raw;

        const thisToken = ++this.#artSearchToken;
        this.#expectedAsyncToken = 0;
        this.#expectedAsyncRawPath = '';

        const cached = this.#scanner.getMemoryCache(artKey);
        if (cached) {
            if (cached.isNone) {
                this.loadDefaultArt(thisToken);
                return;
            }
            if (cached.embedded) {
                try {
                    const asyncHandle = this.#getSafeHandle(handle);
                    if (asyncHandle) {
                        this.#expectedAsyncToken = thisToken;
                        this.#expectedAsyncRawPath = asyncHandle.RawPath || '';
                        utils.GetAlbumArtAsync(window.ID, asyncHandle, 0, false, false, false);
                        return;
                    }
                } catch {}
                this.loadDefaultArt(thisToken);
                return;
            }
            this.applyLoadedArtwork(cached.disc, cached.cover, trackDir, thisToken);
            return;
        }

        if (this.#pendingSearchTimer) { window.ClearTimeout(this.#pendingSearchTimer); this.#pendingSearchTimer = null; }
        this.#pendingSearchTimer = window.SetTimeout(() => {
            this.#pendingSearchTimer = null;
            if (thisToken !== this.#artSearchToken || this.#lifecycle !== DiscSpinController.LIFECYCLE.LIVE) return;

            let discPath = null;
            let coverPath = null;

            if (trackDir && utils.IsDirectory(trackDir)) {
                const fast = this.#scanner.getFastDiscAndCover(trackDir);
                discPath  = fast.disc;
                coverPath = fast.cover;
                if (discPath && coverPath) {
                    this.#scanner.setMemoryCache(artKey, { disc: discPath, cover: coverPath });
                    this.applyLoadedArtwork(discPath, coverPath, trackDir, thisToken);
                    return;
                }
            }

            const deadline = Date.now() + 25;
            const artistVariants = this.#scanner.cleanVariants(rawArtist);
            if (rawAlbArtist && rawAlbArtist !== rawArtist) {
                for (const v of this.#scanner.cleanVariants(rawAlbArtist)) {
                    if (!artistVariants.includes(v)) artistVariants.push(v);
                }
            }
            const albumVariants  = this.#scanner.cleanVariants(rawAlbum);
            const folderVariants = this.#scanner.cleanVariants(rawFolder);

            const specificCoverPatterns = [];
            const specificDiscPatterns  = [];

            for (const art of artistVariants) {
                for (const alb of albumVariants) {
                    specificCoverPatterns.push(`${art} - ${alb}`, `${art}_${alb}`, `${art} ${alb}`, `${alb} - ${art}`);
                    specificDiscPatterns.push(
                        `${art} - ${alb} - disc`, `${art} - ${alb} - cd`,
                        `${art} - ${alb}_disc`, `${art} - ${alb} disc`,
                        `${art}_${alb}_disc`, `${art} - ${alb}`
                    );
                    if (rawDisc) {
                        specificDiscPatterns.push(
                            `${art} - ${alb} - cd${rawDisc}`, `${art} - ${alb} - disc${rawDisc}`,
                            `${art} - ${alb}_cd${rawDisc}`, `${art} - ${alb}_disc${rawDisc}`
                        );
                    }
                }
            }

            for (const alb of albumVariants) {
                specificCoverPatterns.push(alb);
                specificDiscPatterns.push(`${alb} - disc`, `${alb} disc`, `${alb}_disc`);
            }
            for (const art of artistVariants) {
                specificCoverPatterns.push(art);
                specificDiscPatterns.push(`${art} - disc`, `${art} disc`, `${art}_disc`, art);
            }
            if (rawDisc) {
                specificDiscPatterns.push(`disc${rawDisc}`, `disc ${rawDisc}`, `disc_${rawDisc}`, `cd${rawDisc}`, `cd ${rawDisc}`, `cd_${rawDisc}`);
            }

            if ((!discPath || !coverPath) && trackDir && utils.IsDirectory(trackDir) && Date.now() <= deadline) {
                const localRes = this.#scanner.searchDirectory(trackDir, specificDiscPatterns, specificCoverPatterns, true, false, this.config.customFolderDepth, deadline);
                discPath  ||= localRes.disc;
                coverPath ||= localRes.cover;

                if ((!discPath || !coverPath) && Date.now() <= deadline) {
                    const parentDir = trackDir.replace(ArtScanner.MULTI_DISC_PARENT_RE, '');
                    if (parentDir && parentDir !== trackDir && utils.IsDirectory(parentDir)) {
                        const parentRes = this.#scanner.searchDirectory(parentDir, specificDiscPatterns, specificCoverPatterns, true, false, this.config.customFolderDepth, deadline);
                        discPath  ||= parentRes.disc;
                        coverPath ||= parentRes.cover;
                    }
                }
            }

            if ((!discPath || !coverPath) && this.#customFolders.length > 0 && Date.now() <= deadline) {
                for (const cFolder of this.#customFolders) {
                    if (Date.now() > deadline) break;
                    const res = this.#scanner.findInCustomFolder(
                        cFolder, artistVariants, albumVariants, folderVariants,
                        specificDiscPatterns, specificCoverPatterns, this.config.customFolderDepth,
                        deadline, !discPath, !coverPath
                    );
                    discPath  ||= res.disc;
                    coverPath ||= res.cover;
                    if (discPath && coverPath) break;
                }
            }

            if (thisToken !== this.#artSearchToken || this.#lifecycle !== DiscSpinController.LIFECYCLE.LIVE) return;

            if (discPath || coverPath) {
                this.#scanner.setMemoryCache(artKey, { disc: discPath, cover: coverPath });
                this.#expectedAsyncToken = 0;
                this.#expectedAsyncRawPath = '';
                this.applyLoadedArtwork(discPath, coverPath, trackDir, thisToken);
            } else {
                try {
                    const asyncHandle = this.#getSafeHandle(handle);
                    if (asyncHandle) {
                        this.#expectedAsyncToken = thisToken;
                        this.#expectedAsyncRawPath = asyncHandle.RawPath || '';
                        utils.GetAlbumArtAsync(window.ID, asyncHandle, 0, false, false, false);
                    } else {
                        this.loadDefaultArt(thisToken);
                    }
                } catch {
                    this.loadDefaultArt(thisToken);
                }
            }
        }, 15);
    }

    onAlbumArtDone(handle, art_id, image, image_path) {
        if (this.#lifecycle !== DiscSpinController.LIFECYCLE.LIVE) {
            if (image) { try { image.Dispose(); } catch {} }
            return;
        }

        if (!this.#expectedAsyncToken || this.#expectedAsyncToken !== this.#artSearchToken ||
            (this.#expectedAsyncRawPath && handle?.RawPath && handle.RawPath !== this.#expectedAsyncRawPath)) {
            if (image) { try { image.Dispose(); } catch {} }
            return;
        }
        this.#expectedAsyncToken = 0;
        this.#expectedAsyncRawPath = '';

        if (image) {
            this.#discProc.clearNormalizedCache();
            if (this.#discImg)       { try { this.#discImg.Dispose(); }       catch {} this.#discImg = null; }
            if (this.#scaledDiscBmp) { try { this.#scaledDiscBmp.Dispose(); } catch {} this.#scaledDiscBmp = null; }
            if (this.#discImgSource) { try { this.#discImgSource.Dispose(); } catch {} this.#discImgSource = null; }
            if (this.#coverImg)      { try { this.#coverImg.Dispose(); }      catch {} this.#coverImg = null; }

            this.autoDetectMask(null);
            this.#coverImg      = image;
            this.#discImgSource = image.Clone(0, 0, image.Width, image.Height);
            this.#isDedicated   = false;
            this.#isDefault     = false;
            this.#currentDiscPath  = '';
            this.#currentCoverPath = image_path || '';

            if (this.#currentArtKey) {
                if (this.#scanner.isImageFilePath(this.#currentCoverPath)) {
                    this.#scanner.setMemoryCache(this.#currentArtKey, { disc: null, cover: this.#currentCoverPath });
                } else {
                    this.#scanner.setMemoryCache(this.#currentArtKey, { embedded: true });
                }
            }

            this.updateDiscArtwork();
            this.#needsFullRepaint = true;
            if (fb.IsPlaying && !this.#isPaused) this.startSpinTimer();
            window.Repaint();
        } else {
            if (this.#currentArtKey) {
                this.#scanner.setMemoryCache(this.#currentArtKey, { isNone: true });
            }
            this.loadDefaultArt(this.#artSearchToken);
        }
    }

    onLoadImageDone(cookie, image) {
        if (this.#lifecycle === DiscSpinController.LIFECYCLE.SHUTDOWN) {
            if (image) { try { image.Dispose(); } catch {} }
            return;
        }
        if (!this.#imgLoader.onLoadImageDone(cookie, image)) {
            if (image) { try { image.Dispose(); } catch {} }
        }
    }

    #applyProceduralDefaultDisc() {
        const norm = Math.floor(this.config.maxImageSize / 2) * 2;
        const proc = this.#discProc.buildProceduralDefaultDisc(norm);
        if (proc) {
            this.#discImgSource = proc;
            try { this.#coverImg = proc.Clone(0, 0, proc.Width, proc.Height); } catch { this.#coverImg = null; }
            this.#isDedicated = true;
            this.#isDefault   = true;
        }
        this.updateDiscArtwork();
        this.#needsFullRepaint = true;
        this.startSpinTimer();
        window.Repaint();
    }

    loadDefaultArt(expectedToken = null) {
        if (this.#isDefault && this.#discImgSource && this.#coverImg) {
            if (fb.IsPlaying && !this.#isPaused) this.startSpinTimer();
            this.#needsFullRepaint = true;
            window.Repaint();
            return;
        }

        const token = expectedToken ?? ++this.#artSearchToken;

        this.#discProc.clearNormalizedCache();
        if (this.#discImg)       { try { this.#discImg.Dispose(); }       catch {} this.#discImg = null; }
        if (this.#scaledDiscBmp) { try { this.#scaledDiscBmp.Dispose(); } catch {} this.#scaledDiscBmp = null; }
        if (this.#discImgSource) { try { this.#discImgSource.Dispose(); } catch {} this.#discImgSource = null; }
        if (this.#coverImg)      { try { this.#coverImg.Dispose(); }      catch {} this.#coverImg = null; }

        this.#currentCoverPath = '';
        this.#currentDiscPath  = '';
        this.autoDetectMask(null);

        const defaultDiscPath = `${this.#profileBase}skins\\default_disc.png`;
        if (utils.IsFile(defaultDiscPath)) {
            this.#imgLoader.load(defaultDiscPath).then((img) => {
                if (this.#lifecycle !== DiscSpinController.LIFECYCLE.LIVE || token !== this.#artSearchToken) {
                    if (img) { try { img.Dispose(); } catch {} }
                    return;
                }
                if (img) {
                    this.#discImgSource = img;
                    try { this.#coverImg = img.Clone(0, 0, img.Width, img.Height); } catch { this.#coverImg = null; }
                    this.#isDedicated = true;
                    this.#isDefault   = true;
                    this.updateDiscArtwork();
                    this.#needsFullRepaint = true;
                    this.startSpinTimer();
                    window.Repaint();
                } else {
                    this.#applyProceduralDefaultDisc();
                }
            });
            return;
        }

        this.#applyProceduralDefaultDisc();
    }

    restoreLastAlbum() {
        const target = window.GetProperty('RP.SavedFolder', '') ||
                       window.GetProperty('Last Folder Path', '') ||
                       window.GetProperty('Library.SavedFolder', '') ||
                       window.GetProperty('Library Last Folder Path', '');

        if (target && utils.IsDirectory(target)) {
            const h = this.#findHandleForFolder(target);
            if (h) {
                this.loadArtworkForTrack(h, false);
                return;
            }
            const res = this.#scanner.searchDirectory(target, ArtScanner.FAST_DISC, ArtScanner.FAST_COVER, true, false, this.config.customFolderDepth);
            if (res.disc || res.cover) {
                this.applyLoadedArtwork(res.disc, res.cover, target);
                return;
            }
        }

        const sel = this.#getSafeHandle(null);
        if (sel) {
            this.loadArtworkForTrack(sel, false);
        } else {
            this.loadDefaultArt();
        }
    }

    clearTrackDisplay() {
        this.#currentTrackPath = '';
        this.#currentCoverPath = '';
        this.#currentDiscPath  = '';
        this.#currentArtKey    = '';
        this.#currentMetaStr   = '';
        this.#artSearchToken++;
        this.#expectedAsyncToken = 0;
        if (this.#pendingSearchTimer) {
            window.ClearTimeout(this.#pendingSearchTimer);
            this.#pendingSearchTimer = null;
        }
        this.loadDefaultArt(this.#artSearchToken);
    }
	
startSpinTimer() {
        this.stopSpinTimer();
        if (!this.config.spinningEnabled || this.config.useAlbumArtOnly || !fb.IsPlaying || this.#isPaused || this.#lifecycle !== DiscSpinController.LIFECYCLE.LIVE) {
            return;
        }

        // Suspend immediately if the window is currently hidden
        if (!window.IsVisible) {
            this.#wasHidden = true;
            return;
        }

        this.#lastSpinTime = Date.now();
        const interval = (this.config.spinFPS === 30) ? 33 : 16;
        const speedDegPerSec = this.config.spinSpeed * 30;

        this.#spinTimer = window.SetInterval(() => {
            if (this.#lifecycle !== DiscSpinController.LIFECYCLE.LIVE || !fb.IsPlaying || this.#isPaused) { 
                this.stopSpinTimer(); 
                return; 
            }

            // True Zero-Idle: Halt timer execution completely when hidden or minimized
            if (!window.IsVisible) {
                this.#wasHidden = true;
                this.stopSpinTimer();
                return;
            }

            const now = Date.now();
            const deltaSec = (now - this.#lastSpinTime) / 1000;
            this.#lastSpinTime = now;

            if (deltaSec > 0 && deltaSec < 0.25) {
                this.#angle = (this.#angle + (speedDegPerSec * deltaSec)) % 360;
                this.#requestRender();
            }
        }, interval);
    }

    stopSpinTimer() {
        if (this.#spinTimer) {
            window.ClearInterval(this.#spinTimer);
            this.#spinTimer = null;
        }
        this.#lastSpinTime = 0;
    }

    #requestRender() {
        if (!window.IsVisible) return;

        if (!this.#geom.valid || this.#needsFullRepaint || this.#bezelNotifyText || this.#opacityTarget) {
            window.Repaint();
            return;
        }

        const cache = this.#backdrop.cacheBmp;
        if (!cache || cache.Width !== window.Width || cache.Height !== window.Height) {
            this.#needsFullRepaint = true;
            window.Repaint();
            return;
        }

        if (this.config.useAlbumArtOnly) {
            window.RepaintRect(this.#geom.drawX, this.#geom.drawY, this.#geom.drawW, this.#geom.drawH);
            return;
        }

        // 2px+ safety margin prevents 1px bilinear anti-aliasing edge fringe on rotation
        const pad = Math.max(2, this.scale(2));
        const rx = Math.max(0, this.#geom.dx - pad);
        const ry = Math.max(0, this.#geom.dy - pad);
        const rw = Math.min(window.Width - rx, this.#geom.discSize + pad * 2);
        const rh = Math.min(window.Height - ry, this.#geom.discSize + pad * 2);

        window.RepaintRect(rx, ry, rw, rh);
    }

    onPaint(gr) {
        if (this.#lifecycle !== DiscSpinController.LIFECYCLE.LIVE || !window.IsVisible) return;
        const w = window.Width, h = window.Height;
        if (!gr || w <= 0 || h <= 0) return;

        // Wake up timer if restoring from minimized or hidden state
        if (this.#wasHidden) {
            this.#wasHidden = false;
            this.#needsFullRepaint = true;
            if (fb.IsPlaying && !this.#isPaused && this.config.spinningEnabled && !this.config.useAlbumArtOnly) {
                this.startSpinTimer();
            }
        }

        this.#updateGeometry(w, h);

        const renderBmp = this.#scaledDiscBmp || this.#discImg;
        const cache = this.#backdrop.cacheBmp;
        const overlay = this.#backdrop.overlayBmp;

        const bgSizeMatches = Boolean(cache && cache.Width === w && cache.Height === h);
        const ovSizeMatches = Boolean(!overlay || (overlay.Width === w && overlay.Height === h));

        // Rebuild cached surfaces if invalid
        if (!bgSizeMatches) {
            this.#rebuildBackground();
        }
        if (!ovSizeMatches) {
            this.#rebuildOverlay();
        }

        // Full-stack unified render: Windows GDI+ hardware-clips to discBox during RepaintRect
        if (this.#backdrop.cacheBmp) {
            gr.DrawImage(this.#backdrop.cacheBmp, 0, 0, w, h, 0, 0, this.#backdrop.cacheBmp.Width, this.#backdrop.cacheBmp.Height);
        } else {
            gr.FillSolidRect(0, 0, w, h, this.config.customBgColor >>> 0);
        }

        if (renderBmp && renderBmp.Width > 0 && renderBmp.Height > 0) {
            gr.SetSmoothingMode(2);
            gr.SetInterpolationMode(this.config.interpolationMode === 0 ? 2 : this.config.interpolationMode);

            if (this.config.useAlbumArtOnly) {
                if (this.config.showGlow && this.config.opGlow > 0 && !this.config.overlayAllOff && this.#backdrop.glowBmp) {
                    gr.DrawImage(this.#backdrop.glowBmp, this.#geom.gx, this.#geom.gy, this.#backdrop.glowSize, this.#backdrop.glowSize, 0, 0, this.#backdrop.glowBmp.Width, this.#backdrop.glowBmp.Height);
                }
                gr.DrawImage(renderBmp, this.#geom.drawX, this.#geom.drawY, this.#geom.drawW, this.#geom.drawH, 0, 0, renderBmp.Width, renderBmp.Height);
            } else {
                if (this.config.showGlow && this.config.opGlow > 0 && !this.config.overlayAllOff && this.#backdrop.glowBmp) {
                    gr.DrawImage(this.#backdrop.glowBmp, this.#geom.gx, this.#geom.gy, this.#backdrop.glowSize, this.#backdrop.glowSize, 0, 0, this.#backdrop.glowBmp.Width, this.#backdrop.glowBmp.Height);
                }
                gr.DrawImage(renderBmp, this.#geom.dx, this.#geom.dy, this.#geom.discSize, this.#geom.discSize, 0, 0, renderBmp.Width, renderBmp.Height, this.config.spinningEnabled ? this.#angle : 0, 255);
            }
        }

        if (this.#backdrop.overlayBmp) {
            gr.DrawImage(this.#backdrop.overlayBmp, 0, 0, w, h, 0, 0, this.#backdrop.overlayBmp.Width, this.#backdrop.overlayBmp.Height);
        }

        if (this.#opacityTarget) {
            this.#drawSliderHud(gr, w, h);
        } else if (this.#bezelNotifyText) {
            this.#drawBezelToast(gr, w, h);
        }

        this.#needsFullRepaint = false;
    }

    #drawSliderHud(gr, w, h) {
        const barW = Math.min(this.scale(220), Math.round(w * 0.6));
        const barH = Math.max(4, this.scale(6));
        const bx = Math.floor((w - barW) / 2);
        const by = h - Math.max(16, this.scale(24));
        const font = this.getHudFont();
        const val = this.getOpacity(this.#opacityTarget);
        const label = `${this.#opacityTarget}: ${val}`;
        const lH = Math.max(16, this.scale(20));

        gr.FillSolidRect(bx, by, barW, barH, GdiUtils.setAlpha(GdiUtils.RGB(255, 255, 255), 60));
        gr.FillSolidRect(bx, by, Math.floor(barW * (val / 255)), barH, GdiUtils.setAlpha(GdiUtils.RGB(255, 255, 255), 180));
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

    onSize() {
        if (this.#lifecycle !== DiscSpinController.LIFECYCLE.LIVE) return;
        const w = window.Width, h = window.Height;
        if (w <= 0 || h <= 0) {
            this.#wasHidden = true;
            return;
        }

        this.#needsFullRepaint = true;
        this.#geom.valid = false;

        this.#updateGeometry(w, h);
        this.updateDiscArtwork();
        this.#rebuildBackground();
        this.#rebuildOverlay();
        window.Repaint();
    }

    onFocus(isFocused) {
        if (this.#lifecycle !== DiscSpinController.LIFECYCLE.LIVE) return;
        if (isFocused) {
            this.#needsFullRepaint = true;
            window.Repaint();
        }
    }

    onMouseMove() {
        if (this.#lifecycle !== DiscSpinController.LIFECYCLE.LIVE) return;
        if (this.#wasHidden) {
            this.#wasHidden = false;
            this.#needsFullRepaint = true;
            window.Repaint();
        }
    }

    onPause(status) {
        if (this.#lifecycle !== DiscSpinController.LIFECYCLE.LIVE) return;
        this.#isPaused = Boolean(status);
        if (this.#isPaused) {
            this.stopSpinTimer();
        } else {
            this.startSpinTimer();
        }
        this.#needsFullRepaint = true;
        window.Repaint();
    }

    onStop(reason) {
        if (this.#lifecycle !== DiscSpinController.LIFECYCLE.LIVE) return;
        this.stopSpinTimer();
        if (reason !== 2) {
            this.#isPaused = false;
            this.#angle = 0;
            this.restoreLastAlbum();
            this.#needsFullRepaint = true;
            window.Repaint();
        }
    }

    onPlaybackStarting() {
        this.#isPaused = false;
        this.#needsFullRepaint = true;
        this.startSpinTimer();
    }

    refreshColours() {
        if (this.config.bgUseUIColor) {
            this.#rebuildBackground();
            this.#needsFullRepaint = true;
            window.Repaint();
        }
    }

    onFontChanged() {
        if (this.#hudFont?.Dispose) {
            try { this.#hudFont.Dispose(); } catch {}
        }
        this.#hudFont = null;
        if (this.#lifecycle === DiscSpinController.LIFECYCLE.LIVE) {
            this.#needsFullRepaint = true;
            window.Repaint();
        }
    }

    getOpacity(target) {
        switch (target) {
            case 'Reflection': return this.config.opReflection;
            case 'Glow':       return this.config.opGlow;
            case 'Scanlines':  return this.config.opScanlines;
            case 'Phosphor':   return this.config.opPhosphor;
            default:           return 255;
        }
    }

    setOpacity(target, val) {
        const clamped = GdiUtils.clamp(val, 0, 255);
        switch (target) {
            case 'Reflection': this.config.opReflection = clamped; break;
            case 'Glow':
                this.config.opGlow = clamped;
                this.#geom.valid = false;
                this.#refreshGlow();
                break;
            case 'Scanlines':  this.config.opScanlines  = clamped; break;
            case 'Phosphor':   this.config.opPhosphor   = clamped; break;
        }
        this.#rebuildOverlay();
        this.requestSave();
        this.#needsFullRepaint = true;
        window.Repaint();
    }

    onMouseWheel(step) {
        if (this.#lifecycle !== DiscSpinController.LIFECYCLE.LIVE) return false;
        if (this.#opacityTarget) {
            this.setOpacity(this.#opacityTarget, this.getOpacity(this.#opacityTarget) + (step > 0 ? 5 : -5));
            return true;
        }
        return false;
    }

    setOpacityTarget(target) {
        if (this.#opacityTarget === target) return;
        this.#opacityTarget = target;
        this.#needsFullRepaint = true;
        window.Repaint();
    }

    loadPreset(slot) {
        if (slot < 1 || slot > 3) return;
        const raw = window.GetProperty(`Disc.Preset${slot}`, null);
        if (!raw) return;
        try {
            const parsed = JSON.parse(raw);
            const sourceConfig = (parsed && parsed.version === 2) ? parsed.config : parsed;
            this.config = DiscSpinController.sanitizeConfig(sourceConfig, this.config);

            this.#discProc.clearNormalizedCache();
            this.#scanner.clearCaches();
            this.loadBezel();
            this.#geom.valid = false;
            if (window.Width > 0 && window.Height > 0) this.#updateGeometry(window.Width, window.Height);
            this.updateDiscArtwork();
            this.#rebuildBackground();
            this.#rebuildOverlay();
            this.startSpinTimer();
            this.requestSave();
            this.#needsFullRepaint = true;
            window.Repaint();
        } catch (err) {
            console.log(`Failed to load preset ${slot}: ${err}`);
        }
    }

    savePreset(slot) {
        if (slot < 1 || slot > 3) return;
        const payload = {
            version: 2,
            config: this.config
        };
        window.SetProperty(`Disc.Preset${slot}`, JSON.stringify(payload));
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

    #getAlbumRootFolder(dir) {
        if (!dir) return '';
        return dir.replace(ArtScanner.MULTI_DISC_PARENT_RE, '').replace(/[\\/]+$/, '').toLowerCase();
    }

    #isHandleInFolder(handle, folder) {
        if (!handle || !folder || !this.#tf.dirPath) return false;
        const trackDir = (this.#tf.dirPath.EvalWithMetadb(handle) || '').toLowerCase().replace(/[\\/]+$/, '');
        const targetDir = folder.toLowerCase().replace(/[\\/]+$/, '');
        if (!trackDir || !targetDir) return false;
        return trackDir === targetDir || trackDir.startsWith(targetDir + '\\') || this.#getAlbumRootFolder(trackDir) === this.#getAlbumRootFolder(targetDir);
    }

    #findHandleForFolder(folder) {
        if (!folder) return null;
        try {
            const playing = fb.GetNowPlaying();
            if (playing && this.#isHandleInFolder(playing, folder)) return playing;
        } catch {}

        try {
            const sel = fb.GetSelection();
            if (sel && this.#isHandleInFolder(sel, folder)) return sel;
        } catch {}

        return null;
    }

    onNotifyData(name, info) {
        if (this.#lifecycle !== DiscSpinController.LIFECYCLE.LIVE) return;
        if (name === 'ArtFolder' && info && !fb.IsPlaying) {
            if (!utils.IsDirectory(info)) return;

            const h = this.#findHandleForFolder(info);
            if (h) {
                this.loadArtworkForTrack(h, false);
                return;
            }

            const thisToken = ++this.#artSearchToken;
            this.#expectedAsyncToken = 0;
            if (this.#pendingSearchTimer) { window.ClearTimeout(this.#pendingSearchTimer); this.#pendingSearchTimer = null; }

            this.#pendingSearchTimer = window.SetTimeout(() => {
                this.#pendingSearchTimer = null;
                if (thisToken !== this.#artSearchToken || this.#lifecycle !== DiscSpinController.LIFECYCLE.LIVE || fb.IsPlaying) return;

                const res = this.#scanner.searchDirectory(info, ArtScanner.FAST_DISC, ArtScanner.FAST_COVER, true, false, this.config.customFolderDepth);
                if (thisToken !== this.#artSearchToken || this.#lifecycle !== DiscSpinController.LIFECYCLE.LIVE || fb.IsPlaying) return;

                if (res.disc || res.cover) {
                    this.applyLoadedArtwork(res.disc, res.cover, info, thisToken);
                }
            }, 30);
        }
    }

    onKeyDown(vkey) {
        if (this.#lifecycle !== DiscSpinController.LIFECYCLE.LIVE) return false;
        if (vkey === 0x1B) { // Esc
            if (this.#opacityTarget) {
                this.#opacityTarget = null;
                this.#needsFullRepaint = true;
                window.Repaint();
                return true;
            }
        }
        if (utils.IsKeyPressed(0x11) && !utils.IsKeyPressed(0x10) && !utils.IsKeyPressed(0x12)) {
            if (vkey === 0x26) { this.cycleBezel(-1); return true; } // Ctrl+Up
            if (vkey === 0x28) { this.cycleBezel(1);  return true; } // Ctrl+Down
        }
        return false;
    }

    // ========================================================================================
    // CONTEXT MENU (DECLARATIVE MENU BUILDER)
    // ========================================================================================
    showContextMenu(x, y) {
        if (this.#opacityTarget) {
            this.#opacityTarget = null;
            this.#needsFullRepaint = true;
            window.Repaint();
        }

        const cfg = this.config;
        const m = new MenuBuilder();
        const SIZES = [250, 500, 750, 1000];
        const bezelNames = this.listBezelNames();

        const reloadCurrentArtwork = () => {
            this.#scanner.clearCaches();
            this.#currentArtKey = '';
            if (fb.IsPlaying) this.loadArtworkForTrack(fb.GetNowPlaying());
            else this.restoreLastAlbum();
        };

        m.addItem('Album Art Only (Static)', () => {
            cfg.useAlbumArtOnly = !cfg.useAlbumArtOnly;
            this.#geom.valid = false;
            this.updateDiscArtwork();
            this.startSpinTimer();
            this.#rebuildOverlay();
        }, { checked: cfg.useAlbumArtOnly });

        m.addItem('Spinning Enabled', () => {
            cfg.spinningEnabled = !cfg.spinningEnabled;
            this.startSpinTimer();
        }, { checked: cfg.spinningEnabled });

        m.addItem('Keep Aspect Ratio', () => {
            cfg.keepAspectRatio = !cfg.keepAspectRatio;
            this.#geom.valid = false;
            this.#updateGeometry(window.Width, window.Height);
        }, { checked: cfg.keepAspectRatio });

        m.addSeparator();

        // Disc Settings
        m.addSubMenu('Disc Settings', (discM) => {
            discM.addSubMenu('Rotation Speed', (speedM) => {
                [1.0, 2.0, 3.0, 4.0, 5.0].forEach((spd) => {
                    speedM.addItem(`${spd.toFixed(1)}x Speed`, () => {
                        cfg.spinSpeed = spd;
                        this.startSpinTimer();
                    }, { radio: cfg.spinSpeed === spd });
                });
            });

            discM.addSubMenu('Frame Rate', (fpsM) => {
                fpsM.addItem('30 FPS (Power Saver)', () => { cfg.spinFPS = 30; this.startSpinTimer(); }, { radio: cfg.spinFPS === 30 });
                fpsM.addItem('60 FPS (Ultra Smooth)', () => { cfg.spinFPS = 60; this.startSpinTimer(); }, { radio: cfg.spinFPS === 60 });
            });

            discM.addSubMenu('Mask Type', (maskM) => {
                DiscSpinController.MASK_TYPES.forEach((mt) => {
                    maskM.addItem(mt.name, () => {
                        cfg.maskType = mt.id;
                        cfg.userOverrideMask = true;
                        this.updateDiscArtwork();
                    }, { radio: cfg.maskType === mt.id });
                });
                maskM.addSeparator();
                maskM.addItem('Lock Selected Mask (Disable Auto-Detect)', () => {
                    cfg.userOverrideMask = !cfg.userOverrideMask;
                    if (!cfg.userOverrideMask) {
                        this.autoDetectMask(this.#currentDiscPath);
                        this.updateDiscArtwork();
                    }
                }, { checked: cfg.userOverrideMask });
            });

            discM.addSubMenu('Scaling Quality', (interpM) => {
                ['Nearest Neighbor (Fastest)', 'Low Quality', 'Bilinear (High Quality)'].forEach((name, i) => {
                    interpM.addItem(name, () => {
                        cfg.interpolationMode = i;
                        this.updateDiscArtwork();
                    }, { radio: cfg.interpolationMode === i });
                });
            });

            discM.addSubMenu('Base Disc Size', (sizeM) => {
                SIZES.forEach((sz) => {
                    sizeM.addItem(`Base Size: ${sz}px`, () => {
                        cfg.maxImageSize = sz;
                        this.#discProc.clearNormalizedCache();
                        this.updateDiscArtwork();
                    }, { radio: cfg.maxImageSize === sz });
                });
                sizeM.addSeparator();
                sizeM.addItem(`Custom Base Size... (${cfg.maxImageSize}px)`, () => {
                    const val = GdiUtils.prompt('Enter base disc size in pixels (125-2000):', 'Base Disc Size', cfg.maxImageSize);
                    if (val !== null && val.trim() !== '') {
                        const n = parseInt(val, 10);
                        if (!Number.isNaN(n)) {
                            cfg.maxImageSize = GdiUtils.clamp(n, 125, 2000);
                            this.#discProc.clearNormalizedCache();
                            this.updateDiscArtwork();
                        }
                    }
                }, { radio: !SIZES.includes(cfg.maxImageSize) });
            });
        });

        // Appearance
        m.addSubMenu('Appearance', (overlayM) => {
            overlayM.addSubMenu('Bezel / Overlay', (bzM) => {
                bzM.addItem('Enable Bezel Frame', () => {
                    cfg.bezelEnabled = !cfg.bezelEnabled;
                    if (cfg.bezelEnabled && !cfg.bezelFile && bezelNames.length > 0) {
                        cfg.bezelFile = bezelNames[0];
                    }
                    this.loadBezel();
                    this.#rebuildOverlay();
                }, { checked: cfg.bezelEnabled });

                bzM.addSeparator();
                const curClean = (cfg.bezelFile || '').toLowerCase().replace(/\.[^/.]+$/, '');
                const currentBzIdx = (cfg.bezelEnabled && curClean)
                    ? bezelNames.findIndex(n => n.toLowerCase() === curClean)
                    : -1;

                bzM.addItem('None (No Bezel)', () => {
                    cfg.bezelEnabled = false;
                    cfg.bezelFile = '';
                    this.loadBezel();
                    this.#rebuildOverlay();
                }, { radio: currentBzIdx === -1 });

                if (bezelNames.length > 0) {
                    bzM.addSeparator();
                    bezelNames.forEach((name, bi) => {
                        bzM.addItem(GdiUtils.escapeMenuLabel(name), () => {
                            cfg.bezelEnabled = true;
                            cfg.bezelFile = name;
                            this.loadBezel();
                            this.#rebuildOverlay();
                        }, { radio: currentBzIdx === bi });
                    });
                }

                bzM.addSeparator();
                bzM.addItem('Set Bezel Folder...', () => {
                    const f = GdiUtils.prompt('Enter folder path containing bezel/overlay images:', 'Set Bezel Folder', cfg.bezelFolder);
                    if (f) {
                        const cleaned = GdiUtils.sanitizePath(f);
                        if (cleaned && utils.IsDirectory(cleaned)) {
                            cfg.bezelFolder = cleaned;
                            this.#cachedBezelImages = null;
                            this.loadBezel();
                            this.#rebuildOverlay();
                            this.saveAll();
                        }
                    }
                });
                bzM.addItem('Reload Bezel List', () => {
                    this.#cachedBezelImages = null;
                    this.loadBezel();
                    this.#rebuildOverlay();
                    this.saveAll();
                });

                bzM.addSeparator();
                const promptPad = (label, key) => {
                    const val = GdiUtils.prompt(`Enter ${label} padding in pixels (0-100):`, 'Per-Side Padding', cfg[key]);
                    if (val !== null && val.trim() !== '') {
                        const n = parseInt(val, 10);
                        if (!Number.isNaN(n)) {
                            cfg[key] = GdiUtils.clamp(n, 0, 100);
                            this.#geom.valid = false;
                            this.#updateGeometry(window.Width, window.Height);
                        }
                    }
                };
                bzM.addItem(`Left Padding... (${cfg.padLeft}px)`, () => promptPad('left', 'padLeft'));
                bzM.addItem(`Right Padding... (${cfg.padRight}px)`, () => promptPad('right', 'padRight'));
                bzM.addItem(`Top Padding... (${cfg.padTop}px)`, () => promptPad('top', 'padTop'));
                bzM.addItem(`Bottom Padding... (${cfg.padBottom}px)`, () => promptPad('bottom', 'padBottom'));
            });

            overlayM.addSubMenu('Phosphor Palette', (phosphorM) => {
                DiscSpinController.PHOSPHOR_THEMES.forEach((pt, i) => {
                    phosphorM.addItem(pt.name, () => {
                        cfg.phosphorTheme = i;
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
                        cfg.phosphorTheme = DiscSpinController.PHOSPHOR_THEMES.length;
                        this.#rebuildOverlay();
                    }
                }, { radio: cfg.phosphorTheme === DiscSpinController.PHOSPHOR_THEMES.length });
            });

            overlayM.addSeparator();
            overlayM.addItem('Disable All Overlays', () => {
                cfg.overlayAllOff = !cfg.overlayAllOff;
                this.#refreshGlow();
                this.#rebuildOverlay();
            }, { checked: cfg.overlayAllOff });

            overlayM.addSeparator();
            overlayM.addItem('Reflection Highlight', () => {
                cfg.showReflection = !cfg.showReflection;
                this.#rebuildOverlay();
            }, { checked: cfg.showReflection });
            overlayM.addItem('CRT Outer Glow', () => {
                cfg.showGlow = !cfg.showGlow;
                this.#geom.valid = false;
                this.#refreshGlow();
            }, { checked: cfg.showGlow });
            overlayM.addItem('CRT Scanlines', () => {
                cfg.showScanlines = !cfg.showScanlines;
                this.#rebuildOverlay();
            }, { checked: cfg.showScanlines });
            overlayM.addItem('Phosphor Mask', () => {
                cfg.showPhosphor = !cfg.showPhosphor;
                this.#rebuildOverlay();
            }, { checked: cfg.showPhosphor });

            overlayM.addSeparator();
            overlayM.addSubMenu('Adjust Opacities', (opacityM) => {
                opacityM.addItem(`Reflection Opacity... (${this.getOpacity('Reflection')})`, () => this.setOpacityTarget('Reflection'));
                opacityM.addItem(`Glow Opacity... (${this.getOpacity('Glow')})`, () => this.setOpacityTarget('Glow'));
                opacityM.addItem(`Scanlines Opacity... (${this.getOpacity('Scanlines')})`, () => this.setOpacityTarget('Scanlines'));
                opacityM.addItem(`Phosphor Opacity... (${this.getOpacity('Phosphor')})`, () => this.setOpacityTarget('Phosphor'));
            });
        });

        // Border and Padding
        m.addSubMenu('Border and Padding', (borderM) => {
            borderM.addItem(`Set Border Size... (${cfg.borderSize}px)`, () => {
                const val = GdiUtils.prompt('Enter border thickness (0-50 px):', 'Border Size', cfg.borderSize);
                if (val !== null && val.trim() !== '') {
                    const n = parseInt(val, 10);
                    if (!Number.isNaN(n)) {
                        cfg.borderSize = GdiUtils.clamp(n, 0, 50);
                        this.#geom.valid = false;
                        this.#updateGeometry(window.Width, window.Height);
                        this.#rebuildOverlay();
                    }
                }
            });
            borderM.addItem('Change Border Color...', () => {
                const c = utils.ColourPicker(window.ID, cfg.borderColor);
                if (c !== -1) {
                    cfg.borderColor = (c | 0xFF000000) >>> 0;
                    this.#rebuildOverlay();
                }
            });
            borderM.addSeparator();
            borderM.addItem(`Set Disc Padding... (${cfg.discPadding}px)`, () => {
                const val = GdiUtils.prompt('Enter disc padding (0-100 px):', 'Disc Padding', cfg.discPadding);
                if (val !== null && val.trim() !== '') {
                    const n = parseInt(val, 10);
                    if (!Number.isNaN(n)) {
                        cfg.discPadding = GdiUtils.clamp(n, 0, 100);
                        this.#geom.valid = false;
                        this.#updateGeometry(window.Width, window.Height);
                        this.updateDiscArtwork();
                    }
                }
            });
            borderM.addItem(`Set Album Art Padding... (${cfg.albumPadding}px)`, () => {
                const val = GdiUtils.prompt('Enter album art padding (0-100 px):', 'Album Art Padding', cfg.albumPadding);
                if (val !== null && val.trim() !== '') {
                    const n = parseInt(val, 10);
                    if (!Number.isNaN(n)) {
                        cfg.albumPadding = GdiUtils.clamp(n, 0, 100);
                        this.#geom.valid = false;
                        this.#updateGeometry(window.Width, window.Height);
                        this.updateDiscArtwork();
                    }
                }
            });
        });

        // Background
        m.addSubMenu('Background', (bgM) => {
            bgM.addItem('Use UI Color', () => { cfg.bgUseUIColor = !cfg.bgUseUIColor; this.#rebuildBackground(); }, { checked: cfg.bgUseUIColor });
            bgM.addItem('Enable Background Art', () => { cfg.backgroundEnabled = !cfg.backgroundEnabled; this.#rebuildBackground(); }, { checked: cfg.backgroundEnabled });
            bgM.addItem('Enable Blurred Backdrop', () => { cfg.blurEnabled = !cfg.blurEnabled; this.#rebuildBackground(); }, { checked: cfg.blurEnabled });
            bgM.addItem('Custom Background Color...', () => {
                const c = utils.ColourPicker(window.ID, cfg.customBgColor);
                if (c !== -1) {
                    cfg.customBgColor = (c | 0xFF000000) >>> 0;
                    this.#rebuildBackground();
                }
            });
            bgM.addSeparator();
            bgM.addSubMenu('Blur Radius', (blurM) => {
                [20, 60, 100, 140, 180, 220, 240, 254].forEach((rad) => {
                    blurM.addItem(`Blur Radius: ${rad}`, () => {
                        cfg.blurRadius = rad;
                        this.#rebuildBackground();
                    }, { radio: cfg.blurRadius === rad });
                });
            });
            bgM.addSubMenu('Darken Backdrop', (darkenM) => {
                [0, 10, 20, 30, 40, 50].forEach((pct) => {
                    darkenM.addItem(`Darken ${pct}%`, () => {
                        cfg.darkenValue = pct;
                        this.#rebuildBackground();
                    }, { radio: cfg.darkenValue === pct });
                });
            });
        });

        // Custom Artwork Folders
        m.addSubMenu('Custom Artwork Folders', (customFM) => {
            customFM.addItem('Add Custom Folder Path...', () => {
                const f = GdiUtils.prompt('Enter folder path for artwork search:', 'Add Custom Artwork Folder', '');
                if (f) {
                    const cleaned = GdiUtils.sanitizePath(f);
                    if (cleaned && utils.IsDirectory(cleaned)) {
                        this.#customFolders.push(cleaned);
                        this.saveAll();
                        reloadCurrentArtwork();
                    }
                }
            });
            customFM.addSeparator();
            customFM.addSubMenu('Folder Match Depth', (depthM) => {
                [1, 2, 3, 4].forEach((d) => {
                    depthM.addItem(`${d} Sub-folder${d > 1 ? 's' : ''} Deep`, () => {
                        cfg.customFolderDepth = d;
                        this.saveAll();
                        reloadCurrentArtwork();
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
                        reloadCurrentArtwork();
                    });
                });
                customFM.addSeparator();
                customFM.addItem('Clear All Custom Folders', () => {
                    this.#customFolders = [];
                    this.saveAll();
                    reloadCurrentArtwork();
                });
            }
        });

        // Presets
        m.addSubMenu('Presets', (presetM) => {
            presetM.addSubMenu('Load Preset', (loadM) => {
                [1, 2, 3].forEach((i) => {
                    const hasPreset = Boolean(window.GetProperty(`Disc.Preset${i}`, null));
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
        m.addItem('Clear Image Cache & Reload', () => {
            this.#scanner.clearCaches();
            this.#discProc.clearNormalizedCache();
            this.#cachedBezelImages = null;
            this.#currentCoverPath = '';
            this.#currentDiscPath = '';
            this.#currentArtKey = '';
            this.loadBezel();
            if (fb.IsPlaying) this.loadArtworkForTrack(fb.GetNowPlaying(), false);
            else this.restoreLastAlbum();
        });
        m.addItem('Reset Visual Settings to Defaults', () => {
            this.config = SettingsSchema.reset(this.config, { includeResetAll: false, defaults: DiscSpinController.DEFAULTS });
            this.#scanner.clearCaches();
            this.#discProc.clearNormalizedCache();
            this.#geom.valid = false;
            if (window.Width > 0 && window.Height > 0) this.#updateGeometry(window.Width, window.Height);
            this.updateDiscArtwork();
            this.#rebuildBackground();
            this.loadBezel();
            this.#rebuildOverlay();
            this.startSpinTimer();
        });
        m.addItem('Factory Reset (All Settings & Folders)...', () => {
            const confirm = GdiUtils.prompt('Type YES to reset all settings, custom folders and paths to factory defaults:', 'Confirm Factory Reset', '');
            if (confirm?.toUpperCase() === 'YES') {
                this.#customFolders = [];
                for (let p = 1; p <= 3; p++) window.SetProperty(`Disc.Preset${p}`, null);
                this.config = SettingsSchema.reset(this.config, { includeResetAll: true, defaults: DiscSpinController.DEFAULTS });
                this.config.bezelFolder = `${this.#profileBase}skins\\overlay`;
                this.#scanner.clearCaches();
                this.#discProc.clearNormalizedCache();
                this.#cachedBezelImages = null;
                this.saveAll();
                this.loadBezel();
                this.#geom.valid = false;
                if (window.Width > 0 && window.Height > 0) this.#updateGeometry(window.Width, window.Height);
                this.#rebuildOverlay();
                this.loadArtworkForTrack(this.#getSafeHandle(null), false);
            }
        });

        const selected = m.track(x, y);
        if (selected === 0) return true;

        this.requestSave();
        this.#needsFullRepaint = true;
        window.Repaint();
        return true;
    }

    dispose() {
        this.saveAll();
        this.#lifecycle = DiscSpinController.LIFECYCLE.SHUTDOWN;
        this.#artSearchToken++;
        this.#bezelLoadToken++;
        this.#imgLoader.clear();
        this.stopSpinTimer();

        if (this.#saveTimeout)        window.ClearTimeout(this.#saveTimeout);
        if (this.#bezelNotifyTimeout) window.ClearTimeout(this.#bezelNotifyTimeout);
        if (this.#pendingSearchTimer) window.ClearTimeout(this.#pendingSearchTimer);

        // Explicit nullification ensures internal handles are released cleanly
        if (this.#discImg)       { try { this.#discImg.Dispose(); }       catch {} this.#discImg = null; }
        if (this.#scaledDiscBmp) { try { this.#scaledDiscBmp.Dispose(); } catch {} this.#scaledDiscBmp = null; }
        if (this.#discImgSource) { try { this.#discImgSource.Dispose(); } catch {} this.#discImgSource = null; }
        if (this.#coverImg)      { try { this.#coverImg.Dispose(); }      catch {} this.#coverImg = null; }
        if (this.#bezelBmp)      { try { this.#bezelBmp.Dispose(); }      catch {} this.#bezelBmp = null; }
        if (this.#hudFont?.Dispose) { try { this.#hudFont.Dispose(); } catch {} }
        this.#hudFont = null;

        this.#backdrop.dispose();
        this.#discProc.dispose();
        this.#scanner.clearCaches();
    }
}

// ============================================================================================
// 6. SMP GLOBAL CALLBACK DISPATCH
// ============================================================================================
const app = new DiscSpinController();

function on_paint(gr) {
    app.onPaint(gr);
}

function on_size() {
    app.onSize();
}

function on_focus(is_focused) {
    app.onFocus(is_focused);
}

function on_mouse_move() {
    app.onMouseMove();
}

function on_playback_new_track(metadb) {
    app.loadArtworkForTrack(metadb, true);
}

function on_playback_starting() {
    app.onPlaybackStarting();
}

function on_playback_pause(status) {
    app.onPause(status);
}

function on_playback_stop(reason) {
    app.onStop(reason);
}

function on_playback_seek() {
    if (fb.IsPlaying) app.startSpinTimer();
}

function on_selection_changed() {
    if (fb.IsPlaying) return;
    try {
        const sel = fb.GetSelection();
        app.loadArtworkForTrack(sel?.Path ? sel : null, false);
    } catch {
        app.loadArtworkForTrack(null, false);
    }
}

function on_item_focus_change() {
    if (fb.IsPlaying) return;
    try {
        const sel = fb.GetSelection();
        if (sel?.Path) app.loadArtworkForTrack(sel, false);
    } catch {}
}

function on_colours_changed() {
    app.refreshColours();
}

function on_font_changed() {
    app.onFontChanged();
}

function on_metadb_changed(handle_list, fromhook) {
    if (fromhook || !fb.IsPlaying || !handle_list) return;
    try {
        const np = fb.GetNowPlaying();
        if (np && handle_list.Find(np) !== -1) app.loadArtworkForTrack(np, false);
    } catch {}
}

function on_get_album_art_done(handle, art_id, image, image_path) {
    app.onAlbumArtDone(handle, art_id, image, image_path);
}

function on_load_image_done(cookie, image, image_path) {
    app.onLoadImageDone(cookie, image, image_path);
}

function on_notify_data(name, info) {
    app.onNotifyData(name, info);
}

function on_mouse_wheel(step) {
    return app.onMouseWheel(step);
}

function on_mouse_rbtn_up(x, y, mask) {
    if (mask & 4) return false;
    return app.showContextMenu(x, y);
}

function on_mouse_lbtn_up() {
    app.setOpacityTarget(null);
}

function on_key_down(vkey) {
    return app.onKeyDown(vkey);
}

function on_script_unload() {
    app.dispose();
}

// Initialize Controller
app.init();