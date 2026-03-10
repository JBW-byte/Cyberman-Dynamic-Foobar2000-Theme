'use strict';
		      // -============ AUTHOR L.E.D. ===========- \\
		     // -====== SMP 64bit Disc Spin V3.2 ======- \\
		    // -====== Spins Disc + Artwork + Cover ======- \\

    // ===================*** Foobar2000 64bit ***================== \\
   // ======= For Spider Monkey Panel 64bit, author: marc2003 ======= \\
  // ====== Masking All Images, Creates a Disc from Album Art+  ====== \\
 // ======== Sample Code ApplyMask author: T.P Wang / marc2003 ======== \\
// ==-== Inspired by "CD Album Art, @authors "marc2003, Jul23, vnav" =-==\\

window.DrawMode = 0; // 0 = GDI+  1 = D2D
// DrawMode only changes on JSplitter currently; D2D offloads rendering to GPU, GDI+ uses CPU.

window.DefineScript('SMP 64bit Disc Spin V3.2', { author: 'L.E.D.', grab_focus: true });

// ====================== INCLUDES ======================
include(fb.ComponentPath + 'samples\\complete\\js\\lodash.min.js');
include(fb.ComponentPath + 'samples\\complete\\js\\helpers.js');

// Wrap utils.ReplaceIllegalChars for safe filesystem path segments.
function _fbSanitise(str) {
	if (!str) return '';
	return utils.ReplaceIllegalChars(str, true);
}

// ====================== LIFECYCLE PHASE GUARD ======================
// Prevents callbacks from firing before init() completes or after unload begins.
const Phase = { BOOT: 0, LIVE: 2, SHUTDOWN: 3 };
let phase = Phase.BOOT;
function isLive() { return phase === Phase.LIVE; }

// ====================== PERSISTENT PROPERTIES ======================
// Each _p wraps a window property. Boolean default → .enabled ; any other type → .value
const props = {
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

	showReflection:         new _p('Disc.ShowReflection', true),
	opReflection:           new _p('Disc.OpReflection', 30),
	showGlow:               new _p('Disc.ShowGlow', false),
	opGlow:                 new _p('Disc.OpGlow', 40),
	showScanlines:          new _p('Disc.ShowScanlines', false),
	opScanlines:            new _p('Disc.OpScanlines', 128),
	showPhosphor:           new _p('Disc.ShowPhosphor', true),
	opPhosphor:             new _p('Disc.OpPhosphor', 20),
	phosphorTheme:          new _p('Disc.PhosphorTheme', 8),
	customPhosphorColor:    new _p('Disc.CustomPhosphorColor', 0xFFFFFFFF),
	overlayAllOff:          new _p('Disc.OverlayAllOff', false),
	savedOverlay:           new _p('Disc.SavedOverlay', ''),

	borderSize:             new _p('Disc.BorderSize', 5),
	borderColor:            new _p('Disc.BorderColor', 0xFF202020),
	padding:                new _p('Disc.Padding', 10),

	backgroundEnabled:      new _p('Disc.BackgroundEnabled', true),
	blurRadius:             new _p('Disc.BlurRadius', 240),
	blurEnabled:            new _p('Disc.BlurEnabled', true),
	darkenValue:            new _p('Disc.DarkenValue', 10),
	customBackgroundColor:  new _p('Disc.CustomBackgroundColor', 0xFF191919),
	bgUseUIColor:           new _p('Disc.BgUseUIColor', false)
};

// Reads the host UI's accent colour; falls back gracefully between DUI and CUI hosts.
function _getUIColour() {
	try {
		return window.InstanceType === 1
			? window.GetColourDUI(1)
			: window.GetColourCUI(3);
	} catch (e) {
		return window.GetColourDUI(1);
	}
}

// Invalidate the background layer when the host theme colour changes.
function on_colours_changed() {
	if (!isLive()) return;
	State.paintCache.bgColor = _getUIColour();
	StaticBgLayer.invalidate();
	window.Repaint();
}

// Release the cached slider font so it is recreated at the new DPI / style.
function on_font_changed() {
	if (!isLive()) return;
	if (SliderRenderer._font) {
		try { SliderRenderer._font.Dispose(); } catch (e) {}
		SliderRenderer._font = null;
	}
	window.Repaint();
}

// ====================== IMMUTABLE CONFIGURATION ======================
const CONFIG = Object.freeze({
	TIMER_INTERVAL:      42,    // ~24fps spin timer (ms)
	MAX_STATIC_SIZE:     3000,  // Max pixel dimension for non-disc (cover art) images
	MAX_MASK_CACHE:      10,
	MAX_RIM_CACHE:       10,
	MAX_FILE_CACHE:      200,   // Max entries in the file-existence cache
	MAX_SUBFOLDER_CACHE: 50,
	MAX_BG_CACHE:        4,     // LRU slots for blurred background bitmaps

	MIN_DISC_SIZE:       125,
	MAX_DISC_SIZE:       1000,
	MIN_SPIN_SPEED:      0.5,
	MAX_SPIN_SPEED:      5,

	// GDI+ smoothing modes: 0=Invalid 1=Default 2=HighSpeed 3=HighQuality 4=None 5=AntiAlias
	SMOOTHING_MODE:      4,
	DISC_SCALE_FACTOR:   1.00,  // Multiplier applied to the computed disc size (1.0 = fill available area)
	ANGLE_MODULO:        360,   // Wrap angle at 360° to avoid float growth
	LOAD_DEBOUNCE_MS:    33,    // Delay before triggering a full image search after a track change
	MAX_SUBFOLDER_DEPTH: 3,
	MAX_CUSTOM_FOLDERS:  5,

	PATHS: {
		DEFAULT_DISC: fb.ProfilePath + "skins\\default_disc.png",
		RIM:          fb.ProfilePath + "skins\\center_album_rim.png",
		SKINS_DIR:    fb.ProfilePath + "skins\\"
	},

	// Each entry maps to a mask PNG file inside SKINS_DIR (null = no mask applied).
	MASK_TYPES: [
		{ name: "CD Mask",    file: "mask.png",      id: 0 },
		{ name: "Vinyl Mask", file: "vinyl_mask.png", id: 1 },
		{ name: "No Mask",    file: null,             id: 2 }
	],

	// Filename fragments that indicate a file is a physical disc scan rather than cover art.
	DISC_PATTERNS: ["disc", "cd", "media", "vinyl"],

	// Filename fragments used when searching for standard album cover art.
	COVER_PATTERNS: [
		"cover", "front", "folder", "albumart", "album", "artwork", "art", "front cover"
	],

	EXTENSIONS: [".png", ".jpg", ".jpeg", ".webp", ".bmp"],

	// Known Last.fm JSON sidecar filenames that may reference cover art.
	JSON_ART_FILES: [
		"lastfm_artist_getSimilar.json",
		"lastfm_album_getInfo.json",
		"lastfm_track_getInfo.json",
		"lastfm.json"
	],

	OVERLAY: {
		REFLECTION_HEIGHT_RATIO: 0.45,  // Reflection covers the top 45% of the panel
		SCANLINE_SPACING:        3,     // Pixels between scanline stripes
		GLOW_ART_STEPS:          30,    // Radial gradient step count for the glow effect
		GLOW_ART_MULT:           0.05   // Per-step alpha multiplier for glow fall-off
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
		REAL_DISC:    0,  // Genuine disc scan found in the track folder
		ALBUM_ART:    1,  // Standard cover art, rendered as a disc via mask
		DEFAULT_DISC: 2   // Fallback placeholder disc from the skins folder
	}
});

// Clamp any persisted numeric props that may have drifted outside the valid range.
(function clampPersistedProps() {
	const s  = props.spinSpeed.value;
	const cs = Math.max(CONFIG.MIN_SPIN_SPEED, Math.min(CONFIG.MAX_SPIN_SPEED, s));
	if (cs !== s) props.spinSpeed.value = cs;

	const sz  = props.maxImageSize.value;
	const csz = Math.max(CONFIG.MIN_DISC_SIZE, Math.min(CONFIG.MAX_DISC_SIZE, sz));
	if (csz !== sz) props.maxImageSize.value = csz;
})();

// ====================== SLIDER UI CONSTANTS ======================
const SLIDER_MIN_WIDTH   = 220;   // Absolute minimum slider bar width in pixels
const SLIDER_WIDTH_RATIO = 0.6;   // Slider bar occupies 60% of the panel width
const SLIDER_HEIGHT      = 6;
const SLIDER_STEP        = 5;     // Opacity units changed per mouse wheel notch

// The phosphor "Custom" entry sits one past the last named theme in the array.
const DISC_CUSTOM_THEME_INDEX = CONFIG.PHOSPHOR_THEMES.length;

let readyTimer = null; // Holds the boot-time timeout handle while waiting for a valid panel size.

// ====================== IMAGE UID TAGGING ======================
let _imgUIDCounter = 0;

/**
 * Stamps a unique integer ID onto a GDI image object in-place.
 * Called by ImageProcessor after every new bitmap is produced.
 * @param {object} img - GDI image to tag (modified in place).
 * @returns {object} The same image, now carrying a ._uid property.
 */
function _tagImg(img) {
	if (img && img._uid === undefined) {
		img._uid = ++_imgUIDCounter;
	}
	return img;
}

// ====================== REPAINT HELPERS ======================
// Centralise repaint calls so callers do not need to know exact disc coordinates.
const RepaintHelper = {
	full() { window.Repaint(); },

	// Dirty-rect repaint for the spinning disc area only — avoids full-panel redraws during spin.
	region(x, y, w, h) {
		if (w > 0 && h > 0) window.RepaintRect(x, y, w, h);
		else window.Repaint();
	},

	disc() {
		const pc = State.paintCache;
		if (pc.valid && pc.discSize > 0) {
			// Add a small margin so the disc edge is never clipped during rotation.
			this.region(pc.discX - 10, pc.discY - 10, pc.discSize + 20, pc.discSize + 20);
			return;
		}
		// Fallback: estimate position when the cache is not yet populated.
		const pad    = P.padding;
		const border = P.borderSize;
		const w      = window.Width;
		const h      = window.Height;
		const size   = Math.min(w, h) - (pad + border) * 2;
		const x      = Math.floor((w - size) / 2);
		const y      = Math.floor((h - size) / 2);
		this.region(x - 10, y - 10, size + 20, size + 20);
	},

	background() { this.full(); }
};

// ====================== PROPERTY SHORTCUT ACCESSORS ======================
// Reads the current value of every _p property through a single 'P' namespace
// so paint/timer code stays concise without caching stale values.
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

