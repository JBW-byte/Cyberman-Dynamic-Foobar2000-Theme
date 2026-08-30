'use strict';
           // ============== AUTHOR L.E.D. ============== \\
          // ==-== 	  Audio PlayBack Buttons v1.4    ==-== \\
         // ========== PlayBack and Custom Sets =========== \\

  // ===================*** Foobar2000 64bit ***================== \\
 // ======= For Spider Monkey Panel 64bit, author: marc2003 ======= \\
// ===  Developed from samples Playback Buttons, author:marc2003 === \\

window.DefineScript('Playback Buttons Pro v1.4', { author: 'L.E.D.', options: { grab_focus: false } });

include(fb.ComponentPath + 'samples\\complete\\js\\lodash.min.js');
include(fb.ComponentPath + 'samples\\complete\\js\\helpers.js');
include(fb.ComponentPath + 'samples\\complete\\js\\panel.js');

// ====================== CONSTANTS ======================
const MENU_ID = {
	ALIGN_V_TOP:    10,
	ALIGN_V_MIDDLE: 11,
	ALIGN_V_BOTTOM: 12,
	SIZE_SMALL:     20,
	SIZE_MEDIUM:    21,
	SIZE_LARGE:     22,
	SIZE_XL:        23,
	SIZE_CUSTOM:    24,
	PAD_GAP_CUSTOM:    30,
	PAD_BORDER_CUSTOM: 31,
	MODE_FIXED:      40,
	MODE_FILL:       41,
	MODE_FIT_HEIGHT: 42,
	COLOR_TOGGLE:   50,
	COLOR_NORMAL:   51,
	COLOR_HOVER:    52,
	COLOR_DOWN:     53,
	BG_TOGGLE:      54,
	BG_COLOR:       55,
	ALIGN_H_LEFT:   60,
	ALIGN_H_CENTER: 61,
	ALIGN_H_RIGHT:  62,
	RESET:          99
};

const STYLE_MENU_ID_BASE = 100;

const SIZE_PRESETS = {
	SMALL:  32,
	MEDIUM: 64,
	LARGE:  128,
	XL:     256
};

const SIZE_MODE = {
	FIXED:      0,
	FILL_WIDTH: 1,
	FIT_HEIGHT: 2
};

const ALIGN = {
	TOP:    0,
	MIDDLE: 1,
	BOTTOM: 2,
	LEFT:   0,
	CENTER: 1,
	RIGHT:  2
};

const PROP_DEFAULTS = {
	btnSize:       128,
	paddingGap:    0,
	paddingBorder: 0,
	alignV:        1,
	alignH:        1,
	sizeMode:      SIZE_MODE.FILL_WIDTH,
	useTint:       false,
	colorNormal:   _RGB(255, 255, 255),
	colorHover:    _RGB(150, 150, 150),
	colorDown:     _RGB(100, 100, 100),
	useBgColor:    false,
	bgColor:       _RGB(20, 20, 20),
	buttonStyle:   ''
};

// ====================== BUTTON STYLE SCANNING ======================
const SUPPORTED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.bmp', '.gif'];
const REQUIRED_ICON_NAMES = ['stop', 'play', 'previous', 'next'];

function _findIconExt(baseDir, baseName) {
	for (let i = 0; i < SUPPORTED_EXTENSIONS.length; i++) {
		const ext = SUPPORTED_EXTENSIONS[i];
		if (_isFile(baseDir + baseName + ext)) return ext;
	}
	return null;
}

function _resolveButtonsBaseDir() {
	const probeExts = ['.png', '.jpg', '.jpeg', '.bmp', '.gif'];
	const candidates = [
		'profile\\buttons\\',
		fb.ProfilePath + 'buttons\\',
		fb.ProfilePath + 'profile\\buttons\\',
		folders.images + 'profile\\buttons\\',
		folders.images + 'buttons\\'
	];

	for (let c = 0; c < candidates.length; c++) {
		const dir = candidates[c];
		for (let i = 0; i < probeExts.length; i++) {
			if (_isFile(dir + 'stop' + probeExts[i])) return dir;
		}
	}

	return folders.images + 'profile\\buttons\\';
}

const BUTTONS_BASE_DIR = _resolveButtonsBaseDir();

