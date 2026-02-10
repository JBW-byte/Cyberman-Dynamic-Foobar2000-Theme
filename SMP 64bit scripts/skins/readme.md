skins folder should be in FooBar2000/Profile folder for all the correct file paths, can be changed in the script.
<br><br>

* Disc Spinner: requires my mask's and art files for the CD, Mask's automaticly. Generates a Disc from album art if you have no disc art,
falls back to default disc if non, Seperate Vinyl mask if your art is called vinyl. Can add more options in the script for file names and paths.<br>
Simple sensible right click options. For larger panels and FPS increase, change the values near the top of the script, MAX_IMAGE_SIZE and timerInterval.<br>

* VolumeKnob: Simple functionality, Hold left mouse and drap up or down to change volume, double click mute, right click themes, non-linear volume control. Could probably be adapted to any type of Knob.<br>

* PanelArt: Simple Track display and album art background blur/darkness. several options in right click menu. Probably try and expand this more in future.<br><br>

Coming Soon LCD TimerPro
<br><br>




## Path Tree Structure


Fobar2000 64Bit/
│
├── profile/
│   ├── skins/
│   │   ├── scripts/
│   │   │   │   ├── VolumeKnob/
│   │   │   │   │   └── VoloumeKnob.js
│   │   │   ├── SMP_64_DiscSpin.js
│   │   │   ├── SMP_64_PanelArt
│   │   │   └── SMP_simplyart_archived.js
│   │   ├── mask.png
│   │   ├── vinyl_mask.png
│   │   ├── center_album_rim.png
│   │   └── default_disc.png
