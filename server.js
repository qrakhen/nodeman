/**
 * for this you will need to run the following commands first:
 * npm install -s express
 * npm install -s socket.io
 * npm install -s sygtools
 */

// This "requires" all dependencies we need for out server here
const express     = require('express');
const app         = express();
const http        = require('http').Server(app);
const io          = require('socket.io')(http);
const List        = require('sygtools').List;
const uuid        = require('uuid/v4');

app.use(express.static(__dirname + '/public'));

// We create a new List for the sockets (it's one of my own classes :3 very handy)
const clients = new List();

// ...and now we listen for incoming connections.
// io.on "listens" to a certain event, in this case "connection",
// which then calls our callback function that has the just connected socket as parameter.
http.listen(24242, () => {

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
        clients.add(clients);
        socket.emit('welcome', { uuid: client.uuid });
        socket.on('disconnect', () => {
            clients.remove(client);
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

function Client(socket) {
    this.uuid = uuid();
    this.socket = socket;
    this.actions = {};
    this.playerName = '';
    this.currentRoom = null;
    this.enteredAt = 0;

    this.socket.returnSuccess = function(e, data) {
        this.emit(e, new Response(true, data));
    };

    this.socket.returnFailure = function(e, message) {
        this.emit(e, new Response(false, message));
    };

    this.registerActions = () => {
        this.actions.enter = new SocketAction('enter', this.socket, (data) => {
            var name = data.playerName;
            if (name && name.length > 0) {
                this.playerName = name;
                this.enteredAt = new Date().getTime();
                console.log('player ' + name + ' just entered!');
                this.socket.returnSuccess('enter', {
                    playerName: this.playerName,
                    enteredAt: this.enteredAt
                });
            } else {
                this.socket.returnFailure('enter', 'invalid playerName provided');
            }
        });
        this.actions.createRoom = new SocketAction('createRoom', this.socket, (data) => {
            if (this.currentRoom !== null) return this.socket.returnFailure('createRoom', 'already in another room, leave first');
            var roomId = '';
            var c = [ '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f' ];
            for (var i = 0; i < 8; i++) roomId += c[Math.floor(Math.random()*c.length)];
            console.log('new room ' + roomId + ' created!');
            this.socket.returnSuccess('createRoom', { roomId: roomId });
        });
    };
}
