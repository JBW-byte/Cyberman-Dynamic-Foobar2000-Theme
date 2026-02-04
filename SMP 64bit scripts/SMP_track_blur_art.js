window.DefineScript('StackBlur+Panel', { author: 'marc2003' });

include('docs/Helpers.js');

function RGB(r,g,b) { return 0xFF000000 | (r<<16) | (g<<8) | b; }
function RGBA(r,g,b,a) { return ((a<<24) | (r<<16) | (g<<8) | b); }

// ------------------------------
// Fonts
// ------------------------------
var font_title  = gdi.Font('Segoe UI', 24, 1);
var font_artist = gdi.Font('Segoe UI', 16);

// ------------------------------
// Globals / Settings
// ------------------------------
var src_img  = null;
var blur_img = null;

var radius   = window.GetProperty('blur_radius', 20);
var blur_enabled    = window.GetProperty('blur_enabled', true);
var text_bg_enabled = window.GetProperty('text_bg_enabled', true);
var text_shadow_enabled = window.GetProperty('text_shadow_enabled', true);
var layout          = window.GetProperty('layout', 0); // 0=center, 1=bottom, 2=minimal
var extra_info_enabled = window.GetProperty('extra_info_enabled', true);
var darken_value = window.GetProperty('darken_value', 20); // 0-50%
var show_top_art = window.GetProperty('show_top_art', false);

var ww = 0;
var wh = 0;

// Fade animation
var alpha = 255;
var fading = false;

// ------------------------------
// Album Art / Blur
// ------------------------------
function build_blur() {
    if (!src_img || !blur_enabled) {
        blur_img = null;
        return;
    }
    blur_img = src_img.Clone(0, 0, src_img.Width, src_img.Height);
    blur_img.StackBlur(radius);
}

function load_album_art() {
    var metadb = fb.GetNowPlaying();
    if (!metadb) return;

    var art = utils.GetAlbumArtV2(metadb, 0);
    if (!art) return;

    src_img = art;
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

    // Fade animation
    if (fading) {
        alpha += 20;
        if (alpha >= 255) {
            alpha = 255;
            fading = false;
        }
        window.Repaint();
    }

    // ------------------------------
    // Background
    // ------------------------------
    if (src_img) {
        var bg = blur_enabled && blur_img ? blur_img : src_img;
        gr.DrawImage(bg, 0, 0, ww, wh, 0, 0, bg.Width, bg.Height, 0, alpha);

        if (darken_value > 0) {
            var op = Math.floor(darken_value / 100 * 255);
            gr.FillSolidRect(0, 0, ww, wh, (op << 24));
        }
    } else {
        gr.FillSolidRect(0, 0, ww, wh, RGB(25,25,25));
    }

    // ------------------------------
    // Track info
    // ------------------------------
    var title  = fb.TitleFormat('%title%').Eval();
    var artist = fb.TitleFormat('%artist%').Eval();

    if (!title && !artist) {
        title = 'No track playing';
        artist = '';
    }

    var extra_info_text = '';
    if (extra_info_enabled) {
        var album = fb.TitleFormat('%album%').Eval();
        var year = fb.TitleFormat('%date%').Eval();
        var length = fb.TitleFormat('%length%').Eval();
        if (album) extra_info_text += album;
        if (year) extra_info_text += (extra_info_text ? ' | ' : '') + year;
        if (length) extra_info_text += (extra_info_text ? ' | ' : '') + length;
    }

    var title_h = 34;
    var artist_h = 28;
    var extra_h = (extra_info_enabled && extra_info_text) ? 20 : 0;
    var text_total_h = title_h + artist_h + extra_h;
    var overlay_h = text_total_h + 10;

    var cy;
    if (layout === 0) cy = Math.floor((wh - overlay_h) / 2);
    else if (layout === 1) cy = wh - overlay_h - 20;
    else cy = 20;

    // ------------------------------
    // Top album art (scaled)
    // ------------------------------
    var top_margin = 10;

    if (show_top_art && src_img) {
        var available_h = cy - top_margin * 2;
        if (available_h > 20) {
            var aspect = src_img.Width / src_img.Height;

            var art_w = ww - top_margin * 2;
            var art_h = art_w / aspect;

            if (art_h > available_h) {
                art_h = available_h;
                art_w = art_h * aspect;
            }

            var x = Math.floor((ww - art_w) / 2);
            var y = top_margin;

            gr.DrawImage(src_img, x, y, art_w, art_h, 0, 0, src_img.Width, src_img.Height);
            cy = Math.max(cy, y + art_h + top_margin);
        }
    }

    // ------------------------------
    // Text background
    // ------------------------------
    if (text_bg_enabled) {
        gr.FillSolidRect(0, cy, ww, overlay_h, 0xAA000000);
    }

    var title_y = cy + Math.floor((overlay_h - text_total_h) / 2);
    var artist_y = title_y + title_h;
    var extra_y = artist_y + artist_h;

    // ------------------------------
    // Text shadow
    // ------------------------------
    if (text_shadow_enabled) {
        var sc = 0x88000000;
        var so = 2;
        gr.GdiDrawText(title, font_title, sc, so, title_y + so, ww, title_h, 0x0001 | 0x0040);
        gr.GdiDrawText(artist, font_artist, sc, so, artist_y + so, ww, artist_h, 0x0001 | 0x0040);
        if (extra_h)
            gr.GdiDrawText(extra_info_text, font_artist, sc, so, extra_y + so, ww, extra_h, 0x0001 | 0x0040);
    }

    // ------------------------------
    // Text
    // ------------------------------
    gr.GdiDrawText(title, font_title, RGB(255,255,255), 0, title_y, ww, title_h, 0x0001 | 0x0040);
    gr.GdiDrawText(artist, font_artist, RGB(200,200,200), 0, artist_y, ww, artist_h, 0x0001 | 0x0040);
    if (extra_h)
        gr.GdiDrawText(extra_info_text, font_artist, RGB(180,180,180), 0, extra_y, ww, extra_h, 0x0001 | 0x0040);
}

