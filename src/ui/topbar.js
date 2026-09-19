// topbar.js + bottomnav.js — chrome.
NTI.define("ui/topbar", function () {
  const { html } = window.htmPreact;
  const { Icon } = NTI.require("ui/icons");
  function Topbar({ route, onSearch, count }) {
    const R = NTI.require("core/router");
    const copy = NTI.require("core/copy");
    const Cat = NTI.require("core/catalog");
    const maint = !!(Cat.data.site && Cat.data.site.maintainerMode);
    return html`<header class="topbar">
      <a class="brand" href="#/">DevOps By Nabawy</a>
      <nav class="topnav" aria-label="Primary">
        <a href="#/" aria-current=${route.view === "library" ? "page" : null}>Library</a>
        <a href="#/roadmap" aria-current=${route.view === "roadmap" ? "page" : null}>Roadmap</a>
        <a href="#/archive" aria-current=${route.view === "archive" ? "page" : null}>Archive</a>
        <a href="#/about" aria-current=${route.view === "about" ? "page" : null}>About</a>
        ${maint ? html`<a href="#/add" aria-current=${route.view === "add" ? "page" : null}>Add PDF</a>` : null}
      </nav>
      <button class="search-trigger" onClick=${onSearch} aria-label="Search">
        <${Icon} name="search" /><span>${copy.searchPlaceholder(count)}</span>
      </button>
      <nav class="topnav" aria-label="Personal">
        <a href="#/me">Me</a>
      </nav>
    </header>`;
  }
  return { Topbar };
});
NTI.define("ui/bottomnav", function () {
  const { html } = window.htmPreact;
  function Bottomnav({ route }) {
    return html`<nav class="bottomnav" aria-label="Primary">
      <a href="#/" aria-current=${route.view === "library" ? "page" : null}>Library</a>
      <a href="#/roadmap" aria-current=${route.view === "roadmap" ? "page" : null}>Roadmap</a>
      <a href="#/me" aria-current=${route.view === "me" ? "page" : null}>Me</a>
    </nav>`;
  }
  return { Bottomnav };
});
