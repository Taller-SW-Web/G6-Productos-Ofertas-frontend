import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "src/features/combos/**/*.test.ts",
      "src/features/promotions/**/*.test.tsx",
      "src/features/auth/**/*.test.ts",
      "src/features/auth/**/*.spec.ts",
      "src/features/catalog/hooks/*.spec.tsx",
    ],
    environment: "node",
    pool: "forks",
    maxWorkers: 1,
    fileParallelism: false,
  },
});
