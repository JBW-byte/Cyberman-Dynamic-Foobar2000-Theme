'use strict';
		   // ======== AUTHOR L.E.D. AI ASSISTED ======== \\
		  // ======== SMP 64bit LCD TimerPro v2.3 ========= \\
	     // ====== LCD Timer Various Custom Effects  ====== \\

  // ===================*** Foobar2000 64bit ***================== \\
 // ======= For Spider Monkey Panel 64bit, author: marc2003 ======= \\
// ======== Right click menu full Customization and Layout ========= \\

/* 
 * Custom License for foobar2000 Themes
 * Copyright (c) 2026 [L.E.D.]
 * Allowed: Non-commercial use and modification.
 * Prohibited: Paid products/themes, subscriptions, or cloud-bundled services.
 */

window.DefineScript('SMP 64bit LCD TimerPro', { 
    author: 'L.E.D.', 
    version: '2.3', 
    features: { grab_focus: true } 
});

window.DrawMode = 0; // 0 = GDI+, 1 = Direct2D
window.DlgCode  = 0x0004; // DLGC_WANTALLKEYS

// ============================================================================================
// 1. HELPERS & MATH UTILITIES
// ============================================================================================
class GdiUtils {
    static #dpiScale = (typeof window.DPI === 'number' && window.DPI > 0) ? window.DPI / 96 : 1;

    static get dpiScale() {
        return this.#dpiScale;
    }

