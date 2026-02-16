'use strict'; 
		  // ======= AUTHOR L.E.D. (AI-assisted) ========\\
		 // ========= SMP 64bit Volume Knob V2.0 =========\\
		// =========== Simple Function + Themes ===========\\

 // ===================*** Foobar2000 64bit ***================== \\
// ======= For Spider Monekey Panel 64bit, author: marc2003 ====== \\

window.DefineScript('SMP 64bit Volume Knob', { author: 'L.E.D.' });

// Manual RGB fallback
const RGB = (r, g, b) => (0xff000000 | (r << 16) | (g << 8) | (b));

include(fb.ComponentPath + 'samples\\complete\\js\\lodash.min.js');
include(fb.ComponentPath + 'samples\\complete\\js\\helpers.js');
include(fb.ComponentPath + 'samples\\complete\\js\\panel.js');

// ====================== BUTTON PAINT OVERRIDE ======================
// Override _button paint to use stretch mode for zero spacing between buttons
_button.prototype.paint = function(gr) {
	if (this.img) {
		_drawImage(gr, this.img, this.x, this.y, this.w, this.h, image.stretch);
	}
}

// ====================== CONSTANTS ======================
const MENU_ID = {
    ALIGN_V_TOP: 10,
    ALIGN_V_MIDDLE: 11,
    ALIGN_V_BOTTOM: 12,
    SIZE_SMALL: 20,
    SIZE_MEDIUM: 21,
    SIZE_LARGE: 22,
    SIZE_XL: 23,
    SIZE_CUSTOM: 24,
    MARGIN_NONE: 30,
    MARGIN_SMALL: 31,
    MARGIN_MEDIUM: 32,
    MARGIN_LARGE: 33,
    MODE_FIXED: 40,
    MODE_FILL: 41,
    COLOR_TOGGLE: 50,
    COLOR_NORMAL: 51,
    COLOR_HOVER: 52,
    COLOR_DOWN: 53,
    ALIGN_H_LEFT: 60,
    ALIGN_H_CENTER: 61,
    ALIGN_H_RIGHT: 62,
    RESET: 99
};

const SIZE_PRESETS = {
    SMALL: 32,
    MEDIUM: 64,
    LARGE: 128,
    XL: 256
};

const MARGIN_PRESETS = {
    NONE: 0,
    SMALL: 5,
    MEDIUM: 10,
    LARGE: 20
};

const ALIGN = {
    TOP: 0,
    MIDDLE: 1,
    BOTTOM: 2,
    LEFT: 0,
    CENTER: 1,
    RIGHT: 2
};

// ====================== PROPERTY MANAGEMENT ======================
const PropertyManager = {
    defaults: {
        btnSize: 64,
        margin: 10,
        alignV: 1,
        alignH: 1,
        fillPanel: false,
        useTint: false,
        colorNormal: RGB(255, 255, 255),
        colorHover: RGB(150, 150, 150),
        colorDown: RGB(100, 100, 100)
    },
    
    validators: {
        btnSize: (val) => {
            const size = parseInt(val);
            return (size >= 16 && size <= 512) ? size : 64;
        },
        margin: (val) => {
            const m = parseInt(val);
            return (m >= 0 && m <= 100) ? m : 10;
        },
        align: (val) => {
            return (val >= 0 && val <= 2) ? val : 1;
        }
    },
    
    load() {
        this.btnSize = this.validators.btnSize(window.GetProperty('Buttons: Size', this.defaults.btnSize));
        this.margin = this.validators.margin(window.GetProperty('Buttons: Margin', this.defaults.margin));
        this.alignV = this.validators.align(window.GetProperty('Buttons: Vertical Alignment (0=Top, 1=Middle, 2=Bottom)', this.defaults.alignV));
        this.alignH = this.validators.align(window.GetProperty('Buttons: Horizontal Alignment (0=Left, 1=Centre, 2=Right)', this.defaults.alignH));
        this.fillPanel = window.GetProperty('Buttons: Fill Panel', this.defaults.fillPanel);
        this.useTint = window.GetProperty('Colors: Use Tint', this.defaults.useTint);
        this.colorNormal = window.GetProperty('Colors: Normal', this.defaults.colorNormal);
        this.colorHover = window.GetProperty('Colors: Hover', this.defaults.colorHover);
        this.colorDown = window.GetProperty('Colors: Down', this.defaults.colorDown);
    },
    
    save(key, value) {
        window.SetProperty(key, value);
        this.load(); // Reload to ensure consistency
    },
    
    reset() {
        window.SetProperty('Buttons: Size', null);
        window.SetProperty('Buttons: Margin', null);
        window.SetProperty('Buttons: Vertical Alignment (0=Top, 1=Middle, 2=Bottom)', null);
        window.SetProperty('Buttons: Horizontal Alignment (0=Left, 1=Centre, 2=Right)', null);
        window.SetProperty('Buttons: Fill Panel', null);
        window.SetProperty('Colors: Use Tint', null);
        window.SetProperty('Colors: Normal', null);
        window.SetProperty('Colors: Hover', null);
        window.SetProperty('Colors: Down', null);
        this.load();
    }
};

