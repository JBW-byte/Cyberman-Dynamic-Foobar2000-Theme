'use strict';
// ======== AUTHOR L.E.D. AI ASSISTED ======== \\
// ======= SMP 64bit LCD TimerPro Script ======= \\
// ====== LCD Timer Various Custom Effects  ====== \\

// ===================*** Foobar2000 64bit ***================== \\
// ======= For Spider Monkey Panel 64bit, author: marc2003 ====== \\
// ========= Right click menu full Customization and Layout ========== \\

window.DrawMode = 1; // 0 - default GDI+ mode. 1 - D2D

window.DefineScript('SMP 64bit LCD TimerPro', { author: 'L.E.D.', options: { grab_focus: true } });

// ===================== HELPER INCLUDES ======================
include(fb.ComponentPath + 'samples\\complete\\js\\lodash.min.js');
include(fb.ComponentPath + 'samples\\complete\\js\\helpers.js');

// ===================== TITLE FORMATS =====================
const _tf_codec = fb.TitleFormat('%codec%');
const _tf_title = fb.TitleFormat('%title%');
const _tf_artist = fb.TitleFormat('%artist%');
const _tf_album = fb.TitleFormat('%album%');
const _tf_bitrate = fb.TitleFormat('%bitrate%');
const _tf_samplerate = fb.TitleFormat('%samplerate%');
const _tf_bits = fb.TitleFormat('%__bitspersample%');
const _tf_channels = fb.TitleFormat('%channels%');

// ===================== KEYBOARD INPUT =====================
window.DlgCode = DLGC_WANTALLKEYS;

// ===================== MENU FLAGS =====================
const MF_CHECKED = 0x0008;


// Coalesces multiple repaint requests into a single repaint per frame
const RepaintScheduler = (() => {
    let _pending = false;
    let _timer   = null;

    return {
        request() {
            if (_pending) return;
            _pending = true;
            _timer = window.SetTimeout(() => {
                _pending = false;
                _timer   = null;
                window.Repaint();
            }, 0);
        },
        cancel() {
            if (_timer) { window.ClearTimeout(_timer); _timer = null; }
            _pending = false;
        }
    };
})();

// ===================== LAYERED RENDERING =====================
// Static layer: rebuilt only when appearance settings change
// Dynamic layer: rebuilt every frame (clock, codec)
let staticLayerCache = null;
let staticCacheKey = '';

function getStaticCacheKey() {
    return `${window.Width}|${window.Height}|${themeIdx}|${borderMode}|${opBG}|${opBorder}|${opGhost}|${showGhost}|${showScanlines}|${showPhosphor}|${useReflection}|${displayMode}`;
}

function rebuildStaticLayer() {
    const w = window.Width;
    const h = window.Height;
    if (w <= 0 || h <= 0) return;

    const key = getStaticCacheKey();
    if (key === staticCacheKey && staticLayerCache) return;

    staticCacheKey = key;
    if (staticLayerCache) {
        try { staticLayerCache.Dispose(); } catch (e) {}
    }

    // Create new bitmap first, then get graphics inside try/finally so ReleaseGraphics
    // is always paired with GetGraphics even if a draw call throws.
    staticLayerCache = gdi.CreateImage(w, h);
    const g = staticLayerCache.GetGraphics();
    try {
        const theme = getTheme();
        const pc = State.paintCache;

        // === Static Layer: Background ===
        g.FillSolidRect(0, 0, w, h, SetAlpha(theme.bg, opBG));

        // === Static Layer: Ghost Segments (mode 0 only) ===
        if (displayMode === 0 && showGhost && opGhost > 0) {
            const trackLen = (fb.IsPlaying || fb.IsPaused) ? fb.PlaybackLength : 0;
            const ghostStr = trackLen >= 3600 ? '88:88:88' : '88:88';
            const ghostSize = g.MeasureString(ghostStr, pc.clockFont, 0, 0, w * 4, h * 4);
            const ghostX = (w - ghostSize.Width) / 2;
            const ghostY = pc.centerY - pc.clockLineH / 2;
            g.DrawString(ghostStr, pc.clockFont, SetAlpha(theme.lcd, opGhost),
                ghostX, ghostY, ghostSize.Width, Math.round(pc.clockSize * 1.5));
        }

        // === Static Layer: CRT Effects (scanlines + phosphor) ===
        if (scanCache) g.DrawImage(scanCache, 0, 0, w, h, 0, 0, w, h);

        // === Static Layer: Reflection ===
        if (reflCache && useReflection) g.DrawImage(reflCache, 0, 0, w, h, 0, 0, w, h);

        // === Static Layer: Border (both modes) ===
        if (borderMode > 0) {
            const b = borderMode;
            g.DrawRect(b / 2, b / 2, w - b, h - b, b, SetAlpha(theme.lcd, opBorder));
        }
    } catch (e) {
        console.log('LCD: Static layer rebuild error:', e);
    } finally {
        staticLayerCache.ReleaseGraphics(g);
    }
}

function invalidateStaticLayer() {
    staticCacheKey = '';
}

// ===================== CONSTANTS =====================
const CONSTANTS = {
    CLOCK_UPDATE_INTERVAL:   100,
    INFO_FLASH_INTERVAL:     500,
    INFO_FLASH_COUNT:        6,
    SCANLINE_SPACING:        3,
    REFLECTION_HEIGHT_RATIO: 0.45,
    GLOW_ITERATIONS:         8,
    OPACITY_STEP:            5,
    POSITION_STEP:           1
};

// ===================== COLOR HELPERS =====================
function SetAlpha(col, a) { return ((col & 0x00FFFFFF) | (a << 24)) >>> 0; }

const LCD_BLACK = _RGB(0,   0,   0);
const LCD_WHITE = _RGB(255, 255, 255);

// ===================== THEMES =====================
// Tokyo Night colors for text row
const TN_CYAN     = _RGB(125, 207, 255);
const TN_PINK     = _RGB(247, 118, 142);
const TN_YELLOW   = _RGB(224, 175, 104);
const TN_GREEN    = _RGB(158, 206, 106);
const TN_ORANGE   = _RGB(255, 158, 100);

// Module-level key array for tech details — avoids a 4-element array allocation every paint frame.
const TECH_TEXT_KEYS = ['bitrate', 'sampleRate', 'bits', 'channels'];
// Module-level structure — colors are constants, text is read from textCache at draw time.
// Avoids a 4-object array allocation on every on_paint call in mode 0.
const TECH_PARTS = [
    { color: TN_YELLOW },   // bitrate
    { color: TN_CYAN   },   // sampleRate
    { color: TN_GREEN  },   // bits
    { color: TN_ORANGE }    // channels
];

// ===================== PLAY ICON CONSTANTS (mirrors PlayList.js) =====================
// Font names indexed 1-3 (0 = hidden).  Index 0 is a placeholder so [playIconType-1] works.
const LCD_ICON_FONT_NAMES = ['', 'Guifx2 v2 16', 'FontAwesome', 'Segoe MDL2 Assets'];
const LCD_ICON_CHARS = {
    'Guifx2 v2 16':      { play: '\u25B6', pause: '\u23F8' },
    'FontAwesome':        { play: '\uF04B', pause: '\uF04C' },
    'Segoe MDL2 Assets': { play: '\uE768', pause: '\uE769' }
};

// Custom colours persisted separately so user changes survive theme/reset.
let custBg  = window.GetProperty('LCD.CustomBg',  _RGB(10, 15, 15));
let custLcd = window.GetProperty('LCD.CustomLcd', _RGB(0, 255, 200));

const themes = [
    { name: 'Classic Green', bg: _RGB(5,   12,  5),   lcd: _RGB(30,  180, 30)  },
    { name: 'Retro Amber',   bg: _RGB(15,  8,   0),   lcd: _RGB(190, 110, 0)   },
    { name: 'Cyber Blue',    bg: _RGB(0,   5,   15),  lcd: _RGB(0,   130, 200) },
    { name: 'Cool Blue',     bg: _RGB(8,   12,  12),  lcd: _RGB(100, 180, 215) },
    { name: 'Deep Red',      bg: _RGB(10,  0,   0),   lcd: _RGB(170, 15,  15)  },
    { name: 'Steel Grey',    bg: _RGB(20,  20,  20),  lcd: _RGB(160, 160, 160) },
    { name: 'Night Purple',  bg: _RGB(8,   0,   12),  lcd: _RGB(120, 60,  180) },
    { name: 'Dim White',     bg: _RGB(180, 180, 180), lcd: _RGB(30,  30,  30)  },
    { name: 'USER CUSTOM',   bg: custBg,               lcd: custLcd             }
];

// ===================== PROPERTIES =====================
let themeIdx        = window.GetProperty('LCD.Theme',          0);
let borderMode = (() => {
    const stored = window.GetProperty('LCD.BorderPx', -1);
    if (stored >= 0) return _.clamp(stored, 0, 50);          // already migrated
    const legacy = window.GetProperty('LCD.Border', 1);      // legacy enum
    return legacy === 1 ? 2 : legacy === 2 ? 5 : 0;          // one-time translate
})();
let showGhost       = window.GetProperty('LCD.ShowGhost',      true);
let useReflection   = window.GetProperty('LCD.UseReflection',  true);
let showShadow      = window.GetProperty('LCD.ShowShadow',     false);
let showGlow        = window.GetProperty('LCD.ShowGlow',       false);
// Per-mode, per-text-type visibility — each toggle is independent and persisted.
let showM0Codec  = window.GetProperty('LCD.ShowM0Codec',  true);
let showM0Tech   = window.GetProperty('LCD.ShowM0Tech',   true);
let showM1Title  = window.GetProperty('LCD.ShowM1Title',  true);
let showM1Album  = window.GetProperty('LCD.ShowM1Album',  true);
let showM1Codec  = window.GetProperty('LCD.ShowM1Codec',  true);
let showM1Tech   = window.GetProperty('LCD.ShowM1Tech',   true);
// Mode 1 codec detail font size (0 = auto, matches mode 0 techSize).
let m1CodecFontSize = window.GetProperty('LCD.M1CodecFontSize', 0);
let showScanlines   = window.GetProperty('LCD.ShowScanlines',  false);
let showPhosphor    = window.GetProperty('LCD.ShowPhosphor',   true);

let vOffset    = window.GetProperty('LCD.VerticalOffset', 0);
let codecOffX  = window.GetProperty('LCD.CodecOffsetX',   -10);
let codecOffY  = window.GetProperty('LCD.CodecOffsetY',   -20);
let detailOffX = window.GetProperty('LCD.DetailOffsetX',  -10);
let detailOffY = window.GetProperty('LCD.DetailOffsetY',  -5);
// Mode 1 independent position offsets — tuned separately from mode 0.
let m1TitleOffX = window.GetProperty('LCD.M1TitleOffsetX', -10);
let m1TitleOffY = window.GetProperty('LCD.M1TitleOffsetY', -20);
let m1CodecOffX = window.GetProperty('LCD.M1CodecOffsetX', -10);
let m1CodecOffY = window.GetProperty('LCD.M1CodecOffsetY', -5);
let modeRemaining = window.GetProperty('LCD.ModeRemaining', false);
// === Mode 1 play icon (mirrors PlayList.js: 0=off, 1=Guifx2, 2=FontAwesome, 3=MDL2) ===
let playIconType  = _.clamp(window.GetProperty('LCD.PlayIconType',  2), 0, 3);
let playIconBlink = window.GetProperty('LCD.PlayIconBlink', false);

let opClock      = window.GetProperty('LCD.OpClock',      255);
let opGhost      = window.GetProperty('LCD.OpGhost',      5);
let opTech       = window.GetProperty('LCD.OpTech',       255);
let opBorder     = window.GetProperty('LCD.OpBorder',     60);
let opBG         = window.GetProperty('LCD.OpBG',         255);
let opReflection = window.GetProperty('LCD.OpReflection', 20);
let opShadow     = window.GetProperty('LCD.OpShadow',     60);
let opGlow       = window.GetProperty('LCD.OpGlow',       110);
let opScanlines  = window.GetProperty('LCD.OpScanlines',  50);
let opPhosphor   = window.GetProperty('LCD.OpPhosphor',   10);

