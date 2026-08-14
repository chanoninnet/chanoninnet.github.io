/* ---------------------------------------------------------------------------
   Find the monthly exports in the fixed `source` folder beside this page.

   Files must be named the way QlikView names them:

       source/Qlikview_Sales_by_Customer_Location_YYYYMM.xlsx

   How the folder is read depends on how the page was opened, because browsers
   treat the two cases very differently:

   • Served over http(s) — GitHub Pages, or `python3 -m http.server` — the page
     can request `source/…` itself. Nothing is asked of the user and the months
     load on their own. A server that renders a directory listing is read
     directly; one that does not (GitHub Pages) is probed month by month.

   • Opened as a file:// page, a browser will not let a script read any path it
     was not explicitly handed — no exception, no flag worth setting. There the
     `source` folder has to be granted once through the File System Access API
     (Chrome/Edge), after which the grant is remembered and re-reads are silent.
   --------------------------------------------------------------------------- */
window.SourceFolder = (function () {
  "use strict";

  var DIR = "source";
  var PREFIX = "Qlikview_Sales_by_Customer_Location_";
  var NAME = /^Qlikview_Sales_by_Customer_Location_.*\.xlsx$/i;
  // A whole-year export (..._2026.xlsx) or a single month (..._202607.xlsx).
  var PERIOD = /(20\d{2})((0[1-9]|1[0-2])(?!\d)|(?!\d))/;

  var DB_NAME = "salesmap";
  var STORE = "handles";
  var KEY = "sourceDir";

  var overHttp = location.protocol === "http:" || location.protocol === "https:";
  var canGrant = typeof window.showDirectoryPicker === "function";

  /** A monthly export: right name, not an Excel lock file. */
  function isExport(name) {
    return NAME.test(name) && name.slice(0, 2) !== "~$";
  }

  /** Named right but with no YYYYMM — worth telling the user about. */
  function isUndated(name) {
    return isExport(name) && !PERIOD.test(name.slice(PREFIX.length));
  }

  // -------------------------------------------------------------------------
  // served over http(s): read `source/` directly
  // -------------------------------------------------------------------------

  /** Parse a server-rendered directory listing, if there is one. */
  async function listFromIndex() {
    var res;
    try {
      res = await fetch(DIR + "/", { cache: "no-store" });
    } catch (e) {
      return null;
    }
    if (!res.ok) return null;

    var type = res.headers.get("content-type") || "";
    if (type.indexOf("html") < 0) return null;

    var doc = new DOMParser().parseFromString(await res.text(), "text/html");
    var links = doc.querySelectorAll("a[href]");
    var names = [];
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute("href") || "";
      var base = decodeURIComponent(href.split("?")[0].split("#")[0]).split("/").pop();
      if (isExport(base) && names.indexOf(base) < 0) names.push(base);
    }
    return names.length ? names : null;
  }

  /**
   * The period stamps to try when the server will not list the folder: recent
   * whole years first, since a year export covers the most ground, then the
   * recent months.
   */
  function candidateStamps(yearsBack, monthsBack) {
    var now = new Date();
    var out = [];
    for (var y = 0; y <= yearsBack; y++) out.push(String(now.getFullYear() - y));
    for (var i = -1; i < monthsBack; i++) {           // one ahead, then backwards
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      var mm = d.getMonth() + 1;
      out.push(String(d.getFullYear()) + (mm < 10 ? "0" + mm : String(mm)));
    }
    return out;
  }

  function fetchExport(name) {
    return fetch(DIR + "/" + name, { cache: "no-store" }).then(function (res) {
      if (!res.ok) return null;
      return res.blob().then(function (blob) { return new File([blob], name); });
    }).catch(function () { return null; });
  }

  /** Every export in `source/`, fetched over http(s). */
  async function fetchAll() {
    var names = await listFromIndex();
    if (names) {
      var listed = await Promise.all(names.map(fetchExport));
      var got = listed.filter(Boolean);
      if (got.length) return sortByName(got);
    }
    // GitHub Pages and friends serve no listing, so there is nothing to read
    // but the names themselves: ask for recent years and months by name.
    // Anything older than that belongs in a build, not in a probe.
    var probed = await Promise.all(candidateStamps(4, 24).map(function (stamp) {
      return fetchExport(PREFIX + stamp + ".xlsx");
    }));
    return sortByName(probed.filter(Boolean));
  }

  function sortByName(files) {
    return files.sort(function (a, b) {
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
  }

  // -------------------------------------------------------------------------
  // opened as file://: a one-time grant of the `source` folder
  // -------------------------------------------------------------------------
  function openDb() {
    return new Promise(function (resolve, reject) {
      var request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = function () {
        if (!request.result.objectStoreNames.contains(STORE)) {
          request.result.createObjectStore(STORE);
        }
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  function withStore(mode, run) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, mode);
        var request = run(tx.objectStore(STORE));
        tx.oncomplete = function () { db.close(); resolve(request && request.result); };
        tx.onerror = function () { db.close(); reject(tx.error); };
      });
    });
  }

  function remember(handle) {
    return withStore("readwrite", function (s) { return s.put(handle, KEY); })
      .catch(function () { /* a forgotten grant only costs one extra dialog */ });
  }

  function recall() {
    return withStore("readonly", function (s) { return s.get(KEY); })
      .catch(function () { return null; });
  }

  function forget() {
    return withStore("readwrite", function (s) { return s.delete(KEY); })
      .catch(function () { /* nothing to undo */ });
  }

  async function allowed(handle, interactive) {
    if (!handle || typeof handle.queryPermission !== "function") return true;
    var opts = { mode: "read" };
    if (await handle.queryPermission(opts) === "granted") return true;
    if (!interactive) return false;
    return await handle.requestPermission(opts) === "granted";
  }

  /**
   * Ask for the `source` folder. The project folder is accepted too — its
   * `source` subfolder is what gets kept, so either answer is right.
   */
  async function grant() {
    var picked = await window.showDirectoryPicker({ id: "salesmap-source", mode: "read" });
    if (/^source$/i.test(picked.name)) return picked;
    try {
      return await picked.getDirectoryHandle(DIR);
    } catch (e) {
      var wrong = new Error(
        "“" + picked.name + "” is not the source folder and has no source " +
        "folder inside it. Choose sales-map/source, or the sales-map folder itself."
      );
      wrong.name = "WrongFolder";
      throw wrong;
    }
  }

  /** Every export in a granted folder handle. */
  async function readGranted(handle) {
    var files = [], undated = [];
    for await (var entry of handle.values()) {
      if (entry.kind !== "file") continue;
      if (isUndated(entry.name)) undated.push(entry.name);
      else if (isExport(entry.name)) files.push(await entry.getFile());
    }
    return { files: sortByName(files), undated: undated };
  }

  return {
    dir: DIR,
    prefix: PREFIX,
    overHttp: overHttp,
    canGrant: canGrant,
    isExport: isExport,
    fetchAll: fetchAll,
    grant: grant,
    readGranted: readGranted,
    allowed: allowed,
    remember: remember,
    recall: recall,
    forget: forget
  };
}());