// ====================== BUTTON MANAGER ======================
const ButtonManager = {
    buttons: {},
    cachedLayout: null,
    lastPlayState: null,
    updatePending: false,
    
    init() {
        this.panel = new _panel(true);
        this.buttonsHelper = new _buttons();
        this.lastPlayState = null;
    },
    
    dispose() {
        if (this.buttons && typeof this.buttons === 'object') {
            Object.values(this.buttons).forEach(btn => {
                if (btn && typeof btn.dispose === 'function') {
                    btn.dispose();
                }
            });
        }
        this.buttons = {};
        this.cachedLayout = null;
    },
    
    calculateLayout() {
        const margin = _scale(PropertyManager.margin);
        let layout = { margin };
        
        if (PropertyManager.fillPanel) {
            // Fill Width mode - buttons stretch horizontally
            layout.buttonWidth = (this.panel.w - (margin * 2)) / 4; // No padding between buttons
            layout.buttonHeight = _scale(PropertyManager.btnSize);
            layout.x = margin;
            
            // Vertical alignment
            if (PropertyManager.alignV === ALIGN.TOP) {
                layout.y = margin;
            } else if (PropertyManager.alignV === ALIGN.MIDDLE) {
                layout.y = Math.floor((this.panel.h - layout.buttonHeight) / 2);
            } else {
                layout.y = this.panel.h - layout.buttonHeight - margin;
            }
        } else {
            // Fixed aspect mode - square buttons
            const size = _scale(PropertyManager.btnSize);
            layout.buttonWidth = layout.buttonHeight = size;
            const totalWidth = size * 4; // No padding between buttons
            const totalHeight = size;
            
            // Vertical alignment
            if (PropertyManager.alignV === ALIGN.TOP) {
                layout.y = margin;
            } else if (PropertyManager.alignV === ALIGN.MIDDLE) {
                layout.y = Math.floor((this.panel.h - totalHeight) / 2);
            } else {
                layout.y = this.panel.h - totalHeight - margin;
            }
            
            // Horizontal alignment
            if (PropertyManager.alignH === ALIGN.LEFT) {
                layout.x = margin;
            } else if (PropertyManager.alignH === ALIGN.CENTER) {
                layout.x = Math.floor((this.panel.w - totalWidth) / 2);
            } else {
                layout.x = this.panel.w - totalWidth - margin;
            }
        }
        
        return layout;
    },
    
    createImageObject(path) {
        return {
            normal: path,
            clr: PropertyManager.useTint ? 
                [PropertyManager.colorNormal, PropertyManager.colorHover, PropertyManager.colorDown] : null
        };
    },
    
    getPlayState() {
        return fb.IsPlaying && !fb.IsPaused;
    },
    
    updatePlayButtonOnly() {
        const isPlaying = this.getPlayState();
        
        if (this.lastPlayState === isPlaying) {
            return false; // No change needed
        }
        
        this.lastPlayState = isPlaying;
        
        if (this.buttons.play && typeof this.buttons.play.update === 'function') {
            // If button has update method, use it
            this.buttons.play.update(
                this.createImageObject(isPlaying ? 'profile\\buttons\\pause.png' : 'profile\\buttons\\play.png'),
                isPlaying ? 'Pause' : 'Play'
            );
        } else {
            // Otherwise recreate all buttons
            this.createAllButtons();
        }
        
        return true;
    },
    
    createAllButtons() {
        this.dispose();
        
        const layout = this.calculateLayout();
        const { x, y, buttonWidth: w, buttonHeight: h } = layout;
        
        const isPlaying = this.getPlayState();
        this.lastPlayState = isPlaying;
        
        // Create buttons (no padding between them)
        this.buttons.stop = new _button(
            x, y, w, h, 
            this.createImageObject('profile\\buttons\\stop.png'), 
            () => fb.Stop(), 
            'Stop'
        );
        
        this.buttons.play = new _button(
            x + w, y, w, h,
            this.createImageObject(isPlaying ? 'profile\\buttons\\pause.png' : 'profile\\buttons\\play.png'),
            () => fb.PlayOrPause(),
            isPlaying ? 'Pause' : 'Play'
        );
        
        this.buttons.previous = new _button(
            x + (w * 2), y, w, h,
            this.createImageObject('profile\\buttons\\previous.png'),
            () => fb.Prev(),
            'Previous'
        );
        
        this.buttons.next = new _button(
            x + (w * 3), y, w, h,
            this.createImageObject('profile\\buttons\\next.png'),
            () => fb.Next(),
            'Next'
        );
        
        this.cachedLayout = layout;
    },
    
    requestUpdate(immediate = false) {
        if (immediate) {
            this.createAllButtons();
            window.Repaint();
        } else if (!this.updatePending) {
            this.updatePending = true;
            setTimeout(() => {
                this.updatePending = false;
                this.createAllButtons();
                window.Repaint();
            }, 16); // Debounce at ~60fps
        }
    },
    
    paint(gr) {
        this.panel.paint(gr);
        this.buttonsHelper.paint(gr);
    },
    
    move(x, y) {
        this.buttonsHelper.move(x, y);
    },
    
    leave() {
        this.buttonsHelper.leave();
    },
    
    lbtn_up(x, y, mask) {
        this.buttonsHelper.lbtn_up(x, y, mask);
    }
};

