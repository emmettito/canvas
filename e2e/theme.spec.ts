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

  await chooseTheme(page, "OLED");
  await expect(html(page)).toHaveAttribute("data-theme", "oled");

  await page.reload();
  await expect(html(page)).toHaveAttribute("data-theme", "oled");
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("radio", { name: "OLED" })).toBeChecked();

  // A saved choice wins over a system change.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.emulateMedia({ colorScheme: "light" });
  await expect(html(page)).toHaveAttribute("data-theme", "oled");

  // Choosing System follows it again.
  await page.getByRole("radio", { name: "System" }).check();
  await expect(html(page)).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(html(page)).toHaveAttribute("data-theme", "light");
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

test("OLED mode puts the page and toolbars on true black", async ({ page }) => {
  await page.goto("/");
  await chooseTheme(page, "OLED");

  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(0, 0, 0)"
  );
  await expect(page.locator(".canvas-toolbar").first()).toHaveCSS(
    "background-color",
    "rgb(0, 0, 0)"
  );
});

test("shows the drawing dark in dark mode, but exports its own colors", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");

  const surface = page.locator(".canvas-surface");
  await expect(surface).toHaveCSS("filter", "invert(0.93) hue-rotate(180deg)");
  // The drawing itself is still white, which exports use.
  await expect(surface).toHaveCSS("background-color", "rgb(255, 255, 255)");
  // The format bar and menus aren't filtered.
  await expect(page.locator(".canvas-overlay")).toHaveCSS("filter", "none");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(13, 14, 16)"
  );
});

test("OLED mode shows the drawing on true black", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "oled";
  });

  await expect(page.locator(".canvas-surface")).toHaveCSS(
    "filter",
    "invert(1) hue-rotate(180deg)"
  );
  // What's shown where nothing is drawn, as the screen shows it.
  const pixel = await page.screenshot({
    clip: { x: 600, y: 300, width: 1, height: 1 },
  });
  const color = await page.evaluate(
    async (bytes) => {
      const bitmap = await createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: "image/png" })
      );
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d")!;
      context.drawImage(bitmap, 0, 0);
      return [...context.getImageData(0, 0, 1, 1).data];
    },
    [...pixel]
  );
  expect(color).toEqual([0, 0, 0, 255]);
});
