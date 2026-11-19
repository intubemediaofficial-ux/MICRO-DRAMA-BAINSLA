import BuiltinPolicy, { builtinPolicyMetadata } from "@/components/builtin-policy";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  return builtinPolicyMetadata("terms", (await searchParams).preview === "1");
}

export default async function TermsPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  return <BuiltinPolicy slug="terms" preview={(await searchParams).preview === "1"} />;
}
