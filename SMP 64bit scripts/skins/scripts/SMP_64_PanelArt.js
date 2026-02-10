	       // ========= AUTHOR L.E.D. AI ASSISTED ========= \\
	      // === Polished Panel Artwork and Trackinfo v1 === \\
	     // === Blur Artwork + Trackinfo + AI eats code  ==== \\

   // ===================*** Foobar2000 64bit ***================== \\
  // ======= For Spider Monekey Panel 64bit, author: marc2003 ====== \\
 // === SMP 64bit script samples StackBlur+Panel, author:marc2003 === \\

// ========= AUTHOR L.E.D. AI ASSISTED ========= \\
// === Polished Panel Artwork and Trackinfo v1 === \\
// === Blur Artwork + Trackinfo + AI eats code ==== \\

// ===================*** Foobar2000 64bit ***================== \\
// ======= For Spider Monkey Panel 64bit, author: marc2003 ====== \\
// === SMP 64bit script samples StackBlur+Panel, author: marc2003 === \\

window.DefineScript('SMP_64_PanelArt_Optimized_v7', {
    author: 'L.E.D.'
});

// ------------------------------
// Color helpers
// ------------------------------
function RGB(r, g, b) {
    return 0xFF000000 | (r << 16) | (g << 8) | b;
}

function RGBA(r, g, b, a) {
    return (a << 24) | (r << 16) | (g << 8) | b;
}

// ------------------------------
// Blur cache
// ------------------------------
var last_blur_radius = -1;
var last_img_w = 0;
var last_img_h = 0;

// ------------------------------
// Font sizes (persistent)
// ------------------------------
var title_font_size  = window.GetProperty('title_font_size', 32);
var artist_font_size = window.GetProperty('artist_font_size', 24);
var extra_font_size  = window.GetProperty('extra_font_size', 18);

// ------------------------------
// Font names (persistent)
// ------------------------------
var title_font_name  = window.GetProperty('title_font_name',  'Segoe UI');
var artist_font_name = window.GetProperty('artist_font_name', 'Segoe UI');
var extra_font_name  = window.GetProperty('extra_font_name',  'Segoe UI');

// ------------------------------
// Font objects
// ------------------------------
var font_title  = null;
var font_artist = null;
var font_extra  = null;

function rebuild_fonts() {
    font_title  = gdi.Font('Segoe UI', title_font_size, 1);
    font_artist = gdi.Font('Segoe UI', artist_font_size, 0);
    font_extra  = gdi.Font('Segoe UI', extra_font_size, 0);
}

rebuild_fonts();

// ------------------------------
// Line spacing & padding
// ------------------------------
var gap_title_artist = 2;
var gap_artist_extra = 6;
var overlay_padding  = 6;

// ------------------------------
// Globals / settings
// ------------------------------
var src_img = null;
var blur_img = null;
var fade_timer = null;

var cur_title  = '';
var cur_artist = '';
var cur_extra  = '';

var radius              = window.GetProperty('blur_radius', 20);
var blur_enabled        = window.GetProperty('blur_enabled', true);
var text_bg_enabled     = window.GetProperty('text_bg_enabled', true);
var text_shadow_enabled = window.GetProperty('text_shadow_enabled', true);
var layout              = window.GetProperty('layout', 0);
var extra_info_enabled  = window.GetProperty('extra_info_enabled', true);
var darken_value        = window.GetProperty('darken_value', 20);

var border_size  = window.GetProperty('border_size', 0);
var border_color = window.GetProperty('border_color', RGB(255, 255, 255));

var ww = 0;
var wh = 0;
var alpha = 255;
var fading = false;

// ------------------------------
// Font cache
// ------------------------------
var font_cache = {};

function get_font(name, size, style) {
    var key = name + size + style;
    if (!font_cache[key]) {
        font_cache[key] = gdi.Font(name, size, style);
    }
    return font_cache[key];
}

