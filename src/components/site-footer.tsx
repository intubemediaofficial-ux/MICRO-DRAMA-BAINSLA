import Link from "next/link";

const links = [
  ["/privacy", "Privacy"],
  ["/terms", "Terms"],
  ["/refund-policy", "Refund policy"],
  ["/contact", "Contact"],
] as const;

export default function SiteFooter() {
  return (
    <footer className="border-t border-white/10 px-5 py-8 text-xs text-zinc-500">
      <p>© Intube Media · intubedrama.com</p>
      <nav className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {links.map(([href, label]) => (
          <Link key={href} href={href} className="hover:text-zinc-200">{label}</Link>
        ))}
      </nav>
    </footer>
  );
}
