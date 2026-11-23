'use strict';

		      // -============ AUTHOR L.E.D. ===========- \\
		     // -======= SMP 64bit Peakmeter V2.6 =======- \\
		    // -===== Peakmeter + Spectrum Analyzer ======- \\
 
    // ===================*** Foobar2000 64bit ***================== \\
   // ======= For Spider Monkey Panel 64bit, author: marc2003 ======= \\
  // ====== ==================================================  ====== \\

/* 
 * Custom License for foobar2000 Themes
 * Copyright (c) 2026 [L.E.D.]
 * Allowed: Non-commercial use and modification.
 * Prohibited: Paid products/themes, subscriptions, or cloud-bundled services.
 */

window.DefineScript('SMP 64bit LCD Peak Meter VFX', { 
    author: 'L.E.D.', 
    version: '2.6', 
    features: { grab_focus: true } 
});

if ('DrawMode' in window) window.DrawMode = 0; // 0 = GDI+, 1 = Direct2D
window.DlgCode  = 0x0004; // DLGC_WANTALLKEYS

const HAS_AUDIO_CHUNK = typeof fb.GetAudioChunk === 'function';

// ============================================================================================
// 1. CONSTANTS, MENU BUILDER & SYSTEM SCALING
// ============================================================================================
class MeterConstants {
    static SCRIPT_NAME = 'LCD Peak Meter VFX';
    static VERSION     = '2.6';

    static LIFECYCLE = { BOOT: 0, INIT: 1, LIVE: 2, SHUTDOWN: 3 };

    static VK_CONTROL = 0x11;
    static VK_LEFT    = 0x25;
    static VK_UP      = 0x26;
    static VK_RIGHT   = 0x27;
    static VK_DOWN    = 0x28;

    static MIN_DB = -60;
    static DEFAULT_SEGMENTS = 60;
    static SEGMENT_COUNTS = [15, 30, 45, 60, 75, 90];
    static EXTRA_SEGMENT_MAX = 3;
    static LAYOUT_OPTIONS = ['Vertical', 'Horizontal'];
    static METER_MODE_OPTIONS = ['Peak', 'RMS', 'Peak + RMS'];
    static SPEED_OPTIONS = ['Slow', 'Medium', 'Fast'];
    static QUALITY_PRESET_OPTIONS = ['Low', 'Balanced', 'High'];
    static METER_RANGE_OPTIONS = [-60, -48, -36];
    static PEAK_HOLD_MIN_MS = 100;
    static PEAK_HOLD_MAX_MS = 10000;

    static DISPLAY_MODE_OPTIONS = ['Peak Meter', 'Spectrum Analyzer'];
    static SPECTRUM_BAR_COUNTS = [10, 20, 30, 40, 50, 60, 70, 80, 100, 120];
    static DEFAULT_SPECTRUM_BARS = 30;
    static SPECTRUM_FFT_SIZE = 2048;
    static SPECTRUM_FFT_SIZE_FULL   = 2048;
    static SPECTRUM_FFT_SIZE_MEDIUM = 1024;
    static SPECTRUM_FFT_SIZE_LOW    = 512;
    static SPECTRUM_MIN_DB = -70;
    static SPECTRUM_MIN_FREQ = 30;
    static SPECTRUM_MAX_FREQ_CAP = 18000;
    static SPECTRUM_BAR_GAP_RATIO = 0.25;
    static SPECTRUM_PEAK_HOLD_MS = 900;
    static SPECTRUM_PEAK_FALL_PER_SECOND = 1.1;

    static MASTER_TIMER_MS = 33;
    static SPECTRUM_FPS_FULL_MS   = 33;
    static SPECTRUM_FPS_MEDIUM_MS = 50;
    static SPECTRUM_FPS_LOW_MS    = 67;

    static SPECTRUM_DIRTY_QUANTISE  = 4096;
    static SPECTRUM_DIRTY_THRESHOLD = 12;
    static PEAK_HOLD_MS = 1400;
    static PEAK_FALL_DB_PER_SECOND = 18;