let defaultFontName  = window.GetProperty('LCD.DefaultFontName',  'Segoe UI');
let autoFontSize     = window.GetProperty('LCD.AutoFontSize',     true);
// === Mode 0 (Timer) fonts ===
let clockFontName    = window.GetProperty('LCD.ClockFontName',    'Digital-7 Mono');
let clockFontSize    = window.GetProperty('LCD.ClockFontSize',    48);
let codecFontName    = window.GetProperty('LCD.CodecFontName',    'Segoe UI');
let codecFontSize    = window.GetProperty('LCD.CodecFontSize',    14);
let techFontName     = window.GetProperty('LCD.TechFontName',     'Segoe UI');
let techFontSize     = window.GetProperty('LCD.TechFontSize',     14);

let textRowFontName  = window.GetProperty('LCD.TextRowFontName',  'Segoe UI');
let textRowFontSize  = window.GetProperty('LCD.TextRowFontSize',  20);  // 0 = auto
// ===================== STATE =====================
let clockRefreshTimer   = null;
let pauseFlashTimer    = null;
let infoPulseTimer      = null;
let btnFlashTimer       = null;   // persistent blink while playIconBlink && playing
let btnFlash            = true;   // independent of codecFlash — drives mode-1 icon blink
let codecStr            = ' ';
let codecFlash          = true;
let opacitySliderTarget = null;
let positionAdjustMode  = null;
let displayOff         = false;
let displayMode        = window.GetProperty('LCD.DisplayMode', 0);


const opAccessors = {
    Clock:      { get: () => opClock,      set: v => { opClock      = v; } },
    Ghost:      { get: () => opGhost,      set: v => { opGhost      = v; } },
    Tech:       { get: () => opTech,       set: v => { opTech       = v; } },
    Border:     { get: () => opBorder,     set: v => { opBorder     = v; } },
    Background: { get: () => opBG,         set: v => { opBG         = v; } },
    Reflection: { get: () => opReflection, set: v => { opReflection = v; } },
    Shadow:     { get: () => opShadow,     set: v => { opShadow     = v; } },
    Glow:       { get: () => opGlow,       set: v => { opGlow       = v; } },
    Scanlines:  { get: () => opScanlines,  set: v => { opScanlines  = v; } },
    Phosphor:   { get: () => opPhosphor,   set: v => { opPhosphor   = v; } }
};

const fallback = gdi.Font('Segoe UI', 12, 0);

// ===================== FONT CACHE =====================
const MAX_FONT_CACHE = 40;
const fontCache = new Map();

function getFont(name, size, style = 0) {
    const k = `${name}|${size}|${style}`;
    if (fontCache.has(k)) {
        // Move to end (most-recently-used).
        const f = fontCache.get(k);
        fontCache.delete(k);
        fontCache.set(k, f);
        return f;
    }
    try {
        const f = gdi.Font(name, size, style);
        fontCache.set(k, f);
        if (fontCache.size > MAX_FONT_CACHE) {
            const oldKey  = fontCache.keys().next().value;
            const oldFont = fontCache.get(oldKey);
            fontCache.delete(oldKey);
            if (oldFont && typeof oldFont.Dispose === 'function') { try { oldFont.Dispose(); } catch(e) {} }  // M1: removed outer dead try/catch and double-guard anti-pattern
        }
        return f;
    } catch (e) {
        console.log('LCD: Font error:', e);
        // Do NOT insert fallback into the LRU — if evicted, Dispose() would be
        // called on a still-live handle corrupting all subsequent draws.
        return fallback;
    }
}

// ===================== MEASURE CACHE =====================
const measureCache = {
    ghostStr:      '',
    ghostW:        0,
    timeStr:       '',
    timeW:         0,
    // Codec info caching for display mode 1
    codecInfoKey:  '',
    codecInfoSize: 0,
    codecParts:    [],
    invalidate() {
        this.ghostStr = this.timeStr = '';
        this.codecInfoKey = '';
    }
};

// ===================== TEXT CACHE =====================
const textCache = {
    titleText:  '',   // title + ' - ' + artist composite
    albumText:  '',
    bitrate:    '',
    sampleRate: '',
    bits:       '',
    channels:   ''
};

// ===================== STATE OBJECT =====================
const State = {
    paintCache: {
        valid:        false,
        width:        0,
        height:       0,
        clockSize:    0,
        codecSize:    0,   // mode 0 audio codec
        techSize:     0,   // mode 0 tech details
        m1TitleSize:  0,   // mode 1 title
        m1AlbumSize:  0,   // mode 1 album
        m1TruncatedTitle: null,   // set by updatePaintCache when title overflows at min size
        m1TruncatedAlbum: null,   // set by updatePaintCache when album overflows at min size
        clockFont:    null,
        codecFont:    null,
        shadowOffset: 0,
        glowRadius:   0,
        padding:      0,
        centerY:      0,
        clockLineH:   0,
        bottomH:      0,
        bottomY:      0
    },
    
    layoutCache: {
        valid: false,
        w: 0,
        h: 0,
        displayMode: -1,
        padding: 0,
        leftX: 0,
        m1TitleSize: 0,  // tracks pc.m1TitleSize for validity check
        m1AlbumSize: 0,  // tracks pc.m1AlbumSize for validity check
        borderMode: -1, // sentinel: -1 forces rebuild on first call
        topY: 0,
        rowSpacing: 0,
        textRowFontName: '',
        textRowFontSize: -1,  // sentinel: -1 forces rebuild on first call
        m1TitleOffX: 0,
        m1TitleOffY: 0,
        m1CodecOffX: 0,
        m1CodecOffY: 0
    },

    // Persistent font object for mode-1 play icon — only btnFont is consumed by _drawMode1BtnLayer.
    // title/album/codecInfo fonts are built inline via getFont() (LRU-cached) so no persistent
    // handles are needed here.
    fontCache: {
        btnFont: null,
        btnFontName: '',
        btnFontSize: 0
    },

    // Layered caches for Display Mode 1 - only rebuild changed layer
    textLayerBitmap: null,
    textLayerKey: '',
    btnLayerBitmap: null,
    btnLayerState: '',

};

// ===================== LAYOUT CACHE =====================
// Precomputes layout for display mode 1 - avoids recalculating every frame
function ensureLayoutCache(w, h) {
    const lc = State.layoutCache;
    const pc = State.paintCache;

    const _pcM1TitleSize = pc.m1TitleSize;
    const _pcM1AlbumSize = pc.m1AlbumSize;

    if (lc.valid && lc.w === w && lc.h === h &&
        lc.displayMode === displayMode &&
        lc.textRowFontName === (textRowFontName || defaultFontName) &&
        lc.textRowFontSize === textRowFontSize &&
        lc.m1TitleSize === _pcM1TitleSize &&
        lc.m1AlbumSize === _pcM1AlbumSize &&
        lc.borderMode === borderMode &&
        lc.m1TitleOffX === m1TitleOffX && lc.m1TitleOffY === m1TitleOffY &&
        lc.m1CodecOffX === m1CodecOffX && lc.m1CodecOffY === m1CodecOffY) {
        return;
    }

    lc.w = w;
    lc.h = h;
    lc.displayMode = displayMode;
    lc.textRowFontName = textRowFontName || defaultFontName;
    lc.textRowFontSize = textRowFontSize;
    lc.borderMode  = borderMode;

    // Store offset snapshots for the validity check above.
    // m1TitleOffX/Y are already baked into lc.leftX / lc.topY.
    // m1CodecOffY is also read directly in _drawMode1TextLayer for the codec strip.
    lc.m1TitleOffX = m1TitleOffX;
    lc.m1TitleOffY = m1TitleOffY;
    lc.m1CodecOffX = m1CodecOffX;
    lc.m1CodecOffY = m1CodecOffY;

    const basePad      = pc.padding;
    lc.padding         = basePad;

    lc.leftX           = Math.max(borderMode > 0 ? borderMode : 2, basePad + m1TitleOffX);

    lc.topY            = Math.max(borderMode > 0 ? borderMode : 2, basePad + m1TitleOffY);

    lc.m1TitleSize     = pc.m1TitleSize;
    lc.m1AlbumSize     = pc.m1AlbumSize;

    lc.rowSpacing      = Math.max(2, Math.round(pc.techSize * 0.35));

    lc.valid = true;
}

function invalidateLayoutCache() {
    State.layoutCache.valid = false;
}

function rebuildPaintFonts(btnSize) {
    const fc          = State.fontCache;
    const wantedName  = playIconType > 0 ? LCD_ICON_FONT_NAMES[playIconType] : 'FontAwesome';
    const sizeChanged = fc.btnFontSize !== btnSize;
    const nameChanged = fc.btnFontName !== wantedName;
    if (sizeChanged || nameChanged) {
        fc.btnFontSize = btnSize;
        fc.btnFontName = wantedName;
        fc.btnFont     = getFont(wantedName, btnSize, 0);
    }
}

// ===================== LAYERED CACHES FOR DISPLAY MODE 1 =====================

// Helper: draw text layer for Display Mode 1
function _drawMode1TextLayer(g, w, h, lc, m1TruncatedTitle, m1TruncatedAlbum) {
    const theme = getTheme();
    const trFont     = lc.textRowFontName;
    const leftX      = lc.leftX;
    const availableW = w - lc.leftX * 2;

    const rowSpacing = lc.rowSpacing;
    
    // Title
    const titleText = textCache.titleText;
    // Use already-shrunk values from paintCache directly
    let titleFontSize = State.paintCache.m1TitleSize;
    if (titleText && showM1Title) {
        const titleFont = getFont(trFont, titleFontSize, 0);
        // Use truncated text if available
        const drawTitleText = m1TruncatedTitle || titleText;
        const m = g.MeasureString(drawTitleText, titleFont, 0, 0, w * 4, h * 4);
        const textX = leftX;
        const textY = lc.topY;
        const titleDrawW = Math.min(m.Width, w - textX);
        const titleDrawH = Math.round(titleFontSize * 1.5);
        // Draw glow
        if (showGlow && opGlow > 0) {
            const maxR = Math.max(1, Math.round(titleFontSize * 0.12));
            for (let i = 1; i <= 2; i++) {
                const a = Math.floor(opGlow * (1 - i/2) * 0.15);
                if (a > 0) {
                    const off = maxR * (i/2);
                    g.DrawString(drawTitleText, titleFont, SetAlpha(theme.lcd, a), textX - off, textY, titleDrawW, titleDrawH);
                    g.DrawString(drawTitleText, titleFont, SetAlpha(theme.lcd, a), textX + off, textY, titleDrawW, titleDrawH);
                    g.DrawString(drawTitleText, titleFont, SetAlpha(theme.lcd, a), textX, textY - off, titleDrawW, titleDrawH);
                    g.DrawString(drawTitleText, titleFont, SetAlpha(theme.lcd, a), textX, textY + off, titleDrawW, titleDrawH);
                }
            }
        }
        g.DrawString(drawTitleText, titleFont, SetAlpha(theme.lcd, opClock), textX, textY, titleDrawW, titleDrawH);
    }
    
    // Album - use already-shrunk value from paintCache
    const albumText = textCache.albumText;
    let albumFontSize = State.paintCache.m1AlbumSize;
    if (albumText && showM1Album) {
        const albumFont = getFont(trFont, albumFontSize, 0);
        // Use truncated text if available
        const drawAlbumText = m1TruncatedAlbum || albumText;
        const m = g.MeasureString(drawAlbumText, albumFont, 0, 0, w * 4, h * 4);
        const textX = leftX;
        const textY = (showM1Title && titleText) ? lc.topY + titleFontSize + rowSpacing : lc.topY;
        const drawW = Math.min(m.Width, w - textX);
        const drawH = Math.round(albumFontSize * 1.5);
        g.DrawString(drawAlbumText, albumFont, SetAlpha(theme.lcd, Math.floor(opClock * 0.7)), textX, textY, drawW, drawH);
    }
    
    // Codec info row — gated by per-mode toggles.
    if (showM1Codec || showM1Tech) {
    const bitrate    = textCache.bitrate;
    const sampleRate = textCache.sampleRate;
    const bits       = textCache.bits;
    const channels   = textCache.channels;
    const codec      = codecStr;

    // Codec row is allowed to use at most 75% of the available row width.
    const codecMaxW  = Math.round(availableW * 0.75);
    // Build values and matching colors from the two independent toggles.
    const values = [];
    const colors = [];
    if (showM1Codec) { values.push(codec);                                colors.push(TN_PINK);   }
    if (showM1Tech)  { values.push(bitrate, sampleRate, bits, channels);  colors.push(TN_YELLOW, TN_CYAN, TN_GREEN, TN_ORANGE); }
    if (values.length === 0) return;

    let codecInfoSize = m1CodecFontSize > 0 ? _scale(m1CodecFontSize) : State.paintCache.techSize;
    {
        let spacing0 = Math.max(3, Math.round(codecInfoSize * 0.4));
        let total0   = 0;
        for (let i = 0; i < values.length; i++) {
            if (values[i]) {
                total0 += g.MeasureString(values[i], getFont(codecFontName || defaultFontName, codecInfoSize, 0), 0, 0, 4000, 4000).Width;
                if (i < values.length - 1) total0 += spacing0;
            }
        }
        if (total0 > codecMaxW) {
            for (let iter = 0; iter < 200; iter++) {
                codecInfoSize--;
                if (codecInfoSize <= 8) { codecInfoSize = 8; break; }
                const tf      = getFont(codecFontName || defaultFontName, codecInfoSize, 0);
                const spacing = Math.max(3, Math.round(codecInfoSize * 0.4));
                let total     = 0;
                for (let i = 0; i < values.length; i++) {
                    if (values[i]) {
                        total += g.MeasureString(values[i], tf, 0, 0, 4000, 4000).Width;
                        if (i < values.length - 1) total += spacing;
                    }
                }
                if (total <= codecMaxW) break;
            }
        }
    }

    // Compute strip geometry now that codecInfoSize is finalised.
    // Anchored to the panel bottom identically to mode 0 (pc.bottomY formula).
    const bottomH = Math.max(12, Math.round(codecInfoSize * 1.25));
    const bottomY = (h - bottomH - Math.max(2, borderMode)) + lc.m1CodecOffY;

    const codecInfoFont = getFont(codecFontName || defaultFontName, codecInfoSize, 0);
    const spacing       = Math.max(4, Math.round(codecInfoSize * 0.35));

    // Measure codec parts. Cache key includes toggle states so it invalidates when
    // showCodec/showTechDetails change, not just when text or size changes.
    const codecKey = bitrate + '|' + sampleRate + '|' + bits + '|' + channels + '|' + codec + '|' + codecInfoSize + '|' + (showM1Codec?1:0) + '|' + (showM1Tech?1:0);
    if (measureCache.codecInfoKey !== codecKey || measureCache.codecInfoSize !== codecInfoSize) {
        measureCache.codecInfoKey  = codecKey;
        measureCache.codecInfoSize = codecInfoSize;
        for (let i = 0; i < values.length; i++) {
            const pm   = g.MeasureString(values[i] || '', codecInfoFont, 0, 0, 4000, 4000);
            const slot = measureCache.codecParts[i] || (measureCache.codecParts[i] = {});
            slot.text  = values[i] || '';
            slot.color = colors[i];
            slot.width = pm.Width;
        }
        measureCache.codecParts.length = values.length;
    }

    // Draw codec parts. If still over codecMaxW at 8px minimum, drop parts from
    // the right (codec name → channels → bits → sampleRate → bitrate) until they fit.
    // Determine how many parts to show by measuring from the left.
    let visibleCount = measureCache.codecParts.length;
    {
        let total = 0;
        for (let i = 0; i < measureCache.codecParts.length; i++) {
            total += measureCache.codecParts[i].width;
            if (i < measureCache.codecParts.length - 1) total += spacing;
        }
        while (visibleCount > 1 && total > codecMaxW) {
            // Remove rightmost part: subtract its width and the preceding separator.
            total -= measureCache.codecParts[visibleCount - 1].width + spacing;
            visibleCount--;
        }
    }
    let xPos = lc.padding + lc.m1CodecOffX;
    for (let i = 0; i < visibleCount; i++) {
        const part = measureCache.codecParts[i];
        g.DrawString(part.text, codecInfoFont, SetAlpha(part.color, 220), xPos, bottomY, part.width, bottomH);
        xPos += part.width + spacing;
    }
    } // end if (showM1Codec || showM1Tech)
}

