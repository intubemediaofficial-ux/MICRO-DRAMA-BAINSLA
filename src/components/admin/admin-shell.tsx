"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ToastProvider } from "./admin-ui";

const nav = [
  ["Dashboard", "/admin"],
  ["Series", "/admin/series"],
  ["Home curation", "/admin/home"],
  ["Users", "/admin/users"],
  ["Subscriptions", "/admin/subscriptions"],
  ["Commerce", "/admin/commerce"],
  ["Marketing", "/admin/commerce#marketing"],
  ["Analytics", "/admin/analytics"],
  ["Settings", "/admin/settings"],
];

export default function AdminShell({
  children,
  email,
}: {
  children: React.ReactNode;
  email: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <ToastProvider>
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <button
          type="button"
          aria-label="Open admin navigation"
          onClick={() => setOpen(true)}
          className="fixed left-4 top-4 z-40 rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-lg md:hidden"
        >
          ☰
        </button>
        {open && (
          <button
            type="button"
            aria-label="Close admin navigation"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/60 md:hidden"
          />
        )}
        <aside
          className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-white/10 bg-zinc-900 px-4 py-5 transition-transform md:translate-x-0 ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="mb-8 flex items-center justify-between px-2">
            <div>
              <p className="text-sm font-black tracking-[0.18em] text-rose-400">MICRODRAMA</p>
              <p className="mt-1 text-xs text-zinc-500">Admin workspace</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="text-zinc-500 md:hidden">
              ×
            </button>
          </div>
          <nav className="space-y-1">
                {nav.map(([label, href]) => {
              const baseHref = href.split("#")[0];
              const active = pathname === baseHref || (baseHref !== "/admin" && pathname.startsWith(baseHref));
              return (
                    <Link
                      key={label}
                  href={href as never}
                  onClick={() => setOpen(false)}
                  className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    active ? "bg-rose-500/15 text-rose-300" : "text-zinc-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <span>{label}</span>
                  {active && <span>›</span>}
                </Link>
              );
            })}
          </nav>
          <Link
            href="/"
            className="absolute bottom-6 left-4 right-4 rounded-xl border border-white/10 px-3 py-2.5 text-center text-sm text-zinc-400 hover:bg-white/5 hover:text-white"
          >
            View site →
          </Link>
        </aside>
        <div className="md:pl-64">
          <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between border-b border-white/10 bg-zinc-950/90 px-5 py-3 pl-16 backdrop-blur md:px-8 md:pl-8">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-rose-400">Admin panel</p>
              <p className="mt-1 text-sm text-zinc-400">Manage your stories and audience</p>
            </div>
            <div className="flex items-center gap-3 text-right">
              <div className="hidden sm:block">
                <p className="text-sm font-semibold">{email}</p>
                <p className="text-xs text-zinc-500">Administrator</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-500 font-black">
                {email.slice(0, 1).toUpperCase()}
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-7xl p-4 pb-24 sm:p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
