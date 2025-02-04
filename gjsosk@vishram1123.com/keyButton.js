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
        
    }
}