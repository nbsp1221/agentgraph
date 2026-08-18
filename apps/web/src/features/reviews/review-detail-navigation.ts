const returnKeys = ['query', 'status', 'evaluation', 'page', 'fixture'] as const;

type SearchRecord = Record<string, string | string[] | undefined>;
type SearchGetter = { get(key: string): string | null };

export function reviewReturnQuery(search: URLSearchParams | SearchGetter | SearchRecord): string {
  const result = new URLSearchParams();
  for (const key of returnKeys) {
    const value = isSearchGetter(search) ? search.get(key) : search[key];
    const normalized = Array.isArray(value) ? value[0] : value;
    if (normalized) {
      result.set(key, normalized);
    }
  }
  return result.toString();
}

function isSearchGetter(
  search: URLSearchParams | SearchGetter | SearchRecord,
): search is SearchGetter {
  return 'get' in search && typeof search.get === 'function';
}
