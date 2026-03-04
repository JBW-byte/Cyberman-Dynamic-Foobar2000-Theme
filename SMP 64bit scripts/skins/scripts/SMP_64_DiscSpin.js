'use strict';
			  // -============ AUTHOR L.E.D. ===========- \\
			 // -====== SMP 64bit Disc Spin V3.1.1 ======- \\
			// -====== Spins Disc + Artwork + Cover ======- \\

    // ===================*** Foobar2000 64bit ***================== \\
   // ======= For Spider Monkey Panel 64bit, author: marc2003 ======= \\
  // ====== Masking All Images, Creates a Disc from Album Art+  ====== \\
 // ======== Sample Code ApplyMask author: T.P Wang / marc2003 ======== \\
// ==-== Inspired by "CD Album Art, @authors "marc2003, Jul23, vnav" =-==\\

window.DefineScript('SMP 64bit Disc Spin V3.1.1', { author: 'L.E.D.', grab_focus: true });

// ====================== HELPER INCLUDES ======================
include(fb.ComponentPath + 'samples\\complete\\js\\lodash.min.js');
include(fb.ComponentPath + 'samples\\complete\\js\\helpers.js');

// _fbSanitise —
    function _fbSanitise(str) {
        if (!str) return '';
        return utils.ReplaceIllegalChars(str, true);
    }

// Lifecycle state machine - guards operations during shutdown
const Phase = {
    BOOT:     0,
    // 1 intentionally unused — reserved gap so LIVE and SHUTDOWN
    // are never confused with a falsy 0 in accidental numeric comparisons.
    LIVE:     2,
    SHUTDOWN: 3
};

let phase = Phase.BOOT;

function isLive() {
    return phase === Phase.LIVE;
}

// ====================== PROPERTIES (Using helpers _p) ======================
const props = {
    spinningEnabled:    new _p('RP.SpinningEnabled', true),
    spinSpeed:          new _p('RP.SpinSpeed', 2.0),
    useAlbumArtOnly:    new _p('RP.UseAlbumArtOnly', false),
    keepAspectRatio:    new _p('RP.KeepAspectRatio', true),
    interpolationMode:  new _p('RP.InterpolationMode', 0),
    maxImageSize:       new _p('RP.MaxImageSize', 500),
    savedPath:          new _p('RP.SavedPath', ''),
    savedIsDisc:        new _p('RP.SavedIsDisc', false),
    maskType:           new _p('RP.MaskType', 0),
    userOverrideMask:   new _p('RP.UserOverrideMask', false),

    // Overlay effects
    showReflection:     new _p('Disc.ShowReflection', true),
    opReflection:       new _p('Disc.OpReflection', 30),
    showGlow:           new _p('Disc.ShowGlow', false),
    opGlow:             new _p('Disc.OpGlow', 40),
    showScanlines:      new _p('Disc.ShowScanlines', false),
    opScanlines:        new _p('Disc.OpScanlines', 80),
    showPhosphor:       new _p('Disc.ShowPhosphor', true),
    opPhosphor:         new _p('Disc.OpPhosphor', 20),
    phosphorTheme:      new _p('Disc.PhosphorTheme', 8),
    customPhosphorColor: new _p('Disc.CustomPhosphorColor', 0xFFFFFFFF),
    overlayAllOff:      new _p('Disc.OverlayAllOff', false),
    savedOverlay:       new _p('Disc.SavedOverlay', ''),

    // Border & Padding
    borderSize:         new _p('Disc.BorderSize', 5),
    borderColor:        new _p('Disc.BorderColor', 0xFF202020),  // Dark gray, full alpha
    padding:            new _p('Disc.Padding', 10),

    // Background
    backgroundEnabled:  new _p('Disc.BackgroundEnabled', true),
    blurRadius:         new _p('Disc.BlurRadius', 240),
    blurEnabled:        new _p('Disc.BlurEnabled', true),
    darkenValue:        new _p('Disc.DarkenValue', 10),
    customBackgroundColor: new _p('Disc.CustomBackgroundColor', 0xFF191919),  // Very dark gray, full alpha
    bgUseUIColor:       new _p('Disc.BgUseUIColor', false)
};

function _getUIColour() {
    if (window.InstanceType) return window.GetColourDUI(1);
    try { return window.GetColourCUI(3); } catch (e) { return window.GetColourDUI(1); }
}

function on_colours_changed() {
    if (!isLive()) return;
    State.paintCache.bgColor = _getUIColour();
    window.Repaint();
}

function on_font_changed() {
    if (!isLive()) return;
    // Dispose cached font so it is recreated at the new system size/style.
    if (SliderRenderer._font) {
        try { SliderRenderer._font.Dispose(); } catch (e) {}
        SliderRenderer._font = null;
    }
    window.Repaint();
}

// ====================== CONFIGURATION ======================
const CONFIG = Object.freeze({
    TIMER_INTERVAL: 42,
    MAX_STATIC_SIZE: 1000,
    MAX_CACHE_ENTRIES: 50,
    MAX_MASK_CACHE:   10,
    MAX_RIM_CACHE:    10,
    MAX_FILE_CACHE:  200,
    MAX_BG_CACHE:     4,

    MIN_DISC_SIZE: 125,
    MAX_DISC_SIZE: 1000,
    MIN_SPIN_SPEED: 0.5,
    MAX_SPIN_SPEED: 5,

    SMOOTHING_MODE: 4,
    DISC_SCALE_FACTOR: 1.00,
    ANGLE_MODULO: 360,
    LOAD_DEBOUNCE_MS: 33,
    MAX_SUBFOLDER_DEPTH: 3,
    MAX_CUSTOM_FOLDERS: 5,

    PATHS: {
        DEFAULT_DISC: fb.ProfilePath + "skins\\default_disc.png",
        RIM: fb.ProfilePath + "skins\\center_album_rim.png",
        SKINS_DIR: fb.ProfilePath + "skins\\"
    },

    MASK_TYPES: [
        { name: "CD Mask", file: "mask.png", id: 0 },
        { name: "Vinyl Mask", file: "vinyl_mask.png", id: 1 },
        { name: "No Mask", file: null, id: 2 }
    ],

    DISC_PATTERNS: [
        "disc", "cd", "media", "vinyl"
    ],

    COVER_PATTERNS: [
        "cover", "front", "folder", "albumart", "album", "artwork", "art", "front cover"
    ],

    EXTENSIONS: [".png", ".jpg", ".jpeg", ".webp", ".bmp"],

    // Last.fm JSON filenames to scan for local artwork
    JSON_ART_FILES: [
        "lastfm_artist_getSimilar.json",
        "lastfm_album_getInfo.json",
        "lastfm_track_getInfo.json",
        "lastfm.json"
    ],

    // Overlay effect defaults
    OVERLAY: {
        REFLECTION_HEIGHT_RATIO: 0.45,
        SCANLINE_SPACING: 3,
        GLOW_ART_STEPS: 30,
        GLOW_ART_MULT: 0.05
    },

    PHOSPHOR_THEMES: [
        { name: "Classic",  color: 0x00FF00 },
        { name: "Neo",      color: 0x00FFFF },
        { name: "Dark",     color: 0x00C800 },
        { name: "Bright",   color: 0xFFFF00 },
        { name: "Retro",    color: 0x00FF64 },
        { name: "Minimal",  color: 0x00B400 },
        { name: "Matrix",   color: 0x00FF32 },
        { name: "Vapor",    color: 0xFFB4FF },
        { name: "Cyber",    color: 0x00FFFF },
        { name: "Magenta",  color: 0xFF00FF }
    ],

    INTERPOLATION_MODES: [
        { name: "Nearest Neighbor (Fastest)", value: 0 },
        { name: "Low Quality", value: 1 },
        { name: "Bilinear", value: 2 }
    ],

    DISC_SIZE_PRESETS: [
        { name: "Small (125px)", value: 125 },
        { name: "Medium (250px)", value: 250 },
        { name: "Large (500px)", value: 500 },
        { name: "XL (750px)", value: 750 },
        { name: "XXL (1000px)", value: 1000 }
    ],

    SPEED_PRESETS: [
        { name: "Slow (1.0x)", value: 1.0 },
        { name: "Normal (2.0x)", value: 2.0 },
        { name: "Fast (3.0x)", value: 3.0 }
    ],

    IMAGE_TYPE: {
        REAL_DISC: 0,
        ALBUM_ART: 1,
        DEFAULT_DISC: 2
    }
});

const _clampedSpeed = Math.max(CONFIG.MIN_SPIN_SPEED,
    Math.min(CONFIG.MAX_SPIN_SPEED, props.spinSpeed.value));
if (_clampedSpeed !== props.spinSpeed.value) props.spinSpeed.value = _clampedSpeed;

const _clampedSize = Math.max(CONFIG.MIN_DISC_SIZE,
    Math.min(CONFIG.MAX_DISC_SIZE, props.maxImageSize.value));
if (_clampedSize !== props.maxImageSize.value) props.maxImageSize.value = _clampedSize;

// ====================== RUNTIME STATE ======================
let readyTimer = null;

// ====================== SLIDER CONSTANTS ======================
const SLIDER_MIN_WIDTH   = 220;   // Minimum bar width in px
const SLIDER_WIDTH_RATIO = 0.6;   // Bar width as fraction of panel width
const SLIDER_HEIGHT      = 6;     // Bar height in px
const SLIDER_STEP        = 5;     // Opacity change per wheel tick

// ====================== REPAINT HELPER ======================
const RepaintHelper = {
    full() {
        window.Repaint();
    },

    region(x, y, w, h) {
        if (w > 0 && h > 0) {
            window.RepaintRect(x, y, w, h);
        } else {
            window.Repaint();
        }
    },

    disc() {
        const pc = State.paintCache;
        if (pc.valid && pc.discSize > 0) {
            this.region(pc.discX - 10, pc.discY - 10, pc.discSize + 20, pc.discSize + 20);
            return;
        }
        const pad = P.padding;
        const border = P.borderSize;
        const w = window.Width;
        const h = window.Height;
        const discSize = Math.min(w, h) - (pad + border) * 2;
        const x = Math.floor((w - discSize) / 2);
        const y = Math.floor((h - discSize) / 2);
        this.region(x - 10, y - 10, discSize + 20, discSize + 20);
    },

    background() {
        this.full(); // Background affects whole panel
    }
};

const DISC_CUSTOM_THEME_INDEX = CONFIG.PHOSPHOR_THEMES.length;

// ====================== PROPERTY SHORTCUTS ======================
const P = {
    get spinningEnabled() { return props.spinningEnabled.enabled; },
    get spinSpeed() { return props.spinSpeed.value; },
    get useAlbumArtOnly() { return props.useAlbumArtOnly.enabled; },
    get keepAspectRatio() { return props.keepAspectRatio.enabled; },
    get interpolationMode() { return props.interpolationMode.value; },
    get maxImageSize() { return props.maxImageSize.value; },
    get savedPath() { return props.savedPath.value; },
    get maskType() { return props.maskType.value; },
    get userOverrideMask() { return props.userOverrideMask.enabled; },

    get showReflection() { return props.showReflection.enabled; },
    get opReflection() { return props.opReflection.value; },
    get showGlow() { return props.showGlow.enabled; },
    get opGlow() { return props.opGlow.value; },
    get showScanlines() { return props.showScanlines.enabled; },
    get opScanlines() { return props.opScanlines.value; },
    get showPhosphor() { return props.showPhosphor.enabled; },
    get opPhosphor() { return props.opPhosphor.value; },
    get phosphorTheme() { return props.phosphorTheme.value; },
    get customPhosphorColor() { return props.customPhosphorColor.value; },
    get overlayAllOff() { return props.overlayAllOff.enabled; },

    get borderSize() { return props.borderSize.value; },
    get borderColor() { return props.borderColor.value; },
    get padding() { return props.padding.value; },

    get backgroundEnabled() { return props.backgroundEnabled.enabled; },
    get blurRadius() { return props.blurRadius.value; },
    get blurEnabled() { return props.blurEnabled.enabled; },
    get darkenValue() { return props.darkenValue.value; },
    get customBackgroundColor() { return props.customBackgroundColor.value; },
    get bgUseUIColor() { return props.bgUseUIColor.enabled; }
};

