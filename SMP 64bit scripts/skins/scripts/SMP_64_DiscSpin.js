'use strict';
			  // -============ AUTHOR L.E.D. ===========- \\
			 // -======== SMP 64bit Disc Spin V3 ========- \\
			// -====== Spins Disc + Artwork + Cover ======- \\

    // ===================*** Foobar2000 64bit ***================== \\
   // ======= For Spider Monkey Panel 64bit, author: marc2003 ======= \\
  // ====== Masking All Images, Creates a Disc from Album Art+  ====== \\
 // ======== Sample Code ApplyMask author: T.P Wang / marc2003 ======== \\
// ==-== Inspired by "CD Album Art, @authors "marc2003, Jul23, vnav" =-==\\

window.DefineScript('SMP 64bit Disc Spin V3', { author: 'L.E.D.', grab_focus: true });

// ====================== HELPER INCLUDES ======================
include(fb.ComponentPath + 'samples\\complete\\js\\lodash.min.js');
include(fb.ComponentPath + 'samples\\complete\\js\\helpers.js');

function _fbSanitise(str) {
    if (!str) return '';
    return utils.ReplaceIllegalChars(str, true);
}

// ====================== PROPERTIES (Using helpers _p) ======================
const props = {
    spinningEnabled:    new _p('RP.SpinningEnabled', true),
    spinSpeed:          new _p('RP.SpinSpeed', 2.0),
    useAlbumArtOnly:    new _p('RP.UseAlbumArtOnly', false),
    keepAspectRatio:    new _p('RP.KeepAspectRatio', true),
    interpolationMode:  new _p('RP.InterpolationMode', 1),
    maxImageSize:       new _p('RP.MaxImageSize', 250),
    savedPath:          new _p('RP.SavedPath', ''),
    savedIsDisc:        new _p('RP.SavedIsDisc', false),
    maskType:           new _p('RP.MaskType', 0),
    userOverrideMask:   new _p('RP.UserOverrideMask', false),
    
    // Overlay effects
    showReflection:     new _p('Disc.ShowReflection', true),
    opReflection:       new _p('Disc.OpReflection', 30),
    showGlow:           new _p('Disc.ShowGlow', true),
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
    State.paintCache.bgColor = _getUIColour();
    window.Repaint();
}

function on_font_changed() {
    window.Repaint();
}

// ====================== CONFIGURATION ======================
const CONFIG = Object.freeze({
    TIMER_INTERVAL: 50,
    MAX_STATIC_SIZE: 1000,
    MAX_CACHE_ENTRIES: 50,
    MAX_MASK_CACHE:   10,
    MAX_RIM_CACHE:    10,
    MAX_FILE_CACHE:  200,
    MAX_BG_CACHE:     4,
    
    MIN_DISC_SIZE: 50,
    MAX_DISC_SIZE: 1000,
    MIN_SPIN_SPEED: 0.1,
    MAX_SPIN_SPEED: 10,
    
    SMOOTHING_MODE: 3,
    DISC_SCALE_FACTOR: 1.00,
    ANGLE_MODULO: 360,
    LOAD_DEBOUNCE_MS: 33,
    MAX_SUBFOLDER_DEPTH: 4,
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
        "disc", "cd", "media", "vinyl"   // lowercase only - Windows FS is case-insensitive
    ],
    
    COVER_PATTERNS: [
        "cover", "front", "folder", "albumart", "album", "artwork", "art"
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
        { name: "Nearest Neighbor (Fastest)", value: 5 },
        { name: "Low Quality", value: 1 },
        { name: "Bilinear", value: 3 }
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

// ====================== REGION CONSTANTS ======================
const Regions = {
    NONE: 0,
    FULL: 1,
    DISC: 2,
    BACKGROUND: 4,
    TEXT: 8,
    OVERLAY: 16,
    SLIDERS: 32
};

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
        const pad = P.padding;
        const border = P.borderSize;
        const w = window.Width;
        const h = window.Height;
        const discSize = Math.min(w, h) - (pad + border) * 2;
        const x = Math.floor((w - discSize) / 2);
        const y = Math.floor((h - discSize) / 2);
        this.region(x - 10, y - 10, discSize + 20, discSize + 20);
    },
    
    text() {
        const w = window.Width;
        const h = window.Height;
        this.region(0, h - 80, w, 80);
    },
    
    background() {
        this.full(); // Background affects whole panel
    }
};

// Sentinel index for the custom colour picker (sits above the named themes)
const DISC_CUSTOM_THEME_INDEX = CONFIG.PHOSPHOR_THEMES.length;

// ====================== PROPERTY SHORTCUTS ======================
// Accessor shortcuts to avoid typing .value / .enabled on every read.
const P = {
    get spinningEnabled() { return props.spinningEnabled.enabled; },
    get spinSpeed() { return props.spinSpeed.value; },
    get useAlbumArtOnly() { return props.useAlbumArtOnly.enabled; },
    get keepAspectRatio() { return props.keepAspectRatio.enabled; },
    get interpolationMode() { return props.interpolationMode.value; },
    get maxImageSize() { return props.maxImageSize.value; },
    get savedPath() { return props.savedPath.value; },
    get savedIsDisc() { return props.savedIsDisc.enabled; },
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
            } catch (e) {
                // Silently ignore
            }
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
    constructor(maxSize) {
        this.maxSize = maxSize;
        this.cache = new Map();
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
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            Utils.safeDispose(this.cache.get(firstKey));
            this.cache.delete(firstKey);
        }
        
        this.cache.set(key, value);
    }

    has(key) {
        return this.cache.has(key);
    }

    clear() {
        this.cache.forEach(item => Utils.safeDispose(item));
        this.cache.clear();
    }
}

