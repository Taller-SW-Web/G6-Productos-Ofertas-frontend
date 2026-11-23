import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/features/catalog/hooks/*.spec.tsx"],
    environment: "jsdom",
    pool: "forks",
    maxWorkers: 1,
    fileParallelism: false,
  },
});
