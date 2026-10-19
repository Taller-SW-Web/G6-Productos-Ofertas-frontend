import { defineConfig } from "vitest/config";

// Configuración local del feature de inventario. El runner de la raíz
// (`npm test`) cubre Combos y Bulk; esta suite se ejecuta explícitamente con
// `npx vitest run --config src/features/inventory/adapters/vitest.config.ts`
// y no modifica los scripts compartidos del monorepo.
export default defineConfig({
  test: {
    include: ["src/features/inventory/adapters/*.spec.ts"],
    environment: "node",
    pool: "forks",
    maxWorkers: 1,
    fileParallelism: false,
  },
});
