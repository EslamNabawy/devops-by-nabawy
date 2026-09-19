// status.js — StatusGlyph, FormatChips, KindLabel, ProgressRing, SegmentedBar.
NTI.define("ui/status", function () {
  const { html } = window.htmPreact;
  const KIND = { lesson: "Lesson", lab: "Lab", script: "Script",
    book: "Book", evidence: "Screenshot", reference: "Reference",
    external: "Online course" };
  function KindLabel({ kind }) {
    return html`<span class="kind">${KIND[kind] || kind}</span>`;
  }
  function FormatChips({ formats }) {
    return html`<span class="chips">${(formats || []).map((f) =>
      f.status === "pending"
        ? html`<span class="chip chip-pending" title="Coming soon">${String(f.type).toUpperCase()}</span>`
        : html`<span class="chip">${String(f.type).toUpperCase()}</span>`)}</span>`;
  }
  function ProgressRing({ done, total }) {
    const p = total ? Math.round((done / total) * 100) : 0;
    return html`<span class="ring" role="img" aria-label="${done} of ${total} done">
      <svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" class="ring-bg"/><circle cx="10" cy="10" r="8" class="ring-fg" stroke-dasharray="${p} 100"/></svg>
      <span class="ring-n">${done}/${total}</span></span>`;
  }
  function SegmentedBar({ done, total }) {
    const p = total ? (done / total) * 100 : 0;
    return html`<span class="segbar"><span class="segbar-f" style="width:${p}%"></span></span>`;
  }
  function StatusGlyph({ state }) {
    return html`<span class="glyph glyph-${state}" aria-hidden="true">${state === "done" ? "✓" : state === "reading" ? "◐" : "○"}</span>`;
  }
  return { KindLabel, FormatChips, ProgressRing, SegmentedBar,
    StatusGlyph, KIND };
});
