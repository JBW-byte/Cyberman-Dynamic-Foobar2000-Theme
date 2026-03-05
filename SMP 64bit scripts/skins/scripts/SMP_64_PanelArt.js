'use strict';
           // ============== AUTHOR L.E.D. ============== \\
          // ==== Panel Artwork and Trackinfo v3.1.1  ==== \\
         // ========== Blur Artwork + Trackinfo =========== \\ 

  // ===================*** Foobar2000 64bit ***================== \\
 // ======= For Spider Monekey Panel 64bit, author: marc2003 ====== \\
// === SMP 64bit script samples StackBlur+Panel, author:marc2003 === \\

window.DrawMode = 1; // 0 - default GDI+ mode. 1 - D2D

window.DefineScript("SMP 64bit PanelArt V3.1.1", { author: "L.E.D.", options: { grab_focus: true } });

// ====================== HELPER INCLUDES ======================
include(fb.ComponentPath + 'samples\\complete\\js\\lodash.min.js');
include(fb.ComponentPath + 'samples\\complete\\js\\helpers.js');

function _fbSanitise(str) {
    if (!str) return '';
    return utils.ReplaceIllegalChars(str, true);
}

// Lifecycle state machine - guards operations during shutdown
const Phase = {
    BOOT: 0,
    RESTORE: 1,
    LIVE: 2,
    SHUTDOWN: 3
};

let phase = Phase.BOOT;

function isLive() {
    return phase === Phase.LIVE;
}

// ================= USER CONFIGURABLE DEFAULTS =================
const USER_DEFAULTS = {
    // Album Art Settings
    ALBUM_ART_PADDING: 40,
    ALBUM_ART_BORDER: 10,
    ALBUM_ART_BORDER_COLOR: _RGB(32, 32, 32),

    // Blur & Background
    BLUR_RADIUS: 240,
    DARKEN_VALUE: 10,
    BACKGROUND_COLOR: _RGB(25, 25, 25),

    // Overlay Effects (opacity 0-255)
    REFLECTION_OPACITY: 30,
    GLOW_OPACITY: 40,
    SCANLINES_OPACITY: 80,
    PHOSPHOR_OPACITY: 20,

    // Text Settings
    TITLE_FONT: "Segoe UI",
    TITLE_SIZE: 42,
    ARTIST_FONT: "Segoe UI",
    ARTIST_SIZE: 28,
    EXTRA_FONT: "Segoe UI",
    EXTRA_SIZE: 20
};

// ================= CONSTANTS =================
const STATE_KEY = "SMP_64_PANELART_STATE";
const STATE_VERSION = 3;

// UI Constants
const ALBUM_ART_MAX_WIDTH_RATIO = 0.65;
const ALBUM_ART_MIN_HEIGHT_RATIO = 0.45;
const REFLECTION_HEIGHT_RATIO = 0.45;
const DARKEN_ALPHA_MULTIPLIER = 2.55;
const DEFAULT_OVERLAY_PADDING = 6;
const TEXT_SHADOW_OFFSET = 2;
const SCANLINE_SPACING = 3;

// File Search Constants
const MAX_SUBFOLDER_DEPTH = 4;
const MAX_CUSTOM_FOLDERS = 5;
const MAX_FILE_CACHE = 200;

// Cache Limits
const MAX_FONT_CACHE        = 50;
const MAX_TEXT_HEIGHT_CACHE = 100;
const MAX_BG_CACHE          = 5;

// Debounce Times
const BLUR_DEBOUNCE_MS = 150;

// Slider Constants
const SLIDER_MIN_WIDTH = 220;
const SLIDER_WIDTH_RATIO = 0.6;
const SLIDER_HEIGHT = 6;
const SLIDER_STEP = 5;

// Text Layout Constants
const GAP_TITLE_ARTIST = 2;
const GAP_ARTIST_EXTRA = 6;
const MIN_FONT_SIZE = 6;
const MAX_FONT_SIZE = 200;

// Search Patterns - lowercase only; Windows FS is case-insensitive
const COVER_PATTERNS = [
    "cover", "front", "folder", "albumart", "album", "artwork", "art", "front cover"
];

const EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"];

// JSON artwork file patterns - Last.fm only
const JSON_ART_FILES = [
    "lastfm_artist_getSimilar.json",
    "lastfm_album_getInfo.json",
    "lastfm_track_getInfo.json",
    "lastfm.json"
];

const MF_CHECKED = 0x00000008;


function PanelArt_SetAlpha(col, a) {
    return ((col & 0x00FFFFFF) | (a << 24)) >>> 0;
}

// Pre-hoisted colour constants — avoid _RGB() allocation on every paint
const PA_BLACK   = _RGB(0,   0,   0);
const PA_WHITE   = _RGB(255, 255, 255);
const PA_GREY200 = _RGB(200, 200, 200);   // artist text
const PA_GREY180       = _RGB(180, 180, 180);   // extra-info text
const PA_BORDER_LIGHT  = _RGB(80,  80,  80);    // border bezel outer highlight (pre-hoisted, not per-paint)
const PA_BORDER_DARK   = _RGB(20,  20,  20);    // border bezel inner shadow

const GLITCH_SHIFT_COLORS = [
    _RGB(100, 200, 255), _RGB(180, 200, 230), _RGB(150, 255, 150),
    _RGB(255, 255, 100), _RGB(255, 100, 100)
];
const GLITCH_SLICE_COLORS = [
    _RGB(100, 180, 255), _RGB(180, 200, 230), _RGB(200, 210, 220),
    _RGB(120, 160, 220), _RGB(150, 255, 150), _RGB(255, 255, 100), _RGB(255, 100, 100)
];
const GLITCH_TINT_COLORS  = [
    _RGB(100, 180, 255), _RGB(180, 200, 230), _RGB(200, 210, 220),
    _RGB(150, 170, 210), _RGB(100, 255, 100), _RGB(255, 255, 100), _RGB(255, 100, 100)
];
const GLITCH_TRACK_COLORS = [
    _RGB(100, 150, 200), _RGB(80, 200, 80), _RGB(200, 200, 80), _RGB(255, 80, 80)
];
const GLITCH_BLOCK_COLORS = [
    _RGB(0x64, 0xB4, 0xFF), _RGB(0xB4, 0xC8, 0xE6), _RGB(0xD2, 0xDA, 0xE6),
    _RGB(0x78, 0x88, 0xB8), _RGB(0xA0, 0xB0, 0xC8), _RGB(0xC8, 0xD0, 0xE0),
    _RGB(0x50, 0xFF, 0x50), _RGB(0xFF, 0xFF, 0x50), _RGB(0xFF, 0x50, 0x50)
];

// ================= PHOSPHOR COLOR THEMES =================
const PHOSPHOR_THEMES = [
    { name: "Classic",  color: _RGB(0,   255, 0)   },
    { name: "Neo",      color: _RGB(0,   255, 255) },
    { name: "Dark",     color: _RGB(0,   200, 0)   },
    { name: "Bright",   color: _RGB(255, 255, 0)   },
    { name: "Retro",    color: _RGB(0,   255, 100) },
    { name: "Minimal",  color: _RGB(0,   180, 0)   },
    { name: "Matrix",   color: _RGB(0,   255, 50)  },
    { name: "Vapor",    color: _RGB(255, 180, 255) },
    { name: "Cyber",    color: _RGB(0,   255, 255) },
    { name: "Magenta",  color: _RGB(255, 0,   255) }
];

const CUSTOM_THEME_INDEX = PHOSPHOR_THEMES.length;

// ================= DEFAULT STATE =================
function getDefaultState() {
    return {
        showReflection: true,
        showGlow: false,
        showScanlines: false,
        showPhosphor: true,

        overlayAllOff: false,           // Master kill-switch for all overlay effects
        savedOverlay: null,             // Stores individual states when kill-switch is on

        opReflection: USER_DEFAULTS.REFLECTION_OPACITY,
        opGlow: USER_DEFAULTS.GLOW_OPACITY,
        opScanlines: USER_DEFAULTS.SCANLINES_OPACITY,
        opPhosphor: USER_DEFAULTS.PHOSPHOR_OPACITY,

        currentPhosphorTheme: 8,
        customPhosphorColor: 0xffffffff,

        blurRadius: USER_DEFAULTS.BLUR_RADIUS,
        blurEnabled: true,
        darkenValue: USER_DEFAULTS.DARKEN_VALUE,
        borderSize: USER_DEFAULTS.ALBUM_ART_BORDER,
        borderColor: USER_DEFAULTS.ALBUM_ART_BORDER_COLOR,
        layout: 0,
        textShadowEnabled: true,
        extraInfoEnabled: true,

        backgroundEnabled: true,
        customBackgroundColor: USER_DEFAULTS.BACKGROUND_COLOR,

        albumArtEnabled: true,
        albumArtFloat: "left",
        albumArtPadding: USER_DEFAULTS.ALBUM_ART_PADDING,

        titleFontName: USER_DEFAULTS.TITLE_FONT,
        titleFontSize: USER_DEFAULTS.TITLE_SIZE,
        artistFontName: USER_DEFAULTS.ARTIST_FONT,
        artistFontSize: USER_DEFAULTS.ARTIST_SIZE,
        extraFontName: USER_DEFAULTS.EXTRA_FONT,
        extraFontSize: USER_DEFAULTS.EXTRA_SIZE,

        glitchEnabled: true,
        imageFolder: "",
        customFolders: "",
        imageMode: false,
        slideMode: false,
        slideIndex: 0
    };
}

// ================= STATE MIGRATION =================
function migrateState(oldState, oldVersion) {
    let state = _.assign({}, oldState);
    
    if (oldVersion < 2) {
        const migrations = {
            blur_strength: 'blurRadius',
            blur_enabled: 'blurEnabled',
            darken_value: 'darkenValue',
            border_size: 'borderSize',
            border_color: 'borderColor',
            text_shadow_enabled: 'textShadowEnabled',
            extra_info_enabled: 'extraInfoEnabled'
        };
        
        _.forEach(migrations, (newKey, oldKey) => {
            if (!_.isUndefined(state[oldKey])) {
                state[newKey] = state[oldKey];
                delete state[oldKey];
            }
        });
        
        _.defaults(state, { currentPhosphorTheme: 0 });
    }
    
    if (oldVersion < 3) {
        _.defaults(state, {
            backgroundEnabled: true,
            customBackgroundColor: USER_DEFAULTS.BACKGROUND_COLOR
        });
        delete state.customBackgroundPath;
    }
    
    // Always ensure image/slide mode states exist
    _.defaults(state, {
        imageMode: false,
        slideMode: false,
        slideIndex: 0
    });
    
    return state;
}

// ================= VALIDATION =================
const Validator = {
    validateConfig(config) {
        const defaults = getDefaultState();
        const validated = _.assign({}, defaults, config);
        
        validated.blurRadius = _.clamp(validated.blurRadius ?? defaults.blurRadius, 0, 254);
        validated.darkenValue = _.clamp(validated.darkenValue ?? defaults.darkenValue, 0, 100);
        validated.borderSize = _.clamp(validated.borderSize ?? defaults.borderSize, 0, 50);
        validated.layout = _.clamp(validated.layout ?? defaults.layout, 0, 2);
        
        validated.opReflection = _.clamp(validated.opReflection ?? defaults.opReflection, 0, 255);
        validated.opGlow = _.clamp(validated.opGlow ?? defaults.opGlow, 0, 255);
        validated.opScanlines = _.clamp(validated.opScanlines ?? defaults.opScanlines, 0, 255);
        validated.opPhosphor = _.clamp(validated.opPhosphor ?? defaults.opPhosphor, 0, 255);
        
        validated.currentPhosphorTheme = _.clamp(validated.currentPhosphorTheme ?? defaults.currentPhosphorTheme, 0, CUSTOM_THEME_INDEX);
        validated.albumArtPadding = _.clamp(validated.albumArtPadding ?? defaults.albumArtPadding, 0, 100);
        
        validated.titleFontSize = _.clamp(validated.titleFontSize ?? defaults.titleFontSize, MIN_FONT_SIZE, MAX_FONT_SIZE);
        validated.artistFontSize = _.clamp(validated.artistFontSize ?? defaults.artistFontSize, MIN_FONT_SIZE, MAX_FONT_SIZE);
        validated.extraFontSize = _.clamp(validated.extraFontSize ?? defaults.extraFontSize, MIN_FONT_SIZE, MAX_FONT_SIZE);
        
        validated.titleFontName = validated.titleFontName || defaults.titleFontName;
        validated.artistFontName = validated.artistFontName || defaults.artistFontName;
        validated.extraFontName = validated.extraFontName || defaults.extraFontName;
        validated.albumArtFloat = _.includes(["left", "right", "top", "bottom"], validated.albumArtFloat) ? validated.albumArtFloat : defaults.albumArtFloat;
        
        // Validate image/slide mode states
        validated.imageMode = !!validated.imageMode;
        validated.slideMode = !!validated.slideMode;
        validated.slideIndex = _.clamp(validated.slideIndex ?? defaults.slideIndex, 0, 9999);
        
        return validated;
    },
    
    validateColor(color, defaultColor) {
        if (!_.isNumber(color) || isNaN(color)) return defaultColor;
        return color >>> 0;
    }
};

// Single FSO instance — creating ActiveXObject per call is expensive.
const _fso = (function () {
    try { return new ActiveXObject('Scripting.FileSystemObject'); } catch (e) { return null; }
})();

// ================= FILE MANAGER =================
const FileManager = {
    cache: new Map(),
    
    // Sanitize metadata for clean searches - removes brackets, special chars, extra spaces
    sanitizeMetadata(str) {
        if (!str) return "";
        
        let cleaned = str;
        
        // Remove content in brackets/parentheses (including the brackets)
        cleaned = cleaned.replace(/\[.*?\]/g, '');
        cleaned = cleaned.replace(/\(.*?\)/g, '');
        cleaned = cleaned.replace(/\{.*?\}/g, '');
        cleaned = cleaned.replace(/<.*?>/g, '');
        
        // Remove common prefixes/suffixes
        cleaned = cleaned.replace(/^(The|A|An)\s+/i, '');
        
        // Remove special characters but keep spaces, hyphens, and underscores temporarily
        cleaned = cleaned.replace(/[^\w\s\-_]/g, ' ');
        
        // Remove extra whitespace
        cleaned = cleaned.replace(/\s+/g, ' ');
        cleaned = _.trim(cleaned);
        
        // Convert underscores to spaces
        cleaned = cleaned.replace(/_/g, ' ');
        
        // Remove multiple spaces again after underscore conversion
        cleaned = cleaned.replace(/\s+/g, ' ');
        
        return cleaned;
    },
    
    // Create variations of a name for better matching
    createSearchVariations(str) {
        if (!str) return [];
        
        const variations = [];
        // sanitizeMetadata already strips leading articles (The / A / An) and
        // normalises whitespace — no need to strip them again here.
        const cleaned = this.sanitizeMetadata(str);

        variations.push(cleaned);
        
        // With hyphens instead of spaces
        variations.push(cleaned.replace(/\s+/g, '-'));
        
        // With underscores instead of spaces
        variations.push(cleaned.replace(/\s+/g, '_'));
        
        // All lowercase versions
        variations.push(_.toLower(cleaned));
        variations.push(_.toLower(cleaned.replace(/\s+/g, '-')));
        
        // Remove duplicates
        return _.uniq(variations).filter(v => v && v.length > 0);
    },
    
    exists(path) {
        if (!path) return false;
        
        if (this.cache.has(path)) {
            return this.cache.get(path);
        }
        
        const exists = _isFile(path);
        this.cache.set(path, exists);
        
        if (this.cache.size > MAX_FILE_CACHE) {
            this.cache.delete(this.cache.keys().next().value);
        }
        
        return exists;
    },
    
    isDirectory: _isFolder,
    
    getSubfolders(folder) {
        // Remove trailing backslash if present
        folder = folder.replace(/\\+$/, '');

        if (!_isFolder(folder)) {
            return [];
        }

        const subfolders = [];

        // Use FSO SubFolders enumerator — utils.FileTest(path, 'split') only
        // dissects a path into components and cannot enumerate directory contents.
        try {
            if (!_fso || !_fso.FolderExists(folder)) return [];
            const fldr   = _fso.GetFolder(folder);
            const subs   = new Enumerator(fldr.SubFolders);
            for (; !subs.atEnd(); subs.moveNext()) {
                subfolders.push(subs.item().Path);
            }
        } catch (e) {
            console.log('PanelArt: getSubfolders error:', e);
        }

        return subfolders;
    },
    
    enumSubfolders(folder, depth = 0, maxDepth = MAX_SUBFOLDER_DEPTH) {
        const folders = [folder];
        
        if (depth >= maxDepth || !_isFolder(folder)) {
            return folders;
        }
        
        const subfolders = this.getSubfolders(folder);
        
        _.forEach(subfolders, (subFolder) => {
            const deepFolders = this.enumSubfolders(subFolder, depth + 1, maxDepth);
            folders.push(...deepFolders);
        });
        
        return folders;
    },
    
    buildSearchPaths(folder, patterns, metadataNames = [], useVariations = false) {
        const paths = [];
        const allPatterns = [...patterns];
        
        // Add metadata names - either with variations or just sanitized
        _.forEach(metadataNames, (name) => {
            if (useVariations) {
                // Create multiple variations for better matching
                const variations = this.createSearchVariations(name);
                _.forEach(variations, (variant) => {
                    const sanitized = _fbSanitise(variant);
                    if (sanitized) allPatterns.push(sanitized);
                });
            } else {
                // Just sanitize and use directly
                const cleaned = this.sanitizeMetadata(name);
                const sanitized = _fbSanitise(cleaned);
                if (sanitized) allPatterns.push(sanitized);
            }
        });
        
        _.forEach(allPatterns, (pattern) => {
            _.forEach(EXTENSIONS, (ext) => {
                paths.push(folder + "\\" + pattern + ext);
            });
        });
        
        return paths;
    },
    
    findImageInPaths(paths) {
        return _.find(paths, path => this.exists(path)) || null;
    },
    
    matchesFolderName(folderPath, searchNames) {
        if (!folderPath || _.isEmpty(searchNames)) return false;
        
        const folderName = _.last(folderPath.split('\\'));
        const lowerFolderName = folderName.toLowerCase();
        // Also create normalized versions
        const folderDash = lowerFolderName.replace(/\s+/g, '-');
        const folderUnderscore = lowerFolderName.replace(/\s+/g, '_');
        
        return _.some(searchNames, (name) => {
            if (!name) return false;
            
            const lowerName = name.toLowerCase();
            
            // Direct comparison (exact match)
            if (lowerFolderName === lowerName || folderDash === lowerName || folderUnderscore === lowerName) {
                return true;
            }
            
            // Also check if folder contains the search term or vice versa
            if (lowerFolderName.includes(lowerName) || lowerName.includes(lowerFolderName) ||
                folderDash.includes(lowerName) || lowerName.includes(folderDash)) {
                return true;
            }
            
            return false;
        });
    },
    
    clear() {
        this.cache.clear();
    }
};

