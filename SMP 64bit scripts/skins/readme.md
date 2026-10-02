# Foobar2000 .js Script Panels

![Foobar2000](https://img.shields.io/badge/Foobar2000-v2.x-blue)
![Component](https://img.shields.io/badge/Spider%20Monkey%20Panel-x64-green)
[![License: Custom](https://img.shields.io/badge/license-peronsal)](LICENSE)
![Status](https://img.shields.io/badge/Status-Active-brightgreen)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/led_jbw)

Custom **Spider Monkey Panel / JSplitter scripts** designed for **Foobar2000 v2 64bit** providing animated visuals, album-art driven UI elements, and interactive controls.

🖼️ Bezel / Overlay Framing
Frame your visualizer behind a custom hardware Bezel. Drop any transparent PNG into your profile\skins\overlay folder and select it from the context menu to perfectly mount your meter inside a virtual stereo chassis.

---

## Preview

<img src="https://raw.githubusercontent.com/JBW-byte/Cyberman-Dynamic-Foobar2000-Theme/refs/heads/main/screenshots/Cyberman_scripts.png" width="1000"><br><br>
<img src="https://raw.githubusercontent.com/JBW-byte/Cyberman-Dynamic-Foobar2000-Theme/refs/heads/main/screenshots/hifi_foobar2000.png" width="800"><br>



Using **[Nowbar](https://github.com/jame25/foo_nowbar)** as an example for a clean layout.<br>

---

# Installation
<br>

Make a folder called skins and place my scripts in the correct location, download my files and place them in skins keeping any folder structures.<br> or download **[scripts_extra](https://github.com/JBW-byte/Cyberman-Dynamic-Foobar2000-Theme/blob/main/scripts_extra.zip)** (includes extra images) from the main theme page and extract to the profile folder<br><br>
For portable mode the files go in Foobar2000\Profile\Skins<br> For non portable mode they go in C:\Users\your user name\AppData\Roaming\foobar2000-v2\skins\ <br><br>

1. Add a **[SMP 64bit](https://github.com/marc2k3/spider-monkey-panel-x64/releases).** or **[Jsplitter(D2D Supported)](https://foobar2000.club/forum/viewtopic.php?t=6378)** panel
2. **Right-click → Configure Panel**
3. Select **File**
4. Choose the desired `.js` script

---

# Components

Major rewrite 28 Sep 2026, Bezel and Overlay options.

<details>
<summary><strong>DiscSpin</strong> — Updated 01 Oct 2026</summary>

### Update Overview
Mask and extra artwork not needed now, in engine mask and disc, JSplitter D2D support, GDI+/D2D toggle(may be buggy). v5.3

### Features

| Feature | Description |
|------|------|
| Automatic Disc Generation | Creates a disc from album art if no disc image exists |
| Vinyl Detection | Uses a separate mask when artwork name contains `vinyl` |
| Default Fallback | Uses default disc image if no artwork exists |
| Custom Masks | Supports alternate mask images |
| Context Menu | Extensive right-click customization options |
| Scaling Options | Image scaling quality controls |
| Large Panel Support | Optimized performance for large panels | 

**Note:** Album art required for best results.

### Controls & Shortcuts
| Input | Action |
| :--- | :--- |
| **Mouse Wheel** | Adjust Opacity of Active HUD Layer |
| **Right Click** | Open Context Menu |
| **Ctrl + Up / Down** | Cycle Bezel / Glass Overlays |
| **Esc / Left Click Up**| Dismiss HUD Slider |

</details>


<details>
<summary><strong>VolumeKnob</strong> — Updated 03 Oct 2026</summary>

### Update Overview
Custom Themes and json save, Major update to themes. v4.2, json save fix

Press Control+left click for a random theme. don't forget to save any you like.
Place your custom images in the scripts/VolumeKnob folder.

### Controls & Shortcuts
| Input | Action |
| :--- | :--- |
| **Left Click + Drag** | Smooth Rotary Volume Adjustment |
| **Mouse Wheel** | Step Volume Up / Down (or adjust active HUD slider) |
| **Double Click** | Toggle Mute |
| **Ctrl + Left Click** | Randomize Visual Theme and Finishes |
| **Right Click** | Open Settings Menu / Color Picker |
| **Alt / Ctrl + Shift + Left / Right** | Cycle Themes |
| **Alt / Ctrl + Shift + Up / Down** | Cycle Specular Lighting Styles |
| **Ctrl + Up / Down** | Cycle Dial Finishes |
| **Ctrl + Left / Right** | Cycle Tick Marker Styles |
| **Shift + Up / Down** | Cycle Pointer Styles |
| **Shift + Left / Right** | Cycle Backplate Styles |
| **Esc** | Dismiss Active HUD Slider |

### Features

- Non-linear volume response
- Theme support
- Can be adapted for other rotary controls

</details>

<details>
<summary><strong>PanelArt</strong> — Updated 01 Oct 2026</summary>

### Update Overview
Major Rewrite. Bezel and Overlay support. v4.4 bug fix

### Features

| Feature | Description |
|------|------|
| Track Display | Shows track info with album art |
| Background Blur | Adjustable blur and darkness |
| Layout Modes | Vertical and horizontal layouts |
| Slideshow | Optional slideshow from image folder |
| Random Image | Double-click for random background |
| Customization | Multiple settings via right-click menu |

**Note:** custom images folder for random images, or make a folder in skins called "images" and place in there. Album art required for best results.

## Interface Controls

### Controls & Shortcuts
| Input | Action |
| :--- | :--- |
| **Double Click** | Toggle Image Display Modes (Track Art ⟷ Single Image ⟷ Slideshow) |
| **Mouse Wheel** | Adjust Active Overlay Opacity / Padding |
| **Right Click** | Open Settings Menu |
| **Ctrl + Up / Down** | Cycle Bezel / Screen Frames |
| **Esc** | Dismiss Active HUD Slider |

</details>

<details>
<summary><strong>LCD TimerPro</strong> — Updated 01 Oct 2026</summary>

### Update Overview
Majot ReWrite. Bezel and Overlay Support. v2.3 theme sync fix, bug fix

### Features

| Feature | Description |
|------|------|
| Time Display | Shows track time |
| Themes | Adjustable Themes |
| Layout Modes | position elements |
| Customization | Multiple settings via right-click menu |

**Note:** its a little clunky menu, but it is what it is. Built in Digital, 7 Segment Font.

### Controls & Shortcuts
| Input | Action |
| :--- | :--- |
| **Single Click** | Mode 0: Toggle Elapsed / Remaining Time |
| **Double Click** | Toggle Display Power (Standby / Blackout) |
| **Mouse Wheel** | Switch Display Mode (Mode 0 ⟷ Mode 1) |
| **Right Click** | Open Context Menu / Position Calibrator |
| **Arrow Keys** | Shift Element Positions (during Layout Adjust Mode) |
| **Ctrl + Up / Down** | Cycle Bezel Frames |
| **Esc** | Exit Calibration HUD |

</details>

<details>
<summary><strong>LCD Peakmeter</strong> — Updated 01 Oct 2026 V2.2</summary>

### Key Features
* **Dual Operation Modes:** Seamlessly toggles between Stereo Peak/RMS Metering and a 10–120 band Logarithmic FFT Spectrum Analyzer.
* **DotMatrix Pre-Render Pipeline:** Pre-bakes 2D LED color strips and segmented foregrounds for one-blit level updates.
* **7 Segment Fill Modes:** Discrete LCD Blocks, Solid Flat Bar, LED Strip Gradients, and Multi-Axis Cross Blends.
* **20 Authentic Hardware Themes:** Color schemes inspired by Pioneer, Sony ES, Technics, Kenwood, Marantz, and Akai.
* **Real-Time Performance Monitor:** Built-in profiler measuring audio tick latency, FFT math duration, paint cycles, and cache hit ratios.

### Controls & Shortcuts
| Input | Action |
| :--- | :--- |
| **Double Click** | Toggle Display Mode (Peak Meter ⟷ Spectrum Analyzer) |
| **Mouse Wheel** | Adjust Active Overlay Opacity |
| **Right Click** | Open Full Configuration Menu |
| **Ctrl + Up / Down** | Cycle Bezel Frames |
| **Ctrl + Left / Right** | Cycle Meter Segment / Flat Styles |
</details>

<details>
<summary><strong>The Play Buttons</strong> — Updated 01 Oct 2026 V2.2</summary>

### Key Features
* **Zero-Resampling Blit Engine:** Icon textures for Idle, Hover, and Click states are pre-baked at 1:1 pixel ratios to avoid runtime resampling.
* **Vector Fallback Engine:** Automatically renders high-DPI vector glyphs if icon image files are missing.
* **Subfolder Pack Auto-Discovery:** Scans button subdirectories and lets you hot-swap skin packs via menu or keyboard shortcuts.
* **Bezel / Overlay System:** Full support for transparent hardware frames and glass overlays.
* **Configurable Layouts:** Supports Fixed Box, Fill Width (Horizontally Tiled), and Fit Height alignment modes.

### Controls & Shortcuts
| Input | Action |
| :--- | :--- |
| **Left Click** | Trigger Transport Command (Stop, Play/Pause, Previous, Next) |
| **Right Click** | Open Settings Context Menu |
| **Ctrl + Up / Down** | Cycle Bezel / Overlay Frame |
| **Ctrl + Left / Right** | Cycle Button Style Pack |
</details>

---

## Interface Controls

| Control | Function |
|------|------|
| Mouse Scroll | Adjust opacity and slider values |
| Right Click | Panel configuration options |

---

* Path Tree Structure  
<pre>
Foobar2000 64Bit/
└── profile/
    └── skins/
        └── scripts/
        │   └── VolumeKnob/
        │   │   └── VoloumeKnob.js
        │   ├── SMP_64_DiscSpin.js
        │   └── SMP_64_PanelArt
        │  
        ├── overlay\
        └── images\
</pre>

## Usage

Your welcome to use in your non-commercial theme for foobar2000, Please Credit Me.


## License

Custom Software License for foobar2000 Themes Copyright (c) 2026 [L.E.D.]

Grant of License You are welcome to use, modify, and distribute these JavaScript (.js) scripts solely for NON-COMMERCIAL purposes within themes for foobar2000.

- use it for commercial performances, commercial exhibitions, paid services, resale, advertising services, or other profit-making activities;

Restrictions Commercial use of this software is strictly prohibited. You may NOT include, bundle, or use this software in any of the following:

You may not, without explicit written permission from the copyright holder:
- use this project or derived works for commercial projects;
- sell, sublicense, rent, or package it as a paid product;
- remove copyright, license, or non-commercial notices.

This project is provided "as is", without warranty of any kind. The copyright holder is not liable for any claims, damages, or other liability arising from use of the project.
Attribution You MUST give clear credit to the original author (L.E.D.) in your theme's documentation, code comments, or user interface.
