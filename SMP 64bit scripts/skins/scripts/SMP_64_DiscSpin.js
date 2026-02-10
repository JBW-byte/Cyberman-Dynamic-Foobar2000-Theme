		    // ======== AUTHOR L.E.D. AI ASSISTED ======== \\
		   // ======= SMP 64bit Disc Spin V2 Script ======= \\
		  // ======= Spins Disc + Artwork + Cover  ========= \\

   // ===================*** Foobar2000 64bit ***================== \\
  // ======= For Spider Moneky Panel 64bit, author: marc2003 ======= \\
 // ====== Masking All Images, Creates a Disc from Album Art+  ====== \\
// ======= Sample Code ApplyMask author: T.P Wang / marc2003  ======== \\

window.DefineScript('SMP 64bit Disc Spin v2', { author: 'L.E.D.' });

// =================== SETTINGS ===================

const tf_path = fb.TitleFormat("$directory_path(%path%)");
const timerInterval = 50;     // Lower for More FPS, Performance Hit
const MAX_IMAGE_SIZE = 500;   // 250 to 1000 rec. Raise for Large Panels, Performance Hit

const DEFAULT_DISC_PATH = fb.ProfilePath + "skins\\default_disc.png";
const MASK_PATH = fb.ProfilePath + "skins\\mask.png";
const VINYL_MASK_PATH = fb.ProfilePath + "skins\\vinyl_mask.png";
const CENTER_RIM_PATH = fb.ProfilePath + "skins\\center_album_rim.png";

// =================== LOAD STATIC IMAGES ===================
const maskSource = utils.FileTest(MASK_PATH, "e") ? gdi.Image(MASK_PATH) : null;
const vinylMaskSource = utils.FileTest(VINYL_MASK_PATH, "e") ? gdi.Image(VINYL_MASK_PATH) : null;
const centerRimImage = utils.FileTest(CENTER_RIM_PATH, "e") ? gdi.Image(CENTER_RIM_PATH) : null;

// =================== STATE ===================
let img = null;
let angle = 0;
let isDiscImage = false;
let isMaskedAlbumArt = false;
let timerId = null;
let currentMetadb = null;

// =================== CACHE ===================
const imageCache = new Map();

// =================== USER SETTINGS ===================
let spinningEnabled = window.GetProperty("RP.SpinningEnabled", true);
let spinSpeed = window.GetProperty("RP.SpinSpeed", 2.0);
let useAlbumArtOnly = window.GetProperty("RP.UseAlbumArtOnly", false);
let keepAspectRatio = window.GetProperty("RP.KeepAspectRatio", true);
let savedPath = window.GetProperty("RP.SavedPath", "");
let savedIsDisc = window.GetProperty("RP.SavedIsDisc", false);

// =================== HELPERS ===================
function setImage(i) { img = i; }

function scaleImage(src, maxSize) {
    if (!src) return null;
    if (src.Width <= maxSize && src.Height <= maxSize) return src;

    const scale = maxSize / Math.max(src.Width, src.Height);
    const w = Math.floor(src.Width * scale);
    const h = Math.floor(src.Height * scale);

    const out = gdi.CreateImage(w, h);
    const g = out.GetGraphics();
    g.SetInterpolationMode(7);
    g.DrawImage(src, 0, 0, w, h, 0, 0, src.Width, src.Height);
    out.ReleaseGraphics(g);
    return out;
}

// =================== MASK + CENTER RIM (BAKED ONCE) ===================
function applyMaskAndCenter(imgToMask, path) {
    if (!imgToMask || !maskSource) return imgToMask;

    let maskImg = maskSource;
    if (path && /vinyl\.(png|jpg)$/i.test(path) && vinylMaskSource) {
        maskImg = vinylMaskSource;
    }

    const resizedMask = maskImg.Resize(imgToMask.Width, imgToMask.Height);
    imgToMask.ApplyMask(resizedMask);

    // Bake center rim ONLY for masked album art
    if (isMaskedAlbumArt && centerRimImage) {
        const g = imgToMask.GetGraphics();
        g.SetInterpolationMode(7);
        g.DrawImage(
            centerRimImage,
            0, 0, imgToMask.Width, imgToMask.Height,
            0, 0, centerRimImage.Width, centerRimImage.Height
        );
        imgToMask.ReleaseGraphics(g);
    }

    return imgToMask;
}

function loadImageCached(path, masked) {
    const key = path + (masked ? "|mask" : "|raw");
    if (imageCache.has(key)) return imageCache.get(key);
    if (!utils.FileTest(path, "e")) return null;

    let raw = gdi.Image(path);
    if (!raw) return null;

    raw = scaleImage(raw, MAX_IMAGE_SIZE);
    if (masked) raw = applyMaskAndCenter(raw, path);

    imageCache.set(key, raw);
    return raw;
}