// Helper: draw button layer for Display Mode 1
// Icon font/type/blink mirrors PlayList.js logic:
//   playIconType 0 = hidden, 1 = Guifx2, 2 = FontAwesome, 3 = Segoe MDL2
//   playIconBlink: when true, icon hides on flash-off state while playing (not paused)
function _drawMode1BtnLayer(g, w, h, fc, btnHeight, borderInset) {
    if (playIconType === 0) return;  // icon hidden — blank layer

    const isPlaying = fb.IsPlaying && !fb.IsPaused;
    // Blink: only when playing (not paused); paused icon always visible
    const showIcon = !isPlaying || !playIconBlink || btnFlash;
    if (!showIcon) return;

    const fontName  = LCD_ICON_FONT_NAMES[playIconType];
    const iconChars = LCD_ICON_CHARS[fontName];  // renamed: avoids shadowing global 'chars' from helpers.js
    const btnIcon   = isPlaying ? iconChars.play : iconChars.pause;
    const btnFont   = fc.btnFont;
    // Square hit area. borderInset and btnHeight are both pre-clamped at the call
    // site so btnX >= borderInset and the icon never overflows the panel edge.
    const btnWidth = btnHeight;
    const btnX     = w - borderInset - btnWidth;
    // drawH = 1.5x em-size so the GDI+ line box never clips the glyph.
    // Vertically centre within the border-inset interior.
    const drawH = Math.round(btnHeight * 1.5);
    // Anchor by btnHeight (the em-size / visible glyph height), not drawH.
    // The extra 0.5x in drawH is headroom above/below to prevent GDI+ clipping —
    // if we anchor by drawH the visible glyph floats above the panel bottom.
    const btnY  = h - borderMode - btnHeight;
    g.DrawString(btnIcon, btnFont, SetAlpha(TN_CYAN, 230), btnX, btnY, btnWidth, drawH);
}

function updatePaintCache(w, h) {
    if (State.paintCache.valid && State.paintCache.width === w && State.paintCache.height === h) return;

    State.paintCache.width  = w;
    State.paintCache.height = h;

    if (autoFontSize) {
        // AUTO-FONT SIZING: size purely by height = h * 0.618 (golden ratio).
        //
        // The nominal px size passed to gdi.Font() IS the em-square height —
        // that is the value we want to fill 61.8% of the panel.
        // MeasureString line-box height is larger (1.2-1.4x) due to font
        // internal spacing; it must not exceed the panel height (hard guard),
        // but is NOT the sizing target.
        //
        // Width is checked against the ghost string that will actually be
        // shown: '88:88' for tracks < 1 h (5 chars) or '88:88:88' for
        // tracks >= 1 h (8 chars).  Sizing to the widest-possible string for
        // the current track length means the font fills the panel as large as
        // possible without ever overflowing.
        const trackLen = (fb.IsPlaying || fb.IsPaused) ? fb.PlaybackLength : 0;
        const testStr  = trackLen >= 3600 ? '88:88:88' : '88:88';
        let sz = Math.floor(h * 0.618);
        if (sz >= 8) {
            const f = getFont(clockFontName || defaultFontName, sz, 1);
            const m = _gr.MeasureString(testStr, f, 0, 0, w * 4, h * 4);
            // Only shrink if the string overflows width or line-box overflows height.
            if (m.Width > w - 4 || m.Height > h) {
                for (let iter = 0; iter < 200; iter++) {
                    sz -= 1;
                    if (sz <= 8) break;
                    const f2 = getFont(clockFontName || defaultFontName, sz, 1);
                    const m2 = _gr.MeasureString(testStr, f2, 0, 0, w * 4, h * 4);
                    if (m2.Width <= w - 4 && m2.Height <= h) break;
                }
            }
        }
        State.paintCache.clockSize = Math.max(8, sz);
        // Cap codec at 72px (mode0 audio codec, mode1 title)
        State.paintCache.codecSize = Math.min(72, Math.max(8, Math.round(h * 0.14)));
        // Cap tech at 52px (mode0 tech details, mode1 album)
        State.paintCache.techSize  = Math.min(52, Math.max(8, Math.round(h * 0.10)));
    } else {
        // User-entered point sizes — _scale() (helpers.js) converts pt → px at current DPI.
        State.paintCache.clockSize = _scale(clockFontSize);
        State.paintCache.codecSize = _scale(codecFontSize);
        State.paintCache.techSize  = _scale(techFontSize);
    }

    // === Horizontal shrink: codec and tech must fit within panel width ===
    // The clock already does this; codec and tech were height-only and could overflow
    // the panel when it is made narrow.  We shrink here, before font objects are
    // created, so the fonts below always reflect the final clamped sizes.
    // availW mirrors the left-edge padding used at draw time.
    const _shrinkPad = 15 + (borderMode > 0 ? Math.ceil(borderMode / 2) + 4 : 0);
    const _availW    = Math.max(1, w - 2 * _shrinkPad);

    // Codec: single string — same pattern as clock shrink loop.
    if (codecStr && codecStr.trim().length > 0) {
        let csz = State.paintCache.codecSize;
        const cf0 = getFont(codecFontName || defaultFontName, csz, 0);
        if (_gr.MeasureString(codecStr, cf0, 0, 0, w * 4, h * 4).Width > _availW) {
            for (let iter = 0; iter < 200; iter++) {
                csz--;
                if (csz <= 8) break;
                const cf = getFont(codecFontName || defaultFontName, csz, 0);
                if (_gr.MeasureString(codecStr, cf, 0, 0, w * 4, h * 4).Width <= _availW) break;
            }
        }
        State.paintCache.codecSize = Math.max(8, csz);
    }

    // Tech: measure all four parts + separators as a combined total width.
    {
        let tsz = State.paintCache.techSize;
        const _techTexts = [textCache.bitrate, textCache.sampleRate, textCache.bits, textCache.channels];
        const tf0 = getFont(techFontName || defaultFontName, tsz, 0);
        const _sep0 = Math.max(4, Math.round(tsz * 0.35));
        let _total0 = 0;
        for (let i = 0; i < _techTexts.length; i++) {
            if (_techTexts[i]) {
                _total0 += _gr.MeasureString(_techTexts[i], tf0, 0, 0, w * 4, h * 4).Width;
                if (i < _techTexts.length - 1) _total0 += _sep0;
            }
        }
        if (_total0 > _availW) {
            for (let iter = 0; iter < 200; iter++) {
                tsz--;
                if (tsz <= 8) break;
                const tf = getFont(techFontName || defaultFontName, tsz, 0);
                const _sep = Math.max(4, Math.round(tsz * 0.35));
                let _total = 0;
                for (let i = 0; i < _techTexts.length; i++) {
                    if (_techTexts[i]) {
                        _total += _gr.MeasureString(_techTexts[i], tf, 0, 0, w * 4, h * 4).Width;
                        if (i < _techTexts.length - 1) _total += _sep;
                    }
                }
                if (_total <= _availW) break;
            }
        }
        State.paintCache.techSize = Math.max(8, tsz);
    }
    
    // Mode 0 bottom area — compute FIRST so the m1 sizing formula below can use it.
    // Height tracks techSize so the strip hugs the text.
    State.paintCache.bottomH = Math.max(12, Math.round(State.paintCache.techSize * 1.25));
    State.paintCache.bottomY = h - State.paintCache.bottomH - Math.max(2, borderMode);

    // Mode 1: size title/album to fit within the available vertical content area.
    // Available = h - bottom strip - border - estimated top margin (clamped to >=0).
    // Using the actual available height prevents the title from growing beyond what
    // fits as the panel is expanded — the previous h*0.30 formula had no concept
    // of the bottom strip or top margin so overshooting caused disappearing text.
    // Formula: title + album (0.60×title) + spacing (0.15×title) ≈ 1.75×title ≤ availH
    if (autoFontSize) {
        const _m1TopYEst = Math.max(0, 15 + (borderMode > 0 ? Math.ceil(borderMode / 2) + 4 : 0) + m1TitleOffY);
        const _m1AvailH  = Math.max(32, h - State.paintCache.bottomH - Math.max(2, borderMode) - _m1TopYEst);
        State.paintCache.m1TitleSize = Math.min(72, Math.max(8, Math.floor(_m1AvailH / 1.75)));
        State.paintCache.m1AlbumSize = Math.min(52, Math.max(8, Math.floor(State.paintCache.m1TitleSize * 0.60)));
    } else {
        State.paintCache.m1TitleSize = _scale(textRowFontSize);
        State.paintCache.m1AlbumSize = Math.max(8, Math.round(State.paintCache.m1TitleSize * 0.618));
    }
    
    // Horizontal shrink for mode 1 title: shrink if wider than available width.
    // _m1LeftX matches lc.leftX exactly (same formula as ensureLayoutCache) so the
    // shrink boundary is the same pixel as where text actually starts drawing.
    // pc.padding hasn't been assigned yet at this point so we inline the formula.
    // The draw clip rect is [leftX .. w], so available = w - leftX (subtract once,
    // not twice — right side clips at panel edge, not a mirrored margin).
    const _basePad  = 15 + (borderMode > 0 ? Math.ceil(borderMode / 2) + 4 : 0);
    const _m1LeftX  = Math.max(borderMode > 0 ? borderMode : 2, _basePad + m1TitleOffX);
    const _m1AvailW = Math.max(1, w - _m1LeftX);
    State.paintCache.m1TruncatedTitle = null;
    State.paintCache.m1TruncatedAlbum = null;
    
    // Title: shrink or truncate with ...
    if (textCache.titleText && textCache.titleText.length > 0) {
        let tsz = State.paintCache.m1TitleSize;
        const tf0 = getFont(textRowFontName || defaultFontName, tsz, 0);
        if (_gr.MeasureString(textCache.titleText, tf0, 0, 0, w * 4, h * 4).Width > _m1AvailW) {
            for (let iter = 0; iter < 200; iter++) {
                tsz--;
                if (tsz <= 12) break;
                const tf = getFont(textRowFontName || defaultFontName, tsz, 0);
                if (_gr.MeasureString(textCache.titleText, tf, 0, 0, w * 4, h * 4).Width <= _m1AvailW) break;
            }
        }
        State.paintCache.m1TitleSize = Math.max(12, tsz);
        // If title shrank below the already-computed album size, pull album down with it.
        State.paintCache.m1AlbumSize = Math.min(State.paintCache.m1AlbumSize, State.paintCache.m1TitleSize);
        
        // If still too wide at min size, truncate with ...
        const finalFont = getFont(textRowFontName || defaultFontName, State.paintCache.m1TitleSize, 0);
        if (_gr.MeasureString(textCache.titleText, finalFont, 0, 0, w * 4, h * 4).Width > _m1AvailW) {
            let truncated = textCache.titleText;
            while (truncated.length > 0 && _gr.MeasureString(truncated + '...', finalFont, 0, 0, w * 4, h * 4).Width > _m1AvailW) {
                truncated = truncated.slice(0, -1);
            }
            State.paintCache.m1TruncatedTitle = truncated + '...';
        }
    }
    
    // Album: shrink or truncate with ...
    if (textCache.albumText && textCache.albumText.length > 0) {
        let asz = State.paintCache.m1AlbumSize;
        const af0 = getFont(textRowFontName || defaultFontName, asz, 0);
        if (_gr.MeasureString(textCache.albumText, af0, 0, 0, w * 4, h * 4).Width > _m1AvailW) {
            for (let iter = 0; iter < 200; iter++) {
                asz--;
                if (asz <= 12) break;
                const af = getFont(textRowFontName || defaultFontName, asz, 0);
                if (_gr.MeasureString(textCache.albumText, af, 0, 0, w * 4, h * 4).Width <= _m1AvailW) break;
            }
        }
        // Album must never exceed title size — clamp after the shrink loop so that
        // a wide album text can't end up larger than a wide title that already shrank.
        State.paintCache.m1AlbumSize = Math.min(Math.max(12, asz), State.paintCache.m1TitleSize);
        
        // If still too wide at min size, truncate with ...
        const finalFont = getFont(textRowFontName || defaultFontName, State.paintCache.m1AlbumSize, 0);
        if (_gr.MeasureString(textCache.albumText, finalFont, 0, 0, w * 4, h * 4).Width > _m1AvailW) {
            let truncated = textCache.albumText;
            while (truncated.length > 0 && _gr.MeasureString(truncated + '...', finalFont, 0, 0, w * 4, h * 4).Width > _m1AvailW) {
                truncated = truncated.slice(0, -1);
            }
            State.paintCache.m1TruncatedAlbum = truncated + '...';
        }
    }

    State.paintCache.clockFont = getFont(clockFontName || defaultFontName, State.paintCache.clockSize, 1);
    State.paintCache.codecFont = getFont(codecFontName || defaultFontName, State.paintCache.codecSize, 0);

    // clockLineH: use clockSize directly for vertical centering.
    // MeasureString line-box height is unreliable for display/bitmap fonts like
    // Digital-7 Mono — their internal ascender/descender metrics are non-standard
    // and can return heights far larger or smaller than the actual visible glyph.
    // clockSize is the em-square we explicitly set, so it is the correct value
    // to use for centering regardless of typeface.
    State.paintCache.clockLineH = State.paintCache.clockSize;

    State.paintCache.shadowOffset = Math.max(1, Math.round(State.paintCache.clockSize / 16));
    State.paintCache.glowRadius   = Math.max(1, Math.round(State.paintCache.clockSize / 12));

    State.paintCache.padding = 15 + (borderMode > 0 ? Math.ceil(borderMode / 2) + 4 : 0);
    State.paintCache.centerY = (h / 2) + vOffset;

    State.paintCache.valid = true;
}