function scanButtonStyles() {
	const styles = [''];
	try {
		const fso = new ActiveXObject('Scripting.FileSystemObject');
		if (fso.FolderExists(BUTTONS_BASE_DIR)) {
			const folder = fso.GetFolder(BUTTONS_BASE_DIR);
			const en = new Enumerator(folder.SubFolders);
			for (; !en.atEnd(); en.moveNext()) {
				const sub     = en.item();
				const subPath = sub.Path + '\\';
				const hasAll  = REQUIRED_ICON_NAMES.every((name) => _findIconExt(subPath, name) !== null);
				if (hasAll) styles.push(sub.Name);
			}
		}
	} catch (e) {
		if (typeof console !== 'undefined' && console.log) {
			console.log('ThePlayButtons: scanButtonStyles error:', e);
		}
	}
	styles.sort((a, b) => {
		if (a === b) return 0;
		if (a === '') return -1;
		if (b === '') return 1;
		return a.localeCompare(b);
	});
	return styles;
}

function validateStyle(val) {
	if (typeof val !== 'string' || val === '') return PROP_DEFAULTS.buttonStyle;
	const available = scanButtonStyles();
	return available.indexOf(val) !== -1 ? val : PROP_DEFAULTS.buttonStyle;
}

function getButtonImagePath(baseName) {
	if (buttonStyle) {
		const styleDir = BUTTONS_BASE_DIR + buttonStyle + '\\';
		const ext = _findIconExt(styleDir, baseName);
		if (ext) return BUTTONS_BASE_DIR + buttonStyle + '\\' + baseName + ext;
	}
	const defExt = _findIconExt(BUTTONS_BASE_DIR, baseName) || '.png';
	return BUTTONS_BASE_DIR + baseName + defExt;
}

function _createIconButton(x, y, w, h, baseName, fn, tooltip) {
	const primaryPath = getButtonImagePath(baseName);
	try {
		return new _button(x, y, w, h, { normal: primaryPath }, fn, tooltip);
	} catch (e) {
		if (typeof console !== 'undefined' && console.log) {
			console.log('ThePlayButtons: failed to load icon "' + primaryPath + '", falling back:', e);
		}
		const fallbackExt  = _findIconExt(BUTTONS_BASE_DIR, baseName) || '.png';
		const fallbackPath = BUTTONS_BASE_DIR + baseName + fallbackExt;
		try {
			return new _button(x, y, w, h, { normal: fallbackPath }, fn, tooltip);
		} catch (e2) {
			return new _button(x, y, w, h, { normal: null }, fn, tooltip);
		}
	}
}

// ====================== STATE ======================
let panel = new _panel(true);
let buttons = new _buttons();
let lastPlayState = null;

let btnSize, paddingGap, paddingBorder, alignV, alignH, sizeMode, useTint;
let colorNormal, colorHover, colorDown;
let useBgColor, bgColor;
let buttonStyle;

// ====================== PROPERTY MANAGEMENT ======================
function validateSize(val) {
	const size = parseInt(val, 10);
	return (size >= 16 && size <= 512) ? size : PROP_DEFAULTS.btnSize;
}

function validatePaddingValue(val, defaultVal) {
	const v = parseInt(val, 10);
	return (!isNaN(v) && v >= 0 && v <= 300) ? v : defaultVal;
}

function validateAlign(val, defaultVal) {
	const def = (defaultVal !== undefined) ? defaultVal : 1;
	return (val >= 0 && val <= 2) ? val : def;
}