// ====================== UTILITIES ======================
const Utils = {
    safeDispose(obj) {
        if (obj && typeof obj.Dispose === 'function') {
            try {
                obj.Dispose();
            } catch (e) {}
        }
    },

    sanitizeFilename(str) {
        return str ? _fbSanitise(str) : "";
    },

    getImageType(path) {
        if (!path) return null;
        if (path === CONFIG.PATHS.DEFAULT_DISC) return CONFIG.IMAGE_TYPE.DEFAULT_DISC;

        const pathLower = path.toLowerCase();

        for (let pattern of CONFIG.DISC_PATTERNS) {
            if (pathLower.includes(pattern)) {
                return CONFIG.IMAGE_TYPE.REAL_DISC;
            }
        }

        return CONFIG.IMAGE_TYPE.ALBUM_ART;
    },

    detectMaskFromPath(path) {
        if (!path) return null;

        const pathLower = path.toLowerCase();

        if (pathLower.includes("vinyl")) {
            return 1;
        }

        if (pathLower.includes("disc") || pathLower.includes("cd")) {
            return 0;
        }

        return null;
    },

    getPanelDiscSize() {
        const w = window.Width;
        const h = window.Height;

        if (w <= 0 || h <= 0) {
            return props.maxImageSize.value;
        }

        const pad = P.padding;
        const border = P.borderSize;
        const totalInset = pad + border;
        const availW = w - (totalInset * 2);
        const availH = h - (totalInset * 2);
        const calculatedSize = Math.floor(Math.min(availW, availH) * CONFIG.DISC_SCALE_FACTOR);
        return Math.min(calculatedSize, props.maxImageSize.value);
    }
};

function DiscSpin_SetAlpha(col, a) {
    return ((col & 0x00FFFFFF) | (a << 24)) >>> 0;
}

const DS_BLACK = _RGB(0,   0,   0);
const DS_WHITE = _RGB(255, 255, 255);

// ====================== LRU CACHE ======================
class LRUCache {
    constructor(maxSize, autoDispose = true) {
        this.maxSize     = maxSize;
        this.autoDispose = autoDispose;  // set false for non-GDI value caches
        this.cache       = new Map();
    }

    _dispose(value) {
        if (this.autoDispose) Utils.safeDispose(value);
    }

    get(key) {
        const value = this.cache.get(key);
        if (value === undefined) return null;

        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }

    set(key, value) {
        if (this.cache.has(key)) {
            const existing = this.cache.get(key);
            if (existing !== value) {
                this._dispose(existing);
            }
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            const firstVal = this.cache.get(firstKey);
            if (firstVal !== value) this._dispose(firstVal);
            this.cache.delete(firstKey);
        }

        this.cache.set(key, value);
    }

    has(key) {
        return this.cache.has(key);
    }

    clear() {
        this.cache.forEach(item => this._dispose(item));
        this.cache.clear();
    }
}

// ====================== FILE MANAGER ======================
// Single FSO instance — creating ActiveXObject on every subfolder scan is costly.
const _fso = (function() {
    try { return new ActiveXObject('Scripting.FileSystemObject'); } catch (e) { return null; }
})();

const FileManager = {
    cache: new Map(),
    subfolderCache: new Map(),

    exists(path) {
        if (!path) return false;
        if (this.cache.has(path)) return this.cache.get(path);

        const exists = _isFile(path);
        this.cache.set(path, exists);

        if (this.cache.size >= CONFIG.MAX_FILE_CACHE) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }

        return exists;
    },

    isDirectory(path) {
        return path ? _isFolder(path) : false;
    },

    // Strip brackets, special chars and normalise for fuzzy matching
    sanitizeMetadata(str) {
        if (!str) return "";
        let s = str;
        s = s.replace(/\[.*?\]/g, '');
        s = s.replace(/\(.*?\)/g, '');
        s = s.replace(/\{.*?\}/g, '');
        s = s.replace(/<.*?>/g, '');
        s = s.replace(/^(The|A|An)\s+/i, '');
        s = s.replace(/[^\w\s\-]/g, ' ');
        s = s.replace(/_/g, ' ');
        s = s.replace(/\s+/g, ' ');
        return _.trim(s);
    },

    // Build multiple naming variations for robust folder matching
    createSearchVariations(str) {
        if (!str) return [];
        const cleaned = this.sanitizeMetadata(str);
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
        if (this.subfolderCache.has(folder)) {
            return this.subfolderCache.get(folder);
        }

        const subfolders = [];

        if (!this.isDirectory(folder)) {
            this.subfolderCache.set(folder, subfolders);
            return subfolders;
        }

        try {
            if (!_fso || !_fso.FolderExists(folder)) {
                this.subfolderCache.set(folder, subfolders);
                return subfolders;
            }
            const folderObj = _fso.GetFolder(folder);
            const subFoldersEnum = new Enumerator(folderObj.SubFolders);

            for (; !subFoldersEnum.atEnd(); subFoldersEnum.moveNext()) {
                subfolders.push(subFoldersEnum.item().Path);
            }
        } catch (e) {
            console.log('DiscSpin: getSubfolders error for "' + folder + '":', e);
        }

        this.subfolderCache.set(folder, subfolders);

        if (this.subfolderCache.size >= CONFIG.MAX_FILE_CACHE) {
            const firstKey = this.subfolderCache.keys().next().value;
            this.subfolderCache.delete(firstKey);
        }

        return subfolders;
    },

    invalidateSubfolderCache() {
        this.subfolderCache.clear();
    },

    enumSubfolders(folder, depth = 0, maxDepth = CONFIG.MAX_SUBFOLDER_DEPTH) {
        const folders = [folder];
        if (depth >= maxDepth || !this.isDirectory(folder)) return folders;

        _.forEach(this.getSubfolders(folder), sub => {
            folders.push(...this.enumSubfolders(sub, depth + 1, maxDepth));
        });

        return folders;
    },

    buildSearchPaths(folder, patterns, metadataNames = [], useVariations = false) {
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
        _.forEach(allPatterns, pattern => {
            _.forEach(CONFIG.EXTENSIONS, ext => paths.push(folder + "\\" + pattern + ext));
        });
        return paths;
    },

    findImageInPaths(paths) {
        return _.find(paths, p => this.exists(p)) || null;
    },

    // Fuzzy folder name matching using sanitized + variation comparisons
    matchesFolderName(folderPath, searchNames) {
        if (!folderPath || _.isEmpty(searchNames)) return false;

        const folderName = _.toLower(this.sanitizeMetadata(_.last(folderPath.split('\\'))));

        return _.some(searchNames, name => {
            if (!name) return false;
            const n = _.toLower(this.sanitizeMetadata(name));
            if (folderName === n || folderName.includes(n) || n.includes(folderName)) {
                return true;
            }
            // Check first letter match (for folders like "a", "b", "c")
            if (folderName.length === 1 && n.length > 0) {
                if (n.charAt(0) === folderName) return true;
            }
            if (n.length === 1 && folderName.length > 0) {
                if (folderName.charAt(0) === n) return true;
            }
            return false;
        });
    },

    // Parse a Last.fm JSON file and trigger local artwork search
    parseLastFmJson(jsonPath, baseFolder) {
        try {
            if (!_isFile(jsonPath)) return null;
            const content = utils.ReadUTF8(jsonPath);
            if (!content) return null;
            const data = JSON.parse(content);
            if (!data || !_.isObject(data)) return null;

            const fname = _.toLower(jsonPath.split('\\').pop());
            const isLastFm = _.includes(fname, 'lastfm') ||
                             (data.similarartists && data.similarartists.artist) ||
                             (data.url && _.isString(data.url) && _.includes(data.url, 'last.fm'));

            if (!isLastFm) return null;

            const paths = this.buildSearchPaths(baseFolder, CONFIG.COVER_PATTERNS, []);
            return this.findImageInPaths(paths);
        } catch (e) {
            return null;
        }
    },

    // Check folder for any Last.fm JSON file and return local artwork path
    searchLastFmJson(folder) {
        for (const jsonFile of CONFIG.JSON_ART_FILES) {
            const result = this.parseLastFmJson(folder + '\\' + jsonFile, folder);
            if (result) return result;
        }
        return null;
    },

    clear() {
        this.cache.clear();
        this.subfolderCache.clear();
    }
};

// Title-case helper — hoisted to avoid re-creating on each searchCustomFolders call.
function _toTitleCase(str) {
    return str.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());
}

