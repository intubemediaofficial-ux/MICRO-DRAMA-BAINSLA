import ContentEditor from "@/components/admin/content-editor";
export default async function EditBlogPost({ params }: { params: Promise<{ id: string }> }) {
  return <ContentEditor kind="post" id={(await params).id} />;
}
