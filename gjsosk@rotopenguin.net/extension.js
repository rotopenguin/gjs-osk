import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';
import Shell from 'gi://Shell';


import * as EdgeDragAction from 'resource:///org/gnome/shell/ui/edgeDragAction.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';
import * as KeyboardManager from 'resource:///org/gnome/shell/misc/keyboardManager.js';
import * as KeyboardUI from 'resource:///org/gnome/shell/ui/keyboard.js';
import * as InputSourceManager from 'resource:///org/gnome/shell/ui/status/keyboard.js';
import * as Config from 'resource:///org/gnome/shell/misc/config.js'
const [major, minor] = Config.PACKAGE_VERSION.split('.').map(s => Number(s));
import { Dialog } from 'resource:///org/gnome/shell/ui/dialog.js';

import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

const State = {
    OPENED: 0,
    CLOSED: 1,
    OPENING: 2,
    CLOSING: 3,
};

const KC = {
    LSHIFT: 42,
    RSHIFT: 54,
    CAPSL:  58,
    NUML:   69,
    LALT:   56,
    RALT:  100,
    LCTL:   29,
    RCTL:   97,
    LWIN:  125,
    RWIN:  126,
    LEFT:  105,
    RIGHT: 106,
};

class KeyboardMenuToggle extends QuickSettings.QuickMenuToggle {
    static {
        GObject.registerClass(this);
    }

    constructor(extensionObject) {
        super({
            title: _('Screen Keyboard'),
            iconName: 'input-keyboard-symbolic',
            toggleMode: true,
        });

        this.extensionObject = extensionObject;
        this.settings = extensionObject.getSettings();

        this.menu.setHeader('input-keyboard-symbolic', _('Screen Keyboard'), _('Opening Mode'));
        this._itemsSection = new PopupMenu.PopupMenuSection();
        this._itemsSection.addMenuItem(new PopupMenu.PopupImageMenuItem(_('Never'), this.settings.get_int("enable-tap-gesture") == 0 ? 'emblem-ok-symbolic' : null));
        this._itemsSection.addMenuItem(new PopupMenu.PopupImageMenuItem(_("Only on Touch"), this.settings.get_int("enable-tap-gesture") == 1 ? 'emblem-ok-symbolic' : null));
        this._itemsSection.addMenuItem(new PopupMenu.PopupImageMenuItem(_("Always"), this.settings.get_int("enable-tap-gesture") == 2 ? 'emblem-ok-symbolic' : null));
        for (var i in this._itemsSection._getMenuItems()) {
            const item = this._itemsSection._getMenuItems()[i]
            const num = i
            item.connect('activate', () => this.settings.set_int("enable-tap-gesture", num))
        }

        this.menu.addMenuItem(this._itemsSection);
        this.settings.bind('indicator-enabled',
            this, 'checked',
            Gio.SettingsBindFlags.DEFAULT);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const settingsItem = this.menu.addAction(_('More Settings'),
            () => this.extensionObject.openPreferences());
        settingsItem.visible = Main.sessionMode.allowSettings;
        this.menu._settingsActions[this.extensionObject.uuid] = settingsItem;
    }

    _refresh() {
        for (var i in this._itemsSection._getMenuItems()) {
            this._itemsSection._getMenuItems()[i].setIcon(this.settings.get_int("enable-tap-gesture") == i ? 'emblem-ok-symbolic' : null)
        }
    }
};


let keycodes;
let layouts;
let currentMonitorId = 0;
let sound_press_file;
let sound_release_file;
export default class GjsOskExtension extends Extension {
    _openKeyboard(instant) { 
        if (this.Keyboard.state == State.CLOSED) {
            this.Keyboard.open(null, !instant ? null : true);
        }
    }

    _closeKeyboard(instant) {
        if (this.Keyboard.state == State.OPENED) {
            this.Keyboard.close(!instant ? null : true);
        }
    }

    _toggleKeyboard(instant = false) {
        if (!this.Keyboard.opened) {
            this._openKeyboard(instant);
            this.Keyboard.openedFromButton = true;
            this.Keyboard.closedFromButton = false
        } else {
            this._closeKeyboard(instant);
            this.Keyboard.openedFromButton = false;
            this.Keyboard.closedFromButton = true;
        }
    }

    open_interval() {
        if (this.tapConnect && GObject.signal_handler_is_connected(global.stage, this.tapConnect))
            global.stage.disconnect(this.tapConnect);
        if (this.openInterval !== null) {
            clearInterval(this.openInterval);
            this.openInterval = null;
        }
        this.openInterval = setInterval(() => {
            if (this.Keyboard != null) {
                if (global.stage.key_focus == this.Keyboard && this.Keyboard.prevKeyFocus != null) {
                    global.stage.key_focus = this.Keyboard.prevKeyFocus
                }
                this.Keyboard.get_parent().set_child_at_index(this.Keyboard, this.Keyboard.get_parent().get_n_children() - 1);
                this.Keyboard.set_child_at_index(this.Keyboard.box, this.Keyboard.get_n_children() - 1);
                if (!this.Keyboard.openedFromButton && this.lastInputMethod) {
                    if (Main.inputMethod.currentFocus != null && Main.inputMethod.currentFocus.is_focused() && !this.Keyboard.closedFromButton) {
                        this._openKeyboard();
                    } else if (!this.Keyboard.closedFromButton && !this.Keyboard._dragging) {
                        this._closeKeyboard();
                        this.Keyboard.closedFromButton = false
                    } else if (Main.inputMethod.currentFocus == null) {
                        this.Keyboard.closedFromButton = false
                    }
                }
            }
        }, 300);
        this.tapConnect = global.stage.connect("event", (_actor, event) => {
            if (event.type() !== Clutter.EventType.ENTER && event.type() !== Clutter.EventType.LEAVE) { 
                // Events 9 - 12 are CLUTTER_TOUCH_BEGIN, CLUTTER_TOUCH_UPDATE, CLUTTER_TOUCH_END, CLUTTER_TOUCH_CANCEL
                this.lastInputMethod = [false, event.type() >= 9 && event.type() <= 12, true][this.settings.get_int("enable-tap-gesture")]
            }
        })
    }

