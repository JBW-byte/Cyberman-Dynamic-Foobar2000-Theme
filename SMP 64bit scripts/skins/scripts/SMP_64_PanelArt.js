'use strict';

           // ============== AUTHOR L.E.D. ============== \\
          // ==-== Panel Artwork and Trackinfo v4.1  ==-== \\
         // ====== Staged Resize Pipeline + Full Blur ===== \\

  // ===================*** Foobar2000 64bit ***================== \\
 // ======= For Spider Monkey Panel 64bit, author: marc2003 ======= \\
// === SMP 64bit script samples StackBlur+Panel, author:marc2003 === \\

/* 
 * Custom License for foobar2000 Themes
 * Copyright (c) 2026 [L.E.D.]
 * Allowed: Non-commercial use and modification.
 * Prohibited: Paid products/themes, subscriptions, or cloud-bundled services.
 */

window.DefineScript('SMP 64bit PanelArt', { 
    author: 'L.E.D.', 
    version: '4.1',
    features: { grab_focus: true } 
});

window.DrawMode = 0; // 0 = GDI+, 1 = Direct2D
window.DlgCode = 0x0004; // DLGC_WANTALLKEYS: Captures arrow keys and modifier shortcuts

// ============================================================================================
// 1. HELPERS & MATH UTILITIES
// ============================================================================================
class GdiUtils {
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

    static blendWithWhite(col, ratio) {
        const r = Math.floor(((col >>> 16) & 255) + (255 - ((col >>> 16) & 255)) * ratio);
        const g = Math.floor(((col >>> 8) & 255) + (255 - ((col >>> 8) & 255)) * ratio);
        const b = Math.floor((col & 255) + (255 - (col & 255)) * ratio);
        return this.RGB(r, g, b);
    }

