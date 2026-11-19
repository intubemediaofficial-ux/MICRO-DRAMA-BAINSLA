import { adminSession } from "@/server/admin";
import { prisma } from "@/server/db";
import { publicSeriesWhere } from "@/server/publishing";
import PushForm from "./push-form";

export default async function AdminPushPage() {
  await adminSession();
  const series = await prisma.series.findMany({
    where: publicSeriesWhere,
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });
  return (
    <main className="mx-auto max-w-5xl p-5 pb-24">
      <h1 className="text-3xl font-black">Push notifications</h1>
      <p className="mt-2 text-sm text-zinc-400">
        Send a message to registered devices. Series audiences include My List and watch history.
      </p>
      <PushForm series={series} />
    </main>
  );
}