    enable() {
        sound_press_file = Gio.File.new_for_path(this.path + "/sounds/01-0.wav");
        sound_release_file = Gio.File.new_for_path(this.path + "/sounds/01-1.wav");

        this.settings = this.getSettings();
        this.darkSchemeSettings = this.getSettings("org.gnome.desktop.interface");
        this.inputLanguageSettings = InputSourceManager.getInputSourceManager();
        this.gnomeKeyboardSettings = this.getSettings('org.gnome.desktop.a11y.applications');
        this.isGnomeKeyboardEnabled = this.gnomeKeyboardSettings.get_boolean('screen-keyboard-enabled');
        this.gnomeKeyboardSettings.set_boolean('screen-keyboard-enabled', false)
        this.isGnomeKeyboardEnabledHandler = this.gnomeKeyboardSettings.connect('changed', () => {
            this.gnomeKeyboardSettings.set_boolean('screen-keyboard-enabled', false)
        });
        this.settings.scheme = ""
        if (this.darkSchemeSettings.get_string("color-scheme") == "prefer-dark")
            this.settings.scheme = "-dark"
        this.openBit = this.settings.get_child("indicator");

        this.openPrefs = () => { this.openPreferences() }

        let [okL, contentsL] = GLib.file_get_contents(this.path + '/physicalLayouts.json');
        if (okL) {
            layouts = JSON.parse(contentsL);
        }

        let refresh = () => {
            let currentMonitors = this.settings.get_string("default-monitor").split(";")
            let currentMonitorMap = {};
            let monitors = Main.layoutManager.monitors;
            for (var i of currentMonitors) {
                let tmp = i.split(":");
                currentMonitorMap[tmp[0]] = tmp[1] + "";
            }
            if (!Object.keys(currentMonitorMap).includes(monitors.length + "")) {
                let allConfigs = Object.keys(currentMonitorMap).map(Number.parseInt).sort();
                currentMonitorMap[monitors.length + ""] = allConfigs[allConfigs.length - 1];
            }
            try {
                currentMonitorId = global.backend.get_monitor_manager().get_monitor_for_connector(currentMonitorMap[monitors.length + ""]);
                if (currentMonitorId == -1) {
                    currentMonitorId = 0;
                }
            } catch {
                currentMonitorId = 0;
            }
         
            if (this.Keyboard) {
                this.Keyboard.destroy();
                this.Keyboard = null;
            }
            let [ok, contents] = GLib.file_get_contents(this.path + '/keycodes/' + KeyboardManager.getKeyboardManager().currentLayout.id + '.json');
            if (ok) {
                keycodes = JSON.parse(contents);
            }
            this.Keyboard = new Keyboard(this.settings, this);
            console.log("GJS-osk can't attach shit to a global object, like: "+this.Keyboard);
            global.foobar = this.Keyboard; //debug. If LG isn't going to help me get a grip on my extension's state, then yolo.
            this.Keyboard.refresh = refresh;
        }
        refresh()

        this._originalLastDeviceIsTouchscreen = KeyboardUI.KeyboardManager.prototype._lastDeviceIsTouchscreen;
        KeyboardUI.KeyboardManager.prototype._lastDeviceIsTouchscreen = () => { return false };

        this._indicator = null;
        this.openInterval = null;
        if (this.settings.get_boolean("indicator-enabled")) {
            this._indicator = new PanelMenu.Button(0.0, "GJS OSK Indicator", false);
            let icon = new St.Icon({
                gicon: new Gio.ThemedIcon({
                    name: 'input-keyboard-symbolic'
                }),
                style_class: 'system-status-icon'
            });
            this._indicator.add_child(icon);

            this._indicator.connect("button-press-event", () => this._toggleKeyboard());
            this._indicator.connect("touch-event", (_actor, event) => {
                if (event.type() == Clutter.EventType.TOUCH_END) this._toggleKeyboard()
            });
            Main.panel.addToStatusArea("GJS OSK Indicator", this._indicator);
        }

        this._toggle = new KeyboardMenuToggle(this);
        this._quick_settings_indicator = new QuickSettings.SystemIndicator();
        this._quick_settings_indicator.quickSettingsItems.push(this._toggle);
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._quick_settings_indicator);
        this.open_interval();
        this.openFromCommandHandler = this.openBit.connect("changed", () => {
            this.openBit.set_boolean("opened", false)
            this._toggleKeyboard();
        })
        let settingsChanged = () => {
            let opened;
            if (this.Keyboard != null)
                opened = this.Keyboard.opened
            else
                opened = false
            if (this.darkSchemeSettings.get_string("color-scheme") == "prefer-dark")
                this.settings.scheme = "-dark"
            else
                this.settings.scheme = ""
            this.Keyboard.openedFromButton = false;
            refresh()
            this._toggle._refresh();
            if (this.settings.get_boolean("indicator-enabled")) {
                if (this._indicator != null) {
                    this._indicator.destroy();
                    this._indicator = null;
                }
                this._indicator = new PanelMenu.Button(0.0, "GJS OSK Indicator", false);
                let icon = new St.Icon({
                    gicon: new Gio.ThemedIcon({
                        name: 'input-keyboard-symbolic'
                    }),
                    style_class: 'system-status-icon'
                });
                this._indicator.add_child(icon);

                this._indicator.connect("button-press-event", () => this._toggleKeyboard());
                this._indicator.connect("touch-event", (_actor, event) => {
                    if (event.type() == Clutter.EventType.TOUCH_END) this._toggleKeyboard()
                });
                Main.panel.addToStatusArea("GJS OSK Indicator", this._indicator);
            } else {
                if (this._indicator != null) {
                    this._indicator.destroy();
                    this._indicator = null;
                }
            }
            global.stage.disconnect(this.tapConnect)
            if (this.openInterval !== null) {
                clearInterval(this.openInterval);
                this.openInterval = null;
            }
            this.open_interval();
            if (opened) {
                this._toggleKeyboard(true);
            }
        }
        this.settingsHandlers = [
            this.settings.connect("changed", settingsChanged),
            this.darkSchemeSettings.connect("changed", (_, key) => { if (key == "color-scheme") settingsChanged() }),
            this.inputLanguageSettings.connect("current-source-changed", settingsChanged)
        ];
    }

    disable() {
        sound_press_file = null;
        sound_release_file = null;
        this.gnomeKeyboardSettings.disconnect(this.isGnomeKeyboardEnabledHandler);
        this.gnomeKeyboardSettings.set_boolean('screen-keyboard-enabled', this.isGnomeKeyboardEnabled);

        this._quick_settings_indicator.quickSettingsItems.forEach(item => item.destroy());
        this._quick_settings_indicator.destroy();
        this._quick_settings_indicator = null;

        this._indicator?.destroy();
        this._indicator = null;
    
        this.Keyboard?.destroy();
        this.settings.disconnect(this.settingsHandlers[0]);
        this.darkSchemeSettings.disconnect(this.settingsHandlers[1]);
        this.inputLanguageSettings.disconnect(this.settingsHandlers[2]);
        this.settings = null;
        this.darkSchemeSettings = null;
        this.inputLanguageSettings = null;
        this.gnomeKeyboardSettings = null;
        this.openBit.disconnect(this.openFromCommandHandler);
        this.openBit = null;
        global.stage.disconnect(this.tapConnect)
        if (this.openInterval !== null) {
            clearInterval(this.openInterval);
            this.openInterval = null;
        }
        this._toggle?.destroy();
        this._toggle = null;
        this.Keyboard = null;
        keycodes = null;
        if (this._originalLastDeviceIsTouchscreen !== null) {
            KeyboardUI.KeyboardManager.prototype._lastDeviceIsTouchscreen = this._originalLastDeviceIsTouchscreen;
            this._originalLastDeviceIsTouchscreen = null;
        }
    }
}


