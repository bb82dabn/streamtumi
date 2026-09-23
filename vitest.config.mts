import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: [new URL("./tests/setup.ts", import.meta.url).pathname],
    coverage: { reporter: ["text", "html"] },
  },
  resolve: { alias: { "@": new URL(".", import.meta.url).pathname } },
});
