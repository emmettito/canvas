import { type PersonName } from "./index";

const FIRST_NAME_KEY = "first-name";
const LAST_NAME_KEY = "last-name";
// A whole name, kept before first and last names were apart.
const LEGACY_NAME_KEY = "name";
const AVATAR_KEY = "avatar";
// How big a photo's kept, in pixels across, which is sharp enough for the
// corner of the canvas on any screen, and small enough to send everyone.
const AVATAR_SIZE = 128;
const AVATAR_QUALITY = 0.85;
// Saved only while they're hidden, since they're shown by default.
const HIDE_AUTHORS_KEY = "hide-authors";

// Empty if nothing's saved. A whole name saved before is split at its first
// space, e.g. "Ada Lovelace" into "Ada" and "Lovelace".
function getSavedName(): PersonName {
  try {
    const firstName = localStorage.getItem(FIRST_NAME_KEY);
    const lastName = localStorage.getItem(LAST_NAME_KEY);
    if (firstName !== null || lastName !== null) {
      return { firstName: firstName ?? "", lastName: lastName ?? "" };
    }
    const [first = "", ...rest] = (localStorage.getItem(LEGACY_NAME_KEY) ?? "")
      .trim()
      .split(/\s+/);
    return { firstName: first, lastName: rest.join(" ") };
  } catch {
    // Storage can be unavailable, e.g. in some private windows.
    return { firstName: "", lastName: "" };
  }
}

function saveName({ firstName, lastName }: PersonName): void {
  try {
    for (const [key, value] of [
      [FIRST_NAME_KEY, firstName],
      [LAST_NAME_KEY, lastName],
    ]) {
      if (value) {
        localStorage.setItem(key, value);
      } else {
        localStorage.removeItem(key);
      }
    }
    localStorage.removeItem(LEGACY_NAME_KEY);
  } catch {
    // The name just won't be remembered.
  }
}

/**
 * Wires up the demo page's first and last name fields, which are saved as
 * they're typed, and calls `onChange` with both, trimmed. Returns the saved
 * name, for the canvas to start with.
 */
export function setUpNameFields(
  first: HTMLInputElement,
  last: HTMLInputElement,
  onChange: (name: PersonName) => void
): PersonName {
  const saved = getSavedName();
  first.value = saved.firstName;
  last.value = saved.lastName;
  for (const input of [first, last]) {
    input.addEventListener("input", () => {
      const name = {
        firstName: first.value.trim(),
        lastName: last.value.trim(),
      };
      saveName(name);
      onChange(name);
    });
  }
  return saved;
}

/**
 * Wires up the demo page's checkbox for showing who signed each note, which
 * is saved as it's changed, and calls `onChange` with it. Returns whether
 * they're shown, for the canvas to start with.
 */
export function setUpShowAuthorsField(
  input: HTMLInputElement,
  onChange: (show: boolean) => void
): boolean {
  let hidden = false;
  try {
    hidden = localStorage.getItem(HIDE_AUTHORS_KEY) !== null;
  } catch {
    // Storage can be unavailable, e.g. in some private windows.
  }
  input.checked = !hidden;
  input.addEventListener("change", () => {
    try {
      if (input.checked) {
        localStorage.removeItem(HIDE_AUTHORS_KEY);
      } else {
        localStorage.setItem(HIDE_AUTHORS_KEY, "true");
      }
    } catch {
      // The choice just won't be remembered.
    }
    onChange(input.checked);
  });
  return !hidden;
}

// The middle square of `file`, as a small JPEG's data URL, or null if it
// isn't an image the browser can read.
async function toAvatar(file: File): Promise<string | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }
  // JPEG has no transparency, so a transparent photo is on white.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_SIZE,
    AVATAR_SIZE
  );
  bitmap.close();
  return canvas.toDataURL("image/jpeg", AVATAR_QUALITY);
}

/**
 * Wires up the demo page's photo field, which keeps the photo picked, made
 * small and square, and calls `onChange` with it as a data URL, or empty
 * once it's removed. Returns the saved photo, for the canvas to start with.
 */
export function setUpPhotoField(
  field: HTMLElement,
  onChange: (avatar: string) => void
): string {
  const preview = field.querySelector<HTMLImageElement>(".demo-photo-preview")!;
  const choose = field.querySelector<HTMLButtonElement>(".demo-photo-choose")!;
  const remove = field.querySelector<HTMLButtonElement>(".demo-photo-remove")!;
  const input = field.querySelector<HTMLInputElement>(".demo-photo-input")!;
  let saved = "";
  try {
    saved = localStorage.getItem(AVATAR_KEY) ?? "";
  } catch {
    // Storage can be unavailable, e.g. in some private windows.
  }

  function show(avatar: string) {
    preview.hidden = !avatar;
    if (avatar) {
      preview.src = avatar;
    } else {
      preview.removeAttribute("src");
    }
    remove.hidden = !avatar;
    choose.textContent = avatar ? "Change photo" : "Choose photo";
  }

  function set(avatar: string) {
    try {
      if (avatar) {
        localStorage.setItem(AVATAR_KEY, avatar);
      } else {
        localStorage.removeItem(AVATAR_KEY);
      }
    } catch {
      // The photo just won't be remembered.
    }
    show(avatar);
    onChange(avatar);
  }

  choose.addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    // The same file can be picked again, e.g. after removing it.
    input.value = "";
    const avatar = file && (await toAvatar(file));
    if (avatar) {
      set(avatar);
    }
  });
  remove.addEventListener("click", () => {
    set("");
    choose.focus();
  });
  show(saved);
  return saved;
}
