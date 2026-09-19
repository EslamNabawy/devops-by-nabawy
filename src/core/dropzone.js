// dropzone.js — window drag/drop + picker -> IndexedDB My files, Blob URLs.
NTI.define("core/dropzone", function () {
  function isPdf(file) {
    return file && (file.type === "application/pdf" ||
      /\.pdf$/i.test(file.name || ""));
  }
  async function addFile(file, store, copy) {
    const S = NTI.require("core/storage");
    if (!isPdf(file)) {
      NTI.require("ui/primitives").toast(copy.onlyPdf);
      return null;
    }
    if (file.size > 200 * 1024 * 1024) {
      NTI.require("ui/primitives").toast(copy.storageFull);
      return null;
    }
    const rec = { id: "local-" + Math.random().toString(36).slice(2) +
      Date.now().toString(36), name: file.name, track: null,
      bytes: file.size, addedAt: new Date().toISOString(), blob: file };
    try {
      const where = await S.filesPut(rec);
      NTI.require("ui/primitives").toast(copy.savedFiles);
      if (where === "memory") {
        NTI.require("ui/primitives").toast(copy.sessionOnly);
      }
    } catch {
      NTI.require("ui/primitives").toast(copy.storageFull);
      return null;
    }
    return rec;
  }
  function init(store, copy) {
    const overlay = document.createElement("div");
    overlay.className = "drop-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `<div class="drop-card"><strong>${copy.dropPdf}</strong><span>${copy.dropStays}</span></div>`;
    document.body.appendChild(overlay);
    let depth = 0;
    window.addEventListener("dragenter", (e) => {
      if (e.target.closest && e.target.closest(".modal")) return;
      depth++;
      overlay.hidden = false;
      e.preventDefault();
    });
    window.addEventListener("dragleave", () => {
      depth = Math.max(0, depth - 1);
      if (!depth) overlay.hidden = true;
    });
    window.addEventListener("dragover", (e) => e.preventDefault());
    window.addEventListener("drop", async (e) => {
      depth = 0; overlay.hidden = true;
      if (e.target.closest && e.target.closest(".modal")) return;
      e.preventDefault();
      const f = e.dataTransfer && e.dataTransfer.files &&
        e.dataTransfer.files[0];
      if (!f) return;
      const rec = await addFile(f, store, copy);
      if (rec) {
        const A = NTI.require("core/a11y");
        A.announce(copy.savedFiles);
        NTI.require("core/router").go(`#/read/${rec.id}?fmt=local`);
      }
    });
  }
  return { init, addFile, isPdf };
});
