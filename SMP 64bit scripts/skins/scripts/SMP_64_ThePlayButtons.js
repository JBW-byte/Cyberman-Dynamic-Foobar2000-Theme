'use strict';

           // ============== AUTHOR L.E.D. ============== \\
          // ==-== 	  Audio PlayBack Buttons v2.9    ==-== \\
         // ========== PlayBack and Custom Sets =========== \\

  // ===================*** Foobar2000 64bit ***================== \\
 // ======= For Spider Monkey Panel 64bit, author: marc2003 ======= \\
// ===  Developed from samples Playback Buttons, author:marc2003 === \\

/* 
 * Custom License for foobar2000 Themes
 * Copyright (c) 2026 [L.E.D.]
 * Allowed: Non-commercial use and modification.
 * Prohibited: Paid themes, subscriptions, or cloud-bundled services.
 */

window.DefineScript('Playback Buttons Pro', { 
    author: 'L.E.D.', 
    version: '2.9', 
    features: { grab_focus: true } 
});

if ('DrawMode' in window) window.DrawMode = 0; // 0 = GDI+, 1 = Direct2D
window.DlgCode = 0x0004; // DLGC_WANTALLKEYS

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

    static RGBA(r, g, b, a) {
        const clampedA = (a < 0 ? 0 : a > 255 ? 255 : a) & 0xFF;
        return ((clampedA << 24) | ((r & 0xFF) << 16) | ((g & 0xFF) << 8) | (b & 0xFF)) >>> 0;
    }

    static toRGB(color) {
        return [(color >>> 16) & 0xFF, (color >>> 8) & 0xFF, color & 0xFF];
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

    static tintImage(img, tintColour) {
        if (!img || img.Width <= 0 || img.Height <= 0) return null;
        const w = img.Width;
        const h = img.Height;
        let bmp = null;
        let mask = null;
        let inverted = null;
        try {
            let isLight = true;
            try {
                const scheme = img.GetColourScheme(1);
                if (Array.isArray(scheme) && scheme.length > 0) {
                    const [r, g, b] = this.toRGB(scheme[0]);
                    isLight = (0.299 * r + 0.587 * g + 0.114 * b) >= 128;
                }
            } catch {}

            let maskSrc = img;
            if (isLight && typeof img.Clone === 'function') {
                try {
                    inverted = img.Clone(0, 0, w, h);
                    if (inverted && typeof inverted.InvertColours === 'function') {
                        inverted.InvertColours();
                        maskSrc = inverted;
                    }
                } catch {
                    maskSrc = img;
                }
            }

            mask = gdi.CreateImage(w, h);
            const mg = mask.GetGraphics();
            try {
                mg.FillSolidRect(0, 0, w, h, this.RGB(255, 255, 255));
                mg.SetInterpolationMode(7);
                mg.DrawImage(maskSrc, 0, 0, w, h, 0, 0, w, h, 0, 255);
            } finally {
                mask.ReleaseGraphics(mg);
            }

            bmp = gdi.CreateImage(w, h);
            const g = bmp.GetGraphics();
            try {
                const rgb = this.toRGB(tintColour);
                g.FillSolidRect(0, 0, w, h, this.RGBA(rgb[0], rgb[1], rgb[2], 255));
            } finally {
                bmp.ReleaseGraphics(g);
            }
            bmp.ApplyMask(mask);
            return bmp;
        } catch {
            if (bmp) { try { bmp.Dispose(); } catch {} }
            return null;
        } finally {
            if (mask) { try { mask.Dispose(); } catch {} }
            if (inverted) { try { inverted.Dispose(); } catch {} }
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
        { key: 'btnSize',       prop: 'Buttons: Size',                                          type: 'int',   def: 128, min: 16, max: 512, group: 'style' },
        { key: 'paddingGap',    prop: 'Buttons: Padding Gap',                                   type: 'int',   def: 0,   min: 0,  max: 300, group: 'style' },
        { key: 'paddingBorder', prop: 'Buttons: Padding Border',                                type: 'int',   def: 0,   min: 0,  max: 300, group: 'style' },
        { key: 'alignV',        prop: 'Buttons: Vertical Alignment (0=Top, 1=Middle, 2=Bottom)',type: 'int',   def: 1,   min: 0,  max: 2,   group: 'style' },
        { key: 'alignH',        prop: 'Buttons: Horizontal Alignment (0=Left, 1=Centre, 2=Right)',type: 'int',  def: 1,   min: 0,  max: 2,   group: 'style' },
        { key: 'sizeMode',      prop: 'Buttons: Size Mode',                                     type: 'int',   def: 1,   min: 0,  max: 2,   group: 'style' },
        { key: 'stretchFill',   prop: 'Buttons: Stretch Fill',                                  type: 'bool',  def: false, group: 'style' },
        { key: 'useTint',       prop: 'Colors: Use Tint',                                       type: 'bool',  def: false, group: 'style' },
        { key: 'colorNormal',   prop: 'Colors: Normal',                                         type: 'color', def: GdiUtils.RGB(255, 255, 255), group: 'style' },
        { key: 'colorHover',    prop: 'Colors: Hover',                                          type: 'color', def: GdiUtils.RGB(150, 150, 150), group: 'style' },
        { key: 'colorDown',     prop: 'Colors: Down',                                           type: 'color', def: GdiUtils.RGB(100, 100, 100), group: 'style' },
        { key: 'useBgColor',    prop: 'Colors: Use Background',                                 type: 'bool',  def: true,  group: 'style' },
        { key: 'bgColor',       prop: 'Colors: Background',                                     type: 'color', def: GdiUtils.RGB(32, 32, 32), group: 'style' },

        { key: 'buttonStyle',   prop: 'Buttons: Style',                                         type: 'str',   def: '',    group: 'meta',  resetAll: true },

        { key: 'padLeft',       prop: 'Buttons: Pad Left',                                      type: 'int',   def: 4,   min: 0,  max: 100, group: 'bezel' },
        { key: 'padRight',      prop: 'Buttons: Pad Right',                                     type: 'int',   def: 4,   min: 0,  max: 100, group: 'bezel' },
        { key: 'padTop',        prop: 'Buttons: Pad Top',                                       type: 'int',   def: 4,   min: 0,  max: 100, group: 'bezel' },
        { key: 'padBottom',     prop: 'Buttons: Pad Bottom',                                    type: 'int',   def: 4,   min: 0,  max: 100, group: 'bezel' },
        { key: 'bezelFolder',   prop: 'Buttons: Bezel Folder',                                  type: 'path',  def: '',    group: 'bezel', resetAll: true, fallbackToDef: true },
        { key: 'bezelEnabled',  prop: 'Buttons: Bezel Enabled',                                 type: 'bool',  def: false, group: 'bezel' },
        { key: 'bezelFile',     prop: 'Buttons: Bezel File',                                    type: 'str',   def: '',    group: 'bezel' }
    ];

    static #byKey = new Map(SettingsSchema.FIELDS.map(f => [f.key, f]));

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
            case 'color': {
                const n = Number(raw);
                return Number.isFinite(n) ? (n >>> 0) : fallback;
            }
            case 'path': {
                const s = GdiUtils.sanitizePath(String(raw || ''));
                return f.fallbackToDef ? (s || fallback) : s;
            }
            default:
                return String(raw ?? fallback);
        }
    }

    static loadProperties(fallbackDefaults) {
        const out = {};
        for (const f of this.FIELDS) {
            const def = (fallbackDefaults && f.key in fallbackDefaults) ? fallbackDefaults[f.key] : f.def;
            out[f.key] = this.coerce(f, window.GetProperty(f.prop, def), def);
        }
        return out;
    }

    static setField(config, key, value) {
        const f = this.#byKey.get(key);
        if (!f) {
            config[key] = value;
            return value;
        }
        const coerced = this.coerce(f, value, config[key]);
        config[key] = coerced;
        window.SetProperty(f.prop, coerced);
        return coerced;
    }

    static saveGroup(config, groupName) {
        for (const f of this.FIELDS) {
            if (f.group === groupName && Object.prototype.hasOwnProperty.call(config, f.key)) {
                window.SetProperty(f.prop, config[f.key]);
            }
        }
    }

    static captureGroup(config, groupName) {
        const out = {};
        for (const f of this.FIELDS) {
            if (f.group === groupName) out[f.key] = config[f.key];
        }
        return out;
    }

    static applyGroup(config, raw, groupName) {
        if (!raw || typeof raw !== 'object') return;
        for (const f of this.FIELDS) {
            if (f.group === groupName && Object.prototype.hasOwnProperty.call(raw, f.key)) {
                config[f.key] = this.coerce(f, raw[f.key], config[f.key]);
            }
        }
    }
}

