import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/features/pricing/adapters/httpPricingRepository.spec.ts"],
    environment: "node",
    pool: "forks",
    maxWorkers: 1,
    fileParallelism: false,
  },
});
