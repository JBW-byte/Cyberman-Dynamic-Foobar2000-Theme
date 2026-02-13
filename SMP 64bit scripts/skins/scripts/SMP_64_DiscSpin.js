// =====================================================
// SMP 64bit Disc Spin V3 - Optimized + Center Rim
// Full Functionality Restored + Rim Overlay
// =====================================================

window.DefineScript('SMP Disc Spin V3 - Optimized + Rim', { author: 'L.E.D.' });

// ====================== CONSTANTS ======================
const tf_path = fb.TitleFormat("$directory_path(%path%)");

const TIMER_INTERVAL = 33;          // ~30 FPS balanced
const MAX_IMAGE_SIZE = 300;
const MAX_CACHE_ENTRIES = 50;
const MAX_MASK_CACHE = 10;
const MAX_RIM_CACHE = 10;

const DEFAULT_DISC_PATH = fb.ProfilePath + "skins\\default_disc.png";
const MASK_PATH = fb.ProfilePath + "skins\\mask.png";
const RIM_PATH = fb.ProfilePath + "skins\\center_album_rim.png";

// ====================== STATE ======================
let img = null;
let angle = 0;
let isDiscImage = false;
let timerId = null;
let currentMetadb = null;

// ====================== SETTINGS ======================
let spinningEnabled = window.GetProperty("RP.SpinningEnabled", true);
let spinSpeed = window.GetProperty("RP.SpinSpeed", 2.0);
let useAlbumArtOnly = window.GetProperty("RP.UseAlbumArtOnly", false);
let keepAspectRatio = window.GetProperty("RP.KeepAspectRatio", true);
let savedPath = window.GetProperty("RP.SavedPath", "");
let savedIsDisc = window.GetProperty("RP.SavedIsDisc", false);

// ====================== IMAGE CACHE (LRU) ======================
const imageCache = new Map();

function cacheSet(key, value) {
    if (imageCache.has(key)) imageCache.delete(key);
    imageCache.set(key, value);

    if (imageCache.size > MAX_CACHE_ENTRIES) {
        const firstKey = imageCache.keys().next().value;
        imageCache.delete(firstKey);
    }
}

// ====================== MASK ======================
const maskSource = utils.FileTest(MASK_PATH, "e") ? gdi.Image(MASK_PATH) : null;
const maskCache = new Map();

function getResizedMask(w, h) {
    if (!maskSource) return null;

    const key = w + "x" + h;
    if (maskCache.has(key)) return maskCache.get(key);

    const resized = maskSource.Resize(w, h);

    if (maskCache.size >= MAX_MASK_CACHE) {
        const firstKey = maskCache.keys().next().value;
        maskCache.delete(firstKey);
    }

    maskCache.set(key, resized);
    return resized;
}

// ====================== RIM OVERLAY ======================
const rimSource = utils.FileTest(RIM_PATH, "e") ? gdi.Image(RIM_PATH) : null;
const rimCache = new Map();

function getResizedRim(size) {
    if (!rimSource) return null;

    const key = size.toString();
    if (rimCache.has(key)) return rimCache.get(key);

    const resized = rimSource.Resize(size, size);

    if (rimCache.size >= MAX_RIM_CACHE) {
        const firstKey = rimCache.keys().next().value;
        rimCache.delete(firstKey);
    }

    rimCache.set(key, resized);
    return resized;
}

// ====================== HELPERS ======================
function scaleImage(raw) {
    if (!raw) return null;

    const w = raw.Width;
    const h = raw.Height;

    if (w <= MAX_IMAGE_SIZE && h <= MAX_IMAGE_SIZE) return raw;

    const scale = MAX_IMAGE_SIZE / Math.max(w, h);
    const nw = Math.floor(w * scale);
    const nh = Math.floor(h * scale);

    const newImg = gdi.CreateImage(nw, nh);
    const g = newImg.GetGraphics();
    g.SetInterpolationMode(7);
    g.DrawImage(raw, 0, 0, nw, nh, 0, 0, w, h);
    newImg.ReleaseGraphics(g);

    return newImg;
}

function applyMaskSafe(image) {
    if (!maskSource) return image;

    const clone = image.Clone(0, 0, image.Width, image.Height);
    const resizedMask = getResizedMask(image.Width, image.Height);

    if (resizedMask) clone.ApplyMask(resizedMask);

    return clone;
}

function setImage(newImg, discState) {
    img = newImg;
    isDiscImage = discState;
    window.Repaint();
}

function saveState(path, disc) {
    if (!path || path === "embedded") return;

    savedPath = path;
    savedIsDisc = disc;

    window.SetProperty("RP.SavedPath", path);
    window.SetProperty("RP.SavedIsDisc", disc);
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
            angle += spinSpeed;
            if (angle >= 360) angle -= 360;
            window.Repaint();
        }, TIMER_INTERVAL);
    }
    else if (!shouldRun && timerId) {
        window.ClearInterval(timerId);
        timerId = null;
    }
}

// ====================== IMAGE LOADING ======================
function loadImageCached(path, mask) {
    const key = path + (mask ? "|mask" : "|raw");

    if (imageCache.has(key)) return imageCache.get(key);
    if (!utils.FileTest(path, "e")) return null;

    const raw = gdi.Image(path);
    if (!raw) return null;

    const scaled = scaleImage(raw);
    const finalImg = mask ? applyMaskSafe(scaled) : scaled;

    cacheSet(key, finalImg);
    return finalImg;
}

