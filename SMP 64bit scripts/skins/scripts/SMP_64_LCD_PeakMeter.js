'use strict';

/*
 * ============================================================================================
 * LCD Peak Meter VFX v1.1 — SMP 64-bit Cleaned, Patched & Calibrated
 * ============================================================================================
 */

window.DrawMode = 0; // 0 = GDI+  1 = D2D

window.DefineScript('SMP 64bit LCD Peak Meter VFX v1.1', { author: 'L.E.D.', options: { grab_focus: true } });

const SCRIPT_NAME = 'LCD Peak Meter VFX';
const VERSION = '1.1 (calibrated & robust)';
const HAS_AUDIO_CHUNK = typeof fb.GetAudioChunk === 'function';

const MIN_DB = -60;
const DEFAULT_SEGMENTS = 60;
const SEGMENT_COUNTS = [15, 30, 45, 60, 75, 90];
const EXTRA_SEGMENT_MAX = 3;
const LAYOUT_OPTIONS = ['Vertical', 'Horizontal'];
const METER_MODE_OPTIONS = ['Peak', 'RMS', 'Peak + RMS'];
const SPEED_OPTIONS = ['Slow', 'Medium', 'Fast'];

const DISPLAY_MODE_OPTIONS = ['Peak Meter', 'Spectrum Analyzer'];
const SPECTRUM_BAR_COUNTS = [10, 20, 30, 40, 50, 60, 70, 80, 100, 120];
const DEFAULT_SPECTRUM_BARS = 30;
const SPECTRUM_FFT_SIZE = 2048;
const SPECTRUM_FFT_SIZE_FULL   = SPECTRUM_FFT_SIZE;
const SPECTRUM_FFT_SIZE_MEDIUM = 1024;
const SPECTRUM_FFT_SIZE_LOW    = 512;
const SPECTRUM_MIN_DB = -70;
const SPECTRUM_MIN_FREQ = 30;
const SPECTRUM_MAX_FREQ_CAP = 18000;
const SPECTRUM_MIN_BAR_WIDTH = 2;
const SPECTRUM_MIN_BAR_HEIGHT = 2;
const SPECTRUM_BAR_GAP_RATIO = 0.25;
const SPECTRUM_PEAK_HOLD_MS = 900;
const SPECTRUM_PEAK_FALL_PER_SECOND = 1.1;

const AUDIO_TIMER_MS    = 33;
const SPECTRUM_TIMER_MS = 33;

const SPECTRUM_THROTTLE_FULL_PX   = 150;
const SPECTRUM_THROTTLE_MEDIUM_PX =  80;
const SPECTRUM_FPS_FULL_MS        =  33;
const SPECTRUM_FPS_MEDIUM_MS      =  50;
const SPECTRUM_FPS_LOW_MS         =  67;

const SPECTRUM_DIRTY_QUANTISE  = 4096;
const SPECTRUM_DIRTY_THRESHOLD =   12;
const PEAK_HOLD_MS = 1400;
const PEAK_FALL_DB_PER_SECOND = 18;
const MIN_VERTICAL_SEGMENT_HEIGHT = 5;
const MIN_HORIZONTAL_SEGMENT_WIDTH = 5;
const MIN_SEGMENT_GAP = 1;
const LABEL_GAP = 1;
const MARKER_AREA_MIN = 1;
const MARKER_AREA_MAX = 60;
const DEFAULT_MARKER_BORDER = 14;
const PANEL_PAD_MIN = 0;
const PANEL_PAD_MAX = 30;
const DEFAULT_PANEL_PAD = 4;

const DB_SCALE_TICKS = [
    { label: '0', db: 0 },
    { label: '-3', db: -3 },
    { label: '-6', db: -6 },
    { label: '-10', db: -10 },
    { label: '-20', db: -20 },
    { label: '-30', db: -30 },
    { label: '-40', db: -40 },
    { label: '-50', db: -50 },
    { label: '-60', db: -60 }
];

const MENU_STRING    = 0x0000;
const MENU_SEPARATOR = 0x0800;
const MF_GRAYED      = 0x00000001;

const OPACITY_STEP = 5;
const OPACITY_SLIDER_TARGETS = [
    'Glow',
    'Phosphor',
    'Scanlines',
    'Reflection',
    'OnSegments',
    'OffSegments'
];

const OPACITY_TOGGLE_KEYS = {
    Glow: 'showGlow',
    Phosphor: 'showPhosphor',
    Scanlines: 'showScanlines',
    Reflection: 'showReflection'
};

const OPACITY_VALUE_KEYS = {
    Glow: 'glowOpacity',
    Phosphor: 'phosphorOpacity',
    Scanlines: 'scanlineOpacity',
    Reflection: 'reflectionOpacity',
    OnSegments: 'onSegmentOpacity',
    OffSegments: 'offSegmentOpacity'
};

const SLIDER_BAR_MAX_WIDTH = 220;
const SLIDER_BAR_HEIGHT = 6;

const WARNING_ZONE_THRESHOLD = 0.89;
const SUBPEAK_ZONE_FRACTION = 0.15;
const SUBPEAK_ZONE_THRESHOLD = WARNING_ZONE_THRESHOLD - SUBPEAK_ZONE_FRACTION;
const FLAT_PEAK_THICKNESS = 3;

const GRADIENT_STYLE_SOLID  = 0;
const GRADIENT_STYLE_STRIP  = 1;
const GRADIENT_STYLE_CROSS  = 2;
const GRADIENT_STYLE_MIN    = GRADIENT_STYLE_SOLID;
const GRADIENT_STYLE_MAX    = GRADIENT_STYLE_CROSS;
const GRADIENT_STYLE_ACTIVE_SWEEP = 4;

const GLOW_ITERATIONS = 6;
const GLOW_STEP_PADDING = 3;
const GLOW_ALPHA_MULT = 0.34;
const SCANLINE_SPACING = 3;
const REFLECTION_HEIGHT_RATIO = 0.45;

const TEXT_LEFT_MIDDLE   = 0x00000004 | 0x00000020 | 0x00000100;
const TEXT_CENTER_MIDDLE = 0x00000001 | 0x00000004 | 0x00000020 | 0x00000100;
const TEXT_RIGHT_MIDDLE  = 0x00000002 | 0x00000004 | 0x00000020 | 0x00000100;
const TEXT_CENTER_TOP    = 0x00000001 | 0x00000020 | 0x00000100;

// ---------------------------------------------------------------------------
// UTILITIES
// ---------------------------------------------------------------------------

function clamp(value, minimum, maximum) {
    if (minimum > maximum) maximum = minimum;
    return Math.max(minimum, Math.min(maximum, value));
}

function lerp(start, end, amount) {
    return start + (end - start) * amount;
}

function dbToMeter(db, maxDb) {
    const top = (maxDb !== undefined && maxDb !== null) ? maxDb : 0;
    const range = top - MIN_DB;
    if (range <= 0) return 0;
    return clamp((db - MIN_DB) / range, 0, 1);
}

function colour(r, g, b) {
    return (((255 << 24) | (clamp(Math.round(r), 0, 255) << 16) | (clamp(Math.round(g), 0, 255) << 8) | clamp(Math.round(b), 0, 255)) >>> 0);
}

function withAlpha(rgb, alpha) {
    return (((clamp(Math.round(alpha), 0, 255) << 24) | (rgb & 0x00ffffff)) >>> 0);
}

function interpolateColour(first, second, amount) {
    return colour(
        lerp((first  >>> 16) & 255, (second >>> 16) & 255, amount),
        lerp((first  >>>  8) & 255, (second >>>  8) & 255, amount),
        lerp( first          & 255,  second          & 255, amount)
    );
}

function buildSegmentColourTable(theme, segmentCount, extraSegments) {
    const extras  = extraSegments || 0;
    const base    = Math.max(1, segmentCount - extras);
    const colours = new Array(segmentCount);
    for (let i = 0; i < segmentCount; i++) {
        if (i >= base) {
            colours[i] = theme.warning;
        } else {
            const progress = (i + 1) / base;
            colours[i] = progress > WARNING_ZONE_THRESHOLD
                ? theme.warning
                : progress > SUBPEAK_ZONE_THRESHOLD
                    ? interpolateColour(theme.subPeak, theme.text, progress * 0.28)
                    : interpolateColour(theme.active, theme.text, progress * 0.28);
        }
    }
    return colours;
}

function buildGradientColourStrip(theme, span, onAlpha, style) {
    const actR = (theme.active  >>> 16) & 255, actG = (theme.active  >>> 8) & 255, actB = theme.active  & 255;
    const txtR = (theme.text    >>> 16) & 255, txtG = (theme.text    >>> 8) & 255, txtB = theme.text    & 255;
    const wrnR = (theme.warning >>> 16) & 255, wrnG = (theme.warning >>> 8) & 255, wrnB = theme.warning & 255;
    const subR = (theme.subPeak >>> 16) & 255, subG = (theme.subPeak >>> 8) & 255, subB = theme.subPeak  & 255;
    const dimR = Math.round(actR * 0.40), dimG = Math.round(actG * 0.40), dimB = Math.round(actB * 0.40);
    const n = Math.max(1, span);
    const quant = style === GRADIENT_STYLE_STRIP ? clamp(Math.round(span * 0.2), 6, 20) : 0;
    const strip = new Array(n + 1);
    for (let i = 0; i <= n; i++) {
        let pos = i / Math.max(1, n - 1);
        if (quant > 0) pos = Math.round(pos * quant) / quant;
        if (style === GRADIENT_STYLE_ACTIVE_SWEEP) pos = pos * SUBPEAK_ZONE_THRESHOLD;
        let r, g, b;
        if (pos >= WARNING_ZONE_THRESHOLD) {
            const t = (pos - WARNING_ZONE_THRESHOLD) / (1 - WARNING_ZONE_THRESHOLD);
            const tt = t * t * (3 - 2 * t);
            r = Math.round(lerp(subR, wrnR, tt));
            g = Math.round(lerp(subG, wrnG, tt));
            b = Math.round(lerp(subB, wrnB, tt));
        } else if (pos >= SUBPEAK_ZONE_THRESHOLD) {
            const t = (pos - SUBPEAK_ZONE_THRESHOLD) / (WARNING_ZONE_THRESHOLD - SUBPEAK_ZONE_THRESHOLD);
            const tt = t * t * (3 - 2 * t);
            r = Math.round(lerp(actR, subR, tt));
            g = Math.round(lerp(actG, subG, tt));
            b = Math.round(lerp(actB, subB, tt));
        } else {
            const norm = pos / SUBPEAK_ZONE_THRESHOLD;
            if (norm < 0.5) {
                const t = norm / 0.5;
                r = Math.round(lerp(dimR, actR, t));
                g = Math.round(lerp(dimG, actG, t));
                b = Math.round(lerp(dimB, actB, t));
            } else {
                const t = (norm - 0.5) / 0.5;
                r = Math.round(lerp(actR, txtR, t * 0.4));
                g = Math.round(lerp(actG, txtG, t * 0.4));
                b = Math.round(lerp(actB, txtB, t * 0.4));
            }
        }
        strip[i] = withAlpha(colour(r, g, b), onAlpha);
    }
    return strip;
}

class GradientStripCache {
    constructor() { this._map = {}; }
    get(theme, span, onAlpha, style) {
        const sig = [theme.active, theme.text, theme.warning, theme.subPeak, span, onAlpha, style].join('|');
        let strip = this._map[sig];
        if (strip) return strip;
        strip = buildGradientColourStrip(theme, span, onAlpha, style);
        const keys = Object.keys(this._map);
        if (keys.length >= 16) {
            for (let k = 0; k < keys.length - 12; k++) delete this._map[keys[k]];
        }
        this._map[sig] = strip;
        return strip;
    }
}

// ---------------------------------------------------------------------------
// DSP & FFT
// ---------------------------------------------------------------------------

function fftInPlace(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) { j ^= bit; }
        j ^= bit;
        if (i < j) {
            const tr = re[i]; re[i] = re[j]; re[j] = tr;
            const ti = im[i]; im[i] = im[j]; im[j] = ti;
        }
    }
    for (let len = 2; len <= n; len <<= 1) {
        const ang = (-2 * Math.PI) / len;
        const wr = Math.cos(ang);
        const wi = Math.sin(ang);
        const half = len >> 1;
        for (let i = 0; i < n; i += len) {
            let curWr = 1, curWi = 0;
            for (let k = 0; k < half; k++) {
                const uRe = re[i + k], uIm = im[i + k];
                const vRe = re[i + k + half] * curWr - im[i + k + half] * curWi;
                const vIm = re[i + k + half] * curWi + im[i + k + half] * curWr;
                re[i + k] = uRe + vRe; im[i + k] = uIm + vIm;
                re[i + k + half] = uRe - vRe; im[i + k + half] = uIm - vIm;
                const nextWr = curWr * wr - curWi * wi;
                const nextWi = curWr * wi + curWi * wr;
                curWr = nextWr; curWi = nextWi;
            }
        }
    }
}

function hannWindow(size) {
    const w = new Float32Array(size);
    for (let i = 0; i < size; i++) { w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)); }
    return w;
}
const HANN_WINDOW = hannWindow(SPECTRUM_FFT_SIZE);

function interpolatedBinMagnitude(mag, pos) {
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, mag.length - 1);
    const frac = pos - i0;
    return mag[i0] + (mag[i1] - mag[i0]) * frac;
}

const ATTACK_RATES = Object.freeze({ Slow: 0.36, Medium: 0.72, Fast: 1.0 });
const RELEASE_RATES = Object.freeze({ Slow: 0.08, Medium: 0.18, Fast: 0.34 });

function ballisticRate(speed, isAttack) {
    return isAttack ? ATTACK_RATES[speed] || ATTACK_RATES.Medium : RELEASE_RATES[speed] || RELEASE_RATES.Medium;
}

// ---------------------------------------------------------------------------
// RESOURCE MANAGEMENT
// ---------------------------------------------------------------------------

const MAX_CACHED_FONTS = 48;

class FontCache {
    constructor() {
        this.fonts = {};
        this.order = [];
    }
    get(name, size, style = 0) {
        const key = [name, size, style].join('|');
        if (this.fonts[key]) {
            const idx = this.order.indexOf(key);
            if (idx !== -1) { this.order.splice(idx, 1); }
            this.order.push(key);
            return this.fonts[key];
        }
        let font = gdi.Font(name, size, style);
        if (!font) { font = gdi.Font('Segoe UI', size, style); }
        this.fonts[key] = font;
        this.order.push(key);
        if (this.order.length > MAX_CACHED_FONTS) {
            const oldKey = this.order.shift();
            const oldFont = this.fonts[oldKey];
            if (oldFont && typeof oldFont.Dispose === 'function') { try { oldFont.Dispose(); } catch (e) {} }
            delete this.fonts[oldKey];
        }
        return this.fonts[key];
    }
    dispose() {
        for (const key of this.order) {
            const font = this.fonts[key];
            if (font && typeof font.Dispose === 'function') { try { font.Dispose(); } catch (e) {} }
        }
        this.fonts = {};
        this.order = [];
    }
}

const fonts = new FontCache();

// ---------------------------------------------------------------------------
// CONFIGURATION & THEMES
// ---------------------------------------------------------------------------

