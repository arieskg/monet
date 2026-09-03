export function isSaveShortcut(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey">): boolean {
  return event.metaKey && event.ctrlKey && event.key.toLowerCase() === "s";
}
