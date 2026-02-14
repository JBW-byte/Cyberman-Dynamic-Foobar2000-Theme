// ======== AUTHOR L.E.D. AI ASSISTED ======== \\
// ======= SMP 64bit Disc Spin V3 Script ======= \\
// ======= WITH CLEAR CACHE OPTION ========= \\

window.DefineScript('SMP 64bit Disc Spin', { author: 'L.E.D.' });

// ====================== CONFIGURATION ======================
const CONFIG = Object.freeze({
    TIMER_INTERVAL: 50,
    MAX_STATIC_SIZE: 2000,
    MAX_CACHE_ENTRIES: 50,
    MAX_MASK_CACHE: 10,
    MAX_RIM_CACHE: 10,
    MAX_FILE_CACHE: 200,
    
    MIN_DISC_SIZE: 50,
    MAX_DISC_SIZE: 2000,
    MIN_SPIN_SPEED: 0.1,
    MAX_SPIN_SPEED: 10,
    
    SMOOTHING_MODE: 4,
    DISC_SCALE_FACTOR: 0.98,
    ANGLE_MODULO: 360,
    LOAD_DEBOUNCE_MS: 100,
    MAX_SUBFOLDER_DEPTH: 4,
    MAX_CUSTOM_FOLDERS: 5,
    
    PATHS: {
        DEFAULT_DISC: fb.ProfilePath + "skins\\default_disc.png",
        RIM: fb.ProfilePath + "skins\\center_album_rim.png",
        SKINS_DIR: fb.ProfilePath + "skins\\"
    },
    
    MASK_TYPES: [
        { name: "CD Mask", file: "mask.png", id: 0 },
        { name: "Vinyl Mask", file: "vinyl_mask.png", id: 1 },
        { name: "No Mask", file: null, id: 2 }
    ],
    
    DISC_PATTERNS: [
        "disc", "cd", "CD", "media", "vinyl", "Disc", "Vinyl", "Media"
    ],
    
    COVER_PATTERNS: [
        "cover", "front", "folder", "Cover", "Front", "Folder", "albumart", "AlbumArt"
    ],
    
    EXTENSIONS: [".png", ".jpg", ".jpeg", ".webp", ".bmp"],
    
    INTERPOLATION_MODES: [
        { name: "Nearest Neighbor (Fastest)", value: 5 },
        { name: "Low Quality", value: 1 },
        { name: "Bilinear", value: 3 },
        { name: "High Quality Bilinear", value: 6 },
        { name: "High Quality Bicubic (Best)", value: 7 }
    ],
    
    DISC_SIZE_PRESETS: [
        { name: "Small (125px)", value: 125 },
        { name: "Medium (250px)", value: 250 },
        { name: "Large (500px)", value: 500 },
        { name: "XL (750px)", value: 750 },
        { name: "XXL (1000px)", value: 1000 }
    ],
    
    SPEED_PRESETS: [
        { name: "Slow (1.0x)", value: 1.0 },
        { name: "Normal (2.0x)", value: 2.0 },
        { name: "Fast (3.0x)", value: 3.0 }
    ],
    
    IMAGE_TYPE: {
        REAL_DISC: 0,
        ALBUM_ART: 1,
        DEFAULT_DISC: 2
    }
});

// ====================== UTILITIES ======================
const Utils = {
    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    },
    
    safeDispose(obj) {
        if (obj && typeof obj.Dispose === 'function') {
            try {
                obj.Dispose();
            } catch (e) {
                console.log("Dispose error:", e);
            }
        }
    },
    
    sanitizeFilename(str) {
        if (!str) return "";
        return str.replace(/[\\/:*?"<>|]/g, '').trim();
    },
    
    normalizeString(str) {
        if (!str) return "";
        return str.toLowerCase().trim();
    },
    
    getImageType(path) {
        if (!path) return null;
        if (path === CONFIG.PATHS.DEFAULT_DISC) return CONFIG.IMAGE_TYPE.DEFAULT_DISC;
        
        const pathLower = path.toLowerCase();
        
        for (let pattern of CONFIG.DISC_PATTERNS) {
            if (pathLower.includes(pattern.toLowerCase())) {
                return CONFIG.IMAGE_TYPE.REAL_DISC;
            }
        }
        
        return CONFIG.IMAGE_TYPE.ALBUM_ART;
    },
    
    detectMaskFromPath(path) {
        if (!path) return null;
        
        const pathLower = path.toLowerCase();
        
        if (pathLower.includes("vinyl")) {
            return 1; // Vinyl Mask
        }
        
        if (pathLower.includes("disc") || pathLower.includes("cd")) {
            return 0; // CD Mask
        }
        
        return null;
    }
};

// ====================== OPTIMIZED LRU CACHE ======================
class LRUCache {
    constructor(maxSize) {
        this.maxSize = maxSize;
        this.cache = new Map();
    }

    get(key) {
        if (!this.cache.has(key)) return null;
        
        const value = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }

    set(key, value) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }
        
        this.cache.set(key, value);
        
        if (this.cache.size > this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            Utils.safeDispose(this.cache.get(firstKey));
            this.cache.delete(firstKey);
        }
    }

    has(key) {
        return this.cache.has(key);
    }

    clear() {
        this.cache.forEach(item => Utils.safeDispose(item));
        this.cache.clear();
    }
}

