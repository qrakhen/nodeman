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

    this.setPlayerName = function() {
        var name = this.getInputValue('name', 'enter');
        if (name && name.length > 0) game.playerName = name;
        this.setStorage('playerName', name);
        this.setView('menu');
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

    this.getStore = function(key) {
        return window.localStorage.getItem(key);
    };

    this.setStore = function(key, value) {
        window.localStorage.setItem(key, value);
    };
};

window.init = function() {
    window.socket = io();
    window.game = new Game();
    window.game.initActions();
};