// ------------------------------
// Text update
// ------------------------------
function update_text() {
    var metadb = fb.GetNowPlaying();

    if (!metadb) {
        cur_title = 'No track playing';
        cur_artist = '';
        cur_extra = '';
        return;
    }

    cur_title  = fb.TitleFormat('%title%').Eval();
    cur_artist = fb.TitleFormat('%artist%').Eval();
    cur_extra  = '';

    if (extra_info_enabled) {
        var a = fb.TitleFormat('%album%').Eval();
        var y = fb.TitleFormat('%date%').Eval();
        var l = fb.TitleFormat('%length%').Eval();

        if (a) cur_extra += a;
        if (y) cur_extra += (cur_extra ? ' | ' : '') + y;
        if (l) cur_extra += (cur_extra ? ' | ' : '') + l;
    }
}

// ------------------------------
// Helper: fit text to max width
// ------------------------------
function fit_text(gr, text, font, max_w) {
    if (!text) return font;

    var fsize = font.Size;
    var test_font = font;

    while (fsize > 6) {
        test_font = get_font(font.Name, fsize, font.Style);
        var metrics = gr.MeasureString(
            text,
            test_font,
            0, 0, 1000, 1000,
            0x0001 | 0x0040 | 0x0010
        );
        if (metrics.Width <= max_w) break;
        fsize--;
    }

    return test_font;
}

// ------------------------------
// Blur builder
// ------------------------------
function build_blur() {
    if (!src_img || !blur_enabled || ww <= 0 || wh <= 0) return;

    if (!blur_img ||
        last_blur_radius !== radius ||
        last_img_w !== ww ||
        last_img_h !== wh) {

        blur_img = gdi.CreateImage(ww, wh);
        var g = blur_img.GetGraphics();

        g.DrawImage(
            src_img,
            0, 0, ww, wh,
            0, 0, src_img.Width, src_img.Height
        );

        blur_img.ReleaseGraphics(g);
        blur_img.StackBlur(radius);

        last_blur_radius = radius;
        last_img_w = ww;
        last_img_h = wh;
    }
}

// ------------------------------
// Album art load
// ------------------------------
function load_album_art() {
    update_text();

    var metadb = fb.GetNowPlaying();
    if (metadb) {
        var art = utils.GetAlbumArtV2(metadb, 0);
        if (art && art.Width && art.Height) {
            src_img = art;
            build_blur();
            alpha = 0;
            fading = true;
        }
    }
    window.Repaint();
}

// ------------------------------
// Callbacks
// ------------------------------
function on_size(w, h) {
    ww = w;
    wh = h;
    build_blur();
}

