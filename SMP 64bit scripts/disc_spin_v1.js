const tf_path = fb.TitleFormat("$directory_path(%path%)");
let img = null;
let angle = 0;
const timerInterval = 40;

// Persistent Settings
let lastImagePath = window.GetProperty("RP.LastImagePath", "");
let spinningEnabled = window.GetProperty("RP.SpinningEnabled", true);

// Initial Load
if (lastImagePath && utils.FileTest(lastImagePath, "e")) {
    img = gdi.Image(lastImagePath);
}

function loadDiscImage(metadb) {
    if (!metadb) return;
    const folderPath = tf_path.EvalWithMetadb(metadb);
    const files = ["\\disc.png", "\\cd.png"];
    let newPath = "";

    for (let f of files) {
        if (utils.FileTest(folderPath + f, "e")) {
            newPath = folderPath + f;
            break;
        }
    }

    if (newPath) {
        img = gdi.Image(newPath);
        window.SetProperty("RP.LastImagePath", newPath);
    } else {
        utils.GetAlbumArtAsync(window.ID, metadb, 0);
    }
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

window.SetInterval(() => {
    // Rotation only happens if spinning is enabled AND music is playing
    if (img && spinningEnabled && fb.IsPlaying && !fb.IsPaused) {
        angle = (angle + 2) % 360;
        window.Repaint();
    }
}, timerInterval);

function on_paint(gr) {
    if (!img) return;
    const size = Math.floor(Math.min(window.Width, window.Height) * 0.9);
    const x = Math.floor((window.Width - size) / 2);
    const y = Math.floor((window.Height - size) / 2);
    gr.DrawImage(img, x, y, size, size, 0, 0, img.Width, img.Height, angle);
}

// Right-click Menu Logic
function on_mouse_rbtn_up(x, y) {
    const menu = window.CreatePopupMenu();
    
    menu.AppendMenuItem(0, 1, "Spinning Enabled");
    menu.CheckMenuItem(1, spinningEnabled);
    menu.AppendMenuSeparator();
    menu.AppendMenuItem(0, 2, "Clear Saved Image");
    
    // Standard SMP menu options (useful for debugging/editing)
    menu.AppendMenuSeparator();
    menu.AppendMenuItem(0, 10, "Configure Panel...");
    menu.AppendMenuItem(0, 11, "Reload Script");

    const idx = menu.TrackPopupMenu(x, y);

    switch (idx) {
        case 1:
            spinningEnabled = !spinningEnabled;
            window.SetProperty("RP.SpinningEnabled", spinningEnabled);
            window.Repaint();
            break;
        case 2:
            img = null;
            window.SetProperty("RP.LastImagePath", "");
            window.Repaint();
            break;
        case 10:
            window.ShowConfigure();
            break;
        case 11:
            window.Reload();
            break;
    }
    return true; // Suppress default menu
}

if (fb.IsPlaying || fb.IsPaused) loadDiscImage(fb.GetNowPlaying());
