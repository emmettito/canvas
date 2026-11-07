# <img src="public/favicon.svg" alt="" width="32" height="32" align="top"> Canvas

Utilities for building a drawing canvas: the drawing's data, and what works
with it. Strokes drawn with pressure, erased, filled with a paint bucket, and
found under the pointer or in a selection box; text, images and sticky notes,
stacked in layers; undo and redo; zooming and panning; exporting as PNG, JPEG
or SVG; reading saved drawings back, even ones saved by older versions; and
drawing together, live, through a server.

There's no UI: no elements, layout or styles. Your page builds its own, and
uses these for everything underneath it. The [demo page](#demo-page) is one
such UI.

**[Try the live demo](https://emmettito.github.io/canvas/)**

## Using it in another project

Install it from GitHub, which builds it as it installs. It works with any
framework, or none, and has no dependencies.

```sh
npm install github:emmettito/canvas --allow-git=root
```

npm 12 blocks git dependencies by default. `--allow-git=root` allows the ones
your own `package.json` lists. To skip the flag on later installs, add
`allow-git=root` to your project's `.npmrc`.

Or, to try changes to it before they're pushed, build it and install the copy
next to it:

```sh
npm run build
cd ../my-app
npm install ../canvas
```

Everything is a named export of `@emmettito/canvas`, and nothing runs on
import, so your build only keeps what you use. Most of it is plain functions
over plain data: a `Drawing` is JSON, so it can be saved, sent and compared
as it is. What draws takes a `CanvasRenderingContext2D`, so it draws on
whichever canvas you give it.

```ts
import {
  type Drawing,
  DrawingHistory,
  createId,
  drawStroke,
  exportDrawing,
  getStrokeBox,
} from "@emmettito/canvas";

const empty: Drawing = {
  background: "#ffffff",
  strokes: [],
  fills: [],
  erasers: [],
  images: [],
  texts: [],
  notes: [],
  order: [],
};
const history = new DrawingHistory(empty);

const stroke = {
  id: createId(),
  color: "#1e1e1e",
  size: 2.5,
  points: [
    { x: 10, y: 10, pressure: 0.4 },
    { x: 60, y: 40, pressure: 0.8 },
  ],
};
history.addStroke(stroke);
drawStroke(context, stroke);

history.undo();
history.redo();

// A PNG of what's drawn, at twice its size.
const area = getStrokeBox(stroke) ?? { x: 0, y: 0, width: 100, height: 100 };
const png = await exportDrawing(
  history.drawing,
  area,
  { format: "png", scale: 2, transparent: false },
  history.drawing.background,
  { noteColor: "#1e1e1e", fontFamily: "system-ui, sans-serif" },
  new Map()
);
```

## What's in it

| Area                | Exports                                                                                                                                                                            |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The data            | `Drawing`, `Stroke`, `Fill`, `ImageItem`, `TextBox`, `Note`, `RichText`, `Layer`, `Viewport`, `Box`, `Point` and the rest of the types                                             |
| Strokes             | `drawStroke`, `getStrokePieces`, `getStrokeReach`, `isStrokeAt`, `isStrokeInBox`, `moveStroke`, `resizeStroke`, `eraseStroke`, `eraseStrokes`, `getDistanceToStroke`               |
| Filling             | `floodFill`, `growMask`, `traceMask`, `simplifyRing`, `drawFills`, `getFillPath`                                                                                                   |
| Layers              | `resolveLayers`, `addStrokeLayer`, `addItemLayer`, `removeItemLayer`, `restackItemLayer`, `restackStrokeLayer`                                                                     |
| Undo and redo       | `DrawingHistory`, `applyChange`, `hasContent`                                                                                                                                      |
| Placing items       | `resizeBox`, `resizeBoxKeepingShape`, `snapBox`, `getImageSize`                                                                                                                    |
| Text                | `layOutRichText`, `toCssFont`, `fromPlainText`, `toPlainText`, `isBlank`, `getListMarkers`, `toLinkAddress`                                                                        |
| Sticky note signing | `getByline`, `getSignerNames`, `getShortNames`, `getFullName`, `splitName`                                                                                                         |
| Zoom and pan        | `zoomAround`, `stepZoom`, `clampZoom`, `panBy`, `fitViewport`, `toDrawingPoint`, `getVisibleArea`, `getStrokeBox`, `unionBoxes`                                                    |
| Colors              | `parseColor`, `readCssColor`, `readColorWithAlpha`, `toHex`, `withAlpha`, `splitAlpha`, `isDarkColor`, `getColorGrid`, `formatColor`, `readColor`, `addRecentColor`, `isToolColor` |
| Exporting           | `exportDrawing`, `renderDrawing`, `createSvg`, `getExportSize`, `canExportAt`, `getFileName`, `addPngText`                                                                         |
| Saving              | `readDrawing`, `readViewport`, `readEntries`, `readToolSettings`, `readExportOptions`, `upgradeDrawing`, `createMemoryStore`, `blobToDataUrl`, `dataUrlToBlob`                     |
| Drawing together    | `SharedHistory`, `replayEdits`, `createActivitySender`, `receiveActivity`, and `CollaborationServer` (below)                                                                       |

Each is documented where it's defined, in `src/`.

### Palette colors

The library has no palette of its own. Your page names its colors, e.g.
`"red"`, and says what each looks like. A tool's color, e.g. the pencil's, is
one of those names or a custom `"#rrggbb"`, so tool settings keep the name
and follow your palette as it changes. Strokes, fills and notes keep the
color they were drawn in, e.g. `"#e5484d"`, so the drawing looks the same
anywhere.

Where the library checks a color, you give it the palette: `isToolColor`
takes its names, and `readToolSettings` takes them along with the colors the
highlighter and new notes start with.

```ts
import { readToolSettings } from "@emmettito/canvas";

const settings = readToolSettings(JSON.parse(saved), {
  colors: ["black", "red", "blue", "yellow"],
  highlighter: "yellow",
  note: "yellow",
});
```

### Reading what's saved

Saved drawings, viewports and settings are checked as they're read, since
they come from storage or another person: `readDrawing`, `readViewport`,
`readToolSettings` and `readExportOptions` keep what's valid and leave out
the rest, and `upgradeDrawing` brings a drawing saved by an older version up
to date.

### Drawing together

`SharedHistory` is a `DrawingHistory` shared through a server: each change is
sent as an edit, others' edits are applied as they arrive, and undo only
undoes your own changes, leaving everyone else's, even ones made since.
`createActivitySender` and `receiveActivity` pass on what each person is in
the middle of, e.g. a stroke as it's drawn, without keeping it.

The library doesn't send anything itself: you carry the messages, e.g. over a
WebSocket. On the server, `CollaborationServer` from
`@emmettito/canvas/collaboration-server` runs the rooms. It has no
dependencies and doesn't touch the DOM, so it runs in Node. Connect each
person, pass on what they send, and close their connection when they go. A
room lasts until everyone's left, and keeps everything in memory, so it's for
small groups.

```ts
import { CollaborationServer } from "@emmettito/canvas/collaboration-server";
import { WebSocketServer } from "ws";

const rooms = new CollaborationServer();
new WebSocketServer({ port: 8080 }).on("connection", (socket) => {
  const connection = rooms.connect((message) =>
    socket.send(JSON.stringify(message))
  );
  socket.on("message", (data) => connection.receive(JSON.parse(String(data))));
  socket.on("close", () => connection.close());
});
```

Changes to different parts of the same item are both kept, e.g. one person
moving a note while another types in it. The same part changed by two people
at once, e.g. both typing in a note, keeps whichever reached the server last.

## Development

Requires Node 24 (Vite 8 needs at least 20.19 or 22.12) and npm 12.

```sh
npm install
npm run dev
```

| Script                 | Description                              |
| ---------------------- | ---------------------------------------- |
| `npm run dev`          | Start the dev server with the demo page  |
| `npm run build`        | Type-check and build the library         |
| `npm run build:demo`   | Type-check and build the demo page       |
| `npm run build:e2e`    | Build the demo and test pages for CI     |
| `npm run preview`      | Serve the demo page build                |
| `npm run lint`         | Lint with oxlint, failing on warnings    |
| `npm run typecheck`    | Type-check without building              |
| `npm run format`       | Format with oxfmt                        |
| `npm run format:check` | Check formatting without changing files  |
| `npm run test`         | Run the unit tests with Vitest           |
| `npm run test:watch`   | Run the unit tests in watch mode         |
| `npm run test:e2e`     | Run the Playwright tests in all browsers |
| `npm run icons <svg>`  | Make the demo's favicons from an SVG     |

The Playwright tests run in Chromium, Firefox, and WebKit. Install the browsers
once before the first run:

```sh
npx playwright install
```

The demo page has only the drawing tools, so most tests use a test page with
every control of the demo's canvas instead, `e2e/fixtures/full.html`: it saves in the browser, with the demo's
store, has the File
menu and the timer, and keeps the mounted canvas as `window.canvas`, for the
tests to call what a page would from its own controls, e.g. `setAuthor`. It
draws together in the room in its address's `room`, through a WebSocket at
`/collaborate` that the dev server and `vite preview` run with
`CollaborationServer` (see `server/collaboration-socket.ts`).

## Demo page

The demo, in `demo/`, is a whole canvas built on the library: its
toolbars, menus, dialogs, text editing (plain, or formatted with ProseMirror),
stylesheet and saving are all its own, and it imports the library from
`@emmettito/canvas`, the way another project would, so it can only use what
the library exports. It's a good place to see how the utilities fit together.

`npm run dev` serves the demo page, where the canvas fills the window, with
clear and export, then select, hand and the drawing tools, at the bottom, the
zoom at the top right, and formatted text. It's only for drawing: there's no
File menu, timer, settings or drawing together, and undo and redo are from the
keyboard, so there's no way to undo on a touch screen without one. What's
drawn is saved in the browser, with the demo's own store, so a refresh keeps
it, and the export dialog names it.

The demo's toolbar icons are [Phosphor](https://phosphoricons.com)'s regular
weight, under the MIT license, which the demo page ships in
`public/licenses/phosphor-icons.txt`. They, and ProseMirror, are development
dependencies only: the library doesn't use them.

The favicons are a drawing made on the canvas. To make new ones, export a
drawing as SVG and run `npm run icons path/to/drawing.svg`. It crops the
strokes to a square, keeps the file small, and makes every size browsers and
devices ask for, with a web app manifest, in `public/`.

Every push to `main` builds the demo page and publishes it to GitHub Pages (see
`.github/workflows/deploy-demo.yml`). For that to work, set **Settings → Pages →
Source** to **GitHub Actions** in the repository.

## License

[MIT](LICENSE)
