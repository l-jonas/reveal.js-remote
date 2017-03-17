var
  express = require('express'),
  uuid = require('uuid/v4'),
  qr = require('qr-image'),
  commandLineArgs = require('command-line-args'),
  commandLineUsage = require('command-line-usage'),
  socketIo = require('socket.io'),
  uuid2channels = {},
  args, server,
  app = express();


server = createServer(parseArgs(), app);

io = socketIo.listen(server, {path: '/s'});

app.use('/', express.static(__dirname + '/clients'));

io.sockets.on('connection', function (socket) {
  socket.once('start', function (data) {
    if (data.type === "slides") {
      initSlides(socket, data);
    } else if (data.type === "remote") {
      initRemote(socket, data);
    }
  });
});

function initSlides(socket, initialData) {
  var id = uuid();
  uuid2channels[id] = true;

  var url = initialData.url + "?" + id,
    image = qr.imageSync(url),
    base64 = new Buffer(image).toString('base64');

  socket.join(id);

  socket.emit('init', {
    id: id,
    url: url,
    image: "data:image/png;base64," + base64
  });

  socket.on('disconnect', function () {
    delete uuid2channels[id];
  });

  socket.on('state_changed', function (data) {
    socket.to(id).emit('state_changed', data);
  });

  socket.on('notes_changed', function (data) {
    socket.to(id).emit('notes_changed', data);
  });
}

function initRemote(socket, initialData) {
  var id = initialData.id;
  if (!uuid2channels.hasOwnProperty(id)) {
    return;
  }

  socket.join(id);
  socket.to(id).emit('client_connected', {});

  socket.on('command', function (data) {
    if (typeof data !== 'undefined' && typeof data.command === 'string') {
      socket.to(id).emit('command', {
        command: data.command
      });
    }
  });
}

function createServer(args, app) {
  var server, port = 8080;

  if (args.port > 0 && args.port <= 65535) {
    port = args.port;
  } else {
    console.warn("Port must be a positive integer");
    process.exit(1);
  }

  if (args.ssl !== null) {
    try {
      server = require('https').createServer({pfx: require('fs').readFileSync(args.ssl)}, app);
    } catch (e) {
      console.warn("Could not start HTTPS server", e.message);
      process.exit(1)
    }
  } else {
    server = require('http').createServer(app);
  }

  server.listen(port);

  return server;
}


function parseArgs() {
  var args,
    optionList = [
      {name: 'port', alias: 'p', type: Number, defaultValue: 8080},
      {name: 'ssl', alias: 's', defaultValue: null},
      {name: 'help', alias: 'h'}
    ];

  try {
    args = commandLineArgs(optionList);
  } catch (e) {
    console.warn("Could not process arguments", e.message);
    process.exit(1);
  }

  if (typeof args.help !== 'undefined') {
    console.warn(commandLineUsage(
      {
        header: 'Options',
        optionList: optionList
      }));
    process.exit(1);
  }

  return args;
}
