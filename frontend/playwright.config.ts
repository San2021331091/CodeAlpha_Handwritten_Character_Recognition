import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir:"./tests", fullyParallel:false, workers:1, timeout:30000,
  use:{baseURL:"http://127.0.0.1:3100",trace:"retain-on-failure",channel:process.env.PLAYWRIGHT_CHANNEL},
  projects:[{name:"chromium",use:{...devices["Desktop Chrome"],viewport:{width:1440,height:1100}}}],
});
