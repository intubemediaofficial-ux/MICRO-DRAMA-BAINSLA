"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";

type SecretStatus = { set: boolean; last4?: string; client_email?: string };
type SettingsResponse = {
  RAZORPAY_KEY_ID?: string;
  RAZORPAY_KEY_SECRET: SecretStatus;
  RAZORPAY_WEBHOOK_SECRET: SecretStatus;
  MUSE_API_KEY: SecretStatus;
  MUSE_TEXT_MODEL?: string;
  MUSE_IMAGE_MODEL?: string;
  PAYMENTS_ENABLED?: boolean;
  FIREBASE_SERVICE_ACCOUNT_JSON: SecretStatus;
  FIREBASE_ANDROID_APP_ID?: string;
  FIREBASE_API_KEY?: string;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_SENDER_ID?: string;
  ANDROID_CERT_SHA256?: string;
  GOOGLE_OAUTH_WEB_CLIENT_ID?: string;
  ADMOB_REWARDED_UNIT_ID?: string;
  ADS_ENABLED?: boolean;
  REFERRAL_BONUS_COINS?: number;
};

type FormValues = {
  RAZORPAY_KEY_ID: string;
  MUSE_TEXT_MODEL: string;
  MUSE_IMAGE_MODEL: string;
  PAYMENTS_ENABLED: boolean;
  FIREBASE_ANDROID_APP_ID: string;
  FIREBASE_API_KEY: string;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_SENDER_ID: string;
  ANDROID_CERT_SHA256: string;
  GOOGLE_OAUTH_WEB_CLIENT_ID: string;
  ADMOB_REWARDED_UNIT_ID: string;
  ADS_ENABLED: boolean;
  REFERRAL_BONUS_COINS: number;
};

type SecretKey =
  | "RAZORPAY_KEY_SECRET"
  | "RAZORPAY_WEBHOOK_SECRET"
  | "MUSE_API_KEY"
  | "FIREBASE_SERVICE_ACCOUNT_JSON";

const initialValues: FormValues = {
  RAZORPAY_KEY_ID: "",
  MUSE_TEXT_MODEL: "muse-spark-1.3",
  MUSE_IMAGE_MODEL: "muse-image-1.0",
  PAYMENTS_ENABLED: false,
  FIREBASE_ANDROID_APP_ID: "",
  FIREBASE_API_KEY: "",
  FIREBASE_PROJECT_ID: "",
  FIREBASE_SENDER_ID: "",
  ANDROID_CERT_SHA256: "",
  GOOGLE_OAUTH_WEB_CLIENT_ID: "",
  ADMOB_REWARDED_UNIT_ID: "",
  ADS_ENABLED: false,
  REFERRAL_BONUS_COINS: 50,
};

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block min-w-0">
      <span className="mb-2 block text-sm font-semibold text-zinc-200">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-zinc-500">{hint}</span> : null}
    </label>
  );
}

