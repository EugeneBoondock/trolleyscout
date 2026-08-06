/// The page-side half of Mr Scout's shopping agent.
///
/// Every script returns a JSON string so the Dart side never has to guess at a
/// half-typed value coming back through the WebView bridge. They all share one
/// prelude because real storefronts hide their controls in three places at
/// once: the light DOM, shadow roots (Takealot, Woolworths) and same-origin
/// iframes (some checkout widgets). A selector that only reads
/// `document.querySelectorAll` finds the button on the demo site and nothing on
/// the shop the shopper actually uses.
library;

/// Shared helpers injected ahead of every agent script.
const String _prelude = r'''
const TS_MARK = '__trolleyScoutAgent';
const deepRoots = (root, seen) => {
  seen.push(root);
  const walker = root.querySelectorAll ? root.querySelectorAll('*') : [];
  for (const node of walker) {
    if (node.shadowRoot) deepRoots(node.shadowRoot, seen);
  }
  if (root === document) {
    for (const frame of document.querySelectorAll('iframe')) {
      try {
        const inner = frame.contentDocument;
        if (inner) deepRoots(inner, seen);
      } catch (_) {
        // Cross-origin frame: not ours to read, and not an error.
      }
    }
  }
  return seen;
};
const deepAll = (selector) => {
  const out = [];
  for (const root of deepRoots(document, [])) {
    try {
      out.push(...root.querySelectorAll(selector));
    } catch (_) {}
  }
  return out;
};
const visible = (node) => {
  if (!node || !node.getBoundingClientRect) return false;
  const style = window.getComputedStyle(node);
  if (!style || style.visibility === 'hidden' || style.display === 'none' ||
      Number(style.opacity) === 0) return false;
  const rect = node.getBoundingClientRect();
  return rect.width > 2 && rect.height > 2;
};
const textOf = (node) => [
  node.innerText,
  node.getAttribute && node.getAttribute('aria-label'),
  node.getAttribute && node.getAttribute('title'),
  node.getAttribute && node.getAttribute('data-testid'),
  node.value,
].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().toLowerCase();
const disabled = (node) => Boolean(
  node.disabled ||
  node.getAttribute('aria-disabled') === 'true' ||
  /\bdisabled\b/.test(node.className || '')
);
const pageText = () => (document.body ? document.body.innerText : '')
  .replace(/\s+/g, ' ').toLowerCase();
const numberIn = (value) => {
  const match = String(value || '').match(/\d+/);
  return match ? Number(match[0]) : null;
};

// "Size: 6" is the shop telling you what is selected, not an option you can
// pick. Treating it as one makes an agent re-choose the size it just rejected.
const optionLabel = (value) => String(value || '')
  .replace(/^[^:]{0,12}:\s*/, '')
  .replace(/\s+/g, ' ')
  .trim();
const isSelectionReadout = (node) => /:/.test((node.innerText || '').trim());
const sameOption = (left, right) =>
  optionLabel(left).toLowerCase() === optionLabel(right).toLowerCase();

// How many things are in the shop's own cart, or null when the shop does not
// say. Anchored on the cart LINK rather than on class-name soup: matching
// `[class*=cart] [class*=count]` reads "add-to-cart-block > review-count" and
// reports a product's review tally as the basket size.
// Some shops only refresh their badge when the cart drawer opens, so the
// badge can read 0 while the item is genuinely in the cart. Where the shop
// publishes its cart as JSON, ask it. The request is fired in the background
// and read on a later poll, because the WebView bridge can only hand back a
// value that is ready synchronously.
const cartEndpointCount = () => {
  const probe = window.__tsCartProbe || (window.__tsCartProbe = {
    count: null, at: 0, running: false,
  });
  const now = Date.now();
  if (!probe.running && now - probe.at > 1200) {
    probe.running = true;
    probe.at = now;
    const endpoints = ['/cart.js', '/cart.json'];
    Promise.all(endpoints.map((path) =>
      fetch(path, { credentials: 'include', headers: { accept: 'application/json' } })
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null)))
      .then((bodies) => {
        for (const body of bodies) {
          if (!body) continue;
          const value = typeof body.item_count === 'number'
            ? body.item_count
            : Array.isArray(body.items) ? body.items.length : null;
          if (value !== null) { probe.count = value; break; }
        }
      })
      .finally(() => { probe.running = false; });
  }
  return probe.count;
};


// Whether the shop itself says we are signed in.
//
// Text signals fail on an icon-only header: Mr Price's home page contains no
// "sign in", no "sign out" and no greeting, so reading the DOM can only ever
// answer "signed out" there. Asking the shop for an account-only page and
// seeing whether it answers or bounces us to a login is the signal that
// survives a header with no words in it.
//
// Fired in the background and read on a later poll, because the WebView
// bridge can only return a value that is already resolved.
const accountProbe = (path) => {
  if (!path) return null;
  const probe = window.__tsAccountProbe || (window.__tsAccountProbe = {
    signedIn: null, at: 0, running: false,
  });
  const now = Date.now();
  if (!probe.running && now - probe.at > 4000) {
    probe.running = true;
    probe.at = now;
    fetch(path, { credentials: 'include', redirect: 'follow' })
      .then((response) => {
        const landed = String(response.url || '');
        // A shop that wants a login either redirects there or refuses.
        const bounced = /login|signin|sign-in|auth/i.test(landed) ||
          response.status === 401 || response.status === 403;
        probe.signedIn = response.ok && !bounced;
      })
      .catch(() => { probe.signedIn = null; })
      .finally(() => { probe.running = false; });
  }
  return probe.signedIn;
};

const cartCount = () => {
  const fromEndpoint = cartEndpointCount();
  if (fromEndpoint !== null) return fromEndpoint;
  const scopes = deepAll(
    'a[href*="cart" i], a[href*="basket" i], a[href*="trolley" i], ' +
    '[data-testid*="cart" i], [aria-label*="cart" i], [aria-label*="basket" i], ' +
    '[aria-label*="trolley" i], [aria-label*="order" i], [data-testid*="basket" i]')
    .filter((node) => visible(node))
    .filter((node) => !/\b(add|remove|wishlist|update|view all)\b/.test(textOf(node)));
  const smallNumber = /^\(?\s*(\d{1,3})\s*\)?$/;
  for (const scope of scopes) {
    const aria = scope.getAttribute ? scope.getAttribute('aria-label') : null;
    if (aria && /cart|basket|trolley/i.test(aria)) {
      const value = numberIn(aria);
      if (value !== null && value < 999) return value;
    }
    const own = (scope.innerText || '').trim();
    const ownMatch = own.match(smallNumber);
    if (ownMatch) return Number(ownMatch[1]);
    for (const badge of scope.querySelectorAll('*')) {
      const className = String(badge.className || '');
      // Ratings, review tallies and prices live in the same corner of the DOM.
      if (/review|rating|price|star/i.test(className)) continue;
      const text = (badge.innerText || '').trim();
      const match = text.match(smallNumber);
      if (match) return Number(match[1]);
    }
  }
  return null;
};
''';