class Keyboard extends Dialog {
    static [GObject.signals] = {
        'drag-begin': {},
        'drag-end': {}
    };

    static {
        GObject.registerClass(this);
    }

    _init(settings, extensionObject) {
        this.settingsOpenFunction = extensionObject.openPrefs
        this.inputDevice = Clutter.get_default_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        this.settings = settings;
        let monitor = Main.layoutManager.monitors[currentMonitorId];
        //super._init(Main.layoutManager.modalDialogGroup, 'db-keyboard-content');
        super._init(Main.uiGroup, 'db-keyboard-content');
        this.box = new St.Widget({
            reactive: true,
            layout_manager: new Clutter.GridLayout({
                orientation: Clutter.Orientation.HORIZONTAL,
            })
        });
        const landscapeAspect = monitor.width > monitor.height;
        this.widthPercent = landscapeAspect ? settings.get_int("landscape-width-percent") / 100 : settings.get_int("portrait-width-percent") / 100;
        this.heightPercent = landscapeAspect ? settings.get_int("landscape-height-percent") / 100 : settings.get_int("portrait-height-percent") / 100;
        this.nonDragBlocker = new Clutter.Actor();
        this.buildUI();
        this.draggable = false;
        this.add_child(this.box);
        this.close();
        this.box.set_name("osk-gjs")
        this.mod = [];
        this.modBtns = []; // obsolete concept methinks
        
        this.capsL = false;
        this.shift = false;
        this.alt = false;
        this.opened = false;
        this.state = State.CLOSED;
        this.delta = [];
        this.monitorChecker = global.backend.get_monitor_manager().connect('monitors-changed', () => {
            if (Main.layoutManager.monitors.length > 0) {
                this.refresh();
            }
        });
        this._dragging = false;
        let side = null;
        switch (this.settings.get_int("default-snap")) {
            case 0:
            case 1:
            case 2:
                side = St.Side.TOP;
                break;
            case 3:
                side = St.Side.LEFT;
                break;
            case 5:
                side = St.Side.RIGHT;
                break;
            case 6:
            case 7:
            case 8:
                side = St.Side.BOTTOM;
                break;
        }
        this.oldBottomDragAction = global.stage.get_action('osk');
        if (this.oldBottomDragAction !== null && this.oldBottomDragAction instanceof Clutter.Action)
            global.stage.remove_action(this.oldBottomDragAction);
        if (side != null) {
            const mode = Shell.ActionMode.ALL & ~Shell.ActionMode.LOCK_SCREEN;
            const bottomDragAction = new EdgeDragAction.EdgeDragAction(side, mode);
            bottomDragAction.connect('activated', () => {
                this.open(true);
                this.openedFromButton = true;
                this.closedFromButton = false;
                this.gestureInProgress = false;
            });
            bottomDragAction.connect('progress', (_action, progress) => {
                if (!this.gestureInProgress)
                    this.open(false)
                this.setOpenState(Math.min(Math.max(0, (progress / (side % 2 == 0 ? this.box.height : this.box.width)) * 100), 100))
                this.gestureInProgress = true;
            });
            bottomDragAction.connect('gesture-cancel', () => {
                if (this.gestureInProgress) {
                    this.close()
                    this.openedFromButton = false;
                    this.closedFromButton = true;
                }
                this.gestureInProgress = false;
                return Clutter.EVENT_PROPAGATE;
            });
            global.stage.add_action_full('osk', Clutter.EventPhase.CAPTURE, bottomDragAction);
            this.bottomDragAction = bottomDragAction;
        } else {
            this.bottomDragAction = null;
        }
        this._oldMaybeHandleEvent = Main.keyboard.maybeHandleEvent
        Main.keyboard.maybeHandleEvent = (e) => {
            //11 = CLUTTER_TOUCH_END, 7 = CLUTTER_BUTTON_RELEASE
            let lastInputMethod = [e.type() == 11, e.type() == 11, e.type() == 7 || e.type() == 11][this.settings.get_int("enable-tap-gesture")]
            let ac = global.stage.get_event_actor(e)
            if (this.contains(ac)) {
                ac.event(e, true);
                ac.event(e, false);
                return true;
            } else if (ac instanceof Clutter.Text && lastInputMethod && !this.opened) {
                this.open();
            }
            return false
        }
    }

    destroy() {
        Main.keyboard.maybeHandleEvent = this._oldMaybeHandleEvent
        global.stage.remove_action_by_name('osk')
        if (this.oldBottomDragAction !== null && this.oldBottomDragAction instanceof Clutter.Action)
            global.stage.add_action_full('osk', Clutter.EventPhase.CAPTURE, this.oldBottomDragAction)
        if (this.textboxChecker !== null) {
            clearInterval(this.textboxChecker);
            this.textboxChecker = null;
        }
        if (this.stateTimeout !== null) {
            clearTimeout(this.stateTimeout);
            this.stateTimeout = null;
        }
        if (this.keyTimeout !== null) {
            clearTimeout(this.keyTimeout);
            this.keyTimeout = null;
        }
        //if (this.capsLockConnect && GObject.signal_handler_is_connected(this.keymap, this.capsLockConnect))
        //    this.keymap.disconnect(this.capsLockConnect);
        //if (this.numLockConnect && GObject.signal_handler_is_connected(this.keymap, this.numLockConnect))
        //    this.keymap.disconnect(this.numLockConnect);
        global.backend.get_monitor_manager().disconnect(this.monitorChecker)
        super.destroy();
        if (this.nonDragBlocker !== null) {
            Main.layoutManager.removeChrome(this.nonDragBlocker)
        }
    }

