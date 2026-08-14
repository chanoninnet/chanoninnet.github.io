/* ---------------------------------------------------------------------------
   A minimal .xlsx reader — no libraries, no network.

   An .xlsx file is a ZIP archive of XML parts, and modern browsers can do both
   halves of that natively: DecompressionStream('deflate-raw') for the ZIP
   payloads and DOMParser for the XML. That is the whole trick, and it is why
   the dashboard can read an Excel file straight from the file picker while
   still being a page you open from a bare file:// path.

   Only what this dashboard needs is implemented: the first worksheet of a
   normal, uncompressed-or-deflated, non-ZIP64 workbook. Anything outside that
   raises an explanatory Error rather than returning quietly wrong rows.

       const sheet = await XlsxReader.readFirstSheet(file);   // File or Blob
       sheet.name        -> "Sheet1"
       sheet.rows        -> [["Store_ID", "Store_Name", ...], [1300000001, ...]]
   --------------------------------------------------------------------------- */
window.XlsxReader = (function () {
  "use strict";

  var SIG_EOCD = 0x06054b50;
  var SIG_CENTRAL = 0x02014b50;
  var SIG_LOCAL = 0x04034b50;

  function u16(view, at) { return view.getUint16(at, true); }
  function u32(view, at) { return view.getUint32(at, true); }

  function utf8(bytes) { return new TextDecoder("utf-8").decode(bytes); }

  function inflateRaw(bytes) {
    var stream = new Blob([bytes]).stream()
      .pipeThrough(new DecompressionStream("deflate-raw"));
    return new Response(stream).arrayBuffer();
  }

  /** Index a ZIP by walking its central directory. */
  function openZip(buffer) {
    var view = new DataView(buffer);

    // The end-of-central-directory record sits in the last 64KB, after a
    // variable-length comment, so it has to be scanned for backwards.
    var eocd = -1;
    var floor = Math.max(0, buffer.byteLength - 22 - 65535);
    for (var i = buffer.byteLength - 22; i >= floor; i--) {
      if (u32(view, i) === SIG_EOCD) { eocd = i; break; }
    }
    if (eocd < 0) {
      throw new Error(
        "This is not a .xlsx file. If it is an old .xls workbook, open it in " +
        "Excel and save as .xlsx first."
      );
    }

    var count = u16(view, eocd + 10);
    var start = u32(view, eocd + 16);
    if (start === 0xffffffff || count === 0xffff) {
      throw new Error("ZIP64 workbooks are not supported by the in-page reader.");
    }

    var entries = {};
    var at = start;
    for (var n = 0; n < count; n++) {
      if (u32(view, at) !== SIG_CENTRAL) break;
      var nameLen = u16(view, at + 28);
      entries[utf8(new Uint8Array(buffer, at + 46, nameLen))] = {
        method: u16(view, at + 10),
        size: u32(view, at + 20),
        offset: u32(view, at + 42)
      };
      at += 46 + nameLen + u16(view, at + 30) + u16(view, at + 32);
    }

    return {
      has: function (name) { return Object.prototype.hasOwnProperty.call(entries, name); },
      names: function () { return Object.keys(entries); },
      text: async function (name) {
        var entry = entries[name];
        if (!entry) return null;
        if (u32(view, entry.offset) !== SIG_LOCAL) {
          throw new Error("Damaged workbook: bad ZIP entry for " + name);
        }
        // The local header repeats the name and extra field with its own
        // lengths, which are not always the central directory's.
        var dataAt = entry.offset + 30 +
          u16(view, entry.offset + 26) + u16(view, entry.offset + 28);
        var raw = new Uint8Array(buffer, dataAt, entry.size);
        if (entry.method === 0) return utf8(raw);
        if (entry.method !== 8) {
          throw new Error("Unsupported compression in " + name +
            " (method " + entry.method + ").");
        }
        return utf8(new Uint8Array(await inflateRaw(raw)));
      }
    };
  }

  function parseXml(text, what) {
    var doc = new DOMParser().parseFromString(text, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) {
      throw new Error("Damaged workbook: could not parse " + what + ".");
    }
    return doc;
  }

  function tagged(node, name) {
    // getElementsByTagNameNS('*') keeps this working whether or not the file
    // namespaces its elements — both forms occur in the wild.
    return node.getElementsByTagNameNS("*", name);
  }

  /** "BD" -> 55. Cell refs carry the column, and blank cells are omitted. */
  function columnOf(ref) {
    var n = 0;
    for (var i = 0; i < ref.length; i++) {
      var code = ref.charCodeAt(i);
      if (code < 65 || code > 90) break;
      n = n * 26 + (code - 64);
    }
    return n - 1;
  }

  function sharedStrings(xml) {
    if (!xml) return [];
    var items = tagged(parseXml(xml, "sharedStrings.xml"), "si");
    var out = new Array(items.length);
    for (var i = 0; i < items.length; i++) {
      // Rich text splits one string across several <t> runs.
      var runs = tagged(items[i], "t");
      var text = "";
      for (var j = 0; j < runs.length; j++) text += runs[j].textContent;
      out[i] = text;
    }
    return out;
  }

  /** Which part holds the first worksheet, following workbook.xml's rels. */
  async function firstSheetPart(zip) {
    var book = await zip.text("xl/workbook.xml");
    if (!book) throw new Error("Damaged workbook: xl/workbook.xml is missing.");

    var sheets = tagged(parseXml(book, "workbook.xml"), "sheet");
    if (!sheets.length) throw new Error("The workbook has no worksheets.");

    var first = sheets[0];
    var name = first.getAttribute("name") || "Sheet1";
    var relId = first.getAttribute("r:id") ||
      first.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");

    var path = null;
    var relsXml = await zip.text("xl/_rels/workbook.xml.rels");
    if (relsXml && relId) {
      var rels = tagged(parseXml(relsXml, "workbook.xml.rels"), "Relationship");
      for (var i = 0; i < rels.length; i++) {
        if (rels[i].getAttribute("Id") !== relId) continue;
        var target = rels[i].getAttribute("Target") || "";
        path = target.charAt(0) === "/"
          ? target.slice(1)
          : "xl/" + target.replace(/^\.\//, "");
        break;
      }
    }
    if (!path || !zip.has(path)) path = "xl/worksheets/sheet1.xml";
    if (!zip.has(path)) throw new Error("Damaged workbook: " + path + " is missing.");
    return { name: name, path: path };
  }

  function readSheet(xml, strings) {
    var rowNodes = tagged(parseXml(xml, "the worksheet"), "row");
    var rows = [];

    for (var r = 0; r < rowNodes.length; r++) {
      var cells = tagged(rowNodes[r], "c");
      var row = [];
      for (var c = 0; c < cells.length; c++) {
        var cell = cells[c];
        var ref = cell.getAttribute("r");
        var at = ref ? columnOf(ref) : c;
        var type = cell.getAttribute("t") || "n";
        var value = null;

        if (type === "inlineStr") {
          var runs = tagged(cell, "t");
          value = "";
          for (var k = 0; k < runs.length; k++) value += runs[k].textContent;
        } else {
          var v = tagged(cell, "v")[0];
          var raw = v ? v.textContent : null;
          if (raw === null || raw === "") value = null;
          else if (type === "s") value = strings[parseInt(raw, 10)];
          else if (type === "str") value = raw;
          else if (type === "b") value = raw === "1";
          else if (type === "e") value = null;            // #N/A and friends
          else {
            var num = parseFloat(raw);
            value = isNaN(num) ? raw : num;
          }
        }

        while (row.length < at) row.push(null);
        row[at] = value;
      }
      // Excel numbers rows explicitly; honour that so blank rows keep alignment.
      var index = parseInt(rowNodes[r].getAttribute("r"), 10);
      if (index > 0) {
        while (rows.length < index - 1) rows.push([]);
        rows[index - 1] = row;
      } else {
        rows.push(row);
      }
    }
    return rows;
  }

  async function readFirstSheet(blob) {
    if (typeof DecompressionStream !== "function") {
      throw new Error(
        "This browser cannot unzip files in the page. Use a current Chrome, " +
        "Edge, Firefox or Safari, or run tools/build_data.py instead."
      );
    }
    var zip = openZip(await blob.arrayBuffer());
    var part = await firstSheetPart(zip);
    var strings = sharedStrings(await zip.text("xl/sharedStrings.xml"));
    return { name: part.name, rows: readSheet(await zip.text(part.path), strings) };
  }

  return { readFirstSheet: readFirstSheet };
}());
