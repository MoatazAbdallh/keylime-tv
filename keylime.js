/*jshint laxbreak:true, boss:true, shadow:true*/
/**
 * @license Copyright 2014 Andy Earnshaw, MIT License
 *
 * A simple input method editor written in JavaScript and CSS
 */
(function (global, factory) {
  var exported,
    keyLime = factory(global);

  if (typeof define === 'function' && define.amd)
    define(exported = keyLime);

  if (typeof exports === 'object')
    module.exports = exported = keyLime;

  global.keyLime = keyLime;

})(typeof global !== 'undefined' ? global : this, function (global) {
  "use strict";

  var
    holdTimer, hideTimer, focused, shift, caps, sym, move, lastLeft, lastDir, diacriticsMenu,
    style = document.createElement('style'),
    imeCtr = document.createElement('div'),
    exports = global.keyLime || {config: {}},
    visible = false,

  // Check that events can be constructed as per DOM4
    evtConstructors = (function () {
      try {
        return !!new CustomEvent('a');
      } catch (e) {
        return false;
      }
    })(),

  // Didn't seem worth having a separate file for the default styles, so here they are
    cssRules = [
      '.lime-container { background-color: #333; position: absolute; bottom: 0; left: 0; right: 0; color: #fff; z-index:1000000; font-family: JF; }',
      '.lime-container-dim::before { position: absolute; content: ""; top: 0; left: 0; right: 0; bottom: 0; background-color: #000; opacity: 0.5; }',
      '.lime-key-row { list-style-type: none; clear: both; text-align: center; padding: 0; margin: 0; font-size: 50px; }',
      '.lime-diacritics-row { position: absolute; z-index: 2; overflow: hidden; -webkit-transition: width 400ms; transition: width 400ms; white-space: nowrap; }',
      '.lime-key { vertical-align: top; display: inline-block; border: 3px solid #333; background-color: #666; width: 80px;  -webkit-transition: all 400ms linear; transition: all 400ms linear; }',

      '.lime-key[data-text]::before { content: attr(data-text) }',
      '.lime-container.symbol-toggle .lime-key[data-symbol]::before { content: attr(data-symbol) }',
      '.lime-container.shift-toggle .lime-key[data-text]:not(.lime-http):not(.lime-dotcom):not(.lime-wwwdot)::before { text-transform: uppercase; }',
      '.lime-special-key { background-color: #999; color: #333; }',
      '.lime-return { background-color: #ccc; width: 200px;min-height:75px }',
      '.lime-backspace { background-color: #ccc; width: 138px;min-height:75px  }',
      '.lime-focus { background-color: #26f; color: #fff; }',
      '.lime-toggle { background-color: #2f2; color: #fff; position: relative; }',
      '.lime-spacebar { width:498px; }',
      '.lime-http, .lime-dotcom, .lime-wwwdot { font-size: 20px; }'
    ],

  // <input> elements that definitely won't throw an error for .selection[Start|End]
    regSupportSel = /^(?:text|search|url|tel|password)$/i,
    supportAnySel = wontThrowOnSelection(),

  // Special/Modifier keys
    spKeys = {
      Tab: tabNext,
      Return: submit,

      /**
       * Switches to uppercase mode
       */
      Shift: function (f) {
        var t = imeCtr.querySelector('.lime-toggle');

        if (t)
          t.classList.remove('lime-toggle');

        imeCtr.classList.remove('shift-toggle', 'symbol-toggle');
        sym = move = false;

        if (shift) {
          shift = false;
          caps = true;
          f.classList.add('lime-toggle');
        }
        else if (caps)
          caps = false;
        else
          shift = true;

        if (shift || caps)
          imeCtr.classList.add('shift-toggle');
      },

      /**
       * Shows symbol characters
       */
      Symbol: function (f) {
        var t = imeCtr.querySelector('.lime-toggle');

        if (t)
          t.classList.remove('lime-toggle');

        sym = !sym;
        shift = caps = move = false;
        imeCtr.classList.remove('shift-toggle');
        imeCtr.classList.toggle('symbol-toggle');

        if (sym)
          f.classList.toggle('lime-toggle');
      },

      /**
       * Deletes the previous character or current selection
       */
      Backspace: function () {
        var a = document.activeElement,
          sel = window.getSelection();

        if (!isInput(a))
          return;

        // selectionStart works better in older WebKit...
        if (supportAnySel || regSupportSel.test(a.type)) {
          var ss = a.selectionStart;

          if (!String(sel).length) {
            a.value = a.value.slice(0, ss - 1) + a.value.slice(ss);
            a.selectionStart = ss - 1;
          }
          else {
            a.value = a.value.slice(0, ss) + a.value.slice(a.selectionEnd);
            a.selectionStart = ss;
          }
        }

        // ...but fails for some elements in newer WebKit/Blink
        else {
          // If no characters are selected, select the previous
          if (!String(sel).length)
            sel.modify('extend', 'backward', 'character');

          // Remove the selected range(s)
          sel.deleteFromDocument();
        }
      },

      /**
       * Switches to caret-move mode
       */
      Caret: function (f) {
        var t = imeCtr.querySelector('.lime-toggle');

        if (t)
          t.classList.remove('lime-toggle');

        sym = shift = caps = false;
        imeCtr.classList.remove('shift-toggle', 'symbol-toggle');

        move = !move;

        if (move)
          f.classList.add('lime-toggle');
      }
    },

  // Input modes, matching the HTML5 spec
    inputMode = {
      verbatim: {
        keys: {
          "en": {
            // Default keys, separated into rows
            standard: [
              ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
              ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
              ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
              ['z', 'x', 'c', 'v', 'b', 'n', 'm']
            ],

            // Symbol keys
            symbol: [
              ['@', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='],
              ['~', '#', '`', '£', '$', '%', '^', '&', '(', ')', '[', ']'],
              ['•', '€', '¥', '¡', '¿', '*', '|', '{', '}', ':', '&quot;'],
              ['_', '+', '!', '\\', '«', '»', '§', '<', '>', '?'],
            ]
          },
          "ar": {
            // Default keys, separated into rows
            standard: [
              ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
              ['د', 'ج', 'ح', 'خ', 'ه', 'ع', 'غ', 'ف', 'ق', 'ث', 'ص', 'ض', 'ذ'],
              ['ط', 'ك', 'م', 'ن', 'ت', 'أ', 'إ', 'ا', 'ل', 'لأ', 'لإ', 'ب', 'ي', 'س', 'ش'],
              ['ظ', 'ز', 'و', 'ة', 'ى', 'لا', 'لآ', 'ر', 'ؤ', 'ء', 'ئ']
            ],

            // Symbol keys
            symbol: [
              ['@', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='],
              ['~', '#', '`', '£', '$', '%', '^', '&', '(', ')', '[', ']'],
              ['•', '€', '¥', '¡', '¿', '*', '|', '{', '}', ':', '&quot;'],
              ['_', '+', '!', '\\', '«', '»', '§', '<', '>', '?'],
            ]
          }
        },

        // Characters with diacritics appear when certain keys are held
        diacritics: {
          a: 'äáâàåæ',
          c: 'ç©',
          d: 'ð',
          e: 'ëéêè',
          i: 'ïíîì',
          m: 'µ',
          n: 'ñ',
          o: 'öóôòõø',
          u: 'üúûù',
          y: 'ÿý',
        }
      }
    };

// Initialize the container
  imeCtr.className = 'lime-container';
  imeCtr.lang = 'en';

// Create the stylesheet
  document.head.insertBefore(style, document.head.firstChild);

  for (var i = 0; i < cssRules.length; i++)
    style.sheet.insertRule(cssRules[i], i);

  /**
   * Tests adherence to the HTML5 spec for some input types.
   * Spec says that email|number|date|etc. must throw an error if code attempts
   * to get or modify the selection, which presents a problem for virtual keyboards.
   */
  function wontThrowOnSelection() {
    var dummy = document.createElement('input');
    dummy.type = 'number';

    try {
      dummy.selectionStart = 0;
      return true;
    }
    catch (e) {
      return false;
    }
  }

  /**
   * Shows the keyboard if the current active element is an input
   */
  function showIME() {
    if (!isInput(document.activeElement))
      return;

    clearTimeout(hideTimer);

    if (!visible && dispatchCustomEvent('keylimeshow')) {
      document.body.appendChild(imeCtr);
      visible = true;
    }
  }

  /**
   * Removes the keyboard from the document
   */
  function hideIME() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      if (!visible || !dispatchCustomEvent('keylimehide'))
        return;

      document.body.removeChild(imeCtr);
      visible = false;

      if (focused) {
        focused.classList.remove('lime-focus');
        focused = null;
      }
    });
  }

  /**
   * Sets up the keyboard
   */
  function initKeys(lang, dir) {
    imeCtr.className = "lime-container " + dir;
    imeCtr.lang = lang;
    var enter = lang == "ar" ? "موافق" : "Ok";
    var backspace = lang == "ar" ? "مسح" : "Del";

    var html = '',
      spKeys = {
        row2: {
          before: '<li id="limeShift" class="lime-key lime-special-key lime-shift">↑</li>',
        }
      },
      keys = inputMode.verbatim.keys;

    // Create a <menu> for the row and <li>s for each key
    html += keys[lang].standard.map(function (keyRow, rIdx) {
      var sp = spKeys['row' + rIdx];

      return (
        '<menu class="lime-key-row">'
        + (lang == "en" ? sp && sp.before || '' : '')
        + keyRow.map(function (k, kIdx) {
          return '<li class="lime-key" data-text="' + k + '" data-symbol="' + keys[lang].symbol[rIdx][kIdx] + '"></li>';
        }).join('')
        + (lang == "en" ? sp && sp.after || '' : '')
        + '</menu>'
      );
    }).join('');

    // Add the bottom row, mostly special keys
    html += '<menu class="lime-key-row">'
      + '<li id="limeBackspace" class="lime-key lime-special-key lime-backspace"></li>'
      + '<li class="lime-key lime-spacebar" data-text=" ">&nbsp;</li>'
      + '<li id="limeReturn" class="lime-key lime-special-key lime-return"></li>'
      + '</menu>';

    imeCtr.innerHTML = html;
    $('.lime-key.lime-special-key.lime-return').text(enter);
    $('.lime-key.lime-special-key.lime-backspace').text(backspace);


  }

  /**
   * Moves the keyboard's pseudo-focus to the passed element
   */
  function newFocus(el) {
    if (!el.classList.contains('lime-key'))
      return;

    if (focused)
      focused.classList.remove('lime-focus');

    focused = el;
    focused.classList.add('lime-focus');
  }

  /**
   * Moves the keyboard's pseudo-focus in the direction given
   */
  function moveKeyFocus(dir) {
    var next;

    // Focus the first key if none are focused
    if (!focused)
      next = imeCtr.querySelector('.lime-key');

    // Left and right are easy
    else if (dir === 'left' || dir === 'right') {
      if (imeCtr.lang == 'en')
        next = focused[(dir === 'left' ? 'previous' : 'next') + 'Sibling'];
      else
        next = focused[(dir === 'left' ? 'next' : 'previous') + 'Sibling'];

      // Wrap around
      if (!next && !diacriticsMenu) {
        if (imeCtr.lang == 'en')
          next = focused.parentNode[(dir === 'left' ? 'last' : 'first') + 'Child'];
        else
          next = focused.parentNode[(dir === 'left' ? 'first' : 'last') + 'Child'];
      }
    }

    // Up/down need to use elementFromPoint()
    else if (!diacriticsMenu) {
      var rect = focused.getBoundingClientRect(),
        hght = focused.offsetHeight,
        y = rect.top + (dir === 'down' ? hght : -hght),
        x = lastLeft;

      if (!lastLeft)
        x = lastLeft = rect.left + (focused.offsetWidth / 2);

      // As the key layout may be staggered, we should assume the user wants
      // to reach the farthest key in the direction they were going.
      // We check the location slightly to the left or right of the middle of
      // the focused key first...
      next = document.elementFromPoint(lastDir === 'left' ? x - 10 : x + 10, y);

      // ...if there was no key at that point, try the other side
      //if (!next.classList.contains('lime-key'))
      // next = document.elementFromPoint(x + 10, y);
    }

    if (next && next.classList.contains('lime-key')) {
      newFocus(next);

      // Set lastLeft and lastDir only when moving horizontally
      if (dir === 'left' || dir === 'right') {
        lastLeft = focused.getBoundingClientRect().left + (focused.offsetWidth / 2);
        lastDir = dir;
      }
    }

    // Allow the user to move out of the diacritics menu
    else if (diacriticsMenu) {
      var rect = focused.getBoundingClientRect();
      hideDiacritics();
      newFocus(document.elementFromPoint(rect.left, rect.top));

      lastLeft = rect.left + (focused.offsetWidth / 2);
      return moveKeyFocus(dir);
    }
  }

  /**
   * Performs the action of the key that has pseudo-focus
   */
  function doKeyAction() {
    var
      txt, sp,
      k = focused,

    // Intl 402 locale-sensitive uppercasing, probably not much support yet
      tuc = 'toLocaleUpperCase' in String.prototype ? 'toLocaleUpperCase' : 'toUpperCase';

    // Look through special keys first
    if (sp = spKeys[k.id.slice(4)])
      return sp(k);

    else {
      // If symbols are activated, use the data-symbol attribute
      txt = k.dataset[sym ? 'symbol' : 'text'] || k.dataset.text;

      if (!txt)
        return;

      // Uppercase if shift or caps
      if (shift || caps)
        txt = txt[tuc]();

      // Reset shift after one key press
      if (shift) {
        shift = false;
        imeCtr.classList.remove('shift-toggle');
      }

      var a = document.activeElement;

      // If the <input> type supports selection, this is easy
      if (supportAnySel || regSupportSel.test(a.type)) {
        var ss = a.selectionStart;

        // Set the new value to pre-caret + new + post-caret
        a.value = a.value.slice(0, ss) + txt + a.value.slice(a.selectionEnd);

        // Put the caret where it should be
        a.selectionStart = a.selectionEnd = ss + txt.length;
      }

      // For <input> types number, email, date, et al
      else {
        var len, pre, post,

        // Get current selection
          s = window.getSelection();

        // Delete any existing contents
        s.deleteFromDocument();

        // Keep moving selection backward until the length stops increasing
        do {
          len = String(s).length;
          s.modify('extend', 'backward', 'line');
        }
        while (String(s).length !== len);

        // Store the selection, then delete it
        pre = String(s);
        s.deleteFromDocument();

        // Keep moving selection forward until the length stops increasing
        do {
          len = String(s).length;
          s.modify('extend', 'forward', 'line');
        }
        while (String(s).length !== len);

        // Store the selection, then delete it
        post = String(s);
        s.deleteFromDocument();

        // Setting attribute works around a bug in Blink/WebKit
        a.setAttribute('value', a.defaultValue);

        // Recreate the contents with the new text added
        a.value = pre + txt + post;

        // Move the selection to after the new text
        a.select();
        s = window.getSelection();
        s.collapseToEnd();

        // Move the caret to the correct location
        while (len-- > 0)
          s.modify('move', 'backward', 'character');
      }
    }
  }

  /**
   * Prevents an event's default action and bubble
   */
  function swallowEvt(evt) {
    evt.preventDefault();
    evt.stopPropagation();
  }

  /**
   * Submits the current form if there is one and hides the IME
   */
  function submit() {
    if (document.activeElement.form)
      document.activeElement.form.submit();

    hideIME();
    var $body = angular.element(document.body);
    var $rootScope = $body.scope().$root;
    $rootScope.$broadcast('hideIME');
  }

  /**
   * Shows diacritical variatins of the selected character
   */
  function showDiacritics() {
    var menu, fRect, cRect, rRect, w,
      dia = inputMode.verbatim.diacritics[focused && focused.dataset.text];

    if (!focused || !dia)
      return;

    // Reuse if diacratics menu already exists
    if (!(menu = imeCtr.querySelector('.lime-diacritics-row'))) {
      menu = document.createElement('menu');
      menu.className = 'lime-key-row lime-diacritics-row';
    }

    // Dim the main keys and highlight the base key
    imeCtr.classList.add('lime-container-dim');
    focused.classList.add('lime-toggle');

    // Get some rectangles to work out positioning
    cRect = imeCtr.getBoundingClientRect();
    fRect = focused.getBoundingClientRect();
    rRect = focused.parentNode.lastChild.getBoundingClientRect();

    menu.innerHTML = '';

    // Add a <li> element for each diacritical character
    Array.prototype.forEach.call(dia, function (char) {
      var li = menu.appendChild(document.createElement('li'));

      li.className = 'lime-key lime-diacritical';
      li.dataset.text = char;
    });

    // Add to container
    imeCtr.appendChild(menu);
    diacriticsMenu = menu;

    // Set the position of the keys
    w = menu.offsetWidth;
    menu.style.left = menu.style.right = '';

    // Align to right-side of base key unless it will overlap row edge
    if (fRect.right + w <= rRect.right)
      menu.style.left = fRect.right - cRect.left + 'px';
    else
      menu.style.right = cRect.right - fRect.left + 'px';

    menu.style.top = fRect.top - cRect.top + 'px';

    // Set width on a timer to allow for CSS transitions
    menu.style.width = 0;
    window.setTimeout(function () {
      menu.style.width = w + 'px';
    });
  }

  /**
   * Hides the diacritics menu
   */
  function hideDiacritics() {
    if (!diacriticsMenu)
      return;

    // Remove the diacritics menu
    diacriticsMenu.parentNode.removeChild(diacriticsMenu);
    imeCtr.classList.remove('lime-container-dim');

    // Refocus the non-diacritical version of the character
    newFocus(imeCtr.querySelector('.lime-toggle[data-text]'));
    focused.classList.remove('lime-toggle');

    // Reset lastLeft, in case the user moved through the diacritics
    lastLeft = focused.getBoundingClientRect().left;
    diacriticsMenu = null;
  }

  /**
   * Selects next element in tabbing order
   */
  function tabNext() {
    var next, i,
      a = document.activeElement,

    // Get element list as a real array so we can sort it
      n = Array.prototype.slice.call((a.form || document).getElementsByTagName('*'));

    // Filter out untabables
    n = n.filter(function (a) {
      return a.tabIndex > -1 && a.offsetHeight && !a.disabled;
    });

    // Sort by tab order
    n.sort(function (a, b) {
      // Use Number.MAX_VALUE instead of 0 to sort to end
      return (a.tabIndex || Number.MAX_VALUE) - (b.tabIndex || Number.MAX_VALUE);
    });

    // Reorder and remove active so next element is first
    i = n.indexOf(a);
    n = n.slice(i + 1).concat(n.slice(0, i));
    i = 0;

    while (document.activeElement != next && n.length) {
      // Find the element following the currently focused element
      next = n.shift();
      next.focus();
    }
  }

  /**
   * Triggers a custom event on the active element
   */
  function dispatchCustomEvent(type) {
    var evt;

    // DOM4 constructor
    if (evtConstructors)
      evt = new CustomEvent(type, {bubbles: true, cancelable: true});

    // Older method
    else {
      evt = document.createEvent('CustomEvent');
      evt.initCustomEvent(type, true, true);
    }

    return document.activeElement.dispatchEvent(evt);
  }

  /**
   * Checks an element can receive text input and returns a boolean accordingly
   */
  function isInput(el) {
    var // Regex to match inputs needing the IME
      allowed = /^(?:text|email|number|password|tel|url|search)$/;

    return (allowed.test(el.type) || el.isContentEditable) && !el.readOnly;
  }

  /**
   * Automatically shows the IME on focus if settings permit
   */
  document.addEventListener('focus', function (evt) {
    var tag = evt.target.tagName;

    if (!exports.config.noauto && (evt.target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA'))
      showIME();
  }, true);

  /**
   * Automatically shows the IME on focus if settings permit
   */
  document.addEventListener('blur', function () {
    if (visible && !exports.config.noauto)
      hideIME();
  }, true);


  /**
   * Handles mousedown on the keys, prevents input losing focus
   */
  imeCtr.addEventListener('mousedown', function (evt) {
    swallowEvt(evt);

    if (!evt.target.classList.contains('lime-key'))
      return;

    holdTimer = setTimeout(showDiacritics, exports.config.keyHoldTimeout || 500);
  }, true);

  /**
   * Mouseup is similar to on keyup for Enter key
   */
  imeCtr.addEventListener('mouseup', function (evt) {
    swallowEvt(evt);

    if (!evt.target.classList.contains('lime-key'))
      return;

    clearTimeout(holdTimer);
    holdTimer = null;
    doKeyAction();

    if (diacriticsMenu)
      hideDiacritics();
  }, true);

  /**
   * Move key focus for the mouse too
   */
  imeCtr.addEventListener('mousemove', function (evt) {
    newFocus(evt.target);
  });

  /**
   * Remove focus on mouseout (mostly for the container)
   */
  imeCtr.addEventListener('mouseout', function (evt) {
    if (focused === evt.target)
      focused.classList.remove('lime-focus');
  });

  /**
   * Event.key mini-polyfill
   * Adds a getter to key events that maps to a few key spec strings
   */
  (function () {
    var map = {
        13: 'Enter',
        27: 'Escape',

        37: 'ArrowLeft',
        38: 'ArrowUp',
        39: 'ArrowRight',
        40: 'ArrowDown',
      },
      prop = {
        get: function () {
          var code = this.which;

          return map[code] || 'Unidentified';
        }
      };

    // Map for Samsung TV remote
    if (typeof keyCodes != 'undefined') {
      map[keyCodes.VK_RETURN] = 'BrowserBack';
      map[keyCodes.VK_ENTER] = 'Enter';
      map[keyCodes.VK_UP] = 'ArrowUp';
      map[keyCodes.VK_DOWN] = 'ArrowDown';
      map[keyCodes.VK_LEFT] = 'ArrowLeft';
      map[keyCodes.VK_RIGHT] = 'ArrowRight';
    }

    // LG TV remote (and possibly others)
    else if (global.KeyEvent && global.KeyEvent.VK_ENTER) {
      map[global.KeyEvent.VK_BACK] = 'BrowserBack';
      map[global.KeyEvent.VK_ENTER] = 'Enter';
    }

    if (global.KeyboardEvent && !global.KeyboardEvent.prototype.hasOwnProperty('key'))
      Object.defineProperty(global.KeyboardEvent.prototype, 'key', prop);

    if (global.KeyEvent && global.KeyEvent.prototype && !global.KeyEvent.prototype.hasOwnProperty('key'))
      Object.defineProperty(global.KeyEvent.prototype, 'key', prop);

  })(global);

// Create the IME HTML
  initKeys("en", "ltr");

// Export a few functions
  exports.show = showIME;
  exports.hide = hideIME;
  exports.doKeyAction = doKeyAction;
  exports.moveKeyFocus = moveKeyFocus;
  exports.initKeys = initKeys;
  return exports;

});
