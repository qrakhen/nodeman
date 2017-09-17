function Game() {
    this.actions = {};
    this.state = {};

    this.setView = function(view) {
        // disable all active views.
        $('view.active').removeClass('active');
        // activate only the desired view by selecting view[name="viewName"] and adding the 'active' class.
        $('view[name="' + view + '"]').addClass('active');
        this.updateViewVars();
    }.bind(this);

    this.updateViewVars = function() {
        // look for all <v>-tags within the active view,
        // and replace their text with the corresponding variable using their key.
        $('view.active v').each(function(i, e) {
            var key = $(e).attr('key');
            if (!key) key = $(e).text();
            $(e).attr('key', key);
            var val = getObjectValue(this.state, key);
            $(e).text(val ? val : key);
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
            new window.SocketRequest()
                .send('enter', { playerName: name})
                .success(function(data) {
                    this.state = data.clientData;
                    this.store('state', data.clientData);
                    this.store('authToken', data.token);
                    var path = window.location.pathname;
                    if (path.indexOf('join') > -1) {
                        var id = /join\/([^\/]+)\/?/g.exec(path)[1];
                        this.actions.joinSession.trigger({ id: id });
                    } else {
                        this.setView('menu');
                    }
                }.bind(this))
                .failure(function(message) {
                    alert(message);
                });
        } else console.error('invalid name');
    }.bind(this);

    this.createSession = function() {
        this.actions.createSession.trigger();
    }.bind(this);

    this.logout = function() {
        window.localStorage.removeItem('authToken');
        window.socket.emit('logout');
        this.setView('enter');
        window.location.reload();
    }.bind(this);

    this.initActions = function() {
        var actions = $('.action');
        actions.each(function(i, e) {
            $(e).on('click', function() {
                var fn = window.game[$(e).attr('action')];
                if (typeof fn === 'function') fn();
                else console.error($(e).attr('action') + '() is not a game function.');
            });
        });
    };

    this.addAction = function(e, receiver, error) {
        this.actions[e] = new SocketAction(e, receiver, error);
    };

    this.registerEvents = function() {

        this.addAction('enter', function(data) {

        }.bind(this));

        this.addAction('chat', function(data) {
            var own = (data.from == this.state.playerName);
            var html = '<p class="message' + (own ? ' own' : '') + '"><span class="from">' +
                data.from + '</span><span class="content">' + data.message + '</span></p>';
            if (data.type === 'session') {
                $('#lobbyChat div.history').append(html);
                $('#lobbyChat div.scroll').scrollTop(999999);
            } else if (data.type === 'alert') {
                // xD Trollolololololol
                window.alert(data.message);
            }
        }.bind(this));

        this.addAction('joinSession', function(data) {}, function(error) {
            window.location.pathname = '/';
            this.setView('menu');
        }.bind(this));

        this.addAction('createSession', function(data) {
            $('input.action[action="createRoom"]').addClass('disabled');
            $('view[name="menu"]').slideUp(720);
        }.bind(this));

        this.addAction('lobbyAction', function(data) {

        });

        this.addAction('gameAction', function(data) {

        });

        this.addAction('updateSession', function(data) {
            this.state.session = data.session;
            if (data.session.state == 'lobby') {
                this.setView('lobby');
                var url = window.location.origin + '/join/' + data.session.id;
                this.setInputValue('inviteLink', 'lobby', url);
                window.renderTemplate('playerList', data.session.players);
            } else {
                this.setView('game');
            }
            this.updateViewVars();
        }.bind(this));
    }.bind(this);

    this.load = function(key) {
        var split = key.split('.');
        var value = window.localStorage.getItem(split[0]);
        if (!value) return null;
        if (value.charAt(0) === '{') value = JSON.parse(value);
        if (split.length > 1) return getObjectValue(value, key.substr(key.indexOf('.') + 1));
        else return value;
    }.bind(this);

    this.store = function(key, value) {
        if (typeof value === 'object') value = JSON.stringify(value);
        window.localStorage.setItem(key, value);
    }.bind(this);
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
        var authToken = false; //window.game.load('authToken');
        if (authToken) setTimeout(function() {
            window.socket.emit('revive', { token: authToken });
        }, 500); // 500ms timeout so we can be sure the server has the corresponding listening callback defined at this point

        // set the name input value to the stored playerName to be extra user-friendly
        var storedName = window.game.load('state.playerName');
        if (storedName) window.game.setInputValue('playerName', 'enter', storedName);
    });

    $('#lobbyChat').on('keypress', function(e) {
        if ($('#lobbyChat input').val().length < 1) return;
        var key = e.which || e.keyCode;
        if (key === 13) {
            if (window.game.state.session) {
                window.game.actions.chat.trigger({
                    target: 'session:' + window.game.state.session.id,
                    message: $('#lobbyChat input').val()
                });
                $('#lobbyChat input').val('');
            }
        }
    });
};

