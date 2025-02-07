import St from 'gi://St';

class KeyButton extends St {
    constructor (i, params) { 
        new St.Button(params);
     }


    set char(x) {this._char = x }

    get char() {return this._char}

}

class KeyButtonController {
    /* 
        .isMod = this is a modifier key (alt ctrl shift, caps/numlock, etc)
        .code = the 
    */
    constructor(){
        this.isMod=false
    } 

    set StButton(val) {this.StButton = val;}

    get StButton() {this.StButton;}

    set code(val) {
        this.code=val;
        if ([42, 54, 29, 125, 56, 100, 97, 58, 69].includes(val)) {
            this.isMod=true;
        } else {
            this.isMod=false;
        }

        if (val==42 || val==54) {
            //left/right shift key
        }
        else if (val==58) {
            //capslock
        } else if (val==69) {
            //numlock
        }
        
    }

    get code() {this.code;}

    pressEvent(eventType) {
        const item = this.StButton
        // this.box.set_child_at_index(item, this.box.get_children().length - 1); //dunno what this is doing
        item.space_motion_handler = null
        item.set_scale(1.2, 1.2)
        item.add_style_pseudo_class("pressed")
        let player
        if (this.settings.get_boolean("play-sound")) {
            player = global.display.get_sound_player();
            player.play_from_theme("dialog-information", "tap", null)
        }
        if (["delete_btn", "backspace_btn", "up_btn", "down_btn", "left_btn", "right_btn"].some(e => item.has_style_class_name(e))) {
            item.button_pressed = setTimeout(() => {
                const oldModBtns = this.modBtns
                item.button_repeat = setInterval(() => {
                    if (this.settings.get_boolean("play-sound")) {
                        player.play_from_theme("dialog-information", "tap", null)
                    }
                    this.decideMod(item.char)

                    for (var i of oldModBtns) {
                        this.decideMod(i.char, i)
                    }
                }, 100);
            }, 750);
        } else if (item.has_style_class_name("space_btn")) {
            item.button_pressed = setTimeout(() => {
                let lastPos = (item.get_transformed_position()[0] + item.get_transformed_size()[0] / 2)
                if (evType == "mouse") {
                    item.space_motion_handler = item.connect("motion_event", (actor, event) => {
                        let absX = event.get_coords()[0];
                        if (Math.abs(absX - lastPos) > 20) {
                            if (absX > lastPos) {
                                this.sendKey([106])
                            } else {
                                this.sendKey([105])
                            }
                            lastPos = absX
                        }
                    })
                } else {
                    item.space_motion_handler = item.connect("touch_event", (actor, event) => {
                        if (event.type() == Clutter.EventType.TOUCH_UPDATE) {
                            let absX = event.get_coords()[0];
                            if (Math.abs(absX - lastPos) > 20) {
                                if (absX > lastPos) {
                                    this.sendKey([106])
                                } else {
                                    this.sendKey([105])
                                }
                                lastPos = absX
                            }
                        }
                    })
                }
            }, 750)
        } else {
            item.key_pressed = true;
            item.button_pressed = setTimeout(() => {
                releaseEv()
            }, 1000);
        }
                    
    }
}

