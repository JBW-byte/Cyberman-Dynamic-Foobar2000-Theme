	       // ========= AUTHOR L.E.D. AI ASSISTED ========= \\
	      // === Polished Panel Artwork and Trackinfo v1 === \\
	     // === Blur Artwork + Trackinfo + AI eats code  ==== \\

   // ===================*** Foobar2000 64bit ***================== \\
  // ======= For Spider Monekey Panel 64bit, author: marc2003 ====== \\
 // === SMP 64bit script samples StackBlur+Panel, author:marc2003 === \\

window.DefineScript('SMP_64_PanelArt', { author: 'L.E.D.' });

function RGB(r, g, b) { return 0xFF000000 | (r << 16) | (g << 8) | b; }
function RGBA(r, g, b, a) { return ((a << 24) | (r << 16) | (g << 8) | b); }

var last_blur_radius = -1;
var last_img_w = 0;
var last_img_h = 0;

// ------------------------------
// Font sizes (persistent)
// ------------------------------
var title_font_size  = window.GetProperty('title_font_size', 24);
var artist_font_size = window.GetProperty('artist_font_size', 16);
var extra_font_size  = window.GetProperty('extra_font_size', 14);

var font_title = null, font_artist = null, font_extra = null;

function rebuild_fonts() {
    font_title  = gdi.Font('Segoe UI', title_font_size, 1);
    font_artist = gdi.Font('Segoe UI', artist_font_size, 0);
    font_extra  = gdi.Font('Segoe UI', extra_font_size, 0);
}
rebuild_fonts();

// ------------------------------
// Line spacing & overlay
// ------------------------------
var gap_title_artist = 2;
var gap_artist_extra = 6;
var overlay_padding  = 6;

// ------------------------------
// Globals / Settings
// ------------------------------
var src_img = null;
var blur_img = null;
var fade_timer = null;
var cur_title = '', cur_artist = '', cur_extra = '';

var radius          = window.GetProperty('blur_radius', 20);
var blur_enabled    = window.GetProperty('blur_enabled', true);
var text_bg_enabled = window.GetProperty('text_bg_enabled', true);
var text_shadow_enabled = window.GetProperty('text_shadow_enabled', true);
var layout          = window.GetProperty('layout', 0);
var extra_info_enabled = window.GetProperty('extra_info_enabled', true);
var darken_value    = window.GetProperty('darken_value', 20);
var border_size     = window.GetProperty('border_size', 0);
var border_color    = window.GetProperty('border_color', RGB(255,255,255));

var ww = 0, wh = 0;
var alpha = 255;
var fading = false;

var font_cache = {};
function get_font(name, size, style) {
    var key = name + size + style;
    if (!font_cache[key])
        font_cache[key] = gdi.Font(name, size, style);
    return font_cache[key];
}

// ------------------------------
// Update track info
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
// Fit text to width (automatic scaling)
// ------------------------------
function fit_text(gr, text, font, max_w) {
    if (!text) return font;

    var fsize = font.Size;
    var test_font;

    while (fsize > 6) {
        test_font = get_font(font.Name, fsize, font.Style);

        var metrics = gr.MeasureString(
            text,
            test_font,
            0, 0,
            10000, 1000,   // VERY large width so MeasureString returns real width
            0
        );

        if (metrics.Width <= max_w) break;  // Stop when it fits

        fsize--;
    }

    return get_font(font.Name, fsize, font.Style);
}


// ------------------------------
// Build blur
// ------------------------------
function build_blur() {
    if (!src_img || !blur_enabled || ww <= 0 || wh <= 0)
        return;

    if (blur_img &&
        last_blur_radius === radius &&
        last_img_w === ww &&
        last_img_h === wh)
        return;

    blur_img = gdi.CreateImage(ww, wh);

    var g = blur_img.GetGraphics();
    g.DrawImage(src_img, 0, 0, ww, wh, 0, 0, src_img.Width, src_img.Height);
    blur_img.ReleaseGraphics(g);

    blur_img.StackBlur(radius);

    last_blur_radius = radius;
    last_img_w = ww;
    last_img_h = wh;
}

