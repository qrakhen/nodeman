/**
 * for this you will need to run the following commands first:
 * npm install -s express
 * npm install -s socket.io
 * npm install -s sygtools
 */

// config object, should later be moved into its own .json file
const config = {
	socket: {
		keepAlive: 60 * 10, // client will be kept alive 10 minutes after a disconnect (to be able to reconnect to rooms etc)
		sessionExpire: 60 * 60 * 2 // 2 hours without activity cause the session to expire (logout)
	},
	server: {
		port: 24242
	}
};

// This "requires" all dependencies we need for out server here
const express     = require('express');
const app         = express();
const http        = require('http').Server(app);
const io          = require('socket.io')(http);
const List        = require('sygtools').List;
const uuid        = require('uuid/v4');
const md5         = require('md5');

app.use(express.static(__dirname + '/public'));

// We create a new List for the sockets (it's one of my own classes :3 very handy)
const clients = new List();
const sessions = new List();

function now() {
	return new Date().getTime();
}

// ...and now we listen for incoming connections.
// io.on "listens" to a certain event, in this case "connection",
// which then calls our callback function that has the just connected socket as parameter.
http.listen(config.server.port, () => {

    // with app.get('/', ...) we listen to the root path of our page,
    // which means that this is called as soon as a HTTP client sends a GET request to our server.
	app.get('/', (query, response) => {
		response.sendfile('./public/view/main.html');
	});

    // this listens to clients who want to join a given room,
    // providing the roomId directly within the url
    app.get('/join/:roomId', (query, response) => {
        console.log('player wants to connect to ' + query.params.roomId);
		response.sendfile('./public/view/main.html');
	});

    // this is called as soon as a new socket (socket.io) connects.
    // here we create our client and add it to a list of all connected clients.
    io.on('connection', (socket) => {
        var client = new Client(socket);
        client.registerActions();
        clients.add(client);
        socket.on('disconnect', () => {
            client.disconnect(false);
        });
        console.log('new client connected (' + client.uuid + ')');
    });
});

var Response = function(success, data) {
    var response = { success: success };
    if (typeof data === 'string') response.message = data;
    else if (data) response.data = data;
    return response;
};

var SocketAction = function(subject, socket, receiver) {
	var action = {
		subject: subject,
		count: { in: 0, out: 0 },
		trigger: function(data) {
			console.log('SocketAction.trigger(' + subject + ')', data);
			this.count.out++;
            console.log(this.count);
			socket.emit(subject, data);
		},
		register: function(receiver) {
			socket.on(subject, (data) => {
				console.log('SocketAction.received(' + subject + ')', data);
				this.count.in++;
                console.log(this.count);
				receiver(data);
			});
		}
	};
	action.register(receiver);
	return action;
};

const ANSWER_YES = 1;
const ANSWER_NO = 0;
const ANSWER_NONE = -1;

const STATE_LOBBY = 'lobby';
const STATE_PREPARE = 'prepare';
const STATE_PLAYING = 'playing';

