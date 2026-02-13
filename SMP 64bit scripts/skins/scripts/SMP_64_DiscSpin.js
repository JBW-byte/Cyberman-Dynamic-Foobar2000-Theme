	        // ======== AUTHOR L.E.D. AI ASSISTED ======== \\
	       // ======= SMP 64bit Disc Spin V2 Script ======= \\
	      // ======= Spins Disc + Artwork + Cover  ========= \\

   // ===================*** Foobar2000 64bit ***================== \\
  // ======= For Spider Monekey Panel 64bit, author: marc2003 ====== \\
 // ====== Masking All Images, Creates a Disc from Album Art+  ====== \\
// ======== Sample Code ApplyMask author: T.P Wang / marc2003 ======== \\

// ======== AUTHOR L.E.D. AI ASSISTED ======== \\
// ======= SMP 64bit Disc Spin V2 Script ======= \\
// ======= Spins Disc + Artwork + Cover  ========= \\

window.DefineScript('SMP 64bit Disc Spin', { author: 'L.E.D.' });

// ====================== CONSTANTS ======================
const tf_path = fb.TitleFormat("$directory_path(%path%)");

const TIMER_INTERVAL = 50;          // 30-60 recommended, lower Faster Spin, Performance hit
const MAX_IMAGE_SIZE = 250;         // Raise for Larger Panels, 250-1000 recommended
const MAX_STATIC_SIZE = 2000;       // Max size for static images (memory protection)
const MAX_CACHE_ENTRIES = 50;
const MAX_MASK_CACHE = 10;
const MAX_RIM_CACHE = 10;
const MAX_FILE_CACHE = 100;

const DEFAULT_DISC_PATH = fb.ProfilePath + "skins\\default_disc.png";
const MASK_PATH = fb.ProfilePath + "skins\\mask.png";
const RIM_PATH = fb.ProfilePath + "skins\\center_album_rim.png";

// Pre-build disc file list
const DISC_FILES = Object.freeze([
    "\\disc.png", "\\disc.jpg", "\\cd.png", "\\cd.jpg",
    "\\CD.png", "\\CD.jpg", "\\media.png", "\\media.jpg",
    "\\vinyl.png", "\\vinyl.jpg"
]);

// Interpolation mode options
const INTERPOLATION_MODES = Object.freeze([
    { name: "Nearest Neighbor (Fastest)", value: 5 },
    { name: "Low Quality", value: 1 },
    { name: "Bilinear", value: 3 },
    { name: "High Quality Bilinear", value: 6 },
    { name: "High Quality Bicubic (Best)", value: 7 }
]);

const SMOOTHING_MODE = 4;           // AntiAlias
const DISC_SCALE_FACTOR = 0.98;     // Lower is Effectively More Padding
const ANGLE_MODULO = 360;
const LOAD_DEBOUNCE_MS = 100;

// ====================== STATE ======================
let img = null;
let angle = 0;
let isDiscImage = false;
let timerId = null;
let loadDebounceTimer = null;
let currentMetadb = null;

// Paint cache (avoid recalculating every frame)
let paintCache = {
    windowWidth: 0,
    windowHeight: 0,
    discSize: 0,
    discX: 0,
    discY: 0,
    staticW: 0,
    staticH: 0,
    staticX: 0,
    staticY: 0,
    bgColor: 0,
    imgWidth: 0,
    imgHeight: 0,
    keepAspectRatio: true,
    valid: false
};

// ====================== SETTINGS ======================
let spinningEnabled = window.GetProperty("RP.SpinningEnabled", true);
let spinSpeed = window.GetProperty("RP.SpinSpeed", 2.0);
let useAlbumArtOnly = window.GetProperty("RP.UseAlbumArtOnly", false);
let keepAspectRatio = window.GetProperty("RP.KeepAspectRatio", true);
let interpolationMode = window.GetProperty("RP.InterpolationMode", 5);
let savedPath = window.GetProperty("RP.SavedPath", "");
let savedIsDisc = window.GetProperty("RP.SavedIsDisc", false);

