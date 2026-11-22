"use client";

import { useEffect, useRef, useState } from "react";
import { analyzeSeo, seoPreviewPath, type SeoContentKind } from "@/lib/seo-analysis";
import { renderTitleTemplate, type SeoFields } from "@/lib/seo";

const tabs = ["General", "Advanced", "Schema", "Social"] as const;

export default function SeoPanel({
  kind,
  title,
  slug,
  description,
  html,
  seo,
  onChange,
}: {
  kind: SeoContentKind;
  title: string;
  slug: string;
  description: string;
  html: string;
  seo: SeoFields;
  onChange: (seo: SeoFields) => void;
}) {
  const [tab, setTab] = useState<(typeof tabs)[number]>("General");
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [keywordsText, setKeywordsText] = useState(() => seo.keywords?.join(", ") || "");
  const lastAppliedKeywords = useRef(seo.keywords?.join(", ") || "");
  const serializedKeywords = seo.keywords?.join(", ") || "";
  useEffect(() => {
    if (serializedKeywords !== lastAppliedKeywords.current) {
      lastAppliedKeywords.current = serializedKeywords;
      setKeywordsText(serializedKeywords);
    }
  }, [serializedKeywords]);
  const patch = (value: Partial<SeoFields>) => onChange({ ...seo, ...value });
  const titleVariables = { title, sitename: "Intube Drama", sep: "|" };
  const renderedTitle = renderTitleTemplate(
    seo.title || "%title% %sep% %sitename%",
    titleVariables,
  );
  const renderedDescription = renderTitleTemplate(
    seo.description || description || "Add a description for search results.",
    titleVariables,
  );
  const truncatedTitle = renderedTitle.length > 60 ? `${renderedTitle.slice(0, 59).trimEnd()}…` : renderedTitle;
  const truncatedDescription = renderedDescription.length > 160
    ? `${renderedDescription.slice(0, 159).trimEnd()}…`
    : renderedDescription;
  const previewPath = seoPreviewPath(kind, slug);
  const titleLengthIsGood = renderedTitle.length >= 30 && renderedTitle.length <= 60;
  const descriptionLengthIsGood = renderedDescription.length >= 120 && renderedDescription.length <= 160;
  const analysis = analyzeSeo({
    kind,
    title,
    seoTitle: renderedTitle,
    description: renderedDescription,
    slug,
    html,
    focusKeyword: seo.focusKeyword,
  });
  const field = "w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm";
  return (
    <section className="mt-8 min-w-0 rounded-2xl border border-white/10 bg-zinc-900 p-4">
      <div className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
        <h2 className="mr-auto text-lg font-bold">SEO</h2>
        <span className="rounded-full bg-rose-500/15 px-3 py-1 text-sm font-bold text-rose-200">{analysis.score}/100</span>
        {tabs.map((item) => (
          <button key={item} type="button" onClick={() => setTab(item)} className={`rounded-lg px-3 py-2 text-xs ${tab === item ? "bg-rose-500/20 text-rose-200" : "bg-zinc-800 text-zinc-400"}`}>
            {item}
          </button>
        ))}
      </div>
      {tab === "General" && (
        <div className="mt-4 grid min-w-0 gap-4">
          <div className="min-w-0 space-y-4">
            <div className="min-w-0 rounded-xl border border-white/10 bg-zinc-950 p-3">
              <div className="mb-3 flex items-center gap-2">
                <p className="mr-auto text-xs text-zinc-500">Google search preview</p>
                {(["desktop", "mobile"] as const).map((device) => (
                  <button
                    key={device}
                    type="button"
                    aria-pressed={previewDevice === device}
                    onClick={() => setPreviewDevice(device)}
                    className={`rounded-md px-2 py-1 text-xs capitalize ${previewDevice === device ? "bg-rose-500/20 text-rose-200" : "bg-zinc-800 text-zinc-400"}`}
                  >
                    {device}
                  </button>
                ))}
              </div>
              <div className={`rounded-lg bg-white p-3 text-left text-black ${previewDevice === "desktop" ? "max-w-[600px]" : "max-w-[360px]"}`}>
                <p className="break-all text-xs text-[#4d5156]">https://intubedrama.com{previewPath}</p>
                <p className="mt-1 break-words text-xl leading-6 text-[#1a0dab]" title={renderedTitle}>{truncatedTitle || "SEO title"}</p>
                <p className="mt-1 break-words text-sm leading-5 text-[#4d5156]" title={renderedDescription}>{truncatedDescription}</p>
              </div>
            </div>
            <label className="block text-sm">SEO title <span className={`text-xs ${titleLengthIsGood ? "text-emerald-400" : "text-amber-300"}`}>{renderedTitle.length}/60 rendered</span>
              <input className={`${field} mt-1`} maxLength={120} value={seo.title || ""} onChange={(event) => patch({ title: event.target.value })} placeholder="%title% %sep% %sitename%" />
            </label>
            <label className="block text-sm">Meta description <span className={`text-xs ${descriptionLengthIsGood ? "text-emerald-400" : "text-amber-300"}`}>{renderedDescription.length}/160 rendered</span>
              <textarea className={`${field} mt-1 min-h-24`} maxLength={320} value={seo.description || ""} onChange={(event) => patch({ description: event.target.value })} />
            </label>
            <label className="block text-sm">Focus keyword
              <input className={`${field} mt-1`} value={seo.focusKeyword || ""} onChange={(event) => patch({ focusKeyword: event.target.value })} />
            </label>
            <label className="block text-sm">Keywords (comma separated)
              <input className={`${field} mt-1`} value={keywordsText} onChange={(event) => {
                const value = event.target.value;
                const keywords = value.split(",").map((part) => part.trim()).filter(Boolean).slice(0, 20);
                setKeywordsText(value);
                lastAppliedKeywords.current = keywords.join(", ");
                patch({ keywords });
              }} />
            </label>
          </div>
          <div className="min-w-0">
            <h3 className="mb-2 font-semibold">SEO analysis</h3>
            <ul className="space-y-2 text-sm">
              {analysis.checks.map((check) => (
                <li key={check.id} className="flex gap-2">
                  <span className={check.status === "pass" ? "text-emerald-400" : check.status === "warn" ? "text-amber-300" : "text-rose-400"}>
                    {check.status === "pass" ? "✓" : check.status === "warn" ? "!" : "×"}
                  </span>
                  {check.label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {tab === "Advanced" && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm">Canonical URL<input className={`${field} mt-1`} value={seo.canonical || ""} onChange={(event) => patch({ canonical: event.target.value })} placeholder="/page-slug or https://…" /></label>
          <label className="text-sm">Breadcrumb title<input className={`${field} mt-1`} value={seo.breadcrumbTitle || ""} onChange={(event) => patch({ breadcrumbTitle: event.target.value })} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(seo.noindex)} onChange={(event) => patch({ noindex: event.target.checked })} />Noindex</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(seo.nofollow)} onChange={(event) => patch({ nofollow: event.target.checked })} />Nofollow</label>
        </div>
      )}
      {tab === "Schema" && (
        <div className="mt-4 space-y-4">
          <label className="block text-sm">Schema type
            <select className={`${field} mt-1`} value={seo.schemaType || "Auto"} onChange={(event) => patch({ schemaType: event.target.value as SeoFields["schemaType"] })}>
              {["Auto", "WebPage", "AboutPage", "ContactPage", "Article", "BlogPosting", "NewsArticle", "FAQPage", "TVSeries", "TVEpisode", "None"].map((type) => <option key={type}>{type}</option>)}
            </select>
          </label>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <h3 className="mr-auto text-sm font-semibold">FAQ items</h3>
              <button
                type="button"
                disabled={(seo.faq?.length ?? 0) >= 30}
                onClick={() => patch({ faq: [...(seo.faq ?? []), { question: "", answer: "" }] })}
                className="rounded-lg bg-zinc-800 px-3 py-2 text-xs disabled:opacity-50"
              >
                Add question
              </button>
            </div>
            {(seo.faq ?? []).map((item, index) => (
              <div key={index} className="grid gap-3 rounded-xl border border-white/10 bg-zinc-950 p-3 sm:grid-cols-2">
                <label className="block text-sm">Question
                  <input
                    className={`${field} mt-1`}
                    maxLength={500}
                    value={item.question}
                    onChange={(event) => patch({ faq: (seo.faq ?? []).map((entry, current) => current === index ? { ...entry, question: event.target.value } : entry) })}
                  />
                </label>
                <label className="block text-sm">Answer
                  <textarea
                    className={`${field} mt-1 min-h-20`}
                    maxLength={5000}
                    value={item.answer}
                    onChange={(event) => patch({ faq: (seo.faq ?? []).map((entry, current) => current === index ? { ...entry, answer: event.target.value } : entry) })}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => patch({ faq: (seo.faq ?? []).filter((_, current) => current !== index) })}
                  className="justify-self-start text-xs text-red-300 sm:col-span-2"
                >
                  Remove question
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {tab === "Social" && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm">Open Graph title<input className={`${field} mt-1`} value={seo.ogTitle || ""} onChange={(event) => patch({ ogTitle: event.target.value })} /></label>
          <label className="text-sm">Open Graph image URL<input className={`${field} mt-1`} value={seo.ogImage || ""} onChange={(event) => patch({ ogImage: event.target.value })} /></label>
          <label className="text-sm sm:col-span-2">Open Graph description<textarea className={`${field} mt-1`} value={seo.ogDescription || ""} onChange={(event) => patch({ ogDescription: event.target.value })} /></label>
          <label className="text-sm">Twitter card
            <select className={`${field} mt-1`} value={seo.twitterCard || "summary_large_image"} onChange={(event) => patch({ twitterCard: event.target.value as SeoFields["twitterCard"] })}>
              <option value="summary_large_image">Large image</option><option value="summary">Summary</option>
            </select>
          </label>
          <div className="rounded-xl border border-white/10 bg-zinc-950 p-3 text-sm"><p className="text-xs text-zinc-500">Social card preview</p><strong>{seo.ogTitle || seo.title || title || "Title"}</strong><p className="text-zinc-400">{seo.ogDescription || seo.description || description}</p></div>
        </div>
      )}
    </section>
  );
}
