import { JsonLd } from "@/components/json-ld";
import PolicyPage from "@/components/policy-page";
import { SeoFieldsSchema } from "@/lib/seo";
import { getSeoGlobal } from "@/server/site-config";
import { breadcrumbList, schemaTypeFor, webPageSchema } from "@/server/structured-data";
import { getBuiltInPage } from "@/server/public-cms";
import type { BuiltInPageSlug } from "@/lib/builtin-pages";
import { SITE_ORIGIN, buildMetadata } from "@/server/seo";

export async function builtinPolicyMetadata(slug: BuiltInPageSlug, preview = false) {
  const page = await getBuiltInPage(slug, preview);
  return buildMetadata({
    kind: "page",
    path: `/${slug}`,
    title: page.title,
    excerpt: page.excerpt,
    image: page.featuredImage,
    seo: preview ? { ...page.seo, noindex: true } : page.seo,
    modifiedAt: page.updatedAt ?? undefined,
  });
}

export default async function BuiltinPolicy({ slug, preview = false }: { slug: BuiltInPageSlug; preview?: boolean }) {
  const [page, global] = await Promise.all([getBuiltInPage(slug, preview), getSeoGlobal()]);
  const parsedSeo = SeoFieldsSchema.safeParse(page.seo);
  const seo = parsedSeo.success ? parsedSeo.data : {};
  const schemaType = schemaTypeFor("page", seo.schemaType);
  return (
    <>
      <JsonLd data={breadcrumbList([
        { name: global.siteName, url: `${SITE_ORIGIN}/` },
        { name: seo.breadcrumbTitle || page.title, url: `${SITE_ORIGIN}/${slug}` },
      ])} />
      {schemaType !== "None" && (
        <JsonLd data={webPageSchema({
          type: schemaType === "AboutPage" || schemaType === "ContactPage" ? schemaType : "WebPage",
          title: page.title,
          description: seo.description || page.excerpt || global.defaultDescription,
          url: `${SITE_ORIGIN}/${slug}`,
        })} />
      )}
      {page.preview && <p className="mb-4 rounded-lg bg-amber-400/10 p-3 text-sm text-amber-200">Draft preview</p>}
      <PolicyPage title={page.title} contentHtml={page.html} />
    </>
  );
}
