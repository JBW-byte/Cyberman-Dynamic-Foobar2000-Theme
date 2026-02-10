	        // ======== AUTHOR L.E.D. AI ASSISTED ======== \\
	       // ===== Original script I made, Archived  ===== \\
	      // ====== Blur Artwork + Trackinfo + Cover  ====== \\

   // ===================*** Foobar2000 64bit ***================== \\
  // ======= For Spider Monekey Panel 64bit, author: marc2003 ====== \\
 // === SMP 64bit script samples StackBlur+Panel, author:marc2003 === \\

window.DefineScript('Simplyart Archived', { author: 'L.E.D.' });

// ------------------------------
// Utilities
// ------------------------------
function RGB(r, g, b) { return 0xFF000000 | (r << 16) | (g << 8) | b; }

// ------------------------------
// Fonts
// ------------------------------
var font_title  = gdi.Font('Segoe UI', 24, 1);
var font_artist = gdi.Font('Segoe UI', 16);

// ------------------------------
// Settings
// ------------------------------
var radius = window.GetProperty('blur_radius', 20);
var blur_enabled = window.GetProperty('blur_enabled', true);
var text_bg_enabled = window.GetProperty('text_bg_enabled', true);
var text_shadow_enabled = window.GetProperty('text_shadow_enabled', true);
var layout = window.GetProperty('layout', 0);
var extra_info_enabled = window.GetProperty('extra_info_enabled', true);
var darken_value = window.GetProperty('darken_value', 20);
var show_top_art = window.GetProperty('show_top_art', false);

// ------------------------------
// Cache settings
// ------------------------------
var MAX_CACHE_SIZE = 10;

// ------------------------------
var ww = 0, wh = 0;
var alpha = 255;
var fading = false;

// ------------------------------
// TitleFormat cache
// ------------------------------
var tf_title  = fb.TitleFormat('%title%');
var tf_artist = fb.TitleFormat('%artist%');
var tf_album  = fb.TitleFormat('%album%');
var tf_date   = fb.TitleFormat('%date%');
var tf_length = fb.TitleFormat('%length%');

// ------------------------------
// Image state
// ------------------------------
var src_img = null;
var blur_img = null;

// ------------------------------
// Album cache (LRU)
// ------------------------------
var album_cache = {};
var lru_tick = 0;
var current_key = null;

// ------------------------------
// Helpers
// ------------------------------
function clear_images() {
    src_img = null;
    blur_img = null;
}

function get_folder_key(metadb) {
    var p = metadb.RawPath;
    var idx = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
    return idx >= 0 ? p.slice(0, idx) : p;
}

// ------------------------------
// LRU cache management
// ------------------------------
function touch_cache(key) {
    album_cache[key].tick = ++lru_tick;
}

function enforce_cache_limit() {
    var keys = Object.keys(album_cache);
    if (keys.length <= MAX_CACHE_SIZE) return;

    keys.sort(function (a, b) {
        return album_cache[a].tick - album_cache[b].tick;
    });

    while (keys.length > MAX_CACHE_SIZE) {
        var k = keys.shift();
        album_cache[k].img = null;
        delete album_cache[k];
    }
}

// ------------------------------
// Blur
// ------------------------------
function build_blur() {
    blur_img = null;
    if (!src_img || !blur_enabled) return;

    blur_img = src_img.Clone(0, 0, src_img.Width, src_img.Height);
    blur_img.StackBlur(radius);
}

// ------------------------------
// Async album art
// ------------------------------
function request_album_art() {
    var metadb = fb.GetNowPlaying();
    if (!metadb) return;

    var key = get_folder_key(metadb);

    // Same album (folder) and image already loaded
    if (key === current_key && src_img) {
        touch_cache(key);
        return;
    }

    current_key = key;

    // Cached
    if (album_cache[key]) {
        clear_images();
        src_img = album_cache[key].img.Clone(
            0, 0,
            album_cache[key].img.Width,
            album_cache[key].img.Height
        );

        touch_cache(key);
        build_blur();
        alpha = 0;
        fading = true;
        window.Repaint();
        return;
    }

    utils.GetAlbumArtAsync(window.ID, metadb, 0);
}

function on_get_album_art_done(metadb, art_id, image, image_path) {
    if (!image || !metadb) return;

    var key = get_folder_key(metadb);

    // Cache clone
    album_cache[key] = {
        img: image.Clone(0, 0, image.Width, image.Height),
        tick: ++lru_tick
    };

    enforce_cache_limit();

    if (key !== current_key) {
        image = null;
        return;
    }

    clear_images();
    src_img = image;

    build_blur();
    alpha = 0;
    fading = true;
    window.Repaint();
}

// ------------------------------
// Panel callbacks
// ------------------------------
function on_size(w, h) {
    ww = w;
    wh = h;
}