// ====================== FILE MANAGER ======================
const FileManager = {
    cache: new Map(),
    
    exists(path) {
        if (!path) return false;
        
        if (this.cache.has(path)) {
            return this.cache.get(path);
        }
        
        const exists = utils.FileTest(path, "e");
        this.cache.set(path, exists);
        
        if (this.cache.size > CONFIG.MAX_FILE_CACHE) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        
        return exists;
    },
    
    isDirectory(path) {
        if (!path) return false;
        try {
            return utils.FileTest(path, "d");
        } catch (e) {
            return false;
        }
    },
    
    getSubfolders(folder) {
        const subfolders = [];
        
        if (!this.isDirectory(folder)) {
            return subfolders;
        }
        
        try {
            const fso = new ActiveXObject("Scripting.FileSystemObject");
            const folderObj = fso.GetFolder(folder);
            const subFoldersEnum = new Enumerator(folderObj.SubFolders);
            
            for (; !subFoldersEnum.atEnd(); subFoldersEnum.moveNext()) {
                const subFolder = subFoldersEnum.item();
                subfolders.push(subFolder.Path);
            }
        } catch (e) {
            try {
                const items = utils.Glob(folder + "\\*").toArray();
                for (let i = 0; i < items.length; i++) {
                    if (this.isDirectory(items[i])) {
                        subfolders.push(items[i]);
                    }
                }
            } catch (e2) {
                // Silent fail
            }
        }
        
        return subfolders;
    },
    
    enumSubfolders(folder, depth = 0, maxDepth = CONFIG.MAX_SUBFOLDER_DEPTH) {
        const folders = [folder];
        
        if (depth >= maxDepth || !this.isDirectory(folder)) {
            return folders;
        }
        
        const subfolders = this.getSubfolders(folder);
        
        for (let i = 0; i < subfolders.length; i++) {
            const subFolder = subfolders[i];
            const deepFolders = this.enumSubfolders(subFolder, depth + 1, maxDepth);
            folders.push(...deepFolders);
        }
        
        return folders;
    },
    
    buildSearchPaths(folder, patterns, metadataNames = []) {
        const paths = [];
        const allPatterns = [...patterns];
        
        metadataNames.forEach(name => {
            const sanitized = Utils.sanitizeFilename(name);
            if (sanitized) allPatterns.push(sanitized);
        });
        
        allPatterns.forEach(pattern => {
            CONFIG.EXTENSIONS.forEach(ext => {
                paths.push(folder + "\\" + pattern + ext);
            });
        });
        
        return paths;
    },
    
    findImageInPaths(paths) {
        for (let i = 0; i < paths.length; i++) {
            if (this.exists(paths[i])) {
                return paths[i];
            }
        }
        return null;
    },
    
    matchesFolderName(folderPath, searchNames) {
        if (!folderPath || !searchNames || searchNames.length === 0) return false;
        
        const folderName = folderPath.split('\\').pop().toLowerCase();
        
        for (let name of searchNames) {
            if (!name) continue;
            const normalized = Utils.normalizeString(Utils.sanitizeFilename(name));
            if (normalized && folderName === normalized) {
                return true;
            }
        }
        
        return false;
    },
    
    clear() {
        this.cache.clear();
    }
};

// ====================== CUSTOM FOLDERS MANAGER ======================
const CustomFolders = {
    folders: [],
    
    load() {
        try {
            const saved = window.GetProperty("RP.CustomFolders", "");
            if (saved) {
                this.folders = JSON.parse(saved);
            }
        } catch (e) {
            console.log("Error loading custom folders:", e);
            this.folders = [];
        }
    },
    
    save() {
        try {
            window.SetProperty("RP.CustomFolders", JSON.stringify(this.folders));
        } catch (e) {
            console.log("Error saving custom folders:", e);
        }
    },
    
    add(folder) {
        if (!folder || !FileManager.isDirectory(folder)) return false;
        
        if (this.folders.indexOf(folder) !== -1) return false;
        
        if (this.folders.length >= CONFIG.MAX_CUSTOM_FOLDERS) {
            this.folders.shift();
        }
        
        this.folders.push(folder);
        this.save();
        return true;
    },
    
    remove(index) {
        if (index >= 0 && index < this.folders.length) {
            this.folders.splice(index, 1);
            this.save();
            return true;
        }
        return false;
    },
    
    clear() {
        this.folders = [];
        this.save();
    },
    
    getAll() {
        return [...this.folders];
    }
};

