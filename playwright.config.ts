import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3087",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3087",
    url: "http://127.0.0.1:3087",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
