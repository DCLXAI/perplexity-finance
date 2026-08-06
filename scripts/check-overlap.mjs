/* Returns every floating element whose box intersects body text.
   Paste into the browser console (or javascript_tool) on any route. */
(() => {
  const floats = [...document.querySelectorAll('body *')].filter((el) => {
    const p = getComputedStyle(el).position;
    return (p === 'fixed' || p === 'sticky') && el.offsetHeight > 24;
  });
  const textNodes = [...document.querySelectorAll('main p, main h1, main h2, main h3, main li, main td')];
  const hits = [];
  for (const f of floats) {
    const a = f.getBoundingClientRect();
    if (a.height === 0) continue;
    for (const t of textNodes) {
      const b = t.getBoundingClientRect();
      if (b.height === 0) continue;
      const overlap = !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
      if (overlap) hits.push({ float: f.className || f.tagName, covers: (t.textContent || '').trim().slice(0, 40) });
    }
  }
  return JSON.stringify({ overlaps: hits.length, sample: hits.slice(0, 5) }, null, 1);
})();