    startDragging(event, delta) {
        if (this.draggable) {
            if (this._dragging)
                return Clutter.EVENT_PROPAGATE;
            this._dragging = true;
            this.box.set_opacity(255);
            this.box.ease({
                opacity: 200,
                duration: 100,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => { }
            });
            let device = event.get_device();
            let sequence = event.get_event_sequence();
            this._grab = global.stage.grab(this);
            this._grabbedDevice = device;
            this._grabbedSequence = sequence;
            this.emit('drag-begin');
            let [absX, absY] = event.get_coords();
            this.snapMovement(absX - delta[0], absY - delta[1]);
            return Clutter.EVENT_STOP;
        } else {
            return Clutter.EVENT_PROPAGATE;
        }
    }

    endDragging() {
        if (this.draggable) {
            if (this._dragging) {
                if (this._releaseId) {
                    this.disconnect(this._releaseId);
                    this._releaseId = 0;
                }
                if (this._grab) {
                    this._grab.dismiss();
                    this._grab = null;
                }

                this.box.set_opacity(200);
                this.box.ease({
                    opacity: 255,
                    duration: 100,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    onComplete: () => { }
                });
                this._grabbedSequence = null;
                this._grabbedDevice = null;
                this._dragging = false;
                this.delta = [];
                this.emit('drag-end');
                this._dragging = false;
            }
            this.draggable = false;
            return Clutter.EVENT_STOP;
        } else {
            return Clutter.EVENT_STOP;
        }
    }

    motionEvent(event) {
        if (this.draggable) {
            let [absX, absY] = event.get_coords();
            this.snapMovement(absX - this.delta[0], absY - this.delta[1]);
            return Clutter.EVENT_STOP
        } else {
            return Clutter.EVENT_STOP
        }
    }

    snapMovement(xPos, yPos) {
        let monitor = Main.layoutManager.monitors[currentMonitorId]
        if (xPos < monitor.x || yPos < monitor.y || xPos > monitor.x + monitor.width || yPos > monitor.y + monitor.width) {
            this.set_translation(xPos, yPos, 0);
            return;
        }
        xPos -= monitor.x;
        yPos -= monitor.y;
        let snap_px = this.settings.get_int("snap-spacing-px");
        if (Math.abs(xPos - ((monitor.width * .5) - ((this.width * .5)))) <= 50) {
            xPos = ((monitor.width * .5) - ((this.width * .5)));
        } else if (Math.abs(xPos - snap_px) <= 50) {
            xPos = snap_px;
        } else if (Math.abs(xPos - (monitor.width - this.width - snap_px)) <= 50) {
            xPos = monitor.width - this.width - snap_px
        }
        if (Math.abs(yPos - (monitor.height - this.height - snap_px)) <= 50) {
            yPos = monitor.height - this.height - snap_px;
        } else if (Math.abs(yPos - snap_px) <= 50) {
            yPos = snap_px;
        } else if (Math.abs(yPos - ((monitor.height * .5) - (this.height * .5))) <= 50) {
            yPos = (monitor.height * .5) - (this.height * .5);
        }
        this.set_translation(xPos + monitor.x, yPos + monitor.y, 0);
    }

    setOpenState(percent) {
        let monitor = Main.layoutManager.monitors[currentMonitorId];
        
        let posX = [this.settings.get_int("snap-spacing-px"), ((monitor.width * .5) - ((this.width * .5))), monitor.width - this.width - this.settings.get_int("snap-spacing-px")][(this.settings.get_int("default-snap") % 3)];
        let posY = [this.settings.get_int("snap-spacing-px"), ((monitor.height * .5) - ((this.height * .5))), monitor.height - this.height - this.settings.get_int("snap-spacing-px")][Math.floor((this.settings.get_int("default-snap") / 3))];
        let mX = [-this.box.width, 0, this.box.width][(this.settings.get_int("default-snap") % 3)];
        let mY = [-this.box.height, 0, this.box.height][Math.floor((this.settings.get_int("default-snap") / 3))]
        let [dx, dy] = [posX + mX * ((100 - percent) / 100) + monitor.x, posY + mY * ((100 - percent) / 100) + monitor.y]
        let op = 255 * (percent / 100);
        this.set_translation(dx, dy, 0)
        this.box.set_opacity(op)
    }

