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
var sockets = new List();

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
        console.log('new socket connected:' + socket);
        sockets.add(socket);
    });
});