class PropertyManager {
    constructor() {
        this.keys = {
            theme: SCRIPT_NAME + '.Theme',
            layout: SCRIPT_NAME + '.Layout',
            segments: SCRIPT_NAME + '.Segments',
            peakHold: SCRIPT_NAME + '.PeakHold',
            meterMode: SCRIPT_NAME + '.MeterMode',
            attack: SCRIPT_NAME + '.Attack',
            release: SCRIPT_NAME + '.Release',
            styleRevision:  SCRIPT_NAME + '.StyleRevision',
            showGlow: SCRIPT_NAME + '.ShowGlow',
            glowOpacity: SCRIPT_NAME + '.GlowOpacity',
            showPhosphor: SCRIPT_NAME + '.ShowPhosphor',
            phosphorOpacity: SCRIPT_NAME + '.PhosphorOpacity',
            showScanlines: SCRIPT_NAME + '.ShowScanlines',
            scanlineOpacity: SCRIPT_NAME + '.ScanlineOpacity',
            showReflection: SCRIPT_NAME + '.ShowReflection',
            reflectionOpacity: SCRIPT_NAME + '.ReflectionOpacity',
            onSegmentOpacity: SCRIPT_NAME + '.OnSegmentOpacity',
            offSegmentOpacity: SCRIPT_NAME + '.OffSegmentOpacity',
            flatMode: SCRIPT_NAME + '.FlatMode',
            flatGradient: SCRIPT_NAME + '.FlatGradient',
            displayMode: SCRIPT_NAME + '.DisplayMode',
            spectrumBars: SCRIPT_NAME + '.SpectrumBars',
            profiler: SCRIPT_NAME + '.Profiler',
            customThemeFile: SCRIPT_NAME + '.CustomThemeFile',
            showMarkers: SCRIPT_NAME + '.ShowMarkers',
            markerBorderSize: SCRIPT_NAME + '.MarkerBorderSize',
            extraSegments: SCRIPT_NAME + '.ExtraSegments',
            panelPad: SCRIPT_NAME + '.PanelPad'
        };

        this.defaults = {
            theme: 'Pioneer Amber',
            layout: 'Vertical',
            segments: DEFAULT_SEGMENTS,
            peakHold: true,
            meterMode: 'RMS',
            attack: 'Medium',
            release: 'Medium',
            showGlow: true,
            glowOpacity: 30,
            showPhosphor: true,
            phosphorOpacity: 15,
            showScanlines: false,
            scanlineOpacity: 255,
            showReflection: true,
            reflectionOpacity: 25,
            onSegmentOpacity: 220,
            offSegmentOpacity: 15,
            flatMode: false,
            flatGradient: GRADIENT_STYLE_STRIP,
            displayMode: 'Peak Meter',
            spectrumBars: DEFAULT_SPECTRUM_BARS,
            profiler: false,
            customThemeFile: fb.ProfilePath + 'lcd_custom_themes.json',
            showMarkers: true,
            markerBorderSize: DEFAULT_MARKER_BORDER,
            extraSegments: 0,
            panelPad: DEFAULT_PANEL_PAD
        };

        this.values = {
            theme:             window.GetProperty(this.keys.theme, this.defaults.theme),
            layout:            window.GetProperty(this.keys.layout, this.defaults.layout),
            segments:          Number(window.GetProperty(this.keys.segments, this.defaults.segments)),
            peakHold:          this.parseBool(window.GetProperty(this.keys.peakHold, this.defaults.peakHold)),
            meterMode:         window.GetProperty(this.keys.meterMode, this.defaults.meterMode),
            attack:            window.GetProperty(this.keys.attack, this.defaults.attack),
            release:           window.GetProperty(this.keys.release, this.defaults.release),
            showGlow:          this.parseBool(window.GetProperty(this.keys.showGlow, this.defaults.showGlow)),
            glowOpacity:       this.clampOpacity(window.GetProperty(this.keys.glowOpacity, this.defaults.glowOpacity)),
            showPhosphor:      this.parseBool(window.GetProperty(this.keys.showPhosphor, this.defaults.showPhosphor)),
            phosphorOpacity:   this.clampOpacity(window.GetProperty(this.keys.phosphorOpacity, this.defaults.phosphorOpacity)),
            showScanlines:     this.parseBool(window.GetProperty(this.keys.showScanlines, this.defaults.showScanlines)),
            scanlineOpacity:   this.clampOpacity(window.GetProperty(this.keys.scanlineOpacity, this.defaults.scanlineOpacity)),
            showReflection:    this.parseBool(window.GetProperty(this.keys.showReflection, this.defaults.showReflection)),
            reflectionOpacity: this.clampOpacity(window.GetProperty(this.keys.reflectionOpacity, this.defaults.reflectionOpacity)),
            onSegmentOpacity:  this.clampOpacity(window.GetProperty(this.keys.onSegmentOpacity, this.defaults.onSegmentOpacity)),
            offSegmentOpacity: this.clampOpacity(window.GetProperty(this.keys.offSegmentOpacity, this.defaults.offSegmentOpacity)),
            flatMode:          this.parseBool(window.GetProperty(this.keys.flatMode, this.defaults.flatMode)),
            flatGradient:      (() => {
                const raw = window.GetProperty(this.keys.flatGradient, this.defaults.flatGradient);
                const n = Number(raw);
                if (Number.isInteger(n) && n >= GRADIENT_STYLE_MIN && n <= GRADIENT_STYLE_MAX) return n;
                return (raw === 'true' || raw === '1') ? GRADIENT_STYLE_STRIP : this.defaults.flatGradient;
            })(),
            displayMode:       window.GetProperty(this.keys.displayMode, this.defaults.displayMode),
            spectrumBars:      Number(window.GetProperty(this.keys.spectrumBars, this.defaults.spectrumBars)),
            profiler:          this.parseBool(window.GetProperty(this.keys.profiler, this.defaults.profiler)),
            customThemeFile:   window.GetProperty(this.keys.customThemeFile, this.defaults.customThemeFile),
            showMarkers:       this.parseBool(window.GetProperty(this.keys.showMarkers, this.defaults.showMarkers)),
            markerBorderSize:  this.parseIntClamped(window.GetProperty(this.keys.markerBorderSize, this.defaults.markerBorderSize), MARKER_AREA_MIN, MARKER_AREA_MAX),
            extraSegments:     this.parseIntClamped(window.GetProperty(this.keys.extraSegments, this.defaults.extraSegments), 0, EXTRA_SEGMENT_MAX),
            panelPad:          this.parseIntClamped(window.GetProperty(this.keys.panelPad, this.defaults.panelPad), PANEL_PAD_MIN, PANEL_PAD_MAX)
        };

        this.values.segments = this.normaliseSegmentCount(this.values.segments);
        this.values.displayMode = this.normaliseChoice(this.values.displayMode, DISPLAY_MODE_OPTIONS, this.defaults.displayMode);
        this.values.spectrumBars = SPECTRUM_BAR_COUNTS.indexOf(this.values.spectrumBars) !== -1 ? this.values.spectrumBars : DEFAULT_SPECTRUM_BARS;
        this.values.layout = this.normaliseChoice(this.values.layout, LAYOUT_OPTIONS, this.defaults.layout);
        this.values.meterMode = this.normaliseChoice(this.values.meterMode, METER_MODE_OPTIONS, this.defaults.meterMode);
        this.values.attack = this.normaliseChoice(this.values.attack, SPEED_OPTIONS, this.defaults.attack);
        this.values.release = this.normaliseChoice(this.values.release, SPEED_OPTIONS, this.defaults.release);

        this._extraSegmentsPreFlat = this.values.flatMode ? 0 : this.values.extraSegments;
        this._lastFinalizedTheme = this.values.theme !== '~Preview' ? this.values.theme : this.defaults.theme;

        if (Number(window.GetProperty(this.keys.styleRevision, 0)) < 2) {
            this.values.meterMode = 'RMS';
            window.SetProperty(this.keys.meterMode, this.values.meterMode);
            window.SetProperty(this.keys.styleRevision, 2);
        }
    }

    normaliseSegmentCount(value) {
        return SEGMENT_COUNTS.indexOf(value) !== -1 ? value : DEFAULT_SEGMENTS;
    }

    normaliseChoice(value, allowed, fallback) {
        return allowed.indexOf(value) !== -1 ? value : fallback;
    }

    clampOpacity(value) {
        const n = Number(value);
        return clamp(isNaN(n) ? 0 : Math.round(n), 0, 255);
    }

    parseBool(value) {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string')  return value !== 'false' && value !== '0' && value !== '';
        return !!value;
    }

    parseIntClamped(value, minimum, maximum) {
        const n = Math.round(Number(value));
        return clamp(isNaN(n) ? minimum : n, minimum, maximum);
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
        for (let key in this.defaults) {
            if (key === 'customThemeFile') continue;
            if (!this.keys[key]) continue;
            if (key === 'theme') { this.setTheme(this.defaults[key]); } else { this.set(key, this.defaults[key]); }
        }
    }
}

class ThemeManager {
    constructor() {
        this._builtinDefs = [
            { name: 'Pioneer Amber',   bg: [20,12,5],   in: [117,53,8],   ac: [255,178,45],  tx: [255,233,141] },
            { name: 'Technics Green',  bg: [5,17,9],    in: [14,98,42],   ac: [80,248,128],  tx: [190,255,194] },
            { name: 'Sony ES Blue',    bg: [4,11,20],   in: [10,65,118],  ac: [68,180,255],  tx: [190,235,255] },
            { name: 'Yamaha Ice',      bg: [8,17,19],   in: [22,99,104],  ac: [96,242,234],  tx: [205,255,251] },
            { name: 'Kenwood Red',     bg: [22,5,5],    in: [116,19,16],  ac: [255,79,57],   tx: [255,194,177] },
            { name: 'Sansui Lime',     bg: [13,18,4],   in: [81,104,12],  ac: [196,244,52],  tx: [241,255,173] },
            { name: 'Marantz Blue',    bg: [5,9,17],    in: [30,51,133],  ac: [88,126,255],  tx: [207,220,255] },
            { name: 'Akai Orange',     bg: [24,10,3],   in: [130,48,5],   ac: [255,130,28],  tx: [255,216,144] },
            { name: 'Sharp Aqua',      bg: [2,19,20],   in: [4,106,112],  ac: [20,239,229],  tx: [177,255,249] },
            { name: 'Aiwa VFD',        bg: [2,16,15],   in: [4,74,65],    ac: [52,222,183],  tx: [181,255,226] },
            { name: 'Nakamichi Gold',  bg: [21,15,5],   in: [110,78,16],  ac: [247,193,67],  tx: [255,235,168] },
            { name: 'JVC Violet',      bg: [16,6,22],   in: [79,25,119],  ac: [210,102,255], tx: [246,206,255] }
        ];

        this.themes   = [];
        this.themeMap = {};
        this._customThemes = [];

        for (let i = 0; i < this._builtinDefs.length; i++) {
            const d = this._builtinDefs[i];
            const t = this.makeTheme(d.name, d.bg, d.in, d.ac, d.tx);
            this.themes.push(t);
            this.themeMap[t.name] = t;
        }

        this.draftTheme = {
            name:       'New Custom Theme',
            background: colour(20,  12,   5),
            inactive:   colour(117, 53,   8),
            active:     colour(255, 178,  45),
            text:       colour(255, 233, 141),
            warning:    colour(255,  83,  48),
            peak:       colour(255, 178,  45),
            subPeak:    colour(255, 134,  46)
        };
        this._draftBaseTheme = null;
    }

    updateDraft(key, packed) {
        this.draftTheme[key] = packed >>> 0;
    }

    seedDraftFromTheme(theme) {
        if (!theme) return;
        this.draftTheme.background = theme.background >>> 0;
        this.draftTheme.inactive   = theme.inactive   >>> 0;
        this.draftTheme.active     = theme.active     >>> 0;
        this.draftTheme.text       = theme.text       >>> 0;
        this.draftTheme.warning    = theme.warning    >>> 0;
        this.draftTheme.peak       = theme.peak       >>> 0;
        this.draftTheme.subPeak    = theme.subPeak    >>> 0;
    }

    makeTheme(name, background, inactive, active, text, warning, peak, subPeak) {
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
        const w = warning || [255, 83, 48];
        const p = peak || active;
        const sp = subPeak || active;
        return {
            name:       name,
            background: pack(background),
            inactive:   pack(inactive),
            active:     pack(active),
            text:       pack(text),
            warning:    pack(w),
            peak:       pack(p),
            subPeak:    pack(sp),
            custom:     false
        };
    }

    get(name)  { return this.themeMap[name] || this.themes[0]; }
    names()    { return this.themes.map(t => t.name); }

    removeCustom(name) {
        const t = this.themeMap[name];
        if (!t) return { ok: false, error: 'Theme "' + name + '" not found.' };
        if (!t.custom) return { ok: false, error: 'Theme "' + name + '" is not a custom theme and cannot be removed.' };
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

            const t = this.makeTheme(
                name,
                d.background, d.inactive, d.active, d.text,
                d.warning || null,
                d.peak || null,
                d.subPeak || null
            );
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
        for (let key of ['background', 'inactive', 'active', 'text']) {
            const err = checkChannel(key, d[key]);
            if (err) return 'Entry ' + idx + ' ("' + d.name + '"): ' + err;
        }
        if (d.warning !== undefined && d.warning !== null) {
            const err = checkChannel('warning', d.warning);
            if (err) return 'Entry ' + idx + ' ("' + d.name + '"): ' + err;
        }
        if (d.peak !== undefined && d.peak !== null) {
            const err = checkChannel('peak', d.peak);
            if (err) return 'Entry ' + idx + ' ("' + d.name + '"): ' + err;
        }
        if (d.subPeak !== undefined && d.subPeak !== null) {
            const err = checkChannel('subPeak', d.subPeak);
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
            name:       theme.name,
            background: rgb(theme.background),
            inactive:   rgb(theme.inactive),
            active:     rgb(theme.active),
            text:       rgb(theme.text),
            warning:    rgb(theme.warning),
            peak:       rgb(theme.peak),
            subPeak:    rgb(theme.subPeak)
        };
    }

    exportTemplate(filePath) {
        return this.saveToFile(filePath, '*');
    }
}

// ---------------------------------------------------------------------------
// AUDIO PROCESSING ENGINE
// ---------------------------------------------------------------------------

class AudioEngine {
    constructor() {
        this.leftRmsDb = MIN_DB; this.rightRmsDb = MIN_DB; this.leftPeakDb = MIN_DB; this.rightPeakDb = MIN_DB;
        this.lastUpdate = Date.now();
        this._scratch = { leftRms: MIN_DB, rightRms: MIN_DB, leftPeak: MIN_DB, rightPeak: MIN_DB };
        this._result = { leftRms: MIN_DB, rightRms: MIN_DB, leftPeak: MIN_DB, rightPeak: MIN_DB };
        this._readTick = 0; this._readEveryNTicks = 1;
    }
    update(attack, release, maxDb) {
        const now = Date.now();
        const elapsed = Math.max((now - this.lastUpdate) / 1000, 0.001);
        this.lastUpdate = now;
        const levels = this.readStereoLevels(maxDb);
        this.leftRmsDb = this.smooth(this.leftRmsDb, levels.leftRms, elapsed, attack, release, maxDb);
        this.rightRmsDb = this.smooth(this.rightRmsDb, levels.rightRms, elapsed, attack, release, maxDb);
        this.leftPeakDb = this.smooth(this.leftPeakDb, levels.leftPeak, elapsed, attack, release, maxDb);
        this.rightPeakDb = this.smooth(this.rightPeakDb, levels.rightPeak, elapsed, attack, release, maxDb);
        const result = this._result;
        result.leftRms = this.leftRmsDb; result.rightRms = this.rightRmsDb; result.leftPeak = this.leftPeakDb; result.rightPeak = this.rightPeakDb;
        return result;
    }
    readStereoLevels(maxDb) {
        this._readTick++;
        if (this._readTick % this._readEveryNTicks !== 0) return this._scratch;
        let chunk = null;
        if (HAS_AUDIO_CHUNK) {
            try {
                chunk = fb.GetAudioChunk((AUDIO_TIMER_MS * this._readEveryNTicks) / 1000);
            } catch (e) {
                chunk = null;
            }
        }
        if (!chunk) return this.silentLevels();
        let data = chunk.Data !== undefined ? chunk.Data
            : chunk.data !== undefined ? chunk.data : null;
        if (!data && typeof chunk.ToArray === 'function') data = chunk.ToArray();
        if (!data && typeof chunk.toArray === 'function') data = chunk.toArray();
        if (!data) return this.silentLevels();
        const length = Number(data.Length !== undefined ? data.Length : data.length || 0);
        if (!length) return this.silentLevels();
        const channels = Math.max(chunk.ChannelCount !== undefined ? (chunk.ChannelCount | 0)
            : chunk.channelCount !== undefined ? (chunk.channelCount | 0) : 2, 1);
        let leftEnergy = 0, rightEnergy = 0, leftPeak = 0, rightPeak = 0, frames = 0;
        for (let index = 0; index + channels - 1 < length; index += channels) {
            const left = Number(data[index]) || 0;
            const right = channels > 1 ? Number(data[index + 1]) || 0 : left;
            leftEnergy += left * left; rightEnergy += right * right;
            if (left > leftPeak) leftPeak = left; else if (-left > leftPeak) leftPeak = -left;
            if (right > rightPeak) rightPeak = right; else if (-right > rightPeak) rightPeak = -right;
            frames++;
        }
        if (!frames) return this.silentLevels();
        const scratch = this._scratch;
        scratch.leftRms = this.amplitudeToDb(Math.sqrt(leftEnergy / frames), maxDb);
        scratch.rightRms = this.amplitudeToDb(Math.sqrt(rightEnergy / frames), maxDb);
        scratch.leftPeak = this.amplitudeToDb(leftPeak, maxDb);
        scratch.rightPeak = this.amplitudeToDb(rightPeak, maxDb);
        return scratch;
    }
    silentLevels() {
        const scratch = this._scratch;
        scratch.leftRms = MIN_DB; scratch.rightRms = MIN_DB; scratch.leftPeak = MIN_DB; scratch.rightPeak = MIN_DB;
        return scratch;
    }
    amplitudeToDb(amplitude, maxDb) {
        const top = (maxDb !== undefined && maxDb !== null) ? maxDb : 0;
        return clamp(20 * Math.log10(Math.max(amplitude, 0.000001)), MIN_DB, top);
    }
    smooth(current, target, elapsed, attack, release, maxDb) {
        const amount = target > current ? attack : release;
        const ceiling = (maxDb !== undefined && maxDb !== null) ? maxDb : 0;
        return clamp(current + (target - current) * Math.min(amount * elapsed * 30, 1), MIN_DB, ceiling);
    }
}

// ---------------------------------------------------------------------------
// METER CHANNEL
// ---------------------------------------------------------------------------

class MeterChannel {
    constructor() {
        this.value  = 0;
        this.peak   = 0;
        this._peakDb = MIN_DB;
        this.peakTime = 0;
        this.lastPeakUpdate = 0;
    }
    update(levelDb, signalPeakDb, peakHoldEnabled, now, maxDb) {
        // Meter bar level always maps from MIN_DB to 0 dBFS (base meter range)
        this.value = dbToMeter(levelDb, 0);
        const elapsed = this.lastPeakUpdate ? Math.max((now - this.lastPeakUpdate) / 1000, 0) : 0;
        this.lastPeakUpdate = now;

        if (!peakHoldEnabled) {
            this._peakDb = signalPeakDb;
            this.peak    = dbToMeter(signalPeakDb, maxDb);
            this.peakTime = 0;
            return;
        }

        if (signalPeakDb >= this._peakDb) {
            this._peakDb  = signalPeakDb;
            this.peakTime = now;
        } else if (this.peakTime > 0 && now - this.peakTime > PEAK_HOLD_MS) {
            this._peakDb = Math.max(signalPeakDb, this._peakDb - PEAK_FALL_DB_PER_SECOND * elapsed);
        }
        this.peak = dbToMeter(this._peakDb, maxDb);
    }
    reset() {
        this.value = 0; this.peak = 0; this._peakDb = MIN_DB; this.peakTime = 0; this.lastPeakUpdate = 0;
    }
}