// ====================== OPTIMIZED LRU CACHE ======================
class LRUCache {
    constructor(maxSize) {
        this.maxSize = maxSize;
        this.cache = new Map();
    }

    get(key) {
        if (!this.cache.has(key)) return null;
        
        // Move to end (most recently used)
        const value = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }

    set(key, value) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }
        
        this.cache.set(key, value);
        
        // Evict oldest if over limit
        if (this.cache.size > this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            const toDelete = this.cache.get(firstKey);
            
            if (toDelete && typeof toDelete.Dispose === 'function') {
                toDelete.Dispose();
            }
            
            this.cache.delete(firstKey);
        }
    }

    has(key) {
        return this.cache.has(key);
    }

    clear() {
        this.cache.forEach(item => {
            if (item && typeof item.Dispose === 'function') {
                item.Dispose();
            }
        });
        this.cache.clear();
    }
}

// ====================== CACHES ======================
const imageCache = new LRUCache(MAX_CACHE_ENTRIES);
const maskCache = new LRUCache(MAX_MASK_CACHE);
const rimCache = new LRUCache(MAX_RIM_CACHE);
const fileExistsCache = new Map();

// ====================== FILE HELPERS ======================
function checkFileExists(path) {
    if (fileExistsCache.has(path)) {
        return fileExistsCache.get(path);
    }
    
    const exists = utils.FileTest(path, "e");
    fileExistsCache.set(path, exists);
    
    // Limit cache size
    if (fileExistsCache.size > MAX_FILE_CACHE) {
        const firstKey = fileExistsCache.keys().next().value;
        fileExistsCache.delete(firstKey);
    }
    
    return exists;
}

// ====================== MASK & RIM ======================
const maskSource = checkFileExists(MASK_PATH) ? gdi.Image(MASK_PATH) : null;
const rimSource = checkFileExists(RIM_PATH) ? gdi.Image(RIM_PATH) : null;

function getResizedMask(w, h) {
    if (!maskSource) return null;

    const key = `${w}x${h}`;
    const cached = maskCache.get(key);
    if (cached) return cached;

    const resized = maskSource.Resize(w, h);
    maskCache.set(key, resized);
    return resized;
}

function getResizedRim(size) {
    if (!rimSource) return null;

    const key = size.toString();
    const cached = rimCache.get(key);
    if (cached) return cached;

    const resized = rimSource.Resize(size, size);
    rimCache.set(key, resized);
    return resized;
}

// ====================== IMAGE PROCESSING ======================
function scaleImage(raw, maxSize) {
    if (!raw) return null;

    const w = raw.Width;
    const h = raw.Height;
    const maxDim = Math.max(w, h);

    // Early return if no scaling needed
    if (maxDim <= maxSize) return raw;

    const scale = maxSize / maxDim;
    const nw = Math.floor(w * scale);
    const nh = Math.floor(h * scale);

    const newImg = gdi.CreateImage(nw, nh);
    const g = newImg.GetGraphics();
    g.SetInterpolationMode(interpolationMode);
    g.DrawImage(raw, 0, 0, nw, nh, 0, 0, w, h);
    newImg.ReleaseGraphics(g);

    // Dispose original
    if (typeof raw.Dispose === 'function') {
        raw.Dispose();
    }

    return newImg;
}

function applyMaskSafe(image) {
    if (!maskSource || !image) return image;

    const w = image.Width;
    const h = image.Height;
    
    const clone = image.Clone(0, 0, w, h);
    const resizedMask = getResizedMask(w, h);

    if (resizedMask) {
        clone.ApplyMask(resizedMask);
    }

    // Dispose original
    if (typeof image.Dispose === 'function') {
        image.Dispose();
    }

    return clone;
}

function setImage(newImg, discState) {
    // Dispose old image if different
    if (img && img !== newImg && typeof img.Dispose === 'function') {
        img.Dispose();
    }
    
    img = newImg;
    isDiscImage = discState;
    paintCache.valid = false;
    
    window.Repaint();
}

