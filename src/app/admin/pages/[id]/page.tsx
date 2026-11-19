import ContentEditor from "@/components/admin/content-editor";
export default async function EditAdminPage({ params }: { params: Promise<{ id: string }> }) {
  return <ContentEditor kind="page" id={(await params).id} />;
}
