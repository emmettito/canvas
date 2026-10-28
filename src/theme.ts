type Theme = "light" | "dark";

const STORAGE_KEY = "theme";
const darkQuery = matchMedia("(prefers-color-scheme: dark)");

function getSavedTheme(): Theme | null {
  try {
    const theme = localStorage.getItem(STORAGE_KEY);
    return theme === "light" || theme === "dark" ? theme : null;
  } catch {
    // Storage can be unavailable, e.g. in some private windows.
    return null;
  }
}

function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // The choice just won't be remembered.
  }
}

function getSystemTheme(): Theme {
  return darkQuery.matches ? "dark" : "light";
}

/**
 * Wires up the demo page's dark mode toggle. The page follows the system
 * setting until the toggle is used, then keeps that choice. The script in
 * `index.html` sets the starting theme.
 */
export function setUpThemeToggle(toggle: HTMLButtonElement): void {
  const applyTheme = (theme: Theme) => {
    document.documentElement.dataset.theme = theme;
    toggle.setAttribute("aria-pressed", String(theme === "dark"));
  };

  applyTheme(getSavedTheme() ?? getSystemTheme());

  toggle.addEventListener("click", () => {
    const theme =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    saveTheme(theme);
    applyTheme(theme);
  });

  darkQuery.addEventListener("change", () => {
    if (!getSavedTheme()) {
      applyTheme(getSystemTheme());
    }
  });
}
