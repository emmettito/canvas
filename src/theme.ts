// What the page looks like. OLED is dark with true black, which turns those
// pixels off on OLED screens.
type Theme = "light" | "dark" | "oled";
// What the user picked. "system" follows the system's light or dark mode.
type ThemePreference = Theme | "system";

const THEMES: Theme[] = ["light", "dark", "oled"];
const STORAGE_KEY = "theme";
const darkQuery = matchMedia("(prefers-color-scheme: dark)");

// Nothing saved means following the system.
function getSavedPreference(): ThemePreference {
  try {
    const theme = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(theme as Theme) ? (theme as Theme) : "system";
  } catch {
    // Storage can be unavailable, e.g. in some private windows.
    return "system";
  }
}

function savePreference(preference: ThemePreference): void {
  try {
    if (preference === "system") {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, preference);
    }
  } catch {
    // The choice just won't be remembered.
  }
}

function getTheme(preference: ThemePreference): Theme {
  if (preference !== "system") {
    return preference;
  }
  return darkQuery.matches ? "dark" : "light";
}

/**
 * Wires up the demo page's theme choices: radio buttons named "theme" in
 * `picker`, whose values are a theme or "system". The script in `index.html`
 * sets the starting theme, so the page doesn't flash the wrong one.
 */
export function setUpThemePicker(picker: HTMLElement): void {
  const radios = [
    ...picker.querySelectorAll<HTMLInputElement>('input[name="theme"]'),
  ];
  // Kept here too, so the choice holds when it can't be saved.
  let preference = getSavedPreference();

  const applyTheme = () => {
    document.documentElement.dataset.theme = getTheme(preference);
    for (const radio of radios) {
      radio.checked = radio.value === preference;
    }
  };

  applyTheme();

  picker.addEventListener("change", (event) => {
    preference = (event.target as HTMLInputElement).value as ThemePreference;
    savePreference(preference);
    applyTheme();
  });

  darkQuery.addEventListener("change", applyTheme);
}
