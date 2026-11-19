"use client";

import { useState } from "react";

export default function DeleteAccountButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function deleteAccount() {
    if (!window.confirm("Permanently delete your Intube Drama account? This cannot be undone."))
      return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error?.message ?? "Could not delete your account.");
        return;
      }
      window.location.assign("/");
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6">
      <button
        type="button"
        onClick={deleteAccount}
        disabled={busy}
        className="rounded-full bg-rose-600 px-5 py-3 font-bold text-white disabled:opacity-60"
      >
        {busy ? "Deleting…" : "Delete account"}
      </button>
      {error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
    </section>
  );
}
