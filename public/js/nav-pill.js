// Astro Star - Bottom Navigation Sliding Pill
// Accurate, smooth and responsive navigation pill

(function () {
    "use strict";

    const PILL_CLASS = "nav-sliding-pill";

    let nav = null;
    let items = [];
    let pill = null;

    let resizeTimer = null;
    let mutationTimer = null;

    // Pill spacing from the actual navigation item
    const INSET_X = 8;
    const INSET_Y = 7;

    function findNavGroup() {
        const all = document.querySelectorAll(".nav-item");

        if (!all.length) {
            return null;
        }

        const groups = new Map();

        Array.prototype.forEach.call(all, function (item) {
            const parent = item.parentElement;

            if (!parent) {
                return;
            }

            if (!groups.has(parent)) {
                groups.set(parent, []);
            }

            groups.get(parent).push(item);
        });

        let bestParent = null;
        let bestGroup = [];

        groups.forEach(function (group, parent) {
            if (group.length > bestGroup.length) {
                bestGroup = group;
                bestParent = parent;
            }
        });

        if (!bestParent || bestGroup.length < 2) {
            return null;
        }

        return {
            nav: bestParent,
            items: bestGroup
        };
    }

    function createPill() {
        const oldPill = nav.querySelector("." + PILL_CLASS);

        if (oldPill) {
            oldPill.remove();
        }

        pill = document.createElement("div");

        pill.className = PILL_CLASS;

        pill.setAttribute("aria-hidden", "true");

        nav.appendChild(pill);
    }

    function getActiveItem() {
        return nav.querySelector(".nav-item.active");
    }

    function movePill(animate) {
        if (!nav || !pill) {
            return;
        }

        const active = getActiveItem();

        if (!active) {
            pill.classList.remove("ready");
            return;
        }

        const navRect = nav.getBoundingClientRect();
        const itemRect = active.getBoundingClientRect();

        if (
            navRect.width <= 0 ||
            navRect.height <= 0 ||
            itemRect.width <= 0 ||
            itemRect.height <= 0
        ) {
            return;
        }

        /*
         * Calculate the pill from the CENTER
         * of the active navigation item.
         *
         * This is more accurate than simply using
         * rect.left / rect.top because the item can
         * have different icon/text dimensions.
         */

        const itemCenterX =
            itemRect.left -
            navRect.left +
            itemRect.width / 2;

        const itemCenterY =
            itemRect.top -
            navRect.top +
            itemRect.height / 2;

        const pillWidth = Math.max(
            0,
            itemRect.width - INSET_X * 2
        );

        const pillHeight = Math.max(
            0,
            itemRect.height - INSET_Y * 2
        );

        const x =
            itemCenterX -
            pillWidth / 2;

        const y =
            itemCenterY -
            pillHeight / 2;

        if (animate) {
            pill.classList.remove("snap");
        } else {
            pill.classList.add("snap");
        }

        pill.style.width = pillWidth + "px";
        pill.style.height = pillHeight + "px";

        pill.style.transform =
            "translate3d(" +
            x +
            "px, " +
            y +
            "px, 0)";

        pill.classList.add("ready");

        if (!animate) {
            requestAnimationFrame(function () {
                pill.classList.remove("snap");
            });
        }
    }

    function updateImmediately() {
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                movePill(false);
            });
        });
    }

    function scheduleMove() {
        clearTimeout(mutationTimer);

        mutationTimer = setTimeout(function () {
            movePill(true);
        }, 10);
    }

    function init() {
        const found = findNavGroup();

        if (!found) {
            setTimeout(init, 300);
            return;
        }

        nav = found.nav;
        items = found.items;

        const navStyle = window.getComputedStyle(nav);

        if (navStyle.position === "static") {
            nav.style.position = "relative";
        }

        /*
         * Create the pill only once.
         */
        createPill();

        /*
         * Initial position.
         */
        updateImmediately();

        /*
         * Watch the active class.
         */
        const observer = new MutationObserver(function (mutations) {
            let changed = false;

            mutations.forEach(function (mutation) {
                if (
                    mutation.type === "attributes" &&
                    mutation.attributeName === "class"
                ) {
                    changed = true;
                }
            });

            if (changed) {
                scheduleMove();
            }
        });

        items.forEach(function (item) {
            observer.observe(item, {
                attributes: true,
                attributeFilter: ["class"]
            });
        });

        /*
         * Click handling.
         *
         * No multiple 30/120/350ms hacks.
         */
        items.forEach(function (item) {
            item.addEventListener("click", function () {
                requestAnimationFrame(function () {
                    movePill(true);
                });

                requestAnimationFrame(function () {
                    requestAnimationFrame(function () {
                        movePill(true);
                    });
                });
            });
        });

        /*
         * Window resize.
         */
        window.addEventListener("resize", function () {
            clearTimeout(resizeTimer);

            resizeTimer = setTimeout(function () {
                movePill(false);
            }, 100);
        });

        /*
         * App becomes visible again.
         */
        document.addEventListener("visibilitychange", function () {
            if (document.visibilityState === "visible") {
                updateImmediately();
            }
        });

        /*
         * Detect navigation size/layout changes.
         */
        if ("ResizeObserver" in window) {
            const resizeObserver = new ResizeObserver(function () {
                movePill(false);
            });

            resizeObserver.observe(nav);

            items.forEach(function (item) {
                resizeObserver.observe(item);
            });
        }

        /*
         * Debug helper.
         */
        window.AstroStarNavPill = {

            move: function () {
                movePill(true);
            },

            snap: function () {
                movePill(false);
            },

            debug: function () {
                const active = getActiveItem();

                if (!active) {
                    console.log(
                        "[AstroStarNavPill] No active navigation item."
                    );
                    return;
                }

                const navRect =
                    nav.getBoundingClientRect();

                const itemRect =
                    active.getBoundingClientRect();

                console.log(
                    "[AstroStarNavPill] Navigation:",
                    navRect
                );

                console.log(
                    "[AstroStarNavPill] Active item:",
                    itemRect
                );

                console.log(
                    "[AstroStarNavPill] Pill:",
                    {
                        width: pill.style.width,
                        height: pill.style.height,
                        transform: pill.style.transform
                    }
                );
            },

            pill: pill
        };
    }

    /*
     * Start after DOM is ready.
     */
    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            init
        );
    } else {
        init();
    }

})();