// ====================== ASSET MANAGER ======================
const AssetManager = {
    maskSource: null,
    rimSource: null,
    maskCache: new LRUCache(CONFIG.MAX_MASK_CACHE),
    rimCache: new LRUCache(CONFIG.MAX_RIM_CACHE),
    currentMaskType: 0,
    userOverrideMask: false,
    
    init() {
        this.currentMaskType = window.GetProperty("RP.MaskType", 0);
        this.userOverrideMask = window.GetProperty("RP.UserOverrideMask", false);
        this.loadMask();
        this.loadRim();
    },
    
    loadMask() {
        Utils.safeDispose(this.maskSource);
        this.maskSource = null;
        this.maskCache.clear();
        
        const maskType = CONFIG.MASK_TYPES[this.currentMaskType];
        if (!maskType || !maskType.file) return;
        
        const maskPath = CONFIG.PATHS.SKINS_DIR + maskType.file;
        
        try {
            if (FileManager.exists(maskPath)) {
                this.maskSource = gdi.Image(maskPath);
            }
        } catch (e) {
            console.log("Failed to load mask:", maskPath, e);
        }
    },
    
    loadRim() {
        try {
            if (FileManager.exists(CONFIG.PATHS.RIM)) {
                this.rimSource = gdi.Image(CONFIG.PATHS.RIM);
            }
        } catch (e) {
            console.log("Failed to load rim:", e);
        }
    },
    
    setMaskType(index, isUserOverride = true) {
        if (index === this.currentMaskType) return false;
        
        this.currentMaskType = index;
        this.userOverrideMask = isUserOverride;
        
        window.SetProperty("RP.MaskType", index);
        window.SetProperty("RP.UserOverrideMask", isUserOverride);
        
        this.loadMask();
        return true;
    },
    
    autoSelectMask(imagePath) {
        if (this.userOverrideMask) return false;
        
        const detectedMask = Utils.detectMaskFromPath(imagePath);
        if (detectedMask !== null && detectedMask !== this.currentMaskType) {
            return this.setMaskType(detectedMask, false);
        }
        
        return false;
    },
    
    hasMask() {
        return this.maskSource !== null;
    },
    
    shouldShowRim(imageType) {
        return imageType === CONFIG.IMAGE_TYPE.ALBUM_ART && 
               this.currentMaskType === 0 && 
               this.hasMask();
    },
    
    getMask(size) {
        if (!this.maskSource) return null;
        
        const key = size.toString();
        let cached = this.maskCache.get(key);
        if (cached) return cached;
        
        try {
            const resized = this.maskSource.Resize(size, size);
            this.maskCache.set(key, resized);
            return resized;
        } catch (e) {
            console.log("Mask resize error:", e);
            return null;
        }
    },
    
    getRim(size) {
        if (!this.rimSource) return null;
        
        const key = size.toString();
        let cached = this.rimCache.get(key);
        if (cached) return cached;
        
        try {
            const resized = this.rimSource.Resize(size, size);
            this.rimCache.set(key, resized);
            return resized;
        } catch (e) {
            console.log("Rim resize error:", e);
            return null;
        }
    },
    
    cleanup() {
        this.maskCache.clear();
        this.rimCache.clear();
        Utils.safeDispose(this.maskSource);
        Utils.safeDispose(this.rimSource);
    }
};

// ====================== IMAGE PROCESSOR ======================
const ImageProcessor = {
    scaleToSquare(raw, targetSize, interpolationMode, imageType) {
        if (!raw) return null;
        
        const w = raw.Width;
        const h = raw.Height;
        
        if (w === targetSize && h === targetSize) return raw;
        
        try {
            const newImg = gdi.CreateImage(targetSize, targetSize);
            const g = newImg.GetGraphics();
            g.SetInterpolationMode(interpolationMode);
            
            // Only fill black for album art being converted to disc format
            // Real disc images and default disc already have proper backgrounds
            if (AssetManager.hasMask() && imageType === CONFIG.IMAGE_TYPE.ALBUM_ART) {
                g.FillSolidRect(0, 0, targetSize, targetSize, 0xFF000000);
            }
            
            const scale = targetSize / Math.min(w, h);
            const scaledW = Math.floor(w * scale);
            const scaledH = Math.floor(h * scale);
            const offsetX = Math.floor((targetSize - scaledW) / 2);
            const offsetY = Math.floor((targetSize - scaledH) / 2);
            
            g.DrawImage(raw, offsetX, offsetY, scaledW, scaledH, 0, 0, w, h);
            newImg.ReleaseGraphics(g);
            
            Utils.safeDispose(raw);
            return newImg;
        } catch (e) {
            console.log("Scale error:", e);
            return raw;
        }
    },
    
    scaleProportional(raw, maxSize, interpolationMode) {
        if (!raw) return null;
        
        const w = raw.Width;
        const h = raw.Height;
        const maxDim = Math.max(w, h);
        
        if (maxDim <= maxSize) return raw;
        
        try {
            const scale = maxSize / maxDim;
            const nw = Math.floor(w * scale);
            const nh = Math.floor(h * scale);
            
            const newImg = gdi.CreateImage(nw, nh);
            const g = newImg.GetGraphics();
            g.SetInterpolationMode(interpolationMode);
            g.DrawImage(raw, 0, 0, nw, nh, 0, 0, w, h);
            newImg.ReleaseGraphics(g);
            
            Utils.safeDispose(raw);
            return newImg;
        } catch (e) {
            console.log("Proportional scale error:", e);
            return raw;
        }
    },
    
    applyMask(image, size) {
        if (!image) return null;
        
        try {
            const clone = image.Clone(0, 0, image.Width, image.Height);
            const mask = AssetManager.getMask(size);
            
            if (mask) {
                clone.ApplyMask(mask);
            }
            
            Utils.safeDispose(image);
            return clone;
        } catch (e) {
            console.log("Mask apply error:", e);
            return image;
        }
    },
    
    processForDisc(raw, targetSize, imageType, interpolationMode) {
        if (!raw) return null;
        
        let processed = this.scaleToSquare(raw, targetSize, interpolationMode, imageType);
        if (!processed) return null;
        
        const shouldMask = AssetManager.hasMask() && 
                          (imageType === CONFIG.IMAGE_TYPE.REAL_DISC || 
                           imageType === CONFIG.IMAGE_TYPE.ALBUM_ART);
        
        if (shouldMask) {
            processed = this.applyMask(processed, targetSize);
        }
        
        return processed;
    }
};