// ================= CUSTOM FOLDERS MANAGER =================
const CustomFolders = {
    folders: [],
    
    load() {
        try {
            const cfg = StateManager.get();
            const saved = cfg.customFolders || "";
            if (saved) {
                const parsed = JSON.parse(saved);
                if (_.isArray(parsed)) {
                    // Keep all valid string entries — do NOT filter by _isFolder() here.
                    // Folders on disconnected drives (USB, network shares) should persist
                    // so they work again when the drive is reconnected without the user
                    // having to re-add them.  Validity is checked at search time instead.
                    this.folders = _.filter(parsed, f => _.isString(f) && f.length > 0);
                }
            } else {
                this.folders = [];
            }
        } catch (e) {
            console.log("Error loading custom folders:", e);
            this.folders = [];
        }
    },
    
    save() {
        try {
            const cfg = StateManager.get();
            cfg.customFolders = JSON.stringify(this.folders);
            StateManager.save();
        } catch (e) {
            console.log("Error saving custom folders:", e);
        }
    },
    
    add(folder) {
        if (!folder || !_isFolder(folder)) return false;
        
        if (_.includes(this.folders, folder)) return false;
        
        if (this.folders.length >= MAX_CUSTOM_FOLDERS) {
            this.folders.shift();
        }
        
        this.folders.push(folder);
        this.save();
        return true;
    },
    
    remove(index) {
        if (_.inRange(index, 0, this.folders.length)) {
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

// ================= ART STATE (StateManager binding) =================
const ArtState = {
    _runtime: {
        loadToken: 0,        // Incremented on each new load request
        pendingArtToken: 0,  // Token when async art request was made
        
        images: {
            source: null,
            blur: null,
            currentMetadb: null,
            currentPath: '',
            folderPath: ''
        },
        
        text: {
            title: '',
            artist: '',
            extra: ''
        },
        
        fonts: {
            title: null,
            artist: null,
            extra: null,
            cache: new Map()
        },
        
        dimensions: {
            width: 0,
            height: 0
        },
        
        slider: {
            active: false,
            target: null,
            paddingActive: false
        },
        
        titleFormats: {
            title: fb.TitleFormat('%title%'),
            artist: fb.TitleFormat('%artist%'),
            album: fb.TitleFormat('%album%'),
            date: fb.TitleFormat('%date%'),
            length: fb.TitleFormat('%length%'),
            path: fb.TitleFormat("$directory_path(%path%)"),
            folder: fb.TitleFormat("$directory(%path%)")
        },
        
        timers: {
            blurRebuild: null,
            overlayRebuild: null,
            imageAnim: null,
            glitch: null
        },
        
        imageMode: false,
        imageImage: null,
        glitchFrame: 0,
        glitchEnabled: null,
        imageFolder: null,
        slideMode: false,
        slideImages: [],
        slideIndex: 0,
        slideImage: null,
        slideTimer: null
    },
    
    get images() { return this._runtime.images; },
    get text() { return this._runtime.text; },
    get fonts() { return this._runtime.fonts; },
    get dimensions() { return this._runtime.dimensions; },
    get slider() { return this._runtime.slider; },
    get timers() { return this._runtime.timers; },
    get titleFormats() { return this._runtime.titleFormats; },
    get loadToken() { return this._runtime.loadToken; },
    set loadToken(v) { this._runtime.loadToken = v; },
    get pendingArtToken() { return this._runtime.pendingArtToken; },
    set pendingArtToken(v) { this._runtime.pendingArtToken = v; },
    
    get imageMode() { return this._runtime.imageMode; },
    set imageMode(v) { this._runtime.imageMode = v; },
    get imageImage() { return this._runtime.imageImage; },
    set imageImage(v) { this._runtime.imageImage = v; },
    get glitchFrame() { return this._runtime.glitchFrame; },
    set glitchFrame(v) { this._runtime.glitchFrame = v; },
    get glitchEnabled() { return this._runtime.glitchEnabled; },
    set glitchEnabled(v) { this._runtime.glitchEnabled = v; },
    get imageFolder() { return this._runtime.imageFolder; },
    set imageFolder(v) { this._runtime.imageFolder = v; },
    get slideMode() { return this._runtime.slideMode; },
    set slideMode(v) { this._runtime.slideMode = v; },
    get slideImages() { return this._runtime.slideImages; },
    set slideImages(v) { this._runtime.slideImages = v; },
    get slideIndex() { return this._runtime.slideIndex; },
    set slideIndex(v) { this._runtime.slideIndex = v; },
    get slideImage() { return this._runtime.slideImage; },
    set slideImage(v) { this._runtime.slideImage = v; },
    get slideTimer() { return this._runtime.slideTimer; },
    set slideTimer(v) { this._runtime.slideTimer = v; }
};

const PanelArt = {
    get images() { return ArtState.images; },
    get text() { return ArtState.text; },
    get fonts() { return ArtState.fonts; },
    get dimensions() { return ArtState.dimensions; },
    get slider() { return ArtState.slider; },
    get timers() { return ArtState.timers; },
    get titleFormats() { return ArtState.titleFormats; },
    get imageMode() { return ArtState.imageMode; },
    set imageMode(v) { ArtState.imageMode = v; },
    get imageImage() { return ArtState.imageImage; },
    set imageImage(v) { ArtState.imageImage = v; },
    get glitchFrame() { return ArtState.glitchFrame; },
    set glitchFrame(v) { ArtState.glitchFrame = v; },
    get glitchEnabled() { return ArtState.glitchEnabled; },
    set glitchEnabled(v) { ArtState.glitchEnabled = v; },
    get imageFolder() { return ArtState.imageFolder; },
    set imageFolder(v) { ArtState.imageFolder = v; },
    get loadToken() { return ArtState.loadToken; },
    set loadToken(v) { ArtState.loadToken = v; },
    get pendingArtToken() { return ArtState.pendingArtToken; },
    set pendingArtToken(v) { ArtState.pendingArtToken = v; },
    get slideMode() { return ArtState.slideMode; },
    set slideMode(v) { ArtState.slideMode = v; },
    get slideImages() { return ArtState.slideImages; },
    set slideImages(v) { ArtState.slideImages = v; },
    get slideIndex() { return ArtState.slideIndex; },
    set slideIndex(v) { ArtState.slideIndex = v; },
    get slideImage() { return ArtState.slideImage; },
    set slideImage(v) { ArtState.slideImage = v; },
    get slideTimer() { return ArtState.slideTimer; },
    set slideTimer(v) { ArtState.slideTimer = v; },
    get cache() { return ArtCache; }
};

// ================= ART CACHE (UltraCache adapter) =================
const ArtCache = {
    _scaledCache: new Map(),
    _nextId: 0,
    
    textHeights: new Map(),
    
    getScaledImage(srcImg, targetW, targetH) {
        if (!srcImg || targetW <= 0 || targetH <= 0) return null;
    
        if (srcImg._id === undefined) srcImg._id = ArtCache._nextId++;
        const key = srcImg._id + ':' + targetW + 'x' + targetH;
        let entry = this._scaledCache.get(key);
        if (entry) {
            entry.refCount++;
            return entry.image;
        }
        // falls back gracefully.
        let scaled = null;
        try {
            scaled = srcImg.Resize(targetW, targetH);
        } catch (e) {
            console.log('ArtCache: Resize failed:', e);
            return null;
        }
        this._scaledCache.set(key, { image: scaled, refCount: 1 });
        if (this._scaledCache.size > 20) {
            // First pass: evict low-use entries and age down the rest.
            let evicted = false;
            for (const [k, v] of this._scaledCache) {
                if (v.refCount <= 1) {
                    try { v.image.Dispose(); } catch(e) {}
                    this._scaledCache.delete(k);
                    evicted = true;
                    if (this._scaledCache.size <= 20) break;
                } else {
                    v.refCount--;
                }
            }
            // Fallback: if nothing qualified for eviction (all still hot), force-evict
            // the oldest insertion-order entry so the cache cannot grow without bound.
            if (!evicted && this._scaledCache.size > 20) {
                const oldest = this._scaledCache.entries().next();
                if (!oldest.done) {
                    const [oldestKey, oldestVal] = oldest.value;
                    try { oldestVal.image.Dispose(); } catch(e) {}
                    this._scaledCache.delete(oldestKey);
                }
            }
        }
        return scaled;
    },
    
    clearScaledCache() {
        for (const [k, v] of this._scaledCache) {
            try { v.image.Dispose(); } catch(e) {}
        }
        this._scaledCache.clear();
    },
    
    clearTextHeights() {
        this.textHeights.clear();
    },
    
    clearAll() {
        this.clearScaledCache();
        this.clearTextHeights();
    }
};

const TextHeightCache = {
    getKey(text, font, width) {
        return `${text}\x00${font.Name}\x00${font.Size}\x00${font.Style}\x00${width}`;
    },
    
    get(text, font, width) {
        const key = this.getKey(text, font, width);
        return ArtCache.textHeights.get(key);
    },
    
    set(text, font, width, height) {
        const key = this.getKey(text, font, width);
        ArtCache.textHeights.set(key, height);
        
        if (ArtCache.textHeights.size > MAX_TEXT_HEIGHT_CACHE) {
            ArtCache.textHeights.delete(ArtCache.textHeights.keys().next().value);
        }
    },
    
    clear() {
        ArtCache.textHeights.clear();
    },
    
    calcTextHeight(gr, text, font, width) {
        const cached = this.get(text, font, width);
        if (!_.isUndefined(cached)) return cached;
        
        const height = Math.ceil(gr.CalcTextHeight(text, font, width));
        this.set(text, font, width, height);
        return height;
    }
};

// ================= REGION CONSTANTS =================
const Regions = {
    NONE: 0,
    FULL: 1,
    BACKGROUND: 2,
    ALBUM_ART: 4,
    TEXT: 8,
    OVERLAY: 16,
    SLIDERS: 32
};

// ================= ART CONTROLLER (logic) =================
const ArtController = {
    // Handle new track - load art and text
    onPlaybackNewTrack(metadb) {
        ImageManager.loadAlbumArt(metadb);
        runGlitchEffect();
    },
    
    // Handle stop
    onPlaybackStop(reason) {
        // reason: 0=user stop, 1=EOF/next, 2=starting new track
        if (reason !== 2) {
            if (reason === 0) {
                ImageManager.cleanup();
                ArtCache.clearScaledCache();
                TextManager.update(null);
            }
        }
        RepaintHelper.full();
    },
    
    // Handle panel resize
    onSize() {
        ArtState.dimensions.width = window.Width;
        ArtState.dimensions.height = window.Height;
        OverlayCache.invalidate();
        ArtCache.clearScaledCache();
        ImageManager.scheduleBlurRebuild();
        RepaintHelper.full();
    },
    
    // Handle mouse wheel for sliders
    onMouseWheel(delta) {
        if (!ArtState.slider.active) return;
        
        const cfg = StateManager.get();
        const keyMap = {
            "Reflection": "opReflection",
            "Glow": "opGlow",
            "Scanlines": "opScanlines",
            "Phosphor": "opPhosphor"
        };
        
        const key = keyMap[ArtState.slider.target];
        if (key) {
            cfg[key] = _.clamp(cfg[key] + delta * SLIDER_STEP, 0, 255);
            StateManager.apply(cfg, false, true, true);
            RepaintHelper.full();
            
            ArtState.timers.overlayRebuild = Utils.clearTimer(ArtState.timers.overlayRebuild);
            ArtState.timers.overlayRebuild = window.SetTimeout(() => {
                ArtState.timers.overlayRebuild = null;
                OverlayCache.invalidate();
                RepaintHelper.full();
            }, 100);
        }
        
        if (ArtState.slider.paddingActive) {
            cfg.albumArtPadding = _.clamp(cfg.albumArtPadding + delta * SLIDER_STEP, 0, 100);
            StateManager.apply(cfg, false, false, true);
            RepaintHelper.full();
        }
    },
    
    onMouseLbtnUp() {
        if (ArtState.slider.active) {
            ArtState.slider.active = false;
            ArtState.slider.target = null;
            ArtState.slider.paddingActive = false;
            RepaintHelper.full();
            return true;
        }
        return false;
    },
    
    // Cleanup on unload
    onUnload() {
        ArtState.timers.blurRebuild    = Utils.clearTimer(ArtState.timers.blurRebuild);
        ArtState.timers.overlayRebuild = Utils.clearTimer(ArtState.timers.overlayRebuild);
        ArtState.timers.imageAnim      = Utils.clearInterval(ArtState.timers.imageAnim);
        
        if (ArtState.timers.glitch) { 
            window.ClearInterval(ArtState.timers.glitch); 
            ArtState.timers.glitch = null; 
        }
        if (ArtState.slideTimer) { 
            window.ClearInterval(ArtState.slideTimer); 
            ArtState.slideTimer = null; 
        }
        if (ArtState.slideImage) { 
            try { ArtState.slideImage.Dispose(); } catch(e) {} 
            ArtState.slideImage = null; 
        }
        
        if (ArtState.imageImage) {
            try { ArtState.imageImage.Dispose(); } catch(e) {}
            ArtState.imageImage = null;
        }
    }
};

// ================= COMMAND BUS =================
// All user changes flow through here for centralized handling
const CommandBus = {
    _saveScheduled: false,
    _saveTimer: null,
    _listeners: new Map(),
    
    on(event, callback) {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, []);
        }
        this._listeners.get(event).push(callback);
    },
    
    emit(event, data) {
        const callbacks = this._listeners.get(event);
        if (callbacks) {
            callbacks.forEach(cb => cb(data));
        }
    },
    
    emitChange(region, data = {}) {
        this.emit('change', { region, ...data });
    },
    
    emitAction(action, data) {
        const cfg = StateManager.get();
        
        switch (action) {
            case 'setProperty':
                cfg[data.key] = data.value;
                this.emitChange(data.region || Regions.FULL);
                break;
            case 'toggle':
                cfg[data.key] = !cfg[data.key];
                this.emitChange(data.region || Regions.FULL);
                break;
            case 'customPhosphorColor':
                cfg.customPhosphorColor = data.color;
                cfg.currentPhosphorTheme = data.themeIndex;
                this.emitChange(Regions.OVERLAY);
                break;
            case 'imageFolder':
                cfg.imageFolder = data.folder;
                this.emitChange(Regions.FULL);
                break;
            case 'glitchToggle':
                cfg.glitchEnabled = !cfg.glitchEnabled;
                PanelArt.glitchEnabled = cfg.glitchEnabled; 
                this.emitChange(Regions.FULL);
                break;
            default:
                return;
        }
        
        this._scheduleSave();
        StateManager.apply(cfg, !!data.rebuildBlur);
    },
    
    _scheduleSave() {
        if (this._saveScheduled) return;
        this._saveScheduled = true;
        this._saveTimer = window.SetTimeout(() => {
            this._saveTimer = null;
            try {
                StateManager.save();
            } finally {
                this._saveScheduled = false;
            }
        }, 100);
    }
};

// ================= REACTIVE RENDERER =================
const ReactiveRenderer = {
    init() {
        CommandBus.on('change', (e) => this.onChange(e));
    },
    
    onChange(event) {
        const { region } = event;
        
        if (region === Regions.FULL || region === undefined) {
            RepaintHelper.full();
            return;
        }
        
        const dim = PanelArt.dimensions;
        const cfg = StateManager.get();
        const border = cfg.borderSize || 0;
        
        if (region & Regions.BACKGROUND) {
            RepaintHelper.region(0, 0, dim.width, dim.height);
        }
        if (region & Regions.ALBUM_ART) {
            RepaintHelper.region(border, border, Math.floor(dim.width * 0.5), dim.height - border * 2);
        }
        if (region & Regions.TEXT) {
            const artWidth = Math.floor(dim.width * 0.5);
            RepaintHelper.region(artWidth, border, dim.width - artWidth - border, dim.height - border * 2);
        }
        if (region & Regions.OVERLAY) {
            RepaintHelper.region(0, 0, dim.width, dim.height);
        }
        if (region & Regions.SLIDERS) {
            RepaintHelper.region(0, dim.height - 50, dim.width, 50);
        }
    }
};

// ================= UTILITY FUNCTIONS =================
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
    
    albumArt() {
        const dim = PanelArt.dimensions;
        const cfg = StateManager.get();
        const border = cfg.borderSize || 0;
        this.region(border, border, dim.width - border * 2, dim.height - border * 2);
    },
    
    text() {
        const dim = PanelArt.dimensions;
        const cfg = StateManager.get();
        const border = cfg.borderSize || 0;
        const artWidth = Math.floor(dim.width * 0.4);
        this.region(artWidth, border, dim.width - artWidth - border, dim.height - border * 2);
    }
};

