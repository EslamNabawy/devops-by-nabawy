// theme.js — system/light/dark + density + reading + motion -> data-* on <html>.
NTI.define("core/theme", function () {
  function apply(s) {
    const h = document.documentElement;
    const theme = s.theme === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark" : "light") : s.theme;
    h.setAttribute("data-theme", s.theme === "system" ? theme : s.theme);
    h.setAttribute("data-density", s.density || "comfortable");
    h.setAttribute("data-reading", String(s.readingSize ?? 1));
    h.setAttribute("data-motion", s.reduceMotion || "system");
  }
  return { apply };
});