// ====================== FILE MANAGER ======================
const FileManager = {
    cache: new Map(),
    subfolderCache: new Map(),
    
    exists(path) {
        if (!path) return false;
        if (this.cache.has(path)) return this.cache.get(path);
        
        const exists = _isFile(path) || _isFolder(path);
        this.cache.set(path, exists);
        
        if (this.cache.size > CONFIG.MAX_FILE_CACHE) {
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
            const folderObj = fso.GetFolder(folder);
            const subFoldersEnum = new Enumerator(folderObj.SubFolders);
            
            for (; !subFoldersEnum.atEnd(); subFoldersEnum.moveNext()) {
                subfolders.push(subFoldersEnum.item().Path);
            }
        } catch (e) {
            try {
                const items = utils.Glob(folder + "\\*").toArray();
                _.forEach(items, item => {
                    if (this.isDirectory(item)) subfolders.push(item);
                });
            } catch (e2) {
                // Silently ignore
            }
        }
        
        this.subfolderCache.set(folder, subfolders);
        
        if (this.subfolderCache.size > CONFIG.MAX_FILE_CACHE) {
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
            return folderName === n ||
                   folderName.includes(n) ||
                   n.includes(folderName);
        });
    },
    
    // Parse a Last.fm JSON file and trigger local artwork search
    parseLastFmJson(jsonPath, baseFolder) {
        try {
            if (!_isFile(jsonPath)) return null;
            const content = _open(jsonPath);
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

// ====================== CUSTOM FOLDERS MANAGER ======================
const CustomFolders = {
    folders: [],
    
    load() {
        const saved = window.GetProperty("RP.CustomFolders", "");
        this.folders = saved ? _jsonParse(saved, []) : [];
    },
    
    save() {
        try {
            window.SetProperty("RP.CustomFolders", JSON.stringify(this.folders));
        } catch (e) {
            // Silently ignore
        }
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
        } catch (e) {
            // Silently ignore
        }
    },
    
    loadRim() {
        try {
            if (FileManager.exists(CONFIG.PATHS.RIM)) {
                this.rimSource = gdi.Image(CONFIG.PATHS.RIM);
            }
        } catch (e) {
            // Silently ignore
        }
    },
    
    setMaskType(index, isUserOverride = true) {
        if (index === this.currentMaskType) return false;
        
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
        
        if (w === targetSize && h === targetSize) return raw;
        
        try {
            const newImg = gdi.CreateImage(targetSize, targetSize);
            const g = newImg.GetGraphics();
            g.SetInterpolationMode(interpolationMode);
            
            // Only fill black for album art being converted to disc format
            // Real disc images and default disc already have proper backgrounds
            if (AssetManager.hasMask() && imageType === CONFIG.IMAGE_TYPE.ALBUM_ART) {
                g.FillSolidRect(0, 0, targetSize, targetSize, 0xFF000000);
            }
            
            const scale = targetSize / Math.min(w, h);
            const scaledW = Math.floor(w * scale);
            const scaledH = Math.floor(h * scale);
            const offsetX = Math.floor((targetSize - scaledW) / 2);
            const offsetY = Math.floor((targetSize - scaledH) / 2);
            
            g.DrawImage(raw, offsetX, offsetY, scaledW, scaledH, 0, 0, w, h);
            newImg.ReleaseGraphics(g);
            
            Utils.safeDispose(raw);
            return newImg;
        } catch (e) {
            return raw;
        }
    },
    
    scaleProportional(raw, maxSize, interpolationMode) {
        if (!raw) return null;
        
        const w = raw.Width;
        const h = raw.Height;
        const maxDim = Math.max(w, h);
        
        if (maxDim <= maxSize) return raw;
        
        try {
            const scale = maxSize / maxDim;
            const nw = Math.floor(w * scale);
            const nh = Math.floor(h * scale);
            
            const newImg = gdi.CreateImage(nw, nh);
            const g = newImg.GetGraphics();
            g.SetInterpolationMode(interpolationMode);
            g.DrawImage(raw, 0, 0, nw, nh, 0, 0, w, h);
            newImg.ReleaseGraphics(g);
            
            Utils.safeDispose(raw);
            return newImg;
        } catch (e) {
            return raw;
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
        if (!processed) return null;
        
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
        if (this.img && this.img !== newImg) {
            Utils.safeDispose(this.img);
        }
        // bgImg may alias img when no originalImg was supplied; only dispose if distinct
        if (this.bgImg && this.bgImg !== this.img) {
            Utils.safeDispose(this.bgImg);
        }
        
        this.img = newImg;
        // Only set bgImg if we have actual album art - don't use disc image as fallback
        // This ensures album art is always used for background when available
        this.bgImg = originalImg;
        if (this.bgImg && this.bgImg._bgId === undefined) {
            this.bgImg._bgId = ++State._bgIdCounter;
        }
        this.isDiscImage = discState;
        this.imageType = imgType;
        this.paintCache.valid = false;
        BackgroundCache.invalidate();  // Background might use image for blur
        OverlayCache.invalidate();
        
        // Pre-composite disc + rim for faster rendering during spin
        if (discState && newImg) {
            const size = Utils.getPanelDiscSize();
            DiscComposite.build(newImg, size, imgType);
        } else {
            DiscComposite.dispose();
        }
        
        RepaintHelper.disc();
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
        }
        
        pc.valid = true;
    },
    
    cleanup() {
        this.stopTimer();
        if (this.loadTimer) window.ClearTimeout(this.loadTimer);
        Utils.safeDispose(this.img);
        if (this.bgImg && this.bgImg !== this.img) {
            Utils.safeDispose(this.bgImg);
        }
        this.img = null;
        this.bgImg = null;
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
    tf_path: fb.TitleFormat("$directory_path(%path%)"),
    tf_folder: fb.TitleFormat("$directory(%path%)"),
    tf_artist: fb.TitleFormat("%artist%"),
    tf_album: fb.TitleFormat("%album%"),
    tf_title: fb.TitleFormat("%title%"),
    
    loadCached(path, imageType) {
        const targetSize = Utils.getPanelDiscSize();
        const key = `${path}|${targetSize}|${imageType}|${AssetManager.currentMaskType}`;
        
        let cached = this.cache.get(key);
        if (cached) return cached;
        
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
                this.cache.set(key, processed);
            }
            
            return processed;
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
        const metadataNames = _.compact([
            metadata.album, metadata.title, metadata.artist,
            metadata.folder, metadata.artistTitle, metadata.artistAlbum
        ]);
        const paths = FileManager.buildSearchPaths(folder, patterns, metadataNames, useVariations);
        return FileManager.findImageInPaths(paths);
    },
    
    searchInFolderAnyFile(folder, patterns) {
        const jsonArt = FileManager.searchLastFmJson(folder);
        if (jsonArt) return jsonArt;
        
        const paths = FileManager.buildSearchPaths(folder, patterns, []);
        return FileManager.findImageInPaths(paths);
    },
    
    // Shared helper for custom folder search.
    // For each registered custom folder, checks the folder itself and up to TWO
    // levels of subfolders for a name that matches the current track metadata.
    // When a match is found, searches inside that matched folder for an image.
    searchCustomFolders(uniqueSearchNames, patterns, isDiscSearch) {
        for (const customFolder of CustomFolders.getAll()) {
            if (!FileManager.isDirectory(customFolder)) continue;
            
            if (FileManager.matchesFolderName(customFolder, uniqueSearchNames)) {
                const result = this.searchFolderForImage(customFolder, patterns, isDiscSearch);
                if (result) return result;
            }
            
            const level1 = FileManager.getSubfolders(customFolder);
            for (const sub1 of level1) {
                if (FileManager.matchesFolderName(sub1, uniqueSearchNames)) {
                    const result = this.searchFolderForImage(sub1, patterns, isDiscSearch);
                    if (result) return result;
                }
                
                const level2 = FileManager.getSubfolders(sub1);
                for (const sub2 of level2) {
                    if (FileManager.matchesFolderName(sub2, uniqueSearchNames)) {
                        const result = this.searchFolderForImage(sub2, patterns, isDiscSearch);
                        if (result) return result;
                    }
                }
            }
        }
        return null;
    },
    
    // Helper to search a folder for image (reduces duplication)
    searchFolderForImage(folder, patterns, isDiscSearch) {
        const match = this.searchInFolder(folder, patterns, {}, true);
        if (match) {
            if (isDiscSearch) {
                const raw = gdi.Image(match);
                if (raw) {
                    const original = raw.Clone(0, 0, raw.Width, raw.Height);
                    const targetSize = Utils.getPanelDiscSize();
                    const processed = ImageProcessor.processForDisc(raw, targetSize, CONFIG.IMAGE_TYPE.REAL_DISC, P.interpolationMode);
                    if (processed) {
                        AssetManager.autoSelectMask(match);
                        return { img: processed, path: match, type: CONFIG.IMAGE_TYPE.REAL_DISC, original };
                    }
                    Utils.safeDispose(original);
                }
            }
            return match;
        }
        const anyMatch = this.searchInFolderAnyFile(folder, patterns);
        if (anyMatch) {
            if (isDiscSearch) {
                const raw = gdi.Image(anyMatch);
                if (raw) {
                    const original = raw.Clone(0, 0, raw.Width, raw.Height);
                    const targetSize = Utils.getPanelDiscSize();
                    const processed = ImageProcessor.processForDisc(raw, targetSize, CONFIG.IMAGE_TYPE.REAL_DISC, P.interpolationMode);
                    if (processed) {
                        AssetManager.autoSelectMask(anyMatch);
                        return { img: processed, path: anyMatch, type: CONFIG.IMAGE_TYPE.REAL_DISC, original };
                    }
                    Utils.safeDispose(original);
                }
            }
            return anyMatch;
        }
        return null;
    },
    
    searchForDisc(metadb, baseFolder) {
        const metadata = this.getMetadataNames(metadb);
        
        const rawNames = _.compact([
            metadata.artist, metadata.album, metadata.title,
            metadata.folder, metadata.artistTitle, metadata.artistAlbum
        ]);
        const uniqueSearchNames = _.uniq(_.flatMap(rawNames, n => FileManager.createSearchVariations(n)));
        
        // PHASE 1: Track folder tree
        const trackFolderMatch = this.searchInFolder(baseFolder, CONFIG.DISC_PATTERNS, metadata);
        if (trackFolderMatch) {
            const img = this.loadCached(trackFolderMatch, CONFIG.IMAGE_TYPE.REAL_DISC);
            if (img) {
                AssetManager.autoSelectMask(trackFolderMatch);
                // Load original for background blur then immediately dispose the loader
                const _rawOrig = gdi.Image(trackFolderMatch);
                const original = _rawOrig ? _rawOrig.Clone(0, 0, _rawOrig.Width, _rawOrig.Height) : img;
                Utils.safeDispose(_rawOrig);
                return { img, path: trackFolderMatch, type: CONFIG.IMAGE_TYPE.REAL_DISC, original };
            }
        }
        
        const trackSubfolders = FileManager.enumSubfolders(baseFolder);
        for (let subfolder of trackSubfolders) {
            if (subfolder === baseFolder) continue;
            const result = this.searchFolderForImage(subfolder, CONFIG.DISC_PATTERNS, true);
            if (result) return result;
        }
        
        // PHASE 2: Custom folders
        return this.searchCustomFolders(uniqueSearchNames, CONFIG.DISC_PATTERNS, true);
    },
    
    searchForCover(metadb, baseFolder) {
        const metadata = this.getMetadataNames(metadb);
        
        const rawNames = _.compact([
            metadata.artist, metadata.album, metadata.folder, metadata.artistAlbum
        ]);
        const uniqueSearchNames = _.uniq(_.flatMap(rawNames, n => FileManager.createSearchVariations(n)));
        
        // PHASE 1: Track folder tree
        const jsonArt = FileManager.searchLastFmJson(baseFolder);
        if (jsonArt) return jsonArt;
        
        const trackMatch = this.searchInFolder(baseFolder, CONFIG.COVER_PATTERNS, metadata);
        if (trackMatch) return trackMatch;
        
        const trackSubfolders = FileManager.enumSubfolders(baseFolder);
        for (let subfolder of trackSubfolders) {
            if (subfolder === baseFolder) continue;
            const result = this.searchFolderForImage(subfolder, CONFIG.COVER_PATTERNS, false);
            if (result) return result;
        }
        
        // PHASE 2: Custom folders
        return this.searchCustomFolders(uniqueSearchNames, CONFIG.COVER_PATTERNS, false);
    },
    
    loadForMetadb(metadb, immediate = false) {
        if (!metadb) return;
        
        const folderPath = this.tf_path.EvalWithMetadb(metadb);
        
        // Skip reload if same album on track change - keep disc spinning
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
            State.loadToken++;  // Increment token - any stale async responses will be discarded
            // Don't reset angle - keep disc spinning
            
            let bgOriginal = null;
            let coverRaw = null;
            const coverPath = this.searchForCover(metadb, folderPath);
            if (coverPath) {
                try {
                    const _loaded = gdi.Image(coverPath);
                    if (_loaded) {
                        bgOriginal = _loaded.Clone(0, 0, _loaded.Width, _loaded.Height);
                        coverRaw = _loaded;   // consumed by Phase 2 processor (or disposed below)
                    }
                } catch (e) {}
            }
            
            // PHASE 1: Search track folder for disc art
            if (!P.useAlbumArtOnly) {
                const result = this.searchForDisc(metadb, folderPath);
                if (result) {
                    Utils.safeDispose(coverRaw);   // bgOriginal carries the background; raw not needed
                    // Always use album art for background, never disc art
                    State.setImage(result.img, true, result.type, bgOriginal);
                    props.savedPath.value = result.path;
                    props.savedIsDisc.enabled = true;
                    State.updateTimer();
                    // Trigger async album art for background if no local album art found
                    if (!bgOriginal) {
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
                    }

                    Utils.safeDispose(coverRaw);
                    Utils.safeDispose(bgOriginal);
                } catch (e) {
                    Utils.safeDispose(coverRaw);
                    Utils.safeDispose(bgOriginal);
                }
            }
            
            // PHASE 3: Fallback - foobar's built-in async album art
            State.pendingArtToken = State.loadToken;  // Mark token for async response
            utils.GetAlbumArtAsync(window.ID, metadb, 0);
        };
        
        if (immediate) {
            doLoad();
        } else {
            State.loadTimer = window.SetTimeout(doLoad, CONFIG.LOAD_DEBOUNCE_MS);
        }
    },
    
    handleAlbumArt(metadb, image, image_path) {
        // Discard stale response if token changed (new load started after async request)
        if (State.pendingArtToken !== State.loadToken) {
            Utils.safeDispose(image);
            return;
        }
        
        if (!State.currentMetadb) {
            Utils.safeDispose(image);
            return;
        }
        
        const metadbMatches = metadb.Compare(State.currentMetadb);
        
        const hadBg = !!State.bgImg;
        
        if (image) {
            try {
                if (!metadbMatches) {
                    Utils.safeDispose(image);
                    return;
                }
                
                const original = image.Clone(0, 0, image.Width, image.Height);
                
                if (State.bgImg) {
                    Utils.safeDispose(State.bgImg);
                }
                State.bgImg = original;
                if (State.bgImg._bgId === undefined) {
                    State.bgImg._bgId = ++State._bgIdCounter;
                }
                BackgroundCache.invalidate();
                
                if (metadbMatches) {
                    const targetSize = Utils.getPanelDiscSize();
                    if (P.useAlbumArtOnly) {
                        const scaled = ImageProcessor.scaleProportional(
                            image, 
                            CONFIG.MAX_STATIC_SIZE, 
                            P.interpolationMode
                        );
                        if (scaled) {
                            State.setImage(scaled, false, CONFIG.IMAGE_TYPE.ALBUM_ART, original);
                            if (image_path) props.savedPath.value = image_path;
                        }
                    } else {
                        const processed = ImageProcessor.processForDisc(
                            image, 
                            targetSize, 
                            CONFIG.IMAGE_TYPE.ALBUM_ART, 
                            P.interpolationMode
                        );
                        if (processed) {
                            State.setImage(processed, true, CONFIG.IMAGE_TYPE.ALBUM_ART, original);
                            if (image_path) props.savedPath.value = image_path;
                        }
                    }
                }
                
                Utils.safeDispose(image);
                
                if (!hadBg) {
                    RepaintHelper.background();
                }
                State.updateTimer();
                return;
            } catch (e) {
                // Silently ignore
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
            }
        } catch (e) {
            // Silently ignore
        }
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
        
        // If no rim needed, just reference the disc directly (no copy)
        if (!showRim) {
            this.img = discImg.Clone(0, 0, discImg.Width, discImg.Height);
            this.valid = true;
            return;
        }
        
        // Build composite with rim
        try {
            this.img = gdi.CreateImage(size, size);
            const g = this.img.GetGraphics();
            
            // Draw disc
            g.DrawImage(discImg, 0, 0, size, size, 0, 0, discImg.Width, discImg.Height);
            
            // Draw rim on top
            const rim = AssetManager.getRim(size);
            if (rim) {
                g.DrawImage(rim, 0, 0, size, size, 0, 0, rim.Width, rim.Height);
            }
            
            this.img.ReleaseGraphics(g);
            this.valid = true;
        } catch (e) {
            this.dispose();
            this.valid = true;
        }
    }
};

