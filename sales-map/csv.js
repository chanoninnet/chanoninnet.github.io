/* ---------------------------------------------------------------------------
   Read a delimited text export — .csv, .tsv or .txt — with no libraries.

   Simpler than the .xlsx path in every way, with one catch that matters for
   Thai data: encoding. QlikView and Excel will happily write a "CSV" as
   Windows-874 (TIS-620) rather than UTF-8, and decoding that as UTF-8 turns
   every Thai customer name into mojibake. So the bytes are sniffed first: a
   byte-order mark wins, otherwise a strict UTF-8 decode is attempted and
   Windows-874 is the fallback when that fails.

   The delimiter is detected too (comma, tab, semicolon or pipe), quoted fields
   follow the usual "" escaping rule, and numbers written with thousands
   separators — 1,234.56 — come back as numbers.

       const sheet = await TextTable.read(file);   // File or Blob
       sheet.rows -> [["Store_ID", "Store_Name", ...], [1300000001, "...", ...]]
   --------------------------------------------------------------------------- */
window.TextTable = (function () {
  "use strict";

  var EXTENSIONS = /\.(csv|tsv|txt)$/i;
  var DELIMITERS = [",", "\t", ";", "|"];

  function handles(name) { return EXTENSIONS.test(name || ""); }

  // -------------------------------------------------------------------------
  // bytes -> text
  // -------------------------------------------------------------------------
  function decode(buffer) {
    var bytes = new Uint8Array(buffer);

    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      return new TextDecoder("utf-8").decode(bytes.subarray(3));
    }
    if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
      return new TextDecoder("utf-16le").decode(bytes.subarray(2));
    }
    if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
      return new TextDecoder("utf-16be").decode(bytes.subarray(2));
    }

    // No mark: real UTF-8 decodes cleanly, and Windows-874 almost never does,
    // so a strict attempt tells the two apart reliably.
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (notUtf8) {
      try {
        return new TextDecoder("windows-874").decode(bytes);
      } catch (noThaiDecoder) {
        return new TextDecoder("utf-8").decode(bytes);   // lossy last resort
      }
    }
  }

  // -------------------------------------------------------------------------
  // text -> rows
  // -------------------------------------------------------------------------
  /** Count a candidate delimiter in the first line, ignoring quoted stretches. */
  function countOutsideQuotes(line, delimiter) {
    var count = 0, quoted = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line.charAt(i);
      if (ch === '"') quoted = !quoted;
      else if (!quoted && ch === delimiter) count++;
    }
    return count;
  }

  function sniffDelimiter(text) {
    var firstLine = text.split(/\r?\n/, 1)[0] || "";
    var best = ",", bestCount = 0;
    DELIMITERS.forEach(function (d) {
      var n = countOutsideQuotes(firstLine, d);
      if (n > bestCount) { best = d; bestCount = n; }
    });
    return best;
  }

  /** RFC 4180-ish: quoted fields may hold the delimiter, newlines and "". */
  function parse(text, delimiter) {
    var rows = [], row = [], field = "", quoted = false;

    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);

      if (quoted) {
        if (ch !== '"') { field += ch; continue; }
        if (text.charAt(i + 1) === '"') { field += '"'; i++; continue; }
        quoted = false;
        continue;
      }

      if (ch === '"') { quoted = true; continue; }
      if (ch === delimiter) { row.push(field); field = ""; continue; }
      if (ch === "\r") continue;                        // CRLF and lone CR
      if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
      field += ch;
    }

    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  // -------------------------------------------------------------------------
  // cell values
  // -------------------------------------------------------------------------
  var PLAIN_NUMBER = /^-?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;
  var GROUPED_NUMBER = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/;

  /**
   * Numbers become numbers so the dashboard can do arithmetic; everything else
   * stays text. Values with a leading zero (0012) are left alone — they are
   * codes, not quantities, and converting one would lose the zero.
   */
  function coerce(value) {
    var text = String(value).trim();
    if (!text || text === "-") return text;

    var candidate = GROUPED_NUMBER.test(text) ? text.replace(/,/g, "") : text;
    if (!PLAIN_NUMBER.test(candidate)) return text;
    if (/^-?0\d/.test(candidate)) return text;

    var number = parseFloat(candidate);
    return isNaN(number) ? text : number;
  }

  async function read(blob) {
    var text = decode(await blob.arrayBuffer());
    if (!text.trim()) throw new Error("The file is empty.");

    var rows = parse(text, sniffDelimiter(text))
      .filter(function (row) {
        return row.length > 1 || (row[0] || "").trim() !== "";   // drop blank lines
      })
      .map(function (row) { return row.map(coerce); });

    if (rows.length < 2) {
      throw new Error("No data rows — expected a header row and at least one customer.");
    }
    return { name: (blob.name || "data").replace(EXTENSIONS, ""), rows: rows };
  }

  return { handles: handles, read: read, decode: decode, sniffDelimiter: sniffDelimiter };
}());
