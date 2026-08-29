'use strict';
		      // -============ AUTHOR L.E.D. ===========- \\
		     // -======= SMP 64bit Disc Spin V4.0 =======- \\
		    // -====== Spins Disc + Artwork + Cover ======- \\
 
    // ===================*** Foobar2000 64bit ***================== \\
   // ======= For Spider Monkey Panel 64bit, author: marc2003 ======= \\
  // ====== Masking All Images, Creates a Disc from Album Art+  ====== \\
 // ======== Sample Code ApplyMask author: T.P Wang / marc2003 ======== \\
// ==-== Inspired by "CD Album Art, @authors "marc2003, Jul23, vnav" =-==\\

/*
 * ============================================================================================
 * SMP 64-bit Disc Spin V4.0 — High-Performance Vinyl / CD Rotation & Artwork Engine
 * ============================================================================================
 *
 * ARCHITECTURE OVERVIEW:
 * 1. Multi-Layer Compositing:
 *    - Layer 1 (StaticBgLayer): Solid custom background or multi-pass blurred cover art.
 *    - Layer 2 (Renderer.paintDisc / paintStatic): Pre-rendered rotated frame or static cover art.
 *    - Layer 3 (StaticTopLayer): Border framing and composited CRT/glass overlay effects.
 *    - Layer 4 (SliderRenderer): Interactive HUD for real-time opacity/padding adjustments.
 *
 * 2. Asynchronous Rotation Cache (RotationCache):
 *    - Pre-renders 360° rotation steps in small non-blocking batches (~8 frames/tick) into
 *      individual GDI bitmaps so on_paint is reduced to an ultra-fast DrawImage blit.
 *
 * 3. Safe GDI+ Resource Lifecycle:
 *    - Automatic LRU caching, deferred bitmap disposal, and leak-free try/finally blocks.
 * ============================================================================================
 */

// --------------------------------------------------------------------------------------------
// 1. ENGINE DIRECTIVES & DEFINITION
// --------------------------------------------------------------------------------------------

window.DrawMode = window.GetProperty('RP.DrawMode', 0); // 0 = GDI+ (CPU), 1 = D2D (GPU on JSplitter)

window.DefineScript('SMP 64bit Disc Spin V4.0', { author: 'L.E.D.', options: { grab_focus: true } });

// --------------------------------------------------------------------------------------------
// 2. HELPER INCLUDES & UTILITY WRAPPERS
// --------------------------------------------------------------------------------------------

include(fb.ComponentPath + 'samples\\complete\\js\\lodash.min.js');
include(fb.ComponentPath + 'samples\\complete\\js\\helpers.js');

/**
 * Sanitises filesystem path segments by removing illegal characters.
 * @param {string} str - Raw string to sanitise.
 * @returns {string} Sanitised filesystem-safe string.
 */
function _fbSanitise(str) {
    if (!str) return '';
    return utils.ReplaceIllegalChars(str, true);
}

// --------------------------------------------------------------------------------------------
// 3. LIFECYCLE PHASE GUARD
// --------------------------------------------------------------------------------------------

const Phase = { BOOT: 0, LIVE: 1, SHUTDOWN: 2 };
let phase = Phase.BOOT;

/**
 * Returns true if the script has completed initial boot and is actively running.
 * @returns {boolean}
 */
function isLive() {
    return phase === Phase.LIVE;
}

// --------------------------------------------------------------------------------------------
// 4. PERSISTENT PROPERTIES (WINDOW STORAGE)
// --------------------------------------------------------------------------------------------

const props = {
    // --- Spin & Disc Settings ---
    spinningEnabled:        new _p('RP.SpinningEnabled', true),
    spinSpeed:              new _p('RP.SpinSpeed', 2.0),
    useAlbumArtOnly:        new _p('RP.UseAlbumArtOnly', false),
    keepAspectRatio:        new _p('RP.KeepAspectRatio', true),
    interpolationMode:      new _p('RP.InterpolationMode', 0),
    maxImageSize:           new _p('RP.MaxImageSize', 500),
    savedPath:              new _p('RP.SavedPath', ''),
    savedIsDisc:            new _p('RP.SavedIsDisc', false),
    maskType:               new _p('RP.MaskType', 0),
    userOverrideMask:       new _p('RP.UserOverrideMask', false),
    rotationStep:           new _p('RP.RotationStep', 2),

    // --- Overlay Effects & Opacity ---
    showReflection:         new _p('Disc.ShowReflection', true),
    opReflection:           new _p('Disc.OpReflection', 25),
    showGlow:               new _p('Disc.ShowGlow', false),
    opGlow:                 new _p('Disc.OpGlow', 80),
    showScanlines:          new _p('Disc.ShowScanlines', false),
    opScanlines:            new _p('Disc.OpScanlines', 100),
    showPhosphor:           new _p('Disc.ShowPhosphor', true),
    opPhosphor:             new _p('Disc.OpPhosphor', 20),
    phosphorTheme:          new _p('Disc.PhosphorTheme', 8),
    customPhosphorColor:    new _p('Disc.CustomPhosphorColor', 0xFFFFFFFF),
    overlayAllOff:          new _p('Disc.OverlayAllOff', false),
    savedOverlay:           new _p('Disc.SavedOverlay', ''),

    // --- Layout & Framing ---
    borderSize:             new _p('Disc.BorderSize', 5),
    borderColor:            new _p('Disc.BorderColor', 0xFF202020),
    padding:                new _p('Disc.Padding', 10),

    // --- Background & Blur ---
    backgroundEnabled:      new _p('Disc.BackgroundEnabled', true),
    blurRadius:             new _p('Disc.BlurRadius', 240),
    blurEnabled:            new _p('Disc.BlurEnabled', true),
    darkenValue:            new _p('Disc.DarkenValue', 10),
    customBackgroundColor:  new _p('Disc.CustomBackgroundColor', 0xFF191919),
    bgUseUIColor:           new _p('Disc.BgUseUIColor', false)
};

/**
 * Retrieves the host UI accent/background colour across DUI and CUI containers.
 * @returns {number} 32-bit ARGB colour.
 */
function _getUIColour() {
    try {
        return window.InstanceType === 1
            ? window.GetColourDUI(1)
            : window.GetColourCUI(3);
    } catch (e) {
        return window.GetColourDUI(1);
    }
}

// --------------------------------------------------------------------------------------------
// 5. IMMUTABLE CONSTANTS & CONFIGURATION
// --------------------------------------------------------------------------------------------

const CONFIG = Object.freeze({
    // --- Timings & Intervals ---
    TIMER_INTERVAL:      42,    // ~24 fps rotation timer (ms)
    DISPOSE_DELAY_MS:    50,    // Deferred GDI bitmap disposal window (ms)
    LOAD_DEBOUNCE_MS:    33,    // Delay before triggering image search on track change
    ANGLE_MODULO:        360,   // Reset angle at 360° to prevent float precision drift

    // --- Sizing Limits & Ratios ---
    MIN_DISC_SIZE:       125,
    MAX_DISC_SIZE:       1000,
    MAX_STATIC_SIZE:     3000,  // Max dimension for unmasked cover art
    MIN_SPIN_SPEED:      0.5,
    MAX_SPIN_SPEED:      5.0,
    DISC_SCALE_FACTOR:   1.00,  // 1.0 = fill available inset area

    // --- Cache Capacities ---
    MAX_MASK_CACHE:      10,
    MAX_RIM_CACHE:       10,
    MAX_FILE_CACHE:      200,
    MAX_FILE_LIST_CACHE: 30,
    MAX_SUBFOLDER_CACHE: 50,
    MAX_BG_CACHE:        4,

    // --- Search Depth & Limits ---
    MAX_SUBFOLDER_DEPTH: 3,
    MAX_CUSTOM_FOLDERS:  5,

    // --- Rendering Quality ---
    SMOOTHING_MODE:      4,     // AntiAlias / HighSpeed balance in GDI+

    // --- Filesystem Paths ---
    PATHS: {
        DEFAULT_DISC: fb.ProfilePath + "skins\\default_disc.png",
        RIM:          fb.ProfilePath + "skins\\center_album_rim.png",
        SKINS_DIR:    fb.ProfilePath + "skins\\"
    },

    // --- Mask Types ---
    MASK_TYPES: [
        { name: "CD Mask",    file: "mask.png",       id: 0 },
        { name: "Vinyl Mask", file: "vinyl_mask.png", id: 1 },
        { name: "No Mask",    file: null,             id: 2 }
    ],

    // --- Search Filename Patterns ---
    DISC_PATTERNS: ["disc", "cd", "media", "vinyl"],
    COVER_PATTERNS: [
        "cover", "front", "folder", "albumart", "album", "artwork", "art", "front cover"
    ],
    EXTENSIONS: [".png", ".jpg", ".jpeg", ".webp", ".bmp"],
    JSON_ART_FILES: [
        "lastfm_artist_getSimilar.json",
        "lastfm_album_getInfo.json",
        "lastfm_track_getInfo.json",
        "lastfm.json"
    ],

    // --- Overlay Geometry ---
    OVERLAY: {
        REFLECTION_HEIGHT_RATIO: 0.45,
        SCANLINE_SPACING:        3,
        GLOW_ART_STEPS:          30,
        GLOW_ART_MULT:           0.05
    },

    // --- Phosphor Palette ---
    PHOSPHOR_THEMES: [
        { name: "Classic",  color: 0x00FF00 },
        { name: "Neo",      color: 0x00FFFF },
        { name: "Dark",     color: 0x00C800 },
        { name: "Bright",   color: 0xFFFF00 },
        { name: "Retro",    color: 0x00FF64 },
        { name: "Minimal",  color: 0x00B400 },
        { name: "Matrix",   color: 0x00FF32 },
        { name: "Vapor",    color: 0xFFB4FF },
        { name: "Cyber",    color: 0x00BFFF },
        { name: "Magenta",  color: 0xFF00FF }
    ],

    INTERPOLATION_MODES: [
        { name: "Nearest Neighbor (Fastest)", value: 0 },
        { name: "Low Quality",                value: 1 },
        { name: "Bilinear",                   value: 2 }
    ],

    DISC_SIZE_PRESETS: [
        { name: "Small (125px)",  value: 125  },
        { name: "Medium (250px)", value: 250  },
        { name: "Large (500px)",  value: 500  },
        { name: "XL (750px)",     value: 750  },
        { name: "XXL (1000px)",   value: 1000 }
    ],

    SPEED_PRESETS: [
        { name: "Slow (1.0x)",   value: 1.0 },
        { name: "Normal (2.0x)", value: 2.0 },
        { name: "Fast (3.0x)",   value: 3.0 }
    ],

    IMAGE_TYPE: {
        REAL_DISC:    0,
        ALBUM_ART:    1,
        DEFAULT_DISC: 2
    }
});

// Validate and clamp persisted property values on startup
(function clampPersistedProps() {
    const s = props.spinSpeed.value;
    const cs = Math.max(CONFIG.MIN_SPIN_SPEED, Math.min(CONFIG.MAX_SPIN_SPEED, s));
    if (cs !== s) props.spinSpeed.value = cs;

    const sz = props.maxImageSize.value;
    const csz = Math.max(CONFIG.MIN_DISC_SIZE, Math.min(CONFIG.MAX_DISC_SIZE, sz));
    if (csz !== sz) props.maxImageSize.value = csz;

    if (![2, 3, 4].includes(props.rotationStep.value)) props.rotationStep.value = 2;
})();

// HUD Slider UI Settings
const SLIDER_MIN_WIDTH   = 220;
const SLIDER_WIDTH_RATIO = 0.6;
const SLIDER_HEIGHT      = 6;
const SLIDER_STEP        = 5;

const DISC_CUSTOM_THEME_INDEX = CONFIG.PHOSPHOR_THEMES.length;

let readyTimer         = null;
let resizeTimer        = null;
let _resizeStage1Timer = null;
let _resizeStage2Timer = null;
let _resizeStage3Timer = null;
let isPaused           = false;

// --------------------------------------------------------------------------------------------
// 6. IMAGE UID TAGGING HELPER
// --------------------------------------------------------------------------------------------

let _imgUIDCounter = 0;

/**
 * Stamps a unique ID onto a GDI bitmap to detect content mutations across cache layers.
 * @param {object} img - GDI image object.
 * @returns {object} Tagged image object.
 */
function _tagImg(img) {
    if (img && img._uid === undefined) {
        img._uid = ++_imgUIDCounter;
    }
    return img;
}

// --------------------------------------------------------------------------------------------
// 7. REPAINT SCHEDULER & DIRTY-RECT HELPERS
// --------------------------------------------------------------------------------------------

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
                if (!isLive()) return;
                window.Repaint();
            }, 0);
        },
        immediate() {
            if (!isLive()) return;
            if (_timer) { window.ClearTimeout(_timer); _timer = null; }
            _pending = false;
            window.Repaint();
        },
        cancel() {
            if (_timer) { window.ClearTimeout(_timer); _timer = null; }
            _pending = false;
        }
    };
})();

const RepaintHelper = {
    _allValid: false,

    full() {
        prepareLayers();
        RepaintScheduler.request();
    },

    region(x, y, w, h) {
        prepareLayers();
        if (w > 0 && h > 0) window.RepaintRect(x, y, w, h);
        else RepaintScheduler.request();
    },

    disc() {
        const pc = State.paintCache;
        if (pc.valid && pc.discSize > 0) {
            const rx = Math.max(0, pc.discX - 10);
            const ry = Math.max(0, pc.discY - 10);
            if (RepaintHelper._allValid) {
                window.RepaintRect(rx, ry, pc.discSize + 20, pc.discSize + 20);
                return;
            }
            prepareLayers();
            window.RepaintRect(rx, ry, pc.discSize + 20, pc.discSize + 20);
            return;
        }
        const pad    = P.padding;
        const border = P.borderSize;
        const w      = window.Width;
        const h      = window.Height;
        const size   = Math.min(w, h) - (pad + border) * 2;
        if (size <= 0) { this.full(); return; }
        const x      = Math.max(0, Math.floor((w - size) / 2) - 10);
        const y      = Math.max(0, Math.floor((h - size) / 2) - 10);
        prepareLayers();
        window.RepaintRect(x, y, size + 20, size + 20);
    },

    background() {
        this.full();
    }
};

// --------------------------------------------------------------------------------------------
// 8. PROPERTY ACCESSORS (CONVENIENCE GETTERS)
// --------------------------------------------------------------------------------------------

const P = {
    get spinningEnabled()       { return props.spinningEnabled.enabled; },
    get spinSpeed()             { return props.spinSpeed.value; },
    get useAlbumArtOnly()       { return props.useAlbumArtOnly.enabled; },
    get keepAspectRatio()       { return props.keepAspectRatio.enabled; },
    get interpolationMode()     { return props.interpolationMode.value; },
    get maxImageSize()          { return props.maxImageSize.value; },
    get savedPath()             { return props.savedPath.value; },
    get maskType()              { return props.maskType.value; },
    get userOverrideMask()      { return props.userOverrideMask.enabled; },
    get rotationStep()          { return props.rotationStep.value; },

    get showReflection()        { return props.showReflection.enabled; },
    get opReflection()          { return props.opReflection.value; },
    get showGlow()              { return props.showGlow.enabled; },
    get opGlow()                { return props.opGlow.value; },
    get showScanlines()         { return props.showScanlines.enabled; },
    get opScanlines()           { return props.opScanlines.value; },
    get showPhosphor()          { return props.showPhosphor.enabled; },
    get opPhosphor()            { return props.opPhosphor.value; },
    get phosphorTheme()         { return props.phosphorTheme.value; },
    get customPhosphorColor()   { return props.customPhosphorColor.value; },
    get overlayAllOff()         { return props.overlayAllOff.enabled; },

    get borderSize()            { return props.borderSize.value; },
    get borderColor()           { return props.borderColor.value; },
    get padding()               { return props.padding.value; },

    get backgroundEnabled()     { return props.backgroundEnabled.enabled; },
    get blurRadius()            { return props.blurRadius.value; },
    get blurEnabled()           { return props.blurEnabled.enabled; },
    get darkenValue()           { return props.darkenValue.value; },
    get customBackgroundColor() { return props.customBackgroundColor.value; },
    get bgUseUIColor()          { return props.bgUseUIColor.enabled; }
};

// --------------------------------------------------------------------------------------------
// 9. GENERAL UTILITIES & LAYOUT CALCULATIONS
// --------------------------------------------------------------------------------------------

