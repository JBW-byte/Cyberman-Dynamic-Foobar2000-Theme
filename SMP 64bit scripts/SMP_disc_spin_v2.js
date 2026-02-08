	        // ======== AUTHOR L.E.D. AI ASSISTED ======== \\
	       // ======= SMP 64bit Disc Spin V2 Script ======= \\
	      // ======= Spins Disc + Artwork + Cover  ========= \\

   // ===================*** Foobar2000 64bit ***================== \\
  // ======= For Spider Monekey Panel 64bit, author: marc2003 ====== \\
 // ====== Masking All Images, Creates a Disc from Album Art+  ====== \\
// ======== Sample Code ApplyMask author: T.P Wang / marc2003 ======== \\

window.DefineScript('SMP 64bit Disc Spin', { author: 'L.E.D.' });

// =================== SETTINGS ===================
const tf_path = fb.TitleFormat("$directory_path(%path%)");
const timerInterval = 50;   // lower values for smoother FPS, performance hit
const MAX_IMAGE_SIZE = 128; // Increase for larger panels, performance hit

const DEFAULT_DISC_PATH = fb.ProfilePath + "skins\\default_disc.png";
const MASK_PATH = fb.ProfilePath + "skins\\mask.png";

// =================== STATE ===================
let img = null;
let angle = 0;
let isDiscImage = false;
let timerId = null;
let currentMetadb = null;

// =================== CACHE ===================
const imageCache = new Map();

// =================== SETTINGS ===================
let spinningEnabled = window.GetProperty("RP.SpinningEnabled", true);
let spinSpeed = window.GetProperty("RP.SpinSpeed", 2.0);
let useAlbumArtOnly = window.GetProperty("RP.UseAlbumArtOnly", false);
let keepAspectRatio = window.GetProperty("RP.KeepAspectRatio", true);
let savedPath = window.GetProperty("RP.SavedPath", "");
let savedIsDisc = window.GetProperty("RP.SavedIsDisc", false);

// =================== MASK SOURCE (LOADED ONCE) ===================
const maskSource = utils.FileTest(MASK_PATH, "e") ? gdi.Image(MASK_PATH) : null;

// =================== IMAGE HELPERS ===================
function setImage(newImg) {
    img = newImg;
}

function scaleImage(rawImg, maxSize) {
    if (!rawImg) return null;

    const w = rawImg.Width;
    const h = rawImg.Height;
    if (w <= maxSize && h <= maxSize) return rawImg;

    const scale = maxSize / Math.max(w, h);
    const nw = Math.floor(w * scale);
    const nh = Math.floor(h * scale);

    const scaled = gdi.CreateImage(nw, nh);
    const g = scaled.GetGraphics();
    g.SetInterpolationMode(7);
    g.DrawImage(rawImg, 0, 0, nw, nh, 0, 0, w, h);
    scaled.ReleaseGraphics(g);

    return scaled;
}

function applyMask(imgToMask) {
    if (!imgToMask || !maskSource) return imgToMask;
    const resizedMask = maskSource.Resize(imgToMask.Width, imgToMask.Height);
    imgToMask.ApplyMask(resizedMask);
    return imgToMask;
}

function loadImageCached(path, mask) {
    const key = path + (mask ? "|mask" : "|raw");
    if (imageCache.has(key)) return imageCache.get(key);

    if (!utils.FileTest(path, "e")) return null;

    const raw = gdi.Image(path);
    if (!raw) return null;

    const scaled = scaleImage(raw, MAX_IMAGE_SIZE);
    const finalImg = mask ? applyMask(scaled) : scaled;

    imageCache.set(key, finalImg);
    return finalImg;
}

// =================== TIMER ===================
function updateTimer() {
    const shouldRun =
        !useAlbumArtOnly &&
        img &&
        isDiscImage &&
        spinningEnabled &&
        fb.IsPlaying &&
        !fb.IsPaused;

    if (shouldRun && !timerId) {
        timerId = window.SetInterval(() => {
            angle = (angle + spinSpeed) % 360;
            window.Repaint();
        }, timerInterval);
    } else if (!shouldRun && timerId) {
        window.ClearInterval(timerId);
        timerId = null;
    }
}

// =================== STATE SAVE ===================
function saveState(path, isDisc) {
    if (!path || path === "embedded") return;
    savedPath = path;
    savedIsDisc = isDisc;
    window.SetProperty("RP.SavedPath", path);
    window.SetProperty("RP.SavedIsDisc", isDisc);
}