// ====================== MENU MANAGER ======================
const MenuManager = {
    create(x, y) {
        const m = window.CreatePopupMenu();
        const v = window.CreatePopupMenu();
        const h = window.CreatePopupMenu();
        const s = window.CreatePopupMenu();
        const mg = window.CreatePopupMenu();
        const col = window.CreatePopupMenu();
        
        // Mode selection
        m.AppendMenuItem(MF_STRING, MENU_ID.MODE_FIXED, 'Fixed (Square Buttons)');
        m.AppendMenuItem(MF_STRING, MENU_ID.MODE_FILL, 'Fill Width (Stretch)');
        m.CheckMenuRadioItem(MENU_ID.MODE_FIXED, MENU_ID.MODE_FILL, 
            PropertyManager.fillPanel ? MENU_ID.MODE_FILL : MENU_ID.MODE_FIXED);
        m.AppendMenuSeparator();

        // Horizontal alignment (disabled when fillPanel)
        h.AppendMenuItem(MF_STRING, MENU_ID.ALIGN_H_LEFT, 'Left');
        h.AppendMenuItem(MF_STRING, MENU_ID.ALIGN_H_CENTER, 'Centre');
        h.AppendMenuItem(MF_STRING, MENU_ID.ALIGN_H_RIGHT, 'Right');
        h.CheckMenuRadioItem(MENU_ID.ALIGN_H_LEFT, MENU_ID.ALIGN_H_RIGHT, 
            MENU_ID.ALIGN_H_LEFT + PropertyManager.alignH);
        h.AppendTo(m, PropertyManager.fillPanel ? MF_GRAYED : MF_STRING, 'Horizontal Alignment');

        // Vertical alignment
        v.AppendMenuItem(MF_STRING, MENU_ID.ALIGN_V_TOP, 'Top');
        v.AppendMenuItem(MF_STRING, MENU_ID.ALIGN_V_MIDDLE, 'Middle');
        v.AppendMenuItem(MF_STRING, MENU_ID.ALIGN_V_BOTTOM, 'Bottom');
        v.CheckMenuRadioItem(MENU_ID.ALIGN_V_TOP, MENU_ID.ALIGN_V_BOTTOM, 
            MENU_ID.ALIGN_V_TOP + PropertyManager.alignV);
        v.AppendTo(m, MF_STRING, 'Vertical Alignment');
        
        m.AppendMenuSeparator();

        // Button size
        s.AppendMenuItem(MF_STRING, MENU_ID.SIZE_SMALL, `Small (${SIZE_PRESETS.SMALL}px)`);
        s.AppendMenuItem(MF_STRING, MENU_ID.SIZE_MEDIUM, `Medium (${SIZE_PRESETS.MEDIUM}px)`);
        s.AppendMenuItem(MF_STRING, MENU_ID.SIZE_LARGE, `Large (${SIZE_PRESETS.LARGE}px)`);
        s.AppendMenuItem(MF_STRING, MENU_ID.SIZE_XL, `Extra Large (${SIZE_PRESETS.XL}px)`);
        s.AppendMenuSeparator();
        s.AppendMenuItem(MF_STRING, MENU_ID.SIZE_CUSTOM, 'Set Custom Size...');
        s.AppendTo(m, MF_STRING, 'Button Size');

        // Margin (padding around button group)
        mg.AppendMenuItem(MF_STRING, MENU_ID.MARGIN_NONE, `None (${MARGIN_PRESETS.NONE}px)`);
        mg.AppendMenuItem(MF_STRING, MENU_ID.MARGIN_SMALL, `Small (${MARGIN_PRESETS.SMALL}px)`);
        mg.AppendMenuItem(MF_STRING, MENU_ID.MARGIN_MEDIUM, `Medium (${MARGIN_PRESETS.MEDIUM}px)`);
        mg.AppendMenuItem(MF_STRING, MENU_ID.MARGIN_LARGE, `Large (${MARGIN_PRESETS.LARGE}px)`);
        mg.AppendTo(m, MF_STRING, 'Margin');

        // Colors & Tint
        col.AppendMenuItem(MF_STRING, MENU_ID.COLOR_TOGGLE, 'Enable Custom Tint');
        col.CheckMenuItem(MENU_ID.COLOR_TOGGLE, PropertyManager.useTint);
        col.AppendMenuSeparator();
        col.AppendMenuItem(PropertyManager.useTint ? MF_STRING : MF_GRAYED, MENU_ID.COLOR_NORMAL, 'Set Normal Color...');
        col.AppendMenuItem(PropertyManager.useTint ? MF_STRING : MF_GRAYED, MENU_ID.COLOR_HOVER, 'Set Hover Color...');
        col.AppendMenuItem(PropertyManager.useTint ? MF_STRING : MF_GRAYED, MENU_ID.COLOR_DOWN, 'Set Click Color...');
        col.AppendTo(m, MF_STRING, 'Colors & Tint');

        m.AppendMenuSeparator();
        m.AppendMenuItem(MF_STRING, MENU_ID.RESET, 'Reset All Settings');

        return m.TrackPopupMenu(x, y);
    },
    
    handle(idx, x, y) {
        let changed = false;

        switch (idx) {
            // Vertical alignment
            case MENU_ID.ALIGN_V_TOP:
            case MENU_ID.ALIGN_V_MIDDLE:
            case MENU_ID.ALIGN_V_BOTTOM:
                PropertyManager.save('Buttons: Vertical Alignment (0=Top, 1=Middle, 2=Bottom)', 
                    idx - MENU_ID.ALIGN_V_TOP);
                changed = true;
                break;
            
            // Horizontal alignment
            case MENU_ID.ALIGN_H_LEFT:
            case MENU_ID.ALIGN_H_CENTER:
            case MENU_ID.ALIGN_H_RIGHT:
                if (!PropertyManager.fillPanel) {
                    PropertyManager.save('Buttons: Horizontal Alignment (0=Left, 1=Centre, 2=Right)', 
                        idx - MENU_ID.ALIGN_H_LEFT);
                    changed = true;
                }
                break;
            
            // Button sizes
            case MENU_ID.SIZE_SMALL:
                PropertyManager.save('Buttons: Size', SIZE_PRESETS.SMALL);
                changed = true;
                break;
            
            case MENU_ID.SIZE_MEDIUM:
                PropertyManager.save('Buttons: Size', SIZE_PRESETS.MEDIUM);
                changed = true;
                break;
            
            case MENU_ID.SIZE_LARGE:
                PropertyManager.save('Buttons: Size', SIZE_PRESETS.LARGE);
                changed = true;
                break;
            
            case MENU_ID.SIZE_XL:
                PropertyManager.save('Buttons: Size', SIZE_PRESETS.XL);
                changed = true;
                break;
            
            case MENU_ID.SIZE_CUSTOM:
                const val = utils.InputBox(window.ID, 
                    'Enter button size (16-512 pixels):', 
                    'Custom Size', 
                    PropertyManager.btnSize);
                if (val) {
                    const newSize = PropertyManager.validators.btnSize(val);
                    if (newSize !== PropertyManager.btnSize) {
                        PropertyManager.save('Buttons: Size', newSize);
                        changed = true;
                    }
                }
                break;
            
            // Margin
            case MENU_ID.MARGIN_NONE:
                PropertyManager.save('Buttons: Margin', MARGIN_PRESETS.NONE);
                changed = true;
                break;
            
            case MENU_ID.MARGIN_SMALL:
                PropertyManager.save('Buttons: Margin', MARGIN_PRESETS.SMALL);
                changed = true;
                break;
            
            case MENU_ID.MARGIN_MEDIUM:
                PropertyManager.save('Buttons: Margin', MARGIN_PRESETS.MEDIUM);
                changed = true;
                break;
            
            case MENU_ID.MARGIN_LARGE:
                PropertyManager.save('Buttons: Margin', MARGIN_PRESETS.LARGE);
                changed = true;
                break;
            
            // Mode
            case MENU_ID.MODE_FIXED:
                PropertyManager.save('Buttons: Fill Panel', false);
                changed = true;
                break;
            
            case MENU_ID.MODE_FILL:
                PropertyManager.save('Buttons: Fill Panel', true);
                changed = true;
                break;
            
            // Colors
            case MENU_ID.COLOR_TOGGLE:
                PropertyManager.save('Colors: Use Tint', !PropertyManager.useTint);
                changed = true;
                break;
            
            case MENU_ID.COLOR_NORMAL:
                if (PropertyManager.useTint) {
                    const newColor = utils.ColorPicker(window.ID, PropertyManager.colorNormal);
                    if (newColor !== -1 && newColor !== PropertyManager.colorNormal) {
                        PropertyManager.save('Colors: Normal', newColor);
                        changed = true;
                    }
                }
                break;
            
            case MENU_ID.COLOR_HOVER:
                if (PropertyManager.useTint) {
                    const newColor = utils.ColorPicker(window.ID, PropertyManager.colorHover);
                    if (newColor !== -1 && newColor !== PropertyManager.colorHover) {
                        PropertyManager.save('Colors: Hover', newColor);
                        changed = true;
                    }
                }
                break;
            
            case MENU_ID.COLOR_DOWN:
                if (PropertyManager.useTint) {
                    const newColor = utils.ColorPicker(window.ID, PropertyManager.colorDown);
                    if (newColor !== -1 && newColor !== PropertyManager.colorDown) {
                        PropertyManager.save('Colors: Down', newColor);
                        changed = true;
                    }
                }
                break;
            
            // Reset
            case MENU_ID.RESET:
                PropertyManager.reset();
                changed = true;
                break;
            
            default:
                // Panel context menu
                if (idx > 0) return ButtonManager.panel.rbtn_up(x, y);
        }

        if (changed) {
            ButtonManager.requestUpdate(true);
        }

        return true;
    }
};

