import Link from "next/link";
import { getSession } from "@/server/auth";
import DeleteAccountButton from "./delete-account-button";

export default async function DeleteAccountPage() {
  const session = await getSession();
  return (
    <main className="p-5 pb-24">
      <Link href="/account" className="text-zinc-400">
        ← Account
      </Link>
      <h1 className="mt-7 text-3xl font-black">Delete your account</h1>
      <p className="mt-4 text-zinc-300">
        You can permanently delete your Intube Drama account and personal profile information.
        Deletion signs you out and disables the account.
      </p>
      <section className="mt-6 rounded-2xl bg-zinc-900 p-5">
        <h2 className="text-xl font-bold">Information we delete</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Your email address, phone number, name, and password are removed, along with watch
          progress, saved series, episode likes, check-ins, activity history, device tokens, and
          notification records.
        </p>
      </section>
      <section className="mt-4 rounded-2xl bg-zinc-900 p-5">
        <h2 className="text-xl font-bold">Records we retain</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Purchase, coin, episode-unlock, subscription, and trial-eligibility records may be
          retained for payment, legal, accounting, and fraud-prevention purposes. Trial contact
          and device identifiers are retained only as non-reversible hashes for abuse prevention.
        </p>
      </section>
      {session ? (
        <DeleteAccountButton />
      ) : (
        <section className="mt-6">
          <p className="text-zinc-400">Sign in to request account deletion.</p>
          <Link
            href="/login"
            className="mt-4 inline-block rounded-full bg-rose-500 px-5 py-3 font-bold text-white"
          >
            Sign in
          </Link>
        </section>
      )}
    </main>
  );
}
