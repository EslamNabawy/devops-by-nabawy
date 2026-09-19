// primitives.js — Button, Chip, Toast, Modal, Skeleton, EmptyState.
NTI.define("ui/primitives", function () {
  const { html } = window.htmPreact;
  let toastTimer = null;
  function toast(msg, action) {
    let el = document.querySelector(".toast-stack");
    if (!el) {
      el = document.createElement("div");
      el.className = "toast-stack";
      el.setAttribute("aria-live", "polite");
      document.body.appendChild(el);
    }
    el.innerHTML = "";
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    if (action) {
      const b = document.createElement("button");
      b.className = "btn btn-ghost";
      b.textContent = action.label;
      b.onclick = () => { action.fn(); el.innerHTML = ""; };
      t.appendChild(b);
    }
    el.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.innerHTML = ""; }, 4000);
  }
  function EmptyState({ title, body, actionLabel, onAction }) {
    return html`<div class="empty">
      <h2>${title}</h2><p>${body}</p>
      ${actionLabel ? html`<button class="btn btn-primary" onClick=${onAction}>${actionLabel}</button>` : null}
    </div>`;
  }
  function Skeleton() {
    return html`<div class="skeleton" aria-label="Loading"><span></span><span></span><span></span></div>`;
  }
  return { toast, EmptyState, Skeleton };
});
