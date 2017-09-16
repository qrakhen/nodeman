function Game() {
    this.actions = {};
    this.clientData = {};

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
            $(e).text(this.clientData[key] ? this.clientData[key] : key);
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
            this.clientData = data.clientData;
            this.store('clientData', data.clientData);
            this.store('authToken', data.token);
            this.setView('menu');
        }.bind(this));
        this.actions.createRoom = new SocketAction('createRoom', function(data) {
            this.clientData.roomId = data.roomId;
            $('input.action[action="createRoom"]').addClass('disabled');
            $('input[key="inviteLink"]').removeClass('hidden');
            $('view[name="menu"] div.drawer').slideUp(720);
            var url = window.location.origin + '/join/' + data.roomId;
            this.setInputValue('inviteLink', 'menu', url);
        }.bind(this));
    }.bind(this);

    this.load = function(key) {
        var split = key.split('.');
        var value = window.localStorage.getItem(split[0]);
        if (split.length > 1) {
            prev = JSON.parse(value);
            for (var i = 1; i < split.length; i++) {
                prev = prev[split[i]];
            }
            value = prev;
        }
        if (!value) return null;
        else if (value.charAt(0) === '{') return JSON.parse(value);
        else return value;
    };

    this.store = function(key, value) {
        if (typeof value === 'object') value = JSON.stringify(value);
        window.localStorage.setItem(key, value);
    };
};

window.init = function() {
    window.socket = io();
    window.game = new Game();
    window.game.registerEvents();
    window.game.initActions();
    window.socket.on('connect', function() {
        // try to revive connection if we have a previous authToken stored
        // this will have one of the following results:
        // a) revive the client and continue where it left, i.e. in a game or lobby room
        // b) resume the session, which does nothing at the moment because we have no accounts or anything
        // c) fail, when there was nothing to resume or revive.
        var authToken = window.game.load('authToken');
        if (authToken) setTimeout(function() {
            window.socket.emit('revive', { token: authToken });
        }, 500); // 500ms timeout so we can be sure the server has the corresponding listening callback defined at this point

        // set the name input value to the stored playerName to be extra user-friendly
        var storedName = window.game.load('clientData.playerName');
        if (storedName) window.game.setInputValue('playerName', 'enter', storedName);
    });
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
