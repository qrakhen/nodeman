function Game() {
    this.setView = function(view) {
        $('view.active').removeClass('active');
        $('view[name="' + view + '"]').addClass('active');
        $('view.active v').each(function(i, e) {
            var key = $(e).attr('key');
            if (!key) key = $(e).text();
            $(e).attr('key', key);
            $(e).text(this[key] ? this[key] : key);
        }.bind(this));
    }.bind(this);

    this.getInputValue = function(key, view) {
        return $((view ? 'view[name="' + view + '"] ' : '') + 'input[key="' + key + '"]').val();
    };

    this.setName = function() {
        var name = this.getInputValue('name', 'enter');
        if (name && name.length > 0) game.playerName = name;
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
};

window.init = function() {
    window.socket = io();
    window.game = new Game();
    window.game.initActions();
};