function saveState(path, disc) {
    if (!path || path === "embedded") return;
    if (savedPath === path && savedIsDisc === disc) return;

    savedPath = path;
    savedIsDisc = disc;

    window.SetProperty("RP.SavedPath", path);
    window.SetProperty("RP.SavedIsDisc", disc);
}

// ====================== PAINT CACHE ======================
function updatePaintCache() {
    const w = window.Width;
    const h = window.Height;
    
    // Check if recalculation needed
    if (paintCache.valid && 
        paintCache.windowWidth === w && 
        paintCache.windowHeight === h &&
        paintCache.imgWidth === (img ? img.Width : 0) &&
        paintCache.imgHeight === (img ? img.Height : 0) &&
        paintCache.keepAspectRatio === keepAspectRatio) {
        return;
    }

    paintCache.windowWidth = w;
    paintCache.windowHeight = h;
    paintCache.keepAspectRatio = keepAspectRatio;
    paintCache.bgColor = window.GetColourDUI(1);
    
    if (img) {
        paintCache.imgWidth = img.Width;
        paintCache.imgHeight = img.Height;
        
        if (isDiscImage) {
            // Disc mode
            const size = Math.min(w, h) * DISC_SCALE_FACTOR;
            paintCache.discSize = size;
            paintCache.discX = (w - size) / 2;
            paintCache.discY = (h - size) / 2;
        } else {
            // Static mode
            let sw = w;
            let sh = h;
            let sx = 0;
            let sy = 0;

            if (keepAspectRatio) {
                const ratio = Math.min(w / img.Width, h / img.Height);
                sw = img.Width * ratio;
                sh = img.Height * ratio;
                sx = (w - sw) / 2;
                sy = (h - sh) / 2;
            }

            paintCache.staticW = sw;
            paintCache.staticH = sh;
            paintCache.staticX = sx;
            paintCache.staticY = sy;
        }
    }
    
    paintCache.valid = true;
}

// ====================== TIMER ======================
function updateTimer() {
    const shouldRun =
        img &&
        isDiscImage &&
        spinningEnabled &&
        fb.IsPlaying &&
        !fb.IsPaused &&
        !useAlbumArtOnly;

    if (shouldRun && !timerId) {
        timerId = window.SetInterval(() => {
            angle = (angle + spinSpeed) % ANGLE_MODULO;
            window.Repaint();
        }, TIMER_INTERVAL);
    }
    else if (!shouldRun && timerId) {
        window.ClearInterval(timerId);
        timerId = null;
    }
}

function stopTimer() {
    if (timerId) {
        window.ClearInterval(timerId);
        timerId = null;
    }
}

// ====================== IMAGE LOADING ======================
function loadImageCached(path, mask) {
    const key = mask ? `${path}|m` : `${path}|r`;

    const cached = imageCache.get(key);
    if (cached) return cached;
    
    if (!checkFileExists(path)) return null;

    let raw = gdi.Image(path);
    if (!raw) return null;

    const scaled = scaleImage(raw, MAX_IMAGE_SIZE);
    const finalImg = mask ? applyMaskSafe(scaled) : scaled;

    imageCache.set(key, finalImg);
    return finalImg;
}

function loadDiscImage(metadb, immediate = false) {
    if (!metadb) return;

    // Clear pending load
    if (loadDebounceTimer) {
        window.ClearTimeout(loadDebounceTimer);
        loadDebounceTimer = null;
    }

    const doLoad = () => {
        currentMetadb = metadb;
        angle = 0;

        const folderPath = tf_path.EvalWithMetadb(metadb);

        // Search for disc images
        if (!useAlbumArtOnly) {
            for (let i = 0; i < DISC_FILES.length; i++) {
                const p = folderPath + DISC_FILES[i];
                const found = loadImageCached(p, true);

                if (found) {
                    setImage(found, true);
                    saveState(p, true);
                    updateTimer();
                    return;
                }
            }
        }

        // Fallback to album art
        utils.GetAlbumArtAsync(window.ID, metadb, 0);
    };

    if (immediate) {
        doLoad();
    } else {
        loadDebounceTimer = window.SetTimeout(doLoad, LOAD_DEBOUNCE_MS);
    }
}

