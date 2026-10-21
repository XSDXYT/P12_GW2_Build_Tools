import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:5173",
    headless: true,
    channel: process.platform === "win32" ? "msedge" : undefined,
  },
  webServer: {
    command: "npm run dev -- --port 5173",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
  },
});