// ====================== GENERAL UTILITIES ======================
const Utils = {
	// Safe wrapper around Dispose() — silently ignores objects that lack the method.
	safeDispose(obj) {
		if (obj && typeof obj.Dispose === 'function') {
			try { obj.Dispose(); } catch (e) {}
		}
	},

	// Check whether a path exists on-disk (delegates to the SMP utils object).
	exists(p)  { return utils.FileTest(p, "e"); },
	lower(s)   { return s ? s.toLowerCase() : ""; },

	// Strip characters that are unsafe in metadata comparisons but keep common punctuation.
	cleanMeta(s) {
		return (s || "").replace(/[^\w\s\-&'+]/g, " ").replace(/\s+/g, " ").trim();
	},

	// Determine whether a file path belongs to a real disc scan, album art, or the default disc.
	getImageType(path) {
		if (!path) return null;
		if (path === CONFIG.PATHS.DEFAULT_DISC) return CONFIG.IMAGE_TYPE.DEFAULT_DISC;

		const lp = path.toLowerCase();
		for (const pattern of CONFIG.DISC_PATTERNS) {
			if (new RegExp(`(^|[\\\\/._-])(${pattern})([\\\\/._-]|$)`).test(lp)) {
				return CONFIG.IMAGE_TYPE.REAL_DISC;
			}
		}
		return CONFIG.IMAGE_TYPE.ALBUM_ART;
	},

	// Heuristically detect the best mask type from a file path (vinyl vs CD vs unknown).
	detectMaskFromPath(path) {
		if (!path) return null;
		const lp = path.toLowerCase();
		if (lp.includes("vinyl")) return 1;
		if (/(^|[\\/._-])(disc|cd)([\\/._-]|$)/.test(lp)) return 0;
		return null; // No strong signal — leave the current mask unchanged.
	},

	// Compute the disc render size capped by the user-chosen maxImageSize property.
	getPanelDiscSize() {
		const w = window.Width;
		const h = window.Height;
		if (w <= 0 || h <= 0) return props.maxImageSize.value;
		const layout = calcDiscLayout(w, h);
		return layout.size > props.maxImageSize.value ? props.maxImageSize.value : layout.size;
	}
};

// Compute the square disc area and its centred position for a given panel size.
function calcDiscLayout(w, h) {
	const inset  = P.padding + P.borderSize;
	const availW = w - inset * 2;
	const availH = h - inset * 2;
	const size   = Math.max(0, Math.floor(Math.min(availW, availH) * CONFIG.DISC_SCALE_FACTOR));
	return { size, x: (w - size) / 2, y: (h - size) / 2 };
}

// ====================== COLOUR MATH HELPERS ======================
const MathX = {
	// Replace the alpha channel of a packed ARGB colour without touching RGB.
	setAlpha(col, a) { return ((col & 0x00FFFFFF) | (a << 24)) >>> 0; }
	// NOTE: deg() removed — it was defined but never called anywhere in the script.
};

// Opaque black and white constants used by all overlay / background drawing routines.
const DS_BLACK = MathX.setAlpha(_RGB(0, 0, 0),     255);
const DS_WHITE = MathX.setAlpha(_RGB(255, 255, 255), 255);

// ====================== LRU CACHE ======================
// Evicts the least-recently-used entry once capacity is exceeded.
// autoDispose=true calls Dispose() on evicted GDI image objects.
const LRUCache = (maxSize, autoDispose = true) => {
	const cache   = new Map();
	const dispose = v => { if (autoDispose) Utils.safeDispose(v); };
	return {
		get(key) {
			const value = cache.get(key);
			if (value === undefined) return null;
			// Re-insert at the end to mark as most-recently-used.
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
				// Evict the oldest (first) entry.
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

// ====================== FILE SYSTEM MANAGER ======================
// Caches file-existence results and subfolder enumerations to avoid redundant I/O.
const _fso = (function() {
	try { return new ActiveXObject('Scripting.FileSystemObject'); } catch (e) { return null; }
})();

const FileManager = {
	cache:          new Map(), // file-path → boolean (exists?)
	subfolderCache: new Map(), // folder-path → string[] (subfolders)

	// Cached wrapper around _isFile(); evicts the oldest entry once the cache is full.
	exists(path) {
		if (!path) return false;
		if (this.cache.has(path)) return this.cache.get(path);
		const exists = _isFile(path);
		this.cache.set(path, exists);
		if (this.cache.size > CONFIG.MAX_FILE_CACHE) {
			this.cache.delete(this.cache.keys().next().value);
		}
		return exists;
	},

	isDirectory(path) { return path ? _isFolder(path) : false; },

	// Strip articles, brackets, and punctuation for fuzzy folder-name matching.
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

	// Produce variations of a metadata string (lower-case, hyphenated, no-article, etc.)
	// for robust fuzzy file searching across different naming conventions.
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

	// Enumerate immediate subfolders of a directory via FSO; results are cached.
	getSubfolders(folder) {
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
		if (this.subfolderCache.size >= CONFIG.MAX_SUBFOLDER_CACHE) {
			this.subfolderCache.delete(this.subfolderCache.keys().next().value);
		}
		return subfolders;
	},

	// Build a candidate path list by combining all patterns × all extensions.
	// If useVariations=true, each metadataName also spawns its fuzzy variants.
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
		_.forEach(allPatterns, pattern => {
			_.forEach(CONFIG.EXTENSIONS, ext => paths.push(folder + "\\" + pattern + ext));
		});
		return paths;
	},

	// Return the first path in the list that actually exists on disk, or null.
	findImageInPaths(paths) {
		return _.find(paths, p => this.exists(p)) || null;
	},

	// Return true if the last segment of folderPath fuzzy-matches any name in searchNames.
	matchesFolderName(folderPath, searchNames) {
		if (!folderPath || _.isEmpty(searchNames)) return false;
		const folderName = _.toLower(this.sanitizeMetadata(_.last(folderPath.split('\\'))));
		return _.some(searchNames, name => {
			if (!name) return false;
			const n = _.toLower(this.sanitizeMetadata(name));
			if (folderName === n || folderName.includes(n) || n.includes(folderName)) return true;
			// Single-character initial match (e.g. folder "A" matching artist "Adele").
			if (folderName.length === 1 && n.length > 0 && n.charAt(0) === folderName) return true;
			if (n.length === 1 && folderName.length > 0 && folderName.charAt(0) === n) return true;
			return false;
		});
	},

	// Attempt to extract a cover-art path from a known Last.fm JSON sidecar file.
	parseLastFmJson(jsonPath, baseFolder) {
		try {
			if (!_isFile(jsonPath)) return null;
			const content = utils.ReadUTF8(jsonPath);
			if (!content) return null;
			const data = JSON.parse(content);
			if (!data || !_.isObject(data)) return null;
			const fname = _.toLower(jsonPath.split('\\').pop());
			// Confirm this is actually a Last.fm artefact before using it.
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

	// Check every known Last.fm JSON filename in a folder for an embedded art reference.
	searchLastFmJson(folder) {
		for (const jsonFile of CONFIG.JSON_ART_FILES) {
			const result = this.parseLastFmJson(folder + '\\' + jsonFile, folder);
			if (result) return result;
		}
		return null;
	},

	// Flush all cached file-existence and subfolder data (call after cache-clear menu action).
	clear() {
		this.cache.clear();
		this.subfolderCache.clear();
	}
};

// Title-case helper used when building folder name search variations.
function _toTitleCase(str) {
	return str.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());
}

// ====================== CUSTOM FOLDERS MANAGER ======================
// Stores user-defined artwork search root folders, persisted as JSON in a window property.
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

	// Returns false if the path is not a valid directory or is already registered.
	add(folder) {
		if (!folder || !FileManager.isDirectory(folder)) return false;
		if (this.folders.indexOf(folder) !== -1) return false;
		if (this.folders.length >= CONFIG.MAX_CUSTOM_FOLDERS) this.folders.shift(); // evict oldest
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

// ====================== ASSET MANAGER ======================
// Manages the mask and rim overlay bitmaps, including loading, caching, and resizing.
const AssetManager = {
	maskSource:       null,  // Full-resolution mask image loaded from disk
	rimSource:        null,  // Full-resolution centre-hole rim overlay
	maskCache:        LRUCache(CONFIG.MAX_MASK_CACHE), // mask size → resized GDI image
	rimCache:         LRUCache(CONFIG.MAX_RIM_CACHE),  // rim  size → resized GDI image
	currentMaskType:  0,
	userOverrideMask: false, // True when the user explicitly chose a mask via the menu

	init() {
		this.currentMaskType  = props.maskType.value;
		this.userOverrideMask = props.userOverrideMask.enabled;
		this.loadMask();
		this.loadRim();
	},

	// Reload the mask source bitmap for the current mask type; clears the resized cache.
	loadMask() {
		Utils.safeDispose(this.maskSource);
		this.maskSource = null;
		this.maskCache.clear();
		const maskType = CONFIG.MASK_TYPES[this.currentMaskType];
		if (!maskType || !maskType.file) return; // Mask type "No Mask" — nothing to load
		const maskPath = CONFIG.PATHS.SKINS_DIR + maskType.file;
		try {
			if (FileManager.exists(maskPath)) this.maskSource = gdi.Image(maskPath);
		} catch (e) {}
	},

	loadRim() {
		try {
			if (FileManager.exists(CONFIG.PATHS.RIM)) this.rimSource = gdi.Image(CONFIG.PATHS.RIM);
		} catch (e) {}
	},

	// Switch the active mask type, optionally flagging it as a user override so
	// auto-detection won't clobber the choice on the next track change.
	setMaskType(index, isUserOverride = true, forceReload = false) {
		if (index === this.currentMaskType && !forceReload) return false;
		this.currentMaskType           = index;
		this.userOverrideMask          = isUserOverride;
		props.maskType.value           = index;
		props.userOverrideMask.enabled = isUserOverride;
		this.loadMask();
		// Invalidate everything that depends on the mask shape.
		ImageLoader.clearCache();
		this.maskCache.clear();
		this.rimCache.clear();
		DiscComposite.dispose();
		RotationCache.clear();
		State.lastFrame         = -1;
		State.paintCache.valid  = false;
		Utils.safeDispose(State.img);
		State.img       = null;
		State.imageType = CONFIG.IMAGE_TYPE.REAL_DISC;
		if (State.currentMetadb) ImageLoader.loadForMetadb(State.currentMetadb, true);
		window.Repaint();
		return true;
	},

	// Auto-select the best mask based on the image path — only runs when the user has
	// not manually overridden the mask type.
	autoSelectMask(imagePath) {
		if (this.userOverrideMask) return false;
		const detected = Utils.detectMaskFromPath(imagePath);
		if (detected !== null && detected !== this.currentMaskType) {
			return this.setMaskType(detected, false);
		}
		return false;
	},

	hasMask() { return this.maskSource !== null; },

	// The centre-hole rim is only composited for album-art-on-CD-mask combinations.
	shouldShowRim(imageType) {
		return imageType === CONFIG.IMAGE_TYPE.ALBUM_ART &&
		       this.currentMaskType === 0 &&
		       this.hasMask();
	},

	// Return (and cache) the mask bitmap resized to targetSize × targetSize.
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

	// Return (and cache) the rim overlay bitmap resized to targetSize × targetSize.
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

// ====================== IMAGE PROCESSOR ======================
// All image scaling, cropping, and mask application goes through here.
// Every bitmap produced by these methods is tagged with a unique _uid by _tagImg().
const ImageProcessor = {
	// Scale raw to a square of targetSize, cropping to maintain "fill" aspect ratio.
	// For album art destined for a CD mask the canvas is pre-filled black.
	scaleToSquare(raw, targetSize, interpolationMode, imageType) {
		if (!raw) return null;
		const w = raw.Width;
		const h = raw.Height;

		if (w === targetSize && h === targetSize) {
			try {
				const cloned = raw.Clone(0, 0, w, h);
				Utils.safeDispose(raw);
				return _tagImg(cloned);
			} catch (e) { return _tagImg(raw); }
		}

		try {
			const newImg = gdi.CreateImage(targetSize, targetSize);
			let g = null;
			let released = false;
			try {
				g = newImg.GetGraphics();
				g.SetInterpolationMode(interpolationMode);
				// Fill with black so transparent PNG edges don't bleed through the mask.
				if (AssetManager.hasMask() && imageType === CONFIG.IMAGE_TYPE.ALBUM_ART) {
					g.FillSolidRect(0, 0, targetSize, targetSize, 0xFF000000);
				}
				// Scale uniformly to cover the square, centring any overflow.
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
			return null;
		}
	},

	// Scale raw proportionally so its longest dimension does not exceed maxSize.
	// Used for static (non-disc) cover art displayed without a circular mask.
	scaleProportional(raw, maxSize, interpolationMode) {
		if (!raw) return null;
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

		try {
			const scale  = maxSize / maxDim;
			const nw     = Math.floor(w * scale);
			const nh     = Math.floor(h * scale);
			const newImg = gdi.CreateImage(nw, nh);
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
			return null;
		}
	},

	// Punch the circular mask into the image using GDI+ ApplyMask().
	// The original image is disposed; a masked clone is returned.
	applyMask(image, size) {
		if (!image) return null;
		try {
			const clone = image.Clone(0, 0, image.Width, image.Height);
			const mask  = AssetManager.getMask(size);
			if (mask) clone.ApplyMask(mask);
			Utils.safeDispose(image);
			return _tagImg(clone);
		} catch (e) { return _tagImg(image); }
	},

	// Full pipeline for disc images: scale to square then apply the active mask.
	processForDisc(raw, targetSize, imageType, interpolationMode) {
		if (!raw) return null;
		let processed = this.scaleToSquare(raw, targetSize, interpolationMode, imageType);
		if (!processed) {
			Utils.safeDispose(raw);
			return null;
		}
		// Apply the circular mask for both real disc scans and album-art-as-disc.
		const shouldMask = AssetManager.hasMask() &&
			(imageType === CONFIG.IMAGE_TYPE.REAL_DISC || imageType === CONFIG.IMAGE_TYPE.ALBUM_ART);
		if (shouldMask) processed = this.applyMask(processed, targetSize);
		return processed; // _uid was tagged inside scaleToSquare / applyMask
	}
};

// ====================== STATE MANAGER ======================
// Central mutable state object; all image transitions flow through setImage().
const State = {
	img:           null,  // The processed (masked, scaled) disc or cover bitmap currently shown
	bgImg:         null,  // Unprocessed original used as background blur source
	_bgIdCounter:  0,
	angle:         0,     // Current rotation angle in degrees
	lastFrame:     -1,    // Last rotation frame index; prevents redundant repaints
	isDiscImage:   false, // True when img should be rendered as a spinning disc
	imageType:     CONFIG.IMAGE_TYPE.REAL_DISC,
	currentMetadb: null,
	loadToken:     0,     // Monotonic counter; stale async callbacks check against this
	pendingArtToken: 0,
	spinTimer:     null,
	loadTimer:     null,

	// Paint-layout cache: recalculated only when the panel size or image changes.
	paintCache: {
		bgColor:        _getUIColour(),
		windowWidth:    0,
		windowHeight:   0,
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

	// Replace the displayed image, rebuild composite/rotation caches, and trigger a repaint.
	// is always rebuilt for the new image — previously, two different songs with identical
	// disc size and mask type shared a cache key and the second song's art was never shown.
	setImage(newImg, discState, imgType, originalImg) {
		const oldImg   = this.img;
		const oldBgImg = this.bgImg;

		this.img         = newImg;
		this.bgImg       = originalImg;
		// Stamp a background-image ID so the blur cache can detect source changes.
		if (this.bgImg && this.bgImg._bgId === undefined) {
			this.bgImg._bgId = ++State._bgIdCounter;
		}
		this.isDiscImage        = discState;
		this.imageType          = imgType;
		this.paintCache.valid   = false;
		BackgroundCache.invalidate();
		StaticBgLayer.invalidate();
		OverlayCache.invalidate();

		// Dispose old bitmaps only when they are not still needed by other references.
		if (oldImg && oldImg !== newImg && oldImg !== originalImg) {
			Utils.safeDispose(oldImg);
		}
		if (oldBgImg &&
		    oldBgImg !== oldImg &&
		    oldBgImg !== newImg &&
		    oldBgImg !== originalImg) {
			Utils.safeDispose(oldBgImg);
		}

		if (discState && newImg) {
			const size = Utils.getPanelDiscSize();

			DiscComposite.dispose();
			DiscComposite.build(newImg, size, imgType);

			RotationCache.build(DiscComposite.img || newImg);
		} else {
			DiscComposite.dispose(); // Clears RotationCache via its own dispose chain.
		}

		RepaintHelper.full();
	},

	// Recompute layout coordinates only when the panel size or image dimensions change.
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
				// Disc is always square and centred.
				const layout = calcDiscLayout(w, h);
				pc.discSize  = layout.size;
				pc.discX     = Math.floor((w - pc.discSize) / 2);
				pc.discY     = Math.floor((h - pc.discSize) / 2);
			} else {
				// Static cover art: optionally letterboxed to preserve aspect ratio.
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
			pc.imgWidth  = 0;
			pc.imgHeight = 0;
			pc.discSize  = 0;
			pc.staticW   = 0;
			pc.staticH   = 0;
		}
	},

	// Release all held bitmaps and cancel pending timers.
	cleanup() {
		this.stopTimer();
		if (this.loadTimer) {
			window.ClearTimeout(this.loadTimer);
			this.loadTimer = null;
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

	// Start or stop the spin interval timer depending on current playback and settings.
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
				const frame = Math.floor(this.angle / RotationCache.step);
				if (frame !== State.lastFrame) {
					State.lastFrame = frame;
					RepaintHelper.disc(); // Dirty-rect only — do not redraw the whole panel
				}
			}, CONFIG.TIMER_INTERVAL);
		} else if (!shouldRun && this.spinTimer) {
			this.stopTimer();
		}
	}
};

// ====================== IMAGE LOADER ======================
// Orchestrates all image searches (disc, cover, async album art) and
// wires results into State.setImage().
const ImageLoader = {
	_pathCache: new Map(), // disc:/cover: + folder → cached image path string (or null)
	tf_path:    fb.TitleFormat("$directory_path(%path%)"),
	tf_folder:  fb.TitleFormat("$directory(%path%)"),
	tf_artist:  fb.TitleFormat("%artist%"),
	tf_album:   fb.TitleFormat("%album%"),
	tf_title:   fb.TitleFormat("%title%"),

	clearCache() { this._pathCache.clear(); },

	// Extract all useful metadata strings from a metadb handle.
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

	// Search a single folder for an image matching any of the given patterns or
	// derived metadata name variants.
	searchInFolder(folder, patterns, metadata, useVariations = false) {
		const artistTitle      = (metadata.artist && metadata.title)
			? metadata.artist + ' - ' + metadata.title : '';
		const albumTitle       = (metadata.album && metadata.title)
			? metadata.album + ' - ' + metadata.title : '';
		const artistAlbumTitle = (metadata.artist && metadata.album && metadata.title)
			? metadata.artist + ' ' + metadata.album + ' ' + metadata.title : '';
		const metadataNames = _.compact([
			metadata.album, metadata.title, metadata.artist,
			metadata.folder, metadata.artistTitle, metadata.artistAlbum,
			artistTitle, albumTitle, artistAlbumTitle
		]);
		const paths = FileManager.buildSearchPaths(folder, patterns, metadataNames, useVariations);
		return FileManager.findImageInPaths(paths);
	},

	// Search a single folder without metadata context — pattern-only filename matching.
	searchInFolderAnyFile(folder, patterns) {
		const paths = FileManager.buildSearchPaths(folder, patterns, []);
		return FileManager.findImageInPaths(paths);
	},

	// Recursively search a folder tree up to maxLevels deep.
	_searchFolderTree(folder, patterns, maxLevels, isDiscSearch, metadata) {
		if (maxLevels <= 0 || !folder) return null;
		const found = this.searchFolderForImage(folder, patterns, isDiscSearch, metadata);
		if (found) return found;
		const subfolders = FileManager.getSubfolders(folder);
		for (const sub of subfolders) {
			const result = this._searchFolderTree(sub, patterns, maxLevels - 1, isDiscSearch, metadata);
			if (result) return result;
		}
		return null;
	},

	// Walk every user-configured custom root folder, matching by filename pattern then
	// by subfolder name (two levels deep), returning the first hit found.
	searchCustomFolders(metadata, patterns, isDiscSearch) {
		const artistAlbumDash  = metadata.artistAlbum || '';
		const artistAlbumSpace = (metadata.artist && metadata.album)
			? metadata.artist + ' ' + metadata.album : '';

		const simpleNames = _.compact([
			metadata.title, metadata.artist, metadata.album,
			artistAlbumDash, artistAlbumSpace
		]);

		// Build every name variation we will compare against subfolder names.
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

		// Pass 1: search directly inside each custom root folder by filename.
		for (const customFolder of customFolders) {
			if (!FileManager.isDirectory(customFolder)) continue;
			const nameMatched = this.searchInFolder(customFolder, patterns, metadata, true);
			if (nameMatched) {
				return isDiscSearch ? this._loadDiscResult(nameMatched) : nameMatched;
			}
		}

		// Pass 2: walk one and two levels of subfolders, matching folder names to metadata.
		for (const customFolder of customFolders) {
			if (!FileManager.isDirectory(customFolder)) continue;
			const level1 = FileManager.getSubfolders(customFolder);
			for (const sub1 of level1) {
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
					// Look one level deeper inside a matched folder.
					const sub1Folders = FileManager.getSubfolders(sub1);
					for (const subSub of sub1Folders) {
						const sImg = this.searchInFolder(subSub, patterns, metadata, true)
						          || this.searchInFolderAnyFile(subSub, patterns);
						if (sImg) return isDiscSearch ? this._loadDiscResult(sImg) : sImg;
					}
					continue;
				}
				// No name match at level1 — try level2 subfolders.
				const level2 = FileManager.getSubfolders(sub1);
				for (const sub2 of level2) {
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
					}
				}
			}
		}
		return null;
	},

	// Load a disc-result object { img, path, type, original } from a known file path.
	// Returns null on any failure so callers can fall through to the next source.
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

	// Search a folder for the best image matching either disc patterns or cover patterns.
	searchFolderForImage(folder, patterns, isDiscSearch, metadata) {
		// Prefer any Last.fm JSON sidecar art over filename matching.
		const jsonArt = FileManager.searchLastFmJson(folder);
		if (jsonArt) return isDiscSearch ? this._loadDiscResult(jsonArt) : jsonArt;

		const meta  = metadata || { artist: '', album: '', title: '', folder: '', artistTitle: '', artistAlbum: '' };
		const found = this.searchInFolder(folder, patterns, meta, true)
		           || this.searchInFolderAnyFile(folder, patterns);
		if (!found) return null;
		return isDiscSearch ? this._loadDiscResult(found) : found;
	},

	// Search for a disc-scan image with progressive fallback:
	// 1. Track folder (by metadata name), 2. Track folder (any disc filename),
	// 3. Subfolder tree, 4. User-defined custom folders.
	searchForDisc(metadb, baseFolder) {
		const cacheKey = 'disc:' + baseFolder;
		if (this._pathCache.has(cacheKey)) {
			const cached = this._pathCache.get(cacheKey);
			if (!cached) return null;
			const result = this._loadDiscResult(cached.path);
			if (!result) this._pathCache.delete(cacheKey); // stale entry
			return result;
		}

		const metadata = metadb
			? this.getMetadataNames(metadb)
			: { artist: '', album: '', title: '', folder: '', artistTitle: '', artistAlbum: '' };

		// --- Step 1: Match by metadata name in the track's own folder ---
		const trackMatch = this.searchInFolder(baseFolder, CONFIG.DISC_PATTERNS, metadata);
		if (trackMatch) {
			const result = this._loadDiscResult(trackMatch);
			if (result) {
				AssetManager.autoSelectMask(trackMatch);
				this._pathCache.set(cacheKey, { path: trackMatch, type: CONFIG.IMAGE_TYPE.REAL_DISC });
				return result;
			}
		}

		// --- Step 2: Any disc-pattern filename in the track's own folder ---
		const trackAnyMatch = this.searchInFolderAnyFile(baseFolder, CONFIG.DISC_PATTERNS);
		if (trackAnyMatch) {
			const result = this._loadDiscResult(trackAnyMatch);
			if (result) {
				AssetManager.autoSelectMask(trackAnyMatch);
				this._pathCache.set(cacheKey, { path: trackAnyMatch, type: CONFIG.IMAGE_TYPE.REAL_DISC });
				return result;
			}
		}

		// --- Step 3: Recurse two subfolder levels ---
		const trackSubMatch = this._searchFolderTree(baseFolder, CONFIG.DISC_PATTERNS, 2, true, metadata);
		if (trackSubMatch) {
			this._pathCache.set(cacheKey, { path: trackSubMatch.path, type: trackSubMatch.type });
			return trackSubMatch;
		}

		// --- Step 4: User-configured custom artwork folders ---
		const customResult = this.searchCustomFolders(metadata, CONFIG.DISC_PATTERNS, true);
		if (customResult) {
			this._pathCache.set(cacheKey, { path: customResult.path, type: customResult.type });
			return customResult;
		}

		this._pathCache.set(cacheKey, null); // Cache the miss to avoid repeated searches
		return null;
	},

	// Search for a cover-art image path (string, not a loaded bitmap) with progressive fallback.
	searchForCover(metadb, baseFolder) {
		const cacheKey = 'cover:' + baseFolder;
		if (this._pathCache.has(cacheKey)) {
			const cached = this._pathCache.get(cacheKey);
			if (cached && !FileManager.exists(cached)) {
				this._pathCache.delete(cacheKey); // File was deleted since we cached it
			} else {
				return cached;
			}
		}

		const metadata = metadb
			? this.getMetadataNames(metadb)
			: { artist: '', album: '', title: '', folder: '', artistTitle: '', artistAlbum: '' };

		const jsonArt = FileManager.searchLastFmJson(baseFolder);
		if (jsonArt)        { this._pathCache.set(cacheKey, jsonArt);        return jsonArt; }

		const trackMatch = this.searchInFolder(baseFolder, CONFIG.COVER_PATTERNS, metadata);
		if (trackMatch)     { this._pathCache.set(cacheKey, trackMatch);     return trackMatch; }

		const trackAnyMatch = this.searchInFolderAnyFile(baseFolder, CONFIG.COVER_PATTERNS);
		if (trackAnyMatch)  { this._pathCache.set(cacheKey, trackAnyMatch);  return trackAnyMatch; }

		const trackSubMatch = this._searchFolderTree(baseFolder, CONFIG.COVER_PATTERNS, 2, false, metadata);
		if (trackSubMatch)  { this._pathCache.set(cacheKey, trackSubMatch);  return trackSubMatch; }

		const customResult = this.searchCustomFolders(metadata, CONFIG.COVER_PATTERNS, false);
		if (customResult)   { this._pathCache.set(cacheKey, customResult);   return customResult; }

		this._pathCache.set(cacheKey, null);
		return null;
	},

	// Main entry point: load the best image for a metadb handle.
	// If immediate=false the work is debounced to avoid thrashing during rapid track skipping.
	loadForMetadb(metadb, immediate = false) {
		if (!metadb) return;
		const folderPath = this.tf_path.EvalWithMetadb(metadb);

		// Skip reload if the track is in the same folder and an image is already shown.
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
			State.loadToken++;

			// Pre-load a cover image as the background blur source even when a disc image will be shown.
			let bgOriginal = null;
			let coverRaw   = null;
			const coverPath = this.searchForCover(metadb, folderPath);
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

			// --- Priority 1: Real disc scan ---
			if (!P.useAlbumArtOnly) {
				const result = this.searchForDisc(metadb, folderPath);
				if (result) {
					Utils.safeDispose(coverRaw);
					const bgSrc = bgOriginal || result.original;
					if (bgOriginal) Utils.safeDispose(result.original);
					State.setImage(result.img, true, result.type, bgSrc);
					props.savedPath.value    = result.path;
					props.savedIsDisc.enabled = true;
					State.updateTimer();
					// If no cover was found for the background, fall back to async album art.
					if (!bgSrc) {
						State.pendingArtToken = State.loadToken;
						utils.GetAlbumArtAsync(window.ID, metadb, 0);
					}
					return;
				}
			}

			// --- Priority 2: Cover art found on disk ---
			if (coverRaw) {
				try {
					const targetSize = Utils.getPanelDiscSize();
					if (P.useAlbumArtOnly) {
						// Display cover art statically without a circular mask.
						const scaled = ImageProcessor.scaleProportional(
							coverRaw, CONFIG.MAX_STATIC_SIZE, P.interpolationMode
						);
						if (scaled) {
							State.setImage(scaled, false, CONFIG.IMAGE_TYPE.ALBUM_ART, bgOriginal);
							props.savedPath.value    = coverPath;
							props.savedIsDisc.enabled = false;
							State.updateTimer();
							return;
						}
						Utils.safeDispose(coverRaw);
						Utils.safeDispose(bgOriginal);
					} else {
						// Render cover art as a disc by applying the circular mask.
						const processed = ImageProcessor.processForDisc(
							coverRaw, targetSize, CONFIG.IMAGE_TYPE.ALBUM_ART, P.interpolationMode
						);
						if (processed) {
							State.setImage(processed, true, CONFIG.IMAGE_TYPE.ALBUM_ART, bgOriginal);
							props.savedPath.value    = coverPath;
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

			// --- Priority 3: Async album art via foobar's built-in provider ---
			State.pendingArtToken = State.loadToken;
			utils.GetAlbumArtAsync(window.ID, metadb, 0);
		};

		if (immediate) doLoad();
		else State.loadTimer = window.SetTimeout(doLoad, CONFIG.LOAD_DEBOUNCE_MS);
	},

	// Called by on_get_album_art_done; validates the token before applying the image
	// so that results from cancelled loads are silently discarded.
	handleAlbumArt(metadb, image, image_path) {
		if (State.pendingArtToken !== State.loadToken) {
			Utils.safeDispose(image); // Stale result from a previous track — discard
			return;
		}
		if (!State.currentMetadb) {
			Utils.safeDispose(image);
			return;
		}

		if (!metadb) {
			// Null metadb with a valid image is unusual — treat as load failure.
			if (image) {
				Utils.safeDispose(image);
			} else if (State.pendingArtToken === State.loadToken && State.currentMetadb) {
				this.loadDefaultDisc();
				State.updateTimer();
			}
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
						Utils.safeDispose(original);
					}
				}

				RepaintHelper.background();
				State.updateTimer();
				return;
			} catch (e) {
				Utils.safeDispose(image);
				Utils.safeDispose(original);
			}
		}

		// No image returned and the token is still current — use the default disc placeholder.
		if (metadbMatches) {
			this.loadDefaultDisc();
			State.updateTimer();
		}
	},

	// Load and display the static default disc placeholder image from the skins folder.
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
				props.savedPath.value    = CONFIG.PATHS.DEFAULT_DISC;
				props.savedIsDisc.enabled = true;
				State.updateTimer();
			} else {
				Utils.safeDispose(raw);
			}
		} catch (e) {}
	},

	cleanup() { this._pathCache.clear(); }
};

