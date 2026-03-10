'use strict';
           // ============== AUTHOR L.E.D. ============== \\
          // ==== Panel Artwork and Trackinfo v3.2  ==== \\
         // ========== Blur Artwork + Trackinfo =========== \\

  // ===================*** Foobar2000 64bit ***================== \\
 // ======= For Spider Monkey Panel 64bit, author: marc2003 ====== \\
// === SMP 64bit script samples StackBlur+Panel, author:marc2003 === \\

window.DrawMode = 0; // 0 = GDI+  1 = D2D
// DrawMode only changes on JSplitter currently; D2D offloads rendering to GPU, GDI+ uses CPU.

window.DefineScript("SMP 64bit PanelArt V3.2", { author: "L.E.D.", grab_focus: true });

// ====================== INCLUDES ======================
include(fb.ComponentPath + 'samples\\complete\\js\\lodash.min.js');
include(fb.ComponentPath + 'samples\\complete\\js\\helpers.js');

// ====================== LIFECYCLE ======================
const Phase = { BOOT: 0, LIVE: 1, SHUTDOWN: 2 };
let phase = Phase.BOOT;
function isLive() { return phase === Phase.LIVE; }

// ====================== USER DEFAULTS ======================
const USER_DEFAULTS = {
    ALBUM_ART_PADDING:    40,
    ALBUM_ART_BORDER:     10,
    ALBUM_ART_BORDER_COLOR: _RGB(32, 32, 32),
    BLUR_RADIUS:          240,
    DARKEN_VALUE:         10,
    BACKGROUND_COLOR:     _RGB(25, 25, 25),
    REFLECTION_OPACITY:   30,
    GLOW_OPACITY:         40,
    SCANLINES_OPACITY:    80,
    PHOSPHOR_OPACITY:     20,
    TITLE_FONT:  "Segoe UI", TITLE_SIZE:  42,
    ARTIST_FONT: "Segoe UI", ARTIST_SIZE: 28,
    EXTRA_FONT:  "Segoe UI", EXTRA_SIZE:  20
};

// ====================== CONSTANTS ======================
const STATE_KEY      = "SMP_64_PANELART_STATE";
const STATE_VERSION  = 3;

const ALBUM_ART_MAX_WIDTH_RATIO  = 0.65;
const ALBUM_ART_MIN_HEIGHT_RATIO = 0.45;
const REFLECTION_HEIGHT_RATIO    = 0.45;
const DARKEN_ALPHA_MULTIPLIER    = 2.55;
const DEFAULT_OVERLAY_PADDING    = 6;
const TEXT_SHADOW_OFFSET         = 2;
const SCANLINE_SPACING           = 3;

const MAX_SUBFOLDER_DEPTH  = 4;
const MAX_CUSTOM_FOLDERS   = 5;
const MAX_FILE_CACHE       = 200;
const MAX_FONT_CACHE       = 50;
const MAX_TEXT_HEIGHT_CACHE = 100;
const MAX_BG_CACHE         = 5;

const BLUR_DEBOUNCE_MS = 150;
const SLIDER_MIN_WIDTH = 220;
const SLIDER_WIDTH_RATIO = 0.6;
const SLIDER_HEIGHT    = 6;
const SLIDER_STEP      = 5;
const GAP_TITLE_ARTIST = 2;
const GAP_ARTIST_EXTRA = 6;
const MIN_FONT_SIZE    = 6;
const MAX_FONT_SIZE    = 200;

const COVER_PATTERNS = ["cover","front","folder","albumart","album","artwork","art","front cover"];
const EXTENSIONS     = [".png",".jpg",".jpeg",".webp",".bmp",".gif"];
const JSON_ART_FILES = [
    "lastfm_artist_getSimilar.json","lastfm_album_getInfo.json",
    "lastfm_track_getInfo.json","lastfm.json"
];

const MF_CHECKED = 0x00000008;

// ====================== COLOUR HELPERS ======================
// Replace the alpha channel of a packed ARGB colour without touching R/G/B.
// The >>> 0 coerces to unsigned 32-bit so the result stays positive in JS.
function PanelArt_SetAlpha(col, a) { return ((col & 0x00FFFFFF) | (a << 24)) >>> 0; }

// Pre-hoisted paint constants — avoids _RGB() allocation every frame
const PA_BLACK        = _RGB(0, 0, 0);
const PA_WHITE        = _RGB(255, 255, 255);
const PA_GREY200      = _RGB(200, 200, 200);
const PA_GREY180      = _RGB(180, 180, 180);
const PA_BORDER_LIGHT = _RGB(80, 80, 80);
const PA_BORDER_DARK  = _RGB(20, 20, 20);
const PA_MODE_BG      = _RGB(5, 5, 5);      // image/slide mode background fill
const PA_GLITCH_BASE  = _RGB(5, 5, 15);     // glitch overlay base tint

const GLITCH_SHIFT_COLORS = [
    _RGB(100,200,255),_RGB(180,200,230),_RGB(150,255,150),
    _RGB(255,255,100),_RGB(255,100,100)
];
const GLITCH_SLICE_COLORS = [
    _RGB(100,180,255),_RGB(180,200,230),_RGB(200,210,220),
    _RGB(120,160,220),_RGB(150,255,150),_RGB(255,255,100),_RGB(255,100,100)
];
const GLITCH_TINT_COLORS = [
    _RGB(100,180,255),_RGB(180,200,230),_RGB(200,210,220),
    _RGB(150,170,210),_RGB(100,255,100),_RGB(255,255,100),_RGB(255,100,100)
];
const GLITCH_TRACK_COLORS = [
    _RGB(100,150,200),_RGB(80,200,80),_RGB(200,200,80),_RGB(255,80,80)
];
const GLITCH_BLOCK_COLORS = [
    _RGB(0x64,0xB4,0xFF),_RGB(0xB4,0xC8,0xE6),_RGB(0xD2,0xDA,0xE6),
    _RGB(0x78,0x88,0xB8),_RGB(0xA0,0xB0,0xC8),_RGB(0xC8,0xD0,0xE0),
    _RGB(0x50,0xFF,0x50),_RGB(0xFF,0xFF,0x50),_RGB(0xFF,0x50,0x50)
];

// ====================== PHOSPHOR THEMES ======================
const PHOSPHOR_THEMES = [
    { name: "Classic",  color: _RGB(0,255,0)    },
    { name: "Neo",      color: _RGB(0,255,255)  },
    { name: "Dark",     color: _RGB(0,200,0)    },
    { name: "Bright",   color: _RGB(255,255,0)  },
    { name: "Retro",    color: _RGB(0,255,100)  },
    { name: "Minimal",  color: _RGB(0,180,0)    },
    { name: "Matrix",   color: _RGB(0,255,50)   },
    { name: "Vapor",    color: _RGB(255,180,255) },
    { name: "Cyber",    color: _RGB(0,255,255)  },
    { name: "Magenta",  color: _RGB(255,0,255)  }
];
const CUSTOM_THEME_INDEX = PHOSPHOR_THEMES.length;

// ====================== DEFAULT STATE ======================
// Returns a fresh default config object.  Always call this as a factory —
// never mutate the returned object and use it as a template.
function getDefaultState() {
    return {
        showReflection: true,  showGlow: false,  showScanlines: false,  showPhosphor: true,
        overlayAllOff:  false, savedOverlay: null,
        opReflection:   USER_DEFAULTS.REFLECTION_OPACITY,
        opGlow:         USER_DEFAULTS.GLOW_OPACITY,
        opScanlines:    USER_DEFAULTS.SCANLINES_OPACITY,
        opPhosphor:     USER_DEFAULTS.PHOSPHOR_OPACITY,
        currentPhosphorTheme: 8,  customPhosphorColor: 0xffffffff,
        blurRadius:     USER_DEFAULTS.BLUR_RADIUS,
        blurEnabled:    true,
        darkenValue:    USER_DEFAULTS.DARKEN_VALUE,
        borderSize:     USER_DEFAULTS.ALBUM_ART_BORDER,
        borderColor:    USER_DEFAULTS.ALBUM_ART_BORDER_COLOR,
        layout:         0,
        textShadowEnabled: true,  extraInfoEnabled: true,
        backgroundEnabled: true,  customBackgroundColor: USER_DEFAULTS.BACKGROUND_COLOR,
        albumArtEnabled: true,    albumArtFloat: "left",
        albumArtPadding: USER_DEFAULTS.ALBUM_ART_PADDING,
        titleFontName:  USER_DEFAULTS.TITLE_FONT,   titleFontSize:  USER_DEFAULTS.TITLE_SIZE,
        artistFontName: USER_DEFAULTS.ARTIST_FONT,  artistFontSize: USER_DEFAULTS.ARTIST_SIZE,
        extraFontName:  USER_DEFAULTS.EXTRA_FONT,   extraFontSize:  USER_DEFAULTS.EXTRA_SIZE,
        glitchEnabled:  true,
        imageFolder:    "",  customFolders: "",
        imageMode:      false, slideMode: false, slideIndex: 0
    };
}

// ====================== STATE MIGRATION ======================
// Upgrades a saved config from an older STATE_VERSION to the current schema.
// Each version block handles the delta from that version to the next.
function migrateState(oldState, oldVersion) {
    let state = _.assign({}, oldState);
    if (oldVersion < 2) {
        const migrations = {
            blur_strength: 'blurRadius',  blur_enabled: 'blurEnabled',
            darken_value:  'darkenValue', border_size:  'borderSize',
            border_color:  'borderColor', text_shadow_enabled: 'textShadowEnabled',
            extra_info_enabled: 'extraInfoEnabled'
        };
        _.forEach(migrations, (newKey, oldKey) => {
            if (!_.isUndefined(state[oldKey])) { state[newKey] = state[oldKey]; delete state[oldKey]; }
        });
        _.defaults(state, { currentPhosphorTheme: 0 });
    }
    if (oldVersion < 3) {
        _.defaults(state, { backgroundEnabled: true, customBackgroundColor: USER_DEFAULTS.BACKGROUND_COLOR });
        delete state.customBackgroundPath;
    }
    _.defaults(state, { imageMode: false, slideMode: false, slideIndex: 0 });
    return state;
}

// ====================== VALIDATION ======================
const Validator = {
    validateConfig(config) {
        const def = getDefaultState();
        const v   = _.assign({}, def, config);
        v.blurRadius    = _.clamp(v.blurRadius   ?? def.blurRadius,   0, 254);
        v.darkenValue   = _.clamp(v.darkenValue  ?? def.darkenValue,  0, 100);
        v.borderSize    = _.clamp(v.borderSize   ?? def.borderSize,   0, 50);
        v.layout        = _.clamp(v.layout       ?? def.layout,       0, 2);
        v.opReflection  = _.clamp(v.opReflection ?? def.opReflection, 0, 255);
        v.opGlow        = _.clamp(v.opGlow       ?? def.opGlow,       0, 255);
        v.opScanlines   = _.clamp(v.opScanlines  ?? def.opScanlines,  0, 255);
        v.opPhosphor    = _.clamp(v.opPhosphor   ?? def.opPhosphor,   0, 255);
        v.currentPhosphorTheme = _.clamp(v.currentPhosphorTheme ?? def.currentPhosphorTheme, 0, CUSTOM_THEME_INDEX);
        v.albumArtPadding      = _.clamp(v.albumArtPadding      ?? def.albumArtPadding,      0, 100);
        v.titleFontSize  = _.clamp(v.titleFontSize  ?? def.titleFontSize,  MIN_FONT_SIZE, MAX_FONT_SIZE);
        v.artistFontSize = _.clamp(v.artistFontSize ?? def.artistFontSize, MIN_FONT_SIZE, MAX_FONT_SIZE);
        v.extraFontSize  = _.clamp(v.extraFontSize  ?? def.extraFontSize,  MIN_FONT_SIZE, MAX_FONT_SIZE);
        v.titleFontName  = v.titleFontName  || def.titleFontName;
        v.artistFontName = v.artistFontName || def.artistFontName;
        v.extraFontName  = v.extraFontName  || def.extraFontName;
        v.albumArtFloat  = _.includes(["left","right","top","bottom"], v.albumArtFloat) ? v.albumArtFloat : def.albumArtFloat;
        v.imageMode  = !!v.imageMode;
        v.slideMode  = !!v.slideMode;
        v.slideIndex = _.clamp(v.slideIndex ?? def.slideIndex, 0, 9999);
        return v;
    },

    validateColor(color, defaultColor) {
        if (!_.isNumber(color) || isNaN(color)) return defaultColor;
        return color >>> 0;
    }
};

// ====================== FSO SINGLETON ======================
const _fso = (function () {
    try { return new ActiveXObject('Scripting.FileSystemObject'); } catch (e) { return null; }
})();

