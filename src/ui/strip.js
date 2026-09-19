// strip.js — pipeline strip (toolbar, roving tabindex, aria-pressed).
NTI.define("ui/strip", function () {
  const { html } = window.htmPreact;
  function Strip({ tracks, selected, counts, onToggle }) {
    return html`<div class="strip" role="toolbar" aria-label="Tracks">
      ${tracks.map((t) => {
        const on = (selected || []).includes(t.id);
        const c = counts[t.id] || { done: 0, total: 0 };
        return html`<button class="strip-node" data-track=${t.id}
          aria-pressed=${on ? "true" : "false"} onClick=${() => onToggle(t.id)}
          title="${t.title} — ${c.done}/${c.total}">
          <span class="dot"></span><span>${t.short}</span>
          <span class="n">${c.done}/${c.total}</span></button>`;
      })}
    </div>`;
  }
  return { Strip };
});
