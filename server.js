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
			client.lastAction = now();
            console.log('client disconnected (' + client.uuid + ')');
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

function Session(owner, id) {
    this.id = (id ? id : uuid());
    this.owner = owner;
    this.state = 'lobby';
    this.players = new List();
    this.players.add(owner);
    this.config = {
        maxPlayers: 10,
        password: false
    };

    this.join = function(client) {
        if (this.players.getAll().length >= this.config.maxPlayers) return 'session max player limit reached';
        if (this.players.findOne('id', client.id) !== null) return 'player already in this session';
        this.players.add(client);
        return true;
    };

    this.leave = function(client) {
    };

    this.start = function() {

    };

    this.update = function() {
        this.players.data.forEach((client) => {
            if (typeof client !== 'object') return;
            client.returnSuccess('updateSession', { session: this.getState() });
        });
    };

    this.getState = function() {
        var data = this.getData();
        data.players = data.players.data;
        delete data.config.password;
        return data;
    };
};

function Client(socket) {
    this.__socket = socket;
    this.__token = md5(uuid());
    this.__actions = {};
    this.id = uuid();
    this.playerName = '';
    this.sessionId = false;
    this.enteredAt = 0;
	this.lastAction = 0;

    this.returnSuccess = function(e, data) {
        console.log('success: ' + e, data);
        this.emit(e, new Response(true, data));
    }.bind(this.__socket);

    this.returnFailure = function(e, message) {
        console.log('failure: ' + e, message);
        this.emit(e, new Response(false, message));
    }.bind(this.__socket);

    this.addAction = function(e, receiver) {
        this.__actions[e] = new SocketAction(e, this.__socket, receiver);
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
                this.returnSuccess('enter', {
                    clientData: this.getData(),
                    token: this.__token
                });
            } else this.returnFailure('enter', 'invalid playerName provided');
        });

        this.addAction('createSession', (data) => {
            if (this.sessionId) return this.returnFailure('createSession', 'already in another session, leave first');
            var length = 3;
            var attempts = 10;
            var sessionId;
            do {
                sessionId = '';
                length++;
                var c = [ '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f' ];
                for (var i = 0; i < length; i++) sessionId += c[Math.floor(Math.random()*c.length)];
            } while(sessions.findOne('id', sessionId) != null && --attempts > 0);
            if (attempts <= 0) console.log('interesting: could not create session after 10 retries');
            var session = new Session(this, (attempts > 0 ? sessionId : uuid()));
            console.log('new session ' + session.id + ' created!');
            this.returnSuccess('createSession');
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
    };
}

Object.prototype.getData = function(recursive = true) {
    var data = {};
    for (key in this) {
        if (key.indexOf('__') === 0) continue;
        var v = this[key];
        if (typeof v === 'string' || typeof v === 'number') data[key] = v;
        else if (typeof v === 'object' && recursive) data[key] = (v ? v.getData() : null);
    }
    return data;
};

Object.prototype.getValue = function(query) {
    var split = query.split('.');
    var value = this;
    if (split.length == 1) return value;
    for (var i = 1; i < split.length; i++) {
        value = value[split[i]];
    }
    return value;
};