function invalidatePaintCache() {
    State.paintCache.valid = false;
    measureCache.invalidate();
    invalidateLayoutCache();
}

// ===================== EFFECT CACHE =====================
let scanCache = null;
let reflCache = null;
let cacheKey  = '';

function rebuildEffectCache() {
    const w = window.Width;
    const h = window.Height;
    if (w <= 0 || h <= 0) return;

    const theme  = getTheme();
    const newKey = `${w}|${h}|${themeIdx}|${opScanlines}|${opPhosphor}|${opReflection}|${showScanlines}|${showPhosphor}|${useReflection}`;

    if (newKey === cacheKey) return;

    cacheKey = newKey;

    if (scanCache) { try { scanCache.Dispose(); } catch (e) {} scanCache = null; }
    if (reflCache) { try { reflCache.Dispose(); } catch (e) {} reflCache = null; }

    // ---- Scanlines + Phosphor (SMOOTH) ----

    if (showScanlines || showPhosphor) {
        scanCache     = gdi.CreateImage(w, h);
        const sg = scanCache.GetGraphics();
        try {
            const blended     = _blendColours(theme.lcd, _RGB(255, 255, 255), 0.55);
            const scanlineCol = SetAlpha(_RGB(0, 0, 0), opScanlines);
            const sp          = CONSTANTS.SCANLINE_SPACING;  // e.g. 3
            // Phosphor half-width: number of rows each side of centre that receive glow.
            // Clamped to sp-1 so it never reaches the next scanline.
            const hw = Math.max(1, sp - 1);

            for (let y = 0; y < h; y++) {
                const row = y % sp;
                if (row === 0) {
                    // Scanline gap — darkening stripe
                    if (showScanlines && opScanlines > 0)
                        sg.FillSolidRect(0, y, w, 1, scanlineCol);
                } else {
                    // Phosphor glow: raised-cosine falloff from centre row (row===1)
                    // towards the next scanline (row===sp-1).
                    if (showPhosphor && opPhosphor > 0) {
                        // Normalised distance from the centre of the phosphor band.
                        // row 1 → t=0 (peak), row sp-1 → t=1 (zero).
                        const t = (row - 1) / hw;
                        // Raised cosine: 0.5*(1 + cos(PI*t)) — 1 at centre, 0 at edge.
                        const env = 0.5 * (1 + Math.cos(Math.PI * t));
                        const a   = Math.round(opPhosphor * env);
                        if (a > 0)
                            sg.FillSolidRect(0, y, w, 1, SetAlpha(blended, a));
                    }
                }
            }
        } catch (e) {
            console.log('LCD: Scanline cache error:', e);
        } finally {
            scanCache.ReleaseGraphics(sg);
        }
    }

    // ---- Reflection (smoothstep, banded) ----
    if (useReflection && opReflection > 0) {
        reflCache   = gdi.CreateImage(w, h);
        const rg    = reflCache.GetGraphics();
        try {
            const reflH = Math.floor(h * CONSTANTS.REFLECTION_HEIGHT_RATIO);
            const white = _RGB(255, 255, 255);

            let lastAlpha = -1;
            let bandStart = 0;
            for (let y = 0; y < reflH; y++) {
                const t     = 1 - (y / reflH);
                const s     = t * t * (3 - 2 * t); // smoothstep
                const alpha = Math.floor(opReflection * s * 0.65);
                if (alpha !== lastAlpha) {
                    if (lastAlpha > 0 && y > bandStart)
                        rg.FillSolidRect(0, bandStart, w, y - bandStart, SetAlpha(white, lastAlpha));
                    lastAlpha = alpha;
                    bandStart = y;
                }
            }
            if (lastAlpha > 0)
                rg.FillSolidRect(0, bandStart, w, reflH - bandStart, SetAlpha(white, lastAlpha));
        } catch (e) {
            console.log('LCD: Reflection cache error:', e);
        } finally {
            reflCache.ReleaseGraphics(rg);
        }
    }
}

// ===================== THEME =====================
function getTheme() {
    return themes[_.clamp(themeIdx, 0, themes.length - 1)];
}

function _setThemeIdx(v) {
    themeIdx = _.clamp(v, 0, themes.length - 1);
}

// ===================== SAVE =====================
function saveAll() {
    const allProps = {  // renamed from 'props' to avoid shadowing confusion
        'LCD.Theme':           themeIdx,
        'LCD.BorderPx':        borderMode,
        'LCD.VerticalOffset':  vOffset,
        'LCD.CodecOffsetX':    codecOffX,
        'LCD.CodecOffsetY':    codecOffY,
        'LCD.DetailOffsetX':   detailOffX,
        'LCD.DetailOffsetY':   detailOffY,
        'LCD.M1TitleOffsetX':  m1TitleOffX,
        'LCD.M1TitleOffsetY':  m1TitleOffY,
        'LCD.M1CodecOffsetX':  m1CodecOffX,
        'LCD.M1CodecOffsetY':  m1CodecOffY,
        'LCD.OpClock':         opClock,
        'LCD.OpGhost':         opGhost,
        'LCD.OpTech':          opTech,
        'LCD.OpBorder':        opBorder,
        'LCD.OpBG':            opBG,
        'LCD.OpReflection':    opReflection,
        'LCD.OpShadow':        opShadow,
        'LCD.OpGlow':          opGlow,
        'LCD.OpScanlines':     opScanlines,
        'LCD.OpPhosphor':      opPhosphor,
        'LCD.ShowGhost':       showGhost,
        'LCD.UseReflection':   useReflection,
        'LCD.ShowShadow':      showShadow,
        'LCD.ShowGlow':        showGlow,
        'LCD.ShowM0Codec':     showM0Codec,
        'LCD.ShowM0Tech':      showM0Tech,
        'LCD.ShowM1Title':     showM1Title,
        'LCD.ShowM1Album':     showM1Album,
        'LCD.ShowM1Codec':     showM1Codec,
        'LCD.ShowM1Tech':      showM1Tech,
        'LCD.M1CodecFontSize': m1CodecFontSize,
        'LCD.ShowScanlines':   showScanlines,
        'LCD.ShowPhosphor':    showPhosphor,
        'LCD.CustomBg':        custBg,
        'LCD.CustomLcd':       custLcd,
        'LCD.DefaultFontName': defaultFontName,
        'LCD.AutoFontSize':    autoFontSize,
        'LCD.ClockFontName':    clockFontName,
        'LCD.ClockFontSize':    clockFontSize,
        'LCD.CodecFontName':    codecFontName,
        'LCD.CodecFontSize':    codecFontSize,
        'LCD.TechFontName':     techFontName,
        'LCD.TechFontSize':     techFontSize,
        'LCD.TextRowFontName':  textRowFontName,
        'LCD.TextRowFontSize':  textRowFontSize,
        'LCD.ModeRemaining':    modeRemaining,
        'LCD.PlayIconType':     playIconType,
        'LCD.PlayIconBlink':    playIconBlink,
        'LCD.DisplayMode':      displayMode
    };
    _.forEach(allProps, (v, k) => window.SetProperty(k, v));
}

function savePreset(slot) {
    if (slot < 1 || slot > 3) return;
    const data = {
        // Shared settings
        themeIdx, borderMode, autoFontSize,
        modeRemaining,
        opClock, opGhost, opTech, opBorder, opBG,
        opReflection, opShadow, opGlow, opScanlines, opPhosphor,
        showGhost, showM0Codec, showM0Tech, showM1Title, showM1Album, showM1Codec, showM1Tech, showShadow, showGlow,
        useReflection, showScanlines, showPhosphor,
        custBg, custLcd,
        defaultFontName,
        playIconType, playIconBlink,
        displayMode,
        // Mode 0 settings
        vOffset,
        codecOffX, codecOffY, detailOffX, detailOffY,
        clockFontName, clockFontSize,
        codecFontName, codecFontSize,
        techFontName, techFontSize,
        // Mode 1 settings
        m1TitleOffX, m1TitleOffY, m1CodecOffX, m1CodecOffY,
        m1CodecFontSize,
        textRowFontName, textRowFontSize
    };
    window.SetProperty('LCD.Preset' + slot, JSON.stringify(data));
}