    static DB_SCALE_TICKS = [
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

    static OPACITY_STEP = 5;
    static OPACITY_SLIDER_TARGETS = [
        'Glow', 'Phosphor', 'Scanlines', 'Reflection', 'OnSegments', 'OffSegments'
    ];

    static OPACITY_TOGGLE_KEYS = {
        Glow: 'showGlow',
        Phosphor: 'showPhosphor',
        Scanlines: 'showScanlines',
        Reflection: 'showReflection'
    };

    static OPACITY_VALUE_KEYS = {
        Glow: 'glowOpacity',
        Phosphor: 'phosphorOpacity',
        Scanlines: 'scanlineOpacity',
        Reflection: 'reflectionOpacity',
        OnSegments: 'onSegmentOpacity',
        OffSegments: 'offSegmentOpacity'
    };

    static WARNING_ZONE_THRESHOLD = 0.89;
    static SUBPEAK_ZONE_FRACTION  = 0.15;
    static SUBPEAK_ZONE_THRESHOLD = 0.89 - 0.15;

    // User-selectable gradient modes (0 to 5)
    static GRADIENT_STYLE_SOLID          = 0;
    static GRADIENT_STYLE_STRIP          = 1;
    static GRADIENT_STYLE_CROSS          = 2;
    static GRADIENT_STYLE_CROSS_VARIANT  = 3;
    static GRADIENT_STYLE_CROSS_BLEND    = 4;
    static GRADIENT_STYLE_FULL           = 5;
    static GRADIENT_STYLE_MIN            = 0;
    static GRADIENT_STYLE_MAX            = 5;

    // Internal sub-pass shader primitives
    static GRADIENT_STYLE_ACTIVE_SWEEP   = 6;
    static GRADIENT_STYLE_SUBPEAK_SWEEP  = 7;
    static GRADIENT_STYLE_WARNING_SWEEP  = 8;
    static GRADIENT_STYLE_ACTIVE_BEVEL   = 9;
    static GRADIENT_STYLE_SUBPEAK_BEVEL  = 10;
    static GRADIENT_STYLE_WARNING_BEVEL  = 11;

    static GLOW_ITERATIONS = 2;
    static GLOW_ALPHA_MULT = 0.65;
    static REFLECTION_HEIGHT_RATIO = 0.45;

    static TEXT_LEFT_MIDDLE   = 0x00000004 | 0x00000020 | 0x00000100;
    static TEXT_CENTER_MIDDLE = 0x00000001 | 0x00000004 | 0x00000020 | 0x00000100;
    static TEXT_RIGHT_MIDDLE  = 0x00000002 | 0x00000004 | 0x00000020 | 0x00000100;
    static TEXT_CENTER_TOP    = 0x00000001 | 0x00000020 | 0x00000100;

    static BEZEL_EXTS = ['.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp'];
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

let panelState = MeterConstants.LIFECYCLE.BOOT;

const SYSTEM_DPI = (typeof window.DPI === 'number' && window.DPI > 0) ? window.DPI : 96;
const DPI_SCALE  = SYSTEM_DPI / 96;

function scaleDpi(px) {
    return Math.round(px * DPI_SCALE);
}

function getEffectiveSpectrumSegments(span, requestedSegs) {
    const gap = Math.max(1, scaleDpi(1));
    const maxFit = Math.max(1, Math.floor((span + gap) / (1 + gap)));
    return Math.max(1, Math.min(Math.max(1, requestedSegs), maxFit));
}

function getProfilePath() {
    let p = fb.ProfilePath || '';
    if (p && !p.endsWith('\\') && !p.endsWith('/')) p += '\\';
    return p;
}

const PROFILE_BASE = getProfilePath();

window.MinWidth  = scaleDpi(80);
window.MinHeight = scaleDpi(40);

// Logical (96-DPI) setting bounds + scaled layout constants
const MARKER_AREA_LOGICAL_MIN      = 1;
const MARKER_AREA_LOGICAL_MAX      = 60;
const DEFAULT_MARKER_LOGICAL       = 14;
const PANEL_PAD_LOGICAL_MIN        = 0;
const PANEL_PAD_LOGICAL_MAX        = 30;
const DEFAULT_PANEL_PAD_LOGICAL    = 4;
const SIDE_PAD_LOGICAL_MAX         = 100;
const DEFAULT_SIDE_PAD_LOGICAL     = 4;

const SPECTRUM_MIN_BAR_WIDTH       = Math.max(1, scaleDpi(2));
const SPECTRUM_MIN_BAR_HEIGHT      = Math.max(1, scaleDpi(2));
const SPECTRUM_THROTTLE_FULL_PX    = scaleDpi(150);
const SPECTRUM_THROTTLE_MEDIUM_PX  = scaleDpi(80);
const MIN_VERTICAL_SEGMENT_HEIGHT  = Math.max(3, scaleDpi(5));
const MIN_HORIZONTAL_SEGMENT_WIDTH = Math.max(3, scaleDpi(5));
const MIN_SEGMENT_GAP              = Math.max(1, scaleDpi(1));
const LABEL_GAP                    = Math.max(1, scaleDpi(1));
const FLAT_PEAK_THICKNESS          = Math.max(2, scaleDpi(3));
const GLOW_STEP_PADDING            = Math.max(2, scaleDpi(5));
const SCANLINE_SPACING             = Math.max(2, scaleDpi(3));
const SLIDER_BAR_MAX_WIDTH         = scaleDpi(220);
const SLIDER_BAR_HEIGHT            = scaleDpi(6);

// ============================================================================================
// 2. MATH & FAST COLOR CONVERSIONS
// ============================================================================================
class GdiUtils {
    static clamp(value, min, max) {
        if (min > max) max = min;
        const n = Number(value);
        return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min;
    }

    static lerp(start, end, amount) {
        return start + (end - start) * amount;
    }

    static dbToMeter(db, maxDb, minDb) {
        const top = maxDb ?? 0;
        const floor = minDb ?? MeterConstants.MIN_DB;
        const range = top - floor;
        if (range <= 0) return 0;
        return this.clamp((db - floor) / range, 0, 1);
    }

    static colour(r, g, b) {
        const cr = r < 0 ? 0 : r > 255 ? 255 : r | 0;
        const cg = g < 0 ? 0 : g > 255 ? 255 : g | 0;
        const cb = b < 0 ? 0 : b > 255 ? 255 : b | 0;
        return (0xFF000000 | (cr << 16) | (cg << 8) | cb) >>> 0;
    }

    static withAlpha(rgb, alpha) {
        const clampedA = this.clamp(Math.round(alpha), 0, 255);
        return ((clampedA << 24) | (rgb & 0x00FFFFFF)) >>> 0;
    }

    static interpolateColour(first, second, amount) {
        return this.colour(
            this.lerp((first  >>> 16) & 255, (second >>> 16) & 255, amount),
            this.lerp((first  >>>  8) & 255, (second >>>  8) & 255, amount),
            this.lerp( first          & 255,  second          & 255, amount)
        );
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

// Segment Color Mapping Cache
const _segmentTableCache = new Map();

function getCachedSegmentColourTable(theme, segmentCount, extraSegments, minDb) {
    const extras = extraSegments || 0;
    const floor = minDb ?? MeterConstants.MIN_DB;
    const key = `${theme.name}|${theme.active}|${theme.subPeak}|${theme.warning}|${theme.text}|${segmentCount}|${extras}|${floor}`;
    
    let table = _segmentTableCache.get(key);
    if (table) return table;

    const ratio0dB = extras > 0 ? GdiUtils.clamp(-floor / (extras - floor), 0, 1) : 1.0;
    const base = Math.max(1, Math.round(segmentCount * ratio0dB));
    table = new Array(segmentCount);

    for (let i = 0; i < segmentCount; i++) {
        if (i >= base) {
            table[i] = theme.warning;
        } else {
            const progress = (i + 1) / base;
            table[i] = progress > MeterConstants.WARNING_ZONE_THRESHOLD
                ? theme.warning
                : progress > MeterConstants.SUBPEAK_ZONE_THRESHOLD
                    ? GdiUtils.interpolateColour(theme.subPeak, theme.text, progress * 0.28)
                    : GdiUtils.interpolateColour(theme.active, theme.text, progress * 0.28);
        }
    }

    if (_segmentTableCache.size > 48) {
        _segmentTableCache.delete(_segmentTableCache.keys().next().value);
    }
    _segmentTableCache.set(key, table);
    return table;
}

// ============================================================================================
// 3. GRADIENT RASTERIZER & 2D FOREGROUND TEXTURE CACHES
// ============================================================================================
function buildGradientColourStrip(theme, span, onAlpha, style) {
    const actR = (theme.active  >>> 16) & 255, actG = (theme.active  >>> 8) & 255, actB = theme.active  & 255;
    const txtR = (theme.text    >>> 16) & 255, txtG = (theme.text    >>> 8) & 255, txtB = theme.text    & 255;
    const wrnR = (theme.warning >>> 16) & 255, wrnG = (theme.warning >>> 8) & 255, wrnB = theme.warning & 255;
    const subR = (theme.subPeak >>> 16) & 255, subG = (theme.subPeak >>> 8) & 255, subB = theme.subPeak  & 255;
    const dimR = Math.round(actR * 0.40), dimG = Math.round(actG * 0.40), dimB = Math.round(actB * 0.40);
    const n = Math.max(1, span);
    const quant = style === MeterConstants.GRADIENT_STYLE_STRIP ? GdiUtils.clamp(Math.round(span * 0.2), 6, 20) : 0;
    const strip = new Array(n + 1);

    if (style === MeterConstants.GRADIENT_STYLE_ACTIVE_BEVEL || 
        style === MeterConstants.GRADIENT_STYLE_SUBPEAK_BEVEL || 
        style === MeterConstants.GRADIENT_STYLE_WARNING_BEVEL) {
        let br = actR, bg = actG, bb = actB;
        if (style === MeterConstants.GRADIENT_STYLE_SUBPEAK_BEVEL) { br = subR; bg = subG; bb = subB; }
        else if (style === MeterConstants.GRADIENT_STYLE_WARNING_BEVEL) { br = wrnR; bg = wrnG; bb = wrnB; }
        for (let i = 0; i <= n; i++) {
            const t = i / Math.max(1, n - 1);
            const f = 1.12 - 0.55 * t;
            strip[i] = GdiUtils.withAlpha(GdiUtils.colour(Math.round(br * f), Math.round(bg * f), Math.round(bb * f)), onAlpha);
        }
        return strip;
    }

    if (style === MeterConstants.GRADIENT_STYLE_ACTIVE_SWEEP || 
        style === MeterConstants.GRADIENT_STYLE_SUBPEAK_SWEEP || 
        style === MeterConstants.GRADIENT_STYLE_WARNING_SWEEP) {
        let br = actR, bg = actG, bb = actB;
        if (style === MeterConstants.GRADIENT_STYLE_SUBPEAK_SWEEP) { br = subR; bg = subG; bb = subB; }
        else if (style === MeterConstants.GRADIENT_STYLE_WARNING_SWEEP) { br = wrnR; bg = wrnG; bb = wrnB; }
        const dr = Math.round(br * 0.40), dg = Math.round(bg * 0.40), db = Math.round(bb * 0.40);
        for (let i = 0; i <= n; i++) {
            const t = i / Math.max(1, n - 1);
            let r, g, b;
            if (t < 0.5) {
                const u = t / 0.5;
                r = Math.round(GdiUtils.lerp(dr, br, u));
                g = Math.round(GdiUtils.lerp(dg, bg, u));
                b = Math.round(GdiUtils.lerp(db, bb, u));
            } else {
                const u = (t - 0.5) / 0.5;
                r = Math.round(GdiUtils.lerp(br, txtR, u * 0.4));
                g = Math.round(GdiUtils.lerp(bg, txtG, u * 0.4));
                b = Math.round(GdiUtils.lerp(bb, txtB, u * 0.4));
            }
            strip[i] = GdiUtils.withAlpha(GdiUtils.colour(r, g, b), onAlpha);
        }
        return strip;
    }

    for (let i = 0; i <= n; i++) {
        let pos = i / Math.max(1, n - 1);
        if (quant > 0) pos = Math.round(pos * quant) / quant;

        let r, g, b;
        if (pos >= MeterConstants.WARNING_ZONE_THRESHOLD) {
            const t = (pos - MeterConstants.WARNING_ZONE_THRESHOLD) / (1 - MeterConstants.WARNING_ZONE_THRESHOLD);
            const tt = t * t * (3 - 2 * t);
            r = Math.round(GdiUtils.lerp(subR, wrnR, tt));
            g = Math.round(GdiUtils.lerp(subG, wrnG, tt));
            b = Math.round(GdiUtils.lerp(subB, wrnB, tt));
        } else if (pos >= MeterConstants.SUBPEAK_ZONE_THRESHOLD) {
            const t = (pos - MeterConstants.SUBPEAK_ZONE_THRESHOLD) / (MeterConstants.WARNING_ZONE_THRESHOLD - MeterConstants.SUBPEAK_ZONE_THRESHOLD);
            const tt = t * t * (3 - 2 * t);
            r = Math.round(GdiUtils.lerp(actR, subR, tt));
            g = Math.round(GdiUtils.lerp(actG, subG, tt));
            b = Math.round(GdiUtils.lerp(actB, subB, tt));
        } else {
            const norm = pos / MeterConstants.SUBPEAK_ZONE_THRESHOLD;
            if (norm < 0.5) {
                const t = norm / 0.5;
                r = Math.round(GdiUtils.lerp(dimR, actR, t));
                g = Math.round(GdiUtils.lerp(dimG, actG, t));
                b = Math.round(GdiUtils.lerp(dimB, actB, t));
            } else {
                const t = (norm - 0.5) / 0.5;
                r = Math.round(GdiUtils.lerp(actR, txtR, t * 0.4));
                g = Math.round(GdiUtils.lerp(actG, txtG, t * 0.4));
                b = Math.round(GdiUtils.lerp(actB, txtB, t * 0.4));
            }
        }
        strip[i] = GdiUtils.withAlpha(GdiUtils.colour(r, g, b), onAlpha);
    }
    return strip;
}

class GradientStripCache {
    #map = new Map();
    #bmpMap = new Map();

    get(theme, span, onAlpha, style) {
        const sig = `${theme.active}|${theme.text}|${theme.warning}|${theme.subPeak}|${span}|${onAlpha}|${style}`;
        let strip = this.#map.get(sig);
        if (strip) return strip;

        strip = buildGradientColourStrip(theme, span, onAlpha, style);
        if (this.#map.size >= 32) {
            const oldest = this.#map.keys().next().value;
            this.#map.delete(oldest);
        }
        this.#map.set(sig, strip);
        return strip;
    }

    getBitmap(theme, span, onAlpha, style, isVertical) {
        const sig = `${theme.active}|${theme.text}|${theme.warning}|${theme.subPeak}|${span}|${onAlpha}|${style}|${isVertical ? 'V' : 'H'}`;
        if (this.#bmpMap.has(sig)) return this.#bmpMap.get(sig);

        // Bounded cache with explicit GDI bitmap disposal to prevent handle leaks during resize
        if (this.#bmpMap.size >= 32) {
            const oldestKey = this.#bmpMap.keys().next().value;
            const evictedBmp = this.#bmpMap.get(oldestKey);
            try { evictedBmp?.Dispose(); } catch {}
            this.#bmpMap.delete(oldestKey);
        }

        const strip = this.get(theme, span, onAlpha, style);
        const w = isVertical ? 1 : span;
        const h = isVertical ? span : 1;

        let bmp = null;
        let g = null;
        try {
            bmp = gdi.CreateImage(w, h);
            g = bmp.GetGraphics();
            if (isVertical) {
                for (let y = 0; y < span; y++) {
                    g.FillSolidRect(0, span - 1 - y, 1, 1, strip[y]);
                }
            } else {
                for (let x = 0; x < span; x++) {
                    g.FillSolidRect(x, 0, 1, 1, strip[x]);
                }
            }
            bmp.ReleaseGraphics(g);
            g = null;
            this.#bmpMap.set(sig, bmp);
            return bmp;
        } catch {
            if (g && bmp) { try { bmp.ReleaseGraphics(g); } catch {} }
            if (bmp) { try { bmp.Dispose(); } catch {} }
            return null;
        }
    }

    dispose() {
        for (const bmp of this.#bmpMap.values()) {
            try { bmp?.Dispose(); } catch {}
        }
        this.#bmpMap.clear();
        this.#map.clear();
    }
}

// 2D Pre-Rendered Foreground Texture for Peak Channels (1-Blit Slicing)
class MeterForegroundCache {
    #key = '';
    #bmp = null;

    get(chW, chH, vertical, theme, flatMode, flatGradient, onOpacity, gradCache, geometry, minDb) {
        const floor = minDb ?? geometry.minDb ?? MeterConstants.MIN_DB;
        const key = `${chW}|${chH}|${vertical ? 'V' : 'H'}|${theme.name}|${flatMode ? 1 : 0}|${flatGradient}|${onOpacity}|${geometry.segmentCount}|${geometry.extraSegments || 0}|${floor}`;
        if (key === this.#key && this.#bmp) return this.#bmp;

        this.dispose();
        this.#key = key;

        let bmp = null;
        let g = null;
        try {
            bmp = gdi.CreateImage(chW, chH);
            g = bmp.GetGraphics();

            const onAlpha = onOpacity ?? 255;

            if (flatMode) {
                if (flatGradient === MeterConstants.GRADIENT_STYLE_SOLID) {
                    const warnDist = vertical ? Math.round(chH * (1 - MeterConstants.WARNING_ZONE_THRESHOLD)) : Math.round(chW * (1 - MeterConstants.WARNING_ZONE_THRESHOLD));
                    const subDist  = vertical ? Math.round(chH * MeterConstants.SUBPEAK_ZONE_FRACTION) : Math.round(chW * MeterConstants.SUBPEAK_ZONE_FRACTION);
                    const activeCol = GdiUtils.withAlpha(theme.active, onAlpha);
                    const subCol    = GdiUtils.withAlpha(theme.subPeak, onAlpha);
                    const warnCol   = GdiUtils.withAlpha(theme.warning, onAlpha);

                    if (vertical) {
                        g.FillSolidRect(0, 0, chW, warnDist, warnCol);
                        g.FillSolidRect(0, warnDist, chW, subDist, subCol);
                        g.FillSolidRect(0, warnDist + subDist, chW, chH - (warnDist + subDist), activeCol);
                    } else {
                        const warnX = chW - warnDist;
                        const subX  = warnX - subDist;
                        g.FillSolidRect(0, 0, subX, chH, activeCol);
                        g.FillSolidRect(subX, 0, subDist, chH, subCol);
                        g.FillSolidRect(warnX, 0, warnDist, chH, warnCol);
                    }
                } else if (flatGradient === MeterConstants.GRADIENT_STYLE_CROSS_BLEND || 
                           flatGradient === MeterConstants.GRADIENT_STYLE_CROSS_VARIANT || 
                           flatGradient === MeterConstants.GRADIENT_STYLE_CROSS) {
                    if (vertical) {
                        const sweepAct = gradCache.get(theme, chW, onAlpha, flatGradient === MeterConstants.GRADIENT_STYLE_CROSS ? MeterConstants.GRADIENT_STYLE_ACTIVE_BEVEL : MeterConstants.GRADIENT_STYLE_ACTIVE_SWEEP);
                        const sweepSub = gradCache.get(theme, chW, onAlpha, flatGradient === MeterConstants.GRADIENT_STYLE_CROSS ? MeterConstants.GRADIENT_STYLE_SUBPEAK_BEVEL : MeterConstants.GRADIENT_STYLE_SUBPEAK_SWEEP);
                        const sweepWrn = gradCache.get(theme, chW, onAlpha, flatGradient === MeterConstants.GRADIENT_STYLE_CROSS ? MeterConstants.GRADIENT_STYLE_WARNING_BEVEL : MeterConstants.GRADIENT_STYLE_WARNING_SWEEP);
                        const warnY = Math.round(chH * (1 - MeterConstants.WARNING_ZONE_THRESHOLD));
                        const subY  = Math.round(chH * (1 - MeterConstants.SUBPEAK_ZONE_THRESHOLD));

                        for (let col = 0; col < chW; col++) {
                            g.FillSolidRect(col, 0, 1, warnY, sweepWrn[col]);
                            g.FillSolidRect(col, warnY, 1, subY - warnY, sweepSub[col]);
                            g.FillSolidRect(col, subY, 1, chH - subY, sweepAct[col]);
                        }
                    } else {
                        const sweepAct = gradCache.get(theme, chH, onAlpha, flatGradient === MeterConstants.GRADIENT_STYLE_CROSS ? MeterConstants.GRADIENT_STYLE_ACTIVE_BEVEL : MeterConstants.GRADIENT_STYLE_ACTIVE_SWEEP);
                        const sweepSub = gradCache.get(theme, chH, onAlpha, flatGradient === MeterConstants.GRADIENT_STYLE_CROSS ? MeterConstants.GRADIENT_STYLE_SUBPEAK_BEVEL : MeterConstants.GRADIENT_STYLE_SUBPEAK_SWEEP);
                        const sweepWrn = gradCache.get(theme, chH, onAlpha, flatGradient === MeterConstants.GRADIENT_STYLE_CROSS ? MeterConstants.GRADIENT_STYLE_WARNING_BEVEL : MeterConstants.GRADIENT_STYLE_WARNING_SWEEP);
                        const warnX = Math.round(chW * MeterConstants.WARNING_ZONE_THRESHOLD);
                        const subX  = Math.round(chW * MeterConstants.SUBPEAK_ZONE_THRESHOLD);

                        for (let row = 0; row < chH; row++) {
                            g.FillSolidRect(0, row, subX, 1, sweepAct[row]);
                            g.FillSolidRect(subX, row, warnX - subX, 1, sweepSub[row]);
                            g.FillSolidRect(warnX, row, chW - warnX, 1, sweepWrn[row]);
                        }
                    }
                } else {
                    const stripBmp = gradCache.getBitmap(theme, vertical ? chH : chW, onAlpha, flatGradient, vertical);
                    if (stripBmp) {
                        g.DrawImage(stripBmp, 0, 0, chW, chH, 0, 0, stripBmp.Width, stripBmp.Height);
                    }
                }
            } else {
                const colors = getCachedSegmentColourTable(theme, geometry.segmentCount, geometry.extraSegments || 0, floor);
                const ch = geometry.channels[0];
                for (let i = 0; i < geometry.segmentCount; i++) {
                    const seg = ch.segments[i];
                    const rx = seg.x - ch.x;
                    const ry = seg.y - ch.y;
                    g.FillSolidRect(rx, ry, seg.w, seg.h, GdiUtils.withAlpha(colors[i], onAlpha));
                }
            }

            bmp.ReleaseGraphics(g);
            g = null;
            this.#bmp = bmp;
            return this.#bmp;
        } catch {
            if (g && bmp) { try { bmp.ReleaseGraphics(g); } catch {} }
            if (bmp) { try { bmp.Dispose(); } catch {} }
            return null;
        }
    }

    dispose() {
        if (this.#bmp) {
            try { this.#bmp.Dispose(); } catch {}
            this.#bmp = null;
        }
        this.#key = '';
    }
}

// 2D Pre-Rendered Spectrum Bar Texture (1-Blit Slicing for Spectrum)
class SpectrumForegroundCache {
    #key = '';
    #bmp = null;
    #segOffsets = null;
    #effSegs = 0;

    get(barW, barH, vertical, theme, flatMode, flatGradient, onOpacity, gradCache, segmentCount) {
        const effSegs = flatMode ? segmentCount : getEffectiveSpectrumSegments(vertical ? barH : barW, segmentCount);
        const key = `${barW}|${barH}|${vertical ? 'V' : 'H'}|${theme.name}|${flatMode ? 1 : 0}|${flatGradient}|${onOpacity}|${effSegs}`;
        if (key === this.#key && this.#bmp) return { bmp: this.#bmp, segOffsets: this.#segOffsets, effSegs: this.#effSegs };

        this.dispose();
        this.#key = key;
        this.#effSegs = effSegs;

        let bmp = null;
        let g = null;
        try {
            bmp = gdi.CreateImage(barW, barH);
            g = bmp.GetGraphics();
            const onAlpha = onOpacity ?? 255;

            if (flatMode) {
                this.#segOffsets = null;
                if (flatGradient === MeterConstants.GRADIENT_STYLE_SOLID) {
                    const warnDist = vertical ? Math.round(barH * (1 - MeterConstants.WARNING_ZONE_THRESHOLD)) : Math.round(barW * (1 - MeterConstants.WARNING_ZONE_THRESHOLD));
                    const subDist  = vertical ? Math.round(barH * MeterConstants.SUBPEAK_ZONE_FRACTION) : Math.round(barW * MeterConstants.SUBPEAK_ZONE_FRACTION);
                    const activeCol = GdiUtils.withAlpha(theme.active, onAlpha);
                    const subCol    = GdiUtils.withAlpha(theme.subPeak, onAlpha);
                    const warnCol   = GdiUtils.withAlpha(theme.warning, onAlpha);

                    if (vertical) {
                        g.FillSolidRect(0, 0, barW, warnDist, warnCol);
                        g.FillSolidRect(0, warnDist, barW, subDist, subCol);
                        g.FillSolidRect(0, warnDist + subDist, barW, barH - (warnDist + subDist), activeCol);
                    } else {
                        const warnX = barW - warnDist;
                        const subX  = warnX - subDist;
                        g.FillSolidRect(0, 0, subX, barH, activeCol);
                        g.FillSolidRect(subX, 0, subDist, barH, subCol);
                        g.FillSolidRect(warnX, 0, warnDist, barH, warnCol);
                    }
                } else if (flatGradient === MeterConstants.GRADIENT_STYLE_CROSS_BLEND || 
                           flatGradient === MeterConstants.GRADIENT_STYLE_CROSS_VARIANT || 
                           flatGradient === MeterConstants.GRADIENT_STYLE_CROSS) {
                    if (vertical) {
                        const sweepAct = gradCache.get(theme, barW, onAlpha, flatGradient === MeterConstants.GRADIENT_STYLE_CROSS ? MeterConstants.GRADIENT_STYLE_ACTIVE_BEVEL : MeterConstants.GRADIENT_STYLE_ACTIVE_SWEEP);
                        const sweepSub = gradCache.get(theme, barW, onAlpha, flatGradient === MeterConstants.GRADIENT_STYLE_CROSS ? MeterConstants.GRADIENT_STYLE_SUBPEAK_BEVEL : MeterConstants.GRADIENT_STYLE_SUBPEAK_SWEEP);
                        const sweepWrn = gradCache.get(theme, barW, onAlpha, flatGradient === MeterConstants.GRADIENT_STYLE_CROSS ? MeterConstants.GRADIENT_STYLE_WARNING_BEVEL : MeterConstants.GRADIENT_STYLE_WARNING_SWEEP);
                        const warnY = Math.round(barH * (1 - MeterConstants.WARNING_ZONE_THRESHOLD));
                        const subY  = Math.round(barH * (1 - MeterConstants.SUBPEAK_ZONE_THRESHOLD));

                        for (let col = 0; col < barW; col++) {
                            g.FillSolidRect(col, 0, 1, warnY, sweepWrn[col]);
                            g.FillSolidRect(col, warnY, 1, subY - warnY, sweepSub[col]);
                            g.FillSolidRect(col, subY, 1, barH - subY, sweepAct[col]);
                        }
                    } else {
                        const sweepAct = gradCache.get(theme, barH, onAlpha, flatGradient === MeterConstants.GRADIENT_STYLE_CROSS ? MeterConstants.GRADIENT_STYLE_ACTIVE_BEVEL : MeterConstants.GRADIENT_STYLE_ACTIVE_SWEEP);
                        const sweepSub = gradCache.get(theme, barH, onAlpha, flatGradient === MeterConstants.GRADIENT_STYLE_CROSS ? MeterConstants.GRADIENT_STYLE_SUBPEAK_BEVEL : MeterConstants.GRADIENT_STYLE_SUBPEAK_SWEEP);
                        const sweepWrn = gradCache.get(theme, barH, onAlpha, flatGradient === MeterConstants.GRADIENT_STYLE_CROSS ? MeterConstants.GRADIENT_STYLE_WARNING_BEVEL : MeterConstants.GRADIENT_STYLE_WARNING_SWEEP);
                        const warnX = Math.round(barW * MeterConstants.WARNING_ZONE_THRESHOLD);
                        const subX  = Math.round(barW * MeterConstants.SUBPEAK_ZONE_THRESHOLD);

                        for (let row = 0; row < barH; row++) {
                            g.FillSolidRect(0, row, subX, 1, sweepAct[row]);
                            g.FillSolidRect(subX, row, warnX - subX, 1, sweepSub[row]);
                            g.FillSolidRect(warnX, row, barW - warnX, 1, sweepWrn[row]);
                        }
                    }
                } else {
                    const stripBmp = gradCache.getBitmap(theme, vertical ? barH : barW, onAlpha, flatGradient, vertical);
                    if (stripBmp) {
                        g.DrawImage(stripBmp, 0, 0, barW, barH, 0, 0, stripBmp.Width, stripBmp.Height);
                    }
                }
            } else {
                // Segmented LCD Mode for Spectrum Analyzer Bars
                const segs = effSegs;
                const colors = getCachedSegmentColourTable(theme, segs, 0, MeterConstants.SPECTRUM_MIN_DB);
                this.#segOffsets = new Int32Array(segs);

                if (vertical) {
                    const gap = Math.max(1, scaleDpi(1));
                    const segH = Math.max(1, Math.floor((barH - gap * (segs - 1)) / segs));
                    for (let i = 0; i < segs; i++) {
                        const y = barH - (i + 1) * segH - i * gap;
                        const h = Math.max(1, segH);
                        g.FillSolidRect(0, y, barW, h, GdiUtils.withAlpha(colors[i], onAlpha));
                        this.#segOffsets[i] = Math.min(barH, barH - y);
                    }
                } else {
                    const gap = Math.max(1, scaleDpi(1));
                    const segW = Math.max(1, Math.floor((barW - gap * (segs - 1)) / segs));
                    for (let i = 0; i < segs; i++) {
                        const x = i * (segW + gap);
                        const w = Math.max(1, segW);
                        g.FillSolidRect(x, 0, w, barH, GdiUtils.withAlpha(colors[i], onAlpha));
                        this.#segOffsets[i] = Math.min(barW, x + w);
                    }
                }
            }

            bmp.ReleaseGraphics(g);
            g = null;
            this.#bmp = bmp;
            return { bmp: this.#bmp, segOffsets: this.#segOffsets, effSegs: this.#effSegs };
        } catch {
            if (g && bmp) { try { bmp.ReleaseGraphics(g); } catch {} }
            if (bmp) { try { bmp.Dispose(); } catch {} }
            return { bmp: null, segOffsets: null, effSegs: 0 };
        }
    }

    dispose() {
        if (this.#bmp) {
            try { this.#bmp.Dispose(); } catch {}
            this.#bmp = null;
        }
        this.#segOffsets = null;
        this.#effSegs = 0;
        this.#key = '';
    }
}

// ============================================================================================
// 4. DSP & HIGH-SPEED FFT ENGINE
// ============================================================================================
function fftInPlace(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
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

function createHannWindow(size) {
    const w = new Float32Array(size);
    if (size <= 1) {
        if (size === 1) w[0] = 1;
        return w;
    }
    for (let i = 0; i < size; i++) {
        w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
    }
    return w;
}
const HANN_WINDOW = createHannWindow(MeterConstants.SPECTRUM_FFT_SIZE);

function interpolatedBinMagnitude(mag, pos) {
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, mag.length - 1);
    const frac = pos - i0;
    return mag[i0] + (mag[i1] - mag[i0]) * frac;
}

const ATTACK_RATES  = Object.freeze({ Slow: 0.36, Medium: 0.72, Fast: 1.0 });
const RELEASE_RATES = Object.freeze({ Slow: 0.08, Medium: 0.18, Fast: 0.34 });

function ballisticRate(speed, isAttack) {
    return isAttack 
        ? ATTACK_RATES[speed] ?? ATTACK_RATES.Medium 
        : RELEASE_RATES[speed] ?? RELEASE_RATES.Medium;
}

// ============================================================================================
// 5. FONT RESOURCE MANAGER (DEFENSIVE DISPOSAL)
// ============================================================================================
class FontCache {
    #cache = new Map();
    #max;

    constructor(max = 48) {
        this.#max = max;
    }
    
    get(name, size, style = 0) {
        const roundedSize = Math.max(6, Math.round(size));
        const fontName = (typeof name === 'string' && name.trim().length > 0) ? name.trim() : 'Segoe UI';
        const key = `${fontName}|${roundedSize}|${style}`;
        
        let font = this.#cache.get(key);
        if (font) {
            this.#cache.delete(key);
            this.#cache.set(key, font);
            return font;
        }

        try { font = gdi.Font(fontName, roundedSize, style); }
        catch { 
            try { font = gdi.Font('Segoe UI', roundedSize, style); } 
            catch { font = null; } 
        }

        if (font) {
            this.#cache.set(key, font);
            if (this.#cache.size > this.#max) {
                const oldestKey = this.#cache.keys().next().value;
                const evicted = this.#cache.get(oldestKey);
                if (evicted && typeof evicted.Dispose === 'function') {
                    try { evicted.Dispose(); } catch {}
                }
                this.#cache.delete(oldestKey);
            }
        }
        return font;
    }
    
    dispose() {
        for (const font of this.#cache.values()) {
            if (font && typeof font.Dispose === 'function') {
                try { font.Dispose(); } catch {}
            }
        }
        this.#cache.clear();
    }
}

const fonts = new FontCache();

// ============================================================================================
// 6. AUDIO PIPELINE (JIT-OPTIMIZED TYPED BUFFERS)
// ============================================================================================
class AudioEngine {
    leftRmsDb   = MeterConstants.MIN_DB; 
    rightRmsDb  = MeterConstants.MIN_DB; 
    leftPeakDb  = MeterConstants.MIN_DB; 
    rightPeakDb = MeterConstants.MIN_DB;
    lastUpdate  = Date.now();
    
    #scratch = { leftRms: MeterConstants.MIN_DB, rightRms: MeterConstants.MIN_DB, leftPeak: MeterConstants.MIN_DB, rightPeak: MeterConstants.MIN_DB };
    #result  = { leftRms: MeterConstants.MIN_DB, rightRms: MeterConstants.MIN_DB, leftPeak: MeterConstants.MIN_DB, rightPeak: MeterConstants.MIN_DB };
    isSilent = true;

    update(attack, release, maxDb, minDb) {
        const now = Date.now();
        const elapsed = Math.max((now - this.lastUpdate) / 1000, 0.001);
        this.lastUpdate = now;
        const floor = minDb ?? MeterConstants.MIN_DB;

        const isPlaying = HAS_AUDIO_CHUNK && fb.IsPlaying && !fb.IsPaused;
        if (!isPlaying && this.isSilent) {
            this.leftRmsDb = floor;
            this.rightRmsDb = floor;
            this.leftPeakDb = floor;
            this.rightPeakDb = floor;
            const res = this.#result;
            res.leftRms = floor; res.rightRms = floor; res.leftPeak = floor; res.rightPeak = floor;
            return res;
        }

        const levels = this.readStereoLevels(maxDb, floor);

        this.leftRmsDb   = this.smooth(this.leftRmsDb, levels.leftRms, elapsed, attack, release, maxDb, floor);
        this.rightRmsDb  = this.smooth(this.rightRmsDb, levels.rightRms, elapsed, attack, release, maxDb, floor);
        this.leftPeakDb  = this.smooth(this.leftPeakDb, levels.leftPeak, elapsed, attack, release, maxDb, floor);
        this.rightPeakDb = this.smooth(this.rightPeakDb, levels.rightPeak, elapsed, attack, release, maxDb, floor);

        this.isSilent = (this.leftPeakDb <= floor + 0.1 && this.rightPeakDb <= floor + 0.1 && !isPlaying);

        const result = this.#result;
        result.leftRms   = this.leftRmsDb; 
        result.rightRms  = this.rightRmsDb; 
        result.leftPeak  = this.leftPeakDb; 
        result.rightPeak = this.rightPeakDb;
        return result;
    }

    readStereoLevels(maxDb, floorDb) {
        const floor = floorDb ?? MeterConstants.MIN_DB;
        let chunk = null;

        if (HAS_AUDIO_CHUNK && fb.IsPlaying && !fb.IsPaused) {
            try { chunk = fb.GetAudioChunk(MeterConstants.MASTER_TIMER_MS / 1000); } catch { chunk = null; }
        }

        if (!chunk) return this.silentLevels(floor);

        const data = chunk.Data ?? chunk.data ?? null;
        if (!data) return this.silentLevels(floor);

        const length = data.Length ?? data.length ?? 0;
        if (!length) return this.silentLevels(floor);

        const channels = chunk.ChannelCount ? (chunk.ChannelCount | 0) : 2;
        const frames = (length / channels) | 0;
        if (!frames) return this.silentLevels(floor);

        const totalSamples = frames * channels;
        let leftEnergy = 0, rightEnergy = 0, leftPeak = 0, rightPeak = 0;
        const isStereo = channels > 1; 

        for (let index = 0; index < totalSamples; index += channels) {
            const left = data[index];
            const right = isStereo ? data[index + 1] : left;
            leftEnergy += left * left; 
            rightEnergy += right * right;
            const absLeft = Math.abs(left);
            const absRight = Math.abs(right);
            if (absLeft > leftPeak) leftPeak = absLeft;
            if (absRight > rightPeak) rightPeak = absRight;
        }

        const scratch = this.#scratch;
        scratch.leftRms   = this.amplitudeToDb(Math.sqrt(leftEnergy / frames), maxDb, floor);
        scratch.rightRms  = this.amplitudeToDb(Math.sqrt(rightEnergy / frames), maxDb, floor);
        scratch.leftPeak  = this.amplitudeToDb(leftPeak, maxDb, floor);
        scratch.rightPeak = this.amplitudeToDb(rightPeak, maxDb, floor);
        return scratch;
    }

    silentLevels(floorDb) {
        const floor = floorDb ?? MeterConstants.MIN_DB;
        const scratch = this.#scratch;
        scratch.leftRms   = floor; 
        scratch.rightRms  = floor; 
        scratch.leftPeak  = floor; 
        scratch.rightPeak = floor;
        return scratch;
    }

    amplitudeToDb(amplitude, maxDb, floorDb) {
        const top = maxDb ?? 0;
        const floor = floorDb ?? MeterConstants.MIN_DB;
        return GdiUtils.clamp(20 * Math.log10(Math.max(amplitude, 0.000001)), floor, top);
    }

    smooth(current, target, elapsed, attack, release, maxDb, floorDb) {
        const amount = target > current ? attack : release;
        const ceiling = maxDb ?? 0;
        const floor = floorDb ?? MeterConstants.MIN_DB;
        return GdiUtils.clamp(current + (target - current) * Math.min(amount * elapsed * 30, 1), floor, ceiling);
    }
}

class MeterChannel {
    value = 0;
    peak = 0;
    #peakDb = MeterConstants.MIN_DB;
    peakTime = 0;
    lastPeakUpdate = 0;
    clipTime = 0;

    update(levelDb, signalPeakDb, peakHoldEnabled, now, maxDb, minDb, peakHoldMs) {
        this.value = GdiUtils.dbToMeter(levelDb, maxDb, minDb);
        if (signalPeakDb >= -0.05) this.clipTime = now;
        const elapsed = this.lastPeakUpdate ? Math.max((now - this.lastPeakUpdate) / 1000, 0) : 0;
        this.lastPeakUpdate = now;

        if (!peakHoldEnabled) {
            this.#peakDb = signalPeakDb;
            this.peak = GdiUtils.dbToMeter(signalPeakDb, maxDb, minDb);
            this.peakTime = 0;
            return;
        }

        if (signalPeakDb >= this.#peakDb) {
            this.#peakDb = signalPeakDb;
            this.peakTime = now;
        } else if (this.peakTime > 0 && now - this.peakTime > peakHoldMs) {
            this.#peakDb = Math.max(signalPeakDb, this.#peakDb - MeterConstants.PEAK_FALL_DB_PER_SECOND * elapsed);
        }
        this.peak = GdiUtils.dbToMeter(this.#peakDb, maxDb, minDb);
    }

    isClipping(now) { 
        return now - this.clipTime < 350; 
    }

    reset() {
        this.value = 0; 
        this.peak = 0; 
        this.#peakDb = MeterConstants.MIN_DB; 
        this.peakTime = 0; 
        this.lastPeakUpdate = 0; 
        this.clipTime = 0;
    }
}

// ============================================================================================
// 7. SPECTRUM ANALYZER ENGINE
// ============================================================================================
class SpectrumAnalyzer {
    barCount = MeterConstants.DEFAULT_SPECTRUM_BARS;
    levels;
    peaks;
    peakTimes;
    #fftN = MeterConstants.SPECTRUM_FFT_SIZE;
    #re;
    #im;
    #mag;
    #window = HANN_WINDOW;
    #bandEdges = null; 
    #bandEdgesKey = ''; 
    #lastSampleRate = 0;
    #quantLevel;
    #quantPeak;
    #prevQuantLevel;
    #prevQuantPeak;
    isDirty = true;

    constructor() {
        const maxBars = MeterConstants.SPECTRUM_BAR_COUNTS[MeterConstants.SPECTRUM_BAR_COUNTS.length - 1];
        this.levels = new Float32Array(maxBars); 
        this.peaks = new Float32Array(maxBars);
        this.peakTimes = new Float64Array(maxBars);
        this.#re = new Float32Array(this.#fftN); 
        this.#im = new Float32Array(this.#fftN); 
        this.#mag = new Float32Array(this.#fftN / 2);
        this.#quantLevel = new Int16Array(maxBars); 
        this.#quantPeak = new Int16Array(maxBars); 
        this.#prevQuantLevel = new Int16Array(maxBars); 
        this.#prevQuantPeak = new Int16Array(maxBars);
    }

    get fftN() { return this.#fftN; }

    hasEnergy() {
        for (let b = 0; b < this.barCount; b++) {
            if (this.levels[b] > 0 || this.peaks[b] > 0) return true;
        }
        return false;
    }

    setFftSize(n) {
        const target = n > 0 ? n : MeterConstants.SPECTRUM_FFT_SIZE;
        if (target === this.#fftN) return;
        this.#fftN = target;
        this.#re = new Float32Array(target); 
        this.#im = new Float32Array(target); 
        this.#mag = new Float32Array(target / 2);
        this.#window = createHannWindow(target);
        this.isDirty = true;
    }

    setBarCount(n) {
        if (this.barCount === n) return;
        this.barCount = n;
        this.levels.fill(0);
        this.peaks.fill(0);
        this.peakTimes.fill(0);
        this.#bandEdgesKey = '';
        this.#prevQuantLevel.fill(0); 
        this.#prevQuantPeak.fill(0);
        this.isDirty = true;
    }

    #ensureBandEdges(sampleRate) {
        const key = `${this.barCount}|${sampleRate}`;
        if (key === this.#bandEdgesKey && this.#bandEdges) return;
        this.#bandEdgesKey = key;
        const nyquist = sampleRate / 2;
        const minFreq = MeterConstants.SPECTRUM_MIN_FREQ;
        const maxFreq = Math.min(MeterConstants.SPECTRUM_MAX_FREQ_CAP, Math.max(nyquist - 1, minFreq + 1));
        const edges = new Float64Array(this.barCount + 1);
        const logMin = Math.log(Math.max(minFreq, 1));
        const logMax = Math.log(Math.max(maxFreq, minFreq + 1));
        for (let i = 0; i <= this.barCount; i++) { 
            edges[i] = Math.exp(logMin + (logMax - logMin) * (i / this.barCount)); 
        }
        this.#bandEdges = edges;
    }

    #readSampleRate(chunk) {
        return Number(chunk.SampleRate ?? chunk.sampleRate ?? 0) || 0;
    }

    update(attack, release, elapsedSeconds) {
        let chunk = null;
        if (HAS_AUDIO_CHUNK && fb.IsPlaying && !fb.IsPaused) {
            const sampleRateRef = this.#lastSampleRate || 44100;
            const requestSec = Math.max(0.06, (this.#fftN * 1.25) / sampleRateRef);
            if (Number.isFinite(requestSec)) { 
                try { chunk = fb.GetAudioChunk(requestSec); } catch { chunk = null; } 
            }
        }

        const data = chunk ? (chunk.Data ?? chunk.data ?? null) : null;
        const length = data ? Number(data.Length ?? data.length ?? 0) : 0;

        if (!chunk || !length) {
            let dirty = false;
            const now = Date.now();
            for (let b = 0; b < this.barCount; b++) {
                if (this.levels[b] > 0 || this.peaks[b] > 0) {
                    this.levels[b] = Math.max(0, this.levels[b] - release * elapsedSeconds * 2);
                    if (this.levels[b] < 0.0005) this.levels[b] = 0;
                    if (this.peakTimes[b] === 0 || now - this.peakTimes[b] > MeterConstants.SPECTRUM_PEAK_HOLD_MS) {
                        this.peaks[b] = Math.max(this.levels[b], this.peaks[b] - MeterConstants.SPECTRUM_PEAK_FALL_PER_SECOND * elapsedSeconds);
                        if (this.peaks[b] < 0.0005) this.peaks[b] = 0;
                    }
                    this.#quantLevel[b] = Math.round(this.levels[b] * MeterConstants.SPECTRUM_DIRTY_QUANTISE);
                    this.#quantPeak[b]  = Math.round(this.peaks[b] * MeterConstants.SPECTRUM_DIRTY_QUANTISE);
                    dirty = true;
                }
            }
            this.isDirty = dirty;
            if (dirty) {
                this.#prevQuantLevel.set(this.#quantLevel.subarray(0, this.barCount));
                this.#prevQuantPeak.set(this.#quantPeak.subarray(0, this.barCount));
            }
            return;
        }

        const channels = Math.max(chunk.ChannelCount ? (chunk.ChannelCount | 0) : 2, 1);
        const sampleRate = this.#readSampleRate(chunk) || this.#lastSampleRate || 44100;
        this.#lastSampleRate = sampleRate;
        const re = this.#re, im = this.#im, n = this.#fftN;
        const frames = Math.floor(length / channels);
        const usable = Math.min(n, frames);
        const frameOffset = Math.max(0, frames - usable);
        const useFullWin = (usable === n);
        const invUsable = usable > 1 ? (2 * Math.PI) / (usable - 1) : 0;

        if (channels === 1) {
            for (let i = 0; i < usable; i++) {
                const win = useFullWin ? this.#window[i] : (usable > 1 ? 0.5 - 0.5 * Math.cos(invUsable * i) : 1);
                re[i] = (Number(data[frameOffset + i]) || 0) * win;
                im[i] = 0;
            }
        } else if (channels === 2) {
            for (let i = 0; i < usable; i++) {
                const win = useFullWin ? this.#window[i] : (usable > 1 ? 0.5 - 0.5 * Math.cos(invUsable * i) : 1);
                const base = (frameOffset + i) * 2;
                re[i] = ((Number(data[base]) || 0) + (Number(data[base + 1]) || 0)) * 0.5 * win;
                im[i] = 0;
            }
        } else {
            const invCh = 1 / channels;
            for (let i = 0; i < usable; i++) {
                const win = useFullWin ? this.#window[i] : (usable > 1 ? 0.5 - 0.5 * Math.cos(invUsable * i) : 1);
                let sum = 0;
                const base = (frameOffset + i) * channels;
                for (let c = 0; c < channels; c++) sum += Number(data[base + c]) || 0;
                re[i] = sum * invCh * win;
                im[i] = 0;
            }
        }
        for (let i = usable; i < n; i++) { re[i] = 0; im[i] = 0; }
        fftInPlace(re, im);

        const mag = this.#mag, halfN = n / 2;
        const invN = 4 / Math.max(1, usable);
        for (let i = 0; i < halfN; i++) {
            const r = re[i] * invN, ii = im[i] * invN;
            mag[i] = r * r + ii * ii;
        }

        this.#ensureBandEdges(sampleRate);
        const edges = this.#bandEdges, binHz = sampleRate / n;
        const now = Date.now();

        for (let b = 0; b < this.barCount; b++) {
            const pLo = edges[b] / binHz, pHi = edges[b + 1] / binHz;
            let peakSq;
            if (pHi - pLo < 1) {
                const centerPos = GdiUtils.clamp((pLo + pHi) / 2, 1, halfN - 1.0001);
                peakSq = Math.max(0, interpolatedBinMagnitude(mag, centerPos));
            } else {
                const loBin = GdiUtils.clamp(Math.floor(pLo), 1, halfN - 1);
                const hiBin = GdiUtils.clamp(Math.ceil(pHi), loBin, halfN - 1);
                peakSq = 0;
                for (let k = loBin; k <= hiBin; k++) { if (mag[k] > peakSq) peakSq = mag[k]; }
            }
            const db = peakSq > 0 ? 10 * Math.log10(peakSq) : MeterConstants.SPECTRUM_MIN_DB;
            const target = GdiUtils.clamp((db - MeterConstants.SPECTRUM_MIN_DB) / -MeterConstants.SPECTRUM_MIN_DB, 0, 1);
            const current = this.levels[b], rate = target > current ? attack : release;
            this.levels[b] = GdiUtils.clamp(current + (target - current) * Math.min(rate * elapsedSeconds * 30, 1), 0, 1);

            if (this.levels[b] >= this.peaks[b]) {
                this.peaks[b] = this.levels[b]; 
                this.peakTimes[b] = now;
            } else if (this.peakTimes[b] > 0 && now - this.peakTimes[b] > MeterConstants.SPECTRUM_PEAK_HOLD_MS) {
                this.peaks[b] = Math.max(this.levels[b], this.peaks[b] - MeterConstants.SPECTRUM_PEAK_FALL_PER_SECOND * elapsedSeconds);
            }
            this.#quantLevel[b] = Math.round(this.levels[b] * MeterConstants.SPECTRUM_DIRTY_QUANTISE);
            this.#quantPeak[b]  = Math.round(this.peaks[b] * MeterConstants.SPECTRUM_DIRTY_QUANTISE);
        }

        let dirty = false;
        for (let b = 0; b < this.barCount; b++) {
            if (((this.#quantLevel[b] === 0) !== (this.#prevQuantLevel[b] === 0)) ||
                ((this.#quantPeak[b]  === 0) !== (this.#prevQuantPeak[b]  === 0)) ||
                Math.abs(this.#quantLevel[b] - this.#prevQuantLevel[b]) > MeterConstants.SPECTRUM_DIRTY_THRESHOLD || 
                Math.abs(this.#quantPeak[b]  - this.#prevQuantPeak[b])  > MeterConstants.SPECTRUM_DIRTY_THRESHOLD) {
                dirty = true; 
                break;
            }
        }
        this.isDirty = dirty;
        if (dirty) {
            this.#prevQuantLevel.set(this.#quantLevel.subarray(0, this.barCount));
            this.#prevQuantPeak.set(this.#quantPeak.subarray(0, this.barCount));
        }
    }
}

// ============================================================================================
// 8. GEOMETRY CACHES
// ============================================================================================
class GeometryCache {
    #width = -1; #height = -1; #layout = null; #segments = -1; 
    #themeName = null; #markerBorderSize = -1; #extraSegs = -1; 
    #padL = -1; #padR = -1; #padT = -1; #padB = -1; 
    #showMarkers = null; #minDb = null;
    geometry = null;

    get(width, height, layout, segments, theme, markerBorderSize, extraSegs, showMarkers, panelPad, padL, padT, padR, padB, minDb) {
        const border  = scaleDpi(GdiUtils.clamp(markerBorderSize ?? DEFAULT_MARKER_LOGICAL, MARKER_AREA_LOGICAL_MIN, MARKER_AREA_LOGICAL_MAX));
        const extras  = GdiUtils.clamp(extraSegs ?? 0, 0, MeterConstants.EXTRA_SEGMENT_MAX);
        const pad     = scaleDpi(GdiUtils.clamp(panelPad ?? DEFAULT_PANEL_PAD_LOGICAL, PANEL_PAD_LOGICAL_MIN, PANEL_PAD_LOGICAL_MAX));
        const markers = showMarkers !== false;
        const pL = scaleDpi(padL || 0) + pad;
        const pR = scaleDpi(padR || 0) + pad;
        const pT = scaleDpi(padT || 0) + pad;
        const pB = scaleDpi(padB || 0) + pad;

        if (width === this.#width && height === this.#height && layout === this.#layout && 
            segments === this.#segments && theme.name === this.#themeName && 
            border === this.#markerBorderSize && extras === this.#extraSegs && 
            pL === this.#padL && pR === this.#padR && pT === this.#padT && pB === this.#padB && 
            markers === this.#showMarkers && minDb === this.#minDb) {
            return this.geometry;
        }

        this.#width = width; this.#height = height; this.#layout = layout; 
        this.#segments = segments; this.#themeName = theme.name; 
        this.#markerBorderSize = border; this.#extraSegs = extras; 
        this.#padL = pL; this.#padR = pR; this.#padT = pT; this.#padB = pB; 
        this.#showMarkers = markers; this.#minDb = minDb;

        const header = 0;
        let renderedSegments = 0, channels = [], footer = 0, scaleWidth = 0, labelWidth = 0;

        if (layout === 'Vertical') {
            footer = markers ? border : 0;
            const availableHeight = Math.max(1, height - pT - pB - header - footer);
            scaleWidth = markers ? border : 0;
            const meterX = pL + scaleWidth;
            const meterAreaWidth = Math.max(1, width - meterX - pR);
            const gap = Math.max(scaleDpi(3), Math.round(Math.min(width, height) * 0.025));
            const channelWidth = Math.max(2, Math.floor((meterAreaWidth - gap) / 2));
            renderedSegments = Math.max(1, Math.min(segments, Math.floor((availableHeight + MIN_SEGMENT_GAP) / (MIN_VERTICAL_SEGMENT_HEIGHT + MIN_SEGMENT_GAP))));
            const preferredSegmentGap = Math.max(1, Math.round(channelWidth * 0.09));
            const segmentGap = Math.min(preferredSegmentGap, Math.max(MIN_SEGMENT_GAP, Math.floor((availableHeight - renderedSegments * MIN_VERTICAL_SEGMENT_HEIGHT) / Math.max(renderedSegments - 1, 1))));
            const segmentHeight = Math.max(MIN_VERTICAL_SEGMENT_HEIGHT, Math.floor((availableHeight - segmentGap * (renderedSegments - 1)) / renderedSegments));
            const meterHeight = Math.min(segmentHeight * renderedSegments + segmentGap * (renderedSegments - 1), availableHeight);
            const meterY = pT + header + availableHeight - meterHeight;
            const colors = getCachedSegmentColourTable(theme, renderedSegments, extras, minDb);

            for (let c = 0; c < 2; c++) {
                const x = c === 0 ? meterX : meterX + channelWidth + gap;
                const bakedSegments = [];
                const meterBottom = pT + header + availableHeight;
                for (let i = 0; i < renderedSegments; i++) {
                    const y = meterY + meterHeight - (i + 1) * segmentHeight - i * segmentGap;
                    const clampedY = Math.min(Math.round(y), meterBottom - Math.max(1, Math.floor(segmentHeight)));
                    bakedSegments.push({ x: x, y: clampedY, w: channelWidth, h: Math.max(1, Math.floor(segmentHeight)), color: colors[i] });
                }
                channels.push({ x, y: meterY, w: channelWidth, h: meterHeight, segments: bakedSegments });
            }
        } else {
            footer = markers ? border : 0;
            const availableHeight = Math.max(1, height - pT - pB - header - footer);
            labelWidth = markers ? border : 0;
            const meterX = pL + labelWidth;
            const meterAreaWidth = Math.max(1, width - meterX - pR);
            const gap = Math.max(scaleDpi(5), Math.round(Math.min(width, height) * 0.04));
            const channelHeight = Math.max(2, Math.floor((availableHeight - gap) / 2));
            renderedSegments = Math.max(1, Math.min(segments, Math.floor((meterAreaWidth + MIN_SEGMENT_GAP) / (MIN_HORIZONTAL_SEGMENT_WIDTH + MIN_SEGMENT_GAP))));
            const preferredSegmentGap = Math.max(1, Math.round(channelHeight * 0.11));
            const segmentGap = Math.min(preferredSegmentGap, Math.max(MIN_SEGMENT_GAP, Math.floor((meterAreaWidth - renderedSegments * MIN_HORIZONTAL_SEGMENT_WIDTH) / Math.max(renderedSegments - 1, 1))));
            const segmentWidth = Math.max(MIN_HORIZONTAL_SEGMENT_WIDTH, Math.floor((meterAreaWidth - segmentGap * (renderedSegments - 1)) / renderedSegments));
            const meterWidth = segmentWidth * renderedSegments + segmentGap * (renderedSegments - 1);
            const colors = getCachedSegmentColourTable(theme, renderedSegments, extras, minDb);

            for (let c = 0; c < 2; c++) {
                const y = c === 0 ? pT + header : pT + header + channelHeight + gap;
                const bakedSegments = [];
                for (let i = 0; i < renderedSegments; i++) {
                    const x = meterX + i * (segmentWidth + segmentGap);
                    bakedSegments.push({ x: Math.round(x), y: y, w: Math.max(1, Math.floor(segmentWidth)), h: channelHeight, color: colors[i] });
                }
                channels.push({ x: meterX, y, w: meterWidth, h: channelHeight, segments: bakedSegments });
            }
        }

        this.geometry = { 
            pL, pR, pT, pB, header, footer, labelWidth, scaleWidth, 
            vertical: layout === 'Vertical', 
            segmentCount: renderedSegments, 
            extraSegments: extras, 
            channels, 
            inactiveColor: theme.inactive, 
            showMarkers: markers,
            minDb: minDb ?? MeterConstants.MIN_DB
        };
        return this.geometry;
    }

    invalidate() { this.#width = -1; this.#height = -1; }
}

class SpectrumGeometryCache {
    #width = -1; #height = -1; #layout = null; #barCount = -1; 
    #padL = -1; #padR = -1; #padT = -1; #padB = -1;
    geometry = null;

    get(width, height, layout, barCount, panelPad, padL, padT, padR, padB) {
        const pad = scaleDpi(GdiUtils.clamp(panelPad ?? DEFAULT_PANEL_PAD_LOGICAL, PANEL_PAD_LOGICAL_MIN, PANEL_PAD_LOGICAL_MAX));
        const pL = scaleDpi(padL || 0) + pad;
        const pR = scaleDpi(padR || 0) + pad;
        const pT = scaleDpi(padT || 0) + pad;
        const pB = scaleDpi(padB || 0) + pad;

        if (width === this.#width && height === this.#height && layout === this.#layout && 
            barCount === this.#barCount && pL === this.#padL && pR === this.#padR && 
            pT === this.#padT && pB === this.#padB) return this.geometry;

        this.#width = width; this.#height = height; this.#layout = layout; 
        this.#barCount = barCount; this.#padL = pL; this.#padR = pR; this.#padT = pT; this.#padB = pB;
        const vertical = layout === 'Vertical';
        const bars = [];

        if (vertical) {
            const availableHeight = Math.max(1, height - pT - pB);
            const availableWidth  = Math.max(1, width  - pL - pR);
            let g = Math.max(1, Math.round((availableWidth / barCount) * MeterConstants.SPECTRUM_BAR_GAP_RATIO));
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
            const startX = pL + Math.max(0, Math.floor((availableWidth - totalWidth) / 2));
            const baseY = pT + availableHeight;
            for (let i = 0; i < count; i++) {
                bars.push({ x: startX + i * (barWidth + g), y: pT, w: barWidth, h: availableHeight, baseY });
            }
        } else {
            const availableWidth  = Math.max(1, width  - pL - pR);
            const availableHeight = Math.max(1, height - pT - pB);
            let g = Math.max(1, Math.round((availableHeight / barCount) * MeterConstants.SPECTRUM_BAR_GAP_RATIO));
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
            const startY = pT + Math.max(0, Math.floor((availableHeight - totalHeight) / 2));
            const baseX = pL;
            for (let i = 0; i < count; i++) {
                bars.push({ x: baseX, y: startY + i * (barHeight + g), w: availableWidth, h: barHeight });
            }
        }

        this.geometry = { vertical, pL, pT, pR, pB, bars };
        return this.geometry;
    }

    invalidate() { this.#width = -1; this.#height = -1; }
}

// ============================================================================================
// 9. ULTRA-FAST 1-BLIT RENDERERS
// ============================================================================================
class SegmentRenderer {
    _gradStrips = new GradientStripCache();
    _fgCache    = new MeterForegroundCache();

    drawFast(gr, channel, level, peak, vertical, theme, geometry, onOpacity, flatMode, flatGradient, minDb) {
        const effectiveMinDb = minDb ?? geometry.minDb ?? MeterConstants.MIN_DB;
        const fgBmp = this._fgCache.get(
            channel.w, channel.h, vertical, theme, flatMode, flatGradient, onOpacity, this._gradStrips, geometry, effectiveMinDb
        );

        if (!fgBmp) return;

        const onAlpha = onOpacity ?? 255;
        const clampedLevel = GdiUtils.clamp(level, 0, 1);

        if (vertical) {
            const span = channel.h;
            let litHeight = 0;
            if (flatMode) {
                litHeight = Math.round(clampedLevel * span);
            } else {
                const litCount = Math.min(Math.round(clampedLevel * geometry.segmentCount), geometry.segmentCount);
                if (litCount > 0) {
                    const topSeg = channel.segments[litCount - 1];
                    litHeight = (channel.y + span) - topSeg.y;
                }
            }

            if (litHeight > 0) {
                const srcY = span - litHeight;
                const dstY = channel.y + srcY;
                gr.DrawImage(fgBmp, channel.x, dstY, channel.w, litHeight, 0, srcY, channel.w, litHeight);
            }

            if (peak > 0.01) {
                const peakColour = peak > MeterConstants.WARNING_ZONE_THRESHOLD ? theme.warning : (theme.peak ?? theme.active);
                if (flatMode) {
                    const peakY = channel.y + (span - 1) - Math.round(GdiUtils.clamp(peak, 0, 1) * (span - 1));
                    const th = Math.min(FLAT_PEAK_THICKNESS, channel.h);
                    const tickY = GdiUtils.clamp(Math.round(peakY - th / 2), channel.y, channel.y + span - th);
                    gr.FillSolidRect(channel.x, tickY, channel.w, th, GdiUtils.withAlpha(peakColour, onAlpha));
                } else {
                    const peakIdx = GdiUtils.clamp(Math.ceil(peak * geometry.segmentCount) - 1, 0, geometry.segmentCount - 1);
                    const seg = channel.segments[peakIdx];
                    if (seg) {
                        gr.FillSolidRect(seg.x, seg.y, seg.w, seg.h, GdiUtils.withAlpha(peakColour, onAlpha));
                    }
                }
            }
        } else {
            const span = channel.w;
            let litWidth = 0;
            if (flatMode) {
                litWidth = Math.round(clampedLevel * span);
            } else {
                const litCount = Math.min(Math.round(clampedLevel * geometry.segmentCount), geometry.segmentCount);
                if (litCount > 0) {
                    const rightSeg = channel.segments[litCount - 1];
                    litWidth = (rightSeg.x + rightSeg.w) - channel.x;
                }
            }

            if (litWidth > 0) {
                gr.DrawImage(fgBmp, channel.x, channel.y, litWidth, channel.h, 0, 0, litWidth, channel.h);
            }

            if (peak > 0.01) {
                const peakColour = peak > MeterConstants.WARNING_ZONE_THRESHOLD ? theme.warning : (theme.peak ?? theme.active);
                if (flatMode) {
                    const peakX = channel.x + Math.round(GdiUtils.clamp(peak, 0, 1) * (span - 1));
                    const th = Math.min(FLAT_PEAK_THICKNESS, channel.w);
                    const tickX = GdiUtils.clamp(Math.round(peakX - th / 2), channel.x, channel.x + span - th);
                    gr.FillSolidRect(tickX, channel.y, th, channel.h, GdiUtils.withAlpha(peakColour, onAlpha));
                } else {
                    const peakIdx = GdiUtils.clamp(Math.ceil(peak * geometry.segmentCount) - 1, 0, geometry.segmentCount - 1);
                    const seg = channel.segments[peakIdx];
                    if (seg) {
                        gr.FillSolidRect(seg.x, seg.y, seg.w, seg.h, GdiUtils.withAlpha(peakColour, onAlpha));
                    }
                }
            }
        }
    }

    dispose() {
        this._gradStrips?.dispose();
        this._fgCache?.dispose();
    }
}

class SpectrumRenderer {
    _fgCache = new SpectrumForegroundCache();

    draw(gr, geometry, levels, peaks, barCount, theme, onOpacity, peakHoldEnabled, flatMode, flatGradient, gradCache, segmentCount) {
        const n = Math.min(barCount, geometry.bars.length);
        if (n <= 0) return;

        const firstBar = geometry.bars[0];
        const vertical = geometry.vertical;
        const onAlpha = onOpacity ?? 255;

        const { bmp: barBmp, segOffsets, effSegs } = this._fgCache.get(
            firstBar.w, firstBar.h, vertical, theme, flatMode, flatGradient, onOpacity, gradCache, segmentCount
        );

        if (!barBmp) return;
        const segs = effSegs || segmentCount;

        for (let i = 0; i < n; i++) {
            const bar = geometry.bars[i];
            if (!bar) continue;
            const level = GdiUtils.clamp(levels[i] || 0, 0, 1);
            const peak = GdiUtils.clamp(peaks[i] || 0, 0, 1);

            if (vertical) {
                let litH = 0;
                if (flatMode || !segOffsets) {
                    litH = Math.round(level * bar.h);
                } else {
                    const litCount = Math.min(Math.round(level * segs), segs);
                    if (litCount > 0) litH = Math.min(bar.h, segOffsets[litCount - 1]);
                }

                if (litH > 0) {
                    const srcY = bar.h - litH;
                    gr.DrawImage(barBmp, bar.x, bar.baseY - litH, bar.w, litH, 0, srcY, bar.w, litH);
                }

                if (peakHoldEnabled && peak > 0.01) {
                    const peakColor = GdiUtils.withAlpha(peak > MeterConstants.WARNING_ZONE_THRESHOLD ? theme.warning : (theme.peak ?? theme.active), onAlpha);
                    if (flatMode || !segOffsets) {
                        const peakY = bar.baseY - 1 - Math.round(GdiUtils.clamp(peak, 0, 1) * (bar.h - 1));
                        const th = Math.min(FLAT_PEAK_THICKNESS, bar.h);
                        const tickY = GdiUtils.clamp(Math.round(peakY - th / 2), bar.y, bar.baseY - th);
                        gr.FillSolidRect(bar.x, tickY, bar.w, th, peakColor);
                    } else {
                        const peakIdx = GdiUtils.clamp(Math.ceil(peak * segs) - 1, 0, segs - 1);
                        const gap = Math.max(1, scaleDpi(1));
                        const segH = Math.max(1, Math.floor((bar.h - gap * (segs - 1)) / segs));
                        const y = Math.max(bar.y, bar.y + bar.h - (peakIdx + 1) * segH - peakIdx * gap);
                        gr.FillSolidRect(bar.x, y, bar.w, Math.max(1, segH), peakColor);
                    }
                }
            } else {
                let litW = 0;
                if (flatMode || !segOffsets) {
                    litW = Math.round(level * bar.w);
                } else {
                    const litCount = Math.min(Math.round(level * segs), segs);
                    if (litCount > 0) litW = Math.min(bar.w, segOffsets[litCount - 1]);
                }

                if (litW > 0) {
                    gr.DrawImage(barBmp, bar.x, bar.y, litW, bar.h, 0, 0, litW, bar.h);
                }

                if (peakHoldEnabled && peak > 0.01) {
                    const peakColor = GdiUtils.withAlpha(peak > MeterConstants.WARNING_ZONE_THRESHOLD ? theme.warning : (theme.peak ?? theme.active), onAlpha);
                    if (flatMode || !segOffsets) {
                        const peakX = bar.x + Math.round(GdiUtils.clamp(peak, 0, 1) * (bar.w - 1));
                        const th = Math.min(FLAT_PEAK_THICKNESS, bar.w);
                        const tickX = GdiUtils.clamp(Math.round(peakX - th / 2), bar.x, bar.x + bar.w - th);
                        gr.FillSolidRect(tickX, bar.y, th, bar.h, peakColor);
                    } else {
                        const peakIdx = GdiUtils.clamp(Math.ceil(peak * segs) - 1, 0, segs - 1);
                        const gap = Math.max(1, scaleDpi(1));
                        const segW = Math.max(1, Math.floor((bar.w - gap * (segs - 1)) / segs));
                        const x = Math.min(bar.x + bar.w - Math.max(1, segW), bar.x + peakIdx * (segW + gap));
                        gr.FillSolidRect(x, bar.y, Math.max(1, segW), bar.h, peakColor);
                    }
                }
            }
        }
    }

    dispose() {
        this._fgCache?.dispose();
    }
}

class GlowRenderer {
    #segmentRect(channel, index) { return channel.segments[index]; }

    #bloom(gr, rect, vertical, glowColour, opacity, dynamicMult) {
        if (!rect || rect.w <= 0 || rect.h <= 0) return;
        const finalOpacity = opacity * dynamicMult;
        for (let i = 1; i <= MeterConstants.GLOW_ITERATIONS; i++) {
            const progress = i / MeterConstants.GLOW_ITERATIONS;
            const alpha = Math.floor(finalOpacity * (1 - progress) * MeterConstants.GLOW_ALPHA_MULT);
            if (alpha <= 0) continue;
            const pad = i * GLOW_STEP_PADDING;
            const bx = rect.x - pad, by = rect.y - pad;
            const bw = rect.w + pad * 2, bh = rect.h + pad * 2;
            if (bw <= 0 || bh <= 0) continue;
            const cx = Math.max(0, bx), cy = Math.max(0, by);
            const cw = bw - (cx - bx), ch = bh - (cy - by);
            if (cw <= 0 || ch <= 0) continue;
            gr.FillSolidRect(cx, cy, cw, ch, GdiUtils.withAlpha(glowColour, alpha));
        }
    }

    draw(gr, channel, level, peak, geometry, vertical, theme, opacity, dynamicMult) {
        if (opacity <= 0 || (level <= 0.001 && peak <= 0.001)) return;
        const segmentCount = geometry.segmentCount;
        const litSegments  = Math.min(Math.round(level * segmentCount), segmentCount);
        if (litSegments > 0) {
            const tipIndex = GdiUtils.clamp(litSegments - 1, 0, segmentCount - 1);
            const progress = (tipIndex + 1) / segmentCount;
            const tipColour = progress > MeterConstants.WARNING_ZONE_THRESHOLD ? theme.warning : progress > MeterConstants.SUBPEAK_ZONE_THRESHOLD ? theme.subPeak : theme.active;
            this.#bloom(gr, this.#segmentRect(channel, tipIndex), vertical, tipColour, opacity, dynamicMult);
        }
        if (peak > 0.01) {
            const peakIndex = GdiUtils.clamp(Math.ceil(peak * segmentCount) - 1, 0, segmentCount - 1);
            const progress = (peakIndex + 1) / segmentCount;
            const peakColour = progress > MeterConstants.WARNING_ZONE_THRESHOLD ? theme.warning : (theme.peak ?? theme.active);
            this.#bloom(gr, this.#segmentRect(channel, peakIndex), vertical, peakColour, opacity * 0.8, dynamicMult);
        }
    }

    drawFlat(gr, channel, level, peak, vertical, theme, opacity, dynamicMult) {
        if (opacity <= 0 || (level <= 0.001 && peak <= 0.001)) return;
        const clampedLevel = GdiUtils.clamp(level, 0, 1);
        if (clampedLevel > 0.001) {
            const tipColour = clampedLevel > MeterConstants.WARNING_ZONE_THRESHOLD ? theme.warning : clampedLevel > MeterConstants.SUBPEAK_ZONE_THRESHOLD ? theme.subPeak : theme.active;
            let tipRect;
            if (vertical) {
                const litHeight = Math.round(clampedLevel * channel.h);
                tipRect = { x: channel.x, y: channel.y + channel.h - litHeight, w: channel.w, h: Math.max(1, Math.min(FLAT_PEAK_THICKNESS, channel.h)) };
            } else {
                const litWidth = Math.round(clampedLevel * channel.w);
                tipRect = { x: Math.max(channel.x, channel.x + litWidth - Math.min(FLAT_PEAK_THICKNESS, channel.w)), y: channel.y, w: Math.max(1, Math.min(FLAT_PEAK_THICKNESS, channel.w)), h: channel.h };
            }
            this.#bloom(gr, tipRect, vertical, tipColour, opacity, dynamicMult);
        }
        if (peak > 0.01) {
            const peakColour = peak > MeterConstants.WARNING_ZONE_THRESHOLD ? theme.warning : (theme.peak ?? theme.active);
            let peakRect;
            if (vertical) {
                const peakY = channel.y + (channel.h - 1) - Math.round(GdiUtils.clamp(peak, 0, 1) * (channel.h - 1));
                const th = Math.min(FLAT_PEAK_THICKNESS, channel.h);
                peakRect = { x: channel.x, y: Math.round(peakY - th / 2), w: channel.w, h: th };
            } else {
                const peakX = channel.x + Math.round(GdiUtils.clamp(peak, 0, 1) * (channel.w - 1));
                const tw = Math.min(FLAT_PEAK_THICKNESS, channel.w);
                peakRect = { x: Math.round(peakX - tw / 2), y: channel.y, w: tw, h: channel.h };
            }
            this.#bloom(gr, peakRect, vertical, peakColour, opacity, dynamicMult);
        }
    }
}

class PhosphorRenderer {
    draw(gr, x, y, width, height, theme, opacity) {
        if (opacity <= 0) return;
        const adjustedOpacity = Math.floor(opacity * 0.3);
        if (adjustedOpacity <= 0) return;
        const tinted = GdiUtils.interpolateColour(theme.active, GdiUtils.colour(255, 255, 255), 0.25);
        gr.FillSolidRect(x, y, width, height, GdiUtils.withAlpha(tinted, adjustedOpacity));
    }
}

class ScanlineRenderer {
    draw(gr, area, opacity, vertical) {
        if (opacity <= 0) return;
        const scanlineCol = GdiUtils.withAlpha(GdiUtils.colour(0, 0, 0), opacity);
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
        const reflH = Math.floor(height * MeterConstants.REFLECTION_HEIGHT_RATIO);
        const white = GdiUtils.colour(255, 255, 255);
        for (let row = 0; row < reflH; row++) {
            const t = 1 - row / reflH;
            const s = t * t * (3 - 2 * t);
            const alpha = Math.floor(opacity * s * 0.30);
            if (alpha > 0) gr.FillSolidRect(x, y + row, width, 1, GdiUtils.withAlpha(white, alpha));
        }
    }
}

class ScaleRenderer {
    draw(gr, geometry, width, height, theme, layout, minDb) {
        const font = fonts.get('Segoe UI Semibold', Math.max(scaleDpi(8), Math.round(Math.min(width, height) * 0.032)), 0);
        if (!font) return;
        const extras = geometry.extraSegments || 0;
        const maxDb = extras;
        const allTicks = MeterConstants.DB_SCALE_TICKS.filter(tick => tick.db >= minDb);

        if (!allTicks.some(tick => tick.db === minDb)) allTicks.push({ label: String(minDb), db: minDb });
        if (extras > 0) allTicks.push({ label: `+${extras}`, db: extras });

        if (layout === 'Vertical') {
            const meter = geometry.channels[0];
            const scaleX = geometry.pL;
            const labelHeight = Math.max(scaleDpi(9), Math.round(Math.min(width, height) * 0.045));
            const scaleBoxW = Math.max(1, meter.x - LABEL_GAP - scaleX);
            for (let i = 0; i < allTicks.length; i++) {
                const level = GdiUtils.dbToMeter(allTicks[i].db, maxDb, minDb);
                const tickY = meter.y + (1 - level) * meter.h - labelHeight / 2;
                const col = allTicks[i].db > 0 ? theme.warning : theme.text;
                gr.GdiDrawText(allTicks[i].label, font, col, scaleX, Math.round(tickY), scaleBoxW, labelHeight, MeterConstants.TEXT_RIGHT_MIDDLE);
            }
        } else {
            const meter = geometry.channels[0];
            const meterBottom = geometry.channels[1].y + geometry.channels[1].h;
            const footerBottom = height - geometry.pB;
            const availFooter = Math.max(1, footerBottom - meterBottom - LABEL_GAP);
            const y = meterBottom + LABEL_GAP;
            const labelHeight = Math.min(Math.max(scaleDpi(9), Math.round(Math.min(width, height) * 0.045)), availFooter, Math.max(1, footerBottom - y));
            const tickWidth = Math.max(scaleDpi(28), Math.round(meter.w / allTicks.length));
            for (let i = 0; i < allTicks.length; i++) {
                const level = GdiUtils.dbToMeter(allTicks[i].db, maxDb, minDb);
                const tickX = meter.x + level * meter.w - tickWidth / 2;
                const clampedX = GdiUtils.clamp(tickX, meter.x - tickWidth / 2, meter.x + meter.w - tickWidth / 2);
                const col = allTicks[i].db > 0 ? theme.warning : theme.text;
                gr.GdiDrawText(allTicks[i].label, font, col, Math.round(clampedX), y, tickWidth, labelHeight, MeterConstants.TEXT_CENTER_TOP);
            }
        }
    }
}

class LabelRenderer {
    draw(gr, geometry, theme, width, height) {
        if (geometry.vertical) {
            const footerH = geometry.footer;
            const footerY = height - geometry.pB - footerH;
            const fontSize = Math.max(scaleDpi(6), Math.floor(footerH * 0.65));
            const font = fonts.get('Segoe UI Semibold', fontSize, 1);
            if (!font) return;
            const c0 = geometry.channels[0], c1 = geometry.channels[1];
            gr.GdiDrawText('L', font, theme.text, c0.x, footerY, c0.w, footerH, MeterConstants.TEXT_CENTER_MIDDLE);
            gr.GdiDrawText('R', font, theme.text, c1.x, footerY, c1.w, footerH, MeterConstants.TEXT_CENTER_MIDDLE);
        } else {
            const stripW = geometry.labelWidth;
            const stripX = geometry.pL;
            const fontSize = Math.max(scaleDpi(6), Math.floor(Math.min(stripW, geometry.channels[0].h) * 0.65));
            const font = fonts.get('Segoe UI Semibold', fontSize, 1);
            if (!font) return;
            const c0 = geometry.channels[0], c1 = geometry.channels[1];
            gr.GdiDrawText('L', font, theme.text, stripX, c0.y, stripW, c0.h, MeterConstants.TEXT_CENTER_MIDDLE);
            gr.GdiDrawText('R', font, theme.text, stripX, c1.y, stripW, c1.h, MeterConstants.TEXT_CENTER_MIDDLE);
        }
    }
}

// ============================================================================================
// 10. LAYER COMPOSITOR & BACKGROUND CACHES
// ============================================================================================
class EffectLayerCache {
    overlayKey = '';
    overlayBitmap = null;
    bezelKey = '';
    bezelBitmap = null;

    #disposeOverlay() {
        if (this.overlayBitmap) {
            try { this.overlayBitmap.Dispose(); } catch {}
            this.overlayBitmap = null;
        }
    }

    #disposeBezel() {
        if (this.bezelBitmap) {
            try { this.bezelBitmap.Dispose(); } catch {}
            this.bezelBitmap = null;
        }
    }

    getOverlayLayer(width, height, theme, themeName, phosphorRenderer, scanlineRenderer, reflectionRenderer, activeArea, vertical, showPhosphor, phosphorOpacity, showScanlines, scanlineOpacity, showReflection, reflectionOpacity) {
        const needsAny = (showPhosphor && phosphorOpacity > 0) ||
                         (showScanlines && scanlineOpacity > 0) ||
                         (showReflection && reflectionOpacity > 0);

        if (width <= 0 || height <= 0 || !needsAny || !activeArea || activeArea.w <= 0 || activeArea.h <= 0) {
            if (this.overlayBitmap || this.overlayKey) {
                this.#disposeOverlay();
                this.overlayKey = '';
            }
            return null;
        }

        const key = `${width}|${height}|${themeName}|${activeArea.x}|${activeArea.y}|${activeArea.w}|${activeArea.h}|${vertical}|${showPhosphor ? phosphorOpacity : -1}|${showScanlines ? scanlineOpacity : -1}|${showReflection ? reflectionOpacity : -1}`;

        if (key === this.overlayKey && this.overlayBitmap) return this.overlayBitmap;

        this.#disposeOverlay();
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
        } catch {
            this.overlayBitmap = null;
            this.overlayKey = '';
        }

        return this.overlayBitmap;
    }

    getBezelLayer(width, height, bezelActive, bezelBitmap, bezelVersion) {
        if (width <= 0 || height <= 0 || !bezelActive || !bezelBitmap) {
            if (this.bezelBitmap || this.bezelKey) {
                this.#disposeBezel();
                this.bezelKey = '';
            }
            return null;
        }

        const key = `${width}|${height}|${bezelVersion}`;
        if (key === this.bezelKey && this.bezelBitmap) return this.bezelBitmap;

        this.#disposeBezel();
        this.bezelKey = key;

        try {
            const bmp = gdi.CreateImage(width, height);
            const g = bmp.GetGraphics();
            try {
                g.SetInterpolationMode(2);
                g.DrawImage(bezelBitmap, 0, 0, width, height, 0, 0, bezelBitmap.Width, bezelBitmap.Height);
                g.SetInterpolationMode(0);
            } finally {
                bmp.ReleaseGraphics(g);
            }
            this.bezelBitmap = bmp;
        } catch {
            this.bezelBitmap = null;
            this.bezelKey = '';
        }
        return this.bezelBitmap;
    }

    dispose() {
        this.#disposeOverlay(); 
        this.overlayKey = ''; 
        this.#disposeBezel(); 
        this.bezelKey = ''; 
    }
}

class MeterBackgroundCache {
    #key = '';
    #bitmap = null;
    lastHit = false;

    get(width, height, geometry, theme, layout, flatMode, flatGradient, offOpacity, showMarkers, scaleRenderer, labelRenderer, minDb) {
        const key = `${width}|${height}|${layout}|${geometry.segmentCount}|${geometry.extraSegments || 0}|${theme.name}|${offOpacity}|${flatMode ? 1 : 0}|${flatGradient}|${showMarkers ? 1 : 0}|${minDb}|${geometry.pL}|${geometry.pR}|${geometry.pT}|${geometry.pB}|${geometry.footer}|${geometry.scaleWidth}|${geometry.labelWidth}`;

        if (key === this.#key && this.#bitmap) {
            this.lastHit = true;
            return this.#bitmap;
        }

        this.lastHit = false;
        this.#dispose();
        this.#key = key;

        let bmp = null;
        let g = null;
        try {
            bmp = gdi.CreateImage(width, height);
            g = bmp.GetGraphics();
            try {
                g.FillSolidRect(0, 0, width, height, theme.background);
                const offFill = GdiUtils.withAlpha(theme.inactive, offOpacity ?? 255);
                const ch0 = geometry.channels[0], ch1 = geometry.channels[1];

                if (flatMode) {
                    g.FillSolidRect(ch0.x, ch0.y, ch0.w, ch0.h, offFill);
                    g.FillSolidRect(ch1.x, ch1.y, ch1.w, ch1.h, offFill);
                } else {
                    for (let i = 0; i < geometry.segmentCount; i++) {
                        const s0 = ch0.segments[i], s1 = ch1.segments[i];
                        g.FillSolidRect(s0.x, s0.y, s0.w, s0.h, offFill);
                        g.FillSolidRect(s1.x, s1.y, s1.w, s1.h, offFill);
                    }
                }

                if (showMarkers) {
                    scaleRenderer.draw(g, geometry, width, height, theme, layout, minDb);
                    labelRenderer.draw(g, geometry, theme, width, height);
                }
            } finally {
                bmp.ReleaseGraphics(g);
            }
            this.#bitmap = bmp;
        } catch {
            this.#bitmap = null;
            this.#key = '';
        }
        return this.#bitmap;
    }

    invalidate() { this.#dispose(); this.#key = ''; this.lastHit = false; }

    #dispose() {
        if (this.#bitmap) {
            try { this.#bitmap.Dispose(); } catch {}
            this.#bitmap = null;
        }
    }

    dispose() { this.#dispose(); this.#key = ''; this.lastHit = false; }
}

// Pre-Rendered Spectrum Background Plate
class SpectrumBackgroundCache {
    #key = '';
    #bitmap = null;

    get(width, height, geometry, theme, offOpacity, flatMode, segmentCount) {
        const firstBar = geometry.bars[0];
        const span = firstBar ? (geometry.vertical ? firstBar.h : firstBar.w) : (geometry.vertical ? height : width);
        const effSegs = flatMode ? segmentCount : getEffectiveSpectrumSegments(span, segmentCount);
        const key = `${width}|${height}|${geometry.vertical ? 'V' : 'H'}|${geometry.bars.length}|${theme.name}|${offOpacity}|${flatMode ? 1 : 0}|${effSegs}`;
        if (key === this.#key && this.#bitmap) return this.#bitmap;

        this.dispose();
        this.#key = key;

        let bmp = null;
        let g = null;
        try {
            bmp = gdi.CreateImage(width, height);
            g = bmp.GetGraphics();
            g.FillSolidRect(0, 0, width, height, theme.background);

            const offFill = GdiUtils.withAlpha(theme.inactive, offOpacity ?? 255);
            const vertical = geometry.vertical;
            const segs = effSegs;

            for (let i = 0; i < geometry.bars.length; i++) {
                const b = geometry.bars[i];
                if (flatMode) {
                    g.FillSolidRect(b.x, b.y, b.w, b.h, offFill);
                } else {
                    if (vertical) {
                        const gap = Math.max(1, scaleDpi(1));
                        const segH = Math.max(1, Math.floor((b.h - gap * (segs - 1)) / segs));
                        for (let s = 0; s < segs; s++) {
                            const y = b.y + b.h - (s + 1) * segH - s * gap;
                            g.FillSolidRect(b.x, y, b.w, Math.max(1, segH), offFill);
                        }
                    } else {
                        const gap = Math.max(1, scaleDpi(1));
                        const segW = Math.max(1, Math.floor((b.w - gap * (segs - 1)) / segs));
                        for (let s = 0; s < segs; s++) {
                            const x = b.x + s * (segW + gap);
                            g.FillSolidRect(x, b.y, Math.max(1, segW), b.h, offFill);
                        }
                    }
                }
            }

            bmp.ReleaseGraphics(g);
            g = null;
            this.#bitmap = bmp;
            return this.#bitmap;
        } catch {
            if (g && bmp) { try { bmp.ReleaseGraphics(g); } catch {} }
            if (bmp) { try { bmp.Dispose(); } catch {} }
            this.#bitmap = null;
            this.#key = '';
            return null;
        }
    }

    invalidate() { this.dispose(); }

    dispose() {
        if (this.#bitmap) {
            try { this.#bitmap.Dispose(); } catch {}
            this.#bitmap = null;
        }
        this.#key = '';
    }
}

class PerformanceMonitor {
    enabled = false;
    tickMs = 0; audioMs = 0; fftMs = 0; paintMs = 0;
    repaintCount = 0; tickCount = 0;
    #windowStart = Date.now();
    #tickWindow = 0; #audioWindow = 0; #fftWindow = 0; #paintWindow = 0;
    #repaintWindow = 0; #fps = 0;
    bgCacheHit = true;
    spectrumTierMs = MeterConstants.SPECTRUM_FPS_FULL_MS;
    spectrumFftSize = MeterConstants.SPECTRUM_FFT_SIZE;
    spectrumSkipped = 0;
    #spectrumSkippedWindow = 0;

    setEnabled(value) { this.enabled = Boolean(value); }
    beginTick() { return this.enabled ? Date.now() : 0; }

    endTick(start, audioMs, fftMs) {
        if (!this.enabled) return;
        const now = Date.now();
        this.tickCount++;
        this.#tickWindow += Math.max(0, now - start);
        this.#audioWindow += Math.max(0, audioMs || 0);
        this.#fftWindow += Math.max(0, fftMs || 0);
        this.#roll(now);
    }

    beginPaint() { return this.enabled ? Date.now() : 0; }

    endPaint(start) {
        if (!this.enabled) return;
        const now = Date.now();
        this.paintMs = Math.max(0, now - start);
        this.#paintWindow += this.paintMs;
        this.#roll(now);
    }

    noteRepaint() { if (this.enabled) this.#repaintWindow++; }
    noteSpectrumClean() { if (this.enabled) this.#spectrumSkippedWindow++; }

    #roll(now) {
        const elapsed = now - this.#windowStart;
        if (elapsed < 1000) return;
        const seconds = elapsed / 1000;
        this.tickMs = this.#tickWindow / Math.max(this.tickCount, 1);
        this.audioMs = this.#audioWindow / Math.max(this.tickCount, 1);
        this.fftMs = this.#fftWindow / Math.max(this.tickCount, 1);
        this.paintMs = this.#paintWindow / Math.max(this.#repaintWindow, 1);
        this.#fps = this.#repaintWindow / seconds;
        this.repaintCount = this.#repaintWindow;
        this.#windowStart = now;
        this.#tickWindow = 0; this.#audioWindow = 0; this.#fftWindow = 0;
        this.#paintWindow = 0; this.#repaintWindow = 0; this.tickCount = 0;
        this.spectrumSkipped = this.#spectrumSkippedWindow;
        this.#spectrumSkippedWindow = 0;
    }

    draw(gr, width, height, isSpectrum) {
        if (!this.enabled || width < scaleDpi(220) || height < scaleDpi(70)) return;
        const font = fonts.get('Consolas', scaleDpi(10), 0);
        if (!font) return;
        const lineH = scaleDpi(13), pad = scaleDpi(7);
        const boxW = Math.min(scaleDpi(280), width - scaleDpi(12));
        const boxH = 8 * lineH + pad * 2;
        const x = width - boxW - scaleDpi(6), y = scaleDpi(6);
        gr.FillSolidRect(x, y, boxW, boxH, GdiUtils.withAlpha(GdiUtils.colour(0, 0, 0), 190));
        const specTierLabel = this.spectrumTierMs === MeterConstants.SPECTRUM_FPS_FULL_MS ? 'Full  ' : this.spectrumTierMs === MeterConstants.SPECTRUM_FPS_MEDIUM_MS ? 'Medium' : 'Low   ';
        const bgHitLabel = isSpectrum ? 'Cached Plate' : (this.bgCacheHit ? 'HIT' : 'MISS');
        const text = [
            'LCD PERFORMANCE',
            `Tick:   ${this.tickMs.toFixed(2)} ms`,
            `Audio:  ${this.audioMs.toFixed(2)} ms  (~${Math.round(1000 / MeterConstants.MASTER_TIMER_MS)} Hz)`,
            `FFT:    ${this.fftMs.toFixed(2)} ms  gate=${this.spectrumTierMs}ms [${specTierLabel}]  N=${this.spectrumFftSize}`,
            `Dirty skip: ${this.spectrumSkipped} clean/s`,
            `Paint:  ${this.paintMs.toFixed(2)} ms   FPS: ${this.#fps.toFixed(1)}`,
            `BG cache: ${bgHitLabel}`,
            `Master Timer: ${MeterConstants.MASTER_TIMER_MS} ms`
        ];
        for (let i = 0; i < text.length; i++) {
            gr.GdiDrawText(text[i], font, GdiUtils.colour(220, 220, 220), x + pad, y + pad + i * lineH, boxW - pad * 2, lineH, MeterConstants.TEXT_LEFT_MIDDLE);
        }
    }
}

// ============================================================================================
// 11. SETTINGS SCHEMA & PROPERTY MANAGER
// ============================================================================================
class SettingsSchema {
    static FIELDS = [
        { key: 'theme',             prop: MeterConstants.SCRIPT_NAME + '.Theme',             type: 'str',  def: 'Pioneer Amber' },
        { key: 'syncTheme',         prop: MeterConstants.SCRIPT_NAME + '.SyncTheme',         type: 'bool', def: true },
        { key: 'layout',            prop: MeterConstants.SCRIPT_NAME + '.Layout',            type: 'enum', def: 'Horizontal', values: MeterConstants.LAYOUT_OPTIONS },
        { key: 'segments',          prop: MeterConstants.SCRIPT_NAME + '.Segments',          type: 'enum', def: MeterConstants.DEFAULT_SEGMENTS, values: MeterConstants.SEGMENT_COUNTS, num: true },
        { key: 'peakHold',          prop: MeterConstants.SCRIPT_NAME + '.PeakHold',          type: 'bool', def: true },
        { key: 'meterMode',         prop: MeterConstants.SCRIPT_NAME + '.MeterMode',         type: 'enum', def: 'RMS', values: MeterConstants.METER_MODE_OPTIONS },
        { key: 'attack',            prop: MeterConstants.SCRIPT_NAME + '.Attack',            type: 'enum', def: 'Medium', values: MeterConstants.SPEED_OPTIONS },
        { key: 'release',           prop: MeterConstants.SCRIPT_NAME + '.Release',           type: 'enum', def: 'Medium', values: MeterConstants.SPEED_OPTIONS },
        { key: 'showGlow',          prop: MeterConstants.SCRIPT_NAME + '.ShowGlow',          type: 'bool', def: true },
        { key: 'glowOpacity',       prop: MeterConstants.SCRIPT_NAME + '.GlowOpacity',       type: 'int',  def: 30,  min: 0, max: 255 },
        { key: 'showPhosphor',      prop: MeterConstants.SCRIPT_NAME + '.ShowPhosphor',      type: 'bool', def: true },
        { key: 'phosphorOpacity',   prop: MeterConstants.SCRIPT_NAME + '.PhosphorOpacity',   type: 'int',  def: 15,  min: 0, max: 255 },
        { key: 'showScanlines',     prop: MeterConstants.SCRIPT_NAME + '.ShowScanlines',     type: 'bool', def: false },
        { key: 'scanlineOpacity',   prop: MeterConstants.SCRIPT_NAME + '.ScanlineOpacity',   type: 'int',  def: 28,  min: 0, max: 255 },
        { key: 'showReflection',    prop: MeterConstants.SCRIPT_NAME + '.ShowReflection',    type: 'bool', def: true },
        { key: 'reflectionOpacity', prop: MeterConstants.SCRIPT_NAME + '.ReflectionOpacity', type: 'int',  def: 25,  min: 0, max: 255 },
        { key: 'onSegmentOpacity',  prop: MeterConstants.SCRIPT_NAME + '.OnSegmentOpacity',  type: 'int',  def: 220, min: 0, max: 255 },
        { key: 'offSegmentOpacity', prop: MeterConstants.SCRIPT_NAME + '.OffSegmentOpacity', type: 'int',  def: 15,  min: 0, max: 255 },
        { key: 'flatMode',          prop: MeterConstants.SCRIPT_NAME + '.FlatMode',          type: 'bool', def: false },
        { key: 'flatGradient',      prop: MeterConstants.SCRIPT_NAME + '.FlatGradient',      type: 'int',  def: MeterConstants.GRADIENT_STYLE_STRIP, min: MeterConstants.GRADIENT_STYLE_MIN, max: MeterConstants.GRADIENT_STYLE_MAX,
          coerce: (raw, def) => {
              const n = Number(raw);
              if (Number.isInteger(n) && n >= MeterConstants.GRADIENT_STYLE_MIN && n <= MeterConstants.GRADIENT_STYLE_MAX) return n;
              return (raw === 'true' || raw === '1' || raw === true) ? MeterConstants.GRADIENT_STYLE_STRIP : def;
          }
        },
        { key: 'displayMode',       prop: MeterConstants.SCRIPT_NAME + '.DisplayMode',       type: 'enum', def: 'Peak Meter', values: MeterConstants.DISPLAY_MODE_OPTIONS },
        { key: 'spectrumBars',      prop: MeterConstants.SCRIPT_NAME + '.SpectrumBars',      type: 'enum', def: MeterConstants.DEFAULT_SPECTRUM_BARS, values: MeterConstants.SPECTRUM_BAR_COUNTS, num: true },
        { key: 'profiler',          prop: MeterConstants.SCRIPT_NAME + '.Profiler',          type: 'bool', def: false },
        { key: 'customThemeFile',   prop: MeterConstants.SCRIPT_NAME + '.CustomThemeFile',   type: 'path', def: `${PROFILE_BASE}lcd_custom_themes.json`, resetAll: true },
        { key: 'showMarkers',       prop: MeterConstants.SCRIPT_NAME + '.ShowMarkers',       type: 'bool', def: true },
        { key: 'markerBorderSize',  prop: MeterConstants.SCRIPT_NAME + '.MarkerBorderSize',  type: 'int',  def: DEFAULT_MARKER_LOGICAL, min: MARKER_AREA_LOGICAL_MIN, max: MARKER_AREA_LOGICAL_MAX },
        { key: 'extraSegments',     prop: MeterConstants.SCRIPT_NAME + '.ExtraSegments',     type: 'int',  def: 0, min: 0, max: MeterConstants.EXTRA_SEGMENT_MAX },
        { key: 'panelPad',          prop: MeterConstants.SCRIPT_NAME + '.PanelPad',          type: 'int',  def: DEFAULT_PANEL_PAD_LOGICAL, min: PANEL_PAD_LOGICAL_MIN, max: PANEL_PAD_LOGICAL_MAX },
        { key: 'padLeft',           prop: MeterConstants.SCRIPT_NAME + '.PadLeft',           type: 'int',  def: DEFAULT_SIDE_PAD_LOGICAL, min: 0, max: SIDE_PAD_LOGICAL_MAX },
        { key: 'padRight',          prop: MeterConstants.SCRIPT_NAME + '.PadRight',          type: 'int',  def: DEFAULT_SIDE_PAD_LOGICAL, min: 0, max: SIDE_PAD_LOGICAL_MAX },
        { key: 'padTop',            prop: MeterConstants.SCRIPT_NAME + '.PadTop',            type: 'int',  def: DEFAULT_SIDE_PAD_LOGICAL, min: 0, max: SIDE_PAD_LOGICAL_MAX },
        { key: 'padBottom',         prop: MeterConstants.SCRIPT_NAME + '.PadBottom',         type: 'int',  def: DEFAULT_SIDE_PAD_LOGICAL, min: 0, max: SIDE_PAD_LOGICAL_MAX },
        { key: 'bezelFolder',       prop: MeterConstants.SCRIPT_NAME + '.BezelFolder',       type: 'path', def: `${PROFILE_BASE}skins\\overlay`, resetAll: true, fallbackToDef: true },
        { key: 'bezelEnabled',      prop: MeterConstants.SCRIPT_NAME + '.BezelEnabled',      type: 'bool', def: false },
        { key: 'bezelFile',         prop: MeterConstants.SCRIPT_NAME + '.BezelFile',         type: 'str',  def: '' },
        { key: 'qualityPreset',     prop: MeterConstants.SCRIPT_NAME + '.QualityPreset',     type: 'enum', def: 'Balanced', values: MeterConstants.QUALITY_PRESET_OPTIONS },
        { key: 'meterRange',        prop: MeterConstants.SCRIPT_NAME + '.MeterRange',        type: 'enum', def: -60, values: MeterConstants.METER_RANGE_OPTIONS, num: true },
        { key: 'peakHoldMs',        prop: MeterConstants.SCRIPT_NAME + '.PeakHoldMs',        type: 'int',  def: MeterConstants.PEAK_HOLD_MS, min: MeterConstants.PEAK_HOLD_MIN_MS, max: MeterConstants.PEAK_HOLD_MAX_MS }
    ];

    static keys() {
        const o = {
            styleRevision:       MeterConstants.SCRIPT_NAME + '.StyleRevision',
            calibrationRevision: MeterConstants.SCRIPT_NAME + '.CalibrationRevision'
        };
        for (const f of this.FIELDS) o[f.key] = f.prop;
        return o;
    }

    static defaults() {
        const o = {};
        for (const f of this.FIELDS) o[f.key] = f.def;
        return o;
    }

    static coerce(f, raw) {
        if (typeof f.coerce === 'function') return f.coerce(raw, f.def);
        switch (f.type) {
            case 'bool':
                if (typeof raw === 'boolean') return raw;
                if (typeof raw === 'string') return raw !== 'false' && raw !== '0' && raw !== '';
                return Boolean(raw);
            case 'int': {
                const n = Math.round(Number(raw));
                return Number.isNaN(n) ? f.def : GdiUtils.clamp(n, f.min, f.max);
            }
            case 'enum': {
                const v = f.num ? Number(raw) : String(raw);
                return f.values.includes(v) ? v : f.def;
            }
            case 'path': {
                const s = GdiUtils.sanitizePath(String(raw ?? f.def));
                return f.fallbackToDef ? (s || f.def) : s;
            }
            default:
                return String(raw ?? f.def);
        }
    }
}

class PropertyManager {
    #pendingSaves = Object.create(null);
    #saveTimer = null;
    extraSegmentsPreFlat = 0;
    lastFinalizedTheme = '';

    keys     = SettingsSchema.keys();
    defaults = SettingsSchema.defaults();
    values   = {};

    constructor() {
        for (const f of SettingsSchema.FIELDS) {
            this.values[f.key] = SettingsSchema.coerce(f, window.GetProperty(f.prop, f.def));
        }

        if (Number(window.GetProperty(this.keys.calibrationRevision, 0)) < 1) {
            this.values.extraSegments = 0;
            window.SetProperty(this.keys.extraSegments, 0);
            window.SetProperty(this.keys.calibrationRevision, 1);
        }

        this.extraSegmentsPreFlat = this.values.flatMode ? 0 : this.values.extraSegments;
        this.lastFinalizedTheme   = this.values.theme !== '~Preview' ? this.values.theme : this.defaults.theme;

        if (Number(window.GetProperty(this.keys.styleRevision, 0)) < 2) {
            this.values.meterMode = 'RMS';
            window.SetProperty(this.keys.meterMode, this.values.meterMode);
            window.SetProperty(this.keys.styleRevision, 2);
        }
    }

    set(name, value, sync = false) {
        this.values[name] = value;
        const propKey = this.keys[name];
        if (!propKey) return;
        if (sync) {
            delete this.#pendingSaves[propKey];
            window.SetProperty(propKey, value);
        } else {
            this.#pendingSaves[propKey] = value;
            this.#persistSoon();
        }
    }

    #persistSoon() {
        if (this.#saveTimer) window.ClearTimeout(this.#saveTimer);
        this.#saveTimer = window.SetTimeout(() => {
            this.#saveTimer = null;
            this.persistSync();
        }, 250);
    }

    persistSync() {
        if (this.#saveTimer) {
            window.ClearTimeout(this.#saveTimer);
            this.#saveTimer = null;
        }
        for (const [k, v] of Object.entries(this.#pendingSaves)) {
            window.SetProperty(k, v);
        }
        this.#pendingSaves = Object.create(null);
    }

    setTheme(name, themeManager = null) {
        if (name !== '~Preview') {
            this.lastFinalizedTheme = name;
            if (themeManager) {
                themeManager.draftBaseTheme = name;
                themeManager.seedDraftFromTheme(themeManager.get(name));
            }
        }
        this.set('theme', name, true);
    }

    applyQualityPreset(name) {
        const preset = MeterConstants.QUALITY_PRESET_OPTIONS.includes(name) ? name : this.defaults.qualityPreset;
        const settings = {
            Low:      { showGlow: false, showPhosphor: false, showScanlines: false, showReflection: false, spectrumBars: 20 },
            Balanced: { showGlow: true,  showPhosphor: true,  showScanlines: false, showReflection: true,  spectrumBars: MeterConstants.DEFAULT_SPECTRUM_BARS },
            High:     { showGlow: true,  showPhosphor: true,  showScanlines: true,  showReflection: true,  spectrumBars: 60 }
        }[preset];
        for (const [key, val] of Object.entries(settings)) this.set(key, val);
        this.set('qualityPreset', preset);
    }

    resetVisuals() {
        for (const f of SettingsSchema.FIELDS) {
            if (f.resetAll) continue;
            if (f.key === 'theme') this.setTheme(f.def);
            else this.set(f.key, f.def, true);
        }
    }

    resetAll() {
        for (const f of SettingsSchema.FIELDS) {
            if (f.key === 'theme') this.setTheme(f.def);
            else this.set(f.key, f.def, true);
        }
    }
}

// ============================================================================================
// 12. THEME MANAGER (SYNCHRONIZED FULL 20 HARDWARE THEMES)
// ============================================================================================
class ThemeManager {
    static BUILTIN_DEFS = [
        { name: 'Classic Green',   bg: [5,12,5],      in: [14,60,20],    ac: [30,180,30],   tx: [180,240,180], wr: [255,60,60],   pk: [30,180,30],   sp: [180,200,40] },
        { name: 'Retro Amber',     bg: [15,8,0],      in: [75,40,5],     ac: [190,110,0],   tx: [245,200,140], wr: [255,70,50],   pk: [190,110,0],   sp: [230,140,20] },
        { name: 'Cyber Blue',      bg: [0,5,15],      in: [10,45,80],    ac: [0,130,200],   tx: [160,215,255], wr: [255,70,80],   pk: [0,130,200],   sp: [0,190,220] },
        { name: 'Cool Blue',       bg: [8,12,12],     in: [35,65,75],    ac: [100,180,215], tx: [190,230,245], wr: [255,80,80],   pk: [100,180,215], sp: [120,210,210] },
        { name: 'Deep Red',        bg: [10,0,0],      in: [65,10,10],    ac: [170,15,15],   tx: [250,180,180], wr: [255,120,40],  pk: [170,15,15],   sp: [220,50,20] },
        { name: 'Steel Grey',      bg: [20,20,20],    in: [65,65,65],    ac: [160,160,160], tx: [230,230,230], wr: [255,80,80],   pk: [160,160,160], sp: [200,170,120] },
        { name: 'Night Purple',    bg: [8,0,12],      in: [50,25,75],    ac: [120,60,180],  tx: [220,190,245], wr: [255,70,100],  pk: [120,60,180],  sp: [170,80,210] },
        { name: 'Dim White',       bg: [180,180,180], in: [145,145,145], ac: [30,30,30],   tx: [15,15,15],    wr: [180,30,30],   pk: [30,30,30],    sp: [80,80,80] },
        { name: 'Pioneer Amber',   bg: [20,12,5],     in: [117,53,8],    ac: [255,178,45],  tx: [255,233,141] },
        { name: 'Technics Green',  bg: [5,17,9],      in: [14,98,42],    ac: [80,248,128],  tx: [190,255,194] },
        { name: 'Sony ES Blue',    bg: [4,11,20],     in: [10,65,118],   ac: [68,180,255],  tx: [190,235,255] },
        { name: 'Yamaha Ice',      bg: [8,17,19],     in: [22,99,104],   ac: [96,242,234],  tx: [205,255,255] },
        { name: 'Kenwood Red',     bg: [22,5,5],      in: [116,19,16],   ac: [255,79,57],   tx: [255,194,177] },
        { name: 'Sansui Lime',     bg: [13,18,4],     in: [81,104,12],   ac: [196,244,52],  tx: [241,255,173] },
        { name: 'Marantz Blue',    bg: [5,9,17],      in: [30,51,133],   ac: [88,126,255],  tx: [207,220,255] },
        { name: 'Akai Orange',     bg: [24,10,3],     in: [130,48,5],    ac: [255,130,28],  tx: [255,216,144] },
        { name: 'Sharp Aqua',      bg: [2,19,20],     in: [4,106,112],   ac: [20,239,229],  tx: [177,255,249] },
        { name: 'Aiwa VFD',        bg: [2,16,15],     in: [4,74,65],     ac: [52,222,183],  tx: [181,255,226] },
        { name: 'Nakamichi Gold',  bg: [21,15,5],     in: [110,78,16],   ac: [247,193,67],  tx: [255,235,168] },
        { name: 'JVC Violet',      bg: [16,6,22],     in: [79,25,119],   ac: [210,102,255], tx: [246,206,255] }
    ];

    themes   = [];
    themeMap = new Map();
    customThemes = [];

    draftTheme = {
        name:       'New Custom Theme',
        background: GdiUtils.colour(20,  12,   5),
        inactive:   GdiUtils.colour(117, 53,   8),
        active:     GdiUtils.colour(255, 178,  45),
        text:       GdiUtils.colour(255, 233, 141),
        warning:    GdiUtils.colour(255,  83,  48),
        peak:       GdiUtils.colour(255, 178,  45),
        subPeak:    GdiUtils.colour(255, 134,  46)
    };
    draftBaseTheme = null;

    constructor() {
        for (const d of ThemeManager.BUILTIN_DEFS) {
            const t = this.makeTheme(d.name, d.bg, d.in, d.ac, d.tx, d.wr || null, d.pk || null, d.sp || null);
            this.themes.push(t);
            this.themeMap.set(t.name, t);
        }
    }

    updateDraft(key, packed) {
        this.draftTheme[key] = (Number(packed) >>> 0);
    }

    seedDraftFromTheme(theme) {
        if (!theme) return;
        this.draftTheme.background = (theme.background >>> 0);
        this.draftTheme.inactive   = (theme.inactive   >>> 0);
        this.draftTheme.active     = (theme.active     >>> 0);
        this.draftTheme.text       = (theme.text       >>> 0);
        this.draftTheme.warning    = (theme.warning    >>> 0);
        this.draftTheme.peak       = (theme.peak       >>> 0);
        this.draftTheme.subPeak    = (theme.subPeak    >>> 0);
    }

    makeTheme(name, background, inactive, active, text, warning, peak, subPeak) {
        const pack = (v) => {
            if (Array.isArray(v)) {
                return GdiUtils.colour(
                    GdiUtils.clamp(Number(v[0]) || 0, 0, 255),
                    GdiUtils.clamp(Number(v[1]) || 0, 0, 255),
                    GdiUtils.clamp(Number(v[2]) || 0, 0, 255)
                );
            }
            return (Number(v) >>> 0);
        };
        const w = warning ?? [255, 83, 48];
        const p = peak ?? active;
        const sp = subPeak ?? active;
        return {
            name:       String(name).trim(),
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

    get(name) { 
        return this.themeMap.get(name) ?? this.themes[0]; 
    }
    
    names() { 
        return this.themes.map(t => t.name); 
    }

    removeCustom(name) {
        const t = this.themeMap.get(name);
        if (!t) return { ok: false, error: `Theme "${name}" not found.` };
        if (!t.custom) return { ok: false, error: `Theme "${name}" is not a custom theme.` };
        
        const iList = this.themes.indexOf(t);
        if (iList !== -1) this.themes.splice(iList, 1);
        const iCustom = this.customThemes.indexOf(t);
        if (iCustom !== -1) this.customThemes.splice(iCustom, 1);
        this.themeMap.delete(name);
        return { ok: true, name };
    }

    setPreview(t) { 
        this.themeMap.set('~Preview', t); 
    }

    clearPreview() {
        const p = this.themeMap.get('~Preview');
        if (p) {
            const idx = this.themes.indexOf(p);
            if (idx !== -1) this.themes.splice(idx, 1);
            this.themeMap.delete('~Preview');
        }
        return p;
    }

    isBuiltin(name) {
        return ThemeManager.BUILTIN_DEFS.some(d => d.name === name);
    }

    loadFromFile(filePath) {
        if (!filePath?.trim()) return { ok: false, error: 'No file path given.' };
        const cleanPath = GdiUtils.sanitizePath(filePath);
        try {
            if (!utils.IsFile(cleanPath)) return { ok: false, error: `File not found:\n${cleanPath}` };
            const raw = (typeof utils.ReadUTF8 === 'function')
                ? utils.ReadUTF8(cleanPath)
                : utils.ReadTextFile(cleanPath);
            if (!raw?.trim()) return { ok: false, error: `JSON file is empty:\n${cleanPath}` };
            return this.#parseAndRegister(raw, cleanPath);
        } catch (e) {
            return { ok: false, error: `File read error:\n${e.message || e}` };
        }
    }

    #parseAndRegister(jsonText, sourceLabel) {
        let parsed;
        try {
            parsed = JSON.parse(jsonText);
        } catch (e) {
            return { ok: false, error: `JSON parse error: ${e.message || e}` };
        }
        if (!Array.isArray(parsed)) {
            if (typeof parsed === 'object' && parsed !== null && parsed.name) {
                parsed = [parsed];
            } else {
                return { ok: false, error: 'JSON must be an array of theme objects.' };
            }
        }

        let added = 0, updated = 0;
        const errors = [];

        for (let i = 0; i < parsed.length; i++) {
            const d = parsed[i];
            const valid = this.#validateThemeDef(d, i);
            if (valid !== true) { errors.push(valid); continue; }

            const name = String(d.name).trim();
            if (name === '~Preview' || this.isBuiltin(name)) continue;

            const t = this.makeTheme(
                name,
                d.background, d.inactive, d.active, d.text,
                d.warning || null,
                d.peak || null,
                d.subPeak || null
            );
            t.custom = true;

            if (this.themeMap.has(name)) {
                const oldTheme = this.themeMap.get(name);
                const idx = this.themes.indexOf(oldTheme);
                if (idx !== -1) this.themes[idx] = t;
                const ci = this.customThemes.indexOf(oldTheme);
                if (ci !== -1) {
                    this.customThemes[ci] = t;
                } else if (!this.customThemes.includes(t)) {
                    this.customThemes.push(t);
                }
                this.themeMap.set(name, t);
                updated++;
            } else {
                this.themes.push(t);
                this.themeMap.set(name, t);
                this.customThemes.push(t);
                added++;
            }
        }

        const summary = `Loaded from: ${sourceLabel}\nAdded: ${added}  Updated: ${updated}${errors.length ? `\nWarnings:\n${errors.join('\n')}` : ''}`;
        return { ok: (added + updated) > 0, count: added + updated, error: errors.length ? summary : null, summary };
    }

    #validateThemeDef(d, idx) {
        if (typeof d !== 'object' || d === null) return `Entry ${idx}: not an object.`;
        if (!d.name || typeof d.name !== 'string' || !d.name.trim()) return `Entry ${idx}: missing name.`;
        
        const checkChannel = (name, arr) => {
            if (!Array.isArray(arr) || arr.length < 3) return `"${name}" must be an [r,g,b] array.`;
            for (let ci = 0; ci < 3; ci++) {
                const v = arr[ci];
                if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 255) return `"${name}" invalid color channel.`;
            }
            return null;
        };

        for (const key of ['background', 'inactive', 'active', 'text']) {
            const err = checkChannel(key, d[key]);
            if (err) return `Entry ${idx}: ${err}`;
        }
        return true;
    }

    saveToFile(filePath, themeName) {
        if (!filePath?.trim()) return { ok: false, error: 'No file path given.' };
        const cleanPath = GdiUtils.sanitizePath(filePath);
        let list;
        if (themeName === '*') {
            list = this.themes;
        } else if (!themeName) {
            list = this.customThemes;
        } else {
            const t = this.themeMap.get(themeName);
            if (!t) return { ok: false, error: `Theme "${themeName}" not found.` };
            list = [t];
        }

        try {
            const lastSlash = Math.max(cleanPath.lastIndexOf('\\'), cleanPath.lastIndexOf('/'));
            if (lastSlash > 0) {
                const folder = cleanPath.substring(0, lastSlash);
                if (typeof utils.CreateFolder === 'function') {
                    try { utils.CreateFolder(folder); } catch {}
                }
            }
            const arr  = list.map(t => this.#themeToJson(t));
            const json = JSON.stringify(arr, null, 2);
            const ok = utils.WriteTextFile(cleanPath, json, false);
            if (!ok || !utils.IsFile(cleanPath)) return { ok: false, error: `Write failed to: ${cleanPath}` };
            return { ok: true, count: arr.length, path: cleanPath };
        } catch (e) {
            return { ok: false, error: String(e.message || e) };
        }
    }

    #themeToJson(theme) {
        const rgb = (col) => [(col >>> 16) & 255, (col >>> 8) & 255, col & 255];
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

// ============================================================================================
// 13. MENU MANAGER (DECLARATIVE MENU BUILDER)
// ============================================================================================
class MenuManager {
    main;

    constructor(main) {
        this.main = main;
    }

    #ensureDraftSeeded() {
        const applied = this.main.properties.values.theme;
        const baseName = applied === '~Preview' ? this.main.properties.lastFinalizedTheme : applied;
        if (this.main.themes.draftBaseTheme !== baseName) {
            this.main.themes.draftBaseTheme = baseName;
            this.main.themes.seedDraftFromTheme(this.main.themes.get(baseName));
        }
    }

    #doColorPicker(label, key) {
        this.#ensureDraftSeeded();
        const d = this.main.themes.draftTheme;
        const startColor = d[key] >>> 0;
        let newColor;
        try {
            newColor = utils.ColourPicker(window.ID, startColor);
        } catch (e) {
            fb.ShowPopupMessage(`Color picker unavailable:\n${e.message || e}`, MeterConstants.SCRIPT_NAME);
            return;
        }
        if (newColor === -1) return;
        const packed = (newColor | 0xFF000000) >>> 0;
        if (packed === startColor) return;

        this.main.themes.updateDraft(key, packed);

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
        this.main.invalidateCaches({ geometry: true, spectrum: true, background: true, effect: true, foreground: true });
        this.main.invalidate();
    }

    #doFinalizeTheme() {
        this.#ensureDraftSeeded();
        const draft = this.main.themes.draftTheme;
        let name;
        try {
            name = utils.InputBox(window.ID, 'Enter a name for your custom theme:', 'Save Theme', draft.name, true);
        } catch {
            name = null;
        }
        if (!name?.trim()) return;
        name = name.trim();

        if (name === '~Preview' || this.main.themes.isBuiltin(name)) {
            fb.ShowPopupMessage(`"${name}" is a reserved name. Choose a different name.`, MeterConstants.SCRIPT_NAME);
            return;
        }

        const d = this.main.themes.draftTheme;
        const t = this.main.themes.makeTheme(name, d.background, d.inactive, d.active, d.text, d.warning, d.peak, d.subPeak);
        t.custom = true;

        if (this.main.themes.themeMap.has(name)) {
            const oldRef = this.main.themes.themeMap.get(name);
            const idx = this.main.themes.themes.indexOf(oldRef);
            if (idx !== -1) this.main.themes.themes[idx] = t;
            const ci = this.main.themes.customThemes.indexOf(oldRef);
            if (ci !== -1) {
                this.main.themes.customThemes[ci] = t;
            } else if (!this.main.themes.customThemes.includes(t)) {
                this.main.themes.customThemes.push(t);
            }
        } else {
            this.main.themes.themes.push(t);
            this.main.themes.customThemes.push(t);
        }
        this.main.themes.themeMap.set(name, t);
        this.main.themes.clearPreview();

        this.main.themes.draftTheme.name = name;
        this.main.properties.setTheme(name, this.main.themes);
        this.main.invalidateCaches({ geometry: true, spectrum: true, background: true, effect: true, foreground: true });
        this.main.invalidate();

        let savePath = this.main.properties.values.customThemeFile;
        if (!savePath?.trim()) {
            savePath = this.#promptForSavePath('Save Theme File', 'lcd_custom_themes.json');
            if (savePath) this.main.properties.set('customThemeFile', savePath, true);
        }

        if (savePath?.trim()) {
            const saveResult = this.main.themes.saveToFile(savePath, null);
            if (saveResult.ok) {
                fb.ShowPopupMessage(`Theme "${name}" saved and written to:\n${savePath}`, MeterConstants.SCRIPT_NAME);
            } else {
                fb.ShowPopupMessage(`Theme "${name}" saved to session, but file write failed:\n${saveResult.error || 'Unknown error'}`, MeterConstants.SCRIPT_NAME);
            }
        }
    }

    #doRemoveCustomTheme(name) {
        const result = this.main.themes.removeCustom(name);
        if (!result.ok) {
            fb.ShowPopupMessage(result.error || 'Could not remove theme.', MeterConstants.SCRIPT_NAME);
            return;
        }
        if (this.main.themes.draftBaseTheme === name) this.main.themes.draftBaseTheme = null;

        const current = this.main.properties.values.theme;
        const wasInUse = current === name || (current === '~Preview' && this.main.properties.lastFinalizedTheme === name);
        if (wasInUse) {
            const fallback = (this.main.properties.lastFinalizedTheme !== name)
                ? this.main.properties.lastFinalizedTheme
                : (this.main.themes.themes[0]?.name ?? 'Pioneer Amber');
            this.main.properties.lastFinalizedTheme = fallback;
            this.main.themes.clearPreview();
            this.main.properties.setTheme(fallback, this.main.themes);
        }

        const savePath = this.main.properties.values.customThemeFile;
        if (savePath?.trim()) {
            this.main.themes.saveToFile(savePath, null);
        }

        this.main.invalidateCaches({ geometry: true, spectrum: true, background: true, effect: true, foreground: true });
        this.main.invalidate();
        fb.ShowPopupMessage(`Custom theme "${name}" removed.`, MeterConstants.SCRIPT_NAME);
    }

    #promptForFilePath(title) {
        try {
            const path = utils.InputBox(window.ID, 'Enter the full path to your JSON theme file:', title, this.main.properties.values.customThemeFile || '', true);
            return path?.trim() ? GdiUtils.sanitizePath(path) : null;
        } catch {}
        return null;
    }

    #promptForSavePath(title, defaultName) {
        try {
            const def = this.main.properties.values.customThemeFile || `${PROFILE_BASE}${defaultName || 'lcd_custom_themes.json'}`;
            const path = utils.InputBox(window.ID, 'Enter the full path to save the JSON theme file:', title, def, true);
            return path?.trim() ? GdiUtils.sanitizePath(path) : null;
        } catch {}
        return null;
    }

    #shortPath(p) {
        if (!p) return '';
        const parts = p.replace(/\\/g, '/').split('/');
        return parts.length > 2 ? `…/${parts[parts.length - 1]}` : p;
    }

    #doSetDefaultSavePath() {
        const path = GdiUtils.prompt(`Enter default path for custom themes JSON:\n(e.g. ${PROFILE_BASE}lcd_custom_themes.json)`, 'Set Save Path', this.main.properties.values.customThemeFile || (`${PROFILE_BASE}lcd_custom_themes.json`));
        if (!path) return;
        this.main.properties.set('customThemeFile', GdiUtils.sanitizePath(path), true);
        fb.ShowPopupMessage(`Default save path set to:\n${path}`, MeterConstants.SCRIPT_NAME);
    }

    #doLoadThemeFile() {
        const path = this.#promptForFilePath('Load Theme JSON');
        if (!path) return;
        const result = this.main.themes.loadFromFile(path);
        if (result.ok) {
            this.main.properties.set('customThemeFile', path, true);
            this.main.invalidateCaches({ geometry: true, spectrum: true, background: true, effect: true, foreground: true });
            fb.ShowPopupMessage(result.summary || (`Loaded ${result.count} theme(s) from:\n${path}`), MeterConstants.SCRIPT_NAME);
        } else {
            fb.ShowPopupMessage(`Failed to load themes:\n\n${result.error || 'Unknown error'}`, MeterConstants.SCRIPT_NAME);
        }
    }

    #doReloadThemeFile() {
        const path = this.main.properties.values.customThemeFile;
        if (!path?.trim()) {
            fb.ShowPopupMessage('No file path stored. Use "Load themes from JSON file…" first.', MeterConstants.SCRIPT_NAME);
            return;
        }
        const result = this.main.themes.loadFromFile(path);
        if (result.ok) {
            this.main.invalidateCaches({ geometry: true, spectrum: true, background: true, effect: true, foreground: true });
            fb.ShowPopupMessage(result.summary || (`Reloaded ${result.count} theme(s).`), MeterConstants.SCRIPT_NAME);
        } else {
            fb.ShowPopupMessage(`Failed to reload:\n\n${result.error || 'Unknown error'}`, MeterConstants.SCRIPT_NAME);
        }
    }

    #doSaveThemes(which) {
        const label = (which === '*') ? 'Export All Themes' : 'Save Custom Themes';
        const def   = (which === '*') ? 'lcd_all_themes.json' : 'lcd_custom_themes.json';
        const path  = this.#promptForSavePath(label, def);
        if (!path) return;
        const result = this.main.themes.saveToFile(path, which);
        if (result.ok) {
            if (which !== '*') this.main.properties.set('customThemeFile', path, true);
            fb.ShowPopupMessage(`Saved ${result.count} theme(s) to:\n${path}`, MeterConstants.SCRIPT_NAME);
        } else {
            fb.ShowPopupMessage(`Save failed:\n\n${result.error || 'Unknown error'}`, MeterConstants.SCRIPT_NAME);
        }
    }

    #doExportTemplate() {
        const path = this.#promptForSavePath('Export Built-in Theme Template', 'lcd_theme_template.json');
        if (!path) return;
        const result = this.main.themes.exportTemplate(path);
        if (result.ok) {
            fb.ShowPopupMessage(`Template exported (${result.count} built-in themes) to:\n${path}`, MeterConstants.SCRIPT_NAME);
        } else {
            fb.ShowPopupMessage(`Export failed:\n\n${result.error || 'Unknown error'}`, MeterConstants.SCRIPT_NAME);
        }
    }

    show(x, y, mask) {
        if (panelState !== MeterConstants.LIFECYCLE.LIVE) return false;
        if (mask & 4) return false;

        if (this.main.opacitySliderTarget) {
            this.main.opacitySliderTarget = null;
            this.main.invalidate();
        }
        this.#ensureDraftSeeded();

        const names      = this.main.themes.names();
        const props      = this.main.properties.values;
        const isSpectrum = props.displayMode === 'Spectrum Analyzer';
        const hasFile    = Boolean(props.customThemeFile && props.customThemeFile.trim() !== '');
        const hasCustom  = this.main.themes.customThemes.length > 0;
        const pct        = (v) => `${Math.round((v / 255) * 100)}%`;

        const labels = {
            Glow:        'LCD Glow',
            Phosphor:    'Phosphor Mask',
            Scanlines:   'Scanlines',
            Reflection:  'LCD Reflection',
            OnSegments:  'On Segments',
            OffSegments: 'Off Segments'
        };

        const menu = new MenuBuilder();

        // 1. Theme
        menu.addSubMenu('Theme', (themeMenu) => {
            themeMenu.addItem('Sync Theme', () => {
                const nextSync = !props.syncTheme;
                this.main.properties.set('syncTheme', nextSync);
                if (nextSync) {
                    try { window.NotifyOthers('LcdThemeSync', props.theme); } catch {}
                }
            }, { checked: props.syncTheme });
            themeMenu.addSeparator();

            names.forEach((name, i) => {
                if (i === 8 || i === 20) themeMenu.addSeparator();
                const isCustom = this.main.themes.themeMap.get(name)?.custom;
                themeMenu.addItem(`${GdiUtils.escapeMenuLabel(name)}${isCustom ? '  [custom]' : ''}`, () => {
                    this.main.themes.clearPreview();
                    this.main.properties.setTheme(name, this.main.themes);
                    this.main.invalidateCaches({ background: true, effect: true, foreground: true, spectrum: true });
                    if (this.main.properties.values.syncTheme) {
                        try { window.NotifyOthers('LcdThemeSync', name); } catch {}
                    }
                }, { radio: props.theme === name });
            });

            themeMenu.addSeparator();
            themeMenu.addSubMenu('Custom Theme JSON', (themeCustomMenu) => {
                const safeThemeShort = GdiUtils.escapeMenuLabel(this.#shortPath(props.customThemeFile));
                themeCustomMenu.addItem('Load themes from JSON file…', () => this.#doLoadThemeFile());
                themeCustomMenu.addItem(`Reload from last file${hasFile ? `  (${safeThemeShort})` : ''}`, () => this.#doReloadThemeFile(), { disabled: !hasFile });
                themeCustomMenu.addSeparator();
                themeCustomMenu.addItem('Save custom themes to JSON…', () => this.#doSaveThemes(null), { disabled: !hasCustom });
                themeCustomMenu.addItem('Export all themes to JSON…', () => this.#doSaveThemes('*'));
                themeCustomMenu.addItem('Export template (all built-ins)…', () => this.#doExportTemplate());
                themeCustomMenu.addSeparator();
                themeCustomMenu.addItem(`Set Default Save Path…${hasFile ? `  (${safeThemeShort})` : ''}`, () => this.#doSetDefaultSavePath());
            });

            themeMenu.addSubMenu('Theme Creator', (creatorMenu) => {
                const draftName = GdiUtils.escapeMenuLabel(this.main.themes.draftTheme.name);
                const steps = [
                    ['1. Set Background Color…',         'Background',         'background'],
                    ['2. Set Inactive Segment Color…',   'Inactive Segment',   'inactive'],
                    ['3. Set Active Segment Color…',     'Active Segment',     'active'],
                    ['4. Set Text / Scale Color…',       'Text / Scale',       'text'],
                    ['5. Set Warning / Overload Color…', 'Warning / Overload', 'warning'],
                    ['6. Set Peak Marker Color…',        'Peak Marker',        'peak'],
                    ['7. Set Sub-Peak Zone Color…',      'Sub-Peak Zone',      'subPeak']
                ];
                for (const [menuLabel, pickerLabel, key] of steps) {
                    creatorMenu.addItem(menuLabel, () => this.#doColorPicker(pickerLabel, key));
                }
                creatorMenu.addSeparator();
                creatorMenu.addItem(`Save as Custom Theme…  (draft: "${draftName}")`, () => this.#doFinalizeTheme());
                creatorMenu.addSeparator();

                creatorMenu.addSubMenu('Remove Custom Theme…', (removeThemeMenu) => {
                    const customs = this.main.themes.customThemes;
                    if (customs.length) {
                        for (const ct of customs) {
                            removeThemeMenu.addItem(GdiUtils.escapeMenuLabel(ct.name), () => this.#doRemoveCustomTheme(ct.name), { radio: ct.name === props.theme });
                        }
                    } else {
                        removeThemeMenu.addItem('No custom themes', null, { disabled: true });
                    }
                });
            });
        });

        // 2. Display Mode
        menu.addSubMenu('Display Mode', (displayModeMenu) => {
            for (const mode of MeterConstants.DISPLAY_MODE_OPTIONS) {
                displayModeMenu.addItem(mode, () => {
                    this.main.properties.set('displayMode', mode);
                    this.main.properties.set('layout', mode === 'Peak Meter' ? 'Horizontal' : 'Vertical');
                    this.main.invalidateCaches({ geometry: true, spectrum: true, background: true, effect: true, foreground: true });
                    this.main.ensureTimer();
                }, { radio: props.displayMode === mode });
            }
        });

        // 3. Quality preset
        menu.addSubMenu('Quality preset', (qualityMenu) => {
            for (const q of MeterConstants.QUALITY_PRESET_OPTIONS) {
                qualityMenu.addItem(q, () => {
                    this.main.properties.applyQualityPreset(q);
                    this.main.spectrumAnalyzer.setBarCount(this.main.properties.values.spectrumBars);
                    this.main.left.reset();
                    this.main.right.reset();
                    this.main.invalidateCaches({ geometry: true, spectrum: true, background: true, foreground: true, effect: true });
                }, { radio: props.qualityPreset === q });
            }
        });

        // 4. Layout
        menu.addSubMenu('Layout', (layoutMenu) => {
            for (const lay of MeterConstants.LAYOUT_OPTIONS) {
                layoutMenu.addItem(lay, () => {
                    this.main.properties.set('layout', lay);
                    this.main.invalidateCaches({ geometry: true, spectrum: true, background: true, effect: true, foreground: true });
                }, { radio: props.layout === lay });
            }
        });

        // 5. Spectrum Bars
        menu.addSubMenu('Spectrum Bars', (spectrumBarsMenu) => {
            for (const cnt of MeterConstants.SPECTRUM_BAR_COUNTS) {
                spectrumBarsMenu.addItem(`${cnt} bars`, () => {
                    this.main.properties.set('spectrumBars', cnt);
                    this.main.spectrumAnalyzer.setBarCount(cnt);
                }, { radio: props.spectrumBars === cnt, disabled: !isSpectrum });
            }
        }, !isSpectrum);

        // 6. Segment count
        menu.addSubMenu('Segment count', (segmentMenu) => {
            for (const seg of MeterConstants.SEGMENT_COUNTS) {
                segmentMenu.addItem(String(seg), () => {
                    this.main.properties.set('segments', seg);
                    this.main.invalidateCaches({ geometry: true, background: true, foreground: true, spectrum: true });
                }, { radio: props.segments === seg });
            }
        }, props.flatMode);

        menu.addSeparator();

        // 7. Appearance
        menu.addSubMenu('Appearance', (appearanceMenu) => {
            appearanceMenu.addSubMenu('Bezel / Overlay', (bezelMenu) => {
                const bezelFolder = String(props.bezelFolder || '');
                const bezelNames = this.main.listBezelNames();
                const hasBezelFolder = Boolean(bezelFolder && bezelFolder.trim() !== '');
                const curFileClean = (props.bezelFile || '').toLowerCase().replace(/\.[^/.]+$/, '');
                const currentIdx = (props.bezelEnabled && curFileClean)
                    ? bezelNames.findIndex(n => n.toLowerCase().replace(/\.[^/.]+$/, '') === curFileClean)
                    : -1;

                bezelMenu.addItem('Enable Bezel / Overlay', () => {
                    this.main.properties.set('bezelEnabled', !props.bezelEnabled);
                    if (this.main.properties.values.bezelEnabled && !this.main.properties.values.bezelFile && bezelNames.length > 0) {
                        this.main.properties.set('bezelFile', bezelNames[0]);
                    }
                    this.main.loadBezel();
                }, { checked: props.bezelEnabled });
                bezelMenu.addSeparator();

                bezelMenu.addItem('None (No Bezel)', () => {
                    this.main.properties.set('bezelEnabled', false);
                    this.main.properties.set('bezelFile', '');
                    this.main.loadBezel();
                }, { radio: currentIdx < 0 });

                bezelNames.forEach((name, i) => {
                    bezelMenu.addItem(GdiUtils.escapeMenuLabel(name), () => {
                        this.main.properties.set('bezelEnabled', true);
                        this.main.properties.set('bezelFile', name);
                        this.main.loadBezel();
                    }, { radio: currentIdx === i });
                });

                bezelMenu.addSeparator();
                const safeBezelShort = GdiUtils.escapeMenuLabel(this.#shortPath(bezelFolder));
                bezelMenu.addItem(`Set Bezel Folder…${hasBezelFolder ? `  (${safeBezelShort})` : ''}`, () => {
                    const path = GdiUtils.prompt('Enter folder path containing bezel images:', 'Set Bezel Folder', this.main.properties.values.bezelFolder || `${PROFILE_BASE}skins\\overlay`);
                    if (path) {
                        const cleaned = GdiUtils.sanitizePath(path);
                        if (cleaned && utils.IsDirectory(cleaned)) {
                            this.main.properties.set('bezelFolder', cleaned, true);
                            this.main.invalidateBezelCache();
                            this.main.properties.set('bezelEnabled', false, true);
                            this.main.properties.set('bezelFile', '', true);
                            this.main.loadBezel();
                        }
                    }
                });
                bezelMenu.addItem('Reload Bezel List', () => {
                    this.main.invalidateBezelCache();
                    this.main.getBezelImages(true);
                    this.main.loadBezel();
                });

                bezelMenu.addSeparator();
                const promptPad = (label, key) => {
                    const val = GdiUtils.prompt(`Enter ${label.toLowerCase()} padding in pixels (0–${SIDE_PAD_LOGICAL_MAX}):`, 'Per-Side Padding', String(props[key]));
                    if (val !== null && val.trim() !== '') {
                        const n = parseInt(val, 10);
                        if (!Number.isNaN(n)) {
                            this.main.properties.set(key, GdiUtils.clamp(n, 0, SIDE_PAD_LOGICAL_MAX));
                            this.main.invalidateCaches({ geometry: true, spectrum: true, background: true, foreground: true, effect: true });
                        }
                    }
                };
                bezelMenu.addItem(`Left padding…  (${props.padLeft}px)`,   () => promptPad('Left',   'padLeft'));
                bezelMenu.addItem(`Right padding…  (${props.padRight}px)`, () => promptPad('Right',  'padRight'));
                bezelMenu.addItem(`Top padding…  (${props.padTop}px)`,     () => promptPad('Top',    'padTop'));
                bezelMenu.addItem(`Bottom padding…  (${props.padBottom}px)`,() => promptPad('Bottom', 'padBottom'));
            });

            appearanceMenu.addSubMenu('Overlay Settings', (overlaySettingsMenu) => {
                MeterConstants.OPACITY_SLIDER_TARGETS.slice(0, 4).forEach((target, i) => {
                    const toggleKey = MeterConstants.OPACITY_TOGGLE_KEYS[target];
                    const opacity = props[MeterConstants.OPACITY_VALUE_KEYS[target]];
                    if (i > 0) overlaySettingsMenu.addSeparator();
                    if (toggleKey) {
                        overlaySettingsMenu.addItem(labels[target], () => {
                            this.main.properties.set(toggleKey, !props[toggleKey]);
                            if (target === 'Phosphor' || target === 'Scanlines' || target === 'Reflection') {
                                this.main.invalidateCaches({ effect: true });
                            }
                        }, { checked: props[toggleKey] });
                    }
                    overlaySettingsMenu.addItem(`Adjust ${labels[target]} Opacity...  (${pct(opacity)})`, () => {
                        this.main.opacitySliderTarget = target;
                    });
                });
            });

            appearanceMenu.addSeparator();
            for (let idx = 4; idx < MeterConstants.OPACITY_SLIDER_TARGETS.length; idx++) {
                const target = MeterConstants.OPACITY_SLIDER_TARGETS[idx];
                const opacity = props[MeterConstants.OPACITY_VALUE_KEYS[target]];
                appearanceMenu.addItem(`Adjust ${labels[target]} Opacity...  (${pct(opacity)})`, () => {
                    this.main.opacitySliderTarget = target;
                });
            }

            appearanceMenu.addSeparator();
            appearanceMenu.addItem('Show dB scale && L/R labels', () => {
                this.main.properties.set('showMarkers', !props.showMarkers);
                this.main.invalidateCaches({ geometry: true, background: true, effect: true });
            }, { checked: props.showMarkers, disabled: isSpectrum });

            appearanceMenu.addItem(`Set marker border size…  (${props.markerBorderSize}px)`, () => {
                const val = GdiUtils.prompt(`Enter marker border size in pixels (${MARKER_AREA_LOGICAL_MIN}–${MARKER_AREA_LOGICAL_MAX}):`, 'Marker Border Size', String(props.markerBorderSize));
                if (val !== null && val.trim() !== '') {
                    const n = parseInt(val, 10);
                    if (!Number.isNaN(n)) {
                        this.main.properties.set('markerBorderSize', GdiUtils.clamp(n, MARKER_AREA_LOGICAL_MIN, MARKER_AREA_LOGICAL_MAX));
                        this.main.invalidateCaches({ geometry: true, background: true, effect: true });
                    }
                }
            }, { disabled: isSpectrum });

            appearanceMenu.addItem(`Set panel padding…  (${props.panelPad}px)`, () => {
                const val = GdiUtils.prompt(`Enter panel padding in pixels (${PANEL_PAD_LOGICAL_MIN}–${PANEL_PAD_LOGICAL_MAX}):`, 'Panel Padding', String(props.panelPad));
                if (val !== null && val.trim() !== '') {
                    const n = parseInt(val, 10);
                    if (!Number.isNaN(n)) {
                        this.main.properties.set('panelPad', GdiUtils.clamp(n, PANEL_PAD_LOGICAL_MIN, PANEL_PAD_LOGICAL_MAX));
                        this.main.invalidateCaches({ geometry: true, spectrum: true, background: true, effect: true });
                    }
                }
            });
        });

        // 8. Over-range segments
        menu.addSubMenu('Over-range segments', (extraSegMenu) => {
            const extraLabels = ['None', '+1 dB', '+1 dB  –  +2 dB', '+1 dB  –  +2 dB  –  +3 dB'];
            const curExtra = GdiUtils.clamp(props.extraSegments || 0, 0, 3);
            extraLabels.forEach((lbl, i) => {
                extraSegMenu.addItem(lbl, () => {
                    this.main.properties.set('extraSegments', i);
                    this.main.invalidateCaches({ geometry: true, background: true, foreground: true });
                    this.main.left.reset();
                    this.main.right.reset();
                }, { radio: curExtra === i, disabled: isSpectrum });
            });
        }, props.flatMode || isSpectrum);

        // 9. Flat Mode
        menu.addSubMenu('Flat Mode', (flatModeMenu) => {
            flatModeMenu.addItem('Enable Flat Mode', () => {
                const turningOn = !props.flatMode;
                this.main.properties.set('flatMode', turningOn);
                if (turningOn) {
                    this.main.properties.extraSegmentsPreFlat = props.extraSegments;
                    if (props.extraSegments !== 0) {
                        this.main.properties.set('extraSegments', 0);
                        this.main.left.reset();
                        this.main.right.reset();
                    }
                } else {
                    const restore = this.main.properties.extraSegmentsPreFlat || 0;
                    if (restore !== 0) {
                        this.main.properties.set('extraSegments', restore);
                        this.main.left.reset();
                        this.main.right.reset();
                    }
                    this.main.properties.extraSegmentsPreFlat = 0;
                }
                this.main.invalidateCaches({ geometry: true, background: true, foreground: true, spectrum: true });
            }, { checked: props.flatMode });
            flatModeMenu.addSeparator();

            const gradStyles = [
                'Solid Fill  (no gradient)',
                'Gradient Fill  (LED strip)',
                'Gradient Fill  (cross full)',
                'Gradient Fill  (cross full variant)',
                'Gradient Fill  (cross blend)',
                'Gradient Fill  (full gradient)'
            ];
            const curGrad = GdiUtils.clamp(props.flatGradient, 0, MeterConstants.GRADIENT_STYLE_MAX);
            gradStyles.forEach((lbl, i) => {
                flatModeMenu.addItem(lbl, () => {
                    this.main.properties.set('flatGradient', i);
                    this.main.invalidateCaches({ background: true, foreground: true, spectrum: true });
                }, { radio: props.flatMode && curGrad === i, disabled: !props.flatMode });
            });
        });

        menu.addSeparator();

        // 10. Meter mode, range, attack, release
        menu.addSubMenu('Meter mode', (modeMenu) => {
            for (const mm of MeterConstants.METER_MODE_OPTIONS) {
                modeMenu.addItem(mm, () => this.main.properties.set('meterMode', mm), { radio: props.meterMode === mm });
            }
        }, isSpectrum);

        menu.addSubMenu('Meter range (0 dB ceiling)', (rangeMenu) => {
            for (const mr of MeterConstants.METER_RANGE_OPTIONS) {
                rangeMenu.addItem(`${mr} dB to 0 dB`, () => {
                    this.main.properties.set('meterRange', mr);
                    this.main.properties.set('extraSegments', 0);
                    this.main.invalidateCaches({ geometry: true, background: true, foreground: true });
                    this.main.left.reset();
                    this.main.right.reset();
                }, { radio: props.meterRange === mr });
            }
        }, isSpectrum);

        menu.addSubMenu('Attack', (attackMenu) => {
            for (const spd of MeterConstants.SPEED_OPTIONS) {
                attackMenu.addItem(spd, () => this.main.properties.set('attack', spd), { radio: props.attack === spd });
            }
        });

        menu.addSubMenu('Release', (releaseMenu) => {
            for (const spd of MeterConstants.SPEED_OPTIONS) {
                releaseMenu.addItem(spd, () => this.main.properties.set('release', spd), { radio: props.release === spd });
            }
        });

        menu.addItem('Performance Monitor', () => {
            this.main.properties.set('profiler', !props.profiler);
            this.main.performance.setEnabled(this.main.properties.values.profiler);
        }, { checked: props.profiler });

        menu.addItem('Peak hold', () => {
            this.main.properties.set('peakHold', !props.peakHold);
        }, { checked: props.peakHold });

        menu.addItem(`Peak hold time…  (${(props.peakHoldMs / 1000).toFixed(1)} s)`, () => {
            const value = GdiUtils.prompt(`Enter peak-hold time in milliseconds (${MeterConstants.PEAK_HOLD_MIN_MS}–${MeterConstants.PEAK_HOLD_MAX_MS}):`, 'Peak Hold Time', String(props.peakHoldMs));
            if (value !== null && value.trim() !== '') {
                const n = Number(value);
                if (Number.isFinite(n)) {
                    const ms = GdiUtils.clamp(Math.round(n), MeterConstants.PEAK_HOLD_MIN_MS, MeterConstants.PEAK_HOLD_MAX_MS);
                    this.main.properties.set('peakHoldMs', ms);
                }
            }
        }, { disabled: isSpectrum });

        menu.addSeparator();

        menu.addItem('About / Status…', () => {
            const mode = props.displayMode === 'Spectrum Analyzer' ? 'Spectrum Analyzer' : `${props.meterMode} Peak Meter`;
            const audio = HAS_AUDIO_CHUNK ? 'Available (SMP x64)' : 'Unavailable — requires fb.GetAudioChunk.';
            fb.ShowPopupMessage(
                `${MeterConstants.SCRIPT_NAME} v${MeterConstants.VERSION}\n\n` +
                `Audio capture: ${audio}\n` +
                `Display mode: ${mode}\n` +
                `Quality preset: ${props.qualityPreset}\n` +
                `Meter range: ${props.meterRange} dB to 0 dB\n` +
                `Peak hold: ${(props.peakHoldMs / 1000).toFixed(1)} s\n` +
                `Panel size: ${this.main.width} × ${this.main.height} px (DPI: ${SYSTEM_DPI})\n` +
                `Theme: ${props.theme}`,
                MeterConstants.SCRIPT_NAME
            );
        });

        menu.addItem('Reset Visual Settings to Defaults', () => {
            this.main.properties.resetVisuals();
            this.main.properties.lastFinalizedTheme = this.main.properties.values.theme;
            this.main.properties.extraSegmentsPreFlat = 0;
            this.main.opacitySliderTarget = null;
            this.main.themes.clearPreview();
            this.main.themes.draftBaseTheme = null;
            this.main.loadBezel();
            this.main.performance.setEnabled(this.main.properties.values.profiler);
            this.main.spectrumAnalyzer.setBarCount(this.main.properties.values.spectrumBars);
            this.main.spectrumAnalyzer.setFftSize(MeterConstants.SPECTRUM_FFT_SIZE);
            this.main.invalidateCaches({ geometry: true, spectrum: true, background: true, effect: true, foreground: true });
            this.main.left.reset();
            this.main.right.reset();
            this.main.resetStateTrackers();
        });

        menu.addItem('Factory Reset (All Settings & Themes)...', () => {
            const confirm = GdiUtils.prompt('Type YES to perform a full factory reset (resets all themes, overlays, and paths):', 'Confirm Factory Reset', '');
            if (confirm?.toUpperCase() === 'YES') {
                for (const ct of [...this.main.themes.customThemes]) {
                    this.main.themes.removeCustom(ct.name);
                }
                this.main.properties.resetAll();
                this.main.properties.lastFinalizedTheme = this.main.properties.values.theme;
                this.main.properties.extraSegmentsPreFlat = 0;
                this.main.opacitySliderTarget = null;
                this.main.themes.clearPreview();
                this.main.themes.draftBaseTheme = null;
                this.main.invalidateBezelCache();
                this.main.loadBezel();
                this.main.performance.setEnabled(this.main.properties.values.profiler);
                this.main.spectrumAnalyzer.setBarCount(this.main.properties.values.spectrumBars);
                this.main.spectrumAnalyzer.setFftSize(MeterConstants.SPECTRUM_FFT_SIZE);
                this.main.invalidateCaches({ geometry: true, spectrum: true, background: true, effect: true, foreground: true });
                this.main.left.reset();
                this.main.right.reset();
                this.main.resetStateTrackers();
            }
        });

        const selected = menu.track(x, y);
        if (selected > 0) this.main.invalidate();
        return true;
    }
}

// ============================================================================================
// 14. MAIN CONTROLLER & DIRTY-RECT DISPATCH
// ============================================================================================
class LCDPeakMeter {
    properties;
    themes;
    audio;
    left;
    right;
    geometry;
    segments;
    glow;
    phosphor;
    scanlines;
    reflection;
    scale;
    labels;
    effectCache;
    meterBgCache;
    spectrumGeometry;
    spectrumAnalyzer;
    spectrumRenderer;
    spectrumBgCache;
    performance;
    menu;

    width;
    height;
    masterTimer = null;
    opacitySliderTarget = null;
    opacityAccessors = {};

    #lastLeftLit = -1; #lastRightLit = -1;
    #lastLeftPeakSeg = -1; #lastRightPeakSeg = -1;
    #lastLeftHasPeak = false; #lastRightHasPeak = false;
    #lastClipActive = false;

    #bezelImageCache = null;
    #bezelCacheFolder = null;
    bezelBmp = null;
    bezelVersion = 0;
    
    #activeArea = { x: 0, y: 0, w: 0, h: 0 };
    isFocused = false;
    #notifyText = '';
    #notifyTimer = null;

    #lastSpectrumTick = Date.now();
    #spectrumNextRunAt = Date.now();

    constructor() {
        panelState = MeterConstants.LIFECYCLE.INIT;
        this.properties = new PropertyManager();
        this.themes = new ThemeManager();

        const persistedFile = this.properties.values.customThemeFile;
        const customThemeFile = persistedFile?.trim() ? persistedFile : `${PROFILE_BASE}lcd_custom_themes.json`;
        this.properties.set('customThemeFile', customThemeFile, true);

        try {
            this.themes.loadFromFile(customThemeFile);
        } catch {}

        if (this.properties.values.theme === '~Preview') {
            const fallback = this.properties.lastFinalizedTheme;
            this.themes.clearPreview();
            this.properties.setTheme(fallback && this.themes.themeMap.has(fallback) ? fallback : 'Pioneer Amber', this.themes);
        }

        if (!this.themes.names().includes(this.properties.values.theme)) {
            this.properties.setTheme('Pioneer Amber', this.themes);
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
        this.spectrumBgCache = new SpectrumBackgroundCache();
        this.performance = new PerformanceMonitor();
        this.performance.setEnabled(this.properties.values.profiler);
        this.spectrumAnalyzer.setBarCount(this.properties.values.spectrumBars);
        this.menu = new MenuManager(this);
        this.width = window.Width;
        this.height = window.Height;

        MeterConstants.OPACITY_SLIDER_TARGETS.forEach((target) => {
            const key = MeterConstants.OPACITY_VALUE_KEYS[target];
            this.opacityAccessors[target] = {
                get: () => this.properties.values[key],
                set: (v) => this.properties.set(key, GdiUtils.clamp(Math.round(v), 0, 255))
            };
        });

        this.loadBezel();
    }

    isIdle() {
        if (HAS_AUDIO_CHUNK && fb.IsPlaying && !fb.IsPaused) return false;
        if (this.properties.values.displayMode === 'Spectrum Analyzer') {
            return !this.spectrumAnalyzer.isDirty && !this.spectrumAnalyzer.hasEnergy();
        }
        const now = Date.now();
        return this.audio.isSilent &&
            this.left.value <= 0.001 && this.right.value <= 0.001 &&
            this.left.peak <= 0.001 && this.right.peak <= 0.001 &&
            !this.left.isClipping(now) && !this.right.isClipping(now);
    }

    start() {
        if (this.masterTimer || !window.IsVisible || panelState !== MeterConstants.LIFECYCLE.LIVE) return;
        this.masterTimer = window.SetInterval(() => this.engineTick(), MeterConstants.MASTER_TIMER_MS);
    }

    stop() {
        if (this.masterTimer) {
            window.ClearInterval(this.masterTimer);
            this.masterTimer = null;
        }
    }

    ensureTimer(force = false) {
        if (!this.masterTimer && window.IsVisible && panelState === MeterConstants.LIFECYCLE.LIVE && (force || !this.isIdle())) {
            this.start();
        }
    }

    #showNotify(text) {
        this.#notifyText = text;
        if (this.#notifyTimer) window.ClearTimeout(this.#notifyTimer);
        this.#notifyTimer = window.SetTimeout(() => {
            this.#notifyTimer = null;
            this.#notifyText = '';
            this.invalidate();
        }, 1500);
        this.invalidate();
    }

    clearNotifyTimer() {
        if (this.#notifyTimer) {
            window.ClearTimeout(this.#notifyTimer);
            this.#notifyTimer = null;
        }
    }

    // Zero-Idle Guard: Halts audio sampling, FFT, and animation ticks when hidden or fully decayed
    engineTick() {
        if (panelState !== MeterConstants.LIFECYCLE.LIVE) return;

        if (!window.IsVisible) {
            this.stop();
            return;
        }

        if (this.properties.values.displayMode === 'Spectrum Analyzer') {
            this.spectrumTick();
        } else {
            this.audioTick();
        }
    }

    audioTick() {
        const p = this.properties.values;
        const isPlaying = HAS_AUDIO_CHUNK && fb.IsPlaying && !fb.IsPaused;
        const nowCheck = Date.now();
        const isDecayed = this.audio.isSilent &&
            this.left.value <= 0.001 && this.right.value <= 0.001 &&
            this.left.peak <= 0.001 && this.right.peak <= 0.001 &&
            !this.left.isClipping(nowCheck) && !this.right.isClipping(nowCheck);

        if (!isPlaying && isDecayed) {
            if (this.#lastLeftLit !== 0 || this.#lastRightLit !== 0 || this.#lastLeftHasPeak || this.#lastRightHasPeak || this.#lastClipActive) {
                this.#lastLeftLit = 0; this.#lastRightLit = 0;
                this.#lastLeftPeakSeg = 0; this.#lastRightPeakSeg = 0;
                this.#lastLeftHasPeak = false; this.#lastRightHasPeak = false;
                this.#lastClipActive = false;
                this.invalidateMeterBars();
            }
            this.stop();
            return;
        }

        const tickStart = this.performance.beginTick();
        const attack = ballisticRate(p.attack, true), release = ballisticRate(p.release, false);
        const audioStart = this.performance.enabled ? Date.now() : 0;
        const maxDb  = p.extraSegments || 0;
        const levels = this.audio.update(attack, release, maxDb, p.meterRange);
        const audioMs = this.performance.enabled ? Math.max(0, Date.now() - audioStart) : 0;
        const mode = p.meterMode;
        const leftLevel = mode === 'Peak' ? levels.leftPeak : levels.leftRms;
        const rightLevel = mode === 'Peak' ? levels.rightPeak : levels.rightRms;
        const leftIndicator = mode === 'Peak + RMS' ? levels.leftPeak : leftLevel;
        const rightIndicator = mode === 'Peak + RMS' ? levels.rightPeak : rightLevel;
        const now = Date.now();
        this.left.update(leftLevel, leftIndicator, p.peakHold, now, maxDb, p.meterRange, p.peakHoldMs);
        this.right.update(rightLevel, rightIndicator, p.peakHold, now, maxDb, p.meterRange, p.peakHoldMs);
        
        const geomSegments = p.flatMode ? 1 : (p.segments + (p.extraSegments || 0));
        const geometry = this.geometry.get(this.width, this.height, p.layout, geomSegments, this.themes.get(p.theme), p.markerBorderSize, p.extraSegments, p.showMarkers, p.panelPad, p.padLeft, p.padTop, p.padRight, p.padBottom, p.meterRange);
        const segmentCount = geometry.segmentCount, channel0 = geometry.channels[0], pixelSpan = geometry.vertical ? channel0.h : channel0.w;
        let leftLit, rightLit, leftPeakSeg, rightPeakSeg;

        if (p.flatMode) {
            leftLit = Math.round(this.left.value * pixelSpan);
            rightLit = Math.round(this.right.value * pixelSpan);
            leftPeakSeg = Math.round(this.left.peak * pixelSpan);
            rightPeakSeg = Math.round(this.right.peak * pixelSpan);
        } else {
            leftLit  = Math.min(Math.round(this.left.value  * segmentCount), segmentCount);
            rightLit = Math.min(Math.round(this.right.value * segmentCount), segmentCount);
            leftPeakSeg  = GdiUtils.clamp(Math.ceil(this.left.peak  * segmentCount) - 1, 0, segmentCount - 1);
            rightPeakSeg = GdiUtils.clamp(Math.ceil(this.right.peak * segmentCount) - 1, 0, segmentCount - 1);
        }

        const leftHasPeak = this.left.peak > 0.01;
        const rightHasPeak = this.right.peak > 0.01;
        const clipActive = this.left.isClipping(now) || this.right.isClipping(now);

        const changed = leftLit !== this.#lastLeftLit ||
                        rightLit !== this.#lastRightLit ||
                        leftPeakSeg !== this.#lastLeftPeakSeg ||
                        rightPeakSeg !== this.#lastRightPeakSeg ||
                        leftHasPeak !== this.#lastLeftHasPeak ||
                        rightHasPeak !== this.#lastRightHasPeak ||
                        clipActive !== this.#lastClipActive;

        this.#lastLeftLit = leftLit;
        this.#lastRightLit = rightLit;
        this.#lastLeftPeakSeg = leftPeakSeg;
        this.#lastRightPeakSeg = rightPeakSeg;
        this.#lastLeftHasPeak = leftHasPeak;
        this.#lastRightHasPeak = rightHasPeak;
        this.#lastClipActive = clipActive;

        if (changed) this.invalidateMeterBars();
        this.performance.endTick(tickStart, audioMs, 0);
    }

    spectrumTick() {
        const p = this.properties.values;
        const now = Date.now();
        const isPlaying = HAS_AUDIO_CHUNK && fb.IsPlaying && !fb.IsPaused;

        if (!isPlaying && !this.spectrumAnalyzer.isDirty && !this.spectrumAnalyzer.hasEnergy()) {
            this.stop();
            return;
        }

        if (now < this.#spectrumNextRunAt) return;

        const shortAxis = Math.min(this.width, this.height);
        let gateMs = shortAxis >= SPECTRUM_THROTTLE_FULL_PX ? MeterConstants.SPECTRUM_FPS_FULL_MS : shortAxis >= SPECTRUM_THROTTLE_MEDIUM_PX ? MeterConstants.SPECTRUM_FPS_MEDIUM_MS : MeterConstants.SPECTRUM_FPS_LOW_MS;
        let fftSize = shortAxis >= SPECTRUM_THROTTLE_FULL_PX ? MeterConstants.SPECTRUM_FFT_SIZE_FULL : shortAxis >= SPECTRUM_THROTTLE_MEDIUM_PX ? MeterConstants.SPECTRUM_FFT_SIZE_MEDIUM : MeterConstants.SPECTRUM_FFT_SIZE_LOW;
        if (p.qualityPreset === 'Low') {
            gateMs = 100;
            fftSize = MeterConstants.SPECTRUM_FFT_SIZE_LOW;
        } else if (p.qualityPreset === 'High') {
            gateMs = MeterConstants.SPECTRUM_FPS_FULL_MS;
            fftSize = MeterConstants.SPECTRUM_FFT_SIZE_FULL;
        }
        if (fftSize !== this.spectrumAnalyzer.fftN) this.spectrumAnalyzer.setFftSize(fftSize);
        this.#spectrumNextRunAt = Math.max(this.#spectrumNextRunAt + gateMs, now);
        const tickStart = this.performance.beginTick();
        const attack = ballisticRate(p.attack, true), release = ballisticRate(p.release, false);
        const elapsed = Math.max((now - this.#lastSpectrumTick) / 1000, 0.001);
        this.#lastSpectrumTick = now;
        if (this.spectrumAnalyzer.barCount !== p.spectrumBars) this.spectrumAnalyzer.setBarCount(p.spectrumBars);
        const fftStart = this.performance.enabled ? Date.now() : 0;
        this.spectrumAnalyzer.update(attack, release, elapsed);
        const fftMs = this.performance.enabled ? Math.max(0, Date.now() - fftStart) : 0;
        if (this.performance.enabled) { this.performance.spectrumTierMs = gateMs; this.performance.spectrumFftSize = fftSize; }
        if (this.spectrumAnalyzer.isDirty) {
            this.invalidateMeterBars();
        } else {
            this.performance.noteSpectrumClean();
            if (!isPlaying && !this.spectrumAnalyzer.hasEnergy()) {
                this.stop();
            }
        }
        this.performance.endTick(tickStart, 0, fftMs);
    }

    invalidateMeterBars() {
        if (panelState !== MeterConstants.LIFECYCLE.LIVE) return;
        this.performance.noteRepaint();

        if (this.#notifyText || this.opacitySliderTarget || this.properties.values.profiler || 
            this.#activeArea.w <= 0 || this.#activeArea.h <= 0) {
            window.Repaint();
            return;
        }

        const margin = Math.max(scaleDpi(12), GLOW_STEP_PADDING * MeterConstants.GLOW_ITERATIONS + 2);
        const rx = Math.max(0, this.#activeArea.x - margin);
        const ry = Math.max(0, this.#activeArea.y - margin);
        const rw = Math.min(this.width - rx, this.#activeArea.w + (margin * 2));
        const rh = Math.min(this.height - ry, this.#activeArea.h + (margin * 2));

        if (rw > 0 && rh > 0) {
            window.RepaintRect(rx, ry, rw, rh);
        } else {
            window.Repaint();
        }
    }

    invalidate() { 
        if (panelState !== MeterConstants.LIFECYCLE.LIVE) return; 
        this.performance.noteRepaint(); 
        window.Repaint(); 
    }

    drawClipIndicator(gr, geometry, theme, now) {
        const channels = [this.left, this.right];
        for (let i = 0; i < 2; i++) {
            if (!channels[i].isClipping(now)) continue;
            const ch = geometry.channels[i];
            if (geometry.vertical) {
                gr.FillSolidRect(ch.x, ch.y, ch.w, Math.max(2, Math.min(4, ch.h)), theme.warning);
            } else {
                gr.FillSolidRect(ch.x + ch.w - Math.max(2, Math.min(4, ch.w)), ch.y, Math.max(2, Math.min(4, ch.w)), ch.h, theme.warning);
            }
        }
    }

    resetStateTrackers() {
        this.#lastLeftLit = -1; this.#lastRightLit = -1;
        this.#lastLeftPeakSeg = -1; this.#lastRightPeakSeg = -1;
        this.#lastLeftHasPeak = false; this.#lastRightHasPeak = false;
        this.#lastClipActive = false;
    }

    invalidateCaches(opts) {
        if (opts.geometry) this.geometry.invalidate();
        if (opts.spectrum) {
            this.spectrumGeometry.invalidate();
            this.spectrumBgCache?.invalidate();
            this.spectrumRenderer._fgCache?.dispose();
        }
        if (opts.background) {
            this.meterBgCache.invalidate();
            this.spectrumBgCache?.invalidate();
        }
        if (opts.foreground) {
            this.segments._fgCache.dispose();
            this.spectrumRenderer._fgCache?.dispose();
        }
        if (opts.effect) this.effectCache.dispose();
        if (opts.repaint) this.invalidate();
    }

    invalidateBezelCache() {
        this.#bezelImageCache = null;
        this.#bezelCacheFolder = null;
    }

    onSize() {
        if (panelState !== MeterConstants.LIFECYCLE.LIVE) return;
        this.ensureTimer();
        this.width = window.Width; 
        this.height = window.Height;
        this.invalidateCaches({ geometry: true, spectrum: true, background: true, foreground: true, effect: true });
        this.invalidate();
    }

    onPaint(gr) {
        if (panelState !== MeterConstants.LIFECYCLE.LIVE || !gr) return;
        this.ensureTimer();
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
        const isSpectrum = props.displayMode === 'Spectrum Analyzer';

        if (isSpectrum) {
            geometry = this.spectrumGeometry.get(width, height, layout, props.spectrumBars, props.panelPad, props.padLeft, props.padTop, props.padRight, props.padBottom);
            this.#activeArea.x = geometry.pL;
            this.#activeArea.y = geometry.pT;
            this.#activeArea.w = Math.max(0, width  - geometry.pL - geometry.pR);
            this.#activeArea.h = Math.max(0, height - geometry.pT - geometry.pB);
            
            const specBgBitmap = this.spectrumBgCache.get(width, height, geometry, theme, props.offSegmentOpacity, props.flatMode, props.segments);
            if (this.performance.enabled) this.performance.bgCacheHit = Boolean(specBgBitmap);
            if (specBgBitmap) {
                gr.DrawImage(specBgBitmap, 0, 0, width, height, 0, 0, width, height);
            } else {
                gr.FillSolidRect(0, 0, width, height, theme.background);
            }

            this.spectrumRenderer.draw(
                gr, geometry, this.spectrumAnalyzer.levels, this.spectrumAnalyzer.peaks, 
                props.spectrumBars, theme, props.onSegmentOpacity, props.peakHold, 
                props.flatMode, props.flatGradient, this.segments._gradStrips, props.segments
            );
        } else {
            const geomSegments = props.flatMode ? 1 : (props.segments + (props.extraSegments || 0));
            geometry = this.geometry.get(width, height, layout, geomSegments, theme, props.markerBorderSize, props.extraSegments, props.showMarkers, props.panelPad, props.padLeft, props.padTop, props.padRight, props.padBottom, props.meterRange);
            
            if (geometry.vertical) {
                this.#activeArea.x = geometry.pL + geometry.scaleWidth;
                this.#activeArea.y = geometry.pT;
                this.#activeArea.w = Math.max(0, width - (geometry.pL + geometry.scaleWidth) - geometry.pR);
                this.#activeArea.h = Math.max(0, height - geometry.pT - geometry.pB - geometry.footer);
            } else {
                this.#activeArea.x = geometry.pL + geometry.labelWidth;
                this.#activeArea.y = geometry.pT;
                this.#activeArea.w = Math.max(0, width - (geometry.pL + geometry.labelWidth) - geometry.pR);
                this.#activeArea.h = Math.max(0, height - geometry.pT - geometry.pB - geometry.footer);
            }

            const bgBitmap = this.meterBgCache.get(width, height, geometry, theme, layout, props.flatMode, props.flatGradient, props.offSegmentOpacity, props.showMarkers, this.scale, this.labels, props.meterRange);
            if (this.performance.enabled) this.performance.bgCacheHit = this.meterBgCache.lastHit;
            if (bgBitmap) {
                gr.DrawImage(bgBitmap, 0, 0, width, height, 0, 0, width, height);
            } else {
                gr.FillSolidRect(0, 0, width, height, theme.background);
                const offFill = GdiUtils.withAlpha(theme.inactive, props.offSegmentOpacity);
                const ch0 = geometry.channels[0], ch1 = geometry.channels[1];
                if (props.flatMode) {
                    gr.FillSolidRect(ch0.x, ch0.y, ch0.w, ch0.h, offFill);
                    gr.FillSolidRect(ch1.x, ch1.y, ch1.w, ch1.h, offFill);
                } else {
                    for (let i = 0; i < geometry.segmentCount; i++) {
                        gr.FillSolidRect(ch0.segments[i].x, ch0.segments[i].y, ch0.segments[i].w, ch0.segments[i].h, offFill);
                        gr.FillSolidRect(ch1.segments[i].x, ch1.segments[i].y, ch1.segments[i].w, ch1.segments[i].h, offFill);
                    }
                }
                if (props.showMarkers) {
                    this.scale.draw(gr, geometry, width, height, theme, layout, props.meterRange);
                    this.labels.draw(gr, geometry, theme, width, height);
                }
            }
            
            const energy = Math.max(this.left.value, this.right.value);
            const dynamicMult = 0.5 + energy * 1.5;

            this.segments.drawFast(gr, geometry.channels[0], this.left.value, this.left.peak, geometry.vertical, theme, geometry, props.onSegmentOpacity, props.flatMode, props.flatGradient, props.meterRange);
            this.segments.drawFast(gr, geometry.channels[1], this.right.value, this.right.peak, geometry.vertical, theme, geometry, props.onSegmentOpacity, props.flatMode, props.flatGradient, props.meterRange);

            if (props.showGlow && energy > 0.001) {
                if (props.flatMode) {
                    this.glow.drawFlat(gr, geometry.channels[0], this.left.value, this.left.peak, geometry.vertical, theme, props.glowOpacity, dynamicMult);
                    this.glow.drawFlat(gr, geometry.channels[1], this.right.value, this.right.peak, geometry.vertical, theme, props.glowOpacity, dynamicMult);
                } else {
                    this.glow.draw(gr, geometry.channels[0], this.left.value, this.left.peak, geometry, geometry.vertical, theme, props.glowOpacity, dynamicMult);
                    this.glow.draw(gr, geometry.channels[1], this.right.value, this.right.peak, geometry, geometry.vertical, theme, props.glowOpacity, dynamicMult);
                }
            }

            this.drawClipIndicator(gr, geometry, theme, Date.now());
        }

        const overlayLayer = this.effectCache.getOverlayLayer(
            width, height, theme, props.theme, 
            this.phosphor, this.scanlines, this.reflection, 
            this.#activeArea, geometry.vertical, 
            props.showPhosphor, props.phosphorOpacity, 
            props.showScanlines, props.scanlineOpacity, 
            props.showReflection, props.reflectionOpacity
        );
        if (overlayLayer) gr.DrawImage(overlayLayer, 0, 0, width, height, 0, 0, width, height);

        const bezelLayer = this.effectCache.getBezelLayer(width, height, props.bezelEnabled, this.bezelBmp, this.bezelVersion);
        if (bezelLayer) gr.DrawImage(bezelLayer, 0, 0, width, height, 0, 0, width, height);

        this.drawOpacitySlider(gr, width, height);
        this.drawNotification(gr, width, height);
        this.performance.draw(gr, width, height, isSpectrum);
        this.performance.endPaint(paintStart);
    }

    drawOpacitySlider(gr, width, height) {
        if (!this.opacitySliderTarget) return;
        const acc = this.opacityAccessors[this.opacitySliderTarget];
        if (!acc) return;
        const value = acc.get();
        const barW = Math.min(SLIDER_BAR_MAX_WIDTH, width * 0.8), barH = SLIDER_BAR_HEIGHT;
        const bx = Math.floor((width - barW) / 2), by = height - scaleDpi(20);
        if (by < 0) return;
        const white = GdiUtils.colour(255, 255, 255);
        gr.FillSolidRect(bx, by, barW, barH, GdiUtils.withAlpha(white, 60));
        gr.FillSolidRect(bx, by, Math.floor(barW * (value / 255)), barH, GdiUtils.withAlpha(white, 180));
        const sliderFont = fonts.get('Segoe UI', scaleDpi(12), 0);
        if (!sliderFont) return;
        const label = `${this.opacitySliderTarget}: ${value}`;
        const ly = by - scaleDpi(22);
        if (ly >= 0) {
            gr.DrawString(label, sliderFont, GdiUtils.withAlpha(white, 230), 0, ly, width, scaleDpi(20), 0x11000000);
        }
    }

    drawNotification(gr, width, height) {
        if (!this.#notifyText || this.opacitySliderTarget) return;
        const font = fonts.get('Segoe UI Semibold', scaleDpi(11), 0);
        if (!font) return;
        const text = this.#notifyText;
        const white = GdiUtils.colour(255, 255, 255);
        const boxH = scaleDpi(24);
        const boxW = Math.min(width - scaleDpi(20), Math.max(scaleDpi(130), text.length * scaleDpi(7) + scaleDpi(24)));
        const bx = Math.floor((width - boxW) / 2);
        const by = height - scaleDpi(28);
        if (by < 0) return;
        gr.FillSolidRect(bx, by, boxW, boxH, GdiUtils.withAlpha(GdiUtils.colour(0, 0, 0), 190));
        gr.DrawString(text, font, GdiUtils.withAlpha(white, 240), bx, by, boxW, boxH, 0x11000000);
    }

    toggleDisplayMode() {
        if (panelState !== MeterConstants.LIFECYCLE.LIVE) return;
        const p = this.properties.values;
        const newMode = (p.displayMode === 'Spectrum Analyzer') ? 'Peak Meter' : 'Spectrum Analyzer';
        this.properties.set('displayMode', newMode);
        
        const newLayout = (newMode === 'Peak Meter') ? 'Horizontal' : 'Vertical';
        this.properties.set('layout', newLayout);

        this.invalidateCaches({ geometry: true, spectrum: true, background: true, effect: true, foreground: true });
        this.ensureTimer();
        this.invalidate();
    }

    cycleBezel(direction) {
        const bezelNames = this.listBezelNames();
        if (!bezelNames.length) return;

        const p = this.properties.values;
        let currentIdx = 0;
        if (p.bezelEnabled && p.bezelFile) {
            const curClean = (p.bezelFile || '').toLowerCase().replace(/\.[^/.]+$/, '');
            const found = bezelNames.findIndex(n => n.toLowerCase().replace(/\.[^/.]+$/, '') === curClean);
            if (found !== -1) currentIdx = found + 1;
        }

        const count = bezelNames.length + 1;
        let nextIdx = (currentIdx + direction) % count;
        if (nextIdx < 0) nextIdx += count;

        let chosenName = 'None';
        if (nextIdx === 0) {
            this.properties.set('bezelEnabled', false);
            this.properties.set('bezelFile', '');
        } else {
            const choice = bezelNames[nextIdx - 1];
            chosenName = choice;
            this.properties.set('bezelEnabled', true);
            this.properties.set('bezelFile', choice);
        }

        this.loadBezel();
        this.#showNotify(`Bezel: ${chosenName}`);
    }

    cycleMeterStyle(direction) {
        const p = this.properties.values;

        const STYLES = [
            { name: 'LED Segments',       flatMode: false, grad: MeterConstants.GRADIENT_STYLE_SOLID },
            { name: 'Flat (Solid)',       flatMode: true,  grad: MeterConstants.GRADIENT_STYLE_SOLID },
            { name: 'Flat (LED Strip)',   flatMode: true,  grad: MeterConstants.GRADIENT_STYLE_STRIP },
            { name: 'Flat (Cross Full)',  flatMode: true,  grad: MeterConstants.GRADIENT_STYLE_CROSS },
            { name: 'Flat (Cross Var)',   flatMode: true,  grad: MeterConstants.GRADIENT_STYLE_CROSS_VARIANT },
            { name: 'Flat (Cross Blend)', flatMode: true,  grad: MeterConstants.GRADIENT_STYLE_CROSS_BLEND },
            { name: 'Flat (Full Grad)',   flatMode: true,  grad: MeterConstants.GRADIENT_STYLE_FULL }
        ];

        let currentIdx = p.flatMode ? (1 + GdiUtils.clamp(p.flatGradient, 0, MeterConstants.GRADIENT_STYLE_MAX)) : 0;
        let nextIdx = (currentIdx + direction) % STYLES.length;
        if (nextIdx < 0) nextIdx += STYLES.length;

        const target = STYLES[nextIdx];
        const wasFlat = p.flatMode;
        const nowFlat = target.flatMode;

        if (wasFlat !== nowFlat) {
            this.properties.set('flatMode', nowFlat);
            if (nowFlat) {
                this.properties.extraSegmentsPreFlat = p.extraSegments;
                if (p.extraSegments !== 0) {
                    this.properties.set('extraSegments', 0);
                    this.left.reset();
                    this.right.reset();
                }
            } else {
                const restore = this.properties.extraSegmentsPreFlat || 0;
                if (restore !== 0) {
                    this.properties.set('extraSegments', restore);
                    this.left.reset();
                    this.right.reset();
                }
                this.properties.extraSegmentsPreFlat = 0;
            }
            this.invalidateCaches({ geometry: true, background: true, foreground: true, spectrum: true });
        }

        if (nowFlat) {
            this.properties.set('flatGradient', target.grad);
            this.invalidateCaches({ background: true, foreground: true, spectrum: true });
        }

        this.#showNotify(`Style: ${target.name}`);
    }

    onKeyDown(vkey) {
        if (panelState !== MeterConstants.LIFECYCLE.LIVE) return false;
        if (vkey === 0x1B && this.opacitySliderTarget) {
            this.opacitySliderTarget = null;
            this.invalidate();
            return true;
        }
        if (utils.IsKeyPressed(MeterConstants.VK_CONTROL) && !utils.IsKeyPressed(0x10) && !utils.IsKeyPressed(0x12)) {
            if (vkey === MeterConstants.VK_UP) {
                this.cycleBezel(-1);
                return true;
            } else if (vkey === MeterConstants.VK_DOWN) {
                this.cycleBezel(1);
                return true;
            } else if (vkey === MeterConstants.VK_LEFT) {
                this.cycleMeterStyle(-1);
                return true;
            } else if (vkey === MeterConstants.VK_RIGHT) {
                this.cycleMeterStyle(1);
                return true;
            }
        }
        return false;
    }

    onFocus(isFocused) {
        if (panelState !== MeterConstants.LIFECYCLE.LIVE) return;
        this.ensureTimer();
        this.isFocused = isFocused;
        this.invalidate();
    }

    onMouseLbtnDown(x, y, mask) {
        if (panelState !== MeterConstants.LIFECYCLE.LIVE) return;
        this.ensureTimer();
        this.isFocused = true;
        if (this.opacitySliderTarget) {
            this.opacitySliderTarget = null;
            this.invalidate();
        }
    }

    onMouseWheel(step) {
        if (panelState !== MeterConstants.LIFECYCLE.LIVE) return false;
        if (!this.opacitySliderTarget) return false;
        const acc = this.opacityAccessors[this.opacitySliderTarget];
        if (!acc) return false;
        const delta = step > 0 ? MeterConstants.OPACITY_STEP : -MeterConstants.OPACITY_STEP;
        acc.set(GdiUtils.clamp(acc.get() + delta, 0, 255));
        const t = this.opacitySliderTarget;
        if (t === 'OffSegments' || t === 'OnSegments') this.invalidateCaches({ background: true, foreground: true, spectrum: true });
        else if (t === 'Phosphor' || t === 'Scanlines' || t === 'Reflection') this.invalidateCaches({ effect: true });
        this.invalidate();
        return true;
    }

    onMouseLbtnUp() {
        if (panelState !== MeterConstants.LIFECYCLE.LIVE) return false;
        if (!this.opacitySliderTarget) return false;
        this.opacitySliderTarget = null;
        this.invalidate();
        return true;
    }

    getBezelImages(forceReload = false) {
        const folder = GdiUtils.sanitizePath(this.properties.values.bezelFolder);
        if (!folder || !utils.IsDirectory(folder)) {
            this.#bezelImageCache = [];
            this.#bezelCacheFolder = folder;
            return this.#bezelImageCache;
        }
        if (!forceReload && this.#bezelImageCache !== null && this.#bezelCacheFolder === folder) {
            return this.#bezelImageCache;
        }
        const pattern = folder.endsWith('\\') ? `${folder}*.*` : `${folder}\\*.*`;
        try {
            const all = utils.Glob(pattern);
            if (!Array.isArray(all)) {
                this.#bezelImageCache = [];
                this.#bezelCacheFolder = folder;
                return this.#bezelImageCache;
            }
            this.#bezelImageCache = all.filter(f => {
                const dot = f.lastIndexOf('.');
                if (dot === -1) return false;
                const ext = f.substring(dot).toLowerCase();
                return MeterConstants.BEZEL_EXTS.includes(ext);
            }).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
            this.#bezelCacheFolder = folder;
            return this.#bezelImageCache;
        } catch {
            this.#bezelImageCache = [];
            this.#bezelCacheFolder = folder;
            return this.#bezelImageCache;
        }
    }

    listBezelNames(forceReload = false) {
        return this.getBezelImages(forceReload).map(p => {
            const name = p.substring(p.lastIndexOf('\\') + 1);
            return name.substring(0, name.lastIndexOf('.'));
        });
    }

    resolveBezelPath(name) {
        const folder = this.properties.values.bezelFolder;
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
        for (let i = 0; i < MeterConstants.BEZEL_EXTS.length; i++) {
            if (lower.endsWith(MeterConstants.BEZEL_EXTS[i])) {
                const direct = `${base}${name}`;
                return utils.IsFile(direct) ? direct : null;
            }
        }
        for (let i = 0; i < MeterConstants.BEZEL_EXTS.length; i++) {
            const candidate = `${base}${name}${MeterConstants.BEZEL_EXTS[i]}`;
            if (utils.IsFile(candidate)) return candidate;
        }
        return null;
    }

    loadBezel() {
        if (this.bezelBmp) {
            try { this.bezelBmp.Dispose(); } catch {}
            this.bezelBmp = null;
        }
        const p = this.properties.values;
        this.bezelVersion++;
        this.invalidateCaches({ effect: true });
        if (!p.bezelEnabled || !p.bezelFile) return;
        const target = this.resolveBezelPath(p.bezelFile);
        if (target) {
            try {
                this.bezelBmp = gdi.Image(target);
                if (!this.bezelBmp) { 
                    this.properties.set('bezelEnabled', false, true); 
                    this.properties.set('bezelFile', '', true); 
                }
            } catch {
                this.bezelBmp = null;
                this.properties.set('bezelEnabled', false, true);
                this.properties.set('bezelFile', '', true);
            }
        } else {
            this.properties.set('bezelEnabled', false, true);
            this.properties.set('bezelFile', '', true);
        }
    }
}

// ============================================================================================
// 15. SMP GLOBAL HOOKS & CALLBACK DISPATCH
// ============================================================================================
const meter = new LCDPeakMeter();
panelState = MeterConstants.LIFECYCLE.LIVE;
meter.ensureTimer();

function on_paint(gr) { meter.onPaint(gr); }
function on_size() { meter.onSize(); }
function on_mouse_lbtn_down(x, y, mask) { meter.onMouseLbtnDown(x, y, mask); }
function on_mouse_lbtn_dblclk(x, y, mask) { meter.toggleDisplayMode(); }
function on_mouse_rbtn_up(x, y, mask) { return meter.menu.show(x, y, mask); }
function on_mouse_wheel(step) { return meter.onMouseWheel(step); }
function on_mouse_lbtn_up() { meter.onMouseLbtnUp(); }
function on_key_down(vkey) { return meter.onKeyDown(vkey); }
function on_focus(is_focused) { meter.onFocus(is_focused); }

function on_playback_stop(reason) {
    if (panelState !== MeterConstants.LIFECYCLE.LIVE) return;
    if (meter && reason !== 2) {
        meter.audio.isSilent = false;
        meter.spectrumAnalyzer.isDirty = true;
        meter.ensureTimer(true);
        meter.invalidate();
    }
}

function on_playback_pause(state) {
    if (panelState !== MeterConstants.LIFECYCLE.LIVE) return;
    if (meter) {
        meter.audio.isSilent = false;
        meter.spectrumAnalyzer.isDirty = true;
        meter.ensureTimer(true);
        meter.invalidate();
    }
}

function on_playback_starting(cmd, is_paused) {
    if (panelState !== MeterConstants.LIFECYCLE.LIVE) return;
    if (meter) {
        meter.audio.isSilent = false;
        meter.spectrumAnalyzer.isDirty = true;
        meter.ensureTimer(true);
    }
}

function on_playback_new_track(metadb) {
    if (panelState !== MeterConstants.LIFECYCLE.LIVE) return;
    if (meter) {
        meter.audio.isSilent = false;
        meter.spectrumAnalyzer.isDirty = true;
        meter.ensureTimer(true);
    }
}

function on_colours_changed() {
    if (panelState !== MeterConstants.LIFECYCLE.LIVE) return;
    _segmentTableCache.clear();
    if (meter) {
        meter.invalidateCaches({ background: true, foreground: true, effect: true, spectrum: true, repaint: true });
    }
}

function on_font_changed() {
    if (panelState !== MeterConstants.LIFECYCLE.LIVE) return;
    try { fonts.dispose(); } catch {}
    if (meter) {
        meter.invalidateCaches({ background: true, repaint: true });
    }
}

function on_notify_data(name, info) {
    if (panelState !== MeterConstants.LIFECYCLE.LIVE) return;
    if (name === 'LcdThemeSync' && typeof info === 'string') {
        if (!meter.properties.values.syncTheme) return; // Guarded by syncTheme toggle
        if (meter.themes.names().includes(info) && meter.properties.values.theme !== info) {
            meter.themes.clearPreview();
            meter.properties.setTheme(info, meter.themes);
            meter.invalidateCaches({ background: true, effect: true, foreground: true, spectrum: true, repaint: true });
        }
    }
}

function on_script_unload() {
    panelState = MeterConstants.LIFECYCLE.SHUTDOWN;
    if (meter?.properties) meter.properties.persistSync();
    try { meter?.stop(); } catch {}
    try { meter?.clearNotifyTimer(); } catch {}
    try { meter?.segments?.dispose(); } catch {}
    try { meter?.spectrumRenderer?.dispose(); } catch {}
    try { meter?.effectCache?.dispose(); } catch {}
    try { meter?.meterBgCache?.dispose(); } catch {}
    try { meter?.spectrumBgCache?.dispose(); } catch {}
    try { meter?.bezelBmp?.Dispose(); } catch {}
    if (meter) meter.bezelBmp = null;
    _segmentTableCache.clear();
    try { fonts.dispose(); } catch {}
}