// ====================== CALLBACKS ======================
function on_get_album_art_done(metadb, art_id, image, image_path) {
    if (!currentMetadb || !metadb.Compare(currentMetadb)) {
        if (image && typeof image.Dispose === 'function') {
            image.Dispose();
        }
        return;
    }

    if (image) {
        if (useAlbumArtOnly) {
            // Static album art - limit size for memory protection
            const scaled = scaleImage(image, MAX_STATIC_SIZE);
            setImage(scaled, false);
            if (image_path) saveState(image_path, false);
        } else {
            // Spinning disc - scale to performance size and mask
            const scaled = scaleImage(image, MAX_IMAGE_SIZE);
            const masked = applyMaskSafe(scaled);
            setImage(masked, true);
            if (image_path) saveState(image_path, true);
        }
    } else {
        // Fallback to default disc
        const fallback = loadImageCached(DEFAULT_DISC_PATH, true);
        if (fallback) {
            setImage(fallback, true);
            saveState(DEFAULT_DISC_PATH, true);
        }
    }

    updateTimer();
}

function on_selection_changed() {
    if (fb.IsPlaying || fb.IsPaused) return;
    
    const sel = fb.GetSelection();
    if (sel && sel.Count > 0) {
        loadDiscImage(sel.Item(0));
    }
}

function on_playback_new_track(metadb) {
    loadDiscImage(metadb, true);
}

function on_playback_pause() { 
    updateTimer(); 
}

function on_playback_stop() {
    angle = 0;
    updateTimer();
}

function on_playback_starting() {
    updateTimer();
}

function on_size() {
    paintCache.valid = false;
    maskCache.clear();
    rimCache.clear();
    window.Repaint();
}

function on_script_unload() {
    stopTimer();
    
    if (loadDebounceTimer) {
        window.ClearTimeout(loadDebounceTimer);
    }
    
    if (img && typeof img.Dispose === 'function') {
        img.Dispose();
    }
    
    imageCache.clear();
    maskCache.clear();
    rimCache.clear();
    fileExistsCache.clear();
    
    if (maskSource && typeof maskSource.Dispose === 'function') {
        maskSource.Dispose();
    }
    if (rimSource && typeof rimSource.Dispose === 'function') {
        rimSource.Dispose();
    }
}

// ====================== PAINT ======================
function on_paint(gr) {
    updatePaintCache();
    
    gr.FillSolidRect(0, 0, paintCache.windowWidth, paintCache.windowHeight, paintCache.bgColor);
    
    if (!img) return;

    if (!isDiscImage) {
        // Static album art
        gr.SetInterpolationMode(interpolationMode);
        gr.DrawImage(
            img, 
            paintCache.staticX, 
            paintCache.staticY, 
            paintCache.staticW, 
            paintCache.staticH, 
            0, 0, 
            paintCache.imgWidth, 
            paintCache.imgHeight
        );
    } else {
        // Spinning disc
        gr.SetInterpolationMode(interpolationMode);
        gr.SetSmoothingMode(SMOOTHING_MODE);

        const size = paintCache.discSize;
        const x = paintCache.discX;
        const y = paintCache.discY;

        // Draw disc
        gr.DrawImage(
            img, 
            x, y, size, size, 
            0, 0, paintCache.imgWidth, paintCache.imgHeight, 
            angle
        );

        // Draw rim overlay
        const rimSize = Math.floor(size);
        const rim = getResizedRim(rimSize);
        
        if (rim) {
            gr.DrawImage(
                rim, 
                x, y, size, size, 
                0, 0, rim.Width, rim.Height,
                angle
            );
        }
    }
}

