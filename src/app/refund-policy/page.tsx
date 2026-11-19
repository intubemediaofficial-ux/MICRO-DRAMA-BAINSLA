import BuiltinPolicy, { builtinPolicyMetadata } from "@/components/builtin-policy";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  return builtinPolicyMetadata("refund-policy", (await searchParams).preview === "1");
}

export default async function RefundPolicyPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  return <BuiltinPolicy slug="refund-policy" preview={(await searchParams).preview === "1"} />;
}
