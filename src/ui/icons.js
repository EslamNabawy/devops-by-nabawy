// icons.js — <Icon name> from the inline sprite.
NTI.define("ui/icons", function () {
  const { html } = window.htmPreact;
  const KNOWN = ["search", "map", "user", "plus", "check", "bookmark",
    "external", "file", "book", "flask", "code", "image", "chevron",
    "x", "menu", "clock", "layers"];
  function Icon({ name }) {
    const n = KNOWN.includes(name) ? name : "file";
    return html`<svg class="icon" aria-hidden="true"><use href="#i-${n}"></use></svg>`;
  }
  return { Icon };
});