// ====================== CUSTOM FOLDERS MANAGER ======================
const CustomFolders = {
    folders: [],

    load() {
        const saved = window.GetProperty("RP.CustomFolders", "");
        if (!saved) {
            this.folders = [];
            return;
        }
        // _jsonParse returns [] on parse failure; guard against non-array JSON
        // (e.g. someone manually set the property to a number or null).
        const parsed = _jsonParse(saved);
        this.folders = _.isArray(parsed)
            ? _.filter(parsed, f => _.isString(f) && f.length > 0)
            : [];
    },

    save() {
        try {
            window.SetProperty("RP.CustomFolders", JSON.stringify(this.folders));
        } catch (e) {}
    },

    add(folder) {
        if (!folder || !FileManager.isDirectory(folder)) return false;

        if (this.folders.indexOf(folder) !== -1) return false;

        if (this.folders.length >= CONFIG.MAX_CUSTOM_FOLDERS) {
            this.folders.shift();
        }

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

    clear() {
        this.folders = [];
        this.save();
    },

    getAll() {
        return [...this.folders];
    }
};

// ====================== ASSET MANAGER ======================
const AssetManager = {
    maskSource: null,
    rimSource: null,
    maskCache: new LRUCache(CONFIG.MAX_MASK_CACHE),
    rimCache: new LRUCache(CONFIG.MAX_RIM_CACHE),
    currentMaskType: 0,
    userOverrideMask: false,

    init() {
        this.currentMaskType = props.maskType.value;
        this.userOverrideMask = props.userOverrideMask.enabled;
        this.loadMask();
        this.loadRim();
    },

    loadMask() {
        Utils.safeDispose(this.maskSource);
        this.maskSource = null;
        this.maskCache.clear();

        const maskType = CONFIG.MASK_TYPES[this.currentMaskType];
        if (!maskType || !maskType.file) return;

        const maskPath = CONFIG.PATHS.SKINS_DIR + maskType.file;

        try {
            if (FileManager.exists(maskPath)) {
                this.maskSource = gdi.Image(maskPath);
            }
        } catch (e) {}
    },

    loadRim() {
        try {
            if (FileManager.exists(CONFIG.PATHS.RIM)) {
                this.rimSource = gdi.Image(CONFIG.PATHS.RIM);
            }
        } catch (e) {}
    },

    setMaskType(index, isUserOverride = true, forceReload = false) {
        if (index === this.currentMaskType && !forceReload) return false;

        this.currentMaskType = index;
        this.userOverrideMask = isUserOverride;

        props.maskType.value = index;
        props.userOverrideMask.enabled = isUserOverride;

        this.loadMask();
        return true;
    },

    autoSelectMask(imagePath) {
        if (this.userOverrideMask) return false;

        const detectedMask = Utils.detectMaskFromPath(imagePath);
        if (detectedMask !== null && detectedMask !== this.currentMaskType) {
            return this.setMaskType(detectedMask, false);
        }

        return false;
    },

    hasMask() {
        return this.maskSource !== null;
    },

    shouldShowRim(imageType) {
        return imageType === CONFIG.IMAGE_TYPE.ALBUM_ART &&
               this.currentMaskType === 0 &&
               this.hasMask();
    },

    getMask(size) {
        if (!this.maskSource) return null;

        const key = size.toString();
        let cached = this.maskCache.get(key);
        if (cached) return cached;

        try {
            const resized = this.maskSource.Resize(size, size);
            this.maskCache.set(key, resized);
            return resized;
        } catch (e) {
            return null;
        }
    },

    getRim(size) {
        if (!this.rimSource) return null;

        const key = size.toString();
        let cached = this.rimCache.get(key);
        if (cached) return cached;

        try {
            const resized = this.rimSource.Resize(size, size);
            this.rimCache.set(key, resized);
            return resized;
        } catch (e) {
            return null;
        }
    },

    cleanup() {
        this.maskCache.clear();
        this.rimCache.clear();
        Utils.safeDispose(this.maskSource);
        Utils.safeDispose(this.rimSource);
    }
};

// ====================== IMAGE PROCESSOR ======================
const ImageProcessor = {
    scaleToSquare(raw, targetSize, interpolationMode, imageType) {
        if (!raw) return null;

        const w = raw.Width;
        const h = raw.Height;

        // Dimensions already match — return a clone so callers can safely dispose the return value
        // without risk of double-disposing the original.
        if (w === targetSize && h === targetSize) {
            try {
                const cloned = raw.Clone(0, 0, w, h);
                // raw was loaded by the caller solely for processing — dispose it now
                // that we have an independent clone, so it doesn't leak.
                Utils.safeDispose(raw);
                return cloned;
            } catch (e) {
                return raw;
            }
        }

        try {
            const newImg = gdi.CreateImage(targetSize, targetSize);
            let g = null;
            try {
                g = newImg.GetGraphics();
                g.SetInterpolationMode(interpolationMode);

                if (AssetManager.hasMask() && imageType === CONFIG.IMAGE_TYPE.ALBUM_ART) {
                    g.FillSolidRect(0, 0, targetSize, targetSize, 0xFF000000);
                }

                const scale = targetSize / Math.min(w, h);
                const scaledW = Math.floor(w * scale);
                const scaledH = Math.floor(h * scale);
                const offsetX = Math.floor((targetSize - scaledW) / 2);
                const offsetY = Math.floor((targetSize - scaledH) / 2);

                g.DrawImage(raw, offsetX, offsetY, scaledW, scaledH, 0, 0, w, h);
            } finally {
                if (g) { try { newImg.ReleaseGraphics(g); } catch (e2) {} }
            }
            // Only dispose raw after newImg is fully built and graphics released.
            Utils.safeDispose(raw);
            return newImg;
        } catch (e) {
            // Do NOT dispose raw here — caller still owns it and must handle cleanup.
            return null;
        }
    },

    scaleProportional(raw, maxSize, interpolationMode) {
        if (!raw) return null;

        const w = raw.Width;
        const h = raw.Height;
        const maxDim = Math.max(w, h);

        if (maxDim <= maxSize) {
            // Return a clone so callers can safely dispose the result independently.
            try {
                const cloned = raw.Clone(0, 0, w, h);
                Utils.safeDispose(raw);
                return cloned;
            } catch (e) {
                return raw;
            }
        }

        try {
            const scale = maxSize / maxDim;
            const nw = Math.floor(w * scale);
            const nh = Math.floor(h * scale);

            const newImg = gdi.CreateImage(nw, nh);
            let g = null;
            try {
                g = newImg.GetGraphics();
                g.SetInterpolationMode(interpolationMode);
                g.DrawImage(raw, 0, 0, nw, nh, 0, 0, w, h);
            } finally {
                if (g) { try { newImg.ReleaseGraphics(g); } catch (e2) {} }
            }
            // Only dispose raw after newImg is fully built and graphics released.
            Utils.safeDispose(raw);
            return newImg;
        } catch (e) {
            // Do NOT dispose raw here — caller still owns it.
            return null;
        }
    },

    applyMask(image, size) {
        if (!image) return null;

        try {
            const clone = image.Clone(0, 0, image.Width, image.Height);
            const mask = AssetManager.getMask(size);

            if (mask) {
                clone.ApplyMask(mask);
            }

            Utils.safeDispose(image);
            return clone;
        } catch (e) {
            return image;
        }
    },

    processForDisc(raw, targetSize, imageType, interpolationMode) {
        if (!raw) return null;

        let processed = this.scaleToSquare(raw, targetSize, interpolationMode, imageType);
        // scaleToSquare either consumed raw (success) or left raw untouched (failure/null).
        // On failure raw is still valid — dispose it so we don't leak.
        if (!processed) {
            Utils.safeDispose(raw);
            return null;
        }

        const shouldMask = AssetManager.hasMask() &&
                          (imageType === CONFIG.IMAGE_TYPE.REAL_DISC ||
                           imageType === CONFIG.IMAGE_TYPE.ALBUM_ART);

        if (shouldMask) {
            processed = this.applyMask(processed, targetSize);
        }

        return processed;
    }
};

// ====================== STATE MANAGER ======================
const State = {
    img: null,
    bgImg: null,
    _bgIdCounter: 0,
    angle: 0,
    isDiscImage: false,
    imageType: CONFIG.IMAGE_TYPE.REAL_DISC,
    currentMetadb: null,
    loadToken: 0,        // Incremented on each new load request
    pendingArtToken: 0, // Token when async art request was made

    spinTimer: null,
    loadTimer: null,

    paintCache: {
        bgColor: _getUIColour(),
        windowWidth: 0,
        windowHeight: 0,
        discSize: 0,
        discX: 0,
        discY: 0,
        staticW: 0,
        staticH: 0,
        staticX: 0,
        staticY: 0,
        imgWidth: 0,
        imgHeight: 0,
        keepAspectRatio: true,
        padding:    0,
        borderSize: 0,
        valid: false
    },

    setImage(newImg, discState, imgType, originalImg) {
        const oldImg   = this.img;
        const oldBgImg = this.bgImg;

        this.img     = newImg;
        this.bgImg   = originalImg;
        if (this.bgImg && this.bgImg._bgId === undefined) {
            this.bgImg._bgId = ++State._bgIdCounter;
        }
        this.isDiscImage = discState;
        this.imageType   = imgType;
        this.paintCache.valid = false;
        BackgroundCache.invalidate();
        OverlayCache.invalidate();

        // Dispose old bitmaps only if they are not being reused.
        if (oldImg && oldImg !== newImg && oldImg !== originalImg) {
            Utils.safeDispose(oldImg);
        }
        // oldBgImg may equal oldImg — only dispose it if it's a distinct object
        // that isn't being reused, and wasn't already disposed above.
        if (oldBgImg &&
            oldBgImg !== oldImg &&
            oldBgImg !== newImg &&
            oldBgImg !== originalImg) {
            Utils.safeDispose(oldBgImg);
        }

        if (discState && newImg) {
            const size = Utils.getPanelDiscSize();
            DiscComposite.build(newImg, size, imgType);
        } else {
            DiscComposite.dispose();
        }

        RepaintHelper.full();
    },

    updatePaintCache() {
        const w = window.Width;
        const h = window.Height;
        const pc = this.paintCache;
        const pad = P.padding;
        const border = P.borderSize;

        if (pc.valid &&
            pc.windowWidth === w &&
            pc.windowHeight === h &&
            pc.imgWidth === (this.img ? this.img.Width : 0) &&
            pc.imgHeight === (this.img ? this.img.Height : 0) &&
            pc.keepAspectRatio === P.keepAspectRatio &&
            pc.padding === pad &&
            pc.borderSize === border) {
            return;
        }

        pc.windowWidth = w;
        pc.windowHeight = h;
        pc.keepAspectRatio = P.keepAspectRatio;
        pc.padding = pad;
        pc.borderSize = border;

        if (this.img) {
            pc.imgWidth = this.img.Width;
            pc.imgHeight = this.img.Height;

            const totalInset = pad + border;
            const availW = w - (totalInset * 2);
            const availH = h - (totalInset * 2);

            if (this.isDiscImage) {
                const size   = Math.floor(Math.min(availW, availH) * CONFIG.DISC_SCALE_FACTOR);
                pc.discSize  = size;
                pc.discX     = Math.floor((w - size) / 2);
                pc.discY     = Math.floor((h - size) / 2);
            } else {
                let sw = availW, sh = availH, sx = totalInset, sy = totalInset;

                if (P.keepAspectRatio) {
                    const ratio = Math.min(availW / this.img.Width, availH / this.img.Height);
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
            // No image — reset computed dimensions so stale values are never used.
            pc.imgWidth  = 0;
            pc.imgHeight = 0;
            pc.discSize  = 0;
            pc.staticW   = 0;
            pc.staticH   = 0;
            // Leave pc.valid = false so next paint recomputes once img arrives.
        }
    },

    cleanup() {
        this.stopTimer();
        if (this.loadTimer) {
            window.ClearTimeout(this.loadTimer);
            this.loadTimer = null;
        }
        const img   = this.img;
        const bgImg = this.bgImg;
        this.img    = null;
        this.bgImg  = null;
        Utils.safeDispose(img);
        if (bgImg && bgImg !== img) {
            Utils.safeDispose(bgImg);
        }
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
                         !fb.IsPaused &&
                         !P.useAlbumArtOnly;

        if (shouldRun && !this.spinTimer) {
            this.spinTimer = window.SetInterval(() => {
                this.angle = (this.angle + P.spinSpeed) % CONFIG.ANGLE_MODULO;
                RepaintHelper.disc();
            }, CONFIG.TIMER_INTERVAL);
        } else if (!shouldRun && this.spinTimer) {
            this.stopTimer();
        }
    }
};

// ====================== IMAGE LOADER ======================
const ImageLoader = {
    cache: new LRUCache(CONFIG.MAX_CACHE_ENTRIES),
    _pathCache: new Map(),
    tf_path: fb.TitleFormat("$directory_path(%path%)"),
    tf_folder: fb.TitleFormat("$directory(%path%)"),
    tf_artist: fb.TitleFormat("%artist%"),
    tf_album: fb.TitleFormat("%album%"),
    tf_title: fb.TitleFormat("%title%"),
    
    clearCache() {
        this._pathCache.clear();
    },

    loadCached(path, imageType) {
        const targetSize = Utils.getPanelDiscSize();
        const key = `${path}|${targetSize}|${imageType}|${AssetManager.currentMaskType}`;

        const cached = this.cache.get(key);
        if (cached) {
            try {
                return cached.Clone(0, 0, cached.Width, cached.Height);
            } catch (e) {
                // Stale / already-disposed entry — fall through and reload from disk.
            }
        }

        if (!FileManager.exists(path)) return null;

        try {
            let raw = gdi.Image(path);
            if (!raw) return null;

            const processed = ImageProcessor.processForDisc(
                raw,
                targetSize,
                imageType,
                P.interpolationMode
            );

            if (processed) {
                // Store template in LRU; give the caller an independent clone.
                this.cache.set(key, processed);
                try {
                    return processed.Clone(0, 0, processed.Width, processed.Height);
                } catch (e) {
                    return null;
                }
            }

            return null;
        } catch (e) {
            return null;
        }
    },

    getMetadataNames(metadb) {
        const artist = this.tf_artist.EvalWithMetadb(metadb);
        const album = this.tf_album.EvalWithMetadb(metadb);
        const title = this.tf_title.EvalWithMetadb(metadb);
        const folder = this.tf_folder.EvalWithMetadb(metadb);

        const artistTitle = (artist && title) ? `${artist} - ${title}` : "";
        const artistAlbum = (artist && album) ? `${artist} - ${album}` : "";

        return {
            artist: artist,
            album: album,
            title: title,
            folder: folder,
            artistTitle: artistTitle,
            artistAlbum: artistAlbum
        };
    },

    searchInFolder(folder, patterns, metadata, useVariations = false) {
        const artistTitle = (metadata.artist && metadata.title) 
            ? metadata.artist + ' - ' + metadata.title 
            : '';
        const albumTitle = (metadata.album && metadata.title) 
            ? metadata.album + ' - ' + metadata.title 
            : '';
        const artistAlbumTitle = (metadata.artist && metadata.album && metadata.title)
            ? metadata.artist + ' ' + metadata.album + ' ' + metadata.title
            : '';
        
        const metadataNames = _.compact([
            metadata.album, metadata.title, metadata.artist,
            metadata.folder, metadata.artistTitle, metadata.artistAlbum,
            artistTitle, albumTitle, artistAlbumTitle
        ]);
        const paths = FileManager.buildSearchPaths(folder, patterns, metadataNames, useVariations);
        return FileManager.findImageInPaths(paths);
    },

    searchInFolderAnyFile(folder, patterns) {
        const paths = FileManager.buildSearchPaths(folder, patterns, []);
        return FileManager.findImageInPaths(paths);
    },

    // Search a folder tree up to maxLevels deep for any image file
    _searchFolderTree(folder, patterns, maxLevels, isDiscSearch, metadata) {
        if (maxLevels <= 0 || !folder) return null;

        // First check current folder
        const found = this.searchFolderForImage(folder, patterns, isDiscSearch, metadata);
        if (found) return found;

        // Then check subfolders up to maxLevels
        const subfolders = FileManager.getSubfolders(folder);
        for (const sub of subfolders) {
            const result = this._searchFolderTree(sub, patterns, maxLevels - 1, isDiscSearch, metadata);
            if (result) return result;
        }

        return null;
    },

    // Custom folder search - simplified
    searchCustomFolders(metadata, patterns, isDiscSearch) {
        const artistAlbumDash  = metadata.artistAlbum || '';
        const artistAlbumSpace = (metadata.artist && metadata.album)
            ? metadata.artist + ' ' + metadata.album
            : '';
        
        const simpleNames = _.compact([
            metadata.title,
            metadata.artist,
            metadata.album,
            artistAlbumDash,
            artistAlbumSpace
        ]);
        
        const nameVariations = [];
        _.forEach(simpleNames, (name) => {
            if (name) {
                const lower = name.toLowerCase();
                nameVariations.push(lower);
                nameVariations.push(lower.replace(/\s+/g, '-'));
                nameVariations.push(lower.replace(/\s+/g, '_'));

                const title = _toTitleCase(name);
                nameVariations.push(title);
                nameVariations.push(title.replace(/\s+/g, '-'));
                nameVariations.push(title.replace(/\s+/g, '_'));
            }
        });
        const folderMatchNames = _.uniq(nameVariations);
        
        const customFolders = CustomFolders.getAll();
        
        for (const customFolder of customFolders) {
            if (!FileManager.isDirectory(customFolder)) continue;
            
            const nameMatched = this.searchInFolder(customFolder, patterns, metadata, true);
            if (nameMatched) {
                if (isDiscSearch) return this._loadDiscResult(nameMatched);
                return nameMatched;
            }
        }
        
        for (const customFolder of customFolders) {
            if (!FileManager.isDirectory(customFolder)) continue;
            
            const level1 = FileManager.getSubfolders(customFolder);
            for (const sub1 of level1) {
                const sub1Name = _.last(sub1.split('\\')).toLowerCase();
                const match1 = folderMatchNames.some(n => 
                    sub1Name === n || sub1Name.includes(n) || n.includes(sub1Name) ||
                    sub1Name.replace(/\s+/g, '-') === n ||
                    sub1Name.replace(/\s+/g, '_') === n
                );
                
                if (match1) {
                    const img = this.searchInFolder(sub1, patterns, metadata, true)
                             || this.searchInFolderAnyFile(sub1, patterns);
                    if (img) {
                        if (isDiscSearch) return this._loadDiscResult(img);
                        return img;
                    }
                    
                    const sub1Folders = FileManager.getSubfolders(sub1);
                    for (const subSub of sub1Folders) {
                        const sImg = this.searchInFolder(subSub, patterns, metadata, true)
                                  || this.searchInFolderAnyFile(subSub, patterns);
                        if (sImg) {
                            if (isDiscSearch) return this._loadDiscResult(sImg);
                            return sImg;
                        }
                    }
                }
                
                const level2 = FileManager.getSubfolders(sub1);
                for (const sub2 of level2) {
                    const sub2Name = _.last(sub2.split('\\')).toLowerCase();
                    const match2 = folderMatchNames.some(n => 
                        sub2Name === n || sub2Name.includes(n) || n.includes(sub2Name) ||
                        sub2Name.replace(/\s+/g, '-') === n ||
                        sub2Name.replace(/\s+/g, '_') === n
                    );
                    
                    if (match2) {
                        const img = this.searchInFolder(sub2, patterns, metadata, true)
                                 || this.searchInFolderAnyFile(sub2, patterns);
                        if (img) {
                            if (isDiscSearch) return this._loadDiscResult(img);
                            return img;
                        }
                    }
                }
            }
        }
        
        return null;
    },

    _loadDiscResult(imagePath) {
        let raw = null;
        let original = null;
        try {
            raw = gdi.Image(imagePath);
        } catch (e) {
            console.log('DiscSpin: _loadDiscResult gdi.Image failed for "' + imagePath + '":', e);
            return null;
        }
        if (!raw) return null;

        try {
            original = raw.Clone(0, 0, raw.Width, raw.Height);
        } catch (e) {
            Utils.safeDispose(raw);
            return null;
        }

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
        if (jsonArt) {
            if (isDiscSearch) return this._loadDiscResult(jsonArt);
            return jsonArt;
        }

        const meta = metadata || { artist: '', album: '', title: '', folder: '', artistTitle: '', artistAlbum: '' };
        const found = this.searchInFolder(folder, patterns, meta, true)
                   || this.searchInFolderAnyFile(folder, patterns);
        if (!found) return null;
        if (isDiscSearch) return this._loadDiscResult(found);
        return found;
    },

    searchForDisc(metadb, baseFolder) {
        const cacheKey = 'disc:' + baseFolder;
        if (this._pathCache.has(cacheKey)) {
            const cached = this._pathCache.get(cacheKey);
            if (!cached) return null;   // explicitly-cached miss — no disc art for this folder
            return this._loadDiscResult(cached.path);
        }

        const metadata = metadb ? this.getMetadataNames(metadb) : { artist:'', album:'', title:'', folder:'', artistTitle:'', artistAlbum:'' };

        // PHASE 1A: Track folder for metadata-named files (exact match)
        const trackFolderMatch = this.searchInFolder(baseFolder, CONFIG.DISC_PATTERNS, metadata);
        if (trackFolderMatch) {
            const result = this._loadDiscResult(trackFolderMatch);
            if (result) {
                AssetManager.autoSelectMask(trackFolderMatch);
                this._pathCache.set(cacheKey, { path: trackFolderMatch, type: CONFIG.IMAGE_TYPE.REAL_DISC });
                return result;
            }
        }

        // PHASE 1B: Track folder for any image file
        const trackAnyMatch = this.searchInFolderAnyFile(baseFolder, CONFIG.DISC_PATTERNS);
        if (trackAnyMatch) {
            const result = this._loadDiscResult(trackAnyMatch);
            if (result) {
                AssetManager.autoSelectMask(trackAnyMatch);
                this._pathCache.set(cacheKey, { path: trackAnyMatch, type: CONFIG.IMAGE_TYPE.REAL_DISC });
                return result;
            }
        }

        // PHASE 1C: Track folder subfolders (up to 2 levels deep) for any image file
        const trackSubMatch = this._searchFolderTree(baseFolder, CONFIG.DISC_PATTERNS, 2, true, metadata);
        if (trackSubMatch) {
            this._pathCache.set(cacheKey, { path: trackSubMatch.path, type: trackSubMatch.type });
            return trackSubMatch;
        }

        // PHASE 2: Custom folders with name matching
        const customResult = this.searchCustomFolders(metadata, CONFIG.DISC_PATTERNS, true);
        if (customResult) {
            this._pathCache.set(cacheKey, { path: customResult.path, type: customResult.type });
            return customResult;
        }
        
        this._pathCache.set(cacheKey, null);
        return null;
    },

    searchForCover(metadb, baseFolder) {
        const cacheKey = 'cover:' + baseFolder;
        if (this._pathCache.has(cacheKey)) {
            return this._pathCache.get(cacheKey);
        }

        const metadata = metadb ? this.getMetadataNames(metadb) : { artist:'', album:'', title:'', folder:'', artistTitle:'', artistAlbum:'' };

        // PHASE 1A: Track folder for metadata-named files (exact match)
        const jsonArt = FileManager.searchLastFmJson(baseFolder);
        if (jsonArt) {
            this._pathCache.set(cacheKey, jsonArt);
            return jsonArt;
        }

        const trackMatch = this.searchInFolder(baseFolder, CONFIG.COVER_PATTERNS, metadata);
        if (trackMatch) {
            this._pathCache.set(cacheKey, trackMatch);
            return trackMatch;
        }

        // PHASE 1B: Track folder for any image file
        const trackAnyMatch = this.searchInFolderAnyFile(baseFolder, CONFIG.COVER_PATTERNS);
        if (trackAnyMatch) {
            this._pathCache.set(cacheKey, trackAnyMatch);
            return trackAnyMatch;
        }

        // PHASE 1C: Track folder subfolders (up to 2 levels deep) for any image file
        const trackSubMatch = this._searchFolderTree(baseFolder, CONFIG.COVER_PATTERNS, 2, false, metadata);
        if (trackSubMatch) {
            this._pathCache.set(cacheKey, trackSubMatch);
            return trackSubMatch;
        }

        // PHASE 2: Custom folders with name matching
        const customResult = this.searchCustomFolders(metadata, CONFIG.COVER_PATTERNS, false);
        if (customResult) {
            this._pathCache.set(cacheKey, customResult);
            return customResult;
        }
        
        this._pathCache.set(cacheKey, null);
        return null;
    },

    loadForMetadb(metadb, immediate = false) {
        if (!metadb) return;

        const folderPath = this.tf_path.EvalWithMetadb(metadb);

        if (!immediate && State.currentMetadb && State.img) {
            const currentFolderPath = this.tf_path.EvalWithMetadb(State.currentMetadb);
            if (currentFolderPath === folderPath) {
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
            // Increment token only here, after the same-folder early-return guard above,
            // so text-only same-folder refreshes don't invalidate an in-flight async response.
            State.loadToken++;

            let bgOriginal = null;
            let coverRaw = null;
            const coverPath = this.searchForCover(metadb, folderPath);
            if (coverPath) {
                try {
                    const _loaded = gdi.Image(coverPath);
                    if (_loaded) {
                        bgOriginal = _loaded.Clone(0, 0, _loaded.Width, _loaded.Height);
                        coverRaw = _loaded;
                    }
                } catch (e) {}
            }

            // PHASE 1: Search track folder for disc art
            if (!P.useAlbumArtOnly) {
                const result = this.searchForDisc(metadb, folderPath);
                if (result) {
                    Utils.safeDispose(coverRaw);
                    let bgSrc;
                    if (bgOriginal) {
                        bgSrc = bgOriginal;
                        Utils.safeDispose(result.original);
                    } else {
                        bgSrc = result.original;
                    }
                    State.setImage(result.img, true, result.type, bgSrc);
                    props.savedPath.value = result.path;
                    props.savedIsDisc.enabled = true;
                    State.updateTimer();
                    if (!bgSrc) {
                        State.pendingArtToken = State.loadToken;
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
                            props.savedPath.value = coverPath;
                            props.savedIsDisc.enabled = false;
                            State.updateTimer();
                            return;
                        }
                        // scaleProportional failed — coverRaw still alive, dispose it.
                        Utils.safeDispose(coverRaw);
                        Utils.safeDispose(bgOriginal);
                    } else {
                        const processed = ImageProcessor.processForDisc(
                            coverRaw, targetSize, CONFIG.IMAGE_TYPE.ALBUM_ART, P.interpolationMode
                        );
                        if (processed) {
                            State.setImage(processed, true, CONFIG.IMAGE_TYPE.ALBUM_ART, bgOriginal);
                            props.savedPath.value = coverPath;
                            props.savedIsDisc.enabled = true;
                            State.updateTimer();
                            return;
                        }
                        // processForDisc already disposed coverRaw internally on failure.
                        Utils.safeDispose(bgOriginal);
                    }
                } catch (e) {
                    Utils.safeDispose(coverRaw);
                    Utils.safeDispose(bgOriginal);
                }
            }

            // PHASE 3: Fallback — async album art
            State.pendingArtToken = State.loadToken;
            utils.GetAlbumArtAsync(window.ID, metadb, 0);
        };

        if (immediate) {
            doLoad();
        } else {
            State.loadTimer = window.SetTimeout(doLoad, CONFIG.LOAD_DEBOUNCE_MS);
        }
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

        // SMP can deliver a null metadb on cancelled/stale requests.
        if (!metadb) {
            if (image) {
                Utils.safeDispose(image);
            } else {

                if (State.pendingArtToken === State.loadToken && State.currentMetadb) {
                    this.loadDefaultDisc();
                    State.updateTimer();
                }
            }
            return;
        }

        const metadbMatches = metadb.Compare(State.currentMetadb);

        if (image) {
            let original;
            try {
                if (!metadbMatches) {
                    Utils.safeDispose(image);
                    return;
                }

                original = image.Clone(0, 0, image.Width, image.Height);
                const targetSize = Utils.getPanelDiscSize();
                if (P.useAlbumArtOnly) {
                    const scaled = ImageProcessor.scaleProportional(
                        image, CONFIG.MAX_STATIC_SIZE, P.interpolationMode
                    );
                    if (scaled) {
                        State.setImage(scaled, false, CONFIG.IMAGE_TYPE.ALBUM_ART, original);
                        if (image_path) props.savedPath.value = image_path;
                    } else {
                        Utils.safeDispose(image);
                        Utils.safeDispose(original);
                    }
                } else {
                    const processed = ImageProcessor.processForDisc(
                        image, targetSize, CONFIG.IMAGE_TYPE.ALBUM_ART, P.interpolationMode
                    );
                    if (processed) {
                        State.setImage(processed, true, CONFIG.IMAGE_TYPE.ALBUM_ART, original);
                        if (image_path) props.savedPath.value = image_path;
                    } else {
                        // processForDisc disposes image internally on failure.
                        Utils.safeDispose(original);
                    }
                }

                RepaintHelper.background();  // always repaint — covers both "new art" and "art replaced previous" cases
                State.updateTimer();
                return;
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
            let raw = gdi.Image(CONFIG.PATHS.DEFAULT_DISC);
            if (!raw) return;

            const targetSize = Utils.getPanelDiscSize();
            const scaled = ImageProcessor.scaleToSquare(
                raw,
                targetSize,
                P.interpolationMode,
                CONFIG.IMAGE_TYPE.DEFAULT_DISC
            );

            if (scaled) {
                // Pass null for original — don't use default disc as background
                State.setImage(scaled, true, CONFIG.IMAGE_TYPE.DEFAULT_DISC, null);
                props.savedPath.value = CONFIG.PATHS.DEFAULT_DISC;
                props.savedIsDisc.enabled = true;
                State.updateTimer();
            } else {

                Utils.safeDispose(raw);
            }
        } catch (e) {}
    },

    cleanup() {
        this.cache.clear();
    }
};

// ====================== DISC COMPOSITE CACHE ======================
const DiscComposite = {
    img: null,
    valid: false,

    invalidate() {
        this.valid = false;
    },

    dispose() {
        if (this.img) {
            try { this.img.Dispose(); } catch (e) {}
            this.img = null;
        }
        this.valid = false;
    },

    // Build composite of disc + rim (if rim should be shown)
    build(discImg, size, imageType) {
        this.dispose();

        if (!discImg || size <= 0) {
            this.valid = true;
            return;
        }

        const showRim = AssetManager.shouldShowRim(imageType);

        if (!showRim) {
            try {
                this.img = discImg.Clone(0, 0, discImg.Width, discImg.Height);
            } catch (e) {
                // Clone failed (stale bitmap handle) — fall through without composite
            }
            this.valid = true;
            return;
        }

        let g = null;
        let gReleased = false;
        try {
            this.img = gdi.CreateImage(size, size);
            g = this.img.GetGraphics();

            g.DrawImage(discImg, 0, 0, size, size, 0, 0, discImg.Width, discImg.Height);
            const rim = AssetManager.getRim(size);
            if (rim) {
                g.DrawImage(rim, 0, 0, size, size, 0, 0, rim.Width, rim.Height);
            }
        } catch (e) {
            // Draw failed — dispose the partial bitmap.
            if (!gReleased && g && this.img) {
                try { this.img.ReleaseGraphics(g); gReleased = true; } catch (e2) {}
            }
            this.dispose();
            this.valid = true;
            return;
        } finally {
            if (!gReleased && g && this.img) {
                try { this.img.ReleaseGraphics(g); } catch (e2) {}
            }
        }
        this.valid = true;
    }
};

// ====================== BACKGROUND CACHE ======================
const BackgroundCache = {
    _lru:       new LRUCache(CONFIG.MAX_BG_CACHE),
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
    },

    ensure(w, h) {
        if (w <= 0 || h <= 0) return;

        const wantBlur = !P.bgUseUIColor && P.backgroundEnabled && P.blurEnabled &&
                         P.blurRadius > 0 && State.bgImg;

        if (!wantBlur) {
            if (this._activeKey !== 'none') {
                this._activeKey = 'none';
                this.img = null;
            }
            return;
        }

        const key = this._makeKey(w, h);
        if (this._activeKey === key) return;

        const cached = this._lru.get(key);
        if (cached) {
            this._activeKey = key;
            this.img = cached;
            return;
        }

        let g = null;
        let newImg = null;
        let gReleased = false;
        try {
            const src = State.bgImg;
            newImg = gdi.CreateImage(w, h);
            g = newImg.GetGraphics();
            g.DrawImage(src, 0, 0, w, h, 0, 0, src.Width, src.Height);
            newImg.ReleaseGraphics(g);
            gReleased = true;               // released — don't release again in finally
            newImg.StackBlur(P.blurRadius);

            this._lru.set(key, newImg);
            newImg = null;                  // ownership transferred to LRU — don't dispose in finally
            this._activeKey = key;
            this.img = this._lru.get(key);
        } catch (e) {
            // Build failed — leave img null so on_paint falls back to flat colour.
            this._activeKey = key;
            this.img = null;
        } finally {
            if (!gReleased && g) {
                try { if (newImg) newImg.ReleaseGraphics(g); } catch (e2) {}
            }
            if (newImg) {
                Utils.safeDispose(newImg);  // only reached when ownership was NOT transferred
            }
        }
    },

    dispose() {
        this._lru.clear();
        this.img = null;
        this._activeKey = '';
    }
};

// ====================== OVERLAY INVALIDATOR ======================
const OverlayInvalidator = (() => {
    let pending = false;
    let _timer  = null;

    return {
        request() {
            if (pending) return;
            pending = true;

            _timer = window.SetTimeout(() => {
                _timer   = null;
                pending  = false;
                OverlayCache.invalidate();
                window.Repaint();
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

// ====================== OVERLAY CACHE ======================
const OverlayCache = {
    img:   null,
    valid: false,

    invalidate() {
        this.valid = false;
    },

    dispose() {
        if (this.img) {
            try { this.img.Dispose(); } catch (e) {}
            this.img = null;
        }
        this.valid = false;
    },

    build(w, h, pc) {
        this.dispose();

        const needsAny = !P.overlayAllOff && (
            (P.showGlow        && P.opGlow > 0)       ||
            (P.showScanlines   && P.opScanlines > 0)  ||
            (P.showReflection  && P.opReflection > 0) ||
            (P.showPhosphor    && P.opPhosphor > 0)
        );

        this.valid = true;
        if (!needsAny || w <= 0 || h <= 0) return;

        let g = null;
        try {
            this.img = gdi.CreateImage(w, h);
            g = this.img.GetGraphics();

            const spacing = CONFIG.OVERLAY.SCANLINE_SPACING;

            // ---- Scanlines (dark rows) ----
            if (P.showScanlines && P.opScanlines > 0) {
                const col = DiscSpin_SetAlpha(DS_BLACK, P.opScanlines);
                for (let y = 0; y < h; y += spacing) {
                    g.FillSolidRect(0, y, w, 1, col);
                }
            }

            // ---- Glow (ellipses around art/image position) ----
            if (P.showGlow && P.opGlow > 0 && pc) {
                const discSz = State.isDiscImage ? pc.discSize : Math.max(pc.staticW, pc.staticH);
                if (discSz > 0) {
                    const op    = P.opGlow;
                    const white = DS_WHITE;
                    const cx = State.isDiscImage ? pc.discX + pc.discSize / 2 : pc.staticX + pc.staticW / 2;
                    const cy = State.isDiscImage ? pc.discY + pc.discSize / 2 : pc.staticY + pc.staticH / 2;
                    const maxR = discSz * 0.75;
                    const steps = CONFIG.OVERLAY.GLOW_ART_STEPS;
                    const mult  = CONFIG.OVERLAY.GLOW_ART_MULT;
                    const minStep = Math.ceil(1 / (op * mult));
                    for (let i = minStep; i < steps; i++) {
                        const progress = i / steps;
                        const alpha = Math.floor(op * progress * mult);
                        if (alpha <= 0) continue;
                        const r = maxR * (1 - progress);
                        g.FillEllipse(cx - r, cy - r, r * 2, r * 2, DiscSpin_SetAlpha(white, alpha));
                    }
                }
            }

            // ---- Reflection (smoothstep gradient from top) ----
            if (P.showReflection && P.opReflection > 0) {
                const reflH = Math.floor(h * CONFIG.OVERLAY.REFLECTION_HEIGHT_RATIO);
                const white = DS_WHITE;
                let lastAlpha = -1;
                let bandStart = 0;
                for (let y = 0; y < reflH; y++) {
                    const t = 1 - (y / reflH);
                    const s = t * t * (3 - 2 * t);
                    const alpha = Math.floor(P.opReflection * s * 0.65);
                    if (alpha !== lastAlpha) {
                        if (lastAlpha > 0 && y > bandStart) {
                            g.FillSolidRect(0, bandStart, w, y - bandStart, DiscSpin_SetAlpha(white, lastAlpha));
                        }
                        lastAlpha = alpha;
                        bandStart = y;
                    }
                }
                if (lastAlpha > 0) {
                    g.FillSolidRect(0, bandStart, w, reflH - bandStart, DiscSpin_SetAlpha(white, lastAlpha));
                }
            }

            // ---- Phosphor (horizontal tint rows) ----
            if (P.showPhosphor && P.opPhosphor > 0) {
                const themeColor = PhosphorManager.getColor();
                const r  = (themeColor >>> 16) & 255;
                const gc = (themeColor >>> 8)  & 255;
                const b  =  themeColor        & 255;
                const col = DiscSpin_SetAlpha(
                    _RGB(
                        Math.floor(r  * 0.5 + 127),
                        Math.floor(gc * 0.5 + 127),
                        Math.floor(b  * 0.5 + 127)
                    ),
                    P.opPhosphor
                );
                for (let y = 1; y < h; y += spacing) {
                    g.FillSolidRect(0, y, w, 1, col);
                }
            }
        } catch (e) {
            // Swallow draw errors — overlay is cosmetic.
        } finally {
            // Always release graphics even if a draw call threw.
            if (g && this.img) {
                try { this.img.ReleaseGraphics(g); } catch (e2) {}
            }
        }
        // If an exception wiped this.img via dispose() called inside catch, valid stays true
        // but img is null — paint code already guards for null img.
    }
};

// ====================== RENDERER ======================
const Renderer = {
    paint(gr) {
        State.updatePaintCache();
        const pc = State.paintCache;

        if (!State.img) return;

        gr.SetInterpolationMode(P.interpolationMode);

        if (!State.isDiscImage) {
            this.paintStatic(gr, pc);
        } else {
            this.paintDisc(gr, pc);
        }
    },

    paintStatic(gr, pc) {
        if (!State.img) return;
        gr.DrawImage(
            State.img,
            pc.staticX, pc.staticY, pc.staticW, pc.staticH,
            0, 0, State.img.Width, State.img.Height
        );
    },

    paintDisc(gr, pc) {
        gr.SetSmoothingMode(CONFIG.SMOOTHING_MODE);

        const size = pc.discSize;
        const x = pc.discX;
        const y = pc.discY;

        if (!DiscComposite.valid && State.img) {
            DiscComposite.build(State.img, Math.floor(size), State.imageType);
        }

        const composite = DiscComposite.valid && DiscComposite.img ? DiscComposite.img : State.img;

        if (composite) {
            gr.DrawImage(
                composite,
                x, y, size, size,
                0, 0, composite.Width, composite.Height,
                State.angle
            );
        }
    },

    drawBorder(gr) {
        if (P.borderSize <= 0) return;

        const w = window.Width;
        const h = window.Height;
        const borderSize = P.borderSize;
        const borderColor = P.borderColor >>> 0;

        try {
            gr.FillSolidRect(0, 0, w, borderSize, borderColor);
            gr.FillSolidRect(0, h - borderSize, w, borderSize, borderColor);
            gr.FillSolidRect(0, borderSize, borderSize, h - borderSize * 2, borderColor);
            gr.FillSolidRect(w - borderSize, borderSize, borderSize, h - borderSize * 2, borderColor);
        } catch (e) {}
    }
};

// ====================== PHOSPHOR MANAGER ======================
let cachedPhosphorColor = null;
let cachedPhosphorTheme = -1;

const PhosphorManager = {
    getColor() {
        if (cachedPhosphorTheme === P.phosphorTheme && cachedPhosphorColor !== null) {
            return cachedPhosphorColor;
        }

        let color;
        if (P.phosphorTheme === DISC_CUSTOM_THEME_INDEX) {
            color = P.customPhosphorColor >>> 0;
        } else {
            const idx = _.clamp(P.phosphorTheme, 0, CONFIG.PHOSPHOR_THEMES.length - 1);
            color = CONFIG.PHOSPHOR_THEMES[idx].color;
        }

        cachedPhosphorTheme = P.phosphorTheme;
        cachedPhosphorColor = color;
        return color;
    },

    invalidateCache() {
        cachedPhosphorColor = null;
        cachedPhosphorTheme = -1;
    },

    setCustomColor() {
        try {
            const picked = utils.ColourPicker(window.ID, props.customPhosphorColor.value);
            if (picked !== -1) {
                props.customPhosphorColor.value = picked;
                props.phosphorTheme.value = DISC_CUSTOM_THEME_INDEX;
                this.invalidateCache();
                OverlayInvalidator.request();
                RepaintHelper.full();
            }
        } catch (e) {}
    }
};

// ====================== PRESET MANAGER ======================
const PresetManager = {
    _capture() {
        return {
            spinningEnabled:     props.spinningEnabled.enabled,
            spinSpeed:           props.spinSpeed.value,
            useAlbumArtOnly:     props.useAlbumArtOnly.enabled,
            keepAspectRatio:     props.keepAspectRatio.enabled,
            interpolationMode:   props.interpolationMode.value,
            maxImageSize:        props.maxImageSize.value,
            maskType:            AssetManager.currentMaskType,
            userOverrideMask:    AssetManager.userOverrideMask,
            overlayAllOff:       props.overlayAllOff.enabled,
            savedOverlay:        props.savedOverlay.value,
            showReflection:      props.showReflection.enabled,
            opReflection:        props.opReflection.value,
            showGlow:            props.showGlow.enabled,
            opGlow:              props.opGlow.value,
            showScanlines:       props.showScanlines.enabled,
            opScanlines:         props.opScanlines.value,
            showPhosphor:        props.showPhosphor.enabled,
            opPhosphor:          props.opPhosphor.value,
            phosphorTheme:       props.phosphorTheme.value,
            customPhosphorColor: props.customPhosphorColor.value,
            borderSize:          props.borderSize.value,
            borderColor:         props.borderColor.value,
            padding:             props.padding.value,
            backgroundEnabled:   props.backgroundEnabled.enabled,
            bgUseUIColor:        props.bgUseUIColor.enabled,
            blurRadius:          props.blurRadius.value,
            blurEnabled:         props.blurEnabled.enabled,
            darkenValue:         props.darkenValue.value,
            customBackgroundColor: props.customBackgroundColor.value
        };
    },

    save(slot) {
        if (!_.inRange(slot, 1, 4)) return;
        try {
            window.SetProperty('Disc.Preset' + slot, JSON.stringify(this._capture()));
        } catch (e) {}
    },

    load(slot) {
        if (!_.inRange(slot, 1, 4)) return;
        try {
            const str = window.GetProperty('Disc.Preset' + slot, null);
            if (!str) return;
            const d = JSON.parse(str);

            if (_.isBoolean(d.spinningEnabled)) props.spinningEnabled.enabled = d.spinningEnabled;
            if (_.isNumber(d.spinSpeed))         props.spinSpeed.value         = _.clamp(d.spinSpeed, CONFIG.MIN_SPIN_SPEED, CONFIG.MAX_SPIN_SPEED);
            if (_.isBoolean(d.useAlbumArtOnly))  props.useAlbumArtOnly.enabled = d.useAlbumArtOnly;
            if (_.isBoolean(d.keepAspectRatio))  props.keepAspectRatio.enabled = d.keepAspectRatio;
            if (_.isNumber(d.interpolationMode)) props.interpolationMode.value = d.interpolationMode;
            if (_.isNumber(d.maxImageSize))      props.maxImageSize.value      = _.clamp(d.maxImageSize, CONFIG.MIN_DISC_SIZE, CONFIG.MAX_DISC_SIZE);

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

            if (_.isBoolean(d.overlayAllOff))    props.overlayAllOff.enabled   = d.overlayAllOff;
            if (_.isString(d.savedOverlay))      props.savedOverlay.value      = d.savedOverlay;
            if (_.isBoolean(d.showReflection))   props.showReflection.enabled  = d.showReflection;
            if (_.isNumber(d.opReflection))      props.opReflection.value      = _.clamp(d.opReflection, 0, 255);
            if (_.isBoolean(d.showGlow))         props.showGlow.enabled        = d.showGlow;
            if (_.isNumber(d.opGlow))            props.opGlow.value            = _.clamp(d.opGlow, 0, 255);
            if (_.isBoolean(d.showScanlines))    props.showScanlines.enabled   = d.showScanlines;
            if (_.isNumber(d.opScanlines))       props.opScanlines.value       = _.clamp(d.opScanlines, 0, 255);
            if (_.isBoolean(d.showPhosphor))     props.showPhosphor.enabled    = d.showPhosphor;
            if (_.isNumber(d.opPhosphor))        props.opPhosphor.value        = _.clamp(d.opPhosphor, 0, 255);
            if (_.isNumber(d.phosphorTheme))     props.phosphorTheme.value     = _.clamp(d.phosphorTheme, 0, DISC_CUSTOM_THEME_INDEX);
            if (_.isNumber(d.customPhosphorColor)) props.customPhosphorColor.value = d.customPhosphorColor >>> 0;
            PhosphorManager.invalidateCache();

            if (_.isNumber(d.borderSize))    props.borderSize.value = _.clamp(d.borderSize, 0, 50);
            if (_.isNumber(d.borderColor))   props.borderColor.value = d.borderColor >>> 0;
            if (_.isNumber(d.padding))       props.padding.value = _.clamp(d.padding, 0, 100);

            if (_.isBoolean(d.backgroundEnabled)) props.backgroundEnabled.enabled = d.backgroundEnabled;
            if (_.isBoolean(d.bgUseUIColor))      props.bgUseUIColor.enabled      = d.bgUseUIColor;
            if (_.isNumber(d.blurRadius))    props.blurRadius.value = _.clamp(d.blurRadius, 0, 254);
            if (_.isBoolean(d.blurEnabled))  props.blurEnabled.enabled = d.blurEnabled;
            if (_.isNumber(d.darkenValue))   props.darkenValue.value = _.clamp(d.darkenValue, 0, 50);
            if (_.isNumber(d.customBackgroundColor)) props.customBackgroundColor.value = d.customBackgroundColor >>> 0;

            ImageLoader.cache.clear();
            ImageLoader.clearCache();
            AssetManager.maskCache.clear();
            AssetManager.rimCache.clear();
            BackgroundCache.invalidate();
            OverlayInvalidator.request();
            DiscComposite.dispose();
            State.paintCache.valid = false;
            State.updateTimer();
            if (State.currentMetadb) ImageLoader.loadForMetadb(State.currentMetadb, true);
            RepaintHelper.full();
        } catch (e) {}
    }
};

// ====================== SLIDER STATE ======================
const Slider = {
    active:  false,
    target:  null,

    timers: {
        overlayRebuild: null
    },

    activate(target) {
        this.active = true;
        this.target = target;
        window.Repaint();
    },

    deactivate() {
        this.active = false;
        this.target = null;
        window.Repaint();
    },

    cleanup() {
        if (this.timers.overlayRebuild) window.ClearTimeout(this.timers.overlayRebuild);
        this.timers.overlayRebuild = null;
    }
};

// ====================== SLIDER RENDERER ======================
const SliderRenderer = {
    _font: null,

    getFont() {
        if (!this._font) {
            this._font = gdi.Font('Segoe UI', 16, 0);
        }
        return this._font;
    },

    drawBar(gr, value, max, barY) {
        const w    = window.Width;
        const barW = Math.max(SLIDER_MIN_WIDTH, Math.floor(w * SLIDER_WIDTH_RATIO));
        const barH = SLIDER_HEIGHT;
        const bx   = Math.floor((w - barW) / 2);

        gr.FillSolidRect(bx, barY, barW, barH, DiscSpin_SetAlpha(DS_WHITE, 55));

        const fillW = Math.floor(barW * (value / max));
        if (fillW > 0) {
            gr.FillSolidRect(bx, barY, fillW, barH, DiscSpin_SetAlpha(DS_WHITE, 185));
        }

        const font  = this.getFont();
        const label = value.toString();
        const sz    = gr.MeasureString(label, font, 0, 0, w, window.Height);
        gr.DrawString(label, font, DS_WHITE,
            Math.floor((w - sz.Width) / 2),
            barY - Math.ceil(sz.Height) - 2,
            Math.ceil(sz.Width), Math.ceil(sz.Height));
    },

    drawTitle(gr, text, barY) {
        const w    = window.Width;
        const font = this.getFont();
        const sz   = gr.MeasureString(text, font, 0, 0, w, window.Height);
        const valSz  = gr.MeasureString('255', font, 0, 0, w, window.Height);
        const titleY = barY - Math.ceil(valSz.Height) - 4 - Math.ceil(sz.Height) - 4;
        gr.DrawString(text, font,
            DiscSpin_SetAlpha(DS_WHITE, 180),
            Math.floor((w - sz.Width) / 2),
            titleY,
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

        const barY = window.Height - 22;
        this.drawTitle(gr, Slider.target + ' Opacity', barY);
        this.drawBar(gr, prop.value, 255, barY);
    }
};

// ================= MENU MANAGER =================
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

        const idx = menu.TrackPopupMenu(x, y);
        this.handleSelection(idx);

        return true;
    },

    addOverlayMenu(parent) {
        const overlay = window.CreatePopupMenu();

        const grayed = props.overlayAllOff.enabled;

        // --- Phosphor Theme ---
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
        if (!grayed && props.showGlow.enabled) overlay.CheckMenuItem(210, true);

        overlay.AppendMenuItem(grayed ? 1 : 0, 220, "Scanlines");
        if (!grayed && props.showScanlines.enabled) overlay.CheckMenuItem(220, true);

        overlay.AppendMenuItem(grayed ? 1 : 0, 230, "Phosphor");
        if (!grayed && props.showPhosphor.enabled) overlay.CheckMenuItem(230, true);

        overlay.AppendMenuSeparator();

        const opacityM = window.CreatePopupMenu();

        opacityM.AppendMenuItem((!grayed && props.showReflection.enabled) ? 0 : 1, 201,
            `Reflection...  [${props.opReflection.value}]`);

        opacityM.AppendMenuItem((!grayed && props.showGlow.enabled) ? 0 : 1, 211,
            `Glow...  [${props.opGlow.value}]`);

        opacityM.AppendMenuItem((!grayed && props.showScanlines.enabled) ? 0 : 1, 221,
            `Scanlines...  [${props.opScanlines.value}]`);

        opacityM.AppendMenuItem((!grayed && props.showPhosphor.enabled) ? 0 : 1, 231,
            `Phosphor...  [${props.opPhosphor.value}]`);

        opacityM.AppendTo(overlay, 0, "Opacity Settings");

        overlay.AppendTo(parent, 0, "Overlay Effects");
    },

    addImageSettingsMenu(parent) {
        const settingsMenu = window.CreatePopupMenu();

        this.addSpeedMenu(settingsMenu);
        this.addScalingMenu(settingsMenu);
        this.addSizeMenu(settingsMenu);
        this.addMaskMenu(settingsMenu);

        settingsMenu.AppendTo(parent, 0, "Disc Settings");
    },

    addSpeedMenu(parent) {
        const speedMenu = window.CreatePopupMenu();

        _.forEach(CONFIG.SPEED_PRESETS, (preset, i) => {
            speedMenu.AppendMenuItem(0, 10 + i, preset.name);
        });

        const matchIdx = _.findIndex(CONFIG.SPEED_PRESETS, p => p.value === props.spinSpeed.value);
        if (matchIdx !== -1) {
            speedMenu.CheckMenuRadioItem(10, 10 + CONFIG.SPEED_PRESETS.length - 1, 10 + matchIdx);
        }

        speedMenu.AppendTo(parent, 0, "Rotation Speed");
    },

    addScalingMenu(parent) {
        const scalingMenu = window.CreatePopupMenu();

        _.forEach(CONFIG.INTERPOLATION_MODES, (mode, i) => {
            scalingMenu.AppendMenuItem(0, 20 + i, mode.name);
            if (props.interpolationMode.value === mode.value) {
                scalingMenu.CheckMenuItem(20 + i, true);
            }
        });

        scalingMenu.AppendTo(parent, 0, "Image Scaling");
    },

    addSizeMenu(parent) {
        const sizeMenu = window.CreatePopupMenu();

        _.forEach(CONFIG.DISC_SIZE_PRESETS, (preset, i) => {
            sizeMenu.AppendMenuItem(0, 30 + i, preset.name);
            if (props.maxImageSize.value === preset.value) {
                sizeMenu.CheckMenuItem(30 + i, true);
            }
        });

        sizeMenu.AppendTo(parent, 0, "Disc Resolution");
    },

    addMaskMenu(parent) {
        const maskMenu = window.CreatePopupMenu();

        _.forEach(CONFIG.MASK_TYPES, (mask, i) => {
            maskMenu.AppendMenuItem(0, 40 + i, mask.name);
            if (AssetManager.currentMaskType === i) {
                maskMenu.CheckMenuItem(40 + i, true);
            }
        });

        maskMenu.AppendTo(parent, 0, "Mask Type");
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

        const loadM = window.CreatePopupMenu();
        const saveM = window.CreatePopupMenu();

        _.times(3, (i) => {
            const num = i + 1;
            loadM.AppendMenuItem(0, 300 + num, 'Preset ' + num);
            saveM.AppendMenuItem(0, 400 + num, 'Preset ' + num);
        });

        loadM.AppendTo(presetM, 0, 'Load Preset');
        saveM.AppendTo(presetM, 0, 'Save Preset');
        presetM.AppendTo(parent, 0, 'Presets');
    },

    addBorderPaddingMenu(parent) {
        const bpMenu = window.CreatePopupMenu();

        bpMenu.AppendMenuItem(0, 250, 'Set Border Size...');
        bpMenu.AppendMenuItem(0, 251, 'Change Border Color...');
        bpMenu.AppendMenuItem(0, 252, 'Set Padding...');

        bpMenu.AppendTo(parent, 0, 'Border & Padding');
    },

    addBackgroundMenu(parent) {
        const bgMenu = window.CreatePopupMenu();

        const uiColorActive = props.bgUseUIColor.enabled;

        bgMenu.AppendMenuItem(0, 263, 'Use UI Color as Background');
        if (uiColorActive) bgMenu.CheckMenuItem(263, true);

        bgMenu.AppendMenuSeparator();

        bgMenu.AppendMenuItem(uiColorActive ? 1 : 0, 260, 'Enable Background Art');
        if (!uiColorActive && props.backgroundEnabled.enabled) bgMenu.CheckMenuItem(260, true);

        bgMenu.AppendMenuItem(uiColorActive ? 1 : 0, 261, 'Custom Background Color...');

        bgMenu.AppendMenuSeparator();

        const blurEnabled = !uiColorActive && props.backgroundEnabled.enabled;
        const blurMenu = window.CreatePopupMenu();
        blurMenu.AppendMenuItem(0, 270, 'Enable Blur');
        if (props.blurEnabled.enabled) blurMenu.CheckMenuItem(270, true);
        blurMenu.AppendMenuSeparator();
        _.times(11, (i) => {
            const value = i * 20;
            blurMenu.AppendMenuItem(0, 271 + i, 'Radius: ' + value);
            if (props.blurRadius.value === value) blurMenu.CheckMenuItem(271 + i, true);
        });
        blurMenu.AppendMenuItem(0, 282, 'Max: 254');
        if (props.blurRadius.value === 254) blurMenu.CheckMenuItem(282, true);
        blurMenu.AppendTo(bgMenu, blurEnabled ? 0 : 1, 'Blur Settings');

        const darkenMenu = window.CreatePopupMenu();
        _.times(6, (i) => {
            const value = i * 10;
            darkenMenu.AppendMenuItem(0, 290 + i, 'Level: ' + value + '%');
            if (props.darkenValue.value === value) darkenMenu.CheckMenuItem(290 + i, true);
        });
        darkenMenu.AppendTo(bgMenu, uiColorActive ? 1 : 0, 'Darken Background');

        bgMenu.AppendTo(parent, 0, 'Background');
    },

    handleSelection(idx) {
        let changed = false;

        // Toggle handlers
        const toggles = {
            1: { prop: props.useAlbumArtOnly, reload: true },
            2: { prop: props.spinningEnabled, timer: true },
            3: { prop: props.keepAspectRatio, cache: true }
        };

        if (toggles[idx]) {
            toggles[idx].prop.toggle();
            if (toggles[idx].reload && State.currentMetadb) {
                ImageLoader.cache.clear();
                ImageLoader.clearCache();
                DiscComposite.dispose();
                ImageLoader.loadForMetadb(State.currentMetadb, true);
            }
            if (toggles[idx].timer) State.updateTimer();
            if (toggles[idx].cache) State.paintCache.valid = false;
            changed = true;
        }

        // Speed presets (10-12)
        const speedPreset = _.find(CONFIG.SPEED_PRESETS, (p, i) => (i + 10) === idx);
        if (speedPreset) {
            props.spinSpeed.value = speedPreset.value;
            changed = true;
        }

        // Interpolation modes (20-24)
        const interpMode = _.find(CONFIG.INTERPOLATION_MODES, (m, i) => (i + 20) === idx);
        if (interpMode) {
            props.interpolationMode.value = interpMode.value;
            ImageLoader.cache.clear();
            ImageLoader.clearCache();
            DiscComposite.dispose();
            OverlayInvalidator.request();
            if (State.currentMetadb) ImageLoader.loadForMetadb(State.currentMetadb, true);
            changed = true;
        }

        const sizePreset = _.find(CONFIG.DISC_SIZE_PRESETS, (p, i) => (i + 30) === idx);
        if (sizePreset) {
            props.maxImageSize.value = sizePreset.value;
            ImageLoader.cache.clear();
            ImageLoader.clearCache();   // clear path cache — cached results hold old-size bitmaps
            AssetManager.maskCache.clear();
            AssetManager.rimCache.clear();
            DiscComposite.dispose();    // dispose stale composite — do not just invalidate
            OverlayInvalidator.request();
            State.paintCache.valid = false;
            if (State.currentMetadb) ImageLoader.loadForMetadb(State.currentMetadb, true);
            changed = true;
        }

        // Mask types (40-42)
        if (idx >= 40 && idx <= 42) {
            const newMaskIdx = idx - 40;
            const forceReload = (newMaskIdx === AssetManager.currentMaskType);
            AssetManager.setMaskType(newMaskIdx, true, forceReload);
            ImageLoader.cache.clear();
            ImageLoader.clearCache();    // clear path cache — old results bypass re-processing
            AssetManager.maskCache.clear();
            AssetManager.rimCache.clear();
            DiscComposite.dispose();     // old composite still has previous mask baked in
            OverlayInvalidator.request();
            State.paintCache.valid = false;
            if (State.currentMetadb) ImageLoader.loadForMetadb(State.currentMetadb, true);
            changed = true;
        }

        // Custom folder operations
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

        // Clear cache (900)

        if (idx === 900) {
            FileManager.clear();
            ImageLoader.cache.clear();
            ImageLoader.clearCache();
            AssetManager.maskCache.clear();
            AssetManager.rimCache.clear();
            BackgroundCache.invalidate();
            DiscComposite.dispose();
            State.paintCache.valid = false;
            if (State.currentMetadb) ImageLoader.loadForMetadb(State.currentMetadb, true);
            changed = true;
        }

        // ===== Overlay Effects =====

        // Master kill-switch (199)
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
                    props.showReflection.enabled = !!saved.r;
                    props.showGlow.enabled       = !!saved.g;
                    props.showScanlines.enabled  = !!saved.s;
                    props.showPhosphor.enabled   = !!saved.p;
                } catch (e) {}
                props.overlayAllOff.enabled = false;
            }
            OverlayInvalidator.request();
            changed = true;
        }

        // Reflection toggle (200) / opacity slider (201)
        if (idx === 200) { props.showReflection.toggle(); OverlayInvalidator.request(); changed = true; }
        if (idx === 201) {
            Slider.activate("Reflection");
            return;  // slider handles its own repaint via on_mouse_wheel / on_mouse_lbtn_up
        }

        // Glow toggle (210) / opacity slider (211)
        if (idx === 210) { props.showGlow.toggle(); OverlayInvalidator.request(); changed = true; }
        if (idx === 211) {
            Slider.activate("Glow");
            return;
        }

        // Scanlines toggle (220) / opacity slider (221)
        if (idx === 220) { props.showScanlines.toggle(); OverlayInvalidator.request(); changed = true; }
        if (idx === 221) {
            Slider.activate("Scanlines");
            return;
        }

        // Phosphor toggle (230) / opacity slider (231) / themes (600-610)
        if (idx === 230) { props.showPhosphor.toggle(); OverlayInvalidator.request(); changed = true; }
        if (idx === 231) {
            Slider.activate("Phosphor");
            return;
        }

        if (_.inRange(idx, 600, 600 + DISC_CUSTOM_THEME_INDEX)) {
            props.phosphorTheme.value = idx - 600;
            PhosphorManager.invalidateCache();
            OverlayInvalidator.request();
            changed = true;
        }
        if (idx === 600 + DISC_CUSTOM_THEME_INDEX) {
            PhosphorManager.setCustomColor();
            return;  // setCustomColor handles its own repaint
        }

        // ===== Full Panel Reset (197) =====
        if (idx === 197) {
            // Image / spin settings
            props.spinningEnabled.enabled      = true;
            props.spinSpeed.value              = 2.0;
            props.useAlbumArtOnly.enabled      = false;
            props.keepAspectRatio.enabled      = true;
            props.interpolationMode.value      = 0;
            props.maxImageSize.value           = 500;
            AssetManager.setMaskType(0, false);   // CD mask, auto-detect re-enabled

            // Overlay effects
            props.overlayAllOff.enabled        = false;
            props.savedOverlay.value           = '';
            props.showReflection.enabled       = true;
            props.opReflection.value           = 30;
            props.showGlow.enabled             = false;
            props.opGlow.value                 = 40;
            props.showScanlines.enabled        = false;
            props.opScanlines.value            = 80;
            props.showPhosphor.enabled         = true;
            props.opPhosphor.value             = 20;
            props.phosphorTheme.value          = 8;
            props.customPhosphorColor.value    = 0xFFFFFFFF;
            PhosphorManager.invalidateCache();

            // Border & Padding
            props.borderSize.value             = 5;
            props.borderColor.value            = 0xFF202020;
            props.padding.value                = 10;

            // Background
            props.backgroundEnabled.enabled    = true;
            props.bgUseUIColor.enabled         = false;
            props.blurRadius.value             = 240;
            props.blurEnabled.enabled          = true;
            props.darkenValue.value            = 10;
            props.customBackgroundColor.value  = 0xFF191919;

            // Invalidate all caches and reload

            ImageLoader.cache.clear();
            ImageLoader.clearCache();
            AssetManager.maskCache.clear();
            AssetManager.rimCache.clear();
            BackgroundCache.invalidate();
            OverlayInvalidator.request();
            DiscComposite.dispose();
            State.paintCache.valid = false;
            State.updateTimer();
            if (State.currentMetadb) ImageLoader.loadForMetadb(State.currentMetadb, true);
            changed = true;
        }

        // ===== Border & Padding =====

        // Set Border Size (250)
        if (idx === 250) {
            const v = utils.InputBox(window.ID, 'Border Size', 'Enter size (0–50):', props.borderSize.value.toString(), false);
            const n = parseInt(v, 10);
            if (!isNaN(n)) {
                props.borderSize.value = _.clamp(n, 0, 50);
                State.paintCache.valid = false;  // Recalculate disc/image position
                changed = true;
            }
        }

        // Change Border Color (251)
        if (idx === 251) {
            const picked = utils.ColourPicker(window.ID, props.borderColor.value);
            if (picked !== -1) {
                props.borderColor.value = picked;
                window.Repaint();
                changed = true;
            }
        }

        // Set Padding (252)
        if (idx === 252) {
            const v = utils.InputBox(window.ID, 'Padding', 'Enter size (0–100):', props.padding.value.toString(), false);
            const n = parseInt(v, 10);
            if (!isNaN(n)) {
                props.padding.value = _.clamp(n, 0, 100);
                State.paintCache.valid = false;  // Recalculate disc/image position
                changed = true;
            }
        }

        // ===== Background =====

        // Use UI Color as Background (263)
        if (idx === 263) {
            props.bgUseUIColor.toggle();
            BackgroundCache.invalidate();
            changed = true;
        }

        // Enable Background Art (260)
        if (idx === 260) {
            props.backgroundEnabled.toggle();
            BackgroundCache.invalidate();
            changed = true;
        }

        // Custom Background Color (261)
        if (idx === 261) {
            const picked = utils.ColourPicker(window.ID, props.customBackgroundColor.value);
            if (picked !== -1) {
                props.customBackgroundColor.value = picked;
                RepaintHelper.background();
                changed = true;
            }
        }

        // Enable Blur (270)
        if (idx === 270) {
            props.blurEnabled.toggle();
            BackgroundCache.invalidate();
            changed = true;
        }

        // Blur Radius (271–281 = 0,20,40,...200; 282 = max 254)
        if (_.inRange(idx, 271, 282)) {
            props.blurRadius.value = (idx - 271) * 20;
            BackgroundCache.invalidate();
            changed = true;
        } else if (idx === 282) {
            props.blurRadius.value = 254;
            BackgroundCache.invalidate();
            changed = true;
        }

        // Darken Background
        if (_.inRange(idx, 290, 296)) {
            props.darkenValue.value = (idx - 290) * 10;
            BackgroundCache.invalidate();
            changed = true;
        }

        // Load preset (301-303)
        if (_.inRange(idx, 301, 304)) {
            PresetManager.load(idx - 300);
            return;  // load handles its own repaint
        }

        // Save preset (401-403)
        if (_.inRange(idx, 401, 404)) {
            PresetManager.save(idx - 400);
        }

        if (changed) window.Repaint();
    }
};

// ====================== CALLBACKS ======================
function on_paint(gr) {
    const w = window.Width;
    const h = window.Height;
    const bgColor = State.paintCache.bgColor;

    if (P.bgUseUIColor) {
        gr.FillSolidRect(0, 0, w, h, bgColor);
    } else {
        gr.FillSolidRect(0, 0, w, h, P.customBackgroundColor >>> 0);

        // Draw background image (blurred if enabled, otherwise stretch to cover)
        const hasBgImage = P.backgroundEnabled && State.bgImg && State.bgImg.Width > 0 && State.bgImg.Height > 0;
        if (hasBgImage) {
            if (P.blurEnabled) {
                BackgroundCache.ensure(w, h);
                if (BackgroundCache.img) {
                    gr.DrawImage(BackgroundCache.img, 0, 0, w, h, 0, 0, BackgroundCache.img.Width, BackgroundCache.img.Height);
                }
            } else {
                gr.DrawImage(State.bgImg, 0, 0, w, h, 0, 0, State.bgImg.Width, State.bgImg.Height);
            }
        }

        if (P.darkenValue > 0) {
            const alpha = Math.floor(P.darkenValue * 2.55);
            gr.FillSolidRect(0, 0, w, h, DiscSpin_SetAlpha(DS_BLACK, alpha));
        }
    }

    Renderer.paint(gr);
	
	 // Border drawn under overlay.
    Renderer.drawBorder(gr);

    if (OverlayCache.valid && OverlayCache.img &&
        (OverlayCache.img.Width !== w || OverlayCache.img.Height !== h)) {
        OverlayCache.invalidate();
    }
    if (!OverlayCache.valid) {
        OverlayCache.build(w, h, State.paintCache);
    }

    if (OverlayCache.img) {
        const oi = OverlayCache.img;
        gr.DrawImage(oi, 0, 0, w, h, 0, 0, oi.Width, oi.Height);
    }

   

    SliderRenderer.draw(gr);
}

function on_size() {
    State.paintCache.valid = false;
    BackgroundCache.invalidate();
    OverlayInvalidator.request();
    // Fully dispose composite so paintDisc triggers a fresh build at the new size.
    DiscComposite.dispose();
    AssetManager.maskCache.clear();
    AssetManager.rimCache.clear();
    // Clear processed image cache — cached bitmaps were sized for the old panel dimensions.
    ImageLoader.cache.clear();
    ImageLoader.clearCache();
    State.stopTimer();
    // Reload the current track at the new size if we have one.
    if (isLive() && State.currentMetadb) {
        ImageLoader.loadForMetadb(State.currentMetadb, false);
    } else {
        window.Repaint();
    }
}

// ================= ARTWORK DISPATCHER =================
const ArtDispatcher = {
    _pending: null,      // { reason, metadb }
    _timer: null,

    // Priority: track > stop > selection > playlist
    _priority: { track: 4, stop: 3, selection: 2, playlist: 1 },

    request(reason, metadb) {
        const priority = this._priority[reason] || 0;

        // If we have a pending request, only override if higher or equal priority.
        // Equal-priority requests replace the pending one (e.g. rapid track changes —
        // the latest track always wins).  Lower-priority requests are dropped silently.
        if (this._pending) {
            const currentPriority = this._priority[this._pending.reason] || 0;
            if (priority < currentPriority) {
                return;
            }
        }

        this._pending = { reason, metadb };

        // Debounce to prevent repaint storms
        if (this._timer) {
            window.ClearTimeout(this._timer);
        }

        this._timer = window.SetTimeout(() => {
            this._dispatch();
        }, 50);
    },

    _dispatch() {
        if (!this._pending) return;
        if (!isLive()) { this._pending = null; this._timer = null; return; }

        const { reason, metadb } = this._pending;
        this._pending = null;
        this._timer = null;

        switch (reason) {
            case 'track':

                if (metadb && State.currentMetadb && State.img &&
                    State.currentMetadb.Compare(metadb)) {
                    return;
                }
                if (metadb) {
                    ImageLoader.loadForMetadb(metadb, true);
                }
                break;
            case 'stop':
   
                if (metadb === 0) {
                    State.angle = 0;
                }
                State.updateTimer();
                window.Repaint();
                break;
            case 'selection':
                if (metadb) {
                    ImageLoader.loadForMetadb(metadb, false);
                }
                break;
            case 'playlist':
                if (fb.IsPlaying && fb.GetNowPlaying()) {
                    ImageLoader.loadForMetadb(fb.GetNowPlaying(), false);
                }
                break;
        }
    }
};

function on_playback_new_track(metadb) {
    ArtDispatcher.request('track', metadb);
}

// Refresh display when tags are edited while a track is playing.
function on_metadb_changed(metadb_list, fromhook) {
    if (!isLive()) return;
    if (!fb.IsPlaying && !fb.IsPaused) return;
    const nowPlaying = fb.GetNowPlaying();
    if (!nowPlaying) return;

    let affected = false;
    for (let i = 0; i < metadb_list.Count; i++) {
        const item = metadb_list[i];
        if (item && item.Compare && item.Compare(nowPlaying)) {
            affected = true;
            break;
        }
    }

    if (affected) {
        // Invalidate same-folder shortcut so art + metadata fully reload.
        State.currentMetadb = null;
        ImageLoader.loadForMetadb(nowPlaying, true);
    }
}

function on_playback_pause() {
    if (!isLive()) return;
    State.updateTimer();
}

function on_playback_stop(reason) {
    // Pass reason code as the second argument — ArtDispatcher uses it to
    // distinguish user-stop (0), EoF auto-advance (1), and shutdown (2).
    ArtDispatcher.request('stop', reason);
}

function on_playback_starting() {
    if (!isLive()) return;
    State.updateTimer();
}

function on_playback_seek() {
    if (!isLive()) return;
    State.updateTimer();
}

function on_selection_changed() {
    if (fb.IsPlaying || fb.IsPaused) return;

    const sel = fb.GetSelection();
    if (sel) {
        ArtDispatcher.request('selection', sel);
    }
}

function on_playlist_switch() {
    ArtDispatcher.request('playlist', null);
}

function on_playlist_items_added(playlist_index) {
    ArtDispatcher.request('playlist', null);
}

function on_playlist_items_removed(playlist_index) {
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
    if (window.SetFocus) window.SetFocus();
}

// Required to honour grab_focus: true — without this SMP won't route key events here.
function on_key_down(vkey) {
    // Reserved for future keyboard shortcuts.
}

function on_mouse_lbtn_up(x, y) {
    if (Slider.active) {
        Slider.deactivate();
    }
}

function on_mouse_move(x, y) {
    // Nothing interactive to hover over currently; extend here if buttons are added.
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
    RepaintHelper.full();   // immediate repaint — shows slider with updated value

    if (Slider.timers.overlayRebuild) window.ClearTimeout(Slider.timers.overlayRebuild);
    Slider.timers.overlayRebuild = window.SetTimeout(() => {
        Slider.timers.overlayRebuild = null;
        OverlayCache.invalidate();
        window.Repaint();   // triggers lazy rebuild in on_paint
    }, 100);
}

function on_script_unload() {
    phase = Phase.SHUTDOWN;
    
    if (ArtDispatcher._timer) {
        window.ClearTimeout(ArtDispatcher._timer);
        ArtDispatcher._timer = null;
    }
    ArtDispatcher._pending = null;   // prevent stale dispatch after unload
    if (State.loadTimer) {
        window.ClearTimeout(State.loadTimer);
        State.loadTimer = null;
    }
    if (readyTimer) {
        window.ClearTimeout(readyTimer);
        readyTimer = null;
    }
    OverlayInvalidator.cancel();
    if (SliderRenderer._font) { try { SliderRenderer._font.Dispose(); } catch (e) {} SliderRenderer._font = null; }
    Slider.cleanup();
    State.cleanup();
    ImageLoader.cleanup();
    AssetManager.cleanup();
    BackgroundCache.dispose();
    OverlayCache.dispose();
    DiscComposite.dispose();
    FileManager.clear();

    // Clean up global GDI measurement objects created by helpers.js.
    // helpers.js defines its own on_script_unload for these — we must replicate
    // that teardown here since our definition supersedes theirs.
    _tt('');

    if (_gr) {
        try { if (_bmp) _bmp.ReleaseGraphics(_gr); } catch (e) {}
    }
    _gr  = null;
    _bmp = null;
}

// ====================== INITIALIZATION ======================
function init() {
    AssetManager.init();
    CustomFolders.load();

    const nowPlaying = fb.GetNowPlaying();

    if (nowPlaying) {
        ImageLoader.loadForMetadb(nowPlaying, true);
    } else if (props.savedPath.value && FileManager.exists(props.savedPath.value)) {
        try {
            const imageType = Utils.getImageType(props.savedPath.value);

            if (imageType === CONFIG.IMAGE_TYPE.DEFAULT_DISC) {
                ImageLoader.loadDefaultDisc();
            } else {

                try {
                    const savedPath = props.savedPath.value;
                    const raw = gdi.Image(savedPath);
                    if (raw) {

                        let original = null;
                        try {
                            original = raw.Clone(0, 0, raw.Width, raw.Height);
                        } catch (cloneErr) {
                            // Clone failed — proceed without a background source;
                            // raw is still alive and will be handled below.
                        }
                        const targetSize = Utils.getPanelDiscSize();
                        const isDisc = props.savedIsDisc.enabled;
                        let displayImg;
                        if (isDisc) {
                            displayImg = ImageProcessor.processForDisc(
                                raw, targetSize, imageType, P.interpolationMode
                            );
                            // processForDisc takes full ownership of raw on both
                            // success and failure — do NOT call safeDispose(raw).
                        } else {
                            displayImg = ImageProcessor.scaleProportional(
                                raw, CONFIG.MAX_STATIC_SIZE, P.interpolationMode
                            );

                            if (!displayImg) Utils.safeDispose(raw);
                        }
                        if (displayImg) {
                            State.setImage(displayImg, isDisc, imageType, original);
                        } else {
                            Utils.safeDispose(original);
                        }
                    }
                } catch (e2) {}
            }
            // NOTE: nowPlaying is null in this branch so fb.GetAlbumArtAsync
            // would have nothing to act on — no async request is needed here.
        } catch (e) {}
    } else {
        // Fallback: check shared folder property from PlayList
        const sharedFolder = window.GetProperty('RP.SavedFolder', '');
        if (sharedFolder && FileManager.isDirectory(sharedFolder)) {
            const coverPath = ImageLoader.searchForCover(null, sharedFolder);
            if (coverPath) {
                try {
                    const imageType = Utils.getImageType(coverPath);

                    const raw = gdi.Image(coverPath);
                    if (raw) {
                        const original = raw.Clone(0, 0, raw.Width, raw.Height);
                        const targetSize = Utils.getPanelDiscSize();
                        const displayImg = ImageProcessor.processForDisc(
                            raw, targetSize, imageType, P.interpolationMode
                        );
                        Utils.safeDispose(raw);
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