/// Adds/removes the on-page highlight the shopper watches the agent work
/// through. Drawn as an absolutely positioned box rather than by restyling the
/// target, so nothing on the store's own page is mutated.
const String _highlight = r'''
const clearHighlight = () => {
  for (const node of document.querySelectorAll('.' + TS_MARK + 'Box')) node.remove();
};
const highlight = (node, label) => {
  clearHighlight();
  if (!node || !node.getBoundingClientRect) return;
  const rect = node.getBoundingClientRect();
  const box = document.createElement('div');
  box.className = TS_MARK + 'Box';
  box.setAttribute('aria-hidden', 'true');
  box.style.cssText = [
    'position:fixed',
    'left:' + (rect.left - 4) + 'px',
    'top:' + (rect.top - 4) + 'px',
    'width:' + (rect.width + 8) + 'px',
    'height:' + (rect.height + 8) + 'px',
    'border:3px solid #E4572E',
    'border-radius:10px',
    'box-shadow:0 0 0 9999px rgba(15,15,20,0.28)',
    'pointer-events:none',
    'z-index:2147483646',
    'transition:all .18s ease',
  ].join(';');
  const tag = document.createElement('div');
  tag.textContent = label || 'Mr Scout';
  tag.style.cssText = [
    'position:absolute',
    'left:0',
    'top:-26px',
    'padding:3px 8px',
    'background:#E4572E',
    'color:#fff',
    'font:700 12px system-ui,sans-serif',
    'border-radius:7px',
    'white-space:nowrap',
  ].join(';');
  box.appendChild(tag);
  document.body.appendChild(box);
};
''';

