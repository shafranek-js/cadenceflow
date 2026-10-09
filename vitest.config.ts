import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Windows process workers can stall before a test starts; keep isolated thread workers there.
    pool: process.platform === "win32" ? "threads" : "forks",
    isolate: true,
    testTimeout: 15000,
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    coverage: { reporter: ["text", "html"] },
  },
});
