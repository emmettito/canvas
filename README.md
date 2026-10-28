# Canvas

A simple art canvas in TypeScript. Draw with a pencil or eraser, pick from a
color palette, adjust the size of each tool, and undo or redo strokes.

## Development

Requires Node 24 (Vite 8 needs at least 20.19 or 22.12).

```sh
npm install
npm run dev
```

| Script                 | Description                              |
| ---------------------- | ---------------------------------------- |
| `npm run dev`          | Start the dev server                     |
| `npm run build`        | Type-check and build for production      |
| `npm run preview`      | Serve the production build               |
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

- [ ] Add modularization so it can be used in other projects
- [ ] Other canvas tools (eg. paint brushes & a ruler)
- [ ] Paint bucket