const Utils = {
    safeDispose(obj) {
        if (obj && typeof obj.Dispose === 'function') {
            try { obj.Dispose(); } catch (e) {}
        }
    },

    getImageType(path) {
        if (!path) return null;
        if (path === CONFIG.PATHS.DEFAULT_DISC) return CONFIG.IMAGE_TYPE.DEFAULT_DISC;

        const lp = path.toLowerCase();
        for (const pattern of CONFIG.DISC_PATTERNS) {
            if (new RegExp('(^|[\\\\/._\\- ])' + _.escapeRegExp(pattern) + '\\d*([\\\\/._\\- ]|$)').test(lp)) {
                return CONFIG.IMAGE_TYPE.REAL_DISC;
            }
        }
        return CONFIG.IMAGE_TYPE.ALBUM_ART;
    },

    detectMaskFromPath(path) {
        if (!path) return null;
        const lp = path.toLowerCase();
        if (/(^|[\\/._\- ])vinyl\d*([\\/._\- ]|$)/.test(lp)) return 1;
        if (/(^|[\\/._\- ])(disc|cd)\d*([\\/._\- ]|$)/.test(lp)) return 0;
        return null;
    },

    getPanelDiscSize() {
        const w = window.Width;
        const h = window.Height;
        if (w <= 0 || h <= 0) return props.maxImageSize.value;
        const layout = calcDiscLayout(w, h);
        if (layout.size <= 0) return CONFIG.MIN_DISC_SIZE;
        return layout.size > props.maxImageSize.value ? props.maxImageSize.value : layout.size;
    }
};

/**
 * Calculates the bounding box and position of the centered disc.
 * @param {number} w - Panel width.
 * @param {number} h - Panel height.
 * @returns {{size: number, x: number, y: number}}
 */
function calcDiscLayout(w, h) {
    const inset  = P.padding + P.borderSize;
    const availW = w - inset * 2;
    const availH = h - inset * 2;
    const size   = Math.max(0, Math.floor(Math.min(availW, availH) * CONFIG.DISC_SCALE_FACTOR));
    return { size, x: (w - size) / 2, y: (h - size) / 2 };
}

// --------------------------------------------------------------------------------------------
// 10. MATH & COLOUR CONVERSIONS
// --------------------------------------------------------------------------------------------

const MathX = {
    setAlpha(col, a) {
        return ((col & 0x00FFFFFF) | (a << 24)) >>> 0;
    },
    blendWithWhite(col, ratio) {
        const r = Math.floor(((col >>> 16) & 255) + (255 - ((col >>> 16) & 255)) * ratio);
        const g = Math.floor(((col >>> 8) & 255) + (255 - ((col >>> 8) & 255)) * ratio);
        const b = Math.floor((col & 255) + (255 - (col & 255)) * ratio);
        return (0xFF000000 | (r << 16) | (g << 8) | b) >>> 0;
    }
};

const DS_BLACK = MathX.setAlpha(_RGB(0, 0, 0),     255);
const DS_WHITE = MathX.setAlpha(_RGB(255, 255, 255), 255);

// --------------------------------------------------------------------------------------------
// 11. LRU CACHE GENERATOR
// --------------------------------------------------------------------------------------------

const LRUCache = (maxSize, autoDispose = true) => {
    const cache   = new Map();
    const dispose = v => { if (autoDispose) Utils.safeDispose(v); };
    return {
        get(key) {
            const value = cache.get(key);
            if (value === undefined) return null;
            cache.delete(key);
            cache.set(key, value);
            return value;
        },
        set(key, value) {
            if (cache.has(key)) {
                const existing = cache.get(key);
                if (existing !== value) dispose(existing);
                cache.delete(key);
            } else if (cache.size >= maxSize) {
                const firstKey = cache.keys().next().value;
                const firstVal = cache.get(firstKey);
                if (firstVal !== value) dispose(firstVal);
                cache.delete(firstKey);
            }
            cache.set(key, value);
        },
        has(key)  { return cache.has(key); },
        clear()   { cache.forEach(dispose); cache.clear(); }
    };
};

// --------------------------------------------------------------------------------------------
// 12. FILESYSTEM MANAGER & PATTERN SEARCH
// --------------------------------------------------------------------------------------------

const _fso = (function() {
    try { return new ActiveXObject('Scripting.FileSystemObject'); } catch (e) { return null; }
})();

