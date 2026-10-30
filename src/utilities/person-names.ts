import { type PersonName } from "../models/person-name.model";

/** `name` in full, e.g. "Ada Lovelace", or empty if neither part's set. */
export function getFullName({ firstName, lastName }: PersonName): string {
  return [firstName, lastName].filter(Boolean).join(" ");
}

/** `name` without spaces around either part. */
export function trimName({ firstName, lastName }: PersonName): PersonName {
  return { firstName: firstName.trim(), lastName: lastName.trim() };
}

/** Whether `a` and `b` are the same name, whatever their case. */
export function isSameName(a: PersonName, b: PersonName): boolean {
  return getKey(getFullName(a)) === getKey(getFullName(b));
}

/**
 * A name kept whole, from before first and last names were apart, split at
 * its first space, e.g. "Mary Ann Smith" into "Mary" and "Ann Smith".
 */
export function splitName(name: string): PersonName {
  const [firstName, ...rest] = name.trim().split(/\s+/);
  return { firstName, lastName: rest.join(" ") };
}

/**
 * Shows each of `people` as briefly as tells them apart: by their first
 * name, unless someone else has it too, then with their last name's initial,
 * e.g. "Ada L.", and if that's shared too, in full. Someone with no first name
 * shows their last. The same name more than once is one person.
 */
export function getShortNames(
  people: PersonName[]
): (name: PersonName) => string {
  const everyone = new Map(
    people.map((name) => [getKey(getFullName(name)), name])
  );
  const firsts = countBy(everyone.values(), ({ firstName }) => firstName);
  const initials = countBy(everyone.values(), getInitialed);
  return (name) => {
    const { firstName, lastName } = name;
    if (!firstName || !lastName) {
      return firstName || lastName;
    }
    if ((firsts.get(getKey(firstName)) ?? 0) <= 1) {
      return firstName;
    }
    const initialed = getInitialed(name);
    return (initials.get(getKey(initialed)) ?? 0) <= 1
      ? initialed
      : getFullName(name);
  };
}

// E.g. "Ada L.", or just "Ada" without a last name.
function getInitialed({ firstName, lastName }: PersonName): string {
  return lastName
    ? `${firstName} ${[...lastName][0].toLocaleUpperCase()}.`
    : firstName;
}

function getKey(text: string): string {
  return text.toLocaleLowerCase();
}

function countBy<T>(
  items: Iterable<T>,
  getText: (item: T) => string
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = getKey(getText(item));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