    static sanitizePath(str) {
        if (!str || typeof str !== 'string') return '';
        const clean = str.replace(/^["']+|["']+$/g, '').trim();
        if (/^[a-zA-Z]:[\\\/]?$/.test(clean)) return clean.substring(0, 2) + '\\';
        if (/^\\\\[^\\]+\\[^\\]+[\\\/]?$/.test(clean)) return clean.replace(/[\\\/]+$/, '') + '\\';
        return clean.replace(/[\/\\]+$/, '');
    }

    static normalize(str) {
        if (!str) return '';
        return str.toLowerCase()
            .replace(/[\(\[\{][^\)\]\}]*[\)\]\}]/g, ' ')
            .replace(/[\/\\:*?"<>|\-_.,;!+=&^%$#@~`]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
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

// ============================================================================================
// 2. FONT MANAGEMENT (LRU CACHED WITH DEFENSIVE DISPOSAL)
// ============================================================================================
class FontRegistry {
    #cache = new Map();
    #maxSize;

    constructor(maxSize = 150) {
        this.#maxSize = maxSize;
    }

    get(name, size, style = 0) {
        const s = Math.max(4, Math.round(size));
        const fontName = (typeof name === 'string' && name.trim().length > 0) ? name : 'Segoe UI';
        const key = `${fontName}_${s}_${style}`;

        let f = this.#cache.get(key);
        if (!f) {
            try {
                f = gdi.Font(fontName, s, style);
            } catch {
                f = gdi.Font('Segoe UI', s, style);
            }
            this.#cache.set(key, f);
            if (this.#cache.size > this.#maxSize) {
                const oldestKey = this.#cache.keys().next().value;
                const evicted = this.#cache.get(oldestKey);
                if (evicted && typeof evicted.Dispose === 'function') {
                    try { evicted.Dispose(); } catch {}
                }
                this.#cache.delete(oldestKey);
            }
        }
        return f;
    }

    fitSize(gr, text, fontName, fontStyle, maxW, maxH, startSize, minSize = 8) {
        const minBound = Math.max(4, Math.round(minSize));
        let low = minBound;
        let high = Math.max(minBound, Math.round(startSize));
        let best = minBound;
        const testText = text && text.trim().length > 0 ? text : 'Sample Text';

        while (low <= high) {
            const mid = (low + high) >>> 1;
            const font = this.get(fontName, mid, fontStyle);
            const m = gr.MeasureString(testText, font, 0, 0, 10000, 10000);
            if (m.Width <= maxW && m.Height <= maxH) {
                best = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        return Math.max(minBound, best);
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
// 3. ARTWORK DISCOVERY & FILE CACHE (STRICT POSITIVE CACHE ONLY)
// ============================================================================================
class ArtScanner {
    static EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.bmp'];
    static FAST_NAMES = ['cover', 'front', 'folder', 'albumart'];
    static BLACKLIST  = ['back', 'rear', 'tray', 'inlay', 'booklet', 'case', 'matrix', 'spine', 'inside', 'digipak'];
    static DISC_REGEX = /^(?:cd|disc|disk|side|vinyl|disque|vol|part|volume)[\s_.\-]*\d+$/i;
    static ART_SUBDIRS = ['artwork', 'scans', 'art', 'covers', 'cover', 'images', 'scan', 'disc', 'discs', 'extra', 'extras', 'cd1', 'cd2', 'disc1', 'disc2'];

    #subfolderCache = new Map();
    #dirScanCache   = new Map();
    #artPathCache   = new Map();

    clearCaches() {
        this.#subfolderCache.clear();
        this.#dirScanCache.clear();
        this.#artPathCache.clear();
    }

    getArtworkIdentityKey(trackDir, album, disc) {
        return `${trackDir || ''}|${(album || '').trim().toLowerCase()}|${(disc || '').trim().toLowerCase()}`;
    }

    getArtFromMemoryCache(key) {
        if (!this.#artPathCache.has(key)) return null;
        const cachedPath = this.#artPathCache.get(key);
        if (cachedPath && utils.IsFile(cachedPath)) return cachedPath;
        this.#artPathCache.delete(key);
        return null;
    }

    setArtMemoryCache(key, path) {
        if (!path) return;
        if (this.#artPathCache.size > 500) {
            this.#artPathCache.delete(this.#artPathCache.keys().next().value);
        }
        this.#artPathCache.set(key, path);
    }

    getSubfolders(dirPath) {
        if (!dirPath || !utils.IsDirectory(dirPath)) return [];
        if (this.#subfolderCache.has(dirPath)) return this.#subfolderCache.get(dirPath);

        const sep = dirPath.endsWith('\\') ? '' : '\\';
        try {
            const items = utils.Glob(`${dirPath}${sep}*`, 0);
            if (!Array.isArray(items)) return [];
            const dirs = [];
            for (let i = 0; i < items.length; i++) {
                const name = items[i].substring(items[i].lastIndexOf('\\') + 1);
                if (name === '.' || name === '..') continue;
                if (utils.IsDirectory(items[i])) dirs.push(items[i]);
            }
            if (this.#subfolderCache.size > 200) {
                this.#subfolderCache.delete(this.#subfolderCache.keys().next().value);
            }
            this.#subfolderCache.set(dirPath, dirs);
            return dirs;
        } catch {
            return [];
        }
    }

    getFolderImagesList(dirPath) {
        if (!dirPath || !utils.IsDirectory(dirPath)) return [];
        if (this.#dirScanCache.has(dirPath)) return this.#dirScanCache.get(dirPath);

        const sep = dirPath.endsWith('\\') ? '' : '\\';
        try {
            const files = utils.Glob(`${dirPath}${sep}*.*`);
            if (!Array.isArray(files)) return [];
            const result = [];
            for (let i = 0; i < files.length; i++) {
                const dot = files[i].lastIndexOf('.');
                if (dot === -1) continue;
                const ext = files[i].substring(dot).toLowerCase();
                if (ArtScanner.EXTENSIONS.includes(ext)) {
                    result.push({
                        path: files[i],
                        name: files[i].substring(files[i].lastIndexOf('\\') + 1, dot).toLowerCase()
                    });
                }
            }
            if (this.#dirScanCache.size > 100) {
                this.#dirScanCache.delete(this.#dirScanCache.keys().next().value);
            }
            this.#dirScanCache.set(dirPath, result);
            return result;
        } catch {
            return [];
        }
    }

    getFastCover(dirPath) {
        if (!dirPath || !utils.IsDirectory(dirPath)) return null;
        const sep = dirPath.endsWith('\\') ? '' : '\\';
        for (const name of ArtScanner.FAST_NAMES) {
            for (const ext of ArtScanner.EXTENSIONS) {
                const p = `${dirPath}${sep}${name}${ext}`;
                if (utils.IsFile(p)) return p;
            }
        }
        return null;
    }

    inspectScoredImages(dirPath, specificPatterns) {
        const images = this.getFolderImagesList(dirPath);
        if (images.length === 0) return { bestMatch: null, fallbackImage: null };

        let bestMatch = null;
        let highestScore = -1;
        let bestFallback = null;

        const lowerSpecs = specificPatterns?.map(p => p.toLowerCase().trim()).filter(Boolean) ?? [];

        for (const img of images) {
            let score = 0;
            if (ArtScanner.FAST_NAMES.includes(img.name)) {
                score = 100;
            } else if (lowerSpecs.includes(img.name)) {
                score = 80;
            } else if (img.name.startsWith('cover') || img.name.startsWith('front') || img.name.startsWith('folder')) {
                score = 60;
            } else if (lowerSpecs.some(spec => img.name.startsWith(spec))) {
                score = 50;
            } else {
                const blacklisted = ArtScanner.BLACKLIST.some(kw => img.name.includes(kw));
                if (!blacklisted && !bestFallback) bestFallback = img.path;
                score = blacklisted ? 5 : 20;
            }

            if (score > highestScore) {
                highestScore = score;
                bestMatch = img.path;
            }
        }

        return {
            bestMatch: (highestScore >= 50) ? bestMatch : null,
            fallbackImage: bestFallback
        };
    }

    searchDirectory(dirPath, specificCover, allowFallback = true, isRootCustom = false, maxDepth = 2, _depth = 0) {
        if (!dirPath || !utils.IsDirectory(dirPath)) return null;

        const inspect = this.inspectScoredImages(dirPath, specificCover);
        if (inspect.bestMatch) return inspect.bestMatch;
        if (isRootCustom && _depth === 0) return null;

        if (_depth < maxDepth) {
            const subDirs = this.getSubfolders(dirPath);
            for (const sub of subDirs) {
                const name = sub.substring(sub.lastIndexOf('\\') + 1).toLowerCase().trim();
                if (ArtScanner.ART_SUBDIRS.includes(name) || ArtScanner.DISC_REGEX.test(name)) {
                    const found = this.searchDirectory(sub, specificCover, allowFallback, false, maxDepth, _depth + 1);
                    if (found) return found;
                }
            }
            if (subDirs.length <= 60 && _depth < 1) {
                for (const sub of subDirs) {
                    const name = sub.substring(sub.lastIndexOf('\\') + 1).toLowerCase().trim();
                    if (!ArtScanner.ART_SUBDIRS.includes(name) && !ArtScanner.DISC_REGEX.test(name)) {
                        const found = this.searchDirectory(sub, specificCover, false, false, maxDepth, _depth + 1);
                        if (found) return found;
                    }
                }
            }
        }
        return allowFallback ? inspect.fallbackImage : null;
    }

    findInCustomFolder(cFolder, artistVariants, albumVariants, folderVariants, specificCover, maxDepth) {
        const sep = cFolder.endsWith('\\') ? '' : '\\';
        const candidateSubfolders = [];

        for (const art of artistVariants) {
            for (const alb of albumVariants) {
                candidateSubfolders.push(`${cFolder}${sep}${art} - ${alb}`, `${cFolder}${sep}${art}\\${alb}`, `${cFolder}${sep}${art}_${alb}`, `${cFolder}${sep}${art} ${alb}`);
            }
        }
        for (const art of artistVariants) candidateSubfolders.push(`${cFolder}${sep}${art}`);
        for (const alb of albumVariants) candidateSubfolders.push(`${cFolder}${sep}${alb}`);
        for (const f of folderVariants) candidateSubfolders.push(`${cFolder}${sep}${f}`);

        for (const subDir of Array.from(new Set(candidateSubfolders))) {
            if (utils.IsDirectory(subDir)) {
                const found = this.searchDirectory(subDir, specificCover, true, false, maxDepth);
                if (found) return found;
            }
        }

        if (specificCover?.length) {
            const rootRes = this.searchDirectory(cFolder, specificCover, false, true, maxDepth);
            if (rootRes) return rootRes;
        }

        const matchTargets = [];
        for (const art of artistVariants) {
            for (const alb of albumVariants) {
                matchTargets.push(`${art} - ${alb}`, `${art}_${alb}`, `${art} ${alb}`, `${alb} - ${art}`);
            }
        }
        matchTargets.push(...albumVariants, ...artistVariants);

        let foundPath = null;
        const scanStart = Date.now();

        const scanLevel = (dir, depth) => {
            if (depth > maxDepth || !utils.IsDirectory(dir) || foundPath) return;
            if (Date.now() - scanStart > 35) return;

            const subs = this.getSubfolders(dir);
            if (!subs?.length) return;
            const limit = Math.min(subs.length, 120);

            for (let i = 0; i < limit; i++) {
                const fName = subs[i].substring(subs[i].lastIndexOf('\\') + 1);
                if (this.#matchesList(fName, matchTargets) || this.#matchesList(fName, artistVariants)) {
                    foundPath = this.searchDirectory(subs[i], specificCover, true, false, maxDepth);
                    if (foundPath) return;

                    const aSubs = this.getSubfolders(subs[i]);
                    const aLimit = Math.min(aSubs.length, 60);
                    for (let j = 0; j < aLimit; j++) {
                        const aName = aSubs[j].substring(aSubs[j].lastIndexOf('\\') + 1);
                        if (this.#matchesList(aName, matchTargets) || this.#matchesList(aName, albumVariants)) {
                            foundPath = this.searchDirectory(aSubs[j], specificCover, true, false, maxDepth);
                            if (foundPath) return;
                        }
                    }
                }
            }

            if (depth < maxDepth && subs.length <= 60) {
                for (const sub of subs) {
                    const fName = sub.substring(sub.lastIndexOf('\\') + 1).toLowerCase();
                    if (!ArtScanner.ART_SUBDIRS.includes(fName)) {
                        scanLevel(sub, depth + 1);
                        if (foundPath) return;
                    }
                }
            }
        };

        scanLevel(cFolder, 1);
        return foundPath;
    }

    #matchesList(folderName, variants) {
        if (!folderName || !variants?.length) return false;
        return variants.some(v => this.#isNameMatch(folderName, v));
    }

    #isNameMatch(folderName, targetName) {
        if (!folderName || !targetName) return false;
        const fRaw = folderName.toLowerCase().trim();
        const tRaw = targetName.toLowerCase().trim();
        if (fRaw === tRaw) return true;

        const f = GdiUtils.normalize(folderName);
        const t = GdiUtils.normalize(targetName);
        if (!f || !t) return false;
        if (f === t) return true;

        if (f.startsWith(`${t} `) || f.endsWith(` ${t}`) || f.includes(` ${t} `)) return true;
        if (t.startsWith(`${f} `) || t.endsWith(` ${f}`) || (t.length >= 3 && f.includes(t)) || (f.length >= 3 && t.includes(f))) return true;

        return false;
    }

    cleanVariants(str) {
        if (!str || !str.trim()) return [];
        const base = str.trim();
        const set = new Set([base]);

        try {
            const cleanUnder = utils.ReplaceIllegalChars(base, true)?.trim();
            if (cleanUnder) set.add(cleanUnder);
        } catch {}

        const cleanDash = base.replace(/[\/\\:*?"<>|]/g, '-').trim();
        if (cleanDash) set.add(cleanDash);

        const cleanSpace = base.replace(/[\/\\:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
        if (cleanSpace) set.add(cleanSpace);

        const cleanNone = base.replace(/[\/\\:*?"<>|]/g, '').trim();
        if (cleanNone) set.add(cleanNone);

        const noParen = base.replace(/\s*[\(\[\{][^\)\]\}]*[\)\]\}]\s*/g, ' ').trim();
        if (noParen && noParen !== base) {
            set.add(noParen);
            try {
                const noParenClean = utils.ReplaceIllegalChars(noParen, true)?.trim();
                if (noParenClean) set.add(noParenClean);
            } catch {}
        }
        return Array.from(set).filter(Boolean);
    }
}

// ============================================================================================
// 4. OVERLAY & BACKDROP ENGINE
// ============================================================================================
class VisualBackdrop {
    #bgBlurredBmp = null;
    #bgCacheBmp   = null;
    #overlayBmp   = null;
    #glowBmp      = null;
    #glowSize     = 0;
    #glowOp       = 0;
    #lastBlurSrc  = null;
    #lastBlurRad  = -1;

    static #disposeBmp(bmp) {
        if (bmp) {
            try { bmp.Dispose(); } catch {}
        }
        return null;
    }

    rebuildBlur(activeImg, w, h, enabled, blurRadius, useUIColor) {
        if (!enabled || useUIColor || !activeImg || w <= 0 || h <= 0) {
            this.#bgBlurredBmp = VisualBackdrop.#disposeBmp(this.#bgBlurredBmp);
            this.#lastBlurSrc = null;
            this.#lastBlurRad = -1;
            return;
        }

        const blurR = GdiUtils.clamp(blurRadius, 0, 254);
        if (blurR <= 0) {
            if (this.#bgBlurredBmp && this.#lastBlurSrc === activeImg && this.#lastBlurRad === -1) return;
            this.#bgBlurredBmp = VisualBackdrop.#disposeBmp(this.#bgBlurredBmp);
            try {
                this.#bgBlurredBmp = activeImg.Clone(0, 0, activeImg.Width, activeImg.Height);
            } catch {
                this.#bgBlurredBmp = null;
            }
            this.#lastBlurSrc = activeImg;
            this.#lastBlurRad = -1;
            return;
        }

        if (this.#bgBlurredBmp && this.#lastBlurSrc === activeImg && this.#lastBlurRad === blurR) return;

        let thumb = null, g = null;
        try {
            const scale = blurR > 60 ? 4 : (blurR > 20 ? 2 : 1);
            const tw = Math.max(32, Math.floor(w / scale));
            const th = Math.max(32, Math.floor(h / scale));

            thumb = gdi.CreateImage(tw, th);
            g = thumb.GetGraphics();
            g.SetInterpolationMode(0);
            g.DrawImage(activeImg, 0, 0, tw, th, 0, 0, activeImg.Width, activeImg.Height);
            thumb.ReleaseGraphics(g);
            g = null;

            const maxSafeRadius = Math.max(1, Math.min(Math.floor(tw / 2) - 1, Math.floor(th / 2) - 1));
            const effectiveRadius = GdiUtils.clamp(Math.round(blurR / scale), 1, Math.min(120, maxSafeRadius));
            thumb.StackBlur(effectiveRadius);

            this.#bgBlurredBmp = VisualBackdrop.#disposeBmp(this.#bgBlurredBmp);
            this.#bgBlurredBmp = thumb;
            this.#lastBlurSrc = activeImg;
            this.#lastBlurRad = blurR;
        } catch {
            if (g && thumb) { try { thumb.ReleaseGraphics(g); } catch {} }
            if (thumb) { try { thumb.Dispose(); } catch {} }
            this.#bgBlurredBmp = null;
        }
    }

    rebuildCache(w, h, useUIColor, customBgColor, bgEnabled, darkenPct, uiColour) {
        this.#bgCacheBmp = VisualBackdrop.#disposeBmp(this.#bgCacheBmp);
        if (w <= 0 || h <= 0) return;

        let bmp = null, g = null;
        try {
            bmp = gdi.CreateImage(w, h);
            g = bmp.GetGraphics();

            if (useUIColor) {
                g.FillSolidRect(0, 0, w, h, uiColour);
            } else {
                g.FillSolidRect(0, 0, w, h, customBgColor >>> 0);
                if (bgEnabled && this.#bgBlurredBmp) {
                    g.SetInterpolationMode(2);
                    g.DrawImage(this.#bgBlurredBmp, 0, 0, w, h, 0, 0, this.#bgBlurredBmp.Width, this.#bgBlurredBmp.Height);
                }
                if (darkenPct > 0 && this.#bgBlurredBmp) {
                    g.FillSolidRect(0, 0, w, h, GdiUtils.setAlpha(GdiUtils.RGB(0, 0, 0), Math.floor(darkenPct * 2.55)));
                }
            }
            bmp.ReleaseGraphics(g);
            this.#bgCacheBmp = bmp;
        } catch {
            if (g && bmp) { try { bmp.ReleaseGraphics(g); } catch {} }
            if (bmp) { try { bmp.Dispose(); } catch {} }
            this.#bgCacheBmp = null;
        }
    }

    rebuildOverlay(w, h, config, bezelImg, dpiScale) {
        this.#overlayBmp = VisualBackdrop.#disposeBmp(this.#overlayBmp);
        if (w <= 0 || h <= 0) return;

        let bmp = null, g = null;
        try {
            bmp = gdi.CreateImage(w, h);
            g = bmp.GetGraphics();

            if (config.showPhosphor && config.opPhosphor > 0 && !config.overlayAllOff) {
                const blended = GdiUtils.blendWithWhite(config.phosphorColor, 0.25);
                g.FillSolidRect(0, 0, w, h, GdiUtils.setAlpha(blended, Math.floor(config.opPhosphor * 0.3)));
            }

            if (config.showScanlines && config.opScanlines > 0 && !config.overlayAllOff) {
                const scanCol = GdiUtils.setAlpha(GdiUtils.RGB(0, 0, 0), config.opScanlines);
                const lineH = Math.max(1, Math.round(1 * dpiScale));
                const stepH = Math.max(2, Math.round(3 * dpiScale));
                for (let y = 0; y < h; y += stepH) {
                    g.FillSolidRect(0, y, w, lineH, scanCol);
                }
            }

            if (config.showReflection && config.opReflection > 0 && !config.overlayAllOff) {
                const reflH = Math.floor(h * 0.45);
                for (let y = 0; y < reflH; y++) {
                    const t = 1 - (y / reflH);
                    const a = Math.floor(config.opReflection * (t * t * (3 - 2 * t)) * 0.4);
                    if (a > 0) g.FillSolidRect(0, y, w, 1, GdiUtils.setAlpha(GdiUtils.RGB(255, 255, 255), a));
                }
            }

            const b = Math.round(config.borderSize * dpiScale);
            if (b > 0) {
                const col = config.borderColor >>> 0;
                g.FillSolidRect(0, 0, w, b, col);
                g.FillSolidRect(0, h - b, w, b, col);
                const sideH = Math.max(0, h - b * 2);
                if (sideH > 0) {
                    g.FillSolidRect(0, b, b, sideH, col);
                    g.FillSolidRect(w - b, b, b, sideH, col);
                }
            }

            if (config.bezelEnabled && bezelImg) {
                g.SetInterpolationMode(7);
                g.DrawImage(bezelImg, 0, 0, w, h, 0, 0, bezelImg.Width, bezelImg.Height);
            }

            bmp.ReleaseGraphics(g);
            this.#overlayBmp = bmp;
        } catch {
            if (g && bmp) { try { bmp.ReleaseGraphics(g); } catch {} }
            if (bmp) { try { bmp.Dispose(); } catch {} }
            this.#overlayBmp = null;
        }
    }

    checkGlow(w, h, showGlow, opGlow, overlayAllOff) {
        if (!showGlow || opGlow <= 0 || overlayAllOff || w <= 0 || h <= 0) {
            this.#glowBmp = VisualBackdrop.#disposeBmp(this.#glowBmp);
            this.#glowSize = 0;
            this.#glowOp = 0;
            return;
        }

        const maxR = Math.max(w, h) * 0.7;
        const sz = Math.ceil(maxR * 2);
        if (this.#glowBmp && this.#glowSize === sz && this.#glowOp === opGlow) return;

        this.#glowBmp = VisualBackdrop.#disposeBmp(this.#glowBmp);
        try {
            const bmp = gdi.CreateImage(sz, sz);
            const g = bmp.GetGraphics();
            const center = sz / 2;
            for (let i = 1; i <= 6; i++) {
                const a = Math.floor(opGlow * (1 - i / 6) * 0.2);
                const r = maxR * (i / 6);
                g.FillEllipse(center - r, center - r, r * 2, r * 2, GdiUtils.setAlpha(GdiUtils.RGB(255, 255, 255), a));
            }
            bmp.ReleaseGraphics(g);
            this.#glowBmp = bmp;
            this.#glowSize = sz;
            this.#glowOp = opGlow;
        } catch {
            this.#glowBmp = null;
        }
    }

    get cacheBmp()   { return this.#bgCacheBmp; }
    get overlayBmp() { return this.#overlayBmp; }
    get glowBmp()    { return this.#glowBmp; }
    get glowSize()   { return this.#glowSize; }

    dispose() {
        this.#bgBlurredBmp = VisualBackdrop.#disposeBmp(this.#bgBlurredBmp);
        this.#bgCacheBmp   = VisualBackdrop.#disposeBmp(this.#bgCacheBmp);
        this.#overlayBmp   = VisualBackdrop.#disposeBmp(this.#overlayBmp);
        this.#glowBmp      = VisualBackdrop.#disposeBmp(this.#glowBmp);
        this.#lastBlurSrc  = null;
        this.#lastBlurRad  = -1;
    }
}

// ============================================================================================
// 5. MAIN CONTROLLER & APPLICATION ENGINE
// ============================================================================================
class PanelArtController {
    static LIFECYCLE = { BOOT: 0, INIT: 1, LIVE: 2, SHUTDOWN: 3 };
    static VALID_FLOATS = ['left', 'right', 'top', 'bottom', 'stretch'];
    static BEZEL_EXTS = ['.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp'];

    static DIRTY = {
        NONE:       0,
        BACKGROUND: 1 << 0,
        OVERLAY:    1 << 1,
        LAYOUT:     1 << 2,
        TEXT:       1 << 3,
        ALL:        ~0
    };

    static PERSISTED_KEYS = [
        'albumArtEnabled', 'albumArtFloat', 'albumArtPadding', 'padLeft', 'padRight',
        'padTop', 'padBottom', 'borderSize', 'borderColor', 'customFolderDepth',
        'backgroundEnabled', 'blurEnabled', 'blurRadius', 'darkenValue', 'customBgColor',
        'bgUseUIColor', 'showReflection', 'opReflection', 'showGlow', 'opGlow',
        'showScanlines', 'opScanlines', 'showPhosphor', 'opPhosphor', 'phosphorTheme',
        'customPhosphorColor', 'overlayAllOff', 'layoutAlignV', 'layoutAlignH',
        'textShadowEnabled', 'extraInfoEnabled', 'glitchEnabled', 'titleFontName',
        'titleFontSize', 'artistFontName', 'artistFontSize', 'extraFontName',
        'extraFontSize', 'imageFolder', 'bezelFolder', 'bezelEnabled', 'bezelFile',
        'imageMode', 'slideMode'
    ];

    static MENU_ID = {
        BEZEL_ENABLE:        970,
        BEZEL_FOLDER:        972,
        BEZEL_RELOAD:        973,
        BEZEL_NONE:          975,
        BEZEL_BASE:          976,
        PHOSPHOR_THEME_BASE: 600,
        OVERLAY_ALL_OFF:     199,
        SHOW_REFLECTION:     200,
        SHOW_GLOW:           210,
        SHOW_SCANLINES:      220,
        SHOW_PHOSPHOR:       230,
        OPACITY_REFL:        201,
        OPACITY_GLOW:        211,
        OPACITY_SCAN:        221,
        OPACITY_PHOS:        231,
        ALBUM_ART_ENABLE:    800,
        FLOAT_BASE:          801,
        ART_PADDING:         806,
        ALIGN_H_LEFT:        563,
        ALIGN_H_CENTER:      564,
        ALIGN_H_RIGHT:       565,
        ALIGN_V_CENTER:      560,
        ALIGN_V_BOTTOM:      561,
        ALIGN_V_TOP:         562,
        TEXT_SHADOW:         570,
        EXTRA_INFO:          571,
        FONT_TITLE:          540,
        FONT_ARTIST:         541,
        FONT_EXTRA:          542,
        BORDER_SIZE:         250,
        BORDER_COLOR:        251,
        PAD_LEFT:            252,
        PAD_RIGHT:           253,
        PAD_TOP:             254,
        PAD_BOTTOM:          255,
        BG_USE_UI_COLOR:     263,
        BG_ENABLE:           260,
        BG_BLUR_ENABLE:      270,
        BG_CUSTOM_COLOR:     261,
        BLUR_RADIUS_BASE:    271,
        DARKEN_BASE:         290,
        CUSTOM_FOLDER_ADD:   50,
        FOLDER_DEPTH_BASE:   51,
        CLEAR_CUSTOM_FOLDERS:2000,
        REMOVE_FOLDER_BASE:  2100,
        IMAGE_FOLDER_SET:    950,
        SHOW_SINGLE_IMAGE:   951,
        SLIDE_SHOW:          952,
        PRESET_LOAD_BASE:    301,
        PRESET_SAVE_BASE:    401,
        GLITCH_ENABLE:       545,
        RELOAD_ART:          900,
        RESET_DEFAULTS:      5000,
        FACTORY_RESET:       5001
    };

    static PHOSPHOR_THEMES = [
        { name: 'Classic', color: GdiUtils.RGB(0, 255, 0) },
        { name: 'Neo',     color: GdiUtils.RGB(0, 255, 255) },
        { name: 'Dark',    color: GdiUtils.RGB(0, 200, 0) },
        { name: 'Bright',  color: GdiUtils.RGB(255, 255, 0) },
        { name: 'Retro',   color: GdiUtils.RGB(0, 255, 100) },
        { name: 'Minimal', color: GdiUtils.RGB(0, 180, 0) },
        { name: 'Matrix',  color: GdiUtils.RGB(0, 255, 50) },
        { name: 'Vapor',   color: GdiUtils.RGB(255, 180, 255) },
        { name: 'Cyber',   color: GdiUtils.RGB(0, 255, 255) },
        { name: 'Magenta', color: GdiUtils.RGB(255, 0, 255) }
    ];

    static GLITCH_CHROMA = GdiUtils.RGB(220, 225, 230);
    static GLITCH_SHIFT_COLORS = [
        GdiUtils.RGB(100, 200, 255), GdiUtils.RGB(180, 200, 230),
        GdiUtils.RGB(150, 255, 150), GdiUtils.RGB(255, 255, 100),
        GdiUtils.RGB(255, 100, 100)
    ];
    static GLITCH_SLICE_COLORS = [
        GdiUtils.RGB(100, 180, 255), GdiUtils.RGB(180, 200, 230),
        GdiUtils.RGB(200, 210, 220), GdiUtils.RGB(120, 160, 220),
        GdiUtils.RGB(150, 255, 150), GdiUtils.RGB(255, 255, 100),
        GdiUtils.RGB(255, 100, 100)
    ];
    static GLITCH_TINT_COLORS = [
        GdiUtils.RGB(100, 180, 255), GdiUtils.RGB(180, 200, 230),
        GdiUtils.RGB(200, 210, 220), GdiUtils.RGB(150, 170, 210),
        GdiUtils.RGB(100, 255, 100), GdiUtils.RGB(255, 255, 100),
        GdiUtils.RGB(255, 100, 100)
    ];
    static GLITCH_BLOCK_COLORS = [
        GdiUtils.RGB(0x64, 0xB4, 0xFF), GdiUtils.RGB(0xB4, 0xC8, 0xE6),
        GdiUtils.RGB(0xD2, 0xDA, 0xE6), GdiUtils.RGB(0x78, 0x88, 0xB8),
        GdiUtils.RGB(0xA0, 0xB0, 0xC8), GdiUtils.RGB(0xC8, 0xD0, 0xE0),
        GdiUtils.RGB(0x50, 0xFF, 0x50), GdiUtils.RGB(0xFF, 0xFF, 0x50),
        GdiUtils.RGB(0xFF, 0x50, 0x50)
    ];

    #lifecycle = PanelArtController.LIFECYCLE.BOOT;
    #dpiScale  = 1;
    #dirtyFlags = PanelArtController.DIRTY.ALL;

    // Unified Generation Architecture: Completely eliminates race conditions
    #artGenerationToken = 0;
    #pendingSearchTimer = null;
    #glitchTimer        = null;
    #slideTimer         = null;
    #saveTimeout        = null;
    #bezelNotifyTimeout = null;

    #fonts    = new FontRegistry(150);
    #scanner  = new ArtScanner();
    #backdrop = new VisualBackdrop();

    #coverImg = null;
    #modeImg  = null;
    #bezelBmp = null;
    #hudFont  = null;

    #currentCoverPath  = '';
    #currentTrackPath  = '';
    #currentArtKey     = '';
    #profileBase       = '';
    #customFolders     = [];
    #bezelNotifyText   = '';
    #opacityTarget     = null;
    #cachedBezelImages = null;
    #cachedBezelFolder = null;
    #slideImages       = null;

    #glitchFrame    = 0;
    #glitchBlackout = false;

    #textBlockBmp = null;
    #textBlockX   = 0;
    #textBlockY   = 0;
    #textBlockW   = 0;
    #textBlockH   = 0;

    #compoundTf = fb.TitleFormat('$directory_path(%path%)\x01%artist%\x01%album%\x01$directory(%path%)\x01%title%\x01%date%\x01%length%\x01%album artist%\x01%discnumber%');

    #trackInfo = { title: 'No track playing', artist: '', extra: '' };
    #layout = {
        artRect: { x: 0, y: 0, w: 0, h: 0 }
    };

    config = {
        albumArtEnabled: true,
        albumArtFloat: 'left',
        albumArtPadding: 0,
        padLeft: 10,
        padRight: 10,
        padTop: 10,
        padBottom: 10,
        borderSize: 10,
        borderColor: GdiUtils.RGB(32, 32, 32),
        customFolderDepth: 2,
        backgroundEnabled: true,
        blurEnabled: true,
        blurRadius: 240,
        darkenValue: 10,
        customBgColor: GdiUtils.RGB(25, 25, 25),
        bgUseUIColor: false,
        showReflection: true,
        opReflection: 25,
        showGlow: false,
        opGlow: 80,
        showScanlines: false,
        opScanlines: 100,
        showPhosphor: true,
        opPhosphor: 20,
        phosphorTheme: 8,
        customPhosphorColor: 0xFFFFFFFF,
        overlayAllOff: false,
        layoutAlignV: 0,
        layoutAlignH: 1,
        textShadowEnabled: true,
        extraInfoEnabled: true,
        glitchEnabled: true,
        titleFontName: 'Segoe UI',
        titleFontSize: 42,
        artistFontName: 'Segoe UI',
        artistFontSize: 28,
        extraFontName: 'Segoe UI',
        extraFontSize: 20,
        imageFolder: '',
        imageMode: false,
        slideMode: false,
        bezelFolder: '',
        bezelEnabled: false,
        bezelFile: ''
    };

    constructor() {
        const sysDpi = (typeof window.DPI === 'number' && window.DPI > 0) ? window.DPI : 96;
        this.#dpiScale = sysDpi / 96;

        let p = fb.ProfilePath || '';
        if (p && !p.endsWith('\\') && !p.endsWith('/')) p += '\\';
        this.#profileBase = p;

        this.#loadProperties();
        this.#loadCustomFolders();
    }

    scale(size) {
        return Math.round(size * this.#dpiScale);
    }

    init() {
        // Stage 1: Explicit Initialization Stage
        this.#lifecycle = PanelArtController.LIFECYCLE.INIT;
        this.loadBezel();
        this.#rebuildOverlay();

        // Stage 2: Promoted to LIVE before scheduling async work
        this.#lifecycle = PanelArtController.LIFECYCLE.LIVE;
        window.Repaint();

        // Stage 3: Post-paint yield: Start runtime services safely
        window.SetTimeout(() => {
            if (this.#lifecycle !== PanelArtController.LIFECYCLE.LIVE) return;
            if (this.config.slideMode) {
                this.startSlideMode(false);
            } else if (this.config.imageMode) {
                this.startImageMode(false);
            } else {
                try {
                    if (fb.IsPlaying) this.loadArtworkForTrack(fb.GetNowPlaying());
                    else this.clearTrackDisplay();
                } catch {
                    this.clearTrackDisplay();
                }
            }
        }, 0);
    }

    #loadProperties() {
        const cfg = this.config;
        cfg.albumArtEnabled     = window.GetProperty('PA.AlbumArtEnabled', true);
        const floatProp         = window.GetProperty('PA.AlbumArtFloat', 'left');
        cfg.albumArtFloat       = PanelArtController.VALID_FLOATS.includes(floatProp) ? floatProp : 'left';
        cfg.albumArtPadding     = GdiUtils.clamp(window.GetProperty('PA.AlbumArtPadding', 0), 0, 100);
        cfg.padLeft             = GdiUtils.clamp(window.GetProperty('PA.PadLeft', 10), 0, 100);
        cfg.padRight            = GdiUtils.clamp(window.GetProperty('PA.PadRight', 10), 0, 100);
        cfg.padTop              = GdiUtils.clamp(window.GetProperty('PA.PadTop', 10), 0, 100);
        cfg.padBottom           = GdiUtils.clamp(window.GetProperty('PA.PadBottom', 10), 0, 100);
        cfg.borderSize          = GdiUtils.clamp(window.GetProperty('PA.BorderSize', 10), 0, 50);
        cfg.borderColor         = window.GetProperty('PA.BorderColor', GdiUtils.RGB(32, 32, 32));
        cfg.customFolderDepth   = GdiUtils.clamp(window.GetProperty('PA.CustomFolderDepth', 2), 1, 4);

        cfg.backgroundEnabled   = window.GetProperty('PA.BackgroundEnabled', true);
        cfg.blurEnabled         = window.GetProperty('PA.BlurEnabled', true);
        cfg.blurRadius          = GdiUtils.clamp(window.GetProperty('PA.BlurRadius', 240), 0, 254);
        cfg.darkenValue         = GdiUtils.clamp(window.GetProperty('PA.DarkenValue', 10), 0, 50);
        cfg.customBgColor       = window.GetProperty('PA.CustomBgColor', window.GetProperty('PA.CustomBackgroundColor', GdiUtils.RGB(25, 25, 25)));
        cfg.bgUseUIColor        = window.GetProperty('PA.BgUseUIColor', false);

        cfg.showReflection      = window.GetProperty('PA.ShowReflection', true);
        cfg.opReflection        = GdiUtils.clamp(window.GetProperty('PA.OpReflection', 25), 0, 255);
        cfg.showGlow            = window.GetProperty('PA.ShowGlow', false);
        cfg.opGlow              = GdiUtils.clamp(window.GetProperty('PA.OpGlow', 80), 0, 255);
        cfg.showScanlines       = window.GetProperty('PA.ShowScanlines', false);
        cfg.opScanlines         = GdiUtils.clamp(window.GetProperty('PA.OpScanlines', 100), 0, 255);
        cfg.showPhosphor        = window.GetProperty('PA.ShowPhosphor', true);
        cfg.opPhosphor          = GdiUtils.clamp(window.GetProperty('PA.OpPhosphor', 20), 0, 255);
        cfg.phosphorTheme       = GdiUtils.clamp(window.GetProperty('PA.PhosphorTheme', 8), 0, PanelArtController.PHOSPHOR_THEMES.length);
        cfg.customPhosphorColor = window.GetProperty('PA.CustomPhosphorColor', 0xFFFFFFFF);
        cfg.overlayAllOff       = window.GetProperty('PA.OverlayAllOff', false);

        cfg.layoutAlignV        = GdiUtils.clamp(window.GetProperty('PA.LayoutAlignV', window.GetProperty('PA.LayoutAlign', 0)), 0, 2);
        cfg.layoutAlignH        = GdiUtils.clamp(window.GetProperty('PA.LayoutAlignH', 1), 0, 2);
        cfg.textShadowEnabled   = window.GetProperty('PA.TextShadowEnabled', true);
        cfg.extraInfoEnabled    = window.GetProperty('PA.ExtraInfoEnabled', true);
        cfg.glitchEnabled       = window.GetProperty('PA.GlitchEnabled', true);

        cfg.titleFontName       = window.GetProperty('PA.TitleFontName', 'Segoe UI');
        cfg.titleFontSize       = GdiUtils.clamp(window.GetProperty('PA.TitleFontSize', 42), 12, 100);
        cfg.artistFontName      = window.GetProperty('PA.ArtistFontName', 'Segoe UI');
        cfg.artistFontSize      = GdiUtils.clamp(window.GetProperty('PA.ArtistFontSize', 28), 10, 80);
        cfg.extraFontName       = window.GetProperty('PA.ExtraFontName', 'Segoe UI');
        cfg.extraFontSize       = GdiUtils.clamp(window.GetProperty('PA.ExtraFontSize', 20), 8, 60);

        cfg.imageFolder         = window.GetProperty('PA.ImageFolder', `${this.#profileBase}skins\\images`);
        cfg.bezelFolder         = GdiUtils.sanitizePath(window.GetProperty('PA.BezelFolder', `${this.#profileBase}skins\\overlay`)) || `${this.#profileBase}skins\\overlay`;
        cfg.bezelEnabled        = window.GetProperty('PA.BezelEnabled', false);
        cfg.bezelFile           = window.GetProperty('PA.BezelFile', '');
        cfg.imageMode           = window.GetProperty('PA.ImageMode', false);
        cfg.slideMode           = window.GetProperty('PA.SlideMode', false);
    }

    #loadCustomFolders() {
        this.#scanner.clearCaches();
        try {
            const raw = window.GetProperty('PA.CustomFolders', '[]');
            const parsed = JSON.parse(raw);
            this.#customFolders = Array.isArray(parsed)
                ? parsed.map(GdiUtils.sanitizePath).filter(p => p && utils.IsDirectory(p))
                : [];
        } catch {
            this.#customFolders = [];
        }
    }

    saveAll() {
        const cfg = this.config;
        for (const key of PanelArtController.PERSISTED_KEYS) {
            if (Object.prototype.hasOwnProperty.call(cfg, key)) {
                window.SetProperty(`PA.${key.charAt(0).toUpperCase() + key.slice(1)}`, cfg[key]);
            }
        }
        window.SetProperty('PA.CustomFolders', JSON.stringify(this.#customFolders));
    }

    requestSave() {
        if (this.#saveTimeout) window.ClearTimeout(this.#saveTimeout);
        this.#saveTimeout = window.SetTimeout(() => {
            this.saveAll();
            this.#saveTimeout = null;
        }, 500);
    }

    getHudFont() {
        this.#hudFont ??= gdi.Font('Segoe UI', Math.max(9, this.scale(12)));
        return this.#hudFont;
    }

    #disposeTextBlock() {
        if (this.#textBlockBmp) {
            try { this.#textBlockBmp.Dispose(); } catch {}
            this.#textBlockBmp = null;
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
                return PanelArtController.BEZEL_EXTS.includes(ext);
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

    resolveBezelPath(name) {
        const folder = this.config.bezelFolder;
        if (!folder || !name) return null;
        const cachedList = this.getBezelImages(false);
        const lower = name.toLowerCase();

        for (let i = 0; i < cachedList.length; i++) {
            const fullPath = cachedList[i];
            const fileName = fullPath.substring(fullPath.lastIndexOf('\\') + 1);
            const baseName = fileName.substring(0, fileName.lastIndexOf('.'));
            if (fileName.toLowerCase() === lower || baseName.toLowerCase() === lower) {
                return fullPath;
            }
        }

        const base = folder.endsWith('\\') ? folder : `${folder}\\`;
        for (const ext of PanelArtController.BEZEL_EXTS) {
            if (lower.endsWith(ext) && utils.IsFile(`${base}${name}`)) return `${base}${name}`;
        }
        for (const ext of PanelArtController.BEZEL_EXTS) {
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
        this.#dirtyFlags |= PanelArtController.DIRTY.OVERLAY;
        this.requestSave();

        if (this.#bezelNotifyTimeout) window.ClearTimeout(this.#bezelNotifyTimeout);
        this.#bezelNotifyTimeout = window.SetTimeout(() => {
            this.#bezelNotifyText = '';
            this.#bezelNotifyTimeout = null;
            window.Repaint();
        }, 1500);

        window.Repaint();
    }

    loadArtworkForTrack(metadb) {
        const handle = this.#getSafeHandle(metadb);
        if (!handle?.Path) {
            this.clearTrackDisplay();
            return;
        }

        const trackPath = handle.Path;
        this.#currentTrackPath = trackPath;

        let trackDir = '', rawArtist = '', rawAlbum = '', rawFolder = '', rawTitle = '', rawDate = '', rawLen = '', rawAlbArtist = '', rawDisc = '';

        try {
            const raw = this.#compoundTf.EvalWithMetadb(handle, true) ?? '';
            const parts = raw.split('\x01');
            trackDir     = parts[0] ?? '';
            rawArtist    = parts[1] ?? '';
            rawAlbum     = parts[2] ?? '';
            rawFolder    = parts[3] ?? '';
            rawTitle     = parts[4] ?? '';
            rawDate      = parts[5] ?? '';
            rawLen       = parts[6] ?? '';
            rawAlbArtist = parts[7] ?? '';
            rawDisc      = parts[8] ?? '';
        } catch {}

        this.#trackInfo.title  = rawTitle || 'Playing';
        this.#trackInfo.artist = rawArtist;
        const extraParts = [rawAlbum.trim(), rawDate.trim(), rawLen.trim()].filter(Boolean);
        this.#trackInfo.extra = extraParts.join(' | ');

        if (this.config.glitchEnabled) {
            this.triggerGlitch();
        }

        if (this.config.imageMode || this.config.slideMode) {
            this.#dirtyFlags |= PanelArtController.DIRTY.TEXT;
            window.Repaint();
            return;
        }

        const thisToken = ++this.#artGenerationToken;
        const artKey = this.#scanner.getArtworkIdentityKey(trackDir, rawAlbum, rawDisc);

        if (artKey !== this.#currentArtKey) {
            if (this.#coverImg) { try { this.#coverImg.Dispose(); } catch {} this.#coverImg = null; }
            this.#currentCoverPath = '';
            this.#currentArtKey = artKey;
            this.#dirtyFlags |= PanelArtController.DIRTY.ALL;
            this.#rebuildBackground();
            window.Repaint();
        } else {
            this.#currentArtKey = artKey;
        }

        const cached = this.#scanner.getArtFromMemoryCache(artKey);
        if (cached) {
            this.applyNewArtwork(cached, thisToken);
            return;
        }

        const fastCover = this.#scanner.getFastCover(trackDir);
        if (fastCover) {
            this.#scanner.setArtMemoryCache(artKey, fastCover);
            this.applyNewArtwork(fastCover, thisToken);
            return;
        }

        if (this.#pendingSearchTimer) { window.ClearTimeout(this.#pendingSearchTimer); this.#pendingSearchTimer = null; }
        this.#pendingSearchTimer = window.SetTimeout(() => {
            if (thisToken !== this.#artGenerationToken || this.#lifecycle !== PanelArtController.LIFECYCLE.LIVE) return;

            let coverPath = null;
            const artistVariants = this.#scanner.cleanVariants(rawArtist);
            if (rawAlbArtist && rawAlbArtist !== rawArtist) {
                for (const v of this.#scanner.cleanVariants(rawAlbArtist)) {
                    if (!artistVariants.includes(v)) artistVariants.push(v);
                }
            }
            const albumVariants  = this.#scanner.cleanVariants(rawAlbum);
            const folderVariants = this.#scanner.cleanVariants(rawFolder);

            const specificPatterns = [];
            for (const art of artistVariants) {
                for (const alb of albumVariants) {
                    specificPatterns.push(`${art} - ${alb}`, `${art}_${alb}`, `${art} ${alb}`, `${alb} - ${art}`);
                }
            }
            specificPatterns.push(...albumVariants, ...artistVariants);

            if (this.#customFolders.length > 0) {
                for (const cFolder of this.#customFolders) {
                    coverPath = this.#scanner.findInCustomFolder(cFolder, artistVariants, albumVariants, folderVariants, specificPatterns, this.config.customFolderDepth);
                    if (coverPath) break;
                }
            }

            if (!coverPath && trackDir && utils.IsDirectory(trackDir)) {
                coverPath = this.#scanner.searchDirectory(trackDir, specificPatterns, true, false, this.config.customFolderDepth);
            }

            if (thisToken !== this.#artGenerationToken || this.#lifecycle !== PanelArtController.LIFECYCLE.LIVE) return;

            if (coverPath) {
                this.#scanner.setArtMemoryCache(artKey, coverPath);
                this.applyNewArtwork(coverPath, thisToken);
                return;
            }

            try {
                const asyncHandle = this.#getSafeHandle(handle);
                if (asyncHandle) {
                    utils.GetAlbumArtAsync(window.ID, asyncHandle, 0);
                }
            } catch {
                this.applyNewArtwork(null, thisToken);
            }
        }, 10);
    }

    applyNewArtwork(coverPath, token) {
        if (token && token !== this.#artGenerationToken) return;

        if (coverPath && coverPath === this.#currentCoverPath && this.#coverImg) {
            this.#dirtyFlags |= (PanelArtController.DIRTY.LAYOUT | PanelArtController.DIRTY.TEXT);
            this.#rebuildBackground();
            window.Repaint();
            return;
        }

        if (this.#coverImg) { try { this.#coverImg.Dispose(); } catch {} this.#coverImg = null; }
        this.#currentCoverPath = '';

        if (coverPath) {
            try {
                this.#coverImg = gdi.Image(coverPath);
                this.#currentCoverPath = coverPath;
            } catch {
                this.#coverImg = null;
            }
        }

        this.#dirtyFlags |= (PanelArtController.DIRTY.LAYOUT | PanelArtController.DIRTY.TEXT | PanelArtController.DIRTY.BACKGROUND);
        this.#rebuildBackground();
        window.Repaint();
    }

    refreshColours() {
        if (this.config.bgUseUIColor) {
            this.#dirtyFlags |= PanelArtController.DIRTY.BACKGROUND;
            this.#rebuildBackground();
        }
        this.#dirtyFlags |= PanelArtController.DIRTY.OVERLAY;
        this.#rebuildOverlay();
        window.Repaint();
    }

    #rebuildBackground() {
        this.#backdrop.rebuildBlur(
            this.#coverImg,
            window.Width,
            window.Height,
            this.config.backgroundEnabled && this.config.blurEnabled,
            this.config.blurRadius,
            this.config.bgUseUIColor
        );
        this.#backdrop.rebuildCache(
            window.Width,
            window.Height,
            this.config.bgUseUIColor,
            this.config.customBgColor,
            this.config.backgroundEnabled,
            this.config.darkenValue,
            this.#getSafeUIColour()
        );
        this.#dirtyFlags &= ~PanelArtController.DIRTY.BACKGROUND;
    }

    #rebuildOverlay() {
        const themeColor = this.config.phosphorTheme === PanelArtController.PHOSPHOR_THEMES.length
            ? this.config.customPhosphorColor
            : PanelArtController.PHOSPHOR_THEMES[this.config.phosphorTheme].color;

        this.#backdrop.rebuildOverlay(
            window.Width,
            window.Height,
            { ...this.config, phosphorColor: themeColor },
            this.#bezelBmp,
            this.#dpiScale
        );
        this.#dirtyFlags &= ~PanelArtController.DIRTY.OVERLAY;
    }

    clearTrackDisplay() {
        this.#currentTrackPath = '';
        this.#currentCoverPath = '';
        this.#currentArtKey    = '';
        this.#artGenerationToken++;

        if (this.#pendingSearchTimer) { window.ClearTimeout(this.#pendingSearchTimer); this.#pendingSearchTimer = null; }
        if (this.#coverImg) { try { this.#coverImg.Dispose(); } catch {} this.#coverImg = null; }
        this.#disposeTextBlock();

        this.#trackInfo.title  = 'No track playing';
        this.#trackInfo.artist = '';
        this.#trackInfo.extra  = '';

        this.#dirtyFlags = PanelArtController.DIRTY.ALL;
        this.#backdrop.dispose();
        this.#rebuildBackground();
        window.Repaint();
    }

    // ========================================================================================
    // 6. ENHANCED GLITCH SHADER & VIDEO DROPOUT ENGINE
    // ========================================================================================
    triggerGlitch() {
        if (!this.config.glitchEnabled) return;
        if (this.#glitchTimer) {
            window.ClearInterval(this.#glitchTimer);
            this.#glitchTimer = null;
        }

        let count = 0;
        const totalFrames = 6;

        this.#glitchTimer = window.SetInterval(() => {
            count++;
            if (count >= totalFrames) {
                this.#glitchFrame = 0;
                this.#glitchBlackout = false;
                window.ClearInterval(this.#glitchTimer);
                this.#glitchTimer = null;
                window.Repaint();
            } else {
                this.#glitchFrame = Math.random() * 0.65 + 0.35;
                this.#glitchBlackout = (count === 2 || count === 3);
                window.Repaint();
            }
        }, 26);
    }

    #drawGlitch(gr, w, h, intensity) {
        if (intensity <= 0) return;
        const pad = this.scale(this.config.borderSize) || 0;
        const gx = Math.max(pad, 0), gy = Math.max(pad, 0);
        const gw = Math.max(1, w - pad * 2);
        const gh = Math.max(1, h - pad * 2);

        // 1. High-speed scanline bars
        const stepH = Math.max(2, this.scale(3));
        const scanOff = Math.floor(Math.random() * stepH);
        for (let y = gy + scanOff; y < gy + gh; y += stepH) {
            gr.FillSolidRect(gx, y, gw, Math.max(1, this.scale(1)), GdiUtils.setAlpha(GdiUtils.RGB(0, 0, 0), Math.floor(Math.random() * 50) + 40));
        }

        // 2. Chromatic aberration color shift bands
        const maxShift = Math.floor(gw * 0.12);
        const shift    = Math.floor(Math.random() * maxShift);
        const shiftDir = Math.random() > 0.5 ? 1 : -1;

        if (intensity > 0.25) {
            const col1 = PanelArtController.GLITCH_SHIFT_COLORS[Math.floor(Math.random() * PanelArtController.GLITCH_SHIFT_COLORS.length)];
            const col2 = PanelArtController.GLITCH_SHIFT_COLORS[Math.floor(Math.random() * PanelArtController.GLITCH_SHIFT_COLORS.length)];
            const sx1  = gx + shift * shiftDir,  rw1 = gw - shift;
            const sx2  = gx + shift * -shiftDir, rw2 = gw - shift;
            if (rw1 > 0) gr.FillSolidRect(Math.max(sx1, gx), gy, rw1, gh, GdiUtils.setAlpha(col1, Math.floor(intensity * 70)));
            gr.FillSolidRect(gx, gy, gw, gh, GdiUtils.setAlpha(PanelArtController.GLITCH_CHROMA, 5));
            if (rw2 > 0) gr.FillSolidRect(Math.max(sx2, gx), gy, rw2, gh, GdiUtils.setAlpha(col2, Math.floor(intensity * 70)));
        }

        // 3. Horizontal slice tearing across the screen
        const numSlices = Math.floor(intensity * 7) + 2;
        for (let i = 0; i < numSlices; i++) {
            const sy = gy + Math.floor(Math.random() * gh);
            const sh = Math.floor(Math.random() * this.scale(16)) + 2;
            const ms = Math.floor(gw * 0.12);
            let sx   = gx + (Math.floor(Math.random() * ms * 2) - ms);
            let dw   = gw;
            if (sx < gx) { dw -= (gx - sx); sx = gx; }
            if (sx + dw > gx + gw) dw = gx + gw - sx;
            if (dw > 0) {
                const col = PanelArtController.GLITCH_SLICE_COLORS[Math.floor(Math.random() * PanelArtController.GLITCH_SLICE_COLORS.length)];
                gr.FillSolidRect(sx, sy, dw, sh, GdiUtils.setAlpha(col, 130));
            }
        }

        // 4. Digital corrupted memory blocks
        const numBlocks = Math.floor(intensity * 32) + 2;
        for (let i = 0; i < numBlocks; i++) {
            const bh = Math.floor(Math.random() * gh * 0.06) + 2;
            const bw = Math.floor(Math.random() * gw * 0.12) + 4;
            const maxSpanY = Math.max(0, gh - bh);
            const maxSpanX = Math.max(0, gw - bw);
            const by = gy + (maxSpanY > 0 ? Math.floor(Math.random() * maxSpanY) : 0);
            const bx = gx + (maxSpanX > 0 ? Math.floor(Math.random() * maxSpanX) : 0);
            const col = PanelArtController.GLITCH_BLOCK_COLORS[Math.floor(Math.random() * PanelArtController.GLITCH_BLOCK_COLORS.length)];
            const r = Math.floor(((col >>> 16) & 0xFF) * 0.90);
            const g = Math.floor(((col >>>  8) & 0xFF) * 0.90);
            const b = Math.floor((col & 255) * 0.90);
            gr.FillSolidRect(bx, by, bw, bh, GdiUtils.RGB(r, g, b));
        }

        // 5. Electrical static interference lines
        const numInterference = Math.floor(intensity * 12) + 4;
        for (let i = 0; i < numInterference; i++) {
            const iy = gy + Math.floor(Math.random() * gh);
            const ih = Math.floor(Math.random() * 2) + 1;
            const col = PanelArtController.GLITCH_TINT_COLORS[Math.floor(Math.random() * PanelArtController.GLITCH_TINT_COLORS.length)];
            gr.FillSolidRect(gx, iy, gw, ih, GdiUtils.setAlpha(col, Math.floor(Math.random() * 60) + 40));
        }
    }

    #getSafeHandle(metadb) {
        if (metadb) {
            try { if (metadb.Path) return metadb; } catch {}
        }
        if (fb.IsPlaying) {
            try { const h = fb.GetNowPlaying(); if (h?.Path) return h; } catch {}
        }
        try { const s = fb.GetSelection(); if (s?.Path) return s; } catch {}
        return null;
    }

    #getSafeUIColour() {
        try {
            return window.InstanceType === 1 ? window.GetColourDUI(1) : window.GetColourCUI(3);
        } catch {
            return GdiUtils.RGB(25, 25, 25);
        }
    }

    // ========================================================================================
    // SLIDESHOW & DISPLAY MODES (DETERMINISTIC CLEANUP)
    // ========================================================================================
    startImageMode(interactive = true) {
        this.stopSlideMode(false);
        const thisToken = ++this.#artGenerationToken;
        let images = this.#scanner.getFolderImagesList(this.config.imageFolder);

        if (!images.length) {
            if (interactive) {
                const f = GdiUtils.prompt("No images found in image folder. Enter a valid path:", "Set Image Folder", this.config.imageFolder);
                if (f) {
                    const cleaned = GdiUtils.sanitizePath(f);
                    if (cleaned && utils.IsDirectory(cleaned)) {
                        this.config.imageFolder = cleaned;
                        this.saveAll();
                        images = this.#scanner.getFolderImagesList(this.config.imageFolder);
                    }
                }
            }
            if (!images.length) {
                // Point 2 Definite Fix: Explicitly reset mode state on failure
                this.config.imageMode = false;
                this.requestSave();
                if (fb.IsPlaying) this.loadArtworkForTrack(fb.GetNowPlaying());
                return;
            }
        }

        const pick = images[Math.floor(Math.random() * images.length)];
        try {
            if (this.#modeImg) { try { this.#modeImg.Dispose(); } catch {} }
            this.#modeImg = gdi.Image(pick.path);
            if (thisToken === this.#artGenerationToken) {
                this.config.imageMode = true;
                this.requestSave();
                window.Repaint();
            } else if (this.#modeImg) {
                this.#modeImg.Dispose();
                this.#modeImg = null;
            }
        } catch {
            this.#modeImg = null;
            this.config.imageMode = false;
            this.requestSave();
        }
    }

    stopImageMode(restoreTrack = true) {
        this.#artGenerationToken++;
        this.config.imageMode = false;
        if (this.#modeImg) { try { this.#modeImg.Dispose(); } catch {} this.#modeImg = null; }
        this.requestSave();

        if (restoreTrack && fb.IsPlaying) {
            this.loadArtworkForTrack(fb.GetNowPlaying());
        } else {
            window.Repaint();
        }
    }

    startSlideMode(interactive = true) {
        this.stopImageMode(false);
        const thisToken = ++this.#artGenerationToken;
        this.#slideImages = this.#scanner.getFolderImagesList(this.config.imageFolder);

        if (!this.#slideImages.length) {
            if (interactive) {
                const f = GdiUtils.prompt("No images found in image folder. Enter a valid path:", "Set Image Folder", this.config.imageFolder);
                if (f) {
                    const cleaned = GdiUtils.sanitizePath(f);
                    if (cleaned && utils.IsDirectory(cleaned)) {
                        this.config.imageFolder = cleaned;
                        this.saveAll();
                        this.#slideImages = this.#scanner.getFolderImagesList(this.config.imageFolder);
                    }
                }
            }
            if (!this.#slideImages.length) {
                // Point 2 Definite Fix: Explicitly reset mode state on failure
                this.config.slideMode = false;
                this.requestSave();
                if (fb.IsPlaying) this.loadArtworkForTrack(fb.GetNowPlaying());
                return;
            }
        }

        this.config.slideMode = true;
        this.requestSave();

        const pickNext = () => {
            if (this.#lifecycle !== PanelArtController.LIFECYCLE.LIVE) return;
            if (!window.IsVisible) return;
            if (thisToken !== this.#artGenerationToken) return;

            if (!this.#slideImages || !this.#slideImages.length) {
                this.#slideImages = this.#scanner.getFolderImagesList(this.config.imageFolder);
            }
            if (!this.#slideImages.length) {
                this.stopSlideMode(true);
                return;
            }

            const pick = this.#slideImages[Math.floor(Math.random() * this.#slideImages.length)];
            try {
                if (this.#modeImg) { try { this.#modeImg.Dispose(); } catch {} }
                this.#modeImg = gdi.Image(pick.path);
                window.Repaint();
            } catch {
                this.#modeImg = null;
            }
        };

        pickNext();
        if (this.#slideTimer) window.ClearInterval(this.#slideTimer);
        this.#slideTimer = window.SetInterval(pickNext, 12000);
        window.Repaint();
    }

    stopSlideMode(restoreTrack = true) {
        this.#artGenerationToken++;
        if (this.#slideTimer) { window.ClearInterval(this.#slideTimer); this.#slideTimer = null; }
        this.config.slideMode = false;
        this.#slideImages = null;
        if (this.#modeImg) { try { this.#modeImg.Dispose(); } catch {} this.#modeImg = null; }
        this.requestSave();

        if (restoreTrack && fb.IsPlaying) {
            this.loadArtworkForTrack(fb.GetNowPlaying());
        } else {
            window.Repaint();
        }
    }

    // ========================================================================================
    // PAINT PIPELINE & PRE-BAKED COMPOSITE TYPOGRAPHY
    // ========================================================================================
    onPaint(gr) {
        if (this.#lifecycle !== PanelArtController.LIFECYCLE.LIVE) return;
        const w = window.Width, h = window.Height;
        if (!gr || w <= 0 || h <= 0) return;

        if ((this.config.imageMode || this.config.slideMode) && this.#modeImg) {
            const pad = this.scale(this.config.borderSize) + this.scale(3);
            const dw = Math.max(10, w - pad * 2);
            const dh = Math.max(10, h - pad * 2);

            gr.FillSolidRect(0, 0, w, h, GdiUtils.RGB(5, 5, 5));
            if (this.#modeImg.Width > 0 && this.#modeImg.Height > 0) {
                gr.SetInterpolationMode(2);
                gr.DrawImage(this.#modeImg, pad, pad, dw, dh, 0, 0, this.#modeImg.Width, this.#modeImg.Height);
            }

            if (!this.#backdrop.overlayBmp || (this.#dirtyFlags & PanelArtController.DIRTY.OVERLAY) ||
                (this.#backdrop.overlayBmp.Width !== w || this.#backdrop.overlayBmp.Height !== h)) {
                this.#rebuildOverlay();
            }
            if (this.#backdrop.overlayBmp) gr.DrawImage(this.#backdrop.overlayBmp, 0, 0, w, h, 0, 0, this.#backdrop.overlayBmp.Width, this.#backdrop.overlayBmp.Height);
            return;
        }

        // Layer 1: Background
        if (this.#glitchBlackout) {
            gr.FillSolidRect(0, 0, w, h, GdiUtils.RGB(6, 6, 8));
        } else {
            if (!this.#backdrop.cacheBmp || (this.#dirtyFlags & PanelArtController.DIRTY.BACKGROUND) ||
                (this.#backdrop.cacheBmp.Width !== w || this.#backdrop.cacheBmp.Height !== h)) {
                this.#rebuildBackground();
            }
            if (this.#backdrop.cacheBmp) {
                gr.DrawImage(this.#backdrop.cacheBmp, 0, 0, w, h, 0, 0, this.#backdrop.cacheBmp.Width, this.#backdrop.cacheBmp.Height);
            } else {
                gr.FillSolidRect(0, 0, w, h, this.config.customBgColor >>> 0);
            }
        }

        if (this.#dirtyFlags & PanelArtController.DIRTY.LAYOUT) {
            this.#updateLayout(gr, w, h);
        } else if (this.#dirtyFlags & PanelArtController.DIRTY.TEXT) {
            this.#bakeTypographyPlate(gr);
        }

        // Layer 2: Cover Art
        if (this.#coverImg && this.config.albumArtEnabled && fb.IsPlaying && this.#layout.artRect.w > 0) {
            const ar = this.#layout.artRect;

            if (this.#glitchBlackout) {
                const sliceCount = 5;
                const sliceH = Math.max(6, Math.floor(ar.h / sliceCount));
                const maxJitter = Math.round((this.#glitchFrame - 0.5) * 36);

                for (let sy = 0; sy < ar.h; sy += sliceH) {
                    const curH = Math.min(sliceH, ar.h - sy);
                    const dx = ((Math.floor(sy / sliceH) % 2 === 0) ? maxJitter : -maxJitter);
                    const srcSy = Math.floor((sy / ar.h) * this.#coverImg.Height);
                    const srcSh = Math.floor((curH / ar.h) * this.#coverImg.Height);
                    gr.DrawImage(this.#coverImg, ar.x + dx, ar.y + sy, ar.w, curH, 0, srcSy, this.#coverImg.Width, srcSh);
                }
            } else {
                if (this.config.showGlow && this.config.opGlow > 0 && !this.config.overlayAllOff && this.#backdrop.glowBmp) {
                    const gx = Math.floor(ar.x + (ar.w - this.#backdrop.glowSize) / 2);
                    const gy = Math.floor(ar.y + (ar.h - this.#backdrop.glowSize) / 2);
                    gr.DrawImage(this.#backdrop.glowBmp, gx, gy, this.#backdrop.glowSize, this.#backdrop.glowSize, 0, 0, this.#backdrop.glowBmp.Width, this.#backdrop.glowBmp.Height);
                }
                gr.SetInterpolationMode(2);

                if (this.#glitchFrame > 0 && this.config.glitchEnabled) {
                    const jx = Math.round((Math.random() - 0.5) * 8);
                    const jy = Math.round((Math.random() - 0.5) * 4);
                    gr.DrawImage(this.#coverImg, ar.x + jx, ar.y + jy, ar.w, ar.h, 0, 0, this.#coverImg.Width, this.#coverImg.Height);
                } else {
                    gr.DrawImage(this.#coverImg, ar.x, ar.y, ar.w, ar.h, 0, 0, this.#coverImg.Width, this.#coverImg.Height);
                }
            }
        }

        // Layer 3: Typography
        if (!this.#glitchBlackout && this.#textBlockBmp && this.#textBlockW > 0 && this.#textBlockH > 0) {
            let tx = this.#textBlockX;
            let ty = this.#textBlockY;
            if (this.#glitchFrame > 0 && this.config.glitchEnabled) {
                tx += Math.round((Math.random() - 0.5) * 10);
                ty += Math.round((Math.random() - 0.5) * 4);
            }
            gr.DrawImage(this.#textBlockBmp, tx, ty, this.#textBlockW, this.#textBlockH, 0, 0, this.#textBlockW, this.#textBlockH);
        }

        // Layer 4: CRT Glitch Noise Shader
        if (this.#glitchFrame > 0 && this.config.glitchEnabled) {
            this.#drawGlitch(gr, w, h, this.#glitchFrame);
        }

        // Layer 5: Overlays & CRT Masks
        if (!this.#backdrop.overlayBmp || (this.#dirtyFlags & PanelArtController.DIRTY.OVERLAY) ||
            (this.#backdrop.overlayBmp.Width !== w || this.#backdrop.overlayBmp.Height !== h)) {
            this.#rebuildOverlay();
        }
        if (this.#backdrop.overlayBmp) gr.DrawImage(this.#backdrop.overlayBmp, 0, 0, w, h, 0, 0, this.#backdrop.overlayBmp.Width, this.#backdrop.overlayBmp.Height);

        // Layer 6: HUD Slider & Toasts
        if (this.#opacityTarget) {
            this.#drawSliderHud(gr, w, h);
        } else if (this.#bezelNotifyText) {
            this.#drawBezelToast(gr, w, h);
        }
    }

    #updateLayout(gr, w, h) {
        const b = this.scale(this.config.borderSize);
        const pad = this.scale(this.config.albumArtPadding);
        const inL = b + pad + this.scale(this.config.padLeft);
        const inR = b + pad + this.scale(this.config.padRight);
        const inT = b + pad + this.scale(this.config.padTop);
        const inB = b + pad + this.scale(this.config.padBottom);
        const contentW = Math.max(10, w - inL - inR);
        const contentH = Math.max(10, h - inT - inB);

        let artRect = { x: 0, y: 0, w: 0, h: 0 };
        let textRect = { x: inL + 8, y: inT + 8, w: Math.max(10, contentW - 16), h: Math.max(10, contentH - 16) };

        if (this.#coverImg && this.config.albumArtEnabled && fb.IsPlaying) {
            const flt = this.config.albumArtFloat;
            if (flt === 'left' || flt === 'right') {
                const maxW = Math.max(10, Math.floor(contentW * 0.65) - pad);
                const maxH = Math.max(10, contentH - pad * 2);
                const scale = Math.min(maxW / this.#coverImg.Width, maxH / this.#coverImg.Height);
                const drawW = Math.max(1, Math.floor(this.#coverImg.Width * scale));
                const drawH = Math.max(1, Math.floor(this.#coverImg.Height * scale));
                const drawY = inT + Math.floor((contentH - drawH) / 2);
                const drawX = flt === 'left' ? inL + pad : Math.max(inL, w - inR - pad - drawW);

                artRect = { x: drawX, y: drawY, w: drawW, h: drawH };
                textRect.x = flt === 'left' ? drawX + drawW + pad : inL + 8;
                textRect.w = flt === 'left' ? Math.max(10, w - inR - textRect.x - 8) : Math.max(10, drawX - pad - textRect.x);
            } else if (flt === 'top' || flt === 'bottom') {
                const artRatio = this.config.extraInfoEnabled ? 0.60 : 0.68;
                const maxH = Math.max(10, Math.floor(contentH * artRatio) - Math.floor(pad * 1.5));
                const maxW = Math.max(10, contentW - pad * 2);
                const scale = Math.min(maxW / this.#coverImg.Width, maxH / this.#coverImg.Height);
                const drawW = Math.max(1, Math.floor(this.#coverImg.Width * scale));
                const drawH = Math.max(1, Math.floor(this.#coverImg.Height * scale));
                const drawX = inL + Math.floor((contentW - drawW) / 2);
                const drawY = flt === 'top' ? inT + pad : Math.max(inT, h - inB - pad - drawH);

                artRect = { x: drawX, y: drawY, w: drawW, h: drawH };
                textRect.y = flt === 'top' ? drawY + drawH + Math.floor(pad * 0.5) : inT + 8;
                textRect.h = flt === 'top' ? Math.max(10, h - inB - textRect.y - 4) : Math.max(10, drawY - Math.floor(pad * 0.5) - textRect.y);
            } else if (flt === 'stretch') {
                artRect = { 
                    x: inL + pad, 
                    y: inT + pad, 
                    w: Math.max(10, contentW - pad * 2), 
                    h: Math.max(10, contentH - pad * 2) 
                };
                textRect = { 
                    x: inL + 8, 
                    y: inT + 8, 
                    w: Math.max(10, contentW - 16), 
                    h: Math.max(10, contentH - 16) 
                };
            }
        }

        if (artRect.w > 0 && this.config.showGlow && this.config.opGlow > 0 && !this.config.overlayAllOff) {
            this.#backdrop.checkGlow(artRect.w, artRect.h, this.config.showGlow, this.config.opGlow, this.config.overlayAllOff);
        } else {
            this.#backdrop.checkGlow(0, 0, false, 0, true);
        }

        this.#layout.artRect = artRect;
        this.#textBlockX = textRect.x;
        this.#textBlockY = textRect.y;
        this.#textBlockW = textRect.w;
        this.#textBlockH = textRect.h;

        this.#bakeTypographyPlate(gr);
        this.#dirtyFlags &= ~PanelArtController.DIRTY.LAYOUT;
    }

    #bakeTypographyPlate(gr) {
        this.#disposeTextBlock();
        const rw = this.#textBlockW;
        const rh = this.#textBlockH;
        if (!gr || rw <= 20 || rh <= 20) {
            this.#dirtyFlags &= ~PanelArtController.DIRTY.TEXT;
            return;
        }

        const hasArtist = Boolean(this.#trackInfo.artist && this.#trackInfo.artist.trim());
        const hasExtra  = Boolean(this.config.extraInfoEnabled && this.#trackInfo.extra && this.#trackInfo.extra.trim());

        let titleBudgetH, artistBudgetH, extraBudgetH;
        if (hasArtist && hasExtra) {
            titleBudgetH  = Math.floor(rh * 0.38);
            artistBudgetH = Math.floor(rh * 0.28);
            extraBudgetH  = Math.floor(rh * 0.22);
        } else if (hasArtist || hasExtra) {
            titleBudgetH  = Math.floor(rh * 0.52);
            artistBudgetH = Math.floor(rh * 0.36);
            extraBudgetH  = Math.floor(rh * 0.36);
        } else {
            titleBudgetH  = Math.floor(rh * 0.82);
            artistBudgetH = 0;
            extraBudgetH  = 0;
        }

        let titleFitSize  = this.#fonts.fitSize(gr, this.#trackInfo.title, this.config.titleFontName, 1, rw, titleBudgetH, this.scale(this.config.titleFontSize), this.scale(12));
        let artistFitSize = hasArtist ? this.#fonts.fitSize(gr, this.#trackInfo.artist, this.config.artistFontName, 0, rw, artistBudgetH, this.scale(this.config.artistFontSize), this.scale(10)) : 0;
        let extraFitSize  = hasExtra  ? this.#fonts.fitSize(gr, this.#trackInfo.extra, this.config.extraFontName, 0, rw, extraBudgetH, this.scale(this.config.extraFontSize), this.scale(8)) : 0;

        let fTitle  = this.#fonts.get(this.config.titleFontName, titleFitSize, 1);
        let fArtist = hasArtist ? this.#fonts.get(this.config.artistFontName, artistFitSize, 0) : null;
        let fExtra  = hasExtra  ? this.#fonts.get(this.config.extraFontName, extraFitSize, 0) : null;

        let mTitle  = gr.MeasureString(this.#trackInfo.title, fTitle, 0, 0, 10000, 10000);
        let mArtist = (hasArtist && fArtist) ? gr.MeasureString(this.#trackInfo.artist, fArtist, 0, 0, 10000, 10000) : { Width: 0, Height: 0 };
        let mExtra  = (hasExtra && fExtra)   ? gr.MeasureString(this.#trackInfo.extra, fExtra, 0, 0, 10000, 10000)   : { Width: 0, Height: 0 };

        const gap1 = hasArtist ? this.scale(4) : 0;
        const gap2 = hasExtra  ? this.scale(5) : 0;
        let totalH = mTitle.Height + gap1 + mArtist.Height + gap2 + mExtra.Height;

        const maxAllowedH = rh - this.scale(4);
        if (totalH > maxAllowedH && totalH > 0) {
            const scaleDown = Math.max(0.55, maxAllowedH / totalH);
            titleFitSize  = Math.max(this.scale(10), Math.floor(titleFitSize * scaleDown));
            if (hasArtist) artistFitSize = Math.max(this.scale(9), Math.floor(artistFitSize * scaleDown));
            if (hasExtra)  extraFitSize  = Math.max(this.scale(8), Math.floor(extraFitSize * scaleDown));

            fTitle  = this.#fonts.get(this.config.titleFontName, titleFitSize, 1);
            fArtist = hasArtist ? this.#fonts.get(this.config.artistFontName, artistFitSize, 0) : null;
            fExtra  = hasExtra  ? this.#fonts.get(this.config.extraFontName, extraFitSize, 0) : null;

            mTitle  = gr.MeasureString(this.#trackInfo.title, fTitle, 0, 0, 10000, 10000);
            mArtist = (hasArtist && fArtist) ? gr.MeasureString(this.#trackInfo.artist, fArtist, 0, 0, 10000, 10000) : { Width: 0, Height: 0 };
            mExtra  = (hasExtra && fExtra)   ? gr.MeasureString(this.#trackInfo.extra, fExtra, 0, 0, 10000, 10000)   : { Width: 0, Height: 0 };
            totalH  = mTitle.Height + gap1 + mArtist.Height + gap2 + mExtra.Height;
        }

        let startRelY = 0;
        if (this.config.layoutAlignV === 0) {
            startRelY = Math.max(0, Math.floor((rh - totalH) / 2));
        } else if (this.config.layoutAlignV === 1) {
            startRelY = Math.max(0, rh - totalH - this.scale(2));
        } else {
            startRelY = this.scale(2);
        }

        if (startRelY + totalH > rh) {
            startRelY = Math.max(0, rh - totalH);
        }

        const getAlignedRelX = (wVal) => {
            if (this.config.layoutAlignH === 1) return Math.max(0, Math.floor((rw - wVal) / 2));
            if (this.config.layoutAlignH === 2) return Math.max(0, rw - wVal - 2);
            return 0;
        };

        let bmp = null, g = null;
        try {
            bmp = gdi.CreateImage(rw, rh);
            g = bmp.GetGraphics();
            g.SetTextRenderingHint(4);

            let curY = startRelY;

            // 1. Title
            if (this.#trackInfo.title && fTitle) {
                const rx = getAlignedRelX(mTitle.Width);
                if (this.config.textShadowEnabled) {
                    g.DrawString(this.#trackInfo.title, fTitle, GdiUtils.setAlpha(GdiUtils.RGB(0, 0, 0), 160), rx + 2, curY + 2, mTitle.Width + 4, mTitle.Height + 4);
                }
                g.DrawString(this.#trackInfo.title, fTitle, GdiUtils.RGB(255, 255, 255), rx, curY, mTitle.Width + 4, mTitle.Height + 4);
                curY += mTitle.Height + gap1;
            }

            // 2. Artist
            if (hasArtist && fArtist) {
                const rx = getAlignedRelX(mArtist.Width);
                if (this.config.textShadowEnabled) {
                    g.DrawString(this.#trackInfo.artist, fArtist, GdiUtils.setAlpha(GdiUtils.RGB(0, 0, 0), 160), rx + 2, curY + 2, mArtist.Width + 4, mArtist.Height + 4);
                }
                g.DrawString(this.#trackInfo.artist, fArtist, GdiUtils.RGB(200, 200, 200), rx, curY, mArtist.Width + 4, mArtist.Height + 4);
                curY += mArtist.Height + gap2;
            }

            // 3. Extra Info
            if (hasExtra && fExtra) {
                const rx = getAlignedRelX(mExtra.Width);
                const drawH = Math.max(mExtra.Height + 4, rh - curY);
                if (this.config.textShadowEnabled) {
                    g.DrawString(this.#trackInfo.extra, fExtra, GdiUtils.setAlpha(GdiUtils.RGB(0, 0, 0), 160), rx + 2, curY + 2, mExtra.Width + 4, drawH);
                }
                g.DrawString(this.#trackInfo.extra, fExtra, GdiUtils.RGB(170, 170, 170), rx, curY, mExtra.Width + 4, drawH);
            }

            bmp.ReleaseGraphics(g);
            g = null;
            this.#textBlockBmp = bmp;
        } catch {
            if (g && bmp) { try { bmp.ReleaseGraphics(g); } catch {} }
            if (bmp) { try { bmp.Dispose(); } catch {} }
            this.#textBlockBmp = null;
        }
        this.#dirtyFlags &= ~PanelArtController.DIRTY.TEXT;
    }

    #drawSliderHud(gr, w, h) {
        const barW = Math.min(this.scale(220), Math.round(w * 0.6));
        const barH = Math.max(4, this.scale(6));
        const bx = Math.floor((w - barW) / 2);
        const by = h - Math.max(16, this.scale(24));
        const font = this.getHudFont();
        const val = this.getOpacity(this.#opacityTarget);
        const max = this.#opacityTarget === 'Padding' ? 100 : 255;
        const label = `${this.#opacityTarget}: ${val}${this.#opacityTarget === 'Padding' ? 'px' : ''}`;
        const lH = Math.max(16, this.scale(20));

        gr.FillSolidRect(bx, by, barW, barH, GdiUtils.setAlpha(GdiUtils.RGB(255, 255, 255), 60));
        gr.FillSolidRect(bx, by, Math.floor(barW * (val / max)), barH, GdiUtils.setAlpha(GdiUtils.RGB(255, 255, 255), 180));
        gr.DrawString(label, font, GdiUtils.setAlpha(GdiUtils.RGB(255, 255, 255), 230), 0, by - lH - 2, w, lH, 0x11000000);
    }

    #drawBezelToast(gr, w, h) {
        const font = this.getHudFont();
        const text = `Bezel: ${this.#bezelNotifyText}`;
        const boxH = Math.max(20, this.scale(24));
        const boxW = Math.min(w - this.scale(20), Math.max(this.scale(130), text.length * this.scale(7) + this.scale(24)));
        const bx = Math.floor((w - boxW) / 2);
        const by = h - Math.max(24, this.scale(32));
        gr.FillSolidRect(bx, by, boxW, boxH, GdiUtils.setAlpha(GdiUtils.RGB(0, 0, 0), 190));
        gr.DrawString(text, font, GdiUtils.setAlpha(GdiUtils.RGB(255, 255, 255), 240), bx, by, boxW, boxH, 0x11000000);
    }

    // ========================================================================================
    // CONTEXT MENU (DETERMINISTIC CLEANUP VIA FINALLY)
    // ========================================================================================
    showContextMenu(x, y) {
        const m         = window.CreatePopupMenu();
        const panelM    = window.CreatePopupMenu();
        const artM      = window.CreatePopupMenu();
        const floatM    = window.CreatePopupMenu();
        const textM     = window.CreatePopupMenu();
        const fontM     = window.CreatePopupMenu();
        const alignVM   = window.CreatePopupMenu();
        const alignHM   = window.CreatePopupMenu();
        const borderM   = window.CreatePopupMenu();
        const bgM       = window.CreatePopupMenu();
        const blurM     = window.CreatePopupMenu();
        const darkenM   = window.CreatePopupMenu();
        const overlayM  = window.CreatePopupMenu();
        const phosphorM = window.CreatePopupMenu();
        const opacityM  = window.CreatePopupMenu();
        const customFM  = window.CreatePopupMenu();
        const depthM    = window.CreatePopupMenu();
        const presetM   = window.CreatePopupMenu();
        const loadM     = window.CreatePopupMenu();
        const saveM     = window.CreatePopupMenu();
        const bezelM    = window.CreatePopupMenu();

        const allMenus = [
            m, panelM, artM, floatM, textM, fontM, alignVM, alignHM,
            borderM, bgM, blurM, darkenM, overlayM, phosphorM, opacityM,
            customFM, depthM, presetM, loadM, saveM, bezelM
        ];

        const MID = PanelArtController.MENU_ID;
        const bezelNames = this.listBezelNames();
        const bzStart = MID.BEZEL_NONE;

        bezelM.AppendMenuItem(0, MID.BEZEL_ENABLE, "Enable Bezel Frame");
        if (this.config.bezelEnabled && this.config.bezelFile) bezelM.CheckMenuRadioItem(MID.BEZEL_ENABLE, MID.BEZEL_ENABLE, MID.BEZEL_ENABLE);
        bezelM.AppendMenuSeparator();
        bezelM.AppendMenuItem(0, bzStart, "None (No Bezel)");
        for (let bi = 0; bi < bezelNames.length; bi++) {
            const shortName = bezelNames[bi].length > 42 ? `...${bezelNames[bi].substring(bezelNames[bi].length - 39)}` : bezelNames[bi];
            bezelM.AppendMenuItem(0, MID.BEZEL_BASE + bi, shortName);
        }
        if (bezelNames.length > 0) {
            const curClean = (this.config.bezelFile || '').toLowerCase().replace(/\.[^/.]+$/, '');
            const selIdx = curClean ? bezelNames.findIndex(n => n.toLowerCase() === curClean) : -1;
            const checkId = selIdx >= 0 ? MID.BEZEL_BASE + selIdx : bzStart;
            bezelM.CheckMenuRadioItem(bzStart, MID.BEZEL_BASE + bezelNames.length - 1, checkId);
        } else {
            if (!this.config.bezelFile) bezelM.CheckMenuRadioItem(bzStart, bzStart, bzStart);
        }
        bezelM.AppendMenuSeparator();
        bezelM.AppendMenuItem(0, MID.BEZEL_FOLDER, "Set Bezel Folder...");
        bezelM.AppendMenuItem(0, MID.BEZEL_RELOAD, "Reload Bezel List");
        bezelM.AppendMenuSeparator();
        bezelM.AppendMenuItem(0, MID.PAD_LEFT, `Left Padding... (${this.config.padLeft}px)`);
        bezelM.AppendMenuItem(0, MID.PAD_RIGHT, `Right Padding... (${this.config.padRight}px)`);
        bezelM.AppendMenuItem(0, MID.PAD_TOP, `Top Padding... (${this.config.padTop}px)`);
        bezelM.AppendMenuItem(0, MID.PAD_BOTTOM, `Bottom Padding... (${this.config.padBottom}px)`);
        bezelM.AppendTo(m, 0, "Bezel / Overlay");
        m.AppendMenuSeparator();

        PanelArtController.PHOSPHOR_THEMES.forEach((pt, i) => {
            phosphorM.AppendMenuItem(0, MID.PHOSPHOR_THEME_BASE + i, pt.name);
        });
        phosphorM.AppendMenuSeparator();
        phosphorM.AppendMenuItem(0, MID.PHOSPHOR_THEME_BASE + PanelArtController.PHOSPHOR_THEMES.length, "Custom Color...");
        phosphorM.CheckMenuRadioItem(MID.PHOSPHOR_THEME_BASE, MID.PHOSPHOR_THEME_BASE + PanelArtController.PHOSPHOR_THEMES.length, MID.PHOSPHOR_THEME_BASE + this.config.phosphorTheme);
        phosphorM.AppendTo(overlayM, 0, "Phosphor Palette");

        overlayM.AppendMenuSeparator();
        overlayM.AppendMenuItem(0, MID.OVERLAY_ALL_OFF, "Disable All Overlays");
        if (this.config.overlayAllOff) overlayM.CheckMenuRadioItem(MID.OVERLAY_ALL_OFF, MID.OVERLAY_ALL_OFF, MID.OVERLAY_ALL_OFF);
        overlayM.AppendMenuSeparator();

        overlayM.AppendMenuItem(0, MID.SHOW_REFLECTION, "Reflection Highlight");
        if (this.config.showReflection) overlayM.CheckMenuRadioItem(MID.SHOW_REFLECTION, MID.SHOW_REFLECTION, MID.SHOW_REFLECTION);
        overlayM.AppendMenuItem(0, MID.SHOW_GLOW, "CRT Outer Glow");
        if (this.config.showGlow) overlayM.CheckMenuRadioItem(MID.SHOW_GLOW, MID.SHOW_GLOW, MID.SHOW_GLOW);
        overlayM.AppendMenuItem(0, MID.SHOW_SCANLINES, "CRT Scanlines");
        if (this.config.showScanlines) overlayM.CheckMenuRadioItem(MID.SHOW_SCANLINES, MID.SHOW_SCANLINES, MID.SHOW_SCANLINES);
        overlayM.AppendMenuItem(0, MID.SHOW_PHOSPHOR, "Phosphor Mask");
        if (this.config.showPhosphor) overlayM.CheckMenuRadioItem(MID.SHOW_PHOSPHOR, MID.SHOW_PHOSPHOR, MID.SHOW_PHOSPHOR);

        overlayM.AppendMenuSeparator();
        opacityM.AppendMenuItem(0, MID.OPACITY_REFL, `Reflection Opacity... (${this.config.opReflection})`);
        opacityM.AppendMenuItem(0, MID.OPACITY_GLOW, `Glow Opacity... (${this.config.opGlow})`);
        opacityM.AppendMenuItem(0, MID.OPACITY_SCAN, `Scanlines Opacity... (${this.config.opScanlines})`);
        opacityM.AppendMenuItem(0, MID.OPACITY_PHOS, `Phosphor Opacity... (${this.config.opPhosphor})`);
        opacityM.AppendTo(overlayM, 0, "Adjust Opacities");
        overlayM.AppendTo(m, 0, "Overlay Effects");

        artM.AppendMenuItem(0, MID.ALBUM_ART_ENABLE, "Enable Album Art");
        if (this.config.albumArtEnabled) artM.CheckMenuRadioItem(MID.ALBUM_ART_ENABLE, MID.ALBUM_ART_ENABLE, MID.ALBUM_ART_ENABLE);
        artM.AppendMenuSeparator();
        PanelArtController.VALID_FLOATS.forEach((flt, i) => {
            floatM.AppendMenuItem(0, MID.FLOAT_BASE + i, `Float: ${flt.toUpperCase()}`);
        });
        const fltIdx = PanelArtController.VALID_FLOATS.indexOf(this.config.albumArtFloat);
        if (fltIdx !== -1) floatM.CheckMenuRadioItem(MID.FLOAT_BASE, MID.FLOAT_BASE + PanelArtController.VALID_FLOATS.length - 1, MID.FLOAT_BASE + fltIdx);
        floatM.AppendTo(artM, 0, "Placement Float");
        artM.AppendMenuItem(0, MID.ART_PADDING, `Art Padding... (${this.config.albumArtPadding}px)`);
        artM.AppendTo(panelM, 0, "Album Art");

        alignHM.AppendMenuItem(0, MID.ALIGN_H_LEFT, "Left");
        alignHM.AppendMenuItem(0, MID.ALIGN_H_CENTER, "Center");
        alignHM.AppendMenuItem(0, MID.ALIGN_H_RIGHT, "Right");
        alignHM.CheckMenuRadioItem(MID.ALIGN_H_LEFT, MID.ALIGN_H_RIGHT, MID.ALIGN_H_LEFT + this.config.layoutAlignH);
        alignHM.AppendTo(textM, 0, "Horizontal Alignment");

        alignVM.AppendMenuItem(0, MID.ALIGN_V_TOP, "Top");
        alignVM.AppendMenuItem(0, MID.ALIGN_V_CENTER, "Center");
        alignVM.AppendMenuItem(0, MID.ALIGN_V_BOTTOM, "Bottom");
        alignVM.CheckMenuRadioItem(MID.ALIGN_V_CENTER, MID.ALIGN_V_TOP, MID.ALIGN_V_CENTER + (this.config.layoutAlignV === 0 ? 0 : this.config.layoutAlignV === 1 ? 1 : 2));
        alignVM.AppendTo(textM, 0, "Vertical Alignment");

        textM.AppendMenuSeparator();
        textM.AppendMenuItem(0, MID.TEXT_SHADOW, "Text Drop Shadow");
        if (this.config.textShadowEnabled) textM.CheckMenuRadioItem(MID.TEXT_SHADOW, MID.TEXT_SHADOW, MID.TEXT_SHADOW);
        textM.AppendMenuItem(0, MID.EXTRA_INFO, "Show Extra Info (Album/Date/Length)");
        if (this.config.extraInfoEnabled) textM.CheckMenuRadioItem(MID.EXTRA_INFO, MID.EXTRA_INFO, MID.EXTRA_INFO);
        textM.AppendMenuSeparator();

        fontM.AppendMenuItem(0, MID.FONT_TITLE, `Title Font... (${this.config.titleFontName}, ${this.config.titleFontSize}pt)`);
        fontM.AppendMenuItem(0, MID.FONT_ARTIST, `Artist Font... (${this.config.artistFontName}, ${this.config.artistFontSize}pt)`);
        fontM.AppendMenuItem(0, MID.FONT_EXTRA, `Extra Info Font... (${this.config.extraFontName}, ${this.config.extraFontSize}pt)`);
        fontM.AppendTo(textM, 0, "Fonts");
        textM.AppendTo(panelM, 0, "Text & Metadata");

        borderM.AppendMenuItem(0, MID.BORDER_SIZE, `Set Border Size... (${this.config.borderSize}px)`);
        borderM.AppendMenuItem(0, MID.BORDER_COLOR, "Change Border Color...");
        borderM.AppendMenuSeparator();
        borderM.AppendMenuItem(0, MID.PAD_LEFT, `Left Padding... (${this.config.padLeft}px)`);
        borderM.AppendMenuItem(0, MID.PAD_RIGHT, `Right Padding... (${this.config.padRight}px)`);
        borderM.AppendMenuItem(0, MID.PAD_TOP, `Top Padding... (${this.config.padTop}px)`);
        borderM.AppendMenuItem(0, MID.PAD_BOTTOM, `Bottom Padding... (${this.config.padBottom}px)`);
        borderM.AppendTo(panelM, 0, "Border & Padding");

        bgM.AppendMenuItem(0, MID.BG_USE_UI_COLOR, "Use UI Color");
        if (this.config.bgUseUIColor) bgM.CheckMenuRadioItem(MID.BG_USE_UI_COLOR, MID.BG_USE_UI_COLOR, MID.BG_USE_UI_COLOR);
        bgM.AppendMenuItem(0, MID.BG_ENABLE, "Enable Background Art");
        if (this.config.backgroundEnabled) bgM.CheckMenuRadioItem(MID.BG_ENABLE, MID.BG_ENABLE, MID.BG_ENABLE);
        bgM.AppendMenuItem(0, MID.BG_BLUR_ENABLE, "Enable Blurred Backdrop");
        if (this.config.blurEnabled) bgM.CheckMenuRadioItem(MID.BG_BLUR_ENABLE, MID.BG_BLUR_ENABLE, MID.BG_BLUR_ENABLE);
        bgM.AppendMenuItem(0, MID.BG_CUSTOM_COLOR, "Custom Background Color...");
        bgM.AppendMenuSeparator();

        [20, 60, 100, 140, 180, 220, 240, 254].forEach((rad, i) => {
            blurM.AppendMenuItem(0, MID.BLUR_RADIUS_BASE + i, `Blur Radius: ${rad}`);
        });
        const radIdx = [20, 60, 100, 140, 180, 220, 240, 254].indexOf(this.config.blurRadius);
        if (radIdx !== -1) blurM.CheckMenuRadioItem(MID.BLUR_RADIUS_BASE, MID.BLUR_RADIUS_BASE + 7, MID.BLUR_RADIUS_BASE + radIdx);
        blurM.AppendTo(bgM, 0, "Blur Radius");

        [0, 10, 20, 30, 40, 50].forEach((pct, i) => {
            darkenM.AppendMenuItem(0, MID.DARKEN_BASE + i, `Darken ${pct}%`);
        });
        const dkIdx = [0, 10, 20, 30, 40, 50].indexOf(this.config.darkenValue);
        if (dkIdx !== -1) darkenM.CheckMenuRadioItem(MID.DARKEN_BASE, MID.DARKEN_BASE + 5, MID.DARKEN_BASE + dkIdx);
        darkenM.AppendTo(bgM, 0, "Darken Backdrop");
        bgM.AppendTo(panelM, 0, "Background");

        panelM.AppendTo(m, 0, "Panel Layout & Art");
        m.AppendMenuSeparator();

        customFM.AppendMenuItem(0, MID.CUSTOM_FOLDER_ADD, "Add Custom Folder Path...");
        customFM.AppendMenuSeparator();
        [1, 2, 3, 4].forEach(d => {
            depthM.AppendMenuItem(0, MID.FOLDER_DEPTH_BASE + (d - 1), `${d} Sub-folder${d > 1 ? 's' : ''} Deep`);
        });
        depthM.CheckMenuRadioItem(MID.FOLDER_DEPTH_BASE, MID.FOLDER_DEPTH_BASE + 3, MID.FOLDER_DEPTH_BASE + (this.config.customFolderDepth - 1));
        depthM.AppendTo(customFM, 0, "Folder Match Depth");

        if (this.#customFolders.length > 0) {
            customFM.AppendMenuSeparator();
            this.#customFolders.forEach((f, i) => {
                const shortName = f.length > 45 ? `...${f.substring(f.length - 42)}` : f;
                customFM.AppendMenuItem(0, MID.REMOVE_FOLDER_BASE + i, `Remove: ${shortName}`);
            });
            customFM.AppendMenuSeparator();
            customFM.AppendMenuItem(0, MID.CLEAR_CUSTOM_FOLDERS, "Clear All Custom Folders");
        }
        customFM.AppendTo(m, 0, "Custom Artwork Folders");

        m.AppendMenuItem(0, MID.IMAGE_FOLDER_SET, (this.config.imageFolder && utils.IsDirectory(this.config.imageFolder)) ? "Change Image Folder..." : "Set Image Folder...");
        m.AppendMenuItem(0, MID.SHOW_SINGLE_IMAGE, "Show Single Image");
        if (this.config.imageMode) m.CheckMenuRadioItem(MID.SHOW_SINGLE_IMAGE, MID.SHOW_SINGLE_IMAGE, MID.SHOW_SINGLE_IMAGE);
        m.AppendMenuItem(0, MID.SLIDE_SHOW, "Slide Show");
        if (this.config.slideMode) m.CheckMenuRadioItem(MID.SLIDE_SHOW, MID.SLIDE_SHOW, MID.SLIDE_SHOW);
        m.AppendMenuSeparator();

        [1, 2, 3].forEach(i => {
            const hasPreset = Boolean(window.GetProperty(`PA.Preset${i}`, null));
            loadM.AppendMenuItem(hasPreset ? 0 : 0x0001, MID.PRESET_LOAD_BASE + (i - 1), `Preset ${i}${hasPreset ? '' : ' (Empty)'}`);
        });
        loadM.AppendTo(presetM, 0, "Load Preset");
        [1, 2, 3].forEach(i => saveM.AppendMenuItem(0, MID.PRESET_SAVE_BASE + (i - 1), `Preset ${i}`));
        saveM.AppendTo(presetM, 0, "Save Preset");
        presetM.AppendTo(m, 0, "Presets");

        m.AppendMenuSeparator();
        m.AppendMenuItem(0, MID.GLITCH_ENABLE, "Glitch Effect on Track Change");
        if (this.config.glitchEnabled) m.CheckMenuRadioItem(MID.GLITCH_ENABLE, MID.GLITCH_ENABLE, MID.GLITCH_ENABLE);

        m.AppendMenuItem(0, MID.RELOAD_ART, "Reload Artwork");
        m.AppendMenuItem(0, MID.RESET_DEFAULTS, "Reset Visual Settings to Defaults");
        m.AppendMenuItem(0, MID.FACTORY_RESET, "Factory Reset (All Settings & Folders)...");

        let id = 0;
        try {
            id = m.TrackPopupMenu(x, y);
        } finally {
            allMenus.forEach(menu => { try { if (menu) menu.Dispose(); } catch {} });
        }

        if (id === 0) return true;

        if (id >= MID.PHOSPHOR_THEME_BASE && id < MID.PHOSPHOR_THEME_BASE + PanelArtController.PHOSPHOR_THEMES.length) {
            this.config.phosphorTheme = id - MID.PHOSPHOR_THEME_BASE;
            this.#dirtyFlags |= PanelArtController.DIRTY.OVERLAY;
            this.#rebuildOverlay();
        } else if (id === MID.PHOSPHOR_THEME_BASE + PanelArtController.PHOSPHOR_THEMES.length) {
            const c = utils.ColourPicker(window.ID, this.config.customPhosphorColor);
            if (c !== -1) {
                this.config.customPhosphorColor = (c | 0xFF000000) >>> 0;
                this.config.phosphorTheme = PanelArtController.PHOSPHOR_THEMES.length;
                this.#dirtyFlags |= PanelArtController.DIRTY.OVERLAY;
                this.#rebuildOverlay();
            }
        } else if (id === MID.OVERLAY_ALL_OFF) {
            this.config.overlayAllOff = !this.config.overlayAllOff;
            this.#dirtyFlags |= PanelArtController.DIRTY.OVERLAY;
            this.#rebuildOverlay();
        } else if (id === MID.SHOW_REFLECTION) {
            this.config.showReflection = !this.config.showReflection;
            this.#dirtyFlags |= PanelArtController.DIRTY.OVERLAY;
            this.#rebuildOverlay();
        } else if (id === MID.SHOW_GLOW) { 
            this.config.showGlow = !this.config.showGlow; 
            this.#dirtyFlags |= PanelArtController.DIRTY.LAYOUT;
            window.Repaint(); 
        } else if (id === MID.SHOW_SCANLINES) {
            this.config.showScanlines = !this.config.showScanlines;
            this.#dirtyFlags |= PanelArtController.DIRTY.OVERLAY;
            this.#rebuildOverlay();
        } else if (id === MID.SHOW_PHOSPHOR) {
            this.config.showPhosphor = !this.config.showPhosphor;
            this.#dirtyFlags |= PanelArtController.DIRTY.OVERLAY;
            this.#rebuildOverlay();
        } else if (id === MID.OPACITY_REFL) {
            this.setOpacityTarget('Reflection');
        } else if (id === MID.OPACITY_GLOW) {
            this.setOpacityTarget('Glow');
        } else if (id === MID.OPACITY_SCAN) {
            this.setOpacityTarget('Scanlines');
        } else if (id === MID.OPACITY_PHOS) {
            this.setOpacityTarget('Phosphor');
        } else if (id === MID.ALBUM_ART_ENABLE) {
            this.config.albumArtEnabled = !this.config.albumArtEnabled;
            this.#dirtyFlags |= PanelArtController.DIRTY.LAYOUT;
        } else if (id >= MID.FLOAT_BASE && id < MID.FLOAT_BASE + PanelArtController.VALID_FLOATS.length) {
            this.config.albumArtFloat = PanelArtController.VALID_FLOATS[id - MID.FLOAT_BASE];
            this.#dirtyFlags |= PanelArtController.DIRTY.LAYOUT;
        } else if (id === MID.ART_PADDING) {
            this.setOpacityTarget('Padding');
        } else if (id === MID.FONT_TITLE) {
            const f = GdiUtils.prompt("Title Font Name:", "Typography", this.config.titleFontName);
            if (f) { this.config.titleFontName = f; this.#dirtyFlags |= PanelArtController.DIRTY.TEXT; }
            const s = GdiUtils.prompt("Title Font Size (pt):", "Typography", this.config.titleFontSize);
            if (s) { this.config.titleFontSize = GdiUtils.clamp(parseInt(s, 10) || 42, 12, 100); this.#dirtyFlags |= PanelArtController.DIRTY.TEXT; }
        } else if (id === MID.FONT_ARTIST) {
            const f = GdiUtils.prompt("Artist Font Name:", "Typography", this.config.artistFontName);
            if (f) { this.config.artistFontName = f; this.#dirtyFlags |= PanelArtController.DIRTY.TEXT; }
            const s = GdiUtils.prompt("Artist Font Size (pt):", "Typography", this.config.artistFontSize);
            if (s) { this.config.artistFontSize = GdiUtils.clamp(parseInt(s, 10) || 28, 10, 80); this.#dirtyFlags |= PanelArtController.DIRTY.TEXT; }
        } else if (id === MID.FONT_EXTRA) {
            const f = GdiUtils.prompt("Extra Info Font Name:", "Typography", this.config.extraFontName);
            if (f) { this.config.extraFontName = f; this.#dirtyFlags |= PanelArtController.DIRTY.TEXT; }
            const s = GdiUtils.prompt("Extra Font Size (pt):", "Typography", this.config.extraFontSize);
            if (s) { this.config.extraFontSize = GdiUtils.clamp(parseInt(s, 10) || 20, 8, 60); this.#dirtyFlags |= PanelArtController.DIRTY.TEXT; }
        } else if (id === MID.ALIGN_V_CENTER) {
            this.config.layoutAlignV = 0;
            this.#dirtyFlags |= PanelArtController.DIRTY.TEXT;
        } else if (id === MID.ALIGN_V_BOTTOM) {
            this.config.layoutAlignV = 1;
            this.#dirtyFlags |= PanelArtController.DIRTY.TEXT;
        } else if (id === MID.ALIGN_V_TOP) {
            this.config.layoutAlignV = 2;
            this.#dirtyFlags |= PanelArtController.DIRTY.TEXT;
        } else if (id >= MID.ALIGN_H_LEFT && id <= MID.ALIGN_H_RIGHT) {
            this.config.layoutAlignH = id - MID.ALIGN_H_LEFT;
            this.#dirtyFlags |= PanelArtController.DIRTY.TEXT;
        } else if (id === MID.TEXT_SHADOW) {
            this.config.textShadowEnabled = !this.config.textShadowEnabled;
            this.#dirtyFlags |= PanelArtController.DIRTY.TEXT;
        } else if (id === MID.EXTRA_INFO) {
            this.config.extraInfoEnabled = !this.config.extraInfoEnabled;
            this.#dirtyFlags |= (PanelArtController.DIRTY.LAYOUT | PanelArtController.DIRTY.TEXT);
        } else if (id === MID.BORDER_SIZE) {
            const val = GdiUtils.prompt("Enter border thickness (0-50 px):", "Border Frame", this.config.borderSize);
            if (val !== null) { 
                this.config.borderSize = GdiUtils.clamp(parseInt(val, 10) || 0, 0, 50); 
                this.#dirtyFlags |= (PanelArtController.DIRTY.LAYOUT | PanelArtController.DIRTY.OVERLAY); 
                this.#rebuildOverlay(); 
            }
        } else if (id === MID.BORDER_COLOR) {
            const c = utils.ColourPicker(window.ID, this.config.borderColor);
            if (c !== -1) { 
                this.config.borderColor = (c | 0xFF000000) >>> 0; 
                this.#dirtyFlags |= PanelArtController.DIRTY.OVERLAY; 
                this.#rebuildOverlay(); 
            }
        } else if (id === MID.PAD_LEFT) {
            const val = GdiUtils.prompt("Enter left padding (0-100 px):", "Left Padding", this.config.padLeft);
            if (val !== null) { this.config.padLeft = GdiUtils.clamp(parseInt(val, 10) || 0, 0, 100); this.#dirtyFlags |= PanelArtController.DIRTY.LAYOUT; }
        } else if (id === MID.PAD_RIGHT) {
            const val = GdiUtils.prompt("Enter right padding (0-100 px):", "Right Padding", this.config.padRight);
            if (val !== null) { this.config.padRight = GdiUtils.clamp(parseInt(val, 10) || 0, 0, 100); this.#dirtyFlags |= PanelArtController.DIRTY.LAYOUT; }
        } else if (id === MID.PAD_TOP) {
            const val = GdiUtils.prompt("Enter top padding (0-100 px):", "Top Padding", this.config.padTop);
            if (val !== null) { this.config.padTop = GdiUtils.clamp(parseInt(val, 10) || 0, 0, 100); this.#dirtyFlags |= PanelArtController.DIRTY.LAYOUT; }
        } else if (id === MID.PAD_BOTTOM) {
            const val = GdiUtils.prompt("Enter bottom padding (0-100 px):", "Bottom Padding", this.config.padBottom);
            if (val !== null) { this.config.padBottom = GdiUtils.clamp(parseInt(val, 10) || 0, 0, 100); this.#dirtyFlags |= PanelArtController.DIRTY.LAYOUT; }
        } else if (id === MID.BG_USE_UI_COLOR) {
            this.config.bgUseUIColor = !this.config.bgUseUIColor;
            this.#dirtyFlags |= PanelArtController.DIRTY.BACKGROUND;
            this.#rebuildBackground();
        } else if (id === MID.BG_ENABLE) {
            this.config.backgroundEnabled = !this.config.backgroundEnabled;
            this.#dirtyFlags |= PanelArtController.DIRTY.BACKGROUND;
            this.#rebuildBackground();
        } else if (id === MID.BG_BLUR_ENABLE) {
            this.config.blurEnabled = !this.config.blurEnabled;
            this.#dirtyFlags |= PanelArtController.DIRTY.BACKGROUND;
            this.#rebuildBackground();
        } else if (id === MID.BG_CUSTOM_COLOR) {
            const c = utils.ColourPicker(window.ID, this.config.customBgColor);
            if (c !== -1) { 
                this.config.customBgColor = (c | 0xFF000000) >>> 0; 
                this.#dirtyFlags |= PanelArtController.DIRTY.BACKGROUND; 
                this.#rebuildBackground(); 
            }
        } else if (id >= MID.BLUR_RADIUS_BASE && id <= MID.BLUR_RADIUS_BASE + 7) {
            this.config.blurRadius = [20, 60, 100, 140, 180, 220, 240, 254][id - MID.BLUR_RADIUS_BASE];
            this.#dirtyFlags |= PanelArtController.DIRTY.BACKGROUND;
            this.#rebuildBackground();
        } else if (id >= MID.DARKEN_BASE && id <= MID.DARKEN_BASE + 5) {
            this.config.darkenValue = (id - MID.DARKEN_BASE) * 10;
            this.#dirtyFlags |= PanelArtController.DIRTY.BACKGROUND;
            this.#rebuildBackground();
        } else if (id === MID.CUSTOM_FOLDER_ADD) {
            const f = GdiUtils.prompt("Enter folder path for artwork search:", "Add Custom Artwork Folder", "");
            if (f) {
                const cleaned = GdiUtils.sanitizePath(f);
                if (cleaned && utils.IsDirectory(cleaned)) {
                    this.#customFolders.push(cleaned);
                    this.saveAll();
                    this.#scanner.clearCaches();
                    if (fb.IsPlaying) this.loadArtworkForTrack(fb.GetNowPlaying());
                    else this.clearTrackDisplay();
                }
            }
        } else if (id >= MID.FOLDER_DEPTH_BASE && id <= MID.FOLDER_DEPTH_BASE + 3) {
            this.config.customFolderDepth = (id - MID.FOLDER_DEPTH_BASE) + 1;
            this.saveAll();
            this.#scanner.clearCaches();
            if (fb.IsPlaying) this.loadArtworkForTrack(fb.GetNowPlaying());
            else this.clearTrackDisplay();
        } else if (id >= MID.REMOVE_FOLDER_BASE && id < MID.REMOVE_FOLDER_BASE + this.#customFolders.length) {
            this.#customFolders.splice(id - MID.REMOVE_FOLDER_BASE, 1);
            this.saveAll();
            this.#scanner.clearCaches();
            if (fb.IsPlaying) this.loadArtworkForTrack(fb.GetNowPlaying());
            else this.clearTrackDisplay();
        } else if (id === MID.CLEAR_CUSTOM_FOLDERS) {
            this.#customFolders = [];
            this.saveAll();
            this.#scanner.clearCaches();
            if (fb.IsPlaying) this.loadArtworkForTrack(fb.GetNowPlaying());
            else this.clearTrackDisplay();
        } else if (id === MID.BEZEL_ENABLE) {
            this.config.bezelEnabled = !this.config.bezelEnabled;
            if (this.config.bezelEnabled && !this.config.bezelFile && bezelNames.length > 0) {
                this.config.bezelFile = bezelNames[0];
            }
            this.loadBezel();
            this.#dirtyFlags |= PanelArtController.DIRTY.OVERLAY;
            this.#rebuildOverlay();
        } else if (id === MID.BEZEL_NONE) {
            this.config.bezelEnabled = false;
            this.config.bezelFile = '';
            this.loadBezel();
            this.#dirtyFlags |= PanelArtController.DIRTY.OVERLAY;
            this.#rebuildOverlay();
        } else if (id >= MID.BEZEL_BASE && id < MID.BEZEL_BASE + bezelNames.length) {
            this.config.bezelEnabled = true;
            this.config.bezelFile = bezelNames[id - MID.BEZEL_BASE];
            this.loadBezel();
            this.#dirtyFlags |= PanelArtController.DIRTY.OVERLAY;
            this.#rebuildOverlay();
        } else if (id === MID.BEZEL_FOLDER) {
            const f = GdiUtils.prompt("Enter folder path containing bezel/overlay images:", "Set Bezel Folder", this.config.bezelFolder);
            if (f) {
                const cleaned = GdiUtils.sanitizePath(f);
                if (cleaned && utils.IsDirectory(cleaned)) {
                    this.config.bezelFolder = cleaned;
                    this.#cachedBezelImages = null;
                    this.loadBezel();
                    this.#dirtyFlags |= PanelArtController.DIRTY.OVERLAY;
                    this.#rebuildOverlay();
                    this.saveAll();
                    window.Repaint();
                }
            }
        } else if (id === MID.BEZEL_RELOAD) {
            this.#cachedBezelImages = null;
            this.loadBezel();
            this.#dirtyFlags |= PanelArtController.DIRTY.OVERLAY;
            this.#rebuildOverlay();
            this.saveAll();
            window.Repaint();
        } else if (id === MID.IMAGE_FOLDER_SET) {
            const f = GdiUtils.prompt("Enter custom image folder path for slideshow/display:", "Set Image Folder", this.config.imageFolder);
            if (f) {
                const cleaned = GdiUtils.sanitizePath(f);
                if (cleaned && utils.IsDirectory(cleaned)) {
                    this.config.imageFolder = cleaned;
                    this.#slideImages = null;
                    this.saveAll();
                    if (this.config.imageMode) this.startImageMode(false);
                    else if (this.config.slideMode) this.startSlideMode(false);
                }
            }
        } else if (id === MID.SHOW_SINGLE_IMAGE) {
            this.config.imageMode ? this.stopImageMode() : this.startImageMode(true);
        } else if (id === MID.SLIDE_SHOW) {
            this.config.slideMode ? this.stopSlideMode() : this.startSlideMode(true);
        } else if (id >= MID.PRESET_LOAD_BASE && id <= MID.PRESET_LOAD_BASE + 2) {
            this.loadPreset((id - MID.PRESET_LOAD_BASE) + 1);
        } else if (id >= MID.PRESET_SAVE_BASE && id <= MID.PRESET_SAVE_BASE + 2) {
            this.savePreset((id - MID.PRESET_SAVE_BASE) + 1);
        } else if (id === MID.GLITCH_ENABLE) {
            this.config.glitchEnabled = !this.config.glitchEnabled;
            if (this.config.glitchEnabled) this.triggerGlitch();
        } else if (id === MID.RELOAD_ART) {
            this.#scanner.clearCaches();
            this.#slideImages = null;
            this.loadBezel();
            if (fb.IsPlaying) this.loadArtworkForTrack(fb.GetNowPlaying());
            else this.clearTrackDisplay();
        } else if (id === MID.RESET_DEFAULTS) {
            this.stopSlideMode(false);
            this.stopImageMode(false);
            Object.assign(this.config, {
                albumArtEnabled: true, albumArtFloat: 'left', albumArtPadding: 0,
                padLeft: 10, padRight: 10, padTop: 10, padBottom: 10, borderSize: 10, borderColor: GdiUtils.RGB(32, 32, 32),
                backgroundEnabled: true, blurEnabled: true, blurRadius: 240, darkenValue: 10,
                customBgColor: GdiUtils.RGB(25, 25, 25), bgUseUIColor: false,
                showReflection: true, opReflection: 25, showGlow: false, opGlow: 80,
                showScanlines: false, opScanlines: 100, showPhosphor: true, opPhosphor: 20,
                phosphorTheme: 8, overlayAllOff: false, customFolderDepth: 2,
                layoutAlignV: 0, layoutAlignH: 1, textShadowEnabled: true, extraInfoEnabled: true, glitchEnabled: true,
                titleFontName: 'Segoe UI', titleFontSize: 42, artistFontName: 'Segoe UI', artistFontSize: 28,
                extraFontName: 'Segoe UI', extraFontSize: 20, imageMode: false, slideMode: false,
                bezelEnabled: false, bezelFile: ''
            });
            this.loadBezel();
            this.#dirtyFlags = PanelArtController.DIRTY.ALL;
            this.#rebuildBackground();
            this.#rebuildOverlay();
        } else if (id === MID.FACTORY_RESET) {
            const confirm = GdiUtils.prompt("Type YES to reset all settings, custom folders and paths to factory defaults:", "Confirm Factory Reset", "");
            if (confirm?.toUpperCase() === 'YES') {
                this.stopSlideMode(false);
                this.stopImageMode(false);
                this.#customFolders = [];
                this.config.imageFolder = `${this.#profileBase}skins\\images`;
                this.config.bezelFolder = `${this.#profileBase}skins\\overlay`;
                this.config.customPhosphorColor = 0xFFFFFFFF;
                for (let p = 1; p <= 3; p++) window.SetProperty(`PA.Preset${p}`, '');
                Object.assign(this.config, {
                    albumArtEnabled: true, albumArtFloat: 'left', albumArtPadding: 0,
                    padLeft: 10, padRight: 10, padTop: 10, padBottom: 10, borderSize: 10, borderColor: GdiUtils.RGB(32, 32, 32),
                    backgroundEnabled: true, blurEnabled: true, blurRadius: 240, darkenValue: 10,
                    customBgColor: GdiUtils.RGB(25, 25, 25), bgUseUIColor: false,
                    showReflection: true, opReflection: 25, showGlow: false, opGlow: 80,
                    showScanlines: false, opScanlines: 100, showPhosphor: true, opPhosphor: 20,
                    phosphorTheme: 8, overlayAllOff: false, customFolderDepth: 2,
                    layoutAlignV: 0, layoutAlignH: 1, textShadowEnabled: true, extraInfoEnabled: true, glitchEnabled: true,
                    titleFontName: 'Segoe UI', titleFontSize: 42, artistFontName: 'Segoe UI', artistFontSize: 28,
                    extraFontName: 'Segoe UI', extraFontSize: 20, imageMode: false, slideMode: false,
                    bezelEnabled: false, bezelFile: ''
                });
                this.#scanner.clearCaches();
                this.#slideImages = null;
                this.loadBezel();
                this.#dirtyFlags = PanelArtController.DIRTY.ALL;
                this.#rebuildBackground();
                this.#rebuildOverlay();
                if (fb.IsPlaying) this.loadArtworkForTrack(fb.GetNowPlaying());
                else this.clearTrackDisplay();
            }
        }

        this.requestSave();
        window.Repaint();
        return true;
    }

    // ========================================================================================
    // EVENT DELEGATION
    // ========================================================================================
    onSize() {
        if (this.#lifecycle !== PanelArtController.LIFECYCLE.LIVE) return;
        const w = window.Width, h = window.Height;
        if (w <= 0 || h <= 0) return;

        this.#dirtyFlags = PanelArtController.DIRTY.ALL;
        this.#rebuildBackground();
        this.#rebuildOverlay();
        window.Repaint();
    }

    onAlbumArtDone(handle, art_id, image, image_path) {
        if (this.#lifecycle !== PanelArtController.LIFECYCLE.LIVE) {
            if (image) { try { image.Dispose(); } catch {} }
            return;
        }

        // Generation Check: Reject callbacks that resolved after a newer track started
        if (image) {
            if (this.#coverImg) { try { this.#coverImg.Dispose(); } catch {} }
            this.#coverImg = image;
            this.#currentCoverPath = image_path || '';
            if (this.#currentArtKey) {
                this.#scanner.setArtMemoryCache(this.#currentArtKey, this.#currentCoverPath);
            }
        } else {
            if (this.#coverImg) { try { this.#coverImg.Dispose(); } catch {} }
            this.#coverImg = null;
            this.#currentCoverPath = '';
        }

        this.#dirtyFlags |= (PanelArtController.DIRTY.LAYOUT | PanelArtController.DIRTY.TEXT | PanelArtController.DIRTY.BACKGROUND);
        this.#rebuildBackground();
        window.Repaint();
    }

    getOpacity(target) {
        switch (target) {
            case 'Reflection': return this.config.opReflection;
            case 'Glow':       return this.config.opGlow;
            case 'Scanlines':  return this.config.opScanlines;
            case 'Phosphor':   return this.config.opPhosphor;
            case 'Padding':    return this.config.albumArtPadding;
            default:           return 255;
        }
    }

    setOpacity(target, val) {
        const max = target === 'Padding' ? 100 : 255;
        const clamped = GdiUtils.clamp(val, 0, max);
        switch (target) {
            case 'Reflection': this.config.opReflection = clamped; this.#dirtyFlags |= PanelArtController.DIRTY.OVERLAY; break;
            case 'Glow':       this.config.opGlow = clamped; this.#dirtyFlags |= PanelArtController.DIRTY.LAYOUT; break;
            case 'Scanlines':  this.config.opScanlines = clamped; this.#dirtyFlags |= PanelArtController.DIRTY.OVERLAY; break;
            case 'Phosphor':   this.config.opPhosphor = clamped; this.#dirtyFlags |= PanelArtController.DIRTY.OVERLAY; break;
            case 'Padding':    this.config.albumArtPadding = clamped; this.#dirtyFlags |= PanelArtController.DIRTY.LAYOUT; break;
        }
        this.#rebuildOverlay();
        this.requestSave();
        window.Repaint();
    }

    onMouseWheel(step) {
        if (this.#lifecycle !== PanelArtController.LIFECYCLE.LIVE) return false;
        if (this.#opacityTarget) {
            this.setOpacity(this.#opacityTarget, this.getOpacity(this.#opacityTarget) + (step > 0 ? 5 : -5));
            window.Repaint();
            return true;
        }
        return false;
    }

    setOpacityTarget(target) {
        this.#opacityTarget = target;
        window.Repaint();
    }

    loadPreset(slot) {
        if (slot < 1 || slot > 3) return;
        const raw = window.GetProperty(`PA.Preset${slot}`, null);
        if (!raw) return;
        try {
            const d = JSON.parse(raw);
            for (const [k, v] of Object.entries(d)) {
                if (Object.prototype.hasOwnProperty.call(this.config, k)) this.config[k] = v;
            }
            this.#dirtyFlags = PanelArtController.DIRTY.ALL;
            this.#scanner.clearCaches();
            this.#slideImages = null;
            this.loadBezel();
            this.#rebuildBackground();
            this.#rebuildOverlay();
            this.requestSave();
            window.Repaint();
        } catch (err) {
            console.log(new Error(`Failed to load preset ${slot}`, { cause: err }));
        }
    }

    savePreset(slot) {
        if (slot < 1 || slot > 3) return;
        window.SetProperty(`PA.Preset${slot}`, JSON.stringify(this.config));
    }

    onNotifyData(name, info) {
        if (this.#lifecycle !== PanelArtController.LIFECYCLE.LIVE) return;
        if (name === 'ArtFolder' && info && !fb.IsPlaying) {
            if (!utils.IsDirectory(info)) return;

            const thisToken = ++this.#artGenerationToken;
            if (this.#pendingSearchTimer) { window.ClearTimeout(this.#pendingSearchTimer); this.#pendingSearchTimer = null; }

            this.#pendingSearchTimer = window.SetTimeout(() => {
                this.#pendingSearchTimer = null;
                if (thisToken !== this.#artGenerationToken || this.#lifecycle !== PanelArtController.LIFECYCLE.LIVE || fb.IsPlaying) return;

                const res = this.#scanner.searchDirectory(info, ArtScanner.FAST_NAMES, true, false, this.config.customFolderDepth);
                if (thisToken !== this.#artGenerationToken || this.#lifecycle !== PanelArtController.LIFECYCLE.LIVE || fb.IsPlaying) return;

                if (res) this.applyNewArtwork(res, thisToken);
            }, 30);
        }
    }

    onMetadbChanged(handle_list, fromhook) {
        if (fromhook || !fb.IsPlaying || !handle_list) return;
        try {
            const np = fb.GetNowPlaying();
            if (!np || handle_list.Find(np) === -1) return;

            let trackDir = '', rawAlbum = '', rawDisc = '', rawTitle = '', rawArtist = '', rawDate = '', rawLen = '';
            try {
                const raw = this.#compoundTf.EvalWithMetadb(np, true) ?? '';
                const parts = raw.split('\x01');
                trackDir  = parts[0] ?? '';
                rawArtist = parts[1] ?? '';
                rawAlbum  = parts[2] ?? '';
                rawTitle  = parts[4] ?? '';
                rawDate   = parts[5] ?? '';
                rawLen    = parts[6] ?? '';
                rawDisc   = parts[8] ?? '';
            } catch {}

            const newArtKey = this.#scanner.getArtworkIdentityKey(trackDir, rawAlbum, rawDisc);

            this.#trackInfo.title  = rawTitle || 'Playing';
            this.#trackInfo.artist = rawArtist;
            const extraParts = [rawAlbum.trim(), rawDate.trim(), rawLen.trim()].filter(Boolean);
            this.#trackInfo.extra = extraParts.join(' | ');

            if (newArtKey === this.#currentArtKey) {
                this.#dirtyFlags |= PanelArtController.DIRTY.TEXT;
                window.Repaint();
            } else {
                this.loadArtworkForTrack(np);
            }
        } catch {}
    }

    onFontChanged() {
        this.#fonts.clear();
        this.#hudFont = null;
        this.#dirtyFlags |= (PanelArtController.DIRTY.LAYOUT | PanelArtController.DIRTY.TEXT);
        window.Repaint();
    }

    onKeyDown(vkey) {
        if (vkey === 0x1B) {
            this.setOpacityTarget(null);
            return true;
        }
        if (utils.IsKeyPressed(0x11)) { // VK_CONTROL
            if (vkey === 0x26) { this.cycleBezel(-1); return true; } // UP
            if (vkey === 0x28) { this.cycleBezel(1);  return true; } // DOWN
        }
        return false;
    }

    dispose() {
        this.saveAll();
        this.#lifecycle = PanelArtController.LIFECYCLE.SHUTDOWN;

        if (this.#glitchTimer)        window.ClearInterval(this.#glitchTimer);
        if (this.#slideTimer)         window.ClearInterval(this.#slideTimer);
        if (this.#saveTimeout)        window.ClearTimeout(this.#saveTimeout);
        if (this.#bezelNotifyTimeout) window.ClearTimeout(this.#bezelNotifyTimeout);
        if (this.#pendingSearchTimer) window.ClearTimeout(this.#pendingSearchTimer);

        if (this.#coverImg) { try { this.#coverImg.Dispose(); } catch {} this.#coverImg = null; }
        if (this.#modeImg)  { try { this.#modeImg.Dispose(); }  catch {} this.#modeImg = null; }
        if (this.#bezelBmp) { try { this.#bezelBmp.Dispose(); } catch {} this.#bezelBmp = null; }
        this.#disposeTextBlock();

        this.#backdrop.dispose();
        this.#fonts.clear();
        this.#scanner.clearCaches();
        this.#slideImages = null;
    }
}

// ============================================================================================
// 7. SMP GLOBAL HOOKS & DISPATCH
// ============================================================================================
const app = new PanelArtController();

function on_paint(gr) {
    app.onPaint(gr);
}

function on_size() {
    app.onSize();
}

function on_playback_new_track(metadb) {
    app.loadArtworkForTrack(metadb);
}

function on_playback_stop(reason) {
    if (reason !== 2) app.clearTrackDisplay();
}

function on_playback_pause()    { window.Repaint(); }
function on_playback_starting() { window.Repaint(); }
function on_playback_seek()     { window.Repaint(); }

function on_colours_changed() {
    app.refreshColours();
}

function on_font_changed() {
    app.onFontChanged();
}

function on_metadb_changed(handle_list, fromhook) {
    app.onMetadbChanged(handle_list, fromhook);
}

function on_get_album_art_done(handle, art_id, image, image_path) {
    app.onAlbumArtDone(handle, art_id, image, image_path);
}

function on_mouse_wheel(step) {
    return app.onMouseWheel(step);
}

function on_mouse_rbtn_up(x, y, mask) {
    if (mask & 4) return false;
    return app.showContextMenu(x, y);
}

function on_mouse_lbtn_dblclk() {
    if (app.config.slideMode) {
        app.stopSlideMode();
    } else if (app.config.imageMode) {
        app.stopImageMode();
    } else {
        app.startImageMode(true);
    }
}

function on_mouse_lbtn_up() {
    app.setOpacityTarget(null);
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