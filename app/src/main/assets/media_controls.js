// The media keys of the remote and the video mode (MediaFrames.kt), for both engines: WebView runs it in every
// frame (webview_media.js starts it), GeckoView in the content script of its extension (the build copies it
// there). tvBroWatchMedia(send) reports the state of the media of the frame that the commands go to as a JSON
// string to send ({media: false} when it has none) and returns the function that runs a command; the app sends
// each command to the frame that shows a video in fullscreen, else to the one that plays. Without send (old
// WebViews: the main frame only) it reports nothing and only runs commands. With frames (WebView, which runs no
// scripts in frames of about:blank and about:srcdoc, where many players write themselves) the media of the
// same-origin frames inside that have no scripts of the app count as media of this frame.
function tvBroWatchMedia(send, frames) {
    var lastPlayed = null;
    var lastState = '';
    // the media that met encrypted data: the page plays it with DRM, often before it sets its mediaKeys
    var encrypted = typeof WeakSet == 'function' ? new WeakSet() : null;

    function isPlaying(m) {
        return !m.paused && !m.ended;
    }

    // the window of a frame element that has no scripts of the app (they set tvBroMediaCommand), null otherwise
    function scriptlessWindow(frame) {
        try {
            var w = frame.contentWindow;
            return w && w.document && !w.tvBroMediaCommand ? w : null;
        } catch (e) {
            return null; // another origin: its own scripts run there
        }
    }

    // those windows inside this one, also nested in each other
    function childWindows() {
        var result = [];
        if (!frames) return result;
        (function walk(doc) {
            var list = doc.querySelectorAll('iframe, frame');
            for (var i = 0; i < list.length; i++) {
                var w = scriptlessWindow(list[i]);
                if (!w) continue;
                result.push(w);
                walk(w.document);
            }
        })(document);
        return result;
    }

    function fullscreenIn(doc) {
        var e = doc.fullscreenElement || doc.webkitFullscreenElement;
        if (!e) return null;
        if (e.tagName != 'IFRAME' && e.tagName != 'FRAME') return e;
        // an ancestor frame sees the iframe as its fullscreen element: the frame inside holds the media, and
        // tells it itself unless it has no scripts
        var w = frames && scriptlessWindow(e);
        return w ? fullscreenIn(w.document) : null;
    }

    function fullscreenElement() {
        return fullscreenIn(document);
    }

    // (by the tag: media of another frame are not instances of the classes of this one)
    function mediaIn(root) {
        if (root.tagName == 'VIDEO' || root.tagName == 'AUDIO') return [root];
        return Array.prototype.slice.call(root.querySelectorAll('video, audio'));
    }

    function allMedia() {
        return childWindows().reduce(function(list, w) {
            return list.concat(mediaIn(w.document));
        }, mediaIn(document));
    }

    function area(m) {
        var r = m.getBoundingClientRect();
        return r.width * r.height;
    }

    // the playing media, else the one played last, else the largest
    function pick(list) {
        if (!list.length) return null;
        var playing = list.filter(isPlaying);
        if (playing.length) {
            list = playing;
        } else if (lastPlayed && list.indexOf(lastPlayed) >= 0) {
            return lastPlayed;
        }
        return list.reduce(function(a, b) { return area(b) > area(a) ? b : a; });
    }

    function target() {
        var fs = fullscreenElement();
        var m = fs && pick(mediaIn(fs));
        if (m) return m;
        if (lastPlayed && lastPlayed.isConnected && isPlaying(lastPlayed)) return lastPlayed;
        return pick(allMedia()) || (lastPlayed && lastPlayed.isConnected ? lastPlayed : null);
    }

    // the document whose fullscreen element is shown: this one, or an ancestor frame's
    function fullscreenDoc() {
        var d = document;
        while (d) {
            if (d.fullscreenElement || d.webkitFullscreenElement) return d;
            var w = d.defaultView;
            if (!w || w === w.top) return null;
            try {
                d = w.parent.document;
            } catch (e) {
                return null; // another origin: its own scripts run there
            }
        }
        return null;
    }

    function requestFullscreen(el) {
        var fn = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen ||
            el.mozRequestFullScreen || el.msRequestFullscreen;
        if (!fn) return false;
        try {
            var p = fn.call(el);
            if (p && p.catch) p.catch(function() {});
        } catch (e) {
            return false;
        }
        return true;
    }

    function exitFullscreen(d) {
        var fn = d.exitFullscreen || d.webkitExitFullscreen || d.webkitCancelFullScreen ||
            d.mozCancelFullScreen || d.msExitFullscreen;
        if (!fn) return;
        try {
            var p = fn.call(d);
            if (p && p.catch) p.catch(function() {});
        } catch (e) {}
    }

    // the box of the page that shows the video with its controls: the video, or the elements around it
    // that fill the screen (the video alone would come without the bar and the buttons of its player)
    function playerBox(m) {
        var box = m;
        var vw = window.innerWidth;
        var vh = window.innerHeight;
        for (var el = m; el.parentElement && el.parentElement !== document.body;) {
            var r = el.parentElement.getBoundingClientRect();
            if (r.width < vw * 0.5 || r.height < vh * 0.5) break;
            box = el.parentElement;
            el = box;
        }
        return box;
    }

    // fullscreen, or back from it
    function toggleFullscreen(m) {
        var d = fullscreenDoc();
        if (d) {
            exitFullscreen(d);
            return;
        }
        if (!m) return;
        if (!requestFullscreen(playerBox(m))) requestFullscreen(document.documentElement);
    }

    // a page may refuse to play: its promise is rejected
    function play(m) {
        var p = m.play();
        if (p && p.catch) p.catch(function() {});
    }

    function seek(m, position) {
        var end = isFinite(m.duration) ? m.duration : Infinity;
        m.currentTime = Math.max(0, Math.min(end, position));
    }

    // a command, or a command and its number of seconds: 'seekTo:42.5', 'seekBy:-10'
    function command(command) {
        var m = target();
        var parts = String(command).split(':');
        if (!m) {
            // no media: 'fullscreen' still leaves the fullscreen view (a stream that ended, say)
            if (parts[0] == 'fullscreen') toggleFullscreen(null);
            return;
        }
        var seconds = parseFloat(parts[1]);
        switch (parts[0]) {
            case 'toggle':
                if (m.paused || m.ended) play(m); else m.pause();
                break;
            case 'play':
                play(m);
                break;
            case 'pause':
                m.pause();
                break;
            case 'stop':
                m.pause();
                m.currentTime = 0;
                break;
            case 'rewind':
                seek(m, m.currentTime - 10);
                break;
            case 'forward':
                seek(m, m.currentTime + 10);
                break;
            case 'seekTo':
                if (isFinite(seconds)) seek(m, seconds);
                break;
            case 'seekBy':
                if (isFinite(seconds)) seek(m, m.currentTime + seconds);
                break;
            case 'fullscreen':
                toggleFullscreen(m);
                break;
        }
    }

    function post(state) {
        if (state == lastState) return;
        lastState = state;
        send(state);
    }

    // the media the commands go to: whether it plays, where, how long it is (null: endless or unknown)
    function report() {
        var m = target();
        if (!m) {
            post(JSON.stringify({media: false}));
            return;
        }
        var fs = fullscreenElement();
        post(JSON.stringify({
            media: true,
            playing: isPlaying(m),
            fullscreen: !!(fs && (fs == m || fs.contains(m))),
            position: m.currentTime,
            duration: isFinite(m.duration) ? m.duration : null,
            // a live stream has no end (an unknown duration is NaN)
            live: m.duration === Infinity,
            // the position stands still while the media waits for data
            rate: isPlaying(m) && m.readyState > 2 ? m.playbackRate : 0,
            // no sound: previews and ads mostly play muted
            muted: m.muted || m.volume === 0,
            // what it plays: its address, or a stream of the page (Media Source Extensions)
            src: /^https?:/i.test(m.currentSrc) ? m.currentSrc : null,
            mse: /^blob:/i.test(m.currentSrc),
            // another address is another video (an ad, then the film)
            source: m.currentSrc || null,
            // protected (Encrypted Media Extensions): only the page can play it
            drm: !!m.mediaKeys || !!(encrypted && encrypted.has(m))
        }));
    }

    // the app moves the position on by itself while the media plays: this corrects it now and then
    var lastTimeReport = 0;
    function reportTime() {
        var now = Date.now();
        if (now - lastTimeReport < 1000) return;
        lastTimeReport = now;
        report();
    }

    // the center of the target media relative to the top viewport (fractions 0..1), or null:
    // the app double-taps there so a real touch (which carries user activation) toggles the
    // fullscreen of the site itself, instead of requestFullscreen() which has no user activation
    window.tvBroGetVideoRect = function() {
        try {
            var m = target();
            if (!m) return null;
            var r = m.getBoundingClientRect();
            var x = r.left, y = r.top, w = r.width, h = r.height, win = window;
            // the media may live in a (same-origin) frame: add the offsets of its ancestor frames
            while (win && win !== win.top) {
                try {
                    var parent = win.parent;
                    if (!parent) break;
                    var frames = parent.document.querySelectorAll('iframe, frame');
                    var found = null;
                    for (var i = 0; i < frames.length; i++) {
                        if (frames[i].contentWindow === win) { found = frames[i]; break; }
                    }
                    if (!found) break;
                    var fr = found.getBoundingClientRect();
                    x += fr.left; y += fr.top;
                    win = parent;
                } catch (e) { break; }
            }
            var vw = win.innerWidth || 1, vh = win.innerHeight || 1;
            return {fx: (x + w / 2) / vw, fy: (y + h / 2) / vh};
        } catch (e) { return null; }
    };

    // iQiyi's PC player maps ArrowUp/ArrowDown to its own volume, and the D-pad of a TV remote is how the
    // page is navigated: a held key (in the direct navigation mode) drives the in-page volume to 0, where
    // the volume keys of the TV can not bring it back. Keep the keys from the page, but not from the
    // browser: without preventDefault they still scroll (or move the focus) as usual.
    function isIQiyi() {
        return /(^|\.)(iqiyi|qiyi)\.com$/.test(location.hostname);
    }
    // the top page of a player frame may be another origin: its referrer tells the page
    function isIQiyiWatchPage() {
        var path = location.pathname;
        try {
            path = top.location.pathname;
        } catch (e) {
            try { path = new URL(document.referrer).pathname; } catch (e2) { /* keep this frame's */ }
        }
        return /\/v_[^/]+\.html/.test(path);
    }
    function hasIQiyiPlayer(doc) {
        return !!(doc.querySelector('.iqp-player') || doc.getElementById('outlayer'));
    }
    function isTextInput(el) {
        if (!el) return false;
        var tag = (el.tagName || '').toLowerCase();
        return tag == 'input' || tag == 'textarea' || tag == 'select' || el.isContentEditable;
    }
    function onIQiyiKey(e) {
        // keyCode too: older WebViews name the keys "Up"/"Down"
        if (e.key != 'ArrowUp' && e.key != 'ArrowDown' && e.keyCode != 38 && e.keyCode != 40) return;
        if (e.isTrusted === false || isTextInput(e.target)) return;
        var doc = e.target && e.target.ownerDocument || document;
        if (!hasIQiyiPlayer(doc) && !isIQiyiWatchPage()) return;
        e.stopImmediatePropagation();
    }
    // The player's volume lives in the page and starts at 20%, so the volume keys of the TV (which
    // work on the system) can not bring it back from a value the remote has driven down. Start it at
    // 100% and repair a low value left by the bug once; later changes of the user are kept.
    function repairIQiyiVolume() {
        try {
            var key = 'QiyiPlayerVoice', flag = 'tvBroIQiyiVolumeRepaired';
            if (localStorage.getItem(flag) != null) return;
            var value = localStorage.getItem(key);
            var volume = value == null ? NaN : parseFloat(value);
            if (value == null || isNaN(volume) || (volume >= 0 && volume <= 0.2)) localStorage.setItem(key, '1');
            localStorage.setItem(flag, '1');
        } catch (e) { /* storage may be denied or a frame may be sandboxed */ }
    }
    if (isIQiyi()) {
        repairIQiyiVolume();
        ['keydown', 'keyup'].forEach(function(type) { window.addEventListener(type, onIQiyiKey, true); });
    }

    // a wheel over a media element: when the cursor reaches a screen border it scrolls the page with a
    // wheel, and players (iQiyi) turn a wheel over the video into a volume change. Stop the players from
    // getting the wheel, but let the page scroll under it when the wheel is not over the media itself.
    function isInMedia(el) {
        while (el && el.tagName) {
            if (el.tagName == 'VIDEO' || el.tagName == 'AUDIO') return true;
            el = el.parentElement;
        }
        return false;
    }
    // a player often puts its own elements over the video, so the target alone does not tell that the
    // wheel is over it
    function isOverMedia(doc, x, y) {
        var view = doc.defaultView || window;
        var vw = view.innerWidth || 1;
        var vh = view.innerHeight || 1;
        function inside(r) {
            return r.width > 0 && r.height > 0 &&
                x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
        }
        // the player covers its overlay elements and control bar, which the target alone does not tell;
        // a preview tile of a list is no such player (the cursor scrolls the page over it)
        var players = doc.querySelectorAll('.iqp-player');
        var outlayer = doc.getElementById('outlayer');
        if (outlayer) players = Array.prototype.slice.call(players).concat(outlayer);
        for (var i = 0; i < players.length; i++) {
            var r = players[i].getBoundingClientRect();
            if (r.width >= vw * 0.3 && r.height >= vh * 0.2 && inside(r)) return true;
        }
        // another player markup: the largest video of a watch page (a preview is small)
        if (!isIQiyiWatchPage()) return false;
        var videos = doc.querySelectorAll('video'), best = null, bestArea = 0;
        for (var j = 0; j < videos.length; j++) {
            var r = videos[j].getBoundingClientRect();
            var area = r.width * r.height;
            if (area > bestArea) { bestArea = area; best = r; }
        }
        return best ? inside(best) : false;
    }
    function onWheel(e) {
        var doc = e.target && e.target.ownerDocument || document;
        if (isInMedia(e.target)) {
            e.stopImmediatePropagation();
            e.preventDefault();
        } else if (isIQiyi() && isOverMedia(doc, e.clientX, e.clientY)) {
            // the player turns this wheel into a volume change: keep it from the page, but let the
            // browser scroll the page (no preventDefault), or the cursor would be stuck over the player
            e.stopImmediatePropagation();
        }
    }
    // the guards need no channel of the app: an old WebView (no send) gets them too; a wheel listener
    // on the window would be passive and its preventDefault ignored without the option
    var WHEEL_LISTENER = { capture: true, passive: false };
    ['wheel', 'mousewheel'].forEach(function(type) { window.addEventListener(type, onWheel, WHEEL_LISTENER); });

    if (!send) return command;
    // media events do not bubble, but the window gets them while they are captured
    var MEDIA_EVENTS = ['play', 'pause', 'ended', 'emptied', 'seeked', 'playing', 'waiting', 'ratechange',
        'durationchange', 'loadedmetadata', 'volumechange', 'timeupdate', 'encrypted'];
    function onMediaEvent(e) {
        var t = e.target;
        if (!t || (t.tagName != 'VIDEO' && t.tagName != 'AUDIO')) return;
        if (e.type == 'play') lastPlayed = t;
        if (e.type == 'encrypted' && encrypted) encrypted.add(t);
        if (e.type == 'timeupdate') reportTime(); else report();
    }
    function listen(w) {
        MEDIA_EVENTS.forEach(function(type) { w.addEventListener(type, onMediaEvent, true); });
        ['fullscreenchange', 'webkitfullscreenchange'].forEach(function(type) {
            w.addEventListener(type, report, true);
        });
        ['wheel', 'mousewheel'].forEach(function(type) { w.addEventListener(type, onWheel, WHEEL_LISTENER); });
        // frames without the script of their own (about:blank, about:srcdoc) get the guard too
        if (isIQiyi()) {
            ['keydown', 'keyup'].forEach(function(type) { w.addEventListener(type, onIQiyiKey, true); });
        }
    }
    listen(window);
    if (frames) {
        // the frames without scripts come and go, and a page that writes one anew (document.open) drops its
        // listeners: they are added again now and then (the same listener is added only once)
        setInterval(function() {
            var windows = childWindows();
            windows.forEach(listen);
            if (windows.length) reportTime();
        }, 1000);
    }
    // a frame that goes away (or into the back-forward cache) has no media for the app
    window.addEventListener('pagehide', function() {
        post(JSON.stringify({media: false}));
        lastState = '';
    }, true);
    window.addEventListener('pageshow', function(e) {
        if (e.persisted) report();
    }, true);
    return command;
}