// ---------------------------------------------------------------------------
// SPECTRUM ANALYSIS
// ---------------------------------------------------------------------------

class SpectrumAnalyzer {
    constructor() {
        this.barCount = DEFAULT_SPECTRUM_BARS;
        const maxBars = SPECTRUM_BAR_COUNTS[SPECTRUM_BAR_COUNTS.length - 1];
        this.levels = new Float32Array(maxBars); this.peaks = new Float32Array(maxBars);
        this.peakTimes = new Float64Array(maxBars);
        this._fftN = SPECTRUM_FFT_SIZE;
        this._re = new Float32Array(this._fftN); this._im = new Float32Array(this._fftN); this._mag = new Float32Array(this._fftN / 2);
        this._window = HANN_WINDOW;
        this._bandEdges = null; this._bandEdgesKey = ''; this._lastSampleRate = 0;
        this._quantLevel = new Int16Array(maxBars); this._quantPeak = new Int16Array(maxBars); this._prevQuantLevel = new Int16Array(maxBars); this._prevQuantPeak = new Int16Array(maxBars);
        this.isDirty = true;
    }
    setFftSize(n) {
        const target = n > 0 ? n : SPECTRUM_FFT_SIZE;
        if (target === this._fftN) return;
        this._fftN = target;
        this._re = new Float32Array(target); this._im = new Float32Array(target); this._mag = new Float32Array(target / 2);
        this._window = hannWindow(target);
        this.isDirty = true;
    }
    setBarCount(n) {
        if (this.barCount === n) return;
        this.barCount = n;
        for (let i = 0; i < this.levels.length; i++) { this.levels[i] = 0; this.peaks[i] = 0; this.peakTimes[i] = 0; }
        this._bandEdgesKey = '';
        this._prevQuantLevel.fill(0); this._prevQuantPeak.fill(0);
        this.isDirty = true;
    }
    _ensureBandEdges(sampleRate) {
        const key = this.barCount + '|' + sampleRate;
        if (key === this._bandEdgesKey && this._bandEdges) return;
        this._bandEdgesKey = key;
        const nyquist = sampleRate / 2;
        const minFreq = SPECTRUM_MIN_FREQ;
        const maxFreq = Math.min(SPECTRUM_MAX_FREQ_CAP, Math.max(nyquist - 1, minFreq + 1));
        const edges = new Float64Array(this.barCount + 1);
        const logMin = Math.log(Math.max(minFreq, 1));
        const logMax = Math.log(Math.max(maxFreq, minFreq + 1));
        for (let i = 0; i <= this.barCount; i++) { edges[i] = Math.exp(logMin + (logMax - logMin) * (i / this.barCount)); }
        this._bandEdges = edges;
    }
    _readSampleRate(chunk) {
        return Number(chunk.SampleRate !== undefined ? chunk.SampleRate : chunk.sampleRate || 0) || 0;
    }
    update(attack, release, elapsedSeconds) {
        let chunk = null;
        if (HAS_AUDIO_CHUNK) {
            const sampleRateRef = this._lastSampleRate || 44100;
            const requestSec = this._fftN / sampleRateRef + 0.01;
            if (isFinite(requestSec)) { try { chunk = fb.GetAudioChunk(requestSec); } catch (e) { chunk = null; } }
        }
        let data = chunk ? (chunk.Data !== undefined ? chunk.Data
            : chunk.data !== undefined ? chunk.data : null) : null;
        if (data && typeof data.ToArray === 'function') data = data.ToArray();
        if (data && typeof data.toArray === 'function') data = data.toArray();
        const length = data ? Number(data.Length !== undefined ? data.Length : data.length || 0) : 0;

        if (!chunk || !length) {
            let dirty = false;
            const now = Date.now();
            for (let b = 0; b < this.barCount; b++) {
                if (this.levels[b] > 0 || this.peaks[b] > 0) {
                    this.levels[b] = Math.max(0, this.levels[b] - release * elapsedSeconds * 2);
                    if (this.peakTimes[b] > 0 && now - this.peakTimes[b] > SPECTRUM_PEAK_HOLD_MS) {
                        this.peaks[b] = Math.max(this.levels[b], this.peaks[b] - SPECTRUM_PEAK_FALL_PER_SECOND * elapsedSeconds);
                    }
                    this._quantLevel[b] = Math.round(this.levels[b] * SPECTRUM_DIRTY_QUANTISE);
                    this._quantPeak[b] = Math.round(this.peaks[b] * SPECTRUM_DIRTY_QUANTISE);
                    dirty = true;
                }
            }
            this.isDirty = dirty;
            if (dirty) {
                this._prevQuantLevel.set(this._quantLevel.subarray(0, this.barCount));
                this._prevQuantPeak.set(this._quantPeak.subarray(0, this.barCount));
            }
            return;
        }

        const channels = Math.max(chunk.ChannelCount !== undefined ? (chunk.ChannelCount | 0)
            : chunk.channelCount !== undefined ? (chunk.channelCount | 0) : 2, 1);
        const sampleRate = this._readSampleRate(chunk) || this._lastSampleRate || 44100;
        this._lastSampleRate = sampleRate;
        const re = this._re, im = this._im, n = this._fftN;
        const frames = Math.floor(length / channels);
        const usable = Math.min(n, frames);

        if (channels === 1) {
            for (let i = 0; i < usable; i++) {
                re[i] = data[i] * this._window[i];
                im[i] = 0;
            }
        } else if (channels === 2) {
            for (let i = 0; i < usable; i++) {
                const base = i * 2;
                re[i] = (data[base] + data[base + 1]) * 0.5 * this._window[i];
                im[i] = 0;
            }
        } else {
            const invCh = 1 / channels;
            for (let i = 0; i < usable; i++) {
                let sum = 0;
                const base = i * channels;
                for (let c = 0; c < channels; c++) { sum += Number(data[base + c]) || 0; }
                re[i] = sum * invCh * this._window[i];
                im[i] = 0;
            }
        }
        for (let i = usable; i < n; i++) { re[i] = 0; im[i] = 0; }
        fftInPlace(re, im);

        const mag = this._mag, halfN = n / 2;
        const invN = 4 / n;
        for (let i = 0; i < halfN; i++) {
            const r = re[i] * invN, ii = im[i] * invN;
            mag[i] = r * r + ii * ii;
        }
        this._ensureBandEdges(sampleRate);
        const edges = this._bandEdges, binHz = sampleRate / n;
        const now = Date.now();
        for (let b = 0; b < this.barCount; b++) {
            const pLo = edges[b] / binHz, pHi = edges[b + 1] / binHz;
            let peakSq;
            if (pHi - pLo < 1) {
                const centerPos = clamp((pLo + pHi) / 2, 1, halfN - 1.0001);
                peakSq = Math.max(0, interpolatedBinMagnitude(mag, centerPos));
            } else {
                const loBin = clamp(Math.floor(pLo), 1, halfN - 1), hiBin = clamp(Math.ceil(pHi), loBin, halfN - 1);
                peakSq = 0;
                for (let k = loBin; k <= hiBin; k++) { if (mag[k] > peakSq) peakSq = mag[k]; }
            }
            const db = peakSq > 0 ? 10 * Math.log10(peakSq) : SPECTRUM_MIN_DB;
            const target = clamp((db - SPECTRUM_MIN_DB) / -SPECTRUM_MIN_DB, 0, 1);
            const current = this.levels[b], rate = target > current ? attack : release;
            this.levels[b] = clamp(current + (target - current) * Math.min(rate * elapsedSeconds * 30, 1), 0, 1);
            if (this.levels[b] >= this.peaks[b]) {
                this.peaks[b] = this.levels[b]; this.peakTimes[b] = now;
            } else if (this.peakTimes[b] > 0 && now - this.peakTimes[b] > SPECTRUM_PEAK_HOLD_MS) {
                this.peaks[b] = Math.max(this.levels[b], this.peaks[b] - SPECTRUM_PEAK_FALL_PER_SECOND * elapsedSeconds);
            }
            this._quantLevel[b] = Math.round(this.levels[b] * SPECTRUM_DIRTY_QUANTISE);
            this._quantPeak[b] = Math.round(this.peaks[b] * SPECTRUM_DIRTY_QUANTISE);
        }
        let dirty = false;
        for (let b = 0; b < this.barCount; b++) {
            if (Math.abs(this._quantLevel[b] - this._prevQuantLevel[b]) > SPECTRUM_DIRTY_THRESHOLD || Math.abs(this._quantPeak[b] - this._prevQuantPeak[b]) > SPECTRUM_DIRTY_THRESHOLD) {
                dirty = true; break;
            }
        }
        this.isDirty = dirty;
        if (dirty) {
            this._prevQuantLevel.set(this._quantLevel.subarray(0, this.barCount));
            this._prevQuantPeak.set(this._quantPeak.subarray(0, this.barCount));
        }
    }
}

// ---------------------------------------------------------------------------
// GEOMETRY & RENDERING HOT-PATH
// ---------------------------------------------------------------------------

class GeometryCache {
    constructor() {
        this._width = -1; this._height = -1; this._layout = null; this._segments = -1; this._themeName = null; this._markerBorderSize = -1; this._extraSegs = -1; this._pad = -1; this._showMarkers = null;
        this.geometry = null;
    }
    get(width, height, layout, segments, theme, markerBorderSize, extraSegs, showMarkers, panelPad) {
        const border  = clamp(markerBorderSize || DEFAULT_MARKER_BORDER, MARKER_AREA_MIN, MARKER_AREA_MAX);
        const extras  = clamp(extraSegs || 0, 0, EXTRA_SEGMENT_MAX);
        const pad     = clamp(panelPad !== undefined ? panelPad : DEFAULT_PANEL_PAD, PANEL_PAD_MIN, PANEL_PAD_MAX);
        const markers = showMarkers !== false;
        if (width === this._width && height === this._height && layout === this._layout && segments === this._segments && theme.name === this._themeName && border === this._markerBorderSize && extras === this._extraSegs && pad === this._pad && markers === this._showMarkers) {
            return this.geometry;
        }
        this._width = width; this._height = height; this._layout = layout; this._segments = segments; this._themeName = theme.name; this._markerBorderSize = border; this._extraSegs = extras; this._pad = pad; this._showMarkers = markers;
        const header = 0;
        let renderedSegments = 0, channels = [], footer = 0, scaleWidth = 0, labelWidth = 0;
        if (layout === 'Vertical') {
            footer     = markers ? border : 0;
            const availableHeight = Math.max(1, height - pad * 2 - header - footer);
            scaleWidth = markers ? border : 0;
            const meterX = pad + scaleWidth;
            const meterAreaWidth = Math.max(1, width - meterX - pad);
            const gap = Math.max(3, Math.round(Math.min(width, height) * 0.025));
            const channelWidth = Math.max(2, Math.floor((meterAreaWidth - gap) / 2));
            renderedSegments = Math.max(1, Math.min(segments, Math.floor((availableHeight + MIN_SEGMENT_GAP) / (MIN_VERTICAL_SEGMENT_HEIGHT + MIN_SEGMENT_GAP))));
            const preferredSegmentGap = Math.max(1, Math.round(channelWidth * 0.09));
            const segmentGap = Math.min(preferredSegmentGap, Math.max(MIN_SEGMENT_GAP, Math.floor((availableHeight - renderedSegments * MIN_VERTICAL_SEGMENT_HEIGHT) / Math.max(renderedSegments - 1, 1))));
            const segmentHeight = Math.max(MIN_VERTICAL_SEGMENT_HEIGHT, Math.floor((availableHeight - segmentGap * (renderedSegments - 1)) / renderedSegments));
            const meterHeight = Math.min(segmentHeight * renderedSegments + segmentGap * (renderedSegments - 1), availableHeight);
            const meterY = pad + header + availableHeight - meterHeight;
            const colors = buildSegmentColourTable(theme, renderedSegments, extras);
            for (let c = 0; c < 2; c++) {
                const x = c === 0 ? meterX : meterX + channelWidth + gap;
                const bakedSegments = [];
                const meterBottom = pad + header + availableHeight;
                for (let i = 0; i < renderedSegments; i++) {
                    const y = meterY + meterHeight - (i + 1) * segmentHeight - i * segmentGap;
                    const clampedY = Math.min(Math.round(y), meterBottom - Math.max(1, Math.floor(segmentHeight)));
                    bakedSegments.push({ x: x, y: clampedY, w: channelWidth, h: Math.max(1, Math.floor(segmentHeight)), color: colors[i] });
                }
                channels.push({ x, y: meterY, w: channelWidth, h: meterHeight, segments: bakedSegments });
            }
        } else {
            footer     = markers ? border : 0;
            const availableHeight = Math.max(1, height - pad * 2 - header - footer);
            labelWidth = markers ? border : 0;
            const meterX = pad + labelWidth;
            const meterAreaWidth = Math.max(1, width - meterX - pad);
            const gap = Math.max(5, Math.round(Math.min(width, height) * 0.04));
            const channelHeight = Math.max(2, Math.floor((availableHeight - gap) / 2));
            renderedSegments = Math.max(1, Math.min(segments, Math.floor((meterAreaWidth + MIN_SEGMENT_GAP) / (MIN_HORIZONTAL_SEGMENT_WIDTH + MIN_SEGMENT_GAP))));
            const preferredSegmentGap = Math.max(1, Math.round(channelHeight * 0.11));
            const segmentGap = Math.min(preferredSegmentGap, Math.max(MIN_SEGMENT_GAP, Math.floor((meterAreaWidth - renderedSegments * MIN_HORIZONTAL_SEGMENT_WIDTH) / Math.max(renderedSegments - 1, 1))));
            const segmentWidth = Math.max(MIN_HORIZONTAL_SEGMENT_WIDTH, Math.floor((meterAreaWidth - segmentGap * (renderedSegments - 1)) / renderedSegments));
            const meterWidth = segmentWidth * renderedSegments + segmentGap * (renderedSegments - 1);
            const colors = buildSegmentColourTable(theme, renderedSegments, extras);
            for (let c = 0; c < 2; c++) {
                const y = c === 0 ? pad + header : pad + header + channelHeight + gap;
                const bakedSegments = [];
                for (let i = 0; i < renderedSegments; i++) {
                    const x = meterX + i * (segmentWidth + segmentGap);
                    bakedSegments.push({ x: Math.round(x), y: y, w: Math.max(1, Math.floor(segmentWidth)), h: channelHeight, color: colors[i] });
                }
                channels.push({ x: meterX, y, w: meterWidth, h: channelHeight, segments: bakedSegments });
            }
        }
        this.geometry = { pad, header, footer, labelWidth, scaleWidth, vertical: layout === 'Vertical', segmentCount: renderedSegments, extraSegments: extras, channels, inactiveColor: theme.inactive, showMarkers: markers };
        return this.geometry;
    }
    invalidate() { this._width = -1; this._height = -1; this._layout = null; this._segments = -1; this._themeName = null; this._markerBorderSize = -1; this._extraSegs = -1; this._pad = -1; this._showMarkers = null; }
}

class SegmentRenderer {
    constructor() {
        this._gradStrips = new GradientStripCache();
    }

    draw(gr, channel, level, peak, vertical, theme, geometry, onOpacity, offOpacity) {
        const segmentCount = geometry.segmentCount;
        const baseCount   = Math.max(0, segmentCount - (geometry.extraSegments || 0));
        const litSegments = Math.min(Math.round(level * baseCount), baseCount);
        const peakSegment = clamp(Math.ceil(peak * segmentCount) - 1, 0, segmentCount - 1);
        const hasPeak = peak > 0.01;
        const baked = channel.segments;
        const offFill = withAlpha(geometry.inactiveColor, offOpacity === undefined ? 255 : offOpacity);
        for (let i = 0; i < segmentCount; i++) {
            const isLit = i < litSegments;
            const isPeak = hasPeak && i === peakSegment;
            const segment = baked[i];
            const litCol = isPeak
                ? (peak > WARNING_ZONE_THRESHOLD ? theme.warning : (theme.peak !== undefined ? theme.peak : theme.active))
                : segment.color;
            const fill = isLit || isPeak ? withAlpha(litCol, onOpacity === undefined ? 255 : onOpacity) : offFill;
            gr.FillSolidRect(segment.x, segment.y, segment.w, segment.h, fill);
        }
    }

