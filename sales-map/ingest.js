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

  /* Header names are matched after lowercasing and dropping spaces and
     underscores, so each field lists the spellings seen in the wild. The
     MAP_GPS_* set comes from the "Export Sales for MAP" extract — including
     its Longgitude typo, which is reproduced deliberately. */
  var COLUMNS = [
    { key: "id",    label: "Store_ID / CUSTOMER_ID",
      names: ["storeid", "customerid", "custid", "custno", "customercode"] },
    { key: "name",  label: "Store_Name / MAP_GPS_Customer_Name",
      names: ["storename", "customername", "custname", "mapgpscustomername"] },
    { key: "lat",   label: "Lat / MAP_GPS_Latitude",
      names: ["lat", "latitude", "mapgpslatitude", "gpslatitude"] },
    { key: "lng",   label: "Lng / MAP_GPS_Longgitude",
      names: ["lng", "lon", "long", "longitude", "longgitude",
              "mapgpslonggitude", "mapgpslongitude", "gpslongitude"] },
    { key: "group", label: "SalesGroup / MAP_GPS_Sales_Group",
      names: ["salesgroup", "salegroup", "group", "mapgpssalesgroup"] },
    { key: "amt",   label: "SalesAmt / MAP_BILL_LOC_AMT",
      names: ["salesamt", "saleamt", "salesamount", "amount",
              "mapbilllocamt", "billlocamt", "locamt"] },
    { key: "qty",   label: "SalesQty / MAP_BILL_QTY",
      names: ["salesqty", "saleqty", "salesquantity", "quantity", "qty",
              "mapbillqty", "billqty"] }
  ];

  // Optional: a readable name for the sales group, when the export carries one.
  var GROUP_NAME_HEADERS = [
    "mapgpssalesgroupname", "salesgroupname", "salegroupname", "groupname"
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

  /** A coordinate cell -> number, or null when it is blank or a placeholder. */
  function toCoord(value) {
    if (typeof value === "number") return isFinite(value) ? value : null;
    var text = clean(value);
    if (!text || text === "-") return null;
    var n = Number(text);
    return isFinite(n) && text !== "" ? n : null;
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
      if (at === undefined) missing.push(col.label);
      else index[col.key] = at;
    });
    if (missing.length) {
      throw new Error("The file is missing these columns: " + missing.join(", ") +
        ". Found: " + Object.keys(seen).join(", "));
    }

    index.groupName = null;
    for (var g = 0; g < GROUP_NAME_HEADERS.length; g++) {
      if (GROUP_NAME_HEADERS[g] in seen) { index.groupName = seen[GROUP_NAME_HEADERS[g]]; break; }
    }
    return index;
  }

  /**
   * @param {{name:string, rows:Array}} sheet  from XlsxReader.readFirstSheet
   * @param {string} filename                  supplies the reporting period
   */
  function toPeriod(sheet, filename) {
    // A YYYYMM in the filename names the period; without one the file is still
    // loaded, keyed and labelled by its own name rather than inventing a date.
    var stamp = periodFromName(filename) || {
      period: "file:" + filename.replace(/\.[^.]+$/, "").toLowerCase(),
      label: filename.replace(/\.[^.]+$/, ""),
      undated: true
    };

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
      var groupName = at.groupName === null ? "" : clean(row[at.groupName]);

      // Blanks and placeholders ("-", "xxxxx") mean the customer is not
      // geocoded; anything that is not a real number lands in the same bucket.
      var lat = toCoord(row[at.lat]), lng = toCoord(row[at.lng]);
      if (lat === null || lng === null) {
        unmapped.push({ id: id, name: name, group: group, groupName: groupName,
          amt: amt, qty: qty });
        continue;
      }

      var shape = locate(lng, lat);
      if (!shape) { shape = nearest(lng, lat); snapped++; }
      if (!shape) {
        unmapped.push({ id: id, name: name, group: group, groupName: groupName,
          amt: amt, qty: qty });
        continue;
      }

      customers.push({
        id: id, name: name, group: group, groupName: groupName,
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
      undated: !!stamp.undated,
      source: filename,
      customers: customers,
      unmapped: unmapped,
      snapped: snapped
    };
  }

  return { toPeriod: toPeriod, periodFromName: periodFromName };
}());
