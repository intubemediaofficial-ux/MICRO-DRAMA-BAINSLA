import { sanitizeContentHtml } from "@/server/sanitize-html";

export default function CmsHtml({ html, className = "" }: { html: string; className?: string }) {
  return (
    <div
      className={`cms-content ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: sanitizeContentHtml(html) }}
    />
  );
}