// =================== TIMER ===================
function updateTimer() {
    const shouldSpin =
        img && isDiscImage && spinningEnabled &&
        fb.IsPlaying && !fb.IsPaused && !useAlbumArtOnly;

    if (shouldSpin && !timerId) {
        timerId = window.SetInterval(() => {
            angle = (angle + spinSpeed) % 360;
            window.Repaint();
        }, timerInterval);
    } else if (!shouldSpin && timerId) {
        window.ClearInterval(timerId);
        timerId = null;
    }
}

// =================== SAVE ===================
function saveState(path, isDisc) {
    if (!path || path === "embedded") return;
    window.SetProperty("RP.SavedPath", path);
    window.SetProperty("RP.SavedIsDisc", isDisc);
}

// =================== LOAD DISC / ART ===================
function loadDiscImage(metadb) {
    if (!metadb) return;

    currentMetadb = metadb;
    img = null;
    isDiscImage = false;
    isMaskedAlbumArt = false;

    const folder = tf_path.EvalWithMetadb(metadb);

    if (useAlbumArtOnly) {
        utils.GetAlbumArtAsync(window.ID, metadb, 0);
        updateTimer();
        return;
    }

    const discFiles = [
        "\\disc.png","\\disc.jpg","\\cd.png","\\cd.jpg",
        "\\media.png","\\media.jpg","\\vinyl.png","\\vinyl.jpg"
    ];

    for (let f of discFiles) {
        const p = folder + f;
        if (utils.FileTest(p, "e")) {
            const d = loadImageCached(p, true);
            if (d) {
                setImage(d);
                isDiscImage = true;
                saveState(p, true);
                updateTimer();
                window.Repaint();
                return;
            }
        }
    }

    isMaskedAlbumArt = true;
    utils.GetAlbumArtAsync(window.ID, metadb, 0);
}

// =================== ALBUM ART CALLBACK ===================
function on_get_album_art_done(metadb, id, image, image_path) {
    if (!currentMetadb || !metadb.Compare(currentMetadb)) return;

    if (image) {
        let scaled = scaleImage(image, MAX_IMAGE_SIZE);
        let masked = scaled;

        if (!useAlbumArtOnly) {
            isMaskedAlbumArt = true;
            masked = applyMaskAndCenter(scaled);
        }

        const key = (image_path || metadb.Path) + (useAlbumArtOnly ? "|raw" : "|mask");
        if (!imageCache.has(key)) imageCache.set(key, masked);

        setImage(imageCache.get(key));
        isDiscImage = !useAlbumArtOnly;
        saveState(image_path, false);
    } else {
        const fallback = loadImageCached(DEFAULT_DISC_PATH, true);
        if (fallback) {
            setImage(fallback);
            isDiscImage = true;
            saveState(DEFAULT_DISC_PATH, true);
        }
    }

    updateTimer();
    window.Repaint();
}

// =================== EVENTS ===================
function on_playback_new_track(m) { angle = 0; loadDiscImage(m); }
function on_playback_pause() { updateTimer(); }
function on_playback_stop() { angle = 0; updateTimer(); }

// =================== PAINT ===================
function on_paint(gr) {
    gr.FillSolidRect(0, 0, window.Width, window.Height, window.GetColourDUI(1));
    if (!img) return;

    gr.SetInterpolationMode(7);
    gr.SetSmoothingMode(4);

    if (isDiscImage && spinningEnabled && !useAlbumArtOnly) {
        const size = Math.floor(Math.min(window.Width, window.Height) * 0.95);
        const x = (window.Width - size) >> 1;
        const y = (window.Height - size) >> 1;

        gr.DrawImage(img, x, y, size, size, 0, 0, img.Width, img.Height, angle);
    } else {
        let w = window.Width, h = window.Height, x = 0, y = 0;
        if (keepAspectRatio) {
            const r = Math.min(w / img.Width, h / img.Height);
            w = img.Width * r; h = img.Height * r;
            x = (window.Width - w) >> 1;
            y = (window.Height - h) >> 1;
        }
        gr.DrawImage(img, x, y, w, h, 0, 0, img.Width, img.Height);
    }
}

// =================== MENU ===================
function on_mouse_rbtn_up(x, y) {
    const menu = window.CreatePopupMenu();

    // Album art mode
    menu.AppendMenuItem(0, 1, "Album Art Only (Static)");
    menu.CheckMenuItem(1, useAlbumArtOnly);

    // Spinning toggle
    menu.AppendMenuItem(0, 2, "Spinning Enabled");
    menu.CheckMenuItem(2, spinningEnabled);

    // Aspect ratio
    menu.AppendMenuItem(0, 3, "Keep Aspect Ratio");
    menu.CheckMenuItem(3, keepAspectRatio);

    // Rotation speed submenu
    const speedMenu = window.CreatePopupMenu();
    speedMenu.AppendMenuItem(0, 10, "Slow");
    speedMenu.AppendMenuItem(0, 11, "Normal");
    speedMenu.AppendMenuItem(0, 12, "Fast");

    speedMenu.CheckMenuRadioItem(
        10,
        12,
        spinSpeed <= 0.6 ? 10 :
        spinSpeed >= 4.5 ? 12 : 11
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
            window.Repaint();
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