// ------------------------------
// Load album art
// ------------------------------
function load_album_art() {
    update_text();

    var metadb = fb.GetNowPlaying();
    if (metadb) {
        var art = utils.GetAlbumArtV2(metadb, 0);
        if (art) {
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
    ww = w; wh = h;
    build_blur();
}

// ------------------------------
// Paint
// ------------------------------
function on_paint(gr) {
    if (!ww || !wh) return;

    // ------------------------------
    // Handle fading
    // ------------------------------
    if (fading) {
        alpha = Math.min(alpha + 20, 255);
        if (alpha >= 255) {
            fading = false;
            if (fade_timer) { clearTimeout(fade_timer); fade_timer = null; }
        } else if (!fade_timer) {
            fade_timer = setTimeout(function () {
                fade_timer = null;
                window.Repaint();
            }, 30);
        }
    }

    // ------------------------------
    // Background
    // ------------------------------
    if (src_img) {
        var bg = (blur_enabled && blur_img) ? blur_img : src_img;
        gr.DrawImage(bg, 0, 0, ww, wh, 0, 0, bg.Width, bg.Height);
        if (darken_value > 0) {
            var op = Math.floor(darken_value * 2.55 * (alpha / 255));
            gr.FillSolidRect(0, 0, ww, wh, RGBA(0,0,0,op));
        }
    } else {
        gr.FillSolidRect(0, 0, ww, wh, RGB(25,25,25));
    }

    // ------------------------------
    // Border
    // ------------------------------
    if (border_size > 0) {
        var s = border_size / 2;
        gr.DrawRect(s, s, ww - border_size, wh - border_size, border_size, border_color);
    }

    var max_text_w = ww - border_size*2 - overlay_padding*2;
    var max_text_h = wh - border_size*2 - overlay_padding*2;

    // Automatic text scaling (fit inside panel)
function scale_text_fonts(gr, max_w, max_h) {
    var t_font = font_title;
    var a_font = font_artist;
    var e_font = (extra_info_enabled && cur_extra) ? font_extra : null;

    // Step 1: horizontal fit
    [t_font, a_font, e_font].forEach((f, i) => {
        if (!f) return;
        var text = [cur_title, cur_artist, cur_extra][i];
        var test_font = f;
        while (test_font.Size > 6 && gr.MeasureString(text, test_font, 0, 0, 1000, 1000, 0).Width > max_w) {
            test_font = get_font(test_font.Name, test_font.Size - 1, test_font.Style);
        }
        if (i === 0) t_font = test_font;
        if (i === 1) a_font = test_font;
        if (i === 2) e_font = test_font;
    });

    // Step 2: vertical fit only if necessary
    var title_h  = Math.ceil(gr.CalcTextHeight(cur_title, t_font, max_w));
    var artist_h = Math.ceil(gr.CalcTextHeight(cur_artist, a_font, max_w));
    var extra_h  = e_font ? Math.ceil(gr.CalcTextHeight(cur_extra, e_font, max_w)) : 0;
    var text_total_h = title_h + gap_title_artist + artist_h + (extra_h ? gap_artist_extra + extra_h : 0);

    while (text_total_h > max_h && (t_font.Size > 6 || a_font.Size > 6 || (e_font && e_font.Size > 6))) {
        if (t_font.Size > 6) t_font = get_font(t_font.Name, t_font.Size - 1, t_font.Style);
        if (a_font.Size > 6) a_font = get_font(a_font.Name, a_font.Size - 1, a_font.Style);
        if (e_font && e_font.Size > 6) e_font = get_font(e_font.Name, e_font.Size - 1, e_font.Style);

        title_h  = Math.ceil(gr.CalcTextHeight(cur_title, t_font, max_w));
        artist_h = Math.ceil(gr.CalcTextHeight(cur_artist, a_font, max_w));
        extra_h  = e_font ? Math.ceil(gr.CalcTextHeight(cur_extra, e_font, max_w)) : 0;
        text_total_h = title_h + gap_title_artist + artist_h + (extra_h ? gap_artist_extra + extra_h : 0);
    }

    return [t_font, a_font, e_font];
}


    var scaled_fonts = scale_text_fonts(gr, max_text_w, max_text_h);
    var paint_title  = scaled_fonts[0];
    var paint_artist = scaled_fonts[1];
    var paint_extra  = scaled_fonts[2] || font_extra;

    // ------------------------------
    // Compute text positions
    // ------------------------------
    var title_h  = Math.ceil(gr.CalcTextHeight(cur_title, paint_title, max_text_w));
    var artist_h = Math.ceil(gr.CalcTextHeight(cur_artist, paint_artist, max_text_w));
    var extra_h  = (extra_info_enabled && cur_extra) ? Math.ceil(gr.CalcTextHeight(cur_extra, paint_extra, max_text_w)) : 0;

    var text_total_h = title_h + gap_title_artist + artist_h + (extra_h ? gap_artist_extra + extra_h : 0);
    var overlay_h = text_total_h + overlay_padding*2;

    var cy;
    if (layout === 0) cy = Math.floor((wh - overlay_h) / 2);
    else if (layout === 1) cy = wh - overlay_h - 20;
    else cy = 20;

    if (text_bg_enabled) gr.FillSolidRect(0, cy, ww, overlay_h, 0xAA000000);

    var ty = cy + overlay_padding;
    var ay = ty + title_h + gap_title_artist;
    var ey = ay + artist_h + gap_artist_extra;

    // ------------------------------
    // Text shadow
    // ------------------------------
    if (text_shadow_enabled) {
        var sc = 0x88000000, d = 2;
        gr.GdiDrawText(cur_title,  paint_title,  sc, 0, ty+d, ww, title_h, 0x0001|0x0040|0x0010);
        gr.GdiDrawText(cur_artist, paint_artist, sc, 0, ay+d, ww, artist_h, 0x0001|0x0040|0x0008);
        if (extra_h) gr.GdiDrawText(cur_extra, paint_extra, sc, 0, ey+d, ww, extra_h, 0x0001|0x0040|0x0008);
    }

    // ------------------------------
    // Draw text
    // ------------------------------
    gr.GdiDrawText(cur_title,  paint_title,  RGB(255,255,255), 0, ty, ww, title_h, 0x0001|0x0040|0x0010);
    gr.GdiDrawText(cur_artist, paint_artist, RGB(200,200,200), 0, ay, ww, artist_h, 0x0001|0x0040|0x0008);
    if (extra_h) gr.GdiDrawText(cur_extra, paint_extra, RGB(180,180,180), 0, ey, ww, extra_h, 0x0001|0x0040|0x0008);
}


// ------------------------------
// Mouse wheel
// ------------------------------
function on_mouse_wheel(step) {
    if (!blur_enabled || !src_img) return;
    radius = Math.max(2, Math.min(254, radius + step*5));
    window.SetProperty('blur_radius', radius);
    build_blur();
    window.Repaint();
}

// ------------------------------
// Right-click menu
// ------------------------------
function on_mouse_rbtn_up(x, y) {
    var m = window.CreatePopupMenu();
    var s_blur = window.CreatePopupMenu();
    var s_dark = window.CreatePopupMenu();
    var s_bord = window.CreatePopupMenu();

    m.AppendMenuItem(0,1,'Enable blur'); m.CheckMenuItem(1,blur_enabled);
    m.AppendMenuItem(0,2,'Show text background'); m.CheckMenuItem(2,text_bg_enabled);
    m.AppendMenuItem(0,3,'Text shadow'); m.CheckMenuItem(3,text_shadow_enabled);
    m.AppendMenuItem(0,4,'Show extra track info'); m.CheckMenuItem(4,extra_info_enabled);
    m.AppendMenuSeparator();

    for (var i=0;i<=10;i++){
        var v=i*20;
        s_blur.AppendMenuItem(0,40+i,'Radius: '+v);
        if(radius===v) s_blur.CheckMenuItem(40+i,true);
    }
    s_blur.AppendMenuItem(0,51,'Max: 254');
    s_blur.AppendTo(m,0,'Blur Settings');

    for (var d=0;d<=5;d++){
        var dv=d*10;
        s_dark.AppendMenuItem(0,70+d,'Level: '+dv+'%');
        if(darken_value===dv) s_dark.CheckMenuItem(70+d,true);
    }
    s_dark.AppendTo(m,0,'Darken Background');

    s_bord.AppendMenuItem(0,1001,'Set Border Size...');
    s_bord.AppendMenuItem(0,101,'Change Color...');
    s_bord.AppendTo(m,0,'Border Appearance');

    m.AppendMenuSeparator();
    m.AppendMenuItem(0,2000,'Set Title Font Size...');
    m.AppendMenuItem(0,2001,'Set Artist Font Size...');
    m.AppendMenuItem(0,2002,'Set Extra Font Size...');

    m.AppendMenuSeparator();
    m.AppendMenuItem(0,10,'Layout: Center');
    m.AppendMenuItem(0,11,'Layout: Bottom');
    m.AppendMenuItem(0,12,'Layout: Minimal');
    m.CheckMenuRadioItem(10,12,10+layout);

    var r = m.TrackPopupMenu(x,y);
    if(r > 0){
        if(r===1){
            blur_enabled = !blur_enabled;
            window.SetProperty('blur_enabled', blur_enabled);
            last_blur_radius = -1;
            blur_img = null;
        }
        else if(r===2){ text_bg_enabled = !text_bg_enabled; window.SetProperty('text_bg_enabled', text_bg_enabled); }
        else if(r===3){ text_shadow_enabled = !text_shadow_enabled; window.SetProperty('text_shadow_enabled', text_shadow_enabled); }
        else if(r===4){ extra_info_enabled = !extra_info_enabled; window.SetProperty('extra_info_enabled', extra_info_enabled); update_text(); }
        else if(r >= 40 && r <= 50){ radius = (r-40)*20; window.SetProperty('blur_radius', radius); }
        else if(r===51){ radius = 254; window.SetProperty('blur_radius', radius); }
        else if(r >= 70 && r <= 75){ darken_value = (r-70)*10; window.SetProperty('darken_value', darken_value); }
        else if(r===1001){
            var i = utils.InputBox(window.ID,'Border Size','Enter border size (0–50 px):',border_size.toString(),false);
            var v = parseInt(i);
            if(!isNaN(v)){ border_size = Math.max(0,Math.min(50,v)); window.SetProperty('border_size', border_size); }
        }
        else if(r===101){
            var c = utils.ColourPicker(window.ID,border_color);
            if(c !== border_color){ border_color = c; window.SetProperty('border_color', c); }
        }
        else if(r >= 2000 && r <= 2002){
            var labels = ['Title','Artist','Extra'];
            var sizes = [title_font_size, artist_font_size, extra_font_size];
            var idx = r - 2000;
            var v = utils.InputBox(window.ID,'Font Size','Set '+labels[idx]+' Font Size:',sizes[idx].toString(),false);
            var fs = parseInt(v);
            if(!isNaN(fs) && fs > 6 && fs < 200){
                if(idx===0) title_font_size = fs;
                if(idx===1) artist_font_size = fs;
                if(idx===2) extra_font_size = fs;
                window.SetProperty('title_font_size', title_font_size);
                window.SetProperty('artist_font_size', artist_font_size);
                window.SetProperty('extra_font_size', extra_font_size);
                rebuild_fonts();
            }
        }
        else if(r >=10 && r <=12){ layout = r-10; window.SetProperty('layout', layout); }

        build_blur();
        window.Repaint();
    }
    return true;
}

// ------------------------------
// Playback
// ------------------------------
function on_playback_new_track(){ load_album_art(); }
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