function init_properties() {
	btnSize       = validateSize(window.GetProperty('Buttons: Size', PROP_DEFAULTS.btnSize));
	paddingGap    = validatePaddingValue(window.GetProperty('Buttons: Padding Gap', window.GetProperty('Buttons: Padding', PROP_DEFAULTS.paddingGap)), PROP_DEFAULTS.paddingGap);
	paddingBorder = validatePaddingValue(window.GetProperty('Buttons: Padding Border', PROP_DEFAULTS.paddingBorder), PROP_DEFAULTS.paddingBorder);
	alignV        = validateAlign(window.GetProperty('Buttons: Vertical Alignment (0=Top, 1=Middle, 2=Bottom)', PROP_DEFAULTS.alignV), PROP_DEFAULTS.alignV);
	alignH        = validateAlign(window.GetProperty('Buttons: Horizontal Alignment (0=Left, 1=Centre, 2=Right)', PROP_DEFAULTS.alignH), PROP_DEFAULTS.alignH);
	sizeMode      = (function() {
		const legacyFill = window.GetProperty('Buttons: Fill Panel', PROP_DEFAULTS.sizeMode === SIZE_MODE.FILL_WIDTH);
		const stored = window.GetProperty('Buttons: Size Mode', legacyFill ? SIZE_MODE.FILL_WIDTH : SIZE_MODE.FIXED);
		return (stored === SIZE_MODE.FIXED || stored === SIZE_MODE.FILL_WIDTH || stored === SIZE_MODE.FIT_HEIGHT) ? stored : PROP_DEFAULTS.sizeMode;
	})();
	useTint       = Boolean(window.GetProperty('Colors: Use Tint', PROP_DEFAULTS.useTint));
	colorNormal   = window.GetProperty('Colors: Normal', PROP_DEFAULTS.colorNormal);
	colorHover    = window.GetProperty('Colors: Hover', PROP_DEFAULTS.colorHover);
	colorDown     = window.GetProperty('Colors: Down', PROP_DEFAULTS.colorDown);
	useBgColor    = Boolean(window.GetProperty('Colors: Use Background', PROP_DEFAULTS.useBgColor));
	bgColor       = window.GetProperty('Colors: Background', PROP_DEFAULTS.bgColor);
	buttonStyle   = validateStyle(window.GetProperty('Buttons: Style', PROP_DEFAULTS.buttonStyle));
}

init_properties();

// ====================== PER-STYLE SETTINGS ======================
function _styleConfigKey(styleName) {
	return 'Buttons: StyleCfg.' + (styleName === '' ? '__default__' : styleName);
}

function _captureCurrentConfig() {
	return {
		btnSize, paddingGap, paddingBorder, alignV, alignH, sizeMode,
		useTint, colorNormal, colorHover, colorDown,
		useBgColor, bgColor
	};
}

function _applyConfig(cfg) {
	if (!cfg) return;
	btnSize       = validateSize(cfg.btnSize);
	paddingGap    = validatePaddingValue(cfg.paddingGap, PROP_DEFAULTS.paddingGap);
	paddingBorder = validatePaddingValue(cfg.paddingBorder, PROP_DEFAULTS.paddingBorder);
	alignV        = validateAlign(cfg.alignV, PROP_DEFAULTS.alignV);
	alignH        = validateAlign(cfg.alignH, PROP_DEFAULTS.alignH);
	sizeMode      = (cfg.sizeMode === SIZE_MODE.FIXED || cfg.sizeMode === SIZE_MODE.FILL_WIDTH || cfg.sizeMode === SIZE_MODE.FIT_HEIGHT) ? cfg.sizeMode : PROP_DEFAULTS.sizeMode;
	useTint       = Boolean(cfg.useTint);
	colorNormal   = (typeof cfg.colorNormal === 'number') ? (cfg.colorNormal >>> 0) : PROP_DEFAULTS.colorNormal;
	colorHover    = (typeof cfg.colorHover  === 'number') ? (cfg.colorHover  >>> 0) : PROP_DEFAULTS.colorHover;
	colorDown     = (typeof cfg.colorDown   === 'number') ? (cfg.colorDown   >>> 0) : PROP_DEFAULTS.colorDown;
	useBgColor    = Boolean(cfg.useBgColor);
	bgColor       = (typeof cfg.bgColor === 'number') ? (cfg.bgColor >>> 0) : PROP_DEFAULTS.bgColor;
}

function saveStyleConfig(styleName) {
	try {
		window.SetProperty(_styleConfigKey(styleName), JSON.stringify(_captureCurrentConfig()));
	} catch (e) {
		if (typeof console !== 'undefined' && console.log) {
			console.log('ThePlayButtons: saveStyleConfig error:', e);
		}
	}
}

function loadStyleConfig(styleName) {
	try {
		const raw = window.GetProperty(_styleConfigKey(styleName), null);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		return (parsed && typeof parsed === 'object') ? parsed : null;
	} catch (e) {
		return null;
	}
}

