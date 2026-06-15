export function normalizeForSearch(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function compact(text) {
  return normalizeForSearch(text).replace(/\s/g, "");
}

/** Буквы запроса встречаются в тексте по порядку (ассоциативный / fuzzy-поиск). */
export function matchesAssociativeQuery(query, ...parts) {
  return scoreAssociativeQuery(query, ...parts) >= 0;
}

export function scoreAssociativeQuery(query, ...parts) {
  const q = compact(query);
  if (!q) return 0;

  const primary = normalizeForSearch(parts[0] || "");
  const secondary = normalizeForSearch(parts.slice(1).join(" "));
  const haystack = compact(parts.filter(Boolean).join(" "));
  const primaryCompact = compact(parts[0] || "");

  if (primary.startsWith(normalizeForSearch(query))) return 1000;
  if (primaryCompact.startsWith(q)) return 950;
  if (primary.includes(normalizeForSearch(query))) return 900;
  if (haystack.includes(q)) return 850;

  let qi = 0;
  let firstIdx = -1;
  let lastIdx = -1;
  for (let i = 0; i < haystack.length && qi < q.length; i += 1) {
    if (haystack[i] === q[qi]) {
      if (firstIdx < 0) firstIdx = i;
      lastIdx = i;
      qi += 1;
    }
  }
  if (qi !== q.length) return -1;

  const span = lastIdx - firstIdx + 1;
  const secondaryBonus = secondary && matchesAssociativeQuery(query, secondary) ? 20 : 0;
  return 600 - span + secondaryBonus;
}

export function filterAssociative(items, query, getParts) {
  const q = query.trim();
  if (!q) return items;

  return items
    .map((item) => {
      const parts = getParts(item);
      const score = scoreAssociativeQuery(q, ...(Array.isArray(parts) ? parts : [parts]));
      return score >= 0 ? { item, score } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}

export function suggestAssociative(items, query, getLabel, getMeta, limit = 8) {
  const q = query.trim();
  if (!q) return [];

  return items
    .map((item) => {
      const label = getLabel(item);
      const meta = getMeta?.(item) || "";
      const score = scoreAssociativeQuery(q, label, meta);
      return score >= 0 ? { item, label, meta, score } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ item, label, meta }) => ({ item, label, meta }));
}
