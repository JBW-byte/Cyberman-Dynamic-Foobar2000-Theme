	       // ======== AUTHOR L.E.D. AI ASSISTED ======== \\
	      // ======= SMP 64bit Disc Spin V1 Script ======= \\
	     // ======= Spins Disc + Artwork + Cover  ========= \\

  // ===================*** Foobar2000 64bit ***================== \\
 // ======= For Spider Monekey Panel 64bit, author: marc2003 ====== \\
// ==== No Working Mask, Will Try and use in Future if Possibe  ==== \\

window.DefineScript('SMP 64bit Disc Spin', { author: 'L.E.D.' });

const tf_path = fb.TitleFormat("$directory_path(%path%)");

const timerInterval = 50;
const MAX_IMAGE_SIZE = 256;
const DEFAULT_DISC_PATH = fb.ProfilePath + "skins\\default_disc.png";

// --- STATE ---
let img = null;
let angle = 0;
let isDiscImage = false;
let timerId = null;
let currentMetadb = null;

// --- IMAGE CACHE (shared, SMP-safe) ---
const imageCache = new Map(); // path -> gdi.Image

// --- PERSISTENT SETTINGS ---
let spinningEnabled = window.GetProperty("RP.SpinningEnabled", true);
let spinSpeed = window.GetProperty("RP.SpinSpeed", 2.0);
let useAlbumArtOnly = window.GetProperty("RP.UseAlbumArtOnly", false);
let keepAspectRatio = window.GetProperty("RP.KeepAspectRatio", true);
let savedPath = window.GetProperty("RP.SavedPath", "");
let savedIsDisc = window.GetProperty("RP.SavedIsDisc", false);

// --- IMAGE HELPERS ---

function releaseImage() {
    img = null;
    // Optional, safe if you want:
    // CollectGarbage();
}

function setImage(newImg) {
    releaseImage();
    img = newImg;
}

function scaleImage(rawImg, maxSize) {
    if (!rawImg) return null;

    const w = rawImg.Width;
    const h = rawImg.Height;

    if (w <= maxSize && h <= maxSize) return rawImg;

    const scale = maxSize / Math.max(w, h);
    const newW = Math.floor(w * scale);
    const newH = Math.floor(h * scale);

    const scaled = gdi.CreateImage(newW, newH);
    const g = scaled.GetGraphics();
    g.SetInterpolationMode(7);
    g.DrawImage(rawImg, 0, 0, newW, newH, 0, 0, w, h);
    scaled.ReleaseGraphics(g);

    return scaled;
}

function loadImageCached(path) {
    if (imageCache.has(path)) {
        return imageCache.get(path);
    }

    const raw = gdi.Image(path);
    if (!raw) return null;

    const scaled = scaleImage(raw, MAX_IMAGE_SIZE);
    if (scaled) imageCache.set(path, scaled);
    return scaled;
}

// --- TIMER ---

function updateTimer() {
    const shouldRun =
        window.IsVisible &&
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
    }
    else if (!shouldRun && timerId) {
        window.ClearInterval(timerId);
        timerId = null;
    }
}

// --- STATE SAVE ---

function saveState(path, isDisc) {
    if (!path || path === "embedded") return;
    savedPath = path;
    savedIsDisc = isDisc;
    window.SetProperty("RP.SavedPath", path);
    window.SetProperty("RP.SavedIsDisc", isDisc);
}

// --- IMAGE LOADING ---

function loadDiscImage(metadb) {
    if (!metadb) return;

    currentMetadb = metadb;
    isDiscImage = false;

    const folderPath = tf_path.EvalWithMetadb(metadb);
    let foundPath = "";

    if (!useAlbumArtOnly) {
        const files = [
            "\\disc.png", "\\disc.jpg",
            "\\cd.png", "\\cd.jpg",
            "\\CD.png", "\\CD.jpg",
            "\\media.png", "\\media.jpg",
            "\\vinyl.png", "\\vinyl.jpg"
        ];

        for (let f of files) {
            const p = folderPath + f;
            if (utils.FileTest(p, "e")) {
                foundPath = p;
                isDiscImage = true;
                break;
            }
        }
    }

    if (foundPath) {
        const cached = loadImageCached(foundPath);
        if (cached) {
            setImage(cached);
            saveState(foundPath, true);
        }
    }
    else if (!useAlbumArtOnly && utils.FileTest(DEFAULT_DISC_PATH, "e")) {
        const cached = loadImageCached(DEFAULT_DISC_PATH);
        if (cached) {
            setImage(cached);
            isDiscImage = true;
            saveState(DEFAULT_DISC_PATH, true);
        }
    }
    else {
        releaseImage();
        utils.GetAlbumArtAsync(window.ID, metadb, 0);
    }

    updateTimer();
    window.Repaint();
}