function Session(owner, id) {
    this.id = (id ? id : uuid());
    this.owner = owner;
    this.state = STATE_LOBBY;
    this.players = [];
    this.log = [];
    this.current = {
        turnCount: 0,
        player: null,
        question: null,
        finishAttempt: false,
        answers: {}
    };
    this.config = {
        maxPlayers: 10,
        password: false
    };
    this.__identities = {};
    this.__playerIndex = 0;

    this.__writeLog = function(turnState) {
        this.log.push({
            turn: turnState.turnCount,
            player: turnState.player.playerName,
            question: turnState.question,
            finishAttempt: turnState.finishAttempt,
            answers: this.answersToPercentage(turnState.answers)
        })
    };

    this.join = function(client) {
        if (this.players.length >= this.config.maxPlayers) return 'session max player limit reached';
        if (this.players.indexOf(client) < 0) {
            this.players.push(client);
            client.__session = this;
            client.sessionId = this.id;
            client.ready = false;
        }
        return true;
    };

    this.leave = function(client) {
        if (this.players.indexOf(client) > -1) {
            this.players.splice(this.players.indexOf(client), 1);
            client.__session = null;
            client.sessionId = false;
            this.update();
            return true;
        } else return 'player not in session';
    };

    this.prepare = function() {
        if (this.state != STATE_LOBBY) return 'game already started';
        if (this.players.length < 2) return 'you can not play alone by yourself, sorry';
        this.state = STATE_PREPARE;
        this.players.forEach((client) => {
            this.__identities[client.id] = {
                submittedName: null,
                hiddenName: null
            };
        });
        this.update();
    };

    this.submitName = function(player, name) {
        if (this.state != STATE_PREPARE) return 'names can only be submitted during preparation phase';
        if (!this.__identities[player.id].submittedName)  {
            this.__identities[player.id].submittedName = name;
            var count = 0;
            for (var i in this.__identities) {
                if (this.__identities[i].submittedName != null) count++;
            }
            if (count >= this.players.length) {
                this.start();
            }
        } else return 'this player already submitted a name';
    };

    this.start = function() {
        if (this.state != STATE_PREPARE) return 'game already started';
        this.state = STATE_PLAYING;
        var names;
        var keys = Object.keys(this.__identities);
        do {
            names = this.shuffleNames();
            for (var i = 0; i < keys.length; i++) {
                for (var n = 0; n < names.length; n++) {
                    if (this.__identities[keys[i]].submittedName != names[n] &&
                        this.__identities[keys[i]].hiddenName == null) {
                        this.__identities[keys[i]].hiddenName = names[n];
                        names.splice(n, 1);
                        break;
                    } else {
                        if (n == names.length - 1) {
                            this.__identities[keys[i]].hiddenName = this.__identities[keys[i - 1]].hiddenName;
                            this.__identities[keys[i - 1]].hiddenName = names[0];
                            names.splice(0, 1);
                        }
                    }
                }
            }
        } while (names.length > 0);
        this.nextTurn();
        this.update();
    };

    this.shuffleNames = function() {
        var j, x, i;
        var names = [];
        for (var id in this.__identities)
            names.push(this.__identities[id].submittedName);
        for (i = names.length; i; i--) {
            j = Math.floor(Math.random() * i);
            x = names[i - 1];
            names[i - 1] = names[j];
            names[j] = x;
        }
        return names;
    };

    this.nextTurn = function() {
        if (this.current.turnCount > 0) {
            this.__writeLog(this.current);
            var stays = (this.answersToPercentage(this.current.answers) >= 80);
            if (!stays) (this.__playerIndex++);
            else if (this.current.finishAttempt == true) console.log('WONNED!');
        }
        var nextPlayer = this.players[this.__playerIndex % this.players.length];
        this.current.turnCount++;
        this.current.player = nextPlayer;
        this.current.question = null;
        this.current.answers = {};
        this.update();
    };

    this.submitAction = function(player, action, value, finishAttempt = false) {
        if (typeof value === undefined) return 'value is required';
        if (action == 'question') {
            if (this.current.player.id === player.id) {
                if (this.current.question === null) {
                    if (value.length < 5) return 'invalid question provided';
                    this.current.question = value;
                    this.current.finishAttempt = finishAttempt;
                } else return 'one player may only ask one question per turn';
            } else return 'this player is not currently the one asking questions';
        } else if (action == 'answer') {
            if (this.current.player.id === player.id) return 'the asking player may not answer his own question';
            if (this.current.question !== null) {
                if (value < -1 || value > 1) return 'invalid answer provided';
                this.current.answers[player.id] = value;
            } else return 'you can not answer a question that has not yet been asked';
        } else return 'unknown action requested';
        if (this.allPlayersSubmitted()) this.nextTurn();
        this.update();
    };

    this.allPlayersSubmitted = function() {
        var answered = this.current.answers.keys.length;
        return (answered + 1 >= this.players.length);
    };

    this.answersToPercentage = function(answers) {
        var c = 0;
        for (var answer in answers) {
            c += (answer < 0 ? 0 : answer * 100);
        }
        return c / answers.length;
    };

    this.update = function() {
        this.players.forEach((client) => {
            client.returnSuccess('updateSession', { session: this.getData() });
        });
    };

    this.getData = function(recursive = true, scope = this) {
        var data = {};
        for (key in scope) {
            if (key.indexOf('__') === 0) continue;
            if (typeof scope[key] === 'function') continue;
            var v = scope[key];
            if (typeof v === 'string' || typeof v === 'number') data[key] = v;
            else if (typeof v === 'object' && recursive) data[key] = (v ? this.getData(true, v) : null);
        }
        return data;
    };
};