    drawFlat(gr, channel, level, peak, vertical, theme, onOpacity, offOpacity) {
        const clampedLevel = clamp(level, 0, 1);
        const offFill = withAlpha(theme.inactive, offOpacity === undefined ? 255 : offOpacity);
        const onAlpha = onOpacity === undefined ? 255 : onOpacity;
        if (vertical) {
            const span = channel.h;
            const litHeight = Math.round(clampedLevel * span);
            gr.FillSolidRect(channel.x, channel.y, channel.w, span, offFill);
            if (litHeight > 0) {
                const warnHeight = Math.round(span * (1 - WARNING_ZONE_THRESHOLD));
                const subHeight  = Math.round(span * SUBPEAK_ZONE_FRACTION);
                const channelBottom = channel.y + span;
                const warnBoundaryY = channel.y + warnHeight;
                const subBoundaryY  = warnBoundaryY + subHeight;
                const litTopY = channel.y + span - litHeight;
                const active = withAlpha(theme.active, onAlpha);
                const subPeakCol = withAlpha(theme.subPeak, onAlpha);
                const warning = withAlpha(theme.warning, onAlpha);

                const sTop = Math.max(litTopY, channel.y);
                const sBot = Math.min(channelBottom, warnBoundaryY);
                if (sBot > sTop) gr.FillSolidRect(channel.x, sTop, channel.w, sBot - sTop, warning);

                const pTop = Math.max(litTopY, warnBoundaryY);
                const pBot = Math.min(channelBottom, subBoundaryY);
                if (pBot > pTop) gr.FillSolidRect(channel.x, pTop, channel.w, pBot - pTop, subPeakCol);

                const aTop = Math.max(litTopY, subBoundaryY);
                if (channelBottom > aTop) gr.FillSolidRect(channel.x, aTop, channel.w, channelBottom - aTop, active);
            }
            if (peak > 0.01) {
                const peakY = channel.y + (span - 1) - Math.round(clamp(peak, 0, 1) * (span - 1));
                const peakColour = peak > WARNING_ZONE_THRESHOLD ? theme.warning : (theme.peak !== undefined ? theme.peak : theme.active);
                const tickThickness = Math.min(FLAT_PEAK_THICKNESS, channel.h);
                const tickY = clamp(Math.round(peakY - tickThickness / 2), channel.y, channel.y + span - tickThickness);
                gr.FillSolidRect(channel.x, tickY, channel.w, tickThickness, withAlpha(peakColour, onAlpha));
            }
        } else {
            const span = channel.w;
            const litWidth = Math.round(clampedLevel * span);
            gr.FillSolidRect(channel.x, channel.y, span, channel.h, offFill);
            if (litWidth > 0) {
                const warnWidth = Math.round(span * (1 - WARNING_ZONE_THRESHOLD));
                const subWidth  = Math.round(span * SUBPEAK_ZONE_FRACTION);
                const barRight = channel.x + span;
                const warnBoundaryX = barRight - warnWidth;
                const subBoundaryX  = warnBoundaryX - subWidth;
                const litRightX = channel.x + litWidth;
                const active = withAlpha(theme.active, onAlpha);
                const subPeakCol = withAlpha(theme.subPeak, onAlpha);
                const warning = withAlpha(theme.warning, onAlpha);

                const sL = Math.max(channel.x, warnBoundaryX);
                const sR = Math.min(litRightX, barRight);
                if (sR > sL) gr.FillSolidRect(sL, channel.y, sR - sL, channel.h, warning);

                const pL = Math.max(channel.x, subBoundaryX);
                const pR = Math.min(litRightX, warnBoundaryX);
                if (pR > pL) gr.FillSolidRect(pL, channel.y, pR - pL, channel.h, subPeakCol);

                const aR = Math.min(litRightX, subBoundaryX);
                if (aR > channel.x) gr.FillSolidRect(channel.x, channel.y, aR - channel.x, channel.h, active);
            }
            if (peak > 0.01) {
                const peakX = channel.x + Math.round(clamp(peak, 0, 1) * (span - 1));
                const peakColour = peak > WARNING_ZONE_THRESHOLD ? theme.warning : (theme.peak !== undefined ? theme.peak : theme.active);
                const tickThickness = Math.min(FLAT_PEAK_THICKNESS, channel.w);
                const tickX = clamp(Math.round(peakX - tickThickness / 2), channel.x, channel.x + span - tickThickness);
                gr.FillSolidRect(tickX, channel.y, tickThickness, channel.h, withAlpha(peakColour, onAlpha));
            }
        }
    }

    drawFlatGradient(gr, channel, level, peak, vertical, theme, onOpacity, offOpacity, style) {
        const clampedLevel = clamp(level, 0, 1);
        const offFill = withAlpha(theme.inactive, offOpacity === undefined ? 255 : offOpacity);
        const onAlpha = onOpacity === undefined ? 255 : onOpacity;
        const cross = style === GRADIENT_STYLE_CROSS;
        const fillLen = vertical ? channel.h : channel.w;

        if (vertical) {
            const litHeight = Math.round(clampedLevel * fillLen);
            gr.FillSolidRect(channel.x, channel.y, channel.w, fillLen, offFill);
            if (litHeight > 0) {
                const litStartY = channel.y + fillLen - litHeight;
                if (cross) {
                    const stripH = this._gradientStrip(theme, channel.h, onAlpha, style);
                    const stripW = this._gradientStrip(theme, channel.w, onAlpha, GRADIENT_STYLE_ACTIVE_SWEEP);
                    const litEndY = litStartY + litHeight;
                    const zoneEndY = channel.y + Math.round(channel.h * (1 - SUBPEAK_ZONE_THRESHOLD));
                    const zoneLitEnd = Math.min(litEndY, zoneEndY);
                    if (litStartY < zoneLitEnd) {
                        for (let y = litStartY; y < zoneLitEnd; y++) {
                            gr.FillSolidRect(channel.x, y, channel.w, 1, stripH[channel.h - 1 - (y - channel.y)]);
                        }
                    }
                    const activeStartY = Math.max(litStartY, zoneEndY);
                    if (activeStartY < litEndY) {
                        const activeRows = litEndY - activeStartY;
                        for (let col = 0; col < channel.w; col++) {
                            gr.FillSolidRect(channel.x + col, activeStartY, 1, activeRows, stripW[col]);
                        }
                    }
                } else {
                    const stripH = this._gradientStrip(theme, channel.h, onAlpha, style);
                    let runStart = 0;
                    let runColour = stripH[0];
                    for (let row = 1; row < litHeight; row++) {
                        if (stripH[row] !== runColour) {
                            gr.FillSolidRect(channel.x, litStartY + litHeight - row, channel.w, row - runStart, runColour);
                            runStart = row;
                            runColour = stripH[row];
                        }
                    }
                    gr.FillSolidRect(channel.x, litStartY, channel.w, litHeight - runStart, runColour);
                }
            }
            if (peak > 0.01) {
                const peakY = channel.y + (fillLen - 1) - Math.round(clamp(peak, 0, 1) * (fillLen - 1));
                const peakPos = clamp(peak, 0, 1);
                const peakColour = peakPos > WARNING_ZONE_THRESHOLD ? theme.warning : (theme.peak !== undefined ? theme.peak : theme.active);
                const tickThickness = Math.min(FLAT_PEAK_THICKNESS, channel.h);
                const tickY = clamp(Math.round(peakY - tickThickness / 2), channel.y, channel.y + fillLen - tickThickness);
                gr.FillSolidRect(channel.x, tickY, channel.w, tickThickness, withAlpha(peakColour, onAlpha));
            }
        } else {
            const strip = cross ? null : this._gradientStrip(theme, channel.w, onAlpha, style);
            const litWidth = Math.round(clampedLevel * fillLen);
            gr.FillSolidRect(channel.x, channel.y, fillLen, channel.h, offFill);
            if (litWidth > 0) {
                if (cross) {
                    const stripW = this._gradientStrip(theme, channel.w, onAlpha, style);
                    const sweepStrip = this._gradientStrip(theme, channel.h, onAlpha, GRADIENT_STYLE_ACTIVE_SWEEP);
                    const litEndX = channel.x + litWidth;
                    const zoneColStart = channel.x + Math.round(channel.w * SUBPEAK_ZONE_THRESHOLD);
                    const activeEndX = Math.min(litEndX, zoneColStart);
                    if (channel.x < activeEndX) {
                        const activeWidth = activeEndX - channel.x;
                        for (let row = 0; row < channel.h; row++) {
                            gr.FillSolidRect(channel.x, channel.y + row, activeWidth, 1, sweepStrip[row]);
                        }
                    }
                    const zoneStartX = Math.max(channel.x, zoneColStart);
                    if (zoneStartX < litEndX) {
                        for (let x = zoneStartX; x < litEndX; x++) {
                            gr.FillSolidRect(x, channel.y, 1, channel.h, stripW[x - channel.x]);
                        }
                    }
                } else {
                    let runStart = 0;
                    let runColour = strip[0];
                    for (let col = 1; col < litWidth; col++) {
                        if (strip[col] !== runColour) {
                            gr.FillSolidRect(channel.x + runStart, channel.y, col - runStart, channel.h, runColour);
                            runStart = col;
                            runColour = strip[col];
                        }
                    }
                    gr.FillSolidRect(channel.x + runStart, channel.y, litWidth - runStart, channel.h, runColour);
                }
            }
            if (peak > 0.01) {
                const peakX = channel.x + Math.round(clamp(peak, 0, 1) * (fillLen - 1));
                const peakPos = clamp(peak, 0, 1);
                const peakColour = peakPos > WARNING_ZONE_THRESHOLD ? theme.warning : (theme.peak !== undefined ? theme.peak : theme.active);
                const tickThickness = Math.min(FLAT_PEAK_THICKNESS, channel.w);
                const tickX = clamp(Math.round(peakX - tickThickness / 2), channel.x, channel.x + fillLen - tickThickness);
                gr.FillSolidRect(tickX, channel.y, tickThickness, channel.h, withAlpha(peakColour, onAlpha));
            }
        }
    }

    _gradientStrip(theme, span, onAlpha, style) {
        return this._gradStrips.get(theme, span, onAlpha, style);
    }
}

class SpectrumGeometryCache {
    constructor() {
        this._width = -1; this._height = -1; this._layout = null; this._barCount = -1; this._pad = -1;
        this.geometry = null;
    }
    get(width, height, layout, barCount, panelPad) {
        const pad = clamp(panelPad !== undefined ? panelPad : DEFAULT_PANEL_PAD, PANEL_PAD_MIN, PANEL_PAD_MAX);
        if (width === this._width && height === this._height && layout === this._layout && barCount === this._barCount && pad === this._pad) return this.geometry;
        this._width = width; this._height = height; this._layout = layout; this._barCount = barCount; this._pad = pad;
        const vertical = layout === 'Vertical';
        const bars = [];
        if (vertical) {
            const availableHeight = Math.max(1, height - pad * 2);
            const availableWidth  = Math.max(1, width  - pad * 2);
            let g = Math.max(1, Math.round((availableWidth / barCount) * SPECTRUM_BAR_GAP_RATIO));
            let count = barCount, barWidth;
            let fitCount = Math.max(1, Math.floor((availableWidth - (barCount - 1) * g) / Math.max(1, SPECTRUM_MIN_BAR_WIDTH)));
            if (fitCount < barCount) {
                g = 0;
                fitCount = Math.max(1, Math.floor(availableWidth / Math.max(1, SPECTRUM_MIN_BAR_WIDTH)));
                count = Math.min(fitCount, barCount);
                barWidth = Math.max(1, Math.floor(availableWidth / count));
            } else {
                barWidth = Math.max(SPECTRUM_MIN_BAR_WIDTH, Math.floor((availableWidth - g * (count - 1)) / count));
            }
            const totalWidth = barWidth * count + g * (count - 1);
            const startX = pad + Math.max(0, Math.floor((availableWidth - totalWidth) / 2));
            const baseY = pad + availableHeight;
            for (let i = 0; i < count; i++) {
                bars.push({ x: startX + i * (barWidth + g), y: pad, w: barWidth, h: availableHeight, baseY });
            }
        } else {
            const availableWidth  = Math.max(1, width  - pad * 2);
            const availableHeight = Math.max(1, height - pad * 2);
            let g = Math.max(1, Math.round((availableHeight / barCount) * SPECTRUM_BAR_GAP_RATIO));
            let count = barCount, barHeight;
            let fitCount = Math.max(1, Math.floor((availableHeight - (barCount - 1) * g) / Math.max(1, SPECTRUM_MIN_BAR_HEIGHT)));
            if (fitCount < barCount) {
                g = 0;
                fitCount = Math.max(1, Math.floor(availableHeight / Math.max(1, SPECTRUM_MIN_BAR_HEIGHT)));
                count = Math.min(fitCount, barCount);
                barHeight = Math.max(1, Math.floor(availableHeight / count));
            } else {
                barHeight = Math.max(SPECTRUM_MIN_BAR_HEIGHT, Math.floor((availableHeight - g * (count - 1)) / count));
            }
            const totalHeight = barHeight * count + g * (count - 1);
            const startY = pad + Math.max(0, Math.floor((availableHeight - totalHeight) / 2));
            const baseX = pad;
            for (let i = 0; i < count; i++) {
                bars.push({ x: baseX, y: startY + i * (barHeight + g), w: availableWidth, h: barHeight });
            }
        }
        this.geometry = { vertical, pad, bars };
        return this.geometry;
    }
    invalidate() { this._width = -1; this._height = -1; this._layout = null; this._barCount = -1; this._pad = -1; }
}

class SpectrumRenderer {
    draw(gr, geometry, levels, peaks, barCount, theme, onOpacity, offOpacity, peakHoldEnabled) {
        const vertical = geometry.vertical;
        const onAlpha = onOpacity === undefined ? 255 : onOpacity;
        const offFill = withAlpha(theme.inactive, offOpacity === undefined ? 255 : offOpacity);
        const n = Math.min(barCount, geometry.bars.length);
        for (let i = 0; i < n; i++) {
            const bar = geometry.bars[i];
            if (!bar) continue;
            const level = clamp(levels[i] || 0, 0, 1);
            const peak = clamp(peaks[i] || 0, 0, 1);
            if (vertical) {
                gr.FillSolidRect(bar.x, bar.y, bar.w, bar.h, offFill);
                const litH = Math.round(level * bar.h);
                if (litH > 0) {
                    const warnH = Math.round(bar.h * (1 - WARNING_ZONE_THRESHOLD));
                    const subH  = Math.round(bar.h * SUBPEAK_ZONE_FRACTION);
                    const warnBottom = bar.y + warnH;
                    const subBottom  = warnBottom + subH;
                    const litTop = bar.baseY - litH;
                    const active = withAlpha(theme.active, onAlpha);
                    const subPeakCol = withAlpha(theme.subPeak, onAlpha);
                    const warning = withAlpha(theme.warning, onAlpha);

                    const sTop = Math.max(litTop, bar.y);
                    const sBot = Math.min(bar.baseY, warnBottom);
                    if (sBot > sTop) gr.FillSolidRect(bar.x, sTop, bar.w, sBot - sTop, warning);

                    const pTop = Math.max(litTop, warnBottom);
                    const pBot = Math.min(bar.baseY, subBottom);
                    if (pBot > pTop) gr.FillSolidRect(bar.x, pTop, bar.w, pBot - pTop, subPeakCol);

                    const aTop = Math.max(litTop, subBottom);
                    if (bar.baseY > aTop) gr.FillSolidRect(bar.x, aTop, bar.w, bar.baseY - aTop, active);
                }
                if (peakHoldEnabled && peak > 0.01) {
                    const peakY = bar.baseY - 1 - Math.round(clamp(peak, 0, 1) * (bar.h - 1));
                    const tickThickness = Math.min(FLAT_PEAK_THICKNESS, bar.h);
                    const tickY = clamp(Math.round(peakY - tickThickness / 2), bar.y, bar.baseY - tickThickness);
                    gr.FillSolidRect(bar.x, tickY, bar.w, tickThickness, withAlpha(peak > WARNING_ZONE_THRESHOLD ? theme.warning : (theme.peak !== undefined ? theme.peak : theme.active), onAlpha));
                }
            } else {
                gr.FillSolidRect(bar.x, bar.y, bar.w, bar.h, offFill);
                const litW = Math.round(level * bar.w);
                if (litW > 0) {
                    const warnW = Math.round(bar.w * (1 - WARNING_ZONE_THRESHOLD));
                    const subW  = Math.round(bar.w * SUBPEAK_ZONE_FRACTION);
                    const barRight = bar.x + bar.w;
                    const warnStart = barRight - warnW;
                    const subStart  = warnStart - subW;
                    const litRightX = bar.x + litW;
                    const active = withAlpha(theme.active, onAlpha);
                    const subPeakCol = withAlpha(theme.subPeak, onAlpha);
                    const warning = withAlpha(theme.warning, onAlpha);

                    const sL = Math.max(bar.x, warnStart);
                    const sR = Math.min(litRightX, barRight);
                    if (sR > sL) gr.FillSolidRect(sL, bar.y, sR - sL, bar.h, warning);

                    const pL = Math.max(bar.x, subStart);
                    const pR = Math.min(litRightX, warnStart);
                    if (pR > pL) gr.FillSolidRect(pL, bar.y, pR - pL, bar.h, subPeakCol);

                    const aR = Math.min(litRightX, subStart);
                    if (aR > bar.x) gr.FillSolidRect(bar.x, bar.y, aR - bar.x, bar.h, active);
                }
                if (peakHoldEnabled && peak > 0.01) {
                    const peakX = bar.x + Math.round(clamp(peak, 0, 1) * (bar.w - 1));
                    const tickThickness = Math.min(FLAT_PEAK_THICKNESS, bar.w);
                    const tickX = clamp(Math.round(peakX - tickThickness / 2), bar.x, bar.x + bar.w - tickThickness);
                    gr.FillSolidRect(tickX, bar.y, tickThickness, bar.h, withAlpha(peak > WARNING_ZONE_THRESHOLD ? theme.warning : (theme.peak !== undefined ? theme.peak : theme.active), onAlpha));
                }
            }
        }
    }
}