// ====================== STATE MANAGER ======================
const State = {
    img: null,
    angle: 0,
    isDiscImage: false,
    imageType: CONFIG.IMAGE_TYPE.REAL_DISC,
    currentMetadb: null,
    
    spinTimer: null,
    loadTimer: null,
    
    settings: {
        spinningEnabled: true,
        spinSpeed: 2.0,
        useAlbumArtOnly: false,
        keepAspectRatio: true,
        interpolationMode: 1,
        maxImageSize: 250,
        savedPath: "",
        savedIsDisc: false
    },
    
    paintCache: {
        windowWidth: 0,
        windowHeight: 0,
        discSize: 0,
        discX: 0,
        discY: 0,
        staticW: 0,
        staticH: 0,
        staticX: 0,
        staticY: 0,
        bgColor: 0,
        imgWidth: 0,
        imgHeight: 0,
        keepAspectRatio: true,
        valid: false
    },
    
    loadSettings() {
        const s = this.settings;
        s.spinningEnabled = window.GetProperty("RP.SpinningEnabled", true);
        s.spinSpeed = Utils.clamp(window.GetProperty("RP.SpinSpeed", 2.0), CONFIG.MIN_SPIN_SPEED, CONFIG.MAX_SPIN_SPEED);
        s.useAlbumArtOnly = window.GetProperty("RP.UseAlbumArtOnly", false);
        s.keepAspectRatio = window.GetProperty("RP.KeepAspectRatio", true);
        s.interpolationMode = window.GetProperty("RP.InterpolationMode", 1);
        s.maxImageSize = Utils.clamp(window.GetProperty("RP.MaxImageSize", 250), CONFIG.MIN_DISC_SIZE, CONFIG.MAX_DISC_SIZE);
        s.savedPath = window.GetProperty("RP.SavedPath", "");
        s.savedIsDisc = window.GetProperty("RP.SavedIsDisc", false);
    },
    
    saveSetting(key, value) {
        this.settings[key] = value;
        window.SetProperty("RP." + key.charAt(0).toUpperCase() + key.slice(1), value);
    },
    
    setImage(newImg, discState, imgType) {
        if (this.img && this.img !== newImg) {
            Utils.safeDispose(this.img);
        }
        
        this.img = newImg;
        this.isDiscImage = discState;
        this.imageType = imgType;
        this.paintCache.valid = false;
        
        window.Repaint();
    },
    
    updatePaintCache() {
        const w = window.Width;
        const h = window.Height;
        const pc = this.paintCache;
        const s = this.settings;
        
        if (pc.valid && 
            pc.windowWidth === w && 
            pc.windowHeight === h &&
            pc.imgWidth === (this.img ? this.img.Width : 0) &&
            pc.imgHeight === (this.img ? this.img.Height : 0) &&
            pc.keepAspectRatio === s.keepAspectRatio) {
            return;
        }
        
        pc.windowWidth = w;
        pc.windowHeight = h;
        pc.keepAspectRatio = s.keepAspectRatio;
        
        if (this.img) {
            pc.imgWidth = this.img.Width;
            pc.imgHeight = this.img.Height;
            
            if (this.isDiscImage) {
                const size = Math.min(w, h) * CONFIG.DISC_SCALE_FACTOR;
                pc.discSize = size;
                pc.discX = (w - size) / 2;
                pc.discY = (h - size) / 2;
            } else {
                let sw = w, sh = h, sx = 0, sy = 0;
                
                if (s.keepAspectRatio) {
                    const ratio = Math.min(w / this.img.Width, h / this.img.Height);
                    sw = this.img.Width * ratio;
                    sh = this.img.Height * ratio;
                    sx = (w - sw) / 2;
                    sy = (h - sh) / 2;
                }
                
                pc.staticW = sw;
                pc.staticH = sh;
                pc.staticX = sx;
                pc.staticY = sy;
            }
        }
        
        pc.valid = true;
    },
    
    cleanup() {
        this.stopTimer();
        if (this.loadTimer) window.ClearTimeout(this.loadTimer);
        Utils.safeDispose(this.img);
        this.img = null;
    },
    
    stopTimer() {
        if (this.spinTimer) {
            window.ClearInterval(this.spinTimer);
            this.spinTimer = null;
        }
    },
    
    updateTimer() {
        const shouldRun = this.img && 
                         this.isDiscImage && 
                         this.settings.spinningEnabled && 
                         fb.IsPlaying && 
                         !fb.IsPaused && 
                         !this.settings.useAlbumArtOnly;
        
        if (shouldRun && !this.spinTimer) {
            this.spinTimer = window.SetInterval(() => {
                this.angle = (this.angle + this.settings.spinSpeed) % CONFIG.ANGLE_MODULO;
                window.Repaint();
            }, CONFIG.TIMER_INTERVAL);
        } else if (!shouldRun && this.spinTimer) {
            this.stopTimer();
        }
    }
};