// ====================== FILE MANAGER ======================
const FileManager = {
    cache: new Map(),

    _sanitise(str) {
        if (!str) return '';
        return utils.ReplaceIllegalChars(str, true);
    },

    sanitizeMetadata(str) {
        if (!str) return "";
        return _.trim(
            str.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '')
               .replace(/\{.*?\}/g, '').replace(/<.*?>/g, '')
               .replace(/^(The|A|An)\s+/i, '')
               .replace(/[^\w\s\-&'+]/g, ' ')
               .replace(/_/g, ' ')
               .replace(/\s+/g, ' ')
        );
    },

    createSearchVariations(str) {
        if (!str) return [];
        const c = this.sanitizeMetadata(str);
        return _.uniq([
            c,
            c.replace(/\s+/g, '-'),
            c.replace(/\s+/g, '_'),
            _.toLower(c),
            _.toLower(c.replace(/\s+/g, '-'))
        ]).filter(v => v && v.length > 0);
    },

    exists(path) {
        if (!path) return false;
        if (this.cache.has(path)) return this.cache.get(path);
        const exists = _isFile(path);
        this.cache.set(path, exists);
        if (this.cache.size > MAX_FILE_CACHE) this.cache.delete(this.cache.keys().next().value);
        return exists;
    },

    isDirectory: _isFolder,

    getSubfolders(folder) {
        folder = folder.replace(/\\+$/, '');
        if (!_isFolder(folder)) return [];
        const subfolders = [];
        try {
            if (!_fso || !_fso.FolderExists(folder)) return [];
            const en = new Enumerator(_fso.GetFolder(folder).SubFolders);
            for (; !en.atEnd(); en.moveNext()) subfolders.push(en.item().Path);
        } catch (e) {
            console.log('PanelArt: getSubfolders error:', e);
        }
        return subfolders;
    },

    buildSearchPaths(folder, patterns, metadataNames = [], useVariations = false) {
        const allPatterns = [...patterns];
        _.forEach(metadataNames, name => {
            if (useVariations) {
                _.forEach(this.createSearchVariations(name), v => {
                    const s = this._sanitise(v);
                    if (s) allPatterns.push(s);
                });
            } else {
                const s = this._sanitise(this.sanitizeMetadata(name));
                if (s) allPatterns.push(s);
            }
        });
        const paths = [];
        _.forEach(allPatterns, pattern => {
            _.forEach(EXTENSIONS, ext => paths.push(folder + "\\" + pattern + ext));
        });
        return paths;
    },

    findImageInPaths(paths) { return _.find(paths, p => this.exists(p)) || null; },

    matchesFolderName(folderPath, searchNames) {
        if (!folderPath || _.isEmpty(searchNames)) return false;
        const folderName       = _.last(folderPath.split('\\'));
        const lowerFolderName  = folderName.toLowerCase();
        const folderDash       = lowerFolderName.replace(/\s+/g, '-');
        const folderUnderscore = lowerFolderName.replace(/\s+/g, '_');
        return _.some(searchNames, name => {
            if (!name) return false;
            const n = name.toLowerCase();
            if (lowerFolderName === n || folderDash === n || folderUnderscore === n) return true;
            if (lowerFolderName.includes(n) || n.includes(lowerFolderName) ||
                folderDash.includes(n)      || n.includes(folderDash))       return true;
            return false;
        });
    },

    clear() { this.cache.clear(); }
};

// ====================== CUSTOM FOLDERS ======================
const CustomFolders = {
    folders: [],

    load() {
        try {
            const saved = StateManager.get().customFolders || "";
            if (saved) {
                const parsed = JSON.parse(saved);
                this.folders = _.isArray(parsed)
                    ? _.filter(parsed, f => _.isString(f) && f.length > 0)
                    : [];
            } else {
                this.folders = [];
            }
        } catch (e) { this.folders = []; }
    },

    save() {
        try { StateManager.get().customFolders = JSON.stringify(this.folders); StateManager.save(); } catch (e) {}
    },

    add(folder) {
        if (!folder || !_isFolder(folder)) return false;
        if (_.includes(this.folders, folder)) return false;
        if (this.folders.length >= MAX_CUSTOM_FOLDERS) this.folders.shift();
        this.folders.push(folder);
        this.save();
        return true;
    },

    remove(index) {
        if (_.inRange(index, 0, this.folders.length)) { this.folders.splice(index, 1); this.save(); return true; }
        return false;
    },

    clear()  { this.folders = []; this.save(); },
    getAll() { return [...this.folders]; }
};

// ====================== RUNTIME STATE ======================
// Single flat object — replaces the former ArtState._runtime / ArtState / PanelArt triple-proxy.
const PanelArt = {
    loadToken:        0,
    pendingArtToken:  0,

    images: {
        source:         null,
        blur:           null,
        currentMetadb:  null,
        currentPath:    '',
        folderPath:     ''
    },

    text:   { title: '', artist: '', extra: '' },

    fonts:  { title: null, artist: null, extra: null, cache: new Map() },

    dimensions: { width: 0, height: 0 },

    slider: { active: false, target: null, paddingActive: false },

    titleFormats: {
        title:  fb.TitleFormat('%title%'),
        artist: fb.TitleFormat('%artist%'),
        album:  fb.TitleFormat('%album%'),
        date:   fb.TitleFormat('%date%'),
        length: fb.TitleFormat('%length%'),
        path:   fb.TitleFormat("$directory_path(%path%)"),
        folder: fb.TitleFormat("$directory(%path%)")
    },

    timers: { blurRebuild: null, overlayRebuild: null, imageAnim: null, glitch: null },

    imageMode:    false, imageImage:  null,
    glitchFrame:  0,     // >0 means a glitch animation frame is in progress
    // imageFolder and glitchEnabled are NOT stored here; always read from cfg.
    slideMode:    false, slideImages: [], slideIndex: 0,
    slideImage:   null,  slideTimer:  null
};

// ====================== ART CACHE ======================
// Stores pre-scaled GDI+ image copies so the renderer never re-scales every
// frame.  Uses a second-chance eviction policy:
//   - Entries with refCount > 1 survive one eviction pass but get their
//     refCount decremented (one "strike").
//   - Entries with refCount <= 1 are disposed and removed immediately.
const ArtCache = {
    _scaledCache: new Map(),
    _nextId:      0,

    getScaledImage(srcImg, targetW, targetH) {
        if (!srcImg || targetW <= 0 || targetH <= 0) return null;
        // Stamp each source image with a stable numeric ID for cache keying.
        if (srcImg._id === undefined) srcImg._id = this._nextId++;
        const key = srcImg._id + ':' + targetW + 'x' + targetH;
        let entry = this._scaledCache.get(key);
        if (entry) { entry.refCount++; return entry.image; }
        let scaled = null;
        try { scaled = srcImg.Resize(targetW, targetH); } catch (e) { return null; }
        this._scaledCache.set(key, { image: scaled, refCount: 1 });
        if (this._scaledCache.size > 20) {
            let evicted = false;
            for (const [k, v] of this._scaledCache) {
                if (v.refCount <= 1) {
                    // This entry has had no recent use — dispose and remove it.
                    try { v.image.Dispose(); } catch (e) {}
                    this._scaledCache.delete(k);
                    evicted = true;
                    if (this._scaledCache.size <= 20) break;
                } else {
                    // Give this entry a second chance: decrement its strike counter
                    // so it will be evictable on the next pass if still unused.
                    v.refCount--;
                }
            }
            // Fallback: nothing had refCount <= 1 — force-evict the oldest entry.
            if (!evicted && this._scaledCache.size > 20) {
                const oldest = this._scaledCache.entries().next();
                if (!oldest.done) {
                    try { oldest.value[1].image.Dispose(); } catch (e) {}
                    this._scaledCache.delete(oldest.value[0]);
                }
            }
        }
        return scaled;
    },

    clearScaledCache() {
        for (const v of this._scaledCache.values()) { try { v.image.Dispose(); } catch (e) {} }
        this._scaledCache.clear();
    },

    clearAll() { this.clearScaledCache(); }
};

// ====================== TEXT HEIGHT CACHE ======================
// Stores CalcTextHeight measurements keyed by (text, font, width) so the
// expensive GDI call is only made once per unique combination.
const TextHeightCache = {
    _heights: new Map(),

    _key(text, font, width) { return `${text}\x00${font.Name}\x00${font.Size}\x00${font.Style}\x00${width}`; },

    get(text, font, width)         { return this._heights.get(this._key(text, font, width)); },

    set(text, font, width, height) {
        this._heights.set(this._key(text, font, width), height);
        if (this._heights.size > MAX_TEXT_HEIGHT_CACHE)
            this._heights.delete(this._heights.keys().next().value);
    },

    clear() { this._heights.clear(); },

    calcTextHeight(gr, text, font, width) {
        const cached = this.get(text, font, width);
        if (!_.isUndefined(cached)) return cached;
        const h = Math.ceil(gr.CalcTextHeight(text, font, width));
        this.set(text, font, width, h);
        return h;
    }
};

// ====================== REPAINT HELPER ======================
const RepaintHelper = {
    full()              { window.Repaint(); },
    region(x, y, w, h) { (w > 0 && h > 0) ? window.RepaintRect(x, y, w, h) : window.Repaint(); },
    albumArt() {
        const d = PanelArt.dimensions, b = StateManager.get().borderSize || 0;
        this.region(b, b, d.width - b * 2, d.height - b * 2);
    },
    text() {
        const d = PanelArt.dimensions, b = StateManager.get().borderSize || 0;
        const artW = Math.floor(d.width * 0.4);
        this.region(artW, b, d.width - artW - b, d.height - b * 2);
    }
};

// ====================== UTILITIES ======================
const Utils = {
    disposeImage(img) {
        if (img && _.isFunction(img.Dispose)) { try { img.Dispose(); } catch (e) {} }
        return null;
    },

    validateNumber(input, defaultValue, min, max) {
        const v = parseInt(input, 10);
        return isNaN(v) ? defaultValue : _.clamp(v, min, max);
    },

    clearTimer(timer)    { if (timer) window.ClearTimeout(timer);  return null; },
    clearInterval(timer) { if (timer) window.ClearInterval(timer); return null; }
};

// ====================== FONT MANAGER ======================
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
                const oldFont  = PanelArt.fonts.cache.get(firstKey);
                if (oldFont && _.isFunction(oldFont.Dispose)) { try { oldFont.Dispose(); } catch (e) {} }
                PanelArt.fonts.cache.delete(firstKey);
            }
            return font;
        } catch (e) {
            return gdi.Font("Segoe UI", size, style);
        }
    },

    clearCache() {
        PanelArt.fonts.cache.forEach(font => {
            if (font && _.isFunction(font.Dispose)) { try { font.Dispose(); } catch (e) {} }
        });
        PanelArt.fonts.cache.clear();
    },

    rebuildFonts() {
        this.clearCache();
        const fl  = PanelArt.fonts;
        const cfg = StateManager.get();
        if (fl.title  && typeof fl.title.Dispose  === 'function') { try { fl.title.Dispose();  } catch (e) {} }
        if (fl.artist && typeof fl.artist.Dispose === 'function') { try { fl.artist.Dispose(); } catch (e) {} }
        if (fl.extra  && typeof fl.extra.Dispose  === 'function') { try { fl.extra.Dispose();  } catch (e) {} }
        fl.title = fl.artist = fl.extra = null;
        try {
            fl.title  = gdi.Font(cfg.titleFontName,  cfg.titleFontSize,  1);
            fl.artist = gdi.Font(cfg.artistFontName, cfg.artistFontSize, 0);
            fl.extra  = gdi.Font(cfg.extraFontName,  cfg.extraFontSize,  0);
        } catch (e) {
            fl.title  = gdi.Font("Segoe UI", 42, 1);
            fl.artist = gdi.Font("Segoe UI", 28, 0);
            fl.extra  = gdi.Font("Segoe UI", 20, 0);
        }
    }
};