// ====================== INITIALIZATION ======================
PropertyManager.load();
ButtonManager.init();
ButtonManager.buttonsHelper.update = () => ButtonManager.createAllButtons();
ButtonManager.createAllButtons();

// ====================== CALLBACKS ======================
function on_size() { 
    ButtonManager.panel.size(); 
    ButtonManager.requestUpdate(true);
}

function on_paint(gr) { 
    ButtonManager.paint(gr);
}

function on_playback_stop() { 
    if (ButtonManager.lastPlayState !== null) {
        ButtonManager.lastPlayState = null;
        if (ButtonManager.updatePlayButtonOnly()) {
            window.Repaint();
        }
    }
}

function on_playback_pause() { 
    if (ButtonManager.updatePlayButtonOnly()) {
        window.Repaint();
    }
}

function on_playback_starting() { 
    if (ButtonManager.updatePlayButtonOnly()) {
        window.Repaint();
    }
}

function on_mouse_move(x, y) { 
    ButtonManager.move(x, y);
}

function on_mouse_leave() { 
    ButtonManager.leave();
}

function on_mouse_lbtn_up(x, y, mask) { 
    ButtonManager.lbtn_up(x, y, mask);
}

function on_mouse_rbtn_up(x, y) {
    const idx = MenuManager.create(x, y);
    return MenuManager.handle(idx, x, y);
}

function on_colours_changed() { 
    ButtonManager.panel.colours_changed(); 
    window.Repaint();
}

function on_script_unload() {
    ButtonManager.dispose();
}
