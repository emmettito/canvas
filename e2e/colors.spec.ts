import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/e2e/fixtures/full.html");
  await expect(page.locator("canvas")).toBeVisible();
});

// Types a custom color into the open color picker.
async function typeHex(page: Page, hex: string) {
  const field = page.getByRole("textbox", { name: "Color code" });
  await field.fill(hex);
  await field.press("Enter");
}

// A color in the color control's popover, rather than in the tool's options.
function getSwatch(page: Page, name: string) {
  return page
    .locator(".canvas-popover")
    .getByRole("button", { name, exact: true });
}

// The color control, which says the color it picks.
function getColorButton(page: Page, name: string) {
  return page.getByRole("button", { name: `Color: ${name}`, exact: true });
}

// The first note's color, as "#rrggbb", the way the dropper and exports write
// it.
function getNoteHex(page: Page) {
  return page
    .locator(".canvas-note")
    .first()
    .evaluate((element) => {
      const [r, g, b] = getComputedStyle(element)
        .backgroundColor.match(/\d+/g)!
        .map(Number);
      return `#${[r, g, b]
        .map((channel) => channel.toString(16).padStart(2, "0"))
        .join("")}`;
    });
}

// The strokes saved, as they're kept.
function getSavedStrokes(page: Page) {
  return page.evaluate(() =>
    Object.entries(localStorage)
      .filter(([key]) => key.endsWith(":strokes"))
      .flatMap(([, value]) => JSON.parse(value))
  );
}

// Sets the open canvas's background, as a page's own picker would.
function setBackground(page: Page, color: string) {
  return page.evaluate(
    (color) =>
      (
        window as unknown as {
          canvas: { setBackground: (color: string) => void };
        }
      ).canvas.setBackground(color),
    color
  );
}

// The background the page was last told the canvas has.
function getShownBackground(page: Page) {
  return page.evaluate(
    () => (window as unknown as { background: string }).background
  );
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

// The toolbars' colors are only read once they're on the page, where the
// palette's variables are defined.
test("mounting warns of no undefined CSS variable", async ({ page }) => {
  const warnings: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning") {
      warnings.push(message.text());
    }
  });
  await page.reload();
  await expect(page.locator("canvas")).toBeVisible();

  expect(warnings.filter((text) => text.includes("is not defined"))).toEqual(
    []
  );
});

test("a custom color can be typed, and is offered again", async ({ page }) => {
  await getColorButton(page, "Black").click();
  await typeHex(page, "ff8800");

  await expect(getColorButton(page, "#ff8800")).toBeVisible();
  await drawAt(page, 400, 300);
  expect(await getPixel(page, 400, 300)).toEqual([255, 136, 0, 255]);

  // Back to black, and the custom one is a recent color to pick again.
  await getColorButton(page, "#ff8800").click();
  await getSwatch(page, "Black").click();
  await getColorButton(page, "Black").click();
  await page
    .getByRole("group", { name: "Recent colors" })
    .getByRole("button", { name: "#ff8800", exact: true })
    .click();
  await expect(getColorButton(page, "#ff8800")).toBeVisible();

  // Both are kept.
  await page.reload();
  await getColorButton(page, "#ff8800").click();
  await expect(
    page.getByRole("group", { name: "Recent colors" })
  ).toBeVisible();
});

test("a hex that isn't a color isn't used", async ({ page }) => {
  await getColorButton(page, "Black").click();
  await typeHex(page, "#12345");

  await expect(
    page.getByRole("textbox", { name: "Color code" })
  ).toHaveAttribute("aria-invalid", "true");
  await page.keyboard.press("Escape");
  await expect(getColorButton(page, "Black")).toBeVisible();
});

test("any CSS color can be typed, and a palette one stays the palette's", async ({
  page,
}) => {
  await getColorButton(page, "Black").click();
  await typeHex(page, "rebeccapurple");
  await expect(getColorButton(page, "#663399")).toBeVisible();

  await typeHex(page, "hsl(120 100% 25%)");
  await expect(getColorButton(page, "#008000")).toBeVisible();

  // The palette's own red.
  await typeHex(page, "red");
  await expect(getColorButton(page, "Red")).toBeVisible();
});

test("colors that can't be seen, or aren't colors, aren't used", async ({
  page,
}) => {
  await getColorButton(page, "Black").click();
  for (const value of ["transparent", "inherit", "#12345"]) {
    await typeHex(page, value);
    await expect(
      page.getByRole("textbox", { name: "Color code" })
    ).toHaveAttribute("aria-invalid", "true");
  }
  // A see-through one typed as hex is taken solid.
  await typeHex(page, "rgb(0 0 255 / 50%)");
  await expect(getColorButton(page, "#0000ff")).toBeVisible();
});

