export function cmsSearchWhere(value: string | null) {
  const query = value?.trim();
  if (!query) return {};
  return {
    OR: [
      { title: { contains: query, mode: "insensitive" as const } },
      { slug: { contains: query, mode: "insensitive" as const } },
    ],
  };
}

export function matchesCmsSearch(query: string | null, ...values: string[]) {
  const normalized = query?.trim().toLocaleLowerCase();
  return !normalized || values.some((value) => value.toLocaleLowerCase().includes(normalized));
}
