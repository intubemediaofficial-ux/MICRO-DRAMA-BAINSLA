"use client";

import { useState } from "react";

export default function PasswordChange() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/auth/password", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await response.json();
    setMessage(
      response.ok ? "Password updated." : (data.error?.message ?? "Password change failed"),
    );
    if (response.ok) {
      setCurrentPassword("");
      setNewPassword("");
    }
  }
  return (
    <section className="mt-8 rounded-3xl bg-zinc-900 p-6">
      <h2 className="text-xl font-bold">Change password</h2>
      <form onSubmit={submit} className="mt-3 grid gap-3 sm:max-w-md">
        <input
          required
          type="password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          placeholder="Current password"
          className="rounded-xl bg-zinc-800 p-3"
        />
        <input
          required
          minLength={8}
          type="password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          placeholder="New password (8+ characters)"
          className="rounded-xl bg-zinc-800 p-3"
        />
        <button className="rounded-xl bg-rose-500 p-3 font-bold">Update password</button>
      </form>
      {message && <p className="mt-3 text-sm text-zinc-400">{message}</p>}
    </section>
  );
}