test("a see-through color can be typed as CSS, and draws a see-through stroke", async ({
  page,
}) => {
  await getColorButton(page, "Black").click();
  await page.getByRole("button", { name: "Color format: Hex" }).click();
  await page.getByRole("option", { name: "CSS" }).click();
  await typeHex(page, "rgb(255 0 0 / 50%)");

  await expect(getColorButton(page, "#ff000080")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Color code" })).toHaveValue(
    "rgba(255, 0, 0, 0.5)"
  );
  await expect(page.getByRole("slider", { name: "Opacity" })).toHaveValue("50");

  await page.keyboard.press("Escape");
  await drawAt(page, 400, 300);
  // It's kept solid, with how much of it shows.
  const [stroke] = await getSavedStrokes(page);
  expect(stroke.color).toBe("#ff0000");
  expect(stroke.opacity).toBeCloseTo(0.5, 2);
  const [, , , alpha] = await getPixel(page, 400, 300);
  expect(alpha).toBeGreaterThan(100);
  expect(alpha).toBeLessThan(155);
});

test("the opacity is typed as a percent, and kept as the color's", async ({
  page,
}) => {
  await getColorButton(page, "Black").click();
  await page.getByRole("button", { name: "#FF0000", exact: true }).click();
  await expect(getColorButton(page, "Red")).toBeVisible();

  const percent = page.getByRole("textbox", { name: "Opacity percent" });
  await percent.fill("25");
  await percent.press("Enter");

  await expect(getColorButton(page, "#ff000040")).toBeVisible();
  await expect(percent).toHaveValue("25%");
  // The pencil's options say how much shows.
  await expect(
    page
      .getByRole("toolbar", { name: "Pencil options" })
      .getByRole("button", { name: "Custom color: #FF0000 · 25%" })
  ).toBeVisible();
});

test("the color format is kept, and the color code is written in it", async ({
  page,
}) => {
  await getColorButton(page, "Black").click();
  await getSwatch(page, "Red").click();
  await getColorButton(page, "Red").click();
  await page.getByRole("button", { name: "Color format: Hex" }).click();
  await page.getByRole("option", { name: "RGB" }).click();

  const code = page.getByRole("textbox", { name: "Color code" });
  await expect(code).toHaveValue("255, 0, 0");
  await code.fill("0, 128, 0");
  await code.press("Enter");
  await expect(getColorButton(page, "#008000")).toBeVisible();

  await page.reload();
  await getColorButton(page, "#008000").click();
  await expect(
    page.getByRole("button", { name: "Color format: RGB" })
  ).toBeVisible();
  await expect(code).toHaveValue("0, 128, 0");
});

test("each tool keeps its own color format", async ({ page }) => {
  const pencil = page.getByRole("toolbar", { name: "Pencil options" });
  await pencil.getByRole("button", { name: /^Custom color: / }).click();
  await page.getByRole("button", { name: "Color format: Hex" }).click();
  await page.getByRole("option", { name: "RGB" }).click();

  await page.getByRole("button", { name: "Highlighter" }).click();
  const highlighter = page.getByRole("toolbar", {
    name: "Highlighter options",
  });
  await highlighter.getByRole("button", { name: /^Custom color: / }).click();
  await expect(
    page.getByRole("button", { name: "Color format: Hex" })
  ).toBeVisible();

  await page.getByRole("button", { name: "Pencil" }).click();
  await pencil.getByRole("button", { name: /^Custom color: / }).click();
  await expect(
    page.getByRole("button", { name: "Color format: RGB" })
  ).toBeVisible();
});

test("the tool's options open the full picker from the color picked", async ({
  page,
}) => {
  const options = page.getByRole("toolbar", { name: "Pencil options" });
  await options.getByRole("button", { name: "Blue", exact: true }).click();
  await expect(getColorButton(page, "Blue")).toBeVisible();

  const chip = options.getByRole("button", { name: /^Custom color: / });
  await chip.click();
  await expect(chip).toHaveAttribute("aria-expanded", "true");
  const code = page.getByRole("textbox", { name: "Color code" });
  await expect(code).toHaveValue("#2C71FF");
  await code.fill("#00aa55");
  await code.press("Enter");

  await expect(getColorButton(page, "#00aa55")).toBeVisible();
  await expect(
    options.getByRole("button", { name: "Custom color: #00AA55" })
  ).toBeVisible();
});