(function _loadInitialStyleConfig() {
	const cfg = loadStyleConfig(buttonStyle);
	if (cfg) _applyConfig(cfg);
})();

// ====================== TINT HELPER ======================
function _tintImage(img, tintColour) {
	if (!img) return null;
	const w = img.Width;
	const h = img.Height;
	const bmp = gdi.CreateImage(w, h);
	const g   = bmp.GetGraphics();
	try {
		g.SetInterpolationMode(7);
		g.DrawImage(img, 0, 0, w, h, 0, 0, w, h, 0, 255);
		const rgb = _toRGB(tintColour);
		g.FillSolidRect(0, 0, w, h, _RGBA(rgb[0], rgb[1], rgb[2], 110));
	} finally {
		bmp.ReleaseGraphics(g);
	}
	return bmp;
}

// ====================== BUTTON DISPOSAL HELPER ======================
function _disposeButton(btn) {
	if (!btn) return;
	const disposed = new Set();
	const disposeOnce = (img) => {
		if (!img || disposed.has(img) || !img.Dispose) return;
		disposed.add(img);
		try { img.Dispose(); } catch(e) {}
	};
	disposeOnce(btn.img);
	disposeOnce(btn.img_normal);
	disposeOnce(btn.img_hover);
	disposeOnce(btn.img_down);
	btn.img        = null;
	btn.img_normal = null;
	btn.img_hover  = null;
	btn.img_down   = null;
}

// ====================== BUTTON UPDATE ======================
buttons.update = () => {
	let bsW, bsH, x, y;
	const gap       = _scale(paddingGap);
	const borderPad = _scale(paddingBorder);

	const availX = borderPad;
	const availY = borderPad;
	const availW = Math.max(1, panel.w - (borderPad * 2));
	const availH = Math.max(1, panel.h - (borderPad * 2));

	if (sizeMode === SIZE_MODE.FILL_WIDTH) {
		bsW = Math.max(1, Math.floor((availW - (gap * 3)) / 4));
		bsH = _scale(btnSize);
		x   = availX;

		if      (alignV === ALIGN.TOP)    { y = availY; }
		else if (alignV === ALIGN.MIDDLE) { y = availY + Math.floor((availH - bsH) / 2); }
		else                              { y = availY + availH - bsH; }

	} else if (sizeMode === SIZE_MODE.FIT_HEIGHT) {
		bsH = availH;
		bsW = _scale(btnSize);
		y   = availY;
		const totalW = (bsW * 4) + (gap * 3);

		if      (alignH === ALIGN.LEFT)   { x = availX; }
		else if (alignH === ALIGN.CENTER) { x = availX + Math.floor((availW - totalW) / 2); }
		else                              { x = availX + availW - totalW; }

	} else {
		const bs    = _scale(btnSize);
		bsW = bsH   = bs;
		const totalW = (bsW * 4) + (gap * 3);

		if      (alignV === ALIGN.TOP)    { y = availY; }
		else if (alignV === ALIGN.MIDDLE) { y = availY + Math.floor((availH - bsH) / 2); }
		else                              { y = availY + availH - bsH; }

		if      (alignH === ALIGN.LEFT)   { x = availX; }
		else if (alignH === ALIGN.CENTER) { x = availX + Math.floor((availW - totalW) / 2); }
		else                              { x = availX + availW - totalW; }
	}

	if (buttons.buttons.stop) {
		_disposeButton(buttons.buttons.stop);
		_disposeButton(buttons.buttons.play);
		_disposeButton(buttons.buttons.previous);
		_disposeButton(buttons.buttons.next);
	}

	buttons.btn = null;
	if (typeof _tt === 'function') _tt('');

	const isPlaying = fb.IsPlaying && !fb.IsPaused;

	buttons.buttons.stop     = _createIconButton(x,                    y, bsW, bsH,
	    'stop',
	    () => { fb.Stop(); },       'Stop');

	buttons.buttons.play     = _createIconButton(x + (bsW + gap),      y, bsW, bsH,
	    isPlaying ? 'pause' : 'play',
	    () => { fb.PlayOrPause(); }, isPlaying ? 'Pause' : 'Play');

	buttons.buttons.previous = _createIconButton(x + (bsW + gap) * 2,  y, bsW, bsH,
	    'previous',
	    () => { fb.Prev(); },       'Previous');

	buttons.buttons.next     = _createIconButton(x + (bsW + gap) * 3,  y, bsW, bsH,
	    'next',
	    () => { fb.Next(); },       'Next');

	if (useTint) {
		_.forEach(buttons.buttons, (btn) => {
			if (!btn) return;
			const original = btn.img_normal;
			btn.img_normal = _tintImage(original, colorNormal);
			btn.img_hover  = _tintImage(original, colorHover);
			btn.img_down   = _tintImage(original, colorDown);
			btn.img        = btn.img_normal;
			if (original && original !== btn.img_normal && original.Dispose) {
				try { original.Dispose(); } catch(e) {}
			}
		});
	}

	lastPlayState = isPlaying;
};