// ------------------------------
// PAINT
// ------------------------------
function on_paint(gr) {
    if (!ww || !wh) return;

    // Fade
    if (fading) {
        alpha = Math.min(alpha + 20, 255);
        if (alpha >= 255) {
            fading = false;
            if (fade_timer) {
                clearTimeout(fade_timer);
                fade_timer = null;
            }
        } else if (!fade_timer) {
            fade_timer = setTimeout(function () {
                fade_timer = null;
                window.Repaint();
            }, 30);
        }
    }

    // Background
    if (src_img) {
        var bg = (blur_enabled && blur_img) ? blur_img : src_img;
        gr.DrawImage(bg, 0, 0, ww, wh, 0, 0, bg.Width, bg.Height);

        if (darken_value > 0) {
            var op = Math.round(darken_value * 2.55 * (alpha / 255));
            gr.FillSolidRect(0, 0, ww, wh, RGBA(0, 0, 0, op));
        }
    } else {
        gr.FillSolidRect(0, 0, ww, wh, RGB(25, 25, 25));
    }

    // Border
    if (border_size > 0) {
        var s = border_size / 2;
        gr.DrawRect(
            s, s,
            ww - border_size,
            wh - border_size,
            border_size,
            border_color
        );
    }

    // Fonts
    var paint_title  = get_font(title_font_name,  title_font_size,  1);
    var paint_artist = get_font(artist_font_name, artist_font_size, 0);
    var paint_extra  = get_font(extra_font_name,  extra_font_size,  0);

    var text_x = border_size;
    var text_w = ww - 2 * border_size;

    paint_title  = fit_text(gr, cur_title,  paint_title,  text_w);
    paint_artist = fit_text(gr, cur_artist, paint_artist, text_w);
    paint_extra  = fit_text(gr, cur_extra,  paint_extra,  text_w);

    var title_h  = Math.ceil(gr.CalcTextHeight(cur_title,  paint_title,  text_w));
    var artist_h = Math.ceil(gr.CalcTextHeight(cur_artist, paint_artist, text_w));
    var extra_h  = (extra_info_enabled && cur_extra)
        ? Math.ceil(gr.CalcTextHeight(cur_extra, paint_extra, text_w))
        : 0;

    var text_total_h =
        title_h +
        gap_title_artist +
        artist_h +
        (extra_h ? gap_artist_extra + extra_h : 0);

    var overlay_h = text_total_h + 2 * overlay_padding;

    if (overlay_h > wh - 2 * border_size) {
        var scale = (wh - 2 * border_size - 2 * overlay_padding) / text_total_h;

        paint_title  = get_font(paint_title.Name,  Math.max(6, Math.floor(paint_title.Size  * scale)), paint_title.Style);
        paint_artist = get_font(paint_artist.Name, Math.max(6, Math.floor(paint_artist.Size * scale)), paint_artist.Style);
        paint_extra  = get_font(paint_extra.Name,  Math.max(6, Math.floor(paint_extra.Size  * scale)), paint_extra.Style);

        title_h  = Math.ceil(gr.CalcTextHeight(cur_title,  paint_title,  text_w));
        artist_h = Math.ceil(gr.CalcTextHeight(cur_artist, paint_artist, text_w));
        extra_h  = (extra_info_enabled && cur_extra)
            ? Math.ceil(gr.CalcTextHeight(cur_extra, paint_extra, text_w))
            : 0;

        text_total_h =
            title_h +
            gap_title_artist +
            artist_h +
            (extra_h ? gap_artist_extra + extra_h : 0);

        overlay_h = text_total_h + 2 * overlay_padding;
    }

    var cy =
        (layout === 0) ? Math.floor((wh - overlay_h) / 2) :
        (layout === 1) ? wh - overlay_h - 20 :
        20;

    if (text_bg_enabled) {
        gr.FillSolidRect(border_size, cy, ww - 2 * border_size, overlay_h, 0xAA000000);
    }

    var ty = cy + overlay_padding;
    var ay = ty + title_h + gap_title_artist;
    var ey = ay + artist_h + gap_artist_extra;

    if (text_shadow_enabled) {
        var sc = 0x88000000;
        var d = 2;

        gr.GdiDrawText(cur_title,  paint_title,  sc, text_x, ty + d, text_w, title_h,  0x0001 | 0x0040 | 0x0010);
        gr.GdiDrawText(cur_artist, paint_artist, sc, text_x, ay + d, text_w, artist_h, 0x0001 | 0x0040 | 0x0008);
        if (extra_h) {
            gr.GdiDrawText(cur_extra, paint_extra, sc, text_x, ey + d, text_w, extra_h, 0x0001 | 0x0040 | 0x0008);
        }
    }

    gr.GdiDrawText(cur_title,  paint_title,  RGB(255,255,255), text_x, ty, text_w, title_h,  0x0001 | 0x0040 | 0x0010);
    gr.GdiDrawText(cur_artist, paint_artist, RGB(200,200,200), text_x, ay, text_w, artist_h, 0x0001 | 0x0040 | 0x0008);
    if (extra_h) {
        gr.GdiDrawText(cur_extra, paint_extra, RGB(180,180,180), text_x, ey, text_w, extra_h, 0x0001 | 0x0040 | 0x0008);
    }
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
// Right-click menu
// ------------------------------
function on_mouse_rbtn_up(x, y) {
    var m       = window.CreatePopupMenu();
    var s_blur  = window.CreatePopupMenu();
    var s_dark  = window.CreatePopupMenu();
    var s_bord  = window.CreatePopupMenu();
    var s_fonts = window.CreatePopupMenu();

    // --- Main options ---
    m.AppendMenuItem(0, 1, 'Enable blur');         m.CheckMenuItem(1, blur_enabled);
    m.AppendMenuItem(0, 2, 'Show text background'); m.CheckMenuItem(2, text_bg_enabled);
    m.AppendMenuItem(0, 3, 'Text shadow');         m.CheckMenuItem(3, text_shadow_enabled);
    m.AppendMenuItem(0, 4, 'Show extra track info'); m.CheckMenuItem(4, extra_info_enabled);
    m.AppendMenuSeparator();

    // --- Blur settings submenu ---
    for (var i = 0; i <= 10; i++) {
        var v = i * 20;
        s_blur.AppendMenuItem(0, 40 + i, 'Radius: ' + v);
        if (radius === v) s_blur.CheckMenuItem(40 + i, true);
    }
    s_blur.AppendMenuItem(0, 51, 'Max: 254');
    s_blur.AppendTo(m, 0, 'Blur Settings');

    // --- Darken background submenu ---
    for (var d = 0; d <= 10; d++) {
        var dv = d * 10;
        s_dark.AppendMenuItem(0, 70 + d, 'Level: ' + dv + '%');
        if (darken_value === dv) s_dark.CheckMenuItem(70 + d, true);
    }
    s_dark.AppendTo(m, 0, 'Darken Background');

    // --- Border submenu ---
    s_bord.AppendMenuItem(0, 1001, 'Set Border Size...');
    s_bord.AppendMenuItem(0, 101, 'Change Color...');
    s_bord.AppendTo(m, 0, 'Border Appearance');

    // --- Fonts submenu ---
    var default_fonts = ['Segoe UI','Arial','Calibri','Tahoma','Verdana'];
    var s_title  = window.CreatePopupMenu();
    var s_artist = window.CreatePopupMenu();
    var s_extra  = window.CreatePopupMenu();

    // Title fonts
    for (var i = 0; i < default_fonts.length; i++) s_title.AppendMenuItem(0, 3000 + i, 'Font: ' + default_fonts[i]);
    s_title.AppendMenuSeparator();
    s_title.AppendMenuItem(0, 2000, 'Set Font Name...');
    s_title.AppendMenuItem(0, 2001, 'Set Font Size...');
    s_title.AppendTo(s_fonts, 0, 'Title');

    // Artist fonts
    for (var i = 0; i < default_fonts.length; i++) s_artist.AppendMenuItem(0, 3010 + i, 'Font: ' + default_fonts[i]);
    s_artist.AppendMenuSeparator();
    s_artist.AppendMenuItem(0, 2010, 'Set Font Name...');
    s_artist.AppendMenuItem(0, 2011, 'Set Font Size...');
    s_artist.AppendTo(s_fonts, 0, 'Artist');

    // Extra fonts
    for (var i = 0; i < default_fonts.length; i++) s_extra.AppendMenuItem(0, 3020 + i, 'Font: ' + default_fonts[i]);
    s_extra.AppendMenuSeparator();
    s_extra.AppendMenuItem(0, 2020, 'Set Font Name...');
    s_extra.AppendMenuItem(0, 2021, 'Set Font Size...');
    s_extra.AppendTo(s_fonts, 0, 'Extra');

    s_fonts.AppendTo(m, 0, 'Fonts');

    // --- Layout options ---
    m.AppendMenuSeparator();
    m.AppendMenuItem(0, 10, 'Layout: Center');
    m.AppendMenuItem(0, 11, 'Layout: Bottom');
    m.AppendMenuItem(0, 12, 'Layout: Minimal');
    m.CheckMenuRadioItem(10, 12, 10 + layout);

    // --- Handle menu selection ---
    var r = m.TrackPopupMenu(x, y);
    if (r > 0) {

        // Toggle main options
        if (r === 1) { blur_enabled = !blur_enabled; window.SetProperty('blur_enabled', blur_enabled); last_blur_radius = -1; blur_img = null; }
        else if (r === 2) { text_bg_enabled = !text_bg_enabled; window.SetProperty('text_bg_enabled', text_bg_enabled); }
        else if (r === 3) { text_shadow_enabled = !text_shadow_enabled; window.SetProperty('text_shadow_enabled', text_shadow_enabled); }
        else if (r === 4) { extra_info_enabled = !extra_info_enabled; window.SetProperty('extra_info_enabled', extra_info_enabled); update_text(); }

        // Blur radius
        else if (r >= 40 && r <= 50) { radius = (r - 40) * 20; window.SetProperty('blur_radius', radius); }
        else if (r === 51) { radius = 254; window.SetProperty('blur_radius', radius); }

        // Darken level
        else if (r >= 70 && r <= 80) { darken_value = (r - 70) * 10; window.SetProperty('darken_value', darken_value); }

        // Border
        else if (r === 1001) {
            var i = utils.InputBox(window.ID, 'Border Size', 'Enter border size (0–50 px):', border_size.toString(), false);
            var v = parseInt(i);
            if (!isNaN(v)) { border_size = Math.max(0, Math.min(50, v)); window.SetProperty('border_size', border_size); }
        }
        else if (r === 101) {
            var c = utils.ColourPicker(window.ID, border_color);
            if (c !== border_color) { border_color = c; window.SetProperty('border_color', c); }
        }

        // Title fonts
        else if (r >= 3000 && r <= 3004) { title_font_name = default_fonts[r - 3000]; window.SetProperty('title_font_name', title_font_name); rebuild_fonts(); }
        else if (r === 2000) { var f = utils.InputBox(window.ID, 'Title Font Name', 'Enter font name:', title_font_name); if (f) { title_font_name = f; window.SetProperty('title_font_name', title_font_name); rebuild_fonts(); } }
        else if (r === 2001) { var s = utils.InputBox(window.ID, 'Title Font Size', 'Enter font size (6-200):', title_font_size.toString()); var fs = parseInt(s); if (!isNaN(fs) && fs >= 6 && fs <= 200) { title_font_size = fs; window.SetProperty('title_font_size', title_font_size); rebuild_fonts(); } }

        // Artist fonts
        else if (r >= 3010 && r <= 3014) { artist_font_name = default_fonts[r - 3010]; window.SetProperty('artist_font_name', artist_font_name); rebuild_fonts(); }
        else if (r === 2010) { var f = utils.InputBox(window.ID, 'Artist Font Name', 'Enter font name:', artist_font_name); if (f) { artist_font_name = f; window.SetProperty('artist_font_name', artist_font_name); rebuild_fonts(); } }
        else if (r === 2011) { var s = utils.InputBox(window.ID, 'Artist Font Size', 'Enter font size (6-200):', artist_font_size.toString()); var fs = parseInt(s); if (!isNaN(fs) && fs >= 6 && fs <= 200) { artist_font_size = fs; window.SetProperty('artist_font_size', artist_font_size); rebuild_fonts(); } }

        // Extra fonts
        else if (r >= 3020 && r <= 3024) { extra_font_name = default_fonts[r - 3020]; window.SetProperty('extra_font_name', extra_font_name); rebuild_fonts(); }
        else if (r === 2020) { var f = utils.InputBox(window.ID, 'Extra Font Name', 'Enter font name:', extra_font_name); if (f) { extra_font_name = f; window.SetProperty('extra_font_name', extra_font_name); rebuild_fonts(); } }
        else if (r === 2021) { var s = utils.InputBox(window.ID, 'Extra Font Size', 'Enter font size (6-200):', extra_font_size.toString()); var fs = parseInt(s); if (!isNaN(fs) && fs >= 6 && fs <= 200) { extra_font_size = fs; window.SetProperty('extra_font_size', extra_font_size); rebuild_fonts(); } }

        // Layout
        else if (r >= 10 && r <= 12) { layout = r - 10; window.SetProperty('layout', layout); }

        build_blur();
        window.Repaint();
    }

    return true;
}


// ------------------------------
// Playback
// ------------------------------
function on_playback_new_track() {
    load_album_art();
}

function on_playback_stop() {
    blur_img = null;
    src_img = null;
    update_text();
    window.Repaint();
}

// ------------------------------
// Init
// ------------------------------
load_album_art();