class GlowRenderer {
    _segmentRect(channel, index) { return channel.segments[index]; }
    _bloom(gr, rect, vertical, glowColour, opacity, dynamicMult) {
        if (!rect || rect.w <= 0 || rect.h <= 0) return;
        const finalOpacity = opacity * dynamicMult;
        for (let i = 1; i <= GLOW_ITERATIONS; i++) {
            const progress = i / GLOW_ITERATIONS;
            const alpha = Math.floor(finalOpacity * (1 - progress) * GLOW_ALPHA_MULT);
            if (alpha <= 0) continue;
            const pad = i * GLOW_STEP_PADDING;
            const bx = rect.x - pad, by = rect.y - pad;
            const bw = rect.w + pad * 2, bh = rect.h + pad * 2;
            if (bw <= 0 || bh <= 0) continue;
            const cx = Math.max(0, bx), cy = Math.max(0, by);
            const cw = bw - (cx - bx), ch = bh - (cy - by);
            if (cw <= 0 || ch <= 0) continue;
            gr.FillSolidRect(cx, cy, cw, ch, withAlpha(glowColour, alpha));
        }
    }
    draw(gr, channel, level, peak, geometry, vertical, theme, opacity, dynamicMult) {
        if (opacity <= 0) return;
        const segmentCount = geometry.segmentCount;
        const baseCount    = Math.max(0, segmentCount - (geometry.extraSegments || 0));
        const litSegments  = Math.min(Math.round(level * baseCount), baseCount);
        if (litSegments > 0) {
            const tipIndex = clamp(litSegments - 1, 0, segmentCount - 1);
            const progress = (tipIndex + 1) / segmentCount;
            const tipColour = progress > WARNING_ZONE_THRESHOLD ? theme.warning : progress > SUBPEAK_ZONE_THRESHOLD ? theme.subPeak : theme.active;
            this._bloom(gr, this._segmentRect(channel, tipIndex), vertical, tipColour, opacity, dynamicMult);
        }
        if (peak > 0.01) {
            const peakIndex = clamp(Math.ceil(peak * segmentCount) - 1, 0, segmentCount - 1);
            const progress = (peakIndex + 1) / segmentCount;
            const peakColour = progress > WARNING_ZONE_THRESHOLD ? theme.warning : (theme.peak !== undefined ? theme.peak : theme.active);
            this._bloom(gr, this._segmentRect(channel, peakIndex), vertical, peakColour, opacity * 0.8, dynamicMult);
        }
    }
    drawFlat(gr, channel, level, peak, vertical, theme, opacity, dynamicMult) {
        if (opacity <= 0) return;
        const clampedLevel = clamp(level, 0, 1);
        if (clampedLevel > 0.001) {
            const tipColour = clampedLevel > WARNING_ZONE_THRESHOLD ? theme.warning : clampedLevel > SUBPEAK_ZONE_THRESHOLD ? theme.subPeak : theme.active;
            let tipRect;
            if (vertical) {
                const litHeight = Math.round(clampedLevel * channel.h);
                tipRect = { x: channel.x, y: channel.y + channel.h - litHeight, w: channel.w, h: Math.max(1, Math.min(FLAT_PEAK_THICKNESS, channel.h)) };
            } else {
                const litWidth = Math.round(clampedLevel * channel.w);
                tipRect = { x: Math.max(channel.x, channel.x + litWidth - Math.min(FLAT_PEAK_THICKNESS, channel.w)), y: channel.y, w: Math.max(1, Math.min(FLAT_PEAK_THICKNESS, channel.w)), h: channel.h };
            }
            this._bloom(gr, tipRect, vertical, tipColour, opacity, dynamicMult);
        }
        if (peak > 0.01) {
            const peakColour = peak > WARNING_ZONE_THRESHOLD ? theme.warning : (theme.peak !== undefined ? theme.peak : theme.active);
            let peakRect;
            if (vertical) {
                const peakY = channel.y + (channel.h - 1) - Math.round(clamp(peak, 0, 1) * (channel.h - 1));
                const th = Math.min(FLAT_PEAK_THICKNESS, channel.h);
                peakRect = { x: channel.x, y: Math.round(peakY - th / 2), w: channel.w, h: th };
            } else {
                const peakX = channel.x + Math.round(clamp(peak, 0, 1) * (channel.w - 1));
                const tw = Math.min(FLAT_PEAK_THICKNESS, channel.w);
                peakRect = { x: Math.round(peakX - tw / 2), y: channel.y, w: tw, h: channel.h };
            }
            this._bloom(gr, peakRect, vertical, peakColour, opacity, dynamicMult);
        }
    }
}

// ---------------------------------------------------------------------------
// EFFECT RENDERERS
// ---------------------------------------------------------------------------

class PhosphorRenderer {
    draw(gr, x, y, width, height, theme, opacity) {
        if (opacity <= 0) return;
        const adjustedOpacity = Math.floor(opacity * 0.3);
        if (adjustedOpacity <= 0) return;
        const tinted = interpolateColour(theme.active, colour(255, 255, 255), 0.25);
        gr.FillSolidRect(x, y, width, height, withAlpha(tinted, adjustedOpacity));
    }
}

class ScanlineRenderer {
    draw(gr, area, opacity, vertical) {
        if (opacity <= 0) return;
        const scanlineCol = withAlpha(colour(0, 0, 0), opacity);
        if (vertical) {
            for (let row = area.y; row < area.y + area.h; row += SCANLINE_SPACING) {
                gr.FillSolidRect(area.x, row, area.w, 1, scanlineCol);
            }
        } else {
            for (let col = area.x; col < area.x + area.w; col += SCANLINE_SPACING) {
                gr.FillSolidRect(col, area.y, 1, area.h, scanlineCol);
            }
        }
    }
}

class ReflectionRenderer {
    draw(gr, x, y, width, height, opacity) {
        if (opacity <= 0) return;
        const reflH = Math.floor(height * REFLECTION_HEIGHT_RATIO);
        const white = colour(255, 255, 255);
        for (let row = 0; row < reflH; row++) {
            const t = 1 - row / reflH;
            const s = t * t * (3 - 2 * t);
            const alpha = Math.floor(opacity * s * 0.30);
            if (alpha > 0) gr.FillSolidRect(x, y + row, width, 1, withAlpha(white, alpha));
        }
    }
}

class ScaleRenderer {
    draw(gr, geometry, width, height, theme, layout) {
        const font     = fonts.get('Segoe UI Semibold', Math.max(8, Math.round(Math.min(width, height) * 0.032)), 0);
        const extras   = geometry.extraSegments || 0;
        const maxDb    = extras;
        const allTicks = DB_SCALE_TICKS.slice();
        if (extras > 0) allTicks.push({ label: '+' + extras, db: extras });
        if (layout === 'Vertical') {
            const meter        = geometry.channels[0];
            const scaleX       = geometry.pad;
            const labelHeight  = Math.max(9, Math.round(Math.min(width, height) * 0.045));
            const scaleBoxW    = Math.max(1, meter.x - LABEL_GAP - scaleX);
            for (let i = 0; i < allTicks.length; i++) {
                const level  = dbToMeter(allTicks[i].db, maxDb);
                const tickY  = meter.y + (1 - level) * meter.h - labelHeight / 2;
                const col    = allTicks[i].db > 0 ? theme.warning : theme.text;
                gr.GdiDrawText(allTicks[i].label, font, col, scaleX, Math.round(tickY), scaleBoxW, labelHeight, TEXT_RIGHT_MIDDLE);
            }
        } else {
            const meter        = geometry.channels[0];
            const meterBottom  = geometry.channels[1].y + geometry.channels[1].h;
            const footerBottom = height - geometry.pad;
            const availFooter  = Math.max(1, footerBottom - meterBottom - LABEL_GAP);
            const y            = meterBottom + LABEL_GAP;
            const labelHeight  = Math.min(Math.max(9, Math.round(Math.min(width, height) * 0.045)), availFooter, Math.max(1, footerBottom - y));
            const tickWidth    = Math.max(28, Math.round(meter.w / allTicks.length));
            for (let i = 0; i < allTicks.length; i++) {
                const level    = dbToMeter(allTicks[i].db, maxDb);
                const tickX    = meter.x + level * meter.w - tickWidth / 2;
                const clampedX = clamp(tickX, meter.x - tickWidth / 2, meter.x + meter.w - tickWidth / 2);
                const col      = allTicks[i].db > 0 ? theme.warning : theme.text;
                gr.GdiDrawText(allTicks[i].label, font, col, Math.round(clampedX), y, tickWidth, labelHeight, TEXT_CENTER_TOP);
            }
        }
    }
}

class LabelRenderer {
    draw(gr, geometry, theme, width, height) {
        if (geometry.vertical) {
            const footerH = geometry.footer;
            const footerY = height - geometry.pad - footerH;
            const fontSize = Math.max(6, Math.floor(footerH * 0.65));
            const font = fonts.get('Segoe UI Semibold', fontSize, 1);
            const c0 = geometry.channels[0], c1 = geometry.channels[1];
            gr.GdiDrawText('L', font, theme.text, c0.x, footerY, c0.w, footerH, TEXT_CENTER_MIDDLE);
            gr.GdiDrawText('R', font, theme.text, c1.x, footerY, c1.w, footerH, TEXT_CENTER_MIDDLE);
        } else {
            const stripW = geometry.labelWidth;
            const stripX = geometry.pad;
            const fontSize = Math.max(6, Math.floor(Math.min(stripW, geometry.channels[0].h) * 0.65));
            const font = fonts.get('Segoe UI Semibold', fontSize, 1);
            const c0 = geometry.channels[0], c1 = geometry.channels[1];
            gr.GdiDrawText('L', font, theme.text, stripX, c0.y, stripW, c0.h, TEXT_CENTER_MIDDLE);
            gr.GdiDrawText('R', font, theme.text, stripX, c1.y, stripW, c1.h, TEXT_CENTER_MIDDLE);
        }
    }
}

class EffectLayerCache {
    constructor() {
        this.overlayKey = '';
        this.overlayBitmap = null;
    }
    _disposeOverlay() {
        if (this.overlayBitmap) { try { this.overlayBitmap.Dispose(); } catch (e) {} this.overlayBitmap = null; }
    }
    getOverlayLayer(
        width, height, theme, themeName,
        phosphorRenderer, scanlineRenderer, reflectionRenderer,
        activeArea, vertical,
        showPhosphor, phosphorOpacity,
        showScanlines, scanlineOpacity,
        showReflection, reflectionOpacity
    ) {
        const needsAny = (showPhosphor && phosphorOpacity > 0) ||
                         (showScanlines && scanlineOpacity > 0) ||
                         (showReflection && reflectionOpacity > 0);

        if (width <= 0 || height <= 0 || !needsAny || !activeArea || activeArea.w <= 0 || activeArea.h <= 0) {
            if (this.overlayBitmap || this.overlayKey) {
                this._disposeOverlay();
                this.overlayKey = '';
            }
            return null;
        }

        const key = [
            width, height, themeName,
            activeArea.x, activeArea.y, activeArea.w, activeArea.h,
            vertical,
            showPhosphor ? phosphorOpacity : -1,
            showScanlines ? scanlineOpacity : -1,
            showReflection ? reflectionOpacity : -1
        ].join('|');

        if (key === this.overlayKey && this.overlayBitmap) return this.overlayBitmap;

        this._disposeOverlay();
        this.overlayKey = key;

        try {
            const bmp = gdi.CreateImage(width, height);
            const g = bmp.GetGraphics();
            try {
                if (showPhosphor && phosphorOpacity > 0) {
                    phosphorRenderer.draw(g, activeArea.x, activeArea.y, activeArea.w, activeArea.h, theme, phosphorOpacity);
                }
                if (showScanlines && scanlineOpacity > 0) {
                    scanlineRenderer.draw(g, activeArea, scanlineOpacity, vertical);
                }
                if (showReflection && reflectionOpacity > 0) {
                    reflectionRenderer.draw(g, 0, 0, width, height, reflectionOpacity);
                }
            } finally {
                bmp.ReleaseGraphics(g);
            }
            this.overlayBitmap = bmp;
        } catch (e) {
            console.log('[LCD Peak Meter] EffectLayerCache error: ' + String(e.message || e));
            this.overlayBitmap = null;
            this.overlayKey = '';
        }

        return this.overlayBitmap;
    }
    dispose() { this._disposeOverlay(); this.overlayKey = ''; }
}

// ---------------------------------------------------------------------------
// STATIC METER BACKGROUND CACHE
// ---------------------------------------------------------------------------

class MeterBackgroundCache {
    constructor() {
        this._key = '';
        this._bitmap = null;
        this.lastHit = false;
    }
    get(width, height, geometry, theme, layout, flatMode, flatGradient, offOpacity, showMarkers, scaleRenderer, labelRenderer, segmentRenderer) {
        const key = [width, height, layout, geometry.segmentCount, geometry.extraSegments || 0, theme.name, offOpacity, flatMode ? 1 : 0, flatGradient, showMarkers ? 1 : 0, geometry.pad, geometry.footer, geometry.scaleWidth, geometry.labelWidth].join('|');
        if (key === this._key && this._bitmap) {
            this.lastHit = true;
            return this._bitmap;
        }
        this.lastHit = false;
        this._dispose();
        this._key = key;
        try {
            const bmp = gdi.CreateImage(width, height);
            const g = bmp.GetGraphics();
            try {
                g.FillSolidRect(0, 0, width, height, theme.background);
                if (flatMode) {
                    const ch0 = geometry.channels[0], ch1 = geometry.channels[1];
                    const offFill = withAlpha(theme.inactive, offOpacity === undefined ? 255 : offOpacity);
                    g.FillSolidRect(ch0.x, ch0.y, ch0.w, ch0.h, offFill);
                    g.FillSolidRect(ch1.x, ch1.y, ch1.w, ch1.h, offFill);
                } else {
                    segmentRenderer.draw(g, geometry.channels[0], 0, 0, geometry.vertical, theme, geometry, 0, offOpacity);
                    segmentRenderer.draw(g, geometry.channels[1], 0, 0, geometry.vertical, theme, geometry, 0, offOpacity);
                }
                if (showMarkers) {
                    scaleRenderer.draw(g, geometry, width, height, theme, layout);
                    labelRenderer.draw(g, geometry, theme, width, height);
                }
            } finally {
                bmp.ReleaseGraphics(g);
            }
            this._bitmap = bmp;
        } catch (e) {
            console.log('[LCD Peak Meter] MeterBackgroundCache error: ' + String(e.message || e));
            this._bitmap = null;
            this._key = '';
        }
        return this._bitmap;
    }
    invalidate() { this._dispose(); this._key = ''; this.lastHit = false; }
    _dispose() {
        if (this._bitmap) { try { this._bitmap.Dispose(); } catch (e) {} this._bitmap = null; }
    }
    dispose() { this._dispose(); this._key = ''; this.lastHit = false; }
}

// ---------------------------------------------------------------------------
// PERFORMANCE MONITOR
// ---------------------------------------------------------------------------

class PerformanceMonitor {
    constructor() {
        this.enabled = false;
        this.tickMs = 0; this.audioMs = 0; this.fftMs = 0; this.paintMs = 0;
        this.repaintCount = 0; this.tickCount = 0;
        this._windowStart = Date.now();
        this._tickWindow = 0; this._audioWindow = 0; this._fftWindow = 0; this._paintWindow = 0;
        this._repaintWindow = 0; this._fps = 0;
        this.bgCacheHit = true;
        this.spectrumTierMs = SPECTRUM_FPS_FULL_MS;
        this.spectrumFftSize = SPECTRUM_FFT_SIZE;
        this.spectrumSkipped = 0;
        this._spectrumSkippedWindow = 0;
    }
    setEnabled(value) { this.enabled = !!value; }
    beginTick() { return this.enabled ? Date.now() : 0; }
    endTick(start, audioMs, fftMs) {
        if (!this.enabled) return;
        const now = Date.now();
        this.tickCount++;
        this._tickWindow += Math.max(0, now - start);
        this._audioWindow += Math.max(0, audioMs || 0);
        this._fftWindow += Math.max(0, fftMs || 0);
        this._roll(now);
    }
    beginPaint() { return this.enabled ? Date.now() : 0; }
    endPaint(start) {
        if (!this.enabled) return;
        const now = Date.now();
        this.paintMs = Math.max(0, now - start);
        this._paintWindow += this.paintMs;
        this._roll(now);
    }
    noteRepaint() { if (this.enabled) this._repaintWindow++; }
    noteSpectrumClean() { if (this.enabled) this._spectrumSkippedWindow++; }
    _roll(now) {
        const elapsed = now - this._windowStart;
        if (elapsed < 1000) return;
        const seconds = elapsed / 1000;
        this.tickMs = this._tickWindow / Math.max(this.tickCount, 1);
        this.audioMs = this._audioWindow / Math.max(this.tickCount, 1);
        this.fftMs = this._fftWindow / Math.max(this.tickCount, 1);
        this.paintMs = this._paintWindow / Math.max(this._repaintWindow, 1);
        this._fps = this._repaintWindow / seconds;
        this.repaintCount = this._repaintWindow;
        this._windowStart = now;
        this._tickWindow = 0; this._audioWindow = 0; this._fftWindow = 0;
        this._paintWindow = 0; this._repaintWindow = 0; this.tickCount = 0;
        this.spectrumSkipped = this._spectrumSkippedWindow;
        this._spectrumSkippedWindow = 0;
    }
    draw(gr, width, height) {
        if (!this.enabled || width < 220 || height < 70) return;
        const font = fonts.get('Consolas', 10, 0);
        const lineH = 13, pad = 7;
        const boxW = Math.min(270, width - 12);
        const boxH = 8 * lineH + pad * 2;
        const x = width - boxW - 6, y = 6;
        gr.FillSolidRect(x, y, boxW, boxH, withAlpha(colour(0, 0, 0), 190));
        const specTierLabel = this.spectrumTierMs === SPECTRUM_FPS_FULL_MS ? 'Full  ' : this.spectrumTierMs === SPECTRUM_FPS_MEDIUM_MS ? 'Medium' : 'Low   ';
        const text = [
            'LCD PERFORMANCE',
            'Tick:   ' + this.tickMs.toFixed(2) + ' ms',
            'Audio:  ' + this.audioMs.toFixed(2) + ' ms  (~' + Math.round(1000 / AUDIO_TIMER_MS) + ' Hz)',
            'FFT:    ' + this.fftMs.toFixed(2) + ' ms  gate=' + this.spectrumTierMs + 'ms [' + specTierLabel + ']  N=' + this.spectrumFftSize,
            'Dirty skip: ' + this.spectrumSkipped + ' clean/s',
            'Paint:  ' + this.paintMs.toFixed(2) + ' ms   FPS: ' + this._fps.toFixed(1),
            'BG cache: ' + (this.bgCacheHit ? 'HIT' : 'MISS'),
            'Timers: A=' + AUDIO_TIMER_MS + 'ms  S=' + SPECTRUM_TIMER_MS + 'ms'
        ];
        for (let i = 0; i < text.length; i++) {
            gr.DrawString(text[i], font, colour(220, 220, 220), x + pad, y + pad + i * lineH, boxW - pad * 2, lineH);
        }
    }
}