const Utils = {
    disposeImage(img) {
        if (img && _.isFunction(img.Dispose)) {
            try {
                img.Dispose();
            } catch (e) {
                console.log("Error disposing image:", e);
            }
        }
        return null;
    },
    
    clamp: _.clamp,
    
    validateNumber(input, defaultValue, min, max) {
        const value = parseInt(input, 10);
        if (isNaN(value)) return defaultValue;
        return _.clamp(value, min, max);
    },
    
    getScaledImage(...args) { return ArtCache.getScaledImage(...args); },
    clearScaledCache() { ArtCache.clearScaledCache(); },
    
    clearTimer(timer) {
        if (timer) {
            window.ClearTimeout(timer);
        }
        return null;
    },
    
    clearInterval(timer) {
        if (timer) {
            window.ClearInterval(timer);
        }
        return null;
    }
};

// ================= FONT MANAGEMENT =================
const FontManager = {
    getFont(name, size, style) {
        const key = `${name}\x00${size}\x00${style}`;
        
        if (PanelArt.fonts.cache.has(key)) {
            const cached = PanelArt.fonts.cache.get(key);
            PanelArt.fonts.cache.delete(key);
            PanelArt.fonts.cache.set(key, cached);
            return cached;
        }
        
        try {
            const font = gdi.Font(name, size, style);
            PanelArt.fonts.cache.set(key, font);
            
            if (PanelArt.fonts.cache.size > MAX_FONT_CACHE) {
                const firstKey = PanelArt.fonts.cache.keys().next().value;
                const oldFont = PanelArt.fonts.cache.get(firstKey);
                if (oldFont && _.isFunction(oldFont.Dispose)) {
                    try {
                        oldFont.Dispose();
                    } catch (e) {
                        console.log("Error disposing old font:", e);
                    }
                }
                PanelArt.fonts.cache.delete(firstKey);
            }
            
            return font;
        } catch (e) {
            console.log("Error creating font:", e);
            return gdi.Font("Segoe UI", size, style);
        }
    },
    
    clearCache() {
        _.forEach(Array.from(PanelArt.fonts.cache.values()), (font) => {
            if (font && _.isFunction(font.Dispose)) {
                try {
                    font.Dispose();
                } catch (e) {
                    console.log("Error disposing font:", e);
                }
            }
        });
        PanelArt.fonts.cache.clear();
    },
    
    rebuildFonts() {
        this.clearCache();
        const fl = PanelArt.fonts;
        if (fl.title  && typeof fl.title.Dispose  === 'function') { try { fl.title.Dispose();  } catch (e) {} }
        if (fl.artist && typeof fl.artist.Dispose === 'function') { try { fl.artist.Dispose(); } catch (e) {} }
        if (fl.extra  && typeof fl.extra.Dispose  === 'function') { try { fl.extra.Dispose();  } catch (e) {} }
        fl.title = null;
        fl.artist = null;
        fl.extra = null;
        const cfg = StateManager.get();
        
        try {
            PanelArt.fonts.title = gdi.Font(cfg.titleFontName, cfg.titleFontSize, 1);
            PanelArt.fonts.artist = gdi.Font(cfg.artistFontName, cfg.artistFontSize, 0);
            PanelArt.fonts.extra = gdi.Font(cfg.extraFontName, cfg.extraFontSize, 0);
        } catch (e) {
            console.log("Error building fonts:", e);
            PanelArt.fonts.title = gdi.Font("Segoe UI", 42, 1);
            PanelArt.fonts.artist = gdi.Font("Segoe UI", 28, 0);
            PanelArt.fonts.extra = gdi.Font("Segoe UI", 20, 0);
        }
    }
};

// ================= TEXT MANAGEMENT =================
const TextManager = {
    update(metadb) {
        if (metadb === undefined) return;
        
        const track = metadb;
        if (!track) {
            PanelArt.text.title = 'No track playing';
            PanelArt.text.artist = '';
            PanelArt.text.extra = '';
            TextHeightCache.clear();
            return;
        }
        
        const tf = PanelArt.titleFormats;
        const newTitle = tf.title.EvalWithMetadb(track);
        const newArtist = tf.artist.EvalWithMetadb(track);
        
        if (newTitle !== PanelArt.text.title || newArtist !== PanelArt.text.artist) {
            TextHeightCache.clear();
        }
        
        PanelArt.text.title = newTitle;
        PanelArt.text.artist = newArtist;
        PanelArt.text.extra = '';
        
        if (StateManager.get().extraInfoEnabled) {
            const album = tf.album.EvalWithMetadb(track);
            const date = tf.date.EvalWithMetadb(track);
            const length = tf.length.EvalWithMetadb(track);
            
            const parts = _.compact([album, date, length]);
            PanelArt.text.extra = parts.join(' | ');
        }
    },
    
    scaleAndClip(gr, maxWidth, maxHeight) {
        const text = PanelArt.text;
        const fonts = PanelArt.fonts;

        const fitToWidth = (font, textContent) => {
            if (!textContent || !font) return font;
            if (gr.CalcTextWidth(textContent, font) <= maxWidth) return font;
            let lo = MIN_FONT_SIZE, hi = font.Size;
            while (lo < hi) {
                const mid = (lo + hi + 1) >> 1;
                if (gr.CalcTextWidth(textContent, FontManager.getFont(font.Name, mid, font.Style)) <= maxWidth) {
                    lo = mid;
                } else {
                    hi = mid - 1;
                }
            }
            return FontManager.getFont(font.Name, lo, font.Style);
        };
        
        let titleFont  = fitToWidth(fonts.title,  text.title);
        let artistFont = fitToWidth(fonts.artist, text.artist);
        let extraFont  = (StateManager.get().extraInfoEnabled && text.extra)
            ? fitToWidth(fonts.extra, text.extra) : null;
        
        // calcTotalHeight() is memoised by TextHeightCache so repeated invocations
        // during the height-fit loop are cheap after the first call per key tuple.
        const calcTotalHeight = () => {
            let total = TextHeightCache.calcTextHeight(gr, text.title, titleFont, maxWidth);
            total += GAP_TITLE_ARTIST;
            total += TextHeightCache.calcTextHeight(gr, text.artist, artistFont, maxWidth);
            
            if (extraFont) {
                total += GAP_ARTIST_EXTRA;
                total += TextHeightCache.calcTextHeight(gr, text.extra, extraFont, maxWidth);
            }
            
            return total;
        };
        
        // Shrink all fonts together until they fit the available height.
        // Still linear but only runs when the combined height is too tall for the panel
        // (uncommon), and the earlier width fit already reduced each font's ceiling.
        while (calcTotalHeight() > maxHeight && 
               (titleFont.Size > MIN_FONT_SIZE || artistFont.Size > MIN_FONT_SIZE || 
                (extraFont && extraFont.Size > MIN_FONT_SIZE))) {
            
            if (titleFont.Size > MIN_FONT_SIZE) {
                titleFont = FontManager.getFont(titleFont.Name, titleFont.Size - 1, titleFont.Style);
            }
            if (artistFont.Size > MIN_FONT_SIZE) {
                artistFont = FontManager.getFont(artistFont.Name, artistFont.Size - 1, artistFont.Style);
            }
            if (extraFont && extraFont.Size > MIN_FONT_SIZE) {
                extraFont = FontManager.getFont(extraFont.Name, extraFont.Size - 1, extraFont.Style);
            }
        }
        
        return {
            titleFont: titleFont,
            artistFont: artistFont,
            extraFont: extraFont,
            titleText: this.clipText(gr, text.title, titleFont, maxWidth),
            artistText: this.clipText(gr, text.artist, artistFont, maxWidth),
            extraText: extraFont ? this.clipText(gr, text.extra, extraFont, maxWidth) : null
        };
    },
    
    // Kept for API compatibility; delegates to the binary-search path used by scaleAndClip.
    scaleToWidth(gr, textContent, font, maxWidth) {
        if (!textContent || !font) return font;
        if (gr.CalcTextWidth(textContent, font) <= maxWidth) return font;
        let lo = MIN_FONT_SIZE, hi = font.Size;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (gr.CalcTextWidth(textContent, FontManager.getFont(font.Name, mid, font.Style)) <= maxWidth) {
                lo = mid;
            } else {
                hi = mid - 1;
            }
        }
        return FontManager.getFont(font.Name, lo, font.Style);
    },
    
    clipText(gr, textContent, font, maxWidth) {
        if (!textContent || !font) return "";
        
        if (gr.CalcTextWidth(textContent, font) <= maxWidth) return textContent;
        
        // Binary search for the longest prefix that fits with an ellipsis appended.
        let lo = 0;
        let hi = textContent.length;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (gr.CalcTextWidth(textContent.substring(0, mid) + '\u2026', font) <= maxWidth) {
                lo = mid;
            } else {
                hi = mid - 1;
            }
        }
        return textContent.substring(0, lo) + '\u2026';
    }
};

// Title-case helper — hoisted to avoid re-creating on each searchForCover call.
function _toTitleCase(str) {
    return str.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());
}

// ================= IMAGE SEARCH =================
const ImageSearch = {
    _pathCache: new Map(),
    
    clearCache() {
        this._pathCache.clear();
    },
    
    getMetadataNames(metadb) {
        const tf = PanelArt.titleFormats;
        const artist = tf.artist.EvalWithMetadb(metadb);
        const album  = tf.album.EvalWithMetadb(metadb);
        const title  = tf.title.EvalWithMetadb(metadb);
        const folder = tf.folder.EvalWithMetadb(metadb);
        
        const artistTitle = (artist && title) ? `${artist} - ${title}` : "";
        const artistAlbum = (artist && album) ? `${artist} - ${album}` : "";
        
        return { artist, album, title, folder, artistTitle, artistAlbum };
    },
    
    // Parse JSON file - only handles Last.fm format now
    parseJsonArtwork(jsonPath, baseFolder) {
        try {
            if (!_isFile(jsonPath)) return null;
            
            // Read and parse JSON file
            const content = utils.ReadUTF8(jsonPath);
            if (!content) return null;
            
            const data = JSON.parse(content);
            if (!data || !_.isObject(data)) return null;
            
            // Detect Last.fm JSON format
            const isLastFm = this.isLastFmFormat(data, jsonPath);
            
            if (isLastFm) {
                // Search for local artwork in the same folder as the JSON file.
                return this.searchLocalArtworkInFolder(baseFolder);
            }
            
            // Not Last.fm format - skip
            return null;
        } catch (e) {
            console.log("Error parsing JSON file:", jsonPath, e);
            return null;
        }
    },
    
    // Detect Last.fm JSON format
    isLastFmFormat(data, jsonPath) {
        // Check filename
        const filename = _.toLower(jsonPath.split('\\').pop());
        if (_.includes(filename, 'lastfm')) return true;
        
        // Check for Last.fm API structure
        if (data.similarartists || data.artist || data.album) {
            // Check for Last.fm URL patterns
            if (data.url && _.isString(data.url) && _.includes(data.url, 'last.fm')) {
                return true;
            }
            
            // Check for nested Last.fm structures
            if (data.similarartists && data.similarartists.artist) return true;
            if (data.artist && _.isArray(data.artist)) {
                const firstArtist = _.first(data.artist);
                if (firstArtist && firstArtist.url && _.includes(firstArtist.url, 'last.fm')) {
                    return true;
                }
            }
        }
        
        return false;
    },
    
    // Search for local artwork files using standard patterns
    searchLocalArtworkInFolder(folder) {
        // Use standard cover patterns to find local files
        const paths = FileManager.buildSearchPaths(folder, COVER_PATTERNS, []);
        const found = FileManager.findImageInPaths(paths);
        return found;
    },
    
    // Search for JSON artwork files in a folder
    searchJsonArtwork(folder) {
        for (const jsonFile of JSON_ART_FILES) {
            const jsonPath = folder + '\\' + jsonFile;
            const artPath = this.parseJsonArtwork(jsonPath, folder);
            if (artPath) return artPath;
        }
        return null;
    },
    
    searchInFolder(folder, patterns, metadata, useVariations = false) {
        // PRIORITY 1: Check for Last.fm JSON artwork files first
        const jsonArt = this.searchJsonArtwork(folder);
        if (jsonArt) return jsonArt;
        
        // PRIORITY 2: Standard image search with sanitized metadata
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
            metadata.album,
            metadata.artist,
            metadata.title,
            metadata.folder,
            metadata.artistAlbum,
            artistTitle,
            albumTitle,
            artistAlbumTitle
        ]);
        
        const paths = FileManager.buildSearchPaths(folder, patterns, metadataNames, useVariations);
        return FileManager.findImageInPaths(paths);
    },
    
    searchInFolderAnyFile(folder, patterns) {
        // Check standard image files
        const paths = FileManager.buildSearchPaths(folder, patterns, []);
        return FileManager.findImageInPaths(paths);
    },
    
    // Search a folder tree up to maxLevels deep for any image file
    _searchFolderTree(folder, patterns, maxLevels) {
        if (maxLevels <= 0 || !folder) return null;
        
        // First check current folder
        const found = this.searchInFolderAnyFile(folder, patterns);
        if (found) return found;
        
        // Then check subfolders up to maxLevels
        const subfolders = FileManager.getSubfolders(folder);
        for (const sub of subfolders) {
            const result = this._searchFolderTree(sub, patterns, maxLevels - 1);
            if (result) return result;
        }
        
        return null;
    },
    
    // Search a folder tree up to maxLevels deep for name-matched image files
    _searchFolderTreeNameMatch(folder, patterns, metadata, maxLevels) {
        if (maxLevels <= 0 || !folder) return null;
        
        // First check current folder for name-matched images
        const found = this.searchInFolder(folder, patterns, metadata, true);
        if (found) return found;
        
        // Then check subfolders up to maxLevels
        const subfolders = FileManager.getSubfolders(folder);
        for (const sub of subfolders) {
            const result = this._searchFolderTreeNameMatch(sub, patterns, metadata, maxLevels - 1);
            if (result) return result;
        }
        
        return null;
    },
    
    searchForCover(metadb, baseFolder) {
        // Check cache first
        if (this._pathCache.has(baseFolder)) {
            return this._pathCache.get(baseFolder);
        }
        
        const metadata = this.getMetadataNames(metadb);
        
        // ===== PHASE 1: Search in current track's folder tree =====
        
        // 1A. Search track folder for metadata-named files (no variations, exact match)
        const trackFolderMatch = this.searchInFolder(baseFolder, COVER_PATTERNS, metadata, false);
        if (trackFolderMatch) {
            this._pathCache.set(baseFolder, trackFolderMatch);
            return trackFolderMatch;
        }
        
        // 1B. Search track folder for any image file
        const trackAnyMatch = this.searchInFolderAnyFile(baseFolder, COVER_PATTERNS);
        if (trackAnyMatch) {
            this._pathCache.set(baseFolder, trackAnyMatch);
            return trackAnyMatch;
        }
        
        // 1C. Search track folder subfolders (up to 2 levels deep) for any image file
        const trackSubMatch = this._searchFolderTree(baseFolder, COVER_PATTERNS, 2);
        if (trackSubMatch) {
            this._pathCache.set(baseFolder, trackSubMatch);
            return trackSubMatch;
        }
        
        // ===== PHASE 2: Custom folder search =====
        // Create search names: title, artist, album, artist album (space and dash variants)
        const artistAlbumDash  = (metadata.artist && metadata.album)
            ? metadata.artist + ' - ' + metadata.album
            : '';
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
        if (customFolders.length === 0) {
            this._pathCache.set(baseFolder, null);
            return null;
        }
        
        // Search custom folder root for name-matched images
        for (const customFolder of customFolders) {
            if (!FileManager.isDirectory(customFolder)) continue;
            
            const nameMatched = this.searchInFolder(customFolder, COVER_PATTERNS, metadata, true);
            if (nameMatched) {
                this._pathCache.set(baseFolder, nameMatched);
                return nameMatched;
            }
        }
        
        // Search each custom folder for matching subfolders, then search inside them
        for (const customFolder of customFolders) {
            if (!FileManager.isDirectory(customFolder)) continue;
            
            // Get all subfolders (level 1 and level 2)
            const level1 = FileManager.getSubfolders(customFolder);
            
            for (const sub1 of level1) {
                const sub1Name = _.last(sub1.split('\\')).toLowerCase();
                
                const match1 = folderMatchNames.some(n => 
                    sub1Name === n || sub1Name.includes(n) || n.includes(sub1Name) ||
                    sub1Name.replace(/\s+/g, '-') === n ||
                    sub1Name.replace(/\s+/g, '_') === n
                );
                
                if (match1) {
                    // Search inside matching folder for images (includes artist - album.ext filenames)
                    const img = this.searchInFolder(sub1, COVER_PATTERNS, metadata, true)
                             || this.searchInFolderAnyFile(sub1, COVER_PATTERNS);
                    if (img) {
                        this._pathCache.set(baseFolder, img);
                        return img;
                    }
                    
                    // Also check subfolders inside
                    const sub1Folders = FileManager.getSubfolders(sub1);
                    for (const subSub of sub1Folders) {
                        const sImg = this.searchInFolder(subSub, COVER_PATTERNS, metadata, true)
                                  || this.searchInFolderAnyFile(subSub, COVER_PATTERNS);
                        if (sImg) {
                            this._pathCache.set(baseFolder, sImg);
                            return sImg;
                        }
                    }
                }
                
                // Check level 2 folders
                const level2 = FileManager.getSubfolders(sub1);
                for (const sub2 of level2) {
                    const sub2Name = _.last(sub2.split('\\')).toLowerCase();
                    const match2 = folderMatchNames.some(n => 
                        sub2Name === n || sub2Name.includes(n) || n.includes(sub2Name) ||
                        sub2Name.replace(/\s+/g, '-') === n ||
                        sub2Name.replace(/\s+/g, '_') === n
                    );
                    
                    if (match2) {
                        const img = this.searchInFolder(sub2, COVER_PATTERNS, metadata, true)
                                 || this.searchInFolderAnyFile(sub2, COVER_PATTERNS);
                        if (img) {
                            this._pathCache.set(baseFolder, img);
                            return img;
                        }
                    }
                }
            }
        }
        
        // Cache the null result to avoid repeated searches
        this._pathCache.set(baseFolder, null);
        return null;
    }
};