    open(noPrep = null, instant = null) {
        global.compositor.disable_unredirect(); //inhibit direct scanout
        if (this.updateCapsLock) this.updateCapsLock()
        if (this.updateNumLock) this.updateNumLock()
        if (noPrep == null || !noPrep) {
            this.prevKeyFocus = global.stage.key_focus
            this.inputDevice = Clutter.get_default_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
            this.state = State.OPENING
            this.show();
        }
        if (noPrep == null || noPrep) {
            let monitor = Main.layoutManager.monitors[currentMonitorId];
            let posX = [this.settings.get_int("snap-spacing-px"), ((monitor.width * .5) - ((this.width * .5))), monitor.width - this.width - this.settings.get_int("snap-spacing-px")][(this.settings.get_int("default-snap") % 3)];
            let posY = [this.settings.get_int("snap-spacing-px"), ((monitor.height * .5) - ((this.height * .5))), monitor.height - this.height - this.settings.get_int("snap-spacing-px")][Math.floor((this.settings.get_int("default-snap") / 3))];
            if (noPrep == null) {
                let mX = [-this.box.width, 0, this.box.width][(this.settings.get_int("default-snap") % 3)];
                let mY = [-this.box.height, 0, this.box.height][Math.floor((this.settings.get_int("default-snap") / 3))]
                this.set_translation(posX + mX + monitor.x, posY + mY + monitor.y, 0)
            }
            this.box.ease({
                opacity: 255,
                duration: instant == null || !instant ? 100 : 0,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    if (this.stateTimeout !== null) {
                        clearTimeout(this.stateTimeout);
                        this.stateTimeout = null;
                    }
                    this.stateTimeout = setTimeout(() => {
                        this.state = State.OPENED
                    }, 500);
                }
            });
            this.ease({
                translation_x: posX + monitor.x,
                translation_y: posY + monitor.y,
                duration: instant == null || !instant ? 100 : 0,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD
            })
            if (!this.settings.get_boolean("enable-drag") && this.nonDragBlocker !== null) {
                Main.layoutManager.addChrome(this.nonDragBlocker, {
                    affectsStruts: true,
                    trackFullscreen: true,
                })
            }
            this.opened = true;
        }
    }

    close(instant = null) {
        this.prevKeyFocus = null;
        let monitor = Main.layoutManager.monitors[currentMonitorId];
        let posX = [this.settings.get_int("snap-spacing-px"), ((monitor.width * .5) - ((this.width * .5))), monitor.width - this.width - this.settings.get_int("snap-spacing-px")][(this.settings.get_int("default-snap") % 3)];
        let posY = [this.settings.get_int("snap-spacing-px"), ((monitor.height * .5) - ((this.height * .5))), monitor.height - this.height - this.settings.get_int("snap-spacing-px")][Math.floor((this.settings.get_int("default-snap") / 3))];
        let mX = [-this.box.width, 0, this.box.width][(this.settings.get_int("default-snap") % 3)];
        let mY = [-this.box.height, 0, this.box.height][Math.floor((this.settings.get_int("default-snap") / 3))]
        this.state = State.CLOSING
        this.box.ease({
            opacity: 0,
            duration: instant == null || !instant ? 100 : 0,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this.opened = false;
                this.hide();
                if (this.stateTimeout !== null) {
                    clearTimeout(this.stateTimeout);
                    this.stateTimeout = null;
                }
                this.stateTimeout = setTimeout(() => {
                    this.state = State.CLOSED
                }, 500);
            },
        });
        this.ease({
            translation_x: posX + mX + monitor.x,
            translation_y: posY + mY + monitor.y,
            duration: instant == null || !instant ? 100 : 0,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD
        })
        if (!this.settings.get_boolean("enable-drag") && this.nonDragBlocker !== null) {
            Main.layoutManager.removeChrome(this.nonDragBlocker, {
                affectsStruts: true,
                trackFullscreen: true,
            })
        }
        this.openedFromButton = false
        this.releaseAllKeys();
        global.compositor.enable_unredirect(); //de-inhibit direct scanout

    }

    vfunc_button_press_event() {
        this.delta = [Clutter.get_current_event().get_coords()[0] - this.translation_x, Clutter.get_current_event().get_coords()[1] - this.translation_y];
        return this.startDragging(Clutter.get_current_event(), this.delta)
    }

    vfunc_button_release_event() {
        if (this._dragging && !this._grabbedSequence) {
            return this.endDragging();
        }
        return Clutter.EVENT_PROPAGATE;
    }

    vfunc_motion_event() {
        let event = Clutter.get_current_event();
        if (this._dragging && !this._grabbedSequence) {
            this.motionEvent(event);
        }
        return Clutter.EVENT_PROPAGATE;
    }

    vfunc_touch_event() {
        let event = Clutter.get_current_event();
        let sequence = event.get_event_sequence();

        if (!this._dragging && event.type() == Clutter.EventType.TOUCH_BEGIN) {
            this.delta = [event.get_coords()[0] - this.translation_x, event.get_coords()[1] - this.translation_y];
            this.startDragging(event, this.delta);
            return Clutter.EVENT_STOP;
        } else if (this._grabbedSequence && sequence.get_slot() === this._grabbedSequence.get_slot()) {
            if (event.type() == Clutter.EventType.TOUCH_UPDATE) {
                return this.motionEvent(event);
            } else if (event.type() == Clutter.EventType.TOUCH_END) {
                return this.endDragging();
            }
        }

        return Clutter.EVENT_PROPAGATE;
    }

    buildUI() {
        this.box.set_opacity(0);
        this.keys = [];
        let monitor = Main.layoutManager.monitors[currentMonitorId]
        let snap_px = this.settings.get_int("snap-spacing-px");
        let layoutName = Object.keys(layouts)[(monitor.width > monitor.height) ? this.settings.get_int("layout-landscape") : this.settings.get_int("layout-portrait")]; // If the setting # is invalid, too bad.
       
        this.box.width = Math.round((monitor.width - snap_px * 2) * (layoutName.includes("Split") ? 1 : this.widthPercent))
        this.box.height = Math.round((monitor.height - snap_px * 2) * this.heightPercent)

        if (!this.settings.get_boolean("enable-drag")) {
            this.nonDragBlocker = new Clutter.Actor();
            switch (this.settings.get_int("default-snap")) {
                case 0:
                case 1:
                case 2:
                    this.nonDragBlocker.x = monitor.x;
                    this.nonDragBlocker.y = monitor.y;
                    this.nonDragBlocker.width = monitor.width;
                    this.nonDragBlocker.height = this.box.height + 2 * snap_px;
                    break;
                case 3:
                    this.nonDragBlocker.x = monitor.x;
                    this.nonDragBlocker.y = monitor.y;
                    this.nonDragBlocker.width = this.box.width + 2 * snap_px;
                    this.nonDragBlocker.height = monitor.height;
                    break;
                case 5:
                    this.nonDragBlocker.x = monitor.x + monitor.width - (this.box.width + 2 * snap_px);
                    this.nonDragBlocker.y = monitor.y;
                    this.nonDragBlocker.width = this.box.width + 2 * snap_px;
                    this.nonDragBlocker.height = monitor.height;
                    break;
                case 6:
                case 7:
                case 8:
                    this.nonDragBlocker.x = monitor.x;
                    this.nonDragBlocker.y = monitor.y + monitor.height - (this.box.height + 2 * snap_px);
                    this.nonDragBlocker.width = monitor.width;
                    this.nonDragBlocker.height = this.box.height + 2 * snap_px;
                    break;
            }
            if (this.settings.get_int("default-snap") == 4) {
                this.nonDragBlocker.destroy();
                this.nonDragBlocker = null;
            }
        } else {
            this.nonDragBlocker.destroy();
            this.nonDragBlocker = null;
        }

        const grid = this.box.layout_manager
        grid.set_row_homogeneous(true)
        grid.set_column_homogeneous(!layoutName.includes("Split"))


        let currentGrid = grid;
       // let topBtnWidth;

        this.shiftButtons = [];
        this.modButtons = [];
        //this.ModifierButtons = [];

        let currentLayout = layouts[layoutName];
        let width = 0;
        for (const c of currentLayout[0]) {
            width += (Object.hasOwn(c, "width") ? c.width : 1)
        }
        let rowSize;
        let halfSize;
        let r = 0;
        let c;
        const doAddKey = (keydef) => {
            const i = keycodes[keydef.key];
            if (i != null && typeof i !== 'string') {
                if (i.layers.default == null) {
                    for (var key of Object.keys(i.layers)) {
                        i.layers[key] = i.layers["_" + key]
                    }
                }
                let params = {
                    x_expand: true,
                    y_expand: true
                }

                let iconKeys = ["left", "up", "right", "down", "space"]
                if (this.settings.get_boolean("show-icons")) {
                    iconKeys = ["left", "up", "right", "down", "backspace", "tab", "capslock", "shift", "enter", "ctrl", "super", "alt", "space"]
                }

                if (iconKeys.some(j => { return i.layers.default.toLowerCase() == j })) {
                    params.style_class = i.layers.default.toLowerCase() + "_btn"
                    for (var key of Object.keys(i.layers)) {
                        i.layers["_" + key] = i.layers[key]
                        i.layers[key] = null
                    }
                } else {
                    params.label = i.layers.default
                }
                //i.isMod = false
                //if ([42, 54, 29, 125, 56, 100, 97, 58, 69].some(j => { return i.code == j })) i.isMod = true;
                
                const keyBtn = KeyboardKey.constructor2(this,params,i,keydef);
 
				const buttonHeight = 4; 
                
				currentGrid.attach(keyBtn, c, 3 + r, keydef.width * 2, buttonHeight) ;
                //keyBtn.visible = true
                c +=  keydef.width * 2
                this.keys.push(keyBtn)
            }
        }

        for (const kRow of currentLayout) {
            c = 0;
            for (const keydef of kRow) {
            //Now's as good a time as any to give our physicalLayout keys some default values.
            if (! keydef?.repeat ) keydef.repeat = false;
            if (! keydef?.width ) keydef.width = 1;
            doAddKey(keydef);
            }
            const size = c;
            if (!rowSize) rowSize = size;
            r += 4; 
        }

        this.box.add_style_class_name("boxLay");
        if (this.settings.get_boolean("system-accent-col") && major >= 47) {
            if (this.settings.scheme == "-dark") {
                this.box.set_style("background-color: st-darken(-st-accent-color, 30%); padding: " + this.settings.get_int("outer-spacing-px") + "px;")
            } else {
                this.box.set_style("background-color: st-lighten(-st-accent-color, 10%); padding: " + this.settings.get_int("outer-spacing-px") + "px;")
            }
        } else {
            this.box.set_style("background-color: rgba(" + this.settings.get_double("background-r" + this.settings.scheme) + "," + this.settings.get_double("background-g" + this.settings.scheme) + "," + this.settings.get_double("background-b" + this.settings.scheme) + ", " + this.settings.get_double("background-a" + this.settings.scheme) + "); padding: " + this.settings.get_int("outer-spacing-px") + "px;")
        }
        if (this.lightOrDark()) { 
            this.box.add_style_class_name("inverted");
        } else this.box.add_style_class_name("regular");
     
    } // buildUI


    lightOrDark() {
        let r, g, b;
        if (this.settings.get_boolean("system-accent-col")) {
            return this.settings.scheme != "-dark"
        } else {
            r = this.settings.get_double("background-r" + this.settings.scheme);
            g = this.settings.get_double("background-g" + this.settings.scheme);
            b = this.settings.get_double("background-b" + this.settings.scheme);
        }
        var hsp;
        hsp = Math.sqrt(
            0.299 * (r * r) +
            0.587 * (g * g) +
            0.114 * (b * b)
        );
        return hsp > 127.5
    }

    releaseAllKeys(){
        //implement me
    }

    releaseAllKeysDeleteme() {
        let instances = [];

        function traverse(obj) {
            for (let key in obj) {
                if (obj.hasOwnProperty(key)) {
                    if (key === "code") {
                        instances.push(obj[key]);
                    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                        traverse(obj[key]);
                    }
                }
            }
        }
        traverse(keycodes);
        //instances.forEach(i => {
        //    this.inputDevice.notify_key(Clutter.get_current_event_time(), i, Clutter.KeyState.RELEASED);
        //})
        this.keys.forEach(item => {
            item.key_pressed = false;
            if (item.button_pressed !== null) {
                clearTimeout(item.button_pressed)
                item.button_pressed == null
            }
            if (item.button_repeat !== null) {
                clearInterval(item.button_repeat)
                item.button_repeat == null
            }
            if (item.space_motion_handler !== null) {
                item.disconnect(item.space_motion_handler)
                item.space_motion_handler = null;
            }
        })
    }

    /*sendKeyRaw(code,state) {
        const event_time=Clutter.get_current_event_time()*1000;
        this.inputDevice.notify_key(event_time, code, state);
    }*/
    
    /*sendKey(keys) {
        const event_time=Clutter.get_current_event_time()*1000; // fun fact - Gnome's genuine OSK multiplies this value *1000. 
        //mutter's notify_key begets meta_virtual_input_device_native_notify_key, which takes in a uint64_t time_us. 
        //struct ClutterEvent has a timestamp_us, it looks like get pulls stuff out of there. Do I smell a type mismatch??
        
        // get_current_event_time produces a guint32. It gets the current event, and asks clutter_event_get_time() of that...
        // clutter_event_get_time does a us to ms conversion. So, I guess doing a Mul by 1000 is correct!
        // So annoying to chase this downerino.

        try {
            for (var i = 0; i < keys.length; i++) {
                this.inputDevice.notify_key(event_time-1, keys[i], Clutter.KeyState.PRESSED); // It should be okay to backdate the down events to come before the up events. Right?
            }
        
            
            for (var j = keys.length - 1; j >= 0; j--) {
                 this.inputDevice.notify_key(event_time, keys[j], Clutter.KeyState.RELEASED);
            }
            
        } catch (err) {
            throw new Error("event_time was: "+event_time + ", GJS-osk: An unknown error occured. Welp.):\n\n" + err + "\n\nKeys Pressed: " + keys);
        }
    }*/



    decideModDeleteme(i, mBtn) {
        if (i.code == KC.LCTL || i.code == KC.LALT || i.code == KC.RALT || i.code == KC.RCTL || i.code == KC.LWIN) {
            this.setNormMod(mBtn);
        } else if (i.code == KC.LALT || i.code == KC.RALT) {
            this.setAlt(mBtn);
        } else if (i.code == KC.LSHIFT || i.code == KC.RSHIFT) {
            this.setShift(mBtn);
        } else if (i.code == KC.CAPSL || i.code == KC.NUML) {
            this.sendKey([mBtn.char.code]);
        } else {
            this.mod.push(i.code);
            this.sendKey(this.mod);
            this.mod = [];
            this.modBtns.forEach(button => {
                button.remove_style_class_name("selected");
            });
            this.shiftButtons.forEach(i => { i.remove_style_class_name("selected") })
            this.resetAllMod();
            this.modBtns = [];
        }
    }

    setCapsLockDeleteme(button, state) {
        if (state) {
            button.add_style_class_name("selected");
            this.capsL = true;
        } else {
            button.remove_style_class_name("selected");
            this.capsL = false;
        }
        this.updateKeyLabels();
    }

    setNumLockDeleteme(button, state) {
        if (state) {
            button.add_style_class_name("selected");
            this.numsL = true;
        } else {
            button.remove_style_class_name("selected");
            this.numsL = false;
        }
        this.updateKeyLabels();
    }

    setAltDeleteme(button) {
        this.alt = !this.alt;
        this.updateKeyLabels();
        if (!this.alt) {
            this.sendKey([button.char.code]);
        }
        this.setNormMod(button);
    }

    setShiftDeleteme(button) {
        this.shift = !this.shift;
        this.updateKeyLabels();
        if (!this.shift) {
            this.sendKey([button.char.code]);
            this.shiftButtons.forEach(i => { i.remove_style_class_name("selected") })
        } else {
            this.shiftButtons.forEach(i => { i.add_style_class_name("selected") })
        }
        this.setNormMod(button);
    }

    updateKeyLabelsDeleteme() {
        this.keys.forEach(key => {
            if (key.char != undefined) {
                let layer = (this.alt ? 'alt' : '') + (this.shift ? 'shift' : '') + (this.numsL ? 'num' : '') + (this.capsL ? 'caps' : '') + (this.numsL || this.capsL ? 'lock' : '')
                if (layer == '') layer = 'default'
                key.label = key.char.layers[layer];
            }
        });
    }


    setNormModDeleteme(button) {
        if (this.mod.includes(button.char.code)) {
            this.mod.splice(this.mod.indexOf(button.char.code), this.mod.indexOf(button.char.code) + 1);
            if (!(button.char.code == KC.LSHIFT) && !(button.char.code == KC.RSHIFT)) //shift
                button.remove_style_class_name("selected");
            this.modBtns.splice(this.modBtns.indexOf(button), this.modBtns.indexOf(button) + 1);
            this.inputDevice.notify_key(Clutter.get_current_event_time(), button.char.code, Clutter.KeyState.RELEASED);
        } else {
            if (!(button.char.code == KC.LSHIFT) && !(button.char.code == KC.RSHIFT)) //shift
                button.add_style_class_name("selected");
            this.mod.push(button.char.code);
            this.modBtns.push(button);
            this.inputDevice.notify_key(Clutter.get_current_event_time(), button.char.code, Clutter.KeyState.PRESSED);
        }
    }

    resetAllModDeleteme() {
        this.shift = false;
        this.alt = false;
        this.updateKeyLabels()
    }
}


