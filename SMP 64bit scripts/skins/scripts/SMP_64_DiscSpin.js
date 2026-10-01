'use strict';
		      // -============ AUTHOR L.E.D. ===========- \\
		     // -======= SMP 64bit Disc Spin V5.3 =======- \\
		    // -====== Spins Disc + Artwork + Cover ======- \\

    // ===================*** Foobar2000 64bit ***================== \\
   // ======= For Spider Monkey Panel 64bit, author: marc2003 ======= \\
  // ====== Masking All Images, Creates a Disc from Album Art+  ====== \\
 // ======== Sample Code ApplyMask author: T.P Wang / marc2003 ======== \\
// ==-== Inspired by "CD Album Art, @authors "marc2003, Jul23, vnav" =-==\\

/* 
 * Custom License for foobar2000 Themes
 * Copyright (c) 2026 [L.E.D.]
 * Allowed: Non-commercial use and modification.
 * Prohibited: Paid products/themes, subscriptions, or cloud-bundled services.
 */

window.DefineScript('SMP 64bit Disc Spin', { 
    author: 'L.E.D.', 
    version: '5.2',
    features: { grab_focus: true } 
});

window.DrawMode = 0; // 0 - GDI+ mode, 1 - D2D mode
window.DlgCode  = 0x0004; // DLGC_WANTALLKEYS: Captures arrow keys and modifier shortcuts

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
        // Preserve Windows drive root (e.g., "C:\") and UNC root (e.g., "\\server\share\")
        if (/^[a-zA-Z]:[\\\/]?$/.test(clean)) {
            return clean.substring(0, 2) + '\\';
        }
        if (/^\\\\[^\\]+\\[^\\]+[\\\/]?$/.test(clean)) {
            return clean.replace(/[\\\/]+$/, '') + '\\';
        }
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

    static hsvToArgb(h, s, v, alpha) {
        h = ((h % 360) + 360) % 360;
        const c = v * s;
        const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
        const m = v - c;
        let r = 0, g = 0, b = 0;
        if (h < 60)       { r = c; g = x; b = 0; }
        else if (h < 120) { r = x; g = c; b = 0; }
        else if (h < 180) { r = 0; g = c; b = 0; }
        else if (h < 240) { r = 0; g = x; b = c; }
        else if (h < 300) { r = x; g = 0; b = c; }
        else              { r = c; g = 0; b = x; }
        return ((alpha << 24) | (Math.round((r + m) * 255) << 16)
                      | (Math.round((g + m) * 255) << 8)
                      | Math.round((b + m) * 255)) >>> 0;
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
// 2. ARTWORK & DISCOVERY SCANNER (BUDGET-GUARDED ENGINE)
// ============================================================================================
class ArtScanner {
    static EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.bmp'];
    static FAST_DISC  = ['cd', 'disc', 'vinyl', 'media', 'record', 'cd1', 'disc1'];
    static FAST_COVER = ['cover', 'front', 'folder', 'albumart'];
    static BLACKLIST  = ['back', 'rear', 'tray', 'inlay', 'booklet', 'case', 'matrix', 'spine', 'inside', 'digipak'];
    static DISC_REGEX = /^(?:cd|disc|disk|side|vinyl|disque|vol|part|volume)[\s_.\-]*\d+$/i;
    static MULTI_DISC_PARENT_RE = /[\\/](?:[\s\(\-\[]*)(?:cd|disc|disk|side|vinyl|disque|vol|part|volume)[\s_.\-]*(?:\d+|[ab])[^\\]*$/i;
    static ART_SUBDIRS = ['artwork', 'scans', 'art', 'covers', 'cover', 'images', 'scan', 'disc', 'discs', 'extra', 'extras', 'cd1', 'cd2', 'disc1', 'disc2'];

    #subfolderCache = new Map();
    #dirScanCache   = new Map();
    #artPathCache   = new Map();

    clearCaches() {
        this.#subfolderCache.clear();
        this.#dirScanCache.clear();
        this.#artPathCache.clear();
    }

    getArtworkIdentityKey(trackDir, album, disc, titleOrPath = '') {
        const alb = (album || '').trim().toLowerCase();
        // Fallback to title/path if no album tag exists to prevent loose singles from colliding
        const fallback = alb ? '' : `|${(titleOrPath || '').trim().toLowerCase()}`;
        return `${trackDir || ''}|${alb}|${(disc || '').trim().toLowerCase()}${fallback}`;
    }

    getMemoryCache(key) {
        if (!this.#artPathCache.has(key)) return null;
        const cached = this.#artPathCache.get(key);
        if (cached) {
            const discOk  = !cached.disc || utils.IsFile(cached.disc);
            const coverOk = !cached.cover || utils.IsFile(cached.cover);
            if (discOk && coverOk && (cached.disc || cached.cover)) return cached;
        }
        this.#artPathCache.delete(key);
        return null;
    }

    setMemoryCache(key, val) {
        // Prevent negative caching of null results
        if (!val || (!val.disc && !val.cover)) return;
        if (this.#artPathCache.size > 500) {
            this.#artPathCache.delete(this.#artPathCache.keys().next().value);
        }
        this.#artPathCache.set(key, val);
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

    getFastDiscAndCover(dirPath) {
        if (!dirPath || !utils.IsDirectory(dirPath)) return { disc: null, cover: null };
        const sep = dirPath.endsWith('\\') ? '' : '\\';
        let disc = null;
        let cover = null;

        for (const name of ArtScanner.FAST_DISC) {
            for (const ext of ArtScanner.EXTENSIONS) {
                const p = `${dirPath}${sep}${name}${ext}`;
                if (utils.IsFile(p)) { disc = p; break; }
            }
            if (disc) break;
        }

        for (const name of ArtScanner.FAST_COVER) {
            for (const ext of ArtScanner.EXTENSIONS) {
                const p = `${dirPath}${sep}${name}${ext}`;
                if (utils.IsFile(p)) { cover = p; break; }
            }
            if (cover) break;
        }
        return { disc, cover };
    }

    inspectScoredImages(dirPath, specificPatterns, isDiscMode) {
        const images = this.getFolderImagesList(dirPath);
        if (images.length === 0) return { bestMatch: null, fallbackImage: null };

        let bestMatch = null;
        let highestScore = -1;
        let bestFallback = null;

        const lowerSpecs = specificPatterns?.map(p => p.toLowerCase().trim()).filter(Boolean) ?? [];

        for (const img of images) {
            let score = 0;
            if (isDiscMode) {
                if (['disc', 'cd', 'vinyl', 'record', 'media', 'disc1', 'cd1', 'disc 1', 'cd 1'].includes(img.name)) {
                    score = 100;
                } else if (lowerSpecs.includes(img.name)) {
                    score = 80;
                } else if (img.name.startsWith('disc') || img.name.startsWith('cd') || img.name.startsWith('vinyl')) {
                    score = ArtScanner.BLACKLIST.some(kw => img.name.includes(kw)) ? 5 : 60;
                } else if (lowerSpecs.some(spec => img.name.startsWith(spec))) {
                    score = 50;
                }
            } else {
                if (ArtScanner.FAST_COVER.includes(img.name)) {
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

    searchDirectory(dirPath, specificDisc, specificCover, allowFallback = true, isRootCustom = false, maxDepth = 2, deadline = Infinity, _depth = 0) {
        if (!dirPath || !utils.IsDirectory(dirPath) || Date.now() > deadline) {
            return { disc: null, cover: null };
        }

        const discInspect  = this.inspectScoredImages(dirPath, specificDisc, true);
        const coverInspect = this.inspectScoredImages(dirPath, specificCover, false);
        let disc  = discInspect.bestMatch;
        let cover = coverInspect.bestMatch;

        if (isRootCustom && _depth === 0) return { disc, cover };

        if ((!disc || !cover) && _depth < maxDepth && Date.now() <= deadline) {
            const subDirs = this.getSubfolders(dirPath);

            for (const sub of subDirs) {
                if (Date.now() > deadline) break;
                const name = sub.substring(sub.lastIndexOf('\\') + 1).toLowerCase().trim();
                if (ArtScanner.ART_SUBDIRS.includes(name) || ArtScanner.DISC_REGEX.test(name)) {
                    const subRes = this.searchDirectory(sub, specificDisc, specificCover, allowFallback, false, maxDepth, deadline, _depth + 1);
                    disc  ||= subRes.disc;
                    cover ||= subRes.cover;
                    if (disc && cover) break;
                }
            }

            if ((!disc || !cover) && subDirs.length <= 60 && _depth < 1 && Date.now() <= deadline) {
                for (const sub of subDirs) {
                    if (Date.now() > deadline) break;
                    const name = sub.substring(sub.lastIndexOf('\\') + 1).toLowerCase().trim();
                    if (!ArtScanner.ART_SUBDIRS.includes(name) && !ArtScanner.DISC_REGEX.test(name)) {
                        const subRes = this.searchDirectory(sub, specificDisc, specificCover, false, false, maxDepth, deadline, _depth + 1);
                        disc  ||= subRes.disc;
                        cover ||= subRes.cover;
                        if (disc && cover) break;
                    }
                }
            }
        }

        if (!cover && allowFallback) cover = coverInspect.fallbackImage;
        return { disc, cover };
    }

    findInCustomFolder(cFolder, artistVariants, albumVariants, folderVariants, specificDisc, specificCover, maxDepth, deadline = Infinity) {
        let discPath = null;
        let coverPath = null;

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
            if (Date.now() > deadline) return { disc: discPath, cover: coverPath };
            if (utils.IsDirectory(subDir)) {
                const res = this.searchDirectory(subDir, specificDisc, specificCover, true, false, maxDepth, deadline);
                discPath  ||= res.disc;
                coverPath ||= res.cover;
                if (discPath && coverPath) return { disc: discPath, cover: coverPath };
            }
        }

        if (specificDisc?.length || specificCover?.length) {
            const rootRes = this.searchDirectory(cFolder, specificDisc, specificCover, false, true, maxDepth, deadline);
            discPath  ||= rootRes.disc;
            coverPath ||= rootRes.cover;
            if (discPath && coverPath) return { disc: discPath, cover: coverPath };
        }

        const matchTargets = [];
        for (const art of artistVariants) {
            for (const alb of albumVariants) {
                matchTargets.push(`${art} - ${alb}`, `${art}_${alb}`, `${art} ${alb}`, `${alb} - ${art}`);
            }
        }
        matchTargets.push(...albumVariants, ...folderVariants);

        const scanLevel = (dir, depth) => {
            if (depth > maxDepth || !utils.IsDirectory(dir) || (discPath && coverPath) || Date.now() > deadline) return;

            const subs = this.getSubfolders(dir);
            if (!subs?.length) return;
            const limit = Math.min(subs.length, 120);

            for (let i = 0; i < limit; i++) {
                if (Date.now() > deadline) return;
                const fName = subs[i].substring(subs[i].lastIndexOf('\\') + 1);
                if (this.#matchesList(fName, matchTargets) || this.#matchesList(fName, artistVariants)) {
                    const res = this.searchDirectory(subs[i], specificDisc, specificCover, true, false, maxDepth, deadline);
                    discPath  ||= res.disc;
                    coverPath ||= res.cover;
                    if (discPath && coverPath) return;

                    const aSubs = this.getSubfolders(subs[i]);
                    const aLimit = Math.min(aSubs.length, 60);
                    for (let j = 0; j < aLimit; j++) {
                        if (Date.now() > deadline) return;
                        const aName = aSubs[j].substring(aSubs[j].lastIndexOf('\\') + 1);
                        if (this.#matchesList(aName, matchTargets) || this.#matchesList(aName, albumVariants)) {
                            const aRes = this.searchDirectory(aSubs[j], specificDisc, specificCover, true, false, maxDepth, deadline);
                            discPath  ||= aRes.disc;
                            coverPath ||= aRes.cover;
                            if (discPath && coverPath) return;
                        }
                    }
                }
            }

            if (depth < maxDepth && subs.length <= 60 && Date.now() <= deadline) {
                for (const sub of subs) {
                    const fName = sub.substring(sub.lastIndexOf('\\') + 1).toLowerCase();
                    if (!ArtScanner.ART_SUBDIRS.includes(fName)) {
                        scanLevel(sub, depth + 1);
                        if (discPath && coverPath) return;
                    }
                }
            }
        };

        scanLevel(cFolder, 1);
        return { disc: discPath, cover: coverPath };
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

    isVinylDisc(filePath) {
        if (!filePath) return false;
        const normalized = filePath.replace(/\//g, '\\');
        const lastSlash = normalized.lastIndexOf('\\');
        const fileName = (lastSlash !== -1 ? normalized.substring(lastSlash + 1) : normalized).toLowerCase();
        const baseName = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;

        if (['vinyl', 'record'].includes(baseName) || baseName.startsWith('vinyl') || baseName.endsWith('vinyl') ||
            baseName.includes('_vinyl') || baseName.includes('-vinyl') || baseName.includes(' vinyl') ||
            baseName.includes('vinyl ') || baseName.startsWith('record') || /\b(?:side[\s_.\-]*[ab]|lp\d*)\b/i.test(baseName)) {
            return true;
        }

        if (lastSlash !== -1) {
            const dirPath = normalized.substring(0, lastSlash);
            const parentSlash = dirPath.lastIndexOf('\\');
            const parentDir = (parentSlash !== -1 ? dirPath.substring(parentSlash + 1) : dirPath).toLowerCase().trim();
            if (['vinyl', 'lp', 'records'].includes(parentDir) || /^(?:vinyl|lp)[\s_.\-]*\d+$/i.test(parentDir)) {
                if (!baseName.includes('cd')) return true;
            }
        }
        return false;
    }
}

// ============================================================================================
// 3. PROCEDURAL DISC, MASK & RIM ENGINE (SMP 64-BIT DUAL-PATH FILLPOLYGON)
// ============================================================================================
class ProceduralDiscEngine {
    #maskCache     = new Map();
    #rimCache      = new Map();
    #rimLayerCache = new Map();
    #procDefCache  = new Map();
    #normSrc       = null;
    #normSrcObj    = null;
    #normSrcSize   = 0;

    clearNormalizedCache() {
        if (this.#normSrc) {
            try { this.#normSrc.Dispose(); } catch {}
            this.#normSrc = null;
        }
        this.#normSrcObj = null;
        this.#normSrcSize = 0;
    }

    normalizeSquare(src, baseSize, interpMode) {
        if (!src || src.Width <= 0 || src.Height <= 0) return null;
        const size = Math.max(64, Math.round(baseSize));
        if (this.#normSrc && this.#normSrcObj === src && this.#normSrcSize === size) return this.#normSrc;

        let sq = null, g = null;
        try {
            sq = gdi.CreateImage(size, size);
            g = sq.GetGraphics();
            g.SetInterpolationMode(interpMode === 0 ? 2 : interpMode);

            const minDim = Math.min(src.Width, src.Height);
            const sx = Math.floor((src.Width - minDim) / 2);
            const sy = Math.floor((src.Height - minDim) / 2);

            g.DrawImage(src, 0, 0, size, size, sx, sy, minDim, minDim);
            sq.ReleaseGraphics(g);
            g = null;

            if (this.#normSrc && this.#normSrc !== sq) {
                try { this.#normSrc.Dispose(); } catch {}
            }
            this.#normSrc = sq;
            this.#normSrcObj = src;
            this.#normSrcSize = size;
            return sq;
        } catch {
            if (g && sq) { try { sq.ReleaseGraphics(g); } catch {} }
            if (sq) { try { sq.Dispose(); } catch {} }
            return null;
        }
    }

    loadMask(type, size) {
        if (type >= 2 || size <= 0) return null;
        const key = `${type}:${size}`;
        if (this.#maskCache.has(key)) return this.#maskCache.get(key);

        let mask = null, g = null;
        try {
            mask = gdi.CreateImage(size, size);
            g = mask.GetGraphics();
            g.SetSmoothingMode(2);

            g.FillSolidRect(0, 0, size, size, 0xFFFFFFFF);
            g.FillEllipse(0, 0, size, size, 0xFF000000);

            const cx = size / 2, cy = size / 2;
            const holeRatio = (type === 0) ? 0.15 : 0.025;

            if (holeRatio > 0) {
                const holeSize = Math.max(type === 1 ? 3 : 6, Math.round(size * holeRatio));
                g.FillEllipse(cx - holeSize / 2, cy - holeSize / 2, holeSize, holeSize, 0xFFFFFFFF);
            }

            mask.ReleaseGraphics(g);
            g = null;
            this.#cacheStore(this.#maskCache, key, mask);
            return mask;
        } catch {
            if (g && mask) { try { mask.ReleaseGraphics(g); } catch {} }
            if (mask) { try { mask.Dispose(); } catch {} }
            return null;
        }
    }

    loadCenterRim(size, rimPath) {
        if (size <= 0 || !utils.IsFile(rimPath)) return null;
        const key = `rim:${size}`;
        if (this.#rimCache.has(key)) return this.#rimCache.get(key);

        let raw = null, resized = null;
        try {
            raw = gdi.Image(rimPath);
            if (!raw) return null;
            resized = raw.Resize(size, size);
            try { raw.Dispose(); } catch {}
            raw = null;
            this.#cacheStore(this.#rimCache, key, resized);
            return resized;
        } catch {
            if (raw) { try { raw.Dispose(); } catch {} }
            if (resized) { try { resized.Dispose(); } catch {} }
            return null;
        }
    }

    getProceduralRimLayer(size) {
        if (size <= 0) return null;
        const key = `rimLayer:${size}`;
        if (this.#rimLayerCache.has(key)) return this.#rimLayerCache.get(key);

        let layer = null, g = null;
        try {
            layer = gdi.CreateImage(size, size);
            g = layer.GetGraphics();
            g.SetSmoothingMode(2);
            g.FillSolidRect(0, 0, size, size, 0x00000000);
            this.#drawProceduralRim(g, size);
            layer.ReleaseGraphics(g);
            g = null;
            this.#cacheStore(this.#rimLayerCache, key, layer);
            return layer;
        } catch {
            if (g && layer) { try { layer.ReleaseGraphics(g); } catch {} }
            if (layer) { try { layer.Dispose(); } catch {} }
            return null;
        }
    }

    #drawProceduralRim(g, size) {
        const cx = size / 2, cy = size / 2, R  = size / 2;
        const rOuterRim = size * 0.491;
        const lipWidth  = Math.max(1.5, (R - rOuterRim) + 1.5);
        const rMidLip   = rOuterRim + (lipWidth / 2);

        g.DrawEllipse(cx - rMidLip, cy - rMidLip, rMidLip * 2, rMidLip * 2, lipWidth, 0xFFCED2D7);

        const strokeW = Math.max(1, Math.round(size * 0.001));
        g.DrawEllipse(cx - rOuterRim, cy - rOuterRim, rOuterRim * 2, rOuterRim * 2, strokeW, 0xFF9499A0);
        g.DrawEllipse(cx - (rOuterRim - 0.5), cy - (rOuterRim - 0.5), (rOuterRim - 0.5) * 2, (rOuterRim - 0.5) * 2, 1, 0x30FFFFFF);
        g.DrawEllipse(cx - (R - 0.5), cy - (R - 0.5), (R - 0.5) * 2, (R - 0.5) * 2, 1, 0x50FFFFFF);
        g.DrawEllipse(cx - (R - 1.5), cy - (R - 1.5), (R - 1.5) * 2, (R - 1.5) * 2, 1, 0x25000000);

        const rOuterBorder = size * 0.180, rLeadInRing = size * 0.165;
        const rLeadOutRing = size * 0.152, rMirrorBand = size * 0.143;
        const rInnerCollar = size * 0.128, rHoleEdge   = size * 0.082;

        g.FillEllipse(cx - rOuterBorder, cy - rOuterBorder, rOuterBorder * 2, rOuterBorder * 2, 0xEE1E2126);
        g.DrawEllipse(cx - rOuterBorder, cy - rOuterBorder, rOuterBorder * 2, rOuterBorder * 2, 1, 0xFF0D0F12);

        this.#drawMetallicRing(g, cx, cy, rLeadOutRing - 1.0, rLeadInRing);
        g.DrawEllipse(cx - rLeadInRing, cy - rLeadInRing, rLeadInRing * 2, rLeadInRing * 2, 1, 0x558A6D2A);

        g.FillEllipse(cx - rLeadOutRing, cy - rLeadOutRing, rLeadOutRing * 2, rLeadOutRing * 2, 0xEE1E2126);
        g.DrawEllipse(cx - rLeadOutRing, cy - rLeadOutRing, rLeadOutRing * 2, rLeadOutRing * 2, 1, 0xFF0D0F12);

        g.FillEllipse(cx - rMirrorBand, cy - rMirrorBand, rMirrorBand * 2, rMirrorBand * 2, 0xEAE2E5E8);
        g.DrawEllipse(cx - rMirrorBand, cy - rMirrorBand, rMirrorBand * 2, rMirrorBand * 2, 1, 0x55FFFFFF);

        g.FillEllipse(cx - rInnerCollar, cy - rInnerCollar, rInnerCollar * 2, rInnerCollar * 2, 0xEAE2E5E8);
        g.DrawEllipse(cx - rInnerCollar, cy - rInnerCollar, rInnerCollar * 2, rInnerCollar * 2, 1, 0x509DA3AA);
        g.DrawEllipse(cx - rHoleEdge, cy - rHoleEdge, rHoleEdge * 2, rHoleEdge * 2, 1.5, 0x906E7680);
    }

    #drawMetallicRing(g, cx, cy, rInner, rOuter) {
        const steps = 240, green = Math.PI * 0.5;

        for (let i = 0; i < steps; i++) {
            const raw0 = (i / steps) * 2 * Math.PI, raw1 = ((i + 1) / steps) * 2 * Math.PI;
            const overlap = 1.2 / rOuter;
            const a0 = raw0 - overlap, a1 = raw1 + overlap;
            const am = (a0 + a1) / 2;
            const hue = (i / steps) * 360 * 2;
            const spec = 0.5 + 0.5 * Math.cos(am - green);
            const v = 0.6 + 0.38 * Math.pow(spec, 1.2);
            const col = GdiUtils.hsvToArgb(hue, 0.23, v, 0xFF);
            
            const p0 = [cx + Math.cos(a0) * rInner, cy + Math.sin(a0) * rInner];
            const p1 = [cx + Math.cos(a1) * rInner, cy + Math.sin(a1) * rInner];
            const p2 = [cx + Math.cos(a1) * rOuter, cy + Math.sin(a1) * rOuter];
            const p3 = [cx + Math.cos(a0) * rOuter, cy + Math.sin(a0) * rOuter];
            const flat = [p0[0], p0[1], p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]];
            const pts2D = [p0, p1, p2, p3];

            try {
                g.FillPolygon(col, 1, flat);
            } catch {
                try { g.FillPolygon(col, 1, pts2D); } catch {}
            }
        }
    }

    buildProceduralDefaultDisc(size) {
        const key = `procedef:${size}`;
        if (this.#procDefCache.has(key)) {
            const hit = this.#procDefCache.get(key);
            try { return hit.Clone(0, 0, hit.Width, hit.Height); } catch { this.#procDefCache.delete(key); }
        }

        let target = null, g = null;
        try {
            target = gdi.CreateImage(size, size);
            g = target.GetGraphics();
            g.SetSmoothingMode(2);
            g.FillSolidRect(0, 0, size, size, 0xFF000000);

            const cx = size / 2, cy = size / 2, rOuter = size * 0.49;
            g.FillEllipse(cx - rOuter, cy - rOuter, rOuter * 2, rOuter * 2, 0xFFC9CFD6);

            const rayCount = Math.max(180, Math.round((Math.PI * size) / 1.1));
            const stepAngle = (Math.PI * 2) / rayCount;
            let seed = 4321;
            const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

            for (let i = 0; i < rayCount; i++) {
                const rayAngle = i * stepAngle;
                const highlight = Math.pow(Math.sin(rayAngle * 2), 4);
                const shadow    = Math.pow(Math.cos(rayAngle * 2), 4);
                if (highlight < 0.02 && shadow < 0.02) continue;

                const rStart = (i % 2 === 0) ? rOuter * 0.09 : 0;
                const cosA = Math.cos(rayAngle), sinA = Math.sin(rayAngle);
                const sx = cx + cosA * rStart, sy = cy + sinA * rStart;
                const ex = cx + cosA * (rOuter + 1), ey = cy + sinA * (rOuter + 1);

                const grain = 0.98 + rnd() * 0.16;
                const alphaH = Math.round(highlight * 26 * grain);
                const alphaS = Math.round(shadow * 34 * grain);

                if (alphaH > 0) g.DrawLine(sx, sy, ex, ey, 1, (alphaH << 24) | 0xFFFFFF);
                if (alphaS > 0) g.DrawLine(sx, sy, ex, ey, 1, (alphaS << 24) | 0x000000);
            }

            const grooveStep = Math.max(3, Math.round(size * 0.005));
            for (let r = Math.floor(rOuter); r >= grooveStep; r -= grooveStep) {
                g.DrawEllipse(cx - r, cy - r, r * 2, r * 2, 1, (12 << 24) | 0x000000);
                if (r > 1) g.DrawEllipse(cx - (r - 0.5), cy - (r - 0.5), (r - 0.5) * 2, (r - 0.5) * 2, 1, (7 << 24) | 0xFFFFFF);
            }

            this.#drawRainbowGlints(g, cx, cy, size * 0.135, size * 0.49);
            const rimLayer = this.getProceduralRimLayer(size);
            if (rimLayer) g.DrawImage(rimLayer, 0, 0, size, size, 0, 0, rimLayer.Width, rimLayer.Height);

            target.ReleaseGraphics(g);
            g = null;

            this.#cacheStore(this.#procDefCache, key, target);
            return target.Clone(0, 0, target.Width, target.Height);
        } catch {
            if (g && target) { try { target.ReleaseGraphics(g); } catch {} }
            if (target) { try { target.Dispose(); } catch {} }
            return null;
        }
    }

    #drawRainbowGlints(g, cx, cy, rInner, rOuter) {
        const steps = 240, green = Math.PI * 0.5;
        for (let i = 0; i < steps; i++) {
            const a0 = (i / steps) * 2 * Math.PI, a1 = ((i + 1) / steps) * 2 * Math.PI;
            const am = (a0 + a1) / 2;
            const hue = (i / steps) * 360 * 2;
            const spec = 0.5 + 0.5 * Math.cos(am - green);
            const v = 0.55 + 0.28 * Math.pow(spec, 1.2);
            const col = GdiUtils.hsvToArgb(hue, 0.4, v, 0x30);
            
            const p0 = [cx + Math.cos(a0) * rInner, cy + Math.sin(a0) * rInner];
            const p1 = [cx + Math.cos(a1) * rInner, cy + Math.sin(a1) * rInner];
            const p2 = [cx + Math.cos(a1) * rOuter, cy + Math.sin(a1) * rOuter];
            const p3 = [cx + Math.cos(a0) * rOuter, cy + Math.sin(a0) * rOuter];
            const flat = [p0[0], p0[1], p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]];
            const pts2D = [p0, p1, p2, p3];

            try {
                g.FillPolygon(col, 1, flat);
            } catch {
                try { g.FillPolygon(col, 1, pts2D); } catch {}
            }
        }
    }

    processDisc(srcImg, size, isRealDisc, maskType, interpMode, rimPath) {
        if (!srcImg || size <= 0) return null;
        let target = null, g = null;
        try {
            target = gdi.CreateImage(size, size);
            g = target.GetGraphics();
            g.SetInterpolationMode(interpMode === 0 ? 2 : interpMode);
            g.SetSmoothingMode(2);

            if (maskType === 0 && !isRealDisc) {
                g.FillSolidRect(0, 0, size, size, 0xFF000000);
            }

            g.DrawImage(srcImg, 0, 0, size, size, 0, 0, srcImg.Width, srcImg.Height);

            if (maskType === 0 && !isRealDisc) {
                const rim = this.loadCenterRim(size, rimPath);
                if (rim) {
                    g.DrawImage(rim, 0, 0, size, size, 0, 0, rim.Width, rim.Height);
                } else {
                    const rimLayer = this.getProceduralRimLayer(size);
                    if (rimLayer) g.DrawImage(rimLayer, 0, 0, size, size, 0, 0, rimLayer.Width, rimLayer.Height);
                }
            }

            target.ReleaseGraphics(g);
            g = null;

            const mask = this.loadMask(maskType, size);
            if (mask) target.ApplyMask(mask);
            return target;
        } catch {
            if (g && target) { try { target.ReleaseGraphics(g); } catch {} }
            if (target) { try { target.Dispose(); } catch {} }
            return null;
        }
    }

    #cacheStore(map, key, bmp) {
        const existing = map.get(key);
        if (existing && existing !== bmp) {
            try { existing.Dispose(); } catch {}
        }
        map.delete(key);
        map.set(key, bmp);
        while (map.size > 8) {
            const oldestKey = map.keys().next().value;
            const oldest = map.get(oldestKey);
            try { oldest?.Dispose(); } catch {}
            map.delete(oldestKey);
        }
    }

    dispose() {
        this.clearNormalizedCache();
        for (const m of [this.#maskCache, this.#rimCache, this.#rimLayerCache, this.#procDefCache]) {
            for (const bmp of m.values()) { try { bmp?.Dispose(); } catch {} }
            m.clear();
        }
    }
}

// ============================================================================================
// 4. OVERLAY & BACKDROP ENGINE (SEAMLESS COMPOSITOR)
// ============================================================================================
class VisualBackdrop {
    #bgBlurredBmp     = null;
    #bgCacheBmp       = null;
    #overlayBmp       = null;
    #glowBmp          = null;
    #glowSize         = 0;
    #glowOp           = 0;
    #lastBlurSrc      = null;
    #lastBlurRad      = -1;

    static #disposeBmp(bmp) {
        if (bmp) {
            try { bmp.Dispose(); } catch {}
        }
        return null;
    }

    rebuildBlur(activeImg, w, h, enabled, blurRadius, useUIColor, interpMode) {
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
            const tw = Math.max(32, Math.floor(w / scale)), th = Math.max(32, Math.floor(h / scale));

            thumb = gdi.CreateImage(tw, th);
            g = thumb.GetGraphics();
            g.SetInterpolationMode(interpMode === 0 ? 2 : interpMode);
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

    rebuildCache(w, h, useUIColor, customBgColor, bgEnabled, darkenPct, uiColour, interpMode) {
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
                    g.SetInterpolationMode(interpMode === 0 ? 2 : interpMode);
                    g.DrawImage(this.#bgBlurredBmp, 0, 0, w, h, 0, 0, this.#bgBlurredBmp.Width, this.#bgBlurredBmp.Height);
                }
                if (darkenPct > 0 && bgEnabled && this.#bgBlurredBmp) {
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
                try {
                    g.SetInterpolationMode(7);
                    g.DrawImage(bezelImg, 0, 0, w, h, 0, 0, bezelImg.Width, bezelImg.Height);
                } catch {}
            }

            bmp.ReleaseGraphics(g);
            this.#overlayBmp = bmp;
        } catch {
            if (g && bmp) { try { bmp.ReleaseGraphics(g); } catch {} }
            if (bmp) { try { bmp.Dispose(); } catch {} }
            this.#overlayBmp = null;
        }
    }

    rebuildGlow(discSize, showGlow, opGlow, overlayAllOff) {
        if (!showGlow || opGlow <= 0 || overlayAllOff || discSize <= 0) {
            this.#glowBmp = VisualBackdrop.#disposeBmp(this.#glowBmp);
            this.#glowSize = 0;
            this.#glowOp = 0;
            return;
        }

        const maxR = discSize * 0.7;
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
class DiscSpinController {
    static LIFECYCLE = { BOOT: 0, INIT: 1, LIVE: 2, SHUTDOWN: 3 };
    static BEZEL_EXTS = ['.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp'];

    static MENU_ID = {
        ALBUM_ART_ONLY:    1,
        SPINNING_ENABLE:   2,
        KEEP_ASPECT_RATIO: 3,
        SPEED_BASE:        10,
        MASK_BASE:         20,
        MASK_LOCK:         23,
        INTERP_BASE:       30,
        SIZE_BASE:         40,
        SIZE_CUSTOM:       45,
        CUSTOM_FOLDER_ADD: 50,
        FOLDER_DEPTH_BASE: 51,
        FPS_30:            70,
        FPS_60:            71,
        OVERLAY_ALL_OFF:   199,
        SHOW_REFLECTION:   200,
        OPACITY_REFL:      201,
        SHOW_GLOW:         210,
        OPACITY_GLOW:      211,
        SHOW_SCANLINES:    220,
        OPACITY_SCAN:      221,
        SHOW_PHOSPHOR:     230,
        OPACITY_PHOS:      231,
        BORDER_SIZE:       250,
        BORDER_COLOR:      251,
        DISC_PADDING:      252,
        ALBUM_PADDING:     253,
        BG_ENABLE:         260,
        BG_CUSTOM_COLOR:   261,
        BG_USE_UI_COLOR:   263,
        BG_BLUR_ENABLE:    270,
        BLUR_RADIUS_BASE:  271,
        DARKEN_BASE:       290,
        PRESET_LOAD_BASE:  301,
        PRESET_SAVE_BASE:  401,
        PHOSPHOR_BASE:     600,
        RELOAD_ART:        900,
        BEZEL_ENABLE:      970,
        BEZEL_FOLDER:      972,
        BEZEL_RELOAD:      973,
        BEZEL_NONE:        975,
        BEZEL_BASE:        976,
        CLEAR_CUSTOM_FOLDERS: 2000,
        REMOVE_FOLDER_BASE:   2100,
        PAD_LEFT:          3110,
        PAD_RIGHT:         3111,
        PAD_TOP:           3112,
        PAD_BOTTOM:        3113,
        RESET_DEFAULTS:    5000,
        FACTORY_RESET:     5001
    };

    static MASK_TYPES = [
        { name: 'CD Mask',    id: 0 },
        { name: 'Vinyl Mask', id: 1 },
        { name: 'No Mask',    id: 2 }
    ];
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

    static DEFAULTS = {
        spinningEnabled: true,
        spinSpeed: 2.0,
        spinFPS: 30,
        useAlbumArtOnly: false,
        keepAspectRatio: true,
        interpolationMode: 0,
        maxImageSize: 500,
        maskType: 0,
        userOverrideMask: false,
        customFolderDepth: 2,
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
        borderSize: 0,
        borderColor: 0xFF202020,
        discPadding: 20,
        albumPadding: 0,
        padLeft: 0,
        padRight: 0,
        padTop: 0,
        padBottom: 0,
        bezelFolder: '',
        bezelEnabled: false,
        bezelFile: '',
        backgroundEnabled: true,
        blurRadius: 240,
        blurEnabled: true,
        darkenValue: 10,
        customBgColor: 0xFF191919,
        bgUseUIColor: false
    };

    #lifecycle        = DiscSpinController.LIFECYCLE.BOOT;
    #dpiScale         = 1;
    #needsFullRepaint = true;
    #wasHidden        = false;

    #artSearchToken     = 0;
    #expectedAsyncToken = 0;
    #pendingSearchTimer = null;
    #spinTimer          = null;
    #saveTimeout        = null;
    #bezelNotifyTimeout = null;

    #scanner  = new ArtScanner();
    #discProc = new ProceduralDiscEngine();
    #backdrop = new VisualBackdrop();

    #discImg       = null;
    #scaledDiscBmp = null;
    #discImgSource = null;
    #coverImg      = null;
    #bezelBmp      = null;
    #hudFont       = null;

    #currentCoverPath  = '';
    #currentDiscPath   = '';
    #currentArtKey     = '';
    #currentTrackPath  = '';
    #currentMetaStr    = '';
    #profileBase       = '';
    #customFolders     = [];
    #bezelNotifyText   = '';
    #opacityTarget     = null;
    #cachedBezelImages = null;
    #cachedBezelFolder = null;

    #angle        = 0;
    #lastSpinTime = 0;
    #isPaused     = false;
    #isDedicated  = false;
    #isDefault    = false;

    #geom = {
        valid: false, w: 0, h: 0,
        discSize: 0, dx: 0, dy: 0,
        drawW: 0, drawH: 0, drawX: 0, drawY: 0,
        gx: 0, gy: 0
    };

    #tf = {
        compound: fb.TitleFormat('$directory_path(%path%)\x01%artist%\x01%album%\x01$directory(%path%)\x01%discnumber%\x01%album artist%'),
        dirPath:  fb.TitleFormat('$directory_path(%path%)')
    };

    config = { ...DiscSpinController.DEFAULTS };

    constructor() {
        const sysDpi = (typeof window.DPI === 'number' && window.DPI > 0) ? window.DPI : 96;
        this.#dpiScale = sysDpi / 96;

        let p = fb.ProfilePath || '';
        if (p && !p.endsWith('\\') && !p.endsWith('/')) p += '\\';
        this.#profileBase = p;
        DiscSpinController.DEFAULTS.bezelFolder = `${this.#profileBase}skins\\overlay`;

        this.#loadProperties();
        this.#loadCustomFolders();
    }

    scale(size) {
        return Math.round(size * this.#dpiScale);
    }

    init() {
        this.#lifecycle = DiscSpinController.LIFECYCLE.INIT;
        this.#isPaused  = fb.IsPaused;
        this.#needsFullRepaint = true;

        this.loadBezel();

        if (window.Width > 0 && window.Height > 0) {
            this.#updateGeometry(window.Width, window.Height);
        }
        this.#rebuildOverlay();
        
        // Promote to LIVE only after state initialization is complete
        this.#lifecycle = DiscSpinController.LIFECYCLE.LIVE;
        window.Repaint();

        // Startup load balancing: defer disk and database operations past the first paint
        window.SetTimeout(() => {
            if (this.#lifecycle === DiscSpinController.LIFECYCLE.SHUTDOWN) return;
            if (fb.IsPlaying) {
                this.loadArtworkForTrack(this.#getSafeHandle(null), false);
            } else {
                this.restoreLastAlbum();
            }
        }, 0);
    }

    static sanitizeConfig(raw, fallback = DiscSpinController.DEFAULTS) {
        const out = { ...fallback };
        if (!raw || typeof raw !== 'object') return out;

        out.spinningEnabled     = typeof raw.spinningEnabled === 'boolean' ? raw.spinningEnabled : fallback.spinningEnabled;
        out.spinSpeed           = GdiUtils.clamp(Number(raw.spinSpeed) || fallback.spinSpeed, 0.5, 5.0);
        out.spinFPS             = Number(raw.spinFPS) === 60 ? 60 : 30;
        out.useAlbumArtOnly     = typeof raw.useAlbumArtOnly === 'boolean' ? raw.useAlbumArtOnly : fallback.useAlbumArtOnly;
        out.keepAspectRatio     = typeof raw.keepAspectRatio === 'boolean' ? raw.keepAspectRatio : fallback.keepAspectRatio;
        out.interpolationMode   = GdiUtils.clamp(parseInt(raw.interpolationMode, 10) || 0, 0, 2);
        out.maxImageSize        = GdiUtils.clamp(parseInt(raw.maxImageSize, 10) || fallback.maxImageSize, 125, 2000);
        out.maskType            = GdiUtils.clamp(parseInt(raw.maskType, 10) || 0, 0, 2);
        out.userOverrideMask    = typeof raw.userOverrideMask === 'boolean' ? raw.userOverrideMask : fallback.userOverrideMask;
        out.customFolderDepth   = GdiUtils.clamp(parseInt(raw.customFolderDepth, 10) || fallback.customFolderDepth, 1, 4);

        out.showReflection      = typeof raw.showReflection === 'boolean' ? raw.showReflection : fallback.showReflection;
        out.opReflection        = GdiUtils.clamp(parseInt(raw.opReflection, 10) || fallback.opReflection, 0, 255);
        out.showGlow            = typeof raw.showGlow === 'boolean' ? raw.showGlow : fallback.showGlow;
        out.opGlow              = GdiUtils.clamp(parseInt(raw.opGlow, 10) || fallback.opGlow, 0, 255);
        out.showScanlines       = typeof raw.showScanlines === 'boolean' ? raw.showScanlines : fallback.showScanlines;
        out.opScanlines         = GdiUtils.clamp(parseInt(raw.opScanlines, 10) || fallback.opScanlines, 0, 255);
        out.showPhosphor        = typeof raw.showPhosphor === 'boolean' ? raw.showPhosphor : fallback.showPhosphor;
        out.opPhosphor          = GdiUtils.clamp(parseInt(raw.opPhosphor, 10) || fallback.opPhosphor, 0, 255);
        out.phosphorTheme       = GdiUtils.clamp(parseInt(raw.phosphorTheme, 10) || fallback.phosphorTheme, 0, DiscSpinController.PHOSPHOR_THEMES.length);
        out.customPhosphorColor = (Number(raw.customPhosphorColor) >>> 0) || fallback.customPhosphorColor;
        out.overlayAllOff       = typeof raw.overlayAllOff === 'boolean' ? raw.overlayAllOff : fallback.overlayAllOff;

        out.borderSize          = GdiUtils.clamp(parseInt(raw.borderSize, 10) || 0, 0, 50);
        out.borderColor         = (Number(raw.borderColor) >>> 0) || fallback.borderColor;
        out.discPadding         = GdiUtils.clamp(parseInt(raw.discPadding, 10) || fallback.discPadding, 0, 100);
        out.albumPadding        = GdiUtils.clamp(parseInt(raw.albumPadding, 10) || fallback.albumPadding, 0, 100);
        out.padLeft             = GdiUtils.clamp(parseInt(raw.padLeft, 10) || 0, 0, 100);
        out.padRight            = GdiUtils.clamp(parseInt(raw.padRight, 10) || 0, 0, 100);
        out.padTop              = GdiUtils.clamp(parseInt(raw.padTop, 10) || 0, 0, 100);
        out.padBottom           = GdiUtils.clamp(parseInt(raw.padBottom, 10) || 0, 0, 100);

        out.bezelFolder         = GdiUtils.sanitizePath(String(raw.bezelFolder || fallback.bezelFolder));
        out.bezelEnabled        = typeof raw.bezelEnabled === 'boolean' ? raw.bezelEnabled : fallback.bezelEnabled;
        out.bezelFile           = String(raw.bezelFile || '');

        out.backgroundEnabled   = typeof raw.backgroundEnabled === 'boolean' ? raw.backgroundEnabled : fallback.backgroundEnabled;
        out.blurRadius          = GdiUtils.clamp(parseInt(raw.blurRadius, 10) || fallback.blurRadius, 0, 254);
        out.blurEnabled         = typeof raw.blurEnabled === 'boolean' ? raw.blurEnabled : fallback.blurEnabled;
        out.darkenValue         = GdiUtils.clamp(parseInt(raw.darkenValue, 10) || fallback.darkenValue, 0, 50);
        out.customBgColor       = (Number(raw.customBgColor) >>> 0) || fallback.customBgColor;
        out.bgUseUIColor        = typeof raw.bgUseUIColor === 'boolean' ? raw.bgUseUIColor : fallback.bgUseUIColor;

        return out;
    }

    #loadProperties() {
        const raw = {
            spinningEnabled:     window.GetProperty('RP.SpinningEnabled', true),
            spinSpeed:           window.GetProperty('RP.SpinSpeed', 2.0),
            spinFPS:             window.GetProperty('RP.SpinFPS', 30),
            useAlbumArtOnly:     window.GetProperty('RP.UseAlbumArtOnly', false),
            keepAspectRatio:     window.GetProperty('RP.KeepAspectRatio', true),
            interpolationMode:   window.GetProperty('RP.InterpolationMode', 0),
            maxImageSize:        window.GetProperty('RP.MaxImageSize', 500),
            maskType:            window.GetProperty('RP.MaskType', 0),
            userOverrideMask:    window.GetProperty('RP.UserOverrideMask', false),
            customFolderDepth:   window.GetProperty('RP.CustomFolderDepth', 2),

            showReflection:      window.GetProperty('Disc.ShowReflection', true),
            opReflection:        window.GetProperty('Disc.OpReflection', 25),
            showGlow:            window.GetProperty('Disc.ShowGlow', false),
            opGlow:              window.GetProperty('Disc.OpGlow', 80),
            showScanlines:       window.GetProperty('Disc.ShowScanlines', false),
            opScanlines:         window.GetProperty('Disc.OpScanlines', 100),
            showPhosphor:        window.GetProperty('Disc.ShowPhosphor', true),
            opPhosphor:          window.GetProperty('Disc.OpPhosphor', 20),
            phosphorTheme:       window.GetProperty('Disc.PhosphorTheme', 8),
            customPhosphorColor: window.GetProperty('Disc.CustomPhosphorColor', 0xFFFFFFFF),
            overlayAllOff:       window.GetProperty('Disc.OverlayAllOff', false),

            borderSize:          window.GetProperty('Disc.BorderSize', 0),
            borderColor:         window.GetProperty('Disc.BorderColor', 0xFF202020),
            discPadding:         window.GetProperty('Disc.Padding', 20),
            albumPadding:        window.GetProperty('Disc.AlbumPadding', 0),
            padLeft:             window.GetProperty('Disc.PadLeft', 0),
            padRight:            window.GetProperty('Disc.PadRight', 0),
            padTop:              window.GetProperty('Disc.PadTop', 0),
            padBottom:           window.GetProperty('Disc.PadBottom', 0),

            bezelFolder:         window.GetProperty('Disc.BezelFolder', `${this.#profileBase}skins\\overlay`),
            bezelEnabled:        window.GetProperty('Disc.BezelEnabled', false),
            bezelFile:           window.GetProperty('Disc.BezelFile', ''),

            backgroundEnabled:   window.GetProperty('Disc.BackgroundEnabled', true),
            blurRadius:          window.GetProperty('Disc.BlurRadius', 240),
            blurEnabled:         window.GetProperty('Disc.BlurEnabled', true),
            darkenValue:         window.GetProperty('Disc.DarkenValue', 10),
            customBgColor:       window.GetProperty('Disc.CustomBackgroundColor', 0xFF191919),
            bgUseUIColor:        window.GetProperty('Disc.BgUseUIColor', false)
        };

        this.config = DiscSpinController.sanitizeConfig(raw, DiscSpinController.DEFAULTS);
    }

    #loadCustomFolders() {
        this.#scanner.clearCaches();
        try {
            const raw = window.GetProperty('RP.CustomFolders', '[]');
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
        window.SetProperty('RP.SpinningEnabled', cfg.spinningEnabled);
        window.SetProperty('RP.SpinSpeed', cfg.spinSpeed);
        window.SetProperty('RP.SpinFPS', cfg.spinFPS);
        window.SetProperty('RP.UseAlbumArtOnly', cfg.useAlbumArtOnly);
        window.SetProperty('RP.KeepAspectRatio', cfg.keepAspectRatio);
        window.SetProperty('RP.InterpolationMode', cfg.interpolationMode);
        window.SetProperty('RP.MaxImageSize', cfg.maxImageSize);
        window.SetProperty('RP.MaskType', cfg.maskType);
        window.SetProperty('RP.UserOverrideMask', cfg.userOverrideMask);
        window.SetProperty('RP.CustomFolderDepth', cfg.customFolderDepth);

        window.SetProperty('Disc.ShowReflection', cfg.showReflection);
        window.SetProperty('Disc.OpReflection', cfg.opReflection);
        window.SetProperty('Disc.ShowGlow', cfg.showGlow);
        window.SetProperty('Disc.OpGlow', cfg.opGlow);
        window.SetProperty('Disc.ShowScanlines', cfg.showScanlines);
        window.SetProperty('Disc.OpScanlines', cfg.opScanlines);
        window.SetProperty('Disc.ShowPhosphor', cfg.showPhosphor);
        window.SetProperty('Disc.OpPhosphor', cfg.opPhosphor);
        window.SetProperty('Disc.PhosphorTheme', cfg.phosphorTheme);
        window.SetProperty('Disc.CustomPhosphorColor', cfg.customPhosphorColor);
        window.SetProperty('Disc.OverlayAllOff', cfg.overlayAllOff);

        window.SetProperty('Disc.BorderSize', cfg.borderSize);
        window.SetProperty('Disc.BorderColor', cfg.borderColor);
        window.SetProperty('Disc.Padding', cfg.discPadding);
        window.SetProperty('Disc.AlbumPadding', cfg.albumPadding);
        window.SetProperty('Disc.PadLeft', cfg.padLeft);
        window.SetProperty('Disc.PadRight', cfg.padRight);
        window.SetProperty('Disc.PadTop', cfg.padTop);
        window.SetProperty('Disc.PadBottom', cfg.padBottom);

        window.SetProperty('Disc.BezelFolder', cfg.bezelFolder);
        window.SetProperty('Disc.BezelEnabled', cfg.bezelEnabled);
        window.SetProperty('Disc.BezelFile', cfg.bezelFile);

        window.SetProperty('Disc.BackgroundEnabled', cfg.backgroundEnabled);
        window.SetProperty('Disc.BlurRadius', cfg.blurRadius);
        window.SetProperty('Disc.BlurEnabled', cfg.blurEnabled);
        window.SetProperty('Disc.DarkenValue', cfg.darkenValue);
        window.SetProperty('Disc.CustomBackgroundColor', cfg.customBgColor);
        window.SetProperty('Disc.BgUseUIColor', cfg.bgUseUIColor);
        window.SetProperty('RP.CustomFolders', JSON.stringify(this.#customFolders));
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
                const dotIdx = f.lastIndexOf('.');
                if (dotIdx === -1) return false;
                const ext = f.substring(dotIdx).toLowerCase();
                return DiscSpinController.BEZEL_EXTS.includes(ext);
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
        for (const ext of DiscSpinController.BEZEL_EXTS) {
            if (lower.endsWith(ext) && utils.IsFile(`${base}${name}`)) return `${base}${name}`;
        }
        for (const ext of DiscSpinController.BEZEL_EXTS) {
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
            try { this.#bezelBmp = gdi.Image(target); } catch { this.#bezelBmp = null; }
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
                this.#needsFullRepaint = true;
                window.Repaint();
            }, 1500);
            this.#needsFullRepaint = true;
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
        this.#rebuildOverlay();
        this.requestSave();

        // Immediately force full-window redraw so the new bezel renders instantly
        this.#needsFullRepaint = true;

        if (this.#bezelNotifyTimeout) window.ClearTimeout(this.#bezelNotifyTimeout);
        this.#bezelNotifyTimeout = window.SetTimeout(() => {
            this.#bezelNotifyText = '';
            this.#bezelNotifyTimeout = null;
            this.#needsFullRepaint = true;
            window.Repaint();
        }, 1500);

        window.Repaint();
    }

    #updateScaledDisc() {
        if (this.#scaledDiscBmp) {
            try { this.#scaledDiscBmp.Dispose(); } catch {}
            this.#scaledDiscBmp = null;
        }

        if (!this.#discImg || this.#discImg.Width <= 0 || this.#discImg.Height <= 0) return;

        try {
            if (this.config.useAlbumArtOnly) {
                const targetW = this.#geom.drawW, targetH = this.#geom.drawH;
                if (targetW > 0 && targetH > 0) {
                    this.#scaledDiscBmp = this.#discImg.Resize(targetW, targetH);
                }
            } else {
                const targetSize = this.#geom.discSize;
                if (targetSize > 0) {
                    this.#scaledDiscBmp = this.#discImg.Resize(targetSize, targetSize);
                }
            }
        } catch {
            this.#scaledDiscBmp = null;
        }
    }
	
	updateDiscArtwork() {
        if (this.#discImg) { try { this.#discImg.Dispose(); } catch {} this.#discImg = null; }
        const activeSrc = this.config.useAlbumArtOnly ? (this.#coverImg || this.#discImgSource) : (this.#discImgSource || this.#coverImg);
        if (!activeSrc) {
            this.#updateScaledDisc();
            this.#rebuildBackground();
            return;
        }

        if (this.config.useAlbumArtOnly) {
            this.#discImg = activeSrc.Clone(0, 0, activeSrc.Width, activeSrc.Height);
        } else {
            const discBaseSize = Math.floor(this.config.maxImageSize / 2) * 2;
            const square = this.#discProc.normalizeSquare(activeSrc, discBaseSize, this.config.interpolationMode);
            if (!square) {
                this.#updateScaledDisc();
                this.#rebuildBackground();
                return;
            }
            const rimPath = `${this.#profileBase}skins\\center_album_rim.png`;
            this.#discImg = this.#discProc.processDisc(square, discBaseSize, this.#isDedicated, this.config.maskType, this.config.interpolationMode, rimPath);
        }

        if (window.Width > 0 && window.Height > 0) {
            this.#geom.valid = false;
            this.#updateGeometry(window.Width, window.Height);
        }

        this.#updateScaledDisc();
        this.#rebuildBackground();
    }

    #refreshGlow() {
        const glowTargetSize = this.config.useAlbumArtOnly ? Math.max(this.#geom.drawW, this.#geom.drawH) : this.#geom.discSize;
        this.#backdrop.rebuildGlow(
            glowTargetSize,
            this.config.showGlow,
            this.config.opGlow,
            this.config.overlayAllOff
        );
    }

    #updateGeometry(w, h) {
        if (this.#geom.valid && this.#geom.w === w && this.#geom.h === h) return;
        this.#geom.w = w;
        this.#geom.h = h;

        const activePad = this.config.useAlbumArtOnly ? this.config.albumPadding : this.config.discPadding;
        const base = this.scale(activePad) + this.scale(this.config.borderSize);
        const availW = Math.max(10, w - base * 2 - this.scale(this.config.padLeft) - this.scale(this.config.padRight));
        const availH = Math.max(10, h - base * 2 - this.scale(this.config.padTop) - this.scale(this.config.padBottom));

        this.#geom.discSize = Math.floor(Math.min(availW, availH) / 2) * 2;
        const activeImg = this.#discImg || this.#coverImg || this.#discImgSource;

        if (this.config.useAlbumArtOnly && activeImg) {
            let drawW = availW, drawH = availH;
            if (this.config.keepAspectRatio && activeImg.Width > 0 && activeImg.Height > 0) {
                const ratio = Math.min(availW / activeImg.Width, availH / activeImg.Height);
                drawW = Math.max(1, Math.floor(activeImg.Width * ratio));
                drawH = Math.max(1, Math.floor(activeImg.Height * ratio));
            }
            this.#geom.drawX = Math.floor(this.scale(this.config.padLeft) + base + (availW - drawW) / 2);
            this.#geom.drawY = Math.floor(this.scale(this.config.padTop) + base + (availH - drawH) / 2);
            this.#geom.drawW = drawW;
            this.#geom.drawH = drawH;
            this.#refreshGlow();
            this.#geom.gx = Math.floor(this.#geom.drawX + (drawW - this.#backdrop.glowSize) / 2);
            this.#geom.gy = Math.floor(this.#geom.drawY + (drawH - this.#backdrop.glowSize) / 2);
        } else {
            this.#geom.dx = Math.floor(this.scale(this.config.padLeft) + base + (availW - this.#geom.discSize) / 2);
            this.#geom.dy = Math.floor(this.scale(this.config.padTop) + base + (availH - this.#geom.discSize) / 2);
            this.#refreshGlow();
            this.#geom.gx = Math.floor(this.#geom.dx + (this.#geom.discSize - this.#backdrop.glowSize) / 2);
            this.#geom.gy = Math.floor(this.#geom.dy + (this.#geom.discSize - this.#backdrop.glowSize) / 2);
        }

        this.#geom.valid = true;
        this.#updateScaledDisc();
    }

    #rebuildBackground() {
        const activeBackdrop = this.#coverImg || this.#discImgSource;
        this.#backdrop.rebuildBlur(
            activeBackdrop,
            window.Width,
            window.Height,
            this.config.backgroundEnabled && this.config.blurEnabled && !this.config.useAlbumArtOnly,
            this.config.blurRadius,
            this.config.bgUseUIColor,
            this.config.interpolationMode
        );
        this.#backdrop.rebuildCache(
            window.Width,
            window.Height,
            this.config.bgUseUIColor,
            this.config.customBgColor,
            this.config.backgroundEnabled && !this.config.useAlbumArtOnly,
            this.config.darkenValue,
            this.#getSafeUIColour(),
            this.config.interpolationMode
        );
    }

    #rebuildOverlay() {
        const themeColor = this.config.phosphorTheme === DiscSpinController.PHOSPHOR_THEMES.length
            ? this.config.customPhosphorColor
            : DiscSpinController.PHOSPHOR_THEMES[this.config.phosphorTheme].color;

        this.#backdrop.rebuildOverlay(
            window.Width,
            window.Height,
            { ...this.config, phosphorColor: themeColor },
            this.#bezelBmp,
            this.#dpiScale
        );
    }

    autoDetectMask(filePath) {
        if (this.config.userOverrideMask) return;
        this.config.maskType = (filePath && this.#scanner.isVinylDisc(filePath)) ? 1 : 0;
    }

    applyLoadedArtwork(discPath, coverPath, folder = '') {
        if (discPath === this.#currentDiscPath && coverPath === this.#currentCoverPath && (this.#discImgSource || this.#coverImg)) {
            if (fb.IsPlaying && !this.#isPaused && this.config.spinningEnabled && !this.config.useAlbumArtOnly && !this.#spinTimer) {
                this.startSpinTimer();
            }
            return;
        }

        this.#discProc.clearNormalizedCache();
        if (this.#discImg)       { try { this.#discImg.Dispose(); }       catch {} this.#discImg = null; }
        if (this.#scaledDiscBmp) { try { this.#scaledDiscBmp.Dispose(); } catch {} this.#scaledDiscBmp = null; }
        if (this.#discImgSource) { try { this.#discImgSource.Dispose(); } catch {} this.#discImgSource = null; }
        if (this.#coverImg)      { try { this.#coverImg.Dispose(); }      catch {} this.#coverImg = null; }

        this.#isDedicated = false;
        this.#isDefault   = false;
        this.#currentCoverPath = '';
        this.#currentDiscPath  = '';

        this.autoDetectMask(discPath);

        if (discPath) {
            try {
                this.#discImgSource = gdi.Image(discPath);
                this.#isDedicated   = true;
                this.#currentDiscPath = discPath;
            } catch {
                this.#discImgSource = null;
            }
        }

        if (coverPath) {
            try {
                this.#coverImg = gdi.Image(coverPath);
                this.#currentCoverPath = coverPath;
            } catch {
                this.#coverImg = null;
            }
        }

        if (!this.#discImgSource && this.#coverImg) {
            try {
                this.#discImgSource = this.#coverImg.Clone(0, 0, this.#coverImg.Width, this.#coverImg.Height);
                this.#isDedicated = false;
            } catch {
                this.#discImgSource = null;
            }
        }

        if (this.#discImgSource && !this.#coverImg) {
            try {
                this.#coverImg = this.#discImgSource.Clone(0, 0, this.#discImgSource.Width, this.#discImgSource.Height);
            } catch {
                this.#coverImg = null;
            }
        }

        if (folder) {
            window.SetProperty('RP.SavedFolder', folder);
            window.SetProperty('Last Folder Path', folder);
        }

        if (this.#discImgSource || this.#coverImg) {
            this.updateDiscArtwork();
            this.#needsFullRepaint = true;
            this.startSpinTimer();
            window.Repaint();
        } else {
            this.loadDefaultArt();
        }
    }

    loadArtworkForTrack(metadb, isTrackChange = false) {
        const handle = this.#getSafeHandle(metadb);
        const trackPath = handle?.Path ?? '';

        if (!handle || !trackPath) {
            this.#currentTrackPath = '';
            this.#currentArtKey = '';
            this.#currentMetaStr = '';
            if (!this.#discImgSource && !this.#coverImg) this.loadDefaultArt();
            this.#needsFullRepaint = true;
            window.Repaint();
            return;
        }

        let trackDir = '', rawArtist = '', rawAlbum = '', rawFolder = '', rawDisc = '', rawAlbArtist = '';
        let raw = '';
        try {
            raw = this.#tf.compound.EvalWithMetadb(handle, true) ?? '';
            const parts = raw.split('\x01');
            trackDir     = parts[0] ?? '';
            rawArtist    = parts[1] ?? '';
            rawAlbum     = parts[2] ?? '';
            rawFolder    = parts[3] ?? '';
            rawDisc      = (parts[4] ?? '').trim();
            rawAlbArtist = parts[5] ?? '';
        } catch {}

        const artKey = this.#scanner.getArtworkIdentityKey(trackDir, rawAlbum, rawDisc, trackPath);

        if (isTrackChange && this.#currentArtKey && artKey === this.#currentArtKey && (this.#discImgSource || this.#coverImg) && !this.#isDefault) {
            this.#currentTrackPath = trackPath;
            this.#currentMetaStr = raw;
            if (fb.IsPlaying && !this.#isPaused && this.config.spinningEnabled && !this.config.useAlbumArtOnly && !this.#spinTimer) {
                this.startSpinTimer();
            }
            return;
        }

        if (artKey !== this.#currentArtKey) {
            if (this.#discImg)       { try { this.#discImg.Dispose(); }       catch {} this.#discImg = null; }
            if (this.#scaledDiscBmp) { try { this.#scaledDiscBmp.Dispose(); } catch {} this.#scaledDiscBmp = null; }
            if (this.#discImgSource) { try { this.#discImgSource.Dispose(); } catch {} this.#discImgSource = null; }
            if (this.#coverImg)      { try { this.#coverImg.Dispose(); }      catch {} this.#coverImg = null; }
            this.#currentCoverPath = '';
            this.#currentDiscPath  = '';
            this.#currentArtKey    = artKey;
            this.#rebuildBackground();
            this.#needsFullRepaint = true;
            window.Repaint();
        } else {
            this.#currentArtKey = artKey;
        }

        this.#currentTrackPath = trackPath;
        this.#currentMetaStr = raw;

        const thisToken = ++this.#artSearchToken;
        this.#expectedAsyncToken = 0;

        const cached = this.#scanner.getMemoryCache(artKey);
        if (cached) {
            this.applyLoadedArtwork(cached.disc, cached.cover, trackDir);
            return;
        }

        if (trackDir && utils.IsDirectory(trackDir)) {
            const fast = this.#scanner.getFastDiscAndCover(trackDir);
            if (fast.disc && fast.cover) {
                this.#scanner.setMemoryCache(artKey, fast);
                this.applyLoadedArtwork(fast.disc, fast.cover, trackDir);
                return;
            }
        }

        if (this.#pendingSearchTimer) { window.ClearTimeout(this.#pendingSearchTimer); this.#pendingSearchTimer = null; }
        this.#pendingSearchTimer = window.SetTimeout(() => {
            if (thisToken !== this.#artSearchToken || this.#lifecycle !== DiscSpinController.LIFECYCLE.LIVE) return;

            const deadline = Date.now() + 35;
            let discPath = null;
            let coverPath = null;

            const artistVariants = this.#scanner.cleanVariants(rawArtist);
            if (rawAlbArtist && rawAlbArtist !== rawArtist) {
                for (const v of this.#scanner.cleanVariants(rawAlbArtist)) {
                    if (!artistVariants.includes(v)) artistVariants.push(v);
                }
            }
            const albumVariants  = this.#scanner.cleanVariants(rawAlbum);
            const folderVariants = this.#scanner.cleanVariants(rawFolder);

            const specificCoverPatterns = [];
            const specificDiscPatterns  = [];

            for (const art of artistVariants) {
                for (const alb of albumVariants) {
                    specificCoverPatterns.push(`${art} - ${alb}`, `${art}_${alb}`, `${art} ${alb}`, `${alb} - ${art}`);
                    specificDiscPatterns.push(
                        `${art} - ${alb} - disc`, `${art} - ${alb} - cd`,
                        `${art} - ${alb}_disc`, `${art} - ${alb} disc`,
                        `${art}_${alb}_disc`, `${art} - ${alb}`
                    );
                    if (rawDisc) {
                        specificDiscPatterns.push(
                            `${art} - ${alb} - cd${rawDisc}`, `${art} - ${alb} - disc${rawDisc}`,
                            `${art} - ${alb}_cd${rawDisc}`, `${art} - ${alb}_disc${rawDisc}`
                        );
                    }
                }
            }

            for (const alb of albumVariants) {
                specificCoverPatterns.push(alb);
                specificDiscPatterns.push(`${alb} - disc`, `${alb} disc`, `${alb}_disc`);
            }
            for (const art of artistVariants) {
                specificCoverPatterns.push(art);
                specificDiscPatterns.push(`${art} - disc`, `${art} disc`, `${art}_disc`, art);
            }
            if (rawDisc) {
                specificDiscPatterns.push(`disc${rawDisc}`, `disc ${rawDisc}`, `disc_${rawDisc}`, `cd${rawDisc}`, `cd ${rawDisc}`, `cd_${rawDisc}`);
            }

            if (this.#customFolders.length > 0) {
                for (const cFolder of this.#customFolders) {
                    if (Date.now() > deadline) break;
                    const res = this.#scanner.findInCustomFolder(cFolder, artistVariants, albumVariants, folderVariants, specificDiscPatterns, specificCoverPatterns, this.config.customFolderDepth, deadline);
                    discPath  ||= res.disc;
                    coverPath ||= res.cover;
                    if (discPath && coverPath) break;
                }
            }

            if ((!discPath || !coverPath) && trackDir && utils.IsDirectory(trackDir) && Date.now() <= deadline) {
                const localRes = this.#scanner.searchDirectory(trackDir, specificDiscPatterns, specificCoverPatterns, true, false, this.config.customFolderDepth, deadline);
                discPath  ||= localRes.disc;
                coverPath ||= localRes.cover;

                if ((!discPath || !coverPath) && Date.now() <= deadline) {
                    const parentDir = trackDir.replace(ArtScanner.MULTI_DISC_PARENT_RE, '');
                    if (parentDir && parentDir !== trackDir && utils.IsDirectory(parentDir)) {
                        const parentRes = this.#scanner.searchDirectory(parentDir, specificDiscPatterns, specificCoverPatterns, true, false, this.config.customFolderDepth, deadline);
                        discPath  ||= parentRes.disc;
                        coverPath ||= parentRes.cover;
                    }
                }
            }

            if (thisToken !== this.#artSearchToken || this.#lifecycle !== DiscSpinController.LIFECYCLE.LIVE) return;

            if (trackDir && (discPath || coverPath)) {
                this.#scanner.setMemoryCache(artKey, { disc: discPath, cover: coverPath });
            }

            if (discPath || coverPath) {
                this.#expectedAsyncToken = 0;
                this.applyLoadedArtwork(discPath, coverPath, trackDir);
            } else {
                try {
                    const asyncHandle = this.#getSafeHandle(handle);
                    if (asyncHandle) {
                        this.#expectedAsyncToken = thisToken;
                        utils.GetAlbumArtAsync(window.ID, asyncHandle, 0);
                    } else {
                        this.loadDefaultArt();
                    }
                } catch {
                    this.loadDefaultArt();
                }
            }
        }, 10);
    }

    onAlbumArtDone(handle, art_id, image, image_path) {
        if (this.#lifecycle !== DiscSpinController.LIFECYCLE.LIVE) {
            if (image) { try { image.Dispose(); } catch {} }
            return;
        }

        if (!this.#expectedAsyncToken || this.#expectedAsyncToken !== this.#artSearchToken) {
            if (image) { try { image.Dispose(); } catch {} }
            return;
        }
        this.#expectedAsyncToken = 0;

        if (image) {
            this.#discProc.clearNormalizedCache();
            if (this.#discImg)       { try { this.#discImg.Dispose(); }       catch {} this.#discImg = null; }
            if (this.#scaledDiscBmp) { try { this.#scaledDiscBmp.Dispose(); } catch {} this.#scaledDiscBmp = null; }
            if (this.#discImgSource) { try { this.#discImgSource.Dispose(); } catch {} this.#discImgSource = null; }
            if (this.#coverImg)      { try { this.#coverImg.Dispose(); }      catch {} this.#coverImg = null; }

            this.autoDetectMask(null);
            this.#coverImg      = image;
            this.#discImgSource = image.Clone(0, 0, image.Width, image.Height);
            this.#isDedicated   = false;
            this.#isDefault     = false;
            this.#currentCoverPath = image_path || '';

            if (this.#currentArtKey) {
                this.#scanner.setMemoryCache(this.#currentArtKey, { disc: null, cover: this.#currentCoverPath });
            }

            this.updateDiscArtwork();
            this.#needsFullRepaint = true;
            if (fb.IsPlaying && !this.#isPaused) this.startSpinTimer();
            window.Repaint();
        } else {
            this.loadDefaultArt();
        }
    }

    loadDefaultArt() {
        if (this.#isDefault && this.#discImgSource && this.#coverImg) {
            if (fb.IsPlaying && !this.#isPaused) this.startSpinTimer();
            this.#needsFullRepaint = true;
            window.Repaint();
            return;
        }

        this.#discProc.clearNormalizedCache();
        if (this.#discImg)       { try { this.#discImg.Dispose(); }       catch {} this.#discImg = null; }
        if (this.#scaledDiscBmp) { try { this.#scaledDiscBmp.Dispose(); } catch {} this.#scaledDiscBmp = null; }
        if (this.#discImgSource) { try { this.#discImgSource.Dispose(); } catch {} this.#discImgSource = null; }
        if (this.#coverImg)      { try { this.#coverImg.Dispose(); }      catch {} this.#coverImg = null; }

        this.#currentCoverPath = '';
        this.#currentDiscPath  = '';
        this.autoDetectMask(null);

        const defaultDiscPath = `${this.#profileBase}skins\\default_disc.png`;
        if (utils.IsFile(defaultDiscPath)) {
            try {
                this.#discImgSource = gdi.Image(defaultDiscPath);
                this.#coverImg      = this.#discImgSource ? this.#discImgSource.Clone(0, 0, this.#discImgSource.Width, this.#discImgSource.Height) : null;
                this.#isDedicated   = true;
                this.#isDefault     = true;
            } catch {}
        }

        if (!this.#discImgSource) {
            const norm = Math.floor(this.config.maxImageSize / 2) * 2;
            const proc = this.#discProc.buildProceduralDefaultDisc(norm);
            if (proc) {
                this.#discImgSource = proc;
                try { this.#coverImg = proc.Clone(0, 0, proc.Width, proc.Height); } catch { this.#coverImg = null; }
                this.#isDedicated = true;
                this.#isDefault   = true;
            }
        }
        this.updateDiscArtwork();
        this.#needsFullRepaint = true;
        this.startSpinTimer();
        window.Repaint();
    }

    restoreLastAlbum() {
        const target = window.GetProperty('RP.SavedFolder', '') ||
                       window.GetProperty('Last Folder Path', '') ||
                       window.GetProperty('Library.SavedFolder', '') ||
                       window.GetProperty('Library Last Folder Path', '');

        if (target && utils.IsDirectory(target)) {
            const h = this.#findHandleForFolder(target);
            if (h) {
                this.loadArtworkForTrack(h, false);
                return;
            }
            const res = this.#scanner.searchDirectory(target, ArtScanner.FAST_DISC, ArtScanner.FAST_COVER, true, false, this.config.customFolderDepth);
            if (res.disc || res.cover) {
                this.applyLoadedArtwork(res.disc, res.cover, target);
                return;
            }
        }

        const sel = this.#getSafeHandle(null);
        if (sel) {
            this.loadArtworkForTrack(sel, false);
        } else {
            this.loadDefaultArt();
        }
    }

    clearTrackDisplay() {
        this.#currentTrackPath = '';
        this.#currentCoverPath = '';
        this.#currentDiscPath  = '';
        this.#currentArtKey    = '';
        this.#currentMetaStr   = '';
        this.#artSearchToken++;
        this.#expectedAsyncToken = 0;
        if (this.#pendingSearchTimer) {
            window.ClearTimeout(this.#pendingSearchTimer);
            this.#pendingSearchTimer = null;
        }
        this.loadDefaultArt();
    }

    startSpinTimer() {
        this.stopSpinTimer();
        if (!this.config.spinningEnabled || this.config.useAlbumArtOnly || !fb.IsPlaying || this.#isPaused || this.#lifecycle !== DiscSpinController.LIFECYCLE.LIVE) {
            return;
        }

        // Suspend immediately if the window is currently hidden
        if (!window.IsVisible) {
            this.#wasHidden = true;
            return;
        }

        this.#lastSpinTime = Date.now();
        const interval = (this.config.spinFPS === 30) ? 33 : 16;
        const speedDegPerSec = this.config.spinSpeed * 30;

        this.#spinTimer = window.SetInterval(() => {
            if (this.#lifecycle !== DiscSpinController.LIFECYCLE.LIVE || !fb.IsPlaying || this.#isPaused) { 
                this.stopSpinTimer(); 
                return; 
            }

            // True Zero-Idle: Halt timer execution completely when hidden or minimized
            if (!window.IsVisible) {
                this.#wasHidden = true;
                this.stopSpinTimer();
                return;
            }

            const now = Date.now();
            const deltaSec = (now - this.#lastSpinTime) / 1000;
            this.#lastSpinTime = now;

            if (deltaSec > 0 && deltaSec < 0.25) {
                this.#angle = (this.#angle + (speedDegPerSec * deltaSec)) % 360;
                this.#requestRender();
            }
        }, interval);
    }

    stopSpinTimer() {
        if (this.#spinTimer) {
            window.ClearInterval(this.#spinTimer);
            this.#spinTimer = null;
        }
        this.#lastSpinTime = 0;
    }

    #requestRender() {
        if (!window.IsVisible) return;

        if (!this.#geom.valid || this.#needsFullRepaint || this.#bezelNotifyText || this.#opacityTarget) {
            window.Repaint();
            return;
        }

        const cache = this.#backdrop.cacheBmp;
        if (!cache || cache.Width !== window.Width || cache.Height !== window.Height) {
            this.#needsFullRepaint = true;
            window.Repaint();
            return;
        }

        if (this.config.useAlbumArtOnly) {
            window.RepaintRect(this.#geom.drawX, this.#geom.drawY, this.#geom.drawW, this.#geom.drawH);
            return;
        }

        // Add 1-2px safety margin to avoid anti-aliasing edge fringe on fractional scaling displays
        const pad = Math.max(1, this.scale(1));
        const rx = Math.max(0, this.#geom.dx - pad);
        const ry = Math.max(0, this.#geom.dy - pad);
        const rw = Math.min(window.Width - rx, this.#geom.discSize + pad * 2);
        const rh = Math.min(window.Height - ry, this.#geom.discSize + pad * 2);

        window.RepaintRect(rx, ry, rw, rh);
    }

    onPaint(gr) {
        if (this.#lifecycle !== DiscSpinController.LIFECYCLE.LIVE) return;
        const w = window.Width, h = window.Height;
        if (!gr || w <= 0 || h <= 0) return;

        // Wake up timer if restoring from minimized or hidden state
        if (this.#wasHidden) {
            this.#wasHidden = false;
            this.#needsFullRepaint = true;
            if (fb.IsPlaying && !this.#isPaused && this.config.spinningEnabled && !this.config.useAlbumArtOnly) {
                this.startSpinTimer();
            }
        }

        this.#updateGeometry(w, h);

        const renderBmp = this.#scaledDiscBmp || this.#discImg;
        const cache = this.#backdrop.cacheBmp;
        const overlay = this.#backdrop.overlayBmp;

        const bgSizeMatches = Boolean(cache && cache.Width === w && cache.Height === h);
        const ovSizeMatches = Boolean(!overlay || (overlay.Width === w && overlay.Height === h));

        // Rebuild cached surfaces if invalid
        if (!bgSizeMatches) {
            this.#rebuildBackground();
        }
        if (!ovSizeMatches) {
            this.#rebuildOverlay();
        }

        // Full-stack unified render: Windows GDI+ hardware-clips to discBox during RepaintRect
        if (this.#backdrop.cacheBmp) {
            gr.DrawImage(this.#backdrop.cacheBmp, 0, 0, w, h, 0, 0, this.#backdrop.cacheBmp.Width, this.#backdrop.cacheBmp.Height);
        } else {
            gr.FillSolidRect(0, 0, w, h, this.config.customBgColor >>> 0);
        }

        if (renderBmp && renderBmp.Width > 0 && renderBmp.Height > 0) {
            gr.SetSmoothingMode(2);
            gr.SetInterpolationMode(this.config.interpolationMode === 0 ? 2 : this.config.interpolationMode);

            if (this.config.useAlbumArtOnly) {
                if (this.config.showGlow && this.config.opGlow > 0 && !this.config.overlayAllOff && this.#backdrop.glowBmp) {
                    gr.DrawImage(this.#backdrop.glowBmp, this.#geom.gx, this.#geom.gy, this.#backdrop.glowSize, this.#backdrop.glowSize, 0, 0, this.#backdrop.glowBmp.Width, this.#backdrop.glowBmp.Height);
                }
                gr.DrawImage(renderBmp, this.#geom.drawX, this.#geom.drawY, this.#geom.drawW, this.#geom.drawH, 0, 0, renderBmp.Width, renderBmp.Height);
            } else {
                if (this.config.showGlow && this.config.opGlow > 0 && !this.config.overlayAllOff && this.#backdrop.glowBmp) {
                    gr.DrawImage(this.#backdrop.glowBmp, this.#geom.gx, this.#geom.gy, this.#backdrop.glowSize, this.#backdrop.glowSize, 0, 0, this.#backdrop.glowBmp.Width, this.#backdrop.glowBmp.Height);
                }
                gr.DrawImage(renderBmp, this.#geom.dx, this.#geom.dy, this.#geom.discSize, this.#geom.discSize, 0, 0, renderBmp.Width, renderBmp.Height, this.config.spinningEnabled ? this.#angle : 0, 255);
            }
        }

        if (this.#backdrop.overlayBmp) {
            gr.DrawImage(this.#backdrop.overlayBmp, 0, 0, w, h, 0, 0, this.#backdrop.overlayBmp.Width, this.#backdrop.overlayBmp.Height);
        }

        if (this.#opacityTarget) {
            this.#drawSliderHud(gr, w, h);
        } else if (this.#bezelNotifyText) {
            this.#drawBezelToast(gr, w, h);
        }

        this.#needsFullRepaint = false;
    }

    #drawSliderHud(gr, w, h) {
        const barW = Math.min(this.scale(220), Math.round(w * 0.6));
        const barH = Math.max(4, this.scale(6));
        const bx = Math.floor((w - barW) / 2);
        const by = h - Math.max(16, this.scale(24));
        const font = this.getHudFont();
        const val = this.getOpacity(this.#opacityTarget);
        const label = `${this.#opacityTarget}: ${val}`;
        const lH = Math.max(16, this.scale(20));

        gr.FillSolidRect(bx, by, barW, barH, GdiUtils.setAlpha(GdiUtils.RGB(255, 255, 255), 60));
        gr.FillSolidRect(bx, by, Math.floor(barW * (val / 255)), barH, GdiUtils.setAlpha(GdiUtils.RGB(255, 255, 255), 180));
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
	
onSize() {
        if (this.#lifecycle !== DiscSpinController.LIFECYCLE.LIVE) return;
        const w = window.Width, h = window.Height;
        if (w <= 0 || h <= 0) {
            this.#wasHidden = true;
            return;
        }

        this.#needsFullRepaint = true;
        this.#geom.valid = false;

        this.#updateGeometry(w, h);
        this.updateDiscArtwork();
        this.#rebuildBackground();
        this.#rebuildOverlay();
        window.Repaint();
    }

    onFocus(isFocused) {
        if (this.#lifecycle !== DiscSpinController.LIFECYCLE.LIVE) return;
        if (isFocused) {
            this.#needsFullRepaint = true;
            window.Repaint();
        }
    }

    onMouseMove() {
        if (this.#lifecycle !== DiscSpinController.LIFECYCLE.LIVE) return;
        if (this.#wasHidden) {
            this.#wasHidden = false;
            this.#needsFullRepaint = true;
            window.Repaint();
        }
    }

    onPause(status) {
        if (this.#lifecycle !== DiscSpinController.LIFECYCLE.LIVE) return;
        this.#isPaused = Boolean(status);
        if (this.#isPaused) {
            this.stopSpinTimer();
        } else {
            this.startSpinTimer();
        }
        this.#needsFullRepaint = true;
        window.Repaint();
    }

    onStop(reason) {
        if (this.#lifecycle !== DiscSpinController.LIFECYCLE.LIVE) return;
        this.stopSpinTimer();
        if (reason !== 2) {
            this.#isPaused = false;
            this.#angle = 0;
            this.restoreLastAlbum();
            this.#needsFullRepaint = true;
            window.Repaint();
        }
    }

    onPlaybackStarting() {
        this.#isPaused = false;
        this.#needsFullRepaint = true;
        this.startSpinTimer();
    }

    refreshColours() {
        if (this.config.bgUseUIColor) {
            this.#rebuildBackground();
            this.#needsFullRepaint = true;
            window.Repaint();
        }
    }

    getOpacity(target) {
        switch (target) {
            case 'Reflection': return this.config.opReflection;
            case 'Glow':       return this.config.opGlow;
            case 'Scanlines':  return this.config.opScanlines;
            case 'Phosphor':   return this.config.opPhosphor;
            default:           return 255;
        }
    }

    setOpacity(target, val) {
        const clamped = GdiUtils.clamp(val, 0, 255);
        switch (target) {
            case 'Reflection': this.config.opReflection = clamped; break;
            case 'Glow':       
                this.config.opGlow = clamped; 
                this.#refreshGlow();
                break;
            case 'Scanlines':  this.config.opScanlines  = clamped; break;
            case 'Phosphor':   this.config.opPhosphor   = clamped; break;
        }
        this.#rebuildOverlay();
        this.requestSave();
        this.#needsFullRepaint = true;
        window.Repaint();
    }

    onMouseWheel(step) {
        if (this.#lifecycle !== DiscSpinController.LIFECYCLE.LIVE) return false;
        if (this.#opacityTarget) {
            this.setOpacity(this.#opacityTarget, this.getOpacity(this.#opacityTarget) + (step > 0 ? 5 : -5));
            return true;
        }
        return false;
    }

    setOpacityTarget(target) {
        this.#opacityTarget = target;
        this.#needsFullRepaint = true;
        window.Repaint();
    }

    loadPreset(slot) {
        if (slot < 1 || slot > 3) return;
        const raw = window.GetProperty(`Disc.Preset${slot}`, null);
        if (!raw) return;
        try {
            const parsed = JSON.parse(raw);
            const sourceConfig = (parsed && parsed.version === 2) ? parsed.config : parsed;
            this.config = DiscSpinController.sanitizeConfig(sourceConfig, this.config);

            this.#discProc.clearNormalizedCache();
            this.#scanner.clearCaches();
            this.loadBezel();
            this.updateDiscArtwork();
            this.#rebuildBackground();
            this.#rebuildOverlay();
            this.startSpinTimer();
            this.requestSave();
            this.#needsFullRepaint = true;
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
        window.SetProperty(`Disc.Preset${slot}`, JSON.stringify(payload));
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
            return GdiUtils.RGB(32, 32, 32);
        }
    }

    #getAlbumRootFolder(dir) {
        if (!dir) return '';
        return dir.replace(ArtScanner.MULTI_DISC_PARENT_RE, '').replace(/[\\/]+$/, '').toLowerCase();
    }

    #isHandleInFolder(handle, folder) {
        if (!handle || !folder || !this.#tf.dirPath) return false;
        const trackDir = (this.#tf.dirPath.EvalWithMetadb(handle, true) || '').toLowerCase().replace(/[\\/]+$/, '');
        const targetDir = folder.toLowerCase().replace(/[\\/]+$/, '');
        if (!trackDir || !targetDir) return false;
        return trackDir === targetDir || trackDir.startsWith(targetDir + '\\') || this.#getAlbumRootFolder(trackDir) === this.#getAlbumRootFolder(targetDir);
    }

    #findHandleForFolder(folder) {
        if (!folder) return null;
        try {
            const playing = fb.GetNowPlaying();
            if (playing && this.#isHandleInFolder(playing, folder)) return playing;
        } catch {}

        try {
            const sel = fb.GetSelection();
            if (sel && this.#isHandleInFolder(sel, folder)) return sel;
        } catch {}

        return null;
    }

    onNotifyData(name, info) {
        if (this.#lifecycle !== DiscSpinController.LIFECYCLE.LIVE) return;
        if (name === 'ArtFolder' && info && !fb.IsPlaying) {
            if (!utils.IsDirectory(info)) return;

            const h = this.#findHandleForFolder(info);
            if (h) {
                this.loadArtworkForTrack(h, false);
                return;
            }

            const thisToken = ++this.#artSearchToken;
            this.#expectedAsyncToken = 0;
            if (this.#pendingSearchTimer) { window.ClearTimeout(this.#pendingSearchTimer); this.#pendingSearchTimer = null; }

            this.#pendingSearchTimer = window.SetTimeout(() => {
                if (thisToken !== this.#artSearchToken || this.#lifecycle !== DiscSpinController.LIFECYCLE.LIVE || fb.IsPlaying) return;

                const res = this.#scanner.searchDirectory(info, ArtScanner.FAST_DISC, ArtScanner.FAST_COVER, true, false, this.config.customFolderDepth);
                if (thisToken !== this.#artSearchToken || this.#lifecycle !== DiscSpinController.LIFECYCLE.LIVE || fb.IsPlaying) return;

                if (res.disc || res.cover) {
                    this.applyLoadedArtwork(res.disc, res.cover, info);
                }
            }, 30);
        }
    }

    onKeyDown(vkey) {
        if (this.#lifecycle !== DiscSpinController.LIFECYCLE.LIVE) return false;
        if (vkey === 0x1B) { // Esc
            if (this.#opacityTarget) {
                this.#opacityTarget = null;
                this.#needsFullRepaint = true;
                window.Repaint();
                return true;
            }
        }
        if (utils.IsKeyPressed(0x11) && !utils.IsKeyPressed(0x10) && !utils.IsKeyPressed(0x12)) {
            if (vkey === 0x26) { this.cycleBezel(-1); return true; } // Ctrl+Up
            if (vkey === 0x28) { this.cycleBezel(1);  return true; } // Ctrl+Down
        }
        return false;
    }

    // ========================================================================================
    // CONTEXT MENU
    // ========================================================================================
    showContextMenu(x, y) {
        const MID = DiscSpinController.MENU_ID;

        const menus = [];
        const createMenu = () => {
            const m = window.CreatePopupMenu();
            menus.push(m);
            return m;
        };

        const m         = createMenu();
        const discM     = createMenu();
        const speedM    = createMenu();
        const fpsM      = createMenu();
        const maskM     = createMenu();
        const interpM   = createMenu();
        const sizeM     = createMenu();
        const overlayM  = createMenu();
        const phosphorM = createMenu();
        const opacityM  = createMenu();
        const borderM   = createMenu();
        const bgM       = createMenu();
        const blurM     = createMenu();
        const darkenM   = createMenu();
        const customFM  = createMenu();
        const depthM    = createMenu();
        const presetM   = createMenu();
        const loadM     = createMenu();
        const saveM     = createMenu();
        const bzM       = createMenu();

        m.AppendMenuItem(0, MID.ALBUM_ART_ONLY, "Album Art Only (Static)");
        if (this.config.useAlbumArtOnly) m.CheckMenuRadioItem(MID.ALBUM_ART_ONLY, MID.ALBUM_ART_ONLY, MID.ALBUM_ART_ONLY);
        m.AppendMenuItem(0, MID.SPINNING_ENABLE, "Spinning Enabled");
        if (this.config.spinningEnabled) m.CheckMenuRadioItem(MID.SPINNING_ENABLE, MID.SPINNING_ENABLE, MID.SPINNING_ENABLE);
        m.AppendMenuItem(0, MID.KEEP_ASPECT_RATIO, "Keep Aspect Ratio");
        if (this.config.keepAspectRatio) m.CheckMenuRadioItem(MID.KEEP_ASPECT_RATIO, MID.KEEP_ASPECT_RATIO, MID.KEEP_ASPECT_RATIO);
        m.AppendMenuSeparator();

        [1.0, 2.0, 3.0, 4.0, 5.0].forEach((spd, i) => {
            speedM.AppendMenuItem(0, MID.SPEED_BASE + i, `${spd.toFixed(1)}x Speed`);
        });
        const spdIdx = [1.0, 2.0, 3.0, 4.0, 5.0].indexOf(this.config.spinSpeed);
        if (spdIdx !== -1) speedM.CheckMenuRadioItem(MID.SPEED_BASE, MID.SPEED_BASE + 4, MID.SPEED_BASE + spdIdx);
        speedM.AppendTo(discM, 0, "Rotation Speed");

        fpsM.AppendMenuItem(0, MID.FPS_30, "30 FPS (Power Saver)");
        fpsM.AppendMenuItem(0, MID.FPS_60, "60 FPS (Ultra Smooth)");
        fpsM.CheckMenuRadioItem(MID.FPS_30, MID.FPS_60, this.config.spinFPS === 30 ? MID.FPS_30 : MID.FPS_60);
        fpsM.AppendTo(discM, 0, "Frame Rate");

        DiscSpinController.MASK_TYPES.forEach((mt, i) => {
            maskM.AppendMenuItem(0, MID.MASK_BASE + i, mt.name);
        });
        maskM.CheckMenuRadioItem(MID.MASK_BASE, MID.MASK_BASE + 2, MID.MASK_BASE + this.config.maskType);
        maskM.AppendMenuSeparator();
        maskM.AppendMenuItem(0, MID.MASK_LOCK, "Lock Selected Mask (Disable Auto-Detect)");
        if (this.config.userOverrideMask) maskM.CheckMenuRadioItem(MID.MASK_LOCK, MID.MASK_LOCK, MID.MASK_LOCK);
        maskM.AppendTo(discM, 0, "Mask Type");

        ["Nearest Neighbor (Fastest)", "Low Quality", "Bilinear (High Quality)"].forEach((name, i) => {
            interpM.AppendMenuItem(0, MID.INTERP_BASE + i, name);
        });
        interpM.CheckMenuRadioItem(MID.INTERP_BASE, MID.INTERP_BASE + 2, MID.INTERP_BASE + this.config.interpolationMode);
        interpM.AppendTo(discM, 0, "Scaling Quality");

        const SIZES = [250, 500, 750, 1000];
        SIZES.forEach((sz, idx) => {
            sizeM.AppendMenuItem(0, MID.SIZE_BASE + idx, `Base Size: ${sz}px`);
        });
        sizeM.AppendMenuSeparator();
        sizeM.AppendMenuItem(0, MID.SIZE_CUSTOM, `Custom Base Size... (${this.config.maxImageSize}px)`);
        const szIdx = SIZES.indexOf(this.config.maxImageSize);
        if (szIdx !== -1) sizeM.CheckMenuRadioItem(MID.SIZE_BASE, MID.SIZE_BASE + SIZES.length - 1, MID.SIZE_BASE + szIdx);
        else sizeM.CheckMenuRadioItem(MID.SIZE_CUSTOM, MID.SIZE_CUSTOM, MID.SIZE_CUSTOM);
        sizeM.AppendTo(discM, 0, "Base Disc Size");

        discM.AppendTo(m, 0, "Disc Settings");

        bzM.AppendMenuItem(0, MID.BEZEL_ENABLE, "Enable Bezel Frame");
        if (this.config.bezelEnabled) bzM.CheckMenuRadioItem(MID.BEZEL_ENABLE, MID.BEZEL_ENABLE, MID.BEZEL_ENABLE);
        bzM.AppendMenuSeparator();
        const bezelNames = this.listBezelNames();
        const bzStart = MID.BEZEL_NONE;
        const bzEnd = bezelNames.length > 0 ? (bzStart + bezelNames.length) : bzStart;
        bzM.AppendMenuItem(0, bzStart, "None (No Bezel)");
        if (bezelNames.length > 0) {
            bzM.AppendMenuSeparator();
            bezelNames.forEach((name, bi) => bzM.AppendMenuItem(0, bzStart + 1 + bi, name));
        }
        const curClean = (this.config.bezelFile || '').toLowerCase().replace(/\.[^/.]+$/, '');
        const currentBzIdx = (this.config.bezelEnabled && curClean) 
            ? bezelNames.findIndex(n => n.toLowerCase() === curClean)
            : -1;
        if (currentBzIdx !== -1) bzM.CheckMenuRadioItem(bzStart, bzEnd, bzStart + 1 + currentBzIdx);
        else bzM.CheckMenuRadioItem(bzStart, bzEnd, bzStart);
        bzM.AppendMenuSeparator();
        bzM.AppendMenuItem(0, MID.BEZEL_FOLDER, "Set Bezel Folder...");
        bzM.AppendMenuItem(0, MID.BEZEL_RELOAD, "Reload Bezel List");
        bzM.AppendMenuSeparator();
        bzM.AppendMenuItem(0, MID.PAD_LEFT, `Left Padding... (${this.config.padLeft}px)`);
        bzM.AppendMenuItem(0, MID.PAD_RIGHT, `Right Padding... (${this.config.padRight}px)`);
        bzM.AppendMenuItem(0, MID.PAD_TOP, `Top Padding... (${this.config.padTop}px)`);
        bzM.AppendMenuItem(0, MID.PAD_BOTTOM, `Bottom Padding... (${this.config.padBottom}px)`);
        bzM.AppendTo(overlayM, 0, "Bezel / Overlay");

        DiscSpinController.PHOSPHOR_THEMES.forEach((pt, i) => {
            phosphorM.AppendMenuItem(0, MID.PHOSPHOR_BASE + i, pt.name);
        });
        phosphorM.AppendMenuSeparator();
        phosphorM.AppendMenuItem(0, MID.PHOSPHOR_BASE + DiscSpinController.PHOSPHOR_THEMES.length, "Custom Color...");
        phosphorM.CheckMenuRadioItem(MID.PHOSPHOR_BASE, MID.PHOSPHOR_BASE + DiscSpinController.PHOSPHOR_THEMES.length, MID.PHOSPHOR_BASE + this.config.phosphorTheme);
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
        
        opacityM.AppendMenuItem(0, MID.OPACITY_REFL, `Reflection Opacity... (${this.getOpacity('Reflection')})`);
        opacityM.AppendMenuItem(0, MID.OPACITY_GLOW, `Glow Opacity... (${this.getOpacity('Glow')})`);
        opacityM.AppendMenuItem(0, MID.OPACITY_SCAN, `Scanlines Opacity... (${this.getOpacity('Scanlines')})`);
        opacityM.AppendMenuItem(0, MID.OPACITY_PHOS, `Phosphor Opacity... (${this.getOpacity('Phosphor')})`);
        opacityM.AppendTo(overlayM, 0, "Adjust Opacities");
        overlayM.AppendTo(m, 0, "Appearance");

        borderM.AppendMenuItem(0, MID.BORDER_SIZE, `Set Border Size... (${this.config.borderSize}px)`);
        borderM.AppendMenuItem(0, MID.BORDER_COLOR, "Change Border Color...");
        borderM.AppendMenuSeparator();
        borderM.AppendMenuItem(0, MID.DISC_PADDING, `Set Disc Padding... (${this.config.discPadding}px)`);
        borderM.AppendMenuItem(0, MID.ALBUM_PADDING, `Set Album Art Padding... (${this.config.albumPadding}px)`);
        borderM.AppendTo(m, 0, "Border and Padding");

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
        bgM.AppendTo(m, 0, "Background");

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

        [1, 2, 3].forEach(i => {
            const hasPreset = Boolean(window.GetProperty(`Disc.Preset${i}`, null));
            loadM.AppendMenuItem(hasPreset ? 0 : 0x0001, MID.PRESET_LOAD_BASE + (i - 1), `Preset ${i}${hasPreset ? '' : ' (Empty)'}`);
        });
        loadM.AppendTo(presetM, 0, "Load Preset");
        [1, 2, 3].forEach(i => saveM.AppendMenuItem(0, MID.PRESET_SAVE_BASE + (i - 1), `Preset ${i}`));
        saveM.AppendTo(presetM, 0, "Save Preset");
        presetM.AppendTo(m, 0, "Presets");

        m.AppendMenuSeparator();
        m.AppendMenuItem(0, MID.RELOAD_ART, "Clear Image Cache & Reload");
        m.AppendMenuItem(0, MID.RESET_DEFAULTS, "Reset Visual Settings to Defaults");
        m.AppendMenuItem(0, MID.FACTORY_RESET, "Factory Reset (All Settings & Folders)...");

        let id = 0;
        try {
            id = m.TrackPopupMenu(x, y);
        } finally {
            for (const menu of menus) {
                try { menu.Dispose(); } catch {}
            }
        }

        if (id === 0) return true;

        if (id === MID.ALBUM_ART_ONLY) { 
            this.config.useAlbumArtOnly = !this.config.useAlbumArtOnly; 
            this.#geom.valid = false;
            this.updateDiscArtwork(); 
            this.startSpinTimer(); 
            this.#rebuildOverlay();
            this.#needsFullRepaint = true;
        } else if (id === MID.SPINNING_ENABLE) { 
            this.config.spinningEnabled = !this.config.spinningEnabled; 
            this.startSpinTimer(); 
            this.#needsFullRepaint = true;
        } else if (id === MID.KEEP_ASPECT_RATIO) { 
            this.config.keepAspectRatio = !this.config.keepAspectRatio; 
            this.#geom.valid = false;
            this.#updateGeometry(window.Width, window.Height);
            this.#needsFullRepaint = true;
        } else if (id >= MID.SPEED_BASE && id <= MID.SPEED_BASE + 4) { 
            this.config.spinSpeed = [1.0, 2.0, 3.0, 4.0, 5.0][id - MID.SPEED_BASE]; 
            this.startSpinTimer(); 
        } else if (id === MID.FPS_30 || id === MID.FPS_60) {
            this.config.spinFPS = (id === MID.FPS_30) ? 30 : 60;
            this.startSpinTimer();
        } else if (id >= MID.MASK_BASE && id <= MID.MASK_BASE + 2) { 
            this.config.maskType = id - MID.MASK_BASE; 
            this.config.userOverrideMask = true;
            this.updateDiscArtwork(); 
            this.#needsFullRepaint = true;
        } else if (id === MID.MASK_LOCK) { 
            this.config.userOverrideMask = !this.config.userOverrideMask; 
            if (!this.config.userOverrideMask) {
                this.autoDetectMask(this.#currentDiscPath);
                this.updateDiscArtwork();
                this.#needsFullRepaint = true;
            }
        } else if (id >= MID.INTERP_BASE && id <= MID.INTERP_BASE + 2) { 
            this.config.interpolationMode = id - MID.INTERP_BASE; 
            this.updateDiscArtwork(); 
            this.#needsFullRepaint = true;
        } else if (id >= MID.SIZE_BASE && id < MID.SIZE_BASE + SIZES.length) { 
            this.config.maxImageSize = SIZES[id - MID.SIZE_BASE]; 
            this.#discProc.clearNormalizedCache();
            this.updateDiscArtwork(); 
            this.#needsFullRepaint = true;
        } else if (id === MID.SIZE_CUSTOM) {
            const val = GdiUtils.prompt("Enter base disc size in pixels (125-2000):", "Base Disc Size", this.config.maxImageSize);
            if (val !== null && val !== '') {
                this.config.maxImageSize = GdiUtils.clamp(parseInt(val, 10) || 500, 125, 2000);
                this.#discProc.clearNormalizedCache();
                this.updateDiscArtwork();
                this.#needsFullRepaint = true;
            }
        } else if (id >= MID.PHOSPHOR_BASE && id < MID.PHOSPHOR_BASE + DiscSpinController.PHOSPHOR_THEMES.length) { 
            this.config.phosphorTheme = id - MID.PHOSPHOR_BASE; 
            this.#rebuildOverlay(); 
            this.#needsFullRepaint = true;
        } else if (id === MID.PHOSPHOR_BASE + DiscSpinController.PHOSPHOR_THEMES.length) {
            const c = utils.ColourPicker(window.ID, this.config.customPhosphorColor);
            if (c !== -1) { 
                this.config.customPhosphorColor = (c | 0xFF000000) >>> 0; 
                this.config.phosphorTheme = DiscSpinController.PHOSPHOR_THEMES.length; 
                this.#rebuildOverlay(); 
                this.#needsFullRepaint = true;
            }
        } else if (id === MID.OVERLAY_ALL_OFF) { 
            this.config.overlayAllOff = !this.config.overlayAllOff; 
            this.#refreshGlow();
            this.#rebuildOverlay(); 
            this.#needsFullRepaint = true;
        } else if (id === MID.SHOW_REFLECTION) { 
            this.config.showReflection = !this.config.showReflection; 
            this.#rebuildOverlay(); 
            this.#needsFullRepaint = true;
        } else if (id === MID.SHOW_GLOW) { 
            this.config.showGlow = !this.config.showGlow; 
            this.#refreshGlow();
            this.#needsFullRepaint = true;
            window.Repaint(); 
        } else if (id === MID.SHOW_SCANLINES) { 
            this.config.showScanlines = !this.config.showScanlines; 
            this.#rebuildOverlay(); 
            this.#needsFullRepaint = true;
        } else if (id === MID.SHOW_PHOSPHOR) { 
            this.config.showPhosphor = !this.config.showPhosphor; 
            this.#rebuildOverlay(); 
            this.#needsFullRepaint = true;
        } else if (id === MID.OPACITY_REFL) { this.setOpacityTarget('Reflection'); }
        else if (id === MID.OPACITY_GLOW) { this.setOpacityTarget('Glow'); }
        else if (id === MID.OPACITY_SCAN) { this.setOpacityTarget('Scanlines'); }
        else if (id === MID.OPACITY_PHOS) { this.setOpacityTarget('Phosphor'); }
        else if (id === MID.BEZEL_ENABLE) {
            this.config.bezelEnabled = !this.config.bezelEnabled;
            if (this.config.bezelEnabled && !this.config.bezelFile && bezelNames.length > 0) {
                this.config.bezelFile = bezelNames[0];
            }
            this.loadBezel();
            this.#rebuildOverlay();
            this.#needsFullRepaint = true;
        } else if (id === MID.BEZEL_NONE) {
            this.config.bezelEnabled = false;
            this.config.bezelFile = '';
            this.loadBezel();
            this.#rebuildOverlay();
            this.#needsFullRepaint = true;
        } else if (id >= MID.BEZEL_BASE && id < MID.BEZEL_BASE + bezelNames.length) {
            this.config.bezelEnabled = true;
            this.config.bezelFile = bezelNames[id - MID.BEZEL_BASE];
            this.loadBezel();
            this.#rebuildOverlay();
            this.#needsFullRepaint = true;
        } else if (id === MID.BEZEL_FOLDER) {
            const f = GdiUtils.prompt("Enter folder path containing bezel/overlay images:", "Set Bezel Folder", this.config.bezelFolder);
            if (f) {
                const cleaned = GdiUtils.sanitizePath(f);
                if (cleaned && utils.IsDirectory(cleaned)) {
                    this.config.bezelFolder = cleaned;
                    this.#cachedBezelImages = null;
                    this.loadBezel();
                    this.#rebuildOverlay();
                    this.saveAll();
                    this.#needsFullRepaint = true;
                    window.Repaint();
                }
            }
        } else if (id === MID.BEZEL_RELOAD) {
            this.#cachedBezelImages = null;
            this.loadBezel();
            this.#rebuildOverlay();
            this.saveAll();
            this.#needsFullRepaint = true;
            window.Repaint();
        } else if (id === MID.PAD_LEFT) {
            const val = GdiUtils.prompt('Enter left padding in pixels (0-100):', 'Per-Side Padding', this.config.padLeft);
            if (val !== null && val !== '') { this.config.padLeft = GdiUtils.clamp(parseInt(val, 10) || 0, 0, 100); this.#geom.valid = false; this.#updateGeometry(window.Width, window.Height); this.#needsFullRepaint = true; }
        } else if (id === MID.PAD_RIGHT) {
            const val = GdiUtils.prompt('Enter right padding in pixels (0-100):', 'Per-Side Padding', this.config.padRight);
            if (val !== null && val !== '') { this.config.padRight = GdiUtils.clamp(parseInt(val, 10) || 0, 0, 100); this.#geom.valid = false; this.#updateGeometry(window.Width, window.Height); this.#needsFullRepaint = true; }
        } else if (id === MID.PAD_TOP) {
            const val = GdiUtils.prompt('Enter top padding in pixels (0-100):', 'Per-Side Padding', this.config.padTop);
            if (val !== null && val !== '') { this.config.padTop = GdiUtils.clamp(parseInt(val, 10) || 0, 0, 100); this.#geom.valid = false; this.#updateGeometry(window.Width, window.Height); this.#needsFullRepaint = true; }
        } else if (id === MID.PAD_BOTTOM) {
            const val = GdiUtils.prompt('Enter bottom padding in pixels (0-100):', 'Per-Side Padding', this.config.padBottom);
            if (val !== null && val !== '') { this.config.padBottom = GdiUtils.clamp(parseInt(val, 10) || 0, 0, 100); this.#geom.valid = false; this.#updateGeometry(window.Width, window.Height); this.#needsFullRepaint = true; }
        } else if (id === MID.BORDER_SIZE) {
            const val = GdiUtils.prompt('Enter border thickness (0-50 px):', 'Border Size', this.config.borderSize);
            if (val !== null) { this.config.borderSize = GdiUtils.clamp(parseInt(val, 10) || 0, 0, 50); this.#geom.valid = false; this.#updateGeometry(window.Width, window.Height); this.#rebuildOverlay(); this.#needsFullRepaint = true; }
        } else if (id === MID.BORDER_COLOR) {
            const c = utils.ColourPicker(window.ID, this.config.borderColor);
            if (c !== -1) { this.config.borderColor = (c | 0xFF000000) >>> 0; this.#rebuildOverlay(); this.#needsFullRepaint = true; }
        } else if (id === MID.DISC_PADDING) {
            const val = GdiUtils.prompt('Enter disc padding (0-100 px):', 'Disc Padding', this.config.discPadding);
            if (val !== null) { this.config.discPadding = GdiUtils.clamp(parseInt(val, 10) || 0, 0, 100); this.#geom.valid = false; this.#updateGeometry(window.Width, window.Height); this.updateDiscArtwork(); this.#needsFullRepaint = true; }
        } else if (id === MID.ALBUM_PADDING) {
            const val = GdiUtils.prompt('Enter album art padding (0-100 px):', 'Album Art Padding', this.config.albumPadding);
            if (val !== null) { this.config.albumPadding = GdiUtils.clamp(parseInt(val, 10) || 0, 0, 100); this.#geom.valid = false; this.#updateGeometry(window.Width, window.Height); this.updateDiscArtwork(); this.#needsFullRepaint = true; }
        } else if (id === MID.BG_USE_UI_COLOR) { 
            this.config.bgUseUIColor = !this.config.bgUseUIColor; 
            this.#rebuildBackground(); 
            this.#needsFullRepaint = true;
        } else if (id === MID.BG_ENABLE) { 
            this.config.backgroundEnabled = !this.config.backgroundEnabled; 
            this.#rebuildBackground(); 
            this.#needsFullRepaint = true;
        } else if (id === MID.BG_BLUR_ENABLE) { 
            this.config.blurEnabled = !this.config.blurEnabled; 
            this.#rebuildBackground(); 
            this.#needsFullRepaint = true;
        } else if (id === MID.BG_CUSTOM_COLOR) {
            const c = utils.ColourPicker(window.ID, this.config.customBgColor);
            if (c !== -1) { this.config.customBgColor = (c | 0xFF000000) >>> 0; this.#rebuildBackground(); this.#needsFullRepaint = true; }
        } else if (id >= MID.BLUR_RADIUS_BASE && id <= MID.BLUR_RADIUS_BASE + 7) {
            this.config.blurRadius = [20, 60, 100, 140, 180, 220, 240, 254][id - MID.BLUR_RADIUS_BASE];
            this.#rebuildBackground();
            this.#needsFullRepaint = true;
        } else if (id >= MID.DARKEN_BASE && id <= MID.DARKEN_BASE + 5) {
            this.config.darkenValue = (id - MID.DARKEN_BASE) * 10;
            this.#rebuildBackground();
            this.#needsFullRepaint = true;
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
        } else if (id >= MID.PRESET_LOAD_BASE && id <= MID.PRESET_LOAD_BASE + 2) {
            this.loadPreset((id - MID.PRESET_LOAD_BASE) + 1);
        } else if (id >= MID.PRESET_SAVE_BASE && id <= MID.PRESET_SAVE_BASE + 2) {
            this.savePreset((id - MID.PRESET_SAVE_BASE) + 1);
        } else if (id === MID.RELOAD_ART) {
            this.#scanner.clearCaches();
            this.#discProc.clearNormalizedCache();
            this.#cachedBezelImages = null;
            this.loadBezel();
            this.loadArtworkForTrack(null, false);
        } else if (id === MID.RESET_DEFAULTS) {
            this.config = DiscSpinController.sanitizeConfig(DiscSpinController.DEFAULTS);
            this.#scanner.clearCaches();
            this.#discProc.clearNormalizedCache();
            this.updateDiscArtwork();
            this.#rebuildBackground();
            this.loadBezel();
            this.#rebuildOverlay();
            this.startSpinTimer();
            this.#needsFullRepaint = true;
        } else if (id === MID.FACTORY_RESET) {
            const confirm = GdiUtils.prompt("Type YES to reset all settings, custom folders and paths to factory defaults:", "Confirm Factory Reset", "");
            if (confirm?.toUpperCase() === 'YES') {
                this.#customFolders = [];
                for (let p = 1; p <= 3; p++) window.SetProperty(`Disc.Preset${p}`, '');
                this.config = DiscSpinController.sanitizeConfig(DiscSpinController.DEFAULTS);
                this.config.bezelFolder = `${this.#profileBase}skins\\overlay`;
                this.#scanner.clearCaches();
                this.#discProc.clearNormalizedCache();
                this.#cachedBezelImages = null;
                this.saveAll();
                this.loadBezel();
                this.#rebuildOverlay();
                this.#needsFullRepaint = true;
                this.loadArtworkForTrack(this.#getSafeHandle(null), false);
            }
        }

        this.requestSave();
        this.#needsFullRepaint = true;
        window.Repaint();
        return true;
    }

    dispose() {
        this.saveAll();
        this.#lifecycle = DiscSpinController.LIFECYCLE.SHUTDOWN;
        this.stopSpinTimer();

        if (this.#saveTimeout)        window.ClearTimeout(this.#saveTimeout);
        if (this.#bezelNotifyTimeout) window.ClearTimeout(this.#bezelNotifyTimeout);
        if (this.#pendingSearchTimer) window.ClearTimeout(this.#pendingSearchTimer);

        // Explicit nullification ensures internal handles are released cleanly
        if (this.#discImg)       { try { this.#discImg.Dispose(); }       catch {} this.#discImg = null; }
        if (this.#scaledDiscBmp) { try { this.#scaledDiscBmp.Dispose(); } catch {} this.#scaledDiscBmp = null; }
        if (this.#discImgSource) { try { this.#discImgSource.Dispose(); } catch {} this.#discImgSource = null; }
        if (this.#coverImg)      { try { this.#coverImg.Dispose(); }      catch {} this.#coverImg = null; }
        if (this.#bezelBmp)      { try { this.#bezelBmp.Dispose(); }      catch {} this.#bezelBmp = null; }

        this.#backdrop.dispose();
        this.#discProc.dispose();
        this.#scanner.clearCaches();
    }
}

// ============================================================================================
// 6. SMP GLOBAL CALLBACK DISPATCH
// ============================================================================================
const app = new DiscSpinController();

function on_paint(gr) {
    app.onPaint(gr);
}

function on_size() {
    app.onSize();
}

function on_focus(is_focused) {
    app.onFocus(is_focused);
}

function on_mouse_move() {
    app.onMouseMove();
}

function on_playback_new_track(metadb) {
    app.loadArtworkForTrack(metadb, true);
}

function on_playback_starting() {
    app.onPlaybackStarting();
}

function on_playback_pause(status) {
    app.onPause(status);
}

function on_playback_stop(reason) {
    app.onStop(reason);
}

function on_playback_seek() {
    if (fb.IsPlaying) app.startSpinTimer();
}

function on_selection_changed() {
    if (fb.IsPlaying) return;
    try {
        const sel = fb.GetSelection();
        app.loadArtworkForTrack(sel?.Path ? sel : null, false);
    } catch {
        app.loadArtworkForTrack(null, false);
    }
}

function on_item_focus_change() {
    if (fb.IsPlaying) return;
    try {
        const sel = fb.GetSelection();
        if (sel?.Path) app.loadArtworkForTrack(sel, false);
    } catch {}
}

function on_colours_changed() {
    app.refreshColours();
}

function on_font_changed() {
    window.Repaint();
}

function on_metadb_changed(handle_list, fromhook) {
    if (fromhook || !fb.IsPlaying || !handle_list) return;
    try {
        const np = fb.GetNowPlaying();
        if (np && handle_list.Find(np) !== -1) app.loadArtworkForTrack(np, false);
    } catch {}
}

function on_get_album_art_done(handle, art_id, image, image_path) {
    app.onAlbumArtDone(handle, art_id, image, image_path);
}

function on_notify_data(name, info) {
    app.onNotifyData(name, info);
}

function on_mouse_wheel(step) {
    return app.onMouseWheel(step);
}

function on_mouse_rbtn_up(x, y, mask) {
    if (mask & 4) return false;
    return app.showContextMenu(x, y);
}

function on_mouse_lbtn_up() {
    app.setOpacityTarget(null);
}

function on_key_down(vkey) {
    return app.onKeyDown(vkey);
}

function on_script_unload() {
    app.dispose();
}

// Initialize Controller
app.init();