// ====================== ROTATION FRAME CACHE ======================
// Pre-renders every rotation step into individual bitmaps so each paint call
// only needs a DrawImage copy rather than an on-the-fly rotation.
const RotationCache = {
	frames:         [],
	MAX_FRAME_SIZE: 1000,  // Downscale the source before rotating if it exceeds this
	_sourceKey:     '',

	get step() { return P.rotationStep; },

	clear() {
		this.frames.forEach(f => { try { f.Dispose(); } catch (_) {} });
		this.frames     = [];
		this._sourceKey = '';
	},

	// Build (or skip if already current) the full 360° frame sequence.
	// cache is always rebuilt for the new content.
	build(img) {
		if (!img) return;

		const step = this.step;
		const srcW = Math.min(img.Width,  this.MAX_FRAME_SIZE);
		const srcH = Math.min(img.Height, this.MAX_FRAME_SIZE);
		// Unique key: content identity via _uid, source dimensions, and rotation step.
		const key  = (img._uid !== undefined ? img._uid : (img._path || 'img')) +
		             '|' + srcW + '|' + srcH + '|' + step;
		if (this._sourceKey === key && this.frames.length > 0) return; // Already current
		this.clear();
		this._sourceKey = key;

		// Optionally downscale the source once; rotating a smaller image is faster.
		let src    = img;
		let scaled = null;
		if (srcW < img.Width || srcH < img.Height) {
			try {
				scaled = gdi.CreateImage(srcW, srcH);
				let gs = null, gsReleased = false;
				try {
					gs = scaled.GetGraphics();
					gs.SetInterpolationMode(P.interpolationMode);
					gs.DrawImage(img, 0, 0, srcW, srcH, 0, 0, img.Width, img.Height);
					scaled.ReleaseGraphics(gs);
					gsReleased = true;
					gs = null;
				} finally {
					if (!gsReleased && gs) { try { scaled.ReleaseGraphics(gs); } catch (_) {} }
				}
				src = scaled;
			} catch (e) {
				Utils.safeDispose(scaled);
				scaled = null;
				src = img; // Fall back to original size
			}
		}

		// Render one frame per rotation step across the full 360°.
		for (let a = 0; a < 360; a += step) {
			try {
				const frame = gdi.CreateImage(src.Width, src.Height);
				let g = null, released = false;
				try {
					g = frame.GetGraphics();
					g.DrawImage(src, 0, 0, src.Width, src.Height, 0, 0, src.Width, src.Height, a, 255);
					frame.ReleaseGraphics(g);
					released = true;
					g = null;
				} finally {
					if (!released && g) { try { frame.ReleaseGraphics(g); } catch (_) {} }
				}
				this.frames.push(frame);
			} catch (e) {} // A single bad frame is skipped; rotation continues
		}

		Utils.safeDispose(scaled); // The downscaled copy is no longer needed
	},

	// Look up the pre-rendered frame closest to the given angle.
	getFrame(angle) {
		if (this.frames.length === 0) return null;
		const idx = Math.floor(angle / this.step) % this.frames.length;
		return this.frames[idx < 0 ? this.frames.length + idx : idx];
	}
};