// ================= BLUR CACHE =================
const BlurCache = {
    _cache: new Map(),    // insertion-ordered Map used as LRU (oldest first)
    _srcIdCounter: 0,

    _makeKey(src, w, h, radius) {
        const srcId = (src && src._srcId !== undefined) ? src._srcId : 'none';
        return `${srcId}|${radius}|${w}|${h}`;
    },

    // Returns the blurred GDI+ bitmap, from cache or freshly built.
    getOrBuild(w, h, src, radius) {
        // A radius of 0 means "no blur" — skip the expensive CreateImage+DrawImage path.
        if (!src || radius <= 0 || w <= 0 || h <= 0) return null;

        const key = this._makeKey(src, w, h, radius);

        if (this._cache.has(key)) {
            const cached = this._cache.get(key);
            this._cache.delete(key);
            this._cache.set(key, cached);
            return cached;
        }

        // Evict oldest entry if at capacity
        if (this._cache.size >= MAX_BG_CACHE) {
            const oldestKey = this._cache.keys().next().value;
            const oldest    = this._cache.get(oldestKey);
            if (oldest && typeof oldest.Dispose === 'function') {
                try { oldest.Dispose(); } catch (e) {}
            }
            this._cache.delete(oldestKey);
        }

        let g = null;
        let newImg = null;
        try {
            newImg = gdi.CreateImage(w, h);
            g = newImg.GetGraphics();
            g.DrawImage(src, 0, 0, w, h, 0, 0, src.Width, src.Height);
            newImg.ReleaseGraphics(g);
            g = null;                       // released — don't release again in finally
            newImg.StackBlur(radius);
            this._cache.set(key, newImg);
            newImg = null;                  // ownership transferred to cache — don't dispose in finally
            return this._cache.get(key);
        } catch (e) {
            console.log('PanelArt: BlurCache build error:', e);
            return null;
        } finally {
            if (g) {
                try { if (newImg) newImg.ReleaseGraphics(g); } catch (e2) {}
            }
            if (newImg) {
                try { newImg.Dispose(); } catch (e2) {}
            }
        }
    },

    // Dispose every cached bitmap (playback stop, script unload).
    dispose() {
        this._cache.forEach((bitmap) => {
            if (bitmap && typeof bitmap.Dispose === 'function') {
                try { bitmap.Dispose(); } catch (e) {}
            }
        });
        this._cache.clear();
    }
};

const ImageManager = {
    loadAlbumArt(metadb) {
        if (!metadb) return;
        
        const track = metadb;
        
        const folderPath = PanelArt.titleFormats.path.EvalWithMetadb(track);
        
        // Skip if same album AND art is already loaded — keep existing art and blur.
        // NOTE: intentionally does NOT skip when images.source is null (e.g. after a
        // playback-stop flush) even if the folder path matches — we must reload in that case.
        if (PanelArt.images.source && PanelArt.images.folderPath === folderPath) {
            TextManager.update(track);
            RepaintHelper.text(); // Repaint text area only
            return;
        }
        
        // Increment token — any stale async responses will be discarded.
        // Only done here, AFTER the same-folder no-op guard, so text-only refreshes
        // do not invalidate a pending async art response.
        PanelArt.loadToken++;
        
        // Clear stale artwork — blur is a BlurCache alias; setting null is sufficient (BlurCache retains ownership).
        PanelArt.images.source = Utils.disposeImage(PanelArt.images.source);
        PanelArt.images.blur = null;
        PanelArt.images.currentMetadb = null;
        PanelArt.images.currentPath = '';
        PanelArt.images.folderPath = folderPath;
        
        // Clear scaled image cache on new album
        Utils.clearScaledCache();
        
        TextManager.update(track);
        
        const foundPath = ImageSearch.searchForCover(track, folderPath);
        
        // Use queue to prevent disk bursts
        if (foundPath && FileManager.exists(foundPath)) {
            const pathToLoad = foundPath;
            ArtQueue.enqueue((done) => {
                
                let art = null;
                try {
                    art = gdi.Image(pathToLoad);
                } catch (e) {
                    console.log("Failed to load image from path:", pathToLoad, e);
                }
                
                if (art) {
                    PanelArt.images.source = art;
                    if (art._srcId === undefined) art._srcId = BlurCache._srcIdCounter++;
                    PanelArt.images.currentPath = pathToLoad;
                    OverlayCache.invalidate();
                    ImageManager.scheduleBlurRebuild();
                    RepaintHelper.full();
                } else {
                    // Fall back to async
                    PanelArt.images.currentMetadb = track;
                    PanelArt.pendingArtToken = PanelArt.loadToken;
                    utils.GetAlbumArtAsync(window.ID, track, 0);
                }
                done();
            });
            return;
        }
        
        // No local art - fall back to foobar's async art lookup
        PanelArt.images.currentMetadb = track;
        PanelArt.pendingArtToken = PanelArt.loadToken;
        utils.GetAlbumArtAsync(window.ID, track, 0);
    },
    
    buildBlur() {
        const img = PanelArt.images;
        const dim = PanelArt.dimensions;
        const cfg = StateManager.get();

        if (!cfg.blurEnabled || dim.width <= 0 || dim.height <= 0) {
            img.blur = null;
            return;
        }

        if (!cfg.backgroundEnabled || !img.source) {
            img.blur = null;
            return;
        }

        img.blur = BlurCache.getOrBuild(dim.width, dim.height, img.source, cfg.blurRadius);
    },
    
    scheduleBlurRebuild() {
        PanelArt.timers.blurRebuild = Utils.clearTimer(PanelArt.timers.blurRebuild);
        PanelArt.timers.blurRebuild = window.SetTimeout(() => {
            this.buildBlur();
            RepaintHelper.full();
        }, BLUR_DEBOUNCE_MS);
    },
    
    cleanup() {
        PanelArt.images.source = Utils.disposeImage(PanelArt.images.source);
        PanelArt.images.blur   = null;
        BlurCache.dispose();
        Utils.clearScaledCache();
    }
};

// ================= OVERLAY CACHE =================
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
    
    // artInfo and textArea passed in from on_paint so glow knows where to draw
    build(w, h, artInfo, textArea) {
        this.dispose();
        const cfg = StateManager.get();
        
        const needsAny = !cfg.overlayAllOff && (
            (cfg.showGlow        && cfg.opGlow > 0)       ||
            (cfg.showScanlines   && cfg.opScanlines > 0)  ||
            (cfg.showReflection  && cfg.opReflection > 0) ||
            (cfg.showPhosphor    && cfg.opPhosphor > 0)
        );
        
        this.valid = true;   // mark valid whether or not we build an image
        if (!needsAny || w <= 0 || h <= 0) return;
        
        let g = null;
        try {
            this.img = gdi.CreateImage(w, h);
            g = this.img.GetGraphics();
            
            // ---- Scanlines (dark rows) ----
            if (cfg.showScanlines && cfg.opScanlines > 0) {
                const col = PanelArt_SetAlpha(PA_BLACK, cfg.opScanlines);
                for (let y = 0; y < h; y += SCANLINE_SPACING) {
                    g.FillSolidRect(0, y, w, 1, col);
                }
            }
            
            // ---- Glow (ellipses around art and text) ----
            if (cfg.showGlow && cfg.opGlow > 0) {
                const white = PA_WHITE;
                const op = cfg.opGlow;
                
                if (artInfo && artInfo.artW > 0 && cfg.albumArtEnabled) {
                    const cx = artInfo.artX + artInfo.artW / 2;
                    const cy = artInfo.artY + artInfo.artH / 2;
                    const maxR = Math.max(artInfo.artW, artInfo.artH) * 0.75;
                    const steps = 30;
                    const minStep = Math.min(steps - 1, Math.ceil(1 / (op * 0.05)));
                    for (let i = minStep; i < steps; i++) {
                        const progress = i / steps;
                        const alpha = Math.floor(op * progress * 0.05);
                        if (alpha <= 0) continue;
                        const r = maxR * (1 - progress);
                        g.FillEllipse(cx - r, cy - r, r * 2, r * 2, PanelArt_SetAlpha(white, alpha));
                    }
                }
                
                if (textArea && textArea.textW > 0) {
                    const cx = textArea.textX + textArea.textW / 2;
                    const cy = textArea.textY + textArea.textH / 2;
                    const maxR = Math.max(textArea.textW, textArea.textH);
                    const steps = 25;
                    const minStep = Math.min(steps - 1, Math.ceil(1 / (op * 0.03)));
                    for (let i = minStep; i < steps; i++) {
                        const progress = i / steps;
                        const alpha = Math.floor(op * progress * 0.03);
                        if (alpha <= 0) continue;
                        const r = maxR * (1 - progress);
                        g.FillEllipse(cx - r, cy - r, r * 2, r * 2, PanelArt_SetAlpha(white, alpha));
                    }
                }
            }
            
            // ---- Reflection (smoothstep gradient from top) ----
            if (cfg.showReflection && cfg.opReflection > 0) {
                const reflH = Math.floor(h * REFLECTION_HEIGHT_RATIO);
                let lastAlpha = -1;
                let bandStart = 0;
                for (let y = 0; y < reflH; y++) {
                    const t = 1 - (y / reflH);
                    const s = t * t * (3 - 2 * t);
                    const alpha = Math.floor(cfg.opReflection * s * 0.65);
                    if (alpha !== lastAlpha) {
                        if (lastAlpha > 0 && y > bandStart) {
                            g.FillSolidRect(0, bandStart, w, y - bandStart, PanelArt_SetAlpha(PA_WHITE, lastAlpha));
                        }
                        lastAlpha = alpha;
                        bandStart = y;
                    }
                }
                if (lastAlpha > 0) {
                    g.FillSolidRect(0, bandStart, w, reflH - bandStart, PanelArt_SetAlpha(PA_WHITE, lastAlpha));
                }
            }

            // ---- Phosphor (horizontal tint rows — interleaved with scanlines) ----
            if (cfg.showPhosphor && cfg.opPhosphor > 0) {
                const themeColor = PhosphorManager.getColor();
                const pr = (themeColor >>> 16) & 255;
                const pg = (themeColor >>>  8) & 255;
                const pb =  themeColor         & 255;
                const phosphorCol = PanelArt_SetAlpha(
                    _RGB(Math.floor(pr * 0.5 + 127), Math.floor(pg * 0.5 + 127), Math.floor(pb * 0.5 + 127)),
                    cfg.opPhosphor
                );
                for (let y = 1; y < h; y += SCANLINE_SPACING) {
                    g.FillSolidRect(0, y, w, 1, phosphorCol);
                }
            }
        } catch (e) {
            console.log("Overlay cache build error:", e);
            // img may be partially built — release graphics before dispose clears it.
        } finally {
            if (g && this.img) {
                try { this.img.ReleaseGraphics(g); } catch (e2) {}
            }
        }
    }
};


