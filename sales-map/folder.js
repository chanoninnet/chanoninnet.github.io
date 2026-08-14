/* ---------------------------------------------------------------------------
   Remember the folder the monthly exports live in.

   A page cannot go looking through the filesystem on its own, so the first
   Re-Load Data click asks which folder to watch. The browser hands back a
   directory handle, that handle is kept in IndexedDB, and every later click
   re-reads the folder with no dialog at all — which is what makes "re-load"
   a single click rather than a file-picking chore.

   Chrome and Edge support this (including on file:// pages, which count as
   secure contexts). Firefox and Safari do not, and there `supported` is false
   so the caller can fall back to the ordinary multi-file picker.
   --------------------------------------------------------------------------- */
window.SourceFolder = (function () {
  "use strict";

  var DB_NAME = "salesmap";
  var STORE = "handles";
  var KEY = "sourceDir";

  var supported = typeof window.showDirectoryPicker === "function";

  // Any .xlsx carrying a YYYYMM — which is exactly the QlikView export name,
  // Qlikview_Sales_by_Customer_Location_YYYYMM.xlsx, without being so strict
  // that a file renamed slightly by hand is silently ignored.
  var EXPORT_NAME = /(20\d{2})(0[1-9]|1[0-2])/;

  function isExport(name) {
    return /\.xlsx$/i.test(name) &&
      name.slice(0, 2) !== "~$" &&                    // Excel lock file
      EXPORT_NAME.test(name);
  }

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
    return withStore("readwrite", function (store) { return store.put(handle, KEY); })
      .catch(function () { /* a forgotten folder only costs one extra dialog */ });
  }

  function recall() {
    return withStore("readonly", function (store) { return store.get(KEY); })
      .catch(function () { return null; });
  }

  function forget() {
    return withStore("readwrite", function (store) { return store.delete(KEY); })
      .catch(function () { /* nothing to undo */ });
  }

  /** Read permission for a remembered handle, re-prompting if it has lapsed. */
  async function allowed(handle, interactive) {
    if (!handle || typeof handle.queryPermission !== "function") return true;
    var opts = { mode: "read" };
    if (await handle.queryPermission(opts) === "granted") return true;
    if (!interactive) return false;
    return await handle.requestPermission(opts) === "granted";
  }

  /**
   * Every monthly export in the folder, plus any in a `source` subfolder — so
   * either the project folder or the source folder itself can be chosen.
   */
  async function scan(dir) {
    var files = [];
    for await (var entry of dir.values()) {
      if (entry.kind === "file") {
        if (isExport(entry.name)) files.push(await entry.getFile());
      } else if (entry.kind === "directory" && /^source$/i.test(entry.name)) {
        for await (var sub of entry.values()) {
          if (sub.kind === "file" && isExport(sub.name)) files.push(await sub.getFile());
        }
      }
    }
    files.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
    return files;
  }

  function choose() {
    return window.showDirectoryPicker({ id: "salesmap-source", mode: "read" });
  }

  return {
    supported: supported,
    isExport: isExport,
    choose: choose,
    scan: scan,
    allowed: allowed,
    remember: remember,
    recall: recall,
    forget: forget
  };
}());
