(function() {
  var config, socket, div, image, link, listeners = {},
    pluginConfig = {
      server: window.location.protocol + "//" + window.location.host + "/",
      shareUrl: window.location.href,
      path: "/socket.io",
      multiplex: true,
      remote: true
    };

  function extend(a, b) {
    for (var i in b) {
      a[i] = b[i];
    }

    return a;
  }

  function init() {
    config = Reveal.getConfig();
    if (typeof config.remote === "object") {
      pluginConfig = extend(pluginConfig, config.remote);
    }

    if (pluginConfig.multiplex === false && pluginConfig.remote === false) {
      return;
    }

    console.log("Remote: connecting to", pluginConfig.server, pluginConfig.path);
    socket = io.connect(pluginConfig.server, { path: pluginConfig.path });

    socket.on("connect_error", function(err) { console.warn("Remote: Could not connect to socket.io-remote server", err); });
    socket.on("reconnect_error", function(err) { console.warn("Remote: Could not reconnect to socket.io-remote server", err); });
    socket.on("connect_timeout", function() { console.warn("Remote: Could not connect to socket.io-remote server (timeout)"); });
    socket.on("reconnect_failed", function(err) { console.warn("Remote: Could not reconnect to socket.io-remote server - this was the last try, giving up", err); });
    socket.on("error", function(err) { console.warn("Remote: Unknown error in socket.io", err); });

    socket.on("connect", onConnect);
    socket.on("init", msgInit);
    socket.on("client_connected", msgClientConnected);

    if (pluginConfig.multiplex && config.remoteMultiplexId !== undefined) {
      socket.on("multiplex", msgSync);

      Reveal.configure({
		  controls: false,
		  keyboard: false,
		  touch: false,
		  help: false
	  });
    }

    if (pluginConfig.remote) {
      socket.on("command", msgCommand);

      on("next", Reveal.next);
      on("prev", Reveal.prev);
      on("up", Reveal.up);
      on("down", Reveal.down);
      on("left", Reveal.left);
      on("right", Reveal.right);
      on("overview", Reveal.toggleOverview);
      on("pause", Reveal.togglePause);
      on("autoslide", Reveal.toggleAutoSlide);
    }

    createPopup();

    console.info("Remote: Starting connection");
  }

  function onConnect() {
    console.info("Remote: Connected - sending welcome message");

    if (config.remoteMultiplexId === undefined) {
      var data = {
        type: "master",
        shareUrl: pluginConfig.shareUrl
      };

      if (window.localStorage) {
        var hashes = JSON.parse(window.localStorage.getItem("presentations") || "{}"),
          hashUrl = pluginConfig.shareUrl.replace(/#.*/, "");
        if (hashes.hasOwnProperty(hashUrl)) {
          data.hash = hashes[hashUrl].hash;
          data.remoteId = hashes[hashUrl].remoteId;
          data.multiplexId = hashes[hashUrl].multiplexId;
        }
      }

      socket.emit("start", data);
    } else {
      socket.emit("start", {
        type: "slave",
        id: config.remoteMultiplexId
      });
    }
  }

  function createPopup() {
    var body = document.getElementsByTagName("body")[0],
      inner = document.createElement("div");

    link = document.createElement("a");
    image = document.createElement("img");
    div = document.createElement("div");

    div.class = "remote-qr-overlay";
    div.style.display = "none";
    div.style.position = "fixed";
    div.style.left = 0;
    div.style.top = 0;
    div.style.bottom = 0;
    div.style.right = 0;
    div.style.zIndex = 1000;
    div.style.alignItems = "center";
    div.style.justifyContent = "center";

    inner.style.padding = "50px";
    inner.style.borderRadius = "50px";
    inner.style.textAlign = "center";
    inner.style.background = "rgba(255, 255, 255, .9)";

    link.target = "_blank";
    link.style.fontSize = "200%";

    image.style.border = "20px solid white";

    div.appendChild(inner);

    inner.appendChild(link);
    link.appendChild(image);
    link.appendChild(document.createElement("br"));
    link.appendChild(document.createElement("br"));
    link.appendChild(document.createTextNode("Or share this link"));
    body.appendChild(div);
  }

  function togglePopup(imageData, url) {
    if (link.href === url && div.style.display !== "none") {
      div.style.display = "none";
    } else {
      image.src = imageData;
      link.href = url;
      div.style.display = "flex";
    }
  };

  function msgInit(data) {
    if (pluginConfig.remote) {
      Reveal.addKeyBinding({ keyCode: 82, key: "R", description: "Show remote control url" }, function() {
        togglePopup(data.remoteImage, data.remoteUrl);
      });

      Reveal.addEventListener("overviewshown", sendRemoteState);
      Reveal.addEventListener("overviewhidden", sendRemoteState);
      Reveal.addEventListener("paused", sendRemoteState);
      Reveal.addEventListener("resumed", sendRemoteState);
      Reveal.addEventListener("autoslidepaused", sendRemoteState);
      Reveal.addEventListener("autoslideresumed", sendRemoteState);
      Reveal.addEventListener("overviewshown", sendRemoteState);
      Reveal.addEventListener("overviewhidden", sendRemoteState);
      Reveal.addEventListener("slidechanged", sendRemoteFullState);

      sendRemoteFullState();
    }

    if (pluginConfig.multiplex) {
      Reveal.addKeyBinding({ keyCode: 65, key: "A", description: "Show share url" }, function() {
        togglePopup(data.multiplexImage, data.multiplexUrl);
      });

      window.addEventListener("load", sendMultiplexState);
      Reveal.addEventListener("slidechanged", sendMultiplexState);
      Reveal.addEventListener("fragmentshown", sendMultiplexState);
      Reveal.addEventListener("fragmenthidden", sendMultiplexState);
      Reveal.addEventListener("overviewhidden", sendMultiplexState);
      Reveal.addEventListener("overviewshown", sendMultiplexState);
      Reveal.addEventListener("paused", sendMultiplexState);
      Reveal.addEventListener("resumed", sendMultiplexState);

      sendMultiplexState();
    }

    if (window.localStorage) {
      var hashes = JSON.parse(window.localStorage.getItem("presentations") || "{}"),
        hashUrl = pluginConfig.shareUrl.replace(/#.*/, "");
      hashes[hashUrl] = {
        hash: data.hash,
        remoteId: data.remoteId,
        multiplexId: data.multiplexId
      };
      window.localStorage.setItem("presentations", JSON.stringify(hashes));
    }
  }

  function sendRemoteFullState() {
    socket.emit("notes_changed", {
      text: Reveal.getSlideNotes()
    });
    sendRemoteState();
  }

  function sendRemoteState() {
    socket.emit("state_changed", {
      isFirstSlide: Reveal.isFirstSlide(),
      isLastSlide: Reveal.isLastSlide(),
      isOverview: Reveal.isOverview(),
      isPaused: Reveal.isPaused(),
      isAutoSliding: Reveal.isAutoSliding(),
      progress: Reveal.getProgress(),
      slideCount: Reveal.getTotalSlides(),
      indices: Reveal.getIndices(),
      availableRoutes: Reveal.availableRoutes(),
      autoslide: (typeof config.autoSlide === "number" && config.autoSlide > 0) &&
        (typeof config.autoSlideStoppable !== "boolean" || !config.autoSlideStoppable)
    });
  }


  function sendMultiplexState() {
    socket.emit("multiplex", { state: Reveal.getState() });
  }

  function msgClientConnected() {
    div.style.display = "none";
  }

  function msgSync(data) {
    Reveal.setState(data.state);
  }

  function on(cmd, fn) {
    listeners[cmd] = fn;
  }

  function msgCommand(data) {
    var cmd = data.command;
    if (listeners.hasOwnProperty(cmd)) {
      listeners[cmd]();
    } else {
      console.log("Remote: No listener registered for", cmd, Object.keys(listeners));
    }
  }

  init();
})();