// ====================== MENU ======================
function on_mouse_rbtn_up(x, y) {
    const menu = window.CreatePopupMenu();
    const speedMenu = window.CreatePopupMenu();
    const interpMenu = window.CreatePopupMenu();

    menu.AppendMenuItem(0, 1, "Album Art Only (Static)");
    menu.CheckMenuItem(1, useAlbumArtOnly);

    menu.AppendMenuItem(0, 2, "Spinning Enabled");
    menu.CheckMenuItem(2, spinningEnabled);

    menu.AppendMenuItem(0, 3, "Keep Aspect Ratio");
    menu.CheckMenuItem(3, keepAspectRatio);

    // Speed submenu
    speedMenu.AppendMenuItem(0, 10, "Slow (0.5x)");
    speedMenu.AppendMenuItem(0, 11, "Normal (2.0x)");
    speedMenu.AppendMenuItem(0, 12, "Fast (5.0x)");

    const speedIdx = spinSpeed <= 0.5 ? 10 : (spinSpeed >= 5.0 ? 12 : 11);
    speedMenu.CheckMenuRadioItem(10, 12, speedIdx);

    speedMenu.AppendTo(menu, 0, "Rotation Speed");

    // Interpolation mode submenu
    INTERPOLATION_MODES.forEach((mode, i) => {
        interpMenu.AppendMenuItem(0, 20 + i, mode.name);
        if (interpolationMode === mode.value) {
            interpMenu.CheckMenuItem(20 + i, true);
        }
    });

    interpMenu.AppendTo(menu, 0, "Image Quality");

    const idx = menu.TrackPopupMenu(x, y);
    let changed = false;

    switch (idx) {
        case 1:
            useAlbumArtOnly = !useAlbumArtOnly;
            window.SetProperty("RP.UseAlbumArtOnly", useAlbumArtOnly);
            if (currentMetadb) loadDiscImage(currentMetadb, true);
            changed = true;
            break;

        case 2:
            spinningEnabled = !spinningEnabled;
            window.SetProperty("RP.SpinningEnabled", spinningEnabled);
            updateTimer();
            changed = true;
            break;

        case 3:
            keepAspectRatio = !keepAspectRatio;
            window.SetProperty("RP.KeepAspectRatio", keepAspectRatio);
            paintCache.valid = false;
            changed = true;
            break;

        case 10:
            if (spinSpeed !== 0.5) {
                spinSpeed = 0.5;
                window.SetProperty("RP.SpinSpeed", spinSpeed);
                changed = true;
            }
            break;

        case 11:
            if (spinSpeed !== 2.0) {
                spinSpeed = 2.0;
                window.SetProperty("RP.SpinSpeed", spinSpeed);
                changed = true;
            }
            break;

        case 12:
            if (spinSpeed !== 5.0) {
                spinSpeed = 5.0;
                window.SetProperty("RP.SpinSpeed", spinSpeed);
                changed = true;
            }
            break;

        // Interpolation mode cases
        case 20:
        case 21:
        case 22:
        case 23:
        case 24:
            const newMode = INTERPOLATION_MODES[idx - 22].value;
            if (interpolationMode !== newMode) {
                interpolationMode = newMode;
                window.SetProperty("RP.InterpolationMode", interpolationMode);
                // Clear image cache to force re-render with new quality
                imageCache.clear();
                // Reload current image
                if (currentMetadb) {
                    loadDiscImage(currentMetadb, true);
                }
                changed = true;
            }
            break;
    }

    if (changed) {
        window.Repaint();
    }

    return true;
}

// ====================== INIT ======================
function init() {
    const nowPlaying = fb.GetNowPlaying();
    
    if (nowPlaying) {
        loadDiscImage(nowPlaying, true);
    } else if (savedPath && checkFileExists(savedPath)) {
        const cached = loadImageCached(savedPath, savedIsDisc);
        if (cached) setImage(cached, savedIsDisc);
    }
    
    updateTimer();
}

(function waitForReady() {
    if (window.Width > 0 && window.Height > 0) {
        init();
    } else {
        window.SetTimeout(waitForReady, 50);
    }
})();