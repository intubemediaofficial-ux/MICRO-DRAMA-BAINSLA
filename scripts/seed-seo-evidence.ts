import { loadEnvConfig } from "@next/env";
import { PrismaClient, Role } from "@prisma/client";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
const html = `<p style="text-align: justify;">This sample article is published for local SEO and rich-editor verification. The text is justified to exercise the sanitizer and public CMS renderer.</p>
<table><thead><tr><th>Feature</th><th>Status</th></tr></thead><tbody><tr><td>Rich text</td><td>Published</td></tr><tr><td>SEO metadata</td><td>Included</td></tr></tbody></table>
<h2>Video preview</h2><iframe src="https://www.youtube-nocookie.com/embed/jNQXAC9IVRw" title="YouTube privacy-enhanced embed" width="560" height="315" allowfullscreen frameborder="0"></iframe>`;

async function main() {
  let admin = await prisma.user.findUnique({ where: { email: "admin@microdrama.local" } });
  if (!admin) {
    admin = await prisma.user.create({
      data: {
        email: "admin@microdrama.local",
        name: "SEO Evidence Admin",
        role: Role.ADMIN,
        referralCode: `SEOADMIN${Date.now()}`,
      },
    });
  } else if (admin.role !== Role.ADMIN || admin.isDisabled) {
    admin = await prisma.user.update({
      where: { id: admin.id },
      data: { role: Role.ADMIN, isDisabled: false },
    });
  }
  const publishedAt = new Date(Date.now() - 60_000);
  const contentJson = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "SEO evidence content." }] }],
  };
  await prisma.contentPage.upsert({
    where: { slug: "seo-evidence" },
    update: {
      title: "SEO Evidence Page",
      contentHtml: html,
      contentJson,
      excerpt: "Local SEO and rich-content verification page.",
      status: "PUBLISHED",
      publishedAt,
      authorId: admin.id,
    },
    create: {
      slug: "seo-evidence",
      title: "SEO Evidence Page",
      contentHtml: html,
      contentJson,
      excerpt: "Local SEO and rich-content verification page.",
      status: "PUBLISHED",
      publishedAt,
      authorId: admin.id,
      seo: { title: "SEO Evidence Page", description: "A local published CMS page." },
    },
  });
  await prisma.blogPost.upsert({
    where: { slug: "seo-evidence-article" },
    update: {
      title: "SEO Evidence Article",
      contentHtml: html,
      contentJson,
      excerpt: "A published article with a table, justified paragraph, and YouTube embed.",
      status: "PUBLISHED",
      publishedAt,
      authorId: admin.id,
      readingMinutes: 1,
      tags: ["seo", "rich-editor"],
    },
    create: {
      slug: "seo-evidence-article",
      title: "SEO Evidence Article",
      contentHtml: html,
      contentJson,
      excerpt: "A published article with a table, justified paragraph, and YouTube embed.",
      status: "PUBLISHED",
      publishedAt,
      authorId: admin.id,
      readingMinutes: 1,
      tags: ["seo", "rich-editor"],
      seo: { title: "SEO Evidence Article", description: "A local published blog article." },
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("SEO evidence page and post seeded; admin: admin@microdrama.local");
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
