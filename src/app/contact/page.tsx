import BuiltinPolicy, { builtinPolicyMetadata } from "@/components/builtin-policy";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  return builtinPolicyMetadata("contact", (await searchParams).preview === "1");
}

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  return <BuiltinPolicy slug="contact" preview={(await searchParams).preview === "1"} />;
}
