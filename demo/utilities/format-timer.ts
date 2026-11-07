/**
 * How long's left, as a clock shows it, e.g. "4:05", or "1:02:03" past an
 * hour. A part second counts as a whole one, so it reads 0:00 only once it's
 * gone off.
 */
export function formatTimer(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  const rest = pad(seconds % 60);
  return hours > 0 ? `${hours}:${pad(minutes)}:${rest}` : `${minutes}:${rest}`;
}
