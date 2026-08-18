import { getSession } from "./auth";

export async function adminSession() {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");
  if (session.role !== "ADMIN") throw new Error("FORBIDDEN");
  return session;
}
