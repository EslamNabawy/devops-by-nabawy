// NTI namespace registry: NTI.define(name, fn) invokes fn immediately
// (concat order in src/manifest.json guarantees dependencies first).
window.NTI = window.NTI || {};
window.NTI._mods = window.NTI._mods || {};
window.NTI.define = window.NTI.define || function (name, fn) {
  window.NTI._mods[name] = fn();
};
window.NTI.require = window.NTI.require || function (name) {
  return window.NTI._mods[name];
};
