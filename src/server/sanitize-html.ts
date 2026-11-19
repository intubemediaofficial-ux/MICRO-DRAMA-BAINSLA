import sanitizeHtml from "sanitize-html";

const widthPattern = /^\d+(?:\.\d+)?(?:px|%)$/i;
const hexColorPattern = /^#[\da-f]{3,8}$/i;

const options: sanitizeHtml.IOptions = {
  allowProtocolRelative: false,
  allowedTags: [
    "p", "br", "h1", "h2", "h3", "h4", "strong", "b", "em", "i", "u", "s", "del", "mark",
    "code", "pre", "blockquote", "ul", "ol", "li", "a", "img", "figure", "figcaption", "hr",
    "span", "sub", "sup", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "colgroup",
    "col", "div", "details", "summary", "iframe",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel", "class"],
    img: ["src", "alt", "width", "height", "class", "style"],
    td: ["colspan", "rowspan", "style"],
    th: ["colspan", "rowspan", "style"],
    col: ["span", "style"],
    p: ["style", "class"],
    h1: ["style", "class"],
    h2: ["style", "class"],
    h3: ["style", "class"],
    h4: ["style", "class"],
    span: ["style", "class"],
    div: ["data-type", "class", "style"],
    details: ["data-type", "class", "open"],
    summary: ["class"],
    figure: ["class"],
    figcaption: ["class"],
    table: ["class"],
    iframe: ["src", "width", "height", "allowfullscreen", "allow", "frameborder"],
  },
  allowedClasses: {
    "*": [/^cms-[a-z0-9-]+$/i, /^align-(left|center|right|justify)$/i],
  },
  allowedStyles: {
    "*": {
      color: [hexColorPattern],
      "background-color": [hexColorPattern],
      "text-align": [/^(left|center|right|justify)$/],
    },
    img: { width: [widthPattern] },
    td: { width: [widthPattern] },
    th: { width: [widthPattern] },
    col: { width: [widthPattern] },
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedIframeHostnames: ["www.youtube-nocookie.com", "www.youtube.com"],
  transformTags: {
    a: (_tagName, attributes) => {
      const next = { ...attributes };
      if (next.target === "_blank") next.rel = "noopener noreferrer";
      else if (next.target !== "_self") delete next.target;
      return { tagName: "a", attribs: next };
    },
  },
};

export function sanitizeContentHtml(html: string) {
  return sanitizeHtml(html, options);
}

export { options as contentHtmlSanitizeOptions };
