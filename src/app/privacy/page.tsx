import BuiltinPolicy, { builtinPolicyMetadata } from "@/components/builtin-policy";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  return builtinPolicyMetadata("privacy", (await searchParams).preview === "1");
}

export default async function PrivacyPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  return <BuiltinPolicy slug="privacy" preview={(await searchParams).preview === "1"} />;
}
