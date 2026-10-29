import { type Note } from "../models/note.model";

/** Who signed `note`, in the order they did, or empty if nobody has. */
export function getByline(note: Note): string {
  return note.authors?.join(", ") ?? "";
}