function loadPreset(slot) {
    if (slot < 1 || slot > 3) return;
    const str = window.GetProperty('LCD.Preset' + slot, null);
    if (!str) return;
    const d = _.attempt(JSON.parse, str);
    if (_.isError(d)) { console.log('LCD: Load preset error: invalid JSON'); return; }
    if (d.themeIdx        !== undefined) _setThemeIdx(d.themeIdx);
    if (d.borderMode      !== undefined) borderMode      = d.borderMode;
    if (d.autoFontSize    !== undefined) autoFontSize    = d.autoFontSize;
    if (d.modeRemaining   !== undefined) modeRemaining   = d.modeRemaining;
    if (d.vOffset         !== undefined) vOffset         = d.vOffset;
    if (d.codecOffX       !== undefined) codecOffX       = d.codecOffX;
    if (d.codecOffY       !== undefined) codecOffY       = d.codecOffY;
    if (d.detailOffX      !== undefined) detailOffX      = d.detailOffX;
    if (d.detailOffY      !== undefined) detailOffY      = d.detailOffY;
    if (d.m1TitleOffX    !== undefined) m1TitleOffX    = d.m1TitleOffX;
    if (d.m1TitleOffY    !== undefined) m1TitleOffY    = d.m1TitleOffY;
    if (d.m1CodecOffX    !== undefined) m1CodecOffX    = d.m1CodecOffX;
    if (d.m1CodecOffY    !== undefined) m1CodecOffY    = d.m1CodecOffY;
    if (d.opClock         !== undefined) opClock         = d.opClock;
    if (d.opGhost         !== undefined) opGhost         = d.opGhost;
    if (d.opTech          !== undefined) opTech          = d.opTech;
    if (d.opBorder        !== undefined) opBorder        = d.opBorder;
    if (d.opBG            !== undefined) opBG            = d.opBG;
    if (d.opReflection    !== undefined) opReflection    = d.opReflection;
    if (d.opShadow        !== undefined) opShadow        = d.opShadow;
    if (d.opGlow          !== undefined) opGlow          = d.opGlow;
    if (d.opScanlines     !== undefined) opScanlines     = d.opScanlines;
    if (d.opPhosphor      !== undefined) opPhosphor      = d.opPhosphor;
    if (d.showGhost       !== undefined) showGhost       = d.showGhost;
    if (d.showM0Codec    !== undefined) showM0Codec    = d.showM0Codec;
    if (d.showM0Tech     !== undefined) showM0Tech     = d.showM0Tech;
    if (d.showM1Title    !== undefined) showM1Title    = d.showM1Title;
    if (d.showM1Album    !== undefined) showM1Album    = d.showM1Album;
    if (d.showM1Codec    !== undefined) showM1Codec    = d.showM1Codec;
    if (d.showM1Tech     !== undefined) showM1Tech     = d.showM1Tech;
    if (d.m1CodecFontSize !== undefined) m1CodecFontSize = d.m1CodecFontSize;
    if (d.showShadow      !== undefined) showShadow      = d.showShadow;
    if (d.showGlow        !== undefined) showGlow        = d.showGlow;
    if (d.useReflection   !== undefined) useReflection   = d.useReflection;
    if (d.showScanlines   !== undefined) showScanlines   = d.showScanlines;
    if (d.showPhosphor    !== undefined) showPhosphor    = d.showPhosphor;
    if (d.custBg          !== undefined) { custBg  = d.custBg;  themes[themes.length - 1].bg  = custBg;  }
    if (d.custLcd         !== undefined) { custLcd = d.custLcd; themes[themes.length - 1].lcd = custLcd; }
    if (d.clockFontName   !== undefined) clockFontName   = d.clockFontName;
    if (d.clockFontSize   !== undefined) clockFontSize   = d.clockFontSize;
    if (d.codecFontName   !== undefined) codecFontName   = d.codecFontName;
    if (d.codecFontSize   !== undefined) codecFontSize   = d.codecFontSize;
    if (d.techFontName    !== undefined) techFontName    = d.techFontName;
    if (d.techFontSize    !== undefined) techFontSize    = d.techFontSize;
    if (d.textRowFontName !== undefined) textRowFontName = d.textRowFontName;
    if (d.textRowFontSize !== undefined) textRowFontSize = d.textRowFontSize;
    if (d.defaultFontName !== undefined) defaultFontName = d.defaultFontName;
    if (d.playIconType    !== undefined) playIconType    = _.clamp(d.playIconType, 0, 3);
    if (d.playIconBlink   !== undefined) playIconBlink   = d.playIconBlink;
    if (d.displayMode     !== undefined) displayMode     = _.clamp(d.displayMode, 0, 1);

    saveAll();
    cacheKey       = '';
    staticCacheKey = '';
    invalidatePaintCache();
    invalidateMode1Layers();
    stopBtnFlashTimer();
    if (displayMode === 1 && fb.IsPlaying && !fb.IsPaused) startBtnFlashTimer();
    window.Repaint();
}

// ===================== INFO =====================
function update_info() {
    if (fb.IsPlaying || fb.IsPaused) {
        try {
            const np = fb.GetNowPlaying();
            codecStr   = _tf_codec.EvalWithMetadb(np).toUpperCase();
            const t  = _tf_title.EvalWithMetadb(np);
            const ar = _tf_artist.EvalWithMetadb(np);
            textCache.titleText  = (t && ar) ? t + ' - ' + ar : (t || ar || '');
            textCache.albumText  = _tf_album.EvalWithMetadb(np) || '';
            textCache.bitrate    = _tf_bitrate.EvalWithMetadb(np)    + ' kbps';
            textCache.sampleRate = _tf_samplerate.EvalWithMetadb(np) + ' Hz';
            textCache.bits       = _tf_bits.EvalWithMetadb(np) + ' bit';
            textCache.channels   = _tf_channels.EvalWithMetadb(np);
        } catch (e) {
            codecStr = ' ';
            textCache.titleText  = textCache.albumText  = '';
            textCache.bitrate    = textCache.sampleRate = '';
            textCache.bits       = textCache.channels   = '';
        }
    } else {
        codecStr = ' ';
        textCache.titleText  = textCache.albumText  = '';
        textCache.bitrate    = textCache.sampleRate = '';
        textCache.bits       = textCache.channels   = '';
    }

    if (infoPulseTimer) { window.ClearInterval(infoPulseTimer); infoPulseTimer = null; }
    if (fb.IsPlaying || fb.IsPaused) {
        let count = 0;
        infoPulseTimer = window.SetInterval(() => {
            codecFlash = !codecFlash;
            if (++count > CONSTANTS.INFO_FLASH_COUNT) {
                window.ClearInterval(infoPulseTimer);
                infoPulseTimer = null;
                codecFlash = true;
            }
            RepaintScheduler.request();
        }, CONSTANTS.INFO_FLASH_INTERVAL);
    }
}

// ===================== CLOCK TIMER =====================
function startClockTimer() {
    if (clockRefreshTimer) { window.ClearInterval(clockRefreshTimer); clockRefreshTimer = null; }
    // Immediate repaint when starting timer
    if (fb.IsPlaying && !fb.IsPaused) RepaintScheduler.request();
    clockRefreshTimer = window.SetInterval(() => {
        if (fb.IsPlaying && !fb.IsPaused) RepaintScheduler.request();
    }, CONSTANTS.CLOCK_UPDATE_INTERVAL);
}

function stopClockTimer() {
    if (clockRefreshTimer) {
        window.ClearInterval(clockRefreshTimer);
        clockRefreshTimer = null;
    }
}

// ===================== BTN FLASH TIMER =====================
// Persistent 500ms blink for the mode-1 play icon when playIconBlink is enabled.
// Independent of codecFlash/infoPulseTimer so it keeps blinking for the entire track.
function startBtnFlashTimer() {
    if (btnFlashTimer) return;   // already running
    if (!playIconBlink) return;  // blink disabled — no timer needed
    btnFlashTimer = window.SetInterval(() => {
        if (!fb.IsPlaying || fb.IsPaused) { stopBtnFlashTimer(); return; }
        btnFlash = !btnFlash;
        if (displayMode === 1) RepaintScheduler.request();
    }, CONSTANTS.INFO_FLASH_INTERVAL);
}

function stopBtnFlashTimer() {
    if (btnFlashTimer) { window.ClearInterval(btnFlashTimer); btnFlashTimer = null; }
    btnFlash = true;   // reset to visible so icon shows immediately on next paint
}