test("the dropper picks a stroke's color, then goes back to the pencil", async ({
  page,
}) => {
  await getColorButton(page, "Black").click();
  await getSwatch(page, "Red").click();
  await drawAt(page, 400, 300);
  await getColorButton(page, "Red").click();
  await getSwatch(page, "Blue").click();

  await page.getByRole("button", { name: "Dropper" }).click();
  await page.mouse.click(400, 300);

  // The palette's red, not a copy of it.
  await expect(getColorButton(page, "Red")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pencil" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
});

test("the color picker's dropper picks a color for the tool it's for", async ({
  page,
}) => {
  await getColorButton(page, "Black").click();
  await getSwatch(page, "Red").click();
  await drawAt(page, 400, 300);
  await page.getByRole("button", { name: "Highlighter" }).click();
  const options = page.getByRole("toolbar", { name: "Highlighter options" });
  await options.getByRole("button", { name: /^Custom color/ }).click();

  await page
    .locator(".canvas-popover")
    .getByRole("button", { name: "Pick a color" })
    .click();
  // The picker's put away, and the highlighter's options stay while it picks.
  await expect(page.locator(".canvas-popover")).toHaveCount(0);
  await expect(options).toBeVisible();
  await page.mouse.click(400, 300);

  await expect(
    page.getByRole("button", { name: "Highlighter" })
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    options.getByRole("button", { name: "Red", exact: true })
  ).toHaveAttribute("aria-pressed", "true");
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
  // The note's own color, a light shade of yellow.
  await expect(getColorButton(page, await getNoteHex(page))).toBeVisible();
  await expect(page.locator(".canvas-note")).not.toHaveAttribute(
    "data-editing"
  );

  // Off it, the canvas's white.
  await page.getByRole("button", { name: "Dropper" }).click();
  await page.mouse.click(150, 150);
  await expect(getColorButton(page, "White")).toBeVisible();
});

test("with the note tool, the dropper picks the notes' color", async ({
  page,
}) => {
  await getColorButton(page, "Black").click();
  await getSwatch(page, "Green").click();
  await drawAt(page, 400, 300);
  await page.getByRole("button", { name: "Sticky note" }).click();

  await page.getByRole("button", { name: "Dropper" }).click();
  await page.mouse.click(400, 300);

  await expect(
    page.getByRole("button", { name: "Sticky note" })
  ).toHaveAttribute("aria-pressed", "true");
  await expect(getColorButton(page, "Green")).toBeVisible();
});

test("each canvas has its own background, which is undone and kept", async ({
  page,
}) => {
  await setBackground(page, "#1f2023");

  const surface = page.locator(".canvas-surface");
  await expect(surface).toHaveCSS("background-color", "rgb(31, 32, 35)");
  // The black pencil turns white, to show on it.
  await expect(
    page.getByRole("button", { name: "Color: White" })
  ).toBeVisible();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(surface).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await page.getByRole("button", { name: "Redo" }).click();

  await page.reload();
  await expect(surface).toHaveCSS("background-color", "rgb(31, 32, 35)");
  // The page is told it, to show it.
  expect(await getShownBackground(page)).toBe("#1f2023");

  // A new canvas starts with the theme's.
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("button", { name: "New canvas" }).click();
  await expect(surface).toHaveCSS("background-color", "rgb(255, 255, 255)");
});

test("a custom background is exported", async ({ page }) => {
  await setBackground(page, "#fde68a");
  await expect(page.locator(".canvas-surface")).toHaveCSS(
    "background-color",
    "rgb(253, 230, 138)"
  );

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
  // The color picked opens the full picker in place of the palette.
  await bar.getByRole("button", { name: /^Custom color: / }).click();
  await bar.getByRole("textbox", { name: "Color code" }).fill("#7c3aed");
  await bar.getByRole("textbox", { name: "Color code" }).press("Enter");
  // Still typing.
  await expect(bar).toBeVisible();
  await page.keyboard.press("Escape");

  await expect(page.locator(".canvas-text [data-color]")).toHaveCSS(
    "color",
    "rgb(124, 58, 237)"
  );
  await getColorButton(page, "Black").click();
  await expect(
    page
      .getByRole("group", { name: "Recent colors" })
      .getByRole("button", { name: "#7c3aed", exact: true })
  ).toBeVisible();
});

test("the color code box shows the color picked now", async ({ page }) => {
  const code = page.getByRole("textbox", { name: "Color code" });

  // A palette color, as it's shown.
  await getColorButton(page, "Black").click();
  await expect(code).toHaveValue("#000000");
  await getSwatch(page, "Red").click();
  await getColorButton(page, "Red").click();
  await expect(code).toHaveValue("#FF0000");

  // Clicking it selects the code, so a new one types over it.
  await code.click();
  await page.keyboard.type("orange");
  await page.keyboard.press("Enter");
  await expect(getColorButton(page, "#ffa500")).toBeVisible();
});

test("the format bar's color code shows the text's color", async ({ page }) => {
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.mouse.click(400, 300);
  const bar = page.getByRole("toolbar", { name: "Text formatting" });

  await bar.getByRole("button", { name: "Text color" }).click();

  // The pencil's black, which new text is in.
  const chip = bar.getByRole("button", { name: "Custom color: #000000" });
  await expect(chip).toBeVisible();
  await chip.click();
  await expect(bar.getByRole("textbox", { name: "Color code" })).toHaveValue(
    "#000000"
  );
});
