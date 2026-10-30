import { type Note } from "../models/note.model";
import { type PersonName } from "../models/person-name.model";
import { getShortNames } from "./person-names";

/**
 * Shows each person who signed any of `notes` as briefly as tells them
 * apart from the rest, e.g. "Ada", or "Ada L." with another Ada.
 */
export function getSignerNames(notes: Note[]): (name: PersonName) => string {
  return getShortNames(notes.flatMap(({ authors }) => authors ?? []));
}

/**
 * Who signed `note`, in the order they did, each shown by `shortName`, or
 * empty if nobody has.
 */
export function getByline(
  note: Note,
  shortName: (name: PersonName) => string
): string {
  return note.authors?.map(shortName).join(", ") ?? "";
}
