import { expect, type Page, test } from "@playwright/test";

const html = (page: Page) => page.locator("html");

// Opens the Settings dialog and picks a theme.
async function chooseTheme(page: Page, theme: string) {
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("radio", { name: theme }).check();
}

test("follows the system setting until a theme is chosen", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");

  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("radio", { name: "System" })).toBeChecked();

  await page.emulateMedia({ colorScheme: "light" });
  await expect(html(page)).toHaveAttribute("data-theme", "light");
});

test("remembers the chosen theme over the system setting", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");

  await chooseTheme(page, "Dark");
  await expect(html(page)).toHaveAttribute("data-theme", "dark");

  await page.reload();
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();

  // A saved choice wins over a system change.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.emulateMedia({ colorScheme: "light" });
  await expect(html(page)).toHaveAttribute("data-theme", "dark");

  // Choosing System follows it again.
  await page.getByRole("radio", { name: "System" }).check();
  await expect(html(page)).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(html(page)).toHaveAttribute("data-theme", "light");
});

test("OLED, chosen before it became Dark, is Dark", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("theme", "oled"));

  await page.reload();

  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();
});

test("the Settings dialog closes from its button, Escape or the backdrop", async ({
  page,
}) => {
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "Settings" });
  const open = page.getByRole("button", { name: "Settings" });

  await open.click();
  await expect(dialog).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();

  // From the keyboard, focus goes back to what opened it. WebKit doesn't
  // focus buttons on click, so it's opened with Enter.
  await open.focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(open).toBeFocused();

  await open.click();
  await page.mouse.click(5, 5);
  await expect(dialog).toBeHidden();
});

test("Dark puts the page and toolbars on true black", async ({ page }) => {
  await page.goto("/");
  await chooseTheme(page, "Dark");

  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(0, 0, 0)"
  );
  await expect(page.locator(".canvas-toolbar").first()).toHaveCSS(
    "background-color",
    "rgb(0, 0, 0)"
  );
});

test("a new canvas in Dark starts black, with a white pencil", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");

  await expect(page.locator(".canvas-surface")).toHaveCSS(
    "background-color",
    "rgb(0, 0, 0)"
  );
  await expect(
    page.getByRole("button", { name: "Color: white" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(
    page.getByRole("radio", { name: "Black", exact: true })
  ).toBeChecked();
});

test("a canvas keeps its background when the theme changes", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  // Drawn on, so it's kept.
  const box = (await page.locator("canvas").boundingBox())!;
  await page.mouse.click(box.x + 100, box.y + 100);

  await chooseTheme(page, "Dark");
  await page.keyboard.press("Escape");

  await expect(page.locator(".canvas-surface")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)"
  );
  await page.reload();
  await expect(page.locator(".canvas-surface")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)"
  );
});
