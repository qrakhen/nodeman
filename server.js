/**
 * for this you will need to run the following commands first:
 * npm install -s express
 * npm install -s socket.io
 * npm install -s sygtools
 */

// This "requires" all dependencies we need for out server here
var express     = require('express');
var app         = express();
var http        = require('http').Server(app);
var io          = require('socket.io')(http);
var List        = require('sygtools').List;

app.use(express.static(__dirname + '/public'));

// We create a new List for the sockets (it's one of my own classes :3 very handy)
var clients = new List();

// ...and now we listen for incoming connections.
// io.on "listens" to a certain event, in this case "connection",
// which then calls our callback function that has the just connected socket as parameter.
http.listen(24242, function() {
	app.get('/', function(query, response) {
		response.sendfile('./public/view/main.html');
	});

    app.get('/join/:roomId', function(query, response) {
        console.log('player wants to connect to ' + query.params.roomId);
		response.sendfile('./public/view/main.html');
	});

    io.on('connection', function(socket) {
        console.log('new socket connected');
        var client = new Client(socket);
        client.registerEvents();
        clients.add(clients);
    });
});

var Response = function(success, data) {
    var response = { success: success };
    if (typeof data === 'string') response.message = data;
    else if (data) response.data = data;
    return response;
};

function Client(socket) {
    this.socket = socket;
    this.playerName = '';
    this.enteredAt = 0;

    this.socket.returnSuccess = function(e, data) {
        this.emit(e, new Response(true, data));
    };

    this.socket.returnFailure = function(e, message) {
        this.emit(e, new Response(false, message));
    }

    this.registerEvents = function() {
        this.socket.on('enter', (data) => {
            var name = data.playerName;
            if (name && name.length > 0) {
                this.playerName = name;
                console.log('player ' + name + ' just entered!');
                this.socket.returnSuccess('enter');
            } else {
                this.socket.returnFailure('enter', 'invalid playerName provided');
            }
        });
    }.bind(this);
}
