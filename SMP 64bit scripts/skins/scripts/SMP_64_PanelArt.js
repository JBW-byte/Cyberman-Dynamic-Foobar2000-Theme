'use strict';

	       // ========= AUTHOR L.E.D. AI ASSISTED ========= \\
	      // === Polished Panel Artwork and Trackinfo v2 === \\
	     // ========= Blur Artwork + Trackinfo + AI ========= \\

   // ===================*** Foobar2000 64bit ***================== \\
  // ======= For Spider Monekey Panel 64bit, author: marc2003 ====== \\
 // === SMP 64bit script samples StackBlur+Panel, author:marc2003 === \\

window.DefineScript("SMP 64bit PanelArt V2", { author: "L.E.D. (optimized)" });

// ====================== HELPER INCLUDES ======================
include(fb.ComponentPath + 'samples\\complete\\js\\lodash.min.js');
include(fb.ComponentPath + 'samples\\complete\\js\\helpers.js');
include(fb.ComponentPath + 'samples\\complete\\js\\panel.js');

function _fbSanitise(str) {
	if (!str) return '';
	return utils.ReplaceIllegalChars(str, true);
}

// ================= USER CONFIGURABLE DEFAULTS =================
const USER_DEFAULTS = {
    // Album Art Settings
    ALBUM_ART_PADDING: 40,
    ALBUM_ART_BORDER: 5,
    ALBUM_ART_BORDER_COLOR: _RGB(32, 32, 32),

    // Blur & Background
    BLUR_RADIUS: 240,
    DARKEN_VALUE: 10,
    BACKGROUND_COLOR: _RGB(25, 25, 25),

    // Overlay Effects (opacity 0-255)
    REFLECTION_OPACITY: 30,            // Matches DiscSpin2
    GLOW_OPACITY: 40,                  // Matches DiscSpin2
    SCANLINES_OPACITY: 80,             // Matches DiscSpin2
    PHOSPHOR_OPACITY: 20,              // Matches DiscSpin2

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
const MAX_FONT_CACHE = 50;
const MAX_TEXT_HEIGHT_CACHE = 100;

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
    "cover", "front", "folder", "albumart", "album", "artwork", "art"
];

const EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".bmp"];

// JSON artwork file patterns - Last.fm only
const JSON_ART_FILES = [
    "lastfm_artist_getSimilar.json",
    "lastfm_album_getInfo.json",
    "lastfm_track_getInfo.json",
    "lastfm.json"
];

// Note: MF_STRING and MF_GRAYED are from helpers.js, but MF_CHECKED is not defined there
const MF_CHECKED = 0x00000008;

function PanelArt_SetAlpha(col, a) {
    return (col & 0x00ffffff) | (a << 24);
}

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

        currentPhosphorTheme: 8,        // Cyber — matches DiscSpin default
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
        extraFontSize: USER_DEFAULTS.EXTRA_SIZE
    };
}

