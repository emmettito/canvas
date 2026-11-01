// Unique enough to tell a user's canvases and notes apart.
// `crypto.randomUUID` isn't used, since it only exists on HTTPS pages.
export function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
