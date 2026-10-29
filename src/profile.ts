const STORAGE_KEY = "name";
// Saved only while they're hidden, since they're shown by default.
const HIDE_AUTHORS_KEY = "hide-authors";

// Empty if nothing's saved.
function getSavedName(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    // Storage can be unavailable, e.g. in some private windows.
    return "";
  }
}

function saveName(name: string): void {
  try {
    if (name) {
      localStorage.setItem(STORAGE_KEY, name);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // The name just won't be remembered.
  }
}

/**
 * Wires up the demo page's name field, which is saved as it's typed, and
 * calls `onChange` with it, trimmed. Returns the saved name, for the canvas
 * to start with.
 */
export function setUpNameField(
  input: HTMLInputElement,
  onChange: (name: string) => void
): string {
  const saved = getSavedName();
  input.value = saved;
  input.addEventListener("input", () => {
    const name = input.value.trim();
    saveName(name);
    onChange(name);
  });
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

