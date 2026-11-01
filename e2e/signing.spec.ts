import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/e2e/fixtures/full.html");
  await expect(page.locator("canvas")).toBeVisible();
});

// The mounted canvas, as the test page keeps it.
interface Canvas {
  setAuthor: (name: { firstName: string; lastName: string }) => void;
  setShowAuthors: (show: boolean) => void;
}

// Signs new notes with a name, as a page's own name fields would.
function setName(page: Page, firstName: string, lastName = "") {
  return page.evaluate(
    (name) => (window as unknown as { canvas: Canvas }).canvas.setAuthor(name),
    { firstName, lastName }
  );
}

function setShowAuthors(page: Page, show: boolean) {
  return page.evaluate(
    (show) =>
      (window as unknown as { canvas: Canvas }).canvas.setShowAuthors(show),
    show
  );
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

  await setName(page, "Ada");
  await addNote(page, 0.8);
  await expect(bylines(page)).toHaveText(["Ada"]);

  // It's kept with the drawing.
  await page.reload();
  await expect(bylines(page)).toHaveText(["Ada"]);
});

test("editing a note adds the name to its byline, once", async ({ page }) => {
  await setName(page, "Ada");
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

test("hiding names hides notes' bylines, and showing them brings them back", async ({
  page,
}) => {
  await setName(page, "Ada");
  await addNote(page);
  await expect(bylines(page)).toBeVisible();

  await setShowAuthors(page, false);
  await expect(bylines(page)).toBeHidden();

  // The note's still signed, so showing names brings it back.
  await page.reload();
  await setShowAuthors(page, false);
  await expect(bylines(page)).toBeHidden();
  await setShowAuthors(page, true);
  await expect(bylines(page)).toHaveText(["Ada"]);
});

test("bylines show first names, and more once two signers share one", async ({
  page,
}) => {
  await setName(page, "Ada", "Lovelace");
  await addNote(page, 0.25);
  await expect(bylines(page)).toHaveText(["Ada"]);

  await setName(page, "Ada", "King");
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