// ====================== IMAGE LOADER ======================
const ImageLoader = {
    cache: new LRUCache(CONFIG.MAX_CACHE_ENTRIES),
    tf_path: fb.TitleFormat("$directory_path(%path%)"),
    tf_folder: fb.TitleFormat("$directory(%path%)"),
    tf_artist: fb.TitleFormat("%artist%"),
    tf_album: fb.TitleFormat("%album%"),
    tf_title: fb.TitleFormat("%title%"),
    
    loadCached(path, imageType) {
        const s = State.settings;
        const key = `${path}|${s.maxImageSize}|${imageType}|${AssetManager.currentMaskType}`;
        
        let cached = this.cache.get(key);
        if (cached) return cached;
        
        if (!FileManager.exists(path)) return null;
        
        try {
            let raw = gdi.Image(path);
            if (!raw) return null;
            
            const processed = ImageProcessor.processForDisc(
                raw, 
                s.maxImageSize, 
                imageType, 
                s.interpolationMode
            );
            
            if (processed) {
                this.cache.set(key, processed);
            }
            
            return processed;
        } catch (e) {
            console.log("Load error:", path, e);
            return null;
        }
    },
    
    getMetadataNames(metadb) {
        const artist = this.tf_artist.EvalWithMetadb(metadb);
        const album = this.tf_album.EvalWithMetadb(metadb);
        const title = this.tf_title.EvalWithMetadb(metadb);
        const folder = this.tf_folder.EvalWithMetadb(metadb);
        
        // Create "Artist - Title" combination
        const artistTitle = (artist && title) ? `${artist} - ${title}` : "";
        
        return {
            artist: artist,
            album: album,
            title: title,
            folder: folder,
            artistTitle: artistTitle
        };
    },
    
    searchInFolder(folder, patterns, metadata) {
        const metadataNames = [
            metadata.album, 
            metadata.title, 
            metadata.artist,
            metadata.folder,
            metadata.artistTitle
        ].filter(name => name); // Remove empty strings
        
        const paths = FileManager.buildSearchPaths(folder, patterns, metadataNames);
        return FileManager.findImageInPaths(paths);
    },
    
    searchInFolderAnyFile(folder, patterns) {
        const paths = FileManager.buildSearchPaths(folder, patterns, []);
        return FileManager.findImageInPaths(paths);
    },
    
    searchForDisc(metadb, baseFolder) {
        const metadata = this.getMetadataNames(metadb);
        const searchNames = [
            metadata.artist, 
            metadata.album, 
            metadata.title, 
            metadata.folder,
            metadata.artistTitle
        ].filter(name => name);
        
        // ===== PHASE 1: Search in current track's folder tree =====
        
        // 1A. Search track folder for metadata-named files
        const trackFolderMatch = this.searchInFolder(baseFolder, CONFIG.DISC_PATTERNS, metadata);
        if (trackFolderMatch) {
            const img = this.loadCached(trackFolderMatch, CONFIG.IMAGE_TYPE.REAL_DISC);
            if (img) {
                AssetManager.autoSelectMask(trackFolderMatch);
                return { img, path: trackFolderMatch, type: CONFIG.IMAGE_TYPE.REAL_DISC };
            }
        }
        
        // 1B. Search all subfolders of track folder for ANY disc art
        const trackSubfolders = FileManager.enumSubfolders(baseFolder);
        for (let subfolder of trackSubfolders) {
            if (subfolder === baseFolder) continue; // Skip the root (already searched)
            
            const found = this.searchInFolderAnyFile(subfolder, CONFIG.DISC_PATTERNS);
            if (found) {
                const img = this.loadCached(found, CONFIG.IMAGE_TYPE.REAL_DISC);
                if (img) {
                    AssetManager.autoSelectMask(found);
                    return { img, path: found, type: CONFIG.IMAGE_TYPE.REAL_DISC };
                }
            }
        }
        
        // ===== PHASE 2: Search in custom folders =====
        const customFolders = CustomFolders.getAll();
        
        for (let customFolder of customFolders) {
            // 2A. Check if custom folder itself matches metadata names
            if (FileManager.matchesFolderName(customFolder, searchNames)) {
                // Search in the matching custom folder
                const customMatch = this.searchInFolder(customFolder, CONFIG.DISC_PATTERNS, metadata);
                if (customMatch) {
                    const img = this.loadCached(customMatch, CONFIG.IMAGE_TYPE.REAL_DISC);
                    if (img) {
                        AssetManager.autoSelectMask(customMatch);
                        return { img, path: customMatch, type: CONFIG.IMAGE_TYPE.REAL_DISC };
                    }
                }
                
                // Search in subfolders of matching custom folder
                const customSubfolders = FileManager.enumSubfolders(customFolder);
                for (let subfolder of customSubfolders) {
                    if (subfolder === customFolder) continue;
                    
                    const found = this.searchInFolderAnyFile(subfolder, CONFIG.DISC_PATTERNS);
                    if (found) {
                        const img = this.loadCached(found, CONFIG.IMAGE_TYPE.REAL_DISC);
                        if (img) {
                            AssetManager.autoSelectMask(found);
                            return { img, path: found, type: CONFIG.IMAGE_TYPE.REAL_DISC };
                        }
                    }
                }
            }
            
            // 2B. Look for matching subfolders within custom folder
            const immediateSubfolders = FileManager.getSubfolders(customFolder);
            
            for (let subfolder of immediateSubfolders) {
                // Only search if subfolder name matches metadata
                if (FileManager.matchesFolderName(subfolder, searchNames)) {
                    // Search in the matching subfolder
                    const subfolderMatch = this.searchInFolder(subfolder, CONFIG.DISC_PATTERNS, metadata);
                    if (subfolderMatch) {
                        const img = this.loadCached(subfolderMatch, CONFIG.IMAGE_TYPE.REAL_DISC);
                        if (img) {
                            AssetManager.autoSelectMask(subfolderMatch);
                            return { img, path: subfolderMatch, type: CONFIG.IMAGE_TYPE.REAL_DISC };
                        }
                    }
                    
                    // Search deeper in matching subfolder tree
                    const deepSubfolders = FileManager.enumSubfolders(subfolder);
                    for (let deepFolder of deepSubfolders) {
                        if (deepFolder === subfolder) continue;
                        
                        const found = this.searchInFolderAnyFile(deepFolder, CONFIG.DISC_PATTERNS);
                        if (found) {
                            const img = this.loadCached(found, CONFIG.IMAGE_TYPE.REAL_DISC);
                            if (img) {
                                AssetManager.autoSelectMask(found);
                                return { img, path: found, type: CONFIG.IMAGE_TYPE.REAL_DISC };
                            }
                        }
                    }
                }
            }
        }
        
        return null;
    },
    
    searchForCover(metadb, baseFolder) {
        const metadata = this.getMetadataNames(metadb);
        const searchNames = [
            metadata.artist, 
            metadata.album, 
            metadata.folder,
            metadata.artistTitle
        ].filter(name => name);
        
        // Search track folder
        const trackMatch = this.searchInFolder(baseFolder, CONFIG.COVER_PATTERNS, metadata);
        if (trackMatch) return trackMatch;
        
        // Search track subfolders
        const trackSubfolders = FileManager.enumSubfolders(baseFolder);
        for (let subfolder of trackSubfolders) {
            if (subfolder === baseFolder) continue;
            
            const found = this.searchInFolderAnyFile(subfolder, CONFIG.COVER_PATTERNS);
            if (found) return found;
        }
        
        // Search custom folders
        const customFolders = CustomFolders.getAll();
        
        for (let customFolder of customFolders) {
            // Check if custom folder itself matches
            if (FileManager.matchesFolderName(customFolder, searchNames)) {
                const customMatch = this.searchInFolder(customFolder, CONFIG.COVER_PATTERNS, metadata);
                if (customMatch) return customMatch;
                
                const customSubfolders = FileManager.enumSubfolders(customFolder);
                for (let subfolder of customSubfolders) {
                    if (subfolder === customFolder) continue;
                    
                    const found = this.searchInFolderAnyFile(subfolder, CONFIG.COVER_PATTERNS);
                    if (found) return found;
                }
            }
            
            // Look for matching subfolders
            const immediateSubfolders = FileManager.getSubfolders(customFolder);
            
            for (let subfolder of immediateSubfolders) {
                if (FileManager.matchesFolderName(subfolder, searchNames)) {
                    const subfolderMatch = this.searchInFolder(subfolder, CONFIG.COVER_PATTERNS, metadata);
                    if (subfolderMatch) return subfolderMatch;
                    
                    const deepSubfolders = FileManager.enumSubfolders(subfolder);
                    for (let deepFolder of deepSubfolders) {
                        if (deepFolder === subfolder) continue;
                        
                        const found = this.searchInFolderAnyFile(deepFolder, CONFIG.COVER_PATTERNS);
                        if (found) return found;
                    }
                }
            }
        }
        
        return null;
    },
    
    loadForMetadb(metadb, immediate = false) {
        if (!metadb) return;
        
        if (State.loadTimer) {
            window.ClearTimeout(State.loadTimer);
            State.loadTimer = null;
        }
        
        const doLoad = () => {
            State.currentMetadb = metadb;
            State.angle = 0;
            
            const folderPath = this.tf_path.EvalWithMetadb(metadb);
            
            if (!State.settings.useAlbumArtOnly) {
                const result = this.searchForDisc(metadb, folderPath);
                if (result) {
                    State.setImage(result.img, true, result.type);
                    State.saveSetting('savedPath', result.path);
                    State.saveSetting('savedIsDisc', true);
                    State.updateTimer();
                    return;
                }
            }
            
            const coverPath = this.searchForCover(metadb, folderPath);
            if (coverPath && State.settings.useAlbumArtOnly) {
                try {
                    let raw = gdi.Image(coverPath);
                    if (raw) {
                        const scaled = ImageProcessor.scaleProportional(
                            raw,
                            CONFIG.MAX_STATIC_SIZE,
                            State.settings.interpolationMode
                        );
                        if (scaled) {
                            State.setImage(scaled, false, CONFIG.IMAGE_TYPE.ALBUM_ART);
                            State.saveSetting('savedPath', coverPath);
                            State.saveSetting('savedIsDisc', false);
                            State.updateTimer();
                            return;
                        }
                    }
                } catch (e) {
                    console.log("Cover load error:", e);
                }
            }
            
            utils.GetAlbumArtAsync(window.ID, metadb, 0);
        };
        
        if (immediate) {
            doLoad();
        } else {
            State.loadTimer = window.SetTimeout(doLoad, CONFIG.LOAD_DEBOUNCE_MS);
        }
    },
    
    handleAlbumArt(metadb, image, image_path) {
        if (!State.currentMetadb || !metadb.Compare(State.currentMetadb)) {
            Utils.safeDispose(image);
            return;
        }
        
        const s = State.settings;
        
        try {
            if (image) {
                if (s.useAlbumArtOnly) {
                    const scaled = ImageProcessor.scaleProportional(
                        image, 
                        CONFIG.MAX_STATIC_SIZE, 
                        s.interpolationMode
                    );
                    if (scaled) {
                        State.setImage(scaled, false, CONFIG.IMAGE_TYPE.ALBUM_ART);
                        if (image_path) State.saveSetting('savedPath', image_path);
                    }
                } else {
                    const processed = ImageProcessor.processForDisc(
                        image, 
                        s.maxImageSize, 
                        CONFIG.IMAGE_TYPE.ALBUM_ART, 
                        s.interpolationMode
                    );
                    if (processed) {
                        State.setImage(processed, true, CONFIG.IMAGE_TYPE.ALBUM_ART);
                        if (image_path) State.saveSetting('savedPath', image_path);
                    }
                }
            } else {
                this.loadDefaultDisc();
            }
        } catch (e) {
            console.log("Album art processing error:", e);
        }
        
        State.updateTimer();
    },
    
    loadDefaultDisc() {
        if (!FileManager.exists(CONFIG.PATHS.DEFAULT_DISC)) return;
        
        try {
            let raw = gdi.Image(CONFIG.PATHS.DEFAULT_DISC);
            if (!raw) return;
            
            const scaled = ImageProcessor.scaleToSquare(
                raw, 
                State.settings.maxImageSize, 
                State.settings.interpolationMode,
                CONFIG.IMAGE_TYPE.DEFAULT_DISC
            );
            
            if (scaled) {
                State.setImage(scaled, true, CONFIG.IMAGE_TYPE.DEFAULT_DISC);
                State.saveSetting('savedPath', CONFIG.PATHS.DEFAULT_DISC);
                State.saveSetting('savedIsDisc', true);
            }
        } catch (e) {
            console.log("Default disc load error:", e);
        }
    },
    
    cleanup() {
        this.cache.clear();
    }
};