// ====================== BACKGROUND CACHE ======================
const BackgroundCache = {
    _lru:       new LRUCache(CONFIG.MAX_BG_CACHE),
    _activeKey: '',     // key that produced .img; '' means "needs rebuild"
    img:        null,   // alias into _lru for the currently active blurred bitmap

    _makeKey(w, h) {
        const bgId = (State.bgImg && State.bgImg._bgId !== undefined)
            ? State.bgImg._bgId : 'none';
        return `${bgId}|${P.blurRadius}|${w}|${h}`;
    },

    invalidate() {
        this._activeKey = '';
        this.img = null;
    },
    
    ensure(w, h) {
        if (w <= 0 || h <= 0) return;

        const wantBlur = !P.bgUseUIColor && P.backgroundEnabled && P.blurEnabled && State.bgImg;

        if (!wantBlur) {
            // No blurred background required — sentinel key prevents repeated checks.
            if (this._activeKey !== 'none') {
                this._activeKey = 'none';
                this.img = null;
            }
            return;
        }

        const key = this._makeKey(w, h);
        if (this._activeKey === key) return;   // ← fast path: same album/size/radius

        // Check LRU before doing any GDI work.
        const cached = this._lru.get(key);
        if (cached) {
            this._activeKey = key;
            this.img = cached;
            return;
        }

        // Cache miss — build and store.  This is the only place StackBlur runs.
        try {
            const src    = State.bgImg;
            const newImg = gdi.CreateImage(w, h);
            const g      = newImg.GetGraphics();
            g.DrawImage(src, 0, 0, w, h, 0, 0, src.Width, src.Height);
            newImg.ReleaseGraphics(g);
            newImg.StackBlur(P.blurRadius);   // ← expensive; runs once per unique key

            this._lru.set(key, newImg);       // LRU evicts+disposes oldest if full
            this._activeKey = key;
            this.img = newImg;
        } catch (e) {
            // On error set sentinel so we don't retry every frame.
            this._activeKey = key;
            this.img = null;
        }
    },

    // Dispose all cached bitmaps (called from on_script_unload only).
    dispose() {
        this._lru.clear();       // LRUCache.clear() calls Utils.safeDispose on every entry
        this.img = null;
        this._activeKey = '';
    }
};

