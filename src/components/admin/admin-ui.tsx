"use client";

import { createContext, useCallback, useContext, useState } from "react";

type ToastKind = "success" | "error" | "info";
type Toast = { id: number; kind: ToastKind; message: string };

const ToastContext = createContext<{
  toast: (message: string, kind?: ToastKind) => void;
}>({ toast: () => undefined });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((message: string, kind: ToastKind = "success") => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, kind, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 5000);
  }, []);
  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-3">
        {toasts.map((item) => (
          <div
            key={item.id}
            role="status"
            className={`rounded-xl border px-4 py-3 text-sm shadow-2xl ${
              item.kind === "error"
                ? "border-rose-400/40 bg-rose-950 text-rose-100"
                : item.kind === "info"
                  ? "border-sky-400/40 bg-sky-950 text-sky-100"
                  : "border-emerald-400/40 bg-emerald-950 text-emerald-100"
            }`}
          >
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext).toast;
}

export function Section({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-900/80 p-5 shadow-xl shadow-black/10">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          {description && <p className="mt-1 text-sm text-zinc-400">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Field({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-semibold text-zinc-200">{label}</span>
      {helper && <span className="block text-xs leading-5 text-zinc-500">{helper}</span>}
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm outline-none transition focus:border-rose-400 focus:ring-2 focus:ring-rose-400/20";

export function Button({
  children,
  variant = "primary",
  pending = false,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "destructive";
  pending?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={disabled || pending}
      className={`rounded-xl px-4 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
        variant === "primary"
          ? "bg-rose-500 text-white hover:bg-rose-400"
          : variant === "destructive"
            ? "border border-rose-400/30 bg-rose-950 text-rose-200 hover:bg-rose-900"
            : "border border-white/10 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
      } ${props.className ?? ""}`}
    >
      {pending ? "Saving…" : children}
    </button>
  );
}

export function StatusChip({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "success" | "warning" | "danger" | "neutral";
}) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
        tone === "success"
          ? "bg-emerald-400/15 text-emerald-300"
          : tone === "warning"
            ? "bg-amber-400/15 text-amber-300"
            : tone === "danger"
              ? "bg-rose-400/15 text-rose-300"
              : "bg-zinc-700 text-zinc-300"
      }`}
    >
      {children}
    </span>
  );
}

export function Confirm({
  children,
  message,
  onConfirm,
  pending = false,
}: {
  children: React.ReactNode;
  message: string;
  onConfirm: () => void;
  pending?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="destructive"
      pending={pending}
      onClick={() => {
        if (window.confirm(message)) onConfirm();
      }}
    >
      {children}
    </Button>
  );
}
