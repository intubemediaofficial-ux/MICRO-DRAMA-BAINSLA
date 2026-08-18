import LoginForm from "./login-form";
export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl bg-zinc-900 p-7">
        <p className="text-xs font-bold uppercase tracking-widest text-rose-400">MICRODRAMA</p>
        <h1 className="mt-3 text-3xl font-black">Pick up where you left off.</h1>
        <LoginForm />
      </div>
    </div>
  );
}