// ====================== OVERLAY INVALIDATOR ======================
// Batches overlay invalidation to prevent repaint storms
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
    
    // pc = State.paintCache (needed for glow position)
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
        
        try {
            this.img = gdi.CreateImage(w, h);
            const g = this.img.GetGraphics();
            
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
                const op    = P.opGlow;
                const white = DS_WHITE;
                const cx = State.isDiscImage ? pc.discX + pc.discSize / 2 : pc.staticX + pc.staticW / 2;
                const cy = State.isDiscImage ? pc.discY + pc.discSize / 2 : pc.staticY + pc.staticH / 2;
                const maxR = (State.isDiscImage ? pc.discSize : Math.max(pc.staticW, pc.staticH)) * 0.75;
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
                for (let y = 0; y < h; y += spacing) {
                    g.FillSolidRect(0, y, w, 1, col);
                }
            }
            
            this.img.ReleaseGraphics(g);
        } catch (e) {
            this.dispose();
            this.valid = true;
        }
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
        gr.DrawImage(
            State.img,
            pc.staticX, pc.staticY, pc.staticW, pc.staticH,
            0, 0, pc.imgWidth, pc.imgHeight
        );
    },
    
    paintDisc(gr, pc) {
        gr.SetSmoothingMode(CONFIG.SMOOTHING_MODE);
        
        const size = pc.discSize;
        const x = pc.discX;
        const y = pc.discY;
        
        // Rebuild composite if needed (e.g. after resize)
        if (!DiscComposite.valid && State.img) {
            DiscComposite.build(State.img, Math.floor(size), State.imageType);
        }
        
        // Use pre-composited disc+rim image (single DrawImage call)
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
            // Draw filled border rectangles on all sides
            gr.FillSolidRect(0, 0, w, borderSize, borderColor);                    // Top
            gr.FillSolidRect(0, h - borderSize, w, borderSize, borderColor);      // Bottom
            gr.FillSolidRect(0, borderSize, borderSize, h - borderSize * 2, borderColor);  // Left
            gr.FillSolidRect(w - borderSize, borderSize, borderSize, h - borderSize * 2, borderColor);  // Right
        } catch (e) {
            // Silently ignore
        }
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
        } catch (e) {
            // Silently ignore
        }
    }
};

