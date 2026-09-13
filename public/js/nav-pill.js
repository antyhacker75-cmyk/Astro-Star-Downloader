// nav-pill.js — iOS 26 Liquid Glass sliding pill for the bottom nav.
// Standalone. Does not import anything. If it fails, the nav still works.

(function () {
  "use strict";

  var PILL_CLASS = "nav-sliding-pill";
  var MAX_TRIES = 20;
  var tries = 0;

  // How far to pull the pill inward from the nav item's bounding box.
  // Increase INSET_X for a narrower pill, INSET_Y for a shorter one.
  var INSET_X = 6;
  var INSET_Y = 6;

  // Optional extra lift off the top/bottom of the nav bar.
  var OFFSET_Y = 0;

  function findNavGroup() {
    var all = document.querySelectorAll(".nav-item");
    if (!all.length) return null;

    var groups = new Map();
    Array.prototype.forEach.call(all, function (el) {
      var p = el.parentElement;
      if (!p) return;
      if (!groups.has(p)) groups.set(p, []);
      groups.get(p).push(el);
    });

    var bestParent = null;
    var bestGroup = [];
    groups.forEach(function (group, parent) {
      if (group.length > bestGroup.length) {
        bestGroup = group;
        bestParent = parent;
      }
    });

    if (!bestParent || bestGroup.length < 2) return null;
    return { nav: bestParent, items: bestGroup };
  }

  function init() {
    var found = findNavGroup();
    if (!found) {
      if (++tries < MAX_TRIES) setTimeout(init, 300);
      return;
    }

    var nav = found.nav;
    var items = found.items;

    var navCS = window.getComputedStyle(nav);
    if (navCS.position === "static") {
      nav.style.position = "relative";
    }

    var pill = document.createElement("div");
    pill.className = PILL_CLASS + " snap";
    nav.appendChild(pill);

    function movePill(animate) {
      var active = nav.querySelector(".nav-item.active");
      if (!active) {
        pill.classList.remove("ready");
        return;
      }

      var navRect = nav.getBoundingClientRect();
      var rect = active.getBoundingClientRect();

      if (rect.width === 0 || rect.height === 0) return;

      if (animate) {
        pill.classList.remove("snap");
      } else {
        pill.classList.add("snap");
      }

      // Compute the inset position and size
      var w = Math.max(0, rect.width - INSET_X * 2);
      var h = Math.max(0, rect.height - INSET_Y * 2);

      var x = rect.left - navRect.left + INSET_X;
      var y = rect.top - navRect.top + INSET_Y + OFFSET_Y;

      pill.style.width = w + "px";
      pill.style.height = h + "px";
      pill.style.transform = "translate(" + x + "px, " + y + "px)";
      pill.classList.add("ready");
    }

    requestAnimationFrame(function () {
      movePill(false);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          pill.classList.remove("snap");
        });
      });
    });

    var observer = new MutationObserver(function (mutations) {
      var shouldMove = false;
      mutations.forEach(function (m) {
        if (m.type === "attributes" && m.attributeName === "class") {
          shouldMove = true;
        }
      });
      if (shouldMove) movePill(true);
    });

    items.forEach(function (item) {
      observer.observe(item, {
        attributes: true,
        attributeFilter: ["class"]
      });
    });

    items.forEach(function (item) {
      item.addEventListener("click", function () {
        [30, 120, 350].forEach(function (delay) {
          setTimeout(function () {
            movePill(true);
          }, delay);
        });
      });
    });

    var resizeTimer = null;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        movePill(false);
      }, 100);
    });

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") {
        movePill(false);
      }
    });

    // Debug helper — call window.AstroStarNavPill.debug() in DevTools
    window.AstroStarNavPill = {
      debug: function () {
        var active = nav.querySelector(".nav-item.active");
        if (!active) return console.log("[nav-pill] no active item");
        var nr = nav.getBoundingClientRect();
        var r = active.getBoundingClientRect();
        console.log("[nav-pill] nav rect:", nr);
        console.log("[nav-pill] active item rect:", r);
        console.log("[nav-pill] pill style:", {
          width: pill.style.width,
          height: pill.style.height,
          transform: pill.style.transform
        });
      },
      pill: pill
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
