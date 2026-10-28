import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = 5173;

// On macOS 27, Firefox can't read its shared app data folder when launched
// from a terminal without Full Disk Access, and fails with "Could not find
// profile folder". A separate home folder keeps it out of that folder. Remove
// once Playwright ships Firefox 158 or later.
// https://github.com/microsoft/playwright/issues/42768
//
// The config loads in every worker, so one fixed folder is reused rather than
// leaving a new one behind each time. It stays outside the repo because macOS
// marks the Library folders created inside it "deny delete", like a real home.
// To remove it: chmod -RN <folder> && rm -rf <folder>
const FIREFOX_HOME = join(tmpdir(), "playwright-firefox-home");
const firefoxEnv =
  process.platform === "darwin"
    ? { ...process.env, CFFIXED_USER_HOME: FIREFOX_HOME }
    : undefined;
if (firefoxEnv) {
  mkdirSync(FIREFOX_HOME, { recursive: true });
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        launchOptions: { env: firefoxEnv },
      },
    },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});