// ====================== PRESET MANAGER ======================
const PresetManager = {
    // Snapshot all current settings into a plain object for JSON serialisation.
    _capture() {
        return {
            // Spin state
            spinningEnabled:     props.spinningEnabled.enabled,
            // Image settings
            spinSpeed:           props.spinSpeed.value,
            useAlbumArtOnly:     props.useAlbumArtOnly.enabled,
            keepAspectRatio:     props.keepAspectRatio.enabled,
            interpolationMode:   props.interpolationMode.value,
            maxImageSize:        props.maxImageSize.value,
            maskType:            AssetManager.currentMaskType,
            userOverrideMask:    AssetManager.userOverrideMask,
            // Overlay effects
            overlayAllOff:       props.overlayAllOff.enabled,
            savedOverlay:        props.savedOverlay.value,   // restore state for "All Effects Off" toggle
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
            // Border & Padding
            borderSize:          props.borderSize.value,
            borderColor:         props.borderColor.value,
            padding:             props.padding.value,
            // Background
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
        } catch (e) {
            // Silently ignore
        }
    },
    
    load(slot) {
        if (!_.inRange(slot, 1, 4)) return;
        try {
            const str = window.GetProperty('Disc.Preset' + slot, null);
            if (!str) return;
            const d = JSON.parse(str);
            
            // Spin state
            if (_.isBoolean(d.spinningEnabled)) {
                props.spinningEnabled.enabled = d.spinningEnabled;
            }
            
            // Image settings
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
                    // Same index — setMaskType would bail early, so update override directly.
                    AssetManager.userOverrideMask      = isOverride;
                    props.userOverrideMask.enabled     = isOverride;
                }
            }
            
            // Overlay effects
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
            // Explicitly flush phosphor color cache so next overlay build uses the restored theme
            PhosphorManager.invalidateCache();
            
            // Border & Padding
            if (_.isNumber(d.borderSize))    props.borderSize.value = _.clamp(d.borderSize, 0, 50);
            if (_.isNumber(d.borderColor))   props.borderColor.value = d.borderColor >>> 0;
            if (_.isNumber(d.padding))       props.padding.value = _.clamp(d.padding, 0, 100);
            
            // Background
            if (_.isBoolean(d.backgroundEnabled)) props.backgroundEnabled.enabled = d.backgroundEnabled;
            if (_.isBoolean(d.bgUseUIColor))      props.bgUseUIColor.enabled      = d.bgUseUIColor;
            if (_.isNumber(d.blurRadius))    props.blurRadius.value = _.clamp(d.blurRadius, 0, 254);
            if (_.isBoolean(d.blurEnabled))  props.blurEnabled.enabled = d.blurEnabled;
            if (_.isNumber(d.darkenValue))   props.darkenValue.value = _.clamp(d.darkenValue, 0, 50);
            if (_.isNumber(d.customBackgroundColor)) props.customBackgroundColor.value = d.customBackgroundColor >>> 0;
            
            // Reload image with new settings applied
            ImageLoader.cache.clear();
            AssetManager.maskCache.clear();
            AssetManager.rimCache.clear();
            BackgroundCache.invalidate();
            OverlayInvalidator.request();
            DiscComposite.invalidate();
            State.paintCache.valid = false;
            State.updateTimer();
            if (State.currentMetadb) ImageLoader.loadForMetadb(State.currentMetadb, true);
            RepaintHelper.full();
        } catch (e) {
            // Silently ignore
        }
    }
};