// ===================== PAINT =====================
function on_paint(gr) {
    const w = window.Width;
    const h = window.Height;
    if (!gr || w <= 0 || h <= 0) return;
    
    // Display off - show black screen
    if (displayOff) {
        gr.FillSolidRect(0, 0, w, h, LCD_BLACK);  // P1
        return;
    }
    
    if (!State.paintCache.valid) updatePaintCache(w, h);

    rebuildEffectCache();    // no-op if cacheKey matches (scanlines/reflection)
    rebuildStaticLayer();    // no-op if staticCacheKey matches (bg/ghost/border)
    
    const pc = State.paintCache;
    const theme = getTheme();

    // === Draw Static Layer (cached, always valid after rebuildStaticLayer()) ===
    if (staticLayerCache) gr.DrawImage(staticLayerCache, 0, 0, w, h, 0, 0, w, h);

    // === Dynamic Layer: clock time - Timer mode only ===
    if (displayMode === 0) {
        const t = fb.IsPlaying
            ? (modeRemaining ? Math.max(0, fb.PlaybackLength - fb.PlaybackTime) : fb.PlaybackTime)
            : 0;

        const rawTime  = (modeRemaining ? '-' : '') + utils.FormatDuration(t);
        // Use the digit-only length to pick ghost format — '-' extends left of
        // the ghost naturally via the right-align formula timeX = ghostX+(ghostW-timeW).
        const baseLen  = modeRemaining ? rawTime.length - 1 : rawTime.length;
        const ghostStr = baseLen > 5 ? '88:88:88' : '88:88';

        if (measureCache.ghostStr !== ghostStr) {
            const m = gr.MeasureString(ghostStr, pc.clockFont, 0, 0, w * 4, h * 4);
            measureCache.ghostStr = ghostStr;
            measureCache.ghostW = m.Width;
        }
        const ghostW = measureCache.ghostW;
        // ghostH removed — vertical centering uses pc.clockLineH (= pc.clockSize).

        if (measureCache.timeStr !== rawTime) {
            const tm = gr.MeasureString(rawTime, pc.clockFont, 0, 0, w * 4, h * 4);
            measureCache.timeStr = rawTime;
            measureCache.timeW = tm.Width;
            // timeH not stored — DrawString height uses pc.clockSize*1.5 (see below).
        }
        const timeW  = measureCache.timeW;
        // DrawString clip rect height: use clockSize*1.5 so the visible glyph
        // is never clipped regardless of the font's internal line-spacing metrics.
        // Using timeH (MeasureString line-box) clips display/mono fonts whose
        // reported height is smaller than the actual rendered glyph.
        const timeH  = Math.round(pc.clockSize * 1.5);
        const ghostX = (w - ghostW) / 2;
        const timeX  = ghostX + (ghostW - timeW);
        const centerY = pc.centerY - pc.clockLineH / 2;

        if (showShadow && opShadow > 0) {
            gr.DrawString(rawTime, pc.clockFont, SetAlpha(LCD_BLACK, opShadow),
                timeX + pc.shadowOffset, centerY + pc.shadowOffset,
                timeW, timeH);
        }

        if (showGlow && opGlow > 0) {
            const maxR = Math.max(2, Math.round(pc.glowRadius * 0.4));
            const steps = CONSTANTS.GLOW_ITERATIONS;
            for (let i = 1; i <= steps; i++) {
                const progress = i / steps;
                const a = Math.floor(opGlow * (1 - progress) * 0.22);
                if (a <= 0) break;  // alpha is monotonically decreasing; all further steps are also 0
                const off = maxR * progress;
                const col = SetAlpha(theme.lcd, a);
                gr.DrawString(rawTime, pc.clockFont, col, timeX - off, centerY, timeW, timeH);
                gr.DrawString(rawTime, pc.clockFont, col, timeX + off, centerY, timeW, timeH);
                gr.DrawString(rawTime, pc.clockFont, col, timeX, centerY - off, timeW, timeH);
                gr.DrawString(rawTime, pc.clockFont, col, timeX, centerY + off, timeW, timeH);
            }
        }

        // Draw main clock
        gr.DrawString(rawTime, pc.clockFont, SetAlpha(theme.lcd, opClock),
            timeX, centerY, timeW, timeH);
    }  // End if(displayMode === 0) — Timer mode

    // === Display Mode 1: Static Title/Album/Codecs ===
    if (displayMode === 1 && (fb.IsPlaying || fb.IsPaused)) {
        // Skip content rendering if panel is too small, but do NOT return —
        // the opacity slider and position-adjust overlays below still need to draw.
        if (w < 50 || h < 40) { /* panel too small — skip mode-1 content */ } else {
        
        // Use layout cache - only recalculates when needed
        ensureLayoutCache(w, h);
        const lc = State.layoutCache;
        
        // Play icon em-size = 50% of interior height, but also capped horizontally.
        // The codec row uses 75% of availableW in _drawMode1TextLayer (w - lc.leftX*2),
        // so the button must use the same availableW to guarantee it fits in the remaining 25%.
        const innerH      = h - 2 * borderMode;
        const borderInset = borderMode > 0 ? borderMode + 2 : lc.leftX;
        const availableW  = w - lc.leftX * 2;
        const maxBtnByH   = Math.max(12, Math.round(innerH * 0.5));
        const maxBtnByW   = Math.max(12, Math.round(availableW * 0.25));
        const btnHeight   = Math.min(maxBtnByH, maxBtnByW);
        rebuildPaintFonts(btnHeight);
        const fc = State.fontCache;
        
        const textKey = `${w}x${h}|${textCache.titleText}|${textCache.albumText}|${textCache.bitrate}|${textCache.sampleRate}|${textCache.bits}|${textCache.channels}|${codecStr}|${themeIdx}|${opClock}|${opGlow}|${showGlow ? 1 : 0}|${showM1Title?1:0}|${showM1Album?1:0}|${showM1Codec?1:0}|${showM1Tech?1:0}|${State.paintCache.m1TitleSize}|${State.paintCache.m1AlbumSize}`;
        const needsTextRebuild = State.textLayerKey !== textKey;
        const isPlaying = fb.IsPlaying && !fb.IsPaused;

        const showIconNow = (playIconType > 0) && (!isPlaying || !playIconBlink || btnFlash);
        const btnKey = `${playIconType}|${isPlaying ? 1 : 0}|${showIconNow ? 1 : 0}|${borderMode}`;
        const needsBtnRebuild = State.btnLayerState !== btnKey;
        
        // Lazy rebuild: only when needed
        if (needsTextRebuild || needsBtnRebuild || !State.textLayerBitmap || !State.btnLayerBitmap) {
            // Build/update layers
            if (needsTextRebuild || !State.textLayerBitmap) {
                if (State.textLayerBitmap) { try { State.textLayerBitmap.Dispose(); } catch(e) {} }
                State.textLayerBitmap = gdi.CreateImage(w, h);
                const gl = State.textLayerBitmap.GetGraphics();
                try { _drawMode1TextLayer(gl, w, h, lc, State.paintCache.m1TruncatedTitle, State.paintCache.m1TruncatedAlbum); }
                catch(e) { console.log('LCD: Mode1 text layer error:', e); }
                finally   { State.textLayerBitmap.ReleaseGraphics(gl); }
                State.textLayerKey = textKey;
            }
            if (needsBtnRebuild || !State.btnLayerBitmap) {
                if (State.btnLayerBitmap) { try { State.btnLayerBitmap.Dispose(); } catch(e) {} }
                State.btnLayerBitmap = gdi.CreateImage(w, h);
                const gb = State.btnLayerBitmap.GetGraphics();
                try { _drawMode1BtnLayer(gb, w, h, fc, btnHeight, borderInset); }
                catch(e) { console.log('LCD: Mode1 btn layer error:', e); }
                finally   { State.btnLayerBitmap.ReleaseGraphics(gb); }
                State.btnLayerState = btnKey;
            }
        }
        
        // Blit cached layers (zero drawing cost)
        if (State.textLayerBitmap) gr.DrawImage(State.textLayerBitmap, 0, 0, w, h, 0, 0, w, h);
        if (State.btnLayerBitmap) gr.DrawImage(State.btnLayerBitmap, 0, 0, w, h, 0, 0, w, h);
        } // end else (panel large enough for mode-1 content)
    }

    // === Display Mode 0 (Timer): Codec + Tech Info ===
    // Audio codec at top left (showCodec)
    if (displayMode === 0 && showM0Codec && codecStr && codecStr.length > 0 && (fb.IsPlaying || fb.IsPaused) && pc.codecFont) {
        const codecColor = SetAlpha(theme.lcd, codecFlash ? opTech : Math.floor(opTech * 0.3));
        const m = gr.MeasureString(codecStr, pc.codecFont, 0, 0, w * 2, h * 2);
        gr.DrawString(codecStr, pc.codecFont, codecColor, pc.padding + codecOffX, pc.padding + codecOffY, m.Width, m.Height);
    }
    
    // Tech info at bottom left (showTechDetails)
    if (displayMode === 0 && showM0Tech && (fb.IsPlaying || fb.IsPaused)) {
        const bottomH  = pc.bottomH;
        const bottomY  = pc.bottomY + detailOffY;
        const infoSize = pc.techSize;
        const infoFont = getFont(techFontName || defaultFontName, infoSize, 0);

        const parts  = TECH_PARTS;
        const sepGap = Math.max(4, Math.round(infoSize * 0.35));

        // Pre-measure all parts.
        const techWidths = [];
        for (let i = 0; i < parts.length; i++) {
            const text = textCache[TECH_TEXT_KEYS[i]];
            techWidths[i] = text ? gr.MeasureString(text, infoFont, 0, 0, w * 4, bottomH).Width : 0;
        }

        // If at 8px minimum the row still overflows, drop rightmost parts until it fits.
        const techAvailW = Math.max(1, w - (pc.padding + detailOffX) - pc.padding);
        let visibleCount = parts.length;
        {
            let total = 0;
            for (let i = 0; i < parts.length; i++) {
                total += techWidths[i];
                if (i < parts.length - 1) total += sepGap;
            }
            while (visibleCount > 1 && total > techAvailW) {
                total -= techWidths[visibleCount - 1] + sepGap;
                visibleCount--;
            }
        }

        let xPos = pc.padding + detailOffX;
        for (let i = 0; i < visibleCount; i++) {
            const text = textCache[TECH_TEXT_KEYS[i]];
            if (text) {
                gr.DrawString(text, infoFont, SetAlpha(parts[i].color, 220), xPos, bottomY, techWidths[i], bottomH);
                xPos += techWidths[i] + (i < visibleCount - 1 ? sepGap : 0);
            }
        }
    }

    // === Dynamic Layer: opacity slider & position adjust ===
    if (opacitySliderTarget) {
        const barW = Math.min(220, w * 0.6);
        const barH = 6;
        const bx = Math.floor((w - barW) / 2);
        const by = h - 18;
        const acc = _.get(opAccessors, opacitySliderTarget);
        const v = acc ? acc.get() : 0;
        gr.FillSolidRect(bx, by, barW, barH, SetAlpha(LCD_WHITE, 60));  // P1
        gr.FillSolidRect(bx, by, Math.floor(barW * (v / 255)), barH, SetAlpha(LCD_WHITE, 180));  // P1
        const labelFont = getFont('Segoe UI', 10, 0);
        const label = opacitySliderTarget + ': ' + v;
        const lSize = gr.MeasureString(label, labelFont, 0, 0, w, 30);
        gr.DrawString(label, labelFont, SetAlpha(LCD_WHITE, 220),  // P1
            (w - lSize.Width) / 2, by - lSize.Height - 4, lSize.Width, lSize.Height);
    }

    if (positionAdjustMode) {
        const msg = positionAdjustMode === 'Clock'
            ? 'Adjusting CLOCK — Scroll: Up/Down | Click to exit'
            : 'Adjusting ' + positionAdjustMode.toUpperCase() +
              ' — Scroll: Up/Down | Shift+Scroll: Left/Right | Click to exit';
        const msgFont = getFont('Segoe UI', 10, 0);
        const mSize = gr.MeasureString(msg, msgFont, 0, 0, w, 50);
        const msgX = (w - mSize.Width) / 2;
        const msgY = h - 35;
        gr.FillSolidRect(msgX - 5, msgY - 2, mSize.Width + 10, mSize.Height + 4,
            SetAlpha(LCD_BLACK, 200));  // P1
        gr.DrawString(msg, msgFont, SetAlpha(LCD_WHITE, 255),  // P1
            msgX, msgY, mSize.Width, mSize.Height);
    }
}

// ===================== PANEL CALLBACKS =====================
function invalidateMode1Layers() {
    State.textLayerKey  = '';
    State.btnLayerState = '';
    if (State.textLayerBitmap) { try { State.textLayerBitmap.Dispose(); } catch(e) {} State.textLayerBitmap = null; }
    if (State.btnLayerBitmap)  { try { State.btnLayerBitmap.Dispose();  } catch(e) {} State.btnLayerBitmap  = null; }
}

function on_size() {
    cacheKey = '';
    staticCacheKey = '';
    invalidatePaintCache();
    invalidateMode1Layers();
    window.Repaint();
}

function on_colours_changed() {
    cacheKey       = '';
    staticCacheKey = '';
    invalidateMode1Layers();  // system colour change can affect text rendering too
    window.Repaint();
}

function on_font_changed() {
    invalidatePaintCache();
    staticCacheKey = '';
    invalidateMode1Layers();
    window.Repaint();
}

// ===================== KEYBOARD =====================
function on_key_down(vkey) {
    if (!positionAdjustMode) return false;

    // VK_ constants from helpers.js — no magic numbers.
    const step = utils.IsKeyPressed(VK_SHIFT) ? 5 : CONSTANTS.POSITION_STEP;

    switch (positionAdjustMode) {
        case 'M1Title':
            if      (vkey === VK_LEFT)  { m1TitleOffX -= step; invalidateLayoutCache(); invalidateMode1Layers(); }
            else if (vkey === VK_RIGHT) { m1TitleOffX += step; invalidateLayoutCache(); invalidateMode1Layers(); }
            else if (vkey === VK_UP)    { m1TitleOffY -= step; invalidateLayoutCache(); invalidateMode1Layers(); }
            else if (vkey === VK_DOWN)  { m1TitleOffY += step; invalidateLayoutCache(); invalidateMode1Layers(); }
            else return false;
            break;
        case 'M1Codec':
            if      (vkey === VK_LEFT)  { m1CodecOffX -= step; invalidateLayoutCache(); invalidateMode1Layers(); }
            else if (vkey === VK_RIGHT) { m1CodecOffX += step; invalidateLayoutCache(); invalidateMode1Layers(); }
            else if (vkey === VK_UP)    { m1CodecOffY -= step; invalidateLayoutCache(); invalidateMode1Layers(); }
            else if (vkey === VK_DOWN)  { m1CodecOffY += step; invalidateLayoutCache(); invalidateMode1Layers(); }
            else return false;
            break;
        case 'Clock':
            if      (vkey === VK_UP)    { vOffset -= step; invalidatePaintCache(); invalidateStaticLayer(); }
            else if (vkey === VK_DOWN)  { vOffset += step; invalidatePaintCache(); invalidateStaticLayer(); }
            else return false;
            break;
        case 'Codec':
            if      (vkey === VK_LEFT)  codecOffX -= step;
            else if (vkey === VK_RIGHT) codecOffX += step;
            else if (vkey === VK_UP)    codecOffY -= step;
            else if (vkey === VK_DOWN)  codecOffY += step;
            else return false;
            break;
        case 'Details':
            if      (vkey === VK_LEFT)  detailOffX -= step;
            else if (vkey === VK_RIGHT) detailOffX += step;
            else if (vkey === VK_UP)    detailOffY -= step;
            else if (vkey === VK_DOWN)  detailOffY += step;
            else return false;
            break;
        default:
            return false;
    }

    saveAll();
    window.Repaint();
    return true;
}

// ===================== MOUSE =====================
const STATIC_OPACITY_TARGETS = new Set(['Background', 'Ghost', 'Border']);
const EFFECT_OPACITY_TARGETS  = new Set(['Reflection', 'Scanlines', 'Phosphor']);

