	         // ======== AUTHOR L.E.D. AI ASSISTED ======== \\
	        // ======= SMP 64bit Disc Spin V2 Script ======= \\
	       // ======= Spins Disc + Artwork + Cover  ========= \\

    // ===================*** Foobar2000 64bit ***================== \\
   // ======= For Spider Monekey Panel 64bit, author: marc2003 ====== \\
  // ====== Masking All Images, Creates a Disc from Album Art+  ====== \\
 // ======== Sample Code ApplyMask author: T.P Wang / marc2003 ======== \\
// ==-== Inspired by "CD Album Art, @authors "marc2003, Jul23, vnav" =-==\\

window.DefineScript('SMP 64bit Disc Spin', { author: 'L.E.D.' });

// ====================== CONFIGURATION ======================
const CONFIG = Object.freeze({
    TIMER_INTERVAL: 50,
    MAX_STATIC_SIZE: 2000,
    MAX_CACHE_ENTRIES: 50,
    MAX_MASK_CACHE: 10,
    MAX_RIM_CACHE: 10,
    MAX_FILE_CACHE: 100,
    
    MIN_DISC_SIZE: 50,
    MAX_DISC_SIZE: 2000,
    MIN_SPIN_SPEED: 0.1,
    MAX_SPIN_SPEED: 10,
    
    SMOOTHING_MODE: 3,
    DISC_SCALE_FACTOR: 0.98,
    ANGLE_MODULO: 360,
    LOAD_DEBOUNCE_MS: 100,
    
    PATHS: {
        DEFAULT_DISC: fb.ProfilePath + "skins\\default_disc.png",
        MASK: fb.ProfilePath + "skins\\mask.png",
        RIM: fb.ProfilePath + "skins\\center_album_rim.png"
    },
    
    DISC_FILES: [
        "\\disc.png", "\\disc.jpg", "\\cd.png", "\\cd.jpg",
        "\\CD.png", "\\CD.jpg", "\\media.png", "\\media.jpg",
        "\\vinyl.png", "\\vinyl.jpg"
    ],
    
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
    
    getImageType(path) {
        if (!path) return null;
        if (path === CONFIG.PATHS.DEFAULT_DISC) return CONFIG.IMAGE_TYPE.DEFAULT_DISC;
        
        const pathLower = path.toLowerCase();
        const isRealDisc = CONFIG.DISC_FILES.some(file => 
            pathLower.endsWith(file.toLowerCase())
        );
        
        return isRealDisc ? CONFIG.IMAGE_TYPE.REAL_DISC : CONFIG.IMAGE_TYPE.ALBUM_ART;
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
    
    clear() {
        this.cache.clear();
    }
};

// ====================== ASSET MANAGER ======================
const AssetManager = {
    maskSource: null,
    rimSource: null,
    maskCache: new LRUCache(CONFIG.MAX_MASK_CACHE),
    rimCache: new LRUCache(CONFIG.MAX_RIM_CACHE),
    
    init() {
        try {
            if (FileManager.exists(CONFIG.PATHS.MASK)) {
                this.maskSource = gdi.Image(CONFIG.PATHS.MASK);
            }
        } catch (e) {
            console.log("Failed to load mask:", e);
        }
        
        try {
            if (FileManager.exists(CONFIG.PATHS.RIM)) {
                this.rimSource = gdi.Image(CONFIG.PATHS.RIM);
            }
        } catch (e) {
            console.log("Failed to load rim:", e);
        }
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
    scaleToSquare(raw, targetSize, interpolationMode) {
        if (!raw) return null;
        
        const w = raw.Width;
        const h = raw.Height;
        
        if (w === targetSize && h === targetSize) return raw;
        
        try {
            const newImg = gdi.CreateImage(targetSize, targetSize);
            const g = newImg.GetGraphics();
            g.SetInterpolationMode(interpolationMode);
            
            // Fill black background
            g.FillSolidRect(0, 0, targetSize, targetSize, 0xFF000000);
            
            // Center and scale
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
        
        // Scale to target size
        let processed = this.scaleToSquare(raw, targetSize, interpolationMode);
        if (!processed) return null;
        
        // Apply mask based on type
        if (imageType === CONFIG.IMAGE_TYPE.REAL_DISC || 
            imageType === CONFIG.IMAGE_TYPE.ALBUM_ART) {
            processed = this.applyMask(processed, targetSize);
        }
        
        return processed;
    }
};

// ====================== STATE MANAGER ======================
const State = {
    // Current state
    img: null,
    angle: 0,
    isDiscImage: false,
    imageType: CONFIG.IMAGE_TYPE.REAL_DISC,
    currentMetadb: null,
    
    // Timers
    spinTimer: null,
    loadTimer: null,
    
    // Settings
    settings: {
        spinningEnabled: true,
        spinSpeed: 2.0,
        useAlbumArtOnly: false,
        keepAspectRatio: true,
        interpolationMode: 5,
        maxImageSize: 250,
        savedPath: "",
        savedIsDisc: false
    },
    
    // Paint cache
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
        s.interpolationMode = window.GetProperty("RP.InterpolationMode", 5);
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
        pc.bgColor = window.GetColourDUI(1);
        
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
    
    loadCached(path, imageType) {
        const s = State.settings;
        const key = `${path}|${s.maxImageSize}|${imageType}`;
        
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
    
    searchForDisc(folderPath) {
        for (let i = 0; i < CONFIG.DISC_FILES.length; i++) {
            const path = folderPath + CONFIG.DISC_FILES[i];
            const img = this.loadCached(path, CONFIG.IMAGE_TYPE.REAL_DISC);
            
            if (img) {
                return { img, path, type: CONFIG.IMAGE_TYPE.REAL_DISC };
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
            
            // Search for real disc
            if (!State.settings.useAlbumArtOnly) {
                const result = this.searchForDisc(folderPath);
                if (result) {
                    State.setImage(result.img, true, result.type);
                    State.saveSetting('savedPath', result.path);
                    State.saveSetting('savedIsDisc', true);
                    State.updateTimer();
                    return;
                }
            }
            
            // Fallback to album art
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
                    // Static mode
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
                    // Disc mode
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
                // Load default disc
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
                State.settings.interpolationMode
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
        
        // Draw disc
        gr.DrawImage(
            State.img,
            x, y, size, size,
            0, 0, pc.imgWidth, pc.imgHeight,
            State.angle
        );
        
        // Draw rim for album art only
        if (State.imageType === CONFIG.IMAGE_TYPE.ALBUM_ART) {
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

// ====================== MENU MANAGER ======================
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
        
        this.addSpeedMenu(menu);
        this.addQualityMenu(menu);
        
        const idx = menu.TrackPopupMenu(x, y);
        this.handleSelection(idx);
        
        return true;
    },
    
    addSpeedMenu(parent) {
        const speedMenu = window.CreatePopupMenu();
        const s = State.settings;
        
        speedMenu.AppendMenuItem(0, 10, "Slow (0.5x)");
        speedMenu.AppendMenuItem(0, 11, "Normal (2.0x)");
        speedMenu.AppendMenuItem(0, 12, "Fast (5.0x)");
        
        const idx = s.spinSpeed <= 0.5 ? 10 : (s.spinSpeed >= 5.0 ? 12 : 11);
        speedMenu.CheckMenuRadioItem(10, 12, idx);
        
        speedMenu.AppendTo(parent, 0, "Rotation Speed");
    },
    
    addQualityMenu(parent) {
        const qualityMenu = window.CreatePopupMenu();
        
        this.addInterpMenu(qualityMenu);
        this.addSizeMenu(qualityMenu);
        
        qualityMenu.AppendTo(parent, 0, "Image Quality");
    },
    
    addInterpMenu(parent) {
        const interpMenu = window.CreatePopupMenu();
        const s = State.settings;
        
        CONFIG.INTERPOLATION_MODES.forEach((mode, i) => {
            interpMenu.AppendMenuItem(0, 20 + i, mode.name);
            if (s.interpolationMode === mode.value) {
                interpMenu.CheckMenuItem(20 + i, true);
            }
        });
        
        interpMenu.AppendTo(parent, 0, "Interpolation Mode");
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
            
            case 10:
                if (s.spinSpeed !== 0.5) {
                    State.saveSetting('spinSpeed', 0.5);
                    changed = true;
                }
                break;
            
            case 11:
                if (s.spinSpeed !== 2.0) {
                    State.saveSetting('spinSpeed', 2.0);
                    changed = true;
                }
                break;
            
            case 12:
                if (s.spinSpeed !== 5.0) {
                    State.saveSetting('spinSpeed', 5.0);
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