function SecretField({
  label,
  status,
  value,
  onChange,
  onClear,
  multiline = false,
}: {
  label: string;
  status?: SecretStatus;
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  multiline?: boolean;
}) {
  const placeholder = status?.set
    ? status.client_email
      ? `Saved for ${status.client_email}`
      : `Saved ••••${status.last4 ?? ""}`
    : "Not saved";
  const className =
    "w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-rose-500 focus:outline-none";
  return (
    <Field label={label} hint="Leave blank to keep the saved value.">
      <div className="space-y-2">
        {multiline ? (
          <textarea
            className={`${className} min-h-32 resize-y`}
            autoComplete="off"
            placeholder={placeholder}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        ) : (
          <input
            className={className}
            type="password"
            autoComplete="new-password"
            placeholder={placeholder}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
        {status?.set && onClear ? (
          <button
            className="text-xs font-semibold text-rose-300 hover:text-rose-200"
            type="button"
            onClick={onClear}
          >
            Clear saved value
          </button>
        ) : null}
      </div>
    </Field>
  );
}

export default function IntegrationsSettings() {
  const [values, setValues] = useState<FormValues>(initialValues);
  const [secrets, setSecrets] = useState<Partial<Record<SecretKey, string>>>({});
  const [secretStatus, setSecretStatus] = useState<Partial<Record<SecretKey, SecretStatus>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingMuse, setTestingMuse] = useState(false);
  const [message, setMessage] = useState("");

  async function refresh() {
    const response = await fetch("/api/admin/settings", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message ?? "Settings could not be loaded");
    const settings = body.settings as SettingsResponse;
    setValues({
      RAZORPAY_KEY_ID: settings.RAZORPAY_KEY_ID ?? "",
      MUSE_TEXT_MODEL: settings.MUSE_TEXT_MODEL ?? "muse-spark-1.3",
      MUSE_IMAGE_MODEL: settings.MUSE_IMAGE_MODEL ?? "muse-image-1.0",
      PAYMENTS_ENABLED: settings.PAYMENTS_ENABLED ?? false,
      FIREBASE_ANDROID_APP_ID: settings.FIREBASE_ANDROID_APP_ID ?? "",
      FIREBASE_API_KEY: settings.FIREBASE_API_KEY ?? "",
      FIREBASE_PROJECT_ID: settings.FIREBASE_PROJECT_ID ?? "",
      FIREBASE_SENDER_ID: settings.FIREBASE_SENDER_ID ?? "",
      ANDROID_CERT_SHA256: settings.ANDROID_CERT_SHA256 ?? "",
      GOOGLE_OAUTH_WEB_CLIENT_ID: settings.GOOGLE_OAUTH_WEB_CLIENT_ID ?? "",
      ADMOB_REWARDED_UNIT_ID: settings.ADMOB_REWARDED_UNIT_ID ?? "",
      ADS_ENABLED: settings.ADS_ENABLED ?? false,
      REFERRAL_BONUS_COINS: settings.REFERRAL_BONUS_COINS ?? 50,
    });
    setSecretStatus({
      RAZORPAY_KEY_SECRET: settings.RAZORPAY_KEY_SECRET,
      RAZORPAY_WEBHOOK_SECRET: settings.RAZORPAY_WEBHOOK_SECRET,
      MUSE_API_KEY: settings.MUSE_API_KEY,
      FIREBASE_SERVICE_ACCOUNT_JSON: settings.FIREBASE_SERVICE_ACCOUNT_JSON,
    });
  }

  useEffect(() => {
    refresh()
      .catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : "Settings could not be loaded"),
      )
      .finally(() => setLoading(false));
  }, []);

  function setValue<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function setSecret(key: SecretKey, value: string) {
    setSecrets((current) => ({ ...current, [key]: value }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...values, ...secrets }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Settings could not be saved");
      setSecrets({});
      await refresh();
      setMessage("Settings saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Settings could not be saved");
    } finally {
      setSaving(false);
    }
  }

  async function clearSecret(key: SecretKey) {
    setMessage("");
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [key]: null }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Secret could not be cleared");
      setSecret(key, "");
      setSecretStatus((current) => ({ ...current, [key]: { set: false } }));
      setMessage("Saved value cleared.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Secret could not be cleared");
    }
  }

  async function testRazorpay() {
    setTesting(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/settings/razorpay-test", { method: "POST" });
      const body = await response.json();
      setMessage(body.message ?? (response.ok ? "Keys are valid." : "Key test failed."));
    } catch {
      setMessage("Key test failed. Try again.");
    } finally {
      setTesting(false);
    }
  }

  async function testMuse() {
    setTestingMuse(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/settings/muse-test", { method: "POST" });
      const body = await response.json();
      setMessage(body.message ?? (response.ok ? "Muse API key is valid." : "Muse key test failed."));
    } catch {
      setMessage("Muse key test failed. Try again.");
    } finally {
      setTestingMuse(false);
    }
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window === "undefined" ? "" : window.location.origin);
  const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/webhooks/subscriptions/razorpay`;
  const inputClass =
    "w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-rose-500 focus:outline-none";

  return (
    <div className="mt-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Integrations</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Manage payments, Muse AI, Firebase, ads, and referral rewards.
          </p>
        </div>
        <button
          className="rounded-xl bg-rose-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          type="submit"
          form="integrations-settings-form"
          disabled={loading || saving}
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
      </div>
      {message ? (
        <p className="mb-4 rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm text-zinc-200">
          {message}
        </p>
      ) : null}
      {loading ? (
        <p className="rounded-2xl bg-zinc-900 p-5 text-sm text-zinc-400">Loading settings…</p>
      ) : (
        <form id="integrations-settings-form" onSubmit={save} className="grid min-w-0 gap-5 lg:grid-cols-2">
          <section className="min-w-0 rounded-2xl border border-white/10 bg-zinc-900 p-4 sm:p-5">
            <h3 className="text-lg font-bold">Razorpay</h3>
            <p className="mt-1 text-sm text-zinc-400">Configure the payment gateway and webhook.</p>
            <div className="mt-5 space-y-4">
              <Field label="Key ID">
                <input
                  className={inputClass}
                  autoComplete="off"
                  value={values.RAZORPAY_KEY_ID}
                  onChange={(event) => setValue("RAZORPAY_KEY_ID", event.target.value)}
                />
              </Field>
              <SecretField
                label="Key secret"
                status={secretStatus.RAZORPAY_KEY_SECRET}
                value={secrets.RAZORPAY_KEY_SECRET ?? ""}
                onChange={(value) => setSecret("RAZORPAY_KEY_SECRET", value)}
                onClear={() => clearSecret("RAZORPAY_KEY_SECRET")}
              />
              <SecretField
                label="Webhook secret"
                status={secretStatus.RAZORPAY_WEBHOOK_SECRET}
                value={secrets.RAZORPAY_WEBHOOK_SECRET ?? ""}
                onChange={(value) => setSecret("RAZORPAY_WEBHOOK_SECRET", value)}
                onClear={() => clearSecret("RAZORPAY_WEBHOOK_SECRET")}
              />
              <Field label="Webhook URL">
                <input className={inputClass} readOnly value={webhookUrl} />
              </Field>
              <label className="flex items-center gap-3 text-sm font-semibold text-zinc-200">
                <input
                  className="size-4 accent-rose-500"
                  type="checkbox"
                  checked={values.PAYMENTS_ENABLED}
                  onChange={(event) => setValue("PAYMENTS_ENABLED", event.target.checked)}
                />
                Enable payments
              </label>
              <button
                className="rounded-xl border border-white/10 bg-zinc-800 px-4 py-2.5 text-sm font-bold disabled:opacity-50"
                type="button"
                onClick={testRazorpay}
                disabled={testing}
              >
                {testing ? "Testing…" : "Test keys"}
              </button>
            </div>
          </section>

          <section className="min-w-0 rounded-2xl border border-white/10 bg-zinc-900 p-4 sm:p-5">
            <h3 className="text-lg font-bold">Muse AI (Meta)</h3>
            <p className="mt-1 text-sm text-zinc-400">
              Generate series details and cinematic posters with Muse.
            </p>
            <div className="mt-5 space-y-4">
              <SecretField
                label="Muse API key"
                status={secretStatus.MUSE_API_KEY}
                value={secrets.MUSE_API_KEY ?? ""}
                onChange={(value) => setSecret("MUSE_API_KEY", value)}
                onClear={() => clearSecret("MUSE_API_KEY")}
              />
              <Field label="Text model">
                <input
                  className={inputClass}
                  value={values.MUSE_TEXT_MODEL}
                  onChange={(event) => setValue("MUSE_TEXT_MODEL", event.target.value)}
                />
              </Field>
              <Field label="Image model">
                <input
                  className={inputClass}
                  value={values.MUSE_IMAGE_MODEL}
                  onChange={(event) => setValue("MUSE_IMAGE_MODEL", event.target.value)}
                />
              </Field>
              <button
                className="rounded-xl border border-white/10 bg-zinc-800 px-4 py-2.5 text-sm font-bold disabled:opacity-50"
                type="button"
                onClick={testMuse}
                disabled={testingMuse}
              >
                {testingMuse ? "Testing…" : "Test key"}
              </button>
            </div>
          </section>

          <section className="min-w-0 rounded-2xl border border-white/10 bg-zinc-900 p-4 sm:p-5">
            <h3 className="text-lg font-bold">Firebase &amp; Google login</h3>
            <p className="mt-1 text-sm text-zinc-400">Runtime Firebase credentials and Google sign-in.</p>
            <div className="mt-5 space-y-4">
              <SecretField
                label="Firebase service account JSON"
                status={secretStatus.FIREBASE_SERVICE_ACCOUNT_JSON}
                value={secrets.FIREBASE_SERVICE_ACCOUNT_JSON ?? ""}
                onChange={(value) => setSecret("FIREBASE_SERVICE_ACCOUNT_JSON", value)}
                onClear={() => clearSecret("FIREBASE_SERVICE_ACCOUNT_JSON")}
                multiline
              />
              <Field label="Firebase Android App ID">
                <input
                  className={inputClass}
                  value={values.FIREBASE_ANDROID_APP_ID}
                  onChange={(event) => setValue("FIREBASE_ANDROID_APP_ID", event.target.value)}
                />
              </Field>
              <Field label="Firebase API key">
                <input
                  className={inputClass}
                  value={values.FIREBASE_API_KEY}
                  onChange={(event) => setValue("FIREBASE_API_KEY", event.target.value)}
                />
              </Field>
              <Field label="Firebase project ID">
                <input
                  className={inputClass}
                  value={values.FIREBASE_PROJECT_ID}
                  onChange={(event) => setValue("FIREBASE_PROJECT_ID", event.target.value)}
                />
              </Field>
              <Field label="Firebase sender ID">
                <input
                  className={inputClass}
                  value={values.FIREBASE_SENDER_ID}
                  onChange={(event) => setValue("FIREBASE_SENDER_ID", event.target.value)}
                />
              </Field>
              <Field
                label="Android signing certificate SHA-256 fingerprints"
                hint="Comma-separated fingerprints used by Android App Links."
              >
                <textarea
                  className={`${inputClass} min-h-20 resize-y`}
                  value={values.ANDROID_CERT_SHA256}
                  onChange={(event) => setValue("ANDROID_CERT_SHA256", event.target.value)}
                />
              </Field>
              <Field label="Google OAuth web client ID">
                <input
                  className={inputClass}
                  value={values.GOOGLE_OAUTH_WEB_CLIENT_ID}
                  onChange={(event) => setValue("GOOGLE_OAUTH_WEB_CLIENT_ID", event.target.value)}
                />
              </Field>
            </div>
          </section>

          <section className="min-w-0 rounded-2xl border border-white/10 bg-zinc-900 p-4 sm:p-5">
            <h3 className="text-lg font-bold">AdMob</h3>
            <p className="mt-1 text-sm text-zinc-400">
              The AdMob App ID is baked into the Android build.
            </p>
            <div className="mt-5 space-y-4">
              <Field label="Rewarded unit ID">
                <input
                  className={inputClass}
                  value={values.ADMOB_REWARDED_UNIT_ID}
                  onChange={(event) => setValue("ADMOB_REWARDED_UNIT_ID", event.target.value)}
                />
              </Field>
              <label className="flex items-center gap-3 text-sm font-semibold text-zinc-200">
                <input
                  className="size-4 accent-rose-500"
                  type="checkbox"
                  checked={values.ADS_ENABLED}
                  onChange={(event) => setValue("ADS_ENABLED", event.target.checked)}
                />
                Enable ads
              </label>
            </div>
          </section>

          <section className="min-w-0 rounded-2xl border border-white/10 bg-zinc-900 p-4 sm:p-5">
            <h3 className="text-lg font-bold">Referral</h3>
            <p className="mt-1 text-sm text-zinc-400">Coins awarded for a completed referral.</p>
            <div className="mt-5 max-w-sm">
              <Field label="Referral bonus coins">
                <input
                  className={inputClass}
                  type="number"
                  min={0}
                  step={1}
                  value={values.REFERRAL_BONUS_COINS}
                  onChange={(event) =>
                    setValue("REFERRAL_BONUS_COINS", Number(event.target.value))
                  }
                />
              </Field>
            </div>
          </section>
          <button
            className="rounded-xl bg-rose-500 px-4 py-3 text-sm font-bold text-white disabled:opacity-50 lg:col-span-2"
            type="submit"
            disabled={saving}
          >
            {saving ? "Saving…" : "Save integrations"}
          </button>
        </form>
      )}
    </div>
  );
}