/// Names the script in its own source so a test double — and a devtools
/// breakpoint — can tell which one is running.
String _wrap(String name, String body) =>
    '(() => {/*ts:' + name + '*/' + _prelude + _highlight + body + '})()';

/// Everything the agent needs to decide its next move, in one round trip.
///
/// One call rather than six keeps the agent's view of the page internally
/// consistent: a storefront that re-renders between calls cannot report a
/// signed-in header and a signed-out buy box in the same decision.
String agentPageStateScript({String accountPath = ''}) => _wrap(
    'page-state',
    'const accountPath = ${_jsString(accountPath)};\n' +
        r'''
  const text = pageText();
  const controls = deepAll('button, [role="button"], input[type="submit"], input[type="button"], a');

  const addPattern = /\b(add|put)\b[^.]{0,24}\b(cart|basket|trolley|bag)\b/;
  const addNegative = /wishlist|wish list|save for later|registry|compare|notify|remove|view (cart|basket)/;
  const addControls = controls.filter((node) =>
    visible(node) && addPattern.test(textOf(node)) && !addNegative.test(textOf(node)));
  const liveAdd = addControls.filter((node) => !disabled(node));

  // Signed in: the page offers a way OUT of an account, or greets someone.
  const signOut = controls.filter((node) => visible(node) &&
    /\b(sign out|log ?out)\b/.test(textOf(node)));
  const accountLinks = controls.filter((node) => visible(node) &&
    /\b(my account|account|profile|my profile|my orders)\b/.test(textOf(node)));
  const signIn = controls.filter((node) => visible(node) &&
    /\b(sign in|log ?in|login|register|create account)\b/.test(textOf(node)));
  const greeting = (document.body ? document.body.innerText : '')
    .match(/\b(hi|hello|welcome back|goeie dag),?\s+([A-Z][a-zA-Z]{1,20})\b/);
  // The shop's own answer wins when it gives one: an icon-only header has no
  // words to read, and a stale text guess there is worse than no guess.
  const probed = accountProbe(accountPath);
  const readFromPage = signOut.length > 0 ||
    (accountLinks.length > 0 && signIn.length === 0) || Boolean(greeting);
  const signedIn = probed === null ? readFromPage : (probed || readFromPage);
  const accountLabel = greeting ? greeting[2] : null;

  // A login wall: the page is asking for credentials right now.
  const passwordFields = deepAll('input[type="password"]').filter(visible);
  const onLoginPage = passwordFields.length > 0 ||
    /\/(login|signin|sign-in|account\/login)\b/.test(location.pathname);

  const outOfStock = /\b(out of stock|sold out|currently unavailable|no stock available)\b/.test(text) &&
    liveAdd.length === 0;

  // Variant pickers: a size or colour the shopper has not chosen yet.
  const variantGroups = [];
  const groupNodes = deepAll(
    'select, [role="radiogroup"], [class*="size" i], [class*="variant" i], [class*="swatch" i], [data-testid*="size" i]');
  for (const group of groupNodes) {
    if (!visible(group)) continue;
    if (group.tagName === 'SELECT') {
      const label = textOf(group) || (group.name || '');
      if (!/size|colour|color|variant|option/i.test(label + ' ' + (group.id || ''))) continue;
      const options = [...group.options].filter((o) => o.value)
        .map((o) => ({ label: (o.textContent || '').trim(), available: !o.disabled }));
      if (options.length) {
        variantGroups.push({
          kind: 'select',
          chosen: group.selectedIndex > 0 ? (group.options[group.selectedIndex].textContent || '').trim() : null,
          options,
        });
      }
      continue;
    }
    const buttons = [...group.querySelectorAll('button, [role="radio"], label, li, a')]
      .filter(visible)
      .filter((node) => !isSelectionReadout(node))
      .filter((node) => (node.innerText || '').trim().length > 0 &&
        (node.innerText || '').trim().length <= 12);
    if (buttons.length < 2) continue;
    const chosen = buttons.find((node) =>
      node.getAttribute('aria-checked') === 'true' ||
      node.getAttribute('aria-selected') === 'true' ||
      /\b(selected|active|is-selected|checked)\b/.test(node.className || ''));
    variantGroups.push({
      kind: 'buttons',
      chosen: chosen ? (chosen.innerText || '').trim() : null,
      options: buttons.map((node) => ({
        label: (node.innerText || '').trim(),
        available: !disabled(node) && !/\b(disabled|unavailable|sold-?out)\b/.test(node.className || ''),
      })),
    });
  }
  // Dedupe groups that the selectors matched more than once.
  const seenGroups = new Set();
  const variants = [];
  for (const group of variantGroups) {
    const key = group.options.map((o) => o.label).join('|');
    if (seenGroups.has(key) || !key) continue;
    seenGroups.add(key);
    variants.push(group);
  }
  const needsVariant = variants.some((group) => !group.chosen);

  // Overlays that swallow clicks: cookie bars, newsletter modals, age gates.
  const overlays = deepAll('[role="dialog"], [class*="modal" i], [class*="cookie" i], [id*="cookie" i]')
    .filter((node) => visible(node) && node.getBoundingClientRect().height > 60);

  return JSON.stringify({
    ready: document.readyState === 'complete',
    url: location.href,
    signedIn,
    accountLabel,
    onLoginPage,
    cartCount: cartCount(),
    outOfStock,
    needsVariant,
    variants,
    addControlCount: liveAdd.length,
    blockedAddControl: addControls.length > 0 && liveAdd.length === 0,
    overlayCount: overlays.length,
  });
''');