// ====================== TEXT MANAGER ======================
const TextManager = {
    update(metadb) {
        if (metadb === undefined) return;
        if (!metadb) {
            PanelArt.text.title  = 'No track playing';
            PanelArt.text.artist = '';
            PanelArt.text.extra  = '';
            TextHeightCache.clear();
            return;
        }
        const tf        = PanelArt.titleFormats;
        const newTitle  = tf.title.EvalWithMetadb(metadb);
        const newArtist = tf.artist.EvalWithMetadb(metadb);
        if (newTitle !== PanelArt.text.title || newArtist !== PanelArt.text.artist) TextHeightCache.clear();
        PanelArt.text.title  = newTitle;
        PanelArt.text.artist = newArtist;
        PanelArt.text.extra  = '';
        if (StateManager.get().extraInfoEnabled) {
            const parts = _.compact([
                tf.album.EvalWithMetadb(metadb),
                tf.date.EvalWithMetadb(metadb),
                tf.length.EvalWithMetadb(metadb)
            ]);
            PanelArt.text.extra = parts.join(' | ');
        }
    },

    scaleAndClip(gr, maxWidth, maxHeight) {
        const text  = PanelArt.text;
        const fonts = PanelArt.fonts;

        // Binary search: find the largest font size ≤ current that fits maxWidth.
        const fitToWidth = (font, content) => {
            if (!content || !font) return font;
            if (gr.CalcTextWidth(content, font) <= maxWidth) return font;
            let lo = MIN_FONT_SIZE, hi = font.Size;
            while (lo < hi) {
                const mid = (lo + hi + 1) >> 1;
                if (gr.CalcTextWidth(content, FontManager.getFont(font.Name, mid, font.Style)) <= maxWidth) lo = mid;
                else hi = mid - 1;
            }
            return FontManager.getFont(font.Name, lo, font.Style);
        };

        let titleFont  = fitToWidth(fonts.title,  text.title);
        let artistFont = fitToWidth(fonts.artist, text.artist);
        let extraFont  = (StateManager.get().extraInfoEnabled && text.extra)
            ? fitToWidth(fonts.extra, text.extra) : null;

        const calcTotalH = () => {
            let h = TextHeightCache.calcTextHeight(gr, text.title,  titleFont,  maxWidth) + GAP_TITLE_ARTIST
                  + TextHeightCache.calcTextHeight(gr, text.artist, artistFont, maxWidth);
            if (extraFont) h += GAP_ARTIST_EXTRA + TextHeightCache.calcTextHeight(gr, text.extra, extraFont, maxWidth);
            return h;
        };

        while (calcTotalH() > maxHeight &&
               (titleFont.Size > MIN_FONT_SIZE || artistFont.Size > MIN_FONT_SIZE ||
                (extraFont && extraFont.Size > MIN_FONT_SIZE))) {
            if (titleFont.Size  > MIN_FONT_SIZE) titleFont  = FontManager.getFont(titleFont.Name,  titleFont.Size  - 1, titleFont.Style);
            if (artistFont.Size > MIN_FONT_SIZE) artistFont = FontManager.getFont(artistFont.Name, artistFont.Size - 1, artistFont.Style);
            if (extraFont && extraFont.Size > MIN_FONT_SIZE) extraFont = FontManager.getFont(extraFont.Name, extraFont.Size - 1, extraFont.Style);
        }

        return {
            titleFont, artistFont, extraFont,
            titleText:  this.clipText(gr, text.title,  titleFont,  maxWidth),
            artistText: this.clipText(gr, text.artist, artistFont, maxWidth),
            extraText:  extraFont ? this.clipText(gr, text.extra, extraFont, maxWidth) : null
        };
    },

    clipText(gr, content, font, maxWidth) {
        if (!content || !font) return "";
        if (gr.CalcTextWidth(content, font) <= maxWidth) return content;
        let lo = 0, hi = content.length;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (gr.CalcTextWidth(content.substring(0, mid) + '\u2026', font) <= maxWidth) lo = mid;
            else hi = mid - 1;
        }
        return content.substring(0, lo) + '\u2026';
    }
};

// ====================== IMAGE SEARCH ======================
const ImageSearch = {
    _pathCache: new Map(),

    clearCache() { this._pathCache.clear(); },

    _toTitleCase(str) {
        return str.replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.substring(1).toLowerCase());
    },

    getMetadataNames(metadb) {
        const tf     = PanelArt.titleFormats;
        const artist = tf.artist.EvalWithMetadb(metadb);
        const album  = tf.album.EvalWithMetadb(metadb);
        const title  = tf.title.EvalWithMetadb(metadb);
        const folder = tf.folder.EvalWithMetadb(metadb);
        return {
            artist, album, title, folder,
            artistTitle: (artist && title) ? `${artist} - ${title}` : "",
            artistAlbum: (artist && album) ? `${artist} - ${album}` : ""
        };
    },

    isLastFmFormat(data, jsonPath) {
        const fname = _.toLower(jsonPath.split('\\').pop());
        if (_.includes(fname, 'lastfm')) return true;
        if (data.similarartists && data.similarartists.artist) return true;
        if (data.url && _.isString(data.url) && _.includes(data.url, 'last.fm')) return true;
        return false;
    },

    searchJsonArtwork(folder) {
        for (const jsonFile of JSON_ART_FILES) {
            const jsonPath = folder + '\\' + jsonFile;
            try {
                if (!_isFile(jsonPath)) continue;
                const content = utils.ReadUTF8(jsonPath);
                if (!content) continue;
                const data = JSON.parse(content);
                if (!data || !_.isObject(data)) continue;
                if (this.isLastFmFormat(data, jsonPath)) {
                    const found = FileManager.findImageInPaths(
                        FileManager.buildSearchPaths(folder, COVER_PATTERNS, [])
                    );
                    if (found) return found;
                }
            } catch (e) {}
        }
        return null;
    },

    searchInFolder(folder, patterns, metadata, useVariations = false) {
        const jsonArt = this.searchJsonArtwork(folder);
        if (jsonArt) return jsonArt;

        const metadataNames = _.compact([
            metadata.album, metadata.artist, metadata.title, metadata.folder,
            metadata.artistAlbum,
            (metadata.artist && metadata.title) ? metadata.artist + ' - ' + metadata.title : '',
            (metadata.album  && metadata.title) ? metadata.album  + ' - ' + metadata.title : '',
            (metadata.artist && metadata.album && metadata.title)
                ? metadata.artist + ' ' + metadata.album + ' ' + metadata.title : ''
        ]);
        const paths = FileManager.buildSearchPaths(folder, patterns, metadataNames, useVariations);
        return FileManager.findImageInPaths(paths);
    },

    searchInFolderAnyFile(folder, patterns) {
        return FileManager.findImageInPaths(FileManager.buildSearchPaths(folder, patterns, []));
    },

    _searchFolderTree(folder, patterns, maxLevels) {
        if (maxLevels <= 0 || !folder) return null;
        const found = this.searchInFolderAnyFile(folder, patterns);
        if (found) return found;
        for (const sub of FileManager.getSubfolders(folder)) {
            const r = this._searchFolderTree(sub, patterns, maxLevels - 1);
            if (r) return r;
        }
        return null;
    },

    searchForCover(metadb, baseFolder) {
        if (this._pathCache.has(baseFolder)) {
            const cached = this._pathCache.get(baseFolder);
            if (cached && !FileManager.exists(cached)) this._pathCache.delete(baseFolder);
            else return cached;
        }

        const metadata = this.getMetadataNames(metadb);

        const trackMatch = this.searchInFolder(baseFolder, COVER_PATTERNS, metadata, false);
        if (trackMatch) { this._pathCache.set(baseFolder, trackMatch); return trackMatch; }

        const trackAny = this.searchInFolderAnyFile(baseFolder, COVER_PATTERNS);
        if (trackAny)   { this._pathCache.set(baseFolder, trackAny);   return trackAny; }

        const trackSub = this._searchFolderTree(baseFolder, COVER_PATTERNS, 2);
        if (trackSub)   { this._pathCache.set(baseFolder, trackSub);   return trackSub; }

        // Custom folder search
        const artistAlbumDash  = (metadata.artist && metadata.album) ? metadata.artist + ' - ' + metadata.album : '';
        const artistAlbumSpace = (metadata.artist && metadata.album) ? metadata.artist + ' ' + metadata.album   : '';
        const simpleNames = _.compact([metadata.title, metadata.artist, metadata.album, artistAlbumDash, artistAlbumSpace]);
        const nameVariations = [];
        _.forEach(simpleNames, name => {
            const lower = name.toLowerCase();
            nameVariations.push(lower, lower.replace(/\s+/g, '-'), lower.replace(/\s+/g, '_'));
            const title = this._toTitleCase(name);
            nameVariations.push(title, title.replace(/\s+/g, '-'), title.replace(/\s+/g, '_'));
        });
        const folderMatchNames = _.uniq(nameVariations);

        const customFolders = CustomFolders.getAll();
        if (customFolders.length === 0) { this._pathCache.set(baseFolder, null); return null; }

        for (const cf of customFolders) {
            if (!FileManager.isDirectory(cf)) continue;
            const hit = this.searchInFolder(cf, COVER_PATTERNS, metadata, true);
            if (hit) { this._pathCache.set(baseFolder, hit); return hit; }
        }

        for (const cf of customFolders) {
            if (!FileManager.isDirectory(cf)) continue;
            for (const sub1 of FileManager.getSubfolders(cf)) {
                const sub1Name = _.last(sub1.split('\\')).toLowerCase();
                const match1   = folderMatchNames.some(n =>
                    sub1Name === n || sub1Name.includes(n) || n.includes(sub1Name) ||
                    sub1Name.replace(/\s+/g, '-') === n || sub1Name.replace(/\s+/g, '_') === n
                );
                if (match1) {
                    const img = this.searchInFolder(sub1, COVER_PATTERNS, metadata, true)
                             || this.searchInFolderAnyFile(sub1, COVER_PATTERNS);
                    if (img) { this._pathCache.set(baseFolder, img); return img; }
                    for (const subSub of FileManager.getSubfolders(sub1)) {
                        const sImg = this.searchInFolder(subSub, COVER_PATTERNS, metadata, true)
                                  || this.searchInFolderAnyFile(subSub, COVER_PATTERNS);
                        if (sImg) { this._pathCache.set(baseFolder, sImg); return sImg; }
                    }
                    continue;
                }
                for (const sub2 of FileManager.getSubfolders(sub1)) {
                    const sub2Name = _.last(sub2.split('\\')).toLowerCase();
                    const match2   = folderMatchNames.some(n =>
                        sub2Name === n || sub2Name.includes(n) || n.includes(sub2Name) ||
                        sub2Name.replace(/\s+/g, '-') === n || sub2Name.replace(/\s+/g, '_') === n
                    );
                    if (match2) {
                        const img = this.searchInFolder(sub2, COVER_PATTERNS, metadata, true)
                                 || this.searchInFolderAnyFile(sub2, COVER_PATTERNS);
                        if (img) { this._pathCache.set(baseFolder, img); return img; }
                    }
                }
            }
        }

        this._pathCache.set(baseFolder, null);
        return null;
    }
};

// ====================== BLUR CACHE ======================
const BlurCache = {
    _cache: new Map(),
    _srcIdCounter: 0,

    _makeKey(src, w, h, radius) {
        return `${(src && src._srcId !== undefined) ? src._srcId : 'none'}|${radius}|${w}|${h}`;
    },

    // Return a blurred bitmap for the given source, dimensions, and radius.
    // Creates and caches one if not already present (LRU, capped at MAX_BG_CACHE).
    // StackBlur is slow — the cache avoids re-running it on every repaint.
    getOrBuild(w, h, src, radius) {
        if (!src || radius <= 0 || w <= 0 || h <= 0) return null;
        const key = this._makeKey(src, w, h, radius);
        if (this._cache.has(key)) {
            const c = this._cache.get(key); this._cache.delete(key); this._cache.set(key, c); return c;
        }
        if (this._cache.size >= MAX_BG_CACHE) {
            const oldKey = this._cache.keys().next().value;
            const old    = this._cache.get(oldKey);
            if (old && typeof old.Dispose === 'function') { try { old.Dispose(); } catch (e) {} }
            this._cache.delete(oldKey);
        }
        let g = null, newImg = null;
        try {
            newImg = gdi.CreateImage(w, h);
            g      = newImg.GetGraphics();
            g.DrawImage(src, 0, 0, w, h, 0, 0, src.Width, src.Height);
            newImg.ReleaseGraphics(g); g = null;
            newImg.StackBlur(radius);
            this._cache.set(key, newImg);
            newImg = null;
            return this._cache.get(key);
        } catch (e) {
            return null;
        } finally {
            if (g && newImg) { try { newImg.ReleaseGraphics(g); } catch (e2) {} }
            if (newImg)      { try { newImg.Dispose(); }          catch (e2) {} }
        }
    },

    dispose() {
        this._cache.forEach(bmp => { if (bmp && typeof bmp.Dispose === 'function') { try { bmp.Dispose(); } catch (e) {} } });
        this._cache.clear();
    }
};