/***
 * SocketAction class.
 * Used to trigger an action for a given event and to define a callback if the socket receives that event.
 * Use SocketAction.trigger(data); To trigger this event and send data to the connected socket.
 * @param subject The subject string
 * @param receiver The receiving callback, will be called as receiver(response) [only if success == true!];
 **/
window.SocketAction = function(subject, receiver, error) {
	var action = {
		subject: subject,
		count: { in: 0, out: 0 },
        pending: {},
		trigger: function(data) {
			console.log('SocketAction.trigger(' + subject + ')', data);
			this.count.out++;
			socket.emit(subject, data);
		},
        request: function(data) {
			this.count.out++;
            data.rqid = new Date().getTime();
            var r = {
                success: function(fn) {
                    this.onSuccess = fn;
                },
                failure: function(fn) {
                    this.onFailure = fn;
                }
            };
            this.pending[data.rqid] = r;
            socket.emit(subject, data);
            console.log('SocketAction.request(' + subject + ')', data);
            return r;
        },
		register: function(receiver, error) {
			socket.on(subject, function(response) {
				console.log('SocketAction.received(' + subject + ')', response);
				this.count.in++;
                if (response.rqid && this.pending[response.rqid]) {
                    console.log('override: SocketAction.pending[' + response.rqid + ']', response);
                    var rqcb = this.pending[response.rqid];
                    if (rqcb.onSuccess) receiver = rqcb.onSuccess;
                    if (rqcb.onFailure) error = rqcb.onFailure;
                    delete this.pending[response.rqid];
                }
				if (response.success) receiver(response.data);
                else {
                    Materialize.toast(this.subject + '.error: ' + response.message, 4200);
                    if (typeof error === 'function') error(response.message);
                }
			}.bind(this));
		}
	};
	action.register(receiver);
	return action;
};

window.SocketRequest = function() {
    this.pending = {};
    this.send = function(subject, data) {
        var rqid = new Date().getTime();
        data.rqid = rqid;
        window.socket.on(subject, function(data) {
            if (data.rqid) return;
            var provider  = this.pending[this.rqid];
            if (!provider) return console.log(subject + ' responses without corresponding provider detected', data);
            if (typeof provider.onReturned === 'function') provider.onReturned(data);
            if (!data.success || data.success === true) {
                if (typeof provider.onSuccess === 'function') provider.onSuccess(data);
            } else {
                if (typeof provider.onFailure === 'function') provider.onFailure(data);
            }
            delete this.pending[response.rqid];
        }.bind(this));
        var callbackProvider = {
            done: function(fn) {
                this.onReturned = fn;
                return this;
            },
            success: function(fn) {
                this.onSuccess = fn;
                return this;
            },
            failure: function(fn) {
                this.onFailure = fn;
                return this;
            }
        };
        this.pending[rqid] = callbackProvider;
        window.socket.emit(subject, data);

        return callbackProvider;
    };
};

window.getObjectValue = function(object, query) {
    var split = query.split('.');
    var value = object[split[0]];
    if (split.length < 2) return value;
    for (var i = 1; i < split.length; i++) {
        value = value[split[i]];
        if (!value) return value;
    }
    return value;
};

window.renderTemplate = function(tpl, data) {
    // build the CSS selectors for the template anchor and script
    var anchorSelect = 'div.template[tpl="' + tpl + '"]';
    var scriptSelect = 'script.template[name="' + tpl + '"]';
    // apparently, ractive NEEDS ids for selection, so we just generate them here and set them during runtime
    var anchorId = 'tplAnchor-' + tpl;
    var scriptId = 'tplScript-' + tpl;
    $(anchorSelect).attr('id', anchorId);
    $(scriptSelect).attr('id', scriptId);
    // flush the anchor, we want to a full render, no partial kiddie stuff
    $(anchorSelect).empty();
    var result = new Ractive({
        el: '#' + anchorId,
        template: '#' + scriptId,
        data: { data: data }
    });
};