// --- CALLBACKS ---

function on_get_album_art_done(metadb, art_id, image, image_path) {
    if (!currentMetadb || !metadb || !metadb.Compare(currentMetadb)) {
        return;
    }

    if (image) {
        const scaled = scaleImage(image, MAX_IMAGE_SIZE);
        setImage(scaled);
        isDiscImage = false;
        if (image_path) saveState(image_path, false);
    }

    updateTimer();
    window.Repaint();
}

function on_selection_changed() {
    if (fb.IsPlaying || fb.IsPaused) return;

    const sel = fb.GetSelection();
    if (sel && sel.Count > 0) {
        loadDiscImage(sel.Item(0));
    }
}

function on_playback_new_track(metadb) {
    angle = 0;
    loadDiscImage(metadb);
}

function on_playback_pause() { updateTimer(); }
function on_playback_stop() { updateTimer(); angle = 0; }

// --- PAINT ---

function on_paint(gr) {
    const bg = window.GetColourDUI(1);
    gr.FillSolidRect(0, 0, window.Width, window.Height, bg);

    if (!img) return;

    gr.SetInterpolationMode(7);
    gr.SetSmoothingMode(4);

    if (!isDiscImage) {
        let w = window.Width;
        let h = window.Height;
        let x = 0, y = 0;

        if (keepAspectRatio) {
            const r = Math.min(w / img.Width, h / img.Height);
            w = Math.floor(img.Width * r);
            h = Math.floor(img.Height * r);
            x = Math.floor((window.Width - w) / 2);
            y = Math.floor((window.Height - h) / 2);
        }

        gr.DrawImage(img, x, y, w, h, 0, 0, img.Width, img.Height, 0);
    }
    else {
        const size = Math.floor(Math.min(window.Width, window.Height) * 0.98);
        const x = Math.floor((window.Width - size) / 2);
        const y = Math.floor((window.Height - size) / 2);
        gr.DrawImage(img, x, y, size, size, 0, 0, img.Width, img.Height, angle);
    }
}

// --- INIT ---

function init() {
    if (fb.IsPlaying || fb.IsPaused) {
        loadDiscImage(fb.GetNowPlaying());
    }
    else if (savedPath && utils.FileTest(savedPath, "e")) {
        const cached = loadImageCached(savedPath);
        if (cached) {
            setImage(cached);
            isDiscImage = savedIsDisc;
            window.Repaint();
        }
    }
}

window.SetTimeout(init, 250);

// --- MENU (unchanged) ---

function on_mouse_rbtn_up(x, y) {
    const menu = window.CreatePopupMenu();

    menu.AppendMenuItem(0, 1, "Mode: Album Art Only (Static)");
    menu.CheckMenuItem(1, useAlbumArtOnly);

    menu.AppendMenuItem(0, 3, "Keep Aspect Ratio");
    menu.CheckMenuItem(3, keepAspectRatio);

    if (!useAlbumArtOnly) {
        menu.AppendMenuSeparator();
        menu.AppendMenuItem(0, 2, "Spinning Enabled");
        menu.CheckMenuItem(2, spinningEnabled);

        const speedMenu = window.CreatePopupMenu();
        speedMenu.AppendMenuItem(0, 10, "Slow");
        speedMenu.AppendMenuItem(0, 11, "Normal");
        speedMenu.AppendMenuItem(0, 12, "Fast");
        speedMenu.CheckMenuRadioItem(
            10, 12,
            spinSpeed <= 0.5 ? 10 : spinSpeed >= 5.0 ? 12 : 11
        );
        speedMenu.AppendTo(menu, 0, "Rotation Speed");
    }

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
            window.SetProperty("RP.SpinSpeed", 0.5);
            break;
        case 11:
            spinSpeed = 2.0;
            window.SetProperty("RP.SpinSpeed", 2.0);
            break;
        case 12:
            spinSpeed = 5.0;
            window.SetProperty("RP.SpinSpeed", 5.0);
            break;
    }

    window.Repaint();
    return true;
}