// ====================== SLIDER STATE ======================
const Slider = {
    active:  false,
    target:  null,   // "Reflection" | "Glow" | "Scanlines" | "Phosphor"
    
    timers: {
        overlayRebuild: null   // debounce for OverlayCache rebuild after wheel events
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
    
    // Draw one horizontal bar + numeric label above it.
    drawBar(gr, value, max, barY) {
        const w    = window.Width;
        const barW = Math.max(SLIDER_MIN_WIDTH, Math.floor(w * SLIDER_WIDTH_RATIO));
        const barH = SLIDER_HEIGHT;
        const bx   = Math.floor((w - barW) / 2);
        
        // Track (background)
        gr.FillSolidRect(bx, barY, barW, barH,
            DiscSpin_SetAlpha(DS_WHITE, 55));
        
        // Fill (progress)
        const fillW = Math.floor(barW * (value / max));
        if (fillW > 0) {
            gr.FillSolidRect(bx, barY, fillW, barH,
                DiscSpin_SetAlpha(DS_WHITE, 185));
        }
        
        // Value label centred above the bar
        const font  = this.getFont();
        const label = value.toString();
        const sz    = gr.MeasureString(label, font, 0, 0, w, window.Height);
        gr.DrawString(label, font, DS_WHITE,
            Math.floor((w - sz.Width) / 2),
            barY - Math.ceil(sz.Height) - 2,
            Math.ceil(sz.Width), Math.ceil(sz.Height));
    },
    
    // Draw the effect name as a small title line above the value.
    drawTitle(gr, text, barY) {
        const w    = window.Width;
        const font = this.getFont();
        const sz   = gr.MeasureString(text, font, 0, 0, w, window.Height);
        // two lines above barY: value label height + gap + title height
        const valSz  = gr.MeasureString('255', font, 0, 0, w, window.Height);
        const titleY = barY - Math.ceil(valSz.Height) - 4 - Math.ceil(sz.Height) - 4;
        gr.DrawString(text, font,
            DiscSpin_SetAlpha(DS_WHITE, 180),
            Math.floor((w - sz.Width) / 2),
            titleY,
            Math.ceil(sz.Width), Math.ceil(sz.Height));
    },
    
    // Called from on_paint when slider is active.
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
        
        // --- Phosphor Theme (top of menu) ---
        const themeMenu = window.CreatePopupMenu();
        _.forEach(CONFIG.PHOSPHOR_THEMES, (theme, i) => {
            themeMenu.AppendMenuItem(0, 600 + i, theme.name);
            if (props.phosphorTheme.value === i) themeMenu.CheckMenuItem(600 + i, true);
        });
        themeMenu.AppendMenuSeparator();
        themeMenu.AppendMenuItem(0, 610, 'Custom...');
        if (props.phosphorTheme.value === DISC_CUSTOM_THEME_INDEX) themeMenu.CheckMenuItem(610, true);
        themeMenu.AppendTo(overlay, (grayed || !props.showPhosphor.enabled) ? 1 : 0, "Phosphor Theme");
        
        overlay.AppendMenuSeparator();
        
        // --- Master kill-switch ---
        overlay.AppendMenuItem(0, 199, "— All Effects Off");
        if (props.overlayAllOff.enabled) overlay.CheckMenuItem(199, true);
        
        overlay.AppendMenuSeparator();
        
        // --- Effect toggles (all together) ---
        overlay.AppendMenuItem(grayed ? 1 : 0, 200, "Reflection");
        if (!grayed && props.showReflection.enabled) overlay.CheckMenuItem(200, true);
        
        overlay.AppendMenuItem(grayed ? 1 : 0, 210, "Glow");
        if (!grayed && props.showGlow.enabled) overlay.CheckMenuItem(210, true);
        
        overlay.AppendMenuItem(grayed ? 1 : 0, 220, "Scanlines");
        if (!grayed && props.showScanlines.enabled) overlay.CheckMenuItem(220, true);
        
        overlay.AppendMenuItem(grayed ? 1 : 0, 230, "Phosphor");
        if (!grayed && props.showPhosphor.enabled) overlay.CheckMenuItem(230, true);
        
        overlay.AppendMenuSeparator();
        
        // --- Opacity submenu ---
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
        
        const speedIdx = props.spinSpeed.value <= 1.0 ? 10 : (props.spinSpeed.value >= 3.0 ? 12 : 11);
        speedMenu.CheckMenuRadioItem(10, 12, speedIdx);
        
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
        
        // Use UI Color (top — supersedes all other background options)
        bgMenu.AppendMenuItem(0, 263, 'Use UI Color as Background');
        if (uiColorActive) bgMenu.CheckMenuItem(263, true);
        
        bgMenu.AppendMenuSeparator();
        
        // Enable Background Art toggle (grayed when UI color mode is on)
        bgMenu.AppendMenuItem(uiColorActive ? 1 : 0, 260, 'Enable Background Art');
        if (!uiColorActive && props.backgroundEnabled.enabled) bgMenu.CheckMenuItem(260, true);
        
        // Custom Background Color (grayed when UI color mode or art mode is on)
        bgMenu.AppendMenuItem(uiColorActive || props.backgroundEnabled.enabled ? 1 : 0, 261, 'Custom Background Color...');
        
        bgMenu.AppendMenuSeparator();
        
        // Blur Settings submenu (grayed when UI color mode is on, or art is off)
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
        
        // Darken Background submenu (grayed when UI color mode is on)
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
            toggles[idx].prop.toggle();  // Built-in toggle!
            if (toggles[idx].reload && State.currentMetadb) {
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
            OverlayInvalidator.request();
            if (State.currentMetadb) ImageLoader.loadForMetadb(State.currentMetadb, true);
            changed = true;
        }
        
        // Size presets (30-34)
        const sizePreset = _.find(CONFIG.DISC_SIZE_PRESETS, (p, i) => (i + 30) === idx);
        if (sizePreset) {
            props.maxImageSize.value = sizePreset.value;
            ImageLoader.cache.clear();
            AssetManager.maskCache.clear();
            AssetManager.rimCache.clear();
            OverlayInvalidator.request();
            if (State.currentMetadb) ImageLoader.loadForMetadb(State.currentMetadb, true);
            changed = true;
        }
        
        // Mask types (40-42)
        if (idx >= 40 && idx <= 42) {
            if (AssetManager.setMaskType(idx - 40, true)) {
                ImageLoader.cache.clear();
                OverlayInvalidator.request();
                if (State.currentMetadb) ImageLoader.loadForMetadb(State.currentMetadb, true);
                changed = true;
            }
        }
        
        // Custom folder operations
        if (idx === 50) {
            try {
                const folder = utils.InputBox(window.ID, "Enter folder path for custom artwork search:", "Custom Artwork Folder", "", true);
                if (folder && CustomFolders.add(folder)) {
                    if (State.currentMetadb) ImageLoader.loadForMetadb(State.currentMetadb, true);
                    changed = true;
                }
            } catch (e) {
                // Silently ignore
            }
        } else if (idx >= 60 && idx <= 64) {
            if (CustomFolders.remove(idx - 60)) {
                if (State.currentMetadb) ImageLoader.loadForMetadb(State.currentMetadb, true);
                changed = true;
            }
        } else if (idx === 70) {
            CustomFolders.clear();
            if (State.currentMetadb) ImageLoader.loadForMetadb(State.currentMetadb, true);
            changed = true;
        }
        
        // Clear cache (900)
        if (idx === 900) {
            ImageLoader.cache.clear();
            AssetManager.maskCache.clear();
            AssetManager.rimCache.clear();
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
        if (_.inRange(idx, 600, 610)) {
            props.phosphorTheme.value = idx - 600;
            OverlayInvalidator.request();
            changed = true;
        }
        if (idx === 610) {
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
            props.interpolationMode.value      = 1;
            props.maxImageSize.value           = 250;
            AssetManager.setMaskType(0, false);   // CD mask, auto-detect re-enabled
            
            // Overlay effects
            props.overlayAllOff.enabled        = false;
            props.savedOverlay.value           = '';
            props.showReflection.enabled       = true;
            props.opReflection.value           = 30;
            props.showGlow.enabled             = true;
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
            AssetManager.maskCache.clear();
            AssetManager.rimCache.clear();
            BackgroundCache.invalidate();
            OverlayInvalidator.request();
            DiscComposite.invalidate();
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
        
        // Blur Radius
        if (_.inRange(idx, 271, 282)) {
            props.blurRadius.value = (idx - 271) * 20;
            BackgroundCache.invalidate();
            changed = true;
        }
        
        // Blur Radius Max 254 (282)
        if (idx === 282) {
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
    
    // Layer 1: Background

    if (P.bgUseUIColor) {
        // Use UI Color: let the SMP/Windows theme colour show as the background.
        gr.FillSolidRect(0, 0, w, h, bgColor);
    } else {
        gr.FillSolidRect(0, 0, w, h, P.customBackgroundColor);
        
        // Draw background image (blurred if enabled, otherwise stretch to cover)
        const hasBgImage = P.backgroundEnabled && State.bgImg && State.bgImg.Width > 0 && State.bgImg.Height > 0;
        if (hasBgImage) {
            if (P.blurEnabled) {
                BackgroundCache.ensure(w, h);
                if (BackgroundCache.img) {
                    gr.DrawImage(BackgroundCache.img, 0, 0, w, h, 0, 0, BackgroundCache.img.Width, BackgroundCache.img.Height);
                }
            } else {
                // Draw unblurred background stretched to cover panel (COVER mode, not contain)
                gr.DrawImage(State.bgImg, 0, 0, w, h, 0, 0, State.bgImg.Width, State.bgImg.Height);
            }
        }
        
        // Darken overlay.
        if (P.darkenValue > 0) {
            const alpha = Math.floor(P.darkenValue * 2.55);
            gr.FillSolidRect(0, 0, w, h, DiscSpin_SetAlpha(DS_BLACK, alpha));
        }
    }
    
    // Layer 2: Disc/image (rotates if spinning)
    Renderer.paint(gr);
    
    // Layer 3: Border
    Renderer.drawBorder(gr);
    
    // Layer 4: Overlay effects (all CRT effects over border — cached bitmap)
    if (!OverlayCache.valid) {
        OverlayCache.build(w, h, State.paintCache);
    }
    if (OverlayCache.img) {
        gr.DrawImage(OverlayCache.img, 0, 0, w, h, 0, 0, w, h);
    }
    
    // Layer 5: Opacity slider UI (drawn last — always on top)
    SliderRenderer.draw(gr);
}

function on_size() {
    State.paintCache.valid = false;
    BackgroundCache.invalidate();
    OverlayInvalidator.request();
    DiscComposite.invalidate();
    AssetManager.maskCache.clear();
    AssetManager.rimCache.clear();
    FileManager.invalidateSubfolderCache();
    RepaintHelper.full();
}

// ================= ARTWORK DISPATCHER =================
// Single source of truth for all artwork updates - prevents duplicate loads and repaint storms
const ArtDispatcher = {
    _pending: null,      // { reason, metadb }
    _timer: null,
    
    // Priority: track > stop > selection > playlist
    _priority: { track: 4, stop: 3, selection: 2, playlist: 1 },
    
    request(reason, metadb) {
        const priority = this._priority[reason] || 0;
        
        // If we have a pending request, only override if higher priority
        if (this._pending) {
            const currentPriority = this._priority[this._pending.reason] || 0;
            if (priority <= currentPriority) {
                return; // Ignore lower/equal priority request
            }
        }
        
        this._pending = { reason, metadb };
        
        // Debounce to prevent repaint storms
        if (this._timer) {
            window.ClearTimeout(this._timer);
        }
        
        this._timer = window.SetTimeout(() => {
            this._dispatch();
        }, 50); // 50ms debounce
    },
    
    _dispatch() {
        if (!this._pending) return;
        
        const { reason, metadb } = this._pending;
        this._pending = null;
        this._timer = null;
        
        switch (reason) {
            case 'track':
                if (metadb && State.currentMetadb && State.currentMetadb.Compare(metadb)) {
                    return; // Skip if same track already loaded
                }
                if (metadb) {
                    ImageLoader.loadForMetadb(metadb, true);
                }
                break;
            case 'stop':
                if (metadb !== 2) {
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

function on_playback_pause() {
    State.updateTimer();
}

function on_playback_stop(reason) {
    ArtDispatcher.request('stop', reason);
}

function on_playback_starting() {
    State.updateTimer();
}

function on_playback_seek() {
    State.updateTimer();
}

function on_selection_changed() {
    if (fb.IsPlaying || fb.IsPaused) return;
    
    const sel = fb.GetSelection();
    if (sel && sel.Count > 0) {
        ArtDispatcher.request('selection', sel.Item(0));
    }
}

function on_playlist_switch() {
    ArtDispatcher.request('playlist', null);
}

function on_get_album_art_done(metadb, art_id, image, image_path) {
    ImageLoader.handleAlbumArt(metadb, image, image_path);
}

function on_mouse_rbtn_up(x, y) {
    return MenuManager.show(x, y);
}

function on_mouse_lbtn_down(x, y) {
    if (window.SetFocus) window.SetFocus();
}

// Left-click anywhere dismisses an active opacity slider.
function on_mouse_lbtn_up(x, y) {
    if (Slider.active) {
        Slider.deactivate();
        return true;
    }
}

// Mouse wheel adjusts the active opacity slider.

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
    
    // Update value and repaint bar IMMEDIATELY — cheap, no GDI rebuild needed.
    prop.value = _.clamp(prop.value + delta * SLIDER_STEP, 0, 255);
    RepaintHelper.full();
    
    // Debounce only the overlay cache rebuild (expensive GDI operation).
    if (Slider.timers.overlayRebuild) window.ClearTimeout(Slider.timers.overlayRebuild);
    Slider.timers.overlayRebuild = window.SetTimeout(() => {
        Slider.timers.overlayRebuild = null;
        OverlayInvalidator.request();
    }, 100);
}

function on_script_unload() {
    if (ArtDispatcher._timer) {
        window.ClearTimeout(ArtDispatcher._timer);
        ArtDispatcher._timer = null;
    }
    ArtDispatcher._pending = null;
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
}

// ====================== INITIALIZATION ======================
function init() {
    // Props are already loaded!
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
                const img = ImageLoader.loadCached(props.savedPath.value, imageType);
                if (img) {
                    // Load original for background blur
                    const raw = gdi.Image(props.savedPath.value);
                    const original = raw ? raw.Clone(0, 0, raw.Width, raw.Height) : img;
                    Utils.safeDispose(raw);  // LEAK fix: raw is no longer needed after Clone
                    State.setImage(img, props.savedIsDisc.enabled, imageType, original);
                }
            }
            // Try to get async album art - fetches fresh art for background if track playing
            const np = fb.GetNowPlaying();
            if (np) {
                State.loadToken++;
                State.pendingArtToken = State.loadToken;
                utils.GetAlbumArtAsync(window.ID, np, 0);
            }
        } catch (e) {
            // Silently ignore
        }
    }
    
    State.updateTimer();
}

(function waitForReady() {
    window.MinHeight = 75;
    window.MinWidth  = 75;
    if (window.Width > 0 && window.Height > 0) {
        init();
    } else {
        readyTimer = window.SetTimeout(waitForReady, 50);
    }
})();