const FileManager = {
    cache:          new Map(),
    subfolderCache: new Map(),
    fileListCache:  new Map(),

    FILE_EXIST_TTL: 5 * 60 * 1000,
    FILE_LIST_TTL:  2 * 60 * 1000,

    exists(path) {
        if (!path) return false;
        if (this.cache.has(path)) {
            const entry = this.cache.get(path);
            if (Date.now() - entry.at < this.FILE_EXIST_TTL) return entry.result;
            this.cache.delete(path);
        }
        const exists = _isFile(path);
        if (exists) {
            this.cache.set(path, { result: true, at: Date.now() });
            if (this.cache.size > CONFIG.MAX_FILE_CACHE) {
                this.cache.delete(this.cache.keys().next().value);
            }
        }
        return exists;
    },

    getImageFiles(folder) {
        if (!folder) return [];
        if (this.fileListCache.has(folder)) {
            const entry = this.fileListCache.get(folder);
            if (Date.now() - entry.at < this.FILE_LIST_TTL) return entry.files;
            this.fileListCache.delete(folder);
        }
        
        const files = [];
        try {
            if (_fso && _fso.FolderExists(folder)) {
                const f = _fso.GetFolder(folder);
                const en = new Enumerator(f.Files);
                for (; !en.atEnd(); en.moveNext()) {
                    try {
                        const file = en.item();
                        const ext = file.Path.toLowerCase().match(/\.[^.]+$/);
                        if (ext && CONFIG.EXTENSIONS.includes(ext[0])) {
                            files.push(file.Path);
                        }
                    } catch (_) {}
                }
            }
        } catch (e) {}
        
        this.fileListCache.set(folder, { files, at: Date.now() });
        if (this.fileListCache.size > CONFIG.MAX_FILE_LIST_CACHE) {
            this.fileListCache.delete(this.fileListCache.keys().next().value);
        }
        return files;
    },

    isDirectory(path) {
        return path ? _isFolder(path) : false;
    },

    sanitizeMetadata(str) {
        if (!str) return "";
        return _.trim(
            str.replace(/\[.*?\]/g, '')
               .replace(/\(.*?\)/g, '')
               .replace(/\{.*?\}/g, '')
               .replace(/<.*?>/g, '')
               .replace(/^(The|A|An)\s+/i, '')
               .replace(/[^\w\s\-&'+]/g, ' ')
               .replace(/_/g, ' ')
               .replace(/\s+/g, ' ')
        );
    },

    createSearchVariations(str) {
        if (!str) return [];
        const cleaned   = this.sanitizeMetadata(str);
        const noArticle = cleaned.replace(/^(The|A|An)\s+/i, '');
        return _.uniq([
            cleaned,
            noArticle !== cleaned ? noArticle : null,
            cleaned.replace(/\s+/g, '-'),
            cleaned.replace(/\s+/g, '_'),
            _.toLower(cleaned),
            _.toLower(cleaned.replace(/\s+/g, '-'))
        ].filter(Boolean));
    },

    getSubfolders(folder) {
        if (folder && folder.length > 3) folder = folder.replace(/\\+$/, '');
        if (this.subfolderCache.has(folder)) return this.subfolderCache.get(folder);

        const subfolders = [];
        if (this.isDirectory(folder)) {
            try {
                if (_fso && _fso.FolderExists(folder)) {
                    const folderObj = _fso.GetFolder(folder);
                    const en = new Enumerator(folderObj.SubFolders);
                    for (; !en.atEnd(); en.moveNext()) subfolders.push(en.item().Path);
                }
            } catch (e) {
                console.log('DiscSpin: getSubfolders error for "' + folder + '":', e);
            }
        }

        this.subfolderCache.set(folder, subfolders);
        if (this.subfolderCache.size > CONFIG.MAX_SUBFOLDER_CACHE) {
            this.subfolderCache.delete(this.subfolderCache.keys().next().value);
        }
        return subfolders;
    },

    buildSearchPaths(folder, patterns, metadataNames, useVariations = false) {
        const allPatterns = [...patterns];
        _.forEach(metadataNames, name => {
            if (useVariations) {
                _.forEach(this.createSearchVariations(name), v => {
                    const s = _fbSanitise(v);
                    if (s) allPatterns.push(s);
                });
            } else {
                const s = _fbSanitise(this.sanitizeMetadata(name));
                if (s) allPatterns.push(s);
            }
        });
        const paths = [];
        const sep = folder.endsWith('\\') ? '' : '\\';
        _.forEach(allPatterns, pattern => {
            _.forEach(CONFIG.EXTENSIONS, ext => paths.push(folder + sep + pattern + ext));
        });
        return paths;
    },

    findImageInPaths(paths) {
        return _.find(paths, p => this.exists(p)) || null;
    },

    _isLastFmSidecar(jsonPath) {
        try {
            if (!_isFile(jsonPath)) return false;
            const content = utils.ReadUTF8(jsonPath);
            if (!content) return false;
            const data = JSON.parse(content);
            if (!data || !_.isObject(data)) return false;
            const fname = _.toLower(jsonPath.split('\\').pop());
            return _.includes(fname, 'lastfm') ||
                   !!(data.similarartists && data.similarartists.artist) ||
                   (_.isString(data.url) && _.includes(data.url, 'last.fm'));
        } catch (e) {
            return false;
        }
    },

    _extractLocalImageFromLastFm(data, folder) {
        const imageFields = [];
        if (data.image)                                          imageFields.push(data.image);
        if (data.album && data.album.image)                      imageFields.push(data.album.image);
        if (data.track && data.track.album && data.track.album.image)
            imageFields.push(data.track.album.image);
        const sep = folder.endsWith('\\') ? '' : '\\';
        for (const field of imageFields) {
            const candidates = _.isArray(field) ? field : [field];
            for (const entry of candidates) {
                const ref = (entry && (entry['#text'] || entry.url || entry)) || '';
                const str = _.isString(ref) ? _.trim(ref) : '';
                if (!str || str.startsWith('http')) continue;
                const abs = (str.includes('\\') || str.includes('/')) ? str : folder + sep + str;
                if (_isFile(abs)) return abs;
            }
        }
        return null;
    },

    searchLastFmJson(folder) {
        const sep = folder.endsWith('\\') ? '' : '\\';
        for (const jsonFile of CONFIG.JSON_ART_FILES) {
            const jsonPath = folder + sep + jsonFile;
            try {
                if (!_isFile(jsonPath)) continue;
                const content = utils.ReadUTF8(jsonPath);
                if (!content) continue;
                const data = JSON.parse(content);
                if (!data || !_.isObject(data)) continue;
                if (!this._isLastFmSidecar(jsonPath)) continue;

                const localRef = this._extractLocalImageFromLastFm(data, folder);
                if (localRef) return localRef;

                const paths = this.buildSearchPaths(folder, CONFIG.COVER_PATTERNS, []);
                const found = this.findImageInPaths(paths);
                if (found) return found;
            } catch (e) {}
        }
        return null;
    },

    clear() {
        this.cache.clear();
        this.subfolderCache.clear();
        this.fileListCache.clear();
    }
};

function _toTitleCase(str) {
    return str.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());
}

// --------------------------------------------------------------------------------------------
// 13. CUSTOM SEARCH FOLDERS
// --------------------------------------------------------------------------------------------

const CustomFolders = {
    folders: [],

    load() {
        const saved  = window.GetProperty("RP.CustomFolders", "");
        const parsed = _jsonParse(saved);
        this.folders = _.isArray(parsed)
            ? _.filter(parsed, f => _.isString(f) && f.length > 0)
            : [];
    },

    save() {
        try { window.SetProperty("RP.CustomFolders", JSON.stringify(this.folders)); } catch (e) {}
    },

    add(folder) {
        if (!folder || !FileManager.isDirectory(folder)) return false;
        if (this.folders.indexOf(folder) !== -1) return false;
        if (this.folders.length >= CONFIG.MAX_CUSTOM_FOLDERS) this.folders.shift();
        this.folders.push(folder);
        this.save();
        return true;
    },

    remove(index) {
        if (index >= 0 && index < this.folders.length) {
            this.folders.splice(index, 1);
            this.save();
            return true;
        }
        return false;
    },

    clear()  { this.folders = []; this.save(); },
    getAll() { return [...this.folders]; }
};

// --------------------------------------------------------------------------------------------
// 14. ASSET MANAGER (MASKS & CENTRE RIM OVERLAY)
// --------------------------------------------------------------------------------------------

const AssetManager = {
    maskSource:       null,
    rimSource:        null,
    maskCache:        LRUCache(CONFIG.MAX_MASK_CACHE),
    rimCache:         LRUCache(CONFIG.MAX_RIM_CACHE),
    currentMaskType:  0,
    userOverrideMask: false,

    init() {
        this.currentMaskType  = props.maskType.value;
        this.userOverrideMask = props.userOverrideMask.enabled;
        this.loadMask();
        this.loadRim();
    },

    loadMask() {
        const oldMask = this.maskSource;
        this.maskSource = null;
        this.maskCache.clear();
        const maskType = CONFIG.MASK_TYPES[this.currentMaskType];
        if (!maskType || !maskType.file) {
            if (oldMask) window.SetTimeout(() => { if (!isLive()) return; Utils.safeDispose(oldMask); }, CONFIG.DISPOSE_DELAY_MS);
            return;
        }
        const maskPath = CONFIG.PATHS.SKINS_DIR + maskType.file;
        try {
            if (FileManager.exists(maskPath)) this.maskSource = gdi.Image(maskPath);
        } catch (e) {}
        if (oldMask) window.SetTimeout(() => { if (!isLive()) return; Utils.safeDispose(oldMask); }, CONFIG.DISPOSE_DELAY_MS);
    },

    loadRim() {
        const oldRim = this.rimSource;
        this.rimSource = null;
        try {
            if (FileManager.exists(CONFIG.PATHS.RIM)) {
                this.rimSource = gdi.Image(CONFIG.PATHS.RIM);
            }
        } catch (e) {}
        if (oldRim) window.SetTimeout(() => { if (!isLive()) return; Utils.safeDispose(oldRim); }, CONFIG.DISPOSE_DELAY_MS);
    },

    setMaskType(index, isUserOverride = true, forceReload = false) {
        if (index === this.currentMaskType && !forceReload) return false;
        this.currentMaskType           = index;
        this.userOverrideMask          = isUserOverride;
        props.maskType.value           = index;
        props.userOverrideMask.enabled = isUserOverride;
        this.loadMask();
        ImageLoader.clearCache();
        this.maskCache.clear();
        this.rimCache.clear();
        DiscComposite.dispose();
        State.lastFrame         = -1;
        State.paintCache.valid  = false;
        const oldImg   = State.img;
        const oldBgImg = State.bgImg;
        State.img   = null;
        State.bgImg = null;
        State.imageType = CONFIG.IMAGE_TYPE.REAL_DISC;
        if (oldImg || oldBgImg) {
            window.SetTimeout(() => {
                if (!isLive()) return;
                Utils.safeDispose(oldImg);
                if (oldBgImg && oldBgImg !== oldImg) Utils.safeDispose(oldBgImg);
            }, CONFIG.DISPOSE_DELAY_MS);
        }
        invalidateBgCaches();
        if (State.currentMetadb) ImageLoader.loadForMetadb(State.currentMetadb, true);
        RepaintHelper.full();
        return true;
    },

    autoSelectMask(imagePath) {
        if (this.userOverrideMask) return false;
        const detected = Utils.detectMaskFromPath(imagePath);
        if (detected !== null && detected !== this.currentMaskType) {
            return this.setMaskType(detected, false);
        }
        return false;
    },

    hasMask() { return this.maskSource !== null; },

    shouldShowRim(imageType) {
        return imageType === CONFIG.IMAGE_TYPE.ALBUM_ART &&
               this.currentMaskType === 0 &&
               this.hasMask();
    },

    getMask(size) {
        if (!this.maskSource) return null;
        const key    = this.currentMaskType + "_" + size;
        const cached = this.maskCache.get(key);
        if (cached) return cached;
        try {
            const resized = this.maskSource.Resize(size, size);
            this.maskCache.set(key, resized);
            return resized;
        } catch (e) { return null; }
    },

    getRim(size) {
        if (!this.rimSource) return null;
        const key    = this.currentMaskType + "_" + size;
        const cached = this.rimCache.get(key);
        if (cached) return cached;
        try {
            const resized = this.rimSource.Resize(size, size);
            this.rimCache.set(key, resized);
            return resized;
        } catch (e) { return null; }
    },

    cleanup() {
        this.maskCache.clear();
        this.rimCache.clear();
        Utils.safeDispose(this.maskSource);
        Utils.safeDispose(this.rimSource);
    }
};

// --------------------------------------------------------------------------------------------
// 15. IMAGE PROCESSOR (CROPPING & MASK APPLICATION)
// --------------------------------------------------------------------------------------------

const ImageProcessor = {
    scaleToSquare(raw, targetSize, interpolationMode, imageType) {
        if (!raw) return null;
        if (targetSize <= 0) { Utils.safeDispose(raw); return null; }
        const w = raw.Width;
        const h = raw.Height;

        if (w === targetSize && h === targetSize) {
            try {
                const cloned = raw.Clone(0, 0, w, h);
                Utils.safeDispose(raw);
                return _tagImg(cloned);
            } catch (e) { return _tagImg(raw); }
        }

        let newImg = null;
        try {
            newImg = gdi.CreateImage(targetSize, targetSize);
            let g = null;
            let released = false;
            try {
                g = newImg.GetGraphics();
                g.SetInterpolationMode(interpolationMode);
                if (AssetManager.hasMask() && imageType === CONFIG.IMAGE_TYPE.ALBUM_ART) {
                    g.FillSolidRect(0, 0, targetSize, targetSize, 0xFF000000);
                }
                const scale   = targetSize / Math.min(w, h);
                const scaledW = Math.floor(w * scale);
                const scaledH = Math.floor(h * scale);
                const offsetX = Math.floor((targetSize - scaledW) / 2);
                const offsetY = Math.floor((targetSize - scaledH) / 2);
                g.DrawImage(raw, offsetX, offsetY, scaledW, scaledH, 0, 0, w, h);
                newImg.ReleaseGraphics(g);
                released = true;
                g = null;
            } finally {
                if (!released && g) { try { newImg.ReleaseGraphics(g); } catch (_) {} }
            }
            Utils.safeDispose(raw);
            return _tagImg(newImg);
        } catch (e) {
            Utils.safeDispose(newImg);
            Utils.safeDispose(raw);
            return null;
        }
    },

    scaleProportional(raw, maxSize, interpolationMode) {
        if (!raw) return null;
        if (maxSize <= 0) { Utils.safeDispose(raw); return null; }
        const w      = raw.Width;
        const h      = raw.Height;
        const maxDim = Math.max(w, h);

        if (maxDim <= maxSize) {
            try {
                const cloned = raw.Clone(0, 0, w, h);
                Utils.safeDispose(raw);
                return _tagImg(cloned);
            } catch (e) { return _tagImg(raw); }
        }

        const scale  = maxSize / maxDim;
        const nw     = Math.floor(w * scale);
        const nh     = Math.floor(h * scale);
        let newImg = null;
        try {
            newImg = gdi.CreateImage(nw, nh);
            let g = null;
            let released = false;
            try {
                g = newImg.GetGraphics();
                g.SetInterpolationMode(interpolationMode);
                g.DrawImage(raw, 0, 0, nw, nh, 0, 0, w, h);
                newImg.ReleaseGraphics(g);
                released = true;
                g = null;
            } finally {
                if (!released && g) { try { newImg.ReleaseGraphics(g); } catch (_) {} }
            }
            Utils.safeDispose(raw);
            return _tagImg(newImg);
        } catch (e) {
            Utils.safeDispose(newImg);
            Utils.safeDispose(raw);
            return null;
        }
    },

    applyMask(image, size) {
        if (!image) return null;
        let clone = null;
        try {
            clone = image.Clone(0, 0, image.Width, image.Height);
            const mask = AssetManager.getMask(size);
            if (mask) clone.ApplyMask(mask);
            Utils.safeDispose(image);
            return _tagImg(clone);
        } catch (e) {
            Utils.safeDispose(clone);
            return _tagImg(image);
        }
    },

    processForDisc(raw, targetSize, imageType, interpolationMode) {
        if (!raw) return null;
        let processed = this.scaleToSquare(raw, targetSize, interpolationMode, imageType);
        if (!processed) return null;
        const shouldMask = AssetManager.hasMask() &&
            (imageType === CONFIG.IMAGE_TYPE.REAL_DISC || imageType === CONFIG.IMAGE_TYPE.ALBUM_ART);
        if (shouldMask) processed = this.applyMask(processed, targetSize);
        return processed;
    }
};

// --------------------------------------------------------------------------------------------
// 16. CENTRAL STATE STORE & TIMER COORDINATION
// --------------------------------------------------------------------------------------------

const State = {
    img:           null,
    bgImg:         null,
    _bgIdCounter:  0,
    angle:         0,
    lastFrame:     -1,
    isDiscImage:   false,
    imageType:     CONFIG.IMAGE_TYPE.REAL_DISC,
    currentMetadb: null,
    loadToken:     0,
    pendingArtToken: 0,
    spinTimer:     null,
    loadTimer:     null,
    phaseBTimer:   null,

    paintCache: {
        bgColor:        _getUIColour(),
        windowWidth:    0,
        windowHeight:   0,
        panelW:         0,
        panelH:         0,
        discSize:       0,
        discX:          0,
        discY:          0,
        staticW:        0,
        staticH:        0,
        staticX:        0,
        staticY:        0,
        imgWidth:       0,
        imgHeight:      0,
        keepAspectRatio: true,
        padding:        0,
        borderSize:     0,
        valid:          false
    },

    setImage(newImg, discState, imgType, originalImg) {
        const oldImg   = this.img;
        const oldBgImg = this.bgImg;

        this.img         = newImg;
        this.bgImg       = originalImg;
        if (this.bgImg && this.bgImg._bgId === undefined) {
            this.bgImg._bgId = ++State._bgIdCounter;
        }
        this.isDiscImage        = discState;
        this.imageType          = imgType;
        this.paintCache.valid   = false;
        invalidateBgCaches();
        OverlayCache.invalidate();

        if ((oldImg && oldImg !== newImg && oldImg !== originalImg) ||
            (oldBgImg && oldBgImg !== oldImg && oldBgImg !== newImg && oldBgImg !== originalImg)) {
            const doomedImg   = (oldImg && oldImg !== newImg && oldImg !== originalImg) ? oldImg : null;
            const doomedBgImg = (oldBgImg && oldBgImg !== oldImg && oldBgImg !== newImg && oldBgImg !== originalImg) ? oldBgImg : null;
            const doomedImgUid   = doomedImg   && doomedImg._uid   !== undefined ? doomedImg._uid   : null;
            const doomedBgImgUid = doomedBgImg && doomedBgImg._uid !== undefined ? doomedBgImg._uid : null;
            window.SetTimeout(() => {
                if (!isLive()) return;
                if (doomedImg && (doomedImgUid === null || !State.img || State.img._uid !== doomedImgUid)) {
                    Utils.safeDispose(doomedImg);
                }
                if (doomedBgImg && (doomedBgImgUid === null || !State.bgImg || State.bgImg._uid !== doomedBgImgUid)) {
                    Utils.safeDispose(doomedBgImg);
                }
            }, CONFIG.DISPOSE_DELAY_MS);
        }

        if (discState && newImg) {
            if (!isStaticMode()) {
                const size = Utils.getPanelDiscSize();
                DiscComposite.build(newImg, size, imgType);
                if (P.spinningEnabled) {
                    RotationCache.scheduleAsyncBuild(DiscComposite.img || newImg);
                }
            } else {
                DiscComposite.dispose();
            }
        } else {
            DiscComposite.dispose();
        }

        RepaintHelper.full();
    },

    updatePaintCache() {
        const w      = window.Width;
        const h      = window.Height;
        const pc     = this.paintCache;
        const pad    = P.padding;
        const border = P.borderSize;

        if (pc.valid &&
            pc.windowWidth   === w &&
            pc.windowHeight  === h &&
            pc.imgWidth      === (this.img ? this.img.Width  : 0) &&
            pc.imgHeight     === (this.img ? this.img.Height : 0) &&
            pc.keepAspectRatio === P.keepAspectRatio &&
            pc.padding       === pad &&
            pc.borderSize    === border) return;

        pc.windowWidth     = w;
        pc.windowHeight    = h;
        pc.keepAspectRatio = P.keepAspectRatio;
        pc.padding         = pad;
        pc.borderSize      = border;

        if (this.img) {
            pc.imgWidth  = this.img.Width;
            pc.imgHeight = this.img.Height;

            const totalInset = pad + border;
            const availW     = w - totalInset * 2;
            const availH     = h - totalInset * 2;

            if (this.isDiscImage) {
                const layout = calcDiscLayout(w, h);
                pc.discSize  = layout.size;
                pc.discX     = Math.floor((w - pc.discSize) / 2);
                pc.discY     = Math.floor((h - pc.discSize) / 2);
            } else {
                const safeAvailW = Math.max(0, availW);
                const safeAvailH = Math.max(0, availH);
                let sw = safeAvailW, sh = safeAvailH, sx = totalInset, sy = totalInset;
                if (P.keepAspectRatio && safeAvailW > 0 && safeAvailH > 0) {
                    const ratio = Math.min(safeAvailW / this.img.Width, safeAvailH / this.img.Height);
                    sw = Math.floor(this.img.Width  * ratio);
                    sh = Math.floor(this.img.Height * ratio);
                    sx = Math.floor((w - sw) / 2);
                    sy = Math.floor((h - sh) / 2);
                }
                pc.staticW = sw;
                pc.staticH = sh;
                pc.staticX = sx;
                pc.staticY = sy;
            }
            pc.valid = true;
        } else {
            pc.imgWidth  = 0;
            pc.imgHeight = 0;
            pc.discSize  = 0;
            pc.staticW   = 0;
            pc.staticH   = 0;
            pc.valid = true;
        }
    },

    cleanup() {
        this.stopTimer();
        if (this.loadTimer) {
            window.ClearTimeout(this.loadTimer);
            this.loadTimer = null;
        }
        if (this.phaseBTimer) {
            window.ClearTimeout(this.phaseBTimer);
            this.phaseBTimer = null;
        }
        const img   = this.img;
        const bgImg = this.bgImg;
        this.img             = null;
        this.bgImg           = null;
        this.currentMetadb   = null;
        this.loadToken       = 0;
        this.pendingArtToken = 0;
        Utils.safeDispose(img);
        if (bgImg && bgImg !== img) Utils.safeDispose(bgImg);
    },

    stopTimer() {
        if (this.spinTimer) {
            window.ClearInterval(this.spinTimer);
            this.spinTimer = null;
        }
    },

    updateTimer() {
        const shouldRun = this.img &&
                          this.isDiscImage &&
                          P.spinningEnabled &&
                          fb.IsPlaying &&
                          !isPaused &&
                          !P.useAlbumArtOnly;

        if (shouldRun && !this.spinTimer) {
            this.spinTimer = window.SetInterval(() => {
                this.angle = (this.angle + P.spinSpeed) % CONFIG.ANGLE_MODULO;
                const frame = Math.floor(this.angle / RotationCache.step);
                if (frame !== State.lastFrame) {
                    State.lastFrame = frame;
                    RepaintHelper.disc();
                }
            }, CONFIG.TIMER_INTERVAL);
        } else if (!shouldRun && this.spinTimer) {
            this.stopTimer();
            if (isStaticMode()) {
                this.angle     = 0;
                this.lastFrame = -1;
            }
        }
    }
};

function isStaticMode() {
    return P.useAlbumArtOnly || !P.spinningEnabled;
}

function releaseSpinResources() {
    State.stopTimer();
    RotationCache.clear();
    DiscComposite.dispose();
    State.angle     = 0;
    State.lastFrame = -1;
}

// --------------------------------------------------------------------------------------------
// 17. IMAGE LOADER (DISC & COVER SEARCH PIPELINE)
// --------------------------------------------------------------------------------------------

const ImageLoader = {
    _pathCache:    new Map(),
    PATH_HIT_TTL:  5 * 60 * 1000,
    PATH_MISS_TTL: 30 * 1000,
    tf_path:       fb.TitleFormat("$directory_path(%path%)"),
    tf_folder:     fb.TitleFormat("$directory(%path%)"),
    tf_artist:     fb.TitleFormat("%artist%"),
    tf_album:      fb.TitleFormat("%album%"),
    tf_title:      fb.TitleFormat("%title%"),
    tf_discnumber: fb.TitleFormat("%discnumber%"),

    clearCache() { this._pathCache.clear(); },

    getMetadataNames(metadb) {
        const artist = this.tf_artist.EvalWithMetadb(metadb);
        const album  = this.tf_album.EvalWithMetadb(metadb);
        const title  = this.tf_title.EvalWithMetadb(metadb);
        const folder = this.tf_folder.EvalWithMetadb(metadb);
        return {
            artist,
            album,
            title,
            folder,
            artistTitle: (artist && title) ? `${artist} - ${title}` : "",
            artistAlbum: (artist && album) ? `${artist} - ${album}` : ""
        };
    },

    searchInFolder(folder, patterns, metadata, useVariations = false) {
        const albumTitle       = (metadata.album && metadata.title)
            ? metadata.album + ' - ' + metadata.title : '';
        const artistAlbumTitle = (metadata.artist && metadata.album && metadata.title)
            ? metadata.artist + ' ' + metadata.album + ' ' + metadata.title : '';
        const metadataNames = _.compact([
            metadata.album, metadata.title, metadata.artist,
            metadata.folder, metadata.artistTitle, metadata.artistAlbum,
            albumTitle, artistAlbumTitle
        ]);
        const paths = FileManager.buildSearchPaths(folder, patterns, metadataNames, useVariations);
        return FileManager.findImageInPaths(paths);
    },

    searchInFolderAnyFile(folder, patterns) {
        const files = FileManager.getImageFiles(folder);
        const regexes = patterns.map(p =>
            new RegExp('(^|[._\\\\/ -])' + _.escapeRegExp(p) + '\\d*([._\\\\/ -]|$)', 'i')
        );
        for (const filePath of files) {
            const fileName = filePath.split('\\').pop() || filePath;
            const baseName = fileName.replace(/\.[^.]+$/, '');
            for (const re of regexes) {
                if (re.test(baseName)) return filePath;
            }
        }
        return null;
    },

    _searchFolderTree(folder, patterns, maxLevels, isDiscSearch, metadata, visited = new Set()) {
        if (maxLevels <= 0 || !folder) return null;
        if (visited.has(folder)) return null;
        visited.add(folder);
        const found = this.searchFolderForImage(folder, patterns, isDiscSearch, metadata);
        if (found) return found;
        const subfolders = FileManager.getSubfolders(folder);
        for (const sub of subfolders) {
            const result = this._searchFolderTree(sub, patterns, maxLevels - 1, isDiscSearch, metadata, visited);
            if (result) return result;
        }
        return null;
    },

    searchCustomFolders(metadata, patterns, isDiscSearch) {
        const artistAlbumDash  = metadata.artistAlbum || '';
        const artistAlbumSpace = (metadata.artist && metadata.album)
            ? metadata.artist + ' ' + metadata.album : '';

        const simpleNames = _.compact([
            metadata.title, metadata.artist, metadata.album,
            artistAlbumDash, artistAlbumSpace
        ]);

        const nameVariations = [];
        _.forEach(simpleNames, name => {
            if (!name) return;
            const lower = name.toLowerCase();
            nameVariations.push(lower);
            nameVariations.push(lower.replace(/\s+/g, '-'));
            nameVariations.push(lower.replace(/\s+/g, '_'));
            const title = _toTitleCase(name);
            nameVariations.push(title);
            nameVariations.push(title.replace(/\s+/g, '-'));
            nameVariations.push(title.replace(/\s+/g, '_'));
        });
        const folderMatchNames = _.uniq(nameVariations);
        const customFolders    = CustomFolders.getAll();
        const visited = new Set();

        for (const customFolder of customFolders) {
            if (!FileManager.isDirectory(customFolder)) continue;
            visited.add(customFolder);
            const nameMatched = this.searchInFolder(customFolder, patterns, metadata, true);
            if (nameMatched) {
                return isDiscSearch ? this._loadDiscResult(nameMatched) : nameMatched;
            }
        }

        for (const customFolder of customFolders) {
            if (!FileManager.isDirectory(customFolder)) continue;
            const level1 = FileManager.getSubfolders(customFolder);
            for (const sub1 of level1) {
                if (visited.has(sub1)) continue;
                visited.add(sub1);
                const sub1Name = _.last(sub1.split('\\')).toLowerCase();
                const match1   = folderMatchNames.some(n =>
                    sub1Name === n || sub1Name.includes(n) || n.includes(sub1Name) ||
                    sub1Name.replace(/\s+/g, '-') === n ||
                    sub1Name.replace(/\s+/g, '_') === n
                );
                if (match1) {
                    const img = this.searchInFolder(sub1, patterns, metadata, true)
                             || this.searchInFolderAnyFile(sub1, patterns);
                    if (img) return isDiscSearch ? this._loadDiscResult(img) : img;

                    const sub1Folders = FileManager.getSubfolders(sub1);
                    for (const sub2 of sub1Folders) {
                        if (visited.has(sub2)) continue;
                        visited.add(sub2);
                        const sImg = this.searchInFolder(sub2, patterns, metadata, true)
                                  || this.searchInFolderAnyFile(sub2, patterns);
                        if (sImg) return isDiscSearch ? this._loadDiscResult(sImg) : sImg;

                        const sub2Folders = FileManager.getSubfolders(sub2);
                        for (const sub3 of sub2Folders) {
                            if (visited.has(sub3)) continue;
                            visited.add(sub3);
                            const s3Img = this.searchInFolder(sub3, patterns, metadata, true)
                                         || this.searchInFolderAnyFile(sub3, patterns);
                            if (s3Img) return isDiscSearch ? this._loadDiscResult(s3Img) : s3Img;
                        }
                    }
                    continue;
                }
                const level2 = FileManager.getSubfolders(sub1);
                for (const sub2 of level2) {
                    if (visited.has(sub2)) continue;
                    visited.add(sub2);
                    const sub2Name = _.last(sub2.split('\\')).toLowerCase();
                    const match2   = folderMatchNames.some(n =>
                        sub2Name === n || sub2Name.includes(n) || n.includes(sub2Name) ||
                        sub2Name.replace(/\s+/g, '-') === n ||
                        sub2Name.replace(/\s+/g, '_') === n
                    );
                    if (match2) {
                        const img = this.searchInFolder(sub2, patterns, metadata, true)
                                 || this.searchInFolderAnyFile(sub2, patterns);
                        if (img) return isDiscSearch ? this._loadDiscResult(img) : img;

                        const sub2Folders = FileManager.getSubfolders(sub2);
                        for (const sub3 of sub2Folders) {
                            if (visited.has(sub3)) continue;
                            visited.add(sub3);
                            const sImg = this.searchInFolder(sub3, patterns, metadata, true)
                                      || this.searchInFolderAnyFile(sub3, patterns);
                            if (sImg) return isDiscSearch ? this._loadDiscResult(sImg) : sImg;
                        }
                    }
                }
            }
        }
        return null;
    },

    _loadDiscResult(imagePath) {
        let raw = null;
        try { raw = gdi.Image(imagePath); }
        catch (e) {
            console.log('DiscSpin: _loadDiscResult gdi.Image failed for "' + imagePath + '":', e);
            return null;
        }
        if (!raw) return null;

        let original = null;
        try { original = raw.Clone(0, 0, raw.Width, raw.Height); _tagImg(original); }
        catch (e) { Utils.safeDispose(raw); return null; }

        const targetSize = Utils.getPanelDiscSize();
        const processed  = ImageProcessor.processForDisc(
            raw, targetSize, CONFIG.IMAGE_TYPE.REAL_DISC, P.interpolationMode
        );
        if (processed) {
            AssetManager.autoSelectMask(imagePath);
            return { img: processed, path: imagePath, type: CONFIG.IMAGE_TYPE.REAL_DISC, original };
        }
        Utils.safeDispose(original);
        return null;
    },

    searchFolderForImage(folder, patterns, isDiscSearch, metadata) {
        const jsonArt = FileManager.searchLastFmJson(folder);
        if (jsonArt) return isDiscSearch ? this._loadDiscResult(jsonArt) : jsonArt;

        const meta  = metadata || { artist: '', album: '', title: '', folder: '', artistTitle: '', artistAlbum: '' };
        const found = this.searchInFolder(folder, patterns, meta, true)
                   || this.searchInFolderAnyFile(folder, patterns);
        if (!found) return null;
        return isDiscSearch ? this._loadDiscResult(found) : found;
    },

    searchForDisc(metadb, baseFolder) {
        const cacheKey = 'disc:' + baseFolder;
        if (this._pathCache.has(cacheKey)) {
            const cached = this._pathCache.get(cacheKey);
            const age    = Date.now() - (cached.at || 0);
            if (!cached.path) {
                if (age < this.PATH_MISS_TTL) return null;
                this._pathCache.delete(cacheKey);
            } else if (age < this.PATH_HIT_TTL) {
                const result = this._loadDiscResult(cached.path);
                if (!result) this._pathCache.delete(cacheKey);
                return result;
            } else {
                if (!FileManager.exists(cached.path)) {
                    this._pathCache.delete(cacheKey);
                } else {
                    const result = this._loadDiscResult(cached.path);
                    if (result) {
                        cached.at = Date.now();
                        return result;
                    }
                    this._pathCache.delete(cacheKey);
                }
            }
        }

        const metadata = metadb
            ? this.getMetadataNames(metadb)
            : { artist: '', album: '', title: '', folder: '', artistTitle: '', artistAlbum: '' };

        const trackMatch = this.searchInFolder(baseFolder, CONFIG.DISC_PATTERNS, metadata);
        if (trackMatch) {
            const result = this._loadDiscResult(trackMatch);
            if (result) {
                AssetManager.autoSelectMask(trackMatch);
                this._pathCache.set(cacheKey, { path: trackMatch, type: CONFIG.IMAGE_TYPE.REAL_DISC, at: Date.now() });
                return result;
            }
        }

        const trackAnyMatch = this.searchInFolderAnyFile(baseFolder, CONFIG.DISC_PATTERNS);
        if (trackAnyMatch) {
            const result = this._loadDiscResult(trackAnyMatch);
            if (result) {
                AssetManager.autoSelectMask(trackAnyMatch);
                this._pathCache.set(cacheKey, { path: trackAnyMatch, type: CONFIG.IMAGE_TYPE.REAL_DISC, at: Date.now() });
                return result;
            }
        }

        const trackSubMatch = this._searchFolderTree(baseFolder, CONFIG.DISC_PATTERNS, CONFIG.MAX_SUBFOLDER_DEPTH, true, metadata);
        if (trackSubMatch) {
            this._pathCache.set(cacheKey, { path: trackSubMatch.path, type: trackSubMatch.type, at: Date.now() });
            return trackSubMatch;
        }

        const customResult = this.searchCustomFolders(metadata, CONFIG.DISC_PATTERNS, true);
        if (customResult) {
            this._pathCache.set(cacheKey, { path: customResult.path, type: customResult.type, at: Date.now() });
            return customResult;
        }

        this._pathCache.set(cacheKey, { path: null, at: Date.now() });
        return null;
    },

    searchForCover(metadb, baseFolder) {
        const cacheKey = 'cover:' + baseFolder;
        if (this._pathCache.has(cacheKey)) {
            const cached = this._pathCache.get(cacheKey);
            const age    = Date.now() - (cached.at || 0);
            if (!cached.path) {
                if (age < this.PATH_MISS_TTL) return null;
                this._pathCache.delete(cacheKey);
            } else if (age < this.PATH_HIT_TTL) {
                if (!FileManager.exists(cached.path)) {
                    this._pathCache.delete(cacheKey);
                } else {
                    return cached.path;
                }
            } else {
                if (!FileManager.exists(cached.path)) {
                    this._pathCache.delete(cacheKey);
                } else {
                    cached.at = Date.now();
                    return cached.path;
                }
            }
        }

        const metadata = metadb
            ? this.getMetadataNames(metadb)
            : { artist: '', album: '', title: '', folder: '', artistTitle: '', artistAlbum: '' };

        const jsonArt = FileManager.searchLastFmJson(baseFolder);
        if (jsonArt)        { this._pathCache.set(cacheKey, { path: jsonArt,        at: Date.now() }); return jsonArt; }

        const trackMatch = this.searchInFolder(baseFolder, CONFIG.COVER_PATTERNS, metadata);
        if (trackMatch)     { this._pathCache.set(cacheKey, { path: trackMatch,     at: Date.now() }); return trackMatch; }

        const trackAnyMatch = this.searchInFolderAnyFile(baseFolder, CONFIG.COVER_PATTERNS);
        if (trackAnyMatch)  { this._pathCache.set(cacheKey, { path: trackAnyMatch,  at: Date.now() }); return trackAnyMatch; }

        const trackSubMatch = this._searchFolderTree(baseFolder, CONFIG.COVER_PATTERNS, CONFIG.MAX_SUBFOLDER_DEPTH, false, metadata);
        if (trackSubMatch)  { this._pathCache.set(cacheKey, { path: trackSubMatch,  at: Date.now() }); return trackSubMatch; }

        const customResult = this.searchCustomFolders(metadata, CONFIG.COVER_PATTERNS, false);
        if (customResult)   { this._pathCache.set(cacheKey, { path: customResult,   at: Date.now() }); return customResult; }

        this._pathCache.set(cacheKey, { path: null, at: Date.now() });
        return null;
    },

    loadForMetadb(metadb, immediate = false) {
        if (!metadb) return;
        const folderPath = this.tf_path.EvalWithMetadb(metadb);

        if (!immediate && State.currentMetadb && State.img) {
            if (this.tf_path.EvalWithMetadb(State.currentMetadb) === folderPath) {
                State.currentMetadb = metadb;
                return;
            }
        }

        if (State.loadTimer) {
            window.ClearTimeout(State.loadTimer);
            State.loadTimer = null;
        }

        const doLoad = () => {
            State.currentMetadb = metadb;
            const myToken = ++State.loadToken;

            const coverPath = this.searchForCover(metadb, folderPath);

            State.phaseBTimer = window.SetTimeout(() => {
                State.phaseBTimer = null;
                if (State.loadToken !== myToken) return;

                let bgOriginal = null;
                let coverRaw   = null;
                if (coverPath) {
                    try {
                        const rawCover = gdi.Image(coverPath);
                        if (rawCover) {
                            bgOriginal = rawCover.Clone(0, 0, rawCover.Width, rawCover.Height);
                            _tagImg(bgOriginal);
                            coverRaw = rawCover;
                        }
                    } catch (e) {}
                }

                if (State.loadToken !== myToken) {
                    Utils.safeDispose(coverRaw);
                    Utils.safeDispose(bgOriginal);
                    return;
                }

                if (!P.useAlbumArtOnly) {
                    const result = this.searchForDisc(metadb, folderPath);
                    if (result) {
                        Utils.safeDispose(coverRaw);
                        const bgSrc = bgOriginal || result.original;
                        if (bgOriginal) Utils.safeDispose(result.original);
                        State.setImage(result.img, true, result.type, bgSrc);
                        props.savedPath.value     = result.path;
                        props.savedIsDisc.enabled = true;
                        State.updateTimer();
                        if (!bgSrc) {
                            State.pendingArtToken = myToken;
                            utils.GetAlbumArtAsync(window.ID, metadb, 0);
                        }
                        return;
                    }
                }

                if (coverRaw) {
                    try {
                        const targetSize = Utils.getPanelDiscSize();
                        if (P.useAlbumArtOnly) {
                            const scaled = ImageProcessor.scaleProportional(
                                coverRaw, CONFIG.MAX_STATIC_SIZE, P.interpolationMode
                            );
                            if (scaled) {
                                State.setImage(scaled, false, CONFIG.IMAGE_TYPE.ALBUM_ART, bgOriginal);
                                props.savedPath.value     = coverPath;
                                props.savedIsDisc.enabled = false;
                                State.updateTimer();
                                return;
                            }
                            Utils.safeDispose(bgOriginal);
                        } else {
                            const processed = ImageProcessor.processForDisc(
                                coverRaw, targetSize, CONFIG.IMAGE_TYPE.ALBUM_ART, P.interpolationMode
                            );
                            if (processed) {
                                State.setImage(processed, true, CONFIG.IMAGE_TYPE.ALBUM_ART, bgOriginal);
                                props.savedPath.value     = coverPath;
                                props.savedIsDisc.enabled = true;
                                State.updateTimer();
                                return;
                            }
                            Utils.safeDispose(bgOriginal);
                        }
                    } catch (e) {
                        Utils.safeDispose(coverRaw);
                        Utils.safeDispose(bgOriginal);
                    }
                }

                State.pendingArtToken = myToken;
                utils.GetAlbumArtAsync(window.ID, metadb, 0);
            }, 0);
        };

        if (immediate) doLoad();
        else State.loadTimer = window.SetTimeout(doLoad, CONFIG.LOAD_DEBOUNCE_MS);
    },

    handleAlbumArt(metadb, image, image_path) {
        if (State.pendingArtToken !== State.loadToken) {
            Utils.safeDispose(image);
            return;
        }
        if (!State.currentMetadb) {
            Utils.safeDispose(image);
            return;
        }

        if (!metadb) {
            if (image) Utils.safeDispose(image);
            this.loadDefaultDisc();
            State.updateTimer();
            return;
        }

        const metadbMatches = metadb.Compare(State.currentMetadb);

        if (image) {
            let original = null;
            try {
                if (!metadbMatches) { Utils.safeDispose(image); return; }

                original = image.Clone(0, 0, image.Width, image.Height);
                _tagImg(original);
                const targetSize = Utils.getPanelDiscSize();

                if (P.useAlbumArtOnly) {
                    const scaled = ImageProcessor.scaleProportional(
                        image, CONFIG.MAX_STATIC_SIZE, P.interpolationMode
                    );
                    if (scaled) {
                        State.setImage(scaled, false, CONFIG.IMAGE_TYPE.ALBUM_ART, original);
                        if (image_path) props.savedPath.value = image_path;
                        RepaintHelper.background();
                        State.updateTimer();
                        return;
                    } else {
                        Utils.safeDispose(original);
                    }
                } else {
                    const processed = ImageProcessor.processForDisc(
                        image, targetSize, CONFIG.IMAGE_TYPE.ALBUM_ART, P.interpolationMode
                    );
                    if (processed) {
                        State.setImage(processed, true, CONFIG.IMAGE_TYPE.ALBUM_ART, original);
                        if (image_path) props.savedPath.value = image_path;
                        RepaintHelper.background();
                        State.updateTimer();
                        return;
                    } else {
                        Utils.safeDispose(original);
                    }
                }
            } catch (e) {
                Utils.safeDispose(image);
                Utils.safeDispose(original);
            }
        }

        if (metadbMatches) {
            this.loadDefaultDisc();
            State.updateTimer();
        }
    },

    loadDefaultDisc() {
        if (!FileManager.exists(CONFIG.PATHS.DEFAULT_DISC)) return;
        try {
            const raw = gdi.Image(CONFIG.PATHS.DEFAULT_DISC);
            if (!raw) return;
            const targetSize = Utils.getPanelDiscSize();
            const scaled = ImageProcessor.scaleToSquare(
				raw, targetSize, P.interpolationMode, CONFIG.IMAGE_TYPE.DEFAULT_DISC
            );
            if (scaled) {
                State.setImage(scaled, true, CONFIG.IMAGE_TYPE.DEFAULT_DISC, null);
                props.savedPath.value     = CONFIG.PATHS.DEFAULT_DISC;
                props.savedIsDisc.enabled = true;
                State.updateTimer();
            }
        } catch (e) {}
    },

    cleanup() { this._pathCache.clear(); }
};

// --------------------------------------------------------------------------------------------
// 18. ROTATION FRAME CACHE (ASYNCHRONOUS INCREMENTAL BUILD)
// --------------------------------------------------------------------------------------------

const RotationCache = {
    frames:         [],
    MAX_FRAME_SIZE: 1000,
    _sourceKey:     '',
    _buildTimer:    null,
    _pendingFrames: null,
    _pendingScaled: null,
    _pendingAngle:  0,
    _pendingKey:    '',
    BATCH_SIZE:     8,
    _builtStep:     2,

    get step() { return P.rotationStep; },

    _cancelBuild() {
        if (this._buildTimer !== null) { window.ClearTimeout(this._buildTimer); this._buildTimer = null; }
        if (this._pendingFrames) { this._pendingFrames.forEach(f => Utils.safeDispose(f)); this._pendingFrames = null; }
        Utils.safeDispose(this._pendingScaled); this._pendingScaled = null;
        this._pendingAngle = 0;
        this._pendingKey   = '';
    },

    clear() {
        this._cancelBuild();
        this.frames.forEach(f => { if (f) { try { f.Dispose(); } catch (_) {} } });
        this.frames     = [];
        this._sourceKey = '';
        this._builtStep = 2;
    },

    scheduleAsyncBuild(img) {
        if (!img) return;
        if (isStaticMode()) return;

        const composite = (DiscComposite.valid && DiscComposite.img) ? DiscComposite.img : img;
        const step      = this.step;
        const srcW      = Math.min(composite.Width,  this.MAX_FRAME_SIZE);
        const srcH      = Math.min(composite.Height, this.MAX_FRAME_SIZE);
        const key       = (composite._uid !== undefined ? composite._uid : 'img') +
                          '|' + srcW + '|' + srcH + '|' + step;

        if (this._sourceKey === key && this.frames.length > 0) return;
        if (this._pendingKey === key && this._pendingFrames !== null) return;

        this._cancelBuild();
        const totalFrames   = Math.round(360 / step);
        this._pendingFrames = new Array(totalFrames).fill(null);
        this._pendingAngle  = 0;
        this._pendingKey    = key;

        let src = composite;
        if (srcW < composite.Width || srcH < composite.Height) {
            try {
                const down = gdi.CreateImage(srcW, srcH);
                let gs = null, gsR = false;
                try {
                    gs = down.GetGraphics();
                    gs.SetInterpolationMode(P.interpolationMode);
                    gs.DrawImage(composite, 0, 0, srcW, srcH, 0, 0, composite.Width, composite.Height);
                    down.ReleaseGraphics(gs); gsR = true; gs = null;
                } finally {
                    if (!gsR && gs) { try { down.ReleaseGraphics(gs); } catch (_) {} }
                }
                this._pendingScaled = down;
                src = down;
            } catch (e) {}
        }

        const buildBatch = () => {
            this._buildTimer = null;
            if (!this._pendingFrames || this._pendingKey !== key) {
                return;
            }
            if (isStaticMode()) {
                this._cancelBuild();
                return;
            }

            const end = Math.min(this._pendingAngle + this.BATCH_SIZE * step, 360);
            for (let a = this._pendingAngle; a < end; a += step) {
                const frameIdx = Math.round(a / step);
                try {
                    const frame = gdi.CreateImage(src.Width, src.Height);
                    let g = null, rel = false;
                    try {
                        g = frame.GetGraphics();
                        g.DrawImage(src, 0, 0, src.Width, src.Height, 0, 0, src.Width, src.Height, a, 255);
                        frame.ReleaseGraphics(g); rel = true; g = null;
                    } finally {
                        if (!rel && g) { try { frame.ReleaseGraphics(g); } catch (_) {} }
                    }
                    this._pendingFrames[frameIdx] = frame;
                } catch (e) {}
            }
            this._pendingAngle = end;

            if (this._pendingAngle < 360) {
                this._buildTimer = window.SetTimeout(buildBatch, 0);
            } else {
                const oldFrames    = this.frames;
                this.frames        = this._pendingFrames;
                this._sourceKey    = key;
                this._builtStep    = step;
                this._pendingFrames = null;
                const scaledToDispose = this._pendingScaled;
                this._pendingScaled = null;
                this._pendingAngle = 0;
                this._pendingKey   = '';
                Utils.safeDispose(scaledToDispose);
                window.SetTimeout(() => {
                    if (!isLive()) return;
                    oldFrames.forEach(f => { if (f) { try { f.Dispose(); } catch (_) {} } });
                }, CONFIG.DISPOSE_DELAY_MS);
                if (isLive()) RepaintHelper.full();
            }
        };

        this._buildTimer = window.SetTimeout(buildBatch, 0);
    },

    getFrame(angle) {
        if (this.frames.length === 0) return null;
        const len   = this.frames.length;
        const raw   = Math.floor(angle / this._builtStep) % len;
        const idx   = raw < 0 ? raw + len : raw;
        const frame = this.frames[idx];
        return frame || null;
    }
};

// --------------------------------------------------------------------------------------------
// 19. DISC COMPOSITE (MASK + RIM COMBINER)
// --------------------------------------------------------------------------------------------

const DiscComposite = {
    img:       null,
    valid:     false,
    _cacheKey: '',

    dispose() {
        if (this.img) {
            try { this.img.Dispose(); } catch (e) {}
            this.img = null;
        }
        this.valid = false;
        RepaintHelper._allValid = false;
        RotationCache.clear();
    },

    build(discImg, size, imageType) {
        const uid = (discImg && discImg._uid !== undefined) ? discImg._uid : (discImg ? 'img' : 'null');
        const key = `${uid}|${size}|${imageType}|${AssetManager.currentMaskType}`;
        if (this.valid && this._cacheKey === key && this.img && this.img.Width === size) return;
        this._cacheKey = key;
        this.dispose();

        if (!discImg || size <= 0) { this.valid = true; return; }

        if (!AssetManager.shouldShowRim(imageType)) {
            try {
                this.img   = discImg.Clone(0, 0, discImg.Width, discImg.Height);
                this.valid = true;
            } catch (e) {
                this.img   = null;
                this.valid = true;
            }
            return;
        }

        let g = null, released = false;
        try {
            this.img = gdi.CreateImage(size, size);
            g = this.img.GetGraphics();
            g.DrawImage(discImg, 0, 0, size, size, 0, 0, discImg.Width, discImg.Height);
            const rim = AssetManager.getRim(size);
            if (rim) g.DrawImage(rim, 0, 0, size, size, 0, 0, rim.Width, rim.Height);
            this.img.ReleaseGraphics(g);
            released = true;
            g = null;
            this.valid = true;
        } catch (e) {
            if (!released && g) {
                try { if (this.img) this.img.ReleaseGraphics(g); } catch (_) {}
            }
            if (this.img) { try { this.img.Dispose(); } catch (_) {} this.img = null; }
            this.valid = true;
        }
    }
};

// --------------------------------------------------------------------------------------------
// 20. BACKGROUND BLUR CACHE
// --------------------------------------------------------------------------------------------

const BackgroundCache = {
    _lru:       null,
    _activeKey: '',
    img:        null,

    _makeKey(w, h) {
        const bgId = (State.bgImg && State.bgImg._bgId !== undefined)
            ? State.bgImg._bgId : 'none';
        return `${bgId}|${P.blurRadius}|${P.blurEnabled ? 1 : 0}|${w}|${h}`;
    },

    invalidate() {
        this._activeKey = '';
        this.img = null;
        RepaintHelper._allValid = false;
    },

    ensure(w, h) {
        if (w <= 0 || h <= 0) return;
        const wantBlur = !P.bgUseUIColor && P.backgroundEnabled && P.blurEnabled &&
                         P.blurRadius > 0 && State.bgImg;
        if (!wantBlur) {
            if (this._activeKey !== 'none') { this._activeKey = 'none'; this.img = null; }
            return;
        }

        const key = this._makeKey(w, h);
        if (this._activeKey === key) return;

        const cached = this._lru.get(key);
        if (cached) { this._activeKey = key; this.img = cached; return; }

        let g = null, newImg = null, released = false;
        try {
            const src = State.bgImg;
            newImg = gdi.CreateImage(w, h);
            g = newImg.GetGraphics();
            g.DrawImage(src, 0, 0, w, h, 0, 0, src.Width, src.Height);
            newImg.ReleaseGraphics(g);
            released = true;
            g = null;
            newImg.StackBlur(P.blurRadius);
            this._lru.set(key, newImg);
            this._activeKey = key;
            this.img        = newImg;
            newImg = null;
        } catch (e) {
            this._activeKey = '';
            this.img = null;
        } finally {
            if (!released && g && newImg) { try { newImg.ReleaseGraphics(g); } catch (_) {} }
            if (newImg) Utils.safeDispose(newImg);
        }
    },

    dispose() { this._lru.clear(); this.img = null; this._activeKey = ''; }
};

BackgroundCache._lru = (() => {
    const maxSize = CONFIG.MAX_BG_CACHE;
    const cache   = new Map();
    return {
        get(key) {
            const value = cache.get(key);
            if (value === undefined) return null;
            cache.delete(key); cache.set(key, value);
            return value;
        },
        set(key, value) {
            if (cache.has(key)) {
                const existing = cache.get(key);
                if (existing !== value) Utils.safeDispose(existing);
                cache.delete(key);
            } else if (cache.size >= maxSize) {
                const firstKey = cache.keys().next().value;
                const firstVal = cache.get(firstKey);
                if (BackgroundCache.img === firstVal) {
                    BackgroundCache.img = null;
                    BackgroundCache._activeKey = '';
                    RepaintHelper._allValid = false;
                }
                if (firstVal !== value) Utils.safeDispose(firstVal);
                cache.delete(firstKey);
            }
            cache.set(key, value);
        },
        has(key)  { return cache.has(key); },
        clear()   { cache.forEach(v => Utils.safeDispose(v)); cache.clear(); }
    };
})();

// --------------------------------------------------------------------------------------------
// 21. OVERLAY DRAWING & LAYER CACHES
// --------------------------------------------------------------------------------------------

const OverlayInvalidator = (() => {
    let pending = false;
    let _timer  = null;
    return {
        request() {
            if (pending) return;
            pending = true;
            _timer = window.SetTimeout(() => {
                _timer  = null;
                pending = false;
                OverlayCache.invalidate();
                StaticTopLayer.invalidate();
                RepaintHelper.full();
            }, 16);
        },
        cancel() {
            if (_timer !== null) {
                window.ClearTimeout(_timer);
                _timer  = null;
                pending = false;
            }
        }
    };
})();

function invalidateAllCaches() {
    BackgroundCache.invalidate();
    StaticBgLayer.invalidate();
    StaticTopLayer.invalidate();
    OverlayInvalidator.request();
    DiscComposite.dispose();
}

function invalidateBgCaches() {
    BackgroundCache.invalidate();
    StaticBgLayer.invalidate();
}

function invalidateTopCaches() {
    StaticTopLayer.invalidate();
    OverlayInvalidator.request();
}

function drawScanlines(g, w, h) {
    const s   = CONFIG.OVERLAY.SCANLINE_SPACING;
    const col = MathX.setAlpha(DS_BLACK, P.opScanlines);
    for (let y = 0; y < h; y += s) {
        g.FillSolidRect(0, y, w, 1, col);
    }
}

function drawGlow(g, w, h, pc) {
    const discSz = State.isDiscImage ? pc.discSize : Math.max(pc.staticW, pc.staticH);
    if (discSz <= 0) return;
    const op = P.opGlow;
    if (op <= 0) return; 
    const cx = State.isDiscImage ? pc.discX + pc.discSize / 2 : pc.staticX + pc.staticW / 2;
    const cy = State.isDiscImage ? pc.discY + pc.discSize / 2 : pc.staticY + pc.staticH / 2;
    const maxR  = discSz * 0.75;
    const steps = CONFIG.OVERLAY.GLOW_ART_STEPS;
    const mult  = 0.03; 
    const minStep = Math.min(steps, Math.ceil(steps / (op * mult)));

    for (let i = minStep; i < steps; i++) {
        const progress = i / steps;
        const alpha    = Math.floor(op * progress * mult);
        if (alpha <= 0) continue;
        const r = maxR * (1 - progress);
        g.FillEllipse(cx - r, cy - r, r * 2, r * 2, MathX.setAlpha(DS_WHITE, alpha));
    }
}

function drawReflection(g, w, h) {
    const reflH = Math.floor(h * CONFIG.OVERLAY.REFLECTION_HEIGHT_RATIO);
    const white = DS_WHITE;

    for (let y = 0; y < reflH; y++) {
        const t     = 1 - (y / reflH);
        const s     = t * t * (3 - 2 * t);
        const alpha = Math.floor(P.opReflection * s * 0.40);
        
        if (alpha > 0) {
            g.FillSolidRect(0, y, w, 1, MathX.setAlpha(white, alpha));
        }
    }
}

function drawPhosphor(g, w, h) {
    const themeColor = PhosphorManager.getColor();
    const blended = MathX.blendWithWhite(themeColor, 0.25);
    const bgAlpha = Math.floor(P.opPhosphor * 0.3);
    if (bgAlpha > 0) {
        g.FillSolidRect(0, 0, w, h, MathX.setAlpha(blended, bgAlpha));
    }
}

const OverlayCache = {
    img:   null,
    valid: false,

    invalidate() { this.valid = false; RepaintHelper._allValid = false; },

    dispose() {
        if (this.img) { try { this.img.Dispose(); } catch (e) {} this.img = null; }
        this.valid = false;
    },

    build(w, h, pc) {
        this.dispose();
        const needsAny = !P.overlayAllOff && (
            (P.showGlow       && P.opGlow > 0)       ||
            (P.showScanlines  && P.opScanlines > 0)  ||
            (P.showReflection && P.opReflection > 0) ||
            (P.showPhosphor   && P.opPhosphor > 0)
        );
        this.valid = true;
        if (!needsAny || w <= 0 || h <= 0) return;

        let g = null, newImg = null, released = false;
        try {
            newImg = gdi.CreateImage(w, h);
            g = newImg.GetGraphics();
            if (P.showScanlines  && P.opScanlines > 0)  drawScanlines(g, w, h);
            if (P.showGlow       && P.opGlow > 0 && pc) drawGlow(g, w, h, pc);
            if (P.showReflection && P.opReflection > 0) drawReflection(g, w, h);
            if (P.showPhosphor   && P.opPhosphor > 0)   drawPhosphor(g, w, h);
            newImg.ReleaseGraphics(g); released = true; g = null;
            this.img = newImg; newImg = null;
        } catch (e) {
        } finally {
            if (!released && g && newImg) { try { newImg.ReleaseGraphics(g); } catch (_) {} }
            if (newImg) Utils.safeDispose(newImg);
        }
    }
};

const StaticBgLayer = {
    img: null, valid: false, _w: 0, _h: 0,

    invalidate() { this.valid = false; RepaintHelper._allValid = false; },
    dispose()    { Utils.safeDispose(this.img); this.img = null; this.valid = false; RepaintHelper._allValid = false; },

    build(w, h) {
        this.dispose();
        let g = null, newImg = null, released = false;
        try {
            newImg = gdi.CreateImage(w, h);
            g = newImg.GetGraphics();

            if (P.bgUseUIColor) {
                g.FillSolidRect(0, 0, w, h, State.paintCache.bgColor);
            } else {
                g.FillSolidRect(0, 0, w, h, P.customBackgroundColor >>> 0);
                const hasBgImage = P.backgroundEnabled && State.bgImg &&
                                   State.bgImg.Width > 0 && State.bgImg.Height > 0;
                if (hasBgImage) {
                    if (P.blurEnabled) {
                        BackgroundCache.ensure(w, h);
                        if (BackgroundCache.img) {
                            const bi = BackgroundCache.img;
                            g.DrawImage(bi, 0, 0, w, h, 0, 0, bi.Width, bi.Height);
                        } else {
                            g.DrawImage(State.bgImg, 0, 0, w, h, 0, 0, State.bgImg.Width, State.bgImg.Height);
                        }
                    } else {
                        g.DrawImage(State.bgImg, 0, 0, w, h, 0, 0, State.bgImg.Width, State.bgImg.Height);
                    }
                }
                if (P.darkenValue > 0) {
                    g.FillSolidRect(0, 0, w, h, MathX.setAlpha(DS_BLACK, Math.floor(P.darkenValue * 2.55)));
                }
            }

            newImg.ReleaseGraphics(g); released = true; g = null;
            this.img = newImg; newImg = null;
            this._w = w; this._h = h; this.valid = true;
        } catch (e) {
            this._w = w; this._h = h; this.valid = true;
        } finally {
            if (!released && g && newImg) { try { newImg.ReleaseGraphics(g); } catch (_) {} }
            if (newImg) Utils.safeDispose(newImg);
        }
    }
};

const StaticTopLayer = {
    img: null, valid: false, _w: 0, _h: 0,

    invalidate() { this.valid = false; RepaintHelper._allValid = false; },
    dispose()    { Utils.safeDispose(this.img); this.img = null; this.valid = false; RepaintHelper._allValid = false; },

    build(w, h) {
        this.dispose();
        const hasBorder  = P.borderSize > 0;
        const hasOverlay = OverlayCache.img !== null;
        if (!hasBorder && !hasOverlay) { this._w = w; this._h = h; this.valid = true; return; }

        let g = null, newImg = null, released = false;
        try {
            newImg = gdi.CreateImage(w, h);
            g = newImg.GetGraphics();

            if (hasBorder) {
                const bs    = P.borderSize;
                const color = P.borderColor >>> 0;
                g.FillSolidRect(0, 0,      w,  bs,             color);
                g.FillSolidRect(0, h - bs, w,  bs,             color);
                g.FillSolidRect(0, bs,     bs, h - bs * 2,     color);
                g.FillSolidRect(w - bs, bs, bs, h - bs * 2,    color);
            }
            if (hasOverlay) {
                const oi = OverlayCache.img;
                g.DrawImage(oi, 0, 0, w, h, 0, 0, oi.Width, oi.Height);
            }

            newImg.ReleaseGraphics(g); released = true; g = null;
            this.img = newImg; newImg = null;
            this._w = w; this._h = h; this.valid = true;
        } catch (e) {
            this._w = w; this._h = h; this.valid = true;
        } finally {
            if (!released && g && newImg) { try { newImg.ReleaseGraphics(g); } catch (_) {} }
            if (newImg) Utils.safeDispose(newImg);
        }
    }
};

// --------------------------------------------------------------------------------------------
// 22. RENDERER (DISC & STATIC COVER DRAWING)
// --------------------------------------------------------------------------------------------

const Renderer = {
    paint(gr) {
        const pc = State.paintCache;
        if (!State.img) return;
        gr.SetInterpolationMode(P.interpolationMode);
        if (!State.isDiscImage) this.paintStatic(gr, pc);
        else                    this.paintDisc(gr, pc);
    },

    paintStatic(gr, pc) {
        if (!State.img) return;
        gr.DrawImage(State.img, pc.staticX, pc.staticY, pc.staticW, pc.staticH,
            0, 0, State.img.Width, State.img.Height);
    },

    paintDisc(gr, pc) {
        gr.SetSmoothingMode(CONFIG.SMOOTHING_MODE);
        const size = pc.discSize;
        const x    = pc.discX;
        const y    = pc.discY;

        const composite = DiscComposite.valid && DiscComposite.img ? DiscComposite.img : State.img;
        if (composite) {
            const frame = RotationCache.getFrame(State.angle);
            if (frame) {
                gr.DrawImage(frame, x, y, size, size, 0, 0, frame.Width, frame.Height);
            } else {
                gr.DrawImage(composite, x, y, size, size, 0, 0,
                    composite.Width, composite.Height, State.angle, 255);
            }
        }
    }
};

// --------------------------------------------------------------------------------------------
// 23. PHOSPHOR & PRESET MANAGERS
// --------------------------------------------------------------------------------------------

const PhosphorManager = {
    _cachedColor: null,
    _cachedTheme: -1,

    getColor() {
        if (this._cachedTheme === P.phosphorTheme && this._cachedColor !== null) return this._cachedColor;
        let color;
        if (P.phosphorTheme === DISC_CUSTOM_THEME_INDEX) {
            color = P.customPhosphorColor >>> 0;
        } else {
            const idx = _.clamp(P.phosphorTheme, 0, CONFIG.PHOSPHOR_THEMES.length - 1);
            color = CONFIG.PHOSPHOR_THEMES[idx].color;
        }
        this._cachedTheme = P.phosphorTheme;
        this._cachedColor = color;
        return color;
    },

    invalidateCache() { this._cachedColor = null; this._cachedTheme = -1; },

    setCustomColor() {
        try {
            const picked = utils.ColourPicker(window.ID, props.customPhosphorColor.value);
            if (picked !== -1) {
                props.customPhosphorColor.value = picked;
                props.phosphorTheme.value       = DISC_CUSTOM_THEME_INDEX;
                this.invalidateCache();
                OverlayInvalidator.request();
                RepaintHelper.full();
            }
        } catch (e) {}
    }
};

const PresetManager = {
    _capture() {
        return {
            spinningEnabled:       props.spinningEnabled.enabled,
            spinSpeed:             props.spinSpeed.value,
            useAlbumArtOnly:       props.useAlbumArtOnly.enabled,
            keepAspectRatio:       props.keepAspectRatio.enabled,
            interpolationMode:     props.interpolationMode.value,
            maxImageSize:          props.maxImageSize.value,
            maskType:              AssetManager.currentMaskType,
            userOverrideMask:      AssetManager.userOverrideMask,
            overlayAllOff:         props.overlayAllOff.enabled,
            savedOverlay:          props.savedOverlay.value,
            showReflection:        props.showReflection.enabled,
            opReflection:          props.opReflection.value,
            showGlow:              props.showGlow.enabled,
            opGlow:                props.opGlow.value,
            showScanlines:         props.showScanlines.enabled,
            opScanlines:           props.opScanlines.value,
            showPhosphor:          props.showPhosphor.enabled,
            opPhosphor:            props.opPhosphor.value,
            phosphorTheme:         props.phosphorTheme.value,
            customPhosphorColor:   props.customPhosphorColor.value,
            borderSize:            props.borderSize.value,
            borderColor:           props.borderColor.value,
            padding:               props.padding.value,
            backgroundEnabled:     props.backgroundEnabled.enabled,
            bgUseUIColor:          props.bgUseUIColor.enabled,
            blurRadius:            props.blurRadius.value,
            blurEnabled:           props.blurEnabled.enabled,
            darkenValue:           props.darkenValue.value,
            customBackgroundColor: props.customBackgroundColor.value,
            rotationStep:          props.rotationStep.value
        };
    },

    save(slot) {
        if (!_.inRange(slot, 1, 4)) return;
        try { window.SetProperty('Disc.Preset' + slot, JSON.stringify(this._capture())); } catch (e) {}
    },

    load(slot) {
        if (!_.inRange(slot, 1, 4)) return;
        try {
            const str = window.GetProperty('Disc.Preset' + slot, null);
            if (!str) return;
            const d = JSON.parse(str);

            if (_.isBoolean(d.spinningEnabled))   props.spinningEnabled.enabled   = d.spinningEnabled;
            if (_.isNumber(d.spinSpeed))           props.spinSpeed.value           = _.clamp(d.spinSpeed, CONFIG.MIN_SPIN_SPEED, CONFIG.MAX_SPIN_SPEED);
            if (_.isBoolean(d.useAlbumArtOnly))    props.useAlbumArtOnly.enabled   = d.useAlbumArtOnly;
            if (_.isBoolean(d.keepAspectRatio))    props.keepAspectRatio.enabled   = d.keepAspectRatio;
            if (_.isNumber(d.interpolationMode))   props.interpolationMode.value   = d.interpolationMode;
            if (_.isNumber(d.maxImageSize))        props.maxImageSize.value        = _.clamp(d.maxImageSize, CONFIG.MIN_DISC_SIZE, CONFIG.MAX_DISC_SIZE);

            if (_.isNumber(d.maskType)) {
                const maskIdx    = _.clamp(d.maskType, 0, 2);
                const isOverride = _.isBoolean(d.userOverrideMask) ? d.userOverrideMask : true;
                if (maskIdx !== AssetManager.currentMaskType) {
                    AssetManager.setMaskType(maskIdx, isOverride);
                } else {
                    AssetManager.userOverrideMask      = isOverride;
                    props.userOverrideMask.enabled     = isOverride;
                }
            }

            if (_.isBoolean(d.overlayAllOff))      props.overlayAllOff.enabled    = d.overlayAllOff;
            if (_.isString(d.savedOverlay))        props.savedOverlay.value       = d.savedOverlay;
            if (_.isBoolean(d.showReflection))     props.showReflection.enabled   = d.showReflection;
            if (_.isNumber(d.opReflection))        props.opReflection.value       = _.clamp(d.opReflection, 0, 255);
            if (_.isBoolean(d.showGlow))           props.showGlow.enabled         = d.showGlow;
            if (_.isNumber(d.opGlow))              props.opGlow.value             = _.clamp(d.opGlow, 0, 255);
            if (_.isBoolean(d.showScanlines))      props.showScanlines.enabled    = d.showScanlines;
            if (_.isNumber(d.opScanlines))         props.opScanlines.value        = _.clamp(d.opScanlines, 0, 255);
            if (_.isBoolean(d.showPhosphor))       props.showPhosphor.enabled     = d.showPhosphor;
            if (_.isNumber(d.opPhosphor))          props.opPhosphor.value         = _.clamp(d.opPhosphor, 0, 255);
            if (_.isNumber(d.phosphorTheme))       props.phosphorTheme.value      = _.clamp(d.phosphorTheme, 0, DISC_CUSTOM_THEME_INDEX);
            if (_.isNumber(d.customPhosphorColor)) props.customPhosphorColor.value = d.customPhosphorColor >>> 0;
            PhosphorManager.invalidateCache();

            if (_.isNumber(d.borderSize))  props.borderSize.value  = _.clamp(d.borderSize, 0, 50);
            if (_.isNumber(d.borderColor)) props.borderColor.value  = d.borderColor >>> 0;
            if (_.isNumber(d.padding))     props.padding.value      = _.clamp(d.padding, 0, 100);

            if (_.isBoolean(d.backgroundEnabled))    props.backgroundEnabled.enabled    = d.backgroundEnabled;
            if (_.isBoolean(d.bgUseUIColor))          props.bgUseUIColor.enabled          = d.bgUseUIColor;
            if (_.isNumber(d.blurRadius))             props.blurRadius.value              = _.clamp(d.blurRadius, 0, 254);
            if (_.isBoolean(d.blurEnabled))           props.blurEnabled.enabled           = d.blurEnabled;
            if (_.isNumber(d.darkenValue))            props.darkenValue.value             = _.clamp(d.darkenValue, 0, 50);
            if (_.isNumber(d.customBackgroundColor))  props.customBackgroundColor.value   = d.customBackgroundColor >>> 0;
            if (_.isNumber(d.rotationStep) && [2, 3, 4].includes(d.rotationStep)) {
                props.rotationStep.value = d.rotationStep;
            }

            ImageLoader.clearCache();
            AssetManager.maskCache.clear();
            AssetManager.rimCache.clear();
            invalidateAllCaches();
            State.paintCache.valid = false;
            State.stopTimer();
            State.updateTimer();
            if (State.currentMetadb) ImageLoader.loadForMetadb(State.currentMetadb, true);
            RepaintHelper.full();
        } catch (e) {}
    }
};

// --------------------------------------------------------------------------------------------
// 24. SLIDER HUD & RENDERING
// --------------------------------------------------------------------------------------------

const Slider = {
    active: false,
    target: null,
    timers: { overlayRebuild: null },

    activate(target)  { this.active = true;  this.target = target; RepaintHelper.full(); },
    deactivate()      { this.active = false; this.target = null;   RepaintHelper.full(); },

    cleanup() {
        if (this.timers.overlayRebuild) window.ClearTimeout(this.timers.overlayRebuild);
        this.timers.overlayRebuild = null;
    }
};

const SliderRenderer = {
    _font: null,

    getFont() {
        if (!this._font) this._font = gdi.Font('Segoe UI', 16, 0);
        return this._font;
    },

    drawBar(gr, value, max, barY) {
        const w     = window.Width;
        const barW  = Math.max(SLIDER_MIN_WIDTH, Math.floor(w * SLIDER_WIDTH_RATIO));
        const barH  = SLIDER_HEIGHT;
        const bx    = Math.floor((w - barW) / 2);

        gr.FillSolidRect(bx, barY, barW, barH, MathX.setAlpha(DS_WHITE, 55));
        const fillW = Math.floor(barW * (value / max));
        if (fillW > 0) gr.FillSolidRect(bx, barY, fillW, barH, MathX.setAlpha(DS_WHITE, 185));

        const font  = this.getFont();
        const label = value.toString();
        const sz    = gr.MeasureString(label, font, 0, 0, w, 64);
        const labelY = Math.max(0, barY - Math.ceil(sz.Height) - 2);
        gr.DrawString(label, font, DS_WHITE,
            Math.floor((w - sz.Width) / 2),
            labelY,
            Math.ceil(sz.Width), Math.ceil(sz.Height));
    },

    drawTitle(gr, text, barY) {
        const w     = window.Width;
        const font  = this.getFont();
        const sz    = gr.MeasureString(text, font, 0, 0, w, 64);
        const valSz = gr.MeasureString('255', font, 0, 0, w, 64);
        const titleY = Math.max(0, barY - Math.ceil(valSz.Height) - 4 - Math.ceil(sz.Height) - 4);
        gr.DrawString(text, font, MathX.setAlpha(DS_WHITE, 180),
            Math.floor((w - sz.Width) / 2), titleY,
            Math.ceil(sz.Width), Math.ceil(sz.Height));
    },

    draw(gr) {
        if (!Slider.active || !Slider.target) return;
        const propMap = {
            "Reflection": props.opReflection,
            "Glow":       props.opGlow,
            "Scanlines":  props.opScanlines,
            "Phosphor":   props.opPhosphor
        };
        const prop = propMap[Slider.target];
        if (!prop) return;
        const barY = Math.max(0, window.Height - 22);
        this.drawTitle(gr, Slider.target + ' Opacity', barY);
        this.drawBar(gr, prop.value, 255, barY);
    }
};

// --------------------------------------------------------------------------------------------
// 25. CONTEXT MENU & SELECTION HANDLERS
// --------------------------------------------------------------------------------------------

const MenuManager = {
    show(x, y) {
        const menu = window.CreatePopupMenu();

        menu.AppendMenuItem(0, 1, "Album Art Only (Static)");
        menu.CheckMenuItem(1, props.useAlbumArtOnly.enabled);
        menu.AppendMenuItem(0, 2, "Spinning Enabled");
        menu.CheckMenuItem(2, props.spinningEnabled.enabled);
        menu.AppendMenuItem(0, 3, "Keep Aspect Ratio");
        menu.CheckMenuItem(3, props.keepAspectRatio.enabled);

        this.addImageSettingsMenu(menu);
        menu.AppendMenuSeparator();
        this.addOverlayMenu(menu);
        this.addBorderPaddingMenu(menu);
        this.addBackgroundMenu(menu);
        menu.AppendMenuSeparator();
        menu.AppendMenuItem(0, 197, "Reset to Defaults");
        menu.AppendMenuItem(0, 900, "Clear Image Cache");
        this.addCustomFoldersMenu(menu);
        this.addPresetMenu(menu);
        menu.AppendMenuSeparator();
        this.addJSplitterMenu(menu);

        const idx = menu.TrackPopupMenu(x, y);
        this.handleSelection(idx);
        return true;
    },

    addOverlayMenu(parent) {
        const overlay = window.CreatePopupMenu();
        const grayed  = props.overlayAllOff.enabled;

        const themeMenu = window.CreatePopupMenu();
        _.forEach(CONFIG.PHOSPHOR_THEMES, (theme, i) => {
            themeMenu.AppendMenuItem(0, 600 + i, theme.name);
            if (props.phosphorTheme.value === i) themeMenu.CheckMenuItem(600 + i, true);
        });
        themeMenu.AppendMenuSeparator();
        const customMenuId = 600 + DISC_CUSTOM_THEME_INDEX;
        themeMenu.AppendMenuItem(0, customMenuId, 'Custom...');
        if (props.phosphorTheme.value === DISC_CUSTOM_THEME_INDEX) themeMenu.CheckMenuItem(customMenuId, true);
        themeMenu.AppendTo(overlay, (grayed || !props.showPhosphor.enabled) ? 1 : 0, "Phosphor Theme");

        overlay.AppendMenuSeparator();
        overlay.AppendMenuItem(0, 199, "— All Effects Off");
        if (props.overlayAllOff.enabled) overlay.CheckMenuItem(199, true);
        overlay.AppendMenuSeparator();

        overlay.AppendMenuItem(grayed ? 1 : 0, 200, "Reflection");
        if (!grayed && props.showReflection.enabled) overlay.CheckMenuItem(200, true);
        overlay.AppendMenuItem(grayed ? 1 : 0, 210, "Glow");
        if (!grayed && props.showGlow.enabled)       overlay.CheckMenuItem(210, true);
        overlay.AppendMenuItem(grayed ? 1 : 0, 220, "Scanlines");
        if (!grayed && props.showScanlines.enabled)  overlay.CheckMenuItem(220, true);
        overlay.AppendMenuItem(grayed ? 1 : 0, 230, "Phosphor");
        if (!grayed && props.showPhosphor.enabled)   overlay.CheckMenuItem(230, true);

        overlay.AppendMenuSeparator();
        const opacityM = window.CreatePopupMenu();
        opacityM.AppendMenuItem((!grayed && props.showReflection.enabled) ? 0 : 1, 201, `Reflection...  [${props.opReflection.value}]`);
        opacityM.AppendMenuItem((!grayed && props.showGlow.enabled)       ? 0 : 1, 211, `Glow...  [${props.opGlow.value}]`);
        opacityM.AppendMenuItem((!grayed && props.showScanlines.enabled)  ? 0 : 1, 221, `Scanlines...  [${props.opScanlines.value}]`);
        opacityM.AppendMenuItem((!grayed && props.showPhosphor.enabled)   ? 0 : 1, 231, `Phosphor...  [${props.opPhosphor.value}]`);
        opacityM.AppendTo(overlay, 0, "Opacity Settings");

        overlay.AppendTo(parent, 0, "Overlay Effects");
    },

    addImageSettingsMenu(parent) {
        const settingsMenu = window.CreatePopupMenu();
        this.addSpeedMenu(settingsMenu);
        this.addScalingMenu(settingsMenu);
        this.addSizeMenu(settingsMenu);
        this.addMaskMenu(settingsMenu);
        this.addRotationStepMenu(settingsMenu);
        settingsMenu.AppendTo(parent, 0, "Disc Settings");
    },

    addSpeedMenu(parent) {
        const speedMenu = window.CreatePopupMenu();
        _.forEach(CONFIG.SPEED_PRESETS, (preset, i) => speedMenu.AppendMenuItem(0, 10 + i, preset.name));
        const matchIdx = _.findIndex(CONFIG.SPEED_PRESETS, p => p.value === props.spinSpeed.value);
        if (matchIdx !== -1) speedMenu.CheckMenuRadioItem(10, 10 + CONFIG.SPEED_PRESETS.length - 1, 10 + matchIdx);
        speedMenu.AppendTo(parent, 0, "Rotation Speed");
    },

    addScalingMenu(parent) {
        const scalingMenu = window.CreatePopupMenu();
        _.forEach(CONFIG.INTERPOLATION_MODES, (mode, i) => {
            scalingMenu.AppendMenuItem(0, 20 + i, mode.name);
            if (props.interpolationMode.value === mode.value) scalingMenu.CheckMenuItem(20 + i, true);
        });
        scalingMenu.AppendTo(parent, 0, "Image Scaling");
    },

    addSizeMenu(parent) {
        const sizeMenu = window.CreatePopupMenu();
        _.forEach(CONFIG.DISC_SIZE_PRESETS, (preset, i) => {
            sizeMenu.AppendMenuItem(0, 30 + i, preset.name);
            if (props.maxImageSize.value === preset.value) sizeMenu.CheckMenuItem(30 + i, true);
        });
        sizeMenu.AppendTo(parent, 0, "Disc Resolution");
    },

    addMaskMenu(parent) {
        const maskMenu = window.CreatePopupMenu();
        _.forEach(CONFIG.MASK_TYPES, (mask, i) => {
            maskMenu.AppendMenuItem(0, 40 + i, mask.name);
            if (AssetManager.currentMaskType === i) maskMenu.CheckMenuItem(40 + i, true);
        });
        maskMenu.AppendTo(parent, 0, "Mask Type");
    },

    addRotationStepMenu(parent) {
        const stepMenu = window.CreatePopupMenu();
        stepMenu.AppendMenuItem(0, 80, "Smooth (2°)  — higher CPU");
        stepMenu.AppendMenuItem(0, 81, "Balanced (3°)");
        stepMenu.AppendMenuItem(0, 82, "Rough (4°)  — lower CPU");
        const cur = props.rotationStep.value;
        if (cur === 2) stepMenu.CheckMenuRadioItem(80, 82, 80);
        if (cur === 3) stepMenu.CheckMenuRadioItem(80, 82, 81);
        if (cur === 4) stepMenu.CheckMenuRadioItem(80, 82, 82);
        stepMenu.AppendTo(parent, 0, "Rotation Quality");
    },

    addCustomFoldersMenu(parent) {
        const customMenu = window.CreatePopupMenu();
        customMenu.AppendMenuItem(0, 50, "Add Custom Folder...");
        const folders = CustomFolders.getAll();
        if (folders.length > 0) {
            customMenu.AppendMenuSeparator();
            folders.forEach((folder, i) => {
                const displayName = folder.length > 50 ? "..." + folder.substring(folder.length - 47) : folder;
                customMenu.AppendMenuItem(0, 60 + i, displayName);
            });
            customMenu.AppendMenuSeparator();
            customMenu.AppendMenuItem(0, 70, "Clear All Custom Folders");
        }
        customMenu.AppendTo(parent, 0, "Custom Artwork Folders");
    },

    addPresetMenu(parent) {
        const presetM = window.CreatePopupMenu();
        const loadM   = window.CreatePopupMenu();
        const saveM   = window.CreatePopupMenu();
        _.times(3, i => {
            const num = i + 1;
            loadM.AppendMenuItem(0, 300 + num, 'Preset ' + num);
            saveM.AppendMenuItem(0, 400 + num, 'Preset ' + num);
        });
        loadM.AppendTo(presetM, 0, 'Load Preset');
        saveM.AppendTo(presetM, 0, 'Save Preset');
        presetM.AppendTo(parent, 0, 'Presets');
    },

    addJSplitterMenu(parent) {
        const jsMenu          = window.CreatePopupMenu();
        const currentDrawMode = window.GetProperty('RP.DrawMode', 0);
        jsMenu.AppendMenuItem(0, 950,
            'Renderer: ' + (currentDrawMode === 1
                ? 'D2D  ✓  →  Switch to GDI+'
                : 'GDI+  ✓  →  Switch to D2D') + '  (reload)');
        jsMenu.AppendTo(parent, 0, 'JSplitter ONLY');
    },

    addBorderPaddingMenu(parent) {
        const bpMenu = window.CreatePopupMenu();
        bpMenu.AppendMenuItem(0, 250, 'Set Border Size...');
        bpMenu.AppendMenuItem(0, 251, 'Change Border Color...');
        bpMenu.AppendMenuItem(0, 252, 'Set Padding...');
        bpMenu.AppendTo(parent, 0, 'Border & Padding');
    },

    addBackgroundMenu(parent) {
        const bgMenu        = window.CreatePopupMenu();
        const uiColorActive = props.bgUseUIColor.enabled;

        bgMenu.AppendMenuItem(0, 263, 'Use UI Color as Background');
        if (uiColorActive) bgMenu.CheckMenuItem(263, true);
        bgMenu.AppendMenuSeparator();
        bgMenu.AppendMenuItem(uiColorActive ? 1 : 0, 260, 'Enable Background Art');
        if (!uiColorActive && props.backgroundEnabled.enabled) bgMenu.CheckMenuItem(260, true);
        bgMenu.AppendMenuItem(uiColorActive ? 1 : 0, 261, 'Custom Background Color...');
        bgMenu.AppendMenuSeparator();

        const blurEnabled = !uiColorActive && props.backgroundEnabled.enabled && props.blurEnabled.enabled;
        const blurMenu    = window.CreatePopupMenu();
        blurMenu.AppendMenuItem(0, 270, 'Enable Blur');
        if (props.blurEnabled.enabled) blurMenu.CheckMenuItem(270, true);
        blurMenu.AppendMenuSeparator();
        _.times(11, i => {
            const value = i * 20;
            blurMenu.AppendMenuItem(0, 271 + i, 'Radius: ' + value);
            if (props.blurRadius.value === value) blurMenu.CheckMenuItem(271 + i, true);
        });
        blurMenu.AppendMenuItem(0, 282, 'Radius: 240');
        if (props.blurRadius.value === 240) blurMenu.CheckMenuItem(282, true);
        blurMenu.AppendMenuItem(0, 283, 'Max: 254');
        if (props.blurRadius.value === 254) blurMenu.CheckMenuItem(283, true);
        blurMenu.AppendTo(bgMenu, blurEnabled ? 0 : 1, 'Blur Settings');

        const darkenMenu = window.CreatePopupMenu();
        _.times(6, i => {
            const value = i * 10;
            darkenMenu.AppendMenuItem(0, 290 + i, 'Level: ' + value + '%');
            if (props.darkenValue.value === value) darkenMenu.CheckMenuItem(290 + i, true);
        });
        darkenMenu.AppendTo(bgMenu, uiColorActive ? 1 : 0, 'Darken Background');
        bgMenu.AppendTo(parent, 0, 'Background');
    },

    handleSelection(idx) {
        let changed = false;

        const toggles = {
            1: { prop: props.useAlbumArtOnly, reload: true },
            2: { prop: props.spinningEnabled,  timer: true },
            3: { prop: props.keepAspectRatio,  cache: true }
        };
        if (toggles[idx]) {
            toggles[idx].prop.toggle();
            if (idx === 1) {
                if (P.useAlbumArtOnly) {
                    releaseSpinResources();
                }
                if (State.currentMetadb) {
                    ImageLoader.clearCache();
                    DiscComposite.dispose();
                    State.lastFrame = -1;
                    ImageLoader.loadForMetadb(State.currentMetadb, true);
                }
            } else if (idx === 2) {
                if (!P.spinningEnabled) {
                    releaseSpinResources();
                } else {
                    State.updateTimer();
                }
            } else {
                if (toggles[idx].timer) State.updateTimer();
            }
            if (toggles[idx].cache) State.paintCache.valid = false;
            changed = true;
        }

        const speedPreset = _.find(CONFIG.SPEED_PRESETS, (p, i) => (i + 10) === idx);
        if (speedPreset) {
            props.spinSpeed.value = speedPreset.value;
            changed = true;
        }

        const interpMode = _.find(CONFIG.INTERPOLATION_MODES, (m, i) => (i + 20) === idx);
        if (interpMode) {
            props.interpolationMode.value = interpMode.value;
            ImageLoader.clearCache();
            DiscComposite.dispose();
            OverlayInvalidator.request();
            State.lastFrame        = -1;
            State.paintCache.valid = false;
            const oldImg   = State.img;
            const oldBgImg = State.bgImg;
            State.img    = null;
            State.bgImg  = null;
            State.imageType = CONFIG.IMAGE_TYPE.REAL_DISC;
            Utils.safeDispose(oldImg);
            if (oldBgImg && oldBgImg !== oldImg) Utils.safeDispose(oldBgImg);
            invalidateBgCaches();
            if (State.currentMetadb) ImageLoader.loadForMetadb(State.currentMetadb, true);
            changed = true;
        }

        const sizePreset = _.find(CONFIG.DISC_SIZE_PRESETS, (p, i) => (i + 30) === idx);
        if (sizePreset) {
            props.maxImageSize.value = sizePreset.value;
            ImageLoader.clearCache();
            AssetManager.maskCache.clear();
            AssetManager.rimCache.clear();
            DiscComposite.dispose();
            OverlayInvalidator.request();
            State.paintCache.valid = false;
            State.lastFrame        = -1;
            const oldImg2   = State.img;
            const oldBgImg2 = State.bgImg;
            State.img    = null;
            State.bgImg  = null;
            State.imageType = CONFIG.IMAGE_TYPE.REAL_DISC;
            Utils.safeDispose(oldImg2);
            if (oldBgImg2 && oldBgImg2 !== oldImg2) Utils.safeDispose(oldBgImg2);
            invalidateBgCaches();
            if (State.currentMetadb) ImageLoader.loadForMetadb(State.currentMetadb, true);
            changed = true;
        }

        if (idx >= 40 && idx <= 42) {
            AssetManager.setMaskType(idx - 40, true);
            changed = true;
        }

        if (idx >= 80 && idx <= 82) {
            const stepValues = { 80: 2, 81: 3, 82: 4 };
            const newStep    = stepValues[idx];
            if (newStep !== props.rotationStep.value) {
                props.rotationStep.value = newStep;
                State.stopTimer();
                DiscComposite.dispose();
                State.lastFrame = -1;
                State.updateTimer();
                changed = true;
            }
        }

        if (idx === 50) {
            try {
                const folder = utils.InputBox(window.ID, "Enter folder path for custom artwork search:", "Custom Artwork Folder", "", true);
                if (folder && CustomFolders.add(folder)) {
                    ImageLoader.clearCache();
                    if (State.currentMetadb) ImageLoader.loadForMetadb(State.currentMetadb, true);
                    changed = true;
                }
            } catch (e) {}
        } else if (idx >= 60 && idx <= 64) {
            if (CustomFolders.remove(idx - 60)) {
                ImageLoader.clearCache();
                if (State.currentMetadb) ImageLoader.loadForMetadb(State.currentMetadb, true);
                changed = true;
            }
        } else if (idx === 70) {
            CustomFolders.clear();
            ImageLoader.clearCache();
            if (State.currentMetadb) ImageLoader.loadForMetadb(State.currentMetadb, true);
            changed = true;
        }

        if (idx === 900) {
            FileManager.clear();
            ImageLoader.clearCache();
            AssetManager.maskCache.clear();
            AssetManager.rimCache.clear();
            BackgroundCache.invalidate();
            DiscComposite.dispose();
            State.paintCache.valid = false;
            if (State.currentMetadb) ImageLoader.loadForMetadb(State.currentMetadb, true);
            changed = true;
        }

        if (idx === 199) {
            if (!props.overlayAllOff.enabled) {
                props.savedOverlay.value = JSON.stringify({
                    r: props.showReflection.enabled,
                    g: props.showGlow.enabled,
                    s: props.showScanlines.enabled,
                    p: props.showPhosphor.enabled
                });
                props.overlayAllOff.enabled = true;
            } else {
                try {
                    const saved = JSON.parse(props.savedOverlay.value || '{}');
                    if (_.isBoolean(saved.r)) props.showReflection.enabled = saved.r;
                    if (_.isBoolean(saved.g)) props.showGlow.enabled       = saved.g;
                    if (_.isBoolean(saved.s)) props.showScanlines.enabled  = saved.s;
                    if (_.isBoolean(saved.p)) props.showPhosphor.enabled   = saved.p;
                } catch (e) {}
                props.overlayAllOff.enabled = false;
            }
            OverlayInvalidator.request();
            changed = true;
        }

        if (idx === 200) { props.showReflection.toggle(); OverlayInvalidator.request(); changed = true; }
        if (idx === 201) { Slider.activate("Reflection"); return; }

        if (idx === 210) { props.showGlow.toggle(); OverlayInvalidator.request(); changed = true; }
        if (idx === 211) { Slider.activate("Glow"); return; }

        if (idx === 220) { props.showScanlines.toggle(); OverlayInvalidator.request(); changed = true; }
        if (idx === 221) { Slider.activate("Scanlines"); return; }

        if (idx === 230) { props.showPhosphor.toggle(); OverlayInvalidator.request(); changed = true; }
        if (idx === 231) { Slider.activate("Phosphor"); return; }

        if (_.inRange(idx, 600, 600 + DISC_CUSTOM_THEME_INDEX)) {
            props.phosphorTheme.value = idx - 600;
            PhosphorManager.invalidateCache();
            OverlayInvalidator.request();
            changed = true;
        }
        if (idx === 600 + DISC_CUSTOM_THEME_INDEX) {
            PhosphorManager.setCustomColor();
            return;
        }

        if (idx === 197) {
            props.spinningEnabled.enabled     = true;
            props.spinSpeed.value             = 2.0;
            props.useAlbumArtOnly.enabled     = false;
            props.keepAspectRatio.enabled     = true;
            props.interpolationMode.value     = 0;
            props.maxImageSize.value          = 500;
            props.rotationStep.value          = 2;
            AssetManager.setMaskType(0, false);

            props.overlayAllOff.enabled       = false;
            props.savedOverlay.value          = '';
            props.showReflection.enabled      = true;
            props.opReflection.value          = 30;
            props.showGlow.enabled            = false;
            props.opGlow.value                = 40;
            props.showScanlines.enabled       = false;
            props.opScanlines.value           = 80;
            props.showPhosphor.enabled        = true;
            props.opPhosphor.value            = 20;
            props.phosphorTheme.value         = 8;
            props.customPhosphorColor.value   = 0xFFFFFFFF;
            PhosphorManager.invalidateCache();

            props.borderSize.value            = 5;
            props.borderColor.value           = 0xFF202020;
            props.padding.value               = 10;

            props.backgroundEnabled.enabled   = true;
            props.bgUseUIColor.enabled        = false;
            props.blurRadius.value            = 240;
            props.blurEnabled.enabled         = true;
            props.darkenValue.value           = 10;
            props.customBackgroundColor.value = 0xFF191919;

            ImageLoader.clearCache();
            AssetManager.maskCache.clear();
            AssetManager.rimCache.clear();
            invalidateAllCaches();
            State.paintCache.valid = false;
            State.stopTimer();
            State.updateTimer();
            if (State.currentMetadb) ImageLoader.loadForMetadb(State.currentMetadb, true);
            changed = true;
        }

        if (idx === 250) {
            const v = utils.InputBox(window.ID, 'Border Size', 'Enter size (0-50):', props.borderSize.value.toString(), false);
            const n = parseInt(v, 10);
            if (!isNaN(n)) { props.borderSize.value = _.clamp(n, 0, 50); State.paintCache.valid = false; invalidateTopCaches(); changed = true; }
        }
        if (idx === 251) {
            const picked = utils.ColourPicker(window.ID, props.borderColor.value);
            if (picked !== -1) { props.borderColor.value = picked; invalidateTopCaches(); RepaintHelper.full(); changed = true; }
        }
        if (idx === 252) {
            const v = utils.InputBox(window.ID, 'Padding', 'Enter size (0-100):', props.padding.value.toString(), false);
            const n = parseInt(v, 10);
            if (!isNaN(n)) { props.padding.value = _.clamp(n, 0, 100); State.paintCache.valid = false; invalidateTopCaches(); changed = true; }
        }

        if (idx === 263) { props.bgUseUIColor.toggle();        invalidateBgCaches(); changed = true; }
        if (idx === 260) { props.backgroundEnabled.toggle();   invalidateBgCaches(); changed = true; }
        if (idx === 261) {
            const picked = utils.ColourPicker(window.ID, props.customBackgroundColor.value);
            if (picked !== -1) { props.customBackgroundColor.value = picked; StaticBgLayer.invalidate(); RepaintHelper.background(); changed = true; }
        }
        if (idx === 270) { props.blurEnabled.toggle(); invalidateBgCaches(); changed = true; }

        if (_.inRange(idx, 271, 282)) {
            props.blurRadius.value = (idx - 271) * 20;
            invalidateBgCaches();
            changed = true;
        } else if (idx === 282) {
            props.blurRadius.value = 240;
            invalidateBgCaches();
            changed = true;
        } else if (idx === 283) {
            props.blurRadius.value = 254;
            invalidateBgCaches();
            changed = true;
        }

        if (_.inRange(idx, 290, 296)) {
            props.darkenValue.value = (idx - 290) * 10;
            invalidateBgCaches();
            changed = true;
        }

        if (_.inRange(idx, 301, 304)) { PresetManager.load(idx - 300); return; }
        if (_.inRange(idx, 401, 404)) { PresetManager.save(idx - 400); }

        if (idx === 950) {
            const next = window.GetProperty('RP.DrawMode', 0) === 1 ? 0 : 1;
            window.SetProperty('RP.DrawMode', next);
            window.Reload();
            return;
        }

        if (changed) RepaintHelper.full();
    }
};

// --------------------------------------------------------------------------------------------
// 26. ARTWORK DISPATCH QUEUE & NOTIFICATIONS
// --------------------------------------------------------------------------------------------

const ArtDispatcher = {
    _pending:  null,
    _timer:    null,
    _priority: { track: 4, stop: 3, selection: 2, playlist: 1 },

    request(reason, metadb) {
        const priority = this._priority[reason] || 0;
        if (this._pending) {
            const currentPriority = this._priority[this._pending.reason] || 0;
            if (priority < currentPriority) return;
        }
        this._pending = { reason, metadb };
        if (this._timer) window.ClearTimeout(this._timer);
        this._timer = window.SetTimeout(() => { this._dispatch(); }, 50);
    },

    _dispatch() {
        if (!this._pending) return;
        if (!isLive()) { this._pending = null; this._timer = null; return; }
        const { reason, metadb } = this._pending;
        this._pending = null;
        this._timer   = null;

        switch (reason) {
            case 'track':
                try {
                    if (metadb && State.currentMetadb && State.img &&
                        State.currentMetadb.Compare(metadb)) return;
                } catch (e) {}
                if (metadb && State.currentMetadb && State.img) {
                    try {
                        const newFolder = ImageLoader.tf_path.EvalWithMetadb(metadb);
                        const curFolder = ImageLoader.tf_path.EvalWithMetadb(State.currentMetadb);
                        if (newFolder === curFolder) {
                            State.currentMetadb = metadb;
                            return;
                        }
                        const newAlbum  = ImageLoader.tf_album.EvalWithMetadb(metadb);
                        const curAlbum  = ImageLoader.tf_album.EvalWithMetadb(State.currentMetadb);
                        const newArtist = ImageLoader.tf_artist.EvalWithMetadb(metadb);
                        const curArtist = ImageLoader.tf_artist.EvalWithMetadb(State.currentMetadb);
                        const newDisc   = ImageLoader.tf_discnumber.EvalWithMetadb(metadb);
                        const curDisc   = ImageLoader.tf_discnumber.EvalWithMetadb(State.currentMetadb);
                        if (newAlbum && newAlbum === curAlbum &&
                            newArtist === curArtist &&
                            newDisc   === curDisc) {
                            State.currentMetadb = metadb;
                            return;
                        }
                    } catch (e) {}
                }
                if (metadb) ImageLoader.loadForMetadb(metadb, true);
                break;

            case 'stop': {
                const stopReasonCode = metadb;
                if (stopReasonCode === 0) State.angle = 0;
                State.updateTimer();
                RepaintHelper.full();
                break;
            }

            case 'selection':
                if (!fb.IsPlaying && !isPaused && metadb) ImageLoader.loadForMetadb(metadb, false);
                break;

            case 'playlist':
                if (fb.IsPlaying && fb.GetNowPlaying()) {
                    ImageLoader.loadForMetadb(fb.GetNowPlaying(), false);
                }
                break;
        }
    }
};

// --------------------------------------------------------------------------------------------
// 27. PRE-PAINT LAYER PREPARATION (MUTATION-FREE PAINT GUARANTEE)
// --------------------------------------------------------------------------------------------

function prepareLayers() {
    if (RepaintHelper._allValid) return;

    const w = window.Width;
    const h = window.Height;
    if (w <= 0 || h <= 0) return;

    State.paintCache.panelW = w;
    State.paintCache.panelH = h;

    if (StaticBgLayer._w === w && StaticBgLayer._h === h &&
        StaticTopLayer._w === w && StaticTopLayer._h === h &&
        StaticBgLayer.valid && StaticTopLayer.valid &&
        OverlayCache.valid && DiscComposite.valid) {
        RepaintHelper._allValid = true;
        return;
    }

    State.updatePaintCache();
    const pc = State.paintCache;

    // --- Resolved argument list for DiscComposite.build ---
    if (!DiscComposite.valid && State.img && State.isDiscImage && !isStaticMode()) {
        const targetDiscSize = Math.floor(pc.discSize > 0 ? pc.discSize : Utils.getPanelDiscSize());
        DiscComposite.build(State.img, targetDiscSize, State.imageType);
        if (P.spinningEnabled) {
            RotationCache.scheduleAsyncBuild(DiscComposite.img || State.img);
        }
    } else if (!DiscComposite.valid && State.img && State.isDiscImage && isStaticMode()) {
        DiscComposite.valid = true;
    }

    if (OverlayCache.valid && OverlayCache.img &&
        (OverlayCache.img.Width !== w || OverlayCache.img.Height !== h)) {
        OverlayCache.invalidate();
        StaticTopLayer.invalidate();
    }

    if (!OverlayCache.valid) {
        OverlayCache.build(w, h, pc);
        StaticTopLayer.invalidate();
    }
    if (!StaticBgLayer.valid || StaticBgLayer._w !== w || StaticBgLayer._h !== h) {
        StaticBgLayer.build(w, h);
    }
    if (!StaticTopLayer.valid || StaticTopLayer._w !== w || StaticTopLayer._h !== h) {
        StaticTopLayer.build(w, h);
    }

    RepaintHelper._allValid = DiscComposite.valid &&
                              OverlayCache.valid   &&
                              StaticBgLayer.valid  &&
                              StaticTopLayer.valid;
}

let _paintReentrant = false;

// --------------------------------------------------------------------------------------------
// 28. HOST ENGINE EVENT CALLBACKS
// --------------------------------------------------------------------------------------------

function on_paint(gr) {
    if (_paintReentrant) {
        RepaintScheduler.request();
        return;
    }
    _paintReentrant = true;
    try {
        const pc = State.paintCache;
        const w  = pc.panelW || window.Width;
        const h  = pc.panelH || window.Height;
        if (w <= 0 || h <= 0) return;

        // Layer 1: Background Fill or Blurred Artwork
        if (StaticBgLayer.img) {
            gr.DrawImage(StaticBgLayer.img, 0, 0, w, h, 0, 0, w, h);
        } else {
            gr.FillSolidRect(0, 0, w, h, P.bgUseUIColor ? pc.bgColor : (P.customBackgroundColor >>> 0));
        }

        // Layer 2: Rotating Disc or Static Album Cover
        Renderer.paint(gr);

        // Layer 3: Border Framing and Overlay Effects
        if (StaticTopLayer.img) {
            gr.DrawImage(StaticTopLayer.img, 0, 0, w, h, 0, 0, w, h);
        }

        // Layer 4: Interactive HUD Sliders
        SliderRenderer.draw(gr);
    } finally {
        _paintReentrant = false;
    }
}

function on_size() {
    State.stopTimer();
    State.paintCache.valid = false;
    RepaintHelper._allValid = false;

    if (resizeTimer)        { window.ClearTimeout(resizeTimer);        resizeTimer        = null; }
    if (_resizeStage1Timer) { window.ClearTimeout(_resizeStage1Timer); _resizeStage1Timer = null; }
    if (_resizeStage2Timer) { window.ClearTimeout(_resizeStage2Timer); _resizeStage2Timer = null; }
    if (_resizeStage3Timer) { window.ClearTimeout(_resizeStage3Timer); _resizeStage3Timer = null; }
    resizeTimer = window.SetTimeout(() => {
        resizeTimer = null;
        if (!isLive()) return;
        _runResizePipeline();
    }, 50);
}

function _runResizePipeline() {
    invalidateAllCaches();
    AssetManager.maskCache.clear();
    AssetManager.rimCache.clear();
    ImageLoader.clearCache();
    RepaintScheduler.request();

    _resizeStage1Timer = window.SetTimeout(() => {
        _resizeStage1Timer = null;
        if (!isLive()) return;
        const w = window.Width, h = window.Height;
        if (w > 0 && h > 0) {
            StaticBgLayer.build(w, h);
        }
        RepaintScheduler.request();

        _resizeStage2Timer = window.SetTimeout(() => {
            _resizeStage2Timer = null;
            if (!isLive()) return;
            if (State.img && State.isDiscImage && !isStaticMode()) {
                const size = Utils.getPanelDiscSize();
                DiscComposite.build(State.img, size, State.imageType);
                if (P.spinningEnabled) {
                    RotationCache.scheduleAsyncBuild(DiscComposite.img || State.img);
                }
            }
            const w2 = window.Width, h2 = window.Height;
            if (w2 > 0 && h2 > 0) {
                State.updatePaintCache();
                OverlayCache.build(w2, h2, State.paintCache);
                StaticTopLayer.build(w2, h2);
            }
            RepaintScheduler.request();

            _resizeStage3Timer = window.SetTimeout(() => {
                _resizeStage3Timer = null;
                if (!isLive()) return;
                if (State.currentMetadb) {
                    ImageLoader.loadForMetadb(State.currentMetadb, false);
                    State.updateTimer();
                } else {
                    State.updateTimer();
                    RepaintScheduler.immediate();
                }
            }, 0);
        }, 0);
    }, 0);
}

function on_playback_new_track(metadb) {
    if (!isLive()) return;
    ArtDispatcher.request('track', metadb);
}

function on_metadb_changed(metadb_list, fromhook) {
    if (!isLive()) return;
    if (!fb.IsPlaying && !isPaused) return;
    const nowPlaying = fb.GetNowPlaying();
    if (!nowPlaying) return;
    let affected = false;
    const count = (metadb_list.Count !== undefined ? metadb_list.Count : metadb_list.length) || 0;
    for (let i = 0; i < count; i++) {
        const item = metadb_list.Item ? metadb_list.Item(i) : metadb_list[i];
        if (item && item.Compare && item.Compare(nowPlaying)) { affected = true; break; }
    }
    if (affected) {
        State.currentMetadb = null;
        ImageLoader.loadForMetadb(nowPlaying, true);
    }
}

function on_playback_pause(state) {
    if (!isLive()) return;
    isPaused = !state;
    State.updateTimer();
}

function on_playback_stop(reason) {
    if (!isLive()) return;
    if (reason === 2) { isPaused = false; return; }
    isPaused = false;
    ArtDispatcher.request('stop', reason);
}

function on_playback_starting() {
    if (!isLive()) return;
    isPaused = false;
    State.updateTimer();
}

function on_playback_seek() {
    if (!isLive()) return;
    State.updateTimer();
}

function on_selection_changed() {
    if (!isLive()) return;
    if (fb.IsPlaying || isPaused) return;
    const sel = fb.GetSelection();
    if (sel) ArtDispatcher.request('selection', sel);
}

/**
 * Fast indexed search for a track handle matching a directory path.
 * @param {string} folderPath - Target directory.
 * @returns {object|null} FbMetadbHandle or null.
 */
function _findHandleForFolder(folderPath) {
    if (!folderPath || !fb.IsLibraryEnabled()) return null;
    let items = null;
    let matches = null;
    try {
        items = fb.GetLibraryItems();
        if (!items || !items.Count) return null;
        matches = fb.GetQueryItems(items, '"%directory_path%" IS "' + folderPath.replace(/"/g, '""') + '"');
        if (matches && matches.Count > 0) {
            const h = matches.Item ? matches.Item(0) : matches[0];
            return h;
        }
    } catch (e) {
    } finally {
        if (matches) { try { matches.Dispose(); } catch (e) {} }
        if (items)   { try { items.Dispose(); }   catch (e) {} }
    }
    return null;
}

function on_notify_data(name, info) {
    if (name !== 'ArtFolder') return;
    if (!isLive()) return;
    if (fb.IsPlaying || isPaused) return;
    if (!info) return;
    const handle = _findHandleForFolder(info);
    if (handle) ArtDispatcher.request('selection', handle);
}

function on_playlist_switch() {
    if (!isLive()) return;
    ArtDispatcher.request('playlist', null);
}

function on_playlist_items_added(playlist_index) {
    if (!isLive()) return;
    ArtDispatcher.request('playlist', null);
}

function on_playlist_items_removed(playlist_index) {
    if (!isLive()) return;
    ArtDispatcher.request('playlist', null);
}

function on_get_album_art_done(metadb, art_id, image, image_path) {
    if (!isLive()) { Utils.safeDispose(image); return; }
    ImageLoader.handleAlbumArt(metadb, image, image_path);
}

function on_mouse_rbtn_up(x, y) {
    return MenuManager.show(x, y);
}

function on_mouse_lbtn_down(x, y) {
    try { window.SetFocus(); } catch (e) {}
}

function on_mouse_lbtn_up(x, y) {
    if (Slider.active) Slider.deactivate();
}

function on_mouse_wheel(delta) {
    if (!Slider.active || !Slider.target) return;
    const propMap = {
        "Reflection": props.opReflection,
        "Glow":       props.opGlow,
        "Scanlines":  props.opScanlines,
        "Phosphor":   props.opPhosphor
    };
    const prop = propMap[Slider.target];
    if (!prop) return;
    prop.value = _.clamp(prop.value + delta * SLIDER_STEP, 0, 255);
    RepaintHelper.full();

    if (Slider.timers.overlayRebuild) window.ClearTimeout(Slider.timers.overlayRebuild);
    Slider.timers.overlayRebuild = window.SetTimeout(() => {
        Slider.timers.overlayRebuild = null;
        OverlayCache.invalidate();
        StaticTopLayer.invalidate();
        RepaintHelper.full();
    }, 100);
}

function on_script_unload() {
    phase = Phase.SHUTDOWN;

    RepaintScheduler.cancel();
    if (resizeTimer)         { window.ClearTimeout(resizeTimer);         resizeTimer         = null; }
    if (_resizeStage1Timer)  { window.ClearTimeout(_resizeStage1Timer);  _resizeStage1Timer  = null; }
    if (_resizeStage2Timer)  { window.ClearTimeout(_resizeStage2Timer);  _resizeStage2Timer  = null; }
    if (_resizeStage3Timer)  { window.ClearTimeout(_resizeStage3Timer);  _resizeStage3Timer  = null; }
    if (ArtDispatcher._timer) { window.ClearTimeout(ArtDispatcher._timer); ArtDispatcher._timer = null; }
    ArtDispatcher._pending = null;
    if (State.loadTimer)   { window.ClearTimeout(State.loadTimer);   State.loadTimer   = null; }
    if (State.phaseBTimer) { window.ClearTimeout(State.phaseBTimer); State.phaseBTimer = null; }
    if (readyTimer)        { window.ClearTimeout(readyTimer);        readyTimer        = null; }
    RotationCache._cancelBuild();

    OverlayInvalidator.cancel();
    if (SliderRenderer._font) { try { SliderRenderer._font.Dispose(); } catch (e) {} SliderRenderer._font = null; }
    Slider.cleanup();
    State.cleanup();
    ImageLoader.cleanup();
    AssetManager.cleanup();
    BackgroundCache.dispose();
    OverlayCache.dispose();
    StaticBgLayer.dispose();
    StaticTopLayer.dispose();
    DiscComposite.dispose();
    FileManager.clear();

    _tt('');
    if (_gr) { try { if (_bmp) _bmp.ReleaseGraphics(_gr); } catch (e) {} }
    _gr  = null;
    _bmp = null;
}

// --------------------------------------------------------------------------------------------
// 29. SYSTEM INITIALISATION
// --------------------------------------------------------------------------------------------

function init() {
    AssetManager.init();
    CustomFolders.load();

    const nowPlaying = fb.GetNowPlaying();

    if (nowPlaying) {
        ImageLoader.loadForMetadb(nowPlaying, true);

    } else if (props.savedPath.value && FileManager.exists(props.savedPath.value)) {
        try {
            const imageType = Utils.getImageType(props.savedPath.value);
            const savedPath = props.savedPath.value;

            if (imageType === CONFIG.IMAGE_TYPE.DEFAULT_DISC) {
                ImageLoader.loadDefaultDisc();
            } else {
                const raw = gdi.Image(savedPath);
                if (raw) {
                    let original = null;
                    try { original = raw.Clone(0, 0, raw.Width, raw.Height); _tagImg(original); } catch (_) {}
                    const targetSize = Utils.getPanelDiscSize();
                    const treatAsDisc = !P.useAlbumArtOnly &&
                                        (imageType === CONFIG.IMAGE_TYPE.REAL_DISC ||
                                         props.savedIsDisc.enabled);
                    let displayImg;
                    if (treatAsDisc) {
                        displayImg = ImageProcessor.processForDisc(raw, targetSize, imageType, P.interpolationMode);
                    } else {
                        displayImg = ImageProcessor.scaleProportional(raw, CONFIG.MAX_STATIC_SIZE, P.interpolationMode);
                    }
                    if (displayImg) {
                        State.setImage(displayImg, treatAsDisc, imageType, original);
                    } else {
                        Utils.safeDispose(original);
                    }
                }
            }
        } catch (e) {}

    } else {
        const sharedFolder = window.GetProperty('RP.SavedFolder', '');
        if (sharedFolder && FileManager.isDirectory(sharedFolder)) {
            const coverPath = ImageLoader.searchForCover(null, sharedFolder);
            if (coverPath) {
                try {
                    const imageType = Utils.getImageType(coverPath);
                    const raw = gdi.Image(coverPath);
                    if (raw) {
                        let original = null;
                        try { original = raw.Clone(0, 0, raw.Width, raw.Height); _tagImg(original); } catch (_) {}
                        const displayImg = ImageProcessor.scaleProportional(raw, CONFIG.MAX_STATIC_SIZE, P.interpolationMode);
                        if (displayImg) {
                            State.setImage(displayImg, false, imageType, original);
                            props.savedPath.value = coverPath;
                        } else {
                            Utils.safeDispose(original);
                        }
                    }
                } catch (e) {}
            }
        }
    }

    State.updateTimer();
}

(function waitForReady() {
    window.MinHeight = 75;
    window.MinWidth  = 75;
    if (window.Width > 0 && window.Height > 0) {
        init();
        phase = Phase.LIVE;
    } else {
        readyTimer = window.SetTimeout(function retry() {
            if (window.Width > 0 && window.Height > 0) {
                init();
                phase = Phase.LIVE;
            } else {
                readyTimer = window.SetTimeout(retry, 50);
            }
        }, 50);
    }
})();