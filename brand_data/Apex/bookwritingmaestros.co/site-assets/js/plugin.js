/*!
 * Bootstrap v4.3.1 (https://getbootstrap.com/)
 */

! function (t, e) {
  "object" == typeof exports && "undefined" != typeof module ? e(exports, require("jquery"), require("popper.js")) : "function" == typeof define && define.amd ? define(["exports", "jquery", "popper.js"], e) : e((t = t || self).bootstrap = {}, t.jQuery, t.Popper)
}(this, function (t, e, i) {
  "use strict";

  function s(t, e) {
    for (var i = 0; i < e.length; i++) {
      var s = e[i];
      s.enumerable = s.enumerable || !1, s.configurable = !0, "value" in s && (s.writable = !0), Object.defineProperty(t, s.key, s)
    }
  }

  function n(t, e, i) {
    return e && s(t.prototype, e), i && s(t, i), t
  }

  function o(t) {
    for (var e = 1; e < arguments.length; e++) {
      var i = null != arguments[e] ? arguments[e] : {},
        s = Object.keys(i);
      "function" == typeof Object.getOwnPropertySymbols && (s = s.concat(Object.getOwnPropertySymbols(i).filter(function (t) {
        return Object.getOwnPropertyDescriptor(i, t).enumerable
      }))), s.forEach(function (e) {
        var s, n, o;
        s = t, o = i[n = e], n in s ? Object.defineProperty(s, n, {
          value: o,
          enumerable: !0,
          configurable: !0,
          writable: !0
        }) : s[n] = o
      })
    }
    return t
  }
  e = e && e.hasOwnProperty("default") ? e.default : e, i = i && i.hasOwnProperty("default") ? i.default : i;
  var r = "transitionend",
    a = {
      TRANSITION_END: "bsTransitionEnd",
      getUID: function (t) {
        for (; t += ~~(1e6 * Math.random()), document.getElementById(t););
        return t
      },
      getSelectorFromElement: function (t) {
        var e = t.getAttribute("data-target");
        if (!e || "#" === e) {
          var i = t.getAttribute("href");
          e = i && "#" !== i ? i.trim() : ""
        }
        try {
          return document.querySelector(e) ? e : null
        } catch (s) {
          return null
        }
      },
      getTransitionDurationFromElement: function (t) {
        if (!t) return 0;
        var i = e(t).css("transition-duration"),
          s = e(t).css("transition-delay"),
          n = parseFloat(i),
          o = parseFloat(s);
        return n || o ? (i = i.split(",")[0], s = s.split(",")[0], 1e3 * (parseFloat(i) + parseFloat(s))) : 0
      },
      reflow: function (t) {
        return t.offsetHeight
      },
      triggerTransitionEnd: function (t) {
        e(t).trigger(r)
      },
      supportsTransitionEnd: function () {
        return Boolean(r)
      },
      isElement: function (t) {
        return (t[0] || t).nodeType
      },
      typeCheckConfig: function (t, e, i) {
        for (var s in i)
          if (Object.prototype.hasOwnProperty.call(i, s)) {
            var n, o = i[s],
              r = e[s],
              l = r && a.isElement(r) ? "element" : (n = r, ({}).toString.call(n).match(/\s([a-z]+)/i)[1].toLowerCase());
            if (!RegExp(o).test(l)) throw Error(t.toUpperCase() + ': Option "' + s + '" provided type "' + l + '" but expected type "' + o + '".')
          }
      },
      findShadowRoot: function (t) {
        if (!document.documentElement.attachShadow) return null;
        if ("function" != typeof t.getRootNode) return t instanceof ShadowRoot ? t : t.parentNode ? a.findShadowRoot(t.parentNode) : null;
        var e = t.getRootNode();
        return e instanceof ShadowRoot ? e : null
      }
    };
  e.fn.emulateTransitionEnd = function t(i) {
    var s = this,
      n = !1;
    return e(this).one(a.TRANSITION_END, function () {
      n = !0
    }), setTimeout(function () {
      n || a.triggerTransitionEnd(s)
    }, i), this
  }, e.event.special[a.TRANSITION_END] = {
    bindType: r,
    delegateType: r,
    handle: function (t) {
      if (e(t.target).is(this)) return t.handleObj.handler.apply(this, arguments)
    }
  };
  var l = "alert",
    c = "bs.alert",
    h = "." + c,
    d = e.fn[l],
    u = {
      CLOSE: "close" + h,
      CLOSED: "closed" + h,
      CLICK_DATA_API: "click" + h + ".data-api"
    },
    p = function () {
      function t(t) {
        this._element = t
      }
      var i = t.prototype;
      return i.close = function (t) {
        var e = this._element;
        t && (e = this._getRootElement(t)), this._triggerCloseEvent(e).isDefaultPrevented() || this._removeElement(e)
      }, i.dispose = function () {
        e.removeData(this._element, c), this._element = null
      }, i._getRootElement = function (t) {
        var i = a.getSelectorFromElement(t),
          s = !1;
        return i && (s = document.querySelector(i)), s || (s = e(t).closest(".alert")[0]), s
      }, i._triggerCloseEvent = function (t) {
        var i = e.Event(u.CLOSE);
        return e(t).trigger(i), i
      }, i._removeElement = function (t) {
        var i = this;
        if (e(t).removeClass("show"), e(t).hasClass("fade")) {
          var s = a.getTransitionDurationFromElement(t);
          e(t).one(a.TRANSITION_END, function (e) {
            return i._destroyElement(t, e)
          }).emulateTransitionEnd(s)
        } else this._destroyElement(t)
      }, i._destroyElement = function (t) {
        e(t).detach().trigger(u.CLOSED).remove()
      }, t._jQueryInterface = function (i) {
        return this.each(function () {
          var s = e(this),
            n = s.data(c);
          n || (n = new t(this), s.data(c, n)), "close" === i && n[i](this)
        })
      }, t._handleDismiss = function (t) {
        return function (e) {
          e && e.preventDefault(), t.close(this)
        }
      }, n(t, null, [{
        key: "VERSION",
        get: function () {
          return "4.3.1"
        }
      }]), t
    }();
  e(document).on(u.CLICK_DATA_API, '[data-dismiss="alert"]', p._handleDismiss(new p)), e.fn[l] = p._jQueryInterface, e.fn[l].Constructor = p, e.fn[l].noConflict = function () {
    return e.fn[l] = d, p._jQueryInterface
  };
  var f = "button",
    g = "bs.button",
    m = "." + g,
    v = ".data-api",
    y = e.fn[f],
    w = "active",
    $ = '[data-toggle^="button"]',
    b = ".btn",
    C = {
      CLICK_DATA_API: "click" + m + v,
      FOCUS_BLUR_DATA_API: "focus" + m + v + " blur" + m + v
    },
    S = function () {
      function t(t) {
        this._element = t
      }
      var i = t.prototype;
      return i.toggle = function () {
        var t = !0,
          i = !0,
          s = e(this._element).closest('[data-toggle="buttons"]')[0];
        if (s) {
          var n = this._element.querySelector('input:not([type="hidden"])');
          if (n) {
            if ("radio" === n.type) {
              if (n.checked && this._element.classList.contains(w)) t = !1;
              else {
                var o = s.querySelector(".active");
                o && e(o).removeClass(w)
              }
            }
            if (t) {
              if (n.hasAttribute("disabled") || s.hasAttribute("disabled") || n.classList.contains("disabled") || s.classList.contains("disabled")) return;
              n.checked = !this._element.classList.contains(w), e(n).trigger("change")
            }
            n.focus(), i = !1
          }
        }
        i && this._element.setAttribute("aria-pressed", !this._element.classList.contains(w)), t && e(this._element).toggleClass(w)
      }, i.dispose = function () {
        e.removeData(this._element, g), this._element = null
      }, t._jQueryInterface = function (i) {
        return this.each(function () {
          var s = e(this).data(g);
          s || (s = new t(this), e(this).data(g, s)), "toggle" === i && s[i]()
        })
      }, n(t, null, [{
        key: "VERSION",
        get: function () {
          return "4.3.1"
        }
      }]), t
    }();
  e(document).on(C.CLICK_DATA_API, $, function (t) {
    t.preventDefault();
    var i = t.target;
    e(i).hasClass("btn") || (i = e(i).closest(b)), S._jQueryInterface.call(e(i), "toggle")
  }).on(C.FOCUS_BLUR_DATA_API, $, function (t) {
    var i = e(t.target).closest(b)[0];
    e(i).toggleClass("focus", /^focus(in)?$/.test(t.type))
  }), e.fn[f] = S._jQueryInterface, e.fn[f].Constructor = S, e.fn[f].noConflict = function () {
    return e.fn[f] = y, S._jQueryInterface
  };
  var T = "carousel",
    k = "bs.carousel",
    _ = "." + k,
    E = ".data-api",
    x = e.fn[T],
    A = {
      interval: 5e3,
      keyboard: !0,
      slide: !1,
      pause: "hover",
      wrap: !0,
      touch: !0
    },
    D = {
      interval: "(number|boolean)",
      keyboard: "boolean",
      slide: "(boolean|string)",
      pause: "(string|boolean)",
      wrap: "boolean",
      touch: "boolean"
    },
    I = "next",
    O = "prev",
    P = {
      SLIDE: "slide" + _,
      SLID: "slid" + _,
      KEYDOWN: "keydown" + _,
      MOUSEENTER: "mouseenter" + _,
      MOUSELEAVE: "mouseleave" + _,
      TOUCHSTART: "touchstart" + _,
      TOUCHMOVE: "touchmove" + _,
      TOUCHEND: "touchend" + _,
      POINTERDOWN: "pointerdown" + _,
      POINTERUP: "pointerup" + _,
      DRAG_START: "dragstart" + _,
      LOAD_DATA_API: "load" + _ + E,
      CLICK_DATA_API: "click" + _ + E
    },
    N = "active",
    z = ".active.carousel-item",
    L = {
      TOUCH: "touch",
      PEN: "pen"
    },
    H = function () {
      function t(t, e) {
        this._items = null, this._interval = null, this._activeElement = null, this._isPaused = !1, this._isSliding = !1, this.touchTimeout = null, this.touchStartX = 0, this.touchDeltaX = 0, this._config = this._getConfig(e), this._element = t, this._indicatorsElement = this._element.querySelector(".carousel-indicators"), this._touchSupported = "ontouchstart" in document.documentElement || 0 < navigator.maxTouchPoints, this._pointerEvent = Boolean(window.PointerEvent || window.MSPointerEvent), this._addEventListeners()
      }
      var i = t.prototype;
      return i.next = function () {
        this._isSliding || this._slide(I)
      }, i.nextWhenVisible = function () {
        !document.hidden && e(this._element).is(":visible") && "hidden" !== e(this._element).css("visibility") && this.next()
      }, i.prev = function () {
        this._isSliding || this._slide(O)
      }, i.pause = function (t) {
        t || (this._isPaused = !0), this._element.querySelector(".carousel-item-next, .carousel-item-prev") && (a.triggerTransitionEnd(this._element), this.cycle(!0)), clearInterval(this._interval), this._interval = null
      }, i.cycle = function (t) {
        t || (this._isPaused = !1), this._interval && (clearInterval(this._interval), this._interval = null), this._config.interval && !this._isPaused && (this._interval = setInterval((document.visibilityState ? this.nextWhenVisible : this.next).bind(this), this._config.interval))
      }, i.to = function (t) {
        var i = this;
        this._activeElement = this._element.querySelector(z);
        var s = this._getItemIndex(this._activeElement);
        if (!(t > this._items.length - 1 || t < 0)) {
          if (this._isSliding) e(this._element).one(P.SLID, function () {
            return i.to(t)
          });
          else {
            if (s === t) return this.pause(), void this.cycle();
            this._slide(s < t ? I : O, this._items[t])
          }
        }
      }, i.dispose = function () {
        e(this._element).off(_), e.removeData(this._element, k), this._items = null, this._config = null, this._element = null, this._interval = null, this._isPaused = null, this._isSliding = null, this._activeElement = null, this._indicatorsElement = null
      }, i._getConfig = function (t) {
        return t = o({}, A, t), a.typeCheckConfig(T, t, D), t
      }, i._handleSwipe = function () {
        var t = Math.abs(this.touchDeltaX);
        if (!(t <= 40)) {
          var e = t / this.touchDeltaX;
          0 < e && this.prev(), e < 0 && this.next()
        }
      }, i._addEventListeners = function () {
        var t = this;
        this._config.keyboard && e(this._element).on(P.KEYDOWN, function (e) {
          return t._keydown(e)
        }), "hover" === this._config.pause && e(this._element).on(P.MOUSEENTER, function (e) {
          return t.pause(e)
        }).on(P.MOUSELEAVE, function (e) {
          return t.cycle(e)
        }), this._config.touch && this._addTouchEventListeners()
      }, i._addTouchEventListeners = function () {
        var t = this;
        if (this._touchSupported) {
          var i = function (e) {
              t._pointerEvent && L[e.originalEvent.pointerType.toUpperCase()] ? t.touchStartX = e.originalEvent.clientX : t._pointerEvent || (t.touchStartX = e.originalEvent.touches[0].clientX)
            },
            s = function (e) {
              t._pointerEvent && L[e.originalEvent.pointerType.toUpperCase()] && (t.touchDeltaX = e.originalEvent.clientX - t.touchStartX), t._handleSwipe(), "hover" === t._config.pause && (t.pause(), t.touchTimeout && clearTimeout(t.touchTimeout), t.touchTimeout = setTimeout(function (e) {
                return t.cycle(e)
              }, 500 + t._config.interval))
            };
          e(this._element.querySelectorAll(".carousel-item img")).on(P.DRAG_START, function (t) {
            return t.preventDefault()
          }), this._pointerEvent ? (e(this._element).on(P.POINTERDOWN, function (t) {
            return i(t)
          }), e(this._element).on(P.POINTERUP, function (t) {
            return s(t)
          }), this._element.classList.add("pointer-event")) : (e(this._element).on(P.TOUCHSTART, function (t) {
            return i(t)
          }), e(this._element).on(P.TOUCHMOVE, function (e) {
            var i;
            (i = e).originalEvent.touches && 1 < i.originalEvent.touches.length ? t.touchDeltaX = 0 : t.touchDeltaX = i.originalEvent.touches[0].clientX - t.touchStartX
          }), e(this._element).on(P.TOUCHEND, function (t) {
            return s(t)
          }))
        }
      }, i._keydown = function (t) {
        if (!/input|textarea/i.test(t.target.tagName)) switch (t.which) {
          case 37:
            t.preventDefault(), this.prev();
            break;
          case 39:
            t.preventDefault(), this.next()
        }
      }, i._getItemIndex = function (t) {
        return this._items = t && t.parentNode ? [].slice.call(t.parentNode.querySelectorAll(".carousel-item")) : [], this._items.indexOf(t)
      }, i._getItemByDirection = function (t, e) {
        var i = this._getItemIndex(e),
          s = this._items.length - 1;
        if ((t === O && 0 === i || t === I && i === s) && !this._config.wrap) return e;
        var n = (i + (t === O ? -1 : 1)) % this._items.length;
        return -1 === n ? this._items[this._items.length - 1] : this._items[n]
      }, i._triggerSlideEvent = function (t, i) {
        var s = this._getItemIndex(t),
          n = this._getItemIndex(this._element.querySelector(z)),
          o = e.Event(P.SLIDE, {
            relatedTarget: t,
            direction: i,
            from: n,
            to: s
          });
        return e(this._element).trigger(o), o
      }, i._setActiveIndicatorElement = function (t) {
        if (this._indicatorsElement) {
          e([].slice.call(this._indicatorsElement.querySelectorAll(".active"))).removeClass(N);
          var i = this._indicatorsElement.children[this._getItemIndex(t)];
          i && e(i).addClass(N)
        }
      }, i._slide = function (t, i) {
        var s, n, o, r = this,
          l = this._element.querySelector(z),
          c = this._getItemIndex(l),
          h = i || l && this._getItemByDirection(t, l),
          d = this._getItemIndex(h),
          u = Boolean(this._interval);
        if (o = t === I ? (s = "carousel-item-left", n = "carousel-item-next", "left") : (s = "carousel-item-right", n = "carousel-item-prev", "right"), h && e(h).hasClass(N)) this._isSliding = !1;
        else if (!this._triggerSlideEvent(h, o).isDefaultPrevented() && l && h) {
          this._isSliding = !0, u && this.pause(), this._setActiveIndicatorElement(h);
          var p = e.Event(P.SLID, {
            relatedTarget: h,
            direction: o,
            from: c,
            to: d
          });
          if (e(this._element).hasClass("slide")) {
            e(h).addClass(n), a.reflow(h), e(l).addClass(s), e(h).addClass(s);
            var f = parseInt(h.getAttribute("data-interval"), 10);
            this._config.interval = f ? (this._config.defaultInterval = this._config.defaultInterval || this._config.interval, f) : this._config.defaultInterval || this._config.interval;
            var g = a.getTransitionDurationFromElement(l);
            e(l).one(a.TRANSITION_END, function () {
              e(h).removeClass(s + " " + n).addClass(N), e(l).removeClass(N + " " + n + " " + s), r._isSliding = !1, setTimeout(function () {
                return e(r._element).trigger(p)
              }, 0)
            }).emulateTransitionEnd(g)
          } else e(l).removeClass(N), e(h).addClass(N), this._isSliding = !1, e(this._element).trigger(p);
          u && this.cycle()
        }
      }, t._jQueryInterface = function (i) {
        return this.each(function () {
          var s = e(this).data(k),
            n = o({}, A, e(this).data());
          "object" == typeof i && (n = o({}, n, i));
          var r = "string" == typeof i ? i : n.slide;
          if (s || (s = new t(this, n), e(this).data(k, s)), "number" == typeof i) s.to(i);
          else if ("string" == typeof r) {
            if (void 0 === s[r]) throw TypeError('No method named "' + r + '"');
            s[r]()
          } else n.interval && n.ride && (s.pause(), s.cycle())
        })
      }, t._dataApiClickHandler = function (i) {
        var s = a.getSelectorFromElement(this);
        if (s) {
          var n = e(s)[0];
          if (n && e(n).hasClass("carousel")) {
            var r = o({}, e(n).data(), e(this).data()),
              l = this.getAttribute("data-slide-to");
            l && (r.interval = !1), t._jQueryInterface.call(e(n), r), l && e(n).data(k).to(l), i.preventDefault()
          }
        }
      }, n(t, null, [{
        key: "VERSION",
        get: function () {
          return "4.3.1"
        }
      }, {
        key: "Default",
        get: function () {
          return A
        }
      }]), t
    }();
  e(document).on(P.CLICK_DATA_API, "[data-slide], [data-slide-to]", H._dataApiClickHandler), e(window).on(P.LOAD_DATA_API, function () {
    for (var t = [].slice.call(document.querySelectorAll('[data-ride="carousel"]')), i = 0, s = t.length; i < s; i++) {
      var n = e(t[i]);
      H._jQueryInterface.call(n, n.data())
    }
  }), e.fn[T] = H._jQueryInterface, e.fn[T].Constructor = H, e.fn[T].noConflict = function () {
    return e.fn[T] = x, H._jQueryInterface
  };
  var j = "collapse",
    W = "bs.collapse",
    R = "." + W,
    q = e.fn[j],
    M = {
      toggle: !0,
      parent: ""
    },
    U = {
      toggle: "boolean",
      parent: "(string|element)"
    },
    F = {
      SHOW: "show" + R,
      SHOWN: "shown" + R,
      HIDE: "hide" + R,
      HIDDEN: "hidden" + R,
      CLICK_DATA_API: "click" + R + ".data-api"
    },
    B = "show",
    Q = "collapse",
    K = "collapsing",
    Y = "collapsed",
    V = "width",
    X = '[data-toggle="collapse"]',
    Z = function () {
      function t(t, e) {
        this._isTransitioning = !1, this._element = t, this._config = this._getConfig(e), this._triggerArray = [].slice.call(document.querySelectorAll('[data-toggle="collapse"][href="#' + t.id + '"],[data-toggle="collapse"][data-target="#' + t.id + '"]'));
        for (var i = [].slice.call(document.querySelectorAll(X)), s = 0, n = i.length; s < n; s++) {
          var o = i[s],
            r = a.getSelectorFromElement(o),
            l = [].slice.call(document.querySelectorAll(r)).filter(function (e) {
              return e === t
            });
          null !== r && 0 < l.length && (this._selector = r, this._triggerArray.push(o))
        }
        this._parent = this._config.parent ? this._getParent() : null, this._config.parent || this._addAriaAndCollapsedClass(this._element, this._triggerArray), this._config.toggle && this.toggle()
      }
      var i = t.prototype;
      return i.toggle = function () {
        e(this._element).hasClass(B) ? this.hide() : this.show()
      }, i.show = function () {
        var i, s, n = this;
        if (!this._isTransitioning && !e(this._element).hasClass(B) && (this._parent && 0 === (i = [].slice.call(this._parent.querySelectorAll(".show, .collapsing")).filter(function (t) {
            return "string" == typeof n._config.parent ? t.getAttribute("data-parent") === n._config.parent : t.classList.contains(Q)
          })).length && (i = null), !(i && (s = e(i).not(this._selector).data(W)) && s._isTransitioning))) {
          var o = e.Event(F.SHOW);
          if (e(this._element).trigger(o), !o.isDefaultPrevented()) {
            i && (t._jQueryInterface.call(e(i).not(this._selector), "hide"), s || e(i).data(W, null));
            var r = this._getDimension();
            e(this._element).removeClass(Q).addClass(K), this._element.style[r] = 0, this._triggerArray.length && e(this._triggerArray).removeClass(Y).attr("aria-expanded", !0), this.setTransitioning(!0);
            var l = "scroll" + (r[0].toUpperCase() + r.slice(1)),
              c = a.getTransitionDurationFromElement(this._element);
            e(this._element).one(a.TRANSITION_END, function () {
              e(n._element).removeClass(K).addClass(Q).addClass(B), n._element.style[r] = "", n.setTransitioning(!1), e(n._element).trigger(F.SHOWN)
            }).emulateTransitionEnd(c), this._element.style[r] = this._element[l] + "px"
          }
        }
      }, i.hide = function () {
        var t = this;
        if (!this._isTransitioning && e(this._element).hasClass(B)) {
          var i = e.Event(F.HIDE);
          if (e(this._element).trigger(i), !i.isDefaultPrevented()) {
            var s = this._getDimension();
            this._element.style[s] = this._element.getBoundingClientRect()[s] + "px", a.reflow(this._element), e(this._element).addClass(K).removeClass(Q).removeClass(B);
            var n = this._triggerArray.length;
            if (0 < n)
              for (var o = 0; o < n; o++) {
                var r = this._triggerArray[o],
                  l = a.getSelectorFromElement(r);
                null !== l && (e([].slice.call(document.querySelectorAll(l))).hasClass(B) || e(r).addClass(Y).attr("aria-expanded", !1))
              }
            this.setTransitioning(!0), this._element.style[s] = "";
            var c = a.getTransitionDurationFromElement(this._element);
            e(this._element).one(a.TRANSITION_END, function () {
              t.setTransitioning(!1), e(t._element).removeClass(K).addClass(Q).trigger(F.HIDDEN)
            }).emulateTransitionEnd(c)
          }
        }
      }, i.setTransitioning = function (t) {
        this._isTransitioning = t
      }, i.dispose = function () {
        e.removeData(this._element, W), this._config = null, this._parent = null, this._element = null, this._triggerArray = null, this._isTransitioning = null
      }, i._getConfig = function (t) {
        return (t = o({}, M, t)).toggle = Boolean(t.toggle), a.typeCheckConfig(j, t, U), t
      }, i._getDimension = function () {
        return e(this._element).hasClass(V) ? V : "height"
      }, i._getParent = function () {
        var i, s = this;
        a.isElement(this._config.parent) ? (i = this._config.parent, void 0 !== this._config.parent.jquery && (i = this._config.parent[0])) : i = document.querySelector(this._config.parent);
        var n = '[data-toggle="collapse"][data-parent="' + this._config.parent + '"]';
        return e([].slice.call(i.querySelectorAll(n))).each(function (e, i) {
          s._addAriaAndCollapsedClass(t._getTargetFromElement(i), [i])
        }), i
      }, i._addAriaAndCollapsedClass = function (t, i) {
        var s = e(t).hasClass(B);
        i.length && e(i).toggleClass(Y, !s).attr("aria-expanded", s)
      }, t._getTargetFromElement = function (t) {
        var e = a.getSelectorFromElement(t);
        return e ? document.querySelector(e) : null
      }, t._jQueryInterface = function (i) {
        return this.each(function () {
          var s = e(this),
            n = s.data(W),
            r = o({}, M, s.data(), "object" == typeof i && i ? i : {});
          if (!n && r.toggle && /show|hide/.test(i) && (r.toggle = !1), n || (n = new t(this, r), s.data(W, n)), "string" == typeof i) {
            if (void 0 === n[i]) throw TypeError('No method named "' + i + '"');
            n[i]()
          }
        })
      }, n(t, null, [{
        key: "VERSION",
        get: function () {
          return "4.3.1"
        }
      }, {
        key: "Default",
        get: function () {
          return M
        }
      }]), t
    }();
  e(document).on(F.CLICK_DATA_API, X, function (t) {
    "A" === t.currentTarget.tagName && t.preventDefault();
    var i = e(this),
      s = a.getSelectorFromElement(this);
    e([].slice.call(document.querySelectorAll(s))).each(function () {
      var t = e(this),
        s = t.data(W) ? "toggle" : i.data();
      Z._jQueryInterface.call(t, s)
    })
  }), e.fn[j] = Z._jQueryInterface, e.fn[j].Constructor = Z, e.fn[j].noConflict = function () {
    return e.fn[j] = q, Z._jQueryInterface
  };
  var G = "dropdown",
    J = "bs.dropdown",
    tt = "." + J,
    te = ".data-api",
    ti = e.fn[G],
    ts = RegExp("38|40|27"),
    tn = {
      HIDE: "hide" + tt,
      HIDDEN: "hidden" + tt,
      SHOW: "show" + tt,
      SHOWN: "shown" + tt,
      CLICK: "click" + tt,
      CLICK_DATA_API: "click" + tt + te,
      KEYDOWN_DATA_API: "keydown" + tt + te,
      KEYUP_DATA_API: "keyup" + tt + te
    },
    to = "disabled",
    tr = "show",
    ta = "dropdown-menu-right",
    tl = '[data-toggle="dropdown"]',
    tc = ".dropdown-menu",
    th = "bottom-start",
    td = {
      offset: 0,
      flip: !0,
      boundary: "scrollParent",
      reference: "toggle",
      display: "dynamic"
    },
    tu = {
      offset: "(number|string|function)",
      flip: "boolean",
      boundary: "(string|element)",
      reference: "(string|element)",
      display: "string"
    },
    tp = function () {
      function t(t, e) {
        this._element = t, this._popper = null, this._config = this._getConfig(e), this._menu = this._getMenuElement(), this._inNavbar = this._detectNavbar(), this._addEventListeners()
      }
      var s = t.prototype;
      return s.toggle = function () {
        if (!this._element.disabled && !e(this._element).hasClass(to)) {
          var s = t._getParentFromElement(this._element),
            n = e(this._menu).hasClass(tr);
          if (t._clearMenus(), !n) {
            var o = {
                relatedTarget: this._element
              },
              r = e.Event(tn.SHOW, o);
            if (e(s).trigger(r), !r.isDefaultPrevented()) {
              if (!this._inNavbar) {
                if (void 0 === i) throw TypeError("Bootstrap's dropdowns require Popper.js (https://popper.js.org/)");
                var l = this._element;
                "parent" === this._config.reference ? l = s : a.isElement(this._config.reference) && (l = this._config.reference, void 0 !== this._config.reference.jquery && (l = this._config.reference[0])), "scrollParent" !== this._config.boundary && e(s).addClass("position-static"), this._popper = new i(l, this._menu, this._getPopperConfig())
              }
              "ontouchstart" in document.documentElement && 0 === e(s).closest(".navbar-nav").length && e(document.body).children().on("mouseover", null, e.noop), this._element.focus(), this._element.setAttribute("aria-expanded", !0), e(this._menu).toggleClass(tr), e(s).toggleClass(tr).trigger(e.Event(tn.SHOWN, o))
            }
          }
        }
      }, s.show = function () {
        if (!(this._element.disabled || e(this._element).hasClass(to) || e(this._menu).hasClass(tr))) {
          var i = {
              relatedTarget: this._element
            },
            s = e.Event(tn.SHOW, i),
            n = t._getParentFromElement(this._element);
          e(n).trigger(s), s.isDefaultPrevented() || (e(this._menu).toggleClass(tr), e(n).toggleClass(tr).trigger(e.Event(tn.SHOWN, i)))
        }
      }, s.hide = function () {
        if (!this._element.disabled && !e(this._element).hasClass(to) && e(this._menu).hasClass(tr)) {
          var i = {
              relatedTarget: this._element
            },
            s = e.Event(tn.HIDE, i),
            n = t._getParentFromElement(this._element);
          e(n).trigger(s), s.isDefaultPrevented() || (e(this._menu).toggleClass(tr), e(n).toggleClass(tr).trigger(e.Event(tn.HIDDEN, i)))
        }
      }, s.dispose = function () {
        e.removeData(this._element, J), e(this._element).off(tt), this._element = null, (this._menu = null) !== this._popper && (this._popper.destroy(), this._popper = null)
      }, s.update = function () {
        this._inNavbar = this._detectNavbar(), null !== this._popper && this._popper.scheduleUpdate()
      }, s._addEventListeners = function () {
        var t = this;
        e(this._element).on(tn.CLICK, function (e) {
          e.preventDefault(), e.stopPropagation(), t.toggle()
        })
      }, s._getConfig = function (t) {
        return t = o({}, this.constructor.Default, e(this._element).data(), t), a.typeCheckConfig(G, t, this.constructor.DefaultType), t
      }, s._getMenuElement = function () {
        if (!this._menu) {
          var e = t._getParentFromElement(this._element);
          e && (this._menu = e.querySelector(tc))
        }
        return this._menu
      }, s._getPlacement = function () {
        var t = e(this._element.parentNode),
          i = th;
        return t.hasClass("dropup") ? (i = "top-start", e(this._menu).hasClass(ta) && (i = "top-end")) : t.hasClass("dropright") ? i = "right-start" : t.hasClass("dropleft") ? i = "left-start" : e(this._menu).hasClass(ta) && (i = "bottom-end"), i
      }, s._detectNavbar = function () {
        return 0 < e(this._element).closest(".navbar").length
      }, s._getOffset = function () {
        var t = this,
          e = {};
        return "function" == typeof this._config.offset ? e.fn = function (e) {
          return e.offsets = o({}, e.offsets, t._config.offset(e.offsets, t._element) || {}), e
        } : e.offset = this._config.offset, e
      }, s._getPopperConfig = function () {
        var t = {
          placement: this._getPlacement(),
          modifiers: {
            offset: this._getOffset(),
            flip: {
              enabled: this._config.flip
            },
            preventOverflow: {
              boundariesElement: this._config.boundary
            }
          }
        };
        return "static" === this._config.display && (t.modifiers.applyStyle = {
          enabled: !1
        }), t
      }, t._jQueryInterface = function (i) {
        return this.each(function () {
          var s = e(this).data(J);
          if (s || (s = new t(this, "object" == typeof i ? i : null), e(this).data(J, s)), "string" == typeof i) {
            if (void 0 === s[i]) throw TypeError('No method named "' + i + '"');
            s[i]()
          }
        })
      }, t._clearMenus = function (i) {
        if (!i || 3 !== i.which && ("keyup" !== i.type || 9 === i.which))
          for (var s = [].slice.call(document.querySelectorAll(tl)), n = 0, o = s.length; n < o; n++) {
            var r = t._getParentFromElement(s[n]),
              a = e(s[n]).data(J),
              l = {
                relatedTarget: s[n]
              };
            if (i && "click" === i.type && (l.clickEvent = i), a) {
              var c = a._menu;
              if (e(r).hasClass(tr) && !(i && ("click" === i.type && /input|textarea/i.test(i.target.tagName) || "keyup" === i.type && 9 === i.which) && e.contains(r, i.target))) {
                var h = e.Event(tn.HIDE, l);
                e(r).trigger(h), h.isDefaultPrevented() || ("ontouchstart" in document.documentElement && e(document.body).children().off("mouseover", null, e.noop), s[n].setAttribute("aria-expanded", "false"), e(c).removeClass(tr), e(r).removeClass(tr).trigger(e.Event(tn.HIDDEN, l)))
              }
            }
          }
      }, t._getParentFromElement = function (t) {
        var e, i = a.getSelectorFromElement(t);
        return i && (e = document.querySelector(i)), e || t.parentNode
      }, t._dataApiKeydownHandler = function (i) {
        if ((/input|textarea/i.test(i.target.tagName) ? !(32 === i.which || 27 !== i.which && (40 !== i.which && 38 !== i.which || e(i.target).closest(tc).length)) : ts.test(i.which)) && (i.preventDefault(), i.stopPropagation(), !this.disabled && !e(this).hasClass(to))) {
          var s = t._getParentFromElement(this),
            n = e(s).hasClass(tr);
          if (n && (!n || 27 !== i.which && 32 !== i.which)) {
            var o = [].slice.call(s.querySelectorAll(".dropdown-menu .dropdown-item:not(.disabled):not(:disabled)"));
            if (0 !== o.length) {
              var r = o.indexOf(i.target);
              38 === i.which && 0 < r && r--, 40 === i.which && r < o.length - 1 && r++, r < 0 && (r = 0), o[r].focus()
            }
          } else {
            if (27 === i.which) {
              var a = s.querySelector(tl);
              e(a).trigger("focus")
            }
            e(this).trigger("click")
          }
        }
      }, n(t, null, [{
        key: "VERSION",
        get: function () {
          return "4.3.1"
        }
      }, {
        key: "Default",
        get: function () {
          return td
        }
      }, {
        key: "DefaultType",
        get: function () {
          return tu
        }
      }]), t
    }();
  e(document).on(tn.KEYDOWN_DATA_API, tl, tp._dataApiKeydownHandler).on(tn.KEYDOWN_DATA_API, tc, tp._dataApiKeydownHandler).on(tn.CLICK_DATA_API + " " + tn.KEYUP_DATA_API, tp._clearMenus).on(tn.CLICK_DATA_API, tl, function (t) {
    t.preventDefault(), t.stopPropagation(), tp._jQueryInterface.call(e(this), "toggle")
  }).on(tn.CLICK_DATA_API, ".dropdown form", function (t) {
    t.stopPropagation()
  }), e.fn[G] = tp._jQueryInterface, e.fn[G].Constructor = tp, e.fn[G].noConflict = function () {
    return e.fn[G] = ti, tp._jQueryInterface
  };
  var tf = "modal",
    tg = "bs.modal",
    tm = "." + tg,
    tv = e.fn[tf],
    t8 = {
      backdrop: !0,
      keyboard: !0,
      focus: !0,
      show: !0
    },
    ty = {
      backdrop: "(boolean|string)",
      keyboard: "boolean",
      focus: "boolean",
      show: "boolean"
    },
    tw = {
      HIDE: "hide" + tm,
      HIDDEN: "hidden" + tm,
      SHOW: "show" + tm,
      SHOWN: "shown" + tm,
      FOCUSIN: "focusin" + tm,
      RESIZE: "resize" + tm,
      CLICK_DISMISS: "click.dismiss" + tm,
      KEYDOWN_DISMISS: "keydown.dismiss" + tm,
      MOUSEUP_DISMISS: "mouseup.dismiss" + tm,
      MOUSEDOWN_DISMISS: "mousedown.dismiss" + tm,
      CLICK_DATA_API: "click" + tm + ".data-api"
    },
    t$ = "modal-open",
    tb = "fade",
    tC = "show",
    tS = ".fixed-top, .fixed-bottom, .is-fixed, .sticky-top",
    tT = ".sticky-top",
    tk = function () {
      function t(t, e) {
        this._config = this._getConfig(e), this._element = t, this._dialog = t.querySelector(".modal-dialog"), this._backdrop = null, this._isShown = !1, this._isBodyOverflowing = !1, this._ignoreBackdropClick = !1, this._isTransitioning = !1, this._scrollbarWidth = 0
      }
      var i = t.prototype;
      return i.toggle = function (t) {
        return this._isShown ? this.hide() : this.show(t)
      }, i.show = function (t) {
        var i = this;
        if (!this._isShown && !this._isTransitioning) {
          e(this._element).hasClass(tb) && (this._isTransitioning = !0);
          var s = e.Event(tw.SHOW, {
            relatedTarget: t
          });
          e(this._element).trigger(s), this._isShown || s.isDefaultPrevented() || (this._isShown = !0, this._checkScrollbar(), this._setScrollbar(), this._adjustDialog(), this._setEscapeEvent(), this._setResizeEvent(), e(this._element).on(tw.CLICK_DISMISS, '[data-dismiss="modal"]', function (t) {
            return i.hide(t)
          }), e(this._dialog).on(tw.MOUSEDOWN_DISMISS, function () {
            e(i._element).one(tw.MOUSEUP_DISMISS, function (t) {
              e(t.target).is(i._element) && (i._ignoreBackdropClick = !0)
            })
          }), this._showBackdrop(function () {
            return i._showElement(t)
          }))
        }
      }, i.hide = function (t) {
        var i = this;
        if (t && t.preventDefault(), this._isShown && !this._isTransitioning) {
          var s = e.Event(tw.HIDE);
          if (e(this._element).trigger(s), this._isShown && !s.isDefaultPrevented()) {
            this._isShown = !1;
            var n = e(this._element).hasClass(tb);
            if (n && (this._isTransitioning = !0), this._setEscapeEvent(), this._setResizeEvent(), e(document).off(tw.FOCUSIN), e(this._element).removeClass(tC), e(this._element).off(tw.CLICK_DISMISS), e(this._dialog).off(tw.MOUSEDOWN_DISMISS), n) {
              var o = a.getTransitionDurationFromElement(this._element);
              e(this._element).one(a.TRANSITION_END, function (t) {
                return i._hideModal(t)
              }).emulateTransitionEnd(o)
            } else this._hideModal()
          }
        }
      }, i.dispose = function () {
        [window, this._element, this._dialog].forEach(function (t) {
          return e(t).off(tm)
        }), e(document).off(tw.FOCUSIN), e.removeData(this._element, tg), this._config = null, this._element = null, this._dialog = null, this._backdrop = null, this._isShown = null, this._isBodyOverflowing = null, this._ignoreBackdropClick = null, this._isTransitioning = null, this._scrollbarWidth = null
      }, i.handleUpdate = function () {
        this._adjustDialog()
      }, i._getConfig = function (t) {
        return t = o({}, t8, t), a.typeCheckConfig(tf, t, ty), t
      }, i._showElement = function (t) {
        var i = this,
          s = e(this._element).hasClass(tb);
        this._element.parentNode && this._element.parentNode.nodeType === Node.ELEMENT_NODE || document.body.appendChild(this._element), this._element.style.display = "block", this._element.removeAttribute("aria-hidden"), this._element.setAttribute("aria-modal", !0), e(this._dialog).hasClass("modal-dialog-scrollable") ? this._dialog.querySelector(".modal-body").scrollTop = 0 : this._element.scrollTop = 0, s && a.reflow(this._element), e(this._element).addClass(tC), this._config.focus && this._enforceFocus();
        var n = e.Event(tw.SHOWN, {
            relatedTarget: t
          }),
          o = function () {
            i._config.focus && i._element.focus(), i._isTransitioning = !1, e(i._element).trigger(n)
          };
        if (s) {
          var r = a.getTransitionDurationFromElement(this._dialog);
          e(this._dialog).one(a.TRANSITION_END, o).emulateTransitionEnd(r)
        } else o()
      }, i._enforceFocus = function () {
        var t = this;
        e(document).off(tw.FOCUSIN).on(tw.FOCUSIN, function (i) {
          document !== i.target && t._element !== i.target && 0 === e(t._element).has(i.target).length && t._element.focus()
        })
      }, i._setEscapeEvent = function () {
        var t = this;
        this._isShown && this._config.keyboard ? e(this._element).on(tw.KEYDOWN_DISMISS, function (e) {
          27 === e.which && (e.preventDefault(), t.hide())
        }) : this._isShown || e(this._element).off(tw.KEYDOWN_DISMISS)
      }, i._setResizeEvent = function () {
        var t = this;
        this._isShown ? e(window).on(tw.RESIZE, function (e) {
          return t.handleUpdate(e)
        }) : e(window).off(tw.RESIZE)
      }, i._hideModal = function () {
        var t = this;
        this._element.style.display = "none", this._element.setAttribute("aria-hidden", !0), this._element.removeAttribute("aria-modal"), this._isTransitioning = !1, this._showBackdrop(function () {
          e(document.body).removeClass(t$), t._resetAdjustments(), t._resetScrollbar(), e(t._element).trigger(tw.HIDDEN)
        })
      }, i._removeBackdrop = function () {
        this._backdrop && (e(this._backdrop).remove(), this._backdrop = null)
      }, i._showBackdrop = function (t) {
        var i = this,
          s = e(this._element).hasClass(tb) ? tb : "";
        if (this._isShown && this._config.backdrop) {
          if (this._backdrop = document.createElement("div"), this._backdrop.className = "modal-backdrop", s && this._backdrop.classList.add(s), e(this._backdrop).appendTo(document.body), e(this._element).on(tw.CLICK_DISMISS, function (t) {
              i._ignoreBackdropClick ? i._ignoreBackdropClick = !1 : t.target === t.currentTarget && ("static" === i._config.backdrop ? i._element.focus() : i.hide())
            }), s && a.reflow(this._backdrop), e(this._backdrop).addClass(tC), !t) return;
          if (!s) return void t();
          var n = a.getTransitionDurationFromElement(this._backdrop);
          e(this._backdrop).one(a.TRANSITION_END, t).emulateTransitionEnd(n)
        } else if (!this._isShown && this._backdrop) {
          e(this._backdrop).removeClass(tC);
          var o = function () {
            i._removeBackdrop(), t && t()
          };
          if (e(this._element).hasClass(tb)) {
            var r = a.getTransitionDurationFromElement(this._backdrop);
            e(this._backdrop).one(a.TRANSITION_END, o).emulateTransitionEnd(r)
          } else o()
        } else t && t()
      }, i._adjustDialog = function () {
        var t = this._element.scrollHeight > document.documentElement.clientHeight;
        !this._isBodyOverflowing && t && (this._element.style.paddingLeft = this._scrollbarWidth + "px"), this._isBodyOverflowing && !t && (this._element.style.paddingRight = this._scrollbarWidth + "px")
      }, i._resetAdjustments = function () {
        this._element.style.paddingLeft = "", this._element.style.paddingRight = ""
      }, i._checkScrollbar = function () {
        var t = document.body.getBoundingClientRect();
        this._isBodyOverflowing = t.left + t.right < window.innerWidth, this._scrollbarWidth = this._getScrollbarWidth()
      }, i._setScrollbar = function () {
        var t = this;
        if (this._isBodyOverflowing) {
          var i = [].slice.call(document.querySelectorAll(tS)),
            s = [].slice.call(document.querySelectorAll(tT));
          e(i).each(function (i, s) {
            var n = s.style.paddingRight,
              o = e(s).css("padding-right");
            e(s).data("padding-right", n).css("padding-right", parseFloat(o) + t._scrollbarWidth + "px")
          }), e(s).each(function (i, s) {
            var n = s.style.marginRight,
              o = e(s).css("margin-right");
            e(s).data("margin-right", n).css("margin-right", parseFloat(o) - t._scrollbarWidth + "px")
          });
          var n = document.body.style.paddingRight,
            o = e(document.body).css("padding-right");
          e(document.body).data("padding-right", n).css("padding-right", parseFloat(o) + this._scrollbarWidth + "px")
        }
        e(document.body).addClass(t$)
      }, i._resetScrollbar = function () {
        var t = [].slice.call(document.querySelectorAll(tS));
        e(t).each(function (t, i) {
          var s = e(i).data("padding-right");
          e(i).removeData("padding-right"), i.style.paddingRight = s || ""
        }), e([].slice.call(document.querySelectorAll("" + tT))).each(function (t, i) {
          var s = e(i).data("margin-right");
          void 0 !== s && e(i).css("margin-right", s).removeData("margin-right")
        });
        var i = e(document.body).data("padding-right");
        e(document.body).removeData("padding-right"), document.body.style.paddingRight = i || ""
      }, i._getScrollbarWidth = function () {
        var t = document.createElement("div");
        t.className = "modal-scrollbar-measure", document.body.appendChild(t);
        var e = t.getBoundingClientRect().width - t.clientWidth;
        return document.body.removeChild(t), e
      }, t._jQueryInterface = function (i, s) {
        return this.each(function () {
          var n = e(this).data(tg),
            r = o({}, t8, e(this).data(), "object" == typeof i && i ? i : {});
          if (n || (n = new t(this, r), e(this).data(tg, n)), "string" == typeof i) {
            if (void 0 === n[i]) throw TypeError('No method named "' + i + '"');
            n[i](s)
          } else r.show && n.show(s)
        })
      }, n(t, null, [{
        key: "VERSION",
        get: function () {
          return "4.3.1"
        }
      }, {
        key: "Default",
        get: function () {
          return t8
        }
      }]), t
    }();
  e(document).on(tw.CLICK_DATA_API, '[data-toggle="modal"]', function (t) {
    var i, s = this,
      n = a.getSelectorFromElement(this);
    n && (i = document.querySelector(n));
    var r = e(i).data(tg) ? "toggle" : o({}, e(i).data(), e(this).data());
    "A" !== this.tagName && "AREA" !== this.tagName || t.preventDefault();
    var l = e(i).one(tw.SHOW, function (t) {
      t.isDefaultPrevented() || l.one(tw.HIDDEN, function () {
        e(s).is(":visible") && s.focus()
      })
    });
    tk._jQueryInterface.call(e(i), r, this)
  }), e.fn[tf] = tk._jQueryInterface, e.fn[tf].Constructor = tk, e.fn[tf].noConflict = function () {
    return e.fn[tf] = tv, tk._jQueryInterface
  };
  var t_ = ["background", "cite", "href", "itemtype", "longdesc", "poster", "src", "xlink:href"],
    tE = /^(?:(?:https?|mailto|ftp|tel|file):|[^&:/?#]*(?:[/?#]|$))/gi,
    tx = /^data:(?:image\/(?:bmp|gif|jpeg|jpg|png|tiff|webp)|video\/(?:mpeg|mp4|ogg|webm)|audio\/(?:mp3|oga|ogg|opus));base64,[a-z0-9+/]+=*$/i;

  function t9(t, e, i) {
    if (0 === t.length) return t;
    if (i && "function" == typeof i) return i(t);
    for (var s = (new window.DOMParser).parseFromString(t, "text/html"), n = Object.keys(e), o = [].slice.call(s.body.querySelectorAll("*")), r = 0, a = o.length; r < a; r++) ! function (t, i) {
      var s = o[t],
        r = s.nodeName.toLowerCase();
      if (-1 === n.indexOf(s.nodeName.toLowerCase())) return s.parentNode.removeChild(s), "continue";
      var a = [].slice.call(s.attributes),
        l = [].concat(e["*"] || [], e[r] || []);
      a.forEach(function (t) {
        (function (t, e) {
          var i = t.nodeName.toLowerCase();
          if (-1 !== e.indexOf(i)) return -1 === t_.indexOf(i) || Boolean(t.nodeValue.match(tE) || t.nodeValue.match(tx));
          for (var s = e.filter(function (t) {
              return t instanceof RegExp
            }), n = 0, o = s.length; n < o; n++)
            if (i.match(s[n])) return !0;
          return !1
        })(t, l) || s.removeAttribute(t.nodeName)
      })
    }(r);
    return s.body.innerHTML
  }
  var tA = "tooltip",
    tD = "bs.tooltip",
    tI = "." + tD,
    tO = e.fn[tA],
    tP = "bs-tooltip",
    tN = RegExp("(^|\\s)" + tP + "\\S+", "g"),
    tz = ["sanitize", "whiteList", "sanitizeFn"],
    tL = {
      animation: "boolean",
      template: "string",
      title: "(string|element|function)",
      trigger: "string",
      delay: "(number|object)",
      html: "boolean",
      selector: "(string|boolean)",
      placement: "(string|function)",
      offset: "(number|string|function)",
      container: "(string|element|boolean)",
      fallbackPlacement: "(string|array)",
      boundary: "(string|element)",
      sanitize: "boolean",
      sanitizeFn: "(null|function)",
      whiteList: "object"
    },
    tH = {
      AUTO: "auto",
      TOP: "top",
      RIGHT: "right",
      BOTTOM: "bottom",
      LEFT: "left"
    },
    tj = {
      animation: !0,
      template: '<div class="tooltip" role="tooltip"><div class="arrow"></div><div class="tooltip-inner"></div></div>',
      trigger: "hover focus",
      title: "",
      delay: 0,
      html: !1,
      selector: !1,
      placement: "top",
      offset: 0,
      container: !1,
      fallbackPlacement: "flip",
      boundary: "scrollParent",
      sanitize: !0,
      sanitizeFn: null,
      whiteList: {
        "*": ["class", "dir", "id", "lang", "role", /^aria-[\w-]*$/i],
        a: ["target", "href", "title", "rel"],
        area: [],
        b: [],
        br: [],
        col: [],
        code: [],
        div: [],
        em: [],
        hr: [],
        h1: [],
        h2: [],
        h3: [],
        h4: [],
        h5: [],
        h6: [],
        i: [],
        img: ["src", "alt", "title", "width", "height"],
        li: [],
        ol: [],
        p: [],
        pre: [],
        s: [],
        small: [],
        span: [],
        sub: [],
        sup: [],
        strong: [],
        u: [],
        ul: []
      }
    },
    tW = "show",
    t0 = {
      HIDE: "hide" + tI,
      HIDDEN: "hidden" + tI,
      SHOW: "show" + tI,
      SHOWN: "shown" + tI,
      INSERTED: "inserted" + tI,
      CLICK: "click" + tI,
      FOCUSIN: "focusin" + tI,
      FOCUSOUT: "focusout" + tI,
      MOUSEENTER: "mouseenter" + tI,
      MOUSELEAVE: "mouseleave" + tI
    },
    tR = "fade",
    tq = "show",
    tM = "hover",
    t1 = "focus",
    tU = function () {
      function t(t, e) {
        if (void 0 === i) throw TypeError("Bootstrap's tooltips require Popper.js (https://popper.js.org/)");
        this._isEnabled = !0, this._timeout = 0, this._hoverState = "", this._activeTrigger = {}, this._popper = null, this.element = t, this.config = this._getConfig(e), this.tip = null, this._setListeners()
      }
      var s = t.prototype;
      return s.enable = function () {
        this._isEnabled = !0
      }, s.disable = function () {
        this._isEnabled = !1
      }, s.toggleEnabled = function () {
        this._isEnabled = !this._isEnabled
      }, s.toggle = function (t) {
        if (this._isEnabled) {
          if (t) {
            var i = this.constructor.DATA_KEY,
              s = e(t.currentTarget).data(i);
            s || (s = new this.constructor(t.currentTarget, this._getDelegateConfig()), e(t.currentTarget).data(i, s)), s._activeTrigger.click = !s._activeTrigger.click, s._isWithActiveTrigger() ? s._enter(null, s) : s._leave(null, s)
          } else {
            if (e(this.getTipElement()).hasClass(tq)) return void this._leave(null, this);
            this._enter(null, this)
          }
        }
      }, s.dispose = function () {
        clearTimeout(this._timeout), e.removeData(this.element, this.constructor.DATA_KEY), e(this.element).off(this.constructor.EVENT_KEY), e(this.element).closest(".modal").off("hide.bs.modal"), this.tip && e(this.tip).remove(), this._isEnabled = null, this._timeout = null, this._hoverState = null, (this._activeTrigger = null) !== this._popper && this._popper.destroy(), this._popper = null, this.element = null, this.config = null, this.tip = null
      }, s.show = function () {
        var t = this;
        if ("none" === e(this.element).css("display")) throw Error("Please use show on visible elements");
        var s = e.Event(this.constructor.Event.SHOW);
        if (this.isWithContent() && this._isEnabled) {
          e(this.element).trigger(s);
          var n = a.findShadowRoot(this.element),
            o = e.contains(null !== n ? n : this.element.ownerDocument.documentElement, this.element);
          if (s.isDefaultPrevented() || !o) return;
          var r = this.getTipElement(),
            l = a.getUID(this.constructor.NAME);
          r.setAttribute("id", l), this.element.setAttribute("aria-describedby", l), this.setContent(), this.config.animation && e(r).addClass(tR);
          var c = "function" == typeof this.config.placement ? this.config.placement.call(this, r, this.element) : this.config.placement,
            h = this._getAttachment(c);
          this.addAttachmentClass(h);
          var d = this._getContainer();
          e(r).data(this.constructor.DATA_KEY, this), e.contains(this.element.ownerDocument.documentElement, this.tip) || e(r).appendTo(d), e(this.element).trigger(this.constructor.Event.INSERTED), this._popper = new i(this.element, r, {
            placement: h,
            modifiers: {
              offset: this._getOffset(),
              flip: {
                behavior: this.config.fallbackPlacement
              },
              arrow: {
                element: ".arrow"
              },
              preventOverflow: {
                boundariesElement: this.config.boundary
              }
            },
            onCreate: function (e) {
              e.originalPlacement !== e.placement && t._handlePopperPlacementChange(e)
            },
            onUpdate: function (e) {
              return t._handlePopperPlacementChange(e)
            }
          }), e(r).addClass(tq), "ontouchstart" in document.documentElement && e(document.body).children().on("mouseover", null, e.noop);
          var u = function () {
            t.config.animation && t._fixTransition();
            var i = t._hoverState;
            t._hoverState = null, e(t.element).trigger(t.constructor.Event.SHOWN), "out" === i && t._leave(null, t)
          };
          if (e(this.tip).hasClass(tR)) {
            var p = a.getTransitionDurationFromElement(this.tip);
            e(this.tip).one(a.TRANSITION_END, u).emulateTransitionEnd(p)
          } else u()
        }
      }, s.hide = function (t) {
        var i = this,
          s = this.getTipElement(),
          n = e.Event(this.constructor.Event.HIDE),
          o = function () {
            i._hoverState !== tW && s.parentNode && s.parentNode.removeChild(s), i._cleanTipClass(), i.element.removeAttribute("aria-describedby"), e(i.element).trigger(i.constructor.Event.HIDDEN), null !== i._popper && i._popper.destroy(), t && t()
          };
        if (e(this.element).trigger(n), !n.isDefaultPrevented()) {
          if (e(s).removeClass(tq), "ontouchstart" in document.documentElement && e(document.body).children().off("mouseover", null, e.noop), this._activeTrigger.click = !1, this._activeTrigger[t1] = !1, this._activeTrigger[tM] = !1, e(this.tip).hasClass(tR)) {
            var r = a.getTransitionDurationFromElement(s);
            e(s).one(a.TRANSITION_END, o).emulateTransitionEnd(r)
          } else o();
          this._hoverState = ""
        }
      }, s.update = function () {
        null !== this._popper && this._popper.scheduleUpdate()
      }, s.isWithContent = function () {
        return Boolean(this.getTitle())
      }, s.addAttachmentClass = function (t) {
        e(this.getTipElement()).addClass(tP + "-" + t)
      }, s.getTipElement = function () {
        return this.tip = this.tip || e(this.config.template)[0], this.tip
      }, s.setContent = function () {
        var t = this.getTipElement();
        this.setElementContent(e(t.querySelectorAll(".tooltip-inner")), this.getTitle()), e(t).removeClass(tR + " " + tq)
      }, s.setElementContent = function (t, i) {
        "object" == typeof i && (i.nodeType || i.jquery) ? this.config.html ? e(i).parent().is(t) || t.empty().append(i) : t.text(e(i).text()) : this.config.html ? (this.config.sanitize && (i = t9(i, this.config.whiteList, this.config.sanitizeFn)), t.html(i)) : t.text(i)
      }, s.getTitle = function () {
        var t = this.element.getAttribute("data-original-title");
        return t || (t = "function" == typeof this.config.title ? this.config.title.call(this.element) : this.config.title), t
      }, s._getOffset = function () {
        var t = this,
          e = {};
        return "function" == typeof this.config.offset ? e.fn = function (e) {
          return e.offsets = o({}, e.offsets, t.config.offset(e.offsets, t.element) || {}), e
        } : e.offset = this.config.offset, e
      }, s._getContainer = function () {
        return !1 === this.config.container ? document.body : a.isElement(this.config.container) ? e(this.config.container) : e(document).find(this.config.container)
      }, s._getAttachment = function (t) {
        return tH[t.toUpperCase()]
      }, s._setListeners = function () {
        var t = this;
        this.config.trigger.split(" ").forEach(function (i) {
          if ("click" === i) e(t.element).on(t.constructor.Event.CLICK, t.config.selector, function (e) {
            return t.toggle(e)
          });
          else if ("manual" !== i) {
            var s = i === tM ? t.constructor.Event.MOUSEENTER : t.constructor.Event.FOCUSIN,
              n = i === tM ? t.constructor.Event.MOUSELEAVE : t.constructor.Event.FOCUSOUT;
            e(t.element).on(s, t.config.selector, function (e) {
              return t._enter(e)
            }).on(n, t.config.selector, function (e) {
              return t._leave(e)
            })
          }
        }), e(this.element).closest(".modal").on("hide.bs.modal", function () {
          t.element && t.hide()
        }), this.config.selector ? this.config = o({}, this.config, {
          trigger: "manual",
          selector: ""
        }) : this._fixTitle()
      }, s._fixTitle = function () {
        var t = typeof this.element.getAttribute("data-original-title");
        (this.element.getAttribute("title") || "string" !== t) && (this.element.setAttribute("data-original-title", this.element.getAttribute("title") || ""), this.element.setAttribute("title", ""))
      }, s._enter = function (t, i) {
        var s = this.constructor.DATA_KEY;
        (i = i || e(t.currentTarget).data(s)) || (i = new this.constructor(t.currentTarget, this._getDelegateConfig()), e(t.currentTarget).data(s, i)), t && (i._activeTrigger["focusin" === t.type ? t1 : tM] = !0), e(i.getTipElement()).hasClass(tq) || i._hoverState === tW ? i._hoverState = tW : (clearTimeout(i._timeout), i._hoverState = tW, i.config.delay && i.config.delay.show ? i._timeout = setTimeout(function () {
          i._hoverState === tW && i.show()
        }, i.config.delay.show) : i.show())
      }, s._leave = function (t, i) {
        var s = this.constructor.DATA_KEY;
        (i = i || e(t.currentTarget).data(s)) || (i = new this.constructor(t.currentTarget, this._getDelegateConfig()), e(t.currentTarget).data(s, i)), t && (i._activeTrigger["focusout" === t.type ? t1 : tM] = !1), i._isWithActiveTrigger() || (clearTimeout(i._timeout), i._hoverState = "out", i.config.delay && i.config.delay.hide ? i._timeout = setTimeout(function () {
          "out" === i._hoverState && i.hide()
        }, i.config.delay.hide) : i.hide())
      }, s._isWithActiveTrigger = function () {
        for (var t in this._activeTrigger)
          if (this._activeTrigger[t]) return !0;
        return !1
      }, s._getConfig = function (t) {
        var i = e(this.element).data();
        return Object.keys(i).forEach(function (t) {
          -1 !== tz.indexOf(t) && delete i[t]
        }), "number" == typeof (t = o({}, this.constructor.Default, i, "object" == typeof t && t ? t : {})).delay && (t.delay = {
          show: t.delay,
          hide: t.delay
        }), "number" == typeof t.title && (t.title = t.title.toString()), "number" == typeof t.content && (t.content = t.content.toString()), a.typeCheckConfig(tA, t, this.constructor.DefaultType), t.sanitize && (t.template = t9(t.template, t.whiteList, t.sanitizeFn)), t
      }, s._getDelegateConfig = function () {
        var t = {};
        if (this.config)
          for (var e in this.config) this.constructor.Default[e] !== this.config[e] && (t[e] = this.config[e]);
        return t
      }, s._cleanTipClass = function () {
        var t = e(this.getTipElement()),
          i = t.attr("class").match(tN);
        null !== i && i.length && t.removeClass(i.join(""))
      }, s._handlePopperPlacementChange = function (t) {
        var e = t.instance;
        this.tip = e.popper, this._cleanTipClass(), this.addAttachmentClass(this._getAttachment(t.placement))
      }, s._fixTransition = function () {
        var t = this.getTipElement(),
          i = this.config.animation;
        null === t.getAttribute("x-placement") && (e(t).removeClass(tR), this.config.animation = !1, this.hide(), this.show(), this.config.animation = i)
      }, t._jQueryInterface = function (i) {
        return this.each(function () {
          var s = e(this).data(tD);
          if ((s || !/dispose|hide/.test(i)) && (s || (s = new t(this, "object" == typeof i && i), e(this).data(tD, s)), "string" == typeof i)) {
            if (void 0 === s[i]) throw TypeError('No method named "' + i + '"');
            s[i]()
          }
        })
      }, n(t, null, [{
        key: "VERSION",
        get: function () {
          return "4.3.1"
        }
      }, {
        key: "Default",
        get: function () {
          return tj
        }
      }, {
        key: "NAME",
        get: function () {
          return tA
        }
      }, {
        key: "DATA_KEY",
        get: function () {
          return tD
        }
      }, {
        key: "Event",
        get: function () {
          return t0
        }
      }, {
        key: "EVENT_KEY",
        get: function () {
          return tI
        }
      }, {
        key: "DefaultType",
        get: function () {
          return tL
        }
      }]), t
    }();
  e.fn[tA] = tU._jQueryInterface, e.fn[tA].Constructor = tU, e.fn[tA].noConflict = function () {
    return e.fn[tA] = tO, tU._jQueryInterface
  };
  var tF = "popover",
    t3 = "bs.popover",
    tB = "." + t3,
    tQ = e.fn[tF],
    tK = "bs-popover",
    t2 = RegExp("(^|\\s)" + tK + "\\S+", "g"),
    tY = o({}, tU.Default, {
      placement: "right",
      trigger: "click",
      content: "",
      template: '<div class="popover" role="tooltip"><div class="arrow"></div><h3 class="popover-header"></h3><div class="popover-body"></div></div>'
    }),
    tV = o({}, tU.DefaultType, {
      content: "(string|element|function)"
    }),
    tX = {
      HIDE: "hide" + tB,
      HIDDEN: "hidden" + tB,
      SHOW: "show" + tB,
      SHOWN: "shown" + tB,
      INSERTED: "inserted" + tB,
      CLICK: "click" + tB,
      FOCUSIN: "focusin" + tB,
      FOCUSOUT: "focusout" + tB,
      MOUSEENTER: "mouseenter" + tB,
      MOUSELEAVE: "mouseleave" + tB
    },
    t5 = function (t) {
      function i() {
        return t.apply(this, arguments) || this
      }
      o = t, (s = i).prototype = Object.create(o.prototype), (s.prototype.constructor = s).__proto__ = o;
      var s, o, r = i.prototype;
      return r.isWithContent = function () {
        return this.getTitle() || this._getContent()
      }, r.addAttachmentClass = function (t) {
        e(this.getTipElement()).addClass(tK + "-" + t)
      }, r.getTipElement = function () {
        return this.tip = this.tip || e(this.config.template)[0], this.tip
      }, r.setContent = function () {
        var t = e(this.getTipElement());
        this.setElementContent(t.find(".popover-header"), this.getTitle());
        var i = this._getContent();
        "function" == typeof i && (i = i.call(this.element)), this.setElementContent(t.find(".popover-body"), i), t.removeClass("fade show")
      }, r._getContent = function () {
        return this.element.getAttribute("data-content") || this.config.content
      }, r._cleanTipClass = function () {
        var t = e(this.getTipElement()),
          i = t.attr("class").match(t2);
        null !== i && 0 < i.length && t.removeClass(i.join(""))
      }, i._jQueryInterface = function (t) {
        return this.each(function () {
          var s = e(this).data(t3);
          if ((s || !/dispose|hide/.test(t)) && (s || (s = new i(this, "object" == typeof t ? t : null), e(this).data(t3, s)), "string" == typeof t)) {
            if (void 0 === s[t]) throw TypeError('No method named "' + t + '"');
            s[t]()
          }
        })
      }, n(i, null, [{
        key: "VERSION",
        get: function () {
          return "4.3.1"
        }
      }, {
        key: "Default",
        get: function () {
          return tY
        }
      }, {
        key: "NAME",
        get: function () {
          return tF
        }
      }, {
        key: "DATA_KEY",
        get: function () {
          return t3
        }
      }, {
        key: "Event",
        get: function () {
          return tX
        }
      }, {
        key: "EVENT_KEY",
        get: function () {
          return tB
        }
      }, {
        key: "DefaultType",
        get: function () {
          return tV
        }
      }]), i
    }(tU);
  e.fn[tF] = t5._jQueryInterface, e.fn[tF].Constructor = t5, e.fn[tF].noConflict = function () {
    return e.fn[tF] = tQ, t5._jQueryInterface
  };
  var t6 = "scrollspy",
    t4 = "bs.scrollspy",
    t7 = "." + t4,
    tZ = e.fn[t6],
    tG = {
      offset: 10,
      method: "auto",
      target: ""
    },
    tJ = {
      offset: "number",
      method: "string",
      target: "(string|element)"
    },
    et = {
      ACTIVATE: "activate" + t7,
      SCROLL: "scroll" + t7,
      LOAD_DATA_API: "load" + t7 + ".data-api"
    },
    ee = "active",
    ei = ".nav, .list-group",
    es = ".nav-link",
    en = ".list-group-item",
    eo = "position",
    er = function () {
      function t(t, i) {
        var s = this;
        this._element = t, this._scrollElement = "BODY" === t.tagName ? window : t, this._config = this._getConfig(i), this._selector = this._config.target + " " + es + "," + this._config.target + " " + en + "," + this._config.target + " .dropdown-item", this._offsets = [], this._targets = [], this._activeTarget = null, this._scrollHeight = 0, e(this._scrollElement).on(et.SCROLL, function (t) {
          return s._process(t)
        }), this.refresh(), this._process()
      }
      var i = t.prototype;
      return i.refresh = function () {
        var t = this,
          i = this._scrollElement === this._scrollElement.window ? "offset" : eo,
          s = "auto" === this._config.method ? i : this._config.method,
          n = s === eo ? this._getScrollTop() : 0;
        this._offsets = [], this._targets = [], this._scrollHeight = this._getScrollHeight(), [].slice.call(document.querySelectorAll(this._selector)).map(function (t) {
          var i, o = a.getSelectorFromElement(t);
          if (o && (i = document.querySelector(o)), i) {
            var r = i.getBoundingClientRect();
            if (r.width || r.height) return [e(i)[s]().top + n, o]
          }
          return null
        }).filter(function (t) {
          return t
        }).sort(function (t, e) {
          return t[0] - e[0]
        }).forEach(function (e) {
          t._offsets.push(e[0]), t._targets.push(e[1])
        })
      }, i.dispose = function () {
        e.removeData(this._element, t4), e(this._scrollElement).off(t7), this._element = null, this._scrollElement = null, this._config = null, this._selector = null, this._offsets = null, this._targets = null, this._activeTarget = null, this._scrollHeight = null
      }, i._getConfig = function (t) {
        if ("string" != typeof (t = o({}, tG, "object" == typeof t && t ? t : {})).target) {
          var i = e(t.target).attr("id");
          i || (i = a.getUID(t6), e(t.target).attr("id", i)), t.target = "#" + i
        }
        return a.typeCheckConfig(t6, t, tJ), t
      }, i._getScrollTop = function () {
        return this._scrollElement === window ? this._scrollElement.pageYOffset : this._scrollElement.scrollTop
      }, i._getScrollHeight = function () {
        return this._scrollElement.scrollHeight || Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)
      }, i._getOffsetHeight = function () {
        return this._scrollElement === window ? window.innerHeight : this._scrollElement.getBoundingClientRect().height
      }, i._process = function () {
        var t = this._getScrollTop() + this._config.offset,
          e = this._getScrollHeight(),
          i = this._config.offset + e - this._getOffsetHeight();
        if (this._scrollHeight !== e && this.refresh(), i <= t) {
          var s = this._targets[this._targets.length - 1];
          this._activeTarget !== s && this._activate(s)
        } else {
          if (this._activeTarget && t < this._offsets[0] && 0 < this._offsets[0]) return this._activeTarget = null, void this._clear();
          for (var n = this._offsets.length; n--;) this._activeTarget !== this._targets[n] && t >= this._offsets[n] && (void 0 === this._offsets[n + 1] || t < this._offsets[n + 1]) && this._activate(this._targets[n])
        }
      }, i._activate = function (t) {
        this._activeTarget = t, this._clear();
        var i = this._selector.split(",").map(function (e) {
            return e + '[data-target="' + t + '"],' + e + '[href="' + t + '"]'
          }),
          s = e([].slice.call(document.querySelectorAll(i.join(","))));
        s.hasClass("dropdown-item") ? (s.closest(".dropdown").find(".dropdown-toggle").addClass(ee), s.addClass(ee)) : (s.addClass(ee), s.parents(ei).prev(es + ", " + en).addClass(ee), s.parents(ei).prev(".nav-item").children(es).addClass(ee)), e(this._scrollElement).trigger(et.ACTIVATE, {
          relatedTarget: t
        })
      }, i._clear = function () {
        [].slice.call(document.querySelectorAll(this._selector)).filter(function (t) {
          return t.classList.contains(ee)
        }).forEach(function (t) {
          return t.classList.remove(ee)
        })
      }, t._jQueryInterface = function (i) {
        return this.each(function () {
          var s = e(this).data(t4);
          if (s || (s = new t(this, "object" == typeof i && i), e(this).data(t4, s)), "string" == typeof i) {
            if (void 0 === s[i]) throw TypeError('No method named "' + i + '"');
            s[i]()
          }
        })
      }, n(t, null, [{
        key: "VERSION",
        get: function () {
          return "4.3.1"
        }
      }, {
        key: "Default",
        get: function () {
          return tG
        }
      }]), t
    }();
  e(window).on(et.LOAD_DATA_API, function () {
    for (var t = [].slice.call(document.querySelectorAll('[data-spy="scroll"]')), i = t.length; i--;) {
      var s = e(t[i]);
      er._jQueryInterface.call(s, s.data())
    }
  }), e.fn[t6] = er._jQueryInterface, e.fn[t6].Constructor = er, e.fn[t6].noConflict = function () {
    return e.fn[t6] = tZ, er._jQueryInterface
  };
  var ea = "bs.tab",
    el = "." + ea,
    ec = e.fn.tab,
    eh = {
      HIDE: "hide" + el,
      HIDDEN: "hidden" + el,
      SHOW: "show" + el,
      SHOWN: "shown" + el,
      CLICK_DATA_API: "click" + el + ".data-api"
    },
    ed = "active",
    eu = "fade",
    ep = "show",
    ef = ".active",
    eg = "> li > .active",
    em = function () {
      function t(t) {
        this._element = t
      }
      var i = t.prototype;
      return i.show = function () {
        var t = this;
        if (!(this._element.parentNode && this._element.parentNode.nodeType === Node.ELEMENT_NODE && e(this._element).hasClass(ed) || e(this._element).hasClass("disabled"))) {
          var i, s, n = e(this._element).closest(".nav, .list-group")[0],
            o = a.getSelectorFromElement(this._element);
          if (n) {
            var r = "UL" === n.nodeName || "OL" === n.nodeName ? eg : ef;
            s = (s = e.makeArray(e(n).find(r)))[s.length - 1]
          }
          var l = e.Event(eh.HIDE, {
              relatedTarget: this._element
            }),
            c = e.Event(eh.SHOW, {
              relatedTarget: s
            });
          if (s && e(s).trigger(l), e(this._element).trigger(c), !c.isDefaultPrevented() && !l.isDefaultPrevented()) {
            o && (i = document.querySelector(o)), this._activate(this._element, n);
            var h = function () {
              var i = e.Event(eh.HIDDEN, {
                  relatedTarget: t._element
                }),
                n = e.Event(eh.SHOWN, {
                  relatedTarget: s
                });
              e(s).trigger(i), e(t._element).trigger(n)
            };
            i ? this._activate(i, i.parentNode, h) : h()
          }
        }
      }, i.dispose = function () {
        e.removeData(this._element, ea), this._element = null
      }, i._activate = function (t, i, s) {
        var n = this,
          o = (i && ("UL" === i.nodeName || "OL" === i.nodeName) ? e(i).find(eg) : e(i).children(ef))[0],
          r = s && o && e(o).hasClass(eu),
          l = function () {
            return n._transitionComplete(t, o, s)
          };
        if (o && r) {
          var c = a.getTransitionDurationFromElement(o);
          e(o).removeClass(ep).one(a.TRANSITION_END, l).emulateTransitionEnd(c)
        } else l()
      }, i._transitionComplete = function (t, i, s) {
        if (i) {
          e(i).removeClass(ed);
          var n = e(i.parentNode).find("> .dropdown-menu .active")[0];
          n && e(n).removeClass(ed), "tab" === i.getAttribute("role") && i.setAttribute("aria-selected", !1)
        }
        if (e(t).addClass(ed), "tab" === t.getAttribute("role") && t.setAttribute("aria-selected", !0), a.reflow(t), t.classList.contains(eu) && t.classList.add(ep), t.parentNode && e(t.parentNode).hasClass("dropdown-menu")) {
          var o = e(t).closest(".dropdown")[0];
          o && e([].slice.call(o.querySelectorAll(".dropdown-toggle"))).addClass(ed), t.setAttribute("aria-expanded", !0)
        }
        s && s()
      }, t._jQueryInterface = function (i) {
        return this.each(function () {
          var s = e(this),
            n = s.data(ea);
          if (n || (n = new t(this), s.data(ea, n)), "string" == typeof i) {
            if (void 0 === n[i]) throw TypeError('No method named "' + i + '"');
            n[i]()
          }
        })
      }, n(t, null, [{
        key: "VERSION",
        get: function () {
          return "4.3.1"
        }
      }]), t
    }();
  e(document).on(eh.CLICK_DATA_API, '[data-toggle="tab"], [data-toggle="pill"], [data-toggle="list"]', function (t) {
    t.preventDefault(), em._jQueryInterface.call(e(this), "show")
  }), e.fn.tab = em._jQueryInterface, e.fn.tab.Constructor = em, e.fn.tab.noConflict = function () {
    return e.fn.tab = ec, em._jQueryInterface
  };
  var ev = "toast",
    e8 = "bs.toast",
    ey = "." + e8,
    ew = e.fn[ev],
    e$ = {
      CLICK_DISMISS: "click.dismiss" + ey,
      HIDE: "hide" + ey,
      HIDDEN: "hidden" + ey,
      SHOW: "show" + ey,
      SHOWN: "shown" + ey
    },
    eb = "hide",
    eC = "show",
    eS = "showing",
    eT = {
      animation: "boolean",
      autohide: "boolean",
      delay: "number"
    },
    ek = {
      animation: !0,
      autohide: !0,
      delay: 500
    },
    e_ = function () {
      function t(t, e) {
        this._element = t, this._config = this._getConfig(e), this._timeout = null, this._setListeners()
      }
      var i = t.prototype;
      return i.show = function () {
        var t = this;
        e(this._element).trigger(e$.SHOW), this._config.animation && this._element.classList.add("fade");
        var i = function () {
          t._element.classList.remove(eS), t._element.classList.add(eC), e(t._element).trigger(e$.SHOWN), t._config.autohide && t.hide()
        };
        if (this._element.classList.remove(eb), this._element.classList.add(eS), this._config.animation) {
          var s = a.getTransitionDurationFromElement(this._element);
          e(this._element).one(a.TRANSITION_END, i).emulateTransitionEnd(s)
        } else i()
      }, i.hide = function (t) {
        var i = this;
        this._element.classList.contains(eC) && (e(this._element).trigger(e$.HIDE), t ? this._close() : this._timeout = setTimeout(function () {
          i._close()
        }, this._config.delay))
      }, i.dispose = function () {
        clearTimeout(this._timeout), this._timeout = null, this._element.classList.contains(eC) && this._element.classList.remove(eC), e(this._element).off(e$.CLICK_DISMISS), e.removeData(this._element, e8), this._element = null, this._config = null
      }, i._getConfig = function (t) {
        return t = o({}, ek, e(this._element).data(), "object" == typeof t && t ? t : {}), a.typeCheckConfig(ev, t, this.constructor.DefaultType), t
      }, i._setListeners = function () {
        var t = this;
        e(this._element).on(e$.CLICK_DISMISS, '[data-dismiss="toast"]', function () {
          return t.hide(!0)
        })
      }, i._close = function () {
        var t = this,
          i = function () {
            t._element.classList.add(eb), e(t._element).trigger(e$.HIDDEN)
          };
        if (this._element.classList.remove(eC), this._config.animation) {
          var s = a.getTransitionDurationFromElement(this._element);
          e(this._element).one(a.TRANSITION_END, i).emulateTransitionEnd(s)
        } else i()
      }, t._jQueryInterface = function (i) {
        return this.each(function () {
          var s = e(this),
            n = s.data(e8);
          if (n || (n = new t(this, "object" == typeof i && i), s.data(e8, n)), "string" == typeof i) {
            if (void 0 === n[i]) throw TypeError('No method named "' + i + '"');
            n[i](this)
          }
        })
      }, n(t, null, [{
        key: "VERSION",
        get: function () {
          return "4.3.1"
        }
      }, {
        key: "DefaultType",
        get: function () {
          return eT
        }
      }, {
        key: "Default",
        get: function () {
          return ek
        }
      }]), t
    }();
  e.fn[ev] = e_._jQueryInterface, e.fn[ev].Constructor = e_, e.fn[ev].noConflict = function () {
      return e.fn[ev] = ew, e_._jQueryInterface
    },
    function () {
      if (void 0 === e) throw TypeError("Bootstrap's JavaScript requires jQuery. jQuery must be included before Bootstrap's JavaScript.");
      var t = e.fn.jquery.split(" ")[0].split(".");
      if (t[0] < 2 && t[1] < 9 || 1 === t[0] && 9 === t[1] && t[2] < 1 || 4 <= t[0]) throw Error("Bootstrap's JavaScript requires at least jQuery v1.9.1 but less than v4.0.0")
    }(), t.Util = a, t.Alert = p, t.Button = S, t.Carousel = H, t.Collapse = Z, t.Dropdown = tp, t.Modal = tk, t.Popover = t5, t.Scrollspy = er, t.Tab = em, t.Toast = e_, t.Tooltip = tU, Object.defineProperty(t, "__esModule", {
      value: !0
    })
}),
function (t, e, i, s) {
  function n(e, i) {
    this.settings = null, this.options = t.extend({}, n.Defaults, i), this.$element = t(e), this._handlers = {}, this._plugins = {}, this._supress = {}, this._current = null, this._speed = null, this._coordinates = [], this._breakpoint = null, this._width = null, this._items = [], this._clones = [], this._mergers = [], this._widths = [], this._invalidated = {}, this._pipe = [], this._drag = {
      time: null,
      target: null,
      pointer: null,
      stage: {
        start: null,
        current: null
      },
      direction: null
    }, this._states = {
      current: {},
      tags: {
        initializing: ["busy"],
        animating: ["busy"],
        dragging: ["interacting"]
      }
    }, t.each(["onResize", "onThrottledResize"], t.proxy(function (e, i) {
      this._handlers[i] = t.proxy(this[i], this)
    }, this)), t.each(n.Plugins, t.proxy(function (t, e) {
      this._plugins[t.charAt(0).toLowerCase() + t.slice(1)] = new e(this)
    }, this)), t.each(n.Workers, t.proxy(function (e, i) {
      this._pipe.push({
        filter: i.filter,
        run: t.proxy(i.run, this)
      })
    }, this)), this.setup(), this.initialize()
  }
  n.Defaults = {
    items: 3,
    loop: !1,
    center: !1,
    rewind: !1,
    checkVisibility: !0,
    mouseDrag: !0,
    touchDrag: !0,
    pullDrag: !0,
    freeDrag: !1,
    margin: 0,
    stagePadding: 0,
    merge: !1,
    mergeFit: !0,
    autoWidth: !1,
    startPosition: 0,
    rtl: !1,
    smartSpeed: 250,
    fluidSpeed: !1,
    dragEndSpeed: !1,
    responsive: {},
    responsiveRefreshRate: 200,
    responsiveBaseElement: e,
    fallbackEasing: "swing",
    slideTransition: "",
    info: !1,
    nestedItemSelector: !1,
    itemElement: "div",
    stageElement: "div",
    refreshClass: "owl-refresh",
    loadedClass: "owl-loaded",
    loadingClass: "owl-loading",
    rtlClass: "owl-rtl",
    responsiveClass: "owl-responsive",
    dragClass: "owl-drag",
    itemClass: "owl-item",
    stageClass: "owl-stage",
    stageOuterClass: "owl-stage-outer",
    grabClass: "owl-grab"
  }, n.Width = {
    Default: "default",
    Inner: "inner",
    Outer: "outer"
  }, n.Type = {
    Event: "event",
    State: "state"
  }, n.Plugins = {}, n.Workers = [{
    filter: ["width", "settings"],
    run: function () {
      this._width = this.$element.width()
    }
  }, {
    filter: ["width", "items", "settings"],
    run: function (t) {
      t.current = this._items && this._items[this.relative(this._current)]
    }
  }, {
    filter: ["items", "settings"],
    run: function () {
      this.$stage.children(".cloned").remove()
    }
  }, {
    filter: ["width", "items", "settings"],
    run: function (t) {
      var e = this.settings.margin || "",
        i = !this.settings.autoWidth,
        s = this.settings.rtl,
        n = {
          width: "auto",
          "margin-left": s ? e : "",
          "margin-right": s ? "" : e
        };
      i || this.$stage.children().css(n), t.css = n
    }
  }, {
    filter: ["width", "items", "settings"],
    run: function (t) {
      var e = (this.width() / this.settings.items).toFixed(3) - this.settings.margin,
        i = null,
        s = this._items.length,
        n = !this.settings.autoWidth,
        o = [];
      for (t.items = {
          merge: !1,
          width: e
        }; s--;) i = this._mergers[s], i = this.settings.mergeFit && Math.min(i, this.settings.items) || i, t.items.merge = i > 1 || t.items.merge, o[s] = n ? e * i : this._items[s].width();
      this._widths = o
    }
  }, {
    filter: ["items", "settings"],
    run: function () {
      var e = [],
        i = this._items,
        s = this.settings,
        n = Math.max(2 * s.items, 4),
        o = 2 * Math.ceil(i.length / 2),
        r = s.loop && i.length ? s.rewind ? n : Math.max(n, o) : 0,
        a = "",
        l = "";
      for (r /= 2; r > 0;) e.push(this.normalize(e.length / 2, !0)), a += i[e[e.length - 1]][0].outerHTML, e.push(this.normalize(i.length - 1 - (e.length - 1) / 2, !0)), l = i[e[e.length - 1]][0].outerHTML + l, r -= 1;
      this._clones = e, t(a).addClass("cloned").appendTo(this.$stage), t(l).addClass("cloned").prependTo(this.$stage)
    }
  }, {
    filter: ["width", "items", "settings"],
    run: function () {
      for (var t = this.settings.rtl ? 1 : -1, e = this._clones.length + this._items.length, i = -1, s = 0, n = 0, o = []; ++i < e;) o.push((s = o[i - 1] || 0) + (n = this._widths[this.relative(i)] + this.settings.margin) * t);
      this._coordinates = o
    }
  }, {
    filter: ["width", "items", "settings"],
    run: function () {
      var t = this.settings.stagePadding,
        e = this._coordinates,
        i = {
          width: Math.ceil(Math.abs(e[e.length - 1])) + 2 * t,
          "padding-left": t || "",
          "padding-right": t || ""
        };
      this.$stage.css(i)
    }
  }, {
    filter: ["width", "items", "settings"],
    run: function (t) {
      var e = this._coordinates.length,
        i = !this.settings.autoWidth,
        s = this.$stage.children();
      if (i && t.items.merge)
        for (; e--;) t.css.width = this._widths[this.relative(e)], s.eq(e).css(t.css);
      else i && (t.css.width = t.items.width, s.css(t.css))
    }
  }, {
    filter: ["items"],
    run: function () {
      this._coordinates.length < 1 && this.$stage.removeAttr("style")
    }
  }, {
    filter: ["width", "items", "settings"],
    run: function (t) {
      t.current = t.current ? this.$stage.children().index(t.current) : 0, t.current = Math.max(this.minimum(), Math.min(this.maximum(), t.current)), this.reset(t.current)
    }
  }, {
    filter: ["position"],
    run: function () {
      this.animate(this.coordinates(this._current))
    }
  }, {
    filter: ["width", "position", "items", "settings"],
    run: function () {
      var t, e, i, s, n = this.settings.rtl ? 1 : -1,
        o = 2 * this.settings.stagePadding,
        r = this.coordinates(this.current()) + o,
        a = r + this.width() * n,
        l = [];
      for (i = 0, s = this._coordinates.length; i < s; i++) t = this._coordinates[i - 1] || 0, e = Math.abs(this._coordinates[i]) + o * n, (this.op(t, "<=", r) && this.op(t, ">", a) || this.op(e, "<", r) && this.op(e, ">", a)) && l.push(i);
      this.$stage.children(".active").removeClass("active"), this.$stage.children(":eq(" + l.join("), :eq(") + ")").addClass("active"), this.$stage.children(".center").removeClass("center"), this.settings.center && this.$stage.children().eq(this.current()).addClass("center")
    }
  }], n.prototype.initializeStage = function () {
    this.$stage = this.$element.find("." + this.settings.stageClass), this.$stage.length || (this.$element.addClass(this.options.loadingClass), this.$stage = t("<" + this.settings.stageElement + ">", {
      class: this.settings.stageClass
    }).wrap(t("<div/>", {
      class: this.settings.stageOuterClass
    })), this.$element.append(this.$stage.parent()))
  }, n.prototype.initializeItems = function () {
    var e = this.$element.find(".owl-item");
    if (e.length) return this._items = e.get().map(function (e) {
      return t(e)
    }), this._mergers = this._items.map(function () {
      return 1
    }), void this.refresh();
    this.replace(this.$element.children().not(this.$stage.parent())), this.isVisible() ? this.refresh() : this.invalidate("width"), this.$element.removeClass(this.options.loadingClass).addClass(this.options.loadedClass)
  }, n.prototype.initialize = function () {
    if (this.enter("initializing"), this.trigger("initialize"), this.$element.toggleClass(this.settings.rtlClass, this.settings.rtl), this.settings.autoWidth && !this.is("pre-loading")) {
      var t, e, i;
      t = this.$element.find("img"), e = this.settings.nestedItemSelector ? "." + this.settings.nestedItemSelector : s, i = this.$element.children(e).width(), t.length && i <= 0 && this.preloadAutoWidthImages(t)
    }
    this.initializeStage(), this.initializeItems(), this.registerEventHandlers(), this.leave("initializing"), this.trigger("initialized")
  }, n.prototype.isVisible = function () {
    return !this.settings.checkVisibility || this.$element.is(":visible")
  }, n.prototype.setup = function () {
    var e = this.viewport(),
      i = this.options.responsive,
      s = -1,
      n = null;
    i ? (t.each(i, function (t) {
      t <= e && t > s && (s = Number(t))
    }), "function" == typeof (n = t.extend({}, this.options, i[s])).stagePadding && (n.stagePadding = n.stagePadding()), delete n.responsive, n.responsiveClass && this.$element.attr("class", this.$element.attr("class").replace(RegExp("(" + this.options.responsiveClass + "-)\\S+\\s", "g"), "$1" + s))) : n = t.extend({}, this.options), this.trigger("change", {
      property: {
        name: "settings",
        value: n
      }
    }), this._breakpoint = s, this.settings = n, this.invalidate("settings"), this.trigger("changed", {
      property: {
        name: "settings",
        value: this.settings
      }
    })
  }, n.prototype.optionsLogic = function () {
    this.settings.autoWidth && (this.settings.stagePadding = !1, this.settings.merge = !1)
  }, n.prototype.prepare = function (e) {
    var i = this.trigger("prepare", {
      content: e
    });
    return i.data || (i.data = t("<" + this.settings.itemElement + "/>").addClass(this.options.itemClass).append(e)), this.trigger("prepared", {
      content: i.data
    }), i.data
  }, n.prototype.update = function () {
    for (var e = 0, i = this._pipe.length, s = t.proxy(function (t) {
        return this[t]
      }, this._invalidated), n = {}; e < i;)(this._invalidated.all || t.grep(this._pipe[e].filter, s).length > 0) && this._pipe[e].run(n), e++;
    this._invalidated = {}, this.is("valid") || this.enter("valid")
  }, n.prototype.width = function (t) {
    switch (t = t || n.Width.Default) {
      case n.Width.Inner:
      case n.Width.Outer:
        return this._width;
      default:
        return this._width - 2 * this.settings.stagePadding + this.settings.margin
    }
  }, n.prototype.refresh = function () {
    this.enter("refreshing"), this.trigger("refresh"), this.setup(), this.optionsLogic(), this.$element.addClass(this.options.refreshClass), this.update(), this.$element.removeClass(this.options.refreshClass), this.leave("refreshing"), this.trigger("refreshed")
  }, n.prototype.onThrottledResize = function () {
    e.clearTimeout(this.resizeTimer), this.resizeTimer = e.setTimeout(this._handlers.onResize, this.settings.responsiveRefreshRate)
  }, n.prototype.onResize = function () {
    return !!this._items.length && this._width !== this.$element.width() && !!this.isVisible() && (this.enter("resizing"), this.trigger("resize").isDefaultPrevented() ? (this.leave("resizing"), !1) : (this.invalidate("width"), this.refresh(), this.leave("resizing"), void this.trigger("resized")))
  }, n.prototype.registerEventHandlers = function () {
    t.support.transition && this.$stage.on(t.support.transition.end + ".owl.core", t.proxy(this.onTransitionEnd, this)), !1 !== this.settings.responsive && this.on(e, "resize", this._handlers.onThrottledResize), this.settings.mouseDrag && (this.$element.addClass(this.options.dragClass), this.$stage.on("mousedown.owl.core", t.proxy(this.onDragStart, this)), this.$stage.on("dragstart.owl.core selectstart.owl.core", function () {
      return !1
    })), this.settings.touchDrag && (this.$stage.on("touchstart.owl.core", t.proxy(this.onDragStart, this)), this.$stage.on("touchcancel.owl.core", t.proxy(this.onDragEnd, this)))
  }, n.prototype.onDragStart = function (e) {
    var s = null;
    3 !== e.which && (t.support.transform ? s = {
      x: (s = this.$stage.css("transform").replace(/.*\(|\)| /g, "").split(","))[16 === s.length ? 12 : 4],
      y: s[16 === s.length ? 13 : 5]
    } : (s = this.$stage.position(), s = {
      x: this.settings.rtl ? s.left + this.$stage.width() - this.width() + this.settings.margin : s.left,
      y: s.top
    }), this.is("animating") && (t.support.transform ? this.animate(s.x) : this.$stage.stop(), this.invalidate("position")), this.$element.toggleClass(this.options.grabClass, "mousedown" === e.type), this.speed(0), this._drag.time = (new Date).getTime(), this._drag.target = t(e.target), this._drag.stage.start = s, this._drag.stage.current = s, this._drag.pointer = this.pointer(e), t(i).on("mouseup.owl.core touchend.owl.core", t.proxy(this.onDragEnd, this)), t(i).one("mousemove.owl.core touchmove.owl.core", t.proxy(function (e) {
      var s = this.difference(this._drag.pointer, this.pointer(e));
      t(i).on("mousemove.owl.core touchmove.owl.core", t.proxy(this.onDragMove, this)), Math.abs(s.x) < Math.abs(s.y) && this.is("valid") || (e.preventDefault(), this.enter("dragging"), this.trigger("drag"))
    }, this)))
  }, n.prototype.onDragMove = function (t) {
    var e = null,
      i = null,
      s = null,
      n = this.difference(this._drag.pointer, this.pointer(t)),
      o = this.difference(this._drag.stage.start, n);
    this.is("dragging") && (t.preventDefault(), this.settings.loop ? (e = this.coordinates(this.minimum()), i = this.coordinates(this.maximum() + 1) - e, o.x = ((o.x - e) % i + i) % i + e) : (e = this.settings.rtl ? this.coordinates(this.maximum()) : this.coordinates(this.minimum()), i = this.settings.rtl ? this.coordinates(this.minimum()) : this.coordinates(this.maximum()), s = this.settings.pullDrag ? -1 * n.x / 5 : 0, o.x = Math.max(Math.min(o.x, e + s), i + s)), this._drag.stage.current = o, this.animate(o.x))
  }, n.prototype.onDragEnd = function (e) {
    var s = this.difference(this._drag.pointer, this.pointer(e)),
      n = this._drag.stage.current,
      o = s.x > 0 ^ this.settings.rtl ? "left" : "right";
    t(i).off(".owl.core"), this.$element.removeClass(this.options.grabClass), (0 !== s.x && this.is("dragging") || !this.is("valid")) && (this.speed(this.settings.dragEndSpeed || this.settings.smartSpeed), this.current(this.closest(n.x, 0 !== s.x ? o : this._drag.direction)), this.invalidate("position"), this.update(), this._drag.direction = o, (Math.abs(s.x) > 3 || (new Date).getTime() - this._drag.time > 300) && this._drag.target.one("click.owl.core", function () {
      return !1
    })), this.is("dragging") && (this.leave("dragging"), this.trigger("dragged"))
  }, n.prototype.closest = function (e, i) {
    var n = -1,
      o = this.width(),
      r = this.coordinates();
    return this.settings.freeDrag || t.each(r, t.proxy(function (t, a) {
      return "left" === i && e > a - 30 && e < a + 30 ? n = t : "right" === i && e > a - o - 30 && e < a - o + 30 ? n = t + 1 : this.op(e, "<", a) && this.op(e, ">", r[t + 1] !== s ? r[t + 1] : a - o) && (n = "left" === i ? t + 1 : t), -1 === n
    }, this)), this.settings.loop || (this.op(e, ">", r[this.minimum()]) ? n = e = this.minimum() : this.op(e, "<", r[this.maximum()]) && (n = e = this.maximum())), n
  }, n.prototype.animate = function (e) {
    var i = this.speed() > 0;
    this.is("animating") && this.onTransitionEnd(), i && (this.enter("animating"), this.trigger("translate")), t.support.transform3d && t.support.transition ? this.$stage.css({
      transform: "translate3d(" + e + "px,0px,0px)",
      transition: this.speed() / 1e3 + "s" + (this.settings.slideTransition ? " " + this.settings.slideTransition : "")
    }) : i ? this.$stage.animate({
      left: e + "px"
    }, this.speed(), this.settings.fallbackEasing, t.proxy(this.onTransitionEnd, this)) : this.$stage.css({
      left: e + "px"
    })
  }, n.prototype.is = function (t) {
    return this._states.current[t] && this._states.current[t] > 0
  }, n.prototype.current = function (t) {
    if (t === s) return this._current;
    if (0 === this._items.length) return s;
    if (t = this.normalize(t), this._current !== t) {
      var e = this.trigger("change", {
        property: {
          name: "position",
          value: t
        }
      });
      e.data !== s && (t = this.normalize(e.data)), this._current = t, this.invalidate("position"), this.trigger("changed", {
        property: {
          name: "position",
          value: this._current
        }
      })
    }
    return this._current
  }, n.prototype.invalidate = function (e) {
    return "string" === t.type(e) && (this._invalidated[e] = !0, this.is("valid") && this.leave("valid")), t.map(this._invalidated, function (t, e) {
      return e
    })
  }, n.prototype.reset = function (t) {
    (t = this.normalize(t)) !== s && (this._speed = 0, this._current = t, this.suppress(["translate", "translated"]), this.animate(this.coordinates(t)), this.release(["translate", "translated"]))
  }, n.prototype.normalize = function (t, e) {
    var i = this._items.length,
      n = e ? 0 : this._clones.length;
    return !this.isNumeric(t) || i < 1 ? t = s : (t < 0 || t >= i + n) && (t = ((t - n / 2) % i + i) % i + n / 2), t
  }, n.prototype.relative = function (t) {
    return t -= this._clones.length / 2, this.normalize(t, !0)
  }, n.prototype.maximum = function (t) {
    var e, i, s, n = this.settings,
      o = this._coordinates.length;
    if (n.loop) o = this._clones.length / 2 + this._items.length - 1;
    else if (n.autoWidth || n.merge) {
      if (e = this._items.length)
        for (i = this._items[--e].width(), s = this.$element.width(); e-- && !((i += this._items[e].width() + this.settings.margin) > s););
      o = e + 1
    } else o = n.center ? this._items.length - 1 : this._items.length - n.items;
    return t && (o -= this._clones.length / 2), Math.max(o, 0)
  }, n.prototype.minimum = function (t) {
    return t ? 0 : this._clones.length / 2
  }, n.prototype.items = function (t) {
    return t === s ? this._items.slice() : (t = this.normalize(t, !0), this._items[t])
  }, n.prototype.mergers = function (t) {
    return t === s ? this._mergers.slice() : (t = this.normalize(t, !0), this._mergers[t])
  }, n.prototype.clones = function (e) {
    var i = this._clones.length / 2,
      n = i + this._items.length,
      o = function (t) {
        return t % 2 == 0 ? n + t / 2 : i - (t + 1) / 2
      };
    return e === s ? t.map(this._clones, function (t, e) {
      return o(e)
    }) : t.map(this._clones, function (t, i) {
      return t === e ? o(i) : null
    })
  }, n.prototype.speed = function (t) {
    return t !== s && (this._speed = t), this._speed
  }, n.prototype.coordinates = function (e) {
    var i, n = 1,
      o = e - 1;
    return e === s ? t.map(this._coordinates, t.proxy(function (t, e) {
      return this.coordinates(e)
    }, this)) : (this.settings.center ? (this.settings.rtl && (n = -1, o = e + 1), i = this._coordinates[e], i += (this.width() - i + (this._coordinates[o] || 0)) / 2 * n) : i = this._coordinates[o] || 0, i = Math.ceil(i))
  }, n.prototype.duration = function (t, e, i) {
    return 0 === i ? 0 : Math.min(Math.max(Math.abs(e - t), 1), 6) * Math.abs(i || this.settings.smartSpeed)
  }, n.prototype.to = function (t, e) {
    var i = this.current(),
      s = null,
      n = t - this.relative(i),
      o = (n > 0) - (n < 0),
      r = this._items.length,
      a = this.minimum(),
      l = this.maximum();
    this.settings.loop ? (!this.settings.rewind && Math.abs(n) > r / 2 && (n += -1 * o * r), (s = (((t = i + n) - a) % r + r) % r + a) !== t && s - n <= l && s - n > 0 && (i = s - n, t = s, this.reset(i))) : this.settings.rewind ? (l += 1, t = (t % l + l) % l) : t = Math.max(a, Math.min(l, t)), this.speed(this.duration(i, t, e)), this.current(t), this.isVisible() && this.update()
  }, n.prototype.next = function (t) {
    t = t || !1, this.to(this.relative(this.current()) + 1, t)
  }, n.prototype.prev = function (t) {
    t = t || !1, this.to(this.relative(this.current()) - 1, t)
  }, n.prototype.onTransitionEnd = function (t) {
    if (t !== s && (t.stopPropagation(), (t.target || t.srcElement || t.originalTarget) !== this.$stage.get(0))) return !1;
    this.leave("animating"), this.trigger("translated")
  }, n.prototype.viewport = function () {
    var s;
    return this.options.responsiveBaseElement !== e ? s = t(this.options.responsiveBaseElement).width() : e.innerWidth ? s = e.innerWidth : i.documentElement && i.documentElement.clientWidth ? s = i.documentElement.clientWidth : console.warn("Can not detect viewport width."), s
  }, n.prototype.replace = function (e) {
    this.$stage.empty(), this._items = [], e && (e = e instanceof jQuery ? e : t(e)), this.settings.nestedItemSelector && (e = e.find("." + this.settings.nestedItemSelector)), e.filter(function () {
      return 1 === this.nodeType
    }).each(t.proxy(function (t, e) {
      e = this.prepare(e), this.$stage.append(e), this._items.push(e), this._mergers.push(1 * e.find("[data-merge]").addBack("[data-merge]").attr("data-merge") || 1)
    }, this)), this.reset(this.isNumeric(this.settings.startPosition) ? this.settings.startPosition : 0), this.invalidate("items")
  }, n.prototype.add = function (e, i) {
    var n = this.relative(this._current);
    i = i === s ? this._items.length : this.normalize(i, !0), e = e instanceof jQuery ? e : t(e), this.trigger("add", {
      content: e,
      position: i
    }), e = this.prepare(e), 0 === this._items.length || i === this._items.length ? (0 === this._items.length && this.$stage.append(e), 0 !== this._items.length && this._items[i - 1].after(e), this._items.push(e), this._mergers.push(1 * e.find("[data-merge]").addBack("[data-merge]").attr("data-merge") || 1)) : (this._items[i].before(e), this._items.splice(i, 0, e), this._mergers.splice(i, 0, 1 * e.find("[data-merge]").addBack("[data-merge]").attr("data-merge") || 1)), this._items[n] && this.reset(this._items[n].index()), this.invalidate("items"), this.trigger("added", {
      content: e,
      position: i
    })
  }, n.prototype.remove = function (t) {
    (t = this.normalize(t, !0)) !== s && (this.trigger("remove", {
      content: this._items[t],
      position: t
    }), this._items[t].remove(), this._items.splice(t, 1), this._mergers.splice(t, 1), this.invalidate("items"), this.trigger("removed", {
      content: null,
      position: t
    }))
  }, n.prototype.preloadAutoWidthImages = function (e) {
    e.each(t.proxy(function (e, i) {
      this.enter("pre-loading"), i = t(i), t(new Image).one("load", t.proxy(function (t) {
        i.attr("src", t.target.src), i.css("opacity", 1), this.leave("pre-loading"), this.is("pre-loading") || this.is("initializing") || this.refresh()
      }, this)).attr("src", i.attr("src") || i.attr("data-src") || i.attr("data-src-retina"))
    }, this))
  }, n.prototype.destroy = function () {
    for (var s in this.$element.off(".owl.core"), this.$stage.off(".owl.core"), t(i).off(".owl.core"), !1 !== this.settings.responsive && (e.clearTimeout(this.resizeTimer), this.off(e, "resize", this._handlers.onThrottledResize)), this._plugins) this._plugins[s].destroy();
    this.$stage.children(".cloned").remove(), this.$stage.unwrap(), this.$stage.children().contents().unwrap(), this.$stage.children().unwrap(), this.$stage.remove(), this.$element.removeClass(this.options.refreshClass).removeClass(this.options.loadingClass).removeClass(this.options.loadedClass).removeClass(this.options.rtlClass).removeClass(this.options.dragClass).removeClass(this.options.grabClass).attr("class", this.$element.attr("class").replace(RegExp(this.options.responsiveClass + "-\\S+\\s", "g"), "")).removeData("owl.carousel")
  }, n.prototype.op = function (t, e, i) {
    var s = this.settings.rtl;
    switch (e) {
      case "<":
        return s ? t > i : t < i;
      case ">":
        return s ? t < i : t > i;
      case ">=":
        return s ? t <= i : t >= i;
      case "<=":
        return s ? t >= i : t <= i
    }
  }, n.prototype.on = function (t, e, i, s) {
    t.addEventListener ? t.addEventListener(e, i, s) : t.attachEvent && t.attachEvent("on" + e, i)
  }, n.prototype.off = function (t, e, i, s) {
    t.removeEventListener ? t.removeEventListener(e, i, s) : t.detachEvent && t.detachEvent("on" + e, i)
  }, n.prototype.trigger = function (e, i, s, o, r) {
    var a = {
        item: {
          count: this._items.length,
          index: this.current()
        }
      },
      l = t.camelCase(t.grep(["on", e, s], function (t) {
        return t
      }).join("-").toLowerCase()),
      c = t.Event([e, "owl", s || "carousel"].join(".").toLowerCase(), t.extend({
        relatedTarget: this
      }, a, i));
    return this._supress[e] || (t.each(this._plugins, function (t, e) {
      e.onTrigger && e.onTrigger(c)
    }), this.register({
      type: n.Type.Event,
      name: e
    }), this.$element.trigger(c), this.settings && "function" == typeof this.settings[l] && this.settings[l].call(this, c)), c
  }, n.prototype.enter = function (e) {
    t.each([e].concat(this._states.tags[e] || []), t.proxy(function (t, e) {
      this._states.current[e] === s && (this._states.current[e] = 0), this._states.current[e]++
    }, this))
  }, n.prototype.leave = function (e) {
    t.each([e].concat(this._states.tags[e] || []), t.proxy(function (t, e) {
      this._states.current[e]--
    }, this))
  }, n.prototype.register = function (e) {
    if (e.type === n.Type.Event) {
      if (t.event.special[e.name] || (t.event.special[e.name] = {}), !t.event.special[e.name].owl) {
        var i = t.event.special[e.name]._default;
        t.event.special[e.name]._default = function (t) {
          return i && i.apply && (!t.namespace || -1 === t.namespace.indexOf("owl")) ? i.apply(this, arguments) : t.namespace && t.namespace.indexOf("owl") > -1
        }, t.event.special[e.name].owl = !0
      }
    } else e.type === n.Type.State && (this._states.tags[e.name] ? this._states.tags[e.name] = this._states.tags[e.name].concat(e.tags) : this._states.tags[e.name] = e.tags, this._states.tags[e.name] = t.grep(this._states.tags[e.name], t.proxy(function (i, s) {
      return t.inArray(i, this._states.tags[e.name]) === s
    }, this)))
  }, n.prototype.suppress = function (e) {
    t.each(e, t.proxy(function (t, e) {
      this._supress[e] = !0
    }, this))
  }, n.prototype.release = function (e) {
    t.each(e, t.proxy(function (t, e) {
      delete this._supress[e]
    }, this))
  }, n.prototype.pointer = function (t) {
    var i = {
      x: null,
      y: null
    };
    return (t = (t = t.originalEvent || t || e.event).touches && t.touches.length ? t.touches[0] : t.changedTouches && t.changedTouches.length ? t.changedTouches[0] : t).pageX ? (i.x = t.pageX, i.y = t.pageY) : (i.x = t.clientX, i.y = t.clientY), i
  }, n.prototype.isNumeric = function (t) {
    return !isNaN(parseFloat(t))
  }, n.prototype.difference = function (t, e) {
    return {
      x: t.x - e.x,
      y: t.y - e.y
    }
  }, t.fn.owlCarousel = function (e) {
    var i = Array.prototype.slice.call(arguments, 1);
    return this.each(function () {
      var s = t(this),
        o = s.data("owl.carousel");
      o || (o = new n(this, "object" == typeof e && e), s.data("owl.carousel", o), t.each(["next", "prev", "to", "destroy", "refresh", "replace", "add", "remove"], function (e, i) {
        o.register({
          type: n.Type.Event,
          name: i
        }), o.$element.on(i + ".owl.carousel.core", t.proxy(function (t) {
          t.namespace && t.relatedTarget !== this && (this.suppress([i]), o[i].apply(this, [].slice.call(arguments, 1)), this.release([i]))
        }, o))
      })), "string" == typeof e && "_" !== e.charAt(0) && o[e].apply(o, i)
    })
  }, t.fn.owlCarousel.Constructor = n
}(window.Zepto || window.jQuery, window, document),
function (t, e, i, s) {
  var n = function (e) {
    this._core = e, this._interval = null, this._visible = null, this._handlers = {
      "initialized.owl.carousel": t.proxy(function (t) {
        t.namespace && this._core.settings.autoRefresh && this.watch()
      }, this)
    }, this._core.options = t.extend({}, n.Defaults, this._core.options), this._core.$element.on(this._handlers)
  };
  n.Defaults = {
    autoRefresh: !0,
    autoRefreshInterval: 500
  }, n.prototype.watch = function () {
    this._interval || (this._visible = this._core.isVisible(), this._interval = e.setInterval(t.proxy(this.refresh, this), this._core.settings.autoRefreshInterval))
  }, n.prototype.refresh = function () {
    this._core.isVisible() !== this._visible && (this._visible = !this._visible, this._core.$element.toggleClass("owl-hidden", !this._visible), this._visible && this._core.invalidate("width") && this._core.refresh())
  }, n.prototype.destroy = function () {
    var t, i;
    for (t in e.clearInterval(this._interval), this._handlers) this._core.$element.off(t, this._handlers[t]);
    for (i in Object.getOwnPropertyNames(this)) "function" != typeof this[i] && (this[i] = null)
  }, t.fn.owlCarousel.Constructor.Plugins.AutoRefresh = n
}(window.Zepto || window.jQuery, window, document),
function (t, e, i, s) {
  var n = function (e) {
    this._core = e, this._loaded = [], this._handlers = {
      "initialized.owl.carousel change.owl.carousel resized.owl.carousel": t.proxy(function (e) {
        if (e.namespace && this._core.settings && this._core.settings.lazyLoad && (e.property && "position" == e.property.name || "initialized" == e.type)) {
          var i = this._core.settings,
            s = i.center && Math.ceil(i.items / 2) || i.items,
            n = i.center && -1 * s || 0,
            o = (e.property && void 0 !== e.property.value ? e.property.value : this._core.current()) + n,
            r = this._core.clones().length,
            a = t.proxy(function (t, e) {
              this.load(e)
            }, this);
          for (i.lazyLoadEager > 0 && (s += i.lazyLoadEager, i.loop && (o -= i.lazyLoadEager, s++)); n++ < s;) this.load(r / 2 + this._core.relative(o)), r && t.each(this._core.clones(this._core.relative(o)), a), o++
        }
      }, this)
    }, this._core.options = t.extend({}, n.Defaults, this._core.options), this._core.$element.on(this._handlers)
  };
  n.Defaults = {
    lazyLoad: !1,
    lazyLoadEager: 0
  }, n.prototype.load = function (i) {
    var s = this._core.$stage.children().eq(i),
      n = s && s.find(".owl-lazy");
    !n || t.inArray(s.get(0), this._loaded) > -1 || (n.each(t.proxy(function (i, s) {
      var n, o = t(s),
        r = e.devicePixelRatio > 1 && o.attr("data-src-retina") || o.attr("data-src") || o.attr("data-srcset");
      this._core.trigger("load", {
        element: o,
        url: r
      }, "lazy"), o.is("img") ? o.one("load.owl.lazy", t.proxy(function () {
        o.css("opacity", 1), this._core.trigger("loaded", {
          element: o,
          url: r
        }, "lazy")
      }, this)).attr("src", r) : o.is("source") ? o.one("load.owl.lazy", t.proxy(function () {
        this._core.trigger("loaded", {
          element: o,
          url: r
        }, "lazy")
      }, this)).attr("srcset", r) : ((n = new Image).onload = t.proxy(function () {
        o.css({
          "background-image": 'url("' + r + '")',
          opacity: "1"
        }), this._core.trigger("loaded", {
          element: o,
          url: r
        }, "lazy")
      }, this), n.src = r)
    }, this)), this._loaded.push(s.get(0)))
  }, n.prototype.destroy = function () {
    var t, e;
    for (t in this.handlers) this._core.$element.off(t, this.handlers[t]);
    for (e in Object.getOwnPropertyNames(this)) "function" != typeof this[e] && (this[e] = null)
  }, t.fn.owlCarousel.Constructor.Plugins.Lazy = n
}(window.Zepto || window.jQuery, window, document),
function (t, e, i, s) {
  var n = function (i) {
    this._core = i, this._previousHeight = null, this._handlers = {
      "initialized.owl.carousel refreshed.owl.carousel": t.proxy(function (t) {
        t.namespace && this._core.settings.autoHeight && this.update()
      }, this),
      "changed.owl.carousel": t.proxy(function (t) {
        t.namespace && this._core.settings.autoHeight && "position" === t.property.name && this.update()
      }, this),
      "loaded.owl.lazy": t.proxy(function (t) {
        t.namespace && this._core.settings.autoHeight && t.element.closest("." + this._core.settings.itemClass).index() === this._core.current() && this.update()
      }, this)
    }, this._core.options = t.extend({}, n.Defaults, this._core.options), this._core.$element.on(this._handlers), this._intervalId = null;
    var s = this;
    t(e).on("load", function () {
      s._core.settings.autoHeight && s.update()
    }), t(e).resize(function () {
      s._core.settings.autoHeight && (null != s._intervalId && clearTimeout(s._intervalId), s._intervalId = setTimeout(function () {
        s.update()
      }, 250))
    })
  };
  n.Defaults = {
    autoHeight: !1,
    autoHeightClass: "owl-height"
  }, n.prototype.update = function () {
    var e = this._core._current,
      i = e + this._core.settings.items,
      s = this._core.settings.lazyLoad,
      n = this._core.$stage.children().toArray().slice(e, i),
      o = [],
      r = 0;
    t.each(n, function (e, i) {
      o.push(t(i).height())
    }), (r = Math.max.apply(null, o)) <= 1 && s && this._previousHeight && (r = this._previousHeight), this._previousHeight = r, this._core.$stage.parent().height(r).addClass(this._core.settings.autoHeightClass)
  }, n.prototype.destroy = function () {
    var t, e;
    for (t in this._handlers) this._core.$element.off(t, this._handlers[t]);
    for (e in Object.getOwnPropertyNames(this)) "function" != typeof this[e] && (this[e] = null)
  }, t.fn.owlCarousel.Constructor.Plugins.AutoHeight = n
}(window.Zepto || window.jQuery, window, document),
function (t, e, i, s) {
  var n = function (e) {
    this._core = e, this._videos = {}, this._playing = null, this._handlers = {
      "initialized.owl.carousel": t.proxy(function (t) {
        t.namespace && this._core.register({
          type: "state",
          name: "playing",
          tags: ["interacting"]
        })
      }, this),
      "resize.owl.carousel": t.proxy(function (t) {
        t.namespace && this._core.settings.video && this.isInFullScreen() && t.preventDefault()
      }, this),
      "refreshed.owl.carousel": t.proxy(function (t) {
        t.namespace && this._core.is("resizing") && this._core.$stage.find(".cloned .owl-video-frame").remove()
      }, this),
      "changed.owl.carousel": t.proxy(function (t) {
        t.namespace && "position" === t.property.name && this._playing && this.stop()
      }, this),
      "prepared.owl.carousel": t.proxy(function (e) {
        if (e.namespace) {
          var i = t(e.content).find(".owl-video");
          i.length && (i.css("display", "none"), this.fetch(i, t(e.content)))
        }
      }, this)
    }, this._core.options = t.extend({}, n.Defaults, this._core.options), this._core.$element.on(this._handlers), this._core.$element.on("click.owl.video", ".owl-video-play-icon", t.proxy(function (t) {
      this.play(t)
    }, this))
  };
  n.Defaults = {
    video: !1,
    videoHeight: !1,
    videoWidth: !1
  }, n.prototype.fetch = function (t, e) {
    var i = t.attr("data-vimeo-id") ? "vimeo" : t.attr("data-vzaar-id") ? "vzaar" : "youtube",
      s = t.attr("data-vimeo-id") || t.attr("data-youtube-id") || t.attr("data-vzaar-id"),
      n = t.attr("data-width") || this._core.settings.videoWidth,
      o = t.attr("data-height") || this._core.settings.videoHeight,
      r = t.attr("href");
    if (!r) throw Error("Missing video URL.");
    if ((s = r.match(/(http:|https:|)\/\/(player.|www.|app.)?(vimeo\.com|youtu(be\.com|\.be|be\.googleapis\.com|be\-nocookie\.com)|vzaar\.com)\/(video\/|videos\/|embed\/|channels\/.+\/|groups\/.+\/|watch\?v=|v\/)?([A-Za-z0-9._%-]*)(\&\S+)?/))[3].indexOf("youtu") > -1) i = "youtube";
    else if (s[3].indexOf("vimeo") > -1) i = "vimeo";
    else {
      if (!(s[3].indexOf("vzaar") > -1)) throw Error("Video URL not supported.");
      i = "vzaar"
    }
    s = s[6], this._videos[r] = {
      type: i,
      id: s,
      width: n,
      height: o
    }, e.attr("data-video", r), this.thumbnail(t, this._videos[r])
  }, n.prototype.thumbnail = function (e, i) {
    var s, n, o, r = i.width && i.height ? "width:" + i.width + "px;height:" + i.height + "px;" : "",
      a = e.find("img"),
      l = "src",
      c = "",
      h = this._core.settings,
      d = function (i) {
        n = '<div class="owl-video-play-icon"></div>', s = h.lazyLoad ? t("<div/>", {
          class: "owl-video-tn " + c,
          srcType: i
        }) : t("<div/>", {
          class: "owl-video-tn",
          style: "opacity:1;background-image:url(" + i + ")"
        }), e.after(s), e.after(n)
      };
    if (e.wrap(t("<div/>", {
        class: "owl-video-wrapper",
        style: r
      })), this._core.settings.lazyLoad && (l = "data-src", c = "owl-lazy"), a.length) return d(a.attr(l)), a.remove(), !1;
    "youtube" === i.type ? d(o = "//img.youtube.com/vi/" + i.id + "/hqdefault.jpg") : "vimeo" === i.type ? t.ajax({
      type: "GET",
      url: "//vimeo.com/api/v2/video/" + i.id + ".json",
      jsonp: "callback",
      dataType: "jsonp",
      success: function (t) {
        d(o = t[0].thumbnail_large)
      }
    }) : "vzaar" === i.type && t.ajax({
      type: "GET",
      url: "//vzaar.com/api/videos/" + i.id + ".json",
      jsonp: "callback",
      dataType: "jsonp",
      success: function (t) {
        d(o = t.framegrab_url)
      }
    })
  }, n.prototype.stop = function () {
    this._core.trigger("stop", null, "video"), this._playing.find(".owl-video-frame").remove(), this._playing.removeClass("owl-video-playing"), this._playing = null, this._core.leave("playing"), this._core.trigger("stopped", null, "video")
  }, n.prototype.play = function (e) {
    var i, s = t(e.target).closest("." + this._core.settings.itemClass),
      n = this._videos[s.attr("data-video")],
      o = n.width || "100%",
      r = n.height || this._core.$stage.height();
    this._playing || (this._core.enter("playing"), this._core.trigger("play", null, "video"), s = this._core.items(this._core.relative(s.index())), this._core.reset(s.index()), (i = t('<iframe frameborder="0" allowfullscreen mozallowfullscreen webkitAllowFullScreen ></iframe>')).attr("height", r), i.attr("width", o), "youtube" === n.type ? i.attr("src", "//www.youtube.com/embed/" + n.id + "?autoplay=1&rel=0&v=" + n.id) : "vimeo" === n.type ? i.attr("src", "//player.vimeo.com/video/" + n.id + "?autoplay=1") : "vzaar" === n.type && i.attr("src", "//view.vzaar.com/" + n.id + "/player?autoplay=true"), t(i).wrap('<div class="owl-video-frame" />').insertAfter(s.find(".owl-video")), this._playing = s.addClass("owl-video-playing"))
  }, n.prototype.isInFullScreen = function () {
    var e = i.fullscreenElement || i.mozFullScreenElement || i.webkitFullscreenElement;
    return e && t(e).parent().hasClass("owl-video-frame")
  }, n.prototype.destroy = function () {
    var t, e;
    for (t in this._core.$element.off("click.owl.video"), this._handlers) this._core.$element.off(t, this._handlers[t]);
    for (e in Object.getOwnPropertyNames(this)) "function" != typeof this[e] && (this[e] = null)
  }, t.fn.owlCarousel.Constructor.Plugins.Video = n
}(window.Zepto || window.jQuery, window, document),
function (t, e, i, s) {
  var n = function (e) {
    this.core = e, this.core.options = t.extend({}, n.Defaults, this.core.options), this.swapping = !0, this.previous = s, this.next = s, this.handlers = {
      "change.owl.carousel": t.proxy(function (t) {
        t.namespace && "position" == t.property.name && (this.previous = this.core.current(), this.next = t.property.value)
      }, this),
      "drag.owl.carousel dragged.owl.carousel translated.owl.carousel": t.proxy(function (t) {
        t.namespace && (this.swapping = "translated" == t.type)
      }, this),
      "translate.owl.carousel": t.proxy(function (t) {
        t.namespace && this.swapping && (this.core.options.animateOut || this.core.options.animateIn) && this.swap()
      }, this)
    }, this.core.$element.on(this.handlers)
  };
  n.Defaults = {
    animateOut: !1,
    animateIn: !1
  }, n.prototype.swap = function () {
    if (1 === this.core.settings.items && t.support.animation && t.support.transition) {
      this.core.speed(0);
      var e, i = t.proxy(this.clear, this),
        s = this.core.$stage.children().eq(this.previous),
        n = this.core.$stage.children().eq(this.next),
        o = this.core.settings.animateIn,
        r = this.core.settings.animateOut;
      this.core.current() !== this.previous && (r && (e = this.core.coordinates(this.previous) - this.core.coordinates(this.next), s.one(t.support.animation.end, i).css({
        left: e + "px"
      }).addClass("animated owl-animated-out").addClass(r)), o && n.one(t.support.animation.end, i).addClass("animated owl-animated-in").addClass(o))
    }
  }, n.prototype.clear = function (e) {
    t(e.target).css({
      left: ""
    }).removeClass("animated owl-animated-out owl-animated-in").removeClass(this.core.settings.animateIn).removeClass(this.core.settings.animateOut), this.core.onTransitionEnd()
  }, n.prototype.destroy = function () {
    var t, e;
    for (t in this.handlers) this.core.$element.off(t, this.handlers[t]);
    for (e in Object.getOwnPropertyNames(this)) "function" != typeof this[e] && (this[e] = null)
  }, t.fn.owlCarousel.Constructor.Plugins.Animate = n
}(window.Zepto || window.jQuery, window, document),
function (t, e, i, s) {
  var n = function (e) {
    this._core = e, this._call = null, this._time = 0, this._timeout = 0, this._paused = !0, this._handlers = {
      "changed.owl.carousel": t.proxy(function (t) {
        t.namespace && "settings" === t.property.name ? this._core.settings.autoplay ? this.play() : this.stop() : t.namespace && "position" === t.property.name && this._paused && (this._time = 0)
      }, this),
      "initialized.owl.carousel": t.proxy(function (t) {
        t.namespace && this._core.settings.autoplay && this.play()
      }, this),
      "play.owl.autoplay": t.proxy(function (t, e, i) {
        t.namespace && this.play(e, i)
      }, this),
      "stop.owl.autoplay": t.proxy(function (t) {
        t.namespace && this.stop()
      }, this),
      "mouseover.owl.autoplay": t.proxy(function () {
        this._core.settings.autoplayHoverPause && this._core.is("rotating") && this.pause()
      }, this),
      "mouseleave.owl.autoplay": t.proxy(function () {
        this._core.settings.autoplayHoverPause && this._core.is("rotating") && this.play()
      }, this),
      "touchstart.owl.core": t.proxy(function () {
        this._core.settings.autoplayHoverPause && this._core.is("rotating") && this.pause()
      }, this),
      "touchend.owl.core": t.proxy(function () {
        this._core.settings.autoplayHoverPause && this.play()
      }, this)
    }, this._core.$element.on(this._handlers), this._core.options = t.extend({}, n.Defaults, this._core.options)
  };
  n.Defaults = {
    autoplay: !1,
    autoplayTimeout: 5e3,
    autoplayHoverPause: !1,
    autoplaySpeed: !1
  }, n.prototype._next = function (s) {
    this._call = e.setTimeout(t.proxy(this._next, this, s), this._timeout * (Math.round(this.read() / this._timeout) + 1) - this.read()), this._core.is("interacting") || i.hidden || this._core.next(s || this._core.settings.autoplaySpeed)
  }, n.prototype.read = function () {
    return (new Date).getTime() - this._time
  }, n.prototype.play = function (i, s) {
    var n;
    this._core.is("rotating") || this._core.enter("rotating"), i = i || this._core.settings.autoplayTimeout, n = Math.min(this._time % (this._timeout || i), i), this._paused ? (this._time = this.read(), this._paused = !1) : e.clearTimeout(this._call), this._time += this.read() % i - n, this._timeout = i, this._call = e.setTimeout(t.proxy(this._next, this, s), i - n)
  }, n.prototype.stop = function () {
    this._core.is("rotating") && (this._time = 0, this._paused = !0, e.clearTimeout(this._call), this._core.leave("rotating"))
  }, n.prototype.pause = function () {
    this._core.is("rotating") && !this._paused && (this._time = this.read(), this._paused = !0, e.clearTimeout(this._call))
  }, n.prototype.destroy = function () {
    var t, e;
    for (t in this.stop(), this._handlers) this._core.$element.off(t, this._handlers[t]);
    for (e in Object.getOwnPropertyNames(this)) "function" != typeof this[e] && (this[e] = null)
  }, t.fn.owlCarousel.Constructor.Plugins.autoplay = n
}(window.Zepto || window.jQuery, window, document),
function (t, e, i, s) {
  "use strict";
  var n = function (e) {
    this._core = e, this._initialized = !1, this._pages = [], this._controls = {}, this._templates = [], this.$element = this._core.$element, this._overrides = {
      next: this._core.next,
      prev: this._core.prev,
      to: this._core.to
    }, this._handlers = {
      "prepared.owl.carousel": t.proxy(function (e) {
        e.namespace && this._core.settings.dotsData && this._templates.push('<div class="' + this._core.settings.dotClass + '">' + t(e.content).find("[data-dot]").addBack("[data-dot]").attr("data-dot") + "</div>")
      }, this),
      "added.owl.carousel": t.proxy(function (t) {
        t.namespace && this._core.settings.dotsData && this._templates.splice(t.position, 0, this._templates.pop())
      }, this),
      "remove.owl.carousel": t.proxy(function (t) {
        t.namespace && this._core.settings.dotsData && this._templates.splice(t.position, 1)
      }, this),
      "changed.owl.carousel": t.proxy(function (t) {
        t.namespace && "position" == t.property.name && this.draw()
      }, this),
      "initialized.owl.carousel": t.proxy(function (t) {
        t.namespace && !this._initialized && (this._core.trigger("initialize", null, "navigation"), this.initialize(), this.update(), this.draw(), this._initialized = !0, this._core.trigger("initialized", null, "navigation"))
      }, this),
      "refreshed.owl.carousel": t.proxy(function (t) {
        t.namespace && this._initialized && (this._core.trigger("refresh", null, "navigation"), this.update(), this.draw(), this._core.trigger("refreshed", null, "navigation"))
      }, this)
    }, this._core.options = t.extend({}, n.Defaults, this._core.options), this.$element.on(this._handlers)
  };
  n.Defaults = {
    nav: !1,
    navText: ['<span aria-label="Previous">&#x2039;</span>', '<span aria-label="Next">&#x203a;</span>'],
    navSpeed: !1,
    navElement: 'button type="button" role="presentation"',
    navContainer: !1,
    navContainerClass: "owl-nav",
    navClass: ["owl-prev", "owl-next"],
    slideBy: 1,
    dotClass: "owl-dot",
    dotsClass: "owl-dots",
    dots: !0,
    dotsEach: !1,
    dotsData: !1,
    dotsSpeed: !1,
    dotsContainer: !1
  }, n.prototype.initialize = function () {
    var e, i = this._core.settings;
    for (e in this._controls.$relative = (i.navContainer ? t(i.navContainer) : t("<div>").addClass(i.navContainerClass).appendTo(this.$element)).addClass("disabled"), this._controls.$previous = t("<" + i.navElement + ">").addClass(i.navClass[0]).html(i.navText[0]).prependTo(this._controls.$relative).on("click", t.proxy(function (t) {
        this.prev(i.navSpeed)
      }, this)), this._controls.$next = t("<" + i.navElement + ">").addClass(i.navClass[1]).html(i.navText[1]).appendTo(this._controls.$relative).on("click", t.proxy(function (t) {
        this.next(i.navSpeed)
      }, this)), i.dotsData || (this._templates = [t('<button role="button">').addClass(i.dotClass).append(t("<span>")).prop("outerHTML")]), this._controls.$absolute = (i.dotsContainer ? t(i.dotsContainer) : t("<div>").addClass(i.dotsClass).appendTo(this.$element)).addClass("disabled"), this._controls.$absolute.on("click", "button", t.proxy(function (e) {
        var s = t(e.target).parent().is(this._controls.$absolute) ? t(e.target).index() : t(e.target).parent().index();
        e.preventDefault(), this.to(s, i.dotsSpeed)
      }, this)), this._overrides) this._core[e] = t.proxy(this[e], this)
  }, n.prototype.destroy = function () {
    var t, e, i, s, n;
    for (t in n = this._core.settings, this._handlers) this.$element.off(t, this._handlers[t]);
    for (e in this._controls) "$relative" === e && n.navContainer ? this._controls[e].html("") : this._controls[e].remove();
    for (s in this.overides) this._core[s] = this._overrides[s];
    for (i in Object.getOwnPropertyNames(this)) "function" != typeof this[i] && (this[i] = null)
  }, n.prototype.update = function () {
    var t, e, i, s = this._core.clones().length / 2,
      n = s + this._core.items().length,
      o = this._core.maximum(!0),
      r = this._core.settings,
      a = r.center || r.autoWidth || r.dotsData ? 1 : r.dotsEach || r.items;
    if ("page" !== r.slideBy && (r.slideBy = Math.min(r.slideBy, r.items)), r.dots || "page" == r.slideBy)
      for (this._pages = [], t = s, e = 0, i = 0; t < n; t++) {
        if (e >= a || 0 === e) {
          if (this._pages.push({
              start: Math.min(o, t - s),
              end: t - s + a - 1
            }), Math.min(o, t - s) === o) break;
          e = 0, ++i
        }
        e += this._core.mergers(this._core.relative(t))
      }
  }, n.prototype.draw = function () {
    var e, i = this._core.settings,
      s = this._core.items().length <= i.items,
      n = this._core.relative(this._core.current()),
      o = i.loop || i.rewind;
    this._controls.$relative.toggleClass("disabled", !i.nav || s), i.nav && (this._controls.$previous.toggleClass("disabled", !o && n <= this._core.minimum(!0)), this._controls.$next.toggleClass("disabled", !o && n >= this._core.maximum(!0))), this._controls.$absolute.toggleClass("disabled", !i.dots || s), i.dots && (e = this._pages.length - this._controls.$absolute.children().length, i.dotsData && 0 !== e ? this._controls.$absolute.html(this._templates.join("")) : e > 0 ? this._controls.$absolute.append(Array(e + 1).join(this._templates[0])) : e < 0 && this._controls.$absolute.children().slice(e).remove(), this._controls.$absolute.find(".active").removeClass("active"), this._controls.$absolute.children().eq(t.inArray(this.current(), this._pages)).addClass("active"))
  }, n.prototype.onTrigger = function (e) {
    var i = this._core.settings;
    e.page = {
      index: t.inArray(this.current(), this._pages),
      count: this._pages.length,
      size: i && (i.center || i.autoWidth || i.dotsData ? 1 : i.dotsEach || i.items)
    }
  }, n.prototype.current = function () {
    var e = this._core.relative(this._core.current());
    return t.grep(this._pages, t.proxy(function (t, i) {
      return t.start <= e && t.end >= e
    }, this)).pop()
  }, n.prototype.getPosition = function (e) {
    var i, s, n = this._core.settings;
    return "page" == n.slideBy ? (i = t.inArray(this.current(), this._pages), s = this._pages.length, e ? ++i : --i, i = this._pages[(i % s + s) % s].start) : (i = this._core.relative(this._core.current()), s = this._core.items().length, e ? i += n.slideBy : i -= n.slideBy), i
  }, n.prototype.next = function (e) {
    t.proxy(this._overrides.to, this._core)(this.getPosition(!0), e)
  }, n.prototype.prev = function (e) {
    t.proxy(this._overrides.to, this._core)(this.getPosition(!1), e)
  }, n.prototype.to = function (e, i, s) {
    var n;
    !s && this._pages.length ? (n = this._pages.length, t.proxy(this._overrides.to, this._core)(this._pages[(e % n + n) % n].start, i)) : t.proxy(this._overrides.to, this._core)(e, i)
  }, t.fn.owlCarousel.Constructor.Plugins.Navigation = n
}(window.Zepto || window.jQuery, window, document),
function (t, e, i, s) {
  "use strict";
  var n = function (i) {
    this._core = i, this._hashes = {}, this.$element = this._core.$element, this._handlers = {
      "initialized.owl.carousel": t.proxy(function (i) {
        i.namespace && "URLHash" === this._core.settings.startPosition && t(e).trigger("hashchange.owl.navigation")
      }, this),
      "prepared.owl.carousel": t.proxy(function (e) {
        if (e.namespace) {
          var i = t(e.content).find("[data-hash]").addBack("[data-hash]").attr("data-hash");
          i && (this._hashes[i] = e.content)
        }
      }, this),
      "changed.owl.carousel": t.proxy(function (i) {
        if (i.namespace && "position" === i.property.name) {
          var s = this._core.items(this._core.relative(this._core.current())),
            n = t.map(this._hashes, function (t, e) {
              return t === s ? e : null
            }).join();
          n && e.location.hash.slice(1) !== n && (e.location.hash = n)
        }
      }, this)
    }, this._core.options = t.extend({}, n.Defaults, this._core.options), this.$element.on(this._handlers), t(e).on("hashchange.owl.navigation", t.proxy(function (t) {
      var i = e.location.hash.substring(1),
        s = this._core.$stage.children(),
        n = this._hashes[i] && s.index(this._hashes[i]);
      void 0 !== n && n !== this._core.current() && this._core.to(this._core.relative(n), !1, !0)
    }, this))
  };
  n.Defaults = {
    URLhashListener: !1
  }, n.prototype.destroy = function () {
    var i, s;
    for (i in t(e).off("hashchange.owl.navigation"), this._handlers) this._core.$element.off(i, this._handlers[i]);
    for (s in Object.getOwnPropertyNames(this)) "function" != typeof this[s] && (this[s] = null)
  }, t.fn.owlCarousel.Constructor.Plugins.Hash = n
}(window.Zepto || window.jQuery, window, document),
function (t, e, i, s) {
  function n(e, i) {
    var s = !1,
      n = e.charAt(0).toUpperCase() + e.slice(1);
    return t.each((e + " " + a.join(n + " ") + n).split(" "), function (t, e) {
      if (void 0 !== r[e]) return s = !i || e, !1
    }), s
  }

  function o(t) {
    return n(t, !0)
  }
  var r = t("<support>").get(0).style,
    a = "Webkit Moz O ms".split(" "),
    l = {
      transition: {
        end: {
          WebkitTransition: "webkitTransitionEnd",
          MozTransition: "transitionend",
          OTransition: "oTransitionEnd",
          transition: "transitionend"
        }
      },
      animation: {
        end: {
          WebkitAnimation: "webkitAnimationEnd",
          MozAnimation: "animationend",
          OAnimation: "oAnimationEnd",
          animation: "animationend"
        }
      }
    },
    c = {
      csstransforms: function () {
        return !!n("transform")
      },
      csstransforms3d: function () {
        return !!n("perspective")
      },
      csstransitions: function () {
        return !!n("transition")
      },
      cssanimations: function () {
        return !!n("animation")
      }
    };
  c.csstransitions() && (t.support.transition = new String(o("transition")), t.support.transition.end = l.transition.end[t.support.transition]), c.cssanimations() && (t.support.animation = new String(o("animation")), t.support.animation.end = l.animation.end[t.support.animation]), c.csstransforms() && (t.support.transform = new String(o("transform")), t.support.transform3d = c.csstransforms3d())
}(window.Zepto || window.jQuery, window, document),
function (t, e) {
  "object" == typeof exports && "object" == typeof module ? module.exports = e() : "function" == typeof define && define.amd ? define([], e) : "object" == typeof exports ? exports.AOS = e() : t.AOS = e()
}(this, function () {
  return function (t) {
    function e(s) {
      if (i[s]) return i[s].exports;
      var n = i[s] = {
        exports: {},
        id: s,
        loaded: !1
      };
      return t[s].call(n.exports, n, n.exports, e), n.loaded = !0, n.exports
    }
    var i = {};
    return e.m = t, e.c = i, e.p = "dist/", e(0)
  }([function (t, e, i) {
    "use strict";

    function s(t) {
      return t && t.__esModule ? t : {
        default: t
      }
    }
    var n = Object.assign || function (t) {
        for (var e = 1; e < arguments.length; e++) {
          var i = arguments[e];
          for (var s in i) Object.prototype.hasOwnProperty.call(i, s) && (t[s] = i[s])
        }
        return t
      },
      o = i(1),
      r = (s(o), i(6)),
      a = s(r),
      l = i(7),
      c = s(l),
      h = i(8),
      d = s(h),
      u = i(9),
      p = s(u),
      f = i(10),
      g = s(f),
      m = i(11),
      v = s(m),
      y = i(14),
      w = s(y),
      $ = [],
      b = !1,
      C = {
        offset: 120,
        delay: 0,
        easing: "ease",
        duration: 400,
        disable: !1,
        once: !1,
        startEvent: "DOMContentLoaded",
        throttleDelay: 99,
        debounceDelay: 50,
        disableMutationObserver: !1
      },
      S = function () {
        var t = arguments.length > 0 && void 0 !== arguments[0] && arguments[0];
        if (t && (b = !0), b) return $ = (0, v.default)($, C), (0, g.default)($, C.once), $
      },
      T = function () {
        $ = (0, w.default)(), S()
      },
      k = function () {
        $.forEach(function (t, e) {
          t.node.removeAttribute("data-aos"), t.node.removeAttribute("data-aos-easing"), t.node.removeAttribute("data-aos-duration"), t.node.removeAttribute("data-aos-delay")
        })
      },
      _ = function (t) {
        C = n(C, t), $ = (0, w.default)();
        var e, i = document.all && !window.atob;
        return !0 === (e = C.disable) || "mobile" === e && p.default.mobile() || "phone" === e && p.default.phone() || "tablet" === e && p.default.tablet() || "function" == typeof e && !0 === e() || i ? k() : (document.querySelector("body").setAttribute("data-aos-easing", C.easing), document.querySelector("body").setAttribute("data-aos-duration", C.duration), document.querySelector("body").setAttribute("data-aos-delay", C.delay), "DOMContentLoaded" === C.startEvent && ["complete", "interactive"].indexOf(document.readyState) > -1 ? S(!0) : "load" === C.startEvent ? window.addEventListener(C.startEvent, function () {
          S(!0)
        }) : document.addEventListener(C.startEvent, function () {
          S(!0)
        }), window.addEventListener("resize", (0, c.default)(S, C.debounceDelay, !0)), window.addEventListener("orientationchange", (0, c.default)(S, C.debounceDelay, !0)), window.addEventListener("scroll", (0, a.default)(function () {
          (0, g.default)($, C.once)
        }, C.throttleDelay)), C.disableMutationObserver || (0, d.default)("[data-aos]", T), $)
      };
    t.exports = {
      init: _,
      refresh: S,
      refreshHard: T
    }
  }, function (t, e) {}, , , , , function (t, e) {
    (function (e) {
      "use strict";

      function i(t) {
        var e = void 0 === t ? "undefined" : n(t);
        return !!t && ("object" == e || "function" == e)
      }

      function s(t) {
        if ("number" == typeof t) return t;
        if ("symbol" == (void 0 === (e = t) ? "undefined" : n(e)) || (s = e) && "object" == (void 0 === s ? "undefined" : n(s)) && m.call(e) == a) return r;
        if (i(t)) {
          var e, s, o = "function" == typeof t.valueOf ? t.valueOf() : t;
          t = i(o) ? o + "" : o
        }
        if ("string" != typeof t) return 0 === t ? t : +t;
        t = t.replace(l, "");
        var p = h.test(t);
        return p || d.test(t) ? u(t.slice(2), p ? 2 : 8) : c.test(t) ? r : +t
      }
      var n = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (t) {
          return typeof t
        } : function (t) {
          return t && "function" == typeof Symbol && t.constructor === Symbol && t !== Symbol.prototype ? "symbol" : typeof t
        },
        o = "Expected a function",
        r = NaN,
        a = "[object Symbol]",
        l = /^\s+|\s+$/g,
        c = /^[-+]0x[0-9a-f]+$/i,
        h = /^0b[01]+$/i,
        d = /^0o[0-7]+$/i,
        u = parseInt,
        p = "object" == (void 0 === e ? "undefined" : n(e)) && e && e.Object === Object && e,
        f = "object" == ("undefined" == typeof self ? "undefined" : n(self)) && self && self.Object === Object && self,
        g = p || f || Function("return this")(),
        m = Object.prototype.toString,
        v = Math.max,
        y = Math.min,
        w = function () {
          return g.Date.now()
        };
      t.exports = function t(e, n, r) {
        var a = !0,
          l = !0;
        if ("function" != typeof e) throw TypeError(o);
        return i(r) && (a = "leading" in r ? !!r.leading : a, l = "trailing" in r ? !!r.trailing : l),
          function t(e, n, r) {
            function a(t) {
              var i = u,
                s = p;
              return u = p = void 0, b = t, g = e.apply(s, i)
            }

            function l(t) {
              var e = t - $,
                i = t - b;
              return void 0 === $ || e >= n || e < 0 || S && i >= f
            }

            function c() {
              var t, e, i, s, o = w();
              return l(o) ? h(o) : void(m = setTimeout(c, (e = (t = o) - $, i = t - b, s = n - e, S ? y(s, f - i) : s)))
            }

            function h(t) {
              return m = void 0, T && u ? a(t) : (u = p = void 0, g)
            }

            function d() {
              var t, e = w(),
                i = l(e);
              if (u = arguments, p = this, $ = e, i) {
                if (void 0 === m) return b = t = $, m = setTimeout(c, n), C ? a(t) : g;
                if (S) return m = setTimeout(c, n), a($)
              }
              return void 0 === m && (m = setTimeout(c, n)), g
            }
            var u, p, f, g, m, $, b = 0,
              C = !1,
              S = !1,
              T = !0;
            if ("function" != typeof e) throw TypeError(o);
            return n = s(n) || 0, i(r) && (C = !!r.leading, f = (S = "maxWait" in r) ? v(s(r.maxWait) || 0, n) : f, T = "trailing" in r ? !!r.trailing : T), d.cancel = function t() {
              void 0 !== m && clearTimeout(m), b = 0, u = $ = p = m = void 0
            }, d.flush = function t() {
              return void 0 === m ? g : h(w())
            }, d
          }(e, n, {
            leading: a,
            maxWait: n,
            trailing: l
          })
      }
    }).call(e, function () {
      return this
    }())
  }, function (t, e) {
    (function (e) {
      "use strict";

      function i(t) {
        var e = void 0 === t ? "undefined" : n(t);
        return !!t && ("object" == e || "function" == e)
      }

      function s(t) {
        if ("number" == typeof t) return t;
        if ("symbol" == (void 0 === (e = t) ? "undefined" : n(e)) || (s = e) && "object" == (void 0 === s ? "undefined" : n(s)) && g.call(e) == r) return o;
        if (i(t)) {
          var e, s, u = "function" == typeof t.valueOf ? t.valueOf() : t;
          t = i(u) ? u + "" : u
        }
        if ("string" != typeof t) return 0 === t ? t : +t;
        t = t.replace(a, "");
        var p = c.test(t);
        return p || h.test(t) ? d(t.slice(2), p ? 2 : 8) : l.test(t) ? o : +t
      }
      var n = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (t) {
          return typeof t
        } : function (t) {
          return t && "function" == typeof Symbol && t.constructor === Symbol && t !== Symbol.prototype ? "symbol" : typeof t
        },
        o = NaN,
        r = "[object Symbol]",
        a = /^\s+|\s+$/g,
        l = /^[-+]0x[0-9a-f]+$/i,
        c = /^0b[01]+$/i,
        h = /^0o[0-7]+$/i,
        d = parseInt,
        u = "object" == (void 0 === e ? "undefined" : n(e)) && e && e.Object === Object && e,
        p = "object" == ("undefined" == typeof self ? "undefined" : n(self)) && self && self.Object === Object && self,
        f = u || p || Function("return this")(),
        g = Object.prototype.toString,
        m = Math.max,
        v = Math.min,
        y = function () {
          return f.Date.now()
        };
      t.exports = function t(e, n, o) {
        function r(t) {
          var i = d,
            s = u;
          return d = u = void 0, $ = t, f = e.apply(s, i)
        }

        function a(t) {
          var e = t - w,
            i = t - $;
          return void 0 === w || e >= n || e < 0 || C && i >= p
        }

        function l() {
          var t, e, i, s, o = y();
          return a(o) ? c(o) : void(g = setTimeout(l, (e = (t = o) - w, i = t - $, s = n - e, C ? v(s, p - i) : s)))
        }

        function c(t) {
          return g = void 0, S && d ? r(t) : (d = u = void 0, f)
        }

        function h() {
          var t, e = y(),
            i = a(e);
          if (d = arguments, u = this, w = e, i) {
            if (void 0 === g) return $ = t = w, g = setTimeout(l, n), b ? r(t) : f;
            if (C) return g = setTimeout(l, n), r(w)
          }
          return void 0 === g && (g = setTimeout(l, n)), f
        }
        var d, u, p, f, g, w, $ = 0,
          b = !1,
          C = !1,
          S = !0;
        if ("function" != typeof e) throw TypeError("Expected a function");
        return n = s(n) || 0, i(o) && (b = !!o.leading, p = (C = "maxWait" in o) ? m(s(o.maxWait) || 0, n) : p, S = "trailing" in o ? !!o.trailing : S), h.cancel = function t() {
          void 0 !== g && clearTimeout(g), $ = 0, d = w = u = g = void 0
        }, h.flush = function t() {
          return void 0 === g ? f : c(y())
        }, h
      }
    }).call(e, function () {
      return this
    }())
  }, function (t, e) {
    "use strict";

    function i(t) {
      t && t.forEach(function (t) {
        var e = Array.prototype.slice.call(t.addedNodes),
          i = Array.prototype.slice.call(t.removedNodes);
        e.concat(i).filter(function (t) {
          return t.hasAttribute && t.hasAttribute("data-aos")
        }).length && s()
      })
    }
    Object.defineProperty(e, "__esModule", {
      value: !0
    });
    var s = function () {};
    e.default = function t(e, n) {
      var o = window.document,
        r = new(window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver)(i);
      s = n, r.observe(o.documentElement, {
        childList: !0,
        subtree: !0,
        removedNodes: !0
      })
    }
  }, function (t, e) {
    "use strict";

    function i() {
      return navigator.userAgent || navigator.vendor || window.opera || ""
    }
    Object.defineProperty(e, "__esModule", {
      value: !0
    });
    var s = function () {
        function t(t, e) {
          for (var i = 0; i < e.length; i++) {
            var s = e[i];
            s.enumerable = s.enumerable || !1, s.configurable = !0, "value" in s && (s.writable = !0), Object.defineProperty(t, s.key, s)
          }
        }
        return function (e, i, s) {
          return i && t(e.prototype, i), s && t(e, s), e
        }
      }(),
      n = /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i,
      o = /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i,
      r = /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino|android|ipad|playbook|silk/i,
      a = /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i,
      l = function () {
        function t() {
          ! function t(e, i) {
            if (!(e instanceof i)) throw TypeError("Cannot call a class as a function")
          }(this, t)
        }
        return s(t, [{
          key: "phone",
          value: function () {
            var t = i();
            return !(!n.test(t) && !o.test(t.substr(0, 4)))
          }
        }, {
          key: "mobile",
          value: function () {
            var t = i();
            return !(!r.test(t) && !a.test(t.substr(0, 4)))
          }
        }, {
          key: "tablet",
          value: function () {
            return this.mobile() && !this.phone()
          }
        }]), t
      }();
    e.default = new l
  }, function (t, e) {
    "use strict";
    Object.defineProperty(e, "__esModule", {
      value: !0
    });
    var i = function (t, e, i) {
        var s = t.node.getAttribute("data-aos-once");
        e > t.position ? t.node.classList.add("aos-animate") : void 0 === s || "false" !== s && (i || "true" === s) || t.node.classList.remove("aos-animate")
      },
      s = function (t, e) {
        var s = window.pageYOffset,
          n = window.innerHeight;
        t.forEach(function (t, o) {
          i(t, n + s, e)
        })
      };
    e.default = s
  }, function (t, e, i) {
    "use strict";
    Object.defineProperty(e, "__esModule", {
      value: !0
    });
    var s, n = (s = i(12)) && s.__esModule ? s : {
        default: s
      },
      o = function (t, e) {
        return t.forEach(function (t, i) {
          t.node.classList.add("aos-init"), t.position = (0, n.default)(t.node, e.offset)
        }), t
      };
    e.default = o
  }, function (t, e, i) {
    "use strict";
    Object.defineProperty(e, "__esModule", {
      value: !0
    });
    var s, n = (s = i(13)) && s.__esModule ? s : {
        default: s
      },
      o = function (t, e) {
        var i = 0,
          s = 0,
          o = window.innerHeight,
          r = {
            offset: t.getAttribute("data-aos-offset"),
            anchor: t.getAttribute("data-aos-anchor"),
            anchorPlacement: t.getAttribute("data-aos-anchor-placement")
          };
        switch (r.offset && !isNaN(r.offset) && (s = parseInt(r.offset)), r.anchor && document.querySelectorAll(r.anchor) && (t = document.querySelectorAll(r.anchor)[0]), i = (0, n.default)(t).top, r.anchorPlacement) {
          case "top-bottom":
            break;
          case "center-bottom":
            i += t.offsetHeight / 2;
            break;
          case "bottom-bottom":
            i += t.offsetHeight;
            break;
          case "top-center":
            i += o / 2;
            break;
          case "bottom-center":
            i += o / 2 + t.offsetHeight;
            break;
          case "center-center":
            i += o / 2 + t.offsetHeight / 2;
            break;
          case "top-top":
            i += o;
            break;
          case "bottom-top":
            i += t.offsetHeight + o;
            break;
          case "center-top":
            i += t.offsetHeight / 2 + o
        }
        return r.anchorPlacement || r.offset || isNaN(e) || (s = e), i + s
      };
    e.default = o
  }, function (t, e) {
    "use strict";
    Object.defineProperty(e, "__esModule", {
      value: !0
    });
    var i = function (t) {
      for (var e = 0, i = 0; t && !isNaN(t.offsetLeft) && !isNaN(t.offsetTop);) e += t.offsetLeft - ("BODY" != t.tagName ? t.scrollLeft : 0), i += t.offsetTop - ("BODY" != t.tagName ? t.scrollTop : 0), t = t.offsetParent;
      return {
        top: i,
        left: e
      }
    };
    e.default = i
  }, function (t, e) {
    "use strict";
    Object.defineProperty(e, "__esModule", {
      value: !0
    });
    var i = function (t) {
      return t = t || document.querySelectorAll("[data-aos]"), Array.prototype.map.call(t, function (t) {
        return {
          node: t
        }
      })
    };
    e.default = i
  }])
}),
function (t) {
  "use strict";
  "function" == typeof define && define.amd ? define(["jquery"], t) : "undefined" != typeof exports ? module.exports = t(require("jquery")) : t(jQuery)
}(function (t) {
  "use strict";
  var e, i = window.Slick || {};
  (i = (e = 0, function (i, s) {
    var n, o = this;
    o.defaults = {
      accessibility: !0,
      adaptiveHeight: !1,
      appendArrows: t(i),
      appendDots: t(i),
      arrows: !0,
      asNavFor: null,
      prevArrow: '<button class="slick-prev" aria-label="Previous" type="button">Previous</button>',
      nextArrow: '<button class="slick-next" aria-label="Next" type="button">Next</button>',
      autoplay: !1,
      autoplaySpeed: 3e3,
      centerMode: !1,
      centerPadding: "50px",
      cssEase: "ease",
      customPaging: function (e, i) {
        return t('<button type="button" />').text(i + 1)
      },
      dots: !1,
      dotsClass: "slick-dots",
      draggable: !0,
      easing: "linear",
      edgeFriction: .35,
      fade: !1,
      focusOnSelect: !1,
      focusOnChange: !1,
      infinite: !0,
      initialSlide: 0,
      lazyLoad: "ondemand",
      mobileFirst: !1,
      pauseOnHover: !0,
      pauseOnFocus: !0,
      pauseOnDotsHover: !1,
      respondTo: "window",
      responsive: null,
      rows: 1,
      rtl: !1,
      slide: "",
      slidesPerRow: 1,
      slidesToShow: 1,
      slidesToScroll: 1,
      speed: 500,
      swipe: !0,
      swipeToSlide: !1,
      touchMove: !0,
      touchThreshold: 5,
      useCSS: !0,
      useTransform: !0,
      variableWidth: !1,
      vertical: !1,
      verticalSwiping: !1,
      waitForAnimate: !0,
      zIndex: 1e3
    }, o.initials = {
      animating: !1,
      dragging: !1,
      autoPlayTimer: null,
      currentDirection: 0,
      currentLeft: null,
      currentSlide: 0,
      direction: 1,
      $dots: null,
      listWidth: null,
      listHeight: null,
      loadIndex: 0,
      $nextArrow: null,
      $prevArrow: null,
      scrolling: !1,
      slideCount: null,
      slideWidth: null,
      $slideTrack: null,
      $slides: null,
      sliding: !1,
      slideOffset: 0,
      swipeLeft: null,
      swiping: !1,
      $list: null,
      touchObject: {},
      transformsEnabled: !1,
      unslicked: !1
    }, t.extend(o, o.initials), o.activeBreakpoint = null, o.animType = null, o.animProp = null, o.breakpoints = [], o.breakpointSettings = [], o.cssTransitions = !1, o.focussed = !1, o.interrupted = !1, o.hidden = "hidden", o.paused = !0, o.positionProp = null, o.respondTo = null, o.rowCount = 1, o.shouldClick = !0, o.$slider = t(i), o.$slidesCache = null, o.transformType = null, o.transitionType = null, o.visibilityChange = "visibilitychange", o.windowWidth = 0, o.windowTimer = null, n = t(i).data("slick") || {}, o.options = t.extend({}, o.defaults, s, n), o.currentSlide = o.options.initialSlide, o.originalSettings = o.options, void 0 !== document.mozHidden ? (o.hidden = "mozHidden", o.visibilityChange = "mozvisibilitychange") : void 0 !== document.webkitHidden && (o.hidden = "webkitHidden", o.visibilityChange = "webkitvisibilitychange"), o.autoPlay = t.proxy(o.autoPlay, o), o.autoPlayClear = t.proxy(o.autoPlayClear, o), o.autoPlayIterator = t.proxy(o.autoPlayIterator, o), o.changeSlide = t.proxy(o.changeSlide, o), o.clickHandler = t.proxy(o.clickHandler, o), o.selectHandler = t.proxy(o.selectHandler, o), o.setPosition = t.proxy(o.setPosition, o), o.swipeHandler = t.proxy(o.swipeHandler, o), o.dragHandler = t.proxy(o.dragHandler, o), o.keyHandler = t.proxy(o.keyHandler, o), o.instanceUid = e++, o.htmlExpr = /^(?:\s*(<[\w\W]+>)[^>]*)$/, o.registerBreakpoints(), o.init(!0)
  })).prototype.activateADA = function () {
    this.$slideTrack.find(".slick-active").attr({
      "aria-hidden": "false"
    }).find("a, input, button, select").attr({
      tabindex: "0"
    })
  }, i.prototype.addSlide = i.prototype.slickAdd = function (e, i, s) {
    var n = this;
    if ("boolean" == typeof i) s = i, i = null;
    else if (i < 0 || i >= n.slideCount) return !1;
    n.unload(), "number" == typeof i ? 0 === i && 0 === n.$slides.length ? t(e).appendTo(n.$slideTrack) : s ? t(e).insertBefore(n.$slides.eq(i)) : t(e).insertAfter(n.$slides.eq(i)) : !0 === s ? t(e).prependTo(n.$slideTrack) : t(e).appendTo(n.$slideTrack), n.$slides = n.$slideTrack.children(this.options.slide), n.$slideTrack.children(this.options.slide).detach(), n.$slideTrack.append(n.$slides), n.$slides.each(function (e, i) {
      t(i).attr("data-slick-index", e)
    }), n.$slidesCache = n.$slides, n.reinit()
  }, i.prototype.animateHeight = function () {
    if (1 === this.options.slidesToShow && !0 === this.options.adaptiveHeight && !1 === this.options.vertical) {
      var t = this.$slides.eq(this.currentSlide).outerHeight(!0);
      this.$list.animate({
        height: t
      }, this.options.speed)
    }
  }, i.prototype.animateSlide = function (e, i) {
    var s = {},
      n = this;
    n.animateHeight(), !0 === n.options.rtl && !1 === n.options.vertical && (e = -e), !1 === n.transformsEnabled ? !1 === n.options.vertical ? n.$slideTrack.animate({
      left: e
    }, n.options.speed, n.options.easing, i) : n.$slideTrack.animate({
      top: e
    }, n.options.speed, n.options.easing, i) : !1 === n.cssTransitions ? (!0 === n.options.rtl && (n.currentLeft = -n.currentLeft), t({
      animStart: n.currentLeft
    }).animate({
      animStart: e
    }, {
      duration: n.options.speed,
      easing: n.options.easing,
      step: function (t) {
        t = Math.ceil(t), !1 === n.options.vertical ? (s[n.animType] = "translate(" + t + "px, 0px)", n.$slideTrack.css(s)) : (s[n.animType] = "translate(0px," + t + "px)", n.$slideTrack.css(s))
      },
      complete: function () {
        i && i.call()
      }
    })) : (n.applyTransition(), e = Math.ceil(e), !1 === n.options.vertical ? s[n.animType] = "translate3d(" + e + "px, 0px, 0px)" : s[n.animType] = "translate3d(0px," + e + "px, 0px)", n.$slideTrack.css(s), i && setTimeout(function () {
      n.disableTransition(), i.call()
    }, n.options.speed))
  }, i.prototype.getNavTarget = function () {
    var e = this.options.asNavFor;
    return e && null !== e && (e = t(e).not(this.$slider)), e
  }, i.prototype.asNavFor = function (e) {
    var i = this.getNavTarget();
    null !== i && "object" == typeof i && i.each(function () {
      var i = t(this).slick("getSlick");
      i.unslicked || i.slideHandler(e, !0)
    })
  }, i.prototype.applyTransition = function (t) {
    var e = this,
      i = {};
    !1 === e.options.fade ? i[e.transitionType] = e.transformType + " " + e.options.speed + "ms " + e.options.cssEase : i[e.transitionType] = "opacity " + e.options.speed + "ms " + e.options.cssEase, !1 === e.options.fade ? e.$slideTrack.css(i) : e.$slides.eq(t).css(i)
  }, i.prototype.autoPlay = function () {
    var t = this;
    t.autoPlayClear(), t.slideCount > t.options.slidesToShow && (t.autoPlayTimer = setInterval(t.autoPlayIterator, t.options.autoplaySpeed))
  }, i.prototype.autoPlayClear = function () {
    this.autoPlayTimer && clearInterval(this.autoPlayTimer)
  }, i.prototype.autoPlayIterator = function () {
    var t = this,
      e = t.currentSlide + t.options.slidesToScroll;
    t.paused || t.interrupted || t.focussed || (!1 === t.options.infinite && (1 === t.direction && t.currentSlide + 1 === t.slideCount - 1 ? t.direction = 0 : 0 === t.direction && (e = t.currentSlide - t.options.slidesToScroll, t.currentSlide - 1 == 0 && (t.direction = 1))), t.slideHandler(e))
  }, i.prototype.buildArrows = function () {
    var e = this;
    !0 === e.options.arrows && (e.$prevArrow = t(e.options.prevArrow).addClass("slick-arrow"), e.$nextArrow = t(e.options.nextArrow).addClass("slick-arrow"), e.slideCount > e.options.slidesToShow ? (e.$prevArrow.removeClass("slick-hidden").removeAttr("aria-hidden tabindex"), e.$nextArrow.removeClass("slick-hidden").removeAttr("aria-hidden tabindex"), e.htmlExpr.test(e.options.prevArrow) && e.$prevArrow.prependTo(e.options.appendArrows), e.htmlExpr.test(e.options.nextArrow) && e.$nextArrow.appendTo(e.options.appendArrows), !0 !== e.options.infinite && e.$prevArrow.addClass("slick-disabled").attr("aria-disabled", "true")) : e.$prevArrow.add(e.$nextArrow).addClass("slick-hidden").attr({
      "aria-disabled": "true",
      tabindex: "-1"
    }))
  }, i.prototype.buildDots = function () {
    var e, i, s = this;
    if (!0 === s.options.dots && s.slideCount > s.options.slidesToShow) {
      for (s.$slider.addClass("slick-dotted"), i = t("<ul />").addClass(s.options.dotsClass), e = 0; e <= s.getDotCount(); e += 1) i.append(t("<li />").append(s.options.customPaging.call(this, s, e)));
      s.$dots = i.appendTo(s.options.appendDots), s.$dots.find("li").first().addClass("slick-active")
    }
  }, i.prototype.buildOut = function () {
    var e = this;
    e.$slides = e.$slider.children(e.options.slide + ":not(.slick-cloned)").addClass("slick-slide"), e.slideCount = e.$slides.length, e.$slides.each(function (e, i) {
      t(i).attr("data-slick-index", e).data("originalStyling", t(i).attr("style") || "")
    }), e.$slider.addClass("slick-slider"), e.$slideTrack = 0 === e.slideCount ? t('<div class="slick-track"/>').appendTo(e.$slider) : e.$slides.wrapAll('<div class="slick-track"/>').parent(), e.$list = e.$slideTrack.wrap('<div class="slick-list"/>').parent(), e.$slideTrack.css("opacity", 0), !0 !== e.options.centerMode && !0 !== e.options.swipeToSlide || (e.options.slidesToScroll = 1), t("img[data-lazy]", e.$slider).not("[src]").addClass("slick-loading"), e.setupInfinite(), e.buildArrows(), e.buildDots(), e.updateDots(), e.setSlideClasses("number" == typeof e.currentSlide ? e.currentSlide : 0), !0 === e.options.draggable && e.$list.addClass("draggable")
  }, i.prototype.buildRows = function () {
    var t, e, i, s, n, o, r;
    if (s = document.createDocumentFragment(), o = this.$slider.children(), this.options.rows > 0) {
      for (r = this.options.slidesPerRow * this.options.rows, n = Math.ceil(o.length / r), t = 0; t < n; t++) {
        var a = document.createElement("div");
        for (e = 0; e < this.options.rows; e++) {
          var l = document.createElement("div");
          for (i = 0; i < this.options.slidesPerRow; i++) {
            var c = t * r + (e * this.options.slidesPerRow + i);
            o.get(c) && l.appendChild(o.get(c))
          }
          a.appendChild(l)
        }
        s.appendChild(a)
      }
      this.$slider.empty().append(s), this.$slider.children().children().children().css({
        width: 100 / this.options.slidesPerRow + "%",
        display: "inline-block"
      })
    }
  }, i.prototype.checkResponsive = function (e, i) {
    var s, n, o, r = this,
      a = !1,
      l = r.$slider.width(),
      c = window.innerWidth || t(window).width();
    if ("window" === r.respondTo ? o = c : "slider" === r.respondTo ? o = l : "min" === r.respondTo && (o = Math.min(c, l)), r.options.responsive && r.options.responsive.length && null !== r.options.responsive) {
      for (s in n = null, r.breakpoints) r.breakpoints.hasOwnProperty(s) && (!1 === r.originalSettings.mobileFirst ? o < r.breakpoints[s] && (n = r.breakpoints[s]) : o > r.breakpoints[s] && (n = r.breakpoints[s]));
      null !== n ? null !== r.activeBreakpoint ? (n !== r.activeBreakpoint || i) && (r.activeBreakpoint = n, "unslick" === r.breakpointSettings[n] ? r.unslick(n) : (r.options = t.extend({}, r.originalSettings, r.breakpointSettings[n]), !0 === e && (r.currentSlide = r.options.initialSlide), r.refresh(e)), a = n) : (r.activeBreakpoint = n, "unslick" === r.breakpointSettings[n] ? r.unslick(n) : (r.options = t.extend({}, r.originalSettings, r.breakpointSettings[n]), !0 === e && (r.currentSlide = r.options.initialSlide), r.refresh(e)), a = n) : null !== r.activeBreakpoint && (r.activeBreakpoint = null, r.options = r.originalSettings, !0 === e && (r.currentSlide = r.options.initialSlide), r.refresh(e), a = n), e || !1 === a || r.$slider.trigger("breakpoint", [r, a])
    }
  }, i.prototype.changeSlide = function (e, i) {
    var s, n, o = t(e.currentTarget);
    switch (o.is("a") && e.preventDefault(), o.is("li") || (o = o.closest("li")), s = this.slideCount % this.options.slidesToScroll != 0 ? 0 : (this.slideCount - this.currentSlide) % this.options.slidesToScroll, e.data.message) {
      case "previous":
        n = 0 === s ? this.options.slidesToScroll : this.options.slidesToShow - s, this.slideCount > this.options.slidesToShow && this.slideHandler(this.currentSlide - n, !1, i);
        break;
      case "next":
        n = 0 === s ? this.options.slidesToScroll : s, this.slideCount > this.options.slidesToShow && this.slideHandler(this.currentSlide + n, !1, i);
        break;
      case "index":
        var r = 0 === e.data.index ? 0 : e.data.index || o.index() * this.options.slidesToScroll;
        this.slideHandler(this.checkNavigable(r), !1, i), o.children().trigger("focus");
        break;
      default:
        return
    }
  }, i.prototype.checkNavigable = function (t) {
    var e, i;
    if (i = 0, t > (e = this.getNavigableIndexes())[e.length - 1]) t = e[e.length - 1];
    else
      for (var s in e) {
        if (t < e[s]) {
          t = i;
          break
        }
        i = e[s]
      }
    return t
  }, i.prototype.cleanUpEvents = function () {
    this.options.dots && null !== this.$dots && (t("li", this.$dots).off("click.slick", this.changeSlide).off("mouseenter.slick", t.proxy(this.interrupt, this, !0)).off("mouseleave.slick", t.proxy(this.interrupt, this, !1)), !0 === this.options.accessibility && this.$dots.off("keydown.slick", this.keyHandler)), this.$slider.off("focus.slick blur.slick"), !0 === this.options.arrows && this.slideCount > this.options.slidesToShow && (this.$prevArrow && this.$prevArrow.off("click.slick", this.changeSlide), this.$nextArrow && this.$nextArrow.off("click.slick", this.changeSlide), !0 === this.options.accessibility && (this.$prevArrow && this.$prevArrow.off("keydown.slick", this.keyHandler), this.$nextArrow && this.$nextArrow.off("keydown.slick", this.keyHandler))), this.$list.off("touchstart.slick mousedown.slick", this.swipeHandler), this.$list.off("touchmove.slick mousemove.slick", this.swipeHandler), this.$list.off("touchend.slick mouseup.slick", this.swipeHandler), this.$list.off("touchcancel.slick mouseleave.slick", this.swipeHandler), this.$list.off("click.slick", this.clickHandler), t(document).off(this.visibilityChange, this.visibility), this.cleanUpSlideEvents(), !0 === this.options.accessibility && this.$list.off("keydown.slick", this.keyHandler), !0 === this.options.focusOnSelect && t(this.$slideTrack).children().off("click.slick", this.selectHandler), t(window).off("orientationchange.slick.slick-" + this.instanceUid, this.orientationChange), t(window).off("resize.slick.slick-" + this.instanceUid, this.resize), t("[draggable!=true]", this.$slideTrack).off("dragstart", this.preventDefault), t(window).off("load.slick.slick-" + this.instanceUid, this.setPosition)
  }, i.prototype.cleanUpSlideEvents = function () {
    this.$list.off("mouseenter.slick", t.proxy(this.interrupt, this, !0)), this.$list.off("mouseleave.slick", t.proxy(this.interrupt, this, !1))
  }, i.prototype.cleanUpRows = function () {
    var t;
    this.options.rows > 0 && ((t = this.$slides.children().children()).removeAttr("style"), this.$slider.empty().append(t))
  }, i.prototype.clickHandler = function (t) {
    !1 === this.shouldClick && (t.stopImmediatePropagation(), t.stopPropagation(), t.preventDefault())
  }, i.prototype.destroy = function (e) {
    var i = this;
    i.autoPlayClear(), i.touchObject = {}, i.cleanUpEvents(), t(".slick-cloned", i.$slider).detach(), i.$dots && i.$dots.remove(), i.$prevArrow && i.$prevArrow.length && (i.$prevArrow.removeClass("slick-disabled slick-arrow slick-hidden").removeAttr("aria-hidden aria-disabled tabindex").css("display", ""), i.htmlExpr.test(i.options.prevArrow) && i.$prevArrow.remove()), i.$nextArrow && i.$nextArrow.length && (i.$nextArrow.removeClass("slick-disabled slick-arrow slick-hidden").removeAttr("aria-hidden aria-disabled tabindex").css("display", ""), i.htmlExpr.test(i.options.nextArrow) && i.$nextArrow.remove()), i.$slides && (i.$slides.removeClass("slick-slide slick-active slick-center slick-visible slick-current").removeAttr("aria-hidden").removeAttr("data-slick-index").each(function () {
      t(this).attr("style", t(this).data("originalStyling"))
    }), i.$slideTrack.children(this.options.slide).detach(), i.$slideTrack.detach(), i.$list.detach(), i.$slider.append(i.$slides)), i.cleanUpRows(), i.$slider.removeClass("slick-slider"), i.$slider.removeClass("slick-initialized"), i.$slider.removeClass("slick-dotted"), i.unslicked = !0, e || i.$slider.trigger("destroy", [i])
  }, i.prototype.disableTransition = function (t) {
    var e = this,
      i = {};
    i[e.transitionType] = "", !1 === e.options.fade ? e.$slideTrack.css(i) : e.$slides.eq(t).css(i)
  }, i.prototype.fadeSlide = function (t, e) {
    var i = this;
    !1 === i.cssTransitions ? (i.$slides.eq(t).css({
      zIndex: i.options.zIndex
    }), i.$slides.eq(t).animate({
      opacity: 1
    }, i.options.speed, i.options.easing, e)) : (i.applyTransition(t), i.$slides.eq(t).css({
      opacity: 1,
      zIndex: i.options.zIndex
    }), e && setTimeout(function () {
      i.disableTransition(t), e.call()
    }, i.options.speed))
  }, i.prototype.fadeSlideOut = function (t) {
    !1 === this.cssTransitions ? this.$slides.eq(t).animate({
      opacity: 0,
      zIndex: this.options.zIndex - 2
    }, this.options.speed, this.options.easing) : (this.applyTransition(t), this.$slides.eq(t).css({
      opacity: 0,
      zIndex: this.options.zIndex - 2
    }))
  }, i.prototype.filterSlides = i.prototype.slickFilter = function (t) {
    var e = this;
    null !== t && (e.$slidesCache = e.$slides, e.unload(), e.$slideTrack.children(this.options.slide).detach(), e.$slidesCache.filter(t).appendTo(e.$slideTrack), e.reinit())
  }, i.prototype.focusHandler = function () {
    var e = this;
    e.$slider.off("focus.slick blur.slick").on("focus.slick blur.slick", "*", function (i) {
      i.stopImmediatePropagation();
      var s = t(this);
      setTimeout(function () {
        e.options.pauseOnFocus && (e.focussed = s.is(":focus"), e.autoPlay())
      }, 0)
    })
  }, i.prototype.getCurrent = i.prototype.slickCurrentSlide = function () {
    return this.currentSlide
  }, i.prototype.getDotCount = function () {
    var t = 0,
      e = 0,
      i = 0;
    if (!0 === this.options.infinite) {
      if (this.slideCount <= this.options.slidesToShow) ++i;
      else
        for (; t < this.slideCount;) ++i, t = e + this.options.slidesToScroll, e += this.options.slidesToScroll <= this.options.slidesToShow ? this.options.slidesToScroll : this.options.slidesToShow
    } else if (!0 === this.options.centerMode) i = this.slideCount;
    else if (this.options.asNavFor)
      for (; t < this.slideCount;) ++i, t = e + this.options.slidesToScroll, e += this.options.slidesToScroll <= this.options.slidesToShow ? this.options.slidesToScroll : this.options.slidesToShow;
    else i = 1 + Math.ceil((this.slideCount - this.options.slidesToShow) / this.options.slidesToScroll);
    return i - 1
  }, i.prototype.getLeft = function (t) {
    var e, i, s, n, o = this,
      r = 0;
    return o.slideOffset = 0, i = o.$slides.first().outerHeight(!0), !0 === o.options.infinite ? (o.slideCount > o.options.slidesToShow && (o.slideOffset = -(o.slideWidth * o.options.slidesToShow * 1), n = -1, !0 === o.options.vertical && !0 === o.options.centerMode && (2 === o.options.slidesToShow ? n = -1.5 : 1 === o.options.slidesToShow && (n = -2)), r = i * o.options.slidesToShow * n), o.slideCount % o.options.slidesToScroll != 0 && t + o.options.slidesToScroll > o.slideCount && o.slideCount > o.options.slidesToShow && (t > o.slideCount ? (o.slideOffset = -((o.options.slidesToShow - (t - o.slideCount)) * o.slideWidth * 1), r = -((o.options.slidesToShow - (t - o.slideCount)) * i * 1)) : (o.slideOffset = -(o.slideCount % o.options.slidesToScroll * o.slideWidth * 1), r = -(o.slideCount % o.options.slidesToScroll * i * 1)))) : t + o.options.slidesToShow > o.slideCount && (o.slideOffset = (t + o.options.slidesToShow - o.slideCount) * o.slideWidth, r = (t + o.options.slidesToShow - o.slideCount) * i), o.slideCount <= o.options.slidesToShow && (o.slideOffset = 0, r = 0), !0 === o.options.centerMode && o.slideCount <= o.options.slidesToShow ? o.slideOffset = o.slideWidth * Math.floor(o.options.slidesToShow) / 2 - o.slideWidth * o.slideCount / 2 : !0 === o.options.centerMode && !0 === o.options.infinite ? o.slideOffset += o.slideWidth * Math.floor(o.options.slidesToShow / 2) - o.slideWidth : !0 === o.options.centerMode && (o.slideOffset = 0, o.slideOffset += o.slideWidth * Math.floor(o.options.slidesToShow / 2)), e = !1 === o.options.vertical ? -(t * o.slideWidth * 1) + o.slideOffset : -(t * i * 1) + r, !0 === o.options.variableWidth && (s = o.slideCount <= o.options.slidesToShow || !1 === o.options.infinite ? o.$slideTrack.children(".slick-slide").eq(t) : o.$slideTrack.children(".slick-slide").eq(t + o.options.slidesToShow), e = !0 === o.options.rtl ? s[0] ? -1 * (o.$slideTrack.width() - s[0].offsetLeft - s.width()) : 0 : s[0] ? -1 * s[0].offsetLeft : 0, !0 === o.options.centerMode && (s = o.slideCount <= o.options.slidesToShow || !1 === o.options.infinite ? o.$slideTrack.children(".slick-slide").eq(t) : o.$slideTrack.children(".slick-slide").eq(t + o.options.slidesToShow + 1), e = !0 === o.options.rtl ? s[0] ? -1 * (o.$slideTrack.width() - s[0].offsetLeft - s.width()) : 0 : s[0] ? -1 * s[0].offsetLeft : 0, e += (o.$list.width() - s.outerWidth()) / 2)), e
  }, i.prototype.getOption = i.prototype.slickGetOption = function (t) {
    return this.options[t]
  }, i.prototype.getNavigableIndexes = function () {
    var t, e = 0,
      i = 0,
      s = [];
    for (!1 === this.options.infinite ? t = this.slideCount : (e = -1 * this.options.slidesToScroll, i = -1 * this.options.slidesToScroll, t = 2 * this.slideCount); e < t;) s.push(e), e = i + this.options.slidesToScroll, i += this.options.slidesToScroll <= this.options.slidesToShow ? this.options.slidesToScroll : this.options.slidesToShow;
    return s
  }, i.prototype.getSlick = function () {
    return this
  }, i.prototype.getSlideCount = function () {
    var e, i, s = this;
    return i = !0 === s.options.centerMode ? s.slideWidth * Math.floor(s.options.slidesToShow / 2) : 0, !0 === s.options.swipeToSlide ? (s.$slideTrack.find(".slick-slide").each(function (n, o) {
      if (o.offsetLeft - i + t(o).outerWidth() / 2 > -1 * s.swipeLeft) return e = o, !1
    }), Math.abs(t(e).attr("data-slick-index") - s.currentSlide) || 1) : s.options.slidesToScroll
  }, i.prototype.goTo = i.prototype.slickGoTo = function (t, e) {
    this.changeSlide({
      data: {
        message: "index",
        index: parseInt(t)
      }
    }, e)
  }, i.prototype.init = function (e) {
    var i = this;
    t(i.$slider).hasClass("slick-initialized") || (t(i.$slider).addClass("slick-initialized"), i.buildRows(), i.buildOut(), i.setProps(), i.startLoad(), i.loadSlider(), i.initializeEvents(), i.updateArrows(), i.updateDots(), i.checkResponsive(!0), i.focusHandler()), e && i.$slider.trigger("init", [i]), !0 === i.options.accessibility && i.initADA(), i.options.autoplay && (i.paused = !1, i.autoPlay())
  }, i.prototype.initADA = function () {
    var e = this,
      i = Math.ceil(e.slideCount / e.options.slidesToShow),
      s = e.getNavigableIndexes().filter(function (t) {
        return t >= 0 && t < e.slideCount
      });
    e.$slides.add(e.$slideTrack.find(".slick-cloned")).attr({
      "aria-hidden": "true",
      tabindex: "-1"
    }).find("a, input, button, select").attr({
      tabindex: "-1"
    }), null !== e.$dots && (e.$slides.not(e.$slideTrack.find(".slick-cloned")).each(function (i) {
      var n = s.indexOf(i);
      if (t(this).attr({
          role: "tabpanel",
          id: "slick-slide" + e.instanceUid + i,
          tabindex: -1
        }), -1 !== n) {
        var o = "slick-slide-control" + e.instanceUid + n;
        t("#" + o).length && t(this).attr({
          "aria-describedby": o
        })
      }
    }), e.$dots.attr("role", "tablist").find("li").each(function (n) {
      var o = s[n];
      t(this).attr({
        role: "presentation"
      }), t(this).find("button").first().attr({
        role: "tab",
        id: "slick-slide-control" + e.instanceUid + n,
        "aria-controls": "slick-slide" + e.instanceUid + o,
        "aria-label": n + 1 + " of " + i,
        "aria-selected": null,
        tabindex: "-1"
      })
    }).eq(e.currentSlide).find("button").attr({
      "aria-selected": "true",
      tabindex: "0"
    }).end());
    for (var n = e.currentSlide, o = n + e.options.slidesToShow; n < o; n++) e.options.focusOnChange ? e.$slides.eq(n).attr({
      tabindex: "0"
    }) : e.$slides.eq(n).removeAttr("tabindex");
    e.activateADA()
  }, i.prototype.initArrowEvents = function () {
    !0 === this.options.arrows && this.slideCount > this.options.slidesToShow && (this.$prevArrow.off("click.slick").on("click.slick", {
      message: "previous"
    }, this.changeSlide), this.$nextArrow.off("click.slick").on("click.slick", {
      message: "next"
    }, this.changeSlide), !0 === this.options.accessibility && (this.$prevArrow.on("keydown.slick", this.keyHandler), this.$nextArrow.on("keydown.slick", this.keyHandler)))
  }, i.prototype.initDotEvents = function () {
    !0 === this.options.dots && this.slideCount > this.options.slidesToShow && (t("li", this.$dots).on("click.slick", {
      message: "index"
    }, this.changeSlide), !0 === this.options.accessibility && this.$dots.on("keydown.slick", this.keyHandler)), !0 === this.options.dots && !0 === this.options.pauseOnDotsHover && this.slideCount > this.options.slidesToShow && t("li", this.$dots).on("mouseenter.slick", t.proxy(this.interrupt, this, !0)).on("mouseleave.slick", t.proxy(this.interrupt, this, !1))
  }, i.prototype.initSlideEvents = function () {
    this.options.pauseOnHover && (this.$list.on("mouseenter.slick", t.proxy(this.interrupt, this, !0)), this.$list.on("mouseleave.slick", t.proxy(this.interrupt, this, !1)))
  }, i.prototype.initializeEvents = function () {
    this.initArrowEvents(), this.initDotEvents(), this.initSlideEvents(), this.$list.on("touchstart.slick mousedown.slick", {
      action: "start"
    }, this.swipeHandler), this.$list.on("touchmove.slick mousemove.slick", {
      action: "move"
    }, this.swipeHandler), this.$list.on("touchend.slick mouseup.slick", {
      action: "end"
    }, this.swipeHandler), this.$list.on("touchcancel.slick mouseleave.slick", {
      action: "end"
    }, this.swipeHandler), this.$list.on("click.slick", this.clickHandler), t(document).on(this.visibilityChange, t.proxy(this.visibility, this)), !0 === this.options.accessibility && this.$list.on("keydown.slick", this.keyHandler), !0 === this.options.focusOnSelect && t(this.$slideTrack).children().on("click.slick", this.selectHandler), t(window).on("orientationchange.slick.slick-" + this.instanceUid, t.proxy(this.orientationChange, this)), t(window).on("resize.slick.slick-" + this.instanceUid, t.proxy(this.resize, this)), t("[draggable!=true]", this.$slideTrack).on("dragstart", this.preventDefault), t(window).on("load.slick.slick-" + this.instanceUid, this.setPosition), t(this.setPosition)
  }, i.prototype.initUI = function () {
    !0 === this.options.arrows && this.slideCount > this.options.slidesToShow && (this.$prevArrow.show(), this.$nextArrow.show()), !0 === this.options.dots && this.slideCount > this.options.slidesToShow && this.$dots.show()
  }, i.prototype.keyHandler = function (t) {
    t.target.tagName.match("TEXTAREA|INPUT|SELECT") || (37 === t.keyCode && !0 === this.options.accessibility ? this.changeSlide({
      data: {
        message: !0 === this.options.rtl ? "next" : "previous"
      }
    }) : 39 === t.keyCode && !0 === this.options.accessibility && this.changeSlide({
      data: {
        message: !0 === this.options.rtl ? "previous" : "next"
      }
    }))
  }, i.prototype.lazyLoad = function () {
    var e, i, s, n = this;

    function o(e) {
      t("img[data-lazy]", e).each(function () {
        var e = t(this),
          i = t(this).attr("data-lazy"),
          s = t(this).attr("data-srcset"),
          o = t(this).attr("data-sizes") || n.$slider.attr("data-sizes"),
          r = document.createElement("img");
        r.onload = function () {
          e.animate({
            opacity: 0
          }, 100, function () {
            s && (e.attr("srcset", s), o && e.attr("sizes", o)), e.attr("src", i).animate({
              opacity: 1
            }, 200, function () {
              e.removeAttr("data-lazy data-srcset data-sizes").removeClass("slick-loading")
            }), n.$slider.trigger("lazyLoaded", [n, e, i])
          })
        }, r.onerror = function () {
          e.removeAttr("data-lazy").removeClass("slick-loading").addClass("slick-lazyload-error"), n.$slider.trigger("lazyLoadError", [n, e, i])
        }, r.src = i
      })
    }
    if (!0 === n.options.centerMode ? !0 === n.options.infinite ? s = (i = n.currentSlide + (n.options.slidesToShow / 2 + 1)) + n.options.slidesToShow + 2 : (i = Math.max(0, n.currentSlide - (n.options.slidesToShow / 2 + 1)), s = n.options.slidesToShow / 2 + 1 + 2 + n.currentSlide) : (s = Math.ceil((i = n.options.infinite ? n.options.slidesToShow + n.currentSlide : n.currentSlide) + n.options.slidesToShow), !0 === n.options.fade && (i > 0 && i--, s <= n.slideCount && s++)), e = n.$slider.find(".slick-slide").slice(i, s), "anticipated" === n.options.lazyLoad)
      for (var r = i - 1, a = s, l = n.$slider.find(".slick-slide"), c = 0; c < n.options.slidesToScroll; c++) r < 0 && (r = n.slideCount - 1), e = (e = e.add(l.eq(r))).add(l.eq(a)), r--, a++;
    o(e), n.slideCount <= n.options.slidesToShow ? o(n.$slider.find(".slick-slide")) : n.currentSlide >= n.slideCount - n.options.slidesToShow ? o(n.$slider.find(".slick-cloned").slice(0, n.options.slidesToShow)) : 0 === n.currentSlide && o(n.$slider.find(".slick-cloned").slice(-1 * n.options.slidesToShow))
  }, i.prototype.loadSlider = function () {
    this.setPosition(), this.$slideTrack.css({
      opacity: 1
    }), this.$slider.removeClass("slick-loading"), this.initUI(), "progressive" === this.options.lazyLoad && this.progressiveLazyLoad()
  }, i.prototype.next = i.prototype.slickNext = function () {
    this.changeSlide({
      data: {
        message: "next"
      }
    })
  }, i.prototype.orientationChange = function () {
    this.checkResponsive(), this.setPosition()
  }, i.prototype.pause = i.prototype.slickPause = function () {
    this.autoPlayClear(), this.paused = !0
  }, i.prototype.play = i.prototype.slickPlay = function () {
    var t = this;
    t.autoPlay(), t.options.autoplay = !0, t.paused = !1, t.focussed = !1, t.interrupted = !1
  }, i.prototype.postSlide = function (e) {
    var i = this;
    i.unslicked || (i.$slider.trigger("afterChange", [i, e]), i.animating = !1, i.slideCount > i.options.slidesToShow && i.setPosition(), i.swipeLeft = null, i.options.autoplay && i.autoPlay(), !0 === i.options.accessibility && (i.initADA(), i.options.focusOnChange && t(i.$slides.get(i.currentSlide)).attr("tabindex", 0).focus()))
  }, i.prototype.prev = i.prototype.slickPrev = function () {
    this.changeSlide({
      data: {
        message: "previous"
      }
    })
  }, i.prototype.preventDefault = function (t) {
    t.preventDefault()
  }, i.prototype.progressiveLazyLoad = function (e) {
    e = e || 1;
    var i, s, n, o, r, a = this,
      l = t("img[data-lazy]", a.$slider);
    l.length ? (s = (i = l.first()).attr("data-lazy"), n = i.attr("data-srcset"), o = i.attr("data-sizes") || a.$slider.attr("data-sizes"), (r = document.createElement("img")).onload = function () {
      n && (i.attr("srcset", n), o && i.attr("sizes", o)), i.attr("src", s).removeAttr("data-lazy data-srcset data-sizes").removeClass("slick-loading"), !0 === a.options.adaptiveHeight && a.setPosition(), a.$slider.trigger("lazyLoaded", [a, i, s]), a.progressiveLazyLoad()
    }, r.onerror = function () {
      e < 3 ? setTimeout(function () {
        a.progressiveLazyLoad(e + 1)
      }, 500) : (i.removeAttr("data-lazy").removeClass("slick-loading").addClass("slick-lazyload-error"), a.$slider.trigger("lazyLoadError", [a, i, s]), a.progressiveLazyLoad())
    }, r.src = s) : a.$slider.trigger("allImagesLoaded", [a])
  }, i.prototype.refresh = function (e) {
    var i, s, n = this;
    s = n.slideCount - n.options.slidesToShow, !n.options.infinite && n.currentSlide > s && (n.currentSlide = s), n.slideCount <= n.options.slidesToShow && (n.currentSlide = 0), i = n.currentSlide, n.destroy(!0), t.extend(n, n.initials, {
      currentSlide: i
    }), n.init(), e || n.changeSlide({
      data: {
        message: "index",
        index: i
      }
    }, !1)
  }, i.prototype.registerBreakpoints = function () {
    var e, i, s, n = this,
      o = n.options.responsive || null;
    if ("array" === t.type(o) && o.length) {
      for (e in n.respondTo = n.options.respondTo || "window", o)
        if (s = n.breakpoints.length - 1, o.hasOwnProperty(e)) {
          for (i = o[e].breakpoint; s >= 0;) n.breakpoints[s] && n.breakpoints[s] === i && n.breakpoints.splice(s, 1), s--;
          n.breakpoints.push(i), n.breakpointSettings[i] = o[e].settings
        } n.breakpoints.sort(function (t, e) {
        return n.options.mobileFirst ? t - e : e - t
      })
    }
  }, i.prototype.reinit = function () {
    var e = this;
    e.$slides = e.$slideTrack.children(e.options.slide).addClass("slick-slide"), e.slideCount = e.$slides.length, e.currentSlide >= e.slideCount && 0 !== e.currentSlide && (e.currentSlide = e.currentSlide - e.options.slidesToScroll), e.slideCount <= e.options.slidesToShow && (e.currentSlide = 0), e.registerBreakpoints(), e.setProps(), e.setupInfinite(), e.buildArrows(), e.updateArrows(), e.initArrowEvents(), e.buildDots(), e.updateDots(), e.initDotEvents(), e.cleanUpSlideEvents(), e.initSlideEvents(), e.checkResponsive(!1, !0), !0 === e.options.focusOnSelect && t(e.$slideTrack).children().on("click.slick", e.selectHandler), e.setSlideClasses("number" == typeof e.currentSlide ? e.currentSlide : 0), e.setPosition(), e.focusHandler(), e.paused = !e.options.autoplay, e.autoPlay(), e.$slider.trigger("reInit", [e])
  }, i.prototype.resize = function () {
    var e = this;
    t(window).width() !== e.windowWidth && (clearTimeout(e.windowDelay), e.windowDelay = window.setTimeout(function () {
      e.windowWidth = t(window).width(), e.checkResponsive(), e.unslicked || e.setPosition()
    }, 50))
  }, i.prototype.removeSlide = i.prototype.slickRemove = function (t, e, i) {
    var s = this;
    if (t = "boolean" == typeof t ? !0 === (e = t) ? 0 : s.slideCount - 1 : !0 === e ? --t : t, s.slideCount < 1 || t < 0 || t > s.slideCount - 1) return !1;
    s.unload(), !0 === i ? s.$slideTrack.children().remove() : s.$slideTrack.children(this.options.slide).eq(t).remove(), s.$slides = s.$slideTrack.children(this.options.slide), s.$slideTrack.children(this.options.slide).detach(), s.$slideTrack.append(s.$slides), s.$slidesCache = s.$slides, s.reinit()
  }, i.prototype.setCSS = function (t) {
    var e, i, s = this,
      n = {};
    !0 === s.options.rtl && (t = -t), e = "left" == s.positionProp ? Math.ceil(t) + "px" : "0px", i = "top" == s.positionProp ? Math.ceil(t) + "px" : "0px", n[s.positionProp] = t, !1 === s.transformsEnabled ? s.$slideTrack.css(n) : (n = {}, !1 === s.cssTransitions ? (n[s.animType] = "translate(" + e + ", " + i + ")", s.$slideTrack.css(n)) : (n[s.animType] = "translate3d(" + e + ", " + i + ", 0px)", s.$slideTrack.css(n)))
  }, i.prototype.setDimensions = function () {
    var t = this;
    !1 === t.options.vertical ? !0 === t.options.centerMode && t.$list.css({
      padding: "0px " + t.options.centerPadding
    }) : (t.$list.height(t.$slides.first().outerHeight(!0) * t.options.slidesToShow), !0 === t.options.centerMode && t.$list.css({
      padding: t.options.centerPadding + " 0px"
    })), t.listWidth = t.$list.width(), t.listHeight = t.$list.height(), !1 === t.options.vertical && !1 === t.options.variableWidth ? (t.slideWidth = Math.ceil(t.listWidth / t.options.slidesToShow), t.$slideTrack.width(Math.ceil(t.slideWidth * t.$slideTrack.children(".slick-slide").length))) : !0 === t.options.variableWidth ? t.$slideTrack.width(5e3 * t.slideCount) : (t.slideWidth = Math.ceil(t.listWidth), t.$slideTrack.height(Math.ceil(t.$slides.first().outerHeight(!0) * t.$slideTrack.children(".slick-slide").length)));
    var e = t.$slides.first().outerWidth(!0) - t.$slides.first().width();
    !1 === t.options.variableWidth && t.$slideTrack.children(".slick-slide").width(t.slideWidth - e)
  }, i.prototype.setFade = function () {
    var e, i = this;
    i.$slides.each(function (s, n) {
      e = -(i.slideWidth * s * 1), !0 === i.options.rtl ? t(n).css({
        position: "relative",
        right: e,
        top: 0,
        zIndex: i.options.zIndex - 2,
        opacity: 0
      }) : t(n).css({
        position: "relative",
        left: e,
        top: 0,
        zIndex: i.options.zIndex - 2,
        opacity: 0
      })
    }), i.$slides.eq(i.currentSlide).css({
      zIndex: i.options.zIndex - 1,
      opacity: 1
    })
  }, i.prototype.setHeight = function () {
    if (1 === this.options.slidesToShow && !0 === this.options.adaptiveHeight && !1 === this.options.vertical) {
      var t = this.$slides.eq(this.currentSlide).outerHeight(!0);
      this.$list.css("height", t)
    }
  }, i.prototype.setOption = i.prototype.slickSetOption = function () {
    var e, i, s, n, o, r = this,
      a = !1;
    if ("object" === t.type(arguments[0]) ? (s = arguments[0], a = arguments[1], o = "multiple") : "string" === t.type(arguments[0]) && (s = arguments[0], n = arguments[1], a = arguments[2], "responsive" === arguments[0] && "array" === t.type(arguments[1]) ? o = "responsive" : void 0 !== arguments[1] && (o = "single")), "single" === o) r.options[s] = n;
    else if ("multiple" === o) t.each(s, function (t, e) {
      r.options[t] = e
    });
    else if ("responsive" === o)
      for (i in n)
        if ("array" !== t.type(r.options.responsive)) r.options.responsive = [n[i]];
        else {
          for (e = r.options.responsive.length - 1; e >= 0;) r.options.responsive[e].breakpoint === n[i].breakpoint && r.options.responsive.splice(e, 1), e--;
          r.options.responsive.push(n[i])
        } a && (r.unload(), r.reinit())
  }, i.prototype.setPosition = function () {
    this.setDimensions(), this.setHeight(), !1 === this.options.fade ? this.setCSS(this.getLeft(this.currentSlide)) : this.setFade(), this.$slider.trigger("setPosition", [this])
  }, i.prototype.setProps = function () {
    var t = this,
      e = document.body.style;
    t.positionProp = !0 === t.options.vertical ? "top" : "left", "top" === t.positionProp ? t.$slider.addClass("slick-vertical") : t.$slider.removeClass("slick-vertical"), void 0 === e.WebkitTransition && void 0 === e.MozTransition && void 0 === e.msTransition || !0 === t.options.useCSS && (t.cssTransitions = !0), t.options.fade && ("number" == typeof t.options.zIndex ? t.options.zIndex < 3 && (t.options.zIndex = 3) : t.options.zIndex = t.defaults.zIndex), void 0 !== e.OTransform && (t.animType = "OTransform", t.transformType = "-o-transform", t.transitionType = "OTransition", void 0 === e.perspectiveProperty && void 0 === e.webkitPerspective && (t.animType = !1)), void 0 !== e.MozTransform && (t.animType = "MozTransform", t.transformType = "-moz-transform", t.transitionType = "MozTransition", void 0 === e.perspectiveProperty && void 0 === e.MozPerspective && (t.animType = !1)), void 0 !== e.webkitTransform && (t.animType = "webkitTransform", t.transformType = "-webkit-transform", t.transitionType = "webkitTransition", void 0 === e.perspectiveProperty && void 0 === e.webkitPerspective && (t.animType = !1)), void 0 !== e.msTransform && (t.animType = "msTransform", t.transformType = "-ms-transform", t.transitionType = "msTransition", void 0 === e.msTransform && (t.animType = !1)), void 0 !== e.transform && !1 !== t.animType && (t.animType = "transform", t.transformType = "transform", t.transitionType = "transition"), t.transformsEnabled = t.options.useTransform && null !== t.animType && !1 !== t.animType
  }, i.prototype.setSlideClasses = function (t) {
    var e, i, s, n;
    if (i = this.$slider.find(".slick-slide").removeClass("slick-active slick-center slick-current").attr("aria-hidden", "true"), this.$slides.eq(t).addClass("slick-current"), !0 === this.options.centerMode) {
      var o = this.options.slidesToShow % 2 == 0 ? 1 : 0;
      e = Math.floor(this.options.slidesToShow / 2), !0 === this.options.infinite && (t >= e && t <= this.slideCount - 1 - e ? this.$slides.slice(t - e + o, t + e + 1).addClass("slick-active").attr("aria-hidden", "false") : (s = this.options.slidesToShow + t, i.slice(s - e + 1 + o, s + e + 2).addClass("slick-active").attr("aria-hidden", "false")), 0 === t ? i.eq(i.length - 1 - this.options.slidesToShow).addClass("slick-center") : t === this.slideCount - 1 && i.eq(this.options.slidesToShow).addClass("slick-center")), this.$slides.eq(t).addClass("slick-center")
    } else t >= 0 && t <= this.slideCount - this.options.slidesToShow ? this.$slides.slice(t, t + this.options.slidesToShow).addClass("slick-active").attr("aria-hidden", "false") : i.length <= this.options.slidesToShow ? i.addClass("slick-active").attr("aria-hidden", "false") : (n = this.slideCount % this.options.slidesToShow, s = !0 === this.options.infinite ? this.options.slidesToShow + t : t, this.options.slidesToShow == this.options.slidesToScroll && this.slideCount - t < this.options.slidesToShow ? i.slice(s - (this.options.slidesToShow - n), s + n).addClass("slick-active").attr("aria-hidden", "false") : i.slice(s, s + this.options.slidesToShow).addClass("slick-active").attr("aria-hidden", "false"));
    "ondemand" !== this.options.lazyLoad && "anticipated" !== this.options.lazyLoad || this.lazyLoad()
  }, i.prototype.setupInfinite = function () {
    var e, i, s, n = this;
    if (!0 === n.options.fade && (n.options.centerMode = !1), !0 === n.options.infinite && !1 === n.options.fade && (i = null, n.slideCount > n.options.slidesToShow)) {
      for (s = !0 === n.options.centerMode ? n.options.slidesToShow + 1 : n.options.slidesToShow, e = n.slideCount; e > n.slideCount - s; e -= 1) i = e - 1, t(n.$slides[i]).clone(!0).attr("id", "").attr("data-slick-index", i - n.slideCount).prependTo(n.$slideTrack).addClass("slick-cloned");
      for (e = 0; e < s + n.slideCount; e += 1) i = e, t(n.$slides[i]).clone(!0).attr("id", "").attr("data-slick-index", i + n.slideCount).appendTo(n.$slideTrack).addClass("slick-cloned");
      n.$slideTrack.find(".slick-cloned").find("[id]").each(function () {
        t(this).attr("id", "")
      })
    }
  }, i.prototype.interrupt = function (t) {
    t || this.autoPlay(), this.interrupted = t
  }, i.prototype.selectHandler = function (e) {
    var i = t(e.target).is(".slick-slide") ? t(e.target) : t(e.target).parents(".slick-slide"),
      s = parseInt(i.attr("data-slick-index"));
    s || (s = 0), this.slideCount <= this.options.slidesToShow ? this.slideHandler(s, !1, !0) : this.slideHandler(s)
  }, i.prototype.slideHandler = function (t, e, i) {
    var s, n, o, r, a, l, c = this;
    if (e = e || !1, !(!0 === c.animating && !0 === c.options.waitForAnimate || !0 === c.options.fade && c.currentSlide === t)) {
      if (!1 === e && c.asNavFor(t), s = t, a = c.getLeft(s), r = c.getLeft(c.currentSlide), c.currentLeft = null === c.swipeLeft ? r : c.swipeLeft, !1 === c.options.infinite && !1 === c.options.centerMode && (t < 0 || t > c.getDotCount() * c.options.slidesToScroll)) !1 === c.options.fade && (s = c.currentSlide, !0 !== i && c.slideCount > c.options.slidesToShow ? c.animateSlide(r, function () {
        c.postSlide(s)
      }) : c.postSlide(s));
      else if (!1 === c.options.infinite && !0 === c.options.centerMode && (t < 0 || t > c.slideCount - c.options.slidesToScroll)) !1 === c.options.fade && (s = c.currentSlide, !0 !== i && c.slideCount > c.options.slidesToShow ? c.animateSlide(r, function () {
        c.postSlide(s)
      }) : c.postSlide(s));
      else {
        if (c.options.autoplay && clearInterval(c.autoPlayTimer), n = s < 0 ? c.slideCount % c.options.slidesToScroll != 0 ? c.slideCount - c.slideCount % c.options.slidesToScroll : c.slideCount + s : s >= c.slideCount ? c.slideCount % c.options.slidesToScroll != 0 ? 0 : s - c.slideCount : s, c.animating = !0, c.$slider.trigger("beforeChange", [c, c.currentSlide, n]), o = c.currentSlide, c.currentSlide = n, c.setSlideClasses(c.currentSlide), c.options.asNavFor && (l = (l = c.getNavTarget()).slick("getSlick")).slideCount <= l.options.slidesToShow && l.setSlideClasses(c.currentSlide), c.updateDots(), c.updateArrows(), !0 === c.options.fade) return !0 !== i ? (c.fadeSlideOut(o), c.fadeSlide(n, function () {
          c.postSlide(n)
        })) : c.postSlide(n), void c.animateHeight();
        !0 !== i && c.slideCount > c.options.slidesToShow ? c.animateSlide(a, function () {
          c.postSlide(n)
        }) : c.postSlide(n)
      }
    }
  }, i.prototype.startLoad = function () {
    !0 === this.options.arrows && this.slideCount > this.options.slidesToShow && (this.$prevArrow.hide(), this.$nextArrow.hide()), !0 === this.options.dots && this.slideCount > this.options.slidesToShow && this.$dots.hide(), this.$slider.addClass("slick-loading")
  }, i.prototype.swipeDirection = function () {
    var t, e, i, s;
    return t = this.touchObject.startX - this.touchObject.curX, (s = Math.round(180 * (i = Math.atan2(e = this.touchObject.startY - this.touchObject.curY, t)) / Math.PI)) < 0 && (s = 360 - Math.abs(s)), s <= 45 && s >= 0 ? !1 === this.options.rtl ? "left" : "right" : s <= 360 && s >= 315 ? !1 === this.options.rtl ? "left" : "right" : s >= 135 && s <= 225 ? !1 === this.options.rtl ? "right" : "left" : !0 === this.options.verticalSwiping ? s >= 35 && s <= 135 ? "down" : "up" : "vertical"
  }, i.prototype.swipeEnd = function (t) {
    var e, i, s = this;
    if (s.dragging = !1, s.swiping = !1, s.scrolling) return s.scrolling = !1, !1;
    if (s.interrupted = !1, s.shouldClick = !(s.touchObject.swipeLength > 10), void 0 === s.touchObject.curX) return !1;
    if (!0 === s.touchObject.edgeHit && s.$slider.trigger("edge", [s, s.swipeDirection()]), s.touchObject.swipeLength >= s.touchObject.minSwipe) {
      switch (i = s.swipeDirection()) {
        case "left":
        case "down":
          e = s.options.swipeToSlide ? s.checkNavigable(s.currentSlide + s.getSlideCount()) : s.currentSlide + s.getSlideCount(), s.currentDirection = 0;
          break;
        case "right":
        case "up":
          e = s.options.swipeToSlide ? s.checkNavigable(s.currentSlide - s.getSlideCount()) : s.currentSlide - s.getSlideCount(), s.currentDirection = 1
      }
      "vertical" != i && (s.slideHandler(e), s.touchObject = {}, s.$slider.trigger("swipe", [s, i]))
    } else s.touchObject.startX !== s.touchObject.curX && (s.slideHandler(s.currentSlide), s.touchObject = {})
  }, i.prototype.swipeHandler = function (t) {
    var e = this;
    if (!(!1 === e.options.swipe || "ontouchend" in document && !1 === e.options.swipe || !1 === e.options.draggable && -1 !== t.type.indexOf("mouse"))) switch (e.touchObject.fingerCount = t.originalEvent && void 0 !== t.originalEvent.touches ? t.originalEvent.touches.length : 1, e.touchObject.minSwipe = e.listWidth / e.options.touchThreshold, !0 === e.options.verticalSwiping && (e.touchObject.minSwipe = e.listHeight / e.options.touchThreshold), t.data.action) {
      case "start":
        e.swipeStart(t);
        break;
      case "move":
        e.swipeMove(t);
        break;
      case "end":
        e.swipeEnd(t)
    }
  }, i.prototype.swipeMove = function (t) {
    var e, i, s, n, o, r, a = this;
    return o = void 0 !== t.originalEvent ? t.originalEvent.touches : null, !(!a.dragging || a.scrolling || o && 1 !== o.length) && (e = a.getLeft(a.currentSlide), a.touchObject.curX = void 0 !== o ? o[0].pageX : t.clientX, a.touchObject.curY = void 0 !== o ? o[0].pageY : t.clientY, a.touchObject.swipeLength = Math.round(Math.sqrt(Math.pow(a.touchObject.curX - a.touchObject.startX, 2))), r = Math.round(Math.sqrt(Math.pow(a.touchObject.curY - a.touchObject.startY, 2))), a.options.verticalSwiping || a.swiping || !(r > 4) ? (!0 === a.options.verticalSwiping && (a.touchObject.swipeLength = r), i = a.swipeDirection(), void 0 !== t.originalEvent && a.touchObject.swipeLength > 4 && (a.swiping = !0, t.preventDefault()), n = (!1 === a.options.rtl ? 1 : -1) * (a.touchObject.curX > a.touchObject.startX ? 1 : -1), !0 === a.options.verticalSwiping && (n = a.touchObject.curY > a.touchObject.startY ? 1 : -1), s = a.touchObject.swipeLength, a.touchObject.edgeHit = !1, !1 === a.options.infinite && (0 === a.currentSlide && "right" === i || a.currentSlide >= a.getDotCount() && "left" === i) && (s = a.touchObject.swipeLength * a.options.edgeFriction, a.touchObject.edgeHit = !0), !1 === a.options.vertical ? a.swipeLeft = e + s * n : a.swipeLeft = e + s * (a.$list.height() / a.listWidth) * n, !0 === a.options.verticalSwiping && (a.swipeLeft = e + s * n), !0 !== a.options.fade && !1 !== a.options.touchMove && (!0 === a.animating ? (a.swipeLeft = null, !1) : void a.setCSS(a.swipeLeft))) : (a.scrolling = !0, !1))
  }, i.prototype.swipeStart = function (t) {
    var e, i = this;
    if (i.interrupted = !0, 1 !== i.touchObject.fingerCount || i.slideCount <= i.options.slidesToShow) return i.touchObject = {}, !1;
    void 0 !== t.originalEvent && void 0 !== t.originalEvent.touches && (e = t.originalEvent.touches[0]), i.touchObject.startX = i.touchObject.curX = void 0 !== e ? e.pageX : t.clientX, i.touchObject.startY = i.touchObject.curY = void 0 !== e ? e.pageY : t.clientY, i.dragging = !0
  }, i.prototype.unfilterSlides = i.prototype.slickUnfilter = function () {
    null !== this.$slidesCache && (this.unload(), this.$slideTrack.children(this.options.slide).detach(), this.$slidesCache.appendTo(this.$slideTrack), this.reinit())
  }, i.prototype.unload = function () {
    t(".slick-cloned", this.$slider).remove(), this.$dots && this.$dots.remove(), this.$prevArrow && this.htmlExpr.test(this.options.prevArrow) && this.$prevArrow.remove(), this.$nextArrow && this.htmlExpr.test(this.options.nextArrow) && this.$nextArrow.remove(), this.$slides.removeClass("slick-slide slick-active slick-visible slick-current").attr("aria-hidden", "true").css("width", "")
  }, i.prototype.unslick = function (t) {
    this.$slider.trigger("unslick", [this, t]), this.destroy()
  }, i.prototype.updateArrows = function () {
    this.options.slidesToShow, !0 === this.options.arrows && this.slideCount > this.options.slidesToShow && !this.options.infinite && (this.$prevArrow.removeClass("slick-disabled").attr("aria-disabled", "false"), this.$nextArrow.removeClass("slick-disabled").attr("aria-disabled", "false"), 0 === this.currentSlide ? (this.$prevArrow.addClass("slick-disabled").attr("aria-disabled", "true"), this.$nextArrow.removeClass("slick-disabled").attr("aria-disabled", "false")) : this.currentSlide >= this.slideCount - this.options.slidesToShow && !1 === this.options.centerMode ? (this.$nextArrow.addClass("slick-disabled").attr("aria-disabled", "true"), this.$prevArrow.removeClass("slick-disabled").attr("aria-disabled", "false")) : this.currentSlide >= this.slideCount - 1 && !0 === this.options.centerMode && (this.$nextArrow.addClass("slick-disabled").attr("aria-disabled", "true"), this.$prevArrow.removeClass("slick-disabled").attr("aria-disabled", "false")))
  }, i.prototype.updateDots = function () {
    null !== this.$dots && (this.$dots.find("li").removeClass("slick-active").end(), this.$dots.find("li").eq(Math.floor(this.currentSlide / this.options.slidesToScroll)).addClass("slick-active"))
  }, i.prototype.visibility = function () {
    var t = this;
    t.options.autoplay && (document[t.hidden] ? t.interrupted = !0 : t.interrupted = !1)
  }, t.fn.slick = function () {
    var t, e, s = this,
      n = arguments[0],
      o = Array.prototype.slice.call(arguments, 1),
      r = s.length;
    for (t = 0; t < r; t++)
      if ("object" == typeof n || void 0 === n ? s[t].slick = new i(s[t], n) : e = s[t].slick[n].apply(s[t].slick, o), void 0 !== e) return e;
    return s
  }
});




// lazyload
function _extends() {
  return (_extends = Object.assign || function (t) {
    for (var e = 1; e < arguments.length; e++) {
      var n = arguments[e];
      for (var a in n) Object.prototype.hasOwnProperty.call(n, a) && (t[a] = n[a])
    }
    return t
  }).apply(this, arguments)
}

function _typeof(t) {
  return (_typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (t) {
    return typeof t
  } : function (t) {
    return t && "function" == typeof Symbol && t.constructor === Symbol && t !== Symbol.prototype ? "symbol" : typeof t
  })(t)
}! function (t, e) {
  "object" === ("undefined" == typeof exports ? "undefined" : _typeof(exports)) && "undefined" != typeof module ? module.exports = e() : "function" == typeof define && define.amd ? define(e) : t.LazyLoad = e()
}(this, function () {
  "use strict";
  var t = "undefined" != typeof window,
    e = t && !("onscroll" in window) || "undefined" != typeof navigator && /(gle|ing|ro)bot|crawl|spider/i.test(navigator.userAgent),
    n = t && "IntersectionObserver" in window,
    a = t && "classList" in document.createElement("p"),
    r = {
      elements_selector: "img",
      container: e || t ? document : null,
      threshold: 300,
      thresholds: null,
      data_src: "src",
      data_srcset: "srcset",
      data_sizes: "sizes",
      data_bg: "bg",
      class_loading: "loading",
      class_loaded: "loaded",
      class_error: "error",
      load_delay: 0,
      auto_unobserve: !0,
      callback_enter: null,
      callback_exit: null,
      callback_reveal: null,
      callback_loaded: null,
      callback_error: null,
      callback_finish: null,
      use_native: !1
    },
    o = function (t, e) {
      var n, a = new t(e);
      try {
        n = new CustomEvent("LazyLoad::Initialized", {
          detail: {
            instance: a
          }
        })
      } catch (r) {
        (n = document.createEvent("CustomEvent")).initCustomEvent("LazyLoad::Initialized", !1, !1, {
          instance: a
        })
      }
      window.dispatchEvent(n)
    },
    s = function (t, e) {
      return t.getAttribute("data-" + e)
    },
    i = function (t, e, n) {
      var a = "data-" + e;
      null !== n ? t.setAttribute(a, n) : t.removeAttribute(a)
    },
    l = function (t) {
      return "true" === s(t, "was-processed")
    },
    c = function (t, e) {
      return i(t, "ll-timeout", e)
    },
    u = function (t) {
      return s(t, "ll-timeout")
    },
    d = function (t, e) {
      t && t(e)
    },
    f = function (t, e) {
      t._loadingCount += e, 0 === t._elements.length && 0 === t._loadingCount && d(t._settings.callback_finish)
    },
    v = function (t) {
      for (var e, n = [], a = 0; e = t.children[a]; a += 1) "SOURCE" === e.tagName && n.push(e);
      return n
    },
    h = function (t, e, n) {
      n && t.setAttribute(e, n)
    },
    g = function (t, e) {
      h(t, "sizes", s(t, e.data_sizes)), h(t, "srcset", s(t, e.data_srcset)), h(t, "src", s(t, e.data_src))
    },
    p = {
      IMG: function (t, e) {
        var n = t.parentNode;
        n && "PICTURE" === n.tagName && v(n).forEach(function (t) {
          g(t, e)
        }), g(t, e)
      },
      IFRAME: function (t, e) {
        h(t, "src", s(t, e.data_src))
      },
      VIDEO: function (t, e) {
        v(t).forEach(function (t) {
          h(t, "src", s(t, e.data_src))
        }), h(t, "src", s(t, e.data_src)), t.load()
      }
    },
    b = function (t, e) {
      var n, a, r, o, i, l, c = e._settings,
        u = p[t.tagName];
      if (u) return u(t, c), f(e, 1), void(e._elements = (i = e._elements, l = t, i.filter(function (t) {
        return t !== l
      })));
      n = t, r = s(n, (a = c).data_src), o = s(n, a.data_bg), r && (n.style.backgroundImage = 'url("'.concat(r, '")')), o && (n.style.backgroundImage = o)
    },
    y = function (t, e) {
      a ? t.classList.add(e) : t.className += (t.className ? " " : "") + e
    },
    m = function (t, e, n) {
      t.addEventListener(e, n)
    },
    E = function (t, e, n) {
      t.removeEventListener(e, n)
    },
    k = function (t, e, n) {
      E(t, "load", e), E(t, "loadeddata", e), E(t, "error", n)
    },
    I = function (t, e, n) {
      var r, o, s = n._settings,
        i = e ? s.class_loaded : s.class_error,
        l = e ? s.callback_loaded : s.callback_error,
        c = t.target;
      r = c, o = s.class_loading, a ? r.classList.remove(o) : r.className = r.className.replace(RegExp("(^|\\s+)" + o + "(\\s+|$)"), " ").replace(/^\s+/, "").replace(/\s+$/, ""), y(c, i), d(l, c), f(n, -1)
    },
    A = function (t, e) {
      var n, a, r, o = function n(a) {
          I(a, !0, e), k(t, n, s)
        },
        s = function n(a) {
          I(a, !1, e), k(t, o, n)
        };
      n = t, a = o, r = s, m(n, "load", a), m(n, "loadeddata", a), m(n, "error", r)
    },
    L = ["IMG", "IFRAME", "VIDEO"],
    $ = function (t, e) {
      var n = e._observer;
      N(t, e), n && e._settings.auto_unobserve && n.unobserve(t)
    },
    z = function (t) {
      var e = u(t);
      e && (clearTimeout(e), c(t, null))
    },
    _ = function (t, e) {
      var n = e._settings.load_delay,
        a = u(t);
      a || (a = setTimeout(function () {
        $(t, e), z(t)
      }, n), c(t, a))
    },
    N = function (t, e, n) {
      var a, r = e._settings;
      !n && l(t) || (L.indexOf(t.tagName) > -1 && (A(t, e), y(t, r.class_loading)), b(t, e), i(t, "was-processed", "true"), d(r.callback_reveal, t), d(r.callback_set, t))
    },
    x = function (t) {
      var e;
      return !!n && (t._observer = new IntersectionObserver(function (e) {
        e.forEach(function (e) {
          var n, a, r, o, s, i, l;
          return (n = e).isIntersecting || n.intersectionRatio > 0 ? (a = e.target, void(d((o = (r = t)._settings).callback_enter, a), o.load_delay ? _(a, r) : $(a, r))) : (s = e.target, void(d((l = (i = t)._settings).callback_exit, s), l.load_delay && z(s)))
        })
      }, {
        root: (e = t._settings).container === document ? null : e.container,
        rootMargin: e.thresholds || e.threshold + "px"
      }), !0)
    },
    O = ["IMG", "IFRAME"],
    w = function (t, e) {
      var n, a, r;
      return (r = (n = t || (a = e).container.querySelectorAll(a.elements_selector), Array.prototype.slice.call(n))).filter(function (t) {
        return !l(t)
      })
    },
    C = function (t, e) {
      var n;
      this._settings = _extends({}, r, n = t), this._loadingCount = 0, x(this), this.update(e)
    };
  return C.prototype = {
    update: function (t) {
      var n, a, r = this,
        o = this._settings;
      (this._elements = w(t, o), !e && this._observer) ? ((a = o).use_native && "loading" in HTMLImageElement.prototype && ((n = this)._elements.forEach(function (t) {
        -1 !== O.indexOf(t.tagName) && (t.setAttribute("loading", "lazy"), N(t, n))
      }), this._elements = w(t, o)), this._elements.forEach(function (t) {
        r._observer.observe(t)
      })) : this.loadAll()
    },
    destroy: function () {
      var t = this;
      this._observer && (this._elements.forEach(function (e) {
        t._observer.unobserve(e)
      }), this._observer = null), this._elements = null, this._settings = null
    },
    load: function (t, e) {
      N(t, this, e)
    },
    loadAll: function () {
      var t = this;
      this._elements.forEach(function (e) {
        $(e, t)
      })
    }
  }, t && function (t, e) {
    if (e) {
      if (e.length)
        for (var n, a = 0; n = e[a]; a += 1) o(t, n);
      else o(t, e)
    }
  }(C, window.lazyLoadOptions), C
});

//Flip Clock Timer
! function (i) {
  function t(t, n) {
    (function (t, n) {
      var s, a, r;
      i.extend(this, (s = t, r = e(s, a = n), {
        digits: [{
          currentValue: s % 10,
          nextValue: r[0]
        }, {
          currentValue: Math.floor(s / 10),
          nextValue: r[1]
        }]
      }))
    }).call(this, t, n), this.render = function () {
      return document.createRange().createContextualFragment(`
        <div class="flip-digit">
          <span class="flip-digit-next" data-digit="${this.digits[0].nextValue}"></span>
          <span class="flip-digit-current" data-digit="${this.digits[0].currentValue}"></span>
        </div>
        <div class="flip-digit">
          <span class="flip-digit-next" data-digit="${this.digits[1].nextValue}"></span>
          <span class="flip-digit-current" data-digit="${this.digits[1].currentValue}"></span>
        </div>
      `)
    }
  }

  function e(i, t) {
    var e = i - 1;
    return i || (e = "hours" === t ? 23 : 59), [e % 10, Math.floor(e / 10)]
  }

  function n(i) {
    return {
      digits: [i % 10, Math.floor(i / 10)]
    }
  }
  i(document).ready(function () {
    i(".flip-clock-container").each(function () {
      var s, a, r, l, d, u, g, o, f = (s = i(this), a = {}, r = 0, l = 0, s.children().each(function () {
        var e, n, s = i(this),
          d = parseInt(s.text()),
          u = (e = s, n = d, function (s) {
            var a = new t(n, s);
            e.html(a.render());
            for (var r = 0; r < 2; r++) i.extend(a.digits[r], {
              element: i(e.children()[r]),
              flipping: !1
            });
            return l++, {
              parentElement: e,
              digits: a.digits
            }
          });
        s.hasClass("flip-item-seconds") ? (r += d, a.seconds = u("seconds")) : s.hasClass("flip-item-minutes") ? (r += 60 * d, a.minutes = u("minutes")) : s.hasClass("flip-item-hours") ? (r += 60 * d * 60, a.hours = u("hours")) : s.hasClass("flip-item-days") && (r += 24 * d * 3600, a.days = u("days"))
      }), s[0].style.setProperty("--item-count", l), {
        flipElements: a,
        timestamp: r
      });
      d = f.flipElements, u = f.timestamp, g = i(this), o = setInterval(function () {
        if (function (i, t, s) {
            var a, r, l, d = {},
              u = {};
            for (var g in d.seconds = t % 60, d.minutes = Math.floor(t / 60 % 60), d.hours = Math.floor(t / 60 / 60 % 24), d.days = Math.floor(t / 60 / 60 / 24), u.seconds = n(d.seconds), u.minutes = n(d.minutes), u.hours = n(d.hours), u.days = n(d.days), i)
              for (var o = 0; o < 2; o++) u[g].digits[o] != i[g].digits[o].currentValue && (i[g].digits[o].flipping = !0, i[g].digits[o].element.addClass("flipping"));
            s.trigger("beforeFlipping", d), a = i, r = d, l = s, setTimeout(function () {
              for (var i in a)
                for (var t = 0; t < 2; t++)
                  if (a[i].digits[t].flipping) {
                    a[i].digits[t].currentValue = a[i].digits[t].nextValue, a[i].digits[t].element.children(".flip-digit-current").attr("data-digit", a[i].digits[t].currentValue);
                    for (var n = 10 * a[i].digits[1].nextValue + a[i].digits[0].nextValue, s = e(n, i), d = t; d < 2; d++) a[i].digits[d].nextValue != s[d] && (a[i].digits[d].nextValue = s[d], a[i].digits[d].element.children(".flip-digit-next").attr("data-digit", a[i].digits[d].nextValue));
                    a[i].digits[t].flipping = !1, a[i].digits[t].element.removeClass("flipping")
                  } l.trigger("afterFlipping", r)
            }, 900)
          }(d, --u, g), !u) return g.trigger("done"), clearInterval(o)
      }, 1e3)
    })
  })
}(jQuery);
//Flip Clock Timer


// custom-js
function openNav() {
  document.getElementById("mySidenav").style.width = "250px"
}

function closeNav() {
  document.getElementById("mySidenav").style.width = "0"
}
$(function () {
  new LazyLoad({
    elements_selector: ".lazy"
  })
}), AOS.init({
  disable: function () {
    return window.innerWidth < 800
  }
}), $(document).ready(function () {
  $(".feature-carousel").owlCarousel({
    loop: !0,
    margin: 30,
    nav: !1,
    dots: !1,
    mouseDrag: !0,
    autoplay: !0,
    autoplayTimeout: 3e3,
    autoplayHoverPause: !0,
    responsive: {
      0: {
        items: 1
      },
      600: {
        items: 2
      },
      1e3: {
        items: 4
      }
    }
  }), $(".choose-carousel").owlCarousel({
    loop: !0,
    margin: 30,
    nav: !1,
    nav: !0,
    navText: ['<i class="fas fa-arrow-left"></i>', '<i class="fas fa-arrow-right"></i>'],
    dots: !1,
    mouseDrag: !0,
    autoplay: !1,
    autoplayTimeout: 3e3,
    autoplayHoverPause: !0,
    responsive: {
      0: {
        items: 1
      },
      600: {
        items: 2
      },
      1e3: {
        items: 4
      }
    }
  }), $(".testi-carousel").owlCarousel({
    loop: !0,
    margin: 30,
    nav: !1,
    nav: !0,
    navText: ['<i class="fas fa-arrow-left"></i>', '<i class="fas fa-arrow-right"></i>'],
    dots: !1,
    mouseDrag: !0,
    autoplay: !1,
    autoplayTimeout: 3e3,
    autoplayHoverPause: !0,
    responsive: {
      0: {
        items: 1
      },
      600: {
        items: 1
      },
      1e3: {
        items: 1
      }
    }
  }), 992 >= $(window).width() && ($(".portfolio-slider").addClass("owl-carousel owl-theme"), $(".portfolio-slider").owlCarousel({
    loop: !1,
    margin: 30,
    nav: !1,
    dots: !1,
    autoplay: !0,
    autoplayTimeout: 4e3,
    autoplayHoverPause: !0,
    mouseDrag: !0,
    responsive: {
      0: {
        items: 2
      },
      460: {
        items: 3
      },
      767: {
        items: 4
      },
      991: {
        items: 4
      }
    }
  })), 992 >= $(window).width() && ($(".process-slider").addClass("owl-carousel owl-theme"), $(".process-slider").owlCarousel({
    loop: !0,
    margin: 30,
    nav: !1,
    dots: !1,
    autoplay: !0,
    autoplayTimeout: 4e3,
    autoplayHoverPause: !0,
    mouseDrag: !0,
    responsive: {
      0: {
        items: 1
      },
      460: {
        items: 1
      },
      767: {
        items: 2
      },
      991: {
        items: 2
      }
    }
  })), 992 >= $(window).width() && ($(".services-responsive-slider").addClass("owl-carousel owl-theme"), $(".services-responsive-slider").owlCarousel({
    loop: !1,
    margin: 30,
    nav: !1,
    dots: !0,
    autoHeight: !0,
    autoplay: !0,
    autoplayTimeout: 4e3,
    autoplayHoverPause: !0,
    mouseDrag: !0,
    responsive: {
      0: {
        items: 1
      },
      460: {
        items: 1
      },
      767: {
        items: 2
      },
      991: {
        items: 2
      }
    }
  })), 992 >= $(window).width() && ($(".compr-serv-boxes-slider").addClass("owl-carousel owl-theme"), $(".compr-serv-boxes-slider").owlCarousel({
    loop: !1,
    margin: 30,
    nav: !1,
    dots: !0,
    autoplay: !0,
    autoplayTimeout: 4e3,
    autoplayHoverPause: !0,
    mouseDrag: !0,
    responsive: {
      0: {
        items: 1
      },
      460: {
        items: 1
      },
      767: {
        items: 2
      },
      991: {
        items: 2
      }
    }
  })), 992 >= $(window).width() && ($(".resource-responsive-slider").addClass("owl-carousel owl-theme"), $(".resource-responsive-slider").owlCarousel({
    loop: !1,
    margin: 30,
    nav: !1,
    dots: !0,
    autoplay: !0,
    autoplayTimeout: 4e3,
    autoplayHoverPause: !0,
    mouseDrag: !0,
    responsive: {
      0: {
        items: 1
      },
      460: {
        items: 1
      },
      767: {
        items: 2
      },
      991: {
        items: 2
      }
    }
  })), 992 >= $(window).width() && ($(".detail-ghost-responsive-slider").addClass("owl-carousel owl-theme"), $(".detail-ghost-responsive-slider").owlCarousel({
    loop: !1,
    margin: 30,
    nav: !1,
    dots: !0,
    autoHeight: !0,
    autoplay: !0,
    autoplayTimeout: 4e3,
    autoplayHoverPause: !0,
    mouseDrag: !0,
    responsive: {
      0: {
        items: 1
      },
      460: {
        items: 1
      },
      767: {
        items: 2
      },
      991: {
        items: 2
      }
    }
  })), $(".procedure-slider").addClass("owl-carousel owl-theme"), $(".procedure-slider").owlCarousel({
    loop: !1,
    nav: !1,
    margin: 0,
    dots: !0,
    autoplay: !1,
    autoplayTimeout: 4e3,
    autoplayHoverPause: !0,
    mouseDrag: !0,
    responsiveClass: !0,
    responsive: {
      0: {
        items: 1
      },
      768: {
        items: 1
      }
    }
  })
});
var i, dropdown = document.getElementsByClassName("dropdown-btn");
for (i = 0; i < dropdown.length; i++) dropdown[i].addEventListener("click", function () {
  this.classList.toggle("active");
  var e = this.nextElementSibling;
  "block" === e.style.display ? e.style.display = "none" : e.style.display = "block"
});
// sticky header
$(window).scroll(function () {
  $(window).scrollTop() > 105 ? $("header").addClass("sticky-header") : $("header").removeClass("sticky-header")
}), $(document).ready(function () {
  $(".angle_down").click(function () {
    $(this).parent().parent().toggleClass("showform"), $("#change_ic").toggleClass("fa-angle-double-down fa-angle-double-up"), $(".banner_img").fadeToggle()
  })
}), $(document).ready(function () {
  $(window).width() > 767 && ($(".angle_down").parent().parent().toggleClass("showform"), $("#change_ic").toggleClass("fa-angle-double-down fa-angle-double-up"), $(".banner_img").fadeToggle())
}), jQuery(".bottom-clients1").slick({
  dots: !1,
  infinite: !0,
  speed: 200,
  slidesToShow: 4,
  slidesToScroll: 1,
  autoplay: 1,
  autoplaySpeed: 2e3,
  arrows: !1,
  responsive: [{
    breakpoint: 1024,
    settings: {
      slidesToShow: 3,
      slidesToScroll: 1,
      infinite: !0,
      dots: !1,
      arrows: !1
    }
  }, {
    breakpoint: 600,
    settings: {
      slidesToShow: 3,
      slidesToScroll: 1
    }
  }, {
    breakpoint: 480,
    settings: {
      slidesToShow: 1,
      slidesToScroll: 1
    }
  }, ]
});