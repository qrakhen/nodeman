function Game() {
    this.actions = {};

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
            this.actions.enter.trigger({ playerName: name });
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

    this.registerEvents = function() {
        this.actions.enter = new ClientAction('enter', function(data) {
            this.playerName = name;
            this.store('playerName', name);
            this.setView('menu');
        }.bind(this));
    }.bind(this);

    this.load = function(key) {
        return window.localStorage.getItem('nodeman__' + key);
    };

    this.store = function(key, value) {
        window.localStorage.setItem('nodeman__' + key, value);
    };
};

window.init = function() {
    window.socket = io();
    window.game = new Game();
    window.game.registerEvents();
    window.game.initActions();
    var storedName = window.game.load('playerName');
    if (storedName) {
        window.game.setInputValue('playerName', 'enter', storedName);
    }
};

/***
 * ClientAction class.
 * Used to trigger an action for a given event and to define a callback if the socket receives that event.
 * Use ClientAction.trigger(data); To trigger this event and send data to the connected socket.
 * @param subject The subject string
 * @param receiver The receiving callback, will be called as receiver(response) [only if success == true!];
 **/
window.ClientAction = function(subject, receiver) {
	var action = {
		subject: subject,
		count: { in: 0, out: 0 },
		trigger: function(data) {
			console.log("TRIGGERED: " + subject, data);
			this.count.out++;
			socket.emit(subject, data);
		},
		register: function(receiver) {
			var self = this;
			socket.on(subject, function(response) {
				console.log("RECEIVED: " + subject, response);
				self.count.in++;
				if (response.success)
					receiver(response.data);
				else
					Materialize.toast("FAILED: " + response.message, 4200);
			});
		}
	};
	action.register(receiver);
	return action;
};
