import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
});

// Opens the Settings dialog, types a name, and closes it.
async function setName(page: Page, firstName: string, lastName = "") {
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("textbox", { name: "First name" }).fill(firstName);
  await page.getByRole("textbox", { name: "Last name" }).fill(lastName);
  await page.keyboard.press("Escape");
}

// Adds a note in the middle of the canvas, or `x` of the way across, and
// stops typing in it.
async function addNote(page: Page, x = 0.5) {
  await page.getByRole("button", { name: "Sticky note" }).click();
  const box = (await page.locator("canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width * x, box.y + box.height / 2);
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

test("editing a note adds the name to its byline, once", async ({ page }) => {
  await setName(page, "Ada");
  await page.mouse.click(10, 10);
  await addNote(page);
  await setName(page, "Bo");
  await page.getByRole("button", { name: "Move" }).click();
  const note = page.locator(".canvas-note");

  // Moving it doesn't sign it.
  const box = (await note.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 60, { steps: 4 });
  await page.mouse.up();
  await expect(bylines(page)).toHaveText(["Ada"]);

  // Typing in it does, once however often it's edited.
  for (const text of ["Hi", " there"]) {
    await note.dblclick();
    await page.keyboard.type(text);
    await page.keyboard.press("Escape");
  }
  await expect(bylines(page)).toHaveText(["Ada, Bo"]);

  await page.reload();
  await expect(bylines(page)).toHaveText(["Ada, Bo"]);
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
  await setName(page, "Ada", "Lovelace");
  await page.reload();

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("textbox", { name: "First name" })).toHaveValue(
    "Ada"
  );
  await expect(page.getByRole("textbox", { name: "Last name" })).toHaveValue(
    "Lovelace"
  );
});

test("a whole name saved before is split into first and last", async ({
  page,
}) => {
  await page.evaluate(() => localStorage.setItem("name", "Mary Ann Smith"));
  await page.reload();

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("textbox", { name: "First name" })).toHaveValue(
    "Mary"
  );
  await expect(page.getByRole("textbox", { name: "Last name" })).toHaveValue(
    "Ann Smith"
  );
});

test("bylines show first names, and more once two signers share one", async ({
  page,
}) => {
  await setName(page, "Ada", "Lovelace");
  await page.mouse.click(10, 10);
  await addNote(page, 0.25);
  await expect(bylines(page)).toHaveText(["Ada"]);

  await setName(page, "Ada", "King");
  await page.mouse.click(10, 10);
  await addNote(page, 0.75);
  // Both notes change, the first one too.
  await expect(bylines(page)).toHaveText(["Ada L.", "Ada K."]);
});

test("clearing the name stops signing notes", async ({ page }) => {
  await setName(page, "Ada");
  await setName(page, "");

  await addNote(page);

  await expect(bylines(page)).toHaveCount(0);
});

test("SVG exports keep the whole name as their author", async ({ page }) => {
  await setName(page, "Ada", "Lovelace");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.locator(".canvas-export");
  await dialog.getByRole("radio", { name: "SVG", exact: true }).check();

  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export" }).click();

  const svg = await readFile(await (await download).path(), "utf8");
  expect(svg).toContain("<dc:creator>Ada Lovelace</dc:creator>");
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