const Renderer = {
    _sliderFont: null,
    
    getSliderFont() {
        if (!this._sliderFont) {
            this._sliderFont = gdi.Font("Segoe UI", 16, 0);
        }
        return this._sliderFont;
    },
    drawBackground(gr) {
        const dim = PanelArt.dimensions;
        const img = PanelArt.images;
        const cfg = StateManager.get();
        
        try {
            gr.FillSolidRect(0, 0, dim.width, dim.height, cfg.customBackgroundColor);
            if (cfg.backgroundEnabled && cfg.blurEnabled && img.blur) {
                gr.DrawImage(img.blur, 0, 0, dim.width, dim.height, 0, 0, img.blur.Width, img.blur.Height);
            }
            
            if (cfg.darkenValue > 0) {
                const alpha = Math.floor(cfg.darkenValue * DARKEN_ALPHA_MULTIPLIER);
                gr.FillSolidRect(0, 0, dim.width, dim.height, PanelArt_SetAlpha(PA_BLACK, alpha));
            }
        } catch (e) {
            console.log("Error drawing background:", e);
        }
    },
    
    drawAlbumArt(gr) {
        const img = PanelArt.images.source;
        const cfg = StateManager.get();
        const dim = PanelArt.dimensions;
        
        if (!img || !cfg.albumArtEnabled) {
            return { artX: 0, artY: 0, artW: 0, artH: 0 };
        }
        
        try {
            const basePad = cfg.albumArtPadding ?? 0;
            const availW = dim.width;
            const availH = dim.height;
            const panelAspect = availW / availH;
            
            let artW = 0, artH = 0, artX = 0, artY = 0;
            let pad = basePad;
            
            if (cfg.albumArtFloat === "left" || cfg.albumArtFloat === "right") {
                let maxRatio = ALBUM_ART_MAX_WIDTH_RATIO;
                if (panelAspect > 1.5) {
                    maxRatio = 0.70;
                } else if (panelAspect < 1.0) {
                    maxRatio = 0.60;
                }
                
                const maxArtW = (availW * maxRatio) - pad * 2;
                const drawableH = availH - pad * 2;
                
                const scale = Math.min(maxArtW / img.Width, drawableH / img.Height);
                let scaledW = Math.floor(img.Width * scale);
                let scaledH = Math.floor(img.Height * scale);
                
                const artScreenRatio = scaledW / availW;
                if (artScreenRatio < 0.35 && pad > 0) {
                    const padReduction = Math.max(0, 1 - (artScreenRatio / 0.35));
                    pad = Math.floor(basePad * (1 - padReduction * 0.7));
                    
                    const newMaxArtW = (availW * maxRatio) - pad * 2;
                    const newDrawableH = availH - pad * 2;
                    const newScale = Math.min(newMaxArtW / img.Width, newDrawableH / img.Height);
                    scaledW = Math.floor(img.Width * newScale);
                    scaledH = Math.floor(img.Height * newScale);
                }
                
                artW = scaledW + pad * 2;
                artH = availH;
                
                artY = Math.floor((availH - scaledH) / 2);
                artX = (cfg.albumArtFloat === "left") ? pad : dim.width - artW + pad;
                
                const scaledImg = Utils.getScaledImage(img, scaledW, scaledH);
                if (scaledImg) {
                    gr.DrawImage(scaledImg, artX, artY, scaledW, scaledH, 0, 0, scaledW, scaledH);
                }
                
            } else if (cfg.albumArtFloat === "top" || cfg.albumArtFloat === "bottom") {
                const maxRatio = 0.75;
                const maxArtH = (availH * maxRatio) - pad * 2;
                const drawableW = availW - pad * 2;
                
                const scale = Math.min(drawableW / img.Width, maxArtH / img.Height);
                let scaledW = Math.floor(img.Width * scale);
                let scaledH = Math.floor(img.Height * scale);
                
                const minScaledH = Math.floor((availH * ALBUM_ART_MIN_HEIGHT_RATIO) - pad * 2);
                if (scaledH < minScaledH) {
                    scaledH = minScaledH;
                    scaledW = Math.floor(img.Width * (scaledH / img.Height));
                }
                
                const artScreenRatio = scaledH / availH;
                if (artScreenRatio < 0.35 && pad > 0) {
                    const padReduction = Math.max(0, 1 - (artScreenRatio / 0.35));
                    pad = Math.floor(basePad * (1 - padReduction * 0.4));
                    
                    const newMaxArtH = (availH * maxRatio) - pad * 2;
                    const newDrawableW = availW - pad * 2;
                    const newScale = Math.min(newDrawableW / img.Width, newMaxArtH / img.Height);
                    scaledW = Math.floor(img.Width * newScale);
                    scaledH = Math.floor(img.Height * newScale);
                    
                    const newMinScaledH = Math.floor((availH * ALBUM_ART_MIN_HEIGHT_RATIO) - pad * 2);
                    if (scaledH < newMinScaledH) {
                        scaledH = newMinScaledH;
                        scaledW = Math.floor(img.Width * (scaledH / img.Height));
                    }
                }
                
                artW = availW;
                artH = scaledH + pad * 2;
                
                artX = Math.floor((availW - scaledW) / 2);
                artY = (cfg.albumArtFloat === "top") ? pad : dim.height - artH + pad;
                
                const scaledImg = Utils.getScaledImage(img, scaledW, scaledH);
                if (scaledImg) {
                    gr.DrawImage(scaledImg, artX, artY, scaledW, scaledH, 0, 0, scaledW, scaledH);
                }
            }
            
            return { artX, artY, artW, artH, actualPad: pad };
        } catch (e) {
            console.log("Error drawing album art:", e);
            return { artX: 0, artY: 0, artW: 0, artH: 0, actualPad: 0 };
        }
    },
    
    getTextArea(artInfo) {
        const cfg = StateManager.get();
        const dim = PanelArt.dimensions;
        const overlayPad = DEFAULT_OVERLAY_PADDING;
        const borderPad = cfg.borderSize || 0;
        
        let textX = borderPad;
        let textY = borderPad;
        let textW = dim.width - borderPad * 2;
        let textH = dim.height - borderPad * 2;
        
        if (!cfg.albumArtEnabled || !PanelArt.images.source) {
            return { textX, textY, textW, textH };
        }
        
        const { artW, artH, actualPad = 0 } = artInfo;
        
        if (cfg.albumArtFloat === "left" || cfg.albumArtFloat === "right") {
            if (cfg.albumArtFloat === "left") {
                textX = artW + overlayPad - (actualPad * 0.5);
                textW = dim.width - artW - overlayPad + (actualPad * 0.5) - borderPad;
            } else {
                textX = borderPad;
                textW = dim.width - artW - overlayPad + (actualPad * 0.5) - borderPad;
            }
            textY = borderPad;
            textH = dim.height - borderPad * 2;
            
        } else if (cfg.albumArtFloat === "top" || cfg.albumArtFloat === "bottom") {
            textX = borderPad;
            textW = dim.width - borderPad * 2;
            
            if (cfg.albumArtFloat === "top") {
                textY = borderPad + artH + overlayPad - (actualPad * 0.5);
                textH = dim.height - borderPad * 2 - artH - overlayPad + (actualPad * 0.5);
            } else {
                textY = borderPad;
                textH = dim.height - borderPad * 2 - artH - overlayPad + (actualPad * 0.5);
            }
        }
        
        return { textX, textY, textW, textH };
    },
    
    drawText(gr, textArea) {
        try {
            const { textX, textY, textW, textH } = textArea;
            const cfg = StateManager.get();
            
            const scaled = TextManager.scaleAndClip(gr, textW, textH);
            const { titleFont, artistFont, extraFont, titleText, artistText, extraText } = scaled;
            
            const titleH = TextHeightCache.calcTextHeight(gr, titleText, titleFont, textW);
            const artistH = TextHeightCache.calcTextHeight(gr, artistText, artistFont, textW);
            const extraH = extraFont ? TextHeightCache.calcTextHeight(gr, extraText, extraFont, textW) : 0;
            
            let totalTextH = titleH + GAP_TITLE_ARTIST + artistH;
            if (extraFont) totalTextH += GAP_ARTIST_EXTRA + extraH;
            
            const startY = (() => {
                switch (cfg.layout) {
                    case 0: return textY + Math.floor((textH - totalTextH) / 2);
                    case 1: return textY + textH - totalTextH;
                    case 2: return textY;
                    default: return textY + Math.floor((textH - totalTextH) / 2);
                }
            })();
            
            const ty = startY;
            const ay = ty + titleH + GAP_TITLE_ARTIST;
            const ey = ay + artistH + (extraFont ? GAP_ARTIST_EXTRA : 0);
            
            const flags = DT_CENTER | DT_WORDBREAK;
            
            if (cfg.textShadowEnabled) {
                const shadowColor = PanelArt_SetAlpha(PA_BLACK, 136);
                const offset = TEXT_SHADOW_OFFSET;
                
                gr.GdiDrawText(titleText, titleFont, shadowColor, textX, ty + offset, textW, titleH, flags | DT_NOPREFIX);
                gr.GdiDrawText(artistText, artistFont, shadowColor, textX, ay + offset, textW, artistH, flags | DT_NOPREFIX);
                if (extraFont) {
                    gr.GdiDrawText(extraText, extraFont, shadowColor, textX, ey + offset, textW, extraH, flags | DT_NOPREFIX);
                }
            }
            
            gr.GdiDrawText(titleText, titleFont, PA_WHITE, textX, ty, textW, titleH, flags | DT_NOPREFIX);
            gr.GdiDrawText(artistText, artistFont, PA_GREY200, textX, ay, textW, artistH, flags | DT_NOPREFIX);
            if (extraFont) {
                gr.GdiDrawText(extraText, extraFont, PA_GREY180, textX, ey, textW, extraH, flags | DT_NOPREFIX);
            }
        } catch (e) {
            console.log("Error drawing text:", e);
        }
    },
    
    drawBorder(gr) {
        const cfg = StateManager.get();
        const dim = PanelArt.dimensions;
        
        try {
            if (cfg.borderSize > 0 && cfg.borderColor) {
                const w = dim.width;
                const h = dim.height;
                const b = cfg.borderSize;
                const col = cfg.borderColor;
                // DrawRect strokes centre-on-edge so half bleeds outside; use filled rects instead.
                gr.FillSolidRect(0, 0, w, b, col);                     // Top
                gr.FillSolidRect(0, h - b, w, b, col);                 // Bottom
                gr.FillSolidRect(0, b, b, h - b * 2, col);             // Left
                gr.FillSolidRect(w - b, b, b, h - b * 2, col);         // Right
                
                // Inner bezel inside border
                const bx = b;
                const by = b;
                const bw = w - b * 2;
                const bh = h - b * 2;
                // Light outer edge (1px outside content area)
                gr.FillSolidRect(bx - 1, by - 1, bw + 2, 1, PA_BORDER_LIGHT);
                gr.FillSolidRect(bx - 1, by + bh, bw + 2, 1, PA_BORDER_LIGHT);
                gr.FillSolidRect(bx - 1, by - 1, 1, bh + 2, PA_BORDER_LIGHT);
                gr.FillSolidRect(bx + bw, by - 1, 1, bh + 2, PA_BORDER_LIGHT);
                // Dark inner edge (1px inside)
                gr.FillSolidRect(bx + 1, by + 1, bw - 2, 1, PA_BORDER_DARK);
                gr.FillSolidRect(bx + 1, by + bh - 1, bw - 2, 1, PA_BORDER_DARK);
                gr.FillSolidRect(bx + 1, by + 1, 1, bh - 2, PA_BORDER_DARK);
                gr.FillSolidRect(bx + bw - 1, by + 1, 1, bh - 2, PA_BORDER_DARK);
            }
        } catch (e) {
            console.log("Error drawing border:", e);
        }
    },
    
    drawOverlay(gr, w, h, artInfo, textArea) {
        // Invalidate if the panel was resized since the last build.
        if (OverlayCache.valid && OverlayCache.img &&
            (OverlayCache.img.Width !== w || OverlayCache.img.Height !== h)) {
            OverlayCache.invalidate();
        }
        if (!OverlayCache.valid) {
            OverlayCache.build(w, h, artInfo, textArea);
        }
        if (OverlayCache.img) {
            try {
                gr.DrawImage(OverlayCache.img, 0, 0, w, h, 0, 0, w, h);
            } catch (e) {
                console.log("Overlay draw error:", e);
            }
        }
    },
    
    drawSlider(gr, value, max, yPos) {
        const dim = PanelArt.dimensions;
        const barW = Math.max(SLIDER_MIN_WIDTH, Math.floor(dim.width * SLIDER_WIDTH_RATIO));
        const barH = SLIDER_HEIGHT;
        const bx = Math.floor((dim.width - barW) / 2);
        const by = yPos;
        
        try {
            gr.FillSolidRect(bx, by, barW, barH, PanelArt_SetAlpha(PA_WHITE, 60));
            gr.FillSolidRect(bx, by, Math.floor(barW * (value / max)), barH, PanelArt_SetAlpha(PA_WHITE, 180));
            
            const font = this.getSliderFont();
            const text = value.toString();
            const size = gr.MeasureString(text, font, 0, 0, dim.width, dim.height);
            const sw = Math.ceil(size.Width);
            const sh = Math.ceil(size.Height);
            gr.DrawString(text, font, PA_WHITE,
                Math.floor((dim.width - sw) / 2),
                Math.floor(by - sh - 2),
                sw, sh);
        } catch (e) {
            console.log("Error drawing slider:", e);
        }
    },
    
    drawSliders(gr) {
        const slider = PanelArt.slider;
        const dim = PanelArt.dimensions;
        const cfg = StateManager.get();
        
        if (!slider.active) return;
        
        if (slider.target) {
            const valueMap = {
                "Reflection": cfg.opReflection,
                "Glow": cfg.opGlow,
                "Scanlines": cfg.opScanlines,
                "Phosphor": cfg.opPhosphor
            };
            this.drawSlider(gr, valueMap[slider.target], 255, dim.height - 18);
        }
        
        if (slider.paddingActive) {
            this.drawSlider(gr, cfg.albumArtPadding || 0, 100, dim.height - 40);
        }
    }
};

// ================= STATE MANAGEMENT =================
const StateManager = {
    _config: getDefaultState(),
    
    get() {
        return this._config;
    },
    
    load() {
        try {
            const raw = window.GetProperty(STATE_KEY, null);
            if (!raw) {
                // First run: apply defaults and save
                this._config = getDefaultState();
                this.apply(this._config, true, false, false); // build fonts from defaults
                this.save();
                return;
            }
            
            const parsed = JSON.parse(raw);
            let savedVersion = parsed.version ?? 1;
            let savedData = parsed.data ?? parsed;
            
            if (savedVersion !== STATE_VERSION) {
                savedData = migrateState(savedData, savedVersion);
                // Version changed — persist migrated state immediately so we don't re-migrate on next load.
                const migrated = Validator.validateConfig(savedData);
                try {
                    window.SetProperty(STATE_KEY, JSON.stringify({ version: STATE_VERSION, data: migrated }));
                } catch (e) {}
            }
            
            const validated = Validator.validateConfig(savedData);
            
            this._config = validated;
            
            this.apply(this._config, true, false, false); // rebuild fonts with saved settings
        } catch (e) {
            console.log("State load failed. Using defaults:", e);
            this._config = getDefaultState();
            this.apply(this._config, true, false, false);
            this.save();
        }
    },
    
    apply(config, rebuildBlur = false, skipOverlayRebuild = false, skipFontRebuild = false) {
        this._config = config;
        if (!skipOverlayRebuild) {
            OverlayCache.invalidate();
        }
        if (!skipFontRebuild) {
            FontManager.rebuildFonts();
        }
        if (rebuildBlur) {
            ImageManager.scheduleBlurRebuild();
        }
        // Only call TextManager.update when fonts were rebuilt (skipFontRebuild=false)
        // or when blur/background settings changed — otherwise the text content
        // cannot have changed and the call is a no-op that still evaluates title-formats.
        if (!skipFontRebuild || rebuildBlur) {
            const currentTrack = fb.IsPlaying ? fb.GetNowPlaying() : null;
            TextManager.update(currentTrack);
        }
    },
    
    reset() {
        this._config = getDefaultState();
        PanelArt.slider.active = false;
        PanelArt.slider.paddingActive = false;
        PanelArt.slider.target = null;
        TextHeightCache.clear();
        ImageSearch.clearCache();   // stale path entries must be cleared with defaults
        this.apply(this._config, true);
        this.save();
        // Reload art so it renders with the new (default) settings immediately.
        PanelArt.images.folderPath = '';    // force reload even if same folder
        const track = fb.IsPlaying ? fb.GetNowPlaying() : null;
        if (track) {
            ImageManager.loadAlbumArt(track);
        } else {
            TextManager.update(null);
        }
        RepaintHelper.full();
    },
    
    save() {
        try {
            const stateToSave = {
                version: STATE_VERSION,
                data: this._config
            };
            window.SetProperty(STATE_KEY, JSON.stringify(stateToSave));
        } catch (e) {
            console.log("Failed to save state:", e);
        }
    },
    
    saveDebounced() {
        CommandBus._scheduleSave();
    }
};