function on_paint(gr) {
    if (!ww || !wh) return;

    if (fading) {
        alpha += 20;
        if (alpha >= 255) {
            alpha = 255;
            fading = false;
        }
        window.Repaint();
    }

    // Background
    if (src_img) {
        var bg = blur_enabled && blur_img ? blur_img : src_img;
        gr.DrawImage(bg, 0, 0, ww, wh, 0, 0, bg.Width, bg.Height, 0, alpha);

        if (darken_value > 0) {
            var op = Math.floor(darken_value / 100 * 255);
            gr.FillSolidRect(0, 0, ww, wh, op << 24);
        }
    } else {
        gr.FillSolidRect(0, 0, ww, wh, RGB(25,25,25));
    }

    // Text
    var title = tf_title.Eval();
    var artist = tf_artist.Eval();

    if (!title && !artist) {
        title = 'No track playing';
        artist = '';
    }

    var extra_text = '';
    if (extra_info_enabled) {
        var a = tf_album.Eval();
        var y = tf_date.Eval();
        var l = tf_length.Eval();
        if (a) extra_text += a;
        if (y) extra_text += (extra_text ? ' | ' : '') + y;
        if (l) extra_text += (extra_text ? ' | ' : '') + l;
    }

    var title_h = 34, artist_h = 28;
    var extra_h = extra_text ? 20 : 0;
    var total_h = title_h + artist_h + extra_h;
    var overlay_h = total_h + 10;

    var cy = layout === 0
        ? Math.floor((wh - overlay_h) / 2)
        : layout === 1
            ? wh - overlay_h - 20
            : 20;

    // Top artwork
    if (show_top_art && src_img) {
        var m = 10;
        var avail = cy - m * 2;
        if (avail > 20) {
            var asp = src_img.Width / src_img.Height;
            var w = ww - m * 2;
            var h = w / asp;
            if (h > avail) { h = avail; w = h * asp; }
            var x = (ww - w) / 2;
            gr.DrawImage(src_img, x, m, w, h, 0, 0, src_img.Width, src_img.Height);
            cy = Math.max(cy, m + h + m);
        }
    }

    if (text_bg_enabled)
        gr.FillSolidRect(0, cy, ww, overlay_h, 0xAA000000);

    var ty = cy + (overlay_h - total_h) / 2;
    var ay = ty + title_h;
    var ey = ay + artist_h;

    if (text_shadow_enabled) {
        var sc = 0x88000000;
        gr.GdiDrawText(title, font_title, sc, 2, ty + 2, ww, title_h, 0x0001 | 0x0040);
        gr.GdiDrawText(artist, font_artist, sc, 2, ay + 2, ww, artist_h, 0x0001 | 0x0040);
        if (extra_h)
            gr.GdiDrawText(extra_text, font_artist, sc, 2, ey + 2, ww, extra_h, 0x0001 | 0x0040);
    }

    gr.GdiDrawText(title, font_title, RGB(255,255,255), 0, ty, ww, title_h, 0x0001 | 0x0040);
    gr.GdiDrawText(artist, font_artist, RGB(200,200,200), 0, ay, ww, artist_h, 0x0001 | 0x0040);
    if (extra_h)
        gr.GdiDrawText(extra_text, font_artist, RGB(180,180,180), 0, ey, ww, extra_h, 0x0001 | 0x0040);
}

// ------------------------------
// Mouse wheel
// ------------------------------
function on_mouse_wheel(step) {
    if (!blur_enabled || !src_img) return;
    radius = Math.max(2, Math.min(254, radius + step * 5));
    window.SetProperty('blur_radius', radius);
    build_blur();
    window.Repaint();
}

// ------------------------------
// Playback
// ------------------------------
function on_playback_new_track() { request_album_art(); }
function on_playback_stop() { window.Repaint(); }

// ------------------------------
// Context menu
// ------------------------------
function on_mouse_rbtn_up(x, y) {
    var m = window.CreatePopupMenu();

    m.AppendMenuItem(0,1,'Enable blur');              m.CheckMenuItem(1, blur_enabled);
    m.AppendMenuItem(0,2,'Show text background');    m.CheckMenuItem(2, text_bg_enabled);
    m.AppendMenuItem(0,3,'Text shadow');             m.CheckMenuItem(3, text_shadow_enabled);
    m.AppendMenuItem(0,4,'Show extra track info');   m.CheckMenuItem(4, extra_info_enabled);
    m.AppendMenuItem(0,5,'Show top cover');          m.CheckMenuItem(5, show_top_art);

    m.AppendMenuSeparator();

    m.AppendMenuItem(0,10,'Layout: Center');
    m.AppendMenuItem(0,11,'Layout: Bottom');
    m.AppendMenuItem(0,12,'Layout: Minimal');
    m.CheckMenuRadioItem(10,12,10+layout);

    m.AppendMenuSeparator();

    for (var i=0;i<=10;i++){
        var v=i*20;
        m.AppendMenuItem(0,40+i,'Blur: '+v);
        if (radius===v) m.CheckMenuItem(40+i,true);
    }
    m.AppendMenuItem(0,51,'Blur: 254');

    m.AppendMenuSeparator();

    for (var d=0;d<=5;d++){
        var dv=d*10;
        m.AppendMenuItem(0,70+d,'Darken: '+dv+'%');
        if (darken_value===dv) m.CheckMenuItem(70+d,true);
    }

    var r=m.TrackPopupMenu(x,y);

    if (r===1) blur_enabled=!blur_enabled;
    else if (r===2) text_bg_enabled=!text_bg_enabled;
    else if (r===3) text_shadow_enabled=!text_shadow_enabled;
    else if (r===4) extra_info_enabled=!extra_info_enabled;
    else if (r===5) show_top_art=!show_top_art;
    else if (r>=10&&r<=12) layout=r-10;
    else if (r>=40&&r<=50) radius=(r-40)*20;
    else if (r===51) radius=254;
    else if (r>=70&&r<=75) darken_value=(r-70)*10;

    window.SetProperty('blur_enabled', blur_enabled);
    window.SetProperty('text_bg_enabled', text_bg_enabled);
    window.SetProperty('text_shadow_enabled', text_shadow_enabled);
    window.SetProperty('extra_info_enabled', extra_info_enabled);
    window.SetProperty('show_top_art', show_top_art);
    window.SetProperty('layout', layout);
    window.SetProperty('blur_radius', radius);
    window.SetProperty('darken_value', darken_value);

    build_blur();
    window.Repaint();
    return true;
}

// ------------------------------
// Unload
// ------------------------------
function on_script_unload() {
    clear_images();
    album_cache = {};
}