// ------------------------------
// Mouse wheel blur
// ------------------------------
function on_mouse_wheel(step) {
    if (!blur_enabled || !src_img) return;
    radius += step * 5;
    radius = Math.max(2, Math.min(254, radius));
    window.SetProperty('blur_radius', radius);
    build_blur();
    window.Repaint();
}

// ------------------------------
// Playback
// ------------------------------
function on_playback_new_track() { load_album_art(); }
function on_playback_stop() { window.Repaint(); }

// ------------------------------
// Context menu
// ------------------------------
function on_mouse_rbtn_up(x, y) {
    var m = window.CreatePopupMenu();

    m.AppendMenuItem(0, 1, 'Enable blur');              m.CheckMenuItem(1, blur_enabled);
    m.AppendMenuItem(0, 2, 'Show text background');    m.CheckMenuItem(2, text_bg_enabled);
    m.AppendMenuItem(0, 3, 'Text shadow');             m.CheckMenuItem(3, text_shadow_enabled);
    m.AppendMenuItem(0, 4, 'Show extra track info');   m.CheckMenuItem(4, extra_info_enabled);
    m.AppendMenuItem(0, 5, 'Show top cover');          m.CheckMenuItem(5, show_top_art);

    m.AppendMenuSeparator();

    m.AppendMenuItem(0, 10, 'Layout: Center');
    m.AppendMenuItem(0, 11, 'Layout: Bottom');
    m.AppendMenuItem(0, 12, 'Layout: Minimal');
    m.CheckMenuRadioItem(10, 12, 10 + layout);

    m.AppendMenuSeparator();

    for (var i = 0; i <= 10; i++) {
        var v = i * 20;
        m.AppendMenuItem(0, 40 + i, 'Blur: ' + v);
        if (radius === v) m.CheckMenuItem(40 + i, true);
    }
    m.AppendMenuItem(0, 51, 'Blur: 254');
    if (radius === 254) m.CheckMenuItem(51, true);

    m.AppendMenuSeparator();

    for (var d = 0; d <= 5; d++) {
        var dv = d * 10;
        m.AppendMenuItem(0, 70 + d, 'Darken: ' + dv + '%');
        if (darken_value === dv) m.CheckMenuItem(70 + d, true);
    }

    var r = m.TrackPopupMenu(x, y);

    if (r === 1) blur_enabled = !blur_enabled;
    else if (r === 2) text_bg_enabled = !text_bg_enabled;
    else if (r === 3) text_shadow_enabled = !text_shadow_enabled;
    else if (r === 4) extra_info_enabled = !extra_info_enabled;
    else if (r === 5) show_top_art = !show_top_art;
    else if (r >= 10 && r <= 12) layout = r - 10;
    else if (r >= 40 && r <= 50) radius = (r - 40) * 20;
    else if (r === 51) radius = 254;
    else if (r >= 70 && r <= 75) darken_value = (r - 70) * 10;

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