function Client(socket) {
    this.__socket = socket;
    this.__token = md5(uuid());
    this.__actions = {};
    this.__session =  null;
    this.id = uuid();
    this.playerName = '';
    this.sessionId = false;
    this.enteredAt = 0;
	this.lastAction = 0;
    this.ready = false;

    this.response = function(name, success, rqid, data) {
        if (this.__socket) this.__socket.emit('r_' + rqid, {
            rqid: rqid,
            success: success,
            message: (typeof data === 'string' ? data : null),
            data: (typeof data === 'object' ? data : {})});
    }.bind(this);

    this.returnSuccess = function(e, data) {
        console.log('success: ' + e, data);
        if (this.__socket) this.__socket.emit(e, new Response(true, data));
    }.bind(this);

    this.returnFailure = function(e, message) {
        console.log('failure: ' + e, message);
        if (this.__socket) this.__socket.emit(e, new Response(false, message));
    }.bind(this);

    this.disconnect = function(keepAlive = false) {
        if (this.__session) this.__session.leave(this);
        this.__socket.disconnect();
        if (!keepAlive) clients.remove(this);
        else client.lastAction = now();
        console.log('client disconnected: ' + this.id + ' (keepAlive=' + keepAlive + ')');
    };

    this.addAction = function(e, receiver) {
        if (this.__socket) this.__actions[e] = new SocketAction(e, this.__socket, receiver);
    };

    this.registerActions = () => {

        this.addAction('revive', (data) => {
            var token = data.token;
            var client = clients.findOne('__token', token);
            if (client) {
				if (now() - client.lastAction > config.socket.keepAlive) {
	                client.__socket = this.__socket;
	                this.__socket = null;
	                clients.remove(this);
	                client.returnSuccess('enter', {
	                    clientData: client.getData(),
	                    token: client.__token
	                });
				} else this.returnFailure('revive', 'given socket died because to keep alive limit was passed')
            } else this.returnFailure('revive', 'no corresponding client found for given token');
        });

        this.addAction('enter', (data) => {
            var name = data.playerName;
            if (name && name.length > 0) {
                this.playerName = name;
                this.enteredAt = new Date().getTime();
                console.log('player ' + name + ' just entered!');
                this.response('enter', true, data.rqid, {
                    clientData: this.getData(),
                    token: this.__token
                });
            } else this.response('enter', false, data.rqid, 'invalid playerName provided');
        });

        this.addAction('logout', () => {
            this.disconnect();
        });

        this.addAction('chat', (data) => {
            var message = data.message;
            if (!message || message.length < 1) return;
            var target = data.target.split(':');
            var id = (target.length == 1 ? target[0] : target[1]);
            var type = 'player';
            if (target.length > 1) type = target[0];

            if (type === 'session') {
                var session = sessions.findOne('id', id);
                if (!session) return this.returnFailure('chat', 'session non-existent');
                if (session.players.indexOf(this) < 0) {
                    return this.returnFailure('chat', 'player not in target session');
                } else {
                    session.players.forEach((e) => {
                        e.returnSuccess('chat', {
                            type: type,
                            from: this.playerName,
                            message: message
                        });
                    });
                }
            }
        });

        this.addAction('createSession', (data) => {
            if (this.sessionId) return this.returnFailure('createSession', 'already in another session, leave first');
            var length = 4;
            var attempts = 10;
            var sessionId;
            do {
                sessionId = getRandomString(length++);
            } while(sessions.findOne('id', sessionId) != null && --attempts > 0);
            if (attempts <= 0) console.log('interesting: could not create session after 10 retries');
            var session = new Session(this, (attempts > 0 ? sessionId : uuid()));
            var message = session.join(this);
            if (message === true) this.returnSuccess('createSession');
            else this.returnFailure('createSession', message);
            sessions.add(session);
            session.update();
        });

        this.addAction('joinSession', (data) => {
            if (this.sessionId) return this.returnFailure('joinSession', 'already in another session, leave first');
            var session = sessions.findOne('id', data.id);
            if (!session) return this.returnFailure('joinSession', 'session ' + data.id + ' not found');
            var message = session.join(this);
            if (message === true) this.returnSuccess('joinSession');
            else this.returnFailure('joinSession', message);
            session.update();
        });

        this.addAction('updateSession', (data) => {

        });

        this.addAction('lobbyAction', (data) => {
            var type = data.type;
        });

        this.addAction('gameAction', (data) => {
            var type = data.type;
        });
    };

    this.getData = function(recursive = true) {
        var data = {};
        for (key in this) {
            if (key.indexOf('__') === 0) continue;
            if (typeof this[key] === 'function') continue;
            var v = this[key];
            if (typeof v === 'string' || typeof v === 'number') data[key] = v;
            else if (typeof v === 'object' && recursive) data[key] = (v ? v.getData() : null);
        }
        return data;
    };
}

function getRandomString(length = 4) {
    var r = '';
    var c = [ '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f' ];
    for (var i = 0; i < length; i++) r += c[Math.floor(Math.random()*c.length)];
    return r;
}

var getValue = function(object, query) {
    var split = query.split('.');
    var value = object;
    if (split.length == 1) return value;
    for (var i = 1; i < split.length; i++) {
        value = value[split[i]];
    }
    return value;
};

function testIsBest() {
    var client = new Client();
    var cliend = new Client();
    client.playerName = 'dave';
    cliend.playerName = 'jave';
    var session = new Session(client, '12345');
    session.join(cliend);
    for (var i = 0; i < 10; i++) {
        var c = new Client();
        c.playerName = getRandomString(8);
        session.join(c);
    }
    console.log(session.players);
    session.prepare();
    console.log(session.__identities);
    for (var c in session.players) {
        session.submitName(session.players[c], getRandomString(16));
    }
    console.log(session.__identities);
    session.start();
    console.log(session.current);
    session.nextTurn();
    console.log(session.current);
    session.nextTurn();
    console.log(session.current);
    session.nextTurn();
    console.log(session.current);

}

//testIsBest();