// ====================== RENDERER ======================
const Renderer = {
    paint(gr) {
        State.updatePaintCache();
        
        const pc = State.paintCache;
        gr.FillSolidRect(0, 0, pc.windowWidth, pc.windowHeight, pc.bgColor);
        
        if (!State.img) return;
        
        gr.SetInterpolationMode(State.settings.interpolationMode);
        
        if (!State.isDiscImage) {
            this.paintStatic(gr, pc);
        } else {
            this.paintDisc(gr, pc);
        }
    },
    
    paintStatic(gr, pc) {
        gr.DrawImage(
            State.img,
            pc.staticX, pc.staticY, pc.staticW, pc.staticH,
            0, 0, pc.imgWidth, pc.imgHeight
        );
    },
    
    paintDisc(gr, pc) {
        gr.SetSmoothingMode(CONFIG.SMOOTHING_MODE);
        
        const size = pc.discSize;
        const x = pc.discX;
        const y = pc.discY;
        
        gr.DrawImage(
            State.img,
            x, y, size, size,
            0, 0, pc.imgWidth, pc.imgHeight,
            State.angle
        );
        
        if (AssetManager.shouldShowRim(State.imageType)) {
            const rim = AssetManager.getRim(Math.floor(size));
            if (rim) {
                gr.DrawImage(
                    rim,
                    x, y, size, size,
                    0, 0, rim.Width, rim.Height,
                    State.angle
                );
            }
        }
    }
};

