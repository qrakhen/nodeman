function Game() {
    this.setView = function(view) {
        // disable all active views.
        $('view.active').removeClass('active');
        // activate only the desired view by selecting view[name="viewName"] and adding the 'active' class.
        $('view[name="' + view + '"]').addClass('active');
        // look for all <v>-tags within the active view,
        // and replace their text with the corresponding variable using their key.
        $('view.active v').each(function(i, e) {
            var key = $(e).attr('key');
            if (!key) key = $(e).text();
            $(e).attr('key', key);
            $(e).text(this[key] ? this[key] : key);
        }.bind(this));
    }.bind(this);

    this.getInputValue = function(key, view) {
        // return the value of the given input that we select by its key and the optional view where the input is in.
        return $((view ? 'view[name="' + view + '"] ' : '') + 'input[key="' + key + '"]').val();
    };

    this.setInputValue = function(key, view, value) {
        // return the value of the given input that we select by its key and the optional view where the input is in.
        $((view ? 'view[name="' + view + '"] ' : '') + 'input[key="' + key + '"]').val(value);
    };

    this.setPlayerName = function() {
        var name = this.getInputValue('playerName', 'enter');
        if (name && name.length > 0) {
            this.playerName = name;
            this.store('playerName', name);
            this.setView('menu');
        } else console.error('invalid name');
    }.bind(this);

    this.createRoom = function() {
        $('input.action[action="createRoom"]').addClass('disabled');
        $('input[key="inviteLink"]').removeClass('hidden');
    }.bind(this);

    this.initActions = function() {
        var actions = $('input.action');
        actions.each(function(i, e) {
            $(e).on('click', function() {
                var fn = window.game[$(e).attr('action')];
                if (typeof fn === 'function') fn();
                else console.error($(e).attr('action') + '() is not a game function.');
            });
        });
    };

    this.load = function(key) {
        return window.localStorage.getItem(key);
    };

    this.store = function(key, value) {
        window.localStorage.setItem(key, value);
    };
};

window.init = function() {
    window.socket = io();
    window.game = new Game();
    window.game.initActions();
    var storedName = window.game.load('playerName');
    if (storedName) {
        window.game.setInputValue('playerName', 'enter', storedName);
    }
};
