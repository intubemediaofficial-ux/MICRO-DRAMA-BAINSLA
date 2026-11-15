import { getTheme } from "@/server/site-config";

export default async function SiteFooter() {
  const theme = await getTheme();
  const copyright = theme.copyright.replaceAll("{year}", String(new Date().getFullYear()));
  const socials = Object.entries(theme.social).filter(([, href]) => Boolean(href));
  return (
    <footer className="border-t border-white/10 px-5 py-8 text-xs text-zinc-500">
      <p>{copyright}</p>
      <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {theme.footerColumns.map((column) => (
          <section key={column.title}>
            <h2 className="mb-2 font-semibold text-zinc-300">{column.title}</h2>
            <nav className="flex flex-col gap-2">
              {column.links.map((link) => (
                <a key={`${link.label}-${link.href}`} href={link.href} className="hover:text-zinc-200">
                  {link.label}
                </a>
              ))}
            </nav>
          </section>
        ))}
      </div>
      {socials.length > 0 && (
        <nav aria-label={`${theme.siteName} social links`} className="mt-5 flex flex-wrap gap-4">
          {socials.map(([name, href]) => (
            <a key={name} href={href} target="_blank" rel="noopener noreferrer" className="hover:text-zinc-200">
              {name === "x" ? "X" : name[0].toUpperCase() + name.slice(1)}
            </a>
          ))}
        </nav>
      )}
    </footer>
  );
}