class FontRegistry {
    #cache = new Map();

    get(name, size, style = 0) {
        const s = Math.max(4, Math.round(size));
        const fontName = (typeof name === 'string' && name.trim().length > 0) ? name : 'Segoe UI';
        const key = `${fontName}_${s}_${style}`;

        let f = this.#cache.get(key);
        if (!f) {
            try { f = gdi.Font(fontName, s, style); } catch { f = null; }
            if (f) this.#cache.set(key, f);
        }
        return f;
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
// 2. PRE-SCALED BUTTON ENTITY (1:1 CACHE ARCHITECTURE)
// ============================================================================================
class PlayButton {
    id;
    baseName;
    onClick;
    tipText;
    state = 'normal';
    x = 0;
    y = 0;
    w = 0;
    h = 0;

    // Master source textures
    #sourceSlots = {
        primary:   { src: null, hoverSrc: null, downSrc: null, normal: null, hover: null, down: null },
        alternate: { src: null, hoverSrc: null, downSrc: null, normal: null, hover: null, down: null }
    };

    // Pre-baked exact 1:1 blit sprites
    #scaledSlots = {
        primary:           { normal: null, hover: null, down: null },
        alternate:         { normal: null, hover: null, down: null },
        fallback:          { normal: null, hover: null, down: null },
        fallbackAlternate: { normal: null, hover: null, down: null }
    };

    constructor(id, baseName, onClick, tipText) {
        this.id = id;
        this.baseName = baseName;
        this.onClick = onClick;
        this.tipText = tipText;
    }