function on_mouse_wheel(step) {
    // Cycle display mode if not in adjust mode or opacity mode
    if (!positionAdjustMode && !opacitySliderTarget) {
        displayMode = displayMode === 0 ? 1 : 0;
        invalidateStaticLayer();
        invalidatePaintCache();   // Force recalc of font sizes for new mode
        invalidateLayoutCache(); // Force recalc of layout for new mode
        invalidateMode1Layers(); // Dispose stale mode-1 bitmaps immediately on mode switch
        // Manage btn blink timer when switching modes.
        // Mode 0 → mode 1: start timer if playing and blink enabled.
        // Mode 1 → mode 0: stop timer (not needed in timer mode).
        stopBtnFlashTimer();
        if (displayMode === 1) startBtnFlashTimer();
        saveAll();
        window.Repaint();
        return true;
    }
    
    if (positionAdjustMode) {
        const delta          = step > 0 ? -CONSTANTS.POSITION_STEP : CONSTANTS.POSITION_STEP;
        const isShiftPressed = utils.IsKeyPressed(VK_SHIFT);

        switch (positionAdjustMode) {
            case 'Clock':
                vOffset += delta; invalidatePaintCache(); invalidateStaticLayer(); break;
            case 'Codec':
                if (isShiftPressed) codecOffX += delta; else codecOffY += delta; break;
            case 'M1Title': if (isShiftPressed) { m1TitleOffX += delta; } else { m1TitleOffY += delta; } invalidateLayoutCache(); invalidateMode1Layers(); break;
            case 'M1Codec': if (isShiftPressed) { m1CodecOffX += delta; } else { m1CodecOffY += delta; } invalidateLayoutCache(); invalidateMode1Layers(); break;
            case 'Details':
                if (isShiftPressed) detailOffX += delta; else detailOffY += delta; break;
        }
        saveAll();
        window.Repaint();
        return true;
    }

    const delta = step > 0 ? CONSTANTS.OPACITY_STEP : -CONSTANTS.OPACITY_STEP;
    const acc   = _.get(opAccessors, opacitySliderTarget);
    if (acc) acc.set(_.clamp(acc.get() + delta, 0, 255));
    saveAll();
    
    if (STATIC_OPACITY_TARGETS.has(opacitySliderTarget)) {
        invalidateStaticLayer();
    } else if (EFFECT_OPACITY_TARGETS.has(opacitySliderTarget)) {
        cacheKey = '';
        invalidateStaticLayer();   // static layer composites scanCache/reflCache
    }
    window.Repaint();
    return true;
}

function on_mouse_lbtn_down(x, y) {
    if (window.SetFocus) window.SetFocus();
}

function on_mouse_lbtn_dblclk(x, y) {
    if (window.SetFocus) window.SetFocus();
    displayOff = !displayOff;
    window.Repaint();
}

function on_mouse_lbtn_up(x, y) {
    if (positionAdjustMode) {
        positionAdjustMode = null;
        window.Repaint();
        return true;
    }
    if (opacitySliderTarget) {
        opacitySliderTarget = null;
        window.Repaint();
        return true;
    }
    
    // modeRemaining only affects the Mode 0 clock display; ignore clicks in Mode 1.
    if (displayMode === 0) {
        modeRemaining = !modeRemaining;
        saveAll();
        window.Repaint();
    }
    return true;
}

// ===================== CONTEXT MENU =====================
function on_mouse_rbtn_up(x, y) {
    const m        = window.CreatePopupMenu();
    const themeM   = window.CreatePopupMenu();
    const appM     = window.CreatePopupMenu();
    const layoutM  = window.CreatePopupMenu();
    const fontM    = window.CreatePopupMenu();
    const presetM  = window.CreatePopupMenu();
    const loadM    = window.CreatePopupMenu();
    const saveM    = window.CreatePopupMenu();

    // === THEMES ===
    _.forEach(themes, (t, i) => themeM.AppendMenuItem(MF_STRING, i + 1, t.name));
    themeM.CheckMenuRadioItem(1, themes.length, themeIdx + 1);
    themeM.AppendMenuSeparator();
    themeM.AppendMenuItem(MF_STRING, 800, 'Setup Custom LCD Color...');
    themeM.AppendMenuItem(MF_STRING, 801, 'Setup Custom BG Color...');
    themeM.AppendTo(m, MF_STRING, 'Theme');

    // === APPEARANCE ===
    
    // --- Play Icon (Mode 1) ---
    const iconM = window.CreatePopupMenu();
    iconM.AppendMenuItem(MF_STRING | (playIconBlink ? MF_CHECKED : 0), 710, 'Blink When Playing');
    iconM.AppendMenuSeparator();
    iconM.AppendMenuItem(MF_STRING | (playIconType === 0 ? MF_CHECKED : 0), 700, 'Hidden');
    iconM.AppendMenuItem(MF_STRING | (playIconType === 1 ? MF_CHECKED : 0), 701, 'Guifx2');
    iconM.AppendMenuItem(MF_STRING | (playIconType === 2 ? MF_CHECKED : 0), 702, 'FontAwesome');
    iconM.AppendMenuItem(MF_STRING | (playIconType === 3 ? MF_CHECKED : 0), 703, 'Segoe MDL2');
    iconM.AppendTo(appM, MF_STRING, 'Play Icon \u25BA Mode 1');
    
    appM.AppendMenuSeparator();
    appM.AppendMenuItem(MF_STRING, 30, 'Set Border Size... (current: ' + (borderMode > 0 ? borderMode + 'px' : 'Off') + ')');
    appM.AppendMenuSeparator();
    appM.AppendMenuItem(MF_STRING, 100, 'Show Ghost Segments');  appM.CheckMenuItem(100, showGhost);
    appM.AppendMenuItem(MF_STRING, 102, 'LCD Reflection');       appM.CheckMenuItem(102, useReflection);
    appM.AppendMenuItem(MF_STRING, 105, 'Segment Shadow');       appM.CheckMenuItem(105, showShadow);
    appM.AppendMenuItem(MF_STRING, 106, 'CRT Glow');             appM.CheckMenuItem(106, showGlow);
    appM.AppendMenuItem(MF_STRING, 107, 'CRT Scanlines');        appM.CheckMenuItem(107, showScanlines);
    appM.AppendMenuItem(MF_STRING, 108, 'Phosphor Mask');        appM.CheckMenuItem(108, showPhosphor);

    // --- Opacity ---
    appM.AppendMenuSeparator();
    const opacityM = window.CreatePopupMenu();
    _.forEach(['Clock', 'Ghost', 'Tech', 'Border', 'Background',
               'Reflection', 'Shadow', 'Glow', 'Scanlines', 'Phosphor'],
        (n, i) => opacityM.AppendMenuItem(MF_STRING, 300 + i, n));
    opacityM.AppendTo(appM, MF_STRING, 'Opacity');
    appM.AppendTo(m, MF_STRING, 'Appearance');

    // === LAYOUT ===
    layoutM.AppendMenuItem(MF_STRING, 200, 'Adjust Clock Position...');
    layoutM.AppendMenuItem(MF_STRING, 201, 'Adjust Codec Position...');
    layoutM.AppendMenuItem(MF_STRING, 202, 'Adjust Tech Details Position...');
    layoutM.AppendMenuSeparator();
    layoutM.AppendMenuItem(MF_STRING, 203, 'Adjust Mode 1 Title Position...');
    layoutM.AppendMenuItem(MF_STRING, 204, 'Adjust Mode 1 Codec Position...');
    layoutM.AppendMenuSeparator();
    layoutM.AppendMenuItem(MF_STRING, 210, 'Reset All Positions');
    layoutM.AppendTo(m, MF_STRING, 'Layout');

    // === FONTS ===
    fontM.AppendMenuItem(MF_STRING, 501, 'Auto Font Size');
    fontM.CheckMenuItem(501, autoFontSize);
    fontM.AppendMenuSeparator();

    // --- Mode 0 submenu (greyed when in mode 1) ---
    const m0Sub = window.CreatePopupMenu();
    m0Sub.AppendMenuItem(MF_STRING, 103, 'Show Codec Label');
    m0Sub.CheckMenuItem(103, showM0Codec);
    m0Sub.AppendMenuItem(MF_STRING, 104, 'Show Tech Details');
    m0Sub.CheckMenuItem(104, showM0Tech);
    m0Sub.AppendMenuSeparator();
    m0Sub.AppendMenuItem(MF_STRING,  400, 'Clock Font...');
    m0Sub.AppendMenuItem(MF_STRING,  401, 'Codec Font...');
    m0Sub.AppendMenuItem(MF_STRING,  402, 'Tech Details Font...');
    m0Sub.AppendMenuSeparator();
    m0Sub.AppendMenuItem(autoFontSize ? MF_GRAYED : MF_STRING, 410, 'Clock Font Size...');
    m0Sub.AppendMenuItem(autoFontSize ? MF_GRAYED : MF_STRING, 411, 'Codec Font Size...');
    m0Sub.AppendMenuItem(autoFontSize ? MF_GRAYED : MF_STRING, 412, 'Tech Font Size...');
    m0Sub.AppendTo(fontM, displayMode === 0 ? MF_STRING : MF_GRAYED, 'Mode 0 (Timer)');

    // --- Mode 1 submenu (greyed when in mode 0) ---
    const m1Sub = window.CreatePopupMenu();
    m1Sub.AppendMenuItem(MF_STRING, 120, 'Show Title');
    m1Sub.CheckMenuItem(120, showM1Title);
    m1Sub.AppendMenuItem(MF_STRING, 121, 'Show Album');
    m1Sub.CheckMenuItem(121, showM1Album);
    m1Sub.AppendMenuItem(MF_STRING, 123, 'Show Codec Name');
    m1Sub.CheckMenuItem(123, showM1Codec);
    m1Sub.AppendMenuItem(MF_STRING, 124, 'Show Tech Details');
    m1Sub.CheckMenuItem(124, showM1Tech);
    m1Sub.AppendMenuSeparator();
    m1Sub.AppendMenuItem(MF_STRING,  420, 'Text Row Font...');
    m1Sub.AppendMenuItem(autoFontSize ? MF_GRAYED : MF_STRING, 421, 'Text Row Font Size...');
    m1Sub.AppendMenuSeparator();
    m1Sub.AppendMenuItem(MF_STRING, 122, 'Codec Font Size... (current: ' + (m1CodecFontSize > 0 ? m1CodecFontSize + 'pt' : 'auto') + ')');
    m1Sub.AppendTo(fontM, displayMode === 1 ? MF_STRING : MF_GRAYED, 'Mode 1 (Text)');

    fontM.AppendTo(m, MF_STRING, 'Fonts');

    m.AppendMenuSeparator();
    m.AppendMenuItem(MF_STRING, 999, 'Reset All Defaults');

    // === PRESETS ===
    _.times(3, i => loadM.AppendMenuItem(MF_STRING, 901 + i, 'Preset ' + (i + 1)));
    loadM.AppendTo(presetM, MF_STRING, 'Load Preset');
    _.times(3, i => saveM.AppendMenuItem(MF_STRING, 911 + i, 'Preset ' + (i + 1)));
    saveM.AppendTo(presetM, MF_STRING, 'Save Preset');
    presetM.AppendTo(m, MF_STRING, 'Presets');

    const id = m.TrackPopupMenu(x, y);

    // === HANDLE SELECTION ===
    if (_.inRange(id, 1, themes.length + 1)) {
        _setThemeIdx(id - 1);
        invalidateStaticLayer();
    } else if (id === 800) {
        const c = utils.ColourPicker(window.ID, custLcd);
        if (c !== -1) { custLcd = c; themes[themes.length - 1].lcd = c; _setThemeIdx(themes.length - 1); invalidateStaticLayer(); }
    } else if (id === 801) {
        const c = utils.ColourPicker(window.ID, custBg);
        if (c !== -1) { custBg = c; themes[themes.length - 1].bg = c; _setThemeIdx(themes.length - 1); invalidateStaticLayer(); }
    } else if (id === 501) { autoFontSize = !autoFontSize; invalidatePaintCache(); invalidateStaticLayer(); measureCache.invalidate();
    } else if (id === 30) {
        // FEAT: borderMode InputBox picker (0=off, 1-50=thickness in px)
        try {
            const val = utils.InputBox(window.ID,
                'Enter border thickness in pixels (0 = off, 1-50):',
                'Border Size', borderMode.toString(), true);
            if (val !== null && val !== '') {
                const parsed = parseInt(val, 10);
                if (!isNaN(parsed)) {
                    borderMode = _.clamp(parsed, 0, 50);
                    invalidateStaticLayer();
                    invalidatePaintCache();
                    invalidateMode1Layers();
                }
            }
        } catch (e) {}
    } else if (id === 100) { showGhost       = !showGhost;       invalidateStaticLayer();
    } else if (id === 102) { useReflection   = !useReflection;   invalidateStaticLayer(); cacheKey = '';
    } else if (id === 103) { showM0Codec  = !showM0Codec;  saveAll(); window.Repaint(); return true;
    } else if (id === 104) { showM0Tech   = !showM0Tech;   saveAll(); window.Repaint(); return true;
    } else if (id === 120) { showM1Title  = !showM1Title;  invalidateMode1Layers(); saveAll(); window.Repaint(); return true;
    } else if (id === 121) { showM1Album  = !showM1Album;  invalidateMode1Layers(); saveAll(); window.Repaint(); return true;
    } else if (id === 123) { showM1Codec  = !showM1Codec;  invalidateMode1Layers(); saveAll(); window.Repaint(); return true;
    } else if (id === 124) { showM1Tech   = !showM1Tech;   invalidateMode1Layers(); saveAll(); window.Repaint(); return true;
    } else if (id === 122) {
        const s = utils.InputBox(window.ID, 'Mode 1 codec font size in pt (0 = auto):', 'Mode 1 Codec Font Size', m1CodecFontSize.toString(), true);
        if (s !== undefined) { m1CodecFontSize = Math.max(0, parseInt(s, 10) || 0); invalidateMode1Layers(); saveAll(); window.Repaint(); }
        return true;
    } else if (id === 105) { showShadow      = !showShadow;
    } else if (id === 106) { showGlow        = !showGlow;
    } else if (id === 107) { showScanlines   = !showScanlines;  invalidateStaticLayer(); cacheKey = '';
    } else if (id === 108) { showPhosphor    = !showPhosphor;   invalidateStaticLayer(); cacheKey = '';
    } else if (id === 200) { positionAdjustMode = 'Clock';   window.Repaint(); return true;
    } else if (id === 201) { positionAdjustMode = 'Codec';   window.Repaint(); return true;
    } else if (id === 202) { positionAdjustMode = 'Details'; window.Repaint(); return true;
    } else if (id === 203) { positionAdjustMode = 'M1Title'; window.Repaint(); return true;
    } else if (id === 204) { positionAdjustMode = 'M1Codec'; window.Repaint(); return true;
    } else if (id === 210) {
        vOffset = 0; codecOffX = -10; codecOffY = -20; detailOffX = -10; detailOffY = -5; m1TitleOffX = -10; m1TitleOffY = -20; m1CodecOffX = -10; m1CodecOffY = -5;
        invalidatePaintCache();
        invalidateStaticLayer();
        invalidateMode1Layers();  // m1TitleOffX/Y and m1CodecOffX/Y are baked into the mode-1 bitmaps
    } else if (id === 400) {
        try {
            const font = utils.InputBox(window.ID, 'Enter clock font name:', 'Clock Font', clockFontName, true);
            if (font) { clockFontName = font; invalidatePaintCache(); invalidateStaticLayer(); }
        } catch (e) {}
    } else if (id === 401) {
        try {
            const font = utils.InputBox(window.ID, 'Enter codec font name:', 'Codec Font', codecFontName, true);
            if (font) { codecFontName = font; invalidatePaintCache(); }
        } catch (e) {}
    } else if (id === 402) {
        try {
            const font = utils.InputBox(window.ID, 'Enter tech font name:', 'Tech Font', techFontName, false);
            if (font) { techFontName = font; invalidatePaintCache(); }
        } catch (e) {}
    } else if (id === 410) {
        try {
            const size = utils.InputBox(window.ID, 'Enter clock font size (pt):', 'Clock Font Size', clockFontSize.toString(), true);
            if (size) { clockFontSize = Math.max(8, parseInt(size, 10) || 48); invalidatePaintCache(); invalidateStaticLayer(); }
        } catch (e) {}
    } else if (id === 411) {
        try {
            const size = utils.InputBox(window.ID, 'Enter codec font size (pt):', 'Codec Font Size', codecFontSize.toString(), true);
            if (size) { codecFontSize = Math.max(8, parseInt(size, 10) || 12); invalidatePaintCache(); }
        } catch (e) {}
    } else if (id === 412) {
        try {
            const size = utils.InputBox(window.ID, 'Enter tech font size (pt):', 'Tech Font Size', techFontSize.toString(), true);
            if (size) { techFontSize = Math.max(8, parseInt(size, 10) || 12); invalidatePaintCache(); }
        } catch (e) {}
    } else if (id === 420) {
        try {
            const font = utils.InputBox(window.ID, 'Enter Mode 1 text row font name:', 'Text Row Font', textRowFontName, true);
            if (font) {
                textRowFontName = font;
                invalidatePaintCache();
                invalidateMode1Layers();
            }
        } catch (e) {}
    } else if (id === 421) {
        try {
            const size = utils.InputBox(window.ID, 'Enter Mode 1 text row font size (pt, 0=auto):', 'Text Row Font Size', textRowFontSize.toString(), true);
            if (size !== null && size !== '') {
                textRowFontSize = Math.max(0, parseInt(size, 10) || 0);
                invalidatePaintCache();
                invalidateMode1Layers();
            }
        } catch (e) {}
    } else if (_.inRange(id, 700, 704)) {
        // Play icon font selection (0=hidden, 1=Guifx2, 2=FA, 3=MDL2)
        playIconType = id - 700;
        if (playIconType === 0) {
            stopBtnFlashTimer();   // icon hidden — stop any running blink timer
        } else if (displayMode === 1 && fb.IsPlaying && !fb.IsPaused) {
            startBtnFlashTimer();  // icon now visible while playing in mode 1 — start timer if blink enabled
        }
        invalidateMode1Layers();
    } else if (id === 710) {
        playIconBlink = !playIconBlink;
        if (!playIconBlink) {
            stopBtnFlashTimer();   // blink disabled — stop any running timer
        } else if (displayMode === 1 && fb.IsPlaying && !fb.IsPaused) {
            startBtnFlashTimer();  // blink enabled while already playing in mode 1 — start it now
        }
        invalidateMode1Layers();
    } else if (_.inRange(id, 300, 310)) {
        const targets = ['Clock', 'Ghost', 'Tech', 'Border', 'Background',
                         'Reflection', 'Shadow', 'Glow', 'Scanlines', 'Phosphor'];
        opacitySliderTarget = targets[id - 300];
    } else if (_.inRange(id, 901, 904)) {
        loadPreset(id - 900);
        // loadPreset() calls saveAll() internally — skip tail save.
        window.Repaint();
        return true;
    } else if (_.inRange(id, 911, 914)) {
        savePreset(id - 910);
        // savePreset() writes directly — nothing else to do.
        window.Repaint();
        return true;
    } else if (id === 999) {
        _setThemeIdx(0);
        borderMode = 2; autoFontSize = true; modeRemaining = false;  // FEAT: default border = 2px
        vOffset = 0; codecOffX = -10; codecOffY = -20; detailOffX = -10; detailOffY = -5; m1TitleOffX = -10; m1TitleOffY = -20; m1CodecOffX = -10; m1CodecOffY = -5;
        opClock = 255; opGhost = 10; opTech = 255; opBorder = 60;
        opBG = 255; opReflection = 20; opShadow = 60; opGlow = 110;
        opScanlines = 50; opPhosphor = 10;
      
        useReflection = true; showScanlines = false; showPhosphor = true;
        showGhost = true;
        showShadow = false; showGlow = false;
        showM0Codec = true; showM0Tech = true;
        showM1Title = true; showM1Album = true; showM1Codec = true; showM1Tech = true;
        clockFontName = 'Digital-7 Mono'; clockFontSize = 48;
        codecFontName = 'Segoe UI'; codecFontSize = 14;
        techFontName  = 'Segoe UI'; techFontSize = 14;
        textRowFontName = 'Segoe UI'; textRowFontSize = 20;
        m1CodecFontSize = 0;
        playIconType = 2; playIconBlink = false;
        displayMode = 0;
        stopBtnFlashTimer();
        cacheKey       = '';
        staticCacheKey = '';
        invalidatePaintCache();
        invalidateMode1Layers();
    }

    saveAll();
    window.Repaint();
    return true;
}

