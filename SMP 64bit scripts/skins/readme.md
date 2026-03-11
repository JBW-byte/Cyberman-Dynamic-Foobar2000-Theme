# Foobar2000 .js Script Panels

![Foobar2000](https://img.shields.io/badge/Foobar2000-v2.x-blue)
![Component](https://img.shields.io/badge/Spider%20Monkey%20Panel-x64-green)
![License](https://img.shields.io/badge/License-Personal%20Use-lightgrey)
![Status](https://img.shields.io/badge/Status-Active-brightgreen)

Custom **Spider Monkey Panel / JSplitter scripts** designed for **Foobar2000 v2 64bit** providing animated visuals, album-art driven UI elements, and interactive controls.

---

## Preview

<img src="https://raw.githubusercontent.com/JBW-byte/Cyberman-Dynamic-Foobar2000-Theme/refs/heads/main/screenshots/hifi_foobar2000.png" width="800">

Using **[Nowbar](https://github.com/jame25/foo_nowbar)** as a Demo for a clean layout.  Coming Soon™ LCD TimerPro<br>

---

# Installation

For portable mode the files go in Foobar2000\Profile\Skins<br> For non portable mode they go in C:\Users\your user name\AppData\Roaming\foobar2000-v2\skins\ <br><br>

1. Add a **[SMP 64bit](https://github.com/marc2k3/spider-monkey-panel-x64/releases).** or **[Jsplitter(D2D Supported)](https://foobar2000.club/forum/viewtopic.php?t=6378)** panel
2. **Right-click → Configure Panel**
3. Select **File**
4. Choose the desired `.js` script

---

# Components

<details>
<summary><strong>DiscSpin</strong> — Updated 10 Mar 2026</summary>

### Update Overview
Optimization improvements, bug fixes, JSplitter D2D support, GDI+/D2D toggle(may be buggy).

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

### Performance Notes

Recommended settings for large panels:

- **Scaling:** Nearest Neighbour  
- **Image Resolution:** Medium or High  

**Note:** Album art required for best results.

</details>


<details>
<summary><strong>VolumeKnob</strong> — Updated 27 Feb 2026</summary>

### Overview
Simple rotary volume control panel.

### Controls

| Action | Result |
|------|------|
| Left Click + Drag | Adjust volume |
| Double Click | Toggle mute |
| Right Click | Change themes |

### Features

- Non-linear volume response
- Theme support
- Can be adapted for other rotary controls

</details>

<details>
<summary><strong>PanelArt</strong> — Updated 10 Mar 2026</summary>

### Update Overview
Bug Fix's.

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

| Control | Function |
|------|------|
| Double Click | Random artwork / actions |

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
        ├── mask.png
        ├── vinyl_mask.png
        ├── center_album_rim.png
        └── default_disc.png
</pre>

## License

These Scripts and Images are Shared for Personal Use Only. Individual components remain licensed under their respective authors.


        
