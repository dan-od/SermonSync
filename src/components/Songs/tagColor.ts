const TAG_COLORS = ["#7b2ff7", "#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#14b8a6"];

export function tagColor(tag: string) {
  let hash = 0;
  for (const character of tag) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}