// ====================== DISC COMPOSITE CACHE ======================
// Composites the disc image with the centre-hole rim overlay into a single bitmap.
// Rebuilt only when the disc size, image content, or mask type changes.
const DiscComposite = {
	img:       null,
	valid:     false,
	_cacheKey: '',

	invalidate() { this.valid = false; },

	// Dispose the composite and clear the rotation frame cache that depends on it.
	dispose() {
		if (this.img) {
			try { this.img.Dispose(); } catch (e) {}
			this.img = null;
		}
		this.valid = false;
		RotationCache.clear(); // Frame cache is always derived from the composite
	},

	// Build the composite from discImg + rim overlay.
	build(discImg, size, imageType) {
		const uid = (discImg && discImg._uid !== undefined) ? discImg._uid : (discImg ? 'img' : 'null');
		const key = `${uid}|${size}|${imageType}|${AssetManager.currentMaskType}`;
		if (this.valid && this._cacheKey === key && this.img && this.img.Width === size) return;
		this._cacheKey = key;
		this.dispose(); // Clear stale composite and rotation frames

		if (!discImg || size <= 0) { this.valid = true; return; }

		// No rim needed for vinyl or when using raw disc scans — just clone the source.
		if (!AssetManager.shouldShowRim(imageType)) {
			try {
				this.img   = discImg.Clone(0, 0, discImg.Width, discImg.Height);
				this.valid = true;
			} catch (e) {
				// Clone failed; valid stays false so the lazy path in paintDisc will retry.
			}
			return;
		}

		// Composite: draw the disc art then overlay the centre-hole rim.
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
			if (!released && g) { try { this.img.ReleaseGraphics(g); } catch (_) {} }
			this.dispose(); // Leave in a clean (invalid) state on failure
		}
	}
};

