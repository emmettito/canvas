import { expect, type Page, test } from "@playwright/test";

const html = (page: Page) => page.locator("html");

test("follows the system setting until the toggle is used", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const toggle = page.getByRole("switch", { name: "Dark mode" });

  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  await expect(toggle).toBeChecked();

  await page.emulateMedia({ colorScheme: "light" });
  await expect(html(page)).toHaveAttribute("data-theme", "light");
  await expect(toggle).not.toBeChecked();
});

test("remembers the toggle over the system setting", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");

  await page.getByRole("switch", { name: "Dark mode" }).click();
  await expect(html(page)).toHaveAttribute("data-theme", "dark");

  await page.reload();
  await expect(html(page)).toHaveAttribute("data-theme", "dark");

  // A saved choice wins over a system change.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.emulateMedia({ colorScheme: "light" });
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
});

test("keeps the drawing surface white in dark mode", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");

  await expect(page.locator(".canvas-wrapper")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)"
  );
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(30, 30, 30)"
  );
});
