/* =========================================================================
   511 SALON — main.js
   ES module ตัวเดียว ไม่มี dependency · ทุกอย่างเป็น progressive enhancement
   ปิด JS แล้วหน้าเว็บต้องยังอ่านครบและกดจองได้
   ========================================================================= */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- 1. แถบนำทาง -------------------------------------------------- */
function initNav() {
  const nav = $('.nav');
  const list = $('.navlinks');
  const toggle = $('.navtoggle');
  if (!nav) return;

  const onScroll = () => nav.classList.toggle('is-stuck', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (!toggle || !list) return;
  const setOpen = (open) => {
    list.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', () => setOpen(!list.classList.contains('is-open')));
  list.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
}

/* ---------- 2. เนื้อหาจางเข้าเมื่อเลื่อนถึง ------------------------------- */
function initReveal() {
  const items = $$('.reveal');
  if (calm || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      io.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.15 });
  items.forEach((el) => io.observe(el));
}

/* ---------- 3. ตัวเลขนับขึ้น --------------------------------------------- */
function initCounters() {
  const nodes = $$('[data-count]');
  if (!nodes.length) return;
  if (calm || !('IntersectionObserver' in window)) {
    nodes.forEach((el) => { el.textContent = format(el, +el.dataset.count); });
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      run(entry.target);
      io.unobserve(entry.target);
    });
  }, { threshold: 0.6 });
  nodes.forEach((el) => io.observe(el));

  function format(el, value) {
    const text = value.toLocaleString('th-TH');
    return (el.dataset.prefix || '') + text;
  }
  function run(el) {
    const target = +el.dataset.count;
    const dur = 900;
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = format(el, Math.round(target * eased));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

/* ---------- 4. การ์ดเลื่อนแนวนอน ----------------------------------------- */
function initRail() {
  $$('[data-rail]').forEach((rail) => {
    const wrap = rail.closest('section');
    const prev = $('[data-rail-prev]', wrap);
    const next = $('[data-rail-next]', wrap);
    if (!prev || !next) return;

    const page = () => rail.clientWidth * 0.8;
    const sync = () => {
      const max = rail.scrollWidth - rail.clientWidth - 2;
      prev.disabled = rail.scrollLeft <= 2;
      next.disabled = rail.scrollLeft >= max;
    };
    prev.addEventListener('click', () => rail.scrollBy({ left: -page(), behavior: calm ? 'auto' : 'smooth' }));
    next.addEventListener('click', () => rail.scrollBy({ left: page(), behavior: calm ? 'auto' : 'smooth' }));
    rail.addEventListener('scroll', sync, { passive: true });
    addEventListener('resize', sync, { passive: true });
    sync();
  });
}

/* ---------- 5. สไลเดอร์เทียบ ก่อน–หลัง ------------------------------------ */
function initCompare() {
  const box = $('[data-compare]');
  if (!box) return;
  const range = $('.cmp-range', box);
  const beforeImg = $('.before img', box);
  const afterImg = $('.after img', box);
  const note = $('[data-compare-note]');

  const setPos = (pct) => {
    const v = Math.max(0, Math.min(100, pct));
    box.style.setProperty('--pos', v + '%');
    if (range && +range.value !== Math.round(v)) range.value = Math.round(v);
  };
  const fromEvent = (e) => {
    const r = box.getBoundingClientRect();
    setPos(((e.clientX - r.left) / r.width) * 100);
  };

  let dragging = false;
  box.addEventListener('pointerdown', (e) => {
    if (e.target === range) return;      // ปล่อยให้ input จัดการเอง
    dragging = true;
    box.setPointerCapture(e.pointerId);
    fromEvent(e);
  });
  box.addEventListener('pointermove', (e) => { if (dragging) fromEvent(e); });
  const stop = () => { dragging = false; };
  box.addEventListener('pointerup', stop);
  box.addEventListener('pointercancel', stop);
  if (range) range.addEventListener('input', () => setPos(+range.value));

  /* สลับเคสด้วยแท็บ */
  const tabs = $$('[data-case]');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
      const d = tab.dataset;
      beforeImg.src = d.before;
      afterImg.src = d.after;
      beforeImg.alt = d.altBefore;
      afterImg.alt = d.altAfter;
      if (note) {
        $('h3', note).textContent = d.title;
        $('p', note).textContent = d.desc;
        $('[data-fill-service]', note).textContent = d.service;
        $('[data-fill-time]', note).textContent = d.time;
        $('[data-fill-price]', note).textContent = d.price;
      }
      setPos(50);
    });
  });
  setPos(50);
}

/* ---------- 6. ตัวกรองผลงาน ---------------------------------------------- */
function initFilters() {
  const bar = $('[data-filters]');
  if (!bar) return;
  const items = $$('[data-tags]');
  const count = $('[data-filter-count]');

  bar.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const tag = chip.dataset.filter;
    $$('.chip', bar).forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    let shown = 0;
    items.forEach((el) => {
      const match = tag === 'all' || el.dataset.tags.split(' ').includes(tag);
      el.hidden = !match;
      if (match) shown += 1;
    });
    if (count) count.textContent = shown;
  });
}

/* ---------- 7. แถบจองตรึงล่างบนมือถือ ------------------------------------ */
function initBookbar() {
  const bar = $('.bookbar');
  const hero = $('.hero');
  if (!bar || !hero || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(
    ([entry]) => bar.classList.toggle('is-on', !entry.isIntersecting),
    { threshold: 0 }
  );
  io.observe(hero);
}

/* ---------- 8. ส่งอีเวนต์เข้า GA4 ---------------------------------------- */
/* ทุกปุ่มที่มี data-ev="click_line" จะยิงอีเวนต์ชื่อนั้นเมื่อถูกกด
   ถ้ายังไม่ได้ติดตั้ง GA4 บรรทัดนี้จะไม่ทำอะไรและไม่พัง */
function initTracking() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-ev]');
    if (!el) return;
    const push = window.gtag;
    if (typeof push === 'function') {
      push('event', el.dataset.ev, { link_url: el.getAttribute('href') || '', location: el.dataset.evWhere || '' });
    }
  });
}

/* ---------- เริ่มทำงาน --------------------------------------------------- */
initNav();
initReveal();
initCounters();
initRail();
initCompare();
initFilters();
initBookbar();
initTracking();