function loadDiscImage(metadb) {
    if (!metadb) return;

    currentMetadb = metadb;
    angle = 0;

    const folderPath = tf_path.EvalWithMetadb(metadb);

    // ===== Disc Search =====
    if (!useAlbumArtOnly) {
        const discFiles = [
            "\\disc.png","\\disc.jpg","\\cd.png","\\cd.jpg",
            "\\CD.png","\\CD.jpg","\\media.png","\\media.jpg",
            "\\vinyl.png","\\vinyl.jpg"
        ];

        for (let i = 0; i < discFiles.length; i++) {
            const p = folderPath + discFiles[i];
            const found = loadImageCached(p, true);

            if (found) {
                setImage(found, true);
                saveState(p, true);
                updateTimer();
                return;
            }
        }
    }

    // ===== Album Art Fallback =====
    utils.GetAlbumArtAsync(window.ID, metadb, 0);
}

// ====================== ALBUM CALLBACK ======================
function on_get_album_art_done(metadb, art_id, image, image_path) {
    if (!currentMetadb || !metadb.Compare(currentMetadb)) return;

    if (image) {
        const scaled = scaleImage(image);

        if (useAlbumArtOnly) {
            // Static album art
            setImage(scaled, false);
            if (image_path) saveState(image_path, false);
        } else {
            // Album art as spinning disc
            const masked = applyMaskSafe(scaled);
            setImage(masked, true);
            if (image_path) saveState(image_path, true);
        }
    }
    else {
        const fallback = loadImageCached(DEFAULT_DISC_PATH, true);
        if (fallback) {
            setImage(fallback, true);
            saveState(DEFAULT_DISC_PATH, true);
        }
    }

    updateTimer();
}

// ====================== CALLBACKS ======================
function on_selection_changed() {
    if (fb.IsPlaying || fb.IsPaused) return;
    const sel = fb.GetSelection();
    if (sel && sel.Count > 0) loadDiscImage(sel.Item(0));
}

function on_playback_new_track(metadb) {
    loadDiscImage(metadb);
}

function on_playback_pause() { updateTimer(); }

function on_playback_stop() {
    angle = 0;
    updateTimer();
}

// ====================== PAINT ======================
function on_paint(gr) {
    gr.FillSolidRect(0, 0, window.Width, window.Height, window.GetColourDUI(1));
    if (!img) return;

    if (!isDiscImage) {
        // ===== Static Album Art =====
        let w = window.Width;
        let h = window.Height;
        let x = 0;
        let y = 0;

        if (keepAspectRatio) {
            const r = Math.min(w / img.Width, h / img.Height);
            w = img.Width * r;
            h = img.Height * r;
            x = (window.Width - w) / 2;
            y = (window.Height - h) / 2;
        }

        gr.DrawImage(img, x, y, w, h, 0, 0, img.Width, img.Height);
    }
    else {
        // ===== Spinning Disc =====
        const size = Math.min(window.Width, window.Height) * 0.98;
        const x = (window.Width - size) / 2;
        const y = (window.Height - size) / 2;

        gr.SetInterpolationMode(7);
        gr.SetSmoothingMode(4);

        // Draw disc
        gr.DrawImage(img, x, y, size, size, 0, 0, img.Width, img.Height, angle);

        // Draw center rim overlay (rotates with disc)
        const rim = getResizedRim(size);
        if (rim) {
            gr.DrawImage(rim, x, y, size, size, 0, 0, rim.Width, rim.Height, angle);
        }
    }
}

// ====================== MENU ======================
function on_mouse_rbtn_up(x, y) {
    const menu = window.CreatePopupMenu();

    menu.AppendMenuItem(0, 1, "Album Art Only (Static)");
    menu.CheckMenuItem(1, useAlbumArtOnly);

    menu.AppendMenuItem(0, 2, "Spinning Enabled");
    menu.CheckMenuItem(2, spinningEnabled);

    menu.AppendMenuItem(0, 3, "Keep Aspect Ratio");
    menu.CheckMenuItem(3, keepAspectRatio);

    const speedMenu = window.CreatePopupMenu();
    speedMenu.AppendMenuItem(0, 10, "Slow");
    speedMenu.AppendMenuItem(0, 11, "Normal");
    speedMenu.AppendMenuItem(0, 12, "Fast");

    speedMenu.CheckMenuRadioItem(
        10, 12,
        spinSpeed <= 0.5 ? 10 :
        spinSpeed >= 5.0 ? 12 : 11
    );

    speedMenu.AppendTo(menu, 0, "Rotation Speed");

    const idx = menu.TrackPopupMenu(x, y);

    switch (idx) {
        case 1:
            useAlbumArtOnly = !useAlbumArtOnly;
            window.SetProperty("RP.UseAlbumArtOnly", useAlbumArtOnly);
            loadDiscImage(fb.GetNowPlaying());
            break;

        case 2:
            spinningEnabled = !spinningEnabled;
            window.SetProperty("RP.SpinningEnabled", spinningEnabled);
            updateTimer();
            break;

        case 3:
            keepAspectRatio = !keepAspectRatio;
            window.SetProperty("RP.KeepAspectRatio", keepAspectRatio);
            break;

        case 10:
            spinSpeed = 0.5;
            window.SetProperty("RP.SpinSpeed", spinSpeed);
            break;

        case 11:
            spinSpeed = 2.0;
            window.SetProperty("RP.SpinSpeed", spinSpeed);
            break;

        case 12:
            spinSpeed = 5.0;
            window.SetProperty("RP.SpinSpeed", spinSpeed);
            break;
    }

    window.Repaint();
    return true;
}

// ====================== INIT ======================
function init() {
    if (fb.IsPlaying || fb.IsPaused) {
        loadDiscImage(fb.GetNowPlaying());
    }
    else if (savedPath && utils.FileTest(savedPath, "e")) {
        const cached = loadImageCached(savedPath, savedIsDisc);
        if (cached) setImage(cached, savedIsDisc);
    }
}

window.SetTimeout(init, 300);
