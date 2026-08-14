/* ---------------------------------------------------------------------------
   Sales by Customer Location — offline dashboard.

   Everything renders locally: the basemap is a bundled set of simplified
   province polygons drawn to a canvas in Web Mercator, so the page never issues
   a network request and works straight from a file:// path.
   --------------------------------------------------------------------------- */
(function () {
  "use strict";

  var MAP = window.THAILAND_MAP;
  var DATA = window.SALES_DATA;

  var REGIONS = DATA.regionOrder;                     // fixed north-to-south order
  var REGION_VAR = {                                  // region -> CSS custom property
    North: "--region-north",
    Northeast: "--region-northeast",
    Central: "--region-central",
    South: "--region-south",
    Unmapped: "--region-unmapped"
  };

  var EARTH_CIRCUMFERENCE = 40075016.686;             // metres at the equator

  // -------------------------------------------------------------------------
  // formatting
  // -------------------------------------------------------------------------
  var nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  var nf2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function baht(v) { return "฿" + nf0.format(Math.round(v)); }
  function bahtExact(v) { return "฿" + nf2.format(v); }

  function compact(v) {
    var sign = v < 0 ? "-" : "";
    var a = Math.abs(v);
    if (a >= 1e9) return sign + "฿" + (a / 1e9).toFixed(2) + "B";
    if (a >= 1e6) return sign + "฿" + (a / 1e6).toFixed(1) + "M";
    if (a >= 1e3) return sign + "฿" + (a / 1e3).toFixed(0) + "K";
    return sign + "฿" + nf0.format(a);
  }

  function pct(part, whole) {
    if (!whole) return "0.0%";
    return (part / whole * 100).toFixed(1) + "%";
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function regionColor(region) {
    return cssVar(REGION_VAR[region] || "--region-unmapped");
  }

  function el(id) { return document.getElementById(id); }

  // -------------------------------------------------------------------------
  // state
  // -------------------------------------------------------------------------
  // Periods baked in by tools/build_data.py, oldest first, plus anything the
  // user has loaded through Re-Load Data (see the "loading" section). A period
  // is whatever one export covers — a single month or a whole year.
  var PERIODS = (DATA.periods || []).slice();
  var ALL_PERIODS = "__all__";
  var STORE_KEY = "salesmap.loadedPeriods.v1";

  var state = {
    period: PERIODS.length ? PERIODS[PERIODS.length - 1].period : "",
    activeRegions: new Set(REGIONS),
    query: "",
    includeUnmapped: true,
    selectedId: null,
    sortKey: "amt",
    sortDir: -1
  };

  /* Sum one customer across every period, keyed by ID. Identity fields come
     from the most recent period the customer appears in, so a renamed or
     relocated customer shows its latest details. */
  function combineAllPeriods() {
    var mapped = {}, unmapped = {};

    // A whole-year period and that year's own months would double-count each
    // other, so when both are loaded the months win — they are the finer grain.
    var yearsWithMonths = {};
    PERIODS.forEach(function (p) {
      if (/^\d{4}-\d{2}$/.test(p.period)) yearsWithMonths[p.period.slice(0, 4)] = true;
    });
    var parts = PERIODS.filter(function (p) {
      return !(/^\d{4}$/.test(p.period) && yearsWithMonths[p.period]);
    });
    var dropped = PERIODS.length - parts.length;

    parts.forEach(function (p) {
      p.customers.forEach(function (c) {
        var t = mapped[c.id];
        if (!t) { mapped[c.id] = t = copyRow(c); t.amt = 0; t.qty = 0; }
        else { t.name = c.name; t.prov = c.prov; t.region = c.region; t.group = c.group; t.lat = c.lat; t.lng = c.lng; t.wx = c.wx; t.wy = c.wy; }
        t.amt += c.amt; t.qty += c.qty; t.periods = (t.periods || 0) + 1;
      });
      p.unmapped.forEach(function (u) {
        var t = unmapped[u.id];
        if (!t) { unmapped[u.id] = t = copyRow(u); t.amt = 0; t.qty = 0; }
        else { t.name = u.name; t.group = u.group; }
        t.amt += u.amt; t.qty += u.qty; t.periods = (t.periods || 0) + 1;
      });
    });
    return {
      period: ALL_PERIODS,
      label: parts.length
        ? "All periods (" + parts[0].label + " – " + parts[parts.length - 1].label + ")"
        : "All periods",
      shortLabel: "All periods",
      source: parts.length + " periods",
      parts: parts.length,
      dropped: dropped,
      customers: Object.keys(mapped).map(function (k) { return mapped[k]; }),
      unmapped: Object.keys(unmapped).map(function (k) { return unmapped[k]; })
    };
  }

  function copyRow(row) {
    var out = {};
    for (var k in row) if (Object.prototype.hasOwnProperty.call(row, k)) out[k] = row[k];
    return out;
  }

  var COMBINED = null;                                // built lazily, then cached

  /** The dataset the whole dashboard currently reads from. */
  function currentPeriod() {
    if (state.period === ALL_PERIODS) {
      if (!COMBINED) COMBINED = combineAllPeriods();
      return COMBINED;
    }
    for (var i = 0; i < PERIODS.length; i++) {
      if (PERIODS[i].period === state.period) return PERIODS[i];
    }
    return PERIODS[PERIODS.length - 1];
  }

  var CUR = null;                                     // set by selectPeriod()
  var TOTALS = null;
  var MAX_AMOUNT = 0;

  function computeTotals() {
    var byRegion = {};
    REGIONS.forEach(function (r) { byRegion[r] = { amount: 0, qty: 0, count: 0 }; });
    CUR.customers.forEach(function (c) {
      var b = byRegion[c.region];
      b.amount += c.amt; b.qty += c.qty; b.count += 1;
    });
    var unmapped = { amount: 0, qty: 0, count: CUR.unmapped.length };
    CUR.unmapped.forEach(function (u) { unmapped.amount += u.amt; unmapped.qty += u.qty; });
    var mapped = REGIONS.reduce(function (s, r) { return s + byRegion[r].amount; }, 0);
    TOTALS = {
      byRegion: byRegion,
      unmapped: unmapped,
      mapped: mapped,
      grand: mapped + unmapped.amount,
      customers: CUR.customers.length + CUR.unmapped.length
    };
  }

  /* Pin sizes are scaled within the selected period, so its biggest customer
     always reads as the biggest pin. */
  function selectPeriod(periodId) {
    state.period = periodId;
    CUR = currentPeriod();
    computeTotals();
    MAX_AMOUNT = CUR.customers.reduce(function (m, c) {
      return Math.max(m, Math.abs(c.amt));
    }, 0);
    syncPeriodLabels();
  }

  function matchesQuery(row) {
    if (!state.query) return true;
    var q = state.query;
    return (row.name || "").toLowerCase().indexOf(q) !== -1 ||
      String(row.id).indexOf(q) !== -1 ||
      (row.prov || "").toLowerCase().indexOf(q) !== -1 ||
      (DATA.provinceTh[row.prov] || "").indexOf(state.rawQuery || q) !== -1 ||
      (row.group || "").toLowerCase().indexOf(q) !== -1;
  }

  /** Customers currently drawn on the map (period + region chips + search). */
  function visibleCustomers() {
    return CUR.customers.filter(function (c) {
      return state.activeRegions.has(c.region) && matchesQuery(c);
    });
  }

  function visibleUnmapped() {
    if (!state.includeUnmapped) return [];
    return CUR.unmapped.filter(matchesQuery);
  }

  // =========================================================================
  // MAP
  // =========================================================================
  var canvas = el("map");
  var ctx = canvas.getContext("2d");
  var stage = el("mapStage");
  var tip = el("mapTip");

  /* Web Mercator into a unit square: x,y both in [0,1]. */
  function projX(lng) { return (lng + 180) / 360; }
  function projY(lat) {
    var s = Math.sin(lat * Math.PI / 180);
    return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  }

  /* Pre-project the basemap once — the render loop only translates and scales. */
  var LAND = MAP.provinces.map(function (p) {
    return {
      name: p.name,
      polys: p.polys.map(function (poly) {
        return poly.map(function (ring) {
          var out = new Float64Array(ring.length * 2);
          for (var i = 0; i < ring.length; i++) {
            out[i * 2] = projX(ring[i][0]);
            out[i * 2 + 1] = projY(ring[i][1]);
          }
          return out;
        });
      })
    };
  });

  var BOUNDS = (function () {
    var b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    LAND.forEach(function (p) {
      p.polys.forEach(function (poly) {
        var ring = poly[0];
        for (var i = 0; i < ring.length; i += 2) {
          if (ring[i] < b.x0) b.x0 = ring[i];
          if (ring[i] > b.x1) b.x1 = ring[i];
          if (ring[i + 1] < b.y0) b.y0 = ring[i + 1];
          if (ring[i + 1] > b.y1) b.y1 = ring[i + 1];
        }
      });
    });
    return b;
  }());

  function projectPeriod(p) {
    p.customers.forEach(function (c) {
      c.wx = projX(c.lng);
      c.wy = projY(c.lat);
    });
    return p;
  }
  PERIODS.forEach(projectPeriod);

  var R_MIN = 4, R_MAX = 30;

  /* Area-proportional: radius follows the square root, so a pin twice as wide
     really is four times the sales amount. */
  function radiusFor(amount) {
    var a = Math.abs(amount);
    if (!MAX_AMOUNT) return R_MIN;
    return R_MIN + (R_MAX - R_MIN) * Math.sqrt(a / MAX_AMOUNT);
  }

  var view = { scale: 1, cx: 0.5, cy: 0.5 };
  var size = { w: 1, h: 1, dpr: 1 };
  var drawn = [];                                     // hit-test list, draw order

  function fitView() {
    var padded = 0.985;                               // land nearly to the edges
    var bw = BOUNDS.x1 - BOUNDS.x0;
    var bh = BOUNDS.y1 - BOUNDS.y0;
    view.scale = Math.min(size.w / bw, size.h / bh) * padded;
    view.cx = (BOUNDS.x0 + BOUNDS.x1) / 2;
    view.cy = (BOUNDS.y0 + BOUNDS.y1) / 2;
  }

  function toScreenX(wx) { return (wx - view.cx) * view.scale + size.w / 2; }
  function toScreenY(wy) { return (wy - view.cy) * view.scale + size.h / 2; }

  function resize() {
    var rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    var hadView = size.w > 1;
    var prevW = size.w, prevH = size.h;

    size.dpr = Math.min(window.devicePixelRatio || 1, 2);
    size.w = rect.width;
    size.h = rect.height;
    canvas.width = Math.round(size.w * size.dpr);
    canvas.height = Math.round(size.h * size.dpr);
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);

    if (!hadView) fitView();
    else view.scale *= Math.min(size.w / prevW, size.h / prevH);

    drawMap();
  }

  function zoomAt(px, py, factor) {
    var minScale = Math.min(size.w / (BOUNDS.x1 - BOUNDS.x0), size.h / (BOUNDS.y1 - BOUNDS.y0)) * 0.6;
    var next = Math.max(minScale, Math.min(view.scale * factor, minScale * 900));
    if (next === view.scale) return;
    // Keep the world point under the cursor pinned to the cursor.
    var wx = (px - size.w / 2) / view.scale + view.cx;
    var wy = (py - size.h / 2) / view.scale + view.cy;
    view.scale = next;
    view.cx = wx - (px - size.w / 2) / view.scale;
    view.cy = wy - (py - size.h / 2) / view.scale;
    drawMap();
  }

  function drawMap() {
    var surface = cssVar("--surface-1");
    var land = cssVar("--land");
    var landStroke = cssVar("--land-stroke");
    var sea = cssVar("--sea");
    var ink = cssVar("--text-primary");

    ctx.clearRect(0, 0, size.w, size.h);
    ctx.fillStyle = sea;
    ctx.fillRect(0, 0, size.w, size.h);

    // --- land ------------------------------------------------------------
    ctx.beginPath();
    for (var i = 0; i < LAND.length; i++) {
      var polys = LAND[i].polys;
      for (var j = 0; j < polys.length; j++) {
        var rings = polys[j];
        for (var k = 0; k < rings.length; k++) {
          var ring = rings[k];
          ctx.moveTo(toScreenX(ring[0]), toScreenY(ring[1]));
          for (var m = 2; m < ring.length; m += 2) {
            ctx.lineTo(toScreenX(ring[m]), toScreenY(ring[m + 1]));
          }
          ctx.closePath();
        }
      }
    }
    ctx.fillStyle = land;
    ctx.fill("evenodd");
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = landStroke;
    ctx.stroke();

    // --- pins -------------------------------------------------------------
    // Largest first so the small ones stay visible (and clickable) on top.
    var pins = visibleCustomers().slice().sort(function (a, b) {
      return Math.abs(b.amt) - Math.abs(a.amt);
    });
    drawn = [];

    for (var p = 0; p < pins.length; p++) {
      var c = pins[p];
      var x = toScreenX(c.wx), y = toScreenY(c.wy);
      var r = radiusFor(c.amt);
      if (x < -r || y < -r || x > size.w + r || y > size.h + r) continue;

      var color = regionColor(c.region);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);

      if (c.amt < 0) {
        // A credit/return, not a sale — hollow so it cannot be misread as volume.
        ctx.setLineDash([3, 2]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = color;
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.globalAlpha = 0.78;
        ctx.fillStyle = color;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1.6;                          // surface ring separates overlaps
        ctx.strokeStyle = surface;
        ctx.stroke();
      }

      if (c.id === state.selectedId) {
        ctx.beginPath();
        ctx.arc(x, y, r + 3.5, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = ink;
        ctx.stroke();
      }

      drawn.push({ c: c, x: x, y: y, r: r });
    }

    updateScaleBar();
  }

  function updateScaleBar() {
    var latRad = (function () {
      var y = view.cy;
      return Math.atan(Math.sinh(Math.PI * (1 - 2 * y)));
    }());
    var metresPerPx = EARTH_CIRCUMFERENCE * Math.cos(latRad) / view.scale;
    var target = metresPerPx * 54;                    // bar is 54px wide
    var nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];
    var km = target / 1000;
    var pick = nice.reduce(function (best, v) {
      return Math.abs(v - km) < Math.abs(best - km) ? v : best;
    }, nice[0]);
    var label = pick >= 1 ? pick + " km" : Math.round(target) + " m";
    el("mapScaleLabel").textContent = label;
    document.querySelector(".map-scale-bar").style.width =
      Math.round(pick * 1000 / metresPerPx) + "px";
  }

  function hitTest(px, py) {
    for (var i = drawn.length - 1; i >= 0; i--) {
      var d = drawn[i];
      var dx = px - d.x, dy = py - d.y;
      // A generous target: never smaller than a comfortable 9px tap radius.
      var reach = Math.max(d.r, 9);
      if (dx * dx + dy * dy <= reach * reach) return d.c;
    }
    return null;
  }

  function showTip(c, px, py) {
    tip.hidden = false;
    tip.style.setProperty("--tip-color", regionColor(c.region));
    tip.innerHTML =
      "<b>" + escapeHtml(c.name || ("Customer " + c.id)) + "</b>" +
      "<dl>" +
      "<dt>Sales</dt><dd class=\"" + (c.amt < 0 ? "neg" : "") + "\">" + bahtExact(c.amt) + "</dd>" +
      "<dt>Qty</dt><dd>" + nf0.format(c.qty) + "</dd>" +
      "<dt>Province</dt><dd>" + escapeHtml(c.prov) + " / " + escapeHtml(DATA.provinceTh[c.prov] || "") + "</dd>" +
      "<dt>Region</dt><dd><span class=\"tip-region\">" + escapeHtml(c.region) + "</span></dd>" +
      "<dt>Group</dt><dd>" + (c.group ? escapeHtml(c.group) : "—") + "</dd>" +
      (state.period === ALL_PERIODS
        ? "<dt>Periods</dt><dd>" + c.periods + " of " + (CUR.parts || PERIODS.length) + "</dd>" : "") +
      "<dt>ID</dt><dd>" + c.id + "</dd>" +
      "</dl>";

    var box = tip.getBoundingClientRect();
    var x = px + 14, y = py + 14;
    if (x + box.width > size.w - 6) x = px - box.width - 14;
    if (y + box.height > size.h - 6) y = py - box.height - 14;
    tip.style.left = Math.max(6, x) + "px";
    tip.style.top = Math.max(6, y) + "px";
  }

  function hideTip() { tip.hidden = true; }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  // --- map events ----------------------------------------------------------
  var drag = null;

  canvas.addEventListener("pointerdown", function (e) {
    canvas.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy, moved: false };
    canvas.classList.add("dragging");
  });

  canvas.addEventListener("pointermove", function (e) {
    var rect = canvas.getBoundingClientRect();
    var px = e.clientX - rect.left, py = e.clientY - rect.top;

    if (drag) {
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;
      view.cx = drag.cx - dx / view.scale;
      view.cy = drag.cy - dy / view.scale;
      hideTip();
      drawMap();
      return;
    }

    var hit = hitTest(px, py);
    if (hit) showTip(hit, px, py); else hideTip();
  });

  function endDrag(e) {
    if (!drag) return;
    var wasClick = !drag.moved;
    drag = null;
    canvas.classList.remove("dragging");
    if (wasClick) {
      var rect = canvas.getBoundingClientRect();
      var hit = hitTest(e.clientX - rect.left, e.clientY - rect.top);
      state.selectedId = hit ? hit.id : null;
      drawMap();
      renderTable();
      if (hit) {
        var row = document.querySelector('tr[data-id="' + hit.id + '"]');
        if (row) row.scrollIntoView({ block: "nearest" });
      }
    }
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", function () { drag = null; canvas.classList.remove("dragging"); });
  canvas.addEventListener("pointerleave", hideTip);

  canvas.addEventListener("wheel", function (e) {
    e.preventDefault();
    var rect = canvas.getBoundingClientRect();
    zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.pow(0.999, e.deltaY));
  }, { passive: false });

  el("zoomIn").addEventListener("click", function () { zoomAt(size.w / 2, size.h / 2, 1.5); });
  el("zoomOut").addEventListener("click", function () { zoomAt(size.w / 2, size.h / 2, 1 / 1.5); });
  el("zoomReset").addEventListener("click", function () { fitView(); drawMap(); });

  // =========================================================================
  // SIZE LEGEND
  // =========================================================================
  function renderSizeLegend() {
    var svg = el("sizeLegend");
    var steps = [MAX_AMOUNT, MAX_AMOUNT / 10, MAX_AMOUNT / 100];
    var baseY = 70;                                   // circles share a bottom edge
    var cx = 34;
    var parts = [];
    steps.forEach(function (v) {
      var r = radiusFor(v);
      var cy = baseY - r;
      parts.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + r.toFixed(1) + '"/>');
      parts.push('<line x1="' + cx + '" y1="' + (cy - r) + '" x2="' + (cx + R_MAX + 12) +
        '" y2="' + (cy - r) + '" stroke="' + cssVar("--gridline") + '"/>');
      parts.push('<text x="' + (cx + R_MAX + 16) + '" y="' + (cy - r + 3.5) + '">' + compact(v) + "</text>");
    });
    svg.innerHTML = parts.join("");
  }

  // =========================================================================
  // BAR CHART — sales amount by region
  // =========================================================================
  var barTip = document.createElement("div");
  barTip.className = "map-tip floating";
  barTip.hidden = true;
  document.body.appendChild(barTip);

  function renderBars() {
    var svg = el("barChart");
    var width = svg.clientWidth || svg.parentNode.clientWidth || 420;

    var rows = REGIONS.map(function (r) {
      return {
        key: r,
        label: r,
        sub: DATA.regionTh[r],
        value: TOTALS.byRegion[r].amount,
        count: TOTALS.byRegion[r].count,
        qty: TOTALS.byRegion[r].qty,
        color: regionColor(r),
        active: state.activeRegions.has(r),
        kind: "region"
      };
    }).sort(function (a, b) { return b.value - a.value; });

    var unmappedRow = {
      key: "Unmapped",
      label: "No coordinates",
      sub: DATA.regionTh.Unmapped,
      value: TOTALS.unmapped.amount,
      count: TOTALS.unmapped.count,
      qty: TOTALS.unmapped.qty,
      color: cssVar("--region-unmapped"),
      active: state.includeUnmapped,
      kind: "unmapped"
    };

    var all = rows.concat([unmappedRow]);
    var max = all.reduce(function (m, r) { return Math.max(m, r.value); }, 0) || 1;

    var padL = 0, padR = 0;
    var rowH = 42, gap = 6, dividerGap = 20;
    var plotW = width - padL - padR;
    var y = 4;
    var parts = [];

    all.forEach(function (r, i) {
      if (r.kind === "unmapped") {
        y += dividerGap - gap;
        parts.push('<line class="divider" x1="0" y1="' + (y - 10) + '" x2="' + width + '" y2="' + (y - 10) + '"/>');
      }

      var barW = Math.max(2, (r.value / max) * plotW);
      var labelY = y + 12;
      var barY = y + 20;
      var barH = 11;

      parts.push(
        '<g class="bar-row" data-key="' + r.key + '" data-kind="' + r.kind +
        '" data-active="' + r.active + '" tabindex="0" role="button" aria-label="' +
        escapeHtml(r.label + ": " + bahtExact(r.value) + ", " + pct(r.value, TOTALS.grand) + " of total") + '">' +
        '<rect x="0" y="' + y + '" width="' + width + '" height="' + (rowH - 2) + '" fill="transparent"/>' +
        '<text class="bar-label" x="0" y="' + labelY + '">' + escapeHtml(r.label) +
        '<tspan class="bar-sub" dx="8">' + escapeHtml(r.sub) + '</tspan></text>' +
        '<text class="bar-value" x="' + width + '" y="' + labelY + '" text-anchor="end">' +
        compact(r.value) + '<tspan class="bar-sub" dx="6">' + pct(r.value, TOTALS.grand) + '</tspan></text>' +
        '<rect class="bar-shape" x="0" y="' + barY + '" width="' + barW + '" height="' + barH +
        '" rx="4" fill="' + r.color + '"/>' +
        '<line class="baseline" x1="0" y1="' + barY + '" x2="0" y2="' + (barY + barH) + '"/>' +
        '</g>'
      );

      y += rowH + gap;
    });

    svg.setAttribute("viewBox", "0 0 " + width + " " + y);
    svg.setAttribute("height", y);
    svg.innerHTML = parts.join("");

    Array.prototype.forEach.call(svg.querySelectorAll(".bar-row"), function (g) {
      var key = g.getAttribute("data-key");
      var row = all.filter(function (r) { return r.key === key; })[0];

      g.addEventListener("click", function () { toggleSeries(row); });
      g.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSeries(row); }
      });
      g.addEventListener("mousemove", function (e) { showBarTip(row, e); });
      g.addEventListener("mouseleave", function () { barTip.hidden = true; });
      g.addEventListener("blur", function () { barTip.hidden = true; });
    });

    el("barFoot").innerHTML =
      "Grand total <strong>" + bahtExact(TOTALS.grand) + "</strong> across " +
      nf0.format(TOTALS.customers) + " customers. Click a bar to filter the map and table.";
  }

  // =========================================================================
  // TOP PROVINCES — same encoding, finer grain
  // =========================================================================
  function renderProvinces() {
    var svg = el("provChart");
    var width = svg.clientWidth || svg.parentNode.clientWidth || 420;

    var byProv = {};
    visibleCustomers().forEach(function (c) {
      var b = byProv[c.prov] || (byProv[c.prov] = { amount: 0, qty: 0, count: 0, region: c.region });
      b.amount += c.amt; b.qty += c.qty; b.count += 1;
    });

    var ranked = Object.keys(byProv).map(function (name) {
      var b = byProv[name];
      return {
        key: name,
        label: name,
        sub: DATA.provinceTh[name] || "",
        value: b.amount,
        count: b.count,
        qty: b.qty,
        color: regionColor(b.region),
        region: b.region
      };
    }).sort(function (a, b) { return b.value - a.value; });

    var shown = ranked.slice(0, 10);
    var plottedTotal = ranked.reduce(function (s, r) { return s + r.value; }, 0);
    var max = shown.length ? shown[0].value : 1;

    var rowH = 32, labelH = 13, barH = 8;
    var y = 4;
    var parts = [];

    shown.forEach(function (r) {
      var barW = Math.max(2, (Math.max(r.value, 0) / max) * width);
      parts.push(
        '<g class="bar-row" tabindex="0" role="img" aria-label="' +
        escapeHtml(r.label + ": " + bahtExact(r.value) + ", " + r.count + " customers") + '">' +
        '<rect x="0" y="' + y + '" width="' + width + '" height="' + (rowH - 2) + '" fill="transparent"/>' +
        '<text class="bar-label bar-label-sm" x="0" y="' + (y + labelH) + '">' + escapeHtml(r.label) +
        '<tspan class="bar-sub" dx="7">' + escapeHtml(r.sub) + '</tspan></text>' +
        '<text class="bar-value bar-value-sm" x="' + width + '" y="' + (y + labelH) + '" text-anchor="end">' +
        compact(r.value) + '</text>' +
        '<rect class="bar-shape" x="0" y="' + (y + labelH + 5) + '" width="' + barW +
        '" height="' + barH + '" rx="4" fill="' + r.color + '"/>' +
        '</g>'
      );
      y += rowH;
    });

    if (!shown.length) {
      parts.push('<text class="axis-tick" x="0" y="18">No customers match the current filters.</text>');
      y = 30;
    }

    svg.setAttribute("viewBox", "0 0 " + width + " " + y);
    svg.setAttribute("height", y);
    svg.innerHTML = parts.join("");

    Array.prototype.forEach.call(svg.querySelectorAll(".bar-row"), function (g, i) {
      var row = shown[i];
      g.addEventListener("mousemove", function (e) { showBarTip(row, e, plottedTotal); });
      g.addEventListener("mouseleave", function () { barTip.hidden = true; });
      g.addEventListener("click", function () {
        el("searchBox").value = row.label;
        state.rawQuery = row.label;
        state.query = row.label.toLowerCase();
        barTip.hidden = true;
        renderAll();
      });
    });

    var top10 = shown.reduce(function (s, r) { return s + r.value; }, 0);
    el("provFoot").innerHTML = shown.length
      ? "Top " + shown.length + " of <strong>" + ranked.length + "</strong> provinces hold <strong>" +
        pct(top10, plottedTotal) + "</strong> of plotted sales. Click a row to filter by province."
      : "Nothing to rank under the current filters.";
  }

  function showBarTip(row, e, denominator) {
    var whole = denominator || TOTALS.grand;
    barTip.hidden = false;
    barTip.style.setProperty("--tip-color", row.color);
    barTip.innerHTML =
      "<b>" + escapeHtml(row.label) + (row.sub ? " · " + escapeHtml(row.sub) : "") + "</b>" +
      "<dl>" +
      "<dt>Sales</dt><dd>" + bahtExact(row.value) + "</dd>" +
      "<dt>Share</dt><dd>" + pct(row.value, whole) + "</dd>" +
      "<dt>Customers</dt><dd>" + nf0.format(row.count) + "</dd>" +
      "<dt>Qty</dt><dd>" + nf0.format(row.qty) + "</dd>" +
      "<dt>Avg / cust</dt><dd>" + baht(row.count ? row.value / row.count : 0) + "</dd>" +
      "</dl>";
    var box = barTip.getBoundingClientRect();
    var x = e.clientX + 14, y = e.clientY + 14;
    if (x + box.width > window.innerWidth - 8) x = e.clientX - box.width - 14;
    if (y + box.height > window.innerHeight - 8) y = e.clientY - box.height - 14;
    barTip.style.left = Math.max(8, x) + "px";
    barTip.style.top = Math.max(8, y) + "px";
  }

  function toggleSeries(row) {
    if (row.kind === "unmapped") {
      state.includeUnmapped = !state.includeUnmapped;
      el("includeUnmapped").checked = state.includeUnmapped;
    } else if (state.activeRegions.has(row.key)) {
      state.activeRegions.delete(row.key);
    } else {
      state.activeRegions.add(row.key);
    }
    barTip.hidden = true;
    renderAll();
  }

  // =========================================================================
  // FILTER CHIPS + LEGEND
  // =========================================================================
  function renderChips() {
    var box = el("regionChips");
    box.innerHTML = REGIONS.map(function (r) {
      return '<button class="chip" type="button" data-region="' + r + '" aria-pressed="' +
        state.activeRegions.has(r) + '" style="--chip-color:' + regionColor(r) + '">' +
        '<span class="swatch"></span>' + r +
        '<span class="chip-val">' + compact(TOTALS.byRegion[r].amount) + '</span></button>';
    }).join("");

    Array.prototype.forEach.call(box.querySelectorAll(".chip"), function (btn) {
      btn.addEventListener("click", function () {
        var r = btn.getAttribute("data-region");
        if (state.activeRegions.has(r)) state.activeRegions.delete(r);
        else state.activeRegions.add(r);
        renderAll();
      });
    });
  }

  function renderLegend() {
    var pins = visibleCustomers();
    var counts = {};
    REGIONS.forEach(function (r) { counts[r] = 0; });
    pins.forEach(function (c) { counts[c.region] += 1; });

    el("regionLegend").innerHTML = REGIONS.map(function (r) {
      return '<span class="legend-item"><span class="swatch" style="background:' + regionColor(r) +
        '"></span>' + r + ' <span class="legend-val">' + nf0.format(counts[r]) + ' pins</span></span>';
    }).join("") +
      '<span class="legend-item"><span class="swatch" style="background:transparent;border:1.5px dashed ' +
      cssVar("--text-muted") + '"></span>Negative amount <span class="legend-val">credit / return</span></span>';
  }

  // =========================================================================
  // KPIs
  // =========================================================================
  function renderKpis() {
    var pins = visibleCustomers();
    var un = visibleUnmapped();
    var pinAmt = pins.reduce(function (s, c) { return s + c.amt; }, 0);
    var unAmt = un.reduce(function (s, c) { return s + c.amt; }, 0);
    var shown = pinAmt + unAmt;

    var unfiltered = pins.length + un.length === TOTALS.customers;
    el("kpiTotal").textContent = compact(shown);
    el("kpiTotalNote").textContent = unfiltered
      ? "All " + nf0.format(TOTALS.customers) + " customers in the period"
      : pct(shown, TOTALS.grand) + " of " + compact(TOTALS.grand) + " grand total";

    el("kpiMapped").textContent = compact(pinAmt);
    el("kpiMappedNote").textContent = nf0.format(pins.length) + " pins · " +
      pct(pinAmt, TOTALS.grand) + " of grand total";

    el("kpiCustomers").textContent = nf0.format(pins.length + un.length);
    el("kpiCustomersNote").textContent = "of " + nf0.format(TOTALS.customers) + " in the period";

    el("kpiUnmapped").textContent = compact(TOTALS.unmapped.amount);
    el("kpiUnmappedNote").textContent = nf0.format(TOTALS.unmapped.count) + " customers · " +
      pct(TOTALS.unmapped.amount, TOTALS.grand) + " of sales cannot be plotted";
  }

  // =========================================================================
  // TABLE
  // =========================================================================
  function tableRows() {
    var rows = visibleCustomers().map(function (c) {
      return { id: c.id, name: c.name, prov: c.prov, region: c.region, group: c.group, amt: c.amt, qty: c.qty, geo: true };
    });
    visibleUnmapped().forEach(function (u) {
      rows.push({ id: u.id, name: u.name, prov: "", region: "Unmapped", group: u.group, amt: u.amt, qty: u.qty, geo: false });
    });

    var key = state.sortKey, dir = state.sortDir;
    rows.sort(function (a, b) {
      var av = a[key], bv = b[key];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "en") * dir;
    });
    return rows;
  }

  function renderTable() {
    var rows = tableRows();
    var body = el("tableBody");
    var total = rows.reduce(function (s, r) { return s + r.amt; }, 0);

    body.innerHTML = rows.map(function (r) {
      return '<tr data-id="' + r.id + '" class="' + (r.geo ? "" : "no-geo ") +
        (r.id === state.selectedId ? "is-selected" : "") + '">' +
        '<td class="cust" title="' + escapeHtml(r.name) + '">' + escapeHtml(r.name || ("Customer " + r.id)) + '</td>' +
        '<td>' + (r.prov ? escapeHtml(r.prov) : '<span class="tag-nogeo">no coordinates</span>') + '</td>' +
        '<td><span class="region-cell" style="--cell-color:' + regionColor(r.region) + '">' +
        escapeHtml(r.region) + '</span></td>' +
        '<td>' + (r.group ? escapeHtml(r.group) : "—") + '</td>' +
        '<td class="num' + (r.amt < 0 ? " neg" : "") + '">' + nf2.format(r.amt) + '</td>' +
        '<td class="num">' + nf0.format(r.qty) + '</td>' +
        '</tr>';
    }).join("");

    Array.prototype.forEach.call(body.querySelectorAll("tr"), function (tr) {
      tr.addEventListener("click", function () {
        var id = Number(tr.getAttribute("data-id"));
        state.selectedId = state.selectedId === id ? null : id;
        var c = CUR.customers.filter(function (x) { return x.id === id; })[0];
        if (c && state.selectedId) {
          view.cx = c.wx; view.cy = c.wy;
          if (view.scale < 2200) view.scale = 2200;
        }
        drawMap();
        renderTable();
      });
    });

    el("tableSub").textContent =
      "Every customer behind the map and the bar chart — the readable fallback for the colour coding.";
    el("tableFoot").innerHTML =
      "Showing <strong>" + nf0.format(rows.length) + "</strong> customers · " +
      "sales amount " + bahtExact(total) + ". Click a row to locate it on the map.";
  }

  Array.prototype.forEach.call(document.querySelectorAll("#dataTable th[data-sort]"), function (th) {
    th.addEventListener("click", function () {
      var key = th.getAttribute("data-sort");
      if (state.sortKey === key) state.sortDir *= -1;
      else { state.sortKey = key; state.sortDir = (key === "amt" || key === "qty") ? -1 : 1; }
      Array.prototype.forEach.call(document.querySelectorAll("#dataTable th[data-sort]"), function (o) {
        o.removeAttribute("aria-sort");
      });
      th.setAttribute("aria-sort", state.sortDir === 1 ? "ascending" : "descending");
      renderTable();
    });
  });

  // =========================================================================
  // wiring
  // =========================================================================
  var searchTimer = null;
  el("searchBox").addEventListener("input", function (e) {
    clearTimeout(searchTimer);
    var raw = e.target.value.trim();
    searchTimer = setTimeout(function () {
      state.rawQuery = raw;
      state.query = raw.toLowerCase();
      renderAll();
    }, 120);
  });

  el("includeUnmapped").addEventListener("change", function (e) {
    state.includeUnmapped = e.target.checked;
    renderAll();
  });

  el("resetFilters").addEventListener("click", function () {
    state.activeRegions = new Set(REGIONS);
    state.query = ""; state.rawQuery = "";
    state.includeUnmapped = true;
    state.selectedId = null;
    el("searchBox").value = "";
    el("includeUnmapped").checked = true;
    fitView();
    renderAll();
  });

  // --- theme ---------------------------------------------------------------
  var themeBtn = el("themeToggle");
  function currentTheme() {
    var stamped = document.documentElement.getAttribute("data-theme");
    if (stamped === "dark" || stamped === "light") return stamped;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function syncThemeLabel() {
    themeBtn.querySelector("[data-theme-label]").textContent =
      currentTheme() === "dark" ? "Light" : "Dark";
  }
  themeBtn.addEventListener("click", function () {
    document.documentElement.setAttribute("data-theme", currentTheme() === "dark" ? "light" : "dark");
    syncThemeLabel();
    renderAll();
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
    if (!document.documentElement.getAttribute("data-theme")) { syncThemeLabel(); renderAll(); }
  });

  function renderAll() {
    renderChips();
    renderKpis();
    renderLegend();
    renderBars();
    renderProvinces();
    renderSizeLegend();
    renderTable();
    drawMap();
  }

  // --- period ---------------------------------------------------------------
  // Periods come from the filenames in source/, so a new export needs no code
  // change: it simply appears as another option here.
  function renderPeriodSelect() {
    if (!PERIODS.length) return;
    var sel = el("periodSelect");
    el("periodGroup").hidden = false;

    // Newest first — that is the one people reach for. "All periods" only
    // means something once a second export has been added to source/.
    sel.innerHTML = PERIODS.slice().reverse().map(function (p) {
      return '<option value="' + p.period + '">' + escapeHtml(p.label) + "</option>";
    }).join("") + (PERIODS.length > 1
      ? '<option value="' + ALL_PERIODS + '">All periods (' +
        escapeHtml(PERIODS[0].label) + " – " +
        escapeHtml(PERIODS[PERIODS.length - 1].label) + ")</option>"
      : "");
    sel.value = state.period;
  }

  // Bound once — renderPeriodSelect() re-runs whenever periods are loaded, and
  // rebinding there would stack a listener per load.
  el("periodSelect").addEventListener("change", function (e) {
    selectPeriod(e.target.value);
    state.selectedId = null;
    fitView();
    renderAll();
  });

  /** Period text that appears outside the charts. */
  function syncPeriodLabels() {
    var label = CUR.shortLabel || CUR.label || "";
    el("periodLabel").textContent = label;
    el("sourceName").textContent = CUR.source || "";
    if (label) document.title = "Sales by Customer Location — " + label;
    var scope = PERIODS.length > 1 ? (CUR.label || "the period") : (label || "the period");
    el("barsSub").textContent = "Total across all customers in " + scope + "." +
      (CUR.dropped ? " The whole-year total is left out here, so its own months are" +
        " not counted twice." : "");
    var sel = el("periodSelect");
    if (sel && sel.value !== state.period) sel.value = state.period;
  }

  // =========================================================================
  // LOADING EXCEL IN THE PAGE
  // Reads .xlsx files straight from the file picker or a drag-and-drop, so a
  // new export can be added without running the Python script. Loaded periods
  // are kept in localStorage and come back on the next open.
  // =========================================================================
  function statusMessage(html, tone) {
    var box = el("loadStatus");
    box.hidden = false;
    box.setAttribute("data-tone", tone || "info");
    box.innerHTML = html;
  }

  function storedPeriods() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  /** Persist loaded periods. Returns null on success, or a reason string. */
  function persist(periods) {
    // On a served page the `source` folder is re-read on every open, so a
    // stored copy would only ever be a staler duplicate of it.
    if (window.SourceFolder.overHttp) return null;
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(periods.map(function (p) {
        return {
          period: p.period, label: p.label, source: p.source,
          customers: p.customers.map(function (c) {
            return { id: c.id, name: c.name, group: c.group, lat: c.lat, lng: c.lng,
              amt: c.amt, qty: c.qty, prov: c.prov, region: c.region };
          }),
          unmapped: p.unmapped
        };
      })));
      return null;
    } catch (e) {
      return e && e.name === "QuotaExceededError"
        ? "the browser's storage is full"
        : "this browser blocked local storage";
    }
  }

  /** Merge periods in, replacing any existing one with the same key. */
  function registerPeriods(incoming) {
    incoming.forEach(function (p) {
      projectPeriod(p);
      var at = -1;
      for (var i = 0; i < PERIODS.length; i++) {
        if (PERIODS[i].period === p.period) { at = i; break; }
      }
      if (at >= 0) PERIODS[at] = p; else PERIODS.push(p);
    });
    PERIODS.sort(function (a, b) { return a.period < b.period ? -1 : a.period > b.period ? 1 : 0; });
    COMBINED = null;                                  // combined view is stale
  }

  function loadedOnly() {
    return PERIODS.filter(function (p) { return p.loaded; });
  }

  async function handleFiles(fileList, fromFolder, extraNote) {
    var files = Array.prototype.slice.call(fileList || []).filter(function (f) {
      return /\.xlsx$/i.test(f.name);
    });
    if (!files.length) {
      statusMessage("No <b>.xlsx</b> files in that selection. " +
        "Pick the QlikView export, not a .xls or .csv.", "error");
      return;
    }

    el("loadBtn").disabled = true;
    statusMessage("Reading " + files.length + " file" + (files.length > 1 ? "s" : "") + "…", "info");

    var added = [], failed = [];
    for (var i = 0; i < files.length; i++) {
      try {
        var sheet = await window.XlsxReader.readFirstSheet(files[i]);
        // A sheet with a month column yields one period per month.
        window.SalesIngest.toPeriods(sheet, files[i].name).forEach(function (period) {
          period.loaded = true;
          added.push(period);
        });
      } catch (err) {
        failed.push(files[i].name + " — " + (err && err.message ? err.message : String(err)));
      }
    }

    el("loadBtn").disabled = false;

    if (added.length) {
      registerPeriods(added);
      var newest = added.reduce(function (a, b) { return a.period > b.period ? a : b; });
      selectPeriod(newest.period);
      state.selectedId = null;
      renderPeriodSelect();
      fitView();
      renderAll();
    }

    var lines = added.map(function (p) {
      var total = p.customers.reduce(function (s, c) { return s + c.amt; }, 0) +
        p.unmapped.reduce(function (s, c) { return s + c.amt; }, 0);
      return "Loaded <b>" + escapeHtml(p.label) + "</b> — " +
        nf0.format(p.customers.length + p.unmapped.length) + " customers, " +
        bahtExact(total) + " total, " + nf0.format(p.unmapped.length) +
        " without coordinates.";
    });

    if (added.length) {
      var why = persist(loadedOnly());
      if (why) {
        lines.push("Kept for this session only — " + why + ".");
      }
      el("clearBtn").hidden = false;
      if (fromFolder) {
        lines.unshift("Re-loaded " + added.length + " period" +
          (added.length > 1 ? "s" : "") + " from <b>" + escapeHtml(fromFolder) + "</b>:");
      }
    }
    failed.forEach(function (f) { lines.push("Could not read " + escapeHtml(f)); });

    statusMessage(lines.join("\n") + (extraNote || ""),
      failed.length || extraNote ? (added.length ? "warn" : "error") : "ok");
  }

  // --- Re-Load Data ---------------------------------------------------------
  // Always the fixed `source` folder beside the page, always files named
  // Qlikview_Sales_by_Customer_Location_*.xlsx. Served over http(s) that needs
  // no interaction at all; from a file:// page the folder has to be granted
  // once, because a browser will not let a script read an ungranted path.
  var SF = window.SourceFolder;
  var fileHandles = null;

  function namePattern() {
    return "<b>" + SF.prefix + "YYYY.xlsx</b>";
  }

  function reportUndated(names) {
    if (!names || !names.length) return "";
    return "\nSkipped (no year or month in the name): " + escapeHtml(names.join(", "));
  }

  /** Read `source/` over http(s) — no dialog, nothing to grant. */
  async function reloadOverHttp(quiet) {
    if (!quiet) statusMessage("Reading " + namePattern() + "…", "info");
    var files;
    try {
      files = await SF.fetchAll();
    } catch (err) {
      statusMessage("Could not read the <b>" + SF.dir + "</b> folder — " +
        escapeHtml(err && err.message ? err.message : String(err)), "error");
      return;
    }
    if (!files.length) {
      if (!quiet) {
        statusMessage("No exports found. Put them in the <b>" + SF.dir +
          "</b> folder next to this page, named " + namePattern() + ".", "warn");
      } else {
        el("loadStatus").hidden = true;
      }
      return;
    }
    await handleFiles(files, SF.dir);
  }

  async function reloadData() {
    if (SF.overHttp) { await reloadOverHttp(false); return; }
    // A workbook already chosen re-reads silently; otherwise ask which one.
    if (fileHandles && await loadFromHandles(fileHandles, true)) return;
    if (!fileHandles) await chooseFile();
  }

  function serveHint() {
    return "For loading with nothing to choose, run <b>start-dashboard.bat</b> " +
      "(Windows) or <b>start-dashboard.sh</b> (Mac/Linux) from the sales-map " +
      "folder — served that way the page reads <b>" + SF.dir +
      "/</b> by itself.";
  }

  /** Open the file picker and load whatever is chosen. */
  async function chooseFile() {
    if (!SF.canPick) { el("fileInput").click(); return; }   // Firefox / Safari

    var handles;
    try {
      handles = await SF.pickFiles();
    } catch (err) {
      if (err && err.name === "AbortError") {
        statusMessage("Nothing chosen. Pick <b>" + escapeHtml(SF.suggested) +
          "</b> — or any " + namePattern() + ".\n" + serveHint(), "info");
      } else {
        // Should not happen for a file the user pointed at, but never dead-end.
        statusMessage("The file picker could not open — " +
          escapeHtml(err && err.message ? err.message : String(err)) +
          "\nFalling back to the basic picker.", "warn");
        el("fileInput").click();
      }
      return;
    }
    if (!handles || !handles.length) return;

    fileHandles = handles;
    await SF.remember(handles);
    await loadFromHandles(handles, true);
  }

  /** Re-read the remembered workbook(s) — no dialog once one has been chosen. */
  async function loadFromHandles(handles, interactive) {
    var files;
    try {
      files = await SF.readRemembered(handles, interactive);
    } catch (err) {
      statusMessage("Could not re-read the chosen file — " +
        escapeHtml(err && err.message ? err.message : String(err)) +
        "\nIt may have been moved or renamed; choose it again.", "error");
      return false;
    }
    if (!files) {
      if (interactive) {
        statusMessage("The browser would not re-open the chosen file. " +
          "Choose it again with <b>Choose File…</b>", "error");
      }
      return false;
    }
    await handleFiles(files, files.length === 1 ? files[0].name : files.length + " files");
    return true;
  }

  el("loadBtn").addEventListener("click", function () { reloadData(); });
  el("chooseBtn").addEventListener("click", function () { chooseFile(); });

  el("fileInput").addEventListener("change", function (e) {
    handleFiles(e.target.files);
    e.target.value = "";                              // allow reloading the same file
  });

  // Load on open, without anything to choose.
  if (SF.overHttp) {
    // Served: the page can read `source/` on its own.
    reloadOverHttp(true);
  } else if (SF.canPick) {
    SF.recall().then(async function (handles) {
      if (!handles || !handles.length) return;
      fileHandles = handles;
      // Only when the browser kept permission on the chosen file — asking
      // would need a click, and a prompt on page open is the wrong greeting.
      if (await SF.readRemembered(handles, false)) await loadFromHandles(handles, false);
    });
  }

  // Pick the period before anything reads CUR / TOTALS / MAX_AMOUNT.
  selectPeriod(state.period);
  renderPeriodSelect();

  new ResizeObserver(function () { resize(); renderBars(); renderProvinces(); }).observe(stage);
  window.addEventListener("resize", function () { renderBars(); renderProvinces(); });

  syncThemeLabel();
  resize();
  renderAll();
}());
