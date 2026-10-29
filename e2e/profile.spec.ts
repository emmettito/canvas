import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
});

// Opens the Settings dialog, types a name, and closes it.
async function setName(page: Page, name: string) {
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill(name);
  await page.keyboard.press("Escape");
}

// Adds a note in the middle of the canvas, and stops typing in it.
async function addNote(page: Page) {
  await page.getByRole("button", { name: "Sticky note" }).click();
  const box = (await page.locator("canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.press("Escape");
}

const bylines = (page: Page) => page.locator(".canvas-note-byline");

test("new notes are signed with the name, and old ones keep theirs", async ({
  page,
}) => {
  await addNote(page);
  await expect(bylines(page)).toHaveCount(0);

  await setName(page, "  Ada  ");
  await page.mouse.click(10, 10);
  await addNote(page);
  await expect(bylines(page)).toHaveText(["Ada"]);

  // It's kept with the drawing.
  await page.reload();
  await expect(bylines(page)).toHaveText(["Ada"]);
});

test("hiding names hides notes' bylines, and is remembered", async ({
  page,
}) => {
  await setName(page, "Ada");
  await page.mouse.click(10, 10);
  await addNote(page);
  await expect(bylines(page)).toBeVisible();

  await page.getByRole("button", { name: "Settings" }).click();
  await page
    .getByRole("checkbox", { name: "Show names on sticky notes" })
    .uncheck();
  await page.keyboard.press("Escape");
  await expect(bylines(page)).toBeHidden();

  // The note's still signed, so showing names brings it back.
  await page.reload();
  await expect(bylines(page)).toBeHidden();
  await page.getByRole("button", { name: "Settings" }).click();
  await page
    .getByRole("checkbox", { name: "Show names on sticky notes" })
    .check();
  await expect(bylines(page)).toHaveText(["Ada"]);
});

test("remembers the name", async ({ page }) => {
  await setName(page, "Ada");
  await page.reload();

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue("Ada");
});

test("clearing the name stops signing notes", async ({ page }) => {
  await setName(page, "Ada");
  await setName(page, "");

  await addNote(page);

  await expect(bylines(page)).toHaveCount(0);
});

test("SVG exports keep the name as their author", async ({ page }) => {
  await setName(page, "Ada");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.locator(".canvas-export");
  await dialog.getByRole("radio", { name: "SVG", exact: true }).check();

  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export" }).click();

  const svg = await readFile(await (await download).path(), "utf8");
  expect(svg).toContain("<dc:creator>Ada</dc:creator>");
});

test("PNG exports keep the name as their author", async ({ page }) => {
  await setName(page, "Zoë");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.locator(".canvas-export");
  await dialog.getByRole("radio", { name: "PNG", exact: true }).check();

  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export" }).click();

  const png = await readFile(await (await download).path());
  // An iTXt chunk straight after the header, with the name in UTF-8.
  expect(png.subarray(37, 41).toString("latin1")).toBe("iTXt");
  expect(png.subarray(41).toString("utf8")).toContain("Author\0\0\0\0\0Zoë");
});