/// Closes the cookie bars and newsletter modals that otherwise eat the agent's
/// first click. Only ever presses controls that say they dismiss something.
String agentDismissOverlaysScript() => _wrap('dismiss-overlays', r'''
  const accept = /\b(accept|allow|got it|ok|okay|agree|continue|close|dismiss|no thanks|not now|maybe later)\b/;
  const avoid = /\b(reject all|manage|settings|preferences|customi[sz]e)\b/;
  let dismissed = 0;
  const scopes = deepAll('[role="dialog"], [class*="modal" i], [class*="cookie" i], [id*="cookie" i], [class*="popup" i]')
    .filter((node) => visible(node) && node.getBoundingClientRect().height > 60);
  for (const scope of scopes.slice(0, 4)) {
    const buttons = [...scope.querySelectorAll('button, [role="button"], a')]
      .filter((node) => visible(node) && !disabled(node))
      .filter((node) => accept.test(textOf(node)) && !avoid.test(textOf(node)));
    if (buttons.length) {
      buttons[0].click();
      dismissed += 1;
    }
  }
  return JSON.stringify({ status: 'ok', dismissed });
''');

/// Picks a size/colour. `wanted` empty means "take the first one in stock",
/// which is what a shopper asking for "a black tee" expects when they did not
/// name a size.
String agentSelectVariantScript(String wanted,
    {List<String> tried = const []}) {
  final encoded = _jsString(wanted);
  final excluded = _jsString(tried.join(''));
  return _wrap('select-variant', '''
  const wanted = $encoded.trim().toLowerCase();
  // Options already tried and found unbuyable. A shop that lists every size
  // as available until you pick one can only be discovered by picking.
  const tried = $excluded.split('').filter(Boolean)
    .map((value) => optionLabel(value).toLowerCase());
  const untried = (label) =>
    !tried.includes(optionLabel(label).toLowerCase());
  const matches = (label) => {
    const value = String(label || '').trim().toLowerCase();
    if (!wanted) return true;
    return value === wanted || value.replace(/\\s+/g, '') === wanted.replace(/\\s+/g, '');
  };
  const groups = deepAll('select, [role="radiogroup"], [class*="size" i], [class*="variant" i], [class*="swatch" i], [data-testid*="size" i]')
    .filter(visible);
  for (const group of groups) {
    if (group.tagName === 'SELECT') {
      const option = [...group.options].find((o) => o.value && !o.disabled &&
        matches(o.textContent) && untried(o.textContent));
      if (!option) continue;
      group.value = option.value;
      group.dispatchEvent(new Event('input', { bubbles: true }));
      group.dispatchEvent(new Event('change', { bubbles: true }));
      highlight(group, 'Choosing ' + (option.textContent || '').trim());
      return JSON.stringify({ status: 'selected', label: (option.textContent || '').trim() });
    }
    const buttons = [...group.querySelectorAll('button, [role="radio"], label, li, a')]
      .filter(visible)
      .filter((node) => !isSelectionReadout(node))
      .filter((node) => (node.innerText || '').trim().length > 0 &&
        (node.innerText || '').trim().length <= 12);
    const wantedNode = buttons.find((node) => matches(node.innerText) && !disabled(node) &&
      !/\\b(disabled|unavailable|sold-?out)\\b/.test(node.className || ''));
    if (!wantedNode) continue;
    highlight(wantedNode, 'Choosing ' + (wantedNode.innerText || '').trim());
    wantedNode.click();
    return JSON.stringify({ status: 'selected', label: (wantedNode.innerText || '').trim() });
  }
  const anyOffered = groups.length > 0;
  return JSON.stringify({
    status: anyOffered ? 'unavailable' : 'not-found',
    label: wanted || null,
  });
''');
}

