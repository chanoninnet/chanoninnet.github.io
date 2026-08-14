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
    { key: "id", names: ["storeid", "customerid", "custid"] },
    { key: "name", names: ["storename", "customername", "custname"] },
    { key: "lat", names: ["lat", "latitude"] },
    { key: "lng", names: ["lng", "lon", "long", "longitude"] },
    { key: "group", names: ["salesgroup", "salegroup", "group"] },
    { key: "amt", names: ["salesamt", "saleamt", "salesamount", "amount"] },
    { key: "qty", names: ["salesqty", "saleqty", "salesquantity", "quantity", "qty"] }
  ];

  // An optional month column splits one sheet into one period per month.
  var MONTH_HEADERS = [
    "month", "months", "period", "yearmonth", "yrmonth", "ym", "yyyymm",
    "monthid", "monthkey", "salemonth", "salesmonth", "saleperiod",
    "salesperiod", "เดือน", "งวด", "ปีเดือน"
  ];

  var MONTH_WORDS = {};
  MONTHS.forEach(function (name, i) {
    MONTH_WORDS[name.toLowerCase()] = i + 1;
    MONTH_WORDS[name.toLowerCase().slice(0, 3)] = i + 1;
  });
  ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
   "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
  ].forEach(function (th, i) { MONTH_WORDS[th] = i + 1; });
  ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
   "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."
  ].forEach(function (th, i) {
    MONTH_WORDS[th] = i + 1;
    MONTH_WORDS[th.replace(/\./g, "")] = i + 1;
  });

  /** Thai exports often carry the Buddhist year; 2569 means 2026. */
  function normaliseYear(year) { return year > 2400 ? year - 543 : year; }

  /**
   * A month cell -> {year, month}, or null when it says nothing usable.
   * Accepts what QlikView and Excel produce: dates, 202601, "2026-01",
   * "01/2026", a bare 1-12, and English or Thai month names.
   */
  function parseMonth(value, defaultYear) {
    if (value === null || value === undefined || value === true || value === false) return null;

    if (value instanceof Date && !isNaN(value)) {
      return { year: normaliseYear(value.getFullYear()), month: value.getMonth() + 1 };
    }

    if (typeof value === "number" && isFinite(value)) {
      var n = Math.round(value);
      if (n >= 1 && n <= 12) return { year: defaultYear, month: n };
      if (n >= 190001 && n <= 299912 && n % 100 >= 1 && n % 100 <= 12) {
        return { year: normaliseYear(Math.floor(n / 100)), month: n % 100 };
      }
      return null;
    }

    var text = clean(value);
    if (!text || text === "-") return null;

    var m = /^(\d{4})\D?(\d{1,2})$/.exec(text);                 // 202601, 2026-01
    if (m && +m[2] >= 1 && +m[2] <= 12) return { year: normaliseYear(+m[1]), month: +m[2] };

    m = /^(\d{1,2})\D(\d{4})$/.exec(text);                      // 01/2026
    if (m && +m[1] >= 1 && +m[1] <= 12) return { year: normaliseYear(+m[2]), month: +m[1] };

    m = /^(\d{1,2})$/.exec(text);                               // 1 .. 12
    if (m && +m[1] >= 1 && +m[1] <= 12) return { year: defaultYear, month: +m[1] };

    var word = text.toLowerCase().replace(/\.$/, "");
    var yearInText = /(\d{4})/.exec(text);
    for (var name in MONTH_WORDS) {
      if (!Object.prototype.hasOwnProperty.call(MONTH_WORDS, name)) continue;
      var stem = name.replace(/\.$/, "");
      if (word === stem || word.indexOf(stem + " ") === 0 || word.indexOf(stem + "-") === 0) {
        return {
          year: yearInText ? normaliseYear(+yearInText[1]) : defaultYear,
          month: MONTH_WORDS[name]
        };
      }
    }
    return null;
  }

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

  /**
   * The reporting period a filename declares. A QlikView export may hold one
   * month or a whole year, so both endings are accepted:
   *
   *     ..._202607.xlsx -> 2026-07, "July 2026"
   *     ..._2026.xlsx   -> 2026,    "Full year 2026"
   */
  function periodFromName(filename) {
    var name = filename || "";
    var month = /(20\d{2})(0[1-9]|1[0-2])(?!\d)/.exec(name);
    if (month) {
      return {
        period: month[1] + "-" + month[2],
        label: MONTHS[parseInt(month[2], 10) - 1] + " " + month[1]
      };
    }
    var year = /(20\d{2})(?!\d)/.exec(name);
    if (year) return { period: year[1], label: "Full year " + year[1] };
    return null;
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
      var at;
      for (var i = 0; i < col.names.length; i++) {
        if (col.names[i] in seen) { at = seen[col.names[i]]; break; }
      }
      if (at === undefined) missing.push(col.names[0]);
      else index[col.key] = at;
    });
    if (missing.length) {
      throw new Error("The sheet is missing these columns: " + missing.join(", ") +
        ". Expected the standard QlikView export layout.");
    }

    index.month = null;                               // optional
    for (var m = 0; m < MONTH_HEADERS.length; m++) {
      if (MONTH_HEADERS[m] in seen) { index.month = seen[MONTH_HEADERS[m]]; break; }
    }
    return index;
  }

  /**
   * One sheet -> one period per month when the sheet has a month column, or a
   * single period named by the filename when it does not.
   *
   * @param {{name:string, rows:Array}} sheet  from XlsxReader.readFirstSheet
   * @param {string} filename                  the fallback reporting period
   * @returns {Array} periods, oldest first
   */
  function toPeriods(sheet, filename) {
    var stamp = periodFromName(filename);
    if (!stamp) {
      throw new Error("No year or month in the filename “" + filename +
        "”. Keep the QlikView name, ending in the period: " +
        "Qlikview_Sales_by_Customer_Location_2026.xlsx or " +
        "..._202608.xlsx");
    }
    var defaultYear = parseInt(stamp.period.slice(0, 4), 10);

    var rows = sheet.rows || [];
    if (rows.length < 2) throw new Error("The sheet has no data rows.");
    var at = headerIndex(rows[0]);

    var groups = {}, order = [];
    function bucket(period, label) {
      if (!groups[period]) {
        groups[period] = { period: period, label: label, source: filename,
          customers: [], unmapped: [], snapped: 0 };
        order.push(period);
      }
      return groups[period];
    }

    for (var r = 1; r < rows.length; r++) {
      var row = rows[r] || [];
      var id = row[at.id];
      if (id === null || id === undefined || id === "") continue;

      var period = stamp.period, label = stamp.label;
      if (at.month !== null) {
        var when = parseMonth(row[at.month], defaultYear);
        if (when) {
          period = String(when.year) + "-" + (when.month < 10 ? "0" : "") + when.month;
          label = MONTHS[when.month - 1] + " " + when.year;
        }
      }
      var target = bucket(period, label);

      var amt = Number(row[at.amt]) || 0;
      var qty = Number(row[at.qty]) || 0;
      var name = clean(row[at.name]);
      var group = clean(row[at.group]);
      if (group === "-") group = "";

      var lat = row[at.lat], lng = row[at.lng];
      if (typeof lat !== "number" || typeof lng !== "number" ||
          !isFinite(lat) || !isFinite(lng)) {
        target.unmapped.push({ id: id, name: name, group: group, amt: amt, qty: qty });
        continue;
      }

      var shape = locate(lng, lat);
      if (!shape) { shape = nearest(lng, lat); target.snapped++; }
      if (!shape) {
        target.unmapped.push({ id: id, name: name, group: group, amt: amt, qty: qty });
        continue;
      }

      target.customers.push({
        id: id, name: name, group: group,
        lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5,
        amt: amt, qty: qty,
        prov: shape.name, region: shape.region
      });
    }

    if (!order.length) throw new Error("No customer rows were found in the sheet.");

    return order.sort().map(function (key) { return groups[key]; });
  }

  return { toPeriods: toPeriods, periodFromName: periodFromName, parseMonth: parseMonth };
}());