// ====================== PLAY/PAUSE ICON SWAP ======================
function updatePlayButtonIcon() {
	const old = buttons.buttons.play;
	if (!old) { buttons.update(); return; }

	const isPlaying  = fb.IsPlaying && !fb.IsPaused;
	const wasHovered = buttons.btn === 'play';

	const fresh = _createIconButton(old.x, old.y, old.w, old.h,
	    isPlaying ? 'pause' : 'play',
	    () => { fb.PlayOrPause(); }, isPlaying ? 'Pause' : 'Play');

	if (useTint) {
		const original = fresh.img_normal;
		fresh.img_normal = _tintImage(original, colorNormal);
		fresh.img_hover  = _tintImage(original, colorHover);
		fresh.img_down   = _tintImage(original, colorDown);
		fresh.img        = fresh.img_normal;
		if (original && original !== fresh.img_normal && original.Dispose) {
			try { original.Dispose(); } catch(e) {}
		}
	}

	_disposeButton(old);
	buttons.buttons.play = fresh;

	if (wasHovered) fresh.cs('hover');

	lastPlayState = isPlaying;
}

// ====================== CALLBACKS ======================
function on_size() {
	panel.size();
	buttons.update();
}

function on_paint(gr) {
	panel.paint(gr);
	if (useBgColor) {
		gr.FillSolidRect(0, 0, panel.w, panel.h, bgColor);
	}
	buttons.paint(gr);
}

function on_playback_stop() {
	updatePlayButtonIcon();
	window.Repaint();
}

function on_playback_pause() {
	const isPaused = fb.IsPaused;
	if (lastPlayState !== !isPaused) {
		updatePlayButtonIcon();
		window.Repaint();
	}
}

function on_playback_starting() {
	if (lastPlayState !== true) {
		updatePlayButtonIcon();
		window.Repaint();
	}
}

function on_mouse_move(x, y) {
	buttons.move(x, y);
}

function on_mouse_leave() {
	buttons.leave();
}

function on_mouse_lbtn_down(x, y) {
	if (buttons.btn && buttons.buttons[buttons.btn]) {
		buttons.buttons[buttons.btn].cs('down');
		window.Repaint();
	}
}

function on_mouse_lbtn_up(x, y, mask) {
	buttons.lbtn_up(x, y, mask);
}

function on_script_unload() {
	if (buttons.buttons) {
		_.forEach(buttons.buttons, (btn) => { _disposeButton(btn); });
	}
	if (typeof _tt === 'function') _tt('');
	if (_bmp) {
		if (_gr) { try { _bmp.ReleaseGraphics(_gr); } catch(e) {} }
		try { _bmp.Dispose(); } catch(e) {}
	}
	_gr  = null;
	_bmp = null;
}