// ================= PRESET MANAGEMENT =================
const PresetManager = {
    save(slot) {
        if (!_.inRange(slot, 1, 4)) return;
        
        try {
            const data = _.assign({}, StateManager.get());
            window.SetProperty("SMP.Preset" + slot, JSON.stringify(data));
        } catch (e) {
            console.log("Failed to save preset " + slot + ":", e);
        }
    },
    
    load(slot) {
        if (!_.inRange(slot, 1, 4)) return;
        
        try {
            const str = window.GetProperty("SMP.Preset" + slot, null);
            if (!str) return;
            
            const data = JSON.parse(str);
            const validated = Validator.validateConfig(data);
            
            StateManager.apply(validated, true);
            StateManager.save();
            
            // Sync PanelArt runtime properties from the loaded preset config.
            PanelArt.imageMode = validated.imageMode;
            PanelArt.slideMode = validated.slideMode;
            PanelArt.slideIndex = validated.slideIndex || 0;
            PanelArt.glitchEnabled = validated.glitchEnabled;
            
            // Restart modes if they were active in the preset
            if (PanelArt.slideMode) {
                SlideManager.startSlideMode(true);
            } else if (PanelArt.imageMode) {
                ImageModeManager.startImageMode();
            }
            
            RepaintHelper.full();
        } catch (e) {
            console.log("Failed to load preset " + slot + ":", e);
        }
    }
};

// ================= PHOSPHOR THEME MANAGEMENT =================
const PhosphorManager = {
    getColor() {
        const cfg = StateManager.get();
        
        if (cfg.currentPhosphorTheme === CUSTOM_THEME_INDEX) {
            return cfg.customPhosphorColor;
        }
        
        if (!_.inRange(cfg.currentPhosphorTheme, 0, PHOSPHOR_THEMES.length)) {
            return PHOSPHOR_THEMES[0].color;
        }
        
        return PHOSPHOR_THEMES[cfg.currentPhosphorTheme].color;
    },
    
    setCustomColor() {
        try {
            const cfg = StateManager.get();
            const picked = utils.ColourPicker(window.ID, cfg.customPhosphorColor);
            if (_.isNumber(picked) && picked !== -1) {
                cfg.customPhosphorColor = picked >>> 0;
                cfg.currentPhosphorTheme = CUSTOM_THEME_INDEX;
                StateManager.apply(cfg, false, false, true); // overlay-only; skip font rebuild
                StateManager.save();
                RepaintHelper.full();
            }
        } catch (e) {
            console.log("Error setting custom color:", e);
        }
    }
};

// ================= MENU MANAGEMENT =================
const MenuManager = {
    createMainMenu() {
        const m = window.CreatePopupMenu();
        const cfg = StateManager.get();
        
        this.addOverlayMenu(m);
        m.AppendMenuSeparator();
        this.addPanelArtMenu(m);
        
        m.AppendMenuSeparator();
        m.AppendMenuItem(MF_STRING, 900, "Reset to Defaults");
        m.AppendMenuItem(MF_STRING, 901, "Clear Image Cache");
        
        this.addCustomFoldersMenu(m);
        this.addPresetMenu(m);
        
        m.AppendMenuSeparator();
        m.AppendMenuItem(cfg.glitchEnabled ? MF_CHECKED : MF_STRING, 545, "Glitch Effect on Track Change");
        
        const imageFolder = cfg.imageFolder;
        const imageLabel = imageFolder ? "Change Image Folder" : "Set Image Folder...";
        m.AppendMenuItem(MF_STRING, 950, imageLabel);
        
        // Slide Show always available (uses default folder if no custom folder set)
        m.AppendMenuItem(PanelArt.slideMode ? MF_CHECKED : MF_STRING, 952, "Slide Show");
        
        if (imageFolder) {
            m.AppendMenuItem(PanelArt.imageMode ? MF_CHECKED : MF_STRING, 951, "Show Image");
        }
        
        return m;
    },
    
    addOverlayMenu(parent) {
        const overlayM = window.CreatePopupMenu();
        const cfg = StateManager.get();
        
        // Phosphor Theme at top
        const themeM = window.CreatePopupMenu();
        _.forEach(PHOSPHOR_THEMES, (theme, i) => {
            themeM.AppendMenuItem(MF_STRING, 600 + i, theme.name);
            if (StateManager.get().currentPhosphorTheme === i) {
                themeM.CheckMenuItem(600 + i, true);
            }
        });
        themeM.AppendMenuSeparator();
        // CUSTOM_THEME_INDEX = PHOSPHOR_THEMES.length, so the Custom ID is always one above the last preset.
        const customThemeId = 600 + CUSTOM_THEME_INDEX;
        themeM.AppendMenuItem(MF_STRING, customThemeId, "Custom...");
        if (StateManager.get().currentPhosphorTheme === CUSTOM_THEME_INDEX) {
            themeM.CheckMenuItem(customThemeId, true);
        }
        themeM.AppendTo(overlayM, MF_STRING, "Phosphor Theme");
        
        overlayM.AppendMenuSeparator();
        
        // Add effect toggles to overlay submenu
        overlayM.AppendMenuItem(cfg.overlayAllOff ? MF_CHECKED : MF_STRING, 99, "— All Effects Off");
        overlayM.AppendMenuSeparator();
        overlayM.AppendMenuItem((!cfg.overlayAllOff && cfg.showReflection) ? MF_CHECKED : MF_STRING, 100, "Reflection");
        overlayM.AppendMenuItem((!cfg.overlayAllOff && cfg.showGlow) ? MF_CHECKED : MF_STRING, 101, "Glow");
        overlayM.AppendMenuItem((!cfg.overlayAllOff && cfg.showScanlines) ? MF_CHECKED : MF_STRING, 102, "Scanlines");
        overlayM.AppendMenuItem((!cfg.overlayAllOff && cfg.showPhosphor) ? MF_CHECKED : MF_STRING, 103, "Phosphor");
        overlayM.AppendMenuSeparator();
        
        const opacityM = window.CreatePopupMenu();
        _.forEach(["Reflection", "Glow", "Scanlines", "Phosphor"], (name, i) => {
            const propNames = ["opReflection", "opGlow", "opScanlines", "opPhosphor"];
            const value = cfg[propNames[i]];
            opacityM.AppendMenuItem(MF_STRING, 200 + i, `Adjust ${name} Opacity...  [${value}]`);
        });
        opacityM.AppendTo(overlayM, MF_STRING, "Adjust Opacity");
        
        overlayM.AppendTo(parent, MF_STRING, "Overlay");
    },
    
    addPanelArtMenu(parent) {
        const panelM = window.CreatePopupMenu();
        const cfg = StateManager.get();
        
        // Album Art at top
        this.addAlbumArtMenu(panelM);
        panelM.AppendMenuSeparator();
        
        // Text and Border Appearance
        this.addTextMenu(panelM);
        
        const borderM = window.CreatePopupMenu();
        borderM.AppendMenuItem(MF_STRING, 530, 'Set Border Size...');
        borderM.AppendMenuItem(MF_STRING, 531, 'Change Color...');
        borderM.AppendTo(panelM, MF_STRING, 'Border Appearance');
        
        // Background at bottom (includes Blur and Darken)
        this.addBackgroundMenu(panelM);
        
        panelM.AppendTo(parent, MF_STRING, 'PanelArt Settings');
    },
    
    addBackgroundMenu(parent) {
        const bgM = window.CreatePopupMenu();
        const cfg = StateManager.get();
        
        bgM.AppendMenuItem(cfg.backgroundEnabled ? MF_CHECKED : MF_STRING, 850, "Enable Background Art");
        bgM.AppendMenuItem(MF_STRING, 851, "Custom Background Color...");
        bgM.AppendMenuSeparator();
        
        // Blur Settings inside Background
        const blurM = window.CreatePopupMenu();
        blurM.AppendMenuItem(cfg.blurEnabled ? MF_CHECKED : MF_STRING, 512, 'Enable Blur');
        blurM.AppendMenuSeparator();
        _.times(11, (i) => {
            const value = i * 20;
            blurM.AppendMenuItem(MF_STRING, 500 + i, 'Radius: ' + value);
            if (cfg.blurRadius === value) {
                blurM.CheckMenuItem(500 + i, true);
            }
        });
        blurM.AppendMenuItem(MF_STRING, 511, 'Max: 254');
        if (cfg.blurRadius === 254) {
            blurM.CheckMenuItem(511, true);
        }
        blurM.AppendTo(bgM, MF_STRING, 'Blur Settings');
        
        // Darken Background inside Background
        const darkM = window.CreatePopupMenu();
        _.times(6, (d) => {
            const value = d * 10;
            darkM.AppendMenuItem(MF_STRING, 520 + d, 'Level: ' + value + '%');
            if (cfg.darkenValue === value) {
                darkM.CheckMenuItem(520 + d, true);
            }
        });
        darkM.AppendTo(bgM, MF_STRING, 'Darken Background');
        
        bgM.AppendTo(parent, MF_STRING, "Background");
    },
    
    addTextMenu(parent) {
        const textM = window.CreatePopupMenu();
        const cfg = StateManager.get();
        
        this.addFontMenu(textM);
        
        textM.AppendMenuSeparator();
        
        textM.AppendMenuItem(MF_STRING, 562, 'Layout: Top');
        textM.AppendMenuItem(MF_STRING, 560, 'Layout: Center');
        textM.AppendMenuItem(MF_STRING, 561, 'Layout: Bottom');
        textM.CheckMenuRadioItem(560, 562, 560 + cfg.layout);
        
        textM.AppendMenuSeparator();
        
        textM.AppendMenuItem(cfg.textShadowEnabled ? MF_CHECKED : MF_STRING, 570, 'Text Shadow');
        textM.AppendMenuItem(cfg.extraInfoEnabled ? MF_CHECKED : MF_STRING, 571, 'Show Extra Info');
        
        textM.AppendTo(parent, MF_STRING, "Text");
    },
    
    addFontMenu(parent) {
        const fontsM = window.CreatePopupMenu();
        
        const sizeM = window.CreatePopupMenu();
        _.forEach(['Title', 'Artist', 'Extra'], (name, i) => {
            sizeM.AppendMenuItem(MF_STRING, 540 + i, name);
        });
        sizeM.AppendTo(fontsM, MF_STRING, 'Size');
        
        const typeM = window.CreatePopupMenu();
        _.forEach(['Title', 'Artist', 'Extra'], (name, i) => {
            typeM.AppendMenuItem(MF_STRING, 550 + i, name);
        });
        typeM.AppendTo(fontsM, MF_STRING, 'Type');
        
        fontsM.AppendTo(parent, MF_STRING, 'Fonts');
    },
    
    addAlbumArtMenu(parent) {
        const artM = window.CreatePopupMenu();
        const cfg = StateManager.get();
        
        artM.AppendMenuItem(cfg.albumArtEnabled ? MF_CHECKED : MF_STRING, 800, "Enable Album Art");
        
        const floatOptions = [
            { value: "left", id: 801, text: "Float: Left" },
            { value: "right", id: 802, text: "Float: Right" },
            { value: "top", id: 803, text: "Float: Top" },
            { value: "bottom", id: 804, text: "Float: Bottom" }
        ];
        
        _.forEach(floatOptions, (opt) => {
            artM.AppendMenuItem(cfg.albumArtFloat === opt.value ? MF_CHECKED : MF_STRING, opt.id, opt.text);
        });
        
        artM.AppendMenuItem(MF_STRING, 805, "Padding...");
        
        artM.AppendTo(parent, MF_STRING, "Album Art");
    },
    
    addPresetMenu(parent) {
        const presetM = window.CreatePopupMenu();
        
        const loadM = window.CreatePopupMenu();
        const saveM = window.CreatePopupMenu();
        
        _.times(3, (i) => {
            const num = i + 1;
            loadM.AppendMenuItem(MF_STRING, 300 + num, "Preset " + num);
            saveM.AppendMenuItem(MF_STRING, 400 + num, "Preset " + num);
        });
        
        loadM.AppendTo(presetM, MF_STRING, 'Load Preset');
        saveM.AppendTo(presetM, MF_STRING, 'Save Preset');
        presetM.AppendTo(parent, MF_STRING, 'Presets');
    },
    
    addCustomFoldersMenu(parent) {
        const customMenu = window.CreatePopupMenu();
        
        customMenu.AppendMenuItem(MF_STRING, 1000, "Add Custom Folder...");
        
        const folders = CustomFolders.getAll();
        if (!_.isEmpty(folders)) {
            customMenu.AppendMenuSeparator();
            
            _.forEach(folders, (folder, i) => {
                const displayName = _.truncate(folder, { length: 50 });
                customMenu.AppendMenuItem(MF_STRING, 1010 + i, displayName);
            });
            
            customMenu.AppendMenuSeparator();
            customMenu.AppendMenuItem(MF_STRING, 1020, "Clear All Custom Folders");
        }
        
        customMenu.AppendTo(parent, MF_STRING, "Custom Artwork Folders");
    },
    
    handleSelection(id) {
        const cfg = StateManager.get();
        
        // rebuildFonts=true only for operations that change font name/size.
        const updateConfig = (callback, region = Regions.FULL, rebuildBlur = false, rebuildFonts = false) => {
            const prevRadius = cfg.blurRadius;
            const prevBlurEnabled = cfg.blurEnabled;
            const prevBgEnabled = cfg.backgroundEnabled;
            
            callback(cfg);
            
            const blurChanged = prevRadius !== cfg.blurRadius || 
                                prevBlurEnabled !== cfg.blurEnabled ||
                                prevBgEnabled !== cfg.backgroundEnabled;
            
            OverlayCache.invalidate();
            CommandBus.emitChange(region, { rebuildBlur: rebuildBlur || blurChanged });
            StateManager.apply(cfg, rebuildBlur || blurChanged, false, !rebuildFonts);
            StateManager.saveDebounced();
        };
        
        if (id === 99) {
            updateConfig(c => {
                if (!c.overlayAllOff) {
                    // Turning off — save current individual states
                    c.savedOverlay = {
                        showReflection: c.showReflection,
                        showGlow:       c.showGlow,
                        showScanlines:  c.showScanlines,
                        showPhosphor:   c.showPhosphor
                    };
                    c.overlayAllOff = true;
                } else {
                    // Restoring — put individual states back
                    if (c.savedOverlay) {
                        c.showReflection = c.savedOverlay.showReflection;
                        c.showGlow       = c.savedOverlay.showGlow;
                        c.showScanlines  = c.savedOverlay.showScanlines;
                        c.showPhosphor   = c.savedOverlay.showPhosphor;
                        c.savedOverlay   = null;
                    }
                    c.overlayAllOff = false;
                }
            }, Regions.OVERLAY);
        }
        else if (_.inRange(id, 100, 104)) {
            const effects = ['showReflection', 'showGlow', 'showScanlines', 'showPhosphor'];
            updateConfig(c => c[effects[id - 100]] = !c[effects[id - 100]], Regions.OVERLAY);
        }
        else if (_.inRange(id, 200, 204)) {
            PanelArt.slider.active = true;
            PanelArt.slider.paddingActive = false;
            PanelArt.slider.target = ["Reflection", "Glow", "Scanlines", "Phosphor"][id - 200];
            RepaintHelper.full();
        }
        else if (_.inRange(id, 600, 600 + CUSTOM_THEME_INDEX)) {
            updateConfig(c => c.currentPhosphorTheme = id - 600, Regions.OVERLAY);
        }
        else if (id === 600 + CUSTOM_THEME_INDEX) {
            PhosphorManager.setCustomColor();
        }
        else if (_.inRange(id, 500, 511)) {
            updateConfig(c => c.blurRadius = (id - 500) * 20, Regions.BACKGROUND, true);
        }
        else if (id === 511) {
            updateConfig(c => c.blurRadius = 254, Regions.BACKGROUND, true);
        }
        else if (id === 512) {
            updateConfig(c => c.blurEnabled = !c.blurEnabled, Regions.BACKGROUND, true);
        }
        else if (_.inRange(id, 520, 526)) {
            updateConfig(c => c.darkenValue = (id - 520) * 10, Regions.BACKGROUND);
        }
        else if (id === 530) {
            const input = utils.InputBox(window.ID, 'Border Size', 'Enter size (0–50):', cfg.borderSize.toString(), false);
            const value = Utils.validateNumber(input, cfg.borderSize, 0, 50);
            updateConfig(c => c.borderSize = value, Regions.FULL);
        }
        else if (id === 531) {
            const picked = utils.ColourPicker(window.ID, cfg.borderColor);
            if (_.isNumber(picked) && picked !== -1) {
                updateConfig(c => c.borderColor = picked >>> 0, Regions.BACKGROUND);
            }
        }
        else if (_.inRange(id, 540, 543)) {
            const keys = ['titleFontSize', 'artistFontSize', 'extraFontSize'];
            const labels = ['Title Font Size', 'Artist Font Size', 'Extra Font Size'];
            const index = id - 540;
            const input = utils.InputBox(window.ID, labels[index], 'Enter new size:', cfg[keys[index]].toString(), false);
            const value = Utils.validateNumber(input, cfg[keys[index]], MIN_FONT_SIZE, MAX_FONT_SIZE);
            updateConfig(c => c[keys[index]] = value, Regions.TEXT, false, true);
        }
        else if (_.inRange(id, 550, 553)) {
            const keys = ['titleFontName', 'artistFontName', 'extraFontName'];
            const labels = ['Title Font Name', 'Artist Font Name', 'Extra Font Name'];
            const index = id - 550;
            const input = utils.InputBox(window.ID, labels[index], 'Enter font name:', cfg[keys[index]], false);
            if (input && _.trim(input)) {
                updateConfig(c => c[keys[index]] = _.trim(input), Regions.TEXT, false, true);
            }
        }
        else if (_.inRange(id, 560, 563)) {
            updateConfig(c => c.layout = id - 560, Regions.TEXT);
        }
        else if (id === 570) {
            updateConfig(c => c.textShadowEnabled = !c.textShadowEnabled, Regions.TEXT);
        }
        else if (id === 571) {
            updateConfig(c => {
                c.extraInfoEnabled = !c.extraInfoEnabled;
            }, Regions.TEXT);
        }
        else if (id === 800) {
            updateConfig(c => c.albumArtEnabled = !c.albumArtEnabled, Regions.ALBUM_ART);
        }
        else if (_.inRange(id, 801, 805)) {
            // 801=left, 802=right, 803=top, 804=bottom. 805 is NOT in this range (exclusive upper bound).
            const floats = ["left", "right", "top", "bottom"];
            updateConfig(c => c.albumArtFloat = floats[id - 801], Regions.ALBUM_ART);
        }
        else if (id === 805) {
            PanelArt.slider.active = true;
            PanelArt.slider.paddingActive = true;
            PanelArt.slider.target = null;
            RepaintHelper.full();
        }
        else if (id === 850) {
            updateConfig(c => c.backgroundEnabled = !c.backgroundEnabled, Regions.BACKGROUND);
        }
        else if (id === 851) {
            const picked = utils.ColourPicker(window.ID, cfg.customBackgroundColor);
            if (_.isNumber(picked) && picked !== -1) {
                updateConfig(c => c.customBackgroundColor = picked >>> 0, Regions.BACKGROUND);
            }
        }
        else if (_.inRange(id, 301, 304)) {
            PresetManager.load(id - 300);
        }
        else if (_.inRange(id, 401, 404)) {
            PresetManager.save(id - 400);
        }
        else if (id === 900) {
            StateManager.reset();
        }
        else if (id === 901) {
            FileManager.clear();
            ImageSearch.clearCache();           // must clear or the next load gets the stale path
            ImageManager.cleanup();
            PanelArt.images.folderPath = '';    // force reload even if same folder
            TextHeightCache.clear();
            const track = fb.IsPlaying ? fb.GetNowPlaying() : null;
            if (track) {
                ImageManager.loadAlbumArt(track);
            } else {
                TextManager.update(null);
                RepaintHelper.full();
            }
        }
        else if (id === 1000) {
            try {
                const folder = utils.InputBox(window.ID, "Enter folder path for custom artwork search:", "Custom Artwork Folder", "", true);
                if (folder && CustomFolders.add(folder)) {
                    ImageSearch.clearCache();   // stale null-entries would hide the new folder
                    const track = fb.IsPlaying ? fb.GetNowPlaying() : null;
                    if (track) { ImageManager.loadAlbumArt(track); } else { RepaintHelper.full(); }
                }
            } catch (e) {
                console.log("Error adding custom folder:", e);
            }
        }
        else if (_.inRange(id, 1010, 1015)) {
            if (CustomFolders.remove(id - 1010)) {
                ImageSearch.clearCache();       // stale hits from the removed folder must go
                const track = fb.IsPlaying ? fb.GetNowPlaying() : null;
                if (track) { ImageManager.loadAlbumArt(track); } else { RepaintHelper.full(); }
            }
        }
        else if (id === 1020) {
            CustomFolders.clear();
            ImageSearch.clearCache();           // same reason
            const track = fb.IsPlaying ? fb.GetNowPlaying() : null;
            if (track) { ImageManager.loadAlbumArt(track); } else { RepaintHelper.full(); }
        }
        else if (id === 950) {
            try {
                const currentFolder = cfg.imageFolder || '';
                const folder = utils.InputBox(window.ID, "Enter Image folder path:", "Image Folder", currentFolder, true);
                if (folder && _isFolder(folder)) {
                    updateConfig(c => {
                        c.imageFolder = folder;
                        PanelArt.imageFolder = folder;   // sync runtime state immediately
                    }, Regions.FULL);
                } else if (folder) {
                    console.log("Invalid folder:", folder);
                }
            } catch (e) {
                console.log("Error selecting Image folder:", e);
            }
        }
        else if (id === 951) {
            ImageModeManager.toggleImageMode();
        }
        else if (id === 952) {
            SlideManager.toggleSlideMode();
        }
        else if (id === 545) {
            updateConfig(c => {
                c.glitchEnabled = !c.glitchEnabled;
                PanelArt.glitchEnabled = c.glitchEnabled;   // sync runtime flag immediately
            }, Regions.FULL);
        }
    }
};