// ===================== PLAYBACK =====================
function on_playback_pause(status) {
    State.btnLayerState = '';  // Invalidate button layer for play/pause icon change
    if (status === true) {
        // Paused — stop btn blink (paused icon is always fully visible)
        stopBtnFlashTimer();
        // Paused - start flashing timer
        codecFlash = true;
        if (pauseFlashTimer) { window.ClearInterval(pauseFlashTimer); pauseFlashTimer = null; }
        pauseFlashTimer = window.SetInterval(() => {
            codecFlash = !codecFlash;
            RepaintScheduler.request();
        }, CONSTANTS.INFO_FLASH_INTERVAL);
    } else {
        // Resuming — restart btn blink if enabled
        if (pauseFlashTimer) { window.ClearInterval(pauseFlashTimer); pauseFlashTimer = null; }
        codecFlash = true; // Full brightness when playing
        startBtnFlashTimer();
    }
    RepaintScheduler.request();
}
function on_playback_new_track() {
    invalidateMode1Layers();
    invalidatePaintCache();
    invalidateStaticLayer();
    update_info();
    startClockTimer();
    stopBtnFlashTimer();
    startBtnFlashTimer();
    window.Repaint();
}
function on_playback_starting() {
    startClockTimer();
    invalidateMode1Layers();
    invalidatePaintCache();
    invalidateStaticLayer();

    if (pauseFlashTimer) {
        window.ClearInterval(pauseFlashTimer);
        pauseFlashTimer = null;
    }

    codecFlash = true;
    update_info();
    stopBtnFlashTimer();
    startBtnFlashTimer();
    window.Repaint();
}

function on_playback_seek() {
    window.Repaint();
}

function on_playback_stop(reason) {
    // reason=2 = "starting new track" — not a real stop; on_playback_starting fires next.
    // Without this guard every track change triggers stopClockTimer + full cache teardown,
    // causing a visible blank-frame flash between tracks.
    if (reason === 2) return;
    stopClockTimer();
    stopBtnFlashTimer();

    if (pauseFlashTimer) {
        window.ClearInterval(pauseFlashTimer);
        pauseFlashTimer = null;
    }

    codecStr = ' ';
    textCache.titleText  = textCache.albumText  = '';
    textCache.bitrate    = textCache.sampleRate = '';
    textCache.bits       = textCache.channels   = '';
    measureCache.invalidate();
    invalidatePaintCache();
    invalidateStaticLayer();
    invalidateMode1Layers();

    window.Repaint();
}

// ===================== CLEANUP =====================
// NOTE: helpers.js defines on_script_unload() which disposes _bmp/_gr.
// The SMP engine only calls the last-defined version of a callback, so this
// definition overrides the one in helpers.js.  We must therefore handle the
// helpers.js cleanup here to prevent leaking the measurement bitmap/context.
function on_script_unload() {
    _tt('');  // helpers.js version called this; must replicate it here since we override that function
    stopClockTimer();
    stopBtnFlashTimer();
    // Release helpers.js measurement context (overridden from helpers.js version)
    if (_bmp) { _bmp.ReleaseGraphics(_gr); }
    _gr = null;
    _bmp = null;
    RepaintScheduler.cancel();

    if (pauseFlashTimer) {
        window.ClearInterval(pauseFlashTimer);
        pauseFlashTimer = null;
    }

    if (infoPulseTimer) {
        window.ClearInterval(infoPulseTimer);
        infoPulseTimer = null;
    }

    if (State.textLayerBitmap) { try { State.textLayerBitmap.Dispose(); } catch(e) {} State.textLayerBitmap = null; }
    if (State.btnLayerBitmap)  { try { State.btnLayerBitmap.Dispose();  } catch(e) {} State.btnLayerBitmap  = null; }
    if (scanCache) { scanCache.Dispose(); scanCache = null; }
    if (reflCache) { reflCache.Dispose(); reflCache = null; }
    if (staticLayerCache) { staticLayerCache.Dispose(); staticLayerCache = null; }

    fontCache.forEach(f => { try { f.Dispose(); } catch(e){} });
    fontCache.clear();
    try { fallback.Dispose(); } catch(e) {}
}

// ===================== INIT =====================
update_info();
startClockTimer();