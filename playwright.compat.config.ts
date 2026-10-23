import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testMatch: [
    "build-description.spec.ts",
    "published-builds.spec.ts",
    "published-scroll.spec.ts",
    "library.spec.ts",
    "local-builds.spec.ts",
    "build-classification.spec.ts",
    "gear-batch-runes.spec.ts",
    "consumables.spec.ts",
    "sigils.spec.ts",
    "weapon-skills.spec.ts",
  ],
  outputDir: "test-results/compat",
  use: { ...base.use, channel: undefined },
  projects: [
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
});
