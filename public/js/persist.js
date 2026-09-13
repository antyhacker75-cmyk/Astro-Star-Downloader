// persist.js — mirrors astrostar_history to Documents/AstroStar/history.json
// Plain script. Does not import anything. If it fails, app keeps working.

(function () {
  "use strict";

  var KEY  = "astrostar_history";
  var DIR  = "Documents/AstroStar";
  var FILE = "history.json";
  var PATH = DIR + "/" + FILE;
  var TAG  = "[persist]";

  function log() {
    var a = Array.prototype.slice.call(arguments);
    a.unshift(TAG);
    console.log.apply(console, a);
  }

  function getFS() {
    try {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem) {
        return window.Capacitor.Plugins.Filesystem;
      }
    } catch (e) {}
    return null;
  }

  function readLocal() {
    try {
      var raw = localStorage.getItem(KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  }

  function writeLocal(arr) {
    try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch (e) {}
  }

  function readDisk(FS) {
    return FS.readFile({ path: PATH, directory: "EXTERNAL_STORAGE", encoding: "utf8" })
      .then(function (r) {
        try {
          var parsed = JSON.parse(r.data);
          return Array.isArray(parsed) ? parsed : [];
        } catch (e) { return []; }
      })
      .catch(function () { return []; });
  }

  function writeDisk(FS, arr) {
    return FS.mkdir({ path: DIR, directory: "EXTERNAL_STORAGE", recursive: true })
      .catch(function () {})
      .then(function () {
        return FS.writeFile({
          path: PATH,
          directory: "EXTERNAL_STORAGE",
          encoding: "utf8",
          data: JSON.stringify(arr, null, 2),
          recursive: true
        });
      })
      .catch(function (e) { log("write failed:", e); });
  }

  function merge(a, b) {
    var map = {}, order = [];
    function add(item) {
      if (!item || typeof item !== "object") return;
      var k = item.url || item.sourceUrl || item.id || item.path;
      if (!k) return;
      if (!map[k]) { map[k] = item; order.push(k); }
      else { map[k] = Object.assign({}, map[k], item); }
    }
    (a || []).forEach(add);
    (b || []).forEach(add);
    var out = order.map(function (k) { return map[k]; });
    out.sort(function (x, y) { return (y.timestamp || 0) - (x.timestamp || 0); });
    return out;
  }

  var patched = false;
  function patch(FS) {
    if (patched) return;
    patched = true;

    var nativeSet = Storage.prototype.setItem;
    var nativeRemove = Storage.prototype.removeItem;

    Storage.prototype.setItem = function (k, v) {
      var r = nativeSet.call(this, k, v);
      if (k === KEY) { try { writeDisk(FS, JSON.parse(v)); } catch (e) {} }
      return r;
    };

    Storage.prototype.removeItem = function (k) {
      var r = nativeRemove.call(this, k);
      if (k === KEY) { writeDisk(FS, []); }
      return r;
    };

    log("localStorage patched — writes now mirror to", PATH);
  }

  function boot() {
    var FS = getFS();
    if (!FS) { setTimeout(boot, 500); return; }

    log("Capacitor Filesystem detected. Loading disk history…");

    readDisk(FS).then(function (disk) {
      var local = readLocal();
      var merged = merge(disk, local);
      var restored = local.length === 0 && merged.length > 0;

      log("disk=" + disk.length + " local=" + local.length + " merged=" + merged.length);

      if (restored || merged.length !== local.length) {
        writeLocal(merged);
      }

      patch(FS);

      // If we recovered history on a fresh install, reload once so the UI shows it.
      if (restored && !sessionStorage.getItem("astrostar_persist_reloaded")) {
        sessionStorage.setItem("astrostar_persist_reloaded", "1");
        log("history restored from disk — reloading UI once");
        setTimeout(function () { location.reload(); }, 800);
      }
    });
  }

  // Public debug hook so you can test from DevTools console:
  window.AstroStarPersist = {
    status: function () {
      var FS = getFS();
      if (!FS) return console.log(TAG, "Filesystem plugin NOT available");
      readDisk(FS).then(function (d) {
        console.log(TAG, "disk file has", d.length, "items at", PATH);
      });
    },
    forceWrite: function () {
      var FS = getFS();
      if (!FS) return console.log(TAG, "Filesystem plugin NOT available");
      writeDisk(FS, readLocal()).then(function () {
        console.log(TAG, "forced write done →", PATH);
      });
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
