"use client";
import { useState } from "react";
export default function LoginForm() {
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [requested, setRequested] = useState(false);
  const [mode, setMode] = useState<"otp" | "password">("otp");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (mode === "password") {
      const response = await fetch("/api/auth/password/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: identifier, password }),
      });
      const data = await response.json();
      if (response.ok) location.href = "/";
      else setMessage(data.error?.message ?? "Invalid email or password");
      return;
    }
    const endpoint = requested ? "/api/auth/verify" : "/api/auth/request";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requested ? { identifier, code } : { identifier }),
    });
    const data = await response.json();
    if (response.ok && !requested) {
      setRequested(true);
      setMessage("OTP sent. In dev, use 123456.");
    } else if (response.ok) location.href = "/";
    else setMessage(data.error?.message ?? "Something went wrong");
  }
  return (
    <form onSubmit={submit} className="mt-8 space-y-4">
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-zinc-800 p-1">
        <button
          type="button"
          onClick={() => setMode("otp")}
          className={`rounded-lg p-2 text-sm font-bold ${mode === "otp" ? "bg-zinc-700" : "text-zinc-400"}`}
        >
          OTP
        </button>
        <button
          type="button"
          onClick={() => setMode("password")}
          className={`rounded-lg p-2 text-sm font-bold ${mode === "password" ? "bg-zinc-700" : "text-zinc-400"}`}
        >
          Password
        </button>
      </div>
      <input
        required
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        placeholder={mode === "password" ? "Email" : "Phone or email"}
        className="w-full rounded-xl bg-zinc-800 p-4 outline-none ring-rose-500 focus:ring-2"
      />
      {mode === "password" ? (
        <input
          required
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-xl bg-zinc-800 p-4 outline-none ring-rose-500 focus:ring-2"
        />
      ) : (
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={requested ? "6-digit OTP" : "OTP appears after request"}
          disabled={!requested}
          className="w-full rounded-xl bg-zinc-800 p-4 outline-none ring-rose-500 focus:ring-2"
        />
      )}
      <button className="w-full rounded-xl bg-rose-500 p-4 font-bold">
        {mode === "password" ? "Sign in" : requested ? "Enter MicroDrama" : "Send OTP"}
      </button>
      {message && <p className="text-sm text-zinc-400">{message}</p>}
    </form>
  );
}