// ================= GLITCH RENDER HELPER =================
// suppressBase: pass true when painting over the normal album-art view so the
// near-opaque base rectangle does not black out the track info text.
function _paintGlitch(gr, w, h, intensity, pad, suppressBase) {
    const gx = Math.max(pad, 0);
    const gy = Math.max(pad, 0);
    const gw = Math.max(w - pad * 2, 1);
    const gh = Math.max(h - pad * 2, 1);

    if (!suppressBase) {
        gr.FillSolidRect(gx, gy, gw, gh, PanelArt_SetAlpha(_RGB(5, 5, 15), 220));
    }

    const scanlineOffset = Math.floor(Math.random() * 3);
    for (let y = gy + scanlineOffset; y < gy + gh; y += 3) {
        const alpha = Math.floor(Math.random() * 40) + 30;
        gr.FillSolidRect(gx, y, gw, 1, PanelArt_SetAlpha(_RGB(0, 0, 0), alpha));
    }

    const maxShift = Math.floor(gw * 0.1);
    const shift = Math.floor(Math.random() * maxShift);
    const shiftDir = Math.random() > 0.5 ? 1 : -1;

    if (intensity > 0.3) {
        const shiftColors = GLITCH_SHIFT_COLORS;
        const col1 = shiftColors[Math.floor(Math.random() * shiftColors.length)];
        const col2 = shiftColors[Math.floor(Math.random() * shiftColors.length)];

        const shiftedX = gx + shift * shiftDir;
        const remainingW = gw - shift;
        if (shiftedX >= gx && remainingW > 0) {
            gr.FillSolidRect(shiftedX, gy, remainingW, gh, PanelArt_SetAlpha(col1, Math.floor(intensity * 60)));
        }
        gr.FillSolidRect(gx, gy, gw, gh, PanelArt_SetAlpha(_RGB(220, 225, 230), 3));
        const shiftedX2 = gx + shift * -shiftDir;
        const remainingW2 = gw - shift;
        if (shiftedX2 >= gx && remainingW2 > 0) {
            gr.FillSolidRect(shiftedX2, gy, remainingW2, gh, PanelArt_SetAlpha(col2, Math.floor(intensity * 60)));
        }
    }

    const numSlices = Math.floor(intensity * 6) + 2;
    for (let i = 0; i < numSlices; i++) {
        const sliceY = gy + Math.floor(Math.random() * gh);
        const sliceH = Math.floor(Math.random() * 15) + 2;
        const maxShiftS = Math.floor(gw * 0.1);
        const sliceShift = (Math.floor(Math.random() * maxShiftS * 2) - maxShiftS);
        let sliceX = gx + sliceShift;
        let drawW = gw;
        if (sliceX < gx) { drawW -= (gx - sliceX); sliceX = gx; }
        if (sliceX + drawW > gx + gw) { drawW = gx + gw - sliceX; }
        if (drawW > 0) {
            const sliceColors = GLITCH_SLICE_COLORS;
            const sliceCol = sliceColors[Math.floor(Math.random() * sliceColors.length)];
            gr.FillSolidRect(sliceX, sliceY, drawW, sliceH, PanelArt_SetAlpha(sliceCol, 120));
        }
    }

    const numBlocks = Math.floor(intensity * 30) + 1;
    for (let i = 0; i < numBlocks; i++) {
        const blockH = Math.floor(Math.random() * gh * 0.06) + 2;
        const blockY = gy + Math.floor(Math.random() * (gh - blockH));
        const blockW = Math.floor(Math.random() * gw * 0.1) + 3;
        const blockX = gx + Math.floor(Math.random() * (gw - blockW));
        const colors = GLITCH_BLOCK_COLORS;
        const col = colors[Math.floor(Math.random() * colors.length)];
        const r  = Math.floor(((col >>> 16) & 0xFF) * 0.90);
        const g2 = Math.floor(((col >>>  8) & 0xFF) * 0.90);
        const b  =  col & 0xFF;
        gr.FillSolidRect(blockX, blockY, blockW, blockH, _RGB(r, g2, b));
    }

    const numInterference = Math.floor(intensity * 10) + 3;
    for (let i = 0; i < numInterference; i++) {
        const intY = gy + Math.floor(Math.random() * gh);
        const intH = Math.floor(Math.random() * 2) + 1;
        const intAlpha = Math.floor(Math.random() * 50) + 40;
        const tintColors = GLITCH_TINT_COLORS;
        const tint = tintColors[Math.floor(Math.random() * tintColors.length)];
        gr.FillSolidRect(gx, intY, gw, intH, PanelArt_SetAlpha(tint, intAlpha));
    }

    const numNoise = Math.floor(intensity * 400) + 200;
    for (let i = 0; i < numNoise; i++) {
        const nx   = gx + Math.floor(Math.random() * gw);
        const ny   = gy + Math.floor(Math.random() * gh);
        const ns   = Math.floor(Math.random() * 2) + 1;
        const gray = Math.floor(Math.random() * 150);
        const pick = Math.floor(Math.random() * 4);
        const nr   = pick === 0 ? Math.round(gray * 0.7) : pick === 3 ? gray               : gray;
        const ng   = pick === 0 ? Math.round(gray * 0.8) : pick === 1 ? gray               : pick === 3 ? Math.round(gray * 0.5) : gray;
        const nb   = pick === 0 ? gray                   : pick === 1 ? Math.round(gray * 0.5) : pick === 2 ? Math.round(gray * 0.6) : Math.round(gray * 0.5);
        gr.FillSolidRect(nx, ny, ns, ns, _RGB(nr, ng, nb));
    }

    if (intensity > 0.75) {
        gr.FillSolidRect(gx, gy, gw, gh, PanelArt_SetAlpha(_RGB(200, 210, 230), 50));
    }

    if (intensity > 0.4) {
        const trackX = gx + Math.floor(Math.random() * gw * 0.6);
        const trackW = Math.floor(Math.random() * 10) + 3;
        const clampedTrackW = Math.min(trackW, gx + gw - trackX);
        const trackColors = GLITCH_TRACK_COLORS;
        const trackCol = trackColors[Math.floor(Math.random() * trackColors.length)];
        if (clampedTrackW > 0) {
            gr.FillSolidRect(trackX, gy, clampedTrackW, gh, PanelArt_SetAlpha(trackCol, 150));
        }
    }
}

// ================= FOOBAR2000 CALLBACKS =================
function on_paint(gr) {
    if (!isLive() || !PanelArt.dimensions.width || !PanelArt.dimensions.height) return;
    try {
        const w = PanelArt.dimensions.width;
        const h = PanelArt.dimensions.height;
        
        const cfg = StateManager.get(); // Cache once to avoid repeated function calls
        
        // Image mode and slide mode share identical render logic; only the source image differs.
        const _modeImg = (PanelArt.imageMode && PanelArt.imageImage) ? PanelArt.imageImage
                       : (PanelArt.slideMode  && PanelArt.slideImage) ? PanelArt.slideImage
                       : null;
        if (_modeImg) {
            const borderPad = (cfg.borderSize || 0);
            const imagePad  = borderPad + 3;
            gr.FillSolidRect(0, 0, w, h, _RGB(5, 5, 5));
            if (_modeImg.Width > 0 && _modeImg.Height > 0) {
                const dx = imagePad;
                const dy = imagePad;
                const dw = w - imagePad * 2;
                const dh = h - imagePad * 2;
                gr.FillSolidRect(dx - 1, dy - 1, dw + 2, dh + 2, _RGB(80, 80, 80));
                gr.FillSolidRect(dx + 1, dy + 1, dw - 2, dh - 2, _RGB(20, 20, 20));
                const scaledImg = Utils.getScaledImage(_modeImg, dw, dh);
                if (scaledImg) {
                    gr.DrawImage(scaledImg, dx, dy, dw, dh, 0, 0, dw, dh);
                }
            }
            if (PanelArt.glitchFrame > 0 && cfg.glitchEnabled) {
                _paintGlitch(gr, w, h, PanelArt.glitchFrame, imagePad, false); // base rect intentional in mode view
            }
            Renderer.drawBorder(gr);
            Renderer.drawOverlay(gr, w, h, null, null);
            return;
        }

        Renderer.drawBackground(gr);

        const artInfo = Renderer.drawAlbumArt(gr);
        
        const textArea = Renderer.getTextArea(artInfo);
        Renderer.drawText(gr, textArea);
        
        if (PanelArt.glitchFrame > 0 && cfg.glitchEnabled) {
            _paintGlitch(gr, w, h, PanelArt.glitchFrame, cfg.borderSize || 0, true); // suppress base rect over track info
        }
        
        // Draw border
        Renderer.drawBorder(gr);
        
        Renderer.drawOverlay(gr, w, h, artInfo, textArea);
        
        Renderer.drawSliders(gr);
    } catch (e) {
        console.log("Paint error:", e);
    }
}

// ================= ARTWORK DISPATCHER =================
// Single source of truth for all artwork updates - prevents duplicate loads and repaint storms
const ArtDispatcher = {
    _pending: null,      // { reason, metadb }
    _timer: null,
    _trackTimer: null,
    _unloaded: false,    // set by on_script_unload to suppress post-teardown callbacks
    
    // Priority: track > stop > selection > playlist
    _priority: { track: 4, stop: 3, selection: 2, playlist: 1 },
    
    request(reason, metadb) {
        const priority = this._priority[reason] || 0;
        
        // If we have a pending request, only override if equal or higher priority
        if (this._pending) {
            const currentPriority = this._priority[this._pending.reason] || 0;
            if (priority < currentPriority) {
                return; // Ignore strictly lower priority request only
            }
        }
        
        this._pending = { reason, metadb };
        
        // Debounce to prevent repaint storms
        if (this._timer) {
            window.ClearTimeout(this._timer);
        }
        if (this._trackTimer) {
            window.ClearTimeout(this._trackTimer);
            this._trackTimer = null;
        }
        
        this._timer = window.SetTimeout(() => {
            this._dispatch();
        }, 50); // 50ms debounce
    },
    
    _dispatch() {
        if (this._unloaded) return;   // BUG-DISPATCH-1: timer fired after on_script_unload
        if (!this._pending) return;
        
        const { reason, metadb } = this._pending;
        this._pending = null;
        this._timer = null;
        
        switch (reason) {
            case 'track':
                if (metadb) {
                    this._trackTimer = window.SetTimeout(() => {
                        this._trackTimer = null;
                        if (!this._unloaded) ArtController.onPlaybackNewTrack(metadb);
                    }, 60);
                }
                break;
            case 'stop':
                ArtController.onPlaybackStop(metadb);
                break;
            case 'selection':
            case 'playlist':
                if (fb.IsPlaying && fb.GetNowPlaying()) {
                    ArtController.onPlaybackNewTrack(fb.GetNowPlaying());
                }
                break;
        }
    }
};

