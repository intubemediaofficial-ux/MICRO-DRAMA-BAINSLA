"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { buildRobotsText } from "@/lib/robots";
import { brandScale } from "@/lib/theme";
import SeoTools from "@/components/admin/seo-tools";

type Config = Record<string, any>;

const themeTabs = [
  "Branding",
  "Colours & fonts",
  "Announcement",
  "Menus & footer",
  "Homepage",
  "Custom CSS",
] as const;
const seoTabs = [
  "General",
  "Knowledge Graph",
  "Webmaster verification",
  "Sitemap & robots",
  "Analytics",
  "Redirects",
] as const;
const sectionKeys = ["continueWatching", "hero", "rails", "latestPosts"] as const;
const sectionVisibility: Record<(typeof sectionKeys)[number], string> = {
  continueWatching: "showContinueWatching",
  hero: "showHero",
  rails: "showRails",
  latestPosts: "showLatestPosts",
};
const socialNetworks = ["instagram", "youtube", "facebook", "x", "whatsapp", "telegram"] as const;

function valueAt(value: Config, path: string): any {
  return path.split(".").reduce((current, key) => current?.[key], value);
}

export default function SiteConfigEditor({ kind }: { kind: "seo" | "theme" }) {
  const endpoint = kind === "seo" ? "/api/admin/seo" : "/api/admin/theme";
  const tabs = kind === "seo" ? seoTabs : themeTabs;
  const [config, setConfig] = useState<Config | null>(null);
  const [defaults, setDefaults] = useState<Config | null>(null);
  const [tab, setTab] = useState<string>(tabs[0]);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadingPath, setUploadingPath] = useState("");
  const previewFrame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let active = true;
    void fetch(endpoint)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || "Unable to load settings");
        if (active) {
          setConfig(result[kind]);
          setDefaults(result.defaults);
        }
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "Unable to load settings");
      });
    return () => { active = false; };
  }, [endpoint, kind]);

  function update(path: string, value: unknown) {
    setConfig((previous) => {
      if (!previous) return previous;
      const copy = structuredClone(previous);
      const keys = path.split(".");
      const last = keys.pop()!;
      const parent = keys.reduce((current, key) => current[key], copy);
      parent[last] = value;
      return copy;
    });
    setSavedMessage("");
  }

  function updateRow(path: string, index: number, field: string, value: unknown) {
    const rows = valueAt(config!, path) as Config[];
    update(path, rows.map((row, current) => current === index ? { ...row, [field]: value } : row));
  }

  function removeRow(path: string, index: number) {
    const rows = valueAt(config!, path) as Config[];
    update(path, rows.filter((_, current) => current !== index));
  }

  function moveRow(path: string, index: number, direction: -1 | 1) {
    const rows = [...valueAt(config!, path)] as Config[];
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    [rows[index], rows[target]] = [rows[target], rows[index]];
    update(path, rows);
  }

  async function submit(value: Config, successMessage: string) {
    setBusy(true);
    setError("");
    setSavedMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(value),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Save failed");
      setConfig(result[kind]);
      setError("");
      setSavedMessage(successMessage);
      if (kind === "theme") previewFrame.current?.contentWindow?.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (config) await submit(config, "Settings saved.");
  }

  async function reset() {
    if (!defaults || !window.confirm("Reset all appearance settings to their defaults?")) return;
    await submit(defaults, "Appearance reset to defaults.");
  }

  async function uploadImage(path: string, file?: File) {
    if (!file) return;
    setUploadingPath(path);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("category", "content");
      const response = await fetch("/api/admin/media/upload", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Upload failed");
      update(path, result.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed");
    } finally {
      setUploadingPath("");
    }
  }

  const textInput = (label: string, path: string, type = "text") => (
    <label className="block text-sm">{label}
      <input type={type} className="mt-1 w-full rounded-lg bg-zinc-950 p-2" value={valueAt(config!, path) ?? ""} onChange={(event) => update(path, event.target.value)} />
    </label>
  );
  const textArea = (label: string, path: string, minHeight = "min-h-24") => (
    <label className="block text-sm">{label}
      <textarea className={`mt-1 w-full rounded-lg bg-zinc-950 p-2 ${minHeight}`} value={valueAt(config!, path) ?? ""} onChange={(event) => update(path, event.target.value)} />
    </label>
  );
  const check = (label: string, path: string) => (
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(valueAt(config!, path))} onChange={(event) => update(path, event.target.checked)} />{label}</label>
  );
  const imageControl = (label: string, path: string) => {
    const url = valueAt(config!, path) as string | undefined;
    return (
      <div className="space-y-2">
        <label className="block text-sm">{label}
          <input type="text" className="mt-1 w-full rounded-lg bg-zinc-950 p-2" value={url ?? ""} onChange={(event) => update(path, event.target.value)} />
        </label>
        <label className="inline-flex cursor-pointer items-center rounded-lg bg-zinc-800 px-3 py-2 text-xs">
          {uploadingPath === path ? "Uploading…" : "Upload image"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
            className="sr-only"
            disabled={Boolean(uploadingPath)}
            onChange={(event) => void uploadImage(path, event.target.files?.[0])}
          />
        </label>
        {url && <img src={url} alt={`${label} preview`} className="max-h-24 max-w-full rounded-lg object-contain" />}
      </div>
    );
  };
  const sectionTitle = (title: string, children: ReactNode) => (
    <section className="space-y-4 rounded-xl bg-zinc-900 p-4">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  );

  if (!config) return <p role={error ? "alert" : undefined} className="p-6 text-zinc-400">{error || "Loading settings…"}</p>;

  const homeOrder = [...new Set([
    ...config.home.sectionOrder,
    ...sectionKeys.filter((key) => !config.home.sectionOrder.includes(key)),
  ])] as string[];
  return (
    <main className="space-y-5 p-5">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-black">{kind === "seo" ? "SEO settings" : "Theme customizer"}</h1>
        <button type="button" disabled={busy} onClick={() => void save()} className="rounded-lg bg-rose-600 px-5 py-2 font-bold disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
        {kind === "theme" && <button type="button" disabled={busy || !defaults} onClick={() => void reset()} className="rounded-lg bg-zinc-700 px-4 py-2 text-sm disabled:opacity-50">Reset to defaults</button>}
      </header>
      {error && <p role="alert" className="rounded-lg bg-red-950 p-3 text-sm text-red-200">{error}</p>}
      {savedMessage && <p role="status" className="text-sm text-emerald-300">{savedMessage}</p>}
      <nav className="flex flex-wrap gap-2 border-b border-white/10 pb-3" aria-label={`${kind} settings sections`}>
        {tabs.map((item) => (
          <button key={item} type="button" aria-pressed={tab === item} onClick={() => setTab(item)} className={`rounded-lg px-3 py-2 text-sm ${tab === item ? "bg-rose-500/20 text-rose-200" : "bg-zinc-900 text-zinc-400"}`}>
            {item}
          </button>
        ))}
      </nav>

      {kind === "theme" && tab === "Branding" && sectionTitle("Branding", (
        <div className="grid gap-4 sm:grid-cols-2">
          {textInput("Site name", "siteName")}
          {textInput("Tagline", "tagline")}
          {textInput("Kicker", "kicker")}
          {imageControl("Logo", "logoUrl")}
          {imageControl("Favicon", "faviconUrl")}
        </div>
      ))}

      {kind === "theme" && tab === "Colours & fonts" && sectionTitle("Colours & fonts", (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {textInput("Brand colour", "brandColor", "color")}
            {textInput("Gold accent", "accentGold", "color")}
            <label className="text-sm">Neutral preset
              <select value={config.neutralPreset} onChange={(event) => update("neutralPreset", event.target.value)} className="mt-1 w-full rounded-lg bg-zinc-950 p-2">
                {["zinc", "slate", "stone", "neutral", "gray"].map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="text-sm">Font
              <select value={config.fontFamily} onChange={(event) => update("fontFamily", event.target.value)} className="mt-1 w-full rounded-lg bg-zinc-950 p-2">
                {["system", "Inter", "Poppins", "Roboto", "Noto Sans", "Montserrat", "Mukta", "Hind", "Baloo 2"].map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="text-sm">Corner radius
              <select value={config.radius} onChange={(event) => update("radius", event.target.value)} className="mt-1 w-full rounded-lg bg-zinc-950 p-2">
                {["sm", "md", "lg", "xl"].map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Generated brand scale</h3>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-11">
              {Object.entries(brandScale(config.brandColor)).map(([shade, rgb]) => (
                <div key={shade} className="overflow-hidden rounded-lg border border-white/10">
                  <div className="h-12" style={{ backgroundColor: `rgb(${rgb})` }} />
                  <p className="bg-zinc-950 py-1 text-center text-xs text-zinc-300">{shade}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}

      {kind === "theme" && tab === "Announcement" && sectionTitle("Announcement bar", (
        <div className="grid gap-4 sm:grid-cols-2">
          {check("Enable announcement", "announcement.enabled")}
          {textInput("Text", "announcement.text")}
          {textInput("Link", "announcement.href")}
          {textInput("Background colour", "announcement.bg", "color")}
          {textInput("Text colour", "announcement.fg", "color")}
        </div>
      ))}

      {kind === "theme" && tab === "Menus & footer" && (
        <div className="space-y-5">
          {sectionTitle("Header menu", (
            <div className="space-y-3">
              {(config.headerMenu as Config[]).map((item, index) => (
                <div key={index} className="grid items-end gap-2 rounded-lg border border-white/10 p-3 sm:grid-cols-[1fr_2fr_auto]">
                  <label className="block text-sm">Label<input className="mt-1 w-full rounded-lg bg-zinc-950 p-2" value={item.label} onChange={(event) => updateRow("headerMenu", index, "label", event.target.value)} /></label>
                  <label className="block text-sm">Link<input className="mt-1 w-full rounded-lg bg-zinc-950 p-2" value={item.href} onChange={(event) => updateRow("headerMenu", index, "href", event.target.value)} /></label>
                  <div className="flex gap-1">
                    <button type="button" disabled={index === 0} onClick={() => moveRow("headerMenu", index, -1)} aria-label="Move menu item up" className="rounded bg-zinc-800 px-2 py-2 disabled:opacity-40">↑</button>
                    <button type="button" disabled={index === config.headerMenu.length - 1} onClick={() => moveRow("headerMenu", index, 1)} aria-label="Move menu item down" className="rounded bg-zinc-800 px-2 py-2 disabled:opacity-40">↓</button>
                    <button type="button" onClick={() => removeRow("headerMenu", index)} aria-label="Remove menu item" className="rounded bg-red-950 px-2 py-2 text-red-200">×</button>
                  </div>
                </div>
              ))}
              <button type="button" disabled={config.headerMenu.length >= 20} onClick={() => update("headerMenu", [...config.headerMenu, { label: "", href: "/" }])} className="rounded-lg bg-zinc-800 px-3 py-2 text-sm disabled:opacity-50">Add menu item</button>
            </div>
          ))}
          {sectionTitle("Footer", (
            <div className="space-y-5">
              {textInput("Copyright ({year} is replaced)", "copyright")}
              {(config.footerColumns as Config[]).map((column, columnIndex) => (
                <div key={columnIndex} className="space-y-3 rounded-xl border border-white/10 p-3">
                  <div className="flex items-end gap-2">
                    <label className="mr-auto block flex-1 text-sm">Column title<input className="mt-1 w-full rounded-lg bg-zinc-950 p-2" value={column.title} onChange={(event) => updateRow("footerColumns", columnIndex, "title", event.target.value)} /></label>
                    <button type="button" disabled={columnIndex === 0} onClick={() => moveRow("footerColumns", columnIndex, -1)} aria-label="Move footer column up" className="rounded bg-zinc-800 px-2 py-2 disabled:opacity-40">↑</button>
                    <button type="button" disabled={columnIndex === config.footerColumns.length - 1} onClick={() => moveRow("footerColumns", columnIndex, 1)} aria-label="Move footer column down" className="rounded bg-zinc-800 px-2 py-2 disabled:opacity-40">↓</button>
                    <button type="button" onClick={() => removeRow("footerColumns", columnIndex)} className="rounded bg-red-950 px-2 py-2 text-red-200">Remove column</button>
                  </div>
                  {(column.links as Config[]).map((link, linkIndex) => (
                    <div key={linkIndex} className="grid items-end gap-2 sm:grid-cols-[1fr_2fr_auto]">
                      <label className="block text-sm">Label<input className="mt-1 w-full rounded-lg bg-zinc-950 p-2" value={link.label} onChange={(event) => {
                        const links = column.links.map((entry: Config, index: number) => index === linkIndex ? { ...entry, label: event.target.value } : entry);
                        updateRow("footerColumns", columnIndex, "links", links);
                      }} /></label>
                      <label className="block text-sm">Link<input className="mt-1 w-full rounded-lg bg-zinc-950 p-2" value={link.href} onChange={(event) => {
                        const links = column.links.map((entry: Config, index: number) => index === linkIndex ? { ...entry, href: event.target.value } : entry);
                        updateRow("footerColumns", columnIndex, "links", links);
                      }} /></label>
                      <div className="flex gap-1">
                        <button type="button" disabled={linkIndex === 0} onClick={() => {
                          const links = [...column.links];
                          [links[linkIndex - 1], links[linkIndex]] = [links[linkIndex], links[linkIndex - 1]];
                          updateRow("footerColumns", columnIndex, "links", links);
                        }} aria-label="Move footer link up" className="rounded bg-zinc-800 px-2 py-2 disabled:opacity-40">↑</button>
                        <button type="button" disabled={linkIndex === column.links.length - 1} onClick={() => {
                          const links = [...column.links];
                          [links[linkIndex], links[linkIndex + 1]] = [links[linkIndex + 1], links[linkIndex]];
                          updateRow("footerColumns", columnIndex, "links", links);
                        }} aria-label="Move footer link down" className="rounded bg-zinc-800 px-2 py-2 disabled:opacity-40">↓</button>
                        <button type="button" onClick={() => {
                          const links = column.links.filter((_: Config, index: number) => index !== linkIndex);
                          updateRow("footerColumns", columnIndex, "links", links);
                        }} aria-label="Remove footer link" className="rounded bg-red-950 px-2 py-2 text-red-200">×</button>
                      </div>
                    </div>
                  ))}
                  <button type="button" disabled={column.links.length >= 30} onClick={() => updateRow("footerColumns", columnIndex, "links", [...column.links, { label: "", href: "/" }])} className="rounded-lg bg-zinc-800 px-3 py-2 text-xs disabled:opacity-50">Add footer link</button>
                </div>
              ))}
              <button type="button" disabled={config.footerColumns.length >= 8} onClick={() => update("footerColumns", [...config.footerColumns, { title: "", links: [] }])} className="rounded-lg bg-zinc-800 px-3 py-2 text-sm disabled:opacity-50">Add footer column</button>
              <div className="grid gap-3 sm:grid-cols-2">
                {socialNetworks.map((network) => textInput(network, `social.${network}`))}
              </div>
            </div>
          ))}
        </div>
      )}

      {kind === "theme" && tab === "Homepage" && sectionTitle("Homepage sections", (
        <div className="space-y-4">
          {textInput("Hero headline", "home.heroHeadline")}
          <div className="space-y-2">
            {homeOrder.map((key, index) => (
              <div key={key} className="flex items-center gap-3 rounded-lg border border-white/10 p-3">
                <input
                  type="checkbox"
                  aria-label={`Show ${key}`}
                  checked={Boolean(config.home[sectionVisibility[key as keyof typeof sectionVisibility]])}
                  onChange={(event) => update(`home.${sectionVisibility[key as keyof typeof sectionVisibility]}`, event.target.checked)}
                />
                <span className="mr-auto text-sm">{key}</span>
                <button type="button" disabled={index === 0} onClick={() => {
                  const current = homeOrder.indexOf(key);
                  const next = [...homeOrder];
                  [next[current - 1], next[current]] = [next[current], next[current - 1]];
                  update("home.sectionOrder", next);
                }} aria-label={`Move ${key} up`} className="rounded bg-zinc-800 px-2 py-1 disabled:opacity-40">↑</button>
                <button type="button" disabled={index === homeOrder.length - 1} onClick={() => {
                  const current = homeOrder.indexOf(key);
                  const next = [...homeOrder];
                  [next[current], next[current + 1]] = [next[current + 1], next[current]];
                  update("home.sectionOrder", next);
                }} aria-label={`Move ${key} down`} className="rounded bg-zinc-800 px-2 py-1 disabled:opacity-40">↓</button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {kind === "theme" && tab === "Custom CSS" && sectionTitle("Custom CSS", (
        <div>
          {textArea("Custom CSS (20,000 characters maximum)", "customCss", "min-h-80")}
          <p className="mt-1 text-right text-xs text-zinc-500">{config.customCss.length}/20000</p>
        </div>
      ))}

      {kind === "seo" && tab === "General" && sectionTitle("General", (
        <div className="grid gap-4 sm:grid-cols-2">
          {textInput("Site name", "siteName")}
          {textInput("Title separator", "separator")}
          {textInput("Home title", "homeTitle")}
          {textInput("Twitter handle", "twitterHandle")}
          {textArea("Default description", "defaultDescription")}
          {textArea("Home description", "homeDescription")}
          {textInput("Default Open Graph image", "defaultOgImage")}
          <div className="space-y-3 sm:col-span-2">
            <h3 className="font-semibold">Title templates</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {Object.keys(config.titleTemplates).map((key) => textInput(key, `titleTemplates.${key}`))}
            </div>
          </div>
        </div>
      ))}

      {kind === "seo" && tab === "Knowledge Graph" && sectionTitle("Knowledge Graph", (
        <div className="grid gap-4 sm:grid-cols-2">
          {textInput("Organization name", "organization.name")}
          {imageControl("Organization logo", "organization.logo")}
          {textInput("Organization URL", "organization.url")}
          {textInput("Email", "organization.email", "email")}
          {textInput("Phone", "organization.phone", "tel")}
          <div className="space-y-3 sm:col-span-2">
            <div className="flex items-center gap-3">
              <h3 className="mr-auto font-semibold">SameAs URLs</h3>
              <button type="button" disabled={config.organization.sameAs.length >= 30} onClick={() => update("organization.sameAs", [...config.organization.sameAs, ""])} className="rounded-lg bg-zinc-800 px-3 py-2 text-xs disabled:opacity-50">Add URL</button>
            </div>
            {config.organization.sameAs.map((url: string, index: number) => (
              <div key={index} className="flex gap-2">
                <input type="text" value={url} onChange={(event) => update("organization.sameAs", config.organization.sameAs.map((item: string, current: number) => current === index ? event.target.value : item))} className="w-full rounded-lg bg-zinc-950 p-2" aria-label={`SameAs URL ${index + 1}`} />
                <button type="button" onClick={() => update("organization.sameAs", config.organization.sameAs.filter((_: string, current: number) => current !== index))} className="rounded-lg bg-red-950 px-3 text-red-200">Remove</button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {kind === "seo" && tab === "Webmaster verification" && sectionTitle("Webmaster verification", (
        <div className="grid gap-4 sm:grid-cols-2">
          {Object.keys(config.verification).map((key) => textInput(`${key} verification`, `verification.${key}`))}
        </div>
      ))}

      {kind === "seo" && tab === "Sitemap & robots" && sectionTitle("Sitemap & robots", (
        <div className="space-y-4">
          {check("Noindex search pages", "noindexSearch")}
          <div className="grid gap-3 sm:grid-cols-3">
            {Object.keys(config.sitemap).map((key) => check(`Include ${key}`, `sitemap.${key}`))}
          </div>
          {textArea("Extra robots directives (Allow: /path or Disallow: /path)", "robotsExtra")}
          <div>
            <h3 className="mb-2 text-sm font-semibold">robots.txt preview</h3>
            <pre aria-readonly="true" className="overflow-x-auto rounded-xl bg-zinc-950 p-4 text-xs text-zinc-300">{buildRobotsText({ robotsExtra: config.robotsExtra })}</pre>
          </div>
        </div>
      ))}

      {kind === "seo" && tab === "Analytics" && sectionTitle("Analytics", (
        <div className="grid gap-4 sm:grid-cols-2">
          {textInput("GA4 measurement ID", "analytics.ga4Id")}
          {textInput("Google Tag Manager ID", "analytics.gtmId")}
        </div>
      ))}

      {kind === "seo" && tab === "Redirects" && <SeoTools />}

      {kind === "theme" && (
        <section className="space-y-3 rounded-xl bg-zinc-900 p-4">
          <h2 className="font-bold">Live preview</h2>
          <iframe ref={previewFrame} src="/" title="Live homepage preview" className="h-[480px] w-full rounded-lg border border-white/10 bg-black" />
        </section>
      )}
    </main>
  );
}
