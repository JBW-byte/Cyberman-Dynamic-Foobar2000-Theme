'use strict';

           // ============== AUTHOR L.E.D. ============== \\
          // ==-== 	  Audio PlayBack Buttons v2.1    ==-== \\
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

window.DefineScript('Playback Buttons Pro v2.0', { 
    author: 'L.E.D.', 
    version: '2.1', 
    features: { grab_focus: true } 
});

window.DrawMode = 0; // 0 = GDI+, 1 = Direct2D
window.DlgCode = 0x0004; // DLGC_WANTALLKEYS

// ============================================================================================
// 1. HELPERS & MATH UTILITIES
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
        // Preserve Windows drive root (e.g. "C:\") and UNC root (e.g. "\\server\share\")
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

    static tintImage(img, tintColour) {
        if (!img || img.Width <= 0 || img.Height <= 0) return null;
        const w = img.Width;
        const h = img.Height;
        let bmp = null;
        try {
            bmp = gdi.CreateImage(w, h);
            const g = bmp.GetGraphics();
            try {
                g.SetInterpolationMode(7);
                g.DrawImage(img, 0, 0, w, h, 0, 0, w, h, 0, 255);
                const rgb = this.toRGB(tintColour);
                g.FillSolidRect(0, 0, w, h, this.RGBA(rgb[0], rgb[1], rgb[2], 90));
            } finally {
                bmp.ReleaseGraphics(g);
            }
            try { bmp.ApplyMask(img); } catch {}
            return bmp;
        } catch {
            if (bmp) { try { bmp.Dispose(); } catch {} }
            return null;
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
// 2. PRE-SCALED BUTTON ENTITY (THE DOT MATRIX 1:1 CACHE ARCHITECTURE)
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

    // Master source textures (including dedicated hover and click states if provided by icon pack)
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
                slot.hover  = slot.hoverSrc || null; // Will trigger tactile modulation in bake if null
                slot.down   = slot.downSrc  || null; // Will trigger press-down offset in bake if null
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

        if (boundsChanged || !this.#scaledSlots.primary.normal) {
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
                    g.SetInterpolationMode(7);

                    // Tactile visual modulation if button pack lacks dedicated hover/down images and tint is off
                    let opacity = 255;
                    let offX = 0, offY = 0;

                    if (!controller.config.useTint) {
                        if (key === 'normal' && !hasDedicatedHover) {
                            opacity = 215; // Softened idle opacity so hover responds dynamically
                        } else if (key === 'hover') {
                            opacity = 255; // Full brightness on hover
                        } else if (key === 'down' && !hasDedicatedDown) {
                            opacity = 255;
                            offX = Math.max(1, controller.scale(1)); // Tactile press-down offset
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
                    bmp.ReleaseGraphics(g);
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

        // Pre-bake vector fallback if icon bitmaps are missing
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

        const colors = {
            normal: controller.config.colorNormal,
            hover:  controller.config.colorHover,
            down:   controller.config.colorDown
        };

        const renderGlyphs = (glyphChar, destSlot) => {
            if (!glyphChar) return;
            for (const key of ['normal', 'hover', 'down']) {
                let bmp = null;
                try {
                    bmp = gdi.CreateImage(this.w, this.h);
                    const g = bmp.GetGraphics();
                    g.SetTextRenderingHint(4);
                    const off = (key === 'down') ? Math.max(1, controller.scale(1)) : 0;
                    g.DrawString(glyphChar, font, colors[key], off, off, this.w, this.h, 0x11000000);
                    bmp.ReleaseGraphics(g);
                    destSlot[key] = bmp;
                } catch {
                    if (bmp) { try { bmp.Dispose(); } catch {} }
                    destSlot[key] = null;
                }
            }
        };

        // Render primary glyph
        renderGlyphs(glyphMap[this.id] || '', this.#scaledSlots.fallback);

        // For play button, also pre-bake pause glyph into alternate fallback slot
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
            // High-speed 1:1 blit (Zero runtime resampling overhead)
            gr.DrawImage(bakedImg, this.x, this.y, this.w, this.h, 0, 0, this.w, this.h, 0, 255);
        }
    }
}

// ============================================================================================
// 3. MAIN CONTROLLER & APPLICATION ENGINE
// ============================================================================================
class PlayButtonsController {
    static LIFECYCLE = { BOOT: 0, LIVE: 1, SHUTDOWN: 2 };

    static MENU_ID = {
        ALIGN_V_TOP:       10,
        ALIGN_V_MIDDLE:    11,
        ALIGN_V_BOTTOM:    12,
        SIZE_SMALL:        20,
        SIZE_MEDIUM:       21,
        SIZE_LARGE:        22,
        SIZE_XL:           23,
        SIZE_CUSTOM:       24,
        PAD_GAP_CUSTOM:    30,
        PAD_BORDER_CUSTOM: 31,
        MODE_FIXED:        40,
        MODE_FILL:         41,
        MODE_FIT_HEIGHT:   42,
        ASPECT_MAINTAIN:   45,
        ASPECT_STRETCH:    46,
        COLOR_TOGGLE:      50,
        COLOR_NORMAL:      51,
        COLOR_HOVER:       52,
        COLOR_DOWN:        53,
        BG_TOGGLE:         54,
        BG_COLOR:          55,
        ALIGN_H_LEFT:      60,
        ALIGN_H_CENTER:    61,
        ALIGN_H_RIGHT:     62,
        BEZEL_ENABLE:      70,
        BEZEL_FOLDER:      72,
        BEZEL_RELOAD:      73,
        BEZEL_NONE:        20000, 
        BEZEL_NAMES_BASE:  20001,
        PAD_LEFT:          4110,
        PAD_RIGHT:         4111,
        PAD_TOP:           4112,
        PAD_BOTTOM:        4113,
        RESET_STYLE:       98,
        RESET_FACTORY:     99,
        STYLE_BASE:        10000
    };

    static SIZE_PRESETS = { SMALL: 32, MEDIUM: 64, LARGE: 128, XL: 256 };
    static SIZE_MODE    = { FIXED: 0, FILL_WIDTH: 1, FIT_HEIGHT: 2 };
    static ALIGN        = { TOP: 0, MIDDLE: 1, BOTTOM: 2, LEFT: 0, CENTER: 1, RIGHT: 2 };
    static EXTENSIONS   = ['.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp'];

    static DEFAULTS = {
        btnSize:       128,
        paddingGap:    0,
        paddingBorder: 0,
        alignV:        1, // ALIGN.MIDDLE
        alignH:        1, // ALIGN.CENTER
        sizeMode:      1, // SIZE_MODE.FILL_WIDTH
        stretchFill:   false,
        useTint:       false,
        colorNormal:   GdiUtils.RGB(255, 255, 255),
        colorHover:    GdiUtils.RGB(150, 150, 150),
        colorDown:     GdiUtils.RGB(100, 100, 100),
        useBgColor:    false,
        bgColor:       GdiUtils.RGB(20, 20, 20),
        buttonStyle:   '',
        padLeft:       4,
        padRight:      4,
        padTop:        4,
        padBottom:     4,
        bezelEnabled:  false,
        bezelFile:     ''
    };

    #lifecycle   = PlayButtonsController.LIFECYCLE.BOOT;
    #dpiScale    = 1;
    #profileBase = '';
    buttonsBaseDir = '';

    #items    = [];
    #hovered  = null;
    #pressed  = null;
    #tooltip  = null;

    #bezelBmp          = null;
    #bezelLayerBmp     = null;
    #cachedBezelImages = null;
    #cachedBezelFolder = null;
    #cachedStyles      = null;

    #notifyText    = '';
    #notifyTimeout = null;
    #notifyFont    = null;

    fonts = new FontRegistry();
    config = { ...PlayButtonsController.DEFAULTS };

    constructor() {
        const sysDpi = (typeof window.DPI === 'number' && window.DPI > 0) ? window.DPI : 96;
        this.#dpiScale = sysDpi / 96;

        let p = fb.ProfilePath || '';
        if (p && !p.endsWith('\\') && !p.endsWith('/')) p += '\\';
        this.#profileBase = p;

        this.buttonsBaseDir = this.#resolveButtonsBaseDir();
        this.#loadProperties();
        this.#applyConfig(this.#loadStyleConfig(this.config.buttonStyle) || PlayButtonsController.DEFAULTS);
    }

    scale(size) {
        return Math.round(size * this.#dpiScale);
    }

    init() {
        this.#lifecycle = PlayButtonsController.LIFECYCLE.LIVE;
        this.loadBezel();
        this.initButtons(); // Instantiates vector buttons immediately
        this.buildLayout(window.Width, window.Height);
        window.Repaint();

        // Post-paint yield: scan directories and bake high-res bitmaps in background
        window.SetTimeout(() => {
            if (this.#lifecycle === PlayButtonsController.LIFECYCLE.SHUTDOWN) return;
            this.reloadAssets();
            this.buildLayout(window.Width, window.Height);
            window.Repaint();
        }, 0);
    }

    #getSafeUIColour() {
        try {
            return window.InstanceType === 1 ? window.GetColourDUI(1) : window.GetColourCUI(3);
        } catch {
            return GdiUtils.RGB(25, 25, 25);
        }
    }

    #loadProperties() {
        const cfg = this.config;
        cfg.btnSize       = GdiUtils.clamp(window.GetProperty('Buttons: Size', PlayButtonsController.DEFAULTS.btnSize), 16, 512);
        cfg.paddingGap    = GdiUtils.clamp(window.GetProperty('Buttons: Padding Gap', PlayButtonsController.DEFAULTS.paddingGap), 0, 300);
        cfg.paddingBorder = GdiUtils.clamp(window.GetProperty('Buttons: Padding Border', PlayButtonsController.DEFAULTS.paddingBorder), 0, 300);
        cfg.alignV        = GdiUtils.clamp(window.GetProperty('Buttons: Vertical Alignment (0=Top, 1=Middle, 2=Bottom)', PlayButtonsController.DEFAULTS.alignV), 0, 2);
        cfg.alignH        = GdiUtils.clamp(window.GetProperty('Buttons: Horizontal Alignment (0=Left, 1=Centre, 2=Right)', PlayButtonsController.DEFAULTS.alignH), 0, 2);
        cfg.sizeMode      = GdiUtils.clamp(window.GetProperty('Buttons: Size Mode', PlayButtonsController.DEFAULTS.sizeMode), 0, 2);
        cfg.stretchFill   = Boolean(window.GetProperty('Buttons: Stretch Fill', PlayButtonsController.DEFAULTS.stretchFill));
        cfg.useTint       = Boolean(window.GetProperty('Colors: Use Tint', PlayButtonsController.DEFAULTS.useTint));
        cfg.colorNormal   = Number(window.GetProperty('Colors: Normal', PlayButtonsController.DEFAULTS.colorNormal)) >>> 0;
        cfg.colorHover    = Number(window.GetProperty('Colors: Hover', PlayButtonsController.DEFAULTS.colorHover)) >>> 0;
        cfg.colorDown     = Number(window.GetProperty('Colors: Down', PlayButtonsController.DEFAULTS.colorDown)) >>> 0;
        cfg.useBgColor    = Boolean(window.GetProperty('Colors: Use Background', PlayButtonsController.DEFAULTS.useBgColor));
        cfg.bgColor       = Number(window.GetProperty('Colors: Background', PlayButtonsController.DEFAULTS.bgColor)) >>> 0;
        cfg.buttonStyle   = this.validateStyle(window.GetProperty('Buttons: Style', PlayButtonsController.DEFAULTS.buttonStyle));
        cfg.padLeft       = GdiUtils.clamp(window.GetProperty('Buttons: Pad Left', PlayButtonsController.DEFAULTS.padLeft), 0, 100);
        cfg.padRight      = GdiUtils.clamp(window.GetProperty('Buttons: Pad Right', PlayButtonsController.DEFAULTS.padRight), 0, 100);
        cfg.padTop        = GdiUtils.clamp(window.GetProperty('Buttons: Pad Top', PlayButtonsController.DEFAULTS.padTop), 0, 100);
        cfg.padBottom     = GdiUtils.clamp(window.GetProperty('Buttons: Pad Bottom', PlayButtonsController.DEFAULTS.padBottom), 0, 100);
        cfg.bezelFolder   = GdiUtils.sanitizePath(String(window.GetProperty('Buttons: Bezel Folder', `${this.#profileBase}skins\\overlay`))) || `${this.#profileBase}skins\\overlay`;
        cfg.bezelEnabled  = Boolean(window.GetProperty('Buttons: Bezel Enabled', PlayButtonsController.DEFAULTS.bezelEnabled));
        cfg.bezelFile     = String(window.GetProperty('Buttons: Bezel File', PlayButtonsController.DEFAULTS.bezelFile));
    }

    saveBezelConfig() {
        window.SetProperty('Buttons: Pad Left', this.config.padLeft);
        window.SetProperty('Buttons: Pad Right', this.config.padRight);
        window.SetProperty('Buttons: Pad Top', this.config.padTop);
        window.SetProperty('Buttons: Pad Bottom', this.config.padBottom);
        window.SetProperty('Buttons: Bezel Folder', this.config.bezelFolder);
        window.SetProperty('Buttons: Bezel Enabled', this.config.bezelEnabled);
        window.SetProperty('Buttons: Bezel File', this.config.bezelFile);
    }

    #styleConfigKey(name) {
        return `Buttons: StyleCfg.${name === '' ? '__default__' : name}`;
    }

    #captureConfig() {
        return {
            btnSize:       this.config.btnSize,
            paddingGap:    this.config.paddingGap,
            paddingBorder: this.config.paddingBorder,
            alignV:        this.config.alignV,
            alignH:        this.config.alignH,
            sizeMode:      this.config.sizeMode,
            stretchFill:   this.config.stretchFill,
            useTint:       this.config.useTint,
            colorNormal:   this.config.colorNormal,
            colorHover:    this.config.colorHover,
            colorDown:     this.config.colorDown,
            useBgColor:    this.config.useBgColor,
            bgColor:       this.config.bgColor
        };
    }

    #applyConfig(cfg) {
        if (!cfg) return;
        this.config.btnSize       = GdiUtils.clamp(cfg.btnSize ?? this.config.btnSize, 16, 512);
        this.config.paddingGap    = GdiUtils.clamp(cfg.paddingGap ?? this.config.paddingGap, 0, 300);
        this.config.paddingBorder = GdiUtils.clamp(cfg.paddingBorder ?? this.config.paddingBorder, 0, 300);
        this.config.alignV        = GdiUtils.clamp(cfg.alignV ?? this.config.alignV, 0, 2);
        this.config.alignH        = GdiUtils.clamp(cfg.alignH ?? this.config.alignH, 0, 2);
        this.config.sizeMode      = GdiUtils.clamp(cfg.sizeMode ?? this.config.sizeMode, 0, 2);
        this.config.stretchFill   = Boolean(cfg.stretchFill ?? this.config.stretchFill);
        this.config.useTint       = Boolean(cfg.useTint ?? this.config.useTint);
        this.config.colorNormal   = (Number(cfg.colorNormal) >>> 0) || this.config.colorNormal;
        this.config.colorHover    = (Number(cfg.colorHover)  >>> 0) || this.config.colorHover;
        this.config.colorDown     = (Number(cfg.colorDown)   >>> 0) || this.config.colorDown;
        this.config.useBgColor    = Boolean(cfg.useBgColor ?? this.config.useBgColor);
        this.config.bgColor       = (Number(cfg.bgColor)     >>> 0) || this.config.bgColor;
    }

    saveStyleConfig(styleName) {
        try {
            window.SetProperty(this.#styleConfigKey(styleName), JSON.stringify(this.#captureConfig()));
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
                        if (utils.IsDirectory(cleanSub)) {
                            const subPath = `${cleanSub}\\`;
                            const folderName = cleanSub.substring(cleanSub.lastIndexOf('\\') + 1);
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
            if (found) return `${styleDir}${found.name}${found.ext}`;
        }
        const foundDef = this.findIconExt(this.buttonsBaseDir, targetName);
        if (foundDef) return `${this.buttonsBaseDir}${foundDef.name}${foundDef.ext}`;
        return suffix ? '' : `${this.buttonsBaseDir}${baseName}.png`;
    }

    // ========================================================================================
    // BUTTON MANAGER INTEGRATION
    // ========================================================================================
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
        const playBtn = this.#items.find(b => b.id === 'play');
        if (playBtn) {
            playBtn.tipText = (fb.IsPlaying && !fb.IsPaused) ? 'Pause' : 'Play';
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

    // ========================================================================================
    // BEZEL / OVERLAY ENGINE
    // ========================================================================================
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
        if (this.#bezelBmp) { try { this.#bezelBmp.Dispose(); } catch {} this.#bezelBmp = null; }
        if (!this.config.bezelEnabled || !this.config.bezelFile) {
            this.#rebuildBezelLayer(window.Width, window.Height);
            return;
        }

        const target = this.resolveBezelPath(this.config.bezelFile);
        if (target) {
            try {
                this.#bezelBmp = gdi.Image(target);
                if (!this.#bezelBmp) { this.config.bezelEnabled = false; this.config.bezelFile = ''; }
            } catch {
                this.#bezelBmp = null;
                this.config.bezelEnabled = false;
                this.config.bezelFile = '';
            }
        } else {
            this.config.bezelEnabled = false;
            this.config.bezelFile = '';
        }
        this.#rebuildBezelLayer(window.Width, window.Height);
    }

    #rebuildBezelLayer(w, h) {
        if (this.#bezelLayerBmp) {
            try { this.#bezelLayerBmp.Dispose(); } catch {}
            this.#bezelLayerBmp = null;
        }
        if (!this.config.bezelEnabled || !this.#bezelBmp || w <= 0 || h <= 0) return;

        try {
            const bmp = gdi.CreateImage(w, h);
            const g = bmp.GetGraphics();
            g.SetInterpolationMode(2);
            g.DrawImage(this.#bezelBmp, 0, 0, w, h, 0, 0, this.#bezelBmp.Width, this.#bezelBmp.Height);
            bmp.ReleaseGraphics(g);
            this.#bezelLayerBmp = bmp;
        } catch {
            if (this.#bezelLayerBmp) { try { this.#bezelLayerBmp.Dispose(); } catch {} }
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

        if (selected !== this.config.buttonStyle) {
            this.saveStyleConfig(this.config.buttonStyle);
            this.config.buttonStyle = selected;
            window.SetProperty('Buttons: Style', this.config.buttonStyle);
            this.#applyConfig(this.#loadStyleConfig(this.config.buttonStyle) || PlayButtonsController.DEFAULTS);
            this.reloadAssets();
            this.buildLayout(window.Width, window.Height);
        }

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

    // ========================================================================================
    // SMP EVENT DELEGATION
    // ========================================================================================
    onPaint(gr) {
        if (this.#lifecycle !== PlayButtonsController.LIFECYCLE.LIVE || !gr || window.Width <= 0 || window.Height <= 0) return;

        if (this.config.useBgColor) {
            gr.FillSolidRect(0, 0, window.Width, window.Height, this.config.bgColor);
        } else if (!window.IsTransparent) {
            gr.FillSolidRect(0, 0, window.Width, window.Height, this.#getSafeUIColour());
        }

        for (const item of this.#items) item.draw(gr);

        if (this.config.bezelEnabled && this.#bezelLayerBmp) {
            // High-speed 1:1 blit of pre-scaled bezel overlay
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

    onMouseMove(mx, my) {
        if (this.#lifecycle !== PlayButtonsController.LIFECYCLE.LIVE) return;
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
    // CONTEXT MENU BUILDER & DISPATCH
    // ========================================================================================
    showContextMenu(x, y) {
        const m   = window.CreatePopupMenu();
        const v   = window.CreatePopupMenu();
        const h   = window.CreatePopupMenu();
        const s   = window.CreatePopupMenu();
        const p   = window.CreatePopupMenu();
        const col = window.CreatePopupMenu();
        const sty = window.CreatePopupMenu();
        const bez = window.CreatePopupMenu();

        const allMenus = [m, v, h, s, p, col, sty, bez];
        const M_ID = PlayButtonsController.MENU_ID;

        m.AppendMenuItem(0, M_ID.MODE_FIXED,      'Fixed (Size Box)');
        m.AppendMenuItem(0, M_ID.MODE_FILL,       'Fill Width (Tile Horizontally)');
        m.AppendMenuItem(0, M_ID.MODE_FIT_HEIGHT, 'Fit Height (Fill Height)');
        m.CheckMenuRadioItem(M_ID.MODE_FIXED, M_ID.MODE_FIT_HEIGHT, M_ID.MODE_FIXED + this.config.sizeMode);
        m.AppendMenuSeparator();

        m.AppendMenuItem(0, M_ID.ASPECT_MAINTAIN, 'Maintain Aspect Ratio');
        m.AppendMenuItem(0, M_ID.ASPECT_STRETCH,  'Stretch to Fill Panel (Full Area)');
        m.CheckMenuRadioItem(M_ID.ASPECT_MAINTAIN, M_ID.ASPECT_STRETCH, this.config.stretchFill ? M_ID.ASPECT_STRETCH : M_ID.ASPECT_MAINTAIN);
        m.AppendMenuSeparator();

        h.AppendMenuItem(0, M_ID.ALIGN_H_LEFT,   'Left');
        h.AppendMenuItem(0, M_ID.ALIGN_H_CENTER, 'Centre');
        h.AppendMenuItem(0, M_ID.ALIGN_H_RIGHT,  'Right');
        h.CheckMenuRadioItem(M_ID.ALIGN_H_LEFT, M_ID.ALIGN_H_RIGHT, M_ID.ALIGN_H_LEFT + this.config.alignH);
        h.AppendTo(m, this.config.sizeMode === PlayButtonsController.SIZE_MODE.FILL_WIDTH ? 0x0001 : 0, 'Horizontal Alignment');

        v.AppendMenuItem(0, M_ID.ALIGN_V_TOP,    'Top');
        v.AppendMenuItem(0, M_ID.ALIGN_V_MIDDLE, 'Middle');
        v.AppendMenuItem(0, M_ID.ALIGN_V_BOTTOM, 'Bottom');
        v.CheckMenuRadioItem(M_ID.ALIGN_V_TOP, M_ID.ALIGN_V_BOTTOM, M_ID.ALIGN_V_TOP + this.config.alignV);
        v.AppendTo(m, this.config.sizeMode === PlayButtonsController.SIZE_MODE.FIT_HEIGHT ? 0x0001 : 0, 'Vertical Alignment');
        m.AppendMenuSeparator();

        const stylesList = this.scanButtonStyles(false);
        const hasRootIcons = this.findIconExt(this.buttonsBaseDir, 'play') !== null;
        let activeStyleIdx = 0;

        stylesList.forEach((styleName, i) => {
            const label = styleName === '' ? (hasRootIcons ? 'Default (Root Folder)' : 'Default') : styleName;
            sty.AppendMenuItem(0, M_ID.STYLE_BASE + i, label);
            if (styleName === this.config.buttonStyle) activeStyleIdx = i;
        });

        if (stylesList.length > 0) {
            sty.CheckMenuRadioItem(M_ID.STYLE_BASE, M_ID.STYLE_BASE + stylesList.length - 1, M_ID.STYLE_BASE + activeStyleIdx);
        }
        if (stylesList.length <= 1) {
            sty.AppendMenuSeparator();
            sty.AppendMenuItem(0x0001, M_ID.STYLE_BASE + stylesList.length, 'No subfolder icon packs found');
        }
        sty.AppendTo(m, 0, 'Button Style');

        let activeSizeId = M_ID.SIZE_CUSTOM;
        if (this.config.btnSize === PlayButtonsController.SIZE_PRESETS.SMALL) activeSizeId = M_ID.SIZE_SMALL;
        else if (this.config.btnSize === PlayButtonsController.SIZE_PRESETS.MEDIUM) activeSizeId = M_ID.SIZE_MEDIUM;
        else if (this.config.btnSize === PlayButtonsController.SIZE_PRESETS.LARGE) activeSizeId = M_ID.SIZE_LARGE;
        else if (this.config.btnSize === PlayButtonsController.SIZE_PRESETS.XL) activeSizeId = M_ID.SIZE_XL;

        s.AppendMenuItem(0, M_ID.SIZE_SMALL,  `Small (${PlayButtonsController.SIZE_PRESETS.SMALL}px)`);
        s.AppendMenuItem(0, M_ID.SIZE_MEDIUM, `Medium (${PlayButtonsController.SIZE_PRESETS.MEDIUM}px)`);
        s.AppendMenuItem(0, M_ID.SIZE_LARGE,  `Large (${PlayButtonsController.SIZE_PRESETS.LARGE}px)`);
        s.AppendMenuItem(0, M_ID.SIZE_XL,     `Extra Large (${PlayButtonsController.SIZE_PRESETS.XL}px)`);
        s.AppendMenuSeparator();
        s.AppendMenuItem(0, M_ID.SIZE_CUSTOM, `Custom (${this.config.btnSize}px)...`);
        s.CheckMenuRadioItem(M_ID.SIZE_SMALL, M_ID.SIZE_CUSTOM, activeSizeId);
        s.AppendTo(m, 0, 'Button Size');

        p.AppendMenuItem(0, M_ID.PAD_GAP_CUSTOM,    `Padding Gap: ${this.config.paddingGap}px...`);
        p.AppendMenuItem(0, M_ID.PAD_BORDER_CUSTOM, `Padding Border: ${this.config.paddingBorder}px...`);
        p.AppendTo(m, 0, 'Padding');

        col.AppendMenuItem(0, M_ID.COLOR_TOGGLE, 'Enable Custom Tint');
        if (this.config.useTint) col.CheckMenuRadioItem(M_ID.COLOR_TOGGLE, M_ID.COLOR_TOGGLE, M_ID.COLOR_TOGGLE);
        col.AppendMenuSeparator();
        col.AppendMenuItem(this.config.useTint ? 0 : 0x0001, M_ID.COLOR_NORMAL, 'Set Normal Color...');
        col.AppendMenuItem(this.config.useTint ? 0 : 0x0001, M_ID.COLOR_HOVER,  'Set Hover Color...');
        col.AppendMenuItem(this.config.useTint ? 0 : 0x0001, M_ID.COLOR_DOWN,   'Set Click Color...');
        col.AppendMenuSeparator();
        col.AppendMenuItem(0, M_ID.BG_TOGGLE, 'Enable Background Colour');
        if (this.config.useBgColor) col.CheckMenuRadioItem(M_ID.BG_TOGGLE, M_ID.BG_TOGGLE, M_ID.BG_TOGGLE);
        col.AppendMenuItem(this.config.useBgColor ? 0 : 0x0001, M_ID.BG_COLOR, 'Set Background Color...');
        col.AppendTo(m, 0, 'Colors & Tint');

        bez.AppendMenuItem(0, M_ID.BEZEL_ENABLE, 'Enable Bezel Frame');
        if (this.config.bezelEnabled && this.config.bezelFile) bez.CheckMenuRadioItem(M_ID.BEZEL_ENABLE, M_ID.BEZEL_ENABLE, M_ID.BEZEL_ENABLE);
        bez.AppendMenuSeparator();

        const bezelNamesList = this.listBezelNames();
        bez.AppendMenuItem(0, M_ID.BEZEL_NONE, 'None (No Bezel)');
        const bezLastId = bezelNamesList.length > 0 ? (M_ID.BEZEL_NAMES_BASE + bezelNamesList.length - 1) : M_ID.BEZEL_NONE;
        if (bezelNamesList.length > 0) {
            bezelNamesList.forEach((name, bi) => bez.AppendMenuItem(0, M_ID.BEZEL_NAMES_BASE + bi, name));
        }

        if (!this.config.bezelFile) {
            bez.CheckMenuRadioItem(M_ID.BEZEL_NONE, bezLastId, M_ID.BEZEL_NONE);
        } else {
            const curClean = (this.config.bezelFile || '').toLowerCase().replace(/\.[^/.]+$/, '');
            const selIdx = bezelNamesList.findIndex(n => n.toLowerCase() === curClean);
            bez.CheckMenuRadioItem(M_ID.BEZEL_NONE, bezLastId, selIdx !== -1 ? (M_ID.BEZEL_NAMES_BASE + selIdx) : M_ID.BEZEL_NONE);
        }

        bez.AppendMenuSeparator();
        bez.AppendMenuItem(0, M_ID.BEZEL_FOLDER, 'Set Bezel Folder...');
        bez.AppendMenuItem(0, M_ID.BEZEL_RELOAD, 'Reload Bezel List');
        bez.AppendMenuSeparator();
        bez.AppendMenuItem(0, M_ID.PAD_LEFT,   `Left padding... (${this.config.padLeft}px)`);
        bez.AppendMenuItem(0, M_ID.PAD_RIGHT,  `Right padding... (${this.config.padRight}px)`);
        bez.AppendMenuItem(0, M_ID.PAD_TOP,    `Top padding... (${this.config.padTop}px)`);
        bez.AppendMenuItem(0, M_ID.PAD_BOTTOM, `Bottom padding... (${this.config.padBottom}px)`);
        bez.AppendTo(m, 0, 'Bezel / Overlay');

        m.AppendMenuSeparator();
        m.AppendMenuItem(0, M_ID.RESET_STYLE,   'Reset Current Style to Defaults');
        m.AppendMenuItem(0, M_ID.RESET_FACTORY, 'Factory Reset (All Styles & Overlays)...');

        let idx = 0;
        try {
            idx = m.TrackPopupMenu(x, y);
        } finally {
            allMenus.forEach(menu => { try { menu.Dispose(); } catch {} });
        }

        if (idx === 0) return true;

        if (idx >= M_ID.STYLE_BASE && idx < M_ID.STYLE_BASE + stylesList.length) {
            const selected = stylesList[idx - M_ID.STYLE_BASE];
            if (selected !== this.config.buttonStyle) {
                this.saveStyleConfig(this.config.buttonStyle);
                this.config.buttonStyle = selected;
                window.SetProperty('Buttons: Style', this.config.buttonStyle);
                this.#applyConfig(this.#loadStyleConfig(this.config.buttonStyle) || PlayButtonsController.DEFAULTS);
                this.reloadAssets();
                this.buildLayout(window.Width, window.Height);
                window.Repaint();
            }
            return true;
        }

        if (idx >= M_ID.BEZEL_NAMES_BASE && idx < M_ID.BEZEL_NAMES_BASE + bezelNamesList.length) {
            this.config.bezelEnabled = true;
            this.config.bezelFile = bezelNamesList[idx - M_ID.BEZEL_NAMES_BASE];
            this.loadBezel();
            this.saveBezelConfig();
            this.buildLayout(window.Width, window.Height);
            window.Repaint();
            return true;
        }

        let changed = false;

        switch (idx) {
            case M_ID.ASPECT_MAINTAIN:
                if (this.config.stretchFill) {
                    this.config.stretchFill = false;
                    window.SetProperty('Buttons: Stretch Fill', this.config.stretchFill);
                    changed = true;
                }
                break;

            case M_ID.ASPECT_STRETCH:
                if (!this.config.stretchFill) {
                    this.config.stretchFill = true;
                    window.SetProperty('Buttons: Stretch Fill', this.config.stretchFill);
                    changed = true;
                }
                break;

            case M_ID.ALIGN_V_TOP:
            case M_ID.ALIGN_V_MIDDLE:
            case M_ID.ALIGN_V_BOTTOM:
                this.config.alignV = idx - M_ID.ALIGN_V_TOP;
                window.SetProperty('Buttons: Vertical Alignment (0=Top, 1=Middle, 2=Bottom)', this.config.alignV);
                changed = true;
                break;

            case M_ID.ALIGN_H_LEFT:
            case M_ID.ALIGN_H_CENTER:
            case M_ID.ALIGN_H_RIGHT:
                if (this.config.sizeMode !== PlayButtonsController.SIZE_MODE.FILL_WIDTH) {
                    this.config.alignH = idx - M_ID.ALIGN_H_LEFT;
                    window.SetProperty('Buttons: Horizontal Alignment (0=Left, 1=Centre, 2=Right)', this.config.alignH);
                    changed = true;
                }
                break;

            case M_ID.SIZE_SMALL:
                this.config.btnSize = PlayButtonsController.SIZE_PRESETS.SMALL;
                window.SetProperty('Buttons: Size', this.config.btnSize);
                changed = true;
                break;

            case M_ID.SIZE_MEDIUM:
                this.config.btnSize = PlayButtonsController.SIZE_PRESETS.MEDIUM;
                window.SetProperty('Buttons: Size', this.config.btnSize);
                changed = true;
                break;

            case M_ID.SIZE_LARGE:
                this.config.btnSize = PlayButtonsController.SIZE_PRESETS.LARGE;
                window.SetProperty('Buttons: Size', this.config.btnSize);
                changed = true;
                break;

            case M_ID.SIZE_XL:
                this.config.btnSize = PlayButtonsController.SIZE_PRESETS.XL;
                window.SetProperty('Buttons: Size', this.config.btnSize);
                changed = true;
                break;

            case M_ID.SIZE_CUSTOM: {
                const val = GdiUtils.prompt('Enter button size (16-512 pixels):', 'Custom Size', this.config.btnSize);
                if (val !== null && val !== '') {
                    const newSize = GdiUtils.clamp(parseInt(val, 10) || 128, 16, 512);
                    if (newSize !== this.config.btnSize) {
                        this.config.btnSize = newSize;
                        window.SetProperty('Buttons: Size', this.config.btnSize);
                        changed = true;
                    }
                }
                break;
            }

            case M_ID.PAD_GAP_CUSTOM: {
                const val = GdiUtils.prompt('Enter gap between buttons (0-300 pixels):', 'Padding Gap', this.config.paddingGap);
                if (val !== null && val !== '') {
                    const newGap = GdiUtils.clamp(parseInt(val, 10) || 0, 0, 300);
                    if (newGap !== this.config.paddingGap) {
                        this.config.paddingGap = newGap;
                        window.SetProperty('Buttons: Padding Gap', this.config.paddingGap);
                        changed = true;
                    }
                }
                break;
            }

            case M_ID.PAD_BORDER_CUSTOM: {
                const val = GdiUtils.prompt('Enter outer border padding to panel edge (0-300 pixels):', 'Padding Border', this.config.paddingBorder);
                if (val !== null && val !== '') {
                    const newBorder = GdiUtils.clamp(parseInt(val, 10) || 0, 0, 300);
                    if (newBorder !== this.config.paddingBorder) {
                        this.config.paddingBorder = newBorder;
                        window.SetProperty('Buttons: Padding Border', this.config.paddingBorder);
                        changed = true;
                    }
                }
                break;
            }

            case M_ID.MODE_FIXED:
                this.config.sizeMode = PlayButtonsController.SIZE_MODE.FIXED;
                window.SetProperty('Buttons: Size Mode', this.config.sizeMode);
                changed = true;
                break;

            case M_ID.MODE_FILL:
                this.config.sizeMode = PlayButtonsController.SIZE_MODE.FILL_WIDTH;
                window.SetProperty('Buttons: Size Mode', this.config.sizeMode);
                changed = true;
                break;

            case M_ID.MODE_FIT_HEIGHT:
                this.config.sizeMode = PlayButtonsController.SIZE_MODE.FIT_HEIGHT;
                window.SetProperty('Buttons: Size Mode', this.config.sizeMode);
                changed = true;
                break;

            case M_ID.COLOR_TOGGLE:
                this.config.useTint = !this.config.useTint;
                window.SetProperty('Colors: Use Tint', this.config.useTint);
                this.reloadAssets();
                changed = true;
                break;

            case M_ID.COLOR_NORMAL: {
                if (this.config.useTint) {
                    const picked = utils.ColourPicker(window.ID, this.config.colorNormal);
                    if (picked !== -1 && picked !== this.config.colorNormal) {
                        this.config.colorNormal = picked >>> 0;
                        window.SetProperty('Colors: Normal', this.config.colorNormal);
                        this.reloadAssets();
                        changed = true;
                    }
                }
                break;
            }

            case M_ID.COLOR_HOVER: {
                if (this.config.useTint) {
                    const picked = utils.ColourPicker(window.ID, this.config.colorHover);
                    if (picked !== -1 && picked !== this.config.colorHover) {
                        this.config.colorHover = picked >>> 0;
                        window.SetProperty('Colors: Hover', this.config.colorHover);
                        this.reloadAssets();
                        changed = true;
                    }
                }
                break;
            }

            case M_ID.COLOR_DOWN: {
                if (this.config.useTint) {
                    const picked = utils.ColourPicker(window.ID, this.config.colorDown);
                    if (picked !== -1 && picked !== this.config.colorDown) {
                        this.config.colorDown = picked >>> 0;
                        window.SetProperty('Colors: Down', this.config.colorDown);
                        this.reloadAssets();
                        changed = true;
                    }
                }
                break;
            }

            case M_ID.BG_TOGGLE:
                this.config.useBgColor = !this.config.useBgColor;
                window.SetProperty('Colors: Use Background', this.config.useBgColor);
                changed = true;
                break;

            case M_ID.BG_COLOR: {
                if (this.config.useBgColor) {
                    const picked = utils.ColourPicker(window.ID, this.config.bgColor);
                    if (picked !== -1 && picked !== this.config.bgColor) {
                        this.config.bgColor = picked >>> 0;
                        window.SetProperty('Colors: Background', this.config.bgColor);
                        changed = true;
                    }
                }
                break;
            }

            case M_ID.BEZEL_ENABLE:
                this.config.bezelEnabled = !this.config.bezelEnabled;
                if (this.config.bezelEnabled && !this.config.bezelFile && bezelNamesList.length > 0) {
                    this.config.bezelFile = bezelNamesList[0];
                }
                this.loadBezel();
                this.saveBezelConfig();
                changed = true;
                break;

            case M_ID.BEZEL_NONE:
                this.config.bezelEnabled = false;
                this.config.bezelFile = '';
                this.loadBezel();
                this.saveBezelConfig();
                changed = true;
                break;

            case M_ID.BEZEL_RELOAD:
                this.#cachedBezelImages = null;
                this.loadBezel();
                changed = true;
                break;

            case M_ID.BEZEL_FOLDER: {
                const f = GdiUtils.prompt('Enter folder path containing bezel/overlay images:', 'Set Bezel Folder', this.config.bezelFolder);
                if (f) {
                    const cleaned = GdiUtils.sanitizePath(f);
                    if (cleaned && utils.IsDirectory(cleaned)) {
                        this.config.bezelFolder = cleaned;
                        this.#cachedBezelImages = null;
                        this.loadBezel();
                        this.saveBezelConfig();
                        changed = true;
                    }
                }
                break;
            }

            case M_ID.PAD_LEFT: {
                const v = GdiUtils.prompt('Enter left padding in pixels (0-100):', 'Per-Side Padding', this.config.padLeft);
                if (v !== null && v !== '') {
                    this.config.padLeft = GdiUtils.clamp(parseInt(v, 10) || 0, 0, 100);
                    this.saveBezelConfig();
                    changed = true;
                }
                break;
            }

            case M_ID.PAD_RIGHT: {
                const v = GdiUtils.prompt('Enter right padding in pixels (0-100):', 'Per-Side Padding', this.config.padRight);
                if (v !== null && v !== '') {
                    this.config.padRight = GdiUtils.clamp(parseInt(v, 10) || 0, 0, 100);
                    this.saveBezelConfig();
                    changed = true;
                }
                break;
            }

            case M_ID.PAD_TOP: {
                const v = GdiUtils.prompt('Enter top padding in pixels (0-100):', 'Per-Side Padding', this.config.padTop);
                if (v !== null && v !== '') {
                    this.config.padTop = GdiUtils.clamp(parseInt(v, 10) || 0, 0, 100);
                    this.saveBezelConfig();
                    changed = true;
                }
                break;
            }

            case M_ID.PAD_BOTTOM: {
                const v = GdiUtils.prompt('Enter bottom padding in pixels (0-100):', 'Per-Side Padding', this.config.padBottom);
                if (v !== null && v !== '') {
                    this.config.padBottom = GdiUtils.clamp(parseInt(v, 10) || 0, 0, 100);
                    this.saveBezelConfig();
                    changed = true;
                }
                break;
            }

            case M_ID.RESET_STYLE:
                this.#applyConfig(PlayButtonsController.DEFAULTS);
                this.saveStyleConfig(this.config.buttonStyle);
                this.reloadAssets();
                changed = true;
                break;

            case M_ID.RESET_FACTORY: {
                const confirm = GdiUtils.prompt('Type YES to perform a factory reset (resets all styles, button sets, and overlays):', 'Confirm Factory Reset', '');
                if (confirm?.toUpperCase() === 'YES') {
                    const allStyles = this.scanButtonStyles(false);
                    for (const st of allStyles) window.SetProperty(this.#styleConfigKey(st), '');
                    window.SetProperty(this.#styleConfigKey(''), '');

                    this.config.buttonStyle = PlayButtonsController.DEFAULTS.buttonStyle;
                    window.SetProperty('Buttons: Style', this.config.buttonStyle);
                    this.#applyConfig(PlayButtonsController.DEFAULTS);
                    this.config.padLeft = PlayButtonsController.DEFAULTS.padLeft;
                    this.config.padRight = PlayButtonsController.DEFAULTS.padRight;
                    this.config.padTop = PlayButtonsController.DEFAULTS.padTop;
                    this.config.padBottom = PlayButtonsController.DEFAULTS.padBottom;
                    this.config.bezelFolder = `${this.#profileBase}skins\\overlay`;
                    this.config.bezelEnabled = false;
                    this.config.bezelFile = '';
                    this.#cachedBezelImages = null;
                    this.#cachedStyles = null;
                    this.saveBezelConfig();
                    this.loadBezel();
                    this.reloadAssets();
                    changed = true;
                }
                break;
            }
        }

        if (changed) {
            this.saveStyleConfig(this.config.buttonStyle);
            this.buildLayout(window.Width, window.Height);
            window.Repaint();
        }
        return true;
    }

    dispose() {
        this.#lifecycle = PlayButtonsController.LIFECYCLE.SHUTDOWN;
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

function on_playback_stop() {
    app.updatePlayState();
}

function on_playback_pause() {
    app.updatePlayState();
}

function on_playback_starting() {
    app.updatePlayState();
}

function on_mouse_move(x, y) {
    app.onMouseMove(x, y);
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
    window.Repaint();
}

function on_font_changed() {
    app.onFontChanged();
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