// ====================== IMAGE MANAGER ======================
const ImageManager = {
    loadAlbumArt(metadb) {
        if (!metadb) return;
        const folderPath = PanelArt.titleFormats.path.EvalWithMetadb(metadb);

        // Same-folder shortcut: art bitmap is still valid for this track,
        // so only refresh the text strings and skip the expensive art reload.
        if (PanelArt.images.source && PanelArt.images.folderPath === folderPath) {
            TextManager.update(metadb);
            RepaintHelper.text();
            return;
        }

        PanelArt.loadToken++;
        PanelArt.images.source       = Utils.disposeImage(PanelArt.images.source);
        PanelArt.images.blur         = null;
        PanelArt.images.currentMetadb = null;
        PanelArt.images.currentPath  = '';
        PanelArt.images.folderPath   = folderPath;
        ArtCache.clearScaledCache();
        TextManager.update(metadb);

        const foundPath = ImageSearch.searchForCover(metadb, folderPath);
        if (foundPath && FileManager.exists(foundPath)) {
            ArtQueue.enqueue(done => {
                let art = null;
                try { art = gdi.Image(foundPath); } catch (e) {}
                if (art) {
                    PanelArt.images.source = art;
                    if (art._srcId === undefined) art._srcId = BlurCache._srcIdCounter++;
                    PanelArt.images.currentPath = foundPath;
                    OverlayCache.invalidate();
                    this.scheduleBlurRebuild();
                    RepaintHelper.full();
                } else {
                    PanelArt.images.currentMetadb = metadb;
                    PanelArt.pendingArtToken = PanelArt.loadToken;
                    utils.GetAlbumArtAsync(window.ID, metadb, 0);
                }
                done();
            });
            return;
        }

        PanelArt.images.currentMetadb = metadb;
        PanelArt.pendingArtToken = PanelArt.loadToken;
        utils.GetAlbumArtAsync(window.ID, metadb, 0);
    },

    buildBlur() {
        const cfg = StateManager.get();
        if (!cfg.blurEnabled || !cfg.backgroundEnabled || !PanelArt.images.source ||
            PanelArt.dimensions.width <= 0 || PanelArt.dimensions.height <= 0) {
            PanelArt.images.blur = null;
            return;
        }
        PanelArt.images.blur = BlurCache.getOrBuild(
            PanelArt.dimensions.width, PanelArt.dimensions.height,
            PanelArt.images.source, cfg.blurRadius
        );
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
        ArtCache.clearScaledCache();
    }
};

// ====================== OVERLAY CACHE ======================
const OverlayCache = {
    img: null, valid: false,

    invalidate() { this.valid = false; },

    dispose() {
        if (this.img) { try { this.img.Dispose(); } catch (e) {} this.img = null; }
        this.valid = false;
    },

    build(w, h, artInfo, textArea) {
        this.dispose();
        const cfg = StateManager.get();
        const needsAny = !cfg.overlayAllOff && (
            (cfg.showGlow       && cfg.opGlow > 0)       ||
            (cfg.showScanlines  && cfg.opScanlines > 0)  ||
            (cfg.showReflection && cfg.opReflection > 0) ||
            (cfg.showPhosphor   && cfg.opPhosphor > 0)
        );
        this.valid = true;
        if (!needsAny || w <= 0 || h <= 0) return;

        let g = null, newImg = null, released = false;
        try {
            newImg = gdi.CreateImage(w, h);
            g      = newImg.GetGraphics();

            if (cfg.showScanlines && cfg.opScanlines > 0) {
                const col = PanelArt_SetAlpha(PA_BLACK, cfg.opScanlines);
                for (let y = 0; y < h; y += SCANLINE_SPACING) g.FillSolidRect(0, y, w, 1, col);
            }

            if (cfg.showGlow && cfg.opGlow > 0) {
                const op = cfg.opGlow;
                if (artInfo && artInfo.artW > 0 && cfg.albumArtEnabled) {
                    const cx = artInfo.artX + artInfo.artW / 2;
                    const cy = artInfo.artY + artInfo.artH / 2;
                    const maxR = Math.max(artInfo.artW, artInfo.artH) * 0.75;
                    const steps = 30, minStep = Math.min(steps - 1, Math.ceil(1 / (op * 0.05)));
                    for (let i = minStep; i < steps; i++) {
                        const progress = i / steps, alpha = Math.floor(op * progress * 0.05);
                        if (alpha <= 0) continue;
                        const r = maxR * (1 - progress);
                        g.FillEllipse(cx - r, cy - r, r * 2, r * 2, PanelArt_SetAlpha(PA_WHITE, alpha));
                    }
                }
                if (textArea && textArea.textW > 0) {
                    const cx = textArea.textX + textArea.textW / 2;
                    const cy = textArea.textY + textArea.textH / 2;
                    const maxR = Math.max(textArea.textW, textArea.textH);
                    const steps = 25, minStep = Math.min(steps - 1, Math.ceil(1 / (op * 0.03)));
                    for (let i = minStep; i < steps; i++) {
                        const progress = i / steps, alpha = Math.floor(op * progress * 0.03);
                        if (alpha <= 0) continue;
                        const r = maxR * (1 - progress);
                        g.FillEllipse(cx - r, cy - r, r * 2, r * 2, PanelArt_SetAlpha(PA_WHITE, alpha));
                    }
                }
            }

            if (cfg.showReflection && cfg.opReflection > 0) {
                const reflH = Math.floor(h * REFLECTION_HEIGHT_RATIO);
                let lastAlpha = -1, bandStart = 0;
                // Batch consecutive rows that share the same alpha into a single
                // FillSolidRect call — much faster than one call per scanline.
                for (let y = 0; y < reflH; y++) {
                    const t = 1 - (y / reflH), s = t * t * (3 - 2 * t);
                    const alpha = Math.floor(cfg.opReflection * s * 0.65);
                    if (alpha !== lastAlpha) {
                        if (lastAlpha > 0 && y > bandStart)
                            g.FillSolidRect(0, bandStart, w, y - bandStart, PanelArt_SetAlpha(PA_WHITE, lastAlpha));
                        lastAlpha = alpha; bandStart = y;
                    }
                }
                if (lastAlpha > 0)
                    g.FillSolidRect(0, bandStart, w, reflH - bandStart, PanelArt_SetAlpha(PA_WHITE, lastAlpha));
            }

            if (cfg.showPhosphor && cfg.opPhosphor > 0) {
                const tc = PhosphorManager.getColor();
                const pr = (tc >>> 16) & 255, pg = (tc >>> 8) & 255, pb = tc & 255;
                const phosphorCol = PanelArt_SetAlpha(
                    _RGB(Math.floor(pr * 0.5 + 127), Math.floor(pg * 0.5 + 127), Math.floor(pb * 0.5 + 127)),
                    cfg.opPhosphor
                );
                for (let y = 1; y < h; y += SCANLINE_SPACING) g.FillSolidRect(0, y, w, 1, phosphorCol);
            }

            newImg.ReleaseGraphics(g); released = true; g = null;
            this.img = newImg; newImg = null;
        } catch (e) {
            // Overlay is cosmetic — swallow draw errors
        } finally {
            if (!released && g && newImg) { try { newImg.ReleaseGraphics(g); } catch (e2) {} }
            if (newImg) Utils.disposeImage(newImg);
        }
    }
};

// ====================== GLITCH RENDERER ======================
const GlitchRenderer = {
    run() {
        const cfg = StateManager.get();
        if (!cfg.glitchEnabled) { RepaintHelper.full(); return; }
        if (PanelArt.timers.glitch) window.ClearInterval(PanelArt.timers.glitch);
        let count = 0;
        PanelArt.timers.glitch = window.SetInterval(() => {
            PanelArt.glitchFrame = Math.random();
            RepaintHelper.full();
            if (++count >= 4) {
                PanelArt.glitchFrame = 0;
                window.ClearInterval(PanelArt.timers.glitch);
                PanelArt.timers.glitch = null;
            }
        }, 20);
    },

    paint(gr, w, h, intensity, pad, suppressBase) {
        const gx = Math.max(pad, 0), gy = Math.max(pad, 0);
        const gw = Math.max(w - pad * 2, 1), gh = Math.max(h - pad * 2, 1);

        if (!suppressBase) gr.FillSolidRect(gx, gy, gw, gh, PanelArt_SetAlpha(PA_GLITCH_BASE, 220));

        const scanOff = Math.floor(Math.random() * 3);
        for (let y = gy + scanOff; y < gy + gh; y += 3) {
            gr.FillSolidRect(gx, y, gw, 1, PanelArt_SetAlpha(PA_BLACK, Math.floor(Math.random() * 40) + 30));
        }

        const maxShift = Math.floor(gw * 0.1);
        const shift    = Math.floor(Math.random() * maxShift);
        const shiftDir = Math.random() > 0.5 ? 1 : -1;

        if (intensity > 0.3) {
            const col1 = GLITCH_SHIFT_COLORS[Math.floor(Math.random() * GLITCH_SHIFT_COLORS.length)];
            const col2 = GLITCH_SHIFT_COLORS[Math.floor(Math.random() * GLITCH_SHIFT_COLORS.length)];
            const sx1  = gx + shift * shiftDir,   rw1 = gw - shift;
            const sx2  = gx + shift * -shiftDir,  rw2 = gw - shift;
            if (sx1 >= gx && rw1 > 0) gr.FillSolidRect(sx1, gy, rw1, gh, PanelArt_SetAlpha(col1, Math.floor(intensity * 60)));
            gr.FillSolidRect(gx, gy, gw, gh, PanelArt_SetAlpha(_RGB(220, 225, 230), 3));
            if (sx2 >= gx && rw2 > 0) gr.FillSolidRect(sx2, gy, rw2, gh, PanelArt_SetAlpha(col2, Math.floor(intensity * 60)));
        }

        const numSlices = Math.floor(intensity * 6) + 2;
        for (let i = 0; i < numSlices; i++) {
            const sy = gy + Math.floor(Math.random() * gh), sh = Math.floor(Math.random() * 15) + 2;
            const ms = Math.floor(gw * 0.1);
            let sx   = gx + (Math.floor(Math.random() * ms * 2) - ms), dw = gw;
            if (sx < gx)  { dw -= (gx - sx); sx = gx; }
            if (sx + dw > gx + gw) dw = gx + gw - sx;
            if (dw > 0) gr.FillSolidRect(sx, sy, dw, sh,
                PanelArt_SetAlpha(GLITCH_SLICE_COLORS[Math.floor(Math.random() * GLITCH_SLICE_COLORS.length)], 120));
        }

        const numBlocks = Math.floor(intensity * 30) + 1;
        for (let i = 0; i < numBlocks; i++) {
            const bh = Math.floor(Math.random() * gh * 0.06) + 2;
            const by = gy + Math.floor(Math.random() * (gh - bh));
            const bw = Math.floor(Math.random() * gw * 0.1) + 3;
            const bx = gx + Math.floor(Math.random() * (gw - bw));
            const col = GLITCH_BLOCK_COLORS[Math.floor(Math.random() * GLITCH_BLOCK_COLORS.length)];
            gr.FillSolidRect(bx, by, bw, bh,
                _RGB(Math.floor(((col >>> 16) & 0xFF) * 0.90),
                     Math.floor(((col >>>  8) & 0xFF) * 0.90),
                     col & 0xFF));
        }

        const numInterference = Math.floor(intensity * 10) + 3;
        for (let i = 0; i < numInterference; i++) {
            const iy = gy + Math.floor(Math.random() * gh), ih = Math.floor(Math.random() * 2) + 1;
            gr.FillSolidRect(gx, iy, gw, ih,
                PanelArt_SetAlpha(GLITCH_TINT_COLORS[Math.floor(Math.random() * GLITCH_TINT_COLORS.length)],
                                  Math.floor(Math.random() * 50) + 40));
        }

        const numNoise = Math.floor(intensity * 400) + 200;
        for (let i = 0; i < numNoise; i++) {
            const nx  = gx + Math.floor(Math.random() * gw);
            const ny  = gy + Math.floor(Math.random() * gh);
            const ns  = Math.floor(Math.random() * 2) + 1;
            const gray = Math.floor(Math.random() * 150);
            const pick = Math.floor(Math.random() * 4);
            const nr   = pick === 0 ? Math.round(gray * 0.7) : gray;
            const ng   = pick === 0 ? Math.round(gray * 0.8) : pick === 3 ? Math.round(gray * 0.5) : gray;
            const nb   = pick === 0 ? gray : pick === 1 ? Math.round(gray * 0.5) : pick === 2 ? Math.round(gray * 0.6) : Math.round(gray * 0.5);
            gr.FillSolidRect(nx, ny, ns, ns, _RGB(nr, ng, nb));
        }

        if (intensity > 0.75) gr.FillSolidRect(gx, gy, gw, gh, PanelArt_SetAlpha(_RGB(200, 210, 230), 50));

        if (intensity > 0.4) {
            const tx = gx + Math.floor(Math.random() * gw * 0.6);
            const tw = Math.min(Math.floor(Math.random() * 10) + 3, gx + gw - tx);
            if (tw > 0) gr.FillSolidRect(tx, gy, tw, gh,
                PanelArt_SetAlpha(GLITCH_TRACK_COLORS[Math.floor(Math.random() * GLITCH_TRACK_COLORS.length)], 150));
        }
    }
};