// ================= MENU MANAGER =================
const MenuManager = {
    show(x, y) {
        const menu = window.CreatePopupMenu();
        const s = State.settings;
        
        menu.AppendMenuItem(0, 1, "Album Art Only (Static)");
        menu.CheckMenuItem(1, s.useAlbumArtOnly);
        
        menu.AppendMenuItem(0, 2, "Spinning Enabled");
        menu.CheckMenuItem(2, s.spinningEnabled);
        
        menu.AppendMenuItem(0, 3, "Keep Aspect Ratio");
        menu.CheckMenuItem(3, s.keepAspectRatio);
        
        this.addImageSettingsMenu(menu);
        
        menu.AppendMenuSeparator();
        menu.AppendMenuItem(0, 900, "Clear Image Cache");
        
        this.addCustomFoldersMenu(menu);
        
        const idx = menu.TrackPopupMenu(x, y);
        this.handleSelection(idx);
        
        return true;
    },
    
    addImageSettingsMenu(parent) {
        const settingsMenu = window.CreatePopupMenu();
        
        this.addSpeedMenu(settingsMenu);
        this.addScalingMenu(settingsMenu);
        this.addSizeMenu(settingsMenu);
        this.addMaskMenu(settingsMenu);
        
        settingsMenu.AppendTo(parent, 0, "Image Settings");
    },
    
    addSpeedMenu(parent) {
        const speedMenu = window.CreatePopupMenu();
        const s = State.settings;
        
        CONFIG.SPEED_PRESETS.forEach((preset, i) => {
            speedMenu.AppendMenuItem(0, 10 + i, preset.name);
        });
        
        const speedIdx = s.spinSpeed <= 1.0 ? 10 : (s.spinSpeed >= 3.0 ? 12 : 11);
        speedMenu.CheckMenuRadioItem(10, 12, speedIdx);
        
        speedMenu.AppendTo(parent, 0, "Rotation Speed");
    },
    
    addScalingMenu(parent) {
        const scalingMenu = window.CreatePopupMenu();
        const s = State.settings;
        
        CONFIG.INTERPOLATION_MODES.forEach((mode, i) => {
            scalingMenu.AppendMenuItem(0, 20 + i, mode.name);
            if (s.interpolationMode === mode.value) {
                scalingMenu.CheckMenuItem(20 + i, true);
            }
        });
        
        scalingMenu.AppendTo(parent, 0, "Image Scaling");
    },
    
    addSizeMenu(parent) {
        const sizeMenu = window.CreatePopupMenu();
        const s = State.settings;
        
        CONFIG.DISC_SIZE_PRESETS.forEach((preset, i) => {
            sizeMenu.AppendMenuItem(0, 30 + i, preset.name);
            if (s.maxImageSize === preset.value) {
                sizeMenu.CheckMenuItem(30 + i, true);
            }
        });
        
        sizeMenu.AppendTo(parent, 0, "Disc Size");
    },
    
    addMaskMenu(parent) {
        const maskMenu = window.CreatePopupMenu();
        
        CONFIG.MASK_TYPES.forEach((mask, i) => {
            maskMenu.AppendMenuItem(0, 40 + i, mask.name);
            if (AssetManager.currentMaskType === i) {
                maskMenu.CheckMenuItem(40 + i, true);
            }
        });
        
        maskMenu.AppendTo(parent, 0, "Mask Type");
    },
    
    addCustomFoldersMenu(parent) {
        const customMenu = window.CreatePopupMenu();
        
        customMenu.AppendMenuItem(0, 50, "Add Custom Folder...");
        
        const folders = CustomFolders.getAll();
        if (folders.length > 0) {
            customMenu.AppendMenuSeparator();
            
            folders.forEach((folder, i) => {
                const displayName = folder.length > 50 ? "..." + folder.substring(folder.length - 47) : folder;
                customMenu.AppendMenuItem(0, 60 + i, displayName);
            });
            
            customMenu.AppendMenuSeparator();
            customMenu.AppendMenuItem(0, 70, "Clear All Custom Folders");
        }
        
        customMenu.AppendTo(parent, 0, "Custom Artwork Folders");
    },
    
    handleSelection(idx) {
        let changed = false;
        const s = State.settings;
        
        switch (idx) {
            case 1:
                State.saveSetting('useAlbumArtOnly', !s.useAlbumArtOnly);
                if (State.currentMetadb) ImageLoader.loadForMetadb(State.currentMetadb, true);
                changed = true;
                break;
            
            case 2:
                State.saveSetting('spinningEnabled', !s.spinningEnabled);
                State.updateTimer();
                changed = true;
                break;
            
            case 3:
                State.saveSetting('keepAspectRatio', !s.keepAspectRatio);
                State.paintCache.valid = false;
                changed = true;
                break;
            
            case 10: case 11: case 12:
                const newSpeed = CONFIG.SPEED_PRESETS[idx - 10].value;
                if (s.spinSpeed !== newSpeed) {
                    State.saveSetting('spinSpeed', newSpeed);
                    changed = true;
                }
                break;
            
            case 20: case 21: case 22: case 23: case 24:
                const newMode = CONFIG.INTERPOLATION_MODES[idx - 20].value;
                if (s.interpolationMode !== newMode) {
                    State.saveSetting('interpolationMode', newMode);
                    ImageLoader.cache.clear();
                    if (State.currentMetadb) ImageLoader.loadForMetadb(State.currentMetadb, true);
                    changed = true;
                }
                break;
            
            case 30: case 31: case 32: case 33: case 34:
                const newSize = CONFIG.DISC_SIZE_PRESETS[idx - 30].value;
                if (s.maxImageSize !== newSize) {
                    State.saveSetting('maxImageSize', newSize);
                    ImageLoader.cache.clear();
                    AssetManager.maskCache.clear();
                    AssetManager.rimCache.clear();
                    if (State.currentMetadb) ImageLoader.loadForMetadb(State.currentMetadb, true);
                    changed = true;
                }
                break;
            
            case 40: case 41: case 42:
                if (AssetManager.setMaskType(idx - 40, true)) {
                    ImageLoader.cache.clear();
                    if (State.currentMetadb) ImageLoader.loadForMetadb(State.currentMetadb, true);
                    changed = true;
                }
                break;
            
            case 50:
                try {
                    const folder = utils.InputBox(window.ID, "Enter folder path for custom artwork search:", "Custom Artwork Folder", "", true);
                    if (folder && CustomFolders.add(folder)) {
                        if (State.currentMetadb) ImageLoader.loadForMetadb(State.currentMetadb, true);
                        changed = true;
                    }
                } catch (e) {
                    console.log("Error adding custom folder:", e);
                }
                break;
            
            case 60: case 61: case 62: case 63: case 64:
                if (CustomFolders.remove(idx - 60)) {
                    if (State.currentMetadb) ImageLoader.loadForMetadb(State.currentMetadb, true);
                    changed = true;
                }
                break;
            
            case 70:
                CustomFolders.clear();
                if (State.currentMetadb) ImageLoader.loadForMetadb(State.currentMetadb, true);
                changed = true;
                break;
            
            case 900:
                // Clear image cache
                ImageLoader.cache.clear();
                AssetManager.maskCache.clear();
                AssetManager.rimCache.clear();
                if (State.currentMetadb) ImageLoader.loadForMetadb(State.currentMetadb, true);
                changed = true;
                break;
        }
        
        if (changed) window.Repaint();
    }
};

