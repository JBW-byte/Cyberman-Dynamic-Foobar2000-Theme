// ================= AUTHOR L.E.D. AI ASSISTED (HYBRID + MENU) =================
const tf_path = fb.TitleFormat("$directory_path(%path%)");
let img = null;
let angle = 0;
let isDiscImage = false; 
const timerInterval = 30;
const MAX_IMAGE_SIZE = 256; // Increased for better quality on large panels
let timerId = null;

const DEFAULT_DISC_PATH = fb.ProfilePath + "skins\\default_disc.png"; 

// --- PERSISTENT SETTINGS ---
let spinningEnabled = window.GetProperty("RP.SpinningEnabled", true);
let spinSpeed = window.GetProperty("RP.SpinSpeed", 2.0);
let useAlbumArtOnly = window.GetProperty("RP.UseAlbumArtOnly", false);
let keepAspectRatio = window.GetProperty("RP.KeepAspectRatio", true);
let savedPath = window.GetProperty("RP.SavedPath", "");
let savedIsDisc = window.GetProperty("RP.SavedIsDisc", false);

function scaleImage(rawImg, maxSize) {
    if (!rawImg) return null;
    let w = rawImg.Width, h = rawImg.Height;
    if (w <= maxSize && h <= maxSize) return rawImg;
    let scale = maxSize / Math.max(w, h);
    let newW = Math.floor(w * scale), newH = Math.floor(h * scale);
    let scaledImg = gdi.CreateImage(newW, newH);
    let g = scaledImg.GetGraphics();
    g.SetInterpolationMode(7);
    g.DrawImage(rawImg, 0, 0, newW, newH, 0, 0, w, h);
    scaledImg.ReleaseGraphics(g);
    return scaledImg;
}

function updateTimer() {
    const shouldRun = window.IsVisible && img && isDiscImage && spinningEnabled && fb.IsPlaying && !fb.IsPaused;
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

function saveState(path, isDisc) {
    if (!path || path === "embedded") return;
    savedPath = path;
    savedIsDisc = isDisc;
    window.SetProperty("RP.SavedPath", path);
    window.SetProperty("RP.SavedIsDisc", isDisc);
}

function loadDiscImage(metadb) {
    if (!metadb) return;
    const folderPath = tf_path.EvalWithMetadb(metadb);
    let foundPath = "";
    isDiscImage = false; 

    if (!useAlbumArtOnly) {
        const files = ["\\disc.png", "\\cd.png", "\\vinyl.png", "\\disc.jpg"];
        for (let f of files) {
            if (utils.FileTest(folderPath + f, "e")) { 
                foundPath = folderPath + f; 
                isDiscImage = true;
                break; 
            }
        }
    }

    if (foundPath) {
        img = scaleImage(gdi.Image(foundPath), MAX_IMAGE_SIZE);
        saveState(foundPath, true);
    } else if (!useAlbumArtOnly && utils.FileTest(DEFAULT_DISC_PATH, "e")) {
        img = scaleImage(gdi.Image(DEFAULT_DISC_PATH), MAX_IMAGE_SIZE);
        isDiscImage = true;
        saveState(DEFAULT_DISC_PATH, true);
    } else {
        utils.GetAlbumArtAsync(window.ID, metadb, 0);
    }
    updateTimer();
    window.Repaint();
}

// --- CALLBACKS ---

function on_get_album_art_done(metadb, art_id, image, image_path) {
    if (image) {
        img = scaleImage(image, MAX_IMAGE_SIZE);
        isDiscImage = false; 
        if (image_path) saveState(image_path, false);
    }
    updateTimer();
    window.Repaint();
}

function on_selection_changed() {
    if (!fb.IsPlaying && !fb.IsPaused) {
        let metadb = fb.GetSelection();
        if (metadb) loadDiscImage(metadb);
    }
}

function on_playback_new_track(metadb) {
    angle = 0;
    loadDiscImage(metadb);
}

function on_playback_pause() { updateTimer(); }
function on_playback_stop() { updateTimer(); }

function on_paint(gr) {
    const bgColor = window.GetColourDUI(1);
    gr.FillSolidRect(0, 0, window.Width, window.Height, bgColor);
    if (!img) return;

    gr.SetInterpolationMode(7);
    gr.SetSmoothingMode(4);

    if (!isDiscImage) {
        let drawW = window.Width, drawH = window.Height, dX = 0, dY = 0;
        if (keepAspectRatio) {
            let ratio = Math.min(window.Width / img.Width, window.Height / img.Height);
            drawW = Math.floor(img.Width * ratio);
            drawH = Math.floor(img.Height * ratio);
            dX = Math.floor((window.Width - drawW) / 2);
            dY = Math.floor((window.Height - drawH) / 2);
        }
        gr.DrawImage(img, dX, dY, drawW, drawH, 0, 0, img.Width, img.Height, 0);
    } else {
        const size = Math.floor(Math.min(window.Width, window.Height) * 0.98);
        const drawX = Math.floor((window.Width - size) / 2);
        const drawY = Math.floor((window.Height - size) / 2);
        gr.DrawImage(img, drawX, drawY, size, size, 0, 0, img.Width, img.Height, angle);
    }
}

function init() {
    if (fb.IsPlaying || fb.IsPaused) {
        loadDiscImage(fb.GetNowPlaying());
    } else if (savedPath) {
        if (utils.FileTest(savedPath, "e")) {
            let tempImg = gdi.Image(savedPath);
            if (tempImg) {
                img = scaleImage(tempImg, MAX_IMAGE_SIZE);
                isDiscImage = savedIsDisc;
                window.Repaint();
            }
        }
    }
}

window.SetTimeout(init, 250);

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
        speedMenu.CheckMenuRadioItem(10, 12, spinSpeed <= 0.5 ? 10 : spinSpeed >= 5.0 ? 12 : 11);
        speedMenu.AppendTo(menu, 0, "Rotation Speed");
    }

    const idx = menu.TrackPopupMenu(x, y);
    switch (idx) {
        case 1:
            useAlbumArtOnly = !useAlbumArtOnly;
            window.SetProperty("RP.UseAlbumArtOnly", useAlbumArtOnly);
            loadDiscImage(fb.GetSelection() || fb.GetNowPlaying());
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
        case 10: spinSpeed = 0.5; window.SetProperty("RP.SpinSpeed", 0.5); break;
        case 11: spinSpeed = 2.0; window.SetProperty("RP.SpinSpeed", 2.0); break;
        case 12: spinSpeed = 5.0; window.SetProperty("RP.SpinSpeed", 5.0); break;
    }
    window.Repaint();
    return true;
}
