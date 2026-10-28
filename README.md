# Canvas

A simple art canvas with no dependencies. Draw with a pencil or eraser, pick
from a color palette, adjust the size of each tool, and undo or redo strokes.

## Using it in another project

Build the library, then install it in the other project. It works with any
framework, or none.

```sh
npm run build
cd ../my-app
npm install ../canvas
```

Import the stylesheet once and mount the canvas in an element. The canvas fills
the element, so give it a size.

```ts
import { mountCanvas } from "@emmettito/canvas";
import "@emmettito/canvas/styles.css";

const canvas = mountCanvas(document.getElementById("drawing")!);

// Later, to remove it:
canvas.unmount();
```

The stylesheet only styles the canvas and its toolbar, so it doesn't affect the
rest of the page, and the page's element styles (e.g. `button {}`) don't affect
the toolbar. Toolbar text uses the page's font.

To change the colors, set these variables on `.canvas-root` in a rule that
isn't in a CSS layer:

```css
.canvas-root {
  --canvas-color-canvas: #fdf6e3;
}
```

| Variable                             | Used for                            |
| ------------------------------------ | ----------------------------------- |
| `--canvas-color-canvas`              | Drawing surface                     |
| `--canvas-color-cursor`              | Tool size preview under the pointer |
| `--canvas-color-control`             | Buttons and the size slider         |
| `--canvas-color-control-text`        | Button text, and the selected tool  |
| `--canvas-color-control-active-text` | Selected tool's text                |
| `--canvas-color-control-thumb`       | Size slider handle                  |
| `--canvas-color-popover`             | Popover background                  |
| `--canvas-color-ring`                | Ring around the selected color      |
| `--canvas-color-ring-on-light`       | That ring on light colors           |
| `--canvas-shadow-control`            | Shadow on the canvas and controls   |

The drawing colors are `--canvas-color-` followed by `black`, `gray`, `white`,
`cyan`, `blue`, `purple`, `magenta`, `pink`, `red`, `orange`, `amber`, `gold`,
`yellow`, `lime` and `green`. Changing one changes its swatch and new strokes in
that color.

## Development

Requires Node 24 (Vite 8 needs at least 20.19 or 22.12).

```sh
npm install
npm run dev
```

| Script                 | Description                              |
| ---------------------- | ---------------------------------------- |
| `npm run dev`          | Start the dev server                     |
| `npm run build`        | Type-check and build the library         |
| `npm run build:demo`   | Type-check and build the demo page       |
| `npm run preview`      | Serve the demo page build                |
| `npm run lint`         | Lint with oxlint, failing on warnings    |
| `npm run typecheck`    | Type-check without building              |
| `npm run format`       | Format with oxfmt                        |
| `npm run format:check` | Check formatting without changing files  |
| `npm run test`         | Run the unit tests with Vitest           |
| `npm run test:watch`   | Run the unit tests in watch mode         |
| `npm run test:e2e`     | Run the Playwright tests in all browsers |

The Playwright tests run in Chromium, Firefox, and WebKit. Install the browsers
once before the first run:

```sh
npx playwright install
```

## To-do list

- [x] Add modularization so it can be used in other projects
- [ ] Other canvas tools (eg. paint brushes & a ruler)
- [ ] Paint bucket

## License

[MIT](LICENSE)