    #freeScaledSlot(slot) {
        if (!slot) return;
        const disposed = new Set();
        for (const key of ['normal', 'hover', 'down']) {
            const bmp = slot[key];
            if (bmp && !disposed.has(bmp)) {
                disposed.add(bmp);
                try { bmp.Dispose(); } catch {}
            }
            slot[key] = null;
        }
    }

    #freeSourceSlot(slot) {
        if (!slot) return;
        const disposed = new Set();
        const free = (bmp) => {
            if (!bmp || disposed.has(bmp) || !bmp.Dispose) return;
            disposed.add(bmp);
            try { bmp.Dispose(); } catch {}
        };

        for (const k of ['normal', 'hover', 'down', 'src', 'hoverSrc', 'downSrc']) {
            if (slot[k]) free(slot[k]);
            slot[k] = null;
        }
    }

    dispose() {
        this.#freeScaledSlot(this.#scaledSlots.primary);
        this.#freeScaledSlot(this.#scaledSlots.alternate);
        this.#freeScaledSlot(this.#scaledSlots.fallback);
        this.#freeScaledSlot(this.#scaledSlots.fallbackAlternate);

        this.#freeSourceSlot(this.#sourceSlots.primary);
        this.#freeSourceSlot(this.#sourceSlots.alternate);
    }

    loadAssets(controller) {
        this.#loadSlot(this.baseName, this.#sourceSlots.primary, controller);
        if (this.id === 'play') {
            this.#loadSlot('pause', this.#sourceSlots.alternate, controller);
        }
        this.invalidateScaledCache();
    }

    #loadSlot(name, slot, controller) {
        this.#freeSourceSlot(slot);

        // 1. Primary source icon
        const primaryPath = controller.getButtonImagePath(name);
        if (primaryPath && utils.IsFile(primaryPath)) {
            try { slot.src = gdi.Image(primaryPath); } catch { slot.src = null; }
        }

        // 2. Scan for dedicated hover assets (_h, _hover, _hot)
        for (const suf of ['_h', '_hover', '_hot']) {
            const hPath = controller.getButtonImagePath(name, suf);
            if (hPath && utils.IsFile(hPath)) {
                try { slot.hoverSrc = gdi.Image(hPath); } catch { slot.hoverSrc = null; }
                if (slot.hoverSrc) break;
            }
        }

        // 3. Scan for dedicated down/click assets (_d, _down, _p, _pressed, _click)
        for (const suf of ['_d', '_down', '_p', '_pressed', '_click']) {
            const dPath = controller.getButtonImagePath(name, suf);
            if (dPath && utils.IsFile(dPath)) {
                try { slot.downSrc = gdi.Image(dPath); } catch { slot.downSrc = null; }
                if (slot.downSrc) break;
            }
        }

        // 4. Color tinting or raw state assignment
        if (slot.src) {
            if (controller.config.useTint) {
                slot.normal = GdiUtils.tintImage(slot.src, controller.config.colorNormal) || slot.src;
                slot.hover  = GdiUtils.tintImage(slot.hoverSrc || slot.src, controller.config.colorHover) || slot.hoverSrc || slot.src;
                slot.down   = GdiUtils.tintImage(slot.downSrc  || slot.src, controller.config.colorDown)  || slot.downSrc  || slot.src;
            } else {
                slot.normal = slot.src;
                slot.hover  = slot.hoverSrc || null;
                slot.down   = slot.downSrc  || null;
            }
        }
    }

    invalidateScaledCache() {
        this.#freeScaledSlot(this.#scaledSlots.primary);
        this.#freeScaledSlot(this.#scaledSlots.alternate);
        this.#freeScaledSlot(this.#scaledSlots.fallback);
        this.#freeScaledSlot(this.#scaledSlots.fallbackAlternate);
    }

    updateBounds(x, y, w, h, controller) {
        const boundsChanged = (this.w !== w || this.h !== h);
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;

        // Re-bake only if bounds changed OR neither primary nor fallback sprites exist yet
        if (boundsChanged || (!this.#scaledSlots.primary.normal && !this.#scaledSlots.fallback.normal)) {
            this.#bakeSprites(controller);
        }
    }

    #bakeSprites(controller) {
        this.invalidateScaledCache();
        if (this.w <= 0 || this.h <= 0) return;

        const bakeSlot = (srcSlot, destSlot) => {
            if (!srcSlot.src || srcSlot.src.Width <= 0 || srcSlot.src.Height <= 0) return false;

            const hasDedicatedHover = Boolean(srcSlot.hover);
            const hasDedicatedDown  = Boolean(srcSlot.down);

            for (const key of ['normal', 'hover', 'down']) {
                let srcBmp = srcSlot[key] || srcSlot.normal || srcSlot.src;
                if (!srcBmp) continue;

                let bmp = null;
                try {
                    bmp = gdi.CreateImage(this.w, this.h);
                    const g = bmp.GetGraphics();
                    try {
                        g.SetInterpolationMode(7);

                        let opacity = 255;
                        let offX = 0, offY = 0;

                        if (!controller.config.useTint) {
                            if (key === 'normal' && !hasDedicatedHover) {
                                opacity = 215;
                            } else if (key === 'hover') {
                                opacity = 255;
                            } else if (key === 'down' && !hasDedicatedDown) {
                                opacity = 255;
                                offX = Math.max(1, controller.scale(1));
                                offY = Math.max(1, controller.scale(1));
                            }
                        }

                        if (controller.config.stretchFill) {
                            g.DrawImage(srcBmp, offX, offY, this.w, this.h, 0, 0, srcBmp.Width, srcBmp.Height, 0, opacity);
                        } else {
                            const s = Math.min(this.w / srcBmp.Width, this.h / srcBmp.Height);
                            const dw = Math.max(1, Math.floor(srcBmp.Width * s));
                            const dh = Math.max(1, Math.floor(srcBmp.Height * s));
                            const dx = Math.round((this.w - dw) / 2) + offX;
                            const dy = Math.round((this.h - dh) / 2) + offY;
                            g.DrawImage(srcBmp, dx, dy, dw, dh, 0, 0, srcBmp.Width, srcBmp.Height, 0, opacity);
                        }
                    } finally {
                        bmp.ReleaseGraphics(g);
                    }
                    destSlot[key] = bmp;
                } catch {
                    if (bmp) { try { bmp.Dispose(); } catch {} }
                    destSlot[key] = null;
                }
            }
            return Boolean(destSlot.normal);
        };

        const hasPrimary = bakeSlot(this.#sourceSlots.primary, this.#scaledSlots.primary);
        if (this.id === 'play') {
            bakeSlot(this.#sourceSlots.alternate, this.#scaledSlots.alternate);
        }

        if (!hasPrimary) {
            this.#bakeFallbackSprites(controller);
        }
    }

    #bakeFallbackSprites(controller) {
        const glyphMap = {
            stop:     '\u25A0',
            play:     '\u25B6',
            pause:    '\u23F8',
            previous: '\u23EE',
            next:     '\u23ED'
        };

        const fontSize = Math.max(12, Math.floor(Math.min(this.w, this.h) * 0.45));
        const font = controller.fonts.get('Segoe UI Symbol', fontSize, 0) || controller.fonts.get('Segoe UI', fontSize, 0);
        if (!font) return;

        let isLightBg = false;
        if (controller.config.useBgColor) {
            const [r, g, b] = GdiUtils.toRGB(controller.config.bgColor);
            isLightBg = (0.299 * r + 0.587 * g + 0.114 * b) >= 128;
        } else {
            isLightBg = (typeof window.IsDark === 'boolean' && !window.IsDark);
        }

        const defaultNormal = isLightBg ? GdiUtils.RGB(30, 30, 30)   : GdiUtils.RGB(255, 255, 255);
        const defaultHover  = isLightBg ? GdiUtils.RGB(100, 100, 100) : GdiUtils.RGB(150, 150, 150);
        const defaultDown   = isLightBg ? GdiUtils.RGB(160, 160, 160) : GdiUtils.RGB(100, 100, 100);

        const colors = {
            normal: controller.config.useTint ? controller.config.colorNormal : defaultNormal,
            hover:  controller.config.useTint ? controller.config.colorHover  : defaultHover,
            down:   controller.config.useTint ? controller.config.colorDown   : defaultDown
        };

        const renderGlyphs = (glyphChar, destSlot) => {
            if (!glyphChar) return;
            for (const key of ['normal', 'hover', 'down']) {
                let bmp = null;
                try {
                    bmp = gdi.CreateImage(this.w, this.h);
                    const g = bmp.GetGraphics();
                    try {
                        g.SetTextRenderingHint(4);
                        const off = (key === 'down') ? Math.max(1, controller.scale(1)) : 0;
                        g.DrawString(glyphChar, font, colors[key], off, off, this.w, this.h, 0x11000000);
                    } finally {
                        bmp.ReleaseGraphics(g);
                    }
                    destSlot[key] = bmp;
                } catch {
                    if (bmp) { try { bmp.Dispose(); } catch {} }
                    destSlot[key] = null;
                }
            }
        };

        renderGlyphs(glyphMap[this.id] || '', this.#scaledSlots.fallback);

        if (this.id === 'play') {
            renderGlyphs(glyphMap.pause, this.#scaledSlots.fallbackAlternate);
        }
    }

    contains(mx, my) {
        return mx >= this.x && mx <= this.x + this.w && my >= this.y && my <= this.y + this.h;
    }

    draw(gr) {
        if (this.w <= 0 || this.h <= 0) return;

        const isPlaying = fb.IsPlaying && !fb.IsPaused;
        let slot = this.#scaledSlots.primary;
        if (this.id === 'play' && isPlaying && this.#scaledSlots.alternate.normal) {
            slot = this.#scaledSlots.alternate;
        }

        let bakedImg = slot[this.state] || slot.normal;
        if (!bakedImg) {
            const fbSlot = (this.id === 'play' && isPlaying && this.#scaledSlots.fallbackAlternate.normal)
                ? this.#scaledSlots.fallbackAlternate
                : this.#scaledSlots.fallback;
            bakedImg = fbSlot[this.state] || fbSlot.normal;
        }

        if (bakedImg && bakedImg.Width > 0 && bakedImg.Height > 0) {
            gr.DrawImage(bakedImg, this.x, this.y, this.w, this.h, 0, 0, this.w, this.h, 0, 255);
        }
    }
}

// ============================================================================================
// 3. MAIN CONTROLLER & APPLICATION ENGINE
// ============================================================================================
class PlayButtonsController {
    static LIFECYCLE = { BOOT: 0, LIVE: 1, SHUTDOWN: 2 };

    static SIZE_PRESETS = { SMALL: 32, MEDIUM: 64, LARGE: 128, XL: 256 };
    static SIZE_MODE    = { FIXED: 0, FILL_WIDTH: 1, FIT_HEIGHT: 2 };
    static ALIGN        = { TOP: 0, MIDDLE: 1, BOTTOM: 2, LEFT: 0, CENTER: 1, RIGHT: 2 };
    static EXTENSIONS   = ['.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp'];

    static DEFAULTS = SettingsSchema.defaults();

    #lifecycle   = PlayButtonsController.LIFECYCLE.BOOT;
    #dpiScale    = 1;
    #profileBase = '';
    buttonsBaseDir = '';

    #items    = [];
    #hovered  = null;
    #pressed  = null;
    #tooltip  = null;
    #lastPlayingState = null;

    #bezelLoadToken    = 0;
    #bezelBmp          = null;
    #bezelLayerBmp     = null;
    #cachedBezelImages = null;
    #cachedBezelFolder = null;
    #cachedStyles      = null;

    #notifyText    = '';
    #notifyTimeout = null;
    #notifyFont    = null;

    #imgLoader = new AsyncImageLoader();
    fonts  = new FontRegistry();
    config = { ...PlayButtonsController.DEFAULTS };

    constructor() {
        const sysDpi = (typeof window.DPI === 'number' && window.DPI > 0) ? window.DPI : 96;
        this.#dpiScale = sysDpi / 96;

        let p = fb.ProfilePath || '';
        if (p && !p.endsWith('\\') && !p.endsWith('/')) p += '\\';
        this.#profileBase = p;
        PlayButtonsController.DEFAULTS.bezelFolder = `${this.#profileBase}skins\\overlay`;

        this.buttonsBaseDir = this.#resolveButtonsBaseDir();
        this.#loadProperties();
        const savedStyleCfg = this.#loadStyleConfig(this.config.buttonStyle);
        if (savedStyleCfg) SettingsSchema.applyGroup(this.config, savedStyleCfg, 'style');
    }

    scale(size) {
        return Math.round(size * this.#dpiScale);
    }

    init() {
        this.#lifecycle = PlayButtonsController.LIFECYCLE.LIVE;
        this.loadBezel();
        this.initButtons();
        this.updatePlayState();
        this.buildLayout(window.Width, window.Height);
        window.Repaint();

        window.SetTimeout(() => {
            if (this.#lifecycle === PlayButtonsController.LIFECYCLE.SHUTDOWN) return;
            this.buildLayout(window.Width, window.Height);
            window.Repaint();
        }, 0);
    }

    #getSafeUIColour() {
        try {
            return window.InstanceType === 1 ? window.GetColourDUI(1) : window.GetColourCUI(3);
        } catch {
            return GdiUtils.RGB(32, 32, 32);
        }
    }

    #loadProperties() {
        this.config = SettingsSchema.loadProperties(PlayButtonsController.DEFAULTS);
        this.config.buttonStyle = this.validateStyle(this.config.buttonStyle);
    }

    #saveCoreProperties() {
        SettingsSchema.saveGroup(this.config, 'style');
    }

    saveBezelConfig() {
        SettingsSchema.saveGroup(this.config, 'bezel');
    }

    #styleConfigKey(name) {
        return `Buttons: StyleCfg.${name === '' ? '__default__' : name}`;
    }

    saveStyleConfig(styleName) {
        try {
            window.SetProperty(this.#styleConfigKey(styleName), JSON.stringify(SettingsSchema.captureGroup(this.config, 'style')));
        } catch {}
    }

    #loadStyleConfig(styleName) {
        try {
            const raw = window.GetProperty(this.#styleConfigKey(styleName), null);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    }

    #switchStylePack(styleName) {
        if (styleName === this.config.buttonStyle) return false;
        this.saveStyleConfig(this.config.buttonStyle);
        SettingsSchema.setField(this.config, 'buttonStyle', styleName);
        SettingsSchema.applyGroup(this.config, this.#loadStyleConfig(this.config.buttonStyle) || PlayButtonsController.DEFAULTS, 'style');
        this.#saveCoreProperties();
        this.reloadAssets();
        this.buildLayout(window.Width, window.Height);
        return true;
    }

    #resolveButtonsBaseDir() {
        const rawCandidates = [
            `${this.#profileBase}buttons\\`,
            `${this.#profileBase}profile\\buttons\\`,
            (typeof fb.FoobarPath === 'string' && fb.FoobarPath ? `${fb.FoobarPath}profile\\buttons\\` : ''),
            (typeof fb.FoobarPath === 'string' && fb.FoobarPath ? `${fb.FoobarPath}buttons\\` : ''),
            `${fb.ComponentPath}samples\\complete\\images\\profile\\buttons\\`,
            `${fb.ComponentPath}samples\\complete\\images\\buttons\\`,
            `${fb.ComponentPath}samples\\complete\\images\\`
        ].filter(Boolean);

        for (let dir of rawCandidates) {
            if (!dir.endsWith('\\')) dir += '\\';
            const cleanDir = GdiUtils.sanitizePath(dir);
            if (utils.IsDirectory(cleanDir)) {
                for (const ext of PlayButtonsController.EXTENSIONS) {
                    if (utils.IsFile(`${dir}stop${ext}`) || utils.IsFile(`${dir}play${ext}`)) return dir;
                }
                const subdirs = utils.Glob(`${cleanDir}\\*`, 0);
                if (Array.isArray(subdirs)) {
                    for (const s of subdirs) {
                        const cleanSub = GdiUtils.sanitizePath(s);
                        const folderName = cleanSub.substring(cleanSub.lastIndexOf('\\') + 1);
                        if (folderName === '.' || folderName === '..') continue;
                        if (utils.IsDirectory(cleanSub)) {
                            const subPath = `${cleanSub}\\`;
                            for (const ext of PlayButtonsController.EXTENSIONS) {
                                if (utils.IsFile(`${subPath}stop${ext}`) || utils.IsFile(`${subPath}play${ext}`)) return dir;
                            }
                        }
                    }
                }
            }
        }
        return `${this.#profileBase}buttons\\`;
    }

    findIconExt(baseDir, baseName) {
        let names = [baseName];
        if (baseName.startsWith('previous')) {
            names.push(baseName.replace('previous', 'prev'));
        } else if (baseName.startsWith('prev')) {
            names.push(baseName.replace('prev', 'previous'));
        }

        for (const n of names) {
            for (const ext of PlayButtonsController.EXTENSIONS) {
                const fullPath = `${baseDir}${n}${ext}`;
                if (utils.IsFile(fullPath)) return { ext, name: n };
            }
        }
        return null;
    }

    scanButtonStyles(force = false) {
        if (this.#cachedStyles && !force) return this.#cachedStyles;
        const styles = [''];
        const cleanBase = GdiUtils.sanitizePath(this.buttonsBaseDir);
        try {
            if (utils.IsDirectory(cleanBase)) {
                const subdirs = utils.Glob(`${cleanBase}\\*`, 0);
                if (Array.isArray(subdirs)) {
                    for (const s of subdirs) {
                        const cleanSub = GdiUtils.sanitizePath(s);
                        const folderName = cleanSub.substring(cleanSub.lastIndexOf('\\') + 1);
                        if (folderName === '.' || folderName === '..') continue;
                        if (utils.IsDirectory(cleanSub)) {
                            const subPath = `${cleanSub}\\`;
                            if (this.findIconExt(subPath, 'stop') || this.findIconExt(subPath, 'play') ||
                                this.findIconExt(subPath, 'previous') || this.findIconExt(subPath, 'next')) {
                                if (!styles.includes(folderName)) styles.push(folderName);
                            }
                        }
                    }
                }
            }
        } catch {}

        styles.sort((a, b) => {
            if (a === b) return 0;
            if (a === '') return -1;
            if (b === '') return 1;
            return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
        });

        this.#cachedStyles = styles;
        return styles;
    }

    validateStyle(val) {
        if (typeof val !== 'string' || val === '') return PlayButtonsController.DEFAULTS.buttonStyle;
        return this.scanButtonStyles(false).includes(val) ? val : PlayButtonsController.DEFAULTS.buttonStyle;
    }

    getButtonImagePath(baseName, suffix = '') {
        const targetName = suffix ? `${baseName}${suffix}` : baseName;
        if (this.config.buttonStyle) {
            const styleDir = `${this.buttonsBaseDir}${this.config.buttonStyle}\\`;
            const found = this.findIconExt(styleDir, targetName);
            return found ? `${styleDir}${found.name}${found.ext}` : '';
        }
        const foundDef = this.findIconExt(this.buttonsBaseDir, targetName);
        if (foundDef) return `${this.buttonsBaseDir}${foundDef.name}${foundDef.ext}`;
        return suffix ? '' : `${this.buttonsBaseDir}${baseName}.png`;
    }

    initButtons() {
        this.clearButtons();
        this.#items = [
            new PlayButton('stop',     'stop',     () => fb.Stop(),        'Stop'),
            new PlayButton('play',     'play',     () => fb.PlayOrPause(), 'Play'),
            new PlayButton('previous', 'previous', () => fb.Prev(),        'Previous'),
            new PlayButton('next',     'next',     () => fb.Next(),        'Next')
        ];
        this.reloadAssets();
        this.initTooltip();
    }

    reloadAssets() {
        for (const item of this.#items) item.loadAssets(this);
    }

    initTooltip() {
        if (this.#tooltip?.Dispose) {
            try { this.#tooltip.Dispose(); } catch {}
            this.#tooltip = null;
        }
        try {
            this.#tooltip = window.CreateTooltip('Segoe UI', this.scale(12));
            if (this.#tooltip) this.#tooltip.SetMaxWidth(800);
        } catch {
            this.#tooltip = null;
        }
    }

    setTooltipText(text) {
        if (!this.#tooltip) return;
        if (this.#tooltip.Text !== text) {
            this.#tooltip.Text = text;
            if (text) {
                this.#tooltip.Activate();
            } else {
                this.#tooltip.Deactivate();
            }
        }
    }

    clearButtons() {
        for (const item of this.#items) item.dispose();
        this.#items = [];
        this.#hovered = null;
        this.#pressed = null;
        this.setTooltipText('');
        if (this.#tooltip?.Dispose) {
            try { this.#tooltip.Dispose(); } catch {}
            this.#tooltip = null;
        }
    }

    buildLayout(ww, wh) {
        if (ww <= 0 || wh <= 0 || this.#items.length < 4) return;

        const gap       = this.scale(this.config.paddingGap);
        const borderPad = this.scale(this.config.paddingBorder);
        const padL      = this.scale(this.config.padLeft);
        const padR      = this.scale(this.config.padRight);
        const padT      = this.scale(this.config.padTop);
        const padB      = this.scale(this.config.padBottom);

        const availX = borderPad + padL;
        const availY = borderPad + padT;
        const availW = Math.max(1, ww - (borderPad * 2) - padL - padR);
        const availH = Math.max(1, wh - (borderPad * 2) - padT - padB);

        let bsW = 0, bsH = 0, x = 0, y = 0;

        if (this.config.sizeMode === PlayButtonsController.SIZE_MODE.FILL_WIDTH) {
            bsW = Math.max(1, Math.floor((availW - (gap * 3)) / 4));
            bsH = this.config.stretchFill ? availH : Math.min(availH, this.scale(this.config.btnSize));
            x   = availX;

            if      (this.config.alignV === PlayButtonsController.ALIGN.TOP)    { y = availY; }
            else if (this.config.alignV === PlayButtonsController.ALIGN.MIDDLE) { y = Math.max(availY, availY + Math.floor((availH - bsH) / 2)); }
            else                                                               { y = Math.max(availY, availY + availH - bsH); }

        } else if (this.config.sizeMode === PlayButtonsController.SIZE_MODE.FIT_HEIGHT) {
            bsH = availH;
            bsW = Math.min(Math.max(1, Math.floor((availW - (gap * 3)) / 4)), this.scale(this.config.btnSize));
            y   = availY;
            const totalW = (bsW * 4) + (gap * 3);

            if      (this.config.alignH === PlayButtonsController.ALIGN.LEFT)   { x = availX; }
            else if (this.config.alignH === PlayButtonsController.ALIGN.CENTER) { x = Math.max(availX, availX + Math.floor((availW - totalW) / 2)); }
            else                                                               { x = Math.max(availX, availX + availW - totalW); }

        } else {
            const maxDimension = Math.min(availH, Math.floor((availW - (gap * 3)) / 4));
            const bs = Math.min(this.scale(this.config.btnSize), Math.max(1, maxDimension));
            bsW = bsH = bs;
            const totalW = (bsW * 4) + (gap * 3);

            if      (this.config.alignV === PlayButtonsController.ALIGN.TOP)    { y = availY; }
            else if (this.config.alignV === PlayButtonsController.ALIGN.MIDDLE) { y = Math.max(availY, availY + Math.floor((availH - bsH) / 2)); }
            else                                                               { y = Math.max(availY, availY + availH - bsH); }

            if      (this.config.alignH === PlayButtonsController.ALIGN.LEFT)   { x = availX; }
            else if (this.config.alignH === PlayButtonsController.ALIGN.CENTER) { x = Math.max(availX, availX + Math.floor((availW - totalW) / 2)); }
            else                                                               { x = Math.max(availX, availX + availW - totalW); }
        }

        this.#items[0].updateBounds(x,                   y, bsW, bsH, this);
        this.#items[1].updateBounds(x + (bsW + gap),     y, bsW, bsH, this);
        this.#items[2].updateBounds(x + (bsW + gap) * 2, y, bsW, bsH, this);
        this.#items[3].updateBounds(x + (bsW + gap) * 3, y, bsW, bsH, this);

        this.#rebuildBezelLayer(ww, wh);
    }

    updatePlayState() {
        const isPlaying = fb.IsPlaying && !fb.IsPaused;
        if (this.#lastPlayingState === isPlaying) return;
        this.#lastPlayingState = isPlaying;

        const playBtn = this.#items.find(b => b.id === 'play');
        if (playBtn) {
            playBtn.tipText = isPlaying ? 'Pause' : 'Play';
            if (this.#hovered === playBtn) {
                this.setTooltipText(playBtn.tipText);
            }
            this.invalidateButton(playBtn);
        }
    }

    invalidateButton(btn) {
        if (!btn || btn.w <= 0 || btn.h <= 0) return;
        window.RepaintRect(btn.x, btn.y, btn.w, btn.h);
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
                return PlayButtonsController.EXTENSIONS.includes(ext);
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
        if (!this.config.bezelFolder || !name) return null;
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

        const base = this.config.bezelFolder.endsWith('\\') ? this.config.bezelFolder : `${this.config.bezelFolder}\\`;
        for (const ext of PlayButtonsController.EXTENSIONS) {
            if (lower.endsWith(ext) && utils.IsFile(`${base}${name}`)) return `${base}${name}`;
        }
        for (const ext of PlayButtonsController.EXTENSIONS) {
            const p = `${base}${name}${ext}`;
            if (utils.IsFile(p)) return p;
        }
        return null;
    }

    loadBezel() {
        const bezelToken = ++this.#bezelLoadToken;
        if (!this.config.bezelEnabled || !this.config.bezelFile) {
            if (this.#bezelBmp) { try { this.#bezelBmp.Dispose(); } catch {} this.#bezelBmp = null; }
            this.#rebuildBezelLayer(window.Width, window.Height);
            return;
        }

        const target = this.resolveBezelPath(this.config.bezelFile);
        if (!target) {
            if (this.#bezelBmp) { try { this.#bezelBmp.Dispose(); } catch {} this.#bezelBmp = null; }
            this.config.bezelEnabled = false;
            this.config.bezelFile = '';
            this.#rebuildBezelLayer(window.Width, window.Height);
            return;
        }

        this.#imgLoader.load(target).then((img) => {
            if (this.#lifecycle === PlayButtonsController.LIFECYCLE.SHUTDOWN || bezelToken !== this.#bezelLoadToken || !this.config.bezelEnabled) {
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
            this.#rebuildBezelLayer(window.Width, window.Height);
            window.Repaint();
        });
    }

    onLoadImageDone(cookie, image) {
        if (this.#lifecycle === PlayButtonsController.LIFECYCLE.SHUTDOWN) {
            if (image) { try { image.Dispose(); } catch {} }
            return;
        }
        if (!this.#imgLoader.onLoadImageDone(cookie, image)) {
            if (image) { try { image.Dispose(); } catch {} }
        }
    }

    #rebuildBezelLayer(w, h) {
        if (this.#bezelLayerBmp) {
            try { this.#bezelLayerBmp.Dispose(); } catch {}
            this.#bezelLayerBmp = null;
        }
        if (!this.config.bezelEnabled || !this.#bezelBmp || w <= 0 || h <= 0) return;

        let bmp = null;
        try {
            bmp = gdi.CreateImage(w, h);
            const g = bmp.GetGraphics();
            try {
                g.SetInterpolationMode(2);
                g.DrawImage(this.#bezelBmp, 0, 0, w, h, 0, 0, this.#bezelBmp.Width, this.#bezelBmp.Height);
            } finally {
                bmp.ReleaseGraphics(g);
            }
            this.#bezelLayerBmp = bmp;
        } catch {
            if (bmp) { try { bmp.Dispose(); } catch {} }
            this.#bezelLayerBmp = null;
        }
    }

    cycleBezel(direction) {
        const bezelNames = this.listBezelNames(true);
        if (!bezelNames.length) {
            this.#showNotification('No bezels found in folder');
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

        let chosen = 'None';
        if (nextIdx === 0) {
            this.config.bezelEnabled = false;
            this.config.bezelFile = '';
        } else {
            chosen = bezelNames[nextIdx - 1];
            this.config.bezelEnabled = true;
            this.config.bezelFile = chosen;
        }

        this.loadBezel();
        this.saveBezelConfig();
        this.buildLayout(window.Width, window.Height);
        this.#showNotification(`Bezel: ${chosen}`);
        window.Repaint();
    }

    cycleButtonStyle(direction) {
        const stylesList = this.scanButtonStyles(true);
        if (!stylesList || stylesList.length <= 1) {
            this.#showNotification('No subfolder icon packs found');
            return;
        }

        let currentIdx = stylesList.indexOf(this.config.buttonStyle);
        if (currentIdx === -1) currentIdx = 0;

        const nextIdx = (currentIdx + direction + stylesList.length) % stylesList.length;
        const selected = stylesList[nextIdx];
        this.#switchStylePack(selected);

        const label = selected === '' ? 'Default' : selected;
        this.#showNotification(`Style: ${label}`);
        window.Repaint();
    }

    #showNotification(text) {
        this.#notifyText = text;
        if (this.#notifyTimeout) window.ClearTimeout(this.#notifyTimeout);
        this.#notifyTimeout = window.SetTimeout(() => {
            this.#notifyText = '';
            this.#notifyTimeout = null;
            window.Repaint();
        }, 1500);
        window.Repaint();
    }

    onPaint(gr) {
        if (this.#lifecycle !== PlayButtonsController.LIFECYCLE.LIVE || !gr || window.Width <= 0 || window.Height <= 0) return;

        if (this.config.useBgColor) {
            gr.FillSolidRect(0, 0, window.Width, window.Height, this.config.bgColor);
        } else if (!window.IsTransparent) {
            gr.FillSolidRect(0, 0, window.Width, window.Height, this.#getSafeUIColour());
        }

        for (const item of this.#items) item.draw(gr);

        if (this.config.bezelEnabled && this.#bezelLayerBmp) {
            gr.DrawImage(this.#bezelLayerBmp, 0, 0, window.Width, window.Height, 0, 0, window.Width, window.Height, 0, 255);
        }

        if (this.#notifyText) {
            this.#notifyFont ??= gdi.Font('Segoe UI Semibold', this.scale(11), 0);
            if (this.#notifyFont) {
                const boxH = Math.max(20, this.scale(24));
                const boxW = Math.min(window.Width - this.scale(20), Math.max(this.scale(130), this.#notifyText.length * this.scale(7) + this.scale(24)));
                const bx = Math.floor((window.Width - boxW) / 2);
                const by = window.Height - Math.max(22, this.scale(30));
                gr.FillSolidRect(bx, by, boxW, boxH, GdiUtils.RGBA(0, 0, 0, 190));
                gr.SetTextRenderingHint(4);
                gr.DrawString(this.#notifyText, this.#notifyFont, GdiUtils.RGBA(255, 255, 255, 240), bx, by, boxW, boxH, 0x11000000);
            }
        }
    }

    onMouseMove(mx, my, mask) {
        if (this.#lifecycle !== PlayButtonsController.LIFECYCLE.LIVE) return;

        if (this.#pressed && mask !== undefined && !(mask & 1)) {
            this.#pressed.state = 'normal';
            this.invalidateButton(this.#pressed);
            this.#pressed = null;
        }

        let hit = null;
        for (const item of this.#items) {
            if (item.contains(mx, my)) { hit = item; break; }
        }

        if (this.#hovered !== hit) {
            const oldHovered = this.#hovered;
            if (oldHovered) {
                oldHovered.state = 'normal';
                this.invalidateButton(oldHovered);
            }

            if (hit) {
                hit.state = (this.#pressed === hit) ? 'down' : 'hover';
                this.setTooltipText(hit.tipText);
                this.invalidateButton(hit);
            } else {
                this.setTooltipText('');
            }
            this.#hovered = hit;
        }
    }

    onMouseDown(mx, my) {
        if (this.#lifecycle !== PlayButtonsController.LIFECYCLE.LIVE) return;
        if (!this.#hovered || !this.#hovered.contains(mx, my)) {
            this.onMouseMove(mx, my);
        }
        if (this.#hovered) {
            this.#pressed = this.#hovered;
            this.#hovered.state = 'down';
            this.invalidateButton(this.#hovered);
        }
    }

    onMouseUp(mx, my) {
        if (this.#lifecycle !== PlayButtonsController.LIFECYCLE.LIVE) return;
        if (this.#pressed) {
            const btn = this.#pressed;
            if (btn.contains(mx, my) && btn.onClick) {
                btn.onClick();
            }
            btn.state = (this.#hovered === btn) ? 'hover' : 'normal';
            this.#pressed = null;
            this.invalidateButton(btn);
        }
    }

    onMouseLeave() {
        if (this.#lifecycle !== PlayButtonsController.LIFECYCLE.LIVE) return;
        let needsRepaint = false;
        if (this.#hovered) {
            this.#hovered.state = 'normal';
            this.invalidateButton(this.#hovered);
            this.#hovered = null;
            needsRepaint = true;
        }
        if (this.#pressed) {
            this.#pressed.state = 'normal';
            this.invalidateButton(this.#pressed);
            this.#pressed = null;
            needsRepaint = true;
        }
        if (needsRepaint) this.setTooltipText('');
    }

    onKeyDown(vkey) {
        if (this.#lifecycle !== PlayButtonsController.LIFECYCLE.LIVE) return false;
        if (utils.IsKeyPressed(0x11) && !utils.IsKeyPressed(0x10) && !utils.IsKeyPressed(0x12)) {
            if (vkey === 0x26) { this.cycleBezel(-1); return true; }
            if (vkey === 0x28) { this.cycleBezel(1);  return true; }
            if (vkey === 0x25) { this.cycleButtonStyle(-1); return true; }
            if (vkey === 0x27) { this.cycleButtonStyle(1);  return true; }
        }
        return false;
    }

    onColoursChanged() {
        for (const item of this.#items) item.invalidateScaledCache();
        this.buildLayout(window.Width, window.Height);
        window.Repaint();
    }

    onFontChanged() {
        if (this.#notifyFont?.Dispose) {
            try { this.#notifyFont.Dispose(); } catch {}
        }
        this.#notifyFont = null;
        this.fonts.clear();
        for (const item of this.#items) item.invalidateScaledCache();
        this.initTooltip();
        this.buildLayout(window.Width, window.Height);
        window.Repaint();
    }

    // ========================================================================================
    // CONTEXT MENU (DECLARATIVE MENU BUILDER)
    // ========================================================================================
    showContextMenu(x, y) {
        const cfg = this.config;
        const m = new MenuBuilder();
        let dirty = false;

        const commitStyle = (reload = false) => {
            if (reload) this.reloadAssets();
            for (const item of this.#items) item.invalidateScaledCache();
            this.saveStyleConfig(cfg.buttonStyle);
            dirty = true;
        };

        // 1. Size modes & aspect ratio
        m.addItem('Fixed (Size Box)', () => {
            SettingsSchema.setField(cfg, 'sizeMode', PlayButtonsController.SIZE_MODE.FIXED);
            commitStyle();
        }, { radio: cfg.sizeMode === PlayButtonsController.SIZE_MODE.FIXED });
        m.addItem('Fill Width (Tile Horizontally)', () => {
            SettingsSchema.setField(cfg, 'sizeMode', PlayButtonsController.SIZE_MODE.FILL_WIDTH);
            commitStyle();
        }, { radio: cfg.sizeMode === PlayButtonsController.SIZE_MODE.FILL_WIDTH });
        m.addItem('Fit Height (Fill Height)', () => {
            SettingsSchema.setField(cfg, 'sizeMode', PlayButtonsController.SIZE_MODE.FIT_HEIGHT);
            commitStyle();
        }, { radio: cfg.sizeMode === PlayButtonsController.SIZE_MODE.FIT_HEIGHT });

        m.addSeparator();

        m.addItem('Maintain Aspect Ratio', () => {
            if (cfg.stretchFill) {
                SettingsSchema.setField(cfg, 'stretchFill', false);
                commitStyle();
            }
        }, { radio: !cfg.stretchFill });
        m.addItem('Stretch to Fill Panel (Full Area)', () => {
            if (!cfg.stretchFill) {
                SettingsSchema.setField(cfg, 'stretchFill', true);
                commitStyle();
            }
        }, { radio: cfg.stretchFill });

        m.addSeparator();

        // 2. Alignments
        m.addSubMenu('Horizontal Alignment', (h) => {
            ['Left', 'Centre', 'Right'].forEach((lbl, i) => {
                h.addItem(lbl, () => {
                    SettingsSchema.setField(cfg, 'alignH', i);
                    commitStyle();
                }, { radio: cfg.alignH === i });
            });
        }, cfg.sizeMode === PlayButtonsController.SIZE_MODE.FILL_WIDTH);

        m.addSubMenu('Vertical Alignment', (v) => {
            ['Top', 'Middle', 'Bottom'].forEach((lbl, i) => {
                v.addItem(lbl, () => {
                    SettingsSchema.setField(cfg, 'alignV', i);
                    commitStyle();
                }, { radio: cfg.alignV === i });
            });
        }, cfg.sizeMode === PlayButtonsController.SIZE_MODE.FIT_HEIGHT);

        m.addSeparator();

        // 3. Button Style (live rescan so newly added packs appear immediately)
        const stylesList = this.scanButtonStyles(true);
        const hasRootIcons = this.findIconExt(this.buttonsBaseDir, 'play') !== null;

        m.addSubMenu('Button Style', (sty) => {
            stylesList.forEach((styleName) => {
                const rawLabel = styleName === '' ? (hasRootIcons ? 'Default (Root Folder)' : 'Default') : styleName;
                const label = GdiUtils.escapeMenuLabel(rawLabel);
                sty.addItem(label, () => {
                    if (this.#switchStylePack(styleName)) window.Repaint();
                }, { radio: styleName === cfg.buttonStyle });
            });
            if (stylesList.length <= 1) {
                sty.addSeparator();
                sty.addItem('No subfolder icon packs found', null, { disabled: true });
            }
        });

        // 4. Button Size
        m.addSubMenu('Button Size', (s) => {
            const presets = [
                [PlayButtonsController.SIZE_PRESETS.SMALL,  `Small (${PlayButtonsController.SIZE_PRESETS.SMALL}px)`],
                [PlayButtonsController.SIZE_PRESETS.MEDIUM, `Medium (${PlayButtonsController.SIZE_PRESETS.MEDIUM}px)`],
                [PlayButtonsController.SIZE_PRESETS.LARGE,  `Large (${PlayButtonsController.SIZE_PRESETS.LARGE}px)`],
                [PlayButtonsController.SIZE_PRESETS.XL,     `Extra Large (${PlayButtonsController.SIZE_PRESETS.XL}px)`]
            ];
            const presetVals = presets.map(p => p[0]);
            for (const [val, lbl] of presets) {
                s.addItem(lbl, () => {
                    SettingsSchema.setField(cfg, 'btnSize', val);
                    commitStyle();
                }, { radio: cfg.btnSize === val });
            }
            s.addSeparator();
            s.addItem(`Custom (${cfg.btnSize}px)...`, () => {
                const val = GdiUtils.prompt('Enter button size (16-512 pixels):', 'Custom Size', cfg.btnSize);
                if (val !== null && val.trim() !== '') {
                    const parsed = parseInt(val, 10);
                    if (!Number.isNaN(parsed)) {
                        const newSize = GdiUtils.clamp(parsed, 16, 512);
                        if (newSize !== cfg.btnSize) {
                            SettingsSchema.setField(cfg, 'btnSize', newSize);
                            commitStyle();
                        }
                    }
                }
            }, { radio: !presetVals.includes(cfg.btnSize) });
        });

        // 5. Padding
        m.addSubMenu('Padding', (p) => {
            p.addItem(`Padding Gap: ${cfg.paddingGap}px...`, () => {
                const val = GdiUtils.prompt('Enter gap between buttons (0-300 pixels):', 'Padding Gap', cfg.paddingGap);
                if (val !== null && val.trim() !== '') {
                    const parsed = parseInt(val, 10);
                    if (!Number.isNaN(parsed)) {
                        const newGap = GdiUtils.clamp(parsed, 0, 300);
                        if (newGap !== cfg.paddingGap) {
                            SettingsSchema.setField(cfg, 'paddingGap', newGap);
                            commitStyle();
                        }
                    }
                }
            });
            p.addItem(`Padding Border: ${cfg.paddingBorder}px...`, () => {
                const val = GdiUtils.prompt('Enter outer border padding to panel edge (0-300 pixels):', 'Padding Border', cfg.paddingBorder);
                if (val !== null && val.trim() !== '') {
                    const parsed = parseInt(val, 10);
                    if (!Number.isNaN(parsed)) {
                        const newBorder = GdiUtils.clamp(parsed, 0, 300);
                        if (newBorder !== cfg.paddingBorder) {
                            SettingsSchema.setField(cfg, 'paddingBorder', newBorder);
                            commitStyle();
                        }
                    }
                }
            });
        });

        // 6. Colors & Tint
        m.addSubMenu('Colors & Tint', (col) => {
            const pickColor = (key) => {
                const picked = utils.ColourPicker(window.ID, cfg[key]);
                if (picked !== -1) {
                    const next = (picked | 0xFF000000) >>> 0;
                    if (next !== cfg[key]) {
                        SettingsSchema.setField(cfg, key, next);
                        commitStyle(key !== 'bgColor');
                    }
                }
            };
            col.addItem('Enable Custom Tint', () => {
                SettingsSchema.setField(cfg, 'useTint', !cfg.useTint);
                commitStyle(true);
            }, { checked: cfg.useTint });
            col.addSeparator();
            col.addItem('Set Normal Color...', () => pickColor('colorNormal'), { disabled: !cfg.useTint });
            col.addItem('Set Hover Color...',  () => pickColor('colorHover'),  { disabled: !cfg.useTint });
            col.addItem('Set Click Color...',  () => pickColor('colorDown'),   { disabled: !cfg.useTint });
            col.addSeparator();
            col.addItem('Enable Background Colour', () => {
                SettingsSchema.setField(cfg, 'useBgColor', !cfg.useBgColor);
                commitStyle();
            }, { checked: cfg.useBgColor });
            col.addItem('Set Background Color...', () => pickColor('bgColor'), { disabled: !cfg.useBgColor });
        });

        // 7. Bezel / Overlay
        m.addSubMenu('Bezel / Overlay', (bez) => {
            const bezelNamesList = this.listBezelNames();
            const curClean = (cfg.bezelFile || '').toLowerCase().replace(/\.[^/.]+$/, '');
            const selIdx = (cfg.bezelEnabled && curClean)
                ? bezelNamesList.findIndex(n => n.toLowerCase() === curClean)
                : -1;

            bez.addItem('Enable Bezel Frame', () => {
                cfg.bezelEnabled = !cfg.bezelEnabled;
                if (cfg.bezelEnabled && !cfg.bezelFile && bezelNamesList.length > 0) {
                    cfg.bezelFile = bezelNamesList[0];
                }
                this.loadBezel();
                this.saveBezelConfig();
                dirty = true;
            }, { checked: Boolean(cfg.bezelEnabled && cfg.bezelFile) });
            bez.addSeparator();

            bez.addItem('None (No Bezel)', () => {
                cfg.bezelEnabled = false;
                cfg.bezelFile = '';
                this.loadBezel();
                this.saveBezelConfig();
                dirty = true;
            }, { radio: selIdx === -1 });

            bezelNamesList.forEach((name, bi) => {
                bez.addItem(GdiUtils.escapeMenuLabel(name), () => {
                    cfg.bezelEnabled = true;
                    cfg.bezelFile = name;
                    this.loadBezel();
                    this.saveBezelConfig();
                    dirty = true;
                }, { radio: selIdx === bi });
            });

            bez.addSeparator();
            bez.addItem('Set Bezel Folder...', () => {
                const f = GdiUtils.prompt('Enter folder path containing bezel/overlay images:', 'Set Bezel Folder', cfg.bezelFolder);
                if (f) {
                    const cleaned = GdiUtils.sanitizePath(f);
                    if (cleaned && utils.IsDirectory(cleaned)) {
                        cfg.bezelFolder = cleaned;
                        this.#cachedBezelImages = null;
                        this.#cachedBezelFolder = null;
                        this.loadBezel();
                        this.saveBezelConfig();
                        dirty = true;
                    }
                }
            });
            bez.addItem('Reload Bezel List', () => {
                this.#cachedBezelImages = null;
                this.#cachedBezelFolder = null;
                this.loadBezel();
                dirty = true;
            });

            bez.addSeparator();
            const promptPad = (label, key) => {
                const v = GdiUtils.prompt(`Enter ${label} padding in pixels (0-100):`, 'Per-Side Padding', cfg[key]);
                if (v !== null && v.trim() !== '') {
                    const parsed = parseInt(v, 10);
                    if (!Number.isNaN(parsed)) {
                        SettingsSchema.setField(cfg, key, GdiUtils.clamp(parsed, 0, 100));
                        this.saveBezelConfig();
                        dirty = true;
                    }
                }
            };
            bez.addItem(`Left padding... (${cfg.padLeft}px)`,     () => promptPad('left',   'padLeft'));
            bez.addItem(`Right padding... (${cfg.padRight}px)`,   () => promptPad('right',  'padRight'));
            bez.addItem(`Top padding... (${cfg.padTop}px)`,       () => promptPad('top',    'padTop'));
            bez.addItem(`Bottom padding... (${cfg.padBottom}px)`, () => promptPad('bottom', 'padBottom'));
        });

        m.addSeparator();
        m.addItem('Reset Current Style to Defaults', () => {
            SettingsSchema.applyGroup(cfg, PlayButtonsController.DEFAULTS, 'style');
            this.#saveCoreProperties();
            commitStyle(true);
        });
        m.addItem('Factory Reset (All Styles & Overlays)...', () => {
            const confirm = GdiUtils.prompt('Type YES to perform a factory reset (resets all styles, button sets, and overlays):', 'Confirm Factory Reset', '');
            if (confirm?.toUpperCase() === 'YES') {
                const allStyles = this.scanButtonStyles(true);
                for (const st of allStyles) window.SetProperty(this.#styleConfigKey(st), null);
                window.SetProperty(this.#styleConfigKey(''), null);

                SettingsSchema.setField(cfg, 'buttonStyle', PlayButtonsController.DEFAULTS.buttonStyle);
                SettingsSchema.applyGroup(cfg, PlayButtonsController.DEFAULTS, 'style');
                SettingsSchema.applyGroup(cfg, PlayButtonsController.DEFAULTS, 'bezel');
                cfg.bezelFolder = `${this.#profileBase}skins\\overlay`;
                this.#saveCoreProperties();
                this.#cachedBezelImages = null;
                this.#cachedBezelFolder = null;
                this.#cachedStyles = null;
                this.saveBezelConfig();
                this.loadBezel();
                commitStyle(true);
            }
        });

        m.track(x, y);

        if (dirty) {
            this.buildLayout(window.Width, window.Height);
            window.Repaint();
        }
        return true;
    }

    dispose() {
        this.#lifecycle = PlayButtonsController.LIFECYCLE.SHUTDOWN;
        this.#bezelLoadToken++;
        this.#imgLoader.clear();
        if (this.#notifyTimeout) window.ClearTimeout(this.#notifyTimeout);
        this.clearButtons();
        if (this.#bezelBmp)      { try { this.#bezelBmp.Dispose(); } catch {} this.#bezelBmp = null; }
        if (this.#bezelLayerBmp) { try { this.#bezelLayerBmp.Dispose(); } catch {} this.#bezelLayerBmp = null; }
        this.fonts.clear();
        if (this.#notifyFont?.Dispose) {
            try { this.#notifyFont.Dispose(); } catch {}
        }
        this.#notifyFont = null;
        this.#cachedBezelImages = null;
        this.#cachedStyles = null;
    }
}

// ============================================================================================
// 4. SMP GLOBAL CALLBACK DISPATCH
// ============================================================================================
const app = new PlayButtonsController();

function on_size() {
    app.buildLayout(window.Width, window.Height);
    window.Repaint();
}

function on_paint(gr) {
    app.onPaint(gr);
}

function on_playback_new_track() {
    app.updatePlayState();
}

function on_playback_stop(reason) {
    if (reason !== 2) app.updatePlayState();
}

function on_playback_pause() {
    app.updatePlayState();
}

function on_playback_starting() {
    app.updatePlayState();
}

function on_mouse_move(x, y, mask) {
    app.onMouseMove(x, y, mask);
}

function on_mouse_leave() {
    app.onMouseLeave();
}

function on_mouse_lbtn_down(x, y) {
    app.onMouseDown(x, y);
}

function on_mouse_lbtn_dblclk(x, y) {
    app.onMouseDown(x, y);
}

function on_mouse_lbtn_up(x, y) {
    app.onMouseUp(x, y);
}

function on_key_down(vkey) {
    return app.onKeyDown(vkey);
}

function on_colours_changed() {
    app.onColoursChanged();
}

function on_font_changed() {
    app.onFontChanged();
}

function on_load_image_done(cookie, image, image_path) {
    app.onLoadImageDone(cookie, image);
}

function on_mouse_rbtn_up(x, y, mask) {
    if (mask & 4) return false;
    return app.showContextMenu(x, y);
}

function on_script_unload() {
    app.dispose();
}

// Initialize Controller
app.init();