/// Presses the shop's own add-to-cart control, highlighting it first so the
/// shopper sees what the agent touched.
String agentAddToCartScript() => _wrap('add-to-cart', r'''
  const exact = ['add to cart', 'add to basket', 'add to trolley', 'add to bag'];
  const positive = /\b(add|put)\b[^.]{0,24}\b(cart|basket|trolley|bag)\b/;
  const negative = /wishlist|wish list|save for later|registry|compare|notify|remove|view (cart|basket)/;
  const candidates = deepAll('button, [role="button"], input[type="submit"], input[type="button"], a')
    .filter((node) => visible(node))
    .map((node) => ({ node, label: textOf(node) }))
    .filter((entry) => positive.test(entry.label) && !negative.test(entry.label));
  const live = candidates.filter((entry) => !disabled(entry.node));
  if (!live.length) {
    return JSON.stringify({
      status: candidates.length ? 'blocked' : 'no-control',
      label: candidates.length ? candidates[0].label : null,
    });
  }
  const scored = live.map((entry) => ({
    ...entry,
    score: (exact.includes(entry.label) ? 7 : 0) +
      (/^(add|put)[^.]*(cart|basket|trolley|bag)$/.test(entry.label) ? 5 : 0) +
      (entry.node.tagName === 'BUTTON' ? 3 : 0),
  })).sort((left, right) => right.score - left.score);
  const target = scored[0];
  target.node.scrollIntoView({ block: 'center' });
  highlight(target.node, 'Adding to cart');
  target.node.click();
  return JSON.stringify({ status: 'clicked', label: target.label });
''');

