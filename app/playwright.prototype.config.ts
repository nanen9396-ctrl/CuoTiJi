import { defineConfig } from "@playwright/test";

const previewUrl = "http://127.0.0.1:4173";
const nodeExecutable = `"${process.execPath}"`;

export default defineConfig({
  testDir: "./tests/prototype",
  timeout: 15_000,
  use: {
    baseURL: previewUrl,
    launchOptions: {
      executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    },
    viewport: { width: 1100, height: 1100 },
  },
  webServer: {
    command: `${nodeExecutable} ./node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173`,
    url: previewUrl,
    reuseExistingServer: true,
  },
});