// ====================== BACKGROUND BLUR CACHE ======================
// Renders (and blurs) the background bitmap once per unique source/size/settings combination.
const BackgroundCache = {
	_lru:       LRUCache(CONFIG.MAX_BG_CACHE),
	_activeKey: '',
	img:        null,

	// The key encodes: source image identity, blur settings, and panel size.
	_makeKey(w, h) {
		const bgId = (State.bgImg && State.bgImg._bgId !== undefined)
			? State.bgImg._bgId : 'none';
		return `${bgId}|${P.blurRadius}|${P.blurEnabled ? 1 : 0}|${w}|${h}`;
	},

	invalidate() { this._activeKey = ''; this.img = null; },

	// Ensure a blurred background bitmap is ready for the given panel dimensions.
	ensure(w, h) {
		if (w <= 0 || h <= 0) return;
		const wantBlur = !P.bgUseUIColor && P.backgroundEnabled && P.blurEnabled &&
		                 P.blurRadius > 0 && State.bgImg;
		if (!wantBlur) {
			if (this._activeKey !== 'none') { this._activeKey = 'none'; this.img = null; }
			return;
		}

		const key = this._makeKey(w, h);
		if (this._activeKey === key) return; // Already built and current

		const cached = this._lru.get(key);
		if (cached) { this._activeKey = key; this.img = cached; return; }

		// Draw the source at panel size then apply a stack-blur pass.
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
			newImg = null; // Ownership transferred to the LRU cache
			this._activeKey = key;
			this.img = this._lru.get(key);
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

// ====================== OVERLAY REBUILD DEBOUNCER ======================
// Batches rapid overlay invalidation requests (e.g. from the scroll wheel slider)
// into a single rebuild after 16 ms of quiet time.
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

// ====================== OVERLAY DRAW PRIMITIVES ======================
// Each function writes into an existing graphics context; they are called by OverlayCache.build.

// Draw horizontal scanlines at CONFIG.OVERLAY.SCANLINE_SPACING intervals.
function drawScanlines(g, w, h) {
	const s   = CONFIG.OVERLAY.SCANLINE_SPACING;
	const col = MathX.setAlpha(DS_BLACK, P.opScanlines);
	for (let y = 0; y < h; y += s) g.FillSolidRect(0, y, w, 1, col);
}

// Draw a radial glow centred on the disc using concentric filled ellipses.
function drawGlow(g, w, h, pc) {
	const discSz = State.isDiscImage ? pc.discSize : Math.max(pc.staticW, pc.staticH);
	if (discSz <= 0) return;
	const op    = P.opGlow;
	const cx    = State.isDiscImage ? pc.discX + pc.discSize / 2 : pc.staticX + pc.staticW / 2;
	const cy    = State.isDiscImage ? pc.discY + pc.discSize / 2 : pc.staticY + pc.staticH / 2;
	const maxR  = discSz * 0.75;
	const steps = CONFIG.OVERLAY.GLOW_ART_STEPS;
	const mult  = CONFIG.OVERLAY.GLOW_ART_MULT;
	const minStep = Math.ceil(1 / (op * mult));
	for (let i = minStep; i < steps; i++) {
		const progress = i / steps;
		const alpha    = Math.floor(op * progress * mult);
		if (alpha <= 0) continue;
		const r = maxR * (1 - progress);
		g.FillEllipse(cx - r, cy - r, r * 2, r * 2, MathX.setAlpha(DS_WHITE, alpha));
	}
}

// Draw a smooth-step white gradient at the top of the panel to simulate a glass reflection.
function drawReflection(g, w, h) {
	const reflH = Math.floor(h * CONFIG.OVERLAY.REFLECTION_HEIGHT_RATIO);
	let lastAlpha = -1, bandStart = 0;
	for (let y = 0; y < reflH; y++) {
		const t     = 1 - (y / reflH);
		const s     = t * t * (3 - 2 * t); // Smooth-step easing
		const alpha = Math.floor(P.opReflection * s * 0.65);
		if (alpha !== lastAlpha) {
			// Flush the accumulated band before starting a new alpha value.
			if (lastAlpha > 0 && y > bandStart)
				g.FillSolidRect(0, bandStart, w, y - bandStart, MathX.setAlpha(DS_WHITE, lastAlpha));
			lastAlpha  = alpha;
			bandStart  = y;
		}
	}
	if (lastAlpha > 0)
		g.FillSolidRect(0, bandStart, w, reflH - bandStart, MathX.setAlpha(DS_WHITE, lastAlpha));
}

// Draw alternating horizontal phosphor lines using the currently active theme colour.
function drawPhosphor(g, w, h) {
	const themeColor = PhosphorManager.getColor();
	const r  = (themeColor >>> 16) & 255;
	const gc = (themeColor >>> 8)  & 255;
	const b  = themeColor & 255;
	// Lighten the theme colour to simulate the glow of phosphor on a CRT screen.
	const col = MathX.setAlpha(
		_RGB(Math.floor(r * 0.5 + 127), Math.floor(gc * 0.5 + 127), Math.floor(b * 0.5 + 127)),
		P.opPhosphor
	);
	for (let y = 1; y < h; y += CONFIG.OVERLAY.SCANLINE_SPACING)
		g.FillSolidRect(0, y, w, 1, col);
}

// ====================== OVERLAY COMPOSITE CACHE ======================
// Pre-builds all enabled overlay effects into a single bitmap.
// Rebuilt only when an effect setting changes or the panel is resized.
const OverlayCache = {
	img:   null,
	valid: false,

	invalidate() { this.valid = false; },

	dispose() {
		if (this.img) { try { this.img.Dispose(); } catch (e) {} this.img = null; }
		this.valid = false;
	},

	build(w, h, pc) {
		this.dispose();
		// Skip building the bitmap entirely if all effects are disabled.
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
			// Draw order: scanlines → glow → reflection → phosphor (back to front)
			if (P.showScanlines  && P.opScanlines > 0)  drawScanlines(g, w, h);
			if (P.showGlow       && P.opGlow > 0 && pc) drawGlow(g, w, h, pc);
			if (P.showReflection && P.opReflection > 0) drawReflection(g, w, h);
			if (P.showPhosphor   && P.opPhosphor > 0)   drawPhosphor(g, w, h);
			newImg.ReleaseGraphics(g); released = true; g = null;
			this.img = newImg; newImg = null;
		} catch (e) {
			// Overlay is purely cosmetic — swallow draw errors silently
		} finally {
			if (!released && g && newImg) { try { newImg.ReleaseGraphics(g); } catch (_) {} }
			if (newImg) Utils.safeDispose(newImg);
		}
	}
};

// ====================== STATIC COMPOSITE LAYERS ======================
// Both layers are built once per panel state and invalidated only when their inputs change,
// so each paint call copies a pre-built bitmap rather than re-drawing from scratch.

// Background layer: solid fill + optional blurred art + optional darken veil.
const StaticBgLayer = {
	img: null, valid: false, _w: 0, _h: 0,

	invalidate() { this.valid = false; },
	dispose()    { Utils.safeDispose(this.img); this.img = null; this.valid = false; },

	build(w, h) {
		this.dispose();
		let g = null, newImg = null, released = false;
		try {
			newImg = gdi.CreateImage(w, h);
			g = newImg.GetGraphics();

			if (P.bgUseUIColor) {
				// Use the host UI accent colour as a flat background.
				g.FillSolidRect(0, 0, w, h, State.paintCache.bgColor);
			} else {
				// Layer: custom base colour → optional blurred art → optional darken veil
				g.FillSolidRect(0, 0, w, h, P.customBackgroundColor >>> 0);
				const hasBgImage = P.backgroundEnabled && State.bgImg &&
				                   State.bgImg.Width > 0 && State.bgImg.Height > 0;
				if (hasBgImage) {
					if (P.blurEnabled) {
						// Use the pre-blurred background from BackgroundCache.
						BackgroundCache.ensure(w, h);
						if (BackgroundCache.img) {
							const bi = BackgroundCache.img;
							g.DrawImage(bi, 0, 0, w, h, 0, 0, bi.Width, bi.Height);
						}
					} else {
						// Draw the original (unblurred) cover art stretched to fill.
						g.DrawImage(State.bgImg, 0, 0, w, h, 0, 0, State.bgImg.Width, State.bgImg.Height);
					}
				}
				// Semi-transparent black veil for contrast control.
				if (P.darkenValue > 0) {
					g.FillSolidRect(0, 0, w, h, MathX.setAlpha(DS_BLACK, Math.floor(P.darkenValue * 2.55)));
				}
			}

			newImg.ReleaseGraphics(g); released = true; g = null;
			this.img = newImg; newImg = null;
			this._w = w; this._h = h; this.valid = true;
		} catch (e) {
		} finally {
			if (!released && g && newImg) { try { newImg.ReleaseGraphics(g); } catch (_) {} }
			if (newImg) Utils.safeDispose(newImg);
		}
	}
};

// Top layer: border bars + overlay effects bitmap composited on top of the disc.
const StaticTopLayer = {
	img: null, valid: false, _w: 0, _h: 0,

	invalidate() { this.valid = false; },
	dispose()    { Utils.safeDispose(this.img); this.img = null; this.valid = false; },

	build(w, h) {
		this.dispose();
		const hasBorder  = P.borderSize > 0;
		const hasOverlay = OverlayCache.img !== null;
		// Nothing to composite — mark valid without allocating a bitmap.
		if (!hasBorder && !hasOverlay) { this._w = w; this._h = h; this.valid = true; return; }

		let g = null, newImg = null, released = false;
		try {
			newImg = gdi.CreateImage(w, h);
			g = newImg.GetGraphics();

			if (hasBorder) {
				// Draw border as four filled rectangles (top, bottom, left, right).
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
		} finally {
			if (!released && g && newImg) { try { newImg.ReleaseGraphics(g); } catch (_) {} }
			if (newImg) Utils.safeDispose(newImg);
		}
	}
};

// ====================== RENDERER ======================
// Draws the current image (disc or static cover) into the panel's graphics context.
const Renderer = {
	paint(gr) {
		const pc = State.paintCache;
		if (!State.img) return;
		gr.SetInterpolationMode(P.interpolationMode);
		if (!State.isDiscImage) this.paintStatic(gr, pc);
		else                    this.paintDisc(gr, pc);
	},

	// Draw static cover art scaled to the pre-calculated layout rectangle.
	paintStatic(gr, pc) {
		if (!State.img) return;
		gr.DrawImage(State.img, pc.staticX, pc.staticY, pc.staticW, pc.staticH,
			0, 0, State.img.Width, State.img.Height);
	},

	// Draw the spinning disc using the pre-rendered rotation frame cache.
	paintDisc(gr, pc) {
		gr.SetSmoothingMode(CONFIG.SMOOTHING_MODE);
		const size = pc.discSize;
		const x    = pc.discX;
		const y    = pc.discY;

		// Lazy rebuild after a panel resize clears the composite (on_size → DiscComposite.dispose).
		// On normal load this branch is never reached because State.setImage pre-builds both.
		if (!DiscComposite.valid && State.img) {
			DiscComposite.build(State.img, Math.floor(size), State.imageType);
			RotationCache.build(DiscComposite.img || State.img);
		}

		const composite = DiscComposite.valid && DiscComposite.img ? DiscComposite.img : State.img;
		if (composite) {
			const frame = RotationCache.getFrame(State.angle);
			if (frame) {
				// Fast path: copy the pre-rendered rotated frame directly.
				gr.DrawImage(frame, x, y, size, size, 0, 0, frame.Width, frame.Height);
			} else {
				// Slow path (should rarely occur): rotate on-the-fly without a cached frame.
				gr.DrawImage(composite, x, y, size, size, 0, 0,
					composite.Width, composite.Height, State.angle, 255);
			}
		}
	}
};

// ====================== PHOSPHOR COLOUR MANAGER ======================
// Resolves the active phosphor theme colour with a one-level cache.
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

	// Open the system colour picker so the user can choose a custom phosphor tint.
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

// ====================== PRESET MANAGER ======================
// Saves and restores named snapshots of all visual settings (up to 3 slots).
const PresetManager = {
	// Capture the current state of every visual property into a plain object.
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

	// Serialise and persist a preset to a window property.
	save(slot) {
		if (!_.inRange(slot, 1, 4)) return;
		try { window.SetProperty('Disc.Preset' + slot, JSON.stringify(this._capture())); } catch (e) {}
	},

	// Deserialise a preset and apply each property with bounds-checking.
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

			// Flush all dependent caches after a bulk property change.
			ImageLoader.clearCache();
			AssetManager.maskCache.clear();
			AssetManager.rimCache.clear();
			BackgroundCache.invalidate();
			StaticBgLayer.invalidate();
			StaticTopLayer.invalidate();
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
// Tracks whether the mouse-wheel opacity slider UI is active and which effect is targeted.
const Slider = {
	active: false,
	target: null,           // One of "Reflection" | "Glow" | "Scanlines" | "Phosphor"
	timers: { overlayRebuild: null },

	activate(target)  { this.active = true;  this.target = target; window.Repaint(); },
	deactivate()      { this.active = false; this.target = null;   window.Repaint(); },

	cleanup() {
		if (this.timers.overlayRebuild) window.ClearTimeout(this.timers.overlayRebuild);
		this.timers.overlayRebuild = null;
	}
};

// ====================== SLIDER RENDERER ======================
// Draws the opacity slider HUD (title label + value label + progress bar) onto the panel.
const SliderRenderer = {
	_font: null,

	getFont() {
		if (!this._font) this._font = gdi.Font('Segoe UI', 16, 0);
		return this._font;
	},

	// Draw the filled progress bar and value label above it.
	drawBar(gr, value, max, barY) {
		const w     = window.Width;
		const barW  = Math.max(SLIDER_MIN_WIDTH, Math.floor(w * SLIDER_WIDTH_RATIO));
		const barH  = SLIDER_HEIGHT;
		const bx    = Math.floor((w - barW) / 2);

		// Background track (dim white) then filled portion (bright white).
		gr.FillSolidRect(bx, barY, barW, barH, MathX.setAlpha(DS_WHITE, 55));
		const fillW = Math.floor(barW * (value / max));
		if (fillW > 0) gr.FillSolidRect(bx, barY, fillW, barH, MathX.setAlpha(DS_WHITE, 185));

		const font  = this.getFont();
		const label = value.toString();
		const sz    = gr.MeasureString(label, font, 0, 0, w, window.Height);
		gr.DrawString(label, font, DS_WHITE,
			Math.floor((w - sz.Width) / 2),
			barY - Math.ceil(sz.Height) - 2,
			Math.ceil(sz.Width), Math.ceil(sz.Height));
	},

	// Draw the effect name above the value label.
	drawTitle(gr, text, barY) {
		const w     = window.Width;
		const font  = this.getFont();
		const sz    = gr.MeasureString(text, font, 0, 0, w, window.Height);
		const valSz = gr.MeasureString('255', font, 0, 0, w, window.Height);
		const titleY = barY - Math.ceil(valSz.Height) - 4 - Math.ceil(sz.Height) - 4;
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
		const barY = window.Height - 22;
		this.drawTitle(gr, Slider.target + ' Opacity', barY);
		this.drawBar(gr, prop.value, 255, barY);
	}
};

// ====================== CONTEXT MENU MANAGER ======================
// Builds and dispatches the right-click context menu.
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

	// Overlay Effects sub-menu: per-effect toggles, opacity sliders, phosphor theme picker.
	addOverlayMenu(parent) {
		const overlay = window.CreatePopupMenu();
		const grayed  = props.overlayAllOff.enabled; // Grey out individual toggles when master kill-switch is on

		// Phosphor theme picker as a nested sub-menu.
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

		// Individual effect toggles (greyed out when master kill-switch is active).
		overlay.AppendMenuItem(grayed ? 1 : 0, 200, "Reflection");
		if (!grayed && props.showReflection.enabled) overlay.CheckMenuItem(200, true);
		overlay.AppendMenuItem(grayed ? 1 : 0, 210, "Glow");
		if (!grayed && props.showGlow.enabled)       overlay.CheckMenuItem(210, true);
		overlay.AppendMenuItem(grayed ? 1 : 0, 220, "Scanlines");
		if (!grayed && props.showScanlines.enabled)  overlay.CheckMenuItem(220, true);
		overlay.AppendMenuItem(grayed ? 1 : 0, 230, "Phosphor");
		if (!grayed && props.showPhosphor.enabled)   overlay.CheckMenuItem(230, true);

		overlay.AppendMenuSeparator();
		// Opacity sub-menu (shows current value; launches scroll-wheel slider UI on select).
		const opacityM = window.CreatePopupMenu();
		opacityM.AppendMenuItem((!grayed && props.showReflection.enabled) ? 0 : 1, 201, `Reflection...  [${props.opReflection.value}]`);
		opacityM.AppendMenuItem((!grayed && props.showGlow.enabled)       ? 0 : 1, 211, `Glow...  [${props.opGlow.value}]`);
		opacityM.AppendMenuItem((!grayed && props.showScanlines.enabled)  ? 0 : 1, 221, `Scanlines...  [${props.opScanlines.value}]`);
		opacityM.AppendMenuItem((!grayed && props.showPhosphor.enabled)   ? 0 : 1, 231, `Phosphor...  [${props.opPhosphor.value}]`);
		opacityM.AppendTo(overlay, 0, "Opacity Settings");

		overlay.AppendTo(parent, 0, "Overlay Effects");
	},

	// Disc Settings sub-menu: rotation speed, image scaling, max disc size, mask type, rotation quality.
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

	// Custom Artwork Folders sub-menu: add new folder, remove existing ones, clear all.
	addCustomFoldersMenu(parent) {
		const customMenu = window.CreatePopupMenu();
		customMenu.AppendMenuItem(0, 50, "Add Custom Folder...");
		const folders = CustomFolders.getAll();
		if (folders.length > 0) {
			customMenu.AppendMenuSeparator();
			folders.forEach((folder, i) => {
				// Truncate long paths in the menu display.
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

	// JSplitter ONLY sub-menu: renderer toggle requires JSplitter to take effect on reload.
	// Kept separate so users on other panel hosts are not confused by an irrelevant option.
	addJSplitterMenu(parent) {
		const jsMenu          = window.CreatePopupMenu();
		const currentDrawMode = window.GetProperty('RP.DrawMode', 1);
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

	// Background sub-menu: UI colour toggle, blur settings, darken level, custom colour.
	addBackgroundMenu(parent) {
		const bgMenu        = window.CreatePopupMenu();
		const uiColorActive = props.bgUseUIColor.enabled;

		bgMenu.AppendMenuItem(0, 263, 'Use UI Color as Background');
		if (uiColorActive) bgMenu.CheckMenuItem(263, true);
		bgMenu.AppendMenuSeparator();
		// Individual background controls are greyed out when the UI colour mode overrides them.
		bgMenu.AppendMenuItem(uiColorActive ? 1 : 0, 260, 'Enable Background Art');
		if (!uiColorActive && props.backgroundEnabled.enabled) bgMenu.CheckMenuItem(260, true);
		bgMenu.AppendMenuItem(uiColorActive ? 1 : 0, 261, 'Custom Background Color...');
		bgMenu.AppendMenuSeparator();

		const blurEnabled = !uiColorActive && props.backgroundEnabled.enabled;
		const blurMenu    = window.CreatePopupMenu();
		blurMenu.AppendMenuItem(0, 270, 'Enable Blur');
		if (props.blurEnabled.enabled) blurMenu.CheckMenuItem(270, true);
		blurMenu.AppendMenuSeparator();
		_.times(11, i => {
			const value = i * 20;
			blurMenu.AppendMenuItem(0, 271 + i, 'Radius: ' + value);
			if (props.blurRadius.value === value) blurMenu.CheckMenuItem(271 + i, true);
		});
		blurMenu.AppendMenuItem(0, 282, 'Max: 254');
		if (props.blurRadius.value === 254) blurMenu.CheckMenuItem(282, true);
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

	// Route the menu selection to the appropriate action handler.
	handleSelection(idx) {
		let changed = false;

		// --- Toggles (IDs 1–3): Album Art Only / Spinning / Keep Aspect Ratio ---
		const toggles = {
			1: { prop: props.useAlbumArtOnly, reload: true },
			2: { prop: props.spinningEnabled,  timer: true },
			3: { prop: props.keepAspectRatio,  cache: true }
		};
		if (toggles[idx]) {
			toggles[idx].prop.toggle();
			if (toggles[idx].reload && State.currentMetadb) {
				ImageLoader.clearCache();
				DiscComposite.dispose();
				RotationCache.clear();
				State.lastFrame = -1;
				ImageLoader.loadForMetadb(State.currentMetadb, true);
			}
			if (toggles[idx].timer) State.updateTimer();
			if (toggles[idx].cache) State.paintCache.valid = false;
			changed = true;
		}

		// --- Speed presets (IDs 10–12) ---
		const speedPreset = _.find(CONFIG.SPEED_PRESETS, (p, i) => (i + 10) === idx);
		if (speedPreset) { props.spinSpeed.value = speedPreset.value; changed = true; }

		// --- Interpolation modes (IDs 20–22): require full image reload ---
		const interpMode = _.find(CONFIG.INTERPOLATION_MODES, (m, i) => (i + 20) === idx);
		if (interpMode) {
			props.interpolationMode.value = interpMode.value;
			ImageLoader.clearCache();
			DiscComposite.dispose();
			RotationCache.clear();
			OverlayInvalidator.request();
			State.lastFrame        = -1;
			State.paintCache.valid = false;
			Utils.safeDispose(State.img);
			State.img       = null;
			State.imageType = CONFIG.IMAGE_TYPE.REAL_DISC;
			if (State.currentMetadb) ImageLoader.loadForMetadb(State.currentMetadb, true);
			changed = true;
		}

		// --- Disc size presets (IDs 30–34): require full image reload at new resolution ---
		const sizePreset = _.find(CONFIG.DISC_SIZE_PRESETS, (p, i) => (i + 30) === idx);
		if (sizePreset) {
			props.maxImageSize.value = sizePreset.value;
			ImageLoader.clearCache();
			AssetManager.maskCache.clear();
			AssetManager.rimCache.clear();
			DiscComposite.dispose();
			RotationCache.clear();
			OverlayInvalidator.request();
			State.paintCache.valid = false;
			State.lastFrame        = -1;
			Utils.safeDispose(State.img);
			State.img       = null;
			State.imageType = CONFIG.IMAGE_TYPE.REAL_DISC;
			if (State.currentMetadb) ImageLoader.loadForMetadb(State.currentMetadb, true);
			changed = true;
		}

		// --- Mask type selection (IDs 40–42) ---
		if (idx >= 40 && idx <= 42) {
			AssetManager.setMaskType(idx - 40, true);
			changed = true;
		}

		// --- Rotation step / quality (80=2°, 81=3°, 82=4°) ---
		if (idx >= 80 && idx <= 82) {
			const stepValues = { 80: 2, 81: 3, 82: 4 };
			const newStep    = stepValues[idx];
			if (newStep !== props.rotationStep.value) {
				props.rotationStep.value = newStep;
				// Rebuild rotation frames at the new angular resolution.
				DiscComposite.dispose();
				State.lastFrame = -1;
				if (State.img) {
					const size = Utils.getPanelDiscSize();
					DiscComposite.build(State.img, size, State.imageType);
					RotationCache.build(DiscComposite.img || State.img);
				}
				changed = true;
			}
		}

		// --- Custom folder management (50 = add, 60–64 = remove indexed, 70 = clear all) ---
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

		// --- Clear all image caches (ID 900) ---
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

		// --- Overlay master kill-switch (ID 199): saves and restores individual toggles ---
		if (idx === 199) {
			if (!props.overlayAllOff.enabled) {
				// Save individual states before disabling everything.
				props.savedOverlay.value = JSON.stringify({
					r: props.showReflection.enabled,
					g: props.showGlow.enabled,
					s: props.showScanlines.enabled,
					p: props.showPhosphor.enabled
				});
				props.overlayAllOff.enabled = true;
			} else {
				// Restore previously saved individual states.
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

		// --- Per-effect toggles and opacity slider activations ---
		// Reflection: 200 = toggle, 201 = opacity slider
		if (idx === 200) { props.showReflection.toggle(); OverlayInvalidator.request(); changed = true; }
		if (idx === 201) { Slider.activate("Reflection"); return; }

		// Glow: 210 = toggle, 211 = opacity slider
		if (idx === 210) { props.showGlow.toggle(); OverlayInvalidator.request(); changed = true; }
		if (idx === 211) { Slider.activate("Glow"); return; }

		// Scanlines: 220 = toggle, 221 = opacity slider
		if (idx === 220) { props.showScanlines.toggle(); OverlayInvalidator.request(); changed = true; }
		if (idx === 221) { Slider.activate("Scanlines"); return; }

		// Phosphor: 230 = toggle, 231 = opacity slider, 600–610 = named themes
		if (idx === 230) { props.showPhosphor.toggle(); OverlayInvalidator.request(); changed = true; }
		if (idx === 231) { Slider.activate("Phosphor"); return; }

		if (_.inRange(idx, 600, 600 + DISC_CUSTOM_THEME_INDEX)) {
			props.phosphorTheme.value = idx - 600;
			PhosphorManager.invalidateCache();
			OverlayInvalidator.request();
			changed = true;
		}
		if (idx === 600 + DISC_CUSTOM_THEME_INDEX) {
			PhosphorManager.setCustomColor(); // Opens the system colour picker
			return;
		}

		// --- Full factory reset (ID 197) ---
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
			BackgroundCache.invalidate();
			StaticBgLayer.invalidate();
			StaticTopLayer.invalidate();
			OverlayInvalidator.request();
			DiscComposite.dispose();
			State.paintCache.valid = false;
			State.updateTimer();
			if (State.currentMetadb) ImageLoader.loadForMetadb(State.currentMetadb, true);
			changed = true;
		}

		// --- Border size / colour / padding (IDs 250–252) ---
		if (idx === 250) {
			const v = utils.InputBox(window.ID, 'Border Size', 'Enter size (0-50):', props.borderSize.value.toString(), false);
			const n = parseInt(v, 10);
			if (!isNaN(n)) { props.borderSize.value = _.clamp(n, 0, 50); State.paintCache.valid = false; StaticTopLayer.invalidate(); changed = true; }
		}
		if (idx === 251) {
			const picked = utils.ColourPicker(window.ID, props.borderColor.value);
			if (picked !== -1) { props.borderColor.value = picked; StaticTopLayer.invalidate(); window.Repaint(); changed = true; }
		}
		if (idx === 252) {
			const v = utils.InputBox(window.ID, 'Padding', 'Enter size (0-100):', props.padding.value.toString(), false);
			const n = parseInt(v, 10);
			if (!isNaN(n)) { props.padding.value = _.clamp(n, 0, 100); State.paintCache.valid = false; StaticTopLayer.invalidate(); changed = true; }
		}

		// --- Background controls (IDs 260–295) ---
		if (idx === 263) { props.bgUseUIColor.toggle();        BackgroundCache.invalidate(); StaticBgLayer.invalidate(); changed = true; }
		if (idx === 260) { props.backgroundEnabled.toggle();   BackgroundCache.invalidate(); StaticBgLayer.invalidate(); changed = true; }
		if (idx === 261) {
			const picked = utils.ColourPicker(window.ID, props.customBackgroundColor.value);
			if (picked !== -1) { props.customBackgroundColor.value = picked; StaticBgLayer.invalidate(); RepaintHelper.background(); changed = true; }
		}
		if (idx === 270) { props.blurEnabled.toggle(); BackgroundCache.invalidate(); StaticBgLayer.invalidate(); changed = true; }

		// Blur radius: IDs 271–281 map to 0, 20, 40, ..., 200; ID 282 = 254 (maximum).
		if (_.inRange(idx, 271, 282)) {
			props.blurRadius.value = (idx - 271) * 20;
			BackgroundCache.invalidate(); StaticBgLayer.invalidate();
			changed = true;
		} else if (idx === 282) {
			props.blurRadius.value = 254;
			BackgroundCache.invalidate(); StaticBgLayer.invalidate();
			changed = true;
		}

		// Darken veil: IDs 290–295 map to 0%, 10%, ..., 50%.
		if (_.inRange(idx, 290, 296)) {
			props.darkenValue.value = (idx - 290) * 10;
			BackgroundCache.invalidate(); StaticBgLayer.invalidate();
			changed = true;
		}

		// --- Preset load (IDs 301–303) / save (IDs 401–403) ---
		if (_.inRange(idx, 301, 304)) { PresetManager.load(idx - 300); return; }
		if (_.inRange(idx, 401, 404)) { PresetManager.save(idx - 400); }

		// --- Renderer toggle (ID 950): persist new draw mode and reload the panel ---
		if (idx === 950) {
			const next = window.GetProperty('RP.DrawMode', 1) === 1 ? 0 : 1;
			window.SetProperty('RP.DrawMode', next);
			window.Reload();
			return;
		}

		if (changed) window.Repaint();
	}
};

// ====================== ARTWORK DISPATCH QUEUE ======================
// Coalesces rapid art-load requests by priority so only the highest-priority
// pending request is dispatched after a short debounce window.
const ArtDispatcher = {
	_pending:  null,
	_timer:    null,
	_priority: { track: 4, stop: 3, selection: 2, playlist: 1 },

	// Queue an art-load request. Higher-priority requests preempt lower ones.
	request(reason, metadb) {
		const priority = this._priority[reason] || 0;
		if (this._pending) {
			const currentPriority = this._priority[this._pending.reason] || 0;
			if (priority < currentPriority) return; // Ignore lower-priority request
		}
		this._pending = { reason, metadb };
		if (this._timer) window.ClearTimeout(this._timer);
		// Short debounce to merge bursts (e.g. rapid playlist changes).
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
				// Skip reload if the new track's art is already displayed.
				if (metadb && State.currentMetadb && State.img &&
				    State.currentMetadb.Compare(metadb)) return;
				if (metadb) ImageLoader.loadForMetadb(metadb, true);
				break;

			case 'stop': {
				// The 'metadb' slot carries the foobar stop-reason code (0 = user stop).
				const stopReason = metadb;
				if (stopReason === 0) State.angle = 0; // Reset disc angle on manual stop
				State.updateTimer();
				window.Repaint();
				break;
			}

			case 'selection':
				// Only act when nothing is playing; the playing track takes priority.
				if (metadb) ImageLoader.loadForMetadb(metadb, false);
				break;

			case 'playlist':
				if (fb.IsPlaying && fb.GetNowPlaying()) {
					ImageLoader.loadForMetadb(fb.GetNowPlaying(), false);
				}
				break;
		}
	}
};

// ====================== SMP EVENT CALLBACKS ======================

function on_paint(gr) {
	const w = window.Width;
	const h = window.Height;
	if (w <= 0 || h <= 0) return;
	State.updatePaintCache();
	const pc = State.paintCache;

	// Invalidate the overlay if the panel has been resized since the last build.
	if (OverlayCache.valid && OverlayCache.img &&
	    (OverlayCache.img.Width !== w || OverlayCache.img.Height !== h)) {
		OverlayCache.invalidate();
		StaticTopLayer.invalidate();
	}
	if (!OverlayCache.valid) {
		OverlayCache.build(w, h, pc);
		StaticTopLayer.invalidate(); // Top layer embeds the overlay — rebuild it too
	}

	// Build static layers on demand; they are cheaply re-stamped each frame with DrawImage.
	if (!StaticBgLayer.valid || StaticBgLayer._w !== w || StaticBgLayer._h !== h) {
		StaticBgLayer.build(w, h);
	}
	if (!StaticTopLayer.valid || StaticTopLayer._w !== w || StaticTopLayer._h !== h) {
		StaticTopLayer.build(w, h);
	}

	// Layer 1: Background (blurred art, solid fill, or UI colour)
	if (StaticBgLayer.img) {
		gr.DrawImage(StaticBgLayer.img, 0, 0, w, h, 0, 0, w, h);
	} else {
		gr.FillSolidRect(0, 0, w, h, P.bgUseUIColor ? pc.bgColor : (P.customBackgroundColor >>> 0));
	}

	// Layer 2: Disc or static cover art
	Renderer.paint(gr);

	// Layer 3: Border strips and overlay effects
	if (StaticTopLayer.img) {
		gr.DrawImage(StaticTopLayer.img, 0, 0, w, h, 0, 0, w, h);
	}

	// Layer 4: Transient opacity slider HUD (only visible when slider is active)
	SliderRenderer.draw(gr);
}

function on_size() {
	// Flush all size-dependent caches so everything is rebuilt at the new dimensions.
	State.paintCache.valid = false;
	BackgroundCache.invalidate();
	StaticBgLayer.invalidate();
	StaticTopLayer.invalidate();
	OverlayInvalidator.request();
	DiscComposite.dispose(); // Also clears RotationCache internally via its dispose chain
	// NOTE: RotationCache.clear() is NOT called here — DiscComposite.dispose() already does it.
	AssetManager.maskCache.clear();
	AssetManager.rimCache.clear();
	ImageLoader.clearCache();
	State.stopTimer();
	if (isLive() && State.currentMetadb) {
		ImageLoader.loadForMetadb(State.currentMetadb, false);
	} else {
		window.Repaint();
	}
}

function on_playback_new_track(metadb) {
	if (!isLive()) return;
	ArtDispatcher.request('track', metadb);
}

// Reload art if the metadata for the currently playing track is edited.
function on_metadb_changed(metadb_list, fromhook) {
	if (!isLive()) return;
	if (!fb.IsPlaying && !fb.IsPaused) return;
	const nowPlaying = fb.GetNowPlaying();
	if (!nowPlaying) return;
	let affected = false;
	for (let i = 0; i < metadb_list.Count; i++) {
		const item = metadb_list[i];
		if (item && item.Compare && item.Compare(nowPlaying)) { affected = true; break; }
	}
	if (affected) {
		State.currentMetadb = null;
		ImageLoader.loadForMetadb(nowPlaying, true);
	}
}

function on_playback_pause(isPaused) {
	if (!isLive()) return;
	State.updateTimer(); // Pause stops the spin; resume restarts it
}

function on_playback_stop(reason) {
	if (!isLive()) return;
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

// Show art for the focused item when nothing is playing.
function on_selection_changed() {
	if (!isLive()) return;
	if (fb.IsPlaying || fb.IsPaused) return;
	const sel = fb.GetSelection();
	if (sel) ArtDispatcher.request('selection', sel);
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

// Receives the result of utils.GetAlbumArtAsync(); stale results are discarded via token check.
function on_get_album_art_done(metadb, art_id, image, image_path) {
	if (!isLive()) { Utils.safeDispose(image); return; }
	ImageLoader.handleAlbumArt(metadb, image, image_path);
}

// Right-click: show the context menu.
function on_mouse_rbtn_up(x, y) { return MenuManager.show(x, y); }

// Left-click down: claim keyboard focus so key events are routed to this panel.
function on_mouse_lbtn_down(x, y) {
	try { window.SetFocus(); } catch (e) {}
}

// Left-click up: dismiss the opacity slider HUD if it was open.
function on_mouse_lbtn_up(x, y) {
	if (Slider.active) Slider.deactivate();
}

// Mouse wheel: adjust the targeted opacity value when the slider HUD is active.
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
	RepaintHelper.full(); // Immediately update the slider bar value display

	// Debounce the expensive overlay rebuild so it doesn't fire on every wheel notch.
	if (Slider.timers.overlayRebuild) window.ClearTimeout(Slider.timers.overlayRebuild);
	Slider.timers.overlayRebuild = window.SetTimeout(() => {
		Slider.timers.overlayRebuild = null;
		OverlayCache.invalidate();
		StaticTopLayer.invalidate();
		window.Repaint();
	}, 100);
}

// Tear-down: cancel all timers and release every GDI resource before the script exits.
// This definition supersedes the on_script_unload registered by helpers.js (loaded earlier).
function on_script_unload() {
	phase = Phase.SHUTDOWN;

	// Cancel pending async work before freeing resources.
	if (ArtDispatcher._timer) { window.ClearTimeout(ArtDispatcher._timer); ArtDispatcher._timer = null; }
	ArtDispatcher._pending = null;
	if (State.loadTimer) { window.ClearTimeout(State.loadTimer); State.loadTimer = null; }
	if (readyTimer)      { window.ClearTimeout(readyTimer);      readyTimer      = null; }

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

	// Mirror the helpers.js teardown that our definition supersedes.
	_tt('');
	if (_gr) { try { if (_bmp) _bmp.ReleaseGraphics(_gr); } catch (e) {} }
	_gr  = null;
	_bmp = null;
}

// ====================== INITIALIZATION ======================
function init() {
	AssetManager.init();
	CustomFolders.load();

	const nowPlaying = fb.GetNowPlaying();

	if (nowPlaying) {
		// Normal path: load art for the currently playing track.
		ImageLoader.loadForMetadb(nowPlaying, true);

	} else if (props.savedPath.value && FileManager.exists(props.savedPath.value)) {
		// Restore the last known image so the panel is not blank after a restart with no playback.
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
					const isDisc     = props.savedIsDisc.enabled;
					let displayImg;
					if (isDisc) {
						displayImg = ImageProcessor.processForDisc(raw, targetSize, imageType, P.interpolationMode);
					} else {
						displayImg = ImageProcessor.scaleProportional(raw, CONFIG.MAX_STATIC_SIZE, P.interpolationMode);
						if (!displayImg) Utils.safeDispose(raw);
					}
					if (displayImg) {
						State.setImage(displayImg, isDisc, imageType, original);
					} else {
						Utils.safeDispose(original);
					}
				}
			}
		} catch (e) {}

	} else {
		// Last resort: try the shared folder property that PlayList panel may have set.
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
							Utils.safeDispose(raw);
							Utils.safeDispose(original);
						}
					}
				} catch (e) {}
			}
		}
	}

	State.updateTimer();
}

// ====================== BOOT SEQUENCE ======================
// Defer init() until the panel has a valid non-zero size.
// SMP may call on_size before the window dimensions are finalised.
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
