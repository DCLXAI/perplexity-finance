/* Returns every floating element whose box intersects visible body text.
   Paste into the browser console (or javascript_tool) on any route.

   Two properties earlier drafts of this check lacked, both found by review:
   - Text carriers are walked structurally (any leaf element under `main` with
     non-empty text), not matched against a fixed tag allowlist. A hardcoded
     `p, h1, h2, h3, li, td` list missed `<span class="mkt-sum-title">` rows
     entirely, so the very first version of this check reported `overlaps: 0`
     on a page where the AskBar visibly covered a market-summary row.
   - Each text element's rect is intersected with every ancestor that clips
     overflow before comparing it to a float's box. Without that, an element
     scrolled out of view inside its own internally-scrolling ancestor (e.g.
     .app-main) still has a non-empty getBoundingClientRect() and reads as a
     false-positive "overlap" even though nothing is actually rendered there. */
(() => {
  const floats = [...document.querySelectorAll('body *')].filter((el) => {
    const p = getComputedStyle(el).position;
    return (p === 'fixed' || p === 'sticky') && el.offsetHeight > 24;
  });
  const textEls = [...document.querySelectorAll('main *')].filter((el) => {
    if (el.children.length > 0) return false; // leaf-level text carriers only
    return (el.textContent || '').trim().length > 0;
  });
  function visibleRect(el) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    const rect = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    let node = el.parentElement;
    while (node && node !== document.documentElement) {
      const cs = getComputedStyle(node);
      const clipsY = cs.overflowY !== 'visible';
      const clipsX = cs.overflowX !== 'visible';
      if (clipsY || clipsX) {
        const a = node.getBoundingClientRect();
        if (clipsY) {
          rect.top = Math.max(rect.top, a.top);
          rect.bottom = Math.min(rect.bottom, a.bottom);
        }
        if (clipsX) {
          rect.left = Math.max(rect.left, a.left);
          rect.right = Math.min(rect.right, a.right);
        }
        if (rect.left >= rect.right || rect.top >= rect.bottom) return null;
      }
      node = node.parentElement;
    }
    return rect;
  }
  const hits = [];
  for (const f of floats) {
    const a = f.getBoundingClientRect();
    if (a.height === 0) continue;
    for (const t of textEls) {
      const b = visibleRect(t);
      if (!b) continue;
      const overlap = !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
      if (overlap) hits.push({ float: f.className || f.tagName, covers: (t.textContent || '').trim().slice(0, 40) });
    }
  }
  // One example per distinct float, not just the first 5 hits — a page can have
  // an unrelated repeat offender (e.g. a sticky table header) that would
  // otherwise fill the whole sample and bury a real AskBar overlap under it.
  const sample = [];
  const seenFloats = new Set();
  for (const hit of hits) {
    if (seenFloats.has(hit.float)) continue;
    seenFloats.add(hit.float);
    sample.push(hit);
    if (sample.length >= 5) break;
  }
  return JSON.stringify({ overlaps: hits.length, sample }, null, 1);
})();
