import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: ".", testMatch: "*.browser.ts", workers: 1, timeout: 45000,
  outputDir: "/tmp/monet-surfaces-browser-results", use: { headless: true, channel: process.env.MONET_TEST_BROWSER_CHANNEL ?? (process.platform === "darwin" ? "chrome" : undefined) }, reporter: "list" });
