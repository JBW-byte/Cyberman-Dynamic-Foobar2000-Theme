// ================= AUTHOR L.E.D. AI ASSISTED =================
window.DefineScript('StackBlur+Panel', { author: 'marc2003' });

include('docs/Helpers.js');

function RGB(r, g, b) { return 0xFF000000 | (r << 16) | (g << 8) | b; }
function RGBA(r, g, b, a) { return ((a << 24) | (r << 16) | (g << 8) | b); }

// ------------------------------
// Font sizes (persistent)
// ------------------------------
var title_font_size  = window.GetProperty('title_font_size', 24);
var artist_font_size = window.GetProperty('artist_font_size', 16);
var extra_font_size  = window.GetProperty('extra_font_size', 14);

var font_title, font_artist, font_extra;

function rebuild_fonts() {
    font_title  = gdi.Font('Segoe UI', title_font_size, 1);
    font_artist = gdi.Font('Segoe UI', artist_font_size, 0);
    font_extra  = gdi.Font('Segoe UI', extra_font_size, 0);
}
rebuild_fonts();

// ------------------------------
// Line spacing control (tighter title → artist gap)
// ------------------------------
var gap_title_artist = 2;   // tighter spacing
var gap_artist_extra = 6;
var overlay_padding  = 6;

// ------------------------------
// Globals / Settings
// ------------------------------
var src_img  = null;
var blur_img = null;

var cur_title = '';
var cur_artist = '';
var cur_extra = '';

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
// Blur builder (safe)
// ------------------------------
function build_blur() {
    if (blur_img && blur_img.CreatedByUs) {
        blur_img.Dispose();
        blur_img = null;
    }

    if (!src_img || !blur_enabled || !ww || !wh) return;

    try {
        blur_img = gdi.CreateImage(ww, wh);
        blur_img.CreatedByUs = true;
        var g = blur_img.GetGraphics();
        g.DrawImage(src_img, 0, 0, ww, wh, 0, 0, src_img.Width, src_img.Height);
        g.ReleaseGraphics();
        blur_img.StackBlur(radius);
    } catch (e) {
        blur_img = src_img.Clone(0, 0, src_img.Width, src_img.Height);
        blur_img.CreatedByUs = false;
        blur_img.StackBlur(radius);
    }
}

// ------------------------------
// Album art load (top cover removed)
// ------------------------------
function load_album_art() {
    update_text();

    if (blur_img && blur_img.CreatedByUs) {
        blur_img.Dispose();
        blur_img = null;
    }

    src_img = null;
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

    if (fading) {
        alpha += 20;
        if (alpha >= 255) { alpha = 255; fading = false; }
        else setTimeout(() => window.Repaint(), 30);
    }

    // Background
    if (src_img) {
        var bg = (blur_enabled && blur_img) ? blur_img : src_img;
        gr.DrawImage(bg, 0, 0, ww, wh, 0, 0, bg.Width, bg.Height, 0, alpha);
        if (darken_value > 0) {
            var op = Math.floor(darken_value / 100 * 255);
            gr.FillSolidRect(0, 0, ww, wh, RGBA(0,0,0,op));
        }
    } else {
        gr.FillSolidRect(0, 0, ww, wh, RGB(25,25,25));
    }

    // Border
    if (border_size > 0) {
        var s = border_size / 2;
        gr.DrawRect(s, s, ww - border_size, wh - border_size, border_size, border_color);
    }

    // ---- Text layout ----
    var flags_center = 0x0001 | 0x0040;
    var flags_wrap   = flags_center | 0x0010;
    var flags_clip   = flags_center | 0x0008;

    var title_h  = Math.ceil(gr.CalcTextHeight(cur_title || 'A', font_title, ww));
    var artist_h = Math.ceil(gr.CalcTextHeight(cur_artist || 'A', font_artist, ww));
    var extra_h  = (extra_info_enabled && cur_extra)
        ? Math.ceil(gr.CalcTextHeight(cur_extra, font_extra, ww))
        : 0;

    // Total overlay height including tighter gaps
    var text_total_h =
        title_h +
        gap_title_artist +
        artist_h +
        (extra_h ? gap_artist_extra + extra_h : 0);

    var overlay_h = text_total_h + overlay_padding * 2;

    var cy = (layout === 0) ? Math.floor((wh - overlay_h) / 2)
           : (layout === 1) ? wh - overlay_h - 20
           : 20;

    if (text_bg_enabled)
        gr.FillSolidRect(0, cy, ww, overlay_h, 0xAA000000);

    var ty = cy + overlay_padding;
    var ay = ty + title_h + gap_title_artist;
    var ey = ay + artist_h + gap_artist_extra;

    // Shadow
    if (text_shadow_enabled) {
        var sc = 0x88000000, d = 2;
        gr.GdiDrawText(cur_title,  font_title,  sc, d, ty+d, ww, title_h,  flags_wrap);
        gr.GdiDrawText(cur_artist, font_artist, sc, d, ay+d, ww, artist_h, flags_clip);
        if (extra_h)
            gr.GdiDrawText(cur_extra, font_extra, sc, d, ey+d, ww, extra_h, flags_clip);
    }

    // Text
    gr.GdiDrawText(cur_title,  font_title,  RGB(255,255,255), 0, ty, ww, title_h,  flags_wrap);
    gr.GdiDrawText(cur_artist, font_artist, RGB(200,200,200), 0, ay, ww, artist_h, flags_clip);
    if (extra_h)
        gr.GdiDrawText(cur_extra, font_extra, RGB(180,180,180), 0, ey, ww, extra_h, flags_clip);
}