// ================= ASYNC DECODE QUEUE =================
// Prevents disk bursts — only one decode executes at a time.
// NOTE: Only the LAST enqueued task is remembered (pending = last-write-wins).
// Callers must ensure any GDI disposal they need happens BEFORE calling enqueue,
// not inside the task, if there is any chance a newer enqueue could displace them.
const ArtQueue = {
    busy: false,
    pending: null,
    
    enqueue(task) {
        this.pending = task;
        this._process();
    },
    
    _process() {
        if (this.busy || !this.pending) return;
        
        this.busy = true;
        const task = this.pending;
        this.pending = null;

        let doneInvoked = false;

        const safetyTimer = window.SetTimeout(() => {
            if (!doneInvoked) {
                console.log('ArtQueue: safety timeout — task did not call done(), releasing queue.');
                this.busy = false;
                this._process();
            }
        }, 10000);
        const done = () => {
            doneInvoked = true;
            window.ClearTimeout(safetyTimer);
            this.busy = false;
            this._process();
        };
        try {
            task(done);
        } catch (e) {
            console.log('ArtQueue: task threw synchronously:', e);
            if (!doneInvoked) {
                this.busy = false;
                this._process();
            }
        }
    },
    
    clear() {
        this.pending = null;
        // Do NOT reset busy here — a task may still be executing synchronously.
        // The on_script_unload path disposes everything; any remaining done() call
        // will simply find nothing to process.
    }
};

function on_size() {
    if (!isLive()) {
        // Update dimensions even during boot so on_paint has correct values.
        ArtState.dimensions.width  = window.Width;
        ArtState.dimensions.height = window.Height;
        return;
    }
    ArtController.onSize();
}

function on_colours_changed() {
    if (!isLive()) return;
    ImageManager.scheduleBlurRebuild();
    RepaintHelper.full();
}

function on_font_changed() {
    if (!isLive()) return;
    // System font changed — clear font cache and rebuild
    FontManager.rebuildFonts();
    TextHeightCache.clear();
    RepaintHelper.full();
}

function runGlitchEffect() {
    const cfg = StateManager.get();
    if (!cfg.glitchEnabled) return;
    
    if (PanelArt.timers.glitch) { window.ClearInterval(PanelArt.timers.glitch); }
    let glitchCount = 0;
    PanelArt.timers.glitch = window.SetInterval(() => {
        PanelArt.glitchFrame = Math.random();
        RepaintHelper.full(); // Full repaint needed for glitch overlay
        glitchCount++;
        if (glitchCount >= 4) {
            PanelArt.glitchFrame = 0;
            window.ClearInterval(PanelArt.timers.glitch);
            PanelArt.timers.glitch = null;
        }
    }, 20);
}

function on_playback_new_track(metadb) {
    if (!isLive()) return;
    ArtDispatcher.request('track', metadb);
}

// Refresh display when tags are edited while a track is playing.
function on_metadb_changed(metadb_list, fromhook) {
    if (!isLive()) return;
    if (!fb.IsPlaying) return;
    const nowPlaying = fb.GetNowPlaying();
    if (!nowPlaying) return;
    
    let affected = false;

    for (let i = 0; i < metadb_list.Count; i++) {
        const item = metadb_list.Item(i);
        if (item && item.Compare && item.Compare(nowPlaying)) {
            affected = true;
            break;
        }
    }
    
    if (affected) {
        TextManager.update(nowPlaying);
        // Clear folder path to bypass the same-folder optimisation so art also refreshes.
        PanelArt.images.folderPath = '';
        ImageManager.loadAlbumArt(nowPlaying);
    }
}

// image is null if no artwork was found.
function on_get_album_art_done(metadb, art_id, image, image_path) {
    if (phase === Phase.SHUTDOWN) {
        // Script is shutting down; discard the image to avoid a GDI leak.
        if (image && typeof image.Dispose === 'function') {
            try { image.Dispose(); } catch (e) {}
        }
        return;
    }
    try {
        // Discard stale response if token changed (new load started after async request)
        if (PanelArt.pendingArtToken !== PanelArt.loadToken) {
            if (image && typeof image.Dispose === 'function') {
                try { image.Dispose(); } catch (e) {}
            }
            return;
        }
        
        // Discard art that arrived late for a different track
        const expected = PanelArt.images.currentMetadb;
        if (expected && metadb && !metadb.Compare(expected)) {
            if (image && typeof image.Dispose === 'function') {
                try { image.Dispose(); } catch (e) {}
            }
            return;
        }
        PanelArt.images.currentMetadb = null;
        
        if (image) {
            // Dispose old source before replacing it to avoid a GDI leak.
            if (PanelArt.images.source && PanelArt.images.source !== image) {
                Utils.disposeImage(PanelArt.images.source);
            }
            PanelArt.images.source = image;
            if (image._srcId === undefined) image._srcId = BlurCache._srcIdCounter++;
            PanelArt.images.currentPath = image_path || '';
            // Clear stale scaled-image entries — they were keyed to the old source's _srcId.
            Utils.clearScaledCache();
            OverlayCache.invalidate();
            ImageManager.scheduleBlurRebuild();
            RepaintHelper.full();
        } else {
            PanelArt.images.source = Utils.disposeImage(PanelArt.images.source);
            PanelArt.images.currentPath = '';
			
            ImageManager.scheduleBlurRebuild();
            RepaintHelper.full();
        }
    } catch (e) {
        console.log("on_get_album_art_done error:", e);
    }
}

function on_playback_stop(reason) {
    if (!isLive()) return;
    ArtDispatcher.request('stop', reason);
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

function on_mouse_wheel(delta) {
    if (!isLive()) return;
    ArtController.onMouseWheel(delta);
}

function on_mouse_move(x, y) {
    // Reserved for future hover interactions.
}

function on_mouse_lbtn_down(x, y) {
    if (!isLive()) return;
    if (window.SetFocus) window.SetFocus();
}

function on_mouse_lbtn_up(x, y) {
    if (!isLive()) return;
    return ArtController.onMouseLbtnUp();
}

// Required to honour grab_focus: true in DefineScript options.
function on_key_down(vkey) {
    // Reserved for future keyboard shortcuts.
}

function on_selection_changed() {
    if (!isLive()) return;
    // Show art for selected track when nothing is playing.
    if (fb.IsPlaying || fb.IsPaused) return;
    const item = fb.GetFocusItem();
    if (item) {
        TextManager.update(item);
        ImageManager.loadAlbumArt(item);
    }
}

function on_playback_pause(state) {
    if (!isLive()) return;
    // No visual change needed on pause, but repaint ensures the play-state
    // dependent parts of the overlay (if any) stay current.
    RepaintHelper.full();
}

function on_playback_starting(cmd, is_paused) {
    if (!isLive()) return;
    RepaintHelper.full();
}

function on_playback_seek(time) {
    // No artwork change on seek; kept for completeness.
}

// ================= SHARED IMAGE FILE LISTING HELPER =================
// Used by both ImageModeManager and SlideManager to avoid duplicated FSO code.
const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.bmp', '.webp', '.gif'];

function _listImagesInFolder(folder) {
    folder = (folder || '').replace(/\\+$/, '');
    if (!folder) return [];
    try {
        if (!_fso || !_fso.FolderExists(folder)) return [];
        const fldr = _fso.GetFolder(folder);
        const filesEnum = new Enumerator(fldr.Files);
        const images = [];
        for (; !filesEnum.atEnd(); filesEnum.moveNext()) {
            const fileName = filesEnum.item().Name.toLowerCase();
            const ext = fileName.substring(fileName.lastIndexOf('.'));
            if (IMAGE_EXTS.indexOf(ext) !== -1) {
                images.push(filesEnum.item().Path);
            }
        }
        return images;
    } catch (e) {
        console.log('PanelArt: _listImagesInFolder error:', e);
        return [];
    }
}

// ================= IMAGE FUNCTIONS =================
const ImageModeManager = {
    files: [],
    currentIndex: -1,
    
    getRandomImage() {
        const cfg = StateManager.get();
        const folder = cfg.imageFolder || (fb.ProfilePath + 'skins\\images');
        
        const imageFiles = _listImagesInFolder(folder);
        if (imageFiles.length === 0) return null;
        
        return imageFiles[Math.floor(Math.random() * imageFiles.length)];
    },
    
    startImageMode() {
        // Stop slide mode if active
        if (PanelArt.slideMode) {
            SlideManager.stopSlideMode();
        }
        
        const imagePath = this.getRandomImage();
        if (!imagePath) {
            console.log("No image found in folder");
            return;
        }
        
        PanelArt.imageMode = true;
        StateManager.get().imageMode = true;
        StateManager.saveDebounced();
        
        // Use queue to prevent disk bursts
        ArtQueue.enqueue((done) => {
            // Dispose old image
            if (PanelArt.imageImage) {
                try { PanelArt.imageImage.Dispose(); } catch(e) {}
            }
            
            try {
                PanelArt.imageImage = gdi.Image(imagePath);
            } catch(e) {
                PanelArt.imageImage = null;
            }
            
            RepaintHelper.full();
            done();
        });
    },
    
    stopImageMode() {
        if (PanelArt.timers.imageAnim) {
            window.ClearInterval(PanelArt.timers.imageAnim);
            PanelArt.timers.imageAnim = null;
        }
        PanelArt.imageMode = false;
        StateManager.get().imageMode = false;
        StateManager.saveDebounced();
        
        if (PanelArt.imageImage) {
            try { PanelArt.imageImage.Dispose(); } catch(e) {}
            PanelArt.imageImage = null;
        }
        RepaintHelper.full();
    },
    
    toggleImageMode() {
        if (PanelArt.imageMode) {
            this.stopImageMode();
        } else {
            this.startImageMode();
        }
    }
};

// ================= SLIDE SHOW FUNCTIONS =================
const SlideManager = {
    getImages() {
        const cfg = StateManager.get();
        const folder = cfg.imageFolder || (fb.ProfilePath + 'skins\\images');
        // Return in stable (filesystem) order; callers shuffle as needed.
        return _listImagesInFolder(folder);
    },
    
    startSlideMode(useSavedIndex) {
        // Stop image mode if active
        if (PanelArt.imageMode) {
            ImageModeManager.stopImageMode();
        }
        
        const images = this.getImages();
        console.log("SlideShow images found:", images.length);
        if (images.length === 0) {
            console.log("No images found in folder");
            return;
        }
        
        PanelArt.slideMode = true;
        PanelArt.slideImages = images;

        if (!useSavedIndex) {
            for (let i = images.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [images[i], images[j]] = [images[j], images[i]];
            }
        }
        
        // Use saved index or random
        if (useSavedIndex && PanelArt.slideIndex >= 0 && PanelArt.slideIndex < images.length) {
            // Keep current slideIndex
        } else {
            PanelArt.slideIndex = Math.floor(Math.random() * images.length);
        }
        
        StateManager.get().slideMode = true;
        StateManager.get().slideIndex = PanelArt.slideIndex;
        StateManager.saveDebounced();
        
        // Use queue to prevent disk bursts
        ArtQueue.enqueue((done) => {
            // Dispose old slide
            if (PanelArt.slideImage) { try { PanelArt.slideImage.Dispose(); } catch(e) {} }
            try { PanelArt.slideImage = gdi.Image(images[PanelArt.slideIndex]); } catch(e) { PanelArt.slideImage = null; }
            RepaintHelper.albumArt();
            done();
        });
        
        if (PanelArt.slideTimer) {
            window.ClearInterval(PanelArt.slideTimer);
        }
        PanelArt.slideTimer = window.SetInterval(() => {
            let randomIdx;
            do {
                randomIdx = Math.floor(Math.random() * PanelArt.slideImages.length);
            } while (randomIdx === PanelArt.slideIndex && PanelArt.slideImages.length > 1);
            PanelArt.slideIndex = randomIdx;
            StateManager.get().slideIndex = randomIdx;
            StateManager.saveDebounced();
            
            // Use queue to prevent disk bursts
            const capturedIdx = randomIdx;
            ArtQueue.enqueue((done) => {
                // Guard: slideMode may have been stopped between enqueue and execution
                if (!PanelArt.slideMode || capturedIdx >= PanelArt.slideImages.length) {
                    done();
                    return;
                }
                // Dispose stale bitmap, load next slide
                if (PanelArt.slideImage) { try { PanelArt.slideImage.Dispose(); } catch(e) {} }
                try { PanelArt.slideImage = gdi.Image(PanelArt.slideImages[capturedIdx]); } catch(e) { PanelArt.slideImage = null; }
                RepaintHelper.albumArt();
                done();
            });
        }, 12000);
    },
    
    stopSlideMode() {
        if (PanelArt.slideTimer) {
            window.ClearInterval(PanelArt.slideTimer);
            PanelArt.slideTimer = null;
        }
        PanelArt.slideMode = false;
        PanelArt.slideImages = [];
        PanelArt.slideIndex = 0;
        StateManager.get().slideMode = false;
        StateManager.get().slideIndex = 0;
        StateManager.saveDebounced();
        if (PanelArt.slideImage) { try { PanelArt.slideImage.Dispose(); } catch(e) {} PanelArt.slideImage = null; }
        RepaintHelper.full();
    },
    
    toggleSlideMode() {
        if (PanelArt.slideMode) {
            this.stopSlideMode();
        } else {
            this.startSlideMode();
        }
    }
};

function on_mouse_lbtn_dblclk(x, y) {
    if (window.SetFocus) window.SetFocus();
    ImageModeManager.toggleImageMode();
}

function on_mouse_rbtn_up(x, y) {
    const menu = MenuManager.createMainMenu();
    const id = menu.TrackPopupMenu(x, y);
    
    if (id > 0) {
        MenuManager.handleSelection(id);
    }
    
    return true;
}

function on_script_unload() {
    phase = Phase.SHUTDOWN;
    
    ArtController.onUnload();
    ArtQueue.clear();
    
    // Cancel any pending ArtDispatcher timers and state
    ArtDispatcher._unloaded = true;   // suppress any timer that fires after this point
    if (ArtDispatcher._trackTimer) {
        window.ClearTimeout(ArtDispatcher._trackTimer);
        ArtDispatcher._trackTimer = null;
    }
    if (ArtDispatcher._timer) {
        window.ClearTimeout(ArtDispatcher._timer);
        ArtDispatcher._timer = null;
    }
    ArtDispatcher._pending = null;    // prevent stale dispatch after unload
    
    if (Renderer._sliderFont) {
        try { Renderer._sliderFont.Dispose(); } catch (e) {}
        Renderer._sliderFont = null;
    }
    
    if (CommandBus._saveTimer) {
        window.ClearTimeout(CommandBus._saveTimer);
        CommandBus._saveTimer = null;
        CommandBus._saveScheduled = false;
    }
    
    StateManager.save();
    BlurCache.dispose();
    ImageManager.cleanup();
    OverlayCache.dispose();
    FontManager.clearCache();
    TextHeightCache.clear();
    ArtCache.clearAll();
    
    // Cancel UltraCachePro's background cleanup interval (if it started one).
    UltraCachePro.cancel();
    
    // Clean up global GDI measurement objects created by helpers.js.
    // helpers.js defined its own on_script_unload which this function supersedes;
    // we must replicate that cleanup here so _bmp / _gr are properly released.
    _tt('');

    if (_gr) {
        try { if (_bmp) _bmp.ReleaseGraphics(_gr); } catch (e) {}
    }
    _gr  = null;
    _bmp = null;
}

// ================= ULTRA CACHE PRO STUB =================
// UltraCachePro was referenced in on_script_unload but never defined.
// Defining it here as a no-op prevents a ReferenceError crash on unload.
const UltraCachePro = {
    cancel() {}
};

// ================= INITIALIZATION =================
window.MinHeight = 75;  // Enforce minimum panel height of 75px
window.MinWidth = 250;  // Enforce minimum panel width of 250px
// Seed dimensions immediately so on_paint has correct values before the first on_size.
ArtState.dimensions.width  = window.Width;
ArtState.dimensions.height = window.Height;
StateManager.load();  // Load state first — also rebuilds fonts with saved settings via apply()
CustomFolders.load();  // Now load custom folders from loaded state
ReactiveRenderer.init();
// Initialize runtime properties from persistent state
const cfg = StateManager.get();
PanelArt.glitchEnabled = cfg.glitchEnabled;
PanelArt.imageFolder = cfg.imageFolder;
PanelArt.imageMode = cfg.imageMode;
PanelArt.slideMode = cfg.slideMode;
PanelArt.slideIndex = cfg.slideIndex || 0;

// Restart slideshow if it was active
if (PanelArt.slideMode) {
    SlideManager.startSlideMode(true); // pass true to use saved slideIndex
}

// Restart image mode if it was active
if (PanelArt.imageMode) {
    ImageModeManager.startImageMode();
}

// Load current track on init if playing; always update text to 'No track playing' when idle.
const initTrack = fb.IsPlaying ? fb.GetNowPlaying() : null;
if (initTrack) {
    ImageManager.loadAlbumArt(initTrack);
} else {
    TextManager.update(null);
}
RepaintHelper.full();

window.SetTimeout(() => {
    phase = Phase.LIVE;
    RepaintHelper.full();
}, 0);