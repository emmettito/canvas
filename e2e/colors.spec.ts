import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
});

// Types a custom color into the open color picker.
async function typeHex(page: Page, hex: string) {
  const field = page.getByRole("textbox", { name: "Hex color" });
  await field.fill(hex);
  await field.press("Enter");
}

// Draws a short line across `x`, `y` on screen.
async function drawAt(page: Page, x: number, y: number) {
  await page.mouse.move(x - 30, y);
  await page.mouse.down();
  await page.mouse.move(x + 30, y, { steps: 5 });
  await page.mouse.up();
}

// The color drawn on the canvas at `x`, `y` on screen.
function getPixel(page: Page, x: number, y: number) {
  return page.locator("canvas").evaluate(
    (canvas: HTMLCanvasElement, [x, y]) => {
      const { left, top } = canvas.getBoundingClientRect();
      const ratio = canvas.width / canvas.getBoundingClientRect().width;
      return [
        ...canvas
          .getContext("2d")!
          .getImageData(
            Math.round((x - left) * ratio),
            Math.round((y - top) * ratio),
            1,
            1
          ).data,
      ];
    },
    [x, y]
  );
}

test("a custom color can be typed, and is offered again", async ({ page }) => {
  await page.getByRole("button", { name: "Color: black" }).click();
  await typeHex(page, "ff8800");

  await expect(
    page.getByRole("button", { name: "Color: #ff8800" })
  ).toBeVisible();
  await drawAt(page, 400, 300);
  expect(await getPixel(page, 400, 300)).toEqual([255, 136, 0, 255]);

  // Back to black, and the custom one is a recent color to pick again.
  await page.getByRole("button", { name: "Color: #ff8800" }).click();
  await page.getByRole("button", { name: "black", exact: true }).click();
  await page.getByRole("button", { name: "Color: black" }).click();
  await page.getByRole("button", { name: "#ff8800", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Color: #ff8800" })
  ).toBeVisible();

  // Both are kept.
  await page.reload();
  await page.getByRole("button", { name: "Color: #ff8800" }).click();
  await expect(page.getByText("Recent")).toBeVisible();
});

test("a hex that isn't a color isn't used", async ({ page }) => {
  await page.getByRole("button", { name: "Color: black" }).click();
  await typeHex(page, "#12345");

  await expect(
    page.getByRole("textbox", { name: "Hex color" })
  ).toHaveAttribute("aria-invalid", "true");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Color: black" })
  ).toBeVisible();
});

test("the browser's color picker picks a custom color", async ({ page }) => {
  await page.getByRole("button", { name: "Color: black" }).click();

  await page.getByLabel("Custom color").fill("#00aa55");

  await expect(
    page.getByRole("button", { name: "Color: #00aa55" })
  ).toBeVisible();
});

test("the dropper picks a stroke's color, then goes back to the pencil", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Color: black" }).click();
  await page.getByRole("button", { name: "red", exact: true }).click();
  await drawAt(page, 400, 300);
  await page.getByRole("button", { name: "Color: red" }).click();
  await page.getByRole("button", { name: "blue", exact: true }).click();

  await page.getByRole("button", { name: "Dropper" }).click();
  await page.mouse.click(400, 300);

  // The palette's red, not a copy of it.
  await expect(page.getByRole("button", { name: "Color: red" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pencil" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
});

test("the dropper picks from notes and the background too", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Sticky note" }).click();
  await page.mouse.click(500, 300);
  await page.keyboard.type("Pick me");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Pencil" }).click();

  // On the note, without opening it.
  await page.getByRole("button", { name: "Dropper" }).click();
  await page.mouse.click(540, 340);
  await expect(
    page.getByRole("button", { name: "Color: #fefe99" })
  ).toBeVisible();
  await expect(page.locator(".canvas-note")).not.toHaveAttribute(
    "data-editing"
  );

  // Off it, the canvas's white.
  await page.getByRole("button", { name: "Dropper" }).click();
  await page.mouse.click(150, 150);
  await expect(
    page.getByRole("button", { name: "Color: white" })
  ).toBeVisible();
});

test("with the note tool, the dropper picks the notes' color", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Color: black" }).click();
  await page.getByRole("button", { name: "green", exact: true }).click();
  await drawAt(page, 400, 300);
  await page.getByRole("button", { name: "Sticky note" }).click();

  await page.getByRole("button", { name: "Dropper" }).click();
  await page.mouse.click(400, 300);

  await expect(
    page.getByRole("button", { name: "Sticky note" })
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Color: green" })
  ).toBeVisible();
});

test("each canvas has its own background, which is undone and kept", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Background: White" }).click();
  await page.getByRole("button", { name: "Charcoal" }).click();

  const surface = page.locator(".canvas-surface");
  await expect(surface).toHaveCSS("background-color", "rgb(31, 32, 35)");
  // The black pencil turns white, to show on it.
  await expect(
    page.getByRole("button", { name: "Color: white" })
  ).toBeVisible();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(surface).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await page.getByRole("button", { name: "Redo" }).click();

  await page.reload();
  await expect(surface).toHaveCSS("background-color", "rgb(31, 32, 35)");
  await expect(
    page.getByRole("button", { name: "Background: Charcoal" })
  ).toBeVisible();

  // A new canvas starts with the theme's.
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("button", { name: "New canvas" }).click();
  await expect(surface).toHaveCSS("background-color", "rgb(255, 255, 255)");
});

test("a custom background is exported", async ({ page }) => {
  await page.getByRole("button", { name: "Background: White" }).click();
  await typeHex(page, "#fde68a");
  await expect(
    page.getByRole("button", { name: "Background: #fde68a" })
  ).toBeVisible();

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.locator(".canvas-export");
  await dialog.getByRole("radio", { name: "SVG", exact: true }).check();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export" }).click();

  const svg = (await readFile(await (await download).path())).toString();
  expect(svg).toMatch(
    /<rect x="0" y="0" width="[\d.]+" height="[\d.]+" fill="#fde68a"\/>/
  );
});

test("text can be any color, which is offered again", async ({ page }) => {
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.mouse.click(400, 300);
  await page.keyboard.type("Custom");
  await page.keyboard.press("ControlOrMeta+a");
  const bar = page.getByRole("toolbar", { name: "Text formatting" });

  await bar.getByRole("button", { name: "Text color" }).click();
  await bar.getByRole("textbox", { name: "Hex color" }).fill("#7c3aed");
  await bar.getByRole("textbox", { name: "Hex color" }).press("Enter");
  // Still typing.
  await expect(bar).toBeVisible();
  await page.keyboard.press("Escape");

  await expect(page.locator(".canvas-text [data-color]")).toHaveCSS(
    "color",
    "rgb(124, 58, 237)"
  );
  await page.getByRole("button", { name: "Color: black" }).click();
  await expect(
    page.getByRole("button", { name: "#7c3aed", exact: true })
  ).toBeVisible();
});
