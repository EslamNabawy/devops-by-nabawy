// md-render: markdown-it + anchor + build-time highlight + sanitize allowlist.
// GFM alerts -> callout markup. Tables wrapped in scroll containers at emit.
import MarkdownIt from "markdown-it";
import hljs from "highlight.js";
import sanitizeHtml from "sanitize-html";

const md = new MarkdownIt({ html: true, linkify: true, typographer: false });
md.options.highlight = (str, lang) => {
  try {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(str, { language: lang }).value;
    }
    return hljs.highlightAuto(str).value;
  } catch {
    return md.utils.escapeHtml(str);
  }
};

const ALERT_RE = /<blockquote>\s*<p>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/gi;

export function kebab(s) {
  return s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 80) || "section";
}

export function renderMarkdown(src) {
  let html = md.render(src);
  html = html.replace(ALERT_RE, (_, k) =>
    `<div class="callout callout-${k.toLowerCase()}"><p>`);
  return html;
}

export function sanitize(dirty) {
  return sanitizeHtml(dirty, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(
      ["img", "h1", "h2", "h3", "h4", "input", "div", "span", "section",
       "details", "summary", "pre"]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "title", "width", "height", "loading"],
      h1: ["id"], h2: ["id"], h3: ["id"], h4: ["id"], h5: ["id"],
      h6: ["id"],
      code: ["class"], pre: ["class", "data-lang"],
      div: ["class"], span: ["class", "dir"],
      input: ["type", "checked", "disabled"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: (tag, attribs) => {
        const href = attribs.href || "";
        if (/^https?:/i.test(href)) {
          return { tagName: "a",
                   attribs: { ...attribs, target: "_blank",
                              rel: "noopener noreferrer" } };
        }
        return { tagName: "a", attribs };
      },
    },
  });
}

export function assignHeadingIds(html) {
  const seen = new Map();
  const toc = [];
  const out = html.replace(/<(h[1-6])([^>]*)>(.*?)<\/\1>/gi,
    (m, tag, attrs, inner) => {
      const text = inner.replace(/<[^>]+>/g, "").trim();
      let id = kebab(text);
      const n = (seen.get(id) || 0) + 1;
      seen.set(id, n);
      if (n > 1) id = `${id}-${n}`;
      toc.push({ id, text, level: Number(tag[1]) });
      if (/id=/.test(attrs)) return m;
      return `<${tag}${attrs} id="${id}">${inner}</${tag}>`;
    });
  return { html: out, toc };
}

export function stripToText(htmlOrMd) {
  return htmlOrMd.replace(/<script[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>/g, " ").replace(/[#>*`\[\]()!|]/g, " ")
    .replace(/[A-Za-z0-9+/=]{120,}/g, " ")
    .replace(/\s+/g, " ").trim();
}
