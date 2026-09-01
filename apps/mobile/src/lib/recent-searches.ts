import '@/lib/install-local-storage';

const recentSearchLimit = 8;

function key(userID: string) {
  return `bookgyeol.recent-searches.${userID}`;
}

function normalize(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, 100);
}

function read(userID: string): string[] {
  if (!userID) return [];
  try {
    const raw = globalThis.localStorage?.getItem(key(userID));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === 'string')
      .map(normalize)
      .filter(Boolean)
      .slice(0, recentSearchLimit);
  } catch {
    return [];
  }
}

function write(userID: string, items: string[]) {
  try {
    globalThis.localStorage?.setItem(key(userID), JSON.stringify(items));
  } catch {
    // Recent searches are a convenience feature and must never block book search.
  }
  return items;
}

export function loadRecentSearches(userID: string) {
  return read(userID);
}

export function addRecentSearch(userID: string, value: string) {
  const normalized = normalize(value);
  if (!userID || !normalized) return read(userID);
  const comparisonValue = normalized.toLocaleLowerCase('ko-KR');
  const items = [
    normalized,
    ...read(userID).filter((item) => item.toLocaleLowerCase('ko-KR') !== comparisonValue),
  ].slice(0, recentSearchLimit);
  return write(userID, items);
}

export function removeRecentSearch(userID: string, value: string) {
  const comparisonValue = normalize(value).toLocaleLowerCase('ko-KR');
  return write(
    userID,
    read(userID).filter((item) => item.toLocaleLowerCase('ko-KR') !== comparisonValue),
  );
}

export function clearRecentSearches(userID: string) {
  if (!userID) return [];
  try {
    globalThis.localStorage?.removeItem(key(userID));
  } catch {
    // The in-memory screen state is still cleared when persistent storage is unavailable.
  }
  return [];
}