// ====================== CALLBACKS ======================
function on_paint(gr) {
    Renderer.paint(gr);
}

function on_size() {
    State.paintCache.valid = false;
    AssetManager.maskCache.clear();
    AssetManager.rimCache.clear();
    window.Repaint();
}

function on_playback_new_track(metadb) {
    ImageLoader.loadForMetadb(metadb, true);
}

function on_playback_pause() {
    State.updateTimer();
}

function on_playback_stop() {
    State.angle = 0;
    State.updateTimer();
}

function on_playback_starting() {
    State.updateTimer();
}

function on_selection_changed() {
    if (fb.IsPlaying || fb.IsPaused) return;
    
    const sel = fb.GetSelection();
    if (sel && sel.Count > 0) {
        ImageLoader.loadForMetadb(sel.Item(0));
    }
}

function on_get_album_art_done(metadb, art_id, image, image_path) {
    ImageLoader.handleAlbumArt(metadb, image, image_path);
}

function on_mouse_rbtn_up(x, y) {
    return MenuManager.show(x, y);
}

function on_script_unload() {
    State.cleanup();
    ImageLoader.cleanup();
    AssetManager.cleanup();
    FileManager.clear();
}

// ====================== INITIALIZATION ======================
function init() {
    State.loadSettings();
    AssetManager.init();
    CustomFolders.load();
    
    const nowPlaying = fb.GetNowPlaying();
    
    if (nowPlaying) {
        ImageLoader.loadForMetadb(nowPlaying, true);
    } else if (State.settings.savedPath && FileManager.exists(State.settings.savedPath)) {
        try {
            const imageType = Utils.getImageType(State.settings.savedPath);
            
            if (imageType === CONFIG.IMAGE_TYPE.DEFAULT_DISC) {
                ImageLoader.loadDefaultDisc();
            } else {
                const img = ImageLoader.loadCached(State.settings.savedPath, imageType);
                if (img) {
                    State.setImage(img, State.settings.savedIsDisc, imageType);
                }
            }
        } catch (e) {
            console.log("Init error:", e);
        }
    }
    
    State.updateTimer();
}

(function waitForReady() {
    if (window.Width > 0 && window.Height > 0) {
        init();
    } else {
        window.SetTimeout(waitForReady, 50);
    }

})();