// ---------------------------------------------------------------------------
// MENU MANAGER
// ---------------------------------------------------------------------------

class MenuManager {
    constructor(main) {
        this.main = main;
    }

    _doColorPicker(label, key) {
        const d = this.main.themes.draftTheme;
        const applied = this.main.properties.values.theme;
        const baseName = applied === '~Preview' ? this.main.properties._lastFinalizedTheme : applied;
        if (this.main.themes._draftBaseTheme !== baseName) {
            this.main.themes._draftBaseTheme = baseName;
            this.main.themes.seedDraftFromTheme(this.main.themes.get(baseName));
        }
        const startColor = d[key];
        let newColor;
        try {
            newColor = utils.ColourPicker(window.ID, startColor);
        } catch (e) {
            fb.ShowPopupMessage('Color picker unavailable:\n' + String(e.message || e), SCRIPT_NAME);
            return;
        }
        if (newColor === startColor) return;

        this.main.themes.updateDraft(key, newColor);

        const t = this.main.themes.makeTheme(
            '~Preview',
            this.main.themes.draftTheme.background,
            this.main.themes.draftTheme.inactive,
            this.main.themes.draftTheme.active,
            this.main.themes.draftTheme.text,
            this.main.themes.draftTheme.warning,
            this.main.themes.draftTheme.peak,
            this.main.themes.draftTheme.subPeak
        );
        this.main.themes.setPreview(t);
        this.main.properties.setTheme('~Preview');
        this.main.invalidateCaches({ geometry: true, background: true, effect: true });
        this.main.invalidate();
    }

    _doFinalizeTheme() {
        const draft = this.main.themes.draftTheme;
        let name;
        try {
            name = utils.InputBox(window.ID, 'Enter a name for your custom theme:', 'Save Theme', draft.name);
        } catch (e) {
            name = null;
        }
        if (name === false || name === null || name === undefined || String(name).trim() === '') return;
        name = String(name).trim();

        if (name === '~Preview') {
            fb.ShowPopupMessage(
                '"~Preview" is a reserved internal name and cannot be used.\nChoose a different name.',
                SCRIPT_NAME
            );
            return;
        }

        if (this.main.themes._isBuiltin(name)) {
            fb.ShowPopupMessage(
                '"' + name + '" is a built-in theme name and cannot be overwritten.\nChoose a different name.',
                SCRIPT_NAME
            );
            return;
        }

        const d = this.main.themes.draftTheme;
        const t = this.main.themes.makeTheme(name, d.background, d.inactive, d.active, d.text, d.warning, d.peak, d.subPeak);
        t.custom = true;

        if (this.main.themes.themeMap[name]) {
            const oldRef = this.main.themes.themeMap[name];
            const idx = this.main.themes.themes.indexOf(oldRef);
            if (idx !== -1) this.main.themes.themes[idx] = t;
            const ci = this.main.themes._customThemes.indexOf(oldRef);
            if (ci !== -1) {
                this.main.themes._customThemes[ci] = t;
            } else if (this.main.themes._customThemes.indexOf(t) === -1) {
                this.main.themes._customThemes.push(t);
            }
        } else {
            this.main.themes.themes.push(t);
            this.main.themes._customThemes.push(t);
        }
        this.main.themes.themeMap[name] = t;
        this.main.themes.clearPreview();

        this.main.themes.draftTheme.name = name;

        this.main.properties.setTheme(name);
        this.main.invalidateCaches({ geometry: true, background: true, effect: true });
        this.main.invalidate();

        let savePath = this.main.properties.values.customThemeFile;
        if (!savePath || savePath.trim() === '') {
            savePath = this._promptForSavePath('Save Theme File', 'lcd_custom_themes.json');
            if (savePath) this.main.properties.set('customThemeFile', savePath);
        }

        if (savePath && savePath.trim() !== '') {
            const saveResult = this.main.themes.saveToFile(savePath, null);
            if (saveResult.ok) {
                fb.ShowPopupMessage(
                    'Theme "' + name + '" saved and written to:\n' + savePath,
                    SCRIPT_NAME
                );
            } else {
                fb.ShowPopupMessage(
                    'Theme "' + name + '" saved to this session, but file write failed:\n' + (saveResult.error || 'Unknown error') +
                    '\n\nUse Theme > Custom Theme JSON > Save custom themes to JSON… to retry.',
                    SCRIPT_NAME
                );
            }
        }
    }

    _doRemoveCustomTheme(name) {
        const result = this.main.themes.removeCustom(name);
        if (!result.ok) {
            fb.ShowPopupMessage(result.error || 'Could not remove theme.', SCRIPT_NAME);
            return;
        }
        if (this.main.themes._draftBaseTheme === name) {
            this.main.themes._draftBaseTheme = null;
        }

        const current = this.main.properties.values.theme;
        const wasInUse = current === name || (current === '~Preview' && this.main.properties._lastFinalizedTheme === name);
        if (wasInUse) {
            const fallback = (this.main.properties._lastFinalizedTheme !== name)
                ? this.main.properties._lastFinalizedTheme
                : (this.main.themes.themes.length ? this.main.themes.themes[0].name : 'Pioneer Amber');
            this.main.properties._lastFinalizedTheme = fallback;
            this.main.themes.clearPreview();
            this.main.properties.setTheme(fallback);
        }

        this.main.invalidateCaches({ geometry: true, background: true, effect: true });
        this.main.invalidate();
        fb.ShowPopupMessage('Custom theme "' + name + '" removed.', SCRIPT_NAME);
    }

    _promptForFilePath(title) {
        try {
            const path = utils.InputBox(window.ID, 'Enter the full path to your JSON theme file:', title, this.main.properties.values.customThemeFile || '');
            return (path !== false && path !== null && path !== undefined && String(path).trim() !== '') ? String(path).trim() : null;
        } catch (e) {}
        return null;
    }

    _promptForSavePath(title, defaultName) {
        try {
            const path = utils.InputBox(
                window.ID,
                'Enter the full path to save the JSON theme file:',
                title,
                this.main.properties.values.customThemeFile || (fb.ProfilePath + (defaultName || 'lcd_custom_themes.json'))
            );
            return (path !== false && path !== null && path !== undefined && String(path).trim() !== '') ? String(path).trim() : null;
        } catch (e) {}
        return null;
    }

