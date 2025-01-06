# my dumb GJS OSK fork 
A (diminishing returns) alteration on the proper GJS-OSK. I shuffled around the Compact (US) keyboard a little bit. Got rid of the Settings/drag-bar/✖ bar, Fn row, turned the chicklet Arrow up/down keys into a key row. Moved Esc to ~, and moved tilde to the > (we don't need that in the US of A). Since the ✖️ button is gone, you really need the Panel Indicator to summon/dismiss it.

In the process, I probably made gnome-shell spew more oopsies into the journal. 

I have done nothing to deconflict this with the O.G. GJS-OSK. My whole installation process is to copy my extension.js and physicalLayouts.json files over the other guy's extension install. I have no idea what I'm doing.


# The original Notes -

A (marginally) better on screen keyboard for GNOME 45+ (go to the [pre-45 branch](https://github.com/Vishram1123/gjs-osk/tree/pre-45) for compatibility from gnome 42-44)
## Advantages over the default OSK:
-	Function, modifier, tab, and arrow key support
-	Ability to move around the screen
-	More compact layout
## Requirements
- GNOME 45 or above
- Wayland (X11 is not working properly)
## Demo
[Keyboard Demo.webm](https://user-images.githubusercontent.com/64966832/210458851-1b91adba-f6e4-4d40-b0d5-dba2c46cc354.webm)

[Settings Demo.webm](https://user-images.githubusercontent.com/64966832/210458854-eb458311-3d3f-4edb-93df-f5b8334d4cbc.webm)

## Install
1. Visit [https://extensions.gnome.org/extension/5949/gjs-osk/](https://extensions.gnome.org/extension/5949/gjs-osk/)
2. Confirming that you have Chrome GNOME shell installed on your computer and your browser's GNOME Shell Integration plugin
3. Click Install, and accept the prompt
## Install from Source
1. [Head to the releases in the sidebar](https://github.com/Vishram1123/gjs-osk/releases/latest)
2. Download `gjsosk@vishram1123_[version].zip` (`main` for GNOME version >= 45, `pre-45` for GNOME verison <= 44)
3. Run `gnome-extensions install /path/to/gjsosk@vishram1123_[version].zip` (replace with appropriate path)
4. Log out of GNOME and log back in. 
5. Click on the keyboard button in the dash bar
## Usage
- To drag the keyboard around, click on the move icon in the bottom right, then drag the keyboard around the screen. To get the full keyboard back, press the move icon again.
  - The keyboard will snap to the corners, edges, and center of the screen.
- To change properties about the keyboard, open up the "Extensions" application, and click on "Settings" under this extension to get a list of changeable properties
  - Close the settings dialog to save any modified settings
- To type special characters, open GNOME settings, and turn on "Compose Key" under the Keyboard submenu. Choose a modifier (preferably right alt), and use the [key combinations listed here](https://en.wikipedia.org/wiki/Compose_key#Common_compose_combinations) to type special characters
- To change the keyboard layout, change the layout in Gnome's Control Center
- To add typing prediction, add "Typing Booster" as an input source (in GNOME's settings), and keep it chosen as the primary input source [(extended guide here)](https://mike-fabian.github.io/ibus-typing-booster/docs/user/).
  - Note that this will cause predictive text to be present even without the OSK open, and the input language for Typing Booster's predictions will have to be set in Typing Booster's settings 
- To open the keyboard from the command line (or with a shortcut), run the command `dconf write /org/gnome/shell/extensions/gjsosk/indicator/opened true` which will open the keyboard 
## Known Problems/Issues and Intended Features (Would appreciate solutions about how to fix):
- 100% width or height doesn't take up the full monitor width or height (minus 25 px on either side). Instead, it is 1 or 2 px smaller, depending on the monitor size
## Help
- If you find any bugs, or if you have any suggestions, please open an issue or submit a pull request. Thanks!
### Keyboard Layouts
- As of recently, all keyboard layouts and variants (available through localectl) have been added to GJS-OSK. Please report on the state of keyboard layouts as correct/incorrect in issue [#48](https://github.com/Vishram1123/gjs-osk/issues/48), and I will try to fix them promptly.
  - To generate a single keyboard layout, install `xkbcommon` through `pip` and run `genKeyMap.py` with `layout+variant` as the argument (`pip install xkbcommon` then `python genKeyMap.py de+dvorak` for example)

**Help in this area is greatly appreciated!**
