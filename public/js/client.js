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
        this.actions.createRoom.trigger();
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
        this.actions.enter = new SocketAction('enter', function(data) {
            this.playerName = data.playerName;
            this.store('playerName', data.playerName);
            this.setView('menu');
        }.bind(this));
        this.actions.createRoom = new SocketAction('createRoom', function(data) {
            $('input.action[action="createRoom"]').addClass('disabled');
            $('input[key="inviteLink"]').removeClass('hidden');
            var url = window.location.origin + '/join/' + data.roomId;
            this.setInputValue('inviteLink', 'menu', url);
        }.bind(this));
    }.bind(this);

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
    window.game.registerEvents();
    window.game.initActions();
    var storedName = window.game.load('playerName');
    if (storedName) {
        window.game.setInputValue('playerName', 'enter', storedName);
    }
};

/***
 * SocketAction class.
 * Used to trigger an action for a given event and to define a callback if the socket receives that event.
 * Use SocketAction.trigger(data); To trigger this event and send data to the connected socket.
 * @param subject The subject string
 * @param receiver The receiving callback, will be called as receiver(response) [only if success == true!];
 **/
window.SocketAction = function(subject, receiver) {
	var action = {
		subject: subject,
		count: { in: 0, out: 0 },
		trigger: function(data) {
			console.log('SocketAction.trigger(' + subject + ')', data);
			this.count.out++;
			socket.emit(subject, data);
		},
		register: function(receiver) {
			socket.on(subject, function(response) {
				console.log('SocketAction.received(' + subject + ')', response);
				this.count.in++;
				if (response.success) receiver(response.data);
				else Materialize.toast(this.subject + ', error: ' + response.message, 4200);
			}.bind(this));
		}
	};
	action.register(receiver);
	return action;
};