    show(x, y) {
        const menu            = window.CreatePopupMenu();
        const themeMenu       = window.CreatePopupMenu();
        const themeCustomMenu = window.CreatePopupMenu();
        const displayModeMenu = window.CreatePopupMenu();
        const spectrumBarsMenu = window.CreatePopupMenu();
        const layoutMenu      = window.CreatePopupMenu();
        const segmentMenu     = window.CreatePopupMenu();
        const extraSegMenu    = window.CreatePopupMenu();
        const modeMenu        = window.CreatePopupMenu();
        const attackMenu      = window.CreatePopupMenu();
        const releaseMenu     = window.CreatePopupMenu();
        const appearanceMenu  = window.CreatePopupMenu();
        const flatModeMenu    = window.CreatePopupMenu();
        const creatorMenu     = window.CreatePopupMenu();
        const removeThemeMenu = window.CreatePopupMenu();

        const names    = this.main.themes.names();
        const props    = this.main.properties.values;
        const isSpectrum = props.displayMode === 'Spectrum Analyzer';
        const mark = (isActive) => isActive ? '✓ ' : '';

        const THEME_BASE          = 100;
        const LAYOUT_BASE         = 600;
        const THEME_MENU_MAX      = Math.min(names.length, LAYOUT_BASE - THEME_BASE);
        const SEGMENT_BASE        = 700;
        const PEAK_HOLD_ID        = 800;
        const RESET_ID            = 850;
        const MODE_BASE           = 900;
        const ATTACK_BASE         = 1000;
        const RELEASE_BASE        = 1100;
        const PROFILER_ID         = 1150;
        const TOGGLE_BASE         = 1200;
        const ADJUST_BASE         = 1205;
        const TARGET_STRIDE       = 10;
        const APPEARANCE_RANGE_END = TOGGLE_BASE + OPACITY_SLIDER_TARGETS.length * TARGET_STRIDE;
        const DISPLAY_MODE_BASE   = 1400;
        const SPECTRUM_BARS_BASE  = 1420;
        const FLAT_ENABLE_ID      = 2000;
        const FLAT_SOLID_ID       = 2001;
        const FLAT_STRIP_ID       = 2002;
        const FLAT_CROSS_ID       = 2003;
        const THEME_LOAD_FILE_ID      = 2100;
        const THEME_SAVE_CUSTOM_ID    = 2101;
        const THEME_SAVE_ALL_ID       = 2102;
        const THEME_EXPORT_TEMPLATE_ID = 2103;
        const THEME_RELOAD_ID         = 2104;
        const SET_SAVE_PATH_ID        = 2105;
        const EXTRA_SEG_BASE        = 3200;
        const SHOW_MARKERS_ID       = 3100;
        const MARKER_BORDER_SIZE_ID = 3101;
        const PANEL_PAD_ID          = 3102;
        const THEME_CREATOR_BASE       = 3000;
        const THEME_REMOVE_CUSTOM_BASE = 3400;
        const CREATOR_BACKGROUND_ID    = THEME_CREATOR_BASE + 1;
        const CREATOR_INACTIVE_ID      = THEME_CREATOR_BASE + 2;
        const CREATOR_ACTIVE_ID        = THEME_CREATOR_BASE + 3;
        const CREATOR_TEXT_ID          = THEME_CREATOR_BASE + 4;
        const CREATOR_WARNING_ID       = THEME_CREATOR_BASE + 5;
        const CREATOR_PEAK_ID          = THEME_CREATOR_BASE + 6;
        const CREATOR_SUBPEAK_ID       = THEME_CREATOR_BASE + 7;
        const CREATOR_SAVE_ID          = THEME_CREATOR_BASE + 8;

        let id = THEME_BASE;
        for (let i = 0; i < THEME_MENU_MAX; i++, id++) {
            const isCustom = this.main.themes.themeMap[names[i]] && this.main.themes.themeMap[names[i]].custom;
            themeMenu.AppendMenuItem(MENU_STRING, id, mark(names[i] === props.theme) + names[i] + (isCustom ? '  [custom]' : ''));
        }
        themeMenu.AppendMenuSeparator();
        themeCustomMenu.AppendMenuItem(MENU_STRING, THEME_LOAD_FILE_ID, 'Load themes from JSON file…');
        const hasFile = props.customThemeFile && props.customThemeFile.trim() !== '';
        themeCustomMenu.AppendMenuItem(hasFile ? MENU_STRING : MF_GRAYED, THEME_RELOAD_ID,     'Reload from last file' + (hasFile ? '  (' + this._shortPath(props.customThemeFile) + ')' : ''));
        themeCustomMenu.AppendMenuSeparator();
        const hasCustom = this.main.themes._customThemes.length > 0;
        themeCustomMenu.AppendMenuItem(hasCustom ? MENU_STRING : MF_GRAYED, THEME_SAVE_CUSTOM_ID, 'Save custom themes to JSON…');
        themeCustomMenu.AppendMenuItem(MENU_STRING, THEME_SAVE_ALL_ID, 'Export all themes to JSON…');
        themeCustomMenu.AppendMenuItem(MENU_STRING, THEME_EXPORT_TEMPLATE_ID, 'Export template (all built-ins)…');
        themeCustomMenu.AppendMenuSeparator();
        themeCustomMenu.AppendMenuItem(MENU_STRING, SET_SAVE_PATH_ID, 'Set Default Save Path…' + (hasFile ? '  (' + this._shortPath(props.customThemeFile) + ')' : ''));
        themeCustomMenu.AppendTo(themeMenu, MENU_STRING, 'Custom Theme JSON');

        const draftName = this.main.themes.draftTheme.name;
        creatorMenu.AppendMenuItem(MENU_STRING, CREATOR_BACKGROUND_ID, '1. Set Background Color…');
        creatorMenu.AppendMenuItem(MENU_STRING, CREATOR_INACTIVE_ID,   '2. Set Inactive Segment Color…');
        creatorMenu.AppendMenuItem(MENU_STRING, CREATOR_ACTIVE_ID,     '3. Set Active Segment Color…');
        creatorMenu.AppendMenuItem(MENU_STRING, CREATOR_TEXT_ID,       '4. Set Text / Scale Color…');
        creatorMenu.AppendMenuItem(MENU_STRING, CREATOR_WARNING_ID,    '5. Set Warning / Overload Color…');
        creatorMenu.AppendMenuItem(MENU_STRING, CREATOR_PEAK_ID,       '6. Set Peak Marker Color…');
        creatorMenu.AppendMenuItem(MENU_STRING, CREATOR_SUBPEAK_ID,    '7. Set Sub-Peak Zone Color…');
        creatorMenu.AppendMenuSeparator();
        creatorMenu.AppendMenuItem(MENU_STRING, CREATOR_SAVE_ID,       'Save as Custom Theme…  (draft: "' + draftName + '")');

        const customs = this.main.themes._customThemes;
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

        for (let i = 0; i < DISPLAY_MODE_OPTIONS.length; i++) {
            displayModeMenu.AppendMenuItem(MENU_STRING, DISPLAY_MODE_BASE + i, mark(props.displayMode === DISPLAY_MODE_OPTIONS[i]) + DISPLAY_MODE_OPTIONS[i]);
        }
        for (let i = 0; i < SPECTRUM_BAR_COUNTS.length; i++) {
            spectrumBarsMenu.AppendMenuItem(isSpectrum ? MENU_STRING : MF_GRAYED, SPECTRUM_BARS_BASE + i, mark(props.spectrumBars === SPECTRUM_BAR_COUNTS[i]) + String(SPECTRUM_BAR_COUNTS[i]) + ' bars');
        }
        layoutMenu.AppendMenuItem(MENU_STRING, LAYOUT_BASE,     mark(props.layout === LAYOUT_OPTIONS[0]) + LAYOUT_OPTIONS[0]);
        layoutMenu.AppendMenuItem(MENU_STRING, LAYOUT_BASE + 1, mark(props.layout === LAYOUT_OPTIONS[1]) + LAYOUT_OPTIONS[1]);
        for (let j = 0; j < SEGMENT_COUNTS.length; j++) {
            segmentMenu.AppendMenuItem(MENU_STRING, SEGMENT_BASE + j, mark(props.segments === SEGMENT_COUNTS[j]) + String(SEGMENT_COUNTS[j]));
        }
        extraSegMenu.AppendMenuItem(isSpectrum ? MF_GRAYED : MENU_STRING, EXTRA_SEG_BASE,     mark(props.extraSegments === 0) + 'None');
        extraSegMenu.AppendMenuItem(isSpectrum ? MF_GRAYED : MENU_STRING, EXTRA_SEG_BASE + 1, mark(props.extraSegments === 1) + '+1 dB');
        extraSegMenu.AppendMenuItem(isSpectrum ? MF_GRAYED : MENU_STRING, EXTRA_SEG_BASE + 2, mark(props.extraSegments === 2) + '+1 dB  –  +2 dB');
        extraSegMenu.AppendMenuItem(isSpectrum ? MF_GRAYED : MENU_STRING, EXTRA_SEG_BASE + 3, mark(props.extraSegments === 3) + '+1 dB  –  +2 dB  –  +3 dB');

        for (let k = 0; k < METER_MODE_OPTIONS.length; k++) {
            modeMenu.AppendMenuItem(MENU_STRING, MODE_BASE + k, mark(props.meterMode === METER_MODE_OPTIONS[k]) + METER_MODE_OPTIONS[k]);
        }
        for (let m = 0; m < SPEED_OPTIONS.length; m++) {
            attackMenu.AppendMenuItem(MENU_STRING, ATTACK_BASE + m, mark(props.attack === SPEED_OPTIONS[m]) + SPEED_OPTIONS[m]);
        }
        for (let n = 0; n < SPEED_OPTIONS.length; n++) {
            releaseMenu.AppendMenuItem(MENU_STRING, RELEASE_BASE + n, mark(props.release === SPEED_OPTIONS[n]) + SPEED_OPTIONS[n]);
        }

        const pct = (v) => Math.round((v / 255) * 100) + '%';
        const labels = { Glow: 'LCD Glow', Phosphor: 'Phosphor Mask', Scanlines: 'Scanlines', Reflection: 'LCD Reflection', OnSegments: 'On Segments', OffSegments: 'Off Segments' };
        OPACITY_SLIDER_TARGETS.forEach((target, i) => {
            const toggleId = TOGGLE_BASE + i * TARGET_STRIDE;
            const adjustId = ADJUST_BASE + i * TARGET_STRIDE;
            const toggleKey = OPACITY_TOGGLE_KEYS[target];
            const opacity = props[OPACITY_VALUE_KEYS[target]];
            if (i > 0) appearanceMenu.AppendMenuItem(MENU_SEPARATOR, 0, '');
            if (toggleKey) appearanceMenu.AppendMenuItem(MENU_STRING, toggleId, mark(props[toggleKey]) + labels[target]);
            appearanceMenu.AppendMenuItem(MENU_STRING, adjustId, 'Adjust ' + labels[target] + ' Opacity...  (' + pct(opacity) + ')');
        });

        appearanceMenu.AppendMenuItem(MENU_SEPARATOR, 0, '');
        appearanceMenu.AppendMenuItem(isSpectrum ? MF_GRAYED : MENU_STRING, SHOW_MARKERS_ID, mark(props.showMarkers) + 'Show dB scale && L/R labels');
        appearanceMenu.AppendMenuItem(isSpectrum ? MF_GRAYED : MENU_STRING, MARKER_BORDER_SIZE_ID, 'Set marker border size…  (' + props.markerBorderSize + 'px)');
        appearanceMenu.AppendMenuItem(MENU_STRING, PANEL_PAD_ID, 'Set panel padding…  (' + props.panelPad + 'px)');

        flatModeMenu.AppendMenuItem(isSpectrum ? MF_GRAYED : MENU_STRING, FLAT_ENABLE_ID, mark(props.flatMode) + 'Enable Flat Mode');
        flatModeMenu.AppendMenuItem(MENU_SEPARATOR, 0, '');
        const fillFlag = (props.flatMode && !isSpectrum) ? MENU_STRING : MF_GRAYED;
        flatModeMenu.AppendMenuItem(fillFlag, FLAT_SOLID_ID, mark(props.flatGradient === GRADIENT_STYLE_SOLID) + 'Solid Fill  (no gradient)');
        flatModeMenu.AppendMenuItem(fillFlag, FLAT_STRIP_ID, mark(props.flatGradient === GRADIENT_STYLE_STRIP) + 'Gradient Fill  (LED strip)');
        flatModeMenu.AppendMenuItem(fillFlag, FLAT_CROSS_ID, mark(props.flatGradient === GRADIENT_STYLE_CROSS) + 'Gradient Fill  (cross)');

        themeMenu.AppendTo(menu, MENU_STRING, 'Theme');
        displayModeMenu.AppendTo(menu, MENU_STRING, 'Display Mode');
        layoutMenu.AppendTo(menu, MENU_STRING, 'Layout');
        spectrumBarsMenu.AppendTo(menu, isSpectrum ? MENU_STRING : MF_GRAYED, 'Spectrum Bars');
        segmentMenu.AppendTo(menu, (props.flatMode || isSpectrum) ? MF_GRAYED : MENU_STRING, 'Segment count');
        menu.AppendMenuItem(MENU_SEPARATOR, 0, '');
        appearanceMenu.AppendTo(menu, MENU_STRING, 'Appearance');
        extraSegMenu.AppendTo(menu, (props.flatMode || isSpectrum) ? MF_GRAYED : MENU_STRING, 'Over-range segments');
        flatModeMenu.AppendTo(menu, MENU_STRING, 'Flat Mode');
        menu.AppendMenuItem(MENU_SEPARATOR, 0, '');
        modeMenu.AppendTo(menu, isSpectrum ? MF_GRAYED : MENU_STRING, 'Meter mode');
        attackMenu.AppendTo(menu, MENU_STRING, 'Attack');
        releaseMenu.AppendTo(menu, MENU_STRING, 'Release');
        menu.AppendMenuItem(MENU_STRING, PROFILER_ID, mark(props.profiler) + 'Performance Monitor');
        menu.AppendMenuItem(MENU_STRING, PEAK_HOLD_ID, (props.peakHold ? '✓ ' : '') + 'Peak hold');
        menu.AppendMenuItem(MENU_SEPARATOR, 0, '');
        menu.AppendMenuItem(MENU_STRING, RESET_ID, 'Reset defaults');

        const selected = menu.TrackPopupMenu(x, y);

        if (selected >= THEME_BASE && selected < THEME_BASE + THEME_MENU_MAX) {
            const chosenTheme = names[selected - THEME_BASE];
            this.main.themes.clearPreview();
            this.main.properties.setTheme(chosenTheme);
            this.main.invalidateCaches({ background: true, effect: true });

        } else if (selected === LAYOUT_BASE) {
            this.main.properties.set('layout', LAYOUT_OPTIONS[0]);
            this.main.invalidateCaches({ geometry: true, spectrum: true, background: true, effect: true });
        } else if (selected === LAYOUT_BASE + 1) {
            this.main.properties.set('layout', LAYOUT_OPTIONS[1]);
            this.main.invalidateCaches({ geometry: true, spectrum: true, background: true, effect: true });

        } else if (selected >= SEGMENT_BASE && selected < SEGMENT_BASE + SEGMENT_COUNTS.length) {
            this.main.properties.set('segments', SEGMENT_COUNTS[selected - SEGMENT_BASE]);
            this.main.invalidateCaches({ geometry: true, background: true });

        } else if (selected >= EXTRA_SEG_BASE && selected <= EXTRA_SEG_BASE + EXTRA_SEGMENT_MAX) {
            this.main.properties.set('extraSegments', selected - EXTRA_SEG_BASE);
            this.main.invalidateCaches({ geometry: true, background: true });
            this.main.left.reset();
            this.main.right.reset();

        } else if (selected === PROFILER_ID) {
            this.main.properties.set('profiler', !props.profiler);
            this.main.performance.setEnabled(this.main.properties.values.profiler);

        } else if (selected === PEAK_HOLD_ID) {
            this.main.properties.set('peakHold', !props.peakHold);

        } else if (selected === RESET_ID) {
            this.main.properties.reset();
            this.main.properties._lastFinalizedTheme = this.main.properties.values.theme;
            this.main.properties._extraSegmentsPreFlat = 0;
            this.main.opacitySliderTarget = null;
            this.main.themes.clearPreview();
            this.main.performance.setEnabled(this.main.properties.values.profiler);
            this.main.spectrumAnalyzer.setBarCount(this.main.properties.values.spectrumBars);
            this.main.spectrumAnalyzer.setFftSize(SPECTRUM_FFT_SIZE);
            this.main.invalidateCaches({ geometry: true, spectrum: true, background: true, effect: true });
            this.main.left.reset();
            this.main.right.reset();
            this.main._lastLeftLit = -1; this.main._lastRightLit = -1;
            this.main._lastLeftPeakSeg = -1; this.main._lastRightPeakSeg = -1;

        } else if (selected === FLAT_ENABLE_ID) {
            const turningOn = !props.flatMode;
            this.main.properties.set('flatMode', turningOn);
            if (turningOn) {
                this.main.properties._extraSegmentsPreFlat = props.extraSegments;
                if (props.extraSegments !== 0) {
                    this.main.properties.set('extraSegments', 0);
                    this.main.left.reset();
                    this.main.right.reset();
                }
            } else {
                const restore = this.main.properties._extraSegmentsPreFlat || 0;
                if (restore !== 0) {
                    this.main.properties.set('extraSegments', restore);
                    this.main.left.reset();
                    this.main.right.reset();
                }
                this.main.properties._extraSegmentsPreFlat = 0;
            }
            this.main.invalidateCaches({ geometry: true, background: true });
        } else if (selected === FLAT_SOLID_ID) {
            this.main.properties.set('flatGradient', GRADIENT_STYLE_SOLID);
            this.main.invalidateCaches({ background: true });
        } else if (selected === FLAT_STRIP_ID) {
            this.main.properties.set('flatGradient', GRADIENT_STYLE_STRIP);
            this.main.invalidateCaches({ background: true });
        } else if (selected === FLAT_CROSS_ID) {
            this.main.properties.set('flatGradient', GRADIENT_STYLE_CROSS);
            this.main.invalidateCaches({ background: true });
        } else if (selected === SHOW_MARKERS_ID) {
            this.main.properties.set('showMarkers', !props.showMarkers);
            this.main.invalidateCaches({ geometry: true, background: true, effect: true });
        } else if (selected === MARKER_BORDER_SIZE_ID) {
            let val;
            try { val = utils.InputBox(window.ID, 'Enter marker border size in pixels (' + MARKER_AREA_MIN + '–' + MARKER_AREA_MAX + '):', 'Marker Border Size', String(props.markerBorderSize)); } catch (e) { val = null; }
            if (val !== false && val !== null && val !== undefined) {
                const n = clamp(parseInt(val, 10), MARKER_AREA_MIN, MARKER_AREA_MAX);
                if (!isNaN(n)) {
                    this.main.properties.set('markerBorderSize', n);
                    this.main.invalidateCaches({ geometry: true, background: true, effect: true });
                }
            }

        } else if (selected === PANEL_PAD_ID) {
            let val;
            try { val = utils.InputBox(window.ID, 'Enter panel padding in pixels (' + PANEL_PAD_MIN + '–' + PANEL_PAD_MAX + '):', 'Panel Padding', String(props.panelPad)); } catch (e) { val = null; }
            if (val !== false && val !== null && val !== undefined) {
                const n = clamp(parseInt(val, 10), PANEL_PAD_MIN, PANEL_PAD_MAX);
                if (!isNaN(n)) {
                    this.main.properties.set('panelPad', n);
                    this.main.invalidateCaches({ geometry: true, spectrum: true, background: true, effect: true });
                }
            }

        } else if (selected >= MODE_BASE && selected < MODE_BASE + METER_MODE_OPTIONS.length) {
            this.main.properties.set('meterMode', METER_MODE_OPTIONS[selected - MODE_BASE]);

        } else if (selected >= ATTACK_BASE && selected < ATTACK_BASE + SPEED_OPTIONS.length) {
            this.main.properties.set('attack', SPEED_OPTIONS[selected - ATTACK_BASE]);
        } else if (selected >= RELEASE_BASE && selected < RELEASE_BASE + SPEED_OPTIONS.length) {
            this.main.properties.set('release', SPEED_OPTIONS[selected - RELEASE_BASE]);

        } else if (selected >= DISPLAY_MODE_BASE && selected < DISPLAY_MODE_BASE + DISPLAY_MODE_OPTIONS.length) {
            const newMode = DISPLAY_MODE_OPTIONS[selected - DISPLAY_MODE_BASE];
            this.main.properties.set('displayMode', newMode);
            this.main.invalidateCaches({ geometry: true, spectrum: true, background: true, effect: true });
            if (newMode === 'Spectrum Analyzer') {
                this.main.properties.set('layout', 'Vertical');
            }

        } else if (selected >= SPECTRUM_BARS_BASE && selected < SPECTRUM_BARS_BASE + SPECTRUM_BAR_COUNTS.length) {
            const val = SPECTRUM_BAR_COUNTS[selected - SPECTRUM_BARS_BASE];
            this.main.properties.set('spectrumBars', val);
            this.main.spectrumAnalyzer.setBarCount(val);

        } else if (selected >= TOGGLE_BASE && selected < APPEARANCE_RANGE_END) {
            const offset = selected - TOGGLE_BASE;
            const targetIdx = Math.floor(offset / TARGET_STRIDE);
            const withinTarget = offset % TARGET_STRIDE;
            if (targetIdx >= 0 && targetIdx < OPACITY_SLIDER_TARGETS.length) {
                const target = OPACITY_SLIDER_TARGETS[targetIdx];
                if (withinTarget === 0) {
                    const key = OPACITY_TOGGLE_KEYS[target];
                    if (key) this.main.properties.set(key, !this.main.properties.values[key]);
                } else if (withinTarget === ADJUST_BASE - TOGGLE_BASE) {
                    this.main.opacitySliderTarget = target;
                }
                if (target === 'OffSegments' || target === 'OnSegments') {
                    this.main.invalidateCaches({ background: true });
                } else if (target === 'Phosphor' || target === 'Scanlines' || target === 'Reflection') {
                    this.main.invalidateCaches({ effect: true });
                }
            }

        } else if (selected === THEME_LOAD_FILE_ID) {
            this._doLoadThemeFile();
        } else if (selected === THEME_RELOAD_ID) {
            this._doReloadThemeFile();
        } else if (selected === THEME_SAVE_CUSTOM_ID) {
            this._doSaveThemes(null);
        } else if (selected === THEME_SAVE_ALL_ID) {
            this._doSaveThemes('*');
        } else if (selected === THEME_EXPORT_TEMPLATE_ID) {
            this._doExportTemplate();
        } else if (selected === SET_SAVE_PATH_ID) {
            this._doSetDefaultSavePath();

        } else if (selected === CREATOR_BACKGROUND_ID) {
            this._doColorPicker('Background', 'background');
        } else if (selected === CREATOR_INACTIVE_ID) {
            this._doColorPicker('Inactive Segment', 'inactive');
        } else if (selected === CREATOR_ACTIVE_ID) {
            this._doColorPicker('Active Segment', 'active');
        } else if (selected === CREATOR_TEXT_ID) {
            this._doColorPicker('Text / Scale', 'text');
        } else if (selected === CREATOR_WARNING_ID) {
            this._doColorPicker('Warning / Overload', 'warning');
        } else if (selected === CREATOR_PEAK_ID) {
            this._doColorPicker('Peak Marker', 'peak');
        } else if (selected === CREATOR_SUBPEAK_ID) {
            this._doColorPicker('Sub-Peak Zone', 'subPeak');
        } else if (selected === CREATOR_SAVE_ID) {
            this._doFinalizeTheme();
        } else if (selected >= THEME_REMOVE_CUSTOM_BASE && selected < THEME_REMOVE_CUSTOM_BASE + this.main.themes._customThemes.length) {
            const target = this.main.themes._customThemes[selected - THEME_REMOVE_CUSTOM_BASE];
            if (target) this._doRemoveCustomTheme(target.name);
        }

        if (selected) this.main.invalidate();
        return true;
    }

    _shortPath(p) {
        if (!p) return '';
        const parts = p.replace(/\\/g, '/').split('/');
        return parts.length > 2 ? '…/' + parts[parts.length - 1] : p;
    }

    _doSetDefaultSavePath() {
        let path = null;
        try {
            const result = utils.InputBox(window.ID, 'Enter the full path for the custom theme JSON file\n(e.g. ' + fb.ProfilePath + 'lcd_custom_themes.json):', 'Set Default Save Path', this.main.properties.values.customThemeFile || (fb.ProfilePath + 'lcd_custom_themes.json'));
            if (result !== false && result !== null && result !== undefined && String(result).trim() !== '') {
                path = String(result).trim();
            }
        } catch (e) {}
        if (!path) return;
        this.main.properties.set('customThemeFile', path);
        fb.ShowPopupMessage('Default save path set to:\n' + path, SCRIPT_NAME);
    }

    _doLoadThemeFile() {
        const path = this._promptForFilePath('Load Theme JSON');
        if (!path) return;
        const result = this.main.themes.loadFromFile(path);
        if (result.ok) {
            this.main.properties.set('customThemeFile', path);
            this.main.invalidateCaches({ geometry: true, background: true, effect: true });
            fb.ShowPopupMessage(
                result.summary || ('Loaded ' + result.count + ' theme(s) from:\n' + path),
                SCRIPT_NAME
            );
        } else {
            fb.ShowPopupMessage('Failed to load themes:\n\n' + (result.error || 'Unknown error'), SCRIPT_NAME);
        }
    }

    _doReloadThemeFile() {
        const path = this.main.properties.values.customThemeFile;
        if (!path || path.trim() === '') {
            fb.ShowPopupMessage('No file path stored. Use "Load themes from JSON file…" first.', SCRIPT_NAME);
            return;
        }
        const result = this.main.themes.loadFromFile(path);
        if (result.ok) {
            this.main.invalidateCaches({ geometry: true, background: true, effect: true });
            fb.ShowPopupMessage(
                result.summary || ('Reloaded ' + result.count + ' theme(s).'),
                SCRIPT_NAME
            );
        } else {
            fb.ShowPopupMessage('Failed to reload:\n\n' + (result.error || 'Unknown error'), SCRIPT_NAME);
        }
    }

    _doSaveThemes(which) {
        const label = (which === '*') ? 'Export All Themes' : 'Save Custom Themes';
        const def   = (which === '*') ? 'lcd_all_themes.json' : 'lcd_custom_themes.json';
        const path  = this._promptForSavePath(label, def);
        if (!path) return;
        const result = this.main.themes.saveToFile(path, which);
        if (result.ok) {
            if (which !== '*') this.main.properties.set('customThemeFile', path);
            fb.ShowPopupMessage('Saved ' + result.count + ' theme(s) to:\n' + path, SCRIPT_NAME);
        } else {
            fb.ShowPopupMessage('Save failed:\n\n' + (result.error || 'Unknown error'), SCRIPT_NAME);
        }
    }

    _doExportTemplate() {
        const path = this._promptForSavePath('Export Built-in Theme Template', 'lcd_theme_template.json');
        if (!path) return;
        const result = this.main.themes.exportTemplate(path);
        if (result.ok) {
            fb.ShowPopupMessage(
                'Template exported (' + result.count + ' built-in themes) to:\n' + path +
                '\n\nEdit the JSON, change the "name" fields, adjust colours, then load it back via\nTheme > Custom Theme JSON > Load themes from JSON file.',
                SCRIPT_NAME
            );
        } else {
            fb.ShowPopupMessage('Export failed:\n\n' + (result.error || 'Unknown error'), SCRIPT_NAME);
        }
    }
}

