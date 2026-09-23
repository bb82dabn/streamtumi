export function reorderByIds<T extends { id: string }>(items: T[], orderedIds: string[]): T[] {
  if (items.length !== orderedIds.length || new Set(orderedIds).size !== orderedIds.length) throw new Error("Playlist order does not match its items");
  const byId = new Map(items.map((item) => [item.id, item]));
  return orderedIds.map((id) => {
    const item = byId.get(id);
    if (!item) throw new Error("Playlist order contains an unknown item");
    return item;
  });
}
