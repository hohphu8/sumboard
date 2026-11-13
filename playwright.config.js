import { defineConfig } from "@playwright/test";
const production = process.env.SUMBOARD_PRODUCTION === "1";
const baseURL = `http://127.0.0.1:${production ? 4221 : 4220}`;
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 30000,
  workers: 1,
  forbidOnly: !!process.env.CI,
  outputDir: `test-results/${production ? "production" : "development"}`,
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile: `.local/${production ? "production" : "development"}-results.json`,
      },
    ],
  ],
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        channel: process.platform === "win32" ? "chrome" : undefined,
      },
    },
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: {
    command: `node node_modules/vite/bin/vite.js ${production ? "preview " : ""}--host 127.0.0.1 --port ${production ? 4221 : 4220} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60000,
  },
});
