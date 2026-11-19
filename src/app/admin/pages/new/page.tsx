import ContentEditor from "@/components/admin/content-editor";
export default async function NewAdminPage({ searchParams }: { searchParams: Promise<{ customize?: string }> }) {
  const { customize } = await searchParams;
  return <ContentEditor kind="page" customize={customize} />;
}
