// storage.js — safe localStorage + IndexedDB wrappers, memory fallback.
NTI.define("core/storage", function () {
  let mem = {};
  const ls = {
    get(k) {
      try {
        const v = localStorage.getItem(k);
        return v == null ? null : JSON.parse(v);
      } catch { return mem[k] !== undefined ? mem[k] : null; }
    },
    set(k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); }
      catch { mem[k] = v; }
    },
    del(k) {
      try { localStorage.removeItem(k); } catch { delete mem[k]; }
    },
  };
  let idbOk = null;
  function idb() {
    return new Promise((resolve) => {
      if (idbOk === false) return resolve(null);
      try {
        const r = indexedDB.open("nti-local", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("files");
        r.onsuccess = () => { idbOk = true; resolve(r.result); };
        r.onerror = () => { idbOk = false; resolve(null); };
      } catch { idbOk = false; resolve(null); }
    });
  }
  const memFiles = [];
  return {
    ls,
    get available() {
      try {
        localStorage.setItem("__t", "1");
        localStorage.removeItem("__t");
        return true;
      } catch { return false; }
    },
    async filesPut(rec) {
      const db = await idb();
      if (!db) { memFiles.push(rec); return "memory"; }
      return new Promise((resolve, reject) => {
        const tx = db.transaction("files", "readwrite");
        tx.objectStore("files").put(rec, rec.id);
        tx.oncomplete = () => resolve("idb");
        tx.onerror = () => reject(tx.error);
      });
    },
    async filesAll() {
      const db = await idb();
      if (!db) return memFiles.slice();
      return new Promise((resolve) => {
        try {
          const tx = db.transaction("files", "readonly");
          const q = tx.objectStore("files").getAll();
          q.onsuccess = () => resolve(q.result || []);
          q.onerror = () => resolve([]);
        } catch { resolve([]); }
      });
    },
    async filesDel(id) {
      const i = memFiles.findIndex((f) => f.id === id);
      if (i >= 0) memFiles.splice(i, 1);
      const db = await idb();
      if (!db) return;
      return new Promise((resolve) => {
        try {
          const tx = db.transaction("files", "readwrite");
          tx.objectStore("files").delete(id);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch { resolve(); }
      });
    },
  };
});