/// Reads the cart badge on its own, for the before/after comparison that
/// proves the click actually landed.
String agentCartCountScript() => _wrap('cart-count', r'''
  return JSON.stringify({ status: 'ok', count: cartCount() });
''');

/// Picks the product on a search-results page that best answers what the
/// shopper asked for.
///
/// A shop with no deal feed — Uber Eats, Mr D — still stocks the thing. The
/// agent opens the shop's own search and reads the results, rather than
/// telling the shopper the item does not exist.
///
/// Anchors in the chrome (nav, header, footer) are ignored, because "Burgers"
/// in a category strip is not a McFeast. What is left is scored on how much
/// of the phrase it repeats, and a card that shows a price wins ties: a
/// priced tile is a product, an unpriced one is usually a collection.
String agentPickSearchResultScript(String wanted) => _wrap(
    'pick-search-result',
    'const wanted = ${_jsString(wanted)};\n' +
        r"""
  const words = wanted
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2);
  if (words.length === 0) return JSON.stringify({ status: 'none' });

  // A two-word phrase has to match in full: half of "basmati rice" is "rice",
  // which hands back rice cakes to someone who asked for basmati.
  const required = words.length <= 2 ? words.length : Math.ceil(words.length / 2);
  const chrome = /\b(nav|header|footer|menu|breadcrumb)\b/i;
  const hasPrice = /(R\s?\d|\$\s?\d|\d+[.,]\d{2})/;

  const labelOf = (node) => (
    (node.getAttribute('aria-label') || '') + ' ' +
    (node.getAttribute('title') || '') + ' ' +
    (node.textContent || '') + ' ' +
    Array.from(node.querySelectorAll('img'))
      .map((img) => img.getAttribute('alt') || '')
      .join(' ')
  ).replace(/\s+/g, ' ').trim();

  const inChrome = (node) => {
    for (let up = node; up && up !== document.body; up = up.parentElement) {
      const tag = (up.tagName || '').toLowerCase();
      if (tag === 'nav' || tag === 'header' || tag === 'footer') return true;
      const marks = (up.getAttribute('role') || '') + ' ' + (up.className || '');
      if (typeof marks === 'string' && chrome.test(marks)) return true;
    }
    return false;
  };

  let best = null;
  let bestScore = 0;
  for (const node of deepAll('a[href]')) {
    const href = node.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;
    if (inChrome(node)) continue;
    const label = labelOf(node);
    if (label.length < 3) continue;
    const lower = label.toLowerCase();
    let score = words.filter((word) => lower.includes(word)).length;
    if (score < required) continue;
    // A card with a price on it is a product; one without is usually a
    // category or a store tile.
    const card = node.closest('li, article, [data-testid], div') || node;
    if (hasPrice.test(card.textContent || '')) score += 0.5;
    if (score > bestScore) {
      best = { node: node, label: label.slice(0, 120), href: node.href || href };
      bestScore = score;
    }
  }

  if (!best) return JSON.stringify({ status: 'none' });
  best.node.scrollIntoView({ block: 'center' });
  highlight(best.node, 'Opening this one');
  return JSON.stringify({ status: 'found', href: best.href, label: best.label });
""");

/// Wipes the agent's highlight when it stops working, so the shopper gets a
/// clean page back.
String agentClearHighlightScript() => _wrap('clear-highlight', r'''
  clearHighlight();
  return JSON.stringify({ status: 'ok' });
''');

String _jsString(String value) {
  final escaped = value
      .replaceAll(r'\', r'\\')
      .replaceAll("'", r"\'")
      .replaceAll('\n', r'\n')
      .replaceAll('\r', '');
  return "'$escaped'";
}