const KeyboardKey = GObject.registerClass( class KeyboardKey extends St.Button {
    static constructor2(keyboard,params,i,keydef) {
        const c = i.code;
        //if (c == KC.CAPSL) return new KeyboardCapsLockKey(keyboard,params,i,keydef);
        if (keydef?.mod) return new KeyboardModifierKey(keyboard,params,i,keydef);
        return new KeyboardKey(keyboard,params,i,keydef);
    }

    constructor(keyboard,params,i,keydef) {
        super(params);
        this.char = i;
        this.keydef = keydef;
        if (! this.keydef?.repeat ) this.keydef.repeat = false;
        if (! this.keydef?.width ) this.keydef.width = 1;
        this.myKeyboard = keyboard;
        this.lastPressTime = 0;
        this.holdFnDidActivate = false;
        this.holdFnDelayTimer = null;
        //if ( this.isCapsLockKey() ) this._init_CapsLockKey();
        //if ( this.isShiftKey() ) this._init_ShiftKey();
        this._initialize_style();
        this._hook_callbacks();
        this.visible = true;
    }

    _hook_callbacks(){ 
        this.connect("button-press-event", () => {this.pressEv_handler()}); // cannot just pass 'this.pressEv_handler no-parenthesis' as an arg. The ()=>{} closure is needed to capture 'this'.
        this.connect("button-release-event", () => {this.releaseEv_handler()});
        this.connect("touch-event", () => {this.touchEv_handler()});
        this.connect("destroy", ()=> {this.destroy_handler()});
    }

    _initialize_style() {
        this.set_pivot_point(0.5, 0.5);
        this.add_style_class_name('key');
        const mk_set = this.myKeyboard.settings;
        this.set_style("font-size: " + mk_set.get_int ("font-size-px") + "px; border-radius: " + (mk_set.get_boolean("round-key-corners") ? (mk_set.get_int("border-spacing-px") + 5) + "px;" : "0;") + "background-size: " + mk_set.get_int("font-size-px") + "px; font-weight: " + (mk_set.get_boolean("font-bold") ? "bold" : "normal") + "; border: " + mk_set.get_int("border-spacing-px") + "px solid transparent;");
        if (this.myKeyboard.lightOrDark()) {
            this.add_style_class_name("inverted");
        } else {
            this.add_style_class_name("regular");
        }
    }

    destroy_handler() { 
        if (this?.holdFnDelayTimer) {
            clearTimeout(this.holdFnDelayTimer);
            this.holdFnDelayTimer = null;
            this.holdFnDidActivate = false;
        }
    }

    touchEv_handler() {
        const cur_ev_type = Clutter.get_current_event().type();
            if (cur_ev_type == Clutter.EventType.TOUCH_BEGIN) {
                this.pressEv_handler();
            } else if (cur_ev_type == Clutter.EventType.TOUCH_END || cur_ev_type == Clutter.EventType.TOUCH_CANCEL) {
                this.releaseEv_handler();
            }
    }
    
    pressEv_handler_applyStyle(){
        this.myKeyboard.box.set_child_at_index(this, this.myKeyboard.box.get_children().length - 1);
        this.space_motion_handler = null
        this.set_scale(1.2, 1.2);
        this.add_style_pseudo_class("pressed");
    }

    pressEv_handler() { 
        this.pressEv_handler_applyStyle();
        let player;
        if (this.myKeyboard.settings.get_boolean("play-sound")) {
            player = global.display.get_sound_player();
            //player.play_from_theme("dialog-information", "tap", null);
            player.play_from_file(sound_press_file,"sprang",null);
        }
        if (this.keydef.repeat || this.keydef.mod) { // the || mod is a quick test. 
            this.sendKeyDown();
            return;
        }

        if (this.keydef?.holdFn) {
            // start holdFn timer,
            // which either gets killed by releaseEv before it times out, or transitions to some other "still being held" handler
            // Try not to race condition.
            // https://gjs-docs.gnome.org/st16~16/st.button#method-fake_release might be useful.

            this.holdFnDelayTimer = setTimeout( () => {
                this.holdFnDelayTimer = null;
                this.holdFnDidActivate = true;
            },500 )
            return;
        }
    }
    
    pressEv_quickHScroll_handler() {
        this.button_pressed = setTimeout(() => {
            let lastPos = (this.get_transformed_position()[0] + this.get_transformed_size()[0] / 2);
            this.space_motion_handler = this.connect("touch_event", (actor, event) => { // No, we are not handling mouse events. Deal with it.
                if (event.type() == Clutter.EventType.TOUCH_UPDATE) {
                    let absX = event.get_coords()[0];
                    if (Math.abs(absX - lastPos) > 10) {
                        if (absX > lastPos) {
                            this._sendNotifyKeyTap(KC.RIGHT);
                        } else {
                            this._sendNotifyKeyTap(KC.LEFT);
                        }
                        lastPos = absX;
                    }
                }
            })
        }, 750)              
    }

   /* 
    isCapsLockKey() { return this.i.code == KC.CAPSL; }
    _init_CapsLockKey() {
        this.myKeyboard.keymap = Clutter.get_default_backend().get_default_seat().get_keymap();
        this.myKeyboard.capslockConnect = this.keyboard.keymap.connect("state-changed", (a, e) => {
            this.myKeyboard.setCapsLock(this, this.myKeyboard.keymap.get_caps_lock_state());
        });
        this.myKeyboard.updateCapsLock = () => this.myKeyboard.setCapsLock(this, this.myKeyboard.keymap.get_caps_lock_state())

    }
    */

    releaseEv_handler_removeStyle(){
        this.remove_style_pseudo_class("pressed");
        this.ease({
            scale_x: 1,
            scale_y: 1,
            duration: 100,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => { this.set_scale(1, 1); }
        });

    }

    releaseEv_handler() {
        if (this?.holdFnDelayTimer) clearTimeout(this.holdFnDelayTimer); //race condition?
        this.holdFnDelayTimer = null;
        this.releaseEv_handler_removeStyle();
        global.display.get_sound_player().play_from_file(sound_release_file,"sprong",null);
        if (this.keydef?.repeat) {
            this.sendKeyUp();
            return;
        }

        if (this.holdFnDidActivate) {
            this.holdFnDidActivate = false;
            //this.finishUpAlternateHoldingMode
            return;
        }
        if (this.isMod){
            
        }
        //normal alphanumericsymbol key
        this.sendKeyTap();
        this.clearAllModifiers();
    }

    _sendNotifyKey(keycode,event_time,state) {
        try {
            this.myKeyboard.inputDevice.notify_key(event_time, keycode, state);
        } catch(err) {
            throw new Error("event_time was: "+event_time + ", GJS-osk: An unknown error occured. Welp.):\n\n" + err + "\n\nKeycode Pressed: " + keycode);
        }
    }

    _sendNotifyKeyTap(keycode){ //okay for spacebar handler to use me.
        let releaseTimeUs = Clutter.get_current_event_time()*1000; //get_current_event_time provides milliseconds. notify_key uses µs. 🤷
        let pressTimeUs = releaseTimeUs - 1; //backdate the press so that it "happened" before the release. Just in case if anybody is checking.
        if (releaseTimeUs == 0) { //how?? 
            console.log("GJS-osk: get_current_event_time is zero. This should never happen.");
            pressTimeUs = 0;
            releaseTimeUs = 1;
        }
        if (this.key_pressed) {
            console.log("GJS-osk: Trying to tap keycode ",this.char.code, ", but it appears to already be pressed.");
        } else {this._sendNotifyKey(keycode,pressTimeUs,Clutter.KeyState.PRESSED);}
        this._sendNotifyKey(keycode,releaseTimeUs,Clutter.KeyState.RELEASED);
    }

    sendKeyDown() {
        if (! this.key_pressed) this._sendNotifyKey(this.char.code, Clutter.get_current_event_time()*1000, Clutter.KeyState.PRESSED);
        this.key_pressed = true;

    }
    
    sendKeyUp(){
        if (this.key_pressed) this._sendNotifyKey(this.char.code, Clutter.get_current_event_time()*1000, Clutter.KeyState.RELEASED);
        this.key_pressed = false;
    }

    sendKeyTap(){
        this._sendNotifyKeyTap(this.char.code);
    }


    clearAllModifiers(){
        //console.log("GJS-osk: modbuttons looks like ", this.myKeyboard.modButtons[0]);
        for (var aButton of this.myKeyboard.modButtons) {
            //console.log("GJS-osk: and you get a clearModifier ", aButton);
            aButton.clearModifier();
            
        }
    }

    clearModifier(){
        console.log("GJS-osk: shouldn't reach clearModifier() here");
    }

    get isMod() {return false}
    

}); // } class KeyboardKey ) GObject


const KeyboardModifierKey = GObject.registerClass(class KeyboardModifierKey extends KeyboardKey { 

    constructor(keyboard,params,i,keydef) {
        super(keyboard,params,i,keydef);
        if (i.code == KC.LSHIFT || i.code == KC.RSHIFT) keyboard.shiftButtons.push(this);
        keyboard.modButtons.push(this); 
    }

    clearModifier(){
        if (this.key_pressed){
            this.sendKeyUp();
            //clear my oneshot or locked state
            //reset my appearance
            this.remove_style_class_name("selected");
        }
    this.key_pressed = false;
    }

    get isMod(){return true}

    pressEv_handler_applyStyle(){
        super.pressEv_handler_applyStyle();
        this.add_style_class_name("selected");
    }

 
}); // } class KeyboardModifierKey ) GObject
 
