export function getAdjacentCollectionItemId(
  itemIds: readonly string[],
  currentItemId: string | null,
  key: string,
): string | null {
  if (itemIds.length === 0) return null;
  const currentIndex = currentItemId ? itemIds.indexOf(currentItemId) : -1;

  switch (key) {
    case "ArrowDown":
      return itemIds[Math.min(itemIds.length - 1, currentIndex + 1)] ?? null;
    case "ArrowUp":
      return (
        itemIds[Math.max(0, currentIndex < 0 ? 0 : currentIndex - 1)] ?? null
      );
    case "Home":
      return itemIds[0] ?? null;
    case "End":
      return itemIds[itemIds.length - 1] ?? null;
    default:
      return null;
  }
}

export function focusCollectionItem(itemId: string): void {
  window.requestAnimationFrame(() => {
    Array.from(
      document.querySelectorAll<HTMLElement>("[data-collection-item-id]"),
    )
      .find((item) => item.dataset.collectionItemId === itemId)
      ?.focus();
  });
}