    static scale(size) {
        return Math.round(size * this.#dpiScale);
    }

    static clamp(val, min, max) {
        const n = Number(val);
        return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : min;
    }

    static RGB(r, g, b) {
        return (0xFF000000 | ((r & 0xFF) << 16) | ((g & 0xFF) << 8) | (b & 0xFF)) >>> 0;
    }

    static setAlpha(col, a) {
        const clampedA = (a < 0 ? 0 : a > 255 ? 255 : a) & 0xFF;
        return ((clampedA << 24) | (col & 0x00FFFFFF)) >>> 0;
    }

    static blendColours(c1, c2, f) {
        const r1 = (c1 >> 16) & 0xFF, g1 = (c1 >> 8) & 0xFF, b1 = c1 & 0xFF;
        const r2 = (c2 >> 16) & 0xFF, g2 = (c2 >> 8) & 0xFF, b2 = c2 & 0xFF;
        const r = (r1 + f * (r2 - r1)) & 0xFF;
        const g = (g1 + f * (g2 - g1)) & 0xFF;
        const b = (b1 + f * (b2 - b1)) & 0xFF;
        return (0xFF000000 | (r << 16) | (g << 8) | b) >>> 0;
    }

    static sanitizePath(str) {
        if (!str || typeof str !== 'string') return '';
        const clean = str.replace(/^["']+|["']+$/g, '').trim();
        if (/^[a-zA-Z]:[\\\/]?$/.test(clean)) return clean.substring(0, 2) + '\\';
        if (/^\\\\[^\\]+\\[^\\]+[\\\/]?$/.test(clean)) return clean.replace(/[\\\/]+$/, '') + '\\';
        return clean.replace(/[\/\\]+$/, '');
    }

    static prompt(promptText, titleText, defaultVal) {
        try {
            const res = utils.InputBox(window.ID, promptText, titleText, String(defaultVal ?? ''), true);
            return (res === null || res === undefined) ? null : res;
        } catch {
            return null;
        }
    }
}

window.MinWidth  = GdiUtils.scale(120);
window.MinHeight = GdiUtils.scale(36);

// ============================================================================================
// 2. FONT MANAGEMENT (LRU CACHED WITH PROBE DISPOSAL)
// ============================================================================================
class FontRegistry {
    #cache = new Map();
    #maxSize;

    constructor(maxSize = 100) {
        this.#maxSize = maxSize;
    }

    get(name, size, style = 0) {
        const s = Math.max(4, Math.round(size));
        const fontName = (typeof name === 'string' && name.trim().length > 0) ? name.trim() : 'Segoe UI';
        const key = `${fontName}_${s}_${style}`;

        let f = this.#cache.get(key);
        if (f) {
            this.#cache.delete(key);
            this.#cache.set(key, f);
            return f;
        }

        try { 
            f = gdi.Font(fontName, s, style); 
        } catch { 
            try { f = gdi.Font('Segoe UI', s, style); } catch { f = null; } 
        }

        if (f) {
            this.#cache.set(key, f);
            if (this.#cache.size > this.#maxSize) {
                const oldest = this.#cache.keys().next().value;
                const evicted = this.#cache.get(oldest);
                if (evicted && typeof evicted.Dispose === 'function') {
                    try { evicted.Dispose(); } catch {}
                }
                this.#cache.delete(oldest);
            }
        }
        return f;
    }

    fitSize(gr, text, fontName, fontStyle, maxW, maxH, startSize, minSize = 12) {
        const minBound = Math.max(4, Math.round(minSize));
        let low = minBound;
        let high = Math.max(minBound, Math.round(startSize));
        let best = minBound;
        const testText = text && text.trim().length > 0 ? text : '-88:88';
        const name = (typeof fontName === 'string' && fontName.trim().length > 0) ? fontName.trim() : 'Segoe UI';

        while (low <= high) {
            const mid = (low + high) >>> 1;
            let tempFont = null;
            try { 
                tempFont = gdi.Font(name, mid, fontStyle); 
            } catch { 
                tempFont = gdi.Font('Segoe UI', mid, fontStyle); 
            }
            if (!tempFont) { high = mid - 1; continue; }

            const m = gr.MeasureString(testText, tempFont, 0, 0, 9999, 9999);
            if (tempFont && typeof tempFont.Dispose === 'function') {
                try { tempFont.Dispose(); } catch {}
            }

            if (m.Width <= maxW && m.Height <= maxH) {
                best = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        return Math.max(minBound, best);
    }

    truncateToFit(gr, text, font, maxW) {
        if (!text || !font) return '';
        if (gr.MeasureString(text, font, 0, 0, 9999, 9999).Width <= maxW) return text;
        let low = 0, high = text.length, best = 0;
        while (low <= high) {
            const mid = (low + high) >>> 1;
            const sub = `${text.slice(0, mid)}...`;
            if (gr.MeasureString(sub, font, 0, 0, 9999, 9999).Width <= maxW) {
                best = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        return best > 0 ? `${text.slice(0, best)}...` : '...';
    }

    clear() {
        for (const font of this.#cache.values()) {
            if (font && typeof font.Dispose === 'function') {
                try { font.Dispose(); } catch {}
            }
        }
        this.#cache.clear();
    }
}

// ============================================================================================
// 3. PROCEDURAL 7-SEGMENT VECTOR ENGINE (ZERO-ALLOCATION DUAL-PATH)
// ============================================================================================
class SevenSegmentEngine {
    static MASKS = {
        '0': 0x3F, '1': 0x06, '2': 0x5B, '3': 0x4F, '4': 0x66,
        '5': 0x6D, '6': 0x7D, '7': 0x07, '8': 0x7F, '9': 0x6F,
        '-': 0x40, ' ': 0x00
    };

    static #flat = [];
    static #pts2D = [];

    static getMetrics(clockH) {
        const h = Math.max(16, Math.round(clockH));
        const w = Math.max(10, Math.round(h * 0.50));
        const colonW = Math.max(6, Math.round(w * 0.28));
        const charGap = Math.max(2, Math.round(w * 0.08));
        return { w, h, colonW, charGap };
    }

    static drawDigit(g, ch, x, y, w, h, color, italic = false) {
        const mask = SevenSegmentEngine.MASKS[ch] ?? 0;
        if (!mask) return;

        const t = Math.max(4, Math.round(w * 0.22));
        const ht = Math.round(t / 2);
        const gap = Math.max(1, Math.round(w * 0.035));
        const midY = Math.round(h / 2);
        const shear = italic ? Math.round(h * 0.08) : 0;

        const pt = (px, py) => {
            const sx = shear !== 0 ? (midY - py) * (shear / h) : 0;
            return [Math.round(x + px + sx), Math.round(y + py)];
        };

        const poly = (pts) => {
            const flat = SevenSegmentEngine.#flat;
            const pts2D = SevenSegmentEngine.#pts2D;
            flat.length = 0;
            pts2D.length = 0;
            for (let i = 0; i < pts.length; i++) {
                const p = pt(pts[i][0], pts[i][1]);
                flat.push(p[0], p[1]);
                pts2D.push(p);
            }
            try {
                g.FillPolygon(color, 0, flat);
            } catch {
                try { g.FillPolygon(color, 0, pts2D); } catch {}
            }
        };

        if (mask & (1 << 0)) poly([[gap, 0], [w - gap, 0], [w - gap - t, t], [gap + t, t]]);
        if (mask & (1 << 1)) poly([[w - t, gap + t], [w, gap], [w, midY - ht - gap], [w - ht, midY - gap], [w - t, midY - ht - gap]]);
        if (mask & (1 << 2)) poly([[w - t, midY + ht + gap], [w - ht, midY + gap], [w, midY + ht + gap], [w, h - gap], [w - t, h - t - gap]]);
        if (mask & (1 << 3)) poly([[gap + t, h - t], [w - gap - t, h - t], [w - gap, h], [gap, h]]);
        if (mask & (1 << 4)) poly([[0, midY + ht + gap], [ht, midY + gap], [t, midY + ht + gap], [t, h - t - gap], [0, h - gap]]);
        if (mask & (1 << 5)) poly([[0, gap], [t, gap + t], [t, midY - ht - gap], [ht, midY - gap], [0, midY - ht - gap]]);
        if (mask & (1 << 6)) poly([[gap + ht, midY], [gap + t, midY - ht], [w - gap - t, midY - ht], [w - gap - ht, midY], [w - gap - t, midY + ht], [gap + t, midY + ht]]);
    }

    static drawColon(g, x, y, w, h, color, italic = false) {
        const t = Math.max(3, Math.round(w * 0.42));
        const ht = Math.round(t / 2);
        const midY = Math.round(h / 2);
        const shear = italic ? Math.round(h * 0.08) : 0;
        const cx = Math.round(w / 2);

        const pt = (px, py) => {
            const sx = shear !== 0 ? (midY - py) * (shear / h) : 0;
            return [Math.round(x + px + sx), Math.round(y + py)];
        };

        const dot = (cy) => {
            const p1 = pt(cx - ht, cy - ht), p2 = pt(cx + ht, cy - ht);
            const p3 = pt(cx + ht, cy + ht), p4 = pt(cx - ht, cy + ht);
            const flat = [p1[0], p1[1], p2[0], p2[1], p3[0], p3[1], p4[0], p4[1]];
            const pts2D = [p1, p2, p3, p4];
            try {
                g.FillPolygon(color, 0, flat);
            } catch {
                try { g.FillPolygon(color, 0, pts2D); } catch {}
            }
        };

        dot(Math.round(midY - h * 0.22));
        dot(Math.round(midY + h * 0.22));
    }
}

class DigitSpriteCache {
    #sprites = new Map();
    #ghostSprites = new Map();
    #key = '';
    #digitW = 0;
    #digitH = 0;
    #colonW = 0;
    #charGap = 0;
    #margin = 0;

    invalidate() {
        this.dispose();
    }

    dispose() {
        for (const spr of this.#sprites.values()) {
            if (spr?.bmp) { try { spr.bmp.Dispose(); } catch {} }
        }
        for (const spr of this.#ghostSprites.values()) {
            if (spr?.bmp) { try { spr.bmp.Dispose(); } catch {} }
        }
        this.#sprites.clear();
        this.#ghostSprites.clear();
        this.#key = '';
    }

    build(gr, isInternal, font, themeColor, opClock, opGhost, showShadow, opShadow, showGlow, opGlow, clockSize, italic = false) {
        const fontId = isInternal ? 'InternalDigital' : (font?.Name || '');
        const key = `${fontId}|${clockSize}|${themeColor}|${opClock}|${opGhost}|${showShadow ? opShadow : 0}|${showGlow ? opGlow : 0}|${italic ? 1 : 0}`;
        if (key === this.#key && this.#sprites.size > 0) return;

        this.dispose();
        this.#key = key;
        if (clockSize <= 0) return;

        const off = showShadow ? Math.max(1, Math.round(clockSize / 16)) : 0;
        const rad = showGlow ? Math.max(2, Math.round(clockSize / 16)) : 0;
        const shear = (isInternal && italic) ? Math.round(clockSize * 0.08) : 0;
        const margin = Math.max(rad, off) + Math.ceil(shear / 2) + 6;
        this.#margin = margin;

        const glowCol   = GdiUtils.setAlpha(themeColor, Math.floor(opGlow * 0.35));
        const shadowCol = GdiUtils.setAlpha(GdiUtils.RGB(0, 0, 0), opShadow);
        const mainCol   = GdiUtils.setAlpha(themeColor, opClock);
        const ghostCol  = GdiUtils.setAlpha(themeColor, opGhost);

        if (isInternal) {
            const m = SevenSegmentEngine.getMetrics(clockSize);
            this.#digitW = m.w;
            this.#digitH = m.h;
            this.#colonW = m.colonW;
            this.#charGap = m.charGap;

            const glyphs = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ':', '-'];
            for (const ch of glyphs) {
                const gw = (ch === ':') ? this.#colonW : this.#digitW;
                const gh = this.#digitH;
                const bmpW = gw + margin * 2;
                const bmpH = gh + margin * 2;

                let bmp = null, g = null;
                try {
                    bmp = gdi.CreateImage(bmpW, bmpH);
                    g = bmp.GetGraphics();
                    g.SetSmoothingMode(2);

                    const renderGlyph = (col, ox, oy) => {
                        if (ch === ':') SevenSegmentEngine.drawColon(g, margin + ox, margin + oy, gw, gh, col, italic);
                        else SevenSegmentEngine.drawDigit(g, ch, margin + ox, margin + oy, gw, gh, col, italic);
                    };

                    if (showShadow && opShadow > 0) renderGlyph(shadowCol, off, off);
                    if (showGlow && opGlow > 0) {
                        renderGlyph(glowCol, -rad, 0);
                        renderGlyph(glowCol, rad, 0);
                        renderGlyph(glowCol, 0, -rad);
                        renderGlyph(glowCol, 0, rad);
                    }
                    renderGlyph(mainCol, 0, 0);

                    bmp.ReleaseGraphics(g);
                    g = null;
                    this.#sprites.set(ch, { bmp, w: gw, h: gh, bmpW, bmpH, margin });
                } catch {
                    if (g && bmp) { try { bmp.ReleaseGraphics(g); } catch {} }
                    if (bmp) { try { bmp.Dispose(); } catch {} }
                }

                let gBmp = null, gg = null;
                try {
                    gBmp = gdi.CreateImage(bmpW, bmpH);
                    gg = gBmp.GetGraphics();
                    gg.SetSmoothingMode(2);

                    if (ch === ':') {
                        SevenSegmentEngine.drawColon(gg, margin, margin, gw, gh, ghostCol, italic);
                    } else if (ch === '-') {
                        SevenSegmentEngine.drawDigit(gg, '-', margin, margin, gw, gh, ghostCol, italic);
                    } else {
                        SevenSegmentEngine.drawDigit(gg, '8', margin, margin, gw, gh, ghostCol, italic);
                    }

                    gBmp.ReleaseGraphics(gg);
                    gg = null;
                    this.#ghostSprites.set(ch, { bmp: gBmp, w: gw, h: gh, bmpW, bmpH, margin });
                } catch {
                    if (gg && gBmp) { try { gBmp.Dispose(); } catch {} }
                    if (gBmp) { try { gBmp.Dispose(); } catch {} }
                }
            }
        } else {
            if (!font || !gr) return;
            const mRef = gr.MeasureString('8', font, 0, 0, 9999, 9999);
            this.#digitW = Math.ceil(mRef.Width);
            this.#digitH = Math.ceil(mRef.Height);
            this.#charGap = 0;

            const glyphs = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ':', '-'];
            for (const ch of glyphs) {
                const m = gr.MeasureString(ch, font, 0, 0, 9999, 9999);
                const w = Math.ceil(m.Width);
                const h = Math.ceil(m.Height);
                const bmpW = w + margin * 2;
                const bmpH = h + margin * 2;

                let bmp = null, g = null;
                try {
                    bmp = gdi.CreateImage(bmpW, bmpH);
                    g = bmp.GetGraphics();
                    g.SetTextRenderingHint(4);

                    if (showShadow && opShadow > 0) g.DrawString(ch, font, shadowCol, margin + off, margin + off, w + 2, h + 2);
                    if (showGlow && opGlow > 0) {
                        g.DrawString(ch, font, glowCol, margin - rad, margin, w + 2, h + 2);
                        g.DrawString(ch, font, glowCol, margin + rad, margin, w + 2, h + 2);
                        g.DrawString(ch, font, glowCol, margin, margin - rad, w + 2, h + 2);
                        g.DrawString(ch, font, glowCol, margin, margin + rad, w + 2, h + 2);
                    }
                    g.DrawString(ch, font, mainCol, margin, margin, w + 2, h + 2);

                    bmp.ReleaseGraphics(g);
                    g = null;
                    this.#sprites.set(ch, { bmp, w, h, bmpW, bmpH, margin });
                    if (ch === ':') this.#colonW = w;
                } catch {
                    if (g && bmp) { try { bmp.ReleaseGraphics(g); } catch {} }
                    if (bmp) { try { bmp.Dispose(); } catch {} }
                }

                let gBmp = null, gg = null;
                try {
                    gBmp = gdi.CreateImage(bmpW, bmpH);
                    gg = gBmp.GetGraphics();
                    gg.SetTextRenderingHint(4);
                    const ghostCh = (ch === ':' || ch === '-') ? ch : '8';
                    gg.DrawString(ghostCh, font, ghostCol, margin, margin, w + 2, h + 2);
                    gBmp.ReleaseGraphics(gg);
                    gg = null;
                    this.#ghostSprites.set(ch, { bmp: gBmp, w: h, bmpW, bmpH, margin });
                } catch {
                    if (gg && gBmp) { try { gBmp.Dispose(); } catch {} }
                    if (gBmp) { try { gBmp.Dispose(); } catch {} }
                }
            }
        }
    }

    drawGhostString(gr, ghostStr, startX, startY) {
        let curX = startX;
        for (let i = 0; i < ghostStr.length; i++) {
            const ch = ghostStr[i];
            if (ch === ' ') {
                curX += this.#digitW + this.#charGap;
                continue;
            }
            const spr = (ch === ':' || ch === '-') ? this.#ghostSprites.get(ch) : this.#ghostSprites.get('8');
            if (spr) {
                gr.DrawImage(spr.bmp, curX - spr.margin, startY - spr.margin, spr.bmpW, spr.bmpH, 0, 0, spr.bmpW, spr.bmpH);
            }
            curX += (ch === ':' ? this.#colonW : this.#digitW) + this.#charGap;
        }
    }

    drawTimeString(gr, rawTime, startX, startY) {
        let curX = startX;
        for (let i = 0; i < rawTime.length; i++) {
            const ch = rawTime[i];
            if (ch === ' ') {
                curX += this.#digitW + this.#charGap;
                continue;
            }
            const spr = this.#sprites.get(ch);
            if (spr) {
                gr.DrawImage(spr.bmp, curX - spr.margin, startY - spr.margin, spr.bmpW, spr.bmpH, 0, 0, spr.bmpW, spr.bmpH);
            }
            curX += (ch === ':' ? this.#colonW : this.#digitW) + this.#charGap;
        }
    }

    getStringWidth(rawTime) {
        let total = 0;
        for (let i = 0; i < rawTime.length; i++) {
            const ch = rawTime[i];
            if (ch === ':') total += (this.#colonW || Math.round(this.#digitW * 0.28));
            else total += this.#digitW;
            if (i < rawTime.length - 1) total += this.#charGap;
        }
        return total;
    }

    get digitW()  { return this.#digitW; }
    get digitH()  { return this.#digitH; }
    get colonW()  { return this.#colonW; }
    get charGap() { return this.#charGap; }
}

// ============================================================================================
// 4. MODE 1 TEXT COMPOSITE ENGINE (PRE-BAKED COMPOSITE SURFACE)
// ============================================================================================
class Mode1TextCache {
    #bmp = null;
    #key = '';

    invalidate() {
        if (this.#bmp) {
            try { this.#bmp.Dispose(); } catch {}
            this.#bmp = null;
        }
        this.#key = '';
    }

    render(w, h, lo, config, themeColor, isPlaying, scaleFn) {
        const key = `${w}|${h}|${lo.truncatedTitle}|${lo.truncatedAlbum}|${lo.m1TitleSize}|${lo.m1AlbumSize}|${lo.m1TechSize}|${themeColor}|${config.opClock}|${isPlaying ? 1 : 0}|${config.showM1Title}|${config.showM1Album}|${config.showM1Codec}|${config.showM1Tech}|${config.useThemeColorForTech}`;
        if (key === this.#key && this.#bmp) return this.#bmp;

        this.invalidate();
        this.#key = key;
        if (w <= 0 || h <= 0) return null;

        let bmp = null, g = null;
        try {
            bmp = gdi.CreateImage(w, h);
            g = bmp.GetGraphics();
            g.SetTextRenderingHint(4);

            const borderPad = config.borderMode > 0 ? Math.ceil(scaleFn(config.borderMode) / 2) + 4 : 0;
            const padL = lo.padL + scaleFn(15) + borderPad;
            const padT = lo.padT + scaleFn(10) + borderPad;
            const leftX = padL + config.m1TitleOffX;
            const rightReserved = (config.playIconType > 0 && lo.iconW > 0) ? (lo.iconW + scaleFn(12)) : 0;
            const maxTextW = Math.max(10, lo.dw - (scaleFn(15) + borderPad + config.m1TitleOffX) - (scaleFn(15) + borderPad) - rightReserved);
            let curY = padT + config.m1TitleOffY;

            if (isPlaying) {
                if (config.showM1Title && lo.truncatedTitle && lo.m1TitleFont) {
                    const tH = lo.m1TitleFont.Height + scaleFn(1);
                    g.DrawString(lo.truncatedTitle, lo.m1TitleFont, GdiUtils.setAlpha(themeColor, config.opClock), leftX, curY, maxTextW, tH);
                    curY += tH + scaleFn(2);
                }

                if (config.showM1Album && lo.truncatedAlbum && lo.m1AlbumFont) {
                    const aH = lo.m1AlbumFont.Height + scaleFn(1);
                    g.DrawString(lo.truncatedAlbum, lo.m1AlbumFont, GdiUtils.setAlpha(themeColor, Math.floor(config.opClock * 0.75)), leftX, curY, maxTextW, aH);
                }

                if ((config.showM1Codec || config.showM1Tech) && lo.m1TechFont) {
                    let xPos = padL + config.m1CodecOffX;
                    const yPos = lo.padT + lo.dh - (lo.m1TechSize + 8) - Math.max(2, scaleFn(config.borderMode)) + config.m1CodecOffY;
                    const sep = Math.max(4, Math.round(lo.m1TechSize * 0.35));

                    for (const part of lo.m1TechParts) {
                        const col = config.useThemeColorForTech ? themeColor : part.baseCol;
                        g.DrawString(part.text, lo.m1TechFont, GdiUtils.setAlpha(col, 220), xPos, yPos, part.w + 2, lo.dh);
                        xPos += part.w + sep;
                    }
                }
            } else {
                const standbyFont = lo.m1TitleFont || lo.m1AlbumFont;
                if (standbyFont) {
                    g.DrawString('STANDBY', standbyFont, GdiUtils.setAlpha(themeColor, Math.floor(config.opClock * 0.35)), leftX, curY, maxTextW, lo.dh);
                }
            }

            bmp.ReleaseGraphics(g);
            g = null;
            this.#bmp = bmp;
            return this.#bmp;
        } catch {
            if (g && bmp) { try { bmp.ReleaseGraphics(g); } catch {} }
            if (bmp) { try { bmp.Dispose(); } catch {} }
            return null;
        }
    }

    dispose() {
        this.invalidate();
    }
}

// ============================================================================================
// 5. OVERLAY & LCD BACKPLATE ENGINE
// ============================================================================================
class LcdBackplateEngine {
    #staticBmp    = null;
    #overlayBmp   = null;
    #staticDirty  = true;
    #overlayDirty = true;

    invalidate() {
        this.#staticDirty  = true;
        this.#overlayDirty = true;
    }

    invalidateOverlay() {
        this.#overlayDirty = true;
        if (this.#overlayBmp) {
            try { this.#overlayBmp.Dispose(); } catch {}
            this.#overlayBmp = null;
        }
    }

    renderStatic(w, h, bgColor, opBG) {
        if (this.#staticBmp) {
            try { this.#staticBmp.Dispose(); } catch {}
            this.#staticBmp = null;
        }
        if (w <= 0 || h <= 0) return;

        this.#staticBmp = gdi.CreateImage(w, h);
        const g = this.#staticBmp.GetGraphics();
        try {
            g.FillSolidRect(0, 0, w, h, GdiUtils.setAlpha(bgColor, opBG));
        } finally {
            this.#staticBmp.ReleaseGraphics(g);
        }
        this.#staticDirty = false;
    }

    renderOverlay(w, h, config, lcdColor, borderColor, bezelBmp, dpiScale) {
        if (this.#overlayBmp) {
            try { this.#overlayBmp.Dispose(); } catch {}
            this.#overlayBmp = null;
        }
        this.#overlayDirty = false;
        if (w <= 0 || h <= 0) return;

        const hasPhosphor   = config.showPhosphor && config.opPhosphor > 0 && !config.overlayAllOff;
        const hasScanlines  = config.showScanlines && config.opScanlines > 0 && !config.overlayAllOff;
        const hasReflection = config.useReflection && config.opReflection > 0 && !config.overlayAllOff;
        const hasBorder     = config.borderMode > 0 && config.opBorder > 0;
        const hasBezel      = config.bezelEnabled && bezelBmp;

        if (!hasPhosphor && !hasScanlines && !hasReflection && !hasBorder && !hasBezel) {
            return;
        }

        this.#overlayBmp = gdi.CreateImage(w, h);
        const g = this.#overlayBmp.GetGraphics();
        try {
            if (hasPhosphor) {
                const blended = GdiUtils.blendColours(lcdColor, GdiUtils.RGB(255, 255, 255), 0.25);
                const a = Math.floor(config.opPhosphor * 0.3);
                if (a > 0) g.FillSolidRect(0, 0, w, h, GdiUtils.setAlpha(blended, a));
            }

            if (hasScanlines) {
                const col = GdiUtils.setAlpha(GdiUtils.RGB(0, 0, 0), config.opScanlines);
                for (let y = 0; y < h; y += 3) {
                    g.FillSolidRect(0, y, w, 1, col);
                }
            }

            if (hasReflection) {
                const reflH = Math.floor(h * 0.45);
                for (let y = 0; y < reflH; y++) {
                    const t = 1 - (y / reflH);
                    const a = Math.floor(config.opReflection * (t * t * (3 - 2 * t)) * 0.4);
                    if (a > 0) g.FillSolidRect(0, y, w, 1, GdiUtils.setAlpha(GdiUtils.RGB(255, 255, 255), a));
                }
            }

            if (hasBorder) {
                const b = Math.round(config.borderMode * dpiScale);
                g.DrawRect(b / 2, b / 2, w - b, h - b, b, GdiUtils.setAlpha(borderColor, config.opBorder));
            }

            if (hasBezel) {
                try {
                    g.SetInterpolationMode(7);
                    g.DrawImage(bezelBmp, 0, 0, w, h, 0, 0, bezelBmp.Width, bezelBmp.Height);
                } catch {}
            }
        } finally {
            this.#overlayBmp.ReleaseGraphics(g);
        }
    }

    get staticBmp()      { return this.#staticBmp; }
    get overlayBmp()     { return this.#overlayBmp; }
    get isStaticDirty()  { return this.#staticDirty; }
    get isOverlayDirty() { return this.#overlayDirty; }

    dispose() {
        if (this.#staticBmp)  { try { this.#staticBmp.Dispose(); }  catch {} this.#staticBmp = null; }
        if (this.#overlayBmp) { try { this.#overlayBmp.Dispose(); } catch {} this.#overlayBmp = null; }
        this.#staticDirty  = true;
        this.#overlayDirty = true;
    }
}

// ============================================================================================
// 6. MAIN CONTROLLER & STATE MANAGEMENT (PART 1 OF CONTROLLER)
// ============================================================================================
class LcdTimerController {
    static LIFECYCLE = { BOOT: 0, INIT: 1, LIVE: 2, SHUTDOWN: 3 };

    static DIRTY = {
        NONE:      0,
        BACKPLATE: 1 << 0,
        OVERLAY:   1 << 1,
        DIGITS:    1 << 2,
        MODE1:     1 << 3,
        LAYOUT:    1 << 4,
        ALL:       ~0
    };

    static MENU_ID = {
        THEME_SYNC:          1000,
        THEME_BASE:          1001,
        CUST_LCD_COLOR:      800,
        CUST_BG_COLOR:       801,
        CUST_BORDER_COLOR:   802,
        BORDER_SIZE:         1030,
        BORDER_CUSTOM_TOGGLE:1031,
        BORDER_CUSTOM_SETUP: 1032,
        SHOW_GHOST:          100,
        USE_REFLECTION:      101,
        SHOW_SHADOW:         102,
        SHOW_GLOW:           103,
        SHOW_SCANLINES:      104,
        SHOW_PHOSPHOR:       105,
        MATCH_TECH_COLOR:    110,
        OVERLAY_ALL_OFF:     199,
        OPACITY_BASE:        300,
        POS_CLOCK:           200,
        POS_CODEC:           201,
        POS_DETAILS:         202,
        POS_M1_TITLE:        203,
        POS_M1_CODEC:        204,
        POS_RESET_ALL:       210,
        AUTO_FONT_SIZE:      501,
        SHOW_M0_CODEC:       106,
        SHOW_M0_TECH:        107,
        CLOCK_FONT_DIGITAL:  405,
        CLOCK_FONT_EXTERNAL: 400,
        CLOCK_ITALIC_TOGGLE: 406,
        CODEC_FONT_NAME:     401,
        TECH_FONT_NAME:      402,
        CLOCK_FONT_SIZE:     410,
        CODEC_FONT_SIZE:     411,
        TECH_FONT_SIZE:      412,
        SHOW_M1_TITLE:       120,
        SHOW_M1_ALBUM:       121,
        SHOW_M1_CODEC:       122,
        SHOW_M1_TECH:        123,
        M1_TEXT_FONT_NAME:   420,
        M1_TEXT_FONT_SIZE:   421,
        M1_CODEC_FONT_SIZE:  422,
        PLAY_ICON_BLINK:     710,
        PLAY_ICON_BASE:      700,
        PRESET_LOAD_BASE:    901,
        PRESET_SAVE_BASE:    911,
        BEZEL_ENABLE:        970,
        BEZEL_FOLDER:        972,
        BEZEL_RELOAD:        973,
        BEZEL_NONE:          975,
        BEZEL_BASE:          976,
        PAD_LEFT:            3110,
        PAD_RIGHT:           3111,
        PAD_TOP:             3112,
        PAD_BOTTOM:          3113,
        RESET_DEFAULTS:      5000,
        FACTORY_RESET:       5001
    };

    static THEMES = [
        { name: 'Classic Green',  bg: GdiUtils.RGB(5, 12, 5),      lcd: GdiUtils.RGB(30, 180, 30) },
        { name: 'Retro Amber',    bg: GdiUtils.RGB(15, 8, 0),      lcd: GdiUtils.RGB(190, 110, 0) },
        { name: 'Cyber Blue',     bg: GdiUtils.RGB(0, 5, 15),      lcd: GdiUtils.RGB(0, 130, 200) },
        { name: 'Cool Blue',      bg: GdiUtils.RGB(8, 12, 12),     lcd: GdiUtils.RGB(100, 180, 215) },
        { name: 'Deep Red',       bg: GdiUtils.RGB(10, 0, 0),      lcd: GdiUtils.RGB(170, 15, 15) },
        { name: 'Steel Grey',     bg: GdiUtils.RGB(20, 20, 20),    lcd: GdiUtils.RGB(160, 160, 160) },
        { name: 'Night Purple',   bg: GdiUtils.RGB(8, 0, 12),      lcd: GdiUtils.RGB(120, 60, 180) },
        { name: 'Dim White',      bg: GdiUtils.RGB(180, 180, 180), lcd: GdiUtils.RGB(30, 30, 30) },
        { name: 'Pioneer Amber',  bg: GdiUtils.RGB(20, 12, 5),     lcd: GdiUtils.RGB(255, 178, 45) },
        { name: 'Technics Green', bg: GdiUtils.RGB(5, 17, 9),      lcd: GdiUtils.RGB(80, 248, 128) },
        { name: 'Sony ES Blue',   bg: GdiUtils.RGB(4, 11, 20),     lcd: GdiUtils.RGB(68, 180, 255) },
        { name: 'Yamaha Ice',     bg: GdiUtils.RGB(8, 17, 19),     lcd: GdiUtils.RGB(96, 242, 234) },
        { name: 'Kenwood Red',    bg: GdiUtils.RGB(22, 5, 5),      lcd: GdiUtils.RGB(255, 79, 57) },
        { name: 'Sansui Lime',    bg: GdiUtils.RGB(13, 18, 4),     lcd: GdiUtils.RGB(196, 244, 52) },
        { name: 'Marantz Blue',   bg: GdiUtils.RGB(5, 9, 17),      lcd: GdiUtils.RGB(88, 126, 255) },
        { name: 'Akai Orange',    bg: GdiUtils.RGB(24, 10, 3),     lcd: GdiUtils.RGB(255, 130, 28) },
        { name: 'Sharp Aqua',     bg: GdiUtils.RGB(2, 19, 20),     lcd: GdiUtils.RGB(20, 239, 229) },
        { name: 'Aiwa VFD',       bg: GdiUtils.RGB(2, 16, 15),     lcd: GdiUtils.RGB(52, 222, 183) },
        { name: 'Nakamichi Gold', bg: GdiUtils.RGB(21, 15, 5),     lcd: GdiUtils.RGB(247, 193, 67) },
        { name: 'JVC Violet',     bg: GdiUtils.RGB(16, 6, 22),     lcd: GdiUtils.RGB(210, 102, 255) }
    ];

    static COLORS = {
        TN_CYAN:   GdiUtils.RGB(125, 207, 255),
        TN_PINK:   GdiUtils.RGB(247, 118, 142),
        TN_YELLOW: GdiUtils.RGB(224, 175, 104),
        TN_GREEN:  GdiUtils.RGB(158, 206, 106),
        TN_ORANGE: GdiUtils.RGB(255, 158, 100)
    };

    static ICON_FONTS = ['', 'Guifx2 v2 16', 'FontAwesome', 'Segoe MDL2 Assets'];
    static ICON_CHARS = {
        'Guifx2 v2 16':      { play: '1', pause: '2' },
        'FontAwesome':        { play: '\uF04B', pause: '\uF04C' },
        'Segoe MDL2 Assets': { play: '\uE768', pause: '\uE769' }
    };

    static BEZEL_EXTS = ['.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp'];

    static DEFAULTS = {
        themeIdx: 0,
        syncTheme: true,
        borderMode: 2,
        showGhost: true,
        useReflection: true,
        showShadow: false,
        showGlow: false,
        showScanlines: false,
        showPhosphor: true,
        displayMode: 0,
        autoFontSize: true,
        modeRemaining: false,
        italicSlant: false,
        useThemeColorForTech: true,
        showM0Codec: true,
        showM0Tech: true,
        showM1Title: true,
        showM1Album: true,
        showM1Codec: true,
        showM1Tech: true,
        vOffset: 0,
        codecOffX: -10, codecOffY: -20,
        detailOffX: -10, detailOffY: -5,
        m1TitleOffX: -10, m1TitleOffY: -20,
        m1CodecOffX: -10, m1CodecOffY: -5,
        opClock: 255, opGhost: 5, opTech: 255, opBorder: 60, opBG: 255,
        opReflection: 20, opShadow: 60, opGlow: 110, opScanlines: 50, opPhosphor: 10,
        overlayAllOff: false,
        bezelFolder: '',
        bezelEnabled: false,
        bezelFile: '',
        padLeft: 4, padRight: 4, padTop: 4, padBottom: 4,
        clockFontName: 'Digital', clockFontSize: 48,
        codecFontName: 'Segoe UI', codecFontSize: 14,
        techFontName: 'Segoe UI', techFontSize: 14,
        textRowFontName: 'Segoe UI', textRowFontSize: 20,
        m1CodecFontSize: 0,
        playIconType: 2,
        playIconBlink: false,
        custBg: GdiUtils.RGB(10, 15, 15),
        custLcd: GdiUtils.RGB(0, 255, 200),
        custBorder: GdiUtils.RGB(0, 255, 200),
        useCustomBorder: false
    };

    static PROP_MAP = {
        themeIdx:             'LCD.Theme',
        syncTheme:            'LCD.SyncTheme',
        borderMode:           'LCD.BorderPx',
        showGhost:            'LCD.ShowGhost',
        useReflection:        'LCD.UseReflection',
        showShadow:           'LCD.ShowShadow',
        showGlow:             'LCD.ShowGlow',
        showScanlines:        'LCD.ShowScanlines',
        showPhosphor:         'LCD.ShowPhosphor',
        displayMode:          'LCD.DisplayMode',
        autoFontSize:         'LCD.AutoFontSize',
        modeRemaining:        'LCD.ModeRemaining',
        italicSlant:          'LCD.ItalicSlant',
        useThemeColorForTech: 'LCD.UseThemeColorForTech',
        showM0Codec:          'LCD.ShowM0Codec',
        showM0Tech:           'LCD.ShowM0Tech',
        showM1Title:          'LCD.ShowM1Title',
        showM1Album:          'LCD.ShowM1Album',
        showM1Codec:          'LCD.ShowM1Codec',
        showM1Tech:           'LCD.ShowM1Tech',
        vOffset:              'LCD.VerticalOffset',
        codecOffX:            'LCD.CodecOffsetX',
        codecOffY:            'LCD.CodecOffsetY',
        detailOffX:           'LCD.DetailOffsetX',
        detailOffY:           'LCD.DetailOffsetY',
        m1TitleOffX:          'LCD.M1TitleOffsetX',
        m1TitleOffY:          'LCD.M1TitleOffsetY',
        m1CodecOffX:          'LCD.M1CodecOffsetX',
        m1CodecOffY:          'LCD.M1CodecOffsetY',
        opClock:              'LCD.OpClock',
        opGhost:              'LCD.OpGhost',
        opTech:               'LCD.OpTech',
        opBorder:             'LCD.OpBorder',
        opBG:                 'LCD.OpBG',
        opReflection:         'LCD.OpReflection',
        opShadow:             'LCD.OpShadow',
        opGlow:               'LCD.OpGlow',
        opScanlines:          'LCD.OpScanlines',
        opPhosphor:           'LCD.OpPhosphor',
        overlayAllOff:        'LCD.OverlayAllOff',
        bezelFolder:          'LCD.BezelFolder',
        bezelEnabled:         'LCD.BezelEnabled',
        bezelFile:            'LCD.BezelFile',
        padLeft:              'LCD.PadLeft',
        padRight:             'LCD.PadRight',
        padTop:               'LCD.PadTop',
        padBottom:            'LCD.PadBottom',
        clockFontName:        'LCD.ClockFontName',
        clockFontSize:        'LCD.ClockFontSize',
        codecFontName:        'LCD.CodecFontName',
        codecFontSize:        'LCD.CodecFontSize',
        techFontName:         'LCD.TechFontName',
        techFontSize:         'LCD.TechFontSize',
        textRowFontName:      'LCD.TextRowFontName',
        textRowFontSize:      'LCD.TextRowFontSize',
        m1CodecFontSize:      'LCD.M1CodecFontSize',
        playIconType:         'LCD.PlayIconType',
        playIconBlink:        'LCD.PlayIconBlink',
        custBg:               'LCD.CustomBg',
        custLcd:              'LCD.CustomLcd',
        custBorder:           'LCD.CustomBorder',
        useCustomBorder:      'LCD.UseCustomBorder'
    };

    #lifecycle = LcdTimerController.LIFECYCLE.BOOT;
    #dpiScale  = 1;
    #dirtyFlags = LcdTimerController.DIRTY.ALL;
    #wasHidden  = false;

    #fonts        = new FontRegistry(100);
    #backplate    = new LcdBackplateEngine();
    #digitSprites = new DigitSpriteCache();
    #mode1Cache   = new Mode1TextCache();

    #blinkTimer         = null;
    #saveTimeout        = null;
    #bezelNotifyTimeout = null;

    #bezelBmp           = null;
    #profileBase        = '';
    #cachedBezelImages  = null;
    #cachedBezelFolder  = null;
    #bezelNotifyText    = '';
    #lastTimeStr        = '';
    #lastGhostTemplate  = '88:88';
    #btnFlash           = true;
    #codecFlash         = true;
    #displayOff         = false;
    #lastDblClkTime     = 0;
    #positionAdjustMode = null;
    #opacityTarget      = null;
    #blinkTarget        = null;

    #compoundTf = fb.TitleFormat('%codec%\x01%title%\x01%artist%\x01%album%\x01%bitrate%\x01%samplerate%\x01%__bitspersample%\x01%channels%');

    #trackInfo = {
        codec: '', title: '', artist: '', album: '', bitrate: '', samplerate: '', bits: '', channels: ''
    };

    #layout = {
        clockSize: 48, codecSize: 14, techSize: 14, codecW: 0,
        clockFont: null, codecFont: null, techFont: null,
        m1TitleFont: null, m1AlbumFont: null, m1TechFont: null, iconFont: null,
        m1TitleSize: 20, m1AlbumSize: 14, m1TechSize: 12,
        truncatedTitle: '', truncatedAlbum: '',
        bottomY: 0, bottomH: 0,
        padL: 0, padR: 0, padT: 0, padB: 0, dw: 0, dh: 0,
        ghostW: 0, ghostH: 0, ghostStr: '',
        m0TechParts: [], m1TechParts: [],
        iconW: 0, iconH: 0,
        timeCache: { str: '', w: 0, h: 0 }
    };

    config = { ...LcdTimerController.DEFAULTS };

    constructor() {
        const sysDpi = (typeof window.DPI === 'number' && window.DPI > 0) ? window.DPI : 96;
        this.#dpiScale = sysDpi / 96;

        let p = fb.ProfilePath || '';
        if (p && !p.endsWith('\\') && !p.endsWith('/')) p += '\\';
        this.#profileBase = p;
        LcdTimerController.DEFAULTS.bezelFolder = `${this.#profileBase}skins\\overlay`;

        this.#loadProperties();
    }

    scale(size) {
        return Math.round(size * this.#dpiScale);
    }

    init() {
        this.#lifecycle = LcdTimerController.LIFECYCLE.INIT;
        this.loadBezel();
        this.updateInfo();
        this.#lifecycle = LcdTimerController.LIFECYCLE.LIVE;

        window.SetTimeout(() => {
            if (this.#lifecycle === LcdTimerController.LIFECYCLE.SHUTDOWN) return;
            if (fb.IsPlaying || fb.IsPaused) {
                this.startTimers();
                this.refreshClock(true);
            }
            window.Repaint();
        }, 0);

        window.Repaint();
    }

    static sanitizeConfig(raw, fallback = LcdTimerController.DEFAULTS) {
        const out = { ...fallback };
        if (!raw || typeof raw !== 'object') return out;

        out.themeIdx             = GdiUtils.clamp(parseInt(raw.themeIdx, 10) || 0, 0, LcdTimerController.THEMES.length);
        out.syncTheme            = typeof raw.syncTheme === 'boolean' ? raw.syncTheme : fallback.syncTheme;
        out.borderMode           = GdiUtils.clamp(parseInt(raw.borderMode, 10) || 0, 0, 50);
        out.showGhost            = typeof raw.showGhost === 'boolean' ? raw.showGhost : fallback.showGhost;
        out.useReflection        = typeof raw.useReflection === 'boolean' ? raw.useReflection : fallback.useReflection;
        out.showShadow           = typeof raw.showShadow === 'boolean' ? raw.showShadow : fallback.showShadow;
        out.showGlow             = typeof raw.showGlow === 'boolean' ? raw.showGlow : fallback.showGlow;
        out.showScanlines        = typeof raw.showScanlines === 'boolean' ? raw.showScanlines : fallback.showScanlines;
        out.showPhosphor         = typeof raw.showPhosphor === 'boolean' ? raw.showPhosphor : fallback.showPhosphor;
        out.displayMode          = GdiUtils.clamp(parseInt(raw.displayMode, 10) || 0, 0, 1);
        out.autoFontSize         = typeof raw.autoFontSize === 'boolean' ? raw.autoFontSize : fallback.autoFontSize;
        out.modeRemaining        = typeof raw.modeRemaining === 'boolean' ? raw.modeRemaining : fallback.modeRemaining;
        out.italicSlant          = typeof raw.italicSlant === 'boolean' ? raw.italicSlant : fallback.italicSlant;
        out.useThemeColorForTech = typeof raw.useThemeColorForTech === 'boolean' ? raw.useThemeColorForTech : fallback.useThemeColorForTech;

        out.showM0Codec          = typeof raw.showM0Codec === 'boolean' ? raw.showM0Codec : fallback.showM0Codec;
        out.showM0Tech           = typeof raw.showM0Tech === 'boolean' ? raw.showM0Tech : fallback.showM0Tech;
        out.showM1Title          = typeof raw.showM1Title === 'boolean' ? raw.showM1Title : fallback.showM1Title;
        out.showM1Album          = typeof raw.showM1Album === 'boolean' ? raw.showM1Album : fallback.showM1Album;
        out.showM1Codec          = typeof raw.showM1Codec === 'boolean' ? raw.showM1Codec : fallback.showM1Codec;
        out.showM1Tech           = typeof raw.showM1Tech === 'boolean' ? raw.showM1Tech : fallback.showM1Tech;

        out.vOffset              = GdiUtils.clamp(parseInt(raw.vOffset, 10) || 0, -200, 200);
        out.codecOffX            = GdiUtils.clamp(parseInt(raw.codecOffX, 10) || -10, -200, 200);
        out.codecOffY            = GdiUtils.clamp(parseInt(raw.codecOffY, 10) || -20, -200, 200);
        out.detailOffX           = GdiUtils.clamp(parseInt(raw.detailOffX, 10) || -10, -200, 200);
        out.detailOffY           = GdiUtils.clamp(parseInt(raw.detailOffY, 10) || -5, -200, 200);
        out.m1TitleOffX          = GdiUtils.clamp(parseInt(raw.m1TitleOffX, 10) || -10, -200, 200);
        out.m1TitleOffY          = GdiUtils.clamp(parseInt(raw.m1TitleOffY, 10) || -20, -200, 200);
        out.m1CodecOffX          = GdiUtils.clamp(parseInt(raw.m1CodecOffX, 10) || -10, -200, 200);
        out.m1CodecOffY          = GdiUtils.clamp(parseInt(raw.m1CodecOffY, 10) || -5, -200, 200);

        out.opClock              = GdiUtils.clamp(parseInt(raw.opClock, 10) || 255, 0, 255);
        out.opGhost              = GdiUtils.clamp(parseInt(raw.opGhost, 10) || 5, 0, 255);
        out.opTech               = GdiUtils.clamp(parseInt(raw.opTech, 10) || 255, 0, 255);
        out.opBorder             = GdiUtils.clamp(parseInt(raw.opBorder, 10) || 60, 0, 255);
        out.opBG                 = GdiUtils.clamp(parseInt(raw.opBG, 10) || 255, 0, 255);
        out.opReflection         = GdiUtils.clamp(parseInt(raw.opReflection, 10) || 20, 0, 255);
        out.opShadow             = GdiUtils.clamp(parseInt(raw.opShadow, 10) || 60, 0, 255);
        out.opGlow               = GdiUtils.clamp(parseInt(raw.opGlow, 10) || 110, 0, 255);
        out.opScanlines          = GdiUtils.clamp(parseInt(raw.opScanlines, 10) || 50, 0, 255);
        out.opPhosphor           = GdiUtils.clamp(parseInt(raw.opPhosphor, 10) || 10, 0, 255);

        out.overlayAllOff        = typeof raw.overlayAllOff === 'boolean' ? raw.overlayAllOff : fallback.overlayAllOff;
        out.bezelFolder          = GdiUtils.sanitizePath(String(raw.bezelFolder || fallback.bezelFolder));
        out.bezelEnabled         = typeof raw.bezelEnabled === 'boolean' ? raw.bezelEnabled : fallback.bezelEnabled;
        out.bezelFile            = String(raw.bezelFile || '');

        out.padLeft              = GdiUtils.clamp(parseInt(raw.padLeft, 10) || 0, 0, 100);
        out.padRight             = GdiUtils.clamp(parseInt(raw.padRight, 10) || 0, 0, 100);
        out.padTop               = GdiUtils.clamp(parseInt(raw.padTop, 10) || 0, 0, 100);
        out.padBottom            = GdiUtils.clamp(parseInt(raw.padBottom, 10) || 0, 0, 100);

        out.clockFontName        = String(raw.clockFontName || 'Digital').trim() || 'Digital';
        out.clockFontSize        = GdiUtils.clamp(parseInt(raw.clockFontSize, 10) || 48, 8, 120);
        out.codecFontName        = String(raw.codecFontName || 'Segoe UI').trim() || 'Segoe UI';
        out.codecFontSize        = GdiUtils.clamp(parseInt(raw.codecFontSize, 10) || 14, 8, 80);
        out.techFontName         = String(raw.techFontName || 'Segoe UI').trim() || 'Segoe UI';
        out.techFontSize         = GdiUtils.clamp(parseInt(raw.techFontSize, 10) || 14, 8, 80);
        out.textRowFontName      = String(raw.textRowFontName || 'Segoe UI').trim() || 'Segoe UI';
        out.textRowFontSize      = GdiUtils.clamp(parseInt(raw.textRowFontSize, 10) || 20, 8, 100);
        out.m1CodecFontSize      = GdiUtils.clamp(parseInt(raw.m1CodecFontSize, 10) || 0, 0, 80);

        out.playIconType         = GdiUtils.clamp(parseInt(raw.playIconType, 10) || 2, 0, 3);
        out.playIconBlink        = typeof raw.playIconBlink === 'boolean' ? raw.playIconBlink : fallback.playIconBlink;

        out.custBg               = (Number(raw.custBg) >>> 0) || fallback.custBg;
        out.custLcd              = (Number(raw.custLcd) >>> 0) || fallback.custLcd;
        out.custBorder           = (Number(raw.custBorder) >>> 0) || fallback.custBorder;
        out.useCustomBorder      = typeof raw.useCustomBorder === 'boolean' ? raw.useCustomBorder : fallback.useCustomBorder;

        return out;
    }

    #loadProperties() {
        const raw = {};
        for (const [key, propName] of Object.entries(LcdTimerController.PROP_MAP)) {
            raw[key] = window.GetProperty(propName, LcdTimerController.DEFAULTS[key]);
        }
        if (!raw.bezelFolder) raw.bezelFolder = `${this.#profileBase}skins\\overlay`;
        this.config = LcdTimerController.sanitizeConfig(raw, LcdTimerController.DEFAULTS);
    }

    saveAll() {
        const cfg = this.config;
        for (const [key, propName] of Object.entries(LcdTimerController.PROP_MAP)) {
            if (Object.prototype.hasOwnProperty.call(cfg, key)) {
                window.SetProperty(propName, cfg[key]);
            }
        }
    }

    requestSave() {
        if (this.#saveTimeout) window.ClearTimeout(this.#saveTimeout);
        this.#saveTimeout = window.SetTimeout(() => {
            this.saveAll();
            this.#saveTimeout = null;
        }, 500);
    }

    getActiveColors() {
        if (this.config.themeIdx >= LcdTimerController.THEMES.length) {
            return { bg: this.config.custBg, lcd: this.config.custLcd };
        }
        return LcdTimerController.THEMES[this.config.themeIdx];
    }

    getBorderColor() {
        return this.config.useCustomBorder ? this.config.custBorder : this.getActiveColors().lcd;
    }

    resolveBezelPath(name) {
        if (!this.config.bezelFolder || !name) return null;
        const base = this.config.bezelFolder.endsWith('\\') ? this.config.bezelFolder : `${this.config.bezelFolder}\\`;
        const lower = name.toLowerCase();

        for (const ext of LcdTimerController.BEZEL_EXTS) {
            if (lower.endsWith(ext) && utils.IsFile(`${base}${name}`)) return `${base}${name}`;
        }
        for (const ext of LcdTimerController.BEZEL_EXTS) {
            const p = `${base}${name}${ext}`;
            if (utils.IsFile(p)) return p;
        }
        return null;
    }

    loadBezel() {
        if (this.#bezelBmp) { try { this.#bezelBmp.Dispose(); } catch {} this.#bezelBmp = null; }
        if (!this.config.bezelEnabled || !this.config.bezelFile) return;

        const target = this.resolveBezelPath(this.config.bezelFile);
        if (target) {
            try { 
                this.#bezelBmp = gdi.Image(target); 
            } catch { 
                this.#bezelBmp = null; 
            }
        }
        if (!this.#bezelBmp) {
            this.config.bezelEnabled = false;
            this.config.bezelFile = '';
        }
    }

    getBezelImages(forceReload = false) {
        const cleanFolder = GdiUtils.sanitizePath(this.config.bezelFolder);
        if (!cleanFolder || !utils.IsDirectory(cleanFolder)) {
            this.#cachedBezelImages = [];
            this.#cachedBezelFolder = cleanFolder;
            return this.#cachedBezelImages;
        }
        if (!forceReload && this.#cachedBezelImages !== null && this.#cachedBezelFolder === cleanFolder) {
            return this.#cachedBezelImages;
        }
        this.#cachedBezelFolder = cleanFolder;
        try {
            const all = utils.Glob(`${cleanFolder}\\*.*`);
            if (!Array.isArray(all)) return [];
            this.#cachedBezelImages = all.filter(f => {
                const ext = f.substring(f.lastIndexOf('.')).toLowerCase();
                return LcdTimerController.BEZEL_EXTS.includes(ext);
            }).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
            return this.#cachedBezelImages;
        } catch {
            return [];
        }
    }

    listBezelNames(forceReload = false) {
        return this.getBezelImages(forceReload).map(p => {
            const name = p.substring(p.lastIndexOf('\\') + 1);
            return name.substring(0, name.lastIndexOf('.'));
        });
    }

    cycleBezel(direction) {
        const bezelNames = this.listBezelNames(true);
        if (!bezelNames.length) {
            this.#bezelNotifyText = 'No bezels found';
            if (this.#bezelNotifyTimeout) window.ClearTimeout(this.#bezelNotifyTimeout);
            this.#bezelNotifyTimeout = window.SetTimeout(() => {
                this.#bezelNotifyText = '';
                this.#bezelNotifyTimeout = null;
                window.Repaint();
            }, 1500);
            window.Repaint();
            return;
        }

        let currentIdx = 0;
        if (this.config.bezelEnabled && this.config.bezelFile) {
            const curClean = (this.config.bezelFile || '').toLowerCase().replace(/\.[^/.]+$/, '');
            const found = bezelNames.findIndex(n => n.toLowerCase() === curClean);
            if (found !== -1) currentIdx = found + 1;
        }

        const count = bezelNames.length + 1;
        const nextIdx = (currentIdx + direction + count) % count;

        if (nextIdx === 0) {
            this.config.bezelEnabled = false;
            this.config.bezelFile = '';
            this.#bezelNotifyText = 'None';
        } else {
            this.config.bezelEnabled = true;
            this.config.bezelFile = bezelNames[nextIdx - 1];
            this.#bezelNotifyText = this.config.bezelFile;
        }

        this.loadBezel();
        this.#dirtyFlags |= LcdTimerController.DIRTY.OVERLAY;
        this.#backplate.invalidateOverlay();
        this.requestSave();

        if (this.#bezelNotifyTimeout) window.ClearTimeout(this.#bezelNotifyTimeout);
        this.#bezelNotifyTimeout = window.SetTimeout(() => {
            this.#bezelNotifyText = '';
            this.#bezelNotifyTimeout = null;
            window.Repaint();
        }, 1500);

        window.Repaint();
    }

    setThemeByName(name, broadcast = false) {
        if (!name || typeof name !== 'string') return;
        const idx = LcdTimerController.THEMES.findIndex(t => t.name.toLowerCase() === name.toLowerCase());
        if (idx !== -1) {
            const changed = (idx !== this.config.themeIdx);
            this.config.themeIdx = idx;
            this.#dirtyFlags = LcdTimerController.DIRTY.ALL;
            this.#backplate.invalidate();
            this.#digitSprites.invalidate();
            this.#mode1Cache.invalidate();
            if (changed) this.saveAll();
            window.Repaint();
            if (broadcast && this.config.syncTheme) {
                try { window.NotifyOthers('LcdThemeSync', LcdTimerController.THEMES[idx].name); } catch {}
            }
        }
    }

    getGhostTemplate(maxH, remaining, currentMinutes = 0) {
        if (maxH >= 10) return remaining ? '-88:88:88' : ' 88:88:88';
        if (maxH > 0)   return remaining ? '-8:88:88'  : ' 8:88:88';
        if (remaining && currentMinutes >= 10) return '-88:88';
        return '88:88';
    }

    updateLayout(gr, w, h) {
        const lo = this.#layout;
        lo.padL = this.scale(GdiUtils.clamp(this.config.padLeft, 0, Math.max(0, w - 1)));
        lo.padR = this.scale(GdiUtils.clamp(this.config.padRight, 0, Math.max(0, w - 1)));
        lo.padT = this.scale(GdiUtils.clamp(this.config.padTop, 0, Math.max(0, h - 1)));
        lo.padB = this.scale(GdiUtils.clamp(this.config.padBottom, 0, Math.max(0, h - 1)));
        lo.dw = Math.max(1, w - lo.padL - lo.padR);
        lo.dh = Math.max(1, h - lo.padT - lo.padB);

        const pad = this.scale(15) + (this.config.borderMode > 0 ? Math.ceil(this.scale(this.config.borderMode) / 2) + 4 : 0);
        const availW = Math.max(10, lo.dw - pad * 2);
        const minM1TextSize = Math.max(8, this.scale(9));
        lo.timeCache.str = '';

        const isInternal = (this.config.clockFontName === 'Digital');

        if (this.config.displayMode === 0) {
            const maxLen = Math.max(fb.PlaybackLength || 0, fb.PlaybackTime || 0);
            const maxH = Math.floor(maxLen / 3600);
            const curM = Math.floor(((fb.PlaybackTime || 0) % 3600) / 60);
            const maxSampleTime = maxH >= 10 ? '-88:88:88' : (maxH > 0 ? '-8:88:88' : '-88:88');

            if (this.config.autoFontSize) {
                const targetH = Math.floor(lo.dh * 0.46);

                if (isInternal) {
                    const colons = (maxH > 0) ? 2 : 1;
                    const digits = maxSampleTime.length - colons;
                    const estW = digits * (targetH * 0.50 + targetH * 0.50 * 0.08) + colons * (targetH * 0.50 * 0.28 + targetH * 0.50 * 0.08);

                    if (estW > availW) {
                        const scaleDown = availW / estW;
                        lo.clockSize = GdiUtils.clamp(Math.floor(targetH * scaleDown), 12, 220);
                    } else {
                        lo.clockSize = GdiUtils.clamp(targetH, 12, 220);
                    }
                } else {
                    lo.clockSize = this.#fonts.fitSize(gr, maxSampleTime, this.config.clockFontName, 1, availW, targetH, targetH, 10);
                }
                lo.codecSize = GdiUtils.clamp(Math.round(lo.dh * 0.14), 8, 72);
                lo.techSize  = GdiUtils.clamp(Math.round(lo.dh * 0.10), 8, 52);
            } else {
                lo.clockSize = this.scale(this.config.clockFontSize);
                lo.codecSize = this.scale(this.config.codecFontSize);
                lo.techSize  = this.scale(this.config.techFontSize);
            }

            lo.clockFont = isInternal ? null : this.#fonts.get(this.config.clockFontName, lo.clockSize, 1);
            lo.codecFont = this.#fonts.get(this.config.codecFontName, lo.codecSize, 0);
            lo.techFont  = this.#fonts.get(this.config.techFontName, lo.techSize, 0);
            lo.bottomH   = Math.max(12, Math.round(lo.techSize * 1.25));
            lo.bottomY   = lo.dh - lo.bottomH - Math.max(2, this.scale(this.config.borderMode));

            lo.codecW = (this.#trackInfo.codec && lo.codecFont) 
                ? gr.MeasureString(this.#trackInfo.codec, lo.codecFont, 0, 0, 9999, 9999).Width 
                : 0;

            const theme = this.getActiveColors();
            this.#digitSprites.build(
                gr, isInternal, lo.clockFont, theme.lcd, this.config.opClock, this.config.opGhost,
                this.config.showShadow, this.config.opShadow,
                this.config.showGlow, this.config.opGlow,
                lo.clockSize, this.config.italicSlant
            );

            lo.ghostStr = this.getGhostTemplate(maxH, this.config.modeRemaining, curM);
            this.#lastGhostTemplate = lo.ghostStr;

            if (isInternal) {
                lo.ghostW = this.#digitSprites.getStringWidth(lo.ghostStr);
                lo.ghostH = lo.clockSize;
            } else {
                const gSize = gr.MeasureString(lo.ghostStr, lo.clockFont, 0, 0, 9999, 9999);
                lo.ghostW = gSize.Width;
                lo.ghostH = gSize.Height;
            }

            lo.m0TechParts = [
                { text: this.#trackInfo.bitrate,    baseCol: LcdTimerController.COLORS.TN_YELLOW },
                { text: this.#trackInfo.samplerate, baseCol: LcdTimerController.COLORS.TN_CYAN },
                { text: this.#trackInfo.bits,       baseCol: LcdTimerController.COLORS.TN_GREEN },
                { text: this.#trackInfo.channels,   baseCol: LcdTimerController.COLORS.TN_ORANGE }
            ].filter(p => p.text).map(p => ({
                text: p.text, baseCol: p.baseCol, w: gr.MeasureString(p.text, lo.techFont, 0, 0, 9999, 9999).Width
            }));

        } else {
            if (this.config.playIconType > 0) {
                const fontName = LcdTimerController.ICON_FONTS[this.config.playIconType];
                if (fontName && LcdTimerController.ICON_CHARS[fontName]) {
                    const iconSizePx = GdiUtils.clamp(Math.round(lo.dh * 0.34), 18, 52);
                    lo.iconFont = this.#fonts.get(fontName, iconSizePx);
                    if (lo.iconFont) {
                        const iSize = gr.MeasureString(LcdTimerController.ICON_CHARS[fontName].play, lo.iconFont, 0, 0, 9999, 9999);
                        lo.iconW = iSize.Width;
                        lo.iconH = iSize.Height;
                    }
                } else {
                    lo.iconFont = null;
                    lo.iconW = 0;
                    lo.iconH = 0;
                }
            } else {
                lo.iconFont = null;
                lo.iconW = 0;
                lo.iconH = 0;
            }

            const rightReserved = (this.config.playIconType > 0 && lo.iconW > 0) ? (lo.iconW + this.scale(14)) : 0;
            const textAvailW = Math.max(10, availW - rightReserved);

            const topAvailH = Math.max(16, Math.floor(lo.dh * 0.52));
            const bothLines = this.config.showM1Title && this.config.showM1Album;

            lo.m1TechSize = this.config.m1CodecFontSize > 0 
                ? this.scale(this.config.m1CodecFontSize) 
                : GdiUtils.clamp(Math.round(lo.dh * 0.10), 8, 30);

            if (this.config.autoFontSize) {
                const titleMaxH = bothLines ? Math.floor(topAvailH * 0.50) : Math.floor(topAvailH * 0.82);
                const albumMaxH = bothLines ? Math.floor(topAvailH * 0.38) : Math.floor(topAvailH * 0.70);

                lo.m1TitleSize = this.#fonts.fitSize(gr, this.#trackInfo.title || 'Sample Title', this.config.textRowFontName, 0, textAvailW, titleMaxH, Math.min(32, Math.floor(topAvailH * 0.60)), minM1TextSize);
                lo.m1AlbumSize = this.#fonts.fitSize(gr, this.#trackInfo.album || 'Sample Album', this.config.textRowFontName, 0, textAvailW, albumMaxH, Math.round(lo.m1TitleSize * 0.72), minM1TextSize);
            } else {
                let tSize = Math.max(minM1TextSize, this.scale(this.config.textRowFontSize));
                let aSize = Math.max(minM1TextSize, Math.round(tSize * 0.65));
                if (bothLines && (tSize + aSize) * 1.35 > topAvailH) {
                    const ratio = topAvailH / ((tSize + aSize) * 1.35);
                    tSize = Math.max(minM1TextSize, Math.floor(tSize * ratio));
                    aSize = Math.max(minM1TextSize, Math.floor(aSize * ratio));
                }
                lo.m1TitleSize = tSize;
                lo.m1AlbumSize = aSize;
            }

            lo.m1TitleFont = this.#fonts.get(this.config.textRowFontName, lo.m1TitleSize, 0);
            lo.m1AlbumFont = this.#fonts.get(this.config.textRowFontName, lo.m1AlbumSize, 0);
            lo.m1TechFont  = this.#fonts.get(this.config.codecFontName, lo.m1TechSize, 0);

            lo.truncatedTitle = this.#fonts.truncateToFit(gr, this.#trackInfo.title, lo.m1TitleFont, textAvailW);

            let line2 = this.#trackInfo.artist;
            if (this.#trackInfo.album) {
                line2 += (line2 ? ' \u2014 ' : '') + this.#trackInfo.album;
            }
            lo.truncatedAlbum = this.#fonts.truncateToFit(gr, line2, lo.m1AlbumFont, textAvailW);

            lo.m1TechParts = [];
            if (this.config.showM1Codec && this.#trackInfo.codec) {
                lo.m1TechParts.push({ text: this.#trackInfo.codec, baseCol: LcdTimerController.COLORS.TN_PINK, w: gr.MeasureString(this.#trackInfo.codec, lo.m1TechFont, 0, 0, 9999, 9999).Width });
            }
            if (this.config.showM1Tech) {
                [
                    { text: this.#trackInfo.bitrate,    baseCol: LcdTimerController.COLORS.TN_YELLOW },
                    { text: this.#trackInfo.samplerate, baseCol: LcdTimerController.COLORS.TN_CYAN },
                    { text: this.#trackInfo.bits,       baseCol: LcdTimerController.COLORS.TN_GREEN },
                    { text: this.#trackInfo.channels,   baseCol: LcdTimerController.COLORS.TN_ORANGE }
                ].filter(p => p.text).forEach(p => {
                    lo.m1TechParts.push({ text: p.text, baseCol: p.baseCol, w: gr.MeasureString(p.text, lo.m1TechFont, 0, 0, 9999, 9999).Width });
                });
            }

            this.#mode1Cache.invalidate();
        }

        this.#dirtyFlags &= ~LcdTimerController.DIRTY.LAYOUT;
    }
	
onPaint(gr) {
        if (this.#lifecycle !== LcdTimerController.LIFECYCLE.LIVE || !window.IsVisible) return;
        const w = window.Width;
        const h = window.Height;
        if (!gr || w <= 0 || h <= 0) return;

        if (this.#wasHidden) {
            this.#wasHidden = false;
            if (fb.IsPlaying || fb.IsPaused) {
                this.startTimers();
            }
        }

        const theme = this.getActiveColors();

        if (this.#displayOff) {
            gr.FillSolidRect(0, 0, w, h, GdiUtils.RGB(0, 0, 0));
            if (this.config.borderMode > 0) {
                const b = this.scale(this.config.borderMode);
                gr.DrawRect(b / 2, b / 2, w - b, h - b, b, GdiUtils.setAlpha(this.getBorderColor(), this.config.opBorder));
            }
            if (this.config.bezelEnabled && this.#bezelBmp) {
                try {
                    gr.SetInterpolationMode(2);
                    gr.DrawImage(this.#bezelBmp, 0, 0, w, h, 0, 0, this.#bezelBmp.Width, this.#bezelBmp.Height);
                } catch {}
            }
            return;
        }

        // 1. Backplate Static Composite Plate
        if (!this.#backplate.staticBmp || (this.#dirtyFlags & LcdTimerController.DIRTY.BACKPLATE) ||
            this.#backplate.staticBmp.Width !== w || this.#backplate.staticBmp.Height !== h) {
            this.#backplate.renderStatic(w, h, theme.bg, this.config.opBG);
            this.#dirtyFlags &= ~LcdTimerController.DIRTY.BACKPLATE;
        }
        if (this.#backplate.staticBmp) {
            gr.DrawImage(this.#backplate.staticBmp, 0, 0, w, h, 0, 0, this.#backplate.staticBmp.Width, this.#backplate.staticBmp.Height);
        }

        if (this.#dirtyFlags & LcdTimerController.DIRTY.LAYOUT) {
            this.updateLayout(gr, w, h);
        }
        const lo = this.#layout;
        const isInternal = (this.config.clockFontName === 'Digital');
        const pad = this.scale(15) + (this.config.borderMode > 0 ? Math.ceil(this.scale(this.config.borderMode) / 2) + 4 : 0);

        // MODE 0: DIGITAL TIMER
        if (this.config.displayMode === 0) {
            const isPlaying = fb.IsPlaying || fb.IsPaused;
            let rawTime = this.#lastTimeStr;
            if (!isPlaying || !rawTime) rawTime = this.config.modeRemaining ? '-0:00' : ' 0:00';

            const totalW = isInternal
                ? this.#digitSprites.getStringWidth(lo.ghostStr)
                : (lo.timeCache.str === rawTime ? lo.timeCache.w : gr.MeasureString(rawTime, lo.clockFont, 0, 0, 9999, 9999).Width);

            const clockX = lo.padL + Math.round((lo.dw - totalW) / 2);
            const clockY = lo.padT + Math.round(lo.dh / 2) + this.config.vOffset - Math.round(lo.clockSize / 2);

            if (this.config.showGhost && this.config.opGhost > 0) {
                this.#digitSprites.drawGhostString(gr, lo.ghostStr, clockX, clockY);
            }

            this.#digitSprites.drawTimeString(gr, rawTime, clockX, clockY);

            if (this.config.showM0Codec && this.#trackInfo.codec && isPlaying && lo.codecFont) {
                const cCol = GdiUtils.setAlpha(theme.lcd, this.#codecFlash ? this.config.opTech : Math.floor(this.config.opTech * 0.3));
                gr.DrawString(this.#trackInfo.codec, lo.codecFont, cCol, lo.padL + pad + this.config.codecOffX, lo.padT + pad + this.config.codecOffY, lo.dw - pad, lo.dh);
            }

            if (this.config.showM0Tech && isPlaying && lo.techFont) {
                let xPos = lo.padL + pad + this.config.detailOffX;
                const yPos = lo.padT + lo.bottomY + this.config.detailOffY;
                const sep = Math.max(4, Math.round(lo.techSize * 0.35));

                for (const part of lo.m0TechParts) {
                    const col = this.config.useThemeColorForTech ? theme.lcd : part.baseCol;
                    gr.DrawString(part.text, lo.techFont, GdiUtils.setAlpha(col, 220), xPos, yPos, part.w + 2, lo.bottomH);
                    xPos += part.w + sep;
                }
            }
        }

        // MODE 1: TRACK & TECHNICAL DETAILS (Bake-then-Blit)
        if (this.config.displayMode === 1) {
            const isPlaying = fb.IsPlaying || fb.IsPaused;
            const m1Bmp = this.#mode1Cache.render(w, h, lo, this.config, theme.lcd, isPlaying, s => this.scale(s));
            if (m1Bmp) {
                gr.DrawImage(m1Bmp, 0, 0, w, h, 0, 0, m1Bmp.Width, m1Bmp.Height);
            }

            if (isPlaying && this.config.playIconType > 0 && lo.iconFont && (!this.config.playIconBlink || this.#btnFlash || fb.IsPaused)) {
                const fontName = LcdTimerController.ICON_FONTS[this.config.playIconType];
                const icon = fb.IsPlaying && !fb.IsPaused ? LcdTimerController.ICON_CHARS[fontName].play : LcdTimerController.ICON_CHARS[fontName].pause;
                const iconX = lo.padL + lo.dw - pad - lo.iconW;
                const iconY = lo.padT + lo.dh - pad - lo.iconH;
                gr.DrawString(icon, lo.iconFont, GdiUtils.setAlpha(theme.lcd, this.config.opClock), iconX, iconY, lo.iconW + 6, lo.iconH + 6);
            }
        }

        // Overlay Layer
        if (!this.#backplate.overlayBmp || this.#backplate.isOverlayDirty ||
            (this.#dirtyFlags & LcdTimerController.DIRTY.OVERLAY) ||
            this.#backplate.overlayBmp.Width !== w || this.#backplate.overlayBmp.Height !== h) {
            this.#backplate.renderOverlay(w, h, this.config, theme.lcd, this.getBorderColor(), this.#bezelBmp, this.#dpiScale);
            this.#dirtyFlags &= ~LcdTimerController.DIRTY.OVERLAY;
        }
        if (this.#backplate.overlayBmp) {
            gr.DrawImage(this.#backplate.overlayBmp, 0, 0, w, h, 0, 0, this.#backplate.overlayBmp.Width, this.#backplate.overlayBmp.Height);
        }

        if (this.#opacityTarget) {
            this.#drawSliderHud(gr, w, h);
        } else if (this.#positionAdjustMode) {
            this.#drawPositionHud(gr, w, h);
        } else if (this.#bezelNotifyText) {
            this.#drawBezelToast(gr, w, h);
        }
    }

    #drawSliderHud(gr, w, h) {
        const barW = Math.min(this.scale(220), Math.round(w * 0.6));
        const bx = Math.floor((w - barW) / 2);
        const by = h - this.scale(18);
        const font = this.#fonts.get('Segoe UI', 12);
        const val = this.getOpacity(this.#opacityTarget);
        const label = `${this.#opacityTarget}: ${val}`;
        const lSize = gr.MeasureString(label, font, 0, 0, 9999, 9999);

        gr.FillSolidRect(bx, by, barW, this.scale(6), GdiUtils.setAlpha(GdiUtils.RGB(255, 255, 255), 60));
        gr.FillSolidRect(bx, by, Math.floor(barW * (val / 255)), this.scale(6), GdiUtils.setAlpha(GdiUtils.RGB(255, 255, 255), 180));
        gr.DrawString(label, font, GdiUtils.setAlpha(GdiUtils.RGB(255, 255, 255), 220), (w - lSize.Width) / 2, by - lSize.Height - 2, lSize.Width + 4, lSize.Height);
    }

    #drawPositionHud(gr, w, h) {
        const msg = `Adjusting ${this.#positionAdjustMode} (Arrows/Wheel | Esc/Click exit)`;
        const font = this.#fonts.get('Segoe UI', 10);
        const mSize = gr.MeasureString(msg, font, 0, 0, 9999, 9999);
        const mx = (w - mSize.Width) / 2;
        const my = h - this.scale(25);
        gr.FillSolidRect(mx - 6, my - 2, mSize.Width + 12, mSize.Height + 4, GdiUtils.setAlpha(GdiUtils.RGB(0, 0, 0), 200));
        gr.DrawString(msg, font, GdiUtils.RGB(255, 255, 255), mx, my, mSize.Width + 4, mSize.Height);
    }

    #drawBezelToast(gr, w, h) {
        const font = this.#fonts.get('Segoe UI Semibold', this.scale(11), 0);
        if (font) {
            const text = `Bezel: ${this.#bezelNotifyText}`;
            const boxH = Math.max(20, this.scale(24));
            const boxW = Math.min(w - this.scale(20), Math.max(this.scale(130), text.length * this.scale(7) + this.scale(24)));
            const bx = Math.floor((w - boxW) / 2);
            const by = h - Math.max(22, this.scale(30));
            gr.FillSolidRect(bx, by, boxW, boxH, GdiUtils.setAlpha(GdiUtils.RGB(0, 0, 0), 190));
            gr.SetTextRenderingHint(4);
            gr.DrawString(text, font, GdiUtils.setAlpha(GdiUtils.RGB(255, 255, 255), 240), bx, by, boxW, boxH, 0x11000000);
        }
    }

    updateInfo() {
        let np = null;
        if (fb.IsPlaying || fb.IsPaused) {
            try { np = fb.GetNowPlaying(); } catch { np = null; }
        }

        if (np) {
            try {
                const raw = this.#compoundTf.EvalWithMetadb(np, true) || '';
                const parts = raw.split('\x01');
                const co = parts[0] ? String(parts[0]).toUpperCase() : '';
                this.#trackInfo.codec      = co;
                this.#trackInfo.title      = parts[1] || 'Unknown Title';
                this.#trackInfo.artist     = parts[2] || 'Unknown Artist';
                this.#trackInfo.album      = parts[3] || '';
                const br                   = parts[4] || '';
                const sr                   = parts[5] || '';
                const bits                 = parts[6] || '';
                this.#trackInfo.bitrate    = br ? `${br} kbps` : '';
                this.#trackInfo.samplerate = sr ? `${sr} Hz` : '';
                this.#trackInfo.bits       = bits ? `${bits} bit` : '';
                this.#trackInfo.channels   = parts[7] || '';
            } catch {
                for (const k of Object.keys(this.#trackInfo)) this.#trackInfo[k] = '';
            }
        } else {
            for (const k of Object.keys(this.#trackInfo)) this.#trackInfo[k] = '';
        }

        this.#dirtyFlags |= (LcdTimerController.DIRTY.LAYOUT | LcdTimerController.DIRTY.MODE1);
        this.#mode1Cache.invalidate();
    }

    refreshClock(forceImmediate = false) {
        if (this.config.displayMode !== 0 || this.#lifecycle !== LcdTimerController.LIFECYCLE.LIVE || !window.IsVisible) return;
        if (!fb.IsPlaying && !fb.IsPaused) return;

        const maxLen = Math.max(fb.PlaybackLength || 0, fb.PlaybackTime || 0);
        const maxH = Math.floor(maxLen / 3600);
        const curM = Math.floor(((fb.PlaybackTime || 0) % 3600) / 60);

        const ghostTpl = this.getGhostTemplate(maxH, this.config.modeRemaining, curM);
        const tplChanged = (ghostTpl !== this.#lastGhostTemplate);
        if (tplChanged) {
            this.#lastGhostTemplate = ghostTpl;
            this.#dirtyFlags |= LcdTimerController.DIRTY.LAYOUT;
        }

        const t = this.config.modeRemaining ? Math.max(0, fb.PlaybackLength - fb.PlaybackTime) : fb.PlaybackTime;
        const s = this.config.modeRemaining ? Math.ceil(t) : Math.floor(t);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        const sStr = (sec < 10 ? '0' : '') + sec;
        const rem = this.config.modeRemaining;

        let timeStr = '';
        if (maxH >= 10) {
            const hStr = h < 10 ? (rem ? ` -${h}` : `  ${h}`) : (rem ? `-${h}` : ` ${h}`);
            timeStr = `${hStr}:${m < 10 ? '0' : ''}${m}:${sStr}`;
        } else if (maxH > 0) {
            const prefix = rem ? '-' : ' ';
            timeStr = `${prefix}${h}:${m < 10 ? '0' : ''}${m}:${sStr}`;
        } else {
            timeStr = m < 10 ? (rem ? `-${m}:${sStr}` : ` ${m}:${sStr}`) : (rem ? `-${m}:${sStr}` : `${m}:${sStr}`);
        }

        if (forceImmediate || tplChanged || timeStr !== this.#lastTimeStr) {
            this.#lastTimeStr = timeStr;
            this.#layout.timeCache.str = '';

            if (tplChanged) {
                window.Repaint();
            } else {
                const padMargin = Math.max(40, Math.round(this.#layout.clockSize * 0.45));
                const clockY = this.#layout.padT + (this.#layout.dh / 2) + this.config.vOffset - (this.#layout.clockSize / 2);
                const clipY = Math.max(0, Math.round(clockY - padMargin));
                const clipH = Math.min(window.Height - clipY, this.#layout.ghostH + (padMargin * 2) + Math.abs(this.config.vOffset));
                window.RepaintRect(0, clipY, window.Width, clipH);
            }
        }
    }

    startTimers() {
        this.stopTimers();
        if (this.#lifecycle !== LcdTimerController.LIFECYCLE.LIVE) return;

        const canBlink = (this.config.displayMode === 0 && this.config.showM0Codec && fb.IsPaused) ||
                         (this.config.displayMode === 1 && this.config.playIconType > 0 && this.config.playIconBlink && (fb.IsPlaying || fb.IsPaused));
        if (!canBlink) return;

        if (!window.IsVisible) {
            this.#wasHidden = true;
            return;
        }

        this.#blinkTimer = window.SetInterval(() => {
            if (this.#lifecycle !== LcdTimerController.LIFECYCLE.LIVE || (!fb.IsPlaying && !fb.IsPaused)) { 
                this.stopTimers(); 
                return; 
            }

            if (!window.IsVisible) {
                this.#wasHidden = true;
                this.stopTimers();
                return;
            }

            this.#btnFlash = !this.#btnFlash;
            this.#codecFlash = fb.IsPaused ? !this.#codecFlash : true;

            const pad = this.scale(15) + (this.config.borderMode > 0 ? Math.ceil(this.scale(this.config.borderMode) / 2) + 4 : 0);

            if (this.config.displayMode === 0 && this.config.showM0Codec && fb.IsPaused) {
                const cx = Math.max(0, this.#layout.padL + pad + this.config.codecOffX - 4);
                const cy = Math.max(0, this.#layout.padT + pad + this.config.codecOffY - 4);
                const cw = Math.min(window.Width - cx, Math.ceil((this.#layout.codecW || this.scale(60)) + 8));
                const ch = Math.min(window.Height - cy, Math.ceil(this.#layout.codecSize + 8));
                this.#blinkTarget = { x: cx, y: cy, w: cw, h: ch, type: 'codec' };
                window.RepaintRect(cx, cy, cw, ch);
            } else if (this.config.displayMode === 1 && this.config.playIconType > 0 && this.config.playIconBlink) {
                const ix = Math.max(0, this.#layout.padL + this.#layout.dw - pad - this.#layout.iconW - 4);
                const iy = Math.max(0, this.#layout.padT + this.#layout.dh - pad - this.#layout.iconH - 4);
                const iw = Math.min(window.Width - ix, Math.ceil(this.#layout.iconW + 8));
                const ih = Math.min(window.Height - iy, Math.ceil(this.#layout.iconH + 8));
                this.#blinkTarget = { x: ix, y: iy, w: iw, h: ih, type: 'icon' };
                window.RepaintRect(ix, iy, iw, ih);
            }
        }, 500);
    }

    stopTimers() {
        if (this.#blinkTimer) {
            window.ClearInterval(this.#blinkTimer);
            this.#blinkTimer = null;
        }
        this.#btnFlash = true;
        this.#codecFlash = true;
        this.#blinkTarget = null;
        if (!fb.IsPlaying && !fb.IsPaused) {
            this.#lastTimeStr = '';
        }
    }

    onSize() {
        if (this.#lifecycle !== LcdTimerController.LIFECYCLE.LIVE) return;
        this.#dirtyFlags = LcdTimerController.DIRTY.ALL;
        this.#digitSprites.invalidate();
        this.#mode1Cache.invalidate();
        this.#backplate.invalidate();
        window.Repaint();
    }

    adjustPosition(target, dx, dy) {
        switch (target) {
            case 'Clock':   this.config.vOffset += dy; break;
            case 'Codec':   this.config.codecOffX += dx; this.config.codecOffY += dy; break;
            case 'Details': this.config.detailOffX += dx; this.config.detailOffY += dy; break;
            case 'M1Title': this.config.m1TitleOffX += dx; this.config.m1TitleOffY += dy; break;
            case 'M1Codec': this.config.m1CodecOffX += dx; this.config.m1CodecOffY += dy; break;
        }
        this.#dirtyFlags |= (LcdTimerController.DIRTY.LAYOUT | LcdTimerController.DIRTY.MODE1);
        this.#mode1Cache.invalidate();
    }

    getOpacity(key) {
        switch (key) {
            case 'Clock':      return this.config.opClock;
            case 'Ghost':      return this.config.opGhost;
            case 'Tech':       return this.config.opTech;
            case 'Border':     return this.config.opBorder;
            case 'Background': return this.config.opBG;
            case 'Reflection': return this.config.opReflection;
            case 'Shadow':     return this.config.opShadow;
            case 'Glow':       return this.config.opGlow;
            case 'Scanlines':  return this.config.opScanlines;
            case 'Phosphor':   return this.config.opPhosphor;
            default:           return 255;
        }
    }

    setOpacity(key, val) {
        const clamped = GdiUtils.clamp(val, 0, 255);
        switch (key) {
            case 'Clock':      this.config.opClock = clamped; this.#digitSprites.invalidate(); this.#mode1Cache.invalidate(); break;
            case 'Ghost':      this.config.opGhost = clamped; break;
            case 'Tech':       this.config.opTech = clamped; break;
            case 'Border':     this.config.opBorder = clamped; break;
            case 'Background': this.config.opBG = clamped; this.#dirtyFlags |= LcdTimerController.DIRTY.BACKPLATE; break;
            case 'Reflection': this.config.opReflection = clamped; break;
            case 'Shadow':     this.config.opShadow = clamped; this.#digitSprites.invalidate(); break;
            case 'Glow':       this.config.opGlow = clamped; this.#digitSprites.invalidate(); break;
            case 'Scanlines':  this.config.opScanlines = clamped; break;
            case 'Phosphor':   this.config.opPhosphor = clamped; break;
        }
        this.#backplate.invalidateOverlay();
        this.requestSave();
        window.Repaint();
    }

    onMouseWheel(step) {
        if (this.#lifecycle !== LcdTimerController.LIFECYCLE.LIVE) return false;
        if (this.#opacityTarget) {
            this.setOpacity(this.#opacityTarget, this.getOpacity(this.#opacityTarget) + (step > 0 ? 5 : -5));
            return true;
        }
        if (this.#positionAdjustMode) {
            const isShift = utils.IsKeyPressed(0x10); // VK_SHIFT
            const d = step > 0 ? -1 : 1;
            this.adjustPosition(this.#positionAdjustMode, isShift ? d : 0, isShift ? 0 : d);
            this.requestSave();
            window.Repaint();
            return true;
        }
        this.config.displayMode = this.config.displayMode === 0 ? 1 : 0;
        this.#dirtyFlags |= (LcdTimerController.DIRTY.LAYOUT | LcdTimerController.DIRTY.MODE1);
        this.startTimers();
        this.requestSave();
        if (this.config.displayMode === 0) this.refreshClock(true);
        window.Repaint();
        return true;
    }

    onLbtnDblClk() {
        if (this.#lifecycle !== LcdTimerController.LIFECYCLE.LIVE) return;
        this.#lastDblClkTime = Date.now();
        this.#displayOff = !this.#displayOff;
        window.Repaint();
    }

    onLbtnUp() {
        if (this.#lifecycle !== LcdTimerController.LIFECYCLE.LIVE) return false;
        if (Date.now() - this.#lastDblClkTime < 300) return;
        if (this.#displayOff) return;
        if (this.#positionAdjustMode || this.#opacityTarget) {
            this.#positionAdjustMode = null;
            this.#opacityTarget = null;
            window.Repaint();
            return;
        }
        if (this.config.displayMode === 0) {
            this.config.modeRemaining = !this.config.modeRemaining;
            this.#dirtyFlags |= LcdTimerController.DIRTY.LAYOUT;
            this.refreshClock(true);
            this.saveAll();
            window.Repaint();
        }
    }

    onKeyDown(vkey) {
        if (this.#lifecycle !== LcdTimerController.LIFECYCLE.LIVE) return false;
        if (vkey === 0x1B) { // VK_ESCAPE
            if (this.#positionAdjustMode || this.#opacityTarget) {
                this.#positionAdjustMode = null;
                this.#opacityTarget = null;
                window.Repaint();
                return true;
            }
        }

        if (utils.IsKeyPressed(0x11) && !utils.IsKeyPressed(0x10) && !utils.IsKeyPressed(0x12)) {
            if (vkey === 0x26) { this.cycleBezel(-1); return true; } // UP
            if (vkey === 0x28) { this.cycleBezel(1);  return true; } // DOWN
        }

        if (!this.#positionAdjustMode) return false;
        const step = utils.IsKeyPressed(0x10) ? 5 : 1;
        let dx = 0, dy = 0;
        if (vkey === 0x25) dx = -step;
        else if (vkey === 0x27) dx = step;
        else if (vkey === 0x26) dy = -step;
        else if (vkey === 0x28) dy = step;
        else return false;

        this.adjustPosition(this.#positionAdjustMode, dx, dy);
        this.requestSave();
        window.Repaint();
        return true;
    }

    loadPreset(slot) {
        if (slot < 1 || slot > 3) return;
        const raw = window.GetProperty(`LCD.Preset${slot}`, null);
        if (!raw) return;
        try {
            const parsed = JSON.parse(raw);
            const sourceConfig = (parsed && parsed.version === 2) ? parsed.config : parsed;
            this.config = LcdTimerController.sanitizeConfig(sourceConfig, this.config);

            this.#positionAdjustMode = null;
            this.#opacityTarget = null;
            this.loadBezel();
            this.#dirtyFlags = LcdTimerController.DIRTY.ALL;
            this.#digitSprites.invalidate();
            this.#mode1Cache.invalidate();
            this.#backplate.invalidate();
            this.startTimers();
            window.Repaint();
        } catch (err) {
            console.log(`Failed to load preset ${slot}: ${err}`);
        }
    }

    savePreset(slot) {
        if (slot < 1 || slot > 3) return;
        const payload = {
            version: 2,
            config: this.config
        };
        window.SetProperty(`LCD.Preset${slot}`, JSON.stringify(payload));
    }

    showContextMenu(x, y) {
        if (this.#positionAdjustMode || this.#opacityTarget) {
            this.#positionAdjustMode = null;
            this.#opacityTarget = null;
            window.Repaint();
        }

        const MID = LcdTimerController.MENU_ID;

        const menus = [];
        const createMenu = () => {
            const m = window.CreatePopupMenu();
            menus.push(m);
            return m;
        };

        const m        = createMenu();
        const themeM   = createMenu();
        const appM     = createMenu();
        const bzM      = createMenu();
        const iconM    = createMenu();
        const borderM  = createMenu();
        const opacityM = createMenu();
        const layoutM  = createMenu();
        const fontM    = createMenu();
        const m0FontM  = createMenu();
        const m1FontM  = createMenu();
        const presetM  = createMenu();
        const loadM    = createMenu();
        const saveM    = createMenu();

        // 1. Top Toggle: Sync Theme Across Panels
        themeM.AppendMenuItem(0, MID.THEME_SYNC, 'Sync Theme');
        if (this.config.syncTheme) themeM.CheckMenuRadioItem(MID.THEME_SYNC, MID.THEME_SYNC, MID.THEME_SYNC);
        themeM.AppendMenuSeparator();

        // 2. Themes with matching separator layout (at index 8 and 20)
        LcdTimerController.THEMES.forEach((t, i) => {
            if (i === 8 || i === 20) themeM.AppendMenuSeparator();
            themeM.AppendMenuItem(0, MID.THEME_BASE + i, t.name);
        });
        themeM.AppendMenuSeparator();
        themeM.AppendMenuItem(0, MID.THEME_BASE + LcdTimerController.THEMES.length, 'USER CUSTOM');
        themeM.CheckMenuRadioItem(MID.THEME_BASE, MID.THEME_BASE + LcdTimerController.THEMES.length, MID.THEME_BASE + this.config.themeIdx);
        themeM.AppendMenuSeparator();
        themeM.AppendMenuItem(0, MID.CUST_LCD_COLOR, 'Custom LCD Color...');
        themeM.AppendMenuItem(0, MID.CUST_BG_COLOR, 'Custom BG Color...');
        themeM.AppendMenuItem(0, MID.CUST_BORDER_COLOR, 'Custom Border Color...');
        themeM.AppendTo(m, 0, 'Themes');

        bzM.AppendMenuItem(0, MID.BEZEL_ENABLE, 'Enable Bezel Frame');
        if (this.config.bezelEnabled && this.config.bezelFile) bzM.CheckMenuRadioItem(MID.BEZEL_ENABLE, MID.BEZEL_ENABLE, MID.BEZEL_ENABLE);
        bzM.AppendMenuSeparator();
        const bezelNames = this.listBezelNames();
        const bzStart = MID.BEZEL_NONE;
        const bzEnd = bezelNames.length > 0 ? (bzStart + bezelNames.length) : bzStart;
        bzM.AppendMenuItem(0, bzStart, 'None (No Bezel)');
        if (bezelNames.length > 0) {
            bzM.AppendMenuSeparator();
            bezelNames.forEach((name, bi) => bzM.AppendMenuItem(0, bzStart + 1 + bi, name));
        }
        
        const curClean = (this.config.bezelFile || '').toLowerCase().replace(/\.[^/.]+$/, '');
        const curBzIdx = (this.config.bezelEnabled && curClean) 
            ? bezelNames.findIndex(n => n.toLowerCase() === curClean) 
            : -1;
        if (curBzIdx !== -1) bzM.CheckMenuRadioItem(bzStart, bzEnd, bzStart + 1 + curBzIdx);
        else bzM.CheckMenuRadioItem(bzStart, bzEnd, bzStart);

        bzM.AppendMenuSeparator();
        bzM.AppendMenuItem(0, MID.BEZEL_FOLDER, 'Set Bezel Folder...');
        bzM.AppendMenuItem(0, MID.BEZEL_RELOAD, 'Reload Bezel List');
        bzM.AppendMenuSeparator();
        bzM.AppendMenuItem(0, MID.PAD_LEFT, `Left padding... (${this.config.padLeft}px)`);
        bzM.AppendMenuItem(0, MID.PAD_RIGHT, `Right padding... (${this.config.padRight}px)`);
        bzM.AppendMenuItem(0, MID.PAD_TOP, `Top padding... (${this.config.padTop}px)`);
        bzM.AppendMenuItem(0, MID.PAD_BOTTOM, `Bottom padding... (${this.config.padBottom}px)`);
        bzM.AppendTo(appM, 0, 'Bezel / Overlay');

        iconM.AppendMenuItem(0, MID.PLAY_ICON_BLINK, 'Blink When Playing');
        if (this.config.playIconBlink) iconM.CheckMenuRadioItem(MID.PLAY_ICON_BLINK, MID.PLAY_ICON_BLINK, MID.PLAY_ICON_BLINK);
        iconM.AppendMenuSeparator();
        iconM.AppendMenuItem(0, MID.PLAY_ICON_BASE, 'Hidden');
        iconM.AppendMenuItem(0, MID.PLAY_ICON_BASE + 1, 'Guifx2');
        iconM.AppendMenuItem(0, MID.PLAY_ICON_BASE + 2, 'FontAwesome');
        iconM.AppendMenuItem(0, MID.PLAY_ICON_BASE + 3, 'Segoe MDL2');
        iconM.CheckMenuRadioItem(MID.PLAY_ICON_BASE, MID.PLAY_ICON_BASE + 3, MID.PLAY_ICON_BASE + this.config.playIconType);
        iconM.AppendTo(appM, 0, 'Play Icon (Mode 1)');

        borderM.AppendMenuItem(0, MID.BORDER_SIZE, `Set Border Size... (Current: ${this.config.borderMode}px)`);
        borderM.AppendMenuSeparator();
        borderM.AppendMenuItem(0, MID.BORDER_CUSTOM_TOGGLE, 'Use Custom Border Color');
        if (this.config.useCustomBorder) borderM.CheckMenuRadioItem(MID.BORDER_CUSTOM_TOGGLE, MID.BORDER_CUSTOM_TOGGLE, MID.BORDER_CUSTOM_TOGGLE);
        borderM.AppendMenuItem(0, MID.BORDER_CUSTOM_SETUP, 'Setup Custom Border Color...');
        borderM.AppendTo(appM, 0, 'Border');

        appM.AppendMenuSeparator();
        appM.AppendMenuItem(0, MID.SHOW_GHOST, 'Ghost Segments');
        if (this.config.showGhost) appM.CheckMenuRadioItem(MID.SHOW_GHOST, MID.SHOW_GHOST, MID.SHOW_GHOST);
        appM.AppendMenuItem(0, MID.USE_REFLECTION, 'LCD Reflection');
        if (this.config.useReflection) appM.CheckMenuRadioItem(MID.USE_REFLECTION, MID.USE_REFLECTION, MID.USE_REFLECTION);
        appM.AppendMenuItem(0, MID.SHOW_SHADOW, 'Segment Shadow');
        if (this.config.showShadow) appM.CheckMenuRadioItem(MID.SHOW_SHADOW, MID.SHOW_SHADOW, MID.SHOW_SHADOW);
        appM.AppendMenuItem(0, MID.SHOW_GLOW, 'CRT Glow');
        if (this.config.showGlow) appM.CheckMenuRadioItem(MID.SHOW_GLOW, MID.SHOW_GLOW, MID.SHOW_GLOW);
        appM.AppendMenuItem(0, MID.SHOW_SCANLINES, 'CRT Scanlines');
        if (this.config.showScanlines) appM.CheckMenuRadioItem(MID.SHOW_SCANLINES, MID.SHOW_SCANLINES, MID.SHOW_SCANLINES);
        appM.AppendMenuItem(0, MID.SHOW_PHOSPHOR, 'Phosphor Mask');
        if (this.config.showPhosphor) appM.CheckMenuRadioItem(MID.SHOW_PHOSPHOR, MID.SHOW_PHOSPHOR, MID.SHOW_PHOSPHOR);
        appM.AppendMenuSeparator();
        appM.AppendMenuItem(0, MID.MATCH_TECH_COLOR, 'Match Tech/Codec to Theme Color');
        if (this.config.useThemeColorForTech) appM.CheckMenuRadioItem(MID.MATCH_TECH_COLOR, MID.MATCH_TECH_COLOR, MID.MATCH_TECH_COLOR);

        appM.AppendMenuSeparator();
        ['Clock', 'Ghost', 'Tech', 'Border', 'Background', 'Reflection', 'Shadow', 'Glow', 'Scanlines', 'Phosphor']
            .forEach((n, i) => opacityM.AppendMenuItem(0, MID.OPACITY_BASE + i, n));
        opacityM.AppendTo(appM, 0, 'Opacity');

        appM.AppendMenuSeparator();
        appM.AppendMenuItem(0, MID.OVERLAY_ALL_OFF, 'Disable All Overlays');
        if (this.config.overlayAllOff) appM.CheckMenuRadioItem(MID.OVERLAY_ALL_OFF, MID.OVERLAY_ALL_OFF, MID.OVERLAY_ALL_OFF);
        appM.AppendTo(m, 0, 'Appearance');

        layoutM.AppendMenuItem(0, MID.POS_CLOCK, 'Adjust Clock Position...');
        layoutM.AppendMenuItem(0, MID.POS_CODEC, 'Adjust Codec Position...');
        layoutM.AppendMenuItem(0, MID.POS_DETAILS, 'Adjust Details Position...');
        layoutM.AppendMenuSeparator();
        layoutM.AppendMenuItem(0, MID.POS_M1_TITLE, 'Adjust Mode 1 Title Position...');
        layoutM.AppendMenuItem(0, MID.POS_M1_CODEC, 'Adjust Mode 1 Codec Position...');
        layoutM.AppendMenuSeparator();
        layoutM.AppendMenuItem(0, MID.POS_RESET_ALL, 'Reset All Positions');
        layoutM.AppendTo(m, 0, 'Layout');

        fontM.AppendMenuItem(0, MID.AUTO_FONT_SIZE, 'Auto Font Size');
        if (this.config.autoFontSize) fontM.CheckMenuRadioItem(MID.AUTO_FONT_SIZE, MID.AUTO_FONT_SIZE, MID.AUTO_FONT_SIZE);
        fontM.AppendMenuSeparator();

        m0FontM.AppendMenuItem(0, MID.SHOW_M0_CODEC, 'Show Codec Label');
        if (this.config.showM0Codec) m0FontM.CheckMenuRadioItem(MID.SHOW_M0_CODEC, MID.SHOW_M0_CODEC, MID.SHOW_M0_CODEC);
        m0FontM.AppendMenuItem(0, MID.SHOW_M0_TECH, 'Show Tech Details');
        if (this.config.showM0Tech) m0FontM.CheckMenuRadioItem(MID.SHOW_M0_TECH, MID.SHOW_M0_TECH, MID.SHOW_M0_TECH);
        m0FontM.AppendMenuSeparator();
        m0FontM.AppendMenuItem(0, MID.CLOCK_FONT_DIGITAL, 'Digital (Internal 7-Segment LCD)');
        m0FontM.AppendMenuItem(0, MID.CLOCK_FONT_EXTERNAL, `External Font… (${this.config.clockFontName !== 'Digital' ? this.config.clockFontName : 'Digital-7 Mono'})`);
        m0FontM.CheckMenuRadioItem(MID.CLOCK_FONT_EXTERNAL, MID.CLOCK_FONT_DIGITAL, this.config.clockFontName === 'Digital' ? MID.CLOCK_FONT_DIGITAL : MID.CLOCK_FONT_EXTERNAL);
        m0FontM.AppendMenuSeparator();
        m0FontM.AppendMenuItem(0, MID.CLOCK_ITALIC_TOGGLE, 'Italic (5° Slanted)');
        if (this.config.italicSlant) m0FontM.CheckMenuRadioItem(MID.CLOCK_ITALIC_TOGGLE, MID.CLOCK_ITALIC_TOGGLE, MID.CLOCK_ITALIC_TOGGLE);
        m0FontM.AppendMenuSeparator();
        m0FontM.AppendMenuItem(0, MID.CODEC_FONT_NAME, 'Codec Font...');
        m0FontM.AppendMenuItem(0, MID.TECH_FONT_NAME, 'Tech Font...');
        m0FontM.AppendMenuSeparator();
        m0FontM.AppendMenuItem(this.config.autoFontSize ? 0x0001 : 0, MID.CLOCK_FONT_SIZE, `Clock Font Size (${this.config.clockFontSize}pt)...`);
        m0FontM.AppendMenuItem(this.config.autoFontSize ? 0x0001 : 0, MID.CODEC_FONT_SIZE, 'Codec Font Size...');
        m0FontM.AppendMenuItem(this.config.autoFontSize ? 0x0001 : 0, MID.TECH_FONT_SIZE, 'Tech Font Size...');
        m0FontM.AppendTo(fontM, this.config.displayMode === 0 ? 0 : 0x0001, 'Mode 0 (Timer)');

        m1FontM.AppendMenuItem(0, MID.SHOW_M1_TITLE, 'Show Title');
        if (this.config.showM1Title) m1FontM.CheckMenuRadioItem(MID.SHOW_M1_TITLE, MID.SHOW_M1_TITLE, MID.SHOW_M1_TITLE);
        m1FontM.AppendMenuItem(0, MID.SHOW_M1_ALBUM, 'Show Artist & Album');
        if (this.config.showM1Album) m1FontM.CheckMenuRadioItem(MID.SHOW_M1_ALBUM, MID.SHOW_M1_ALBUM, MID.SHOW_M1_ALBUM);
        m1FontM.AppendMenuItem(0, MID.SHOW_M1_CODEC, 'Show Codec Name');
        if (this.config.showM1Codec) m1FontM.CheckMenuRadioItem(MID.SHOW_M1_CODEC, MID.SHOW_M1_CODEC, MID.SHOW_M1_CODEC);
        m1FontM.AppendMenuItem(0, MID.SHOW_M1_TECH, 'Show Tech Details');
        if (this.config.showM1Tech) m1FontM.CheckMenuRadioItem(MID.SHOW_M1_TECH, MID.SHOW_M1_TECH, MID.SHOW_M1_TECH);
        m1FontM.AppendMenuSeparator();
        m1FontM.AppendMenuItem(0, MID.M1_TEXT_FONT_NAME, 'Text Row Font...');
        m1FontM.AppendMenuItem(this.config.autoFontSize ? 0x0001 : 0, MID.M1_TEXT_FONT_SIZE, 'Text Row Font Size...');
        m1FontM.AppendMenuItem(0, MID.M1_CODEC_FONT_SIZE, `Codec Font Size (Current: ${this.config.m1CodecFontSize > 0 ? this.config.m1CodecFontSize + 'pt' : 'Auto'})...`);
        m1FontM.AppendTo(fontM, this.config.displayMode === 1 ? 0 : 0x0001, 'Mode 1 (Text)');
        fontM.AppendTo(m, 0, 'Fonts & Visibility');

        [1, 2, 3].forEach(i => {
            const hasPreset = Boolean(window.GetProperty(`LCD.Preset${i}`, null));
            loadM.AppendMenuItem(hasPreset ? 0 : 0x0001, MID.PRESET_LOAD_BASE + (i - 1), `Preset ${i}${hasPreset ? '' : ' (Empty)'}`);
        });
        loadM.AppendTo(presetM, 0, 'Load Preset');
        [1, 2, 3].forEach(i => saveM.AppendMenuItem(0, MID.PRESET_SAVE_BASE + (i - 1), `Preset ${i}`));
        saveM.AppendTo(presetM, 0, 'Save Preset');
        presetM.AppendTo(m, 0, 'Presets');

        m.AppendMenuSeparator();
        m.AppendMenuItem(0, MID.RESET_DEFAULTS, 'Reset Visual Settings to Defaults');
        m.AppendMenuItem(0, MID.FACTORY_RESET, 'Factory Reset (All Settings & Overlays)...');

        let id = 0;
        try {
            id = m.TrackPopupMenu(x, y);
        } finally {
            for (const menu of menus) {
                try { menu.Dispose(); } catch {}
            }
        }

        if (id === 0) return true;

        if (id === MID.THEME_SYNC) {
            this.config.syncTheme = !this.config.syncTheme;
            this.saveAll();
            if (this.config.syncTheme) {
                const themeName = LcdTimerController.THEMES[this.config.themeIdx]?.name;
                if (themeName) {
                    try { window.NotifyOthers('LcdThemeSync', themeName); } catch {}
                }
            }
        } else if (id >= MID.THEME_BASE && id < MID.THEME_BASE + LcdTimerController.THEMES.length) {
            const chosenTheme = LcdTimerController.THEMES[id - MID.THEME_BASE];
            this.setThemeByName(chosenTheme.name, true);
        } else if (id === MID.THEME_BASE + LcdTimerController.THEMES.length) {
            this.config.themeIdx = LcdTimerController.THEMES.length;
            this.#dirtyFlags = LcdTimerController.DIRTY.ALL;
            this.#backplate.invalidate();
            this.#digitSprites.invalidate();
            this.#mode1Cache.invalidate();
        } else if (id === MID.CUST_LCD_COLOR) {
            const c = utils.ColourPicker(window.ID, this.config.custLcd);
            if (c !== -1) { 
                this.config.custLcd = (c | 0xFF000000) >>> 0; 
                this.config.themeIdx = LcdTimerController.THEMES.length; 
                this.#dirtyFlags = LcdTimerController.DIRTY.ALL;
                this.#backplate.invalidate(); 
                this.#digitSprites.invalidate();
                this.#mode1Cache.invalidate();
            }
        } else if (id === MID.CUST_BG_COLOR) {
            const c = utils.ColourPicker(window.ID, this.config.custBg);
            if (c !== -1) { 
                this.config.custBg = (c | 0xFF000000) >>> 0; 
                this.config.themeIdx = LcdTimerController.THEMES.length; 
                this.#dirtyFlags |= LcdTimerController.DIRTY.BACKPLATE;
                this.#backplate.invalidate(); 
            }
        } else if (id === MID.CUST_BORDER_COLOR || id === MID.BORDER_CUSTOM_SETUP) {
            const c = utils.ColourPicker(window.ID, this.config.custBorder);
            if (c !== -1) { 
                this.config.custBorder = (c | 0xFF000000) >>> 0; 
                this.config.useCustomBorder = true; 
                this.#dirtyFlags |= LcdTimerController.DIRTY.OVERLAY;
                this.#backplate.invalidate(); 
            }
        } else if (id === MID.BORDER_SIZE) {
            const val = GdiUtils.prompt('Enter border thickness in px (0-50):', 'Border Thickness', this.config.borderMode);
            if (val !== null && val !== '') { 
                this.config.borderMode = GdiUtils.clamp(parseInt(val, 10) || 0, 0, 50); 
                this.#dirtyFlags |= (LcdTimerController.DIRTY.LAYOUT | LcdTimerController.DIRTY.OVERLAY);
                this.#backplate.invalidate(); 
            }
        } else if (id === MID.BORDER_CUSTOM_TOGGLE) {
            this.config.useCustomBorder = !this.config.useCustomBorder;
            this.#dirtyFlags |= LcdTimerController.DIRTY.OVERLAY;
            this.#backplate.invalidate();
        } else if (id === MID.SHOW_GHOST) { 
            this.config.showGhost = !this.config.showGhost; 
            this.#dirtyFlags |= LcdTimerController.DIRTY.LAYOUT; 
        } else if (id === MID.USE_REFLECTION) { 
            this.config.useReflection = !this.config.useReflection; 
            this.#dirtyFlags |= LcdTimerController.DIRTY.OVERLAY;
            this.#backplate.invalidateOverlay(); 
        } else if (id === MID.SHOW_SHADOW) { 
            this.config.showShadow = !this.config.showShadow; 
            this.#dirtyFlags |= LcdTimerController.DIRTY.DIGITS;
            this.#digitSprites.invalidate();
        } else if (id === MID.SHOW_GLOW) { 
            this.config.showGlow = !this.config.showGlow; 
            this.#dirtyFlags |= LcdTimerController.DIRTY.DIGITS;
            this.#digitSprites.invalidate();
        } else if (id === MID.SHOW_SCANLINES) { 
            this.config.showScanlines = !this.config.showScanlines; 
            this.#dirtyFlags |= LcdTimerController.DIRTY.OVERLAY;
            this.#backplate.invalidateOverlay(); 
        } else if (id === MID.SHOW_PHOSPHOR) { 
            this.config.showPhosphor = !this.config.showPhosphor; 
            this.#dirtyFlags |= LcdTimerController.DIRTY.OVERLAY;
            this.#backplate.invalidateOverlay(); 
        } else if (id === MID.OVERLAY_ALL_OFF) { 
            this.config.overlayAllOff = !this.config.overlayAllOff; 
            this.#dirtyFlags |= LcdTimerController.DIRTY.OVERLAY;
            this.#backplate.invalidateOverlay(); 
        } else if (id === MID.BEZEL_ENABLE) {
            this.config.bezelEnabled = !this.config.bezelEnabled;
            if (this.config.bezelEnabled && !this.config.bezelFile && bezelNames.length > 0) {
                this.config.bezelFile = bezelNames[0];
            }
            this.loadBezel();
            this.#dirtyFlags |= LcdTimerController.DIRTY.OVERLAY;
            this.#backplate.invalidateOverlay();
            this.saveAll();
            window.Repaint();
        } else if (id === MID.BEZEL_NONE) {
            this.config.bezelEnabled = false;
            this.config.bezelFile = '';
            this.loadBezel();
            this.#dirtyFlags |= LcdTimerController.DIRTY.OVERLAY;
            this.#backplate.invalidateOverlay();
        } else if (id >= MID.BEZEL_BASE && id < MID.BEZEL_BASE + bezelNames.length) {
            this.config.bezelEnabled = true;
            this.config.bezelFile = bezelNames[id - MID.BEZEL_BASE];
            this.loadBezel();
            this.#dirtyFlags |= LcdTimerController.DIRTY.OVERLAY;
            this.#backplate.invalidateOverlay();
        } else if (id === MID.BEZEL_FOLDER) {
            const f = GdiUtils.prompt('Enter folder path containing bezel/overlay images:', 'Set Bezel Folder', this.config.bezelFolder);
            if (f) {
                const cleaned = GdiUtils.sanitizePath(f);
                if (cleaned && utils.IsDirectory(cleaned)) {
                    this.config.bezelFolder = cleaned;
                    this.#cachedBezelImages = null;
                    this.loadBezel();
                    this.#dirtyFlags |= LcdTimerController.DIRTY.OVERLAY;
                    this.#backplate.invalidateOverlay();
                }
            }
        } else if (id === MID.BEZEL_RELOAD) {
            this.#cachedBezelImages = null;
            this.loadBezel();
            this.#dirtyFlags |= LcdTimerController.DIRTY.OVERLAY;
            this.#backplate.invalidateOverlay();
        } else if (id === MID.PAD_LEFT) {
            const v = GdiUtils.prompt('Enter left padding in pixels (0-100):', 'Per-Side Padding', this.config.padLeft);
            if (v !== null && v !== '') { this.config.padLeft = GdiUtils.clamp(parseInt(v, 10) || 0, 0, 100); this.#dirtyFlags |= LcdTimerController.DIRTY.LAYOUT; }
        } else if (id === MID.PAD_RIGHT) {
            const v = GdiUtils.prompt('Enter right padding in pixels (0-100):', 'Per-Side Padding', this.config.padRight);
            if (v !== null && v !== '') { this.config.padRight = GdiUtils.clamp(parseInt(v, 10) || 0, 0, 100); this.#dirtyFlags |= LcdTimerController.DIRTY.LAYOUT; }
        } else if (id === MID.PAD_TOP) {
            const v = GdiUtils.prompt('Enter top padding in pixels (0-100):', 'Per-Side Padding', this.config.padTop);
            if (v !== null && v !== '') { this.config.padTop = GdiUtils.clamp(parseInt(v, 10) || 0, 0, 100); this.#dirtyFlags |= LcdTimerController.DIRTY.LAYOUT; }
        } else if (id === MID.PAD_BOTTOM) {
            const v = GdiUtils.prompt('Enter bottom padding in pixels (0-100):', 'Per-Side Padding', this.config.padBottom);
            if (v !== null && v !== '') { this.config.padBottom = GdiUtils.clamp(parseInt(v, 10) || 0, 0, 100); this.#dirtyFlags |= LcdTimerController.DIRTY.LAYOUT; }
        } else if (id === MID.SHOW_M0_CODEC) { 
            this.config.showM0Codec = !this.config.showM0Codec; 
            this.#dirtyFlags |= LcdTimerController.DIRTY.LAYOUT; 
            this.startTimers();
        } else if (id === MID.SHOW_M0_TECH) { 
            this.config.showM0Tech = !this.config.showM0Tech; 
            this.#dirtyFlags |= LcdTimerController.DIRTY.LAYOUT; 
        } else if (id === MID.MATCH_TECH_COLOR) { 
            this.config.useThemeColorForTech = !this.config.useThemeColorForTech; 
            this.#dirtyFlags |= (LcdTimerController.DIRTY.LAYOUT | LcdTimerController.DIRTY.MODE1);
            this.#mode1Cache.invalidate();
        } else if (id === MID.SHOW_M1_TITLE) { 
            this.config.showM1Title = !this.config.showM1Title; 
            this.#dirtyFlags |= LcdTimerController.DIRTY.MODE1; 
        } else if (id === MID.SHOW_M1_ALBUM) { 
            this.config.showM1Album = !this.config.showM1Album; 
            this.#dirtyFlags |= LcdTimerController.DIRTY.MODE1; 
        } else if (id === MID.SHOW_M1_CODEC) { 
            this.config.showM1Codec = !this.config.showM1Codec; 
            this.#dirtyFlags |= LcdTimerController.DIRTY.MODE1; 
        } else if (id === MID.SHOW_M1_TECH) { 
            this.config.showM1Tech = !this.config.showM1Tech; 
            this.#dirtyFlags |= LcdTimerController.DIRTY.MODE1; 
        } else if (id === MID.AUTO_FONT_SIZE) { 
            this.config.autoFontSize = !this.config.autoFontSize; 
            this.#dirtyFlags |= LcdTimerController.DIRTY.LAYOUT; 
        } else if (id >= MID.PLAY_ICON_BASE && id <= MID.PLAY_ICON_BASE + 3) { 
            this.config.playIconType = id - MID.PLAY_ICON_BASE; 
            this.#dirtyFlags |= LcdTimerController.DIRTY.LAYOUT; 
            this.startTimers();
        } else if (id === MID.PLAY_ICON_BLINK) { 
            this.config.playIconBlink = !this.config.playIconBlink; 
            this.startTimers();
        } else if (id >= MID.OPACITY_BASE && id < MID.OPACITY_BASE + 10) {
            const targets = ['Clock', 'Ghost', 'Tech', 'Border', 'Background', 'Reflection', 'Shadow', 'Glow', 'Scanlines', 'Phosphor'];
            this.#opacityTarget = targets[id - MID.OPACITY_BASE];
        } else if (id >= MID.POS_CLOCK && id <= MID.POS_M1_CODEC) {
            const pTargets = ['Clock', 'Codec', 'Details', 'M1Title', 'M1Codec'];
            this.#positionAdjustMode = pTargets[id - MID.POS_CLOCK];
        } else if (id === MID.POS_RESET_ALL) {
            this.config.vOffset = 0; this.config.codecOffX = -10; this.config.codecOffY = -20;
            this.config.detailOffX = -10; this.config.detailOffY = -5;
            this.config.m1TitleOffX = -10; this.config.m1TitleOffY = -20;
            this.config.m1CodecOffX = -10; this.config.m1CodecOffY = -5;
            this.#dirtyFlags |= (LcdTimerController.DIRTY.LAYOUT | LcdTimerController.DIRTY.MODE1);
            this.#mode1Cache.invalidate();
        } else if (id === MID.CLOCK_FONT_DIGITAL) {
            this.config.clockFontName = 'Digital';
            this.#dirtyFlags |= LcdTimerController.DIRTY.DIGITS | LcdTimerController.DIRTY.LAYOUT;
            this.#digitSprites.invalidate();
        } else if (id === MID.CLOCK_ITALIC_TOGGLE) {
            this.config.italicSlant = !this.config.italicSlant;
            this.#dirtyFlags |= LcdTimerController.DIRTY.DIGITS | LcdTimerController.DIRTY.LAYOUT;
            this.#digitSprites.invalidate();
        } else if (id === MID.CLOCK_FONT_EXTERNAL) {
            const cur = this.config.clockFontName === 'Digital' ? 'Digital-7 Mono' : this.config.clockFontName;
            const f = GdiUtils.prompt('Clock Font Name (Installed Font):', 'Font Selection', cur);
            if (f?.trim()) { 
                this.config.clockFontName = f.trim(); 
                this.#dirtyFlags |= LcdTimerController.DIRTY.DIGITS | LcdTimerController.DIRTY.LAYOUT;
                this.#digitSprites.invalidate();
            }
        } else if (id === MID.CODEC_FONT_NAME) {
            const f = GdiUtils.prompt('Codec Font Name:', 'Font Selection', this.config.codecFontName);
            if (f?.trim()) { this.config.codecFontName = f.trim(); this.#dirtyFlags |= LcdTimerController.DIRTY.LAYOUT; }
        } else if (id === MID.TECH_FONT_NAME) {
            const f = GdiUtils.prompt('Tech Details Font Name:', 'Font Selection', this.config.techFontName);
            if (f?.trim()) { this.config.techFontName = f.trim(); this.#dirtyFlags |= LcdTimerController.DIRTY.LAYOUT; }
        } else if (id === MID.CLOCK_FONT_SIZE) {
            const s = GdiUtils.prompt('Clock Font Size (pt):', 'Font Size', this.config.clockFontSize);
            if (s) { 
                this.config.clockFontSize = Math.max(8, parseInt(s, 10) || 48); 
                this.#dirtyFlags |= LcdTimerController.DIRTY.DIGITS | LcdTimerController.DIRTY.LAYOUT;
                this.#digitSprites.invalidate();
            }
        } else if (id === MID.CODEC_FONT_SIZE) {
            const s = GdiUtils.prompt('Codec Font Size (pt):', 'Font Size', this.config.codecFontSize);
            if (s) { this.config.codecFontSize = Math.max(8, parseInt(s, 10) || 14); this.#dirtyFlags |= LcdTimerController.DIRTY.LAYOUT; }
        } else if (id === MID.TECH_FONT_SIZE) {
            const s = GdiUtils.prompt('Tech Font Size (pt):', 'Font Size', this.config.techFontSize);
            if (s) { this.config.techFontSize = Math.max(8, parseInt(s, 10) || 14); this.#dirtyFlags |= LcdTimerController.DIRTY.LAYOUT; }
        } else if (id === MID.M1_TEXT_FONT_NAME) {
            const f = GdiUtils.prompt('Mode 1 Text Font Name:', 'Font Selection', this.config.textRowFontName);
            if (f?.trim()) { this.config.textRowFontName = f.trim(); this.#dirtyFlags |= LcdTimerController.DIRTY.LAYOUT; }
        } else if (id === MID.M1_TEXT_FONT_SIZE) {
            const s = GdiUtils.prompt('Mode 1 Text Font Size (pt):', 'Font Size', this.config.textRowFontSize);
            if (s) { this.config.textRowFontSize = Math.max(12, parseInt(s, 10) || 20); this.#dirtyFlags |= LcdTimerController.DIRTY.LAYOUT; }
        } else if (id === MID.M1_CODEC_FONT_SIZE) {
            const s = GdiUtils.prompt('Mode 1 Codec Font Size (pt, 0=auto):', 'Font Size', this.config.m1CodecFontSize);
            if (s !== null && s !== '') { this.config.m1CodecFontSize = Math.max(0, parseInt(s, 10) || 0); this.#dirtyFlags |= LcdTimerController.DIRTY.LAYOUT; }
        } else if (id >= MID.PRESET_LOAD_BASE && id <= MID.PRESET_LOAD_BASE + 2) {
            this.loadPreset((id - MID.PRESET_LOAD_BASE) + 1);
        } else if (id >= MID.PRESET_SAVE_BASE && id <= MID.PRESET_SAVE_BASE + 2) {
            this.savePreset((id - MID.PRESET_SAVE_BASE) + 1);
        } else if (id === MID.RESET_DEFAULTS) {
            this.config = LcdTimerController.sanitizeConfig(LcdTimerController.DEFAULTS);
            this.#positionAdjustMode = null;
            this.#opacityTarget = null;
            this.#dirtyFlags = LcdTimerController.DIRTY.ALL;
            this.#backplate.invalidate();
            this.#digitSprites.invalidate();
            this.#mode1Cache.invalidate();
            this.loadBezel();
            this.startTimers();
        } else if (id === MID.FACTORY_RESET) {
            const confirm = GdiUtils.prompt("Type YES to reset all settings, custom colors and bezel paths to factory defaults:", "Confirm Factory Reset", "");
            if (confirm?.toUpperCase() === 'YES') {
                for (let p = 1; p <= 3; p++) window.SetProperty(`LCD.Preset${p}`, '');
                this.config = LcdTimerController.sanitizeConfig(LcdTimerController.DEFAULTS);
                this.config.bezelFolder = `${this.#profileBase}skins\\overlay`;
                this.config.custBg = GdiUtils.RGB(10, 15, 15);
                this.config.custLcd = GdiUtils.RGB(0, 255, 200);
                this.config.custBorder = GdiUtils.RGB(0, 255, 200);
                this.config.useCustomBorder = false;
                this.#positionAdjustMode = null;
                this.#opacityTarget = null;
                this.#cachedBezelImages = null;
                this.loadBezel();
                this.#dirtyFlags = LcdTimerController.DIRTY.ALL;
                this.#backplate.invalidate();
                this.#digitSprites.invalidate();
                this.#mode1Cache.invalidate();
                this.startTimers();
            }
        }

        this.requestSave();
        window.Repaint();
        return true;
    }

    onColoursChanged() {
        this.#dirtyFlags |= (LcdTimerController.DIRTY.BACKPLATE | LcdTimerController.DIRTY.DIGITS | LcdTimerController.DIRTY.MODE1);
        this.#backplate.invalidate();
        this.#digitSprites.invalidate();
        this.#mode1Cache.invalidate();
        window.Repaint();
    }

    onFontChanged() {
        this.#fonts.clear();
        this.#dirtyFlags = LcdTimerController.DIRTY.ALL;
        this.#digitSprites.invalidate();
        this.#mode1Cache.invalidate();
        window.Repaint();
    }

    onNotifyData(name, info) {
        if (this.#lifecycle !== LcdTimerController.LIFECYCLE.LIVE) return;
        if (name === 'LcdThemeSync' && typeof info === 'string') {
            if (!this.config.syncTheme) return;
            this.setThemeByName(info, false);
        }
    }

    dispose() {
        this.saveAll();
        this.#lifecycle = LcdTimerController.LIFECYCLE.SHUTDOWN;
        this.stopTimers();
        if (this.#saveTimeout)        window.ClearTimeout(this.#saveTimeout);
        if (this.#bezelNotifyTimeout) window.ClearTimeout(this.#bezelNotifyTimeout);

        this.#backplate.dispose();
        this.#digitSprites.dispose();
        this.#mode1Cache.dispose();
        if (this.#bezelBmp) { try { this.#bezelBmp.Dispose(); } catch {} this.#bezelBmp = null; }
        this.#fonts.clear();
    }
}

// ============================================================================================
// 7. SMP GLOBAL HOOKS & DISPATCH
// ============================================================================================
const app = new LcdTimerController();

function on_paint(gr) {
    app.onPaint(gr);
}

function on_size() {
    app.onSize();
}

function on_playback_starting() { 
    app.updateInfo(); 
    app.startTimers(); 
    app.refreshClock(true);
    window.Repaint(); 
}

function on_playback_new_track() { 
    app.updateInfo(); 
    app.startTimers(); 
    app.refreshClock(true);
    window.Repaint(); 
}

function on_playback_stop(reason) { 
    app.stopTimers();
    app.config.modeRemaining = window.GetProperty('LCD.ModeRemaining', false);
    app.updateInfo();
    if (reason !== 2) {
        window.Repaint(); 
    } 
}

function on_playback_pause(status) { 
    app.startTimers();
    if (!status) app.refreshClock(true);
    window.Repaint(); 
}

function on_playback_seek() { 
    app.refreshClock(true);
    window.Repaint(); 
}

function on_playback_time(time) {
    app.refreshClock(false);
}

function on_colours_changed() {
    app.onColoursChanged();
}

function on_font_changed() {
    app.onFontChanged();
}

function on_metadb_changed(handles, fromhook) {
    if (fromhook || (!fb.IsPlaying && !fb.IsPaused)) return;
    try {
        const np = fb.GetNowPlaying();
        if (np && (!handles || handles.Find(np) !== -1)) {
            app.updateInfo();
            window.Repaint();
        }
    } catch {}
}

function on_mouse_wheel(step) {
    return app.onMouseWheel(step);
}

function on_mouse_lbtn_dblclk() {
    app.onLbtnDblClk();
}

function on_mouse_lbtn_up() {
    app.onLbtnUp();
}

function on_mouse_rbtn_up(x, y, mask) {
    if (mask & 4) return false;
    return app.showContextMenu(x, y);
}

function on_key_down(vkey) {
    return app.onKeyDown(vkey);
}

function on_notify_data(name, info) {
    app.onNotifyData(name, info);
}

function on_script_unload() {
    app.dispose();
}

// Initialize Controller
app.init();