// ------------------------------
// Mouse
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
    var m = window.CreatePopupMenu();
    var s_blur = window.CreatePopupMenu();
    var s_dark = window.CreatePopupMenu();
    var s_bord = window.CreatePopupMenu();

    // Main menu options (top cover removed)
    m.AppendMenuItem(0,1,'Enable blur'); m.CheckMenuItem(1,blur_enabled);
    m.AppendMenuItem(0,2,'Show text background'); m.CheckMenuItem(2,text_bg_enabled);
    m.AppendMenuItem(0,3,'Text shadow'); m.CheckMenuItem(3,text_shadow_enabled);
    m.AppendMenuItem(0,4,'Show extra track info'); m.CheckMenuItem(4,extra_info_enabled);
    m.AppendMenuSeparator();

    // Blur submenu
    for (var i=0;i<=10;i++){
        var v=i*20;
        s_blur.AppendMenuItem(0,40+i,'Radius: '+v);
        if(radius===v) s_blur.CheckMenuItem(40+i,true);
    }
    s_blur.AppendMenuItem(0,51,'Max: 254');
    s_blur.AppendTo(m,0,'Blur Settings');

    // Darken submenu
    for (var d=0;d<=5;d++){
        var dv=d*10;
        s_dark.AppendMenuItem(0,70+d,'Level: '+dv+'%');
        if(darken_value===dv) s_dark.CheckMenuItem(70+d,true);
    }
    s_dark.AppendTo(m,0,'Darken Background');

    // Border submenu
    s_bord.AppendMenuItem(0,1001,'Set Border Size...');
    s_bord.AppendMenuItem(0,101,'Change Color...');
    s_bord.AppendTo(m,0,'Border Appearance');

    // Font sizes
    m.AppendMenuSeparator();
    m.AppendMenuItem(0,2000,'Set Title Font Size...');
    m.AppendMenuItem(0,2001,'Set Artist Font Size...');
    m.AppendMenuItem(0,2002,'Set Extra Font Size...');

    // Layout options
    m.AppendMenuSeparator();
    m.AppendMenuItem(0,10,'Layout: Center');
    m.AppendMenuItem(0,11,'Layout: Bottom');
    m.AppendMenuItem(0,12,'Layout: Minimal');
    m.CheckMenuRadioItem(10,12,10+layout);

    // Track selection
    var r = m.TrackPopupMenu(x,y);
    if(r>0){
        if(r===1){ blur_enabled=!blur_enabled; window.SetProperty('blur_enabled',blur_enabled); }
        else if(r===2){ text_bg_enabled=!text_bg_enabled; window.SetProperty('text_bg_enabled',text_bg_enabled); }
        else if(r===3){ text_shadow_enabled=!text_shadow_enabled; window.SetProperty('text_shadow_enabled',text_shadow_enabled); }
        else if(r===4){ extra_info_enabled=!extra_info_enabled; window.SetProperty('extra_info_enabled',extra_info_enabled); update_text(); }
        else if(r>=40&&r<=50){ radius=(r-40)*20; window.SetProperty('blur_radius',radius); }
        else if(r===51){ radius=254; window.SetProperty('blur_radius',radius); }
        else if(r>=70&&r<=75){ darken_value=(r-70)*10; window.SetProperty('darken_value',darken_value); }
        else if(r===1001){
            var i=utils.InputBox(window.ID,'Border Size','Enter border size (0–50 px):',border_size.toString(),false);
            var v=parseInt(i);
            if(!isNaN(v)){ border_size=Math.max(0,Math.min(50,v)); window.SetProperty('border_size',border_size); }
        }
        else if(r===101){
            var c=utils.ColourPicker(window.ID,border_color);
            if(c!==border_color){ border_color=c; window.SetProperty('border_color',border_color); }
        }
        else if(r>=2000&&r<=2002){
            var labels=['Title','Artist','Extra'];
            var sizes=[title_font_size,artist_font_size,extra_font_size];
            var idx=r-2000;
            var v=utils.InputBox(window.ID,'Font Size','Set '+labels[idx]+' Font Size:',sizes[idx].toString(),false);
            var fs=parseInt(v);
            if(!isNaN(fs)&&fs>6&&fs<200){
                if(idx===0) title_font_size=fs;
                if(idx===1) artist_font_size=fs;
                if(idx===2) extra_font_size=fs;
                window.SetProperty('title_font_size',title_font_size);
                window.SetProperty('artist_font_size',artist_font_size);
                window.SetProperty('extra_font_size',extra_font_size);
                rebuild_fonts();
            }
        }
        else if(r>=10&&r<=12){ layout=r-10; window.SetProperty('layout',layout); }

        build_blur();
        window.Repaint();
    }

    return true;
}


// ------------------------------
// Playback
// ------------------------------
function on_playback_new_track(){ load_album_art(); }
function on_playback_stop(){
    if(blur_img&&blur_img.CreatedByUs){ blur_img.Dispose(); blur_img=null; }
    src_img=null;
    update_text();
    window.Repaint();
}

// ------------------------------
// Init
// ------------------------------
load_album_art();