// ====================== FOLDER IMAGES ======================
const FolderImages = {
    list(folder) {
        folder = (folder || '').replace(/\\+$/, '');
        if (!folder) return [];
        try {
            if (!_fso || !_fso.FolderExists(folder)) return [];
            const filesEnum = new Enumerator(_fso.GetFolder(folder).Files);
            const images = [];
            for (; !filesEnum.atEnd(); filesEnum.moveNext()) {
                const fname = filesEnum.item().Name.toLowerCase();
                const ext   = fname.substring(fname.lastIndexOf('.'));
                if (EXTENSIONS.includes(ext)) images.push(filesEnum.item().Path);
            }
            return images;
        } catch (e) { return []; }
    },

    defaultFolder() {
        return StateManager.get().imageFolder || (fb.ProfilePath + 'skins\\images');
    }
};

// ====================== RENDERER ======================
const Renderer = {
    _sliderFont: null,

    getSliderFont() {
        if (!this._sliderFont) this._sliderFont = gdi.Font("Segoe UI", 16, 0);
        return this._sliderFont;
    },

    drawBackground(gr) {
        const dim = PanelArt.dimensions, img = PanelArt.images, cfg = StateManager.get();
        // Layer 1: solid colour fill (always drawn as the base).
        gr.FillSolidRect(0, 0, dim.width, dim.height, cfg.customBackgroundColor);
        // Layer 2: blurred album-art overlay (if enabled and available).
        if (cfg.backgroundEnabled && cfg.blurEnabled && img.blur)
            gr.DrawImage(img.blur, 0, 0, dim.width, dim.height, 0, 0, img.blur.Width, img.blur.Height);
        // Layer 3: optional darkening pass to improve text contrast.
        if (cfg.darkenValue > 0)
            gr.FillSolidRect(0, 0, dim.width, dim.height,
                PanelArt_SetAlpha(PA_BLACK, Math.floor(cfg.darkenValue * DARKEN_ALPHA_MULTIPLIER)));
    },

    drawAlbumArt(gr) {
        const img = PanelArt.images.source, cfg = StateManager.get(), dim = PanelArt.dimensions;
        if (!img || !cfg.albumArtEnabled) return { artX: 0, artY: 0, artW: 0, artH: 0 };

        const basePad = cfg.albumArtPadding ?? 0;
        const availW  = dim.width, availH = dim.height;
        const panelAspect = availW / availH;
        let artW = 0, artH = 0, artX = 0, artY = 0, pad = basePad;

        if (cfg.albumArtFloat === "left" || cfg.albumArtFloat === "right") {
            let maxRatio = ALBUM_ART_MAX_WIDTH_RATIO;
            if (panelAspect > 1.5) maxRatio = 0.70;
            else if (panelAspect < 1.0) maxRatio = 0.60;

            let maxArtW = (availW * maxRatio) - pad * 2;
            let drawableH = availH - pad * 2;
            const scale0 = Math.min(maxArtW / img.Width, drawableH / img.Height);
            let scaledW = Math.floor(img.Width * scale0), scaledH = Math.floor(img.Height * scale0);

            if (scaledW / availW < 0.35 && pad > 0) {
                const reduction = Math.max(0, 1 - ((scaledW / availW) / 0.35));
                pad       = Math.floor(basePad * (1 - reduction * 0.7));
                maxArtW   = (availW * maxRatio) - pad * 2;
                drawableH = availH - pad * 2;
                const scale1 = Math.min(maxArtW / img.Width, drawableH / img.Height);
                scaledW = Math.floor(img.Width * scale1); scaledH = Math.floor(img.Height * scale1);
            }

            artW = scaledW + pad * 2; artH = availH;
            artY = Math.floor((availH - scaledH) / 2);
            artX = (cfg.albumArtFloat === "left") ? pad : dim.width - artW + pad;
            const si = ArtCache.getScaledImage(img, scaledW, scaledH);
            if (si) gr.DrawImage(si, artX, artY, scaledW, scaledH, 0, 0, scaledW, scaledH);

        } else if (cfg.albumArtFloat === "top" || cfg.albumArtFloat === "bottom") {
            const maxRatio = 0.75;
            let maxArtH = (availH * maxRatio) - pad * 2, drawableW = availW - pad * 2;
            const scale0 = Math.min(drawableW / img.Width, maxArtH / img.Height);
            let scaledW = Math.floor(img.Width * scale0), scaledH = Math.floor(img.Height * scale0);
            const minSH  = Math.floor((availH * ALBUM_ART_MIN_HEIGHT_RATIO) - pad * 2);
            if (scaledH < minSH) { scaledH = minSH; scaledW = Math.floor(img.Width * (scaledH / img.Height)); }

            if (scaledH / availH < 0.35 && pad > 0) {
                const reduction = Math.max(0, 1 - ((scaledH / availH) / 0.35));
                pad      = Math.floor(basePad * (1 - reduction * 0.4));
                maxArtH  = (availH * maxRatio) - pad * 2;
                drawableW = availW - pad * 2;
                const scale1 = Math.min(drawableW / img.Width, maxArtH / img.Height);
                scaledW = Math.floor(img.Width * scale1); scaledH = Math.floor(img.Height * scale1);
                const minSH2 = Math.floor((availH * ALBUM_ART_MIN_HEIGHT_RATIO) - pad * 2);
                if (scaledH < minSH2) { scaledH = minSH2; scaledW = Math.floor(img.Width * (scaledH / img.Height)); }
            }

            artW = availW; artH = scaledH + pad * 2;
            artX = Math.floor((availW - scaledW) / 2);
            artY = (cfg.albumArtFloat === "top") ? pad : dim.height - artH + pad;
            const si = ArtCache.getScaledImage(img, scaledW, scaledH);
            if (si) gr.DrawImage(si, artX, artY, scaledW, scaledH, 0, 0, scaledW, scaledH);
        }

        return { artX, artY, artW, artH, actualPad: pad };
    },

    getTextArea(artInfo) {
        const cfg = StateManager.get(), dim = PanelArt.dimensions;
        const overlayPad = DEFAULT_OVERLAY_PADDING, borderPad = cfg.borderSize || 0;
        let textX = borderPad, textY = borderPad;
        let textW = dim.width - borderPad * 2, textH = dim.height - borderPad * 2;

        if (!cfg.albumArtEnabled || !PanelArt.images.source) return { textX, textY, textW, textH };

        const { artW, artH, actualPad = 0 } = artInfo;
        if (cfg.albumArtFloat === "left" || cfg.albumArtFloat === "right") {
            if (cfg.albumArtFloat === "left") {
                textX = artW + overlayPad - (actualPad * 0.5);
                textW = dim.width - artW - overlayPad + (actualPad * 0.5) - borderPad;
            } else {
                textX = borderPad;
                textW = dim.width - artW - overlayPad + (actualPad * 0.5) - borderPad;
            }
            textY = borderPad; textH = dim.height - borderPad * 2;
        } else if (cfg.albumArtFloat === "top" || cfg.albumArtFloat === "bottom") {
            textX = borderPad; textW = dim.width - borderPad * 2;
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
        const { textX, textY, textW, textH } = textArea;
        const cfg = StateManager.get();
        const scaled = TextManager.scaleAndClip(gr, textW, textH);
        const { titleFont, artistFont, extraFont, titleText, artistText, extraText } = scaled;
        const titleH  = TextHeightCache.calcTextHeight(gr, titleText,  titleFont,  textW);
        const artistH = TextHeightCache.calcTextHeight(gr, artistText, artistFont, textW);
        const extraH  = extraFont ? TextHeightCache.calcTextHeight(gr, extraText, extraFont, textW) : 0;

        let totalTextH = titleH + GAP_TITLE_ARTIST + artistH;
        if (extraFont) totalTextH += GAP_ARTIST_EXTRA + extraH;

        let startY;
        switch (cfg.layout) {
            case 1:  startY = textY + textH - totalTextH; break;
            case 2:  startY = textY;                      break;
            default: startY = textY + Math.floor((textH - totalTextH) / 2);
        }

        const ty    = startY;
        const ay    = ty + titleH + GAP_TITLE_ARTIST;
        const ey    = ay + artistH + (extraFont ? GAP_ARTIST_EXTRA : 0);
        const flags = DT_CENTER | DT_WORDBREAK;

        if (cfg.textShadowEnabled) {
            const shadow = PanelArt_SetAlpha(PA_BLACK, 136), off = TEXT_SHADOW_OFFSET;
            gr.GdiDrawText(titleText,  titleFont,  shadow, textX, ty + off, textW, titleH,  flags | DT_NOPREFIX);
            gr.GdiDrawText(artistText, artistFont, shadow, textX, ay + off, textW, artistH, flags | DT_NOPREFIX);
            if (extraFont)
                gr.GdiDrawText(extraText, extraFont, shadow, textX, ey + off, textW, extraH, flags | DT_NOPREFIX);
        }

        gr.GdiDrawText(titleText,  titleFont,  PA_WHITE,  textX, ty, textW, titleH,  flags | DT_NOPREFIX);
        gr.GdiDrawText(artistText, artistFont, PA_GREY200, textX, ay, textW, artistH, flags | DT_NOPREFIX);
        if (extraFont)
            gr.GdiDrawText(extraText, extraFont, PA_GREY180, textX, ey, textW, extraH, flags | DT_NOPREFIX);
    },

    drawBorder(gr) {
        const cfg = StateManager.get(), dim = PanelArt.dimensions;
        if (cfg.borderSize <= 0) return;
        const w = dim.width, h = dim.height, b = cfg.borderSize, col = cfg.borderColor;
        gr.FillSolidRect(0, 0, w, b, col);
        gr.FillSolidRect(0, h - b, w, b, col);
        gr.FillSolidRect(0, b, b, h - b * 2, col);
        gr.FillSolidRect(w - b, b, b, h - b * 2, col);
        const bx = b, by = b, bw = w - b * 2, bh = h - b * 2;
        gr.FillSolidRect(bx - 1, by - 1, bw + 2, 1, PA_BORDER_LIGHT);
        gr.FillSolidRect(bx - 1, by + bh, bw + 2, 1, PA_BORDER_LIGHT);
        gr.FillSolidRect(bx - 1, by - 1, 1, bh + 2, PA_BORDER_LIGHT);
        gr.FillSolidRect(bx + bw, by - 1, 1, bh + 2, PA_BORDER_LIGHT);
        gr.FillSolidRect(bx + 1, by + 1, bw - 2, 1, PA_BORDER_DARK);
        gr.FillSolidRect(bx + 1, by + bh - 1, bw - 2, 1, PA_BORDER_DARK);
        gr.FillSolidRect(bx + 1, by + 1, 1, bh - 2, PA_BORDER_DARK);
        gr.FillSolidRect(bx + bw - 1, by + 1, 1, bh - 2, PA_BORDER_DARK);
    },

    drawOverlay(gr, w, h, artInfo, textArea) {
        if (OverlayCache.valid && OverlayCache.img &&
            (OverlayCache.img.Width !== w || OverlayCache.img.Height !== h)) {
            OverlayCache.invalidate();
        }
        if (!OverlayCache.valid) OverlayCache.build(w, h, artInfo, textArea);
        if (OverlayCache.img)
            gr.DrawImage(OverlayCache.img, 0, 0, w, h, 0, 0, w, h);
    },

    drawSlider(gr, value, max, yPos) {
        const dim = PanelArt.dimensions;
        const barW = Math.max(SLIDER_MIN_WIDTH, Math.floor(dim.width * SLIDER_WIDTH_RATIO));
        const bx = Math.floor((dim.width - barW) / 2);
        gr.FillSolidRect(bx, yPos, barW, SLIDER_HEIGHT, PanelArt_SetAlpha(PA_WHITE, 60));
        gr.FillSolidRect(bx, yPos, Math.floor(barW * (value / max)), SLIDER_HEIGHT, PanelArt_SetAlpha(PA_WHITE, 180));
        const font = this.getSliderFont();
        const text = value.toString();
        const sz   = gr.MeasureString(text, font, 0, 0, dim.width, dim.height);
        const sw   = Math.ceil(sz.Width), sh = Math.ceil(sz.Height);
        gr.DrawString(text, font, PA_WHITE, Math.floor((dim.width - sw) / 2), Math.floor(yPos - sh - 2), sw, sh);
    },

    drawSliders(gr) {
        const sl = PanelArt.slider, cfg = StateManager.get(), dim = PanelArt.dimensions;
        if (!sl.active) return;
        if (sl.target) {
            const valMap = { Reflection: cfg.opReflection, Glow: cfg.opGlow, Scanlines: cfg.opScanlines, Phosphor: cfg.opPhosphor };
            this.drawSlider(gr, valMap[sl.target], 255, dim.height - 18);
        }
        if (sl.paddingActive) this.drawSlider(gr, cfg.albumArtPadding || 0, 100, dim.height - 40);
    }
};

// ====================== STATE MANAGER ======================
const StateManager = {
    _config: getDefaultState(),

    get() { return this._config; },

    load() {
        try {
            const raw = window.GetProperty(STATE_KEY, null);
            if (!raw) {
                this._config = getDefaultState();
                this.apply(this._config, true, false, false);
                this.save();
                return;
            }
            const parsed     = JSON.parse(raw);
            let savedVersion = parsed.version ?? 1;
            let savedData    = parsed.data ?? parsed;
            if (savedVersion !== STATE_VERSION) {
                savedData = migrateState(savedData, savedVersion);
                const migrated = Validator.validateConfig(savedData);
                try { window.SetProperty(STATE_KEY, JSON.stringify({ version: STATE_VERSION, data: migrated })); } catch (e) {}
                this._config = migrated;
            } else {
                this._config = Validator.validateConfig(savedData);
            }
            this.apply(this._config, true, false, false);
        } catch (e) {
            this._config = getDefaultState();
            this.apply(this._config, true, false, false);
            this.save();
        }
    },

    // Apply a new config and trigger the relevant subsystem rebuilds.
    //   rebuildBlur        – schedule a blurred background rebuild
    //   skipOverlayRebuild – skip overlay cache invalidation
    //   skipFontRebuild    – skip font rebuild and text update
    apply(config, rebuildBlur = false, skipOverlayRebuild = false, skipFontRebuild = false) {
        this._config = config;
        if (!skipOverlayRebuild)  OverlayCache.invalidate();
        if (!skipFontRebuild)     FontManager.rebuildFonts();
        if (rebuildBlur)          ImageManager.scheduleBlurRebuild();
        if (!skipFontRebuild) {
            TextManager.update(fb.IsPlaying ? fb.GetNowPlaying() : null);
        }
    },

    reset() {
        this._config = getDefaultState();
        PanelArt.slider.active = false; PanelArt.slider.paddingActive = false; PanelArt.slider.target = null;
        TextHeightCache.clear();
        ImageSearch.clearCache();
        this.apply(this._config, true);
        this.save();
        PanelArt.images.folderPath = '';
        const track = fb.IsPlaying ? fb.GetNowPlaying() : null;
        if (track) ImageManager.loadAlbumArt(track);
        else       TextManager.update(null);
        RepaintHelper.full();
    },

    save() {
        try { window.SetProperty(STATE_KEY, JSON.stringify({ version: STATE_VERSION, data: this._config })); } catch (e) {}
    },

    _saveTimer: null, _saveScheduled: false,

    saveDebounced() {
        if (this._saveScheduled) return;
        this._saveScheduled = true;
        this._saveTimer = window.SetTimeout(() => {
            this._saveTimer = null;
            try { this.save(); } finally { this._saveScheduled = false; }
        }, 100);
    }
};

// ====================== PRESET MANAGER ======================
const PresetManager = {
    save(slot) {
        if (!_.inRange(slot, 1, 4)) return;
        try { window.SetProperty("SMP.Preset" + slot, JSON.stringify(_.assign({}, StateManager.get()))); } catch (e) {}
    },

    load(slot) {
        if (!_.inRange(slot, 1, 4)) return;
        try {
            const str = window.GetProperty("SMP.Preset" + slot, null);
            if (!str) return;
            const validated = Validator.validateConfig(JSON.parse(str));
            StateManager.apply(validated, true);
            StateManager.save();
            // Sync runtime image-mode flags with the loaded config.
            // glitchEnabled is read directly from cfg everywhere — no runtime mirror needed.
            PanelArt.imageMode    = validated.imageMode;
            PanelArt.slideMode    = validated.slideMode;
            PanelArt.slideIndex   = validated.slideIndex || 0;
            if (PanelArt.slideMode)      SlideManager.startSlideMode(true);
            else if (PanelArt.imageMode) ImageModeManager.startImageMode();
            RepaintHelper.full();
        } catch (e) {}
    }
};

// ====================== PHOSPHOR MANAGER ======================
const PhosphorManager = {
    getColor() {
        const cfg = StateManager.get();
        if (cfg.currentPhosphorTheme === CUSTOM_THEME_INDEX) return cfg.customPhosphorColor;
        if (!_.inRange(cfg.currentPhosphorTheme, 0, PHOSPHOR_THEMES.length)) return PHOSPHOR_THEMES[0].color;
        return PHOSPHOR_THEMES[cfg.currentPhosphorTheme].color;
    },

    setCustomColor() {
        try {
            const cfg    = StateManager.get();
            const picked = utils.ColourPicker(window.ID, cfg.customPhosphorColor);
            if (_.isNumber(picked) && picked !== -1) {
                cfg.customPhosphorColor   = picked >>> 0;
                cfg.currentPhosphorTheme  = CUSTOM_THEME_INDEX;
                StateManager.apply(cfg, false, false, true);
                StateManager.save();
                RepaintHelper.full();
            }
        } catch (e) {}
    }
};

// ====================== MENU MANAGER ======================
const MenuManager = {
    createMainMenu() {
        const m   = window.CreatePopupMenu();
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
        m.AppendMenuItem(MF_STRING, 950, cfg.imageFolder ? "Change Image Folder" : "Set Image Folder...");
        m.AppendMenuItem(PanelArt.slideMode ? MF_CHECKED : MF_STRING, 952, "Slide Show");
        if (cfg.imageFolder)
            m.AppendMenuItem(PanelArt.imageMode ? MF_CHECKED : MF_STRING, 951, "Show Image");
        return m;
    },

    addOverlayMenu(parent) {
        const overlayM = window.CreatePopupMenu();
        const cfg      = StateManager.get();
        const themeM   = window.CreatePopupMenu();
        _.forEach(PHOSPHOR_THEMES, (theme, i) => {
            themeM.AppendMenuItem(MF_STRING, 600 + i, theme.name);
            if (cfg.currentPhosphorTheme === i) themeM.CheckMenuItem(600 + i, true);
        });
        themeM.AppendMenuSeparator();
        const customId = 600 + CUSTOM_THEME_INDEX;
        themeM.AppendMenuItem(MF_STRING, customId, "Custom...");
        if (cfg.currentPhosphorTheme === CUSTOM_THEME_INDEX) themeM.CheckMenuItem(customId, true);
        themeM.AppendTo(overlayM, MF_STRING, "Phosphor Theme");
        overlayM.AppendMenuSeparator();
        overlayM.AppendMenuItem(cfg.overlayAllOff ? MF_CHECKED : MF_STRING, 99, "— All Effects Off");
        overlayM.AppendMenuSeparator();
        overlayM.AppendMenuItem((!cfg.overlayAllOff && cfg.showReflection) ? MF_CHECKED : MF_STRING, 100, "Reflection");
        overlayM.AppendMenuItem((!cfg.overlayAllOff && cfg.showGlow)       ? MF_CHECKED : MF_STRING, 101, "Glow");
        overlayM.AppendMenuItem((!cfg.overlayAllOff && cfg.showScanlines)  ? MF_CHECKED : MF_STRING, 102, "Scanlines");
        overlayM.AppendMenuItem((!cfg.overlayAllOff && cfg.showPhosphor)   ? MF_CHECKED : MF_STRING, 103, "Phosphor");
        overlayM.AppendMenuSeparator();
        const opacityM = window.CreatePopupMenu();
        _.forEach(["Reflection","Glow","Scanlines","Phosphor"], (name, i) => {
            const keys  = ["opReflection","opGlow","opScanlines","opPhosphor"];
            opacityM.AppendMenuItem(MF_STRING, 200 + i, `Adjust ${name} Opacity...  [${cfg[keys[i]]}]`);
        });
        opacityM.AppendTo(overlayM, MF_STRING, "Adjust Opacity");
        overlayM.AppendTo(parent, MF_STRING, "Overlay");
    },

    addPanelArtMenu(parent) {
        const panelM = window.CreatePopupMenu();
        this.addAlbumArtMenu(panelM);
        panelM.AppendMenuSeparator();
        this.addTextMenu(panelM);
        const borderM = window.CreatePopupMenu();
        borderM.AppendMenuItem(MF_STRING, 530, 'Set Border Size...');
        borderM.AppendMenuItem(MF_STRING, 531, 'Change Color...');
        borderM.AppendTo(panelM, MF_STRING, 'Border Appearance');
        this.addBackgroundMenu(panelM);
        panelM.AppendTo(parent, MF_STRING, 'PanelArt Settings');
    },

    addBackgroundMenu(parent) {
        const bgM = window.CreatePopupMenu(), cfg = StateManager.get();
        bgM.AppendMenuItem(cfg.backgroundEnabled ? MF_CHECKED : MF_STRING, 850, "Enable Background Art");
        bgM.AppendMenuItem(MF_STRING, 851, "Custom Background Color...");
        bgM.AppendMenuSeparator();
        const blurM = window.CreatePopupMenu();
        blurM.AppendMenuItem(cfg.blurEnabled ? MF_CHECKED : MF_STRING, 512, 'Enable Blur');
        blurM.AppendMenuSeparator();
        _.times(11, i => {
            const v = i * 20;
            blurM.AppendMenuItem(MF_STRING, 500 + i, 'Radius: ' + v);
            if (cfg.blurRadius === v) blurM.CheckMenuItem(500 + i, true);
        });
        blurM.AppendMenuItem(MF_STRING, 511, 'Max: 254');
        if (cfg.blurRadius === 254) blurM.CheckMenuItem(511, true);
        blurM.AppendTo(bgM, MF_STRING, 'Blur Settings');
        const darkM = window.CreatePopupMenu();
        _.times(6, d => {
            const v = d * 10;
            darkM.AppendMenuItem(MF_STRING, 520 + d, 'Level: ' + v + '%');
            if (cfg.darkenValue === v) darkM.CheckMenuItem(520 + d, true);
        });
        darkM.AppendTo(bgM, MF_STRING, 'Darken Background');
        bgM.AppendTo(parent, MF_STRING, "Background");
    },

    addTextMenu(parent) {
        const textM = window.CreatePopupMenu(), cfg = StateManager.get();
        this.addFontMenu(textM);
        textM.AppendMenuSeparator();
        textM.AppendMenuItem(MF_STRING, 562, 'Layout: Top');
        textM.AppendMenuItem(MF_STRING, 560, 'Layout: Center');
        textM.AppendMenuItem(MF_STRING, 561, 'Layout: Bottom');
        textM.CheckMenuRadioItem(560, 562, 560 + cfg.layout);
        textM.AppendMenuSeparator();
        textM.AppendMenuItem(cfg.textShadowEnabled ? MF_CHECKED : MF_STRING, 570, 'Text Shadow');
        textM.AppendMenuItem(cfg.extraInfoEnabled  ? MF_CHECKED : MF_STRING, 571, 'Show Extra Info');
        textM.AppendTo(parent, MF_STRING, "Text");
    },

    addFontMenu(parent) {
        const fontsM = window.CreatePopupMenu();
        const sizeM  = window.CreatePopupMenu();
        const typeM  = window.CreatePopupMenu();
        _.forEach(['Title','Artist','Extra'], (name, i) => {
            sizeM.AppendMenuItem(MF_STRING, 540 + i, name);
            typeM.AppendMenuItem(MF_STRING, 550 + i, name);
        });
        sizeM.AppendTo(fontsM, MF_STRING, 'Size');
        typeM.AppendTo(fontsM, MF_STRING, 'Type');
        fontsM.AppendTo(parent, MF_STRING, 'Fonts');
    },

    addAlbumArtMenu(parent) {
        const artM = window.CreatePopupMenu(), cfg = StateManager.get();
        artM.AppendMenuItem(cfg.albumArtEnabled ? MF_CHECKED : MF_STRING, 800, "Enable Album Art");
        _.forEach([
            { value:"left",   id:801, text:"Float: Left"   },
            { value:"right",  id:802, text:"Float: Right"  },
            { value:"top",    id:803, text:"Float: Top"    },
            { value:"bottom", id:804, text:"Float: Bottom" }
        ], opt => artM.AppendMenuItem(cfg.albumArtFloat === opt.value ? MF_CHECKED : MF_STRING, opt.id, opt.text));
        artM.AppendMenuItem(MF_STRING, 805, "Padding...");
        artM.AppendTo(parent, MF_STRING, "Album Art");
    },

    addPresetMenu(parent) {
        const presetM = window.CreatePopupMenu(), loadM = window.CreatePopupMenu(), saveM = window.CreatePopupMenu();
        _.times(3, i => {
            loadM.AppendMenuItem(MF_STRING, 301 + i, "Preset " + (i + 1));
            saveM.AppendMenuItem(MF_STRING, 401 + i, "Preset " + (i + 1));
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
            folders.forEach((folder, i) =>
                customMenu.AppendMenuItem(MF_STRING, 1010 + i, _.truncate(folder, { length: 50 })));
            customMenu.AppendMenuSeparator();
            customMenu.AppendMenuItem(MF_STRING, 1020, "Clear All Custom Folders");
        }
        customMenu.AppendTo(parent, MF_STRING, "Custom Artwork Folders");
    },

    handleSelection(id) {
        const cfg = StateManager.get();

        const update = (callback, rebuildBlur = false, rebuildFonts = false) => {
            const prevRadius = cfg.blurRadius, prevBlurOn = cfg.blurEnabled, prevBgOn = cfg.backgroundEnabled;
            callback(cfg);
            const blurChanged = prevRadius !== cfg.blurRadius || prevBlurOn !== cfg.blurEnabled || prevBgOn !== cfg.backgroundEnabled;
            StateManager.apply(cfg, rebuildBlur || blurChanged, false, !rebuildFonts);
            StateManager.saveDebounced();
            RepaintHelper.full();
        };

        if (id === 99) {
            update(c => {
                if (!c.overlayAllOff) {
                    c.savedOverlay = { showReflection: c.showReflection, showGlow: c.showGlow,
                                       showScanlines:  c.showScanlines,  showPhosphor: c.showPhosphor };
                    c.overlayAllOff = true;
                } else {
                    if (c.savedOverlay) {
                        if (_.isBoolean(c.savedOverlay.showReflection)) c.showReflection = c.savedOverlay.showReflection;
                        if (_.isBoolean(c.savedOverlay.showGlow))       c.showGlow       = c.savedOverlay.showGlow;
                        if (_.isBoolean(c.savedOverlay.showScanlines))  c.showScanlines  = c.savedOverlay.showScanlines;
                        if (_.isBoolean(c.savedOverlay.showPhosphor))   c.showPhosphor   = c.savedOverlay.showPhosphor;
                        c.savedOverlay = null;
                    }
                    c.overlayAllOff = false;
                }
            });
        }
        else if (_.inRange(id, 100, 104)) {
            const effects = ['showReflection','showGlow','showScanlines','showPhosphor'];
            update(c => c[effects[id - 100]] = !c[effects[id - 100]]);
        }
        else if (_.inRange(id, 200, 204)) {
            PanelArt.slider.active = true; PanelArt.slider.paddingActive = false;
            PanelArt.slider.target = ["Reflection","Glow","Scanlines","Phosphor"][id - 200];
            RepaintHelper.full();
        }
        else if (_.inRange(id, 600, 600 + CUSTOM_THEME_INDEX)) {
            update(c => c.currentPhosphorTheme = id - 600);
        }
        else if (id === 600 + CUSTOM_THEME_INDEX) { PhosphorManager.setCustomColor(); }
        else if (_.inRange(id, 500, 511)) { update(c => c.blurRadius = (id - 500) * 20, true); }
        else if (id === 511)              { update(c => c.blurRadius = 254, true); }
        else if (id === 512)              { update(c => c.blurEnabled = !c.blurEnabled, true); }
        else if (_.inRange(id, 520, 526)) { update(c => c.darkenValue = (id - 520) * 10); }
        else if (id === 530) {
            const v = Utils.validateNumber(utils.InputBox(window.ID, 'Border Size', 'Enter size (0-50):', cfg.borderSize.toString(), false), cfg.borderSize, 0, 50);
            update(c => c.borderSize = v);
        }
        else if (id === 531) {
            const p = utils.ColourPicker(window.ID, cfg.borderColor);
            if (_.isNumber(p) && p !== -1) update(c => c.borderColor = p >>> 0);
        }
        else if (_.inRange(id, 540, 543)) {
            const keys   = ['titleFontSize','artistFontSize','extraFontSize'];
            const labels = ['Title Font Size','Artist Font Size','Extra Font Size'];
            const idx    = id - 540;
            const v      = Utils.validateNumber(utils.InputBox(window.ID, labels[idx], 'Enter new size:', cfg[keys[idx]].toString(), false), cfg[keys[idx]], MIN_FONT_SIZE, MAX_FONT_SIZE);
            update(c => c[keys[idx]] = v, false, true);
        }
        else if (_.inRange(id, 550, 553)) {
            const keys   = ['titleFontName','artistFontName','extraFontName'];
            const labels = ['Title Font Name','Artist Font Name','Extra Font Name'];
            const idx    = id - 550;
            const input  = utils.InputBox(window.ID, labels[idx], 'Enter font name:', cfg[keys[idx]], false);
            if (input && _.trim(input)) update(c => c[keys[idx]] = _.trim(input), false, true);
        }
        else if (_.inRange(id, 560, 563)) { update(c => c.layout = id - 560); }
        else if (id === 570) { update(c => c.textShadowEnabled = !c.textShadowEnabled); }
        else if (id === 571) { update(c => c.extraInfoEnabled  = !c.extraInfoEnabled); }
        else if (id === 800) { update(c => c.albumArtEnabled   = !c.albumArtEnabled); }
        else if (_.inRange(id, 801, 805)) {
            const floats = ["left","right","top","bottom"];
            update(c => c.albumArtFloat = floats[id - 801]);
        }
        else if (id === 805) {
            PanelArt.slider.active = true; PanelArt.slider.paddingActive = true;
            PanelArt.slider.target = null; RepaintHelper.full();
        }
        else if (id === 850) { update(c => c.backgroundEnabled    = !c.backgroundEnabled); }
        else if (id === 851) {
            const p = utils.ColourPicker(window.ID, cfg.customBackgroundColor);
            if (_.isNumber(p) && p !== -1) update(c => c.customBackgroundColor = p >>> 0);
        }
        else if (_.inRange(id, 301, 304)) { PresetManager.load(id - 300); }
        else if (_.inRange(id, 401, 404)) { PresetManager.save(id - 400); }
        else if (id === 900)  { StateManager.reset(); }
        else if (id === 901)  {
            FileManager.clear(); ImageSearch.clearCache();
            ImageManager.cleanup(); PanelArt.images.folderPath = ''; TextHeightCache.clear();
            const track = fb.IsPlaying ? fb.GetNowPlaying() : null;
            if (track) ImageManager.loadAlbumArt(track);
            else { TextManager.update(null); RepaintHelper.full(); }
        }
        else if (id === 1000) {
            try {
                const folder = utils.InputBox(window.ID, "Enter folder path for custom artwork search:", "Custom Artwork Folder", "", true);
                if (folder && CustomFolders.add(folder)) {
                    ImageSearch.clearCache();
                    const track = fb.IsPlaying ? fb.GetNowPlaying() : null;
                    if (track) ImageManager.loadAlbumArt(track); else RepaintHelper.full();
                }
            } catch (e) {}
        }
        else if (_.inRange(id, 1010, 1015)) {
            if (CustomFolders.remove(id - 1010)) {
                ImageSearch.clearCache();
                const track = fb.IsPlaying ? fb.GetNowPlaying() : null;
                if (track) ImageManager.loadAlbumArt(track); else RepaintHelper.full();
            }
        }
        else if (id === 1020) {
            CustomFolders.clear(); ImageSearch.clearCache();
            const track = fb.IsPlaying ? fb.GetNowPlaying() : null;
            if (track) ImageManager.loadAlbumArt(track); else RepaintHelper.full();
        }
        else if (id === 950) {
            try {
                const folder = utils.InputBox(window.ID, "Enter Image folder path:", "Image Folder", cfg.imageFolder || '', true);
                if (folder && _isFolder(folder)) {
                    update(c => { c.imageFolder = folder; });
                }
            } catch (e) {}
        }
        else if (id === 951) { ImageModeManager.toggleImageMode(); }
        else if (id === 952) { SlideManager.toggleSlideMode(); }
        else if (id === 545) {
            // glitchEnabled lives only in cfg; no runtime mirror needed.
            update(c => { c.glitchEnabled = !c.glitchEnabled; });
        }
    }
};

// ====================== ART CONTROLLER ======================
const ArtController = {
    onPlaybackNewTrack(metadb) {
        TextHeightCache.clear();
        TextManager.update(metadb);
        ImageManager.loadAlbumArt(metadb);
        GlitchRenderer.run();
    },

    onPlaybackStop(reason) {
        if (reason === 0) {
            ImageManager.cleanup();
            ArtCache.clearScaledCache();
            TextManager.update(null);
        }
        RepaintHelper.full();
    },

    onSize() {
        PanelArt.dimensions.width  = window.Width;
        PanelArt.dimensions.height = window.Height;
        OverlayCache.invalidate();
        ArtCache.clearScaledCache();
        ImageManager.scheduleBlurRebuild();
        RepaintHelper.full();
    },

    onMouseWheel(delta) {
        if (!PanelArt.slider.active) return;
        const cfg = StateManager.get();
        const keyMap = { Reflection:"opReflection", Glow:"opGlow", Scanlines:"opScanlines", Phosphor:"opPhosphor" };
        const key    = keyMap[PanelArt.slider.target];
        if (key) {
            cfg[key] = _.clamp(cfg[key] + delta * SLIDER_STEP, 0, 255);
            StateManager.apply(cfg, false, true, true);
            RepaintHelper.full();
            PanelArt.timers.overlayRebuild = Utils.clearTimer(PanelArt.timers.overlayRebuild);
            PanelArt.timers.overlayRebuild = window.SetTimeout(() => {
                PanelArt.timers.overlayRebuild = null;
                OverlayCache.invalidate();
                RepaintHelper.full();
            }, 100);
        }
        if (PanelArt.slider.paddingActive) {
            cfg.albumArtPadding = _.clamp(cfg.albumArtPadding + delta * SLIDER_STEP, 0, 100);
            StateManager.apply(cfg, false, false, true);
            RepaintHelper.full();
        }
    },

    onMouseLbtnUp() {
        if (PanelArt.slider.active) {
            PanelArt.slider.active = false;
            PanelArt.slider.target = null;
            PanelArt.slider.paddingActive = false;
            RepaintHelper.full();
            return true;
        }
        return false;
    },

    onUnload() {
        PanelArt.timers.blurRebuild    = Utils.clearTimer(PanelArt.timers.blurRebuild);
        PanelArt.timers.overlayRebuild = Utils.clearTimer(PanelArt.timers.overlayRebuild);
        PanelArt.timers.imageAnim      = Utils.clearInterval(PanelArt.timers.imageAnim);
        if (PanelArt.timers.glitch) { window.ClearInterval(PanelArt.timers.glitch); PanelArt.timers.glitch = null; }
        if (PanelArt.slideTimer)    { window.ClearInterval(PanelArt.slideTimer);     PanelArt.slideTimer    = null; }
        if (PanelArt.slideImage)    { try { PanelArt.slideImage.Dispose(); } catch (e) {} PanelArt.slideImage = null; }
        if (PanelArt.imageImage)    { try { PanelArt.imageImage.Dispose(); } catch (e) {} PanelArt.imageImage = null; }
    }
};

// ====================== ARTWORK DISPATCHER ======================
const ArtDispatcher = {
    _pending:  null,
    _timer:    null,
    _trackTimer: null,
    _unloaded: false,
    _priority: { track: 4, stop: 3, playlist: 1 },

    request(reason, payload) {
        const priority = this._priority[reason] || 0;
        if (this._pending) {
            const cur = this._priority[this._pending.reason] || 0;
            if (priority < cur) return;
        }
        this._pending = { reason, payload };
        if (this._timer)      { window.ClearTimeout(this._timer);      this._timer      = null; }
        if (this._trackTimer) { window.ClearTimeout(this._trackTimer); this._trackTimer = null; }
        this._timer = window.SetTimeout(() => this._dispatch(), 50);
    },

    _dispatch() {
        if (this._unloaded || !this._pending) return;
        const { reason, payload } = this._pending;
        this._pending = null; this._timer = null;
        switch (reason) {
            case 'track':
                if (payload) {
                    // Small extra delay gives foobar2000 time to settle
                    // metadata before we start reading it.
                    this._trackTimer = window.SetTimeout(() => {
                        this._trackTimer = null;
                        if (!this._unloaded) ArtController.onPlaybackNewTrack(payload);
                    }, 60);
                }
                break;
            case 'stop':
                // payload is the integer stop-reason code (0=user, 1=eof, 2=error).
                ArtController.onPlaybackStop(payload);
                break;
            case 'playlist':
                if (fb.IsPlaying) {
                    const nowPlaying = fb.GetNowPlaying();
                    if (nowPlaying) ArtController.onPlaybackNewTrack(nowPlaying);
                }
                break;
        }
    }
};

// ====================== ART QUEUE ======================
const ArtQueue = {
    busy: false, pending: null, _safetyTimer: null,

    enqueue(task) { this.pending = task; this._process(); },

    _process() {
        if (this.busy || !this.pending) return;
        this.busy = true;
        const task = this.pending; this.pending = null;
        let doneInvoked = false;
        // Safety valve: if a task never calls done() the queue would lock
        // permanently.  This timer unblocks it after 10 seconds.
        this._safetyTimer = window.SetTimeout(() => {
            this._safetyTimer = null;
            if (!doneInvoked) { this.busy = false; this._process(); }
        }, 10000);
        const done = () => {
            doneInvoked = true;
            if (this._safetyTimer) { window.ClearTimeout(this._safetyTimer); this._safetyTimer = null; }
            this.busy = false;
            this._process();
        };
        try { task(done); }
        catch (e) {
            if (!doneInvoked) {
                if (this._safetyTimer) { window.ClearTimeout(this._safetyTimer); this._safetyTimer = null; }
                this.busy = false; this._process();
            }
        }
    },

    clear() {
        this.pending = null;
        if (this._safetyTimer) { window.ClearTimeout(this._safetyTimer); this._safetyTimer = null; }
    }
};

// ====================== IMAGE MODE MANAGER ======================
const ImageModeManager = {
    startImageMode() {
        if (PanelArt.slideMode) SlideManager.stopSlideMode();
        const files = FolderImages.list(FolderImages.defaultFolder());
        if (!files.length) return;
        const imagePath = files[Math.floor(Math.random() * files.length)];
        PanelArt.imageMode = true;
        StateManager.get().imageMode = true;
        StateManager.saveDebounced();
        ArtQueue.enqueue(done => {
            if (PanelArt.imageImage) { try { PanelArt.imageImage.Dispose(); } catch (e) {} }
            try { PanelArt.imageImage = gdi.Image(imagePath); } catch (e) { PanelArt.imageImage = null; }
            RepaintHelper.full();
            done();
        });
    },

    stopImageMode() {
        if (PanelArt.timers.imageAnim) { window.ClearInterval(PanelArt.timers.imageAnim); PanelArt.timers.imageAnim = null; }
        PanelArt.imageMode = false;
        StateManager.get().imageMode = false;
        StateManager.saveDebounced();
        if (PanelArt.imageImage) { try { PanelArt.imageImage.Dispose(); } catch (e) {} PanelArt.imageImage = null; }
        RepaintHelper.full();
    },

    toggleImageMode() { PanelArt.imageMode ? this.stopImageMode() : this.startImageMode(); }
};

// ====================== SLIDE MANAGER ======================
const SlideManager = {
    startSlideMode(useSavedIndex) {
        if (PanelArt.imageMode) ImageModeManager.stopImageMode();
        const images = FolderImages.list(FolderImages.defaultFolder());
        if (images.length === 0) return;
        PanelArt.slideMode   = true;
        PanelArt.slideImages = images;

        if (!useSavedIndex) {
            for (let i = images.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [images[i], images[j]] = [images[j], images[i]];
            }
        }

        if (useSavedIndex && PanelArt.slideIndex >= 0 && PanelArt.slideIndex < images.length) {
            // keep current index
        } else {
            PanelArt.slideIndex = Math.floor(Math.random() * images.length);
        }

        StateManager.get().slideMode  = true;
        StateManager.get().slideIndex = PanelArt.slideIndex;
        StateManager.saveDebounced();

        ArtQueue.enqueue(done => {
            if (PanelArt.slideImage) { try { PanelArt.slideImage.Dispose(); } catch (e) {} }
            try { PanelArt.slideImage = gdi.Image(images[PanelArt.slideIndex]); } catch (e) { PanelArt.slideImage = null; }
            RepaintHelper.albumArt();
            done();
        });

        if (PanelArt.slideTimer) window.ClearInterval(PanelArt.slideTimer);
        PanelArt.slideTimer = window.SetInterval(() => {
            let randomIdx;
            do { randomIdx = Math.floor(Math.random() * PanelArt.slideImages.length); }
            while (randomIdx === PanelArt.slideIndex && PanelArt.slideImages.length > 1);
            PanelArt.slideIndex = randomIdx;
            StateManager.get().slideIndex = randomIdx;
            StateManager.saveDebounced();
            const capturedIdx = randomIdx;
            ArtQueue.enqueue(done => {
                if (!PanelArt.slideMode || capturedIdx >= PanelArt.slideImages.length) { done(); return; }
                if (PanelArt.slideImage) { try { PanelArt.slideImage.Dispose(); } catch (e) {} }
                try { PanelArt.slideImage = gdi.Image(PanelArt.slideImages[capturedIdx]); } catch (e) { PanelArt.slideImage = null; }
                RepaintHelper.albumArt();
                done();
            });
        }, 12000);
    },

    stopSlideMode() {
        if (PanelArt.slideTimer) { window.ClearInterval(PanelArt.slideTimer); PanelArt.slideTimer = null; }
        PanelArt.slideMode = false; PanelArt.slideImages = []; PanelArt.slideIndex = 0;
        StateManager.get().slideMode  = false;
        StateManager.get().slideIndex = 0;
        StateManager.saveDebounced();
        if (PanelArt.slideImage) { try { PanelArt.slideImage.Dispose(); } catch (e) {} PanelArt.slideImage = null; }
        RepaintHelper.full();
    },

    toggleSlideMode() { PanelArt.slideMode ? this.stopSlideMode() : this.startSlideMode(); }
};

// ====================== CALLBACKS ======================
function on_paint(gr) {
    if (!isLive() || !PanelArt.dimensions.width || !PanelArt.dimensions.height) return;
    try {
        const w = PanelArt.dimensions.width, h = PanelArt.dimensions.height;
        const cfg = StateManager.get();

        const modeImg = (PanelArt.imageMode && PanelArt.imageImage) ? PanelArt.imageImage
                      : (PanelArt.slideMode  && PanelArt.slideImage) ? PanelArt.slideImage
                      : null;

        if (modeImg) {
            const borderPad = cfg.borderSize || 0, imagePad = borderPad + 3;
            const dx = imagePad, dy = imagePad, dw = w - imagePad * 2, dh = h - imagePad * 2;
            gr.FillSolidRect(0, 0, w, h, PA_MODE_BG);
            if (modeImg.Width > 0 && modeImg.Height > 0) {
                gr.FillSolidRect(dx - 1, dy - 1, dw + 2, dh + 2, PA_BORDER_LIGHT);
                gr.FillSolidRect(dx + 1, dy + 1, dw - 2, dh - 2, PA_BORDER_DARK);
                const si = ArtCache.getScaledImage(modeImg, dw, dh);
                if (si) gr.DrawImage(si, dx, dy, dw, dh, 0, 0, dw, dh);
            }
            if (PanelArt.glitchFrame > 0 && cfg.glitchEnabled)
                GlitchRenderer.paint(gr, w, h, PanelArt.glitchFrame, imagePad, false);
            Renderer.drawBorder(gr);
            Renderer.drawOverlay(gr, w, h, null, null);
            return;
        }

        Renderer.drawBackground(gr);
        const artInfo  = Renderer.drawAlbumArt(gr);
        const textArea = Renderer.getTextArea(artInfo);
        Renderer.drawText(gr, textArea);
        if (PanelArt.glitchFrame > 0 && cfg.glitchEnabled)
            GlitchRenderer.paint(gr, w, h, PanelArt.glitchFrame, cfg.borderSize || 0, true);
        Renderer.drawBorder(gr);
        Renderer.drawOverlay(gr, w, h, artInfo, textArea);
        Renderer.drawSliders(gr);
    } catch (e) {
        console.log("Paint error:", e);
    }
}

function on_size() {
    if (!isLive()) {
        PanelArt.dimensions.width  = window.Width;
        PanelArt.dimensions.height = window.Height;
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
    FontManager.rebuildFonts();
    TextHeightCache.clear();
    RepaintHelper.full();
}

function on_playback_new_track(metadb) {
    if (!isLive()) return;
    ArtDispatcher.request('track', metadb);
}

function on_metadb_changed(metadb_list, fromhook) {
    if (!isLive()) return;
    if (!fb.IsPlaying && !fb.IsPaused) return;
    const nowPlaying = fb.GetNowPlaying();
    if (!nowPlaying) return;
    let affected = false;
    for (let i = 0; i < metadb_list.Count; i++) {
        const item = metadb_list.Item(i);
        if (item && item.Compare && item.Compare(nowPlaying)) { affected = true; break; }
    }
    if (affected) {
        TextManager.update(nowPlaying);
        PanelArt.images.folderPath = '';
        ImageManager.loadAlbumArt(nowPlaying);
    }
}

function on_get_album_art_done(metadb, art_id, image, image_path) {
    if (phase === Phase.SHUTDOWN) {
        if (image && typeof image.Dispose === 'function') { try { image.Dispose(); } catch (e) {} }
        return;
    }
    try {
        // Discard the callback if a newer art load was initiated after this
        // one was dispatched — the tokens will no longer match.
        if (PanelArt.pendingArtToken !== PanelArt.loadToken) {
            if (image && typeof image.Dispose === 'function') { try { image.Dispose(); } catch (e) {} }
            return;
        }
        const expected = PanelArt.images.currentMetadb;
        if (expected && metadb && !metadb.Compare(expected)) {
            if (image && typeof image.Dispose === 'function') { try { image.Dispose(); } catch (e) {} }
            return;
        }
        PanelArt.images.currentMetadb = null;
        if (image) {
            if (PanelArt.images.source && PanelArt.images.source !== image) Utils.disposeImage(PanelArt.images.source);
            PanelArt.images.source = image;
            if (image._srcId === undefined) image._srcId = BlurCache._srcIdCounter++;
            PanelArt.images.currentPath = image_path || '';
            ArtCache.clearScaledCache();
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

function on_playback_stop(reason)          { if (!isLive()) return; ArtDispatcher.request('stop', reason); }
function on_playback_pause(isPaused)       { if (!isLive()) return; RepaintHelper.full(); }
function on_playback_starting(cmd, paused) { if (!isLive()) return; RepaintHelper.full(); }
function on_playlist_switch()              { if (!isLive()) return; ArtDispatcher.request('playlist', null); }
function on_playlist_items_added(idx)      { if (!isLive()) return; ArtDispatcher.request('playlist', null); }
function on_playlist_items_removed(idx)    { if (!isLive()) return; ArtDispatcher.request('playlist', null); }
function on_mouse_wheel(delta)             { if (!isLive()) return; ArtController.onMouseWheel(delta); }
function on_mouse_lbtn_down(x, y)         { if (!isLive()) return; if (window.SetFocus) window.SetFocus(); }
function on_mouse_lbtn_up(x, y)           { if (!isLive()) return; return ArtController.onMouseLbtnUp(); }
function on_mouse_lbtn_dblclk(x, y)       { if (!isLive()) return; if (window.SetFocus) window.SetFocus(); ImageModeManager.toggleImageMode(); }
function on_mouse_rbtn_up(x, y)           { if (!isLive()) return true; const m = MenuManager.createMainMenu(); const id = m.TrackPopupMenu(x, y); if (id > 0) MenuManager.handleSelection(id); return true; }

function on_selection_changed() {
    if (!isLive()) return;
    if (fb.IsPlaying || fb.IsPaused) return;
    const item = fb.GetFocusItem();
    if (item) { TextManager.update(item); ImageManager.loadAlbumArt(item); }
}

function on_script_unload() {
    phase = Phase.SHUTDOWN;
    ArtController.onUnload();
    ArtQueue.clear();
    ArtDispatcher._unloaded = true;
    if (ArtDispatcher._trackTimer) { window.ClearTimeout(ArtDispatcher._trackTimer); ArtDispatcher._trackTimer = null; }
    if (ArtDispatcher._timer)      { window.ClearTimeout(ArtDispatcher._timer);      ArtDispatcher._timer      = null; }
    ArtDispatcher._pending = null;
    if (Renderer._sliderFont) { try { Renderer._sliderFont.Dispose(); } catch (e) {} Renderer._sliderFont = null; }
    if (StateManager._saveTimer) { window.ClearTimeout(StateManager._saveTimer); StateManager._saveTimer = null; StateManager._saveScheduled = false; }
    StateManager.save();
    BlurCache.dispose();
    ImageManager.cleanup();
    OverlayCache.dispose();
    FontManager.clearCache();
    TextHeightCache.clear();
    ArtCache.clearAll();
    // Replicate helpers.js teardown — our on_script_unload supersedes theirs.
    _tt('');
    if (_gr) { try { if (_bmp) _bmp.ReleaseGraphics(_gr); } catch (e) {} }
    _gr = null; _bmp = null;
}

// ====================== INITIALIZATION ======================
window.MinHeight = 75;
window.MinWidth  = 200;
PanelArt.dimensions.width  = window.Width;
PanelArt.dimensions.height = window.Height;
StateManager.load();
CustomFolders.load();
(function init() {
    const cfg = StateManager.get();
    // glitchEnabled and imageFolder are read directly from cfg everywhere;
    // they do not need (or have) a runtime mirror on PanelArt.
    PanelArt.imageMode  = cfg.imageMode;
    PanelArt.slideMode  = cfg.slideMode;
    PanelArt.slideIndex = cfg.slideIndex || 0;
    if (PanelArt.slideMode) SlideManager.startSlideMode(true);
    if (PanelArt.imageMode) ImageModeManager.startImageMode();
    const initTrack = fb.IsPlaying ? fb.GetNowPlaying() : null;
    if (initTrack) ImageManager.loadAlbumArt(initTrack);
    else           TextManager.update(null);
    RepaintHelper.full();
    window.SetTimeout(() => { phase = Phase.LIVE; RepaintHelper.full(); }, 0);
})();
