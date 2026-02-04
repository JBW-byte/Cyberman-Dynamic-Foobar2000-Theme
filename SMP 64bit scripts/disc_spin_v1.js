const tf_path = fb.TitleFormat("$directory_path(%path%)");
let img = null;
let maskImg = null;
let angle = 0;
const timerInterval = 30;

// Persistent Settings
let lastImagePath = window.GetProperty("RP.LastImagePath", "");
let spinningEnabled = window.GetProperty("RP.SpinningEnabled", true);
let spinSpeed = window.GetProperty("RP.SpinSpeed", 2.0);
let useAlbumArtOnly = window.GetProperty("RP.UseAlbumArtOnly", false);
let keepAspectRatio = window.GetProperty("RP.KeepAspectRatio", true);

if (lastImagePath && utils.FileTest(lastImagePath, "e")) {
    img = gdi.Image(lastImagePath);
}

function createDoughnutMask(w, h, size) {
    const bgColor = window.GetColourDUI(1); 
    let frame = gdi.CreateImage(w, h);
    let g = frame.GetGraphics();
    g.SetSmoothingMode(4);
    const cx = w / 2;
    const cy = h / 2;
    const radius = size / 2;
    const thick = Math.max(w, h); 
    g.DrawEllipse(cx - radius - thick/2, cy - radius - thick/2, radius*2 + thick, radius*2 + thick, thick, bgColor);
    frame.ReleaseGraphics(g);
    return frame;
}

function loadDiscImage(metadb) {
    if (!metadb) return;
    const folderPath = tf_path.EvalWithMetadb(metadb);
    
    if (useAlbumArtOnly) {
        utils.GetAlbumArtAsync(window.ID, metadb, 0);
    } else {
        const files = ["\\disc.png", "\\cd.png"];
        let foundPath = "";
        for (let f of files) {
            if (utils.FileTest(folderPath + f, "e")) { foundPath = folderPath + f; break; }
        }
        if (foundPath) {
            img = gdi.Image(foundPath);
            window.SetProperty("RP.LastImagePath", foundPath);
        } else {
            utils.GetAlbumArtAsync(window.ID, metadb, 0);
        }
    }
    window.Repaint();
}

function on_get_album_art_done(metadb, art_id, image, image_path) {
    if (image) {
        img = image;
        window.SetProperty("RP.LastImagePath", image_path || "");
    }
    window.Repaint();
}

function on_playback_new_track(metadb) {
    angle = 0;
    loadDiscImage(metadb);
}

function on_size() {
    if (window.Width <= 0 || window.Height <= 0) return;
    const size = Math.floor(Math.min(window.Width, window.Height) * 0.95);
    maskImg = createDoughnutMask(window.Width, window.Height, size);
}

window.SetInterval(() => {
    // Only spin if spinning is enabled AND we aren't in "Album Art Only" mode
    if (img && spinningEnabled && !useAlbumArtOnly && fb.IsPlaying && !fb.IsPaused) {
        angle = (angle + spinSpeed) % 360;
        window.Repaint();
    }
}, timerInterval);

function on_paint(gr) {
    const bgColor = window.GetColourDUI(1);
    gr.FillSolidRect(0, 0, window.Width, window.Height, bgColor);
    if (!img) return;

    gr.SetInterpolationMode(7);
    gr.SetSmoothingMode(4);

    let drawW, drawH, drawX, drawY;

    if (useAlbumArtOnly) {
        // Album Art Mode: Static and Scaled
        if (keepAspectRatio) {
            let ratio = Math.min(window.Width / img.Width, window.Height / img.Height);
            drawW = Math.floor(img.Width * ratio);
            drawH = Math.floor(img.Height * ratio);
        } else {
            drawW = window.Width;
            drawH = window.Height;
        }
        drawX = Math.floor((window.Width - drawW) / 2);
        drawY = Math.floor((window.Height - drawH) / 2);
        gr.DrawImage(img, drawX, drawY, drawW, drawH, 0, 0, img.Width, img.Height, 0);
    } else {
        // Disc Mode: Spinning and Round
        const size = Math.floor(Math.min(window.Width, window.Height) * 0.95);
        drawX = Math.floor((window.Width - size) / 2);
        drawY = Math.floor((window.Height - size) / 2);
        gr.DrawImage(img, drawX, drawY, size, size, 0, 0, img.Width, img.Height, angle);
        if (!maskImg) on_size();
        gr.DrawImage(maskImg, 0, 0, window.Width, window.Height, 0, 0, maskImg.Width, maskImg.Height);
    }
}

function on_mouse_rbtn_up(x, y) {
    const menu = window.CreatePopupMenu();
    
    menu.AppendMenuItem(0, 1, "Mode: Album Art Only");
    menu.CheckMenuItem(1, useAlbumArtOnly);
    
    if (useAlbumArtOnly) {
        menu.AppendMenuItem(0, 3, "Keep Aspect Ratio");
        menu.CheckMenuItem(3, keepAspectRatio);
    } else {
        menu.AppendMenuItem(0, 2, "Spinning Enabled");
        menu.CheckMenuItem(2, spinningEnabled);
    }

    menu.AppendMenuSeparator();
    const speedMenu = window.CreatePopupMenu();
    speedMenu.AppendMenuItem(0, 10, "Slow");
    speedMenu.AppendMenuItem(0, 11, "Normal");
    speedMenu.AppendMenuItem(0, 12, "Fast");
    speedMenu.CheckMenuRadioItem(10, 12, spinSpeed == 0.5 ? 10 : spinSpeed == 5.0 ? 12 : 11);
    speedMenu.AppendTo(menu, 0, "Rotation Speed");

    menu.AppendMenuSeparator();
    menu.AppendMenuItem(0, 4, "Clear Saved Image");
    
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
            break;
        case 3:
            keepAspectRatio = !keepAspectRatio;
            window.SetProperty("RP.KeepAspectRatio", keepAspectRatio);
            break;
        case 4:
            img = null;
            window.SetProperty("RP.LastImagePath", "");
            break;
        case 10: spinSpeed = 0.5; window.SetProperty("RP.SpinSpeed", 0.5); break;
        case 11: spinSpeed = 2.0; window.SetProperty("RP.SpinSpeed", 2.0); break;
        case 12: spinSpeed = 5.0; window.SetProperty("RP.SpinSpeed", 5.0); break;
    }
    window.Repaint();
    return true;
}

if (fb.IsPlaying || fb.IsPaused) loadDiscImage(fb.GetNowPlaying());
