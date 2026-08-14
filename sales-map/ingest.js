/* ---------------------------------------------------------------------------
   Turn a QlikView "Sales by Customer Location" sheet into a dashboard period.

   This is the browser-side twin of tools/build_data.py: same column handling,
   same point-in-polygon province assignment, same four-region grouping, so a
   month loaded through the Load Excel button matches one baked in by the
   script. The one difference is precision — the page carries the simplified
   boundaries it draws (~450 m tolerance), so a customer sitting within a few
   hundred metres of a provincial border can land on the other side of it. The
   Python build reads the full-resolution boundaries.
   --------------------------------------------------------------------------- */
window.SalesIngest = (function () {
  "use strict";

  var MONTHS = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

  var COLUMNS = [
    { key: "id", header: "store_id" },
    { key: "name", header: "store_name" },
    { key: "lat", header: "lat" },
    { key: "lng", header: "lng" },
    { key: "group", header: "salesgroup" },
    { key: "amt", header: "salesamt" },
    { key: "qty", header: "salesqty" }
  ];

  /* Province shapes with a bounding box each, so the hit test can reject most
     provinces per point without walking their rings. */
  var SHAPES = (window.THAILAND_MAP.provinces || []).map(function (p) {
    var box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    p.polys.forEach(function (poly) {
      poly[0].forEach(function (pt) {
        if (pt[0] < box.x0) box.x0 = pt[0];
        if (pt[0] > box.x1) box.x1 = pt[0];
        if (pt[1] < box.y0) box.y0 = pt[1];
        if (pt[1] > box.y1) box.y1 = pt[1];
      });
    });
    return { name: p.name, region: p.region, polys: p.polys, box: box };
  });

  function pointInRing(x, y, ring) {
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1];
      var xj = ring[j][0], yj = ring[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }

  function pointInPolygon(x, y, poly) {
    if (!pointInRing(x, y, poly[0])) return false;
    for (var h = 1; h < poly.length; h++) {
      if (pointInRing(x, y, poly[h])) return false;   // in a hole
    }
    return true;
  }

  function locate(lng, lat) {
    for (var i = 0; i < SHAPES.length; i++) {
      var s = SHAPES[i];
      if (lng < s.box.x0 || lng > s.box.x1 || lat < s.box.y0 || lat > s.box.y1) continue;
      for (var p = 0; p < s.polys.length; p++) {
        if (pointInPolygon(lng, lat, s.polys[p])) return s;
      }
    }
    return null;
  }

  function nearest(lng, lat) {
    var best = null, bestD = Infinity;
    SHAPES.forEach(function (s) {
      s.polys.forEach(function (poly) {
        poly[0].forEach(function (pt) {
          var d = (pt[0] - lng) * (pt[0] - lng) + (pt[1] - lat) * (pt[1] - lat);
          if (d < bestD) { bestD = d; best = s; }
        });
      });
    });
    return best;
  }

  /** ('2026-07', 'July 2026') from the YYYYMM stamp in the filename. */
  function periodFromName(filename) {
    var m = /(20\d{2})(0[1-9]|1[0-2])/.exec(filename || "");
    if (!m) return null;
    return {
      period: m[1] + "-" + m[2],
      label: MONTHS[parseInt(m[2], 10) - 1] + " " + m[1]
    };
  }

  function clean(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/ /g, " ").replace(/\s+/g, " ").trim();
  }

  function headerIndex(headerRow) {
    var seen = {};
    (headerRow || []).forEach(function (cell, i) {
      var key = clean(cell).toLowerCase().replace(/[\s_]/g, "");
      if (key && !(key in seen)) seen[key] = i;
    });

    var index = {}, missing = [];
    COLUMNS.forEach(function (col) {
      var at = seen[col.header.replace(/_/g, "")];
      if (at === undefined) missing.push(col.header);
      else index[col.key] = at;
    });
    if (missing.length) {
      throw new Error("The sheet is missing these columns: " + missing.join(", ") +
        ". Expected the standard QlikView export layout.");
    }
    return index;
  }

  /**
   * @param {{name:string, rows:Array}} sheet  from XlsxReader.readFirstSheet
   * @param {string} filename                  supplies the reporting period
   */
  function toPeriod(sheet, filename) {
    var stamp = periodFromName(filename);
    if (!stamp) {
      throw new Error("No YYYYMM month in the filename “" + filename +
        "”. Keep the QlikView name, e.g. " +
        "Qlikview_Sales_by_Customer_Location_202608.xlsx");
    }

    var rows = sheet.rows || [];
    if (rows.length < 2) throw new Error("The sheet has no data rows.");
    var at = headerIndex(rows[0]);

    var customers = [], unmapped = [], snapped = 0;
    for (var r = 1; r < rows.length; r++) {
      var row = rows[r] || [];
      var id = row[at.id];
      if (id === null || id === undefined || id === "") continue;

      var amt = Number(row[at.amt]) || 0;
      var qty = Number(row[at.qty]) || 0;
      var name = clean(row[at.name]);
      var group = clean(row[at.group]);
      if (group === "-") group = "";

      var lat = row[at.lat], lng = row[at.lng];
      if (typeof lat !== "number" || typeof lng !== "number" ||
          !isFinite(lat) || !isFinite(lng)) {
        unmapped.push({ id: id, name: name, group: group, amt: amt, qty: qty });
        continue;
      }

      var shape = locate(lng, lat);
      if (!shape) { shape = nearest(lng, lat); snapped++; }
      if (!shape) {
        unmapped.push({ id: id, name: name, group: group, amt: amt, qty: qty });
        continue;
      }

      customers.push({
        id: id, name: name, group: group,
        lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5,
        amt: amt, qty: qty,
        prov: shape.name, region: shape.region
      });
    }

    if (!customers.length && !unmapped.length) {
      throw new Error("No customer rows were found in the sheet.");
    }

    return {
      period: stamp.period,
      label: stamp.label,
      source: filename,
      customers: customers,
      unmapped: unmapped,
      snapped: snapped
    };
  }

  return { toPeriod: toPeriod, periodFromName: periodFromName };
}());