// ====================== MENU ======================
function on_mouse_rbtn_up(x, y) {
	const m   = window.CreatePopupMenu();
	const v   = window.CreatePopupMenu();
	const h   = window.CreatePopupMenu();
	const s   = window.CreatePopupMenu();
	const p   = window.CreatePopupMenu();
	const col = window.CreatePopupMenu();
	const sty = window.CreatePopupMenu();

	m.AppendMenuItem(MF_STRING, MENU_ID.MODE_FIXED,      'Fixed (Maintain Aspect)');
	m.AppendMenuItem(MF_STRING, MENU_ID.MODE_FILL,       'Fill Width (Stretch)');
	m.AppendMenuItem(MF_STRING, MENU_ID.MODE_FIT_HEIGHT, 'Fit Height (Stretch)');
	m.CheckMenuRadioItem(MENU_ID.MODE_FIXED, MENU_ID.MODE_FIT_HEIGHT,
	    MENU_ID.MODE_FIXED + sizeMode);
	m.AppendMenuSeparator();

	h.AppendMenuItem(MF_STRING, MENU_ID.ALIGN_H_LEFT,   'Left');
	h.AppendMenuItem(MF_STRING, MENU_ID.ALIGN_H_CENTER, 'Centre');
	h.AppendMenuItem(MF_STRING, MENU_ID.ALIGN_H_RIGHT,  'Right');
	h.CheckMenuRadioItem(MENU_ID.ALIGN_H_LEFT, MENU_ID.ALIGN_H_RIGHT,
	    MENU_ID.ALIGN_H_LEFT + alignH);
	h.AppendTo(m, sizeMode === SIZE_MODE.FILL_WIDTH ? MF_GRAYED : MF_STRING, 'Horizontal Alignment');

	v.AppendMenuItem(MF_STRING, MENU_ID.ALIGN_V_TOP,    'Top');
	v.AppendMenuItem(MF_STRING, MENU_ID.ALIGN_V_MIDDLE, 'Middle');
	v.AppendMenuItem(MF_STRING, MENU_ID.ALIGN_V_BOTTOM, 'Bottom');
	v.CheckMenuRadioItem(MENU_ID.ALIGN_V_TOP, MENU_ID.ALIGN_V_BOTTOM,
	    MENU_ID.ALIGN_V_TOP + alignV);
	v.AppendTo(m, sizeMode === SIZE_MODE.FIT_HEIGHT ? MF_GRAYED : MF_STRING, 'Vertical Alignment');
	m.AppendMenuSeparator();

	const stylesList = scanButtonStyles();
	stylesList.forEach((styleName, i) => {
		const label = styleName === '' ? 'Default' : styleName;
		sty.AppendMenuItem(MF_STRING, STYLE_MENU_ID_BASE + i, label);
		if (styleName === buttonStyle) sty.CheckMenuItem(STYLE_MENU_ID_BASE + i, true);
	});
	if (stylesList.length <= 1) {
		sty.AppendMenuSeparator();
		sty.AppendMenuItem(MF_GRAYED, STYLE_MENU_ID_BASE + stylesList.length, 'No extra icon sets found');
	}
	sty.AppendTo(m, MF_STRING, 'Button Style');

	s.AppendMenuItem(MF_STRING, MENU_ID.SIZE_SMALL,  `Small (${SIZE_PRESETS.SMALL})`);
	s.AppendMenuItem(MF_STRING, MENU_ID.SIZE_MEDIUM, `Medium (${SIZE_PRESETS.MEDIUM})`);
	s.AppendMenuItem(MF_STRING, MENU_ID.SIZE_LARGE,  `Large (${SIZE_PRESETS.LARGE})`);
	s.AppendMenuItem(MF_STRING, MENU_ID.SIZE_XL,     `Extra Large (${SIZE_PRESETS.XL})`);
	s.AppendMenuSeparator();
	s.AppendMenuItem(MF_STRING, MENU_ID.SIZE_CUSTOM, 'Set Custom Size...');
	s.AppendTo(m, MF_STRING, 'Button Size');

	p.AppendMenuItem(MF_STRING, MENU_ID.PAD_GAP_CUSTOM,    `Padding Gap: ${paddingGap}px...`);
	p.AppendMenuItem(MF_STRING, MENU_ID.PAD_BORDER_CUSTOM, `Padding Border: ${paddingBorder}px...`);
	p.AppendTo(m, MF_STRING, 'Padding');

	col.AppendMenuItem(MF_STRING, MENU_ID.COLOR_TOGGLE, 'Enable Custom Tint');
	col.CheckMenuItem(MENU_ID.COLOR_TOGGLE, useTint);
	col.AppendMenuSeparator();
	col.AppendMenuItem(useTint ? MF_STRING : MF_GRAYED, MENU_ID.COLOR_NORMAL, 'Set Normal Color...');
	col.AppendMenuItem(useTint ? MF_STRING : MF_GRAYED, MENU_ID.COLOR_HOVER,  'Set Hover Color...');
	col.AppendMenuItem(useTint ? MF_STRING : MF_GRAYED, MENU_ID.COLOR_DOWN,   'Set Click Color...');
	col.AppendMenuSeparator();
	col.AppendMenuItem(MF_STRING, MENU_ID.BG_TOGGLE, 'Enable Background Colour');
	col.CheckMenuItem(MENU_ID.BG_TOGGLE, useBgColor);
	col.AppendMenuItem(useBgColor ? MF_STRING : MF_GRAYED, MENU_ID.BG_COLOR, 'Set Background Color...');
	col.AppendTo(m, MF_STRING, 'Colors & Tint');

	m.AppendMenuSeparator();
	m.AppendMenuItem(MF_STRING, MENU_ID.RESET, 'Reset This Style to Defaults');

	const idx = m.TrackPopupMenu(x, y);

	if (idx >= STYLE_MENU_ID_BASE && idx < STYLE_MENU_ID_BASE + stylesList.length) {
		const selected = stylesList[idx - STYLE_MENU_ID_BASE];
		if (selected !== buttonStyle) {
			saveStyleConfig(buttonStyle);
			buttonStyle = selected;
			window.SetProperty('Buttons: Style', buttonStyle);
			_applyConfig(loadStyleConfig(buttonStyle) || PROP_DEFAULTS);
			buttons.update();
			window.Repaint();
		}
		return true;
	}

	let changed = false;

	switch (idx) {
		case MENU_ID.ALIGN_V_TOP:
		case MENU_ID.ALIGN_V_MIDDLE:
		case MENU_ID.ALIGN_V_BOTTOM:
			alignV = idx - MENU_ID.ALIGN_V_TOP;
			window.SetProperty('Buttons: Vertical Alignment (0=Top, 1=Middle, 2=Bottom)', alignV);
			changed = true;
			break;

		case MENU_ID.ALIGN_H_LEFT:
		case MENU_ID.ALIGN_H_CENTER:
		case MENU_ID.ALIGN_H_RIGHT:
			if (sizeMode !== SIZE_MODE.FILL_WIDTH) {
				alignH = idx - MENU_ID.ALIGN_H_LEFT;
				window.SetProperty('Buttons: Horizontal Alignment (0=Left, 1=Centre, 2=Right)', alignH);
				changed = true;
			}
			break;

		case MENU_ID.SIZE_SMALL:
			btnSize = SIZE_PRESETS.SMALL;
			window.SetProperty('Buttons: Size', btnSize);
			changed = true;
			break;

		case MENU_ID.SIZE_MEDIUM:
			btnSize = SIZE_PRESETS.MEDIUM;
			window.SetProperty('Buttons: Size', btnSize);
			changed = true;
			break;

		case MENU_ID.SIZE_LARGE:
			btnSize = SIZE_PRESETS.LARGE;
			window.SetProperty('Buttons: Size', btnSize);
			changed = true;
			break;

		case MENU_ID.SIZE_XL:
			btnSize = SIZE_PRESETS.XL;
			window.SetProperty('Buttons: Size', btnSize);
			changed = true;
			break;

		case MENU_ID.SIZE_CUSTOM: {
			const val = utils.InputBox(window.ID, 'Enter button size (16-512 pixels):', 'Custom Size', btnSize);
			if (val) {
				const newSize = validateSize(val);
				if (newSize !== btnSize) {
					btnSize = newSize;
					window.SetProperty('Buttons: Size', btnSize);
					changed = true;
				}
			}
			break;
		}

		case MENU_ID.PAD_GAP_CUSTOM: {
			const val = utils.InputBox(window.ID, 'Enter gap between buttons (0-300 pixels):', 'Padding Gap', paddingGap);
			if (val !== undefined && val !== null && val !== '') {
				const newGap = validatePaddingValue(val, paddingGap);
				if (newGap !== paddingGap) {
					paddingGap = newGap;
					window.SetProperty('Buttons: Padding Gap', paddingGap);
					changed = true;
				}
			}
			break;
		}

		case MENU_ID.PAD_BORDER_CUSTOM: {
			const val = utils.InputBox(window.ID, 'Enter outer border padding to the panel edge (0-300 pixels):', 'Padding Border', paddingBorder);
			if (val !== undefined && val !== null && val !== '') {
				const newBorder = validatePaddingValue(val, paddingBorder);
				if (newBorder !== paddingBorder) {
					paddingBorder = newBorder;
					window.SetProperty('Buttons: Padding Border', paddingBorder);
					changed = true;
				}
			}
			break;
		}

		case MENU_ID.MODE_FIXED:
			sizeMode = SIZE_MODE.FIXED;
			window.SetProperty('Buttons: Size Mode', sizeMode);
			changed = true;
			break;

		case MENU_ID.MODE_FILL:
			sizeMode = SIZE_MODE.FILL_WIDTH;
			window.SetProperty('Buttons: Size Mode', sizeMode);
			changed = true;
			break;

		case MENU_ID.MODE_FIT_HEIGHT:
			sizeMode = SIZE_MODE.FIT_HEIGHT;
			window.SetProperty('Buttons: Size Mode', sizeMode);
			changed = true;
			break;

		case MENU_ID.COLOR_TOGGLE:
			useTint = !useTint;
			window.SetProperty('Colors: Use Tint', useTint);
			changed = true;
			break;

		case MENU_ID.COLOR_NORMAL: {
			if (useTint) {
				const newColor = utils.ColourPicker(window.ID, colorNormal);
				if (newColor !== -1 && newColor !== colorNormal) {
					colorNormal = newColor;
					window.SetProperty('Colors: Normal', colorNormal);
					changed = true;
				}
			}
			break;
		}

		case MENU_ID.COLOR_HOVER: {
			if (useTint) {
				const newColor = utils.ColourPicker(window.ID, colorHover);
				if (newColor !== -1 && newColor !== colorHover) {
					colorHover = newColor;
					window.SetProperty('Colors: Hover', colorHover);
					changed = true;
				}
			}
			break;
		}

		case MENU_ID.COLOR_DOWN: {
			if (useTint) {
				const newColor = utils.ColourPicker(window.ID, colorDown);
				if (newColor !== -1 && newColor !== colorDown) {
					colorDown = newColor;
					window.SetProperty('Colors: Down', colorDown);
					changed = true;
				}
			}
			break;
		}

		case MENU_ID.BG_TOGGLE:
			useBgColor = !useBgColor;
			window.SetProperty('Colors: Use Background', useBgColor);
			changed = true;
			break;

		case MENU_ID.BG_COLOR: {
			if (useBgColor) {
				const newColor = utils.ColourPicker(window.ID, bgColor);
				if (newColor !== -1 && newColor !== bgColor) {
					bgColor = newColor;
					window.SetProperty('Colors: Background', bgColor);
					changed = true;
				}
			}
			break;
		}

		case MENU_ID.RESET:
			_applyConfig(PROP_DEFAULTS);
			window.SetProperty('Buttons: Size',                                        PROP_DEFAULTS.btnSize);
			window.SetProperty('Buttons: Padding Gap',                                 PROP_DEFAULTS.paddingGap);
			window.SetProperty('Buttons: Padding Border',                              PROP_DEFAULTS.paddingBorder);
			window.SetProperty('Buttons: Vertical Alignment (0=Top, 1=Middle, 2=Bottom)', PROP_DEFAULTS.alignV);
			window.SetProperty('Buttons: Horizontal Alignment (0=Left, 1=Centre, 2=Right)', PROP_DEFAULTS.alignH);
			window.SetProperty('Buttons: Size Mode',       PROP_DEFAULTS.sizeMode);
			window.SetProperty('Colors: Use Tint',         PROP_DEFAULTS.useTint);
			window.SetProperty('Colors: Normal',           PROP_DEFAULTS.colorNormal);
			window.SetProperty('Colors: Hover',            PROP_DEFAULTS.colorHover);
			window.SetProperty('Colors: Down',             PROP_DEFAULTS.colorDown);
			window.SetProperty('Colors: Use Background',   PROP_DEFAULTS.useBgColor);
			window.SetProperty('Colors: Background',       PROP_DEFAULTS.bgColor);
			changed = true;
			break;
	}

	if (changed) {
		saveStyleConfig(buttonStyle);
		buttons.update();
		window.Repaint();
	}

	return true;
}

function on_colours_changed() {
	panel.colours_changed();
	window.Repaint();
}

window.MinWidth  = 80;
window.MinHeight = 24;