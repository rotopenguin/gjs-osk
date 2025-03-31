import St from 'gi://St';

class KeyButton extends St {
    constructor (i, params) { 
        new St.Button(params);
     }


    set char(x) {this._char = x }

    get char() {return this._char}

}

