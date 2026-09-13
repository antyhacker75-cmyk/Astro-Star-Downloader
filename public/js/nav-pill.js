// nav-pill.js — iOS 26 Liquid Glass sliding pill for the bottom nav.
// Standalone. Does not import anything. If it fails, the nav still works.

(function () {
  "use strict";

  var PILL_CLASS = "nav-sliding-pill";
  var MAX_TRIES = 20;
  var tries = 0;

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

    // Ensure the nav is a positioning context for the absolute pill
    var navCS = window.getComputedStyle(nav);
    if (navCS.position === "static") {
      nav.style.position = "relative";
    }

    // Create the pill
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

      var x = rect.left - navRect.left;
      var y = rect.top - navRect.top;

      pill.style.width = rect.width + "px";
      pill.style.height = rect.height + "px";
      pill.style.transform = "translate(" + x + "px, " + y + "px)";
      pill.classList.add("ready");
    }

    // Initial position with no animation, then enable transitions
    requestAnimationFrame(function () {
      movePill(false);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          pill.classList.remove("snap");
        });
      });
    });

    // Watch for class changes on the nav items
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

    // Belt-and-braces: also reposition after clicks in case the
    // active class is applied asynchronously
    items.forEach(function (item) {
      item.addEventListener("click", function () {
        [30, 120, 350].forEach(function (delay) {
          setTimeout(function () {
            movePill(true);
          }, delay);
        });
      });
    });

    // Reposition on resize / rotation without animation
    var resizeTimer = null;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        movePill(false);
      }, 100);
    });

    // Reposition when the page becomes visible (e.g. returning from background)
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") {
        movePill(false);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