// ---------------------------------------------------------------------------
// MAIN APPLICATION CORE
// ---------------------------------------------------------------------------

class LCDPeakMeter {
    constructor() {
        this.properties = new PropertyManager();
        this.themes = new ThemeManager();

        const _persistedFile = this.properties.values.customThemeFile;
        const customThemeFile = (_persistedFile && _persistedFile.trim() !== '')
            ? _persistedFile
            : fb.ProfilePath + 'lcd_custom_themes.json';
        this.properties.set('customThemeFile', customThemeFile);
        try {
            const result = this.themes.loadFromFile(customThemeFile);
            if (!result.ok) {
                if (result.error && result.error.indexOf('File not found') === -1) {
                    console.log('[LCD Peak Meter] Custom theme JSON: ' + result.error);
                }
            }
        } catch (e) {
            console.log('[LCD Peak Meter] Custom theme startup load error: ' + String(e.message || e));
        }

        if (this.properties.values.theme === '~Preview') {
            const fallback = this.properties._lastFinalizedTheme;
            this.themes.clearPreview();
            this.properties.setTheme(fallback && this.themes.themeMap[fallback] ? fallback : 'Pioneer Amber');
        }

        if (this.themes.names().indexOf(this.properties.values.theme) === -1) {
            this.properties.setTheme('Pioneer Amber');
        }
        this.audio = new AudioEngine();
        this.left = new MeterChannel();
        this.right = new MeterChannel();
        this.geometry = new GeometryCache();
        this.segments = new SegmentRenderer();
        this.glow = new GlowRenderer();
        this.phosphor = new PhosphorRenderer();
        this.scanlines = new ScanlineRenderer();
        this.reflection = new ReflectionRenderer();
        this.scale = new ScaleRenderer();
        this.labels = new LabelRenderer();
        this.effectCache = new EffectLayerCache();
        this.meterBgCache = new MeterBackgroundCache();
        this.spectrumGeometry = new SpectrumGeometryCache();
        this.spectrumAnalyzer = new SpectrumAnalyzer();
        this.spectrumRenderer = new SpectrumRenderer();
        this.performance = new PerformanceMonitor();
        this.performance.setEnabled(this.properties.values.profiler);
        this.spectrumAnalyzer.setBarCount(this.properties.values.spectrumBars);
        this.menu = new MenuManager(this);
        this.width = window.Width;
        this.height = window.Height;
        this._lastSpectrumTick = Date.now();
        this._spectrumNextRunAt = Date.now();
        this.audioTimer = window.SetInterval(() => this.audioTick(), AUDIO_TIMER_MS);
        this.spectrumTimer = window.SetInterval(() => this.spectrumTick(), SPECTRUM_TIMER_MS);
        this.opacitySliderTarget = null;
        this.opacityAccessors = {};
        OPACITY_SLIDER_TARGETS.forEach((target) => {
            const key = OPACITY_VALUE_KEYS[target];
            this.opacityAccessors[target] = {
                get: () => this.properties.values[key],
                set: (v) => this.properties.set(key, clamp(Math.round(v), 0, 255))
            };
        });
        this._lastLeftLit = -1; this._lastRightLit = -1; this._lastLeftPeakSeg = -1; this._lastRightPeakSeg = -1;
    }
    audioTick() {
        const p = this.properties.values;
        if (p.displayMode === 'Spectrum Analyzer') return;
        const tickStart = this.performance.beginTick();
        const attack = ballisticRate(p.attack, true), release = ballisticRate(p.release, false);
        const audioStart = this.performance.enabled ? Date.now() : 0;
        const maxDb  = p.extraSegments || 0;
        const levels = this.audio.update(attack, release, maxDb);
        const audioMs = this.performance.enabled ? Math.max(0, Date.now() - audioStart) : 0;
        const mode = p.meterMode;
        const leftLevel = mode === 'Peak' ? levels.leftPeak : levels.leftRms;
        const rightLevel = mode === 'Peak' ? levels.rightPeak : levels.rightRms;
        const leftIndicator = mode === 'Peak + RMS' ? levels.leftPeak : leftLevel;
        const rightIndicator = mode === 'Peak + RMS' ? levels.rightPeak : rightLevel;
        const now = Date.now();
        this.left.update(leftLevel, leftIndicator, p.peakHold, now, maxDb);
        this.right.update(rightLevel, rightIndicator, p.peakHold, now, maxDb);
        const geomSegments = p.flatMode ? 1 : (p.segments + (p.extraSegments || 0));
        const geometry = this.geometry.get(this.width, this.height, p.layout, geomSegments, this.themes.get(p.theme), p.markerBorderSize, p.extraSegments, p.showMarkers, p.panelPad);
        const segmentCount = geometry.segmentCount, channel0 = geometry.channels[0], pixelSpan = geometry.vertical ? channel0.h : channel0.w;
        let leftLit, rightLit, leftPeakSeg, rightPeakSeg;
        if (p.flatMode) {
            leftLit = Math.round(this.left.value * pixelSpan);
            rightLit = Math.round(this.right.value * pixelSpan);
            leftPeakSeg = Math.round(this.left.peak * pixelSpan);
            rightPeakSeg = Math.round(this.right.peak * pixelSpan);
        } else {
            const baseCount = Math.max(0, segmentCount - (p.extraSegments || 0));
            leftLit  = Math.min(Math.round(this.left.value  * baseCount), baseCount);
            rightLit = Math.min(Math.round(this.right.value * baseCount), baseCount);
            leftPeakSeg  = clamp(Math.ceil(this.left.peak  * segmentCount) - 1, 0, segmentCount - 1);
            rightPeakSeg = clamp(Math.ceil(this.right.peak * segmentCount) - 1, 0, segmentCount - 1);
        }
        const changed = leftLit !== this._lastLeftLit || rightLit !== this._lastRightLit || leftPeakSeg !== this._lastLeftPeakSeg || rightPeakSeg !== this._lastRightPeakSeg;
        this._lastLeftLit = leftLit; this._lastRightLit = rightLit; this._lastLeftPeakSeg = leftPeakSeg; this._lastRightPeakSeg = rightPeakSeg;
        if (changed) this.invalidate();
        this.performance.endTick(tickStart, audioMs, 0);
    }
    spectrumTick() {
        const p = this.properties.values;
        if (p.displayMode !== 'Spectrum Analyzer') return;
        const now = Date.now();
        if (now < this._spectrumNextRunAt) return;
        const shortAxis = Math.min(this.width, this.height);
        const gateMs = shortAxis >= SPECTRUM_THROTTLE_FULL_PX ? SPECTRUM_FPS_FULL_MS : shortAxis >= SPECTRUM_THROTTLE_MEDIUM_PX ? SPECTRUM_FPS_MEDIUM_MS : SPECTRUM_FPS_LOW_MS;
        const fftSize = shortAxis >= SPECTRUM_THROTTLE_FULL_PX ? SPECTRUM_FFT_SIZE_FULL : shortAxis >= SPECTRUM_THROTTLE_MEDIUM_PX ? SPECTRUM_FFT_SIZE_MEDIUM : SPECTRUM_FFT_SIZE_LOW;
        if (fftSize !== this.spectrumAnalyzer._fftN) this.spectrumAnalyzer.setFftSize(fftSize);
        this._spectrumNextRunAt = Math.max(this._spectrumNextRunAt + gateMs, now);
        const tickStart = this.performance.beginTick();
        const attack = ballisticRate(p.attack, true), release = ballisticRate(p.release, false);
        const elapsed = Math.max((now - this._lastSpectrumTick) / 1000, 0.001);
        this._lastSpectrumTick = now;
        if (this.spectrumAnalyzer.barCount !== p.spectrumBars) this.spectrumAnalyzer.setBarCount(p.spectrumBars);
        const fftStart = this.performance.enabled ? Date.now() : 0;
        this.spectrumAnalyzer.update(attack, release, elapsed);
        const fftMs = this.performance.enabled ? Math.max(0, Date.now() - fftStart) : 0;
        if (this.performance.enabled) { this.performance.spectrumTierMs = gateMs; this.performance.spectrumFftSize = fftSize; }
        if (this.spectrumAnalyzer.isDirty) this.invalidate(); else this.performance.noteSpectrumClean();
        this.performance.endTick(tickStart, 0, fftMs);
    }
    invalidate() { this.performance.noteRepaint(); window.Repaint(); }
    invalidateCaches(opts) {
        if (opts.geometry) this.geometry.invalidate();
        if (opts.spectrum) this.spectrumGeometry.invalidate();
        if (opts.background) this.meterBgCache.invalidate();
        if (opts.effect) this.effectCache.dispose();
        if (opts.repaint) this.invalidate();
    }
    onSize() {
        this.width = window.Width; this.height = window.Height;
        this.invalidateCaches({ geometry: true, spectrum: true, background: true, effect: true });
        this.invalidate();
    }
    onPaint(gr) {
        const paintStart = this.performance.beginPaint();
        const props = this.properties.values;
        const theme = this.themes.get(props.theme);
        const layout = props.layout;
        this.width  = window.Width;
        this.height = window.Height;
        const width = this.width, height = this.height;
        gr.FillSolidRect(0, 0, width, height, theme.background);
        if (width < 30 || height < 30) { this.performance.endPaint(paintStart); return; }

        let geometry;
        let activeArea;

        if (props.displayMode === 'Spectrum Analyzer') {
            geometry = this.spectrumGeometry.get(width, height, layout, props.spectrumBars, props.panelPad);
            activeArea = {
                x: geometry.pad,
                y: geometry.pad,
                w: Math.max(0, width  - (geometry.pad * 2)),
                h: Math.max(0, height - (geometry.pad * 2))
            };
            this.spectrumRenderer.draw(gr, geometry, this.spectrumAnalyzer.levels, this.spectrumAnalyzer.peaks, props.spectrumBars, theme, props.onSegmentOpacity, props.offSegmentOpacity, props.peakHold);
        } else {
            const geomSegments = props.flatMode ? 1 : (props.segments + (props.extraSegments || 0));
            geometry = this.geometry.get(width, height, layout, geomSegments, theme, props.markerBorderSize, props.extraSegments, props.showMarkers, props.panelPad);
            
            if (geometry.vertical) {
                activeArea = {
                    x: geometry.pad + geometry.scaleWidth,
                    y: geometry.pad,
                    w: Math.max(0, width - (geometry.pad + geometry.scaleWidth) - geometry.pad),
                    h: Math.max(0, height - (geometry.pad * 2) - geometry.footer)
                };
            } else {
                activeArea = {
                    x: geometry.pad + geometry.labelWidth,
                    y: geometry.pad,
                    w: Math.max(0, width - (geometry.pad + geometry.labelWidth) - geometry.pad),
                    h: Math.max(0, height - (geometry.pad * 2) - geometry.footer)
                };
            }

            const bgBitmap = this.meterBgCache.get(width, height, geometry, theme, layout, props.flatMode, props.flatGradient, props.offSegmentOpacity, props.showMarkers, this.scale, this.labels, this.segments);
            if (this.performance.enabled) this.performance.bgCacheHit = this.meterBgCache.lastHit;
            if (bgBitmap) {
                gr.DrawImage(bgBitmap, 0, 0, width, height, 0, 0, width, height);
            } else {
                gr.FillSolidRect(0, 0, width, height, theme.background);
                if (props.flatMode) {
                    const offFill = withAlpha(theme.inactive, props.offSegmentOpacity);
                    gr.FillSolidRect(geometry.channels[0].x, geometry.channels[0].y, geometry.channels[0].w, geometry.channels[0].h, offFill);
                    gr.FillSolidRect(geometry.channels[1].x, geometry.channels[1].y, geometry.channels[1].w, geometry.channels[1].h, offFill);
                } else {
                    this.segments.draw(gr, geometry.channels[0], 0, 0, geometry.vertical, theme, geometry, 0, props.offSegmentOpacity);
                    this.segments.draw(gr, geometry.channels[1], 0, 0, geometry.vertical, theme, geometry, 0, props.offSegmentOpacity);
                }
                if (props.showMarkers) {
                    this.scale.draw(gr, geometry, width, height, theme, layout);
                    this.labels.draw(gr, geometry, theme, width, height);
                }
            }
            
            const energy = Math.max(this.left.value, this.right.value);
            const dynamicMult = 0.5 + energy * 1.5;
            if (props.flatMode) {
                const flatDraw = props.flatGradient === GRADIENT_STYLE_SOLID
                    ? (g, ch, lv, pk) => this.segments.drawFlat(g, ch, lv, pk, geometry.vertical, theme, props.onSegmentOpacity, 0)
                    : (g, ch, lv, pk) => this.segments.drawFlatGradient(g, ch, lv, pk, geometry.vertical, theme, props.onSegmentOpacity, 0, props.flatGradient);
                flatDraw(gr, geometry.channels[0], this.left.value, this.left.peak);
                flatDraw(gr, geometry.channels[1], this.right.value, this.right.peak);
                if (props.showGlow) {
                    this.glow.drawFlat(gr, geometry.channels[0], this.left.value, this.left.peak, geometry.vertical, theme, props.glowOpacity, dynamicMult);
                    this.glow.drawFlat(gr, geometry.channels[1], this.right.value, this.right.peak, geometry.vertical, theme, props.glowOpacity, dynamicMult);
                }
            } else {
                this.segments.draw(gr, geometry.channels[0], this.left.value, this.left.peak, geometry.vertical, theme, geometry, props.onSegmentOpacity, 0);
                this.segments.draw(gr, geometry.channels[1], this.right.value, this.right.peak, geometry.vertical, theme, geometry, props.onSegmentOpacity, 0);
                if (props.showGlow) {
                    this.glow.draw(gr, geometry.channels[0], this.left.value, this.left.peak, geometry, geometry.vertical, theme, props.glowOpacity, dynamicMult);
                    this.glow.draw(gr, geometry.channels[1], this.right.value, this.right.peak, geometry.vertical, theme, props.glowOpacity, dynamicMult);
                }
            }
        }

        const overlayLayer = this.effectCache.getOverlayLayer(
            width, height, theme, props.theme, 
            this.phosphor, this.scanlines, this.reflection, 
            activeArea, geometry.vertical, 
            props.showPhosphor, props.phosphorOpacity, 
            props.showScanlines, props.scanlineOpacity, 
            props.showReflection, props.reflectionOpacity
        );
        if (overlayLayer) gr.DrawImage(overlayLayer, 0, 0, width, height, 0, 0, width, height);
        
        this.drawOpacitySlider(gr, width, height);
        this.performance.draw(gr, width, height);
        this.performance.endPaint(paintStart);
    }
    drawOpacitySlider(gr, width, height) {
        if (!this.opacitySliderTarget) return;
        const acc = this.opacityAccessors[this.opacitySliderTarget];
        if (!acc) return;
        const value = acc.get();
        const barW = Math.min(SLIDER_BAR_MAX_WIDTH, width * 0.8), barH = SLIDER_BAR_HEIGHT;
        const bx = Math.floor((width - barW) / 2), by = height - 18;
        if (by < 0) return;
        const white = colour(255, 255, 255);
        gr.FillSolidRect(bx, by, barW, barH, withAlpha(white, 60));
        gr.FillSolidRect(bx, by, Math.floor(barW * (value / 255)), barH, withAlpha(white, 180));
        const sliderFont = fonts.get('Segoe UI', 16, 0);
        const label = this.opacitySliderTarget + ': ' + value;
        const lSize = gr.MeasureString(label, sliderFont, 0, 0, width, 30);
        const lx = Math.max(0, (width - lSize.Width) / 2);
        const ly = by - lSize.Height - 4;
        if (ly >= 0) gr.DrawString(label, sliderFont, withAlpha(white, 220), lx, ly, lSize.Width, lSize.Height);
    }
    onMouseWheel(step) {
        if (!this.opacitySliderTarget) return false;
        const acc = this.opacityAccessors[this.opacitySliderTarget];
        if (!acc) return false;
        const delta = step > 0 ? OPACITY_STEP : -OPACITY_STEP;
        acc.set(clamp(acc.get() + delta, 0, 255));
        const t = this.opacitySliderTarget;
        if (t === 'OffSegments' || t === 'OnSegments') this.invalidateCaches({ background: true });
        else if (t === 'Phosphor' || t === 'Scanlines' || t === 'Reflection') this.invalidateCaches({ effect: true });
        this.invalidate();
        return true;
    }
    onMouseLbtnUp() {
        if (!this.opacitySliderTarget) return false;
        this.opacitySliderTarget = null;
        this.invalidate();
        return true;
    }
}

// ---------------------------------------------------------------------------
// SMP CALLBACKS
// ---------------------------------------------------------------------------

const meter = new LCDPeakMeter();
function on_paint(gr) { meter.onPaint(gr); }
function on_size() { meter.onSize(); }
function on_mouse_rbtn_up(x, y) { return meter.menu.show(x, y); }
function on_mouse_wheel(step) { return meter.onMouseWheel(step); }
function on_mouse_lbtn_up(x, y) { return meter.onMouseLbtnUp(); }
function on_script_unload() {
    try { if (meter && meter.audioTimer)    window.ClearInterval(meter.audioTimer);    } catch (e) {}
    try { if (meter && meter.spectrumTimer) window.ClearInterval(meter.spectrumTimer); } catch (e) {}
    try { if (meter && meter.effectCache)   meter.effectCache.dispose();                } catch (e) {}
    try { if (meter && meter.meterBgCache)  meter.meterBgCache.dispose();               } catch (e) {}
    try { fonts.dispose(); } catch (e) {}
}