// ================= STATE MIGRATION =================
function migrateState(oldState, oldVersion) {
    let state = _.assign({}, oldState);
    
    if (oldVersion < 2) {
        // Use lodash for cleaner property mapping
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
    
    return state;
}

// ================= VALIDATION =================
const Validator = {
    validateConfig(config) {
        const defaults = getDefaultState();
        const validated = _.assign({}, config);
        
        // Use lodash's _.clamp for cleaner code
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
        
        validated.customPhosphorColor = this.validateColor(validated.customPhosphorColor, defaults.customPhosphorColor);
        validated.borderColor = this.validateColor(validated.borderColor, defaults.borderColor);
        validated.customBackgroundColor = this.validateColor(validated.customBackgroundColor, defaults.customBackgroundColor);
        
        // Use lodash's _.defaults for boolean values
        _.defaults(validated, {
            showReflection: defaults.showReflection,
            showGlow: defaults.showGlow,
            showScanlines: defaults.showScanlines,
            showPhosphor: defaults.showPhosphor,
            blurEnabled: defaults.blurEnabled,
            textShadowEnabled: defaults.textShadowEnabled,
            extraInfoEnabled: defaults.extraInfoEnabled,
            backgroundEnabled: defaults.backgroundEnabled,
            albumArtEnabled: defaults.albumArtEnabled,
            overlayAllOff: defaults.overlayAllOff
        });
        
        return validated;
    },
    
    validateColor(color, defaultColor) {
        if (!_.isNumber(color) || isNaN(color)) return defaultColor;
        return color >>> 0;
    }
};

// ================= FILE MANAGER (Optimized with helpers.js) =================
const FileManager = {
    cache: new Map(),
    
    // Sanitize metadata for clean searches - removes brackets, special chars, extra spaces
    sanitizeMetadata(str) {
        if (!str) return "";
        
        let cleaned = str;
        
        // Remove content in brackets/parentheses (including the brackets)
        cleaned = cleaned.replace(/\[.*?\]/g, '');  // [text]
        cleaned = cleaned.replace(/\(.*?\)/g, '');  // (text)
        cleaned = cleaned.replace(/\{.*?\}/g, '');  // {text}
        cleaned = cleaned.replace(/<.*?>/g, '');    // <text>
        
        // Remove common prefixes/suffixes
        cleaned = cleaned.replace(/^(The|A|An)\s+/i, '');  // Leading articles
        
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
        const cleaned = this.sanitizeMetadata(str);
        
        // Original cleaned
        variations.push(cleaned);
        
        // Remove "The", "A", "An" if not already done
        const withoutArticle = cleaned.replace(/^(The|A|An)\s+/i, '');
        if (withoutArticle !== cleaned) {
            variations.push(withoutArticle);
        }
        
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
    
    // Use _isFile from helpers.js
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
    
    // Use _isFolder from helpers.js
    isDirectory: _isFolder,
    
    getSubfolders(folder) {
        if (!_isFolder(folder)) return [];
        
        const subfolders = [];
        
        try {
            const folderObj = fso.GetFolder(folder);
            const subFoldersEnum = new Enumerator(folderObj.SubFolders);
            
            for (; !subFoldersEnum.atEnd(); subFoldersEnum.moveNext()) {
                subfolders.push(subFoldersEnum.item().Path);
            }
        } catch (e) {
            try {
                const items = utils.Glob(folder + "\\*").toArray();
                _.forEach(items, (item) => {
                    if (_isFolder(item)) subfolders.push(item);
                });
            } catch (e2) {
                // Silent fail
            }
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
        const sanitizedFolderName = _.toLower(this.sanitizeMetadata(folderName));
        
        return _.some(searchNames, (name) => {
            if (!name) return false;
            
            // Direct comparison with sanitized version
            const sanitizedSearchName = _.toLower(this.sanitizeMetadata(name));
            
            if (sanitizedFolderName === sanitizedSearchName) {
                return true;
            }
            
            // Also check if folder contains the search term
            if (sanitizedFolderName.includes(sanitizedSearchName) || 
                sanitizedSearchName.includes(sanitizedFolderName)) {
                return true;
            }
            
            return false;
        });
    },
    
    clear() {
        this.cache.clear();
    }
};

// ================= CUSTOM FOLDERS MANAGER (Optimized with lodash) =================
const CustomFolders = {
    folders: [],
    
    load() {
        try {
            const saved = window.GetProperty("PanelArt.CustomFolders", "");
            if (saved) {
                const parsed = JSON.parse(saved);
                if (_.isArray(parsed)) {
                    this.folders = _.filter(parsed, f => _.isString(f) && _isFolder(f));
                }
            }
        } catch (e) {
            console.log("Error loading custom folders:", e);
            this.folders = [];
        }
    },
    
    save() {
        try {
            window.SetProperty("PanelArt.CustomFolders", JSON.stringify(this.folders));
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

// ================= PANELART STATE OBJECT =================
const PanelArt = {
    config: getDefaultState(),
    
    images: {
        source: null,
        blur: null,
        currentMetadb: null   // tracks which metadb the async art request was issued for
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
        overlayRebuild: null  // Debounce overlay cache rebuilds during slider interaction
    },
    
    cache: {
        textHeights: new Map()
    }
};

// ================= UTILITY FUNCTIONS =================
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
    
    // Use lodash's clamp
    clamp: _.clamp,
    
    validateNumber(input, defaultValue, min, max) {
        const value = parseInt(input);
        if (isNaN(value)) return defaultValue;
        return _.clamp(value, min, max);
    },
    
    clearTimer(timer) {
        if (timer) {
            window.ClearTimeout(timer);
        }
        return null;
    }
};

// ================= FONT MANAGEMENT =================
const FontManager = {
    getFont(name, size, style) {
        const key = `${name}_${size}_${style}`;
        
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
        // Dispose the live active fonts before reassigning — clearCache only disposes the
        // LRU cache entries; these three references live outside the cache and would leak.
        const fl = PanelArt.fonts;
        if (fl.title  && typeof fl.title.Dispose  === 'function') { try { fl.title.Dispose();  } catch (e) {} }
        if (fl.artist && typeof fl.artist.Dispose === 'function') { try { fl.artist.Dispose(); } catch (e) {} }
        if (fl.extra  && typeof fl.extra.Dispose  === 'function') { try { fl.extra.Dispose();  } catch (e) {} }
        fl.title = null;
        fl.artist = null;
        fl.extra = null;
        const cfg = PanelArt.config;
        
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

// ================= TEXT HEIGHT CACHE =================
const TextHeightCache = {
    getKey(text, font, width) {
        return `${text}_${font.Name}_${font.Size}_${font.Style}_${width}`;
    },
    
    get(text, font, width) {
        const key = this.getKey(text, font, width);
        return PanelArt.cache.textHeights.get(key);
    },
    
    set(text, font, width, height) {
        const key = this.getKey(text, font, width);
        
        PanelArt.cache.textHeights.set(key, height);
        
        if (PanelArt.cache.textHeights.size > MAX_TEXT_HEIGHT_CACHE) {
            PanelArt.cache.textHeights.delete(PanelArt.cache.textHeights.keys().next().value);
        }
    },
    
    clear() {
        PanelArt.cache.textHeights.clear();
    },
    
    calcTextHeight(gr, text, font, width) {
        const cached = this.get(text, font, width);
        if (!_.isUndefined(cached)) return cached;
        
        const height = Math.ceil(gr.CalcTextHeight(text, font, width));
        this.set(text, font, width, height);
        return height;
    }
};

// ================= TEXT MANAGEMENT =================
const TextManager = {
    update(metadb) {
        // Accept metadb directly if provided (avoids race condition during track transitions)
        const track = metadb || fb.GetNowPlaying();
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
        
        if (PanelArt.config.extraInfoEnabled) {
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
        
        let titleFont = fonts.title;
        let artistFont = fonts.artist;
        let extraFont = (PanelArt.config.extraInfoEnabled && text.extra) ? fonts.extra : null;
        
        titleFont = this.scaleToWidth(gr, text.title, titleFont, maxWidth);
        artistFont = this.scaleToWidth(gr, text.artist, artistFont, maxWidth);
        if (extraFont) {
            extraFont = this.scaleToWidth(gr, text.extra, extraFont, maxWidth);
        }
        
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
    
    scaleToWidth(gr, textContent, font, maxWidth) {
        if (!textContent || !font) return font;
        
        let scaledFont = font;
        while (scaledFont.Size > MIN_FONT_SIZE && 
               gr.CalcTextWidth(textContent, scaledFont) > maxWidth) {
            scaledFont = FontManager.getFont(scaledFont.Name, scaledFont.Size - 1, scaledFont.Style);
        }
        
        return scaledFont;
    },
    
    clipText(gr, textContent, font, maxWidth) {
        if (!textContent || !font) return "";
        
        const width = gr.CalcTextWidth(textContent, font);
        if (width <= maxWidth) return textContent;
        
        let clipped = textContent;
        while (clipped.length > 0 && 
               gr.CalcTextWidth(clipped + '…', font) > maxWidth) {
            clipped = clipped.substring(0, clipped.length - 1);
        }
        return clipped + '…';
    }
};

// ================= IMAGE SEARCH (Optimized with lodash) =================
const ImageSearch = {
    getMetadataNames(metadb) {
        const tf = PanelArt.titleFormats;
        const artist = tf.artist.EvalWithMetadb(metadb);
        const album = tf.album.EvalWithMetadb(metadb);
        const folder = tf.folder.EvalWithMetadb(metadb);
        
        const artistAlbum = (artist && album) ? `${artist} - ${album}` : "";
        
        return { artist, album, folder, artistAlbum };
    },
    
    // Parse JSON file - only handles Last.fm format now
    parseJsonArtwork(jsonPath, baseFolder) {
        try {
            if (!_isFile(jsonPath)) return null;
            
            // Read and parse JSON file using helpers.js
            const content = _open(jsonPath);
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
        const metadataNames = _.compact([
            metadata.album,
            metadata.artist,
            metadata.folder,
            metadata.artistAlbum
        ]);
        
        const paths = FileManager.buildSearchPaths(folder, patterns, metadataNames, useVariations);
        return FileManager.findImageInPaths(paths);
    },
    
    searchInFolderAnyFile(folder, patterns) {
        // Check JSON files first
        const jsonArt = this.searchJsonArtwork(folder);
        if (jsonArt) return jsonArt;
        
        // Then check standard image files
        const paths = FileManager.buildSearchPaths(folder, patterns, []);
        return FileManager.findImageInPaths(paths);
    },
    
    searchForCover(metadb, baseFolder) {
        const metadata = this.getMetadataNames(metadb);
        
        // Create sanitized search names for folder matching
        const searchNames = _.compact([
            metadata.artist,
            metadata.album,
            metadata.folder,
            metadata.artistAlbum
        ]);
        
        // Create sanitized variations for better matching in custom folders
        const sanitizedSearchNames = [];
        _.forEach(searchNames, (name) => {
            const cleaned = FileManager.sanitizeMetadata(name);
            if (cleaned) {
                sanitizedSearchNames.push(cleaned);
                // Also add variations
                const variations = FileManager.createSearchVariations(name);
                sanitizedSearchNames.push(...variations);
            }
        });
        
        // Remove duplicates
        const uniqueSearchNames = _.uniq(sanitizedSearchNames);
        
        // ===== PHASE 1: Search in current track's folder tree =====
        
        // 1A. Search track folder for metadata-named files (no variations, exact match)
        const trackFolderMatch = this.searchInFolder(baseFolder, COVER_PATTERNS, metadata, false);
        if (trackFolderMatch) return trackFolderMatch;
        
        // 1B. Search all subfolders of track folder for ANY cover art
        const trackSubfolders = FileManager.enumSubfolders(baseFolder);
        for (let subfolder of trackSubfolders) {
            if (subfolder === baseFolder) continue;
            
            const found = this.searchInFolderAnyFile(subfolder, COVER_PATTERNS);
            if (found) return found;
        }
        
        // ===== PHASE 2: Search in custom folders =====
        // Checks the custom folder itself and up to TWO levels of subfolders for a
        // name that matches the track metadata, then searches inside the matched folder.
        const customFolders = CustomFolders.getAll();
        
        for (const customFolder of customFolders) {
            if (!FileManager.isDirectory(customFolder)) continue;
            
            // Level 0: the custom folder itself
            if (FileManager.matchesFolderName(customFolder, uniqueSearchNames)) {
                const match = this.searchInFolder(customFolder, COVER_PATTERNS, metadata, true);
                if (match) return match;
            }
            
            // Level 1: immediate subfolders
            const level1 = FileManager.getSubfolders(customFolder);
            for (const sub1 of level1) {
                if (FileManager.matchesFolderName(sub1, uniqueSearchNames)) {
                    const match = this.searchInFolder(sub1, COVER_PATTERNS, metadata, true);
                    if (match) return match;
                }
                
                // Level 2: subfolders of level-1 subfolders
                const level2 = FileManager.getSubfolders(sub1);
                for (const sub2 of level2) {
                    if (FileManager.matchesFolderName(sub2, uniqueSearchNames)) {
                        const match = this.searchInFolder(sub2, COVER_PATTERNS, metadata, true);
                        if (match) return match;
                    }
                }
            }
        }
        
        return null;
    }
};

// ================= IMAGE MANAGEMENT =================
const ImageManager = {
    loadAlbumArt(metadb) {
        try {
            // Always clear stale artwork immediately so previous track never bleeds through
            PanelArt.images.source = Utils.disposeImage(PanelArt.images.source);
            PanelArt.images.blur   = Utils.disposeImage(PanelArt.images.blur);
            PanelArt.images.currentMetadb = null;  // invalidate any in-flight async art request
            
            // Use passed metadb first (avoids race condition), fall back to polling
            const track = metadb || fb.GetNowPlaying();
            
            TextManager.update(track);
            
            if (!track) {
                window.Repaint();
                return;
            }
            
            const folderPath = PanelArt.titleFormats.path.EvalWithMetadb(track);
            const foundPath = ImageSearch.searchForCover(track, folderPath);
            
            let art = null;
            if (foundPath && FileManager.exists(foundPath)) {
                try {
                    art = gdi.Image(foundPath);
                } catch (e) {
                    console.log("Failed to load image from path:", foundPath, e);
                }
            }
            
            if (!art) {
                // No local art found - fall back to foobar's async art lookup.
                // on_get_album_art_done below handles the result.
                PanelArt.images.currentMetadb = track;
                utils.GetAlbumArtAsync(window.ID, track, 0);
                return;
            }
            
            PanelArt.images.source = art;
            OverlayCache.invalidate();
            this.scheduleBlurRebuild();
            window.Repaint();
        } catch (e) {
            console.log("Failed to load album art:", e);
        }
    },
    
    buildBlur() {
        const img = PanelArt.images;
        const dim = PanelArt.dimensions;
        const cfg = PanelArt.config;
        
        if (!cfg.blurEnabled || dim.width <= 0 || dim.height <= 0) {
            img.blur = Utils.disposeImage(img.blur);
            return;
        }
        
        let sourceImg = null;
        if (cfg.backgroundEnabled && img.source) {
            sourceImg = img.source;
        }
        
        if (!sourceImg) {
            img.blur = Utils.disposeImage(img.blur);
            return;
        }
        
        try {
            img.blur = Utils.disposeImage(img.blur);
            img.blur = gdi.CreateImage(dim.width, dim.height);
            
            const g = img.blur.GetGraphics();
            g.DrawImage(
                sourceImg,
                0, 0, dim.width, dim.height,
                0, 0, sourceImg.Width, sourceImg.Height
            );
            img.blur.ReleaseGraphics(g);
            
            img.blur.StackBlur(cfg.blurRadius);
        } catch (e) {
            console.log("Failed to build blur:", e);
            img.blur = Utils.disposeImage(img.blur);
        }
    },
    
    scheduleBlurRebuild() {
        PanelArt.timers.blurRebuild = Utils.clearTimer(PanelArt.timers.blurRebuild);
        PanelArt.timers.blurRebuild = window.SetTimeout(() => {
            this.buildBlur();
            window.Repaint();
        }, BLUR_DEBOUNCE_MS);
    },
    
    cleanup() {
        PanelArt.images.source = Utils.disposeImage(PanelArt.images.source);
        PanelArt.images.blur   = Utils.disposeImage(PanelArt.images.blur);
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
        const cfg = PanelArt.config;
        
        // Build scanlines and glow only (NOT reflection - drawn after border)
        const needsAny = !cfg.overlayAllOff && (
            (cfg.showGlow        && cfg.opGlow > 0)       ||
            (cfg.showScanlines   && cfg.opScanlines > 0)
        );
        
        this.valid = true;   // mark valid whether or not we build an image
        if (!needsAny || w <= 0 || h <= 0) return;
        
        try {
            this.img = gdi.CreateImage(w, h);
            const g = this.img.GetGraphics();
            
            // ---- Scanlines (dark rows) ----
            if (cfg.showScanlines && cfg.opScanlines > 0) {
                const col = _RGBA(0, 0, 0, cfg.opScanlines);
                for (let y = 0; y < h; y += SCANLINE_SPACING) {
                    g.FillSolidRect(0, y, w, 1, col);
                }
            }
            
            // ---- Glow (ellipses around art and text) ----
            if (cfg.showGlow && cfg.opGlow > 0) {
                const white = _RGB(255, 255, 255);
                const op = cfg.opGlow;
                
                if (artInfo && artInfo.artW > 0 && cfg.albumArtEnabled) {
                    const cx = artInfo.artX + artInfo.artW / 2;
                    const cy = artInfo.artY + artInfo.artH / 2;
                    const maxR = Math.max(artInfo.artW, artInfo.artH) * 0.75;
                    const steps = 30;
                    const minStep = Math.ceil(1 / (op * 0.05));
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
                    const minStep = Math.ceil(1 / (op * 0.03));
                    for (let i = minStep; i < steps; i++) {
                        const progress = i / steps;
                        const alpha = Math.floor(op * progress * 0.03);
                        if (alpha <= 0) continue;
                        const r = maxR * (1 - progress);
                        g.FillEllipse(cx - r, cy - r, r * 2, r * 2, PanelArt_SetAlpha(white, alpha));
                    }
                }
            }
            
            this.img.ReleaseGraphics(g);
        } catch (e) {
            console.log("Overlay cache build error:", e);
            this.dispose();
            this.valid = true;  // don't loop-retry on error
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
        const cfg = PanelArt.config;
        
        try {
            if (cfg.blurEnabled && img.blur) {
                gr.DrawImage(img.blur, 0, 0, dim.width, dim.height, 0, 0, img.blur.Width, img.blur.Height);
            } else {
                gr.FillSolidRect(0, 0, dim.width, dim.height, cfg.customBackgroundColor);
            }
            
            if (cfg.darkenValue > 0) {
                const alpha = Math.floor(cfg.darkenValue * DARKEN_ALPHA_MULTIPLIER);
                gr.FillSolidRect(0, 0, dim.width, dim.height, PanelArt_SetAlpha(_RGB(0, 0, 0), alpha));
            }
        } catch (e) {
            console.log("Error drawing background:", e);
        }
    },
    
    drawAlbumArt(gr) {
        const img = PanelArt.images.source;
        const cfg = PanelArt.config;
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
                
                gr.DrawImage(img, artX, artY, scaledW, scaledH, 0, 0, img.Width, img.Height);
                
            } else if (cfg.albumArtFloat === "top" || cfg.albumArtFloat === "bottom") {
                let maxRatio = 0.75;
                let minRatio = 0.70;
                
                const maxArtH = (availH * maxRatio) - pad * 2;
                const drawableW = availW - pad * 2;
                
                const scale = Math.min(drawableW / img.Width, maxArtH / img.Height);
                let scaledW = Math.floor(img.Width * scale);
                let scaledH = Math.floor(img.Height * scale);
                
                const minScaledH = Math.floor((availH * minRatio) - pad * 2);
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
                    
                    const newMinScaledH = Math.floor((availH * minRatio) - pad * 2);
                    if (scaledH < newMinScaledH) {
                        scaledH = newMinScaledH;
                        scaledW = Math.floor(img.Width * (scaledH / img.Height));
                    }
                }
                
                artW = availW;
                artH = scaledH + pad * 2;
                
                artX = Math.floor((availW - scaledW) / 2);
                artY = (cfg.albumArtFloat === "top") ? pad : dim.height - artH + pad;
                
                gr.DrawImage(img, artX, artY, scaledW, scaledH, 0, 0, img.Width, img.Height);
            }
            
            return { artX, artY, artW, artH, actualPad: pad };
        } catch (e) {
            console.log("Error drawing album art:", e);
            return { artX: 0, artY: 0, artW: 0, artH: 0, actualPad: 0 };
        }
    },
    
    getTextArea(artInfo) {
        const cfg = PanelArt.config;
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
            const cfg = PanelArt.config;
            
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
                const shadowColor = _RGBA(0, 0, 0, 136);
                const offset = TEXT_SHADOW_OFFSET;
                
                gr.GdiDrawText(titleText, titleFont, shadowColor, textX, ty + offset, textW, titleH, flags | DT_NOPREFIX);
                gr.GdiDrawText(artistText, artistFont, shadowColor, textX, ay + offset, textW, artistH, flags | DT_NOPREFIX);
                if (extraFont) {
                    gr.GdiDrawText(extraText, extraFont, shadowColor, textX, ey + offset, textW, extraH, flags | DT_NOPREFIX);
                }
            }
            
            gr.GdiDrawText(titleText, titleFont, _RGB(255, 255, 255), textX, ty, textW, titleH, flags | DT_NOPREFIX);
            gr.GdiDrawText(artistText, artistFont, _RGB(200, 200, 200), textX, ay, textW, artistH, flags | DT_NOPREFIX);
            if (extraFont) {
                gr.GdiDrawText(extraText, extraFont, _RGB(180, 180, 180), textX, ey, textW, extraH, flags | DT_NOPREFIX);
            }
        } catch (e) {
            console.log("Error drawing text:", e);
        }
    },
    
    drawBorder(gr) {
        const cfg = PanelArt.config;
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
            }
        } catch (e) {
            console.log("Error drawing border:", e);
        }
    },
    
    drawOverlay(gr, w, h, artInfo, textArea) {
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
    
    // Draw phosphor after border (so it appears on top)
    // Draw reflection and phosphor after border
    drawEffectsOverBorder(gr, w, h) {
        const cfg = PanelArt.config;
        
        if (cfg.overlayAllOff) return;
        
        try {
            // ---- Reflection (smoothstep gradient from top) ----
            if (cfg.showReflection && cfg.opReflection > 0) {
                const reflH = Math.floor(h * REFLECTION_HEIGHT_RATIO);
                const white = _RGB(255, 255, 255);
                let lastAlpha = -1;
                let bandStart = 0;
                for (let y = 0; y <= reflH; y++) {
                    const t = 1 - (y / reflH);
                    const s = t * t * (3 - 2 * t);
                    const alpha = Math.floor(cfg.opReflection * s * 0.65);
                    if (alpha !== lastAlpha) {
                        if (lastAlpha > 0 && y > bandStart) {
                            gr.FillSolidRect(0, bandStart, w, y - bandStart, PanelArt_SetAlpha(white, lastAlpha));
                        }
                        lastAlpha = alpha;
                        bandStart = y;
                    }
                }
                if (lastAlpha > 0) {
                    gr.FillSolidRect(0, bandStart, w, reflH - bandStart, PanelArt_SetAlpha(white, lastAlpha));
                }
            }
            
            // ---- Phosphor (horizontal tint rows) ----
            if (cfg.showPhosphor && cfg.opPhosphor > 0) {
                const themeColor = PhosphorManager.getColor();
                const r  = (themeColor >> 16) & 255;
                const gc = (themeColor >> 8)  & 255;
                const b  =  themeColor        & 255;
                const col = PanelArt_SetAlpha(
                    _RGB(Math.floor(r * 0.5 + 127), Math.floor(gc * 0.5 + 127), Math.floor(b * 0.5 + 127)),
                    cfg.opPhosphor
                );
                for (let y = 0; y < h; y += SCANLINE_SPACING) {
                    gr.FillSolidRect(0, y, w, 1, col);
                }
            }
        } catch (e) {
            console.log("Effects over border draw error:", e);
        }
    },
    
    drawSlider(gr, value, max, yPos) {
        const dim = PanelArt.dimensions;
        const barW = Math.max(SLIDER_MIN_WIDTH, Math.floor(dim.width * SLIDER_WIDTH_RATIO));
        const barH = SLIDER_HEIGHT;
        const bx = (dim.width - barW) / 2;
        const by = yPos;
        
        try {
            gr.FillSolidRect(bx, by, barW, barH, PanelArt_SetAlpha(_RGB(255, 255, 255), 60));
            gr.FillSolidRect(bx, by, barW * (value / max), barH, PanelArt_SetAlpha(_RGB(255, 255, 255), 180));
            
            const font = this.getSliderFont();
            const text = value.toString();
            const size = gr.MeasureString(text, font, 0, 0, dim.width, dim.height);
            gr.DrawString(text, font, _RGB(255, 255, 255), (dim.width - size.Width) / 2, by - size.Height - 2, size.Width, size.Height);
        } catch (e) {
            console.log("Error drawing slider:", e);
        }
    },
    
    drawSliders(gr) {
        const slider = PanelArt.slider;
        const dim = PanelArt.dimensions;
        const cfg = PanelArt.config;
        
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
    load() {
        try {
            const raw = window.GetProperty(STATE_KEY, null);
            if (!raw) {
                this.apply(PanelArt.config);
                return;
            }
            
            const parsed = JSON.parse(raw);
            let savedVersion = parsed.version ?? 1;
            let savedData = parsed.data ?? parsed;
            
            if (savedVersion !== STATE_VERSION) {
                savedData = migrateState(savedData, savedVersion);
            }
            
            const validated = Validator.validateConfig(savedData);
            
            PanelArt.config = _.assign({}, getDefaultState(), validated);
            
            this.apply(PanelArt.config, true);
        } catch (e) {
            console.log("State load failed. Using defaults:", e);
            PanelArt.config = getDefaultState();
            this.apply(PanelArt.config, true);
        }
    },
    
    apply(config, rebuildBlur = false, skipOverlayRebuild = false) {
        PanelArt.config = config;
        if (!skipOverlayRebuild) {
            OverlayCache.invalidate();
        }
        FontManager.rebuildFonts();
        if (rebuildBlur) {
            ImageManager.scheduleBlurRebuild();
        }
        TextManager.update();
        window.Repaint();
    },
    
    reset() {
        PanelArt.config = getDefaultState();
        PanelArt.slider.active = false;
        PanelArt.slider.paddingActive = false;
        PanelArt.slider.target = null;
        TextHeightCache.clear();
        this.apply(PanelArt.config, true);
        this.save();
    },
    
    save() {
        try {
            const stateToSave = {
                version: STATE_VERSION,
                data: PanelArt.config
            };
            window.SetProperty(STATE_KEY, JSON.stringify(stateToSave));
        } catch (e) {
            console.log("Failed to save state:", e);
        }
    }
};

// ================= PRESET MANAGEMENT =================
const PresetManager = {
    save(slot) {
        if (!_.inRange(slot, 1, 4)) return;
        
        try {
            const data = _.assign({}, PanelArt.config);
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
            
            PanelArt.config = _.assign({}, getDefaultState(), validated);
            
            StateManager.apply(PanelArt.config, true);
            StateManager.save();
        } catch (e) {
            console.log("Failed to load preset " + slot + ":", e);
        }
    }
};

// ================= PHOSPHOR THEME MANAGEMENT =================
const PhosphorManager = {
    getColor() {
        const cfg = PanelArt.config;
        
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
            const picked = utils.ColourPicker(window.ID, PanelArt.config.customPhosphorColor);
            if (_.isNumber(picked) && picked !== -1) {
                PanelArt.config.customPhosphorColor = picked >>> 0;
                PanelArt.config.currentPhosphorTheme = CUSTOM_THEME_INDEX;
                OverlayCache.invalidate();  // Required — cache holds stale colour until flushed
                StateManager.save();
                window.Repaint();
            }
        } catch (e) {
            console.log("Error setting custom color:", e);
        }
    }
};

// ================= MENU MANAGEMENT (Optimized with lodash) =================
const MenuManager = {
    createMainMenu() {
        const m = window.CreatePopupMenu();
        const cfg = PanelArt.config;
        
        this.addOverlayMenu(m);
        m.AppendMenuSeparator();
        this.addPanelArtMenu(m);
        
        m.AppendMenuSeparator();
        m.AppendMenuItem(MF_STRING, 900, "Reset to Defaults");
        m.AppendMenuItem(MF_STRING, 901, "Clear Image Cache");
        
        this.addCustomFoldersMenu(m);
        this.addPresetMenu(m);
        
        return m;
    },
    
    addOverlayMenu(parent) {
        const overlayM = window.CreatePopupMenu();
        const cfg = PanelArt.config;
        
        // Phosphor Theme at top
        const themeM = window.CreatePopupMenu();
        _.forEach(PHOSPHOR_THEMES, (theme, i) => {
            themeM.AppendMenuItem(MF_STRING, 600 + i, theme.name);
            if (PanelArt.config.currentPhosphorTheme === i) {
                themeM.CheckMenuItem(600 + i, true);
            }
        });
        themeM.AppendMenuSeparator();
        themeM.AppendMenuItem(MF_STRING, 610, "Custom...");
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
        const cfg = PanelArt.config;
        
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
        const cfg = PanelArt.config;
        
        bgM.AppendMenuItem(cfg.backgroundEnabled ? MF_CHECKED : MF_STRING, 850, "Enable Background Art");
        bgM.AppendMenuItem(MF_STRING, 851, "Custom Background Color...");
        bgM.AppendMenuSeparator();
        
        // Blur Settings inside Background
        const blurM = window.CreatePopupMenu();
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
        const cfg = PanelArt.config;
        
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
        const cfg = PanelArt.config;
        
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
        const cfg = PanelArt.config;
        
        const updateConfig = (callback) => {
            const prevRadius = cfg.blurRadius;
            const prevBlurEnabled = cfg.blurEnabled;
            const prevBgEnabled = cfg.backgroundEnabled;
            
            callback(cfg);
            
            const blurChanged = prevRadius !== cfg.blurRadius || 
                                prevBlurEnabled !== cfg.blurEnabled ||
                                prevBgEnabled !== cfg.backgroundEnabled;
            
            OverlayCache.invalidate();
            StateManager.apply(cfg, blurChanged);
            StateManager.save();
        };
        
        // Use lodash's _.inRange for cleaner range checking
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
            });
        }
        else if (_.inRange(id, 100, 104)) {
            const effects = ['showReflection', 'showGlow', 'showScanlines', 'showPhosphor'];
            updateConfig(c => c[effects[id - 100]] = !c[effects[id - 100]]);
        }
        else if (_.inRange(id, 200, 204)) {
            PanelArt.slider.active = true;
            PanelArt.slider.paddingActive = false;
            PanelArt.slider.target = ["Reflection", "Glow", "Scanlines", "Phosphor"][id - 200];
            window.Repaint();
        }
        else if (_.inRange(id, 600, 610)) {
            updateConfig(c => c.currentPhosphorTheme = id - 600);
        }
        else if (id === 610) {
            PhosphorManager.setCustomColor();
        }
        else if (_.inRange(id, 500, 511)) {
            updateConfig(c => c.blurRadius = (id - 500) * 20);
        }
        else if (id === 511) {
            updateConfig(c => c.blurRadius = 254);
        }
        else if (_.inRange(id, 520, 526)) {
            updateConfig(c => c.darkenValue = (id - 520) * 10);
        }
        else if (id === 530) {
            const input = utils.InputBox(window.ID, 'Border Size', 'Enter size (0–50):', cfg.borderSize.toString(), false);
            const value = Utils.validateNumber(input, cfg.borderSize, 0, 50);
            updateConfig(c => c.borderSize = value);
        }
        else if (id === 531) {
            const picked = utils.ColourPicker(window.ID, cfg.borderColor);
            if (picked !== cfg.borderColor && picked !== -1) {
                updateConfig(c => c.borderColor = picked);
            }
        }
        else if (_.inRange(id, 540, 543)) {
            const keys = ['titleFontSize', 'artistFontSize', 'extraFontSize'];
            const labels = ['Title Font Size', 'Artist Font Size', 'Extra Font Size'];
            const index = id - 540;
            const input = utils.InputBox(window.ID, labels[index], 'Enter new size:', cfg[keys[index]].toString(), false);
            const value = Utils.validateNumber(input, cfg[keys[index]], MIN_FONT_SIZE, MAX_FONT_SIZE);
            updateConfig(c => c[keys[index]] = value);
        }
        else if (_.inRange(id, 550, 553)) {
            const keys = ['titleFontName', 'artistFontName', 'extraFontName'];
            const labels = ['Title Font Name', 'Artist Font Name', 'Extra Font Name'];
            const index = id - 550;
            const input = utils.InputBox(window.ID, labels[index], 'Enter font name:', cfg[keys[index]], false);
            if (input && _.trim(input)) {
                updateConfig(c => c[keys[index]] = _.trim(input));
            }
        }
        else if (_.inRange(id, 560, 563)) {
            updateConfig(c => c.layout = id - 560);
        }
        else if (id === 570) {
            updateConfig(c => c.textShadowEnabled = !c.textShadowEnabled);
        }
        else if (id === 571) {
            updateConfig(c => {
                c.extraInfoEnabled = !c.extraInfoEnabled;
                TextManager.update();
            });
        }
        else if (id === 800) {
            updateConfig(c => c.albumArtEnabled = !c.albumArtEnabled);
        }
        else if (_.inRange(id, 801, 805)) {
            const floats = ["left", "right", "top", "bottom"];
            updateConfig(c => c.albumArtFloat = floats[id - 801]);
        }
        else if (id === 805) {
            PanelArt.slider.active = true;
            PanelArt.slider.paddingActive = true;
            PanelArt.slider.target = null;
            window.Repaint();
        }
        else if (id === 850) {
            updateConfig(c => c.backgroundEnabled = !c.backgroundEnabled);
        }
        else if (id === 851) {
            const picked = utils.ColourPicker(window.ID, cfg.customBackgroundColor);
            if (_.isNumber(picked) && picked !== -1) {
                updateConfig(c => c.customBackgroundColor = picked >>> 0);
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
            ImageManager.cleanup();
            TextHeightCache.clear();
            ImageManager.loadAlbumArt();
        }
        else if (id === 1000) {
            try {
                const folder = utils.InputBox(window.ID, "Enter folder path for custom artwork search:", "Custom Artwork Folder", "", true);
                if (folder && CustomFolders.add(folder)) {
                    ImageManager.loadAlbumArt();
                }
            } catch (e) {
                console.log("Error adding custom folder:", e);
            }
        }
        else if (_.inRange(id, 1010, 1015)) {
            if (CustomFolders.remove(id - 1010)) {
                ImageManager.loadAlbumArt();
            }
        }
        else if (id === 1020) {
            CustomFolders.clear();
            ImageManager.loadAlbumArt();
        }
    }
};

// ================= FOOBAR2000 CALLBACKS =================
function on_paint(gr) {
    if (!PanelArt.dimensions.width || !PanelArt.dimensions.height) return;
    
    try {
        const w = PanelArt.dimensions.width;
        const h = PanelArt.dimensions.height;
        
        Renderer.drawBackground(gr);
        const artInfo = Renderer.drawAlbumArt(gr);
        
        const textArea = Renderer.getTextArea(artInfo);
        Renderer.drawText(gr, textArea);
        
        // Cached overlay (scanlines, reflection, glow - NO phosphor)
        Renderer.drawOverlay(gr, w, h, artInfo, textArea);
        
        // Draw border over scanlines/reflection/glow
        Renderer.drawBorder(gr);
        
        // Draw reflection and phosphor over border
        Renderer.drawEffectsOverBorder(gr, w, h);
        
        Renderer.drawSliders(gr);
    } catch (e) {
        console.log("Paint error:", e);
    }
}

function on_size() {
    PanelArt.dimensions.width  = window.Width;
    PanelArt.dimensions.height = window.Height;
    OverlayCache.invalidate();
    ImageManager.scheduleBlurRebuild();
    window.Repaint();
}

function on_colours_changed() {
    // UI theme colour changed — rebuild blur (uses bgColor) and repaint text
    ImageManager.scheduleBlurRebuild();
    window.Repaint();
}

function on_font_changed() {
    // System font changed — clear font cache and rebuild
    FontManager.rebuildFonts();
    TextHeightCache.clear();
    window.Repaint();
}

function on_playback_new_track(metadb) {
    ImageManager.loadAlbumArt(metadb);
}

// image is null if no artwork was found.
function on_get_album_art_done(metadb, art_id, image, image_path) {
    try {
        // Guard: discard art that arrived late for a different (previous) track.
        const expected = PanelArt.images.currentMetadb;
        if (expected && metadb && !metadb.Compare(expected)) {
            if (image && typeof image.Dispose === 'function') {
                try { image.Dispose(); } catch (e) {}
            }
            return;
        }
        PanelArt.images.currentMetadb = null;   // clear; request fulfilled
        if (image) {
            PanelArt.images.source = image;
            OverlayCache.invalidate();
        } else {
            // Truly no art available - clear any stale source image.
            PanelArt.images.source = Utils.disposeImage(PanelArt.images.source);
        }
        ImageManager.scheduleBlurRebuild();
        window.Repaint();
    } catch (e) {
        console.log("on_get_album_art_done error:", e);
    }
}

function on_playback_stop(reason) {
    if (reason !== 2) {
        ImageManager.cleanup();
    }
    TextManager.update();
    window.Repaint();
}

function on_mouse_wheel(delta) {
    if (!PanelArt.slider.active) return;
    
    const cfg = PanelArt.config;
    
    if (PanelArt.slider.target) {
        const keyMap = {
            "Reflection": "opReflection",
            "Glow": "opGlow",
            "Scanlines": "opScanlines",
            "Phosphor": "opPhosphor"
        };
        
        const key = keyMap[PanelArt.slider.target];
        if (key) {
            // Update value and repaint bar IMMEDIATELY — cheap, no GDI rebuild needed.
            cfg[key] = _.clamp(cfg[key] + delta * SLIDER_STEP, 0, 255);
            StateManager.apply(cfg, false, true);  // skip overlay rebuild
            
            // Debounce only the expensive OverlayCache rebuild.
            PanelArt.timers.overlayRebuild = Utils.clearTimer(PanelArt.timers.overlayRebuild);
            PanelArt.timers.overlayRebuild = window.SetTimeout(() => {
                PanelArt.timers.overlayRebuild = null;
                OverlayCache.invalidate();
                window.Repaint();
            }, 100);
        }
    }
    
    if (PanelArt.slider.paddingActive) {
        cfg.albumArtPadding = _.clamp(cfg.albumArtPadding + delta * SLIDER_STEP, 0, 100);
        StateManager.apply(cfg);
    }
    
    StateManager.save();
}

function on_mouse_lbtn_up(x, y) {
    if (PanelArt.slider.active) {
        PanelArt.slider.active = false;
        PanelArt.slider.target = null;
        PanelArt.slider.paddingActive = false;
        window.Repaint();
        return true;
    }
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
    PanelArt.timers.blurRebuild = Utils.clearTimer(PanelArt.timers.blurRebuild);
    PanelArt.timers.overlayRebuild = Utils.clearTimer(PanelArt.timers.overlayRebuild);
    
    StateManager.save();
    ImageManager.cleanup();
    OverlayCache.dispose();
    FontManager.clearCache();
    TextHeightCache.clear();
    _tt('');
    if (_bmp) { _bmp.ReleaseGraphics(_gr); }
    _gr  = null;
    _bmp = null;
}

// ================= INITIALIZATION =================
window.MinHeight = 75;  // Enforce minimum panel height of 75px
window.MinWidth = 250;  // Enforce minimum panel width of 250px
FontManager.rebuildFonts();
CustomFolders.load();
StateManager.load();
ImageManager.loadAlbumArt();
window.Repaint();