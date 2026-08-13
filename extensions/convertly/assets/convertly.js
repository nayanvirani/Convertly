/* Convertly — JSON-driven widget renderer.
 * Fetches /api/widgets-config for this shop and renders whichever widgets
 * are enabled. Uses the shop's public storefront JSON endpoints
 * (/products/*.js, /collections/*.json) for live product data — no admin
 * API calls happen from the browser.
 *
 * This same script is included by the main app embed AND by the optional
 * Countdown Timer / Trust Badges app blocks (for precise placement — drag
 * the block into a section, same idea as Judge.me's placeable blocks). All
 * three can be present on the same page at once, so:
 *  - config is read from whichever [data-convertly-config] element exists
 *    (each of the three Liquid files renders one; they're all identical)
 *  - a one-time init guard stops the fetch+render logic from running more
 *    than once even though the <script> tag may appear 2-3 times on a page
 */
(function () {
  if (window.__convertlyInit) return;
  window.__convertlyInit = true;

  var cfg = document.querySelector('[data-convertly-config]');
  if (!cfg) return;
  var shop = cfg.getAttribute('data-shop');
  var api = cfg.getAttribute('data-api');
  if (!shop || !api) return;

  function track(widget, eventType) {
    if (eventType === 'view') {
      var k = 'cbt-' + widget;
      try { if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, '1'); } catch (e) {}
    }
    var d = new URLSearchParams({ shop: shop, widget: widget, event: eventType });
    var url = api + '/api/track';
    if (navigator.sendBeacon) navigator.sendBeacon(url, d);
    else fetch(url, { method: 'POST', body: d }).catch(function () {});
  }

  function isProductPage() {
    return /\/products\//.test(window.location.pathname);
  }

  function money(cents) {
    var currency = (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) || 'USD';
    try {
      return (cents / 100).toLocaleString(undefined, { style: 'currency', currency: currency });
    } catch (e) {
      return '$' + (cents / 100).toFixed(2);
    }
  }

  // ─── Announcement bar ─────────────────────────────────────────────────────
  // Every widget requires its block to be explicitly placed somewhere
  // (Header/footer section group for sitewide widgets like this one) —
  // enabling it in the dashboard alone is not enough. The block's own DOM
  // position doesn't matter for the bar specifically (it always renders at
  // the very top/bottom of <body> via fixed/sticky CSS) — its presence is
  // just the "merchant actually wants this" signal.
  function renderBar(s) {
    if (!document.querySelector('[data-convertly-widget="bar"]')) return;
    var messages = (s.messages || []).filter(Boolean);
    if (!messages.length) return;
    var key = 'cb-bar-dismissed';
    try { if (sessionStorage.getItem(key)) return; } catch (e) {}

    var bar = document.createElement('div');
    bar.className = 'cb-bar' + (s.sticky ? ' cb-bar--sticky' : '');
    bar.id = 'cb-bar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Announcement');
    bar.setAttribute('data-position', s.position || 'top');
    bar.style.background = s.bgColor;
    bar.style.color = s.textColor;
    bar.style.fontSize = (s.fontSize || 14) + 'px';

    var msgEl = document.createElement('p');
    msgEl.className = 'cb-bar__msg';
    msgEl.setAttribute('aria-live', 'polite');
    msgEl.textContent = messages[0];
    bar.appendChild(msgEl);

    if (s.ctaText && s.ctaLink) {
      var cta = document.createElement('a');
      cta.className = 'cb-bar__cta';
      cta.href = s.ctaLink;
      cta.textContent = s.ctaText;
      cta.addEventListener('click', function () { track('bar', 'click'); });
      bar.appendChild(cta);
    }

    if (s.dismissible) {
      var close = document.createElement('button');
      close.className = 'cb-bar__close';
      close.type = 'button';
      close.setAttribute('aria-label', 'Close announcement');
      close.innerHTML = '&times;';
      close.addEventListener('click', function () {
        bar.remove();
        try { sessionStorage.setItem(key, '1'); } catch (e) {}
      });
      bar.appendChild(close);
    }

    if (s.position === 'bottom') document.body.appendChild(bar);
    else document.body.insertBefore(bar, document.body.firstChild);

    track('bar', 'view');

    if (messages.length > 1) {
      var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var i = 0;
      setInterval(function () {
        i = (i + 1) % messages.length;
        if (reduced) { msgEl.textContent = messages[i]; return; }
        msgEl.classList.add('cb-fade');
        setTimeout(function () {
          msgEl.textContent = messages[i];
          msgEl.classList.remove('cb-fade');
        }, 300);
      }, (s.rotateSeconds || 5) * 1000);
    }
  }

  // ─── Countdown timer ──────────────────────────────────────────────────────
  // Renders into a merchant-placed [data-convertly-widget="timer"] block if
  // one exists (precise placement, dragged in via the theme editor — same
  // idea as Judge.me's placeable blocks); otherwise falls back to the
  // heuristic anchor placement so the widget still works with zero
  // theme-editor steps beyond enabling the app embed.
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function buildTimerElement(s) {
    var el = document.createElement('div');
    el.className = 'cb-count';
    el.setAttribute('role', 'timer');
    el.style.background = s.bgColor;
    el.style.color = s.textColor;
    el.innerHTML =
      '<span class="cb-count__label"></span>' +
      '<span class="cb-count__units">' +
      '<span class="cb-count__unit"><span class="cb-count__num" data-u="d">--</span><span class="cb-count__word">Days</span></span>' +
      '<span class="cb-count__unit"><span class="cb-count__num" data-u="h">--</span><span class="cb-count__word">Hrs</span></span>' +
      '<span class="cb-count__unit"><span class="cb-count__num" data-u="m">--</span><span class="cb-count__word">Min</span></span>' +
      '<span class="cb-count__unit"><span class="cb-count__num" data-u="s">--</span><span class="cb-count__word">Sec</span></span>' +
      '</span>';
    el.querySelector('.cb-count__label').textContent = s.label || '';
    return el;
  }

  function startTimer(el, s) {
    var endMs;
    if (s.mode === 'evergreen') {
      var minutes = s.evergreenMinutes || 30;
      var lsKey = 'cb-evergreen';
      try {
        endMs = parseInt(localStorage.getItem(lsKey), 10);
        if (!endMs || endMs < Date.now()) {
          endMs = Date.now() + minutes * 60000;
          localStorage.setItem(lsKey, String(endMs));
        }
      } catch (e) { endMs = Date.now() + minutes * 60000; }
    } else {
      var parsed = new Date(s.endDate + 'T' + (s.endTime || '23:59'));
      endMs = isNaN(parsed) ? 0 : parsed.getTime();
    }

    var nums = {
      d: el.querySelector('[data-u="d"]'),
      h: el.querySelector('[data-u="h"]'),
      m: el.querySelector('[data-u="m"]'),
      s: el.querySelector('[data-u="s"]')
    };

    function expire() {
      clearInterval(t);
      if (s.expiredAction === 'message') {
        el.innerHTML = '<span class="cb-count__label">' + (s.expiredText || 'Offer has ended') + '</span>';
      } else {
        el.remove();
      }
    }

    function tick() {
      var diff = endMs - Date.now();
      if (diff <= 0) { expire(); return; }
      var sec = Math.floor(diff / 1000);
      nums.d.textContent = pad(Math.floor(sec / 86400));
      nums.h.textContent = pad(Math.floor((sec % 86400) / 3600));
      nums.m.textContent = pad(Math.floor((sec % 3600) / 60));
      nums.s.textContent = pad(sec % 60);
    }
    var t = setInterval(tick, 1000);
    tick();
  }

  function renderTimer(s) {
    // Requires an explicitly placed block — no auto-placement fallback.
    var mounts = document.querySelectorAll('[data-convertly-widget="timer"]');
    if (!mounts.length) return;
    mounts.forEach(function (mount) {
      var el = buildTimerElement(s);
      mount.appendChild(el);
      startTimer(el, s);
    });
    track('timer', 'view');
  }

  // ─── Trust badges ─────────────────────────────────────────────────────────
  // Same placed-block-first, heuristic-fallback pattern as the timer above.
  var trustInstanceCount = 0;

  function buildTrustElement(s, badges) {
    var bid = 'cb-trust-' + (trustInstanceCount++);
    var needsScroll = s.layout === 'scroll' || s.mobileLayout === 'scroll';

    var wrap = document.createElement('div');
    wrap.id = bid;

    var css =
      '#' + bid + ' .cb-trust__item svg, #' + bid + ' .cb-trust__img { width:' + s.iconSize + 'px; height:' + s.iconSize + 'px; }';
    if (s.layout === 'vertical') {
      css += '#' + bid + ' .cb-trust { flex-direction: column; align-items: flex-start; }';
    } else if (s.layout === 'scroll') {
      // Note: the animation always travels exactly one copy's width per
      // `scrollSpeed` seconds regardless of how many copies end up in the
      // track (percentage shift x total track width = one copy's pixel
      // width, always) — see fillMarqueeTrack() below, which decides how
      // many copies are actually needed and sets --cb-marquee-shift.
      css += '#' + bid + ' { overflow: hidden; } #' + bid + ' .cb-trust-track { display:flex; width:max-content; animation: cbmarquee ' + s.scrollSpeed + 's linear infinite; } #' + bid + ' .cb-trust { flex-wrap: nowrap; flex: none; } #' + bid + ' .cb-trust-track:hover { animation-play-state: paused; }';
    }
    if (needsScroll && s.layout !== 'scroll') {
      // Desktop layout itself isn't scroll mode (it's 'horizontal',
      // 'vertical', whatever) but the DOM still has the duplicate list
      // (built below) because *mobile* needs it for its marquee loop.
      // Hide that duplicate by default, independent of which desktop
      // layout is active, so it doesn't show up as a second, un-animated
      // row/column on desktop — the mobile-only media query below
      // un-hides it again where it's actually needed. This has to be a
      // standalone check, not chained onto the 'vertical' branch above,
      // or the vertical desktop layout would skip it and keep the bug.
      css += '#' + bid + ' .cb-trust--dupe { display: none; }';
    }
    css += '@keyframes cbmarquee { from { transform: translateX(0); } to { transform: translateX(var(--cb-marquee-shift, -50%)); } }';
    var mob = s.mobileLayout;
    if (mob && mob !== 'same') {
      css += '@media (max-width:749px){';
      if (mob === 'vertical') {
        // Also has to explicitly stop .cb-trust-track's own animation —
        // it's the track that carries `animation: cbmarquee…`, not the
        // list, so overriding animation on .cb-trust alone (as this used
        // to do) left the marquee running underneath the column layout.
        css += '#' + bid + ' .cb-trust{flex-direction:column!important;align-items:flex-start;animation:none!important;} #' + bid + ' .cb-trust-track{display:block!important;width:auto!important;animation:none!important;overflow:visible!important;} #' + bid + ' .cb-trust--dupe{display:none!important;}';
      } else if (mob === 'horizontal') {
        css += '#' + bid + ' .cb-trust{flex-direction:row!important;flex-wrap:wrap!important;animation:none!important;} #' + bid + ' .cb-trust-track{display:block!important;width:auto!important;animation:none!important;overflow:visible!important;} #' + bid + ' .cb-trust--dupe{display:none!important;}';
      } else if (mob === 'scroll' && s.layout !== 'scroll') {
        css += '#' + bid + '{overflow:hidden;} #' + bid + ' .cb-trust-track{display:flex;width:max-content;animation:cbmarquee ' + s.scrollSpeed + 's linear infinite;} #' + bid + ' .cb-trust{flex-direction:row!important;flex-wrap:nowrap!important;flex:none!important;} #' + bid + ' .cb-trust--dupe{display:flex!important;}';
      }
      css += '}';
    }
    var styleEl = document.createElement('style');
    styleEl.textContent = css;
    wrap.appendChild(styleEl);

    function buildList(hidden) {
      var ul = document.createElement('ul');
      ul.className = 'cb-trust' + (hidden ? ' cb-trust--dupe' : '');
      ul.style.color = s.color;
      ul.setAttribute('aria-label', 'Store guarantees');
      if (hidden) ul.setAttribute('aria-hidden', 'true');
      badges.forEach(function (b) {
        var li = document.createElement('li');
        li.className = 'cb-trust__item';
        if (b.icon) {
          var img = document.createElement('img');
          img.className = 'cb-trust__img';
          img.src = b.icon;
          img.alt = '';
          img.loading = 'lazy';
          img.width = s.iconSize;
          img.height = s.iconSize;
          li.appendChild(img);
        } else {
          li.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>';
        }
        var span = document.createElement('span');
        span.textContent = b.text;
        li.appendChild(span);
        ul.appendChild(li);
      });
      return ul;
    }

    if (needsScroll) {
      var trackEl = document.createElement('div');
      trackEl.className = 'cb-trust-track';
      trackEl.appendChild(buildList(false));
      trackEl.appendChild(buildList(true));
      wrap.appendChild(trackEl);
    } else {
      wrap.appendChild(buildList(false));
    }

    return wrap;
  }

  // The 2-copy marquee technique (real list + one hidden duplicate) only
  // loops seamlessly if those 2 copies together are at least as wide as
  // the space they scroll through — with a short badge list on a wide
  // screen they're not, leaving a blank gap after they scroll past. Once
  // the element is actually in the page (so real widths are measurable),
  // clone the list as many more times as needed to guarantee full
  // coverage, and tell the CSS animation exactly how far one copy-width
  // is so the loop still lines up. No-ops instantly if the ticker isn't
  // the active layout at the current viewport width (display isn't flex).
  function fillMarqueeTrack(wrapEl) {
    var trackEl = wrapEl.querySelector('.cb-trust-track');
    if (!trackEl) return;
    if (getComputedStyle(trackEl).display !== 'flex') return;

    var first = trackEl.querySelector('.cb-trust');
    if (!first) return;
    var singleWidth = first.getBoundingClientRect().width;
    var containerWidth = wrapEl.getBoundingClientRect().width;
    if (!singleWidth || !containerWidth) return;

    // +1 beyond the exact math as a safety margin — subpixel rounding and
    // measuring mid-layout (see the re-runs in renderTrust below) can
    // otherwise leave the count just barely short. Extra copies past what
    // overflow:hidden ever reveals cost nothing visually.
    var copiesNeeded = Math.min(20, Math.max(2, Math.ceil((containerWidth * 2) / singleWidth) + 1));
    var have = trackEl.children.length;
    for (var i = have; i < copiesNeeded; i++) {
      var clone = first.cloneNode(true);
      clone.classList.add('cb-trust--dupe');
      clone.setAttribute('aria-hidden', 'true');
      trackEl.appendChild(clone);
    }
    // Percentage shift x total track width = one copy's pixel width no
    // matter how many copies there are, so this keeps the configured
    // scroll speed feeling the same regardless of content length.
    trackEl.style.setProperty('--cb-marquee-shift', (-100 / copiesNeeded).toFixed(4) + '%');
  }

  function renderTrust(s) {
    // Requires an explicitly placed block — no auto-placement fallback.
    var badges = (s.badges || []).filter(function (b) { return b && b.text; });
    if (!badges.length) return;

    var mounts = document.querySelectorAll('[data-convertly-widget="trust"]');
    if (!mounts.length) return;

    var built = [];
    mounts.forEach(function (mount) {
      var el = buildTrustElement(s, badges);
      mount.appendChild(el);
      built.push(el);
    });

    function fillAll() { built.forEach(fillMarqueeTrack); }
    fillAll();

    // The first measurement can land before the theme's webfont has
    // swapped in or before other page content finishes shifting layout —
    // either can silently make the initial width measurement too narrow,
    // under-filling the track. fillMarqueeTrack() only ever adds copies
    // (never removes), so re-running it later is always safe and just
    // tops up whatever's missing once real measurements are available.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(fillAll).catch(function () {});
    }
    window.addEventListener('load', fillAll, { once: true });
    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(fillAll, 200);
    });

    track('trust', 'view');
  }

  // ─── Sticky add to cart ───────────────────────────────────────────────────
  // Auto-renders on product pages once enabled — no block placement needed
  // (there's nowhere more "placed" a sticky bottom bar could be anyway).
  function renderSatc(s) {
    if (!isProductPage()) return;
    var mainForm = document.querySelector('form[action*="/cart/add"]');
    if (!mainForm) return;

    var handle = (window.location.pathname.match(/\/products\/([^/?#]+)/) || [])[1];
    if (!handle) return;

    fetch('/products/' + handle + '.js')
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (product) {
        if (!product.available) return; // nothing useful to stick around for
        var variant = product.variants.filter(function (v) { return v.available; })[0] || product.variants[0];

        var bar = document.createElement('div');
        bar.className = 'cb-satc';
        bar.id = 'cb-satc';
        bar.setAttribute('aria-hidden', 'true');

        var html = '';
        if (product.featured_image) {
          html += '<img class="cb-satc__img" src="' + product.featured_image + '&width=88" alt="" width="44" height="44" loading="lazy">';
        }
        html += '<div class="cb-satc__info"><p class="cb-satc__title"></p><span class="cb-satc__price" data-cb-price></span></div>';
        if (product.variants.length > 1) {
          html += '<select class="cb-satc__variants" data-cb-variants aria-label="Select variant"></select>';
        } else {
          html += '<input type="hidden" data-cb-variants value="' + product.variants[0].id + '">';
        }
        html += '<button class="cb-satc__btn" type="button" data-cb-add style="background:' + s.btnColor + ';">' + s.btnText + '</button>';
        bar.innerHTML = html;

        bar.querySelector('.cb-satc__title').textContent = product.title;
        bar.querySelector('[data-cb-price]').textContent = money(variant.price);

        var select = bar.querySelector('select[data-cb-variants]');
        if (select) {
          product.variants.forEach(function (v) {
            var opt = document.createElement('option');
            opt.value = v.id;
            opt.setAttribute('data-price', money(v.price));
            if (!v.available) opt.disabled = true;
            if (v.id === variant.id) opt.selected = true;
            opt.textContent = v.title;
            select.appendChild(opt);
          });
        }

        document.body.appendChild(bar);

        var viewTracked = false;
        if ('IntersectionObserver' in window) {
          var io = new IntersectionObserver(function (entries) {
            var visible = entries[0].isIntersecting;
            bar.classList.toggle('cb-satc--visible', !visible);
            bar.setAttribute('aria-hidden', visible ? 'true' : 'false');
            if (!visible && !viewTracked) { viewTracked = true; track('satc', 'view'); }
          }, { threshold: 0 });
          io.observe(mainForm);
        } else {
          var onScroll = function () {
            var show = window.scrollY > window.innerHeight * 0.6;
            bar.classList.toggle('cb-satc--visible', show);
            bar.setAttribute('aria-hidden', show ? 'false' : 'true');
            if (show && !viewTracked) { viewTracked = true; track('satc', 'view'); }
          };
          window.addEventListener('scroll', onScroll, { passive: true });
          onScroll();
        }

        var priceEl = bar.querySelector('[data-cb-price]');
        if (select && priceEl) {
          select.addEventListener('change', function () {
            var opt = select.options[select.selectedIndex];
            if (opt && opt.getAttribute('data-price')) priceEl.textContent = opt.getAttribute('data-price');
          });
        }

        var btn = bar.querySelector('[data-cb-add]');
        var originalText = btn ? btn.textContent : '';
        if (btn) {
          btn.addEventListener('click', function () {
            var id = select ? select.value : bar.querySelector('[data-cb-variants]').value;
            if (!id) return;
            btn.disabled = true;
            btn.textContent = 'Adding…';
            track('satc', 'click');
            fetch((window.Shopify && window.Shopify.routes ? window.Shopify.routes.root : '/') + 'cart/add.js', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ items: [{ id: parseInt(id, 10), quantity: 1 }] })
            })
              .then(function (r) { if (!r.ok) throw new Error('add failed'); return r.json(); })
              .then(function () {
                document.dispatchEvent(new CustomEvent('cb:cart:added'));
                if (s.afterAdd === 'cart') {
                  window.location.href = (window.Shopify && window.Shopify.routes ? window.Shopify.routes.root : '/') + 'cart';
                  return;
                }
                btn.textContent = 'Added ✓';
                fetch('/cart.js').then(function (r) { return r.json(); }).then(function (cart) {
                  document.querySelectorAll('.cart-count-bubble, [data-cart-count]').forEach(function (el) {
                    el.textContent = cart.item_count;
                  });
                }).catch(function () {});
                setTimeout(function () { btn.textContent = originalText; btn.disabled = false; }, 2000);
              })
              .catch(function () {
                btn.textContent = 'Try again';
                btn.disabled = false;
              });
          });
        }
      })
      .catch(function () { /* product fetch failed — fail silently */ });
  }

  // ─── Social proof popup ───────────────────────────────────────────────────
  // Auto-renders sitewide once enabled — no block placement needed (it's a
  // floating corner popup, not something that lives in a section).
  function renderPopup(s) {
    var dismissedKey = 'cb-pop-dismissed';
    try { if (sessionStorage.getItem(dismissedKey)) return; } catch (e) {}

    var collection = s.collection || 'all';
    var url = '/collections/' + encodeURIComponent(collection) + '/products.json?limit=12';

    fetch(url)
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (data) {
        var products = (data.products || []).filter(function (p) { return p.images && p.images.length; });
        if (!products.length) return;

        for (var i = products.length - 1; i > 0; i--) {
          var j = Math.floor(Math.random() * (i + 1));
          var tmp = products[i]; products[i] = products[j]; products[j] = tmp;
        }

        var el = document.createElement('a');
        el.className = 'cb-pop';
        el.innerHTML =
          '<img class="cb-pop__img" alt="" width="52" height="52">' +
          '<span><span class="cb-pop__eyebrow"></span>' +
          '<span class="cb-pop__title"></span></span>' +
          '<button class="cb-pop__close" type="button" aria-label="Hide popups">&times;</button>';
        document.body.appendChild(el);

        var eyebrowEl = el.querySelector('.cb-pop__eyebrow');
        eyebrowEl.textContent = s.eyebrow || '';
        eyebrowEl.style.color = s.accentColor || '';

        el.querySelector('.cb-pop__close').addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          el.remove();
          try { sessionStorage.setItem(dismissedKey, '1'); } catch (err) {}
        });

        el.addEventListener('click', function (e) {
          if (e.target.closest('.cb-pop__close')) return;
          track('popup', 'click');
        });

        var showMs = (s.showSeconds || 5) * 1000;
        var gapMs = (s.gapSeconds || 25) * 1000;
        var max = s.maxPopups || 4;
        var shown = 0;

        function showNext() {
          if (!document.body.contains(el) || shown >= max || shown >= products.length) return;
          var p = products[shown];
          el.href = '/products/' + p.handle;
          el.querySelector('.cb-pop__img').src = p.images[0].src + (p.images[0].src.indexOf('?') > -1 ? '&' : '?') + 'width=104';
          el.querySelector('.cb-pop__title').textContent = p.title;
          el.classList.add('cb-pop--visible');
          if (shown === 0) track('popup', 'view');
          shown++;
          setTimeout(function () {
            el.classList.remove('cb-pop--visible');
            if (shown < max && shown < products.length) setTimeout(showNext, gapMs);
          }, showMs);
        }

        setTimeout(showNext, (s.firstDelay || 8) * 1000);
      })
      .catch(function () { /* collection not found or blocked — fail silently */ });
  }

  var RENDERERS = { bar: renderBar, timer: renderTimer, trust: renderTrust, satc: renderSatc, popup: renderPopup };

  fetch(api + '/api/widgets-config?shop=' + encodeURIComponent(shop))
    .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
    .then(function (data) {
      var widgets = data.widgets || {};
      Object.keys(widgets).forEach(function (key) {
        var renderer = RENDERERS[key];
        if (renderer) renderer(widgets[key]);
      });
    })
    .catch(function () { /* config unavailable — nothing renders */ });
})();