// =================== DISC / ART LOADING ===================
function loadDiscImage(metadb) {
    if (!metadb) return;

    currentMetadb = metadb;
    isDiscImage = false;
    img = null;

    const folderPath = tf_path.EvalWithMetadb(metadb);

    if (useAlbumArtOnly) {
        utils.GetAlbumArtAsync(window.ID, metadb, 0);
        updateTimer();
        return;
    }

    // --- 1) Disc images ---
    const discFiles = [
        "\\disc.png","\\disc.jpg","\\cd.png","\\cd.jpg",
        "\\CD.png","\\CD.jpg","\\media.png","\\media.jpg",
        "\\vinyl.png","\\vinyl.jpg"
    ];

    for (let f of discFiles) {
        const p = folderPath + f;
        if (utils.FileTest(p, "e")) {
            const cached = loadImageCached(p, true);
            if (cached) {
                setImage(cached);
                isDiscImage = true;
                saveState(p, true);
                updateTimer();
                window.Repaint();
                return;
            }
        }
    }

    // --- 2) Album art ---
    utils.GetAlbumArtAsync(window.ID, metadb, 0);
}

// =================== ALBUM ART CALLBACK ===================
function on_get_album_art_done(metadb, art_id, image, image_path) {
    if (!currentMetadb || !metadb || !metadb.Compare(currentMetadb)) return;

    if (image) {
        const scaled = scaleImage(image, MAX_IMAGE_SIZE);
        const maskIt = !useAlbumArtOnly;
        const key = (image_path || metadb.Path) + (maskIt ? "|mask" : "|raw");

        if (!imageCache.has(key)) {
            const finalImg = maskIt ? applyMask(scaled) : scaled;
            imageCache.set(key, finalImg);
        }

        setImage(imageCache.get(key));
        isDiscImage = maskIt;
        if (image_path) saveState(image_path, false);
    }
    else {
        // --- Default disc fallback ---
        const cached = loadImageCached(DEFAULT_DISC_PATH, !useAlbumArtOnly);
        if (cached) {
            setImage(cached);
            isDiscImage = !useAlbumArtOnly;
            saveState(DEFAULT_DISC_PATH, true);
        }
    }

    updateTimer();
    window.Repaint();
}

// =================== CALLBACKS ===================
function on_selection_changed() {
    if (fb.IsPlaying || fb.IsPaused) return;
    const sel = fb.GetSelection();
    if (sel && sel.Count > 0) loadDiscImage(sel.Item(0));
}

function on_playback_new_track(metadb) {
    angle = 0;
    loadDiscImage(metadb);
}

function on_playback_pause() { updateTimer(); }
function on_playback_stop() { angle = 0; updateTimer(); }

// =================== PAINT ===================
function on_paint(gr) {
    gr.FillSolidRect(0, 0, window.Width, window.Height, window.GetColourDUI(1));
    if (!img) return;

    gr.SetInterpolationMode(7);
    gr.SetSmoothingMode(4);

    if (!isDiscImage || useAlbumArtOnly) {
        let w = window.Width, h = window.Height, x = 0, y = 0;
        if (keepAspectRatio) {
            const r = Math.min(w / img.Width, h / img.Height);
            w = Math.floor(img.Width * r);
            h = Math.floor(img.Height * r);
            x = Math.floor((window.Width - w) / 2);
            y = Math.floor((window.Height - h) / 2);
        }
        gr.DrawImage(img, x, y, w, h, 0, 0, img.Width, img.Height);
    } else {
        const size = Math.floor(Math.min(window.Width, window.Height) * 0.98);
        const x = Math.floor((window.Width - size) / 2);
        const y = Math.floor((window.Height - size) / 2);
        gr.DrawImage(img, x, y, size, size, 0, 0, img.Width, img.Height, angle);
    }
}

// =================== INIT ===================
function init() {
    if (fb.IsPlaying || fb.IsPaused) {
        loadDiscImage(fb.GetNowPlaying());
    } else if (savedPath && utils.FileTest(savedPath, "e")) {
        const cached = loadImageCached(savedPath, savedIsDisc);
        if (cached) {
            setImage(cached);
            isDiscImage = savedIsDisc;
            window.Repaint();
        }
    }
}

window.SetTimeout(init, 250);

// =================== MENU ===================
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
        spinSpeed <= 0.5 ? 10 : spinSpeed >= 5.0 ? 12 : 11
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