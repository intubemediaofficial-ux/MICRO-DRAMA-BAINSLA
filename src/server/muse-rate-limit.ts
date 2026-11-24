const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 20;
const requestsByAdmin = new Map<string, number[]>();

export function allowMuseRequest(adminId: string, now = Date.now()) {
  for (const [id, timestamps] of requestsByAdmin) {
    const recent = timestamps.filter((timestamp) => now - timestamp < WINDOW_MS);
    if (recent.length) requestsByAdmin.set(id, recent);
    else requestsByAdmin.delete(id);
  }
  const recent = (requestsByAdmin.get(adminId) ?? []).filter(
    (timestamp) => now - timestamp < WINDOW_MS,
  );
  if (recent.length >= MAX_REQUESTS) {
    requestsByAdmin.set(adminId, recent);
    return false;
  }
  recent.push(now);
  requestsByAdmin.set(adminId, recent);
  return true;
}
