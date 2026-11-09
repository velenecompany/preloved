import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      "server-only": fileURLToPath(new URL("./lib/__mocks__/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["lib/**/*.test.ts"],
    env: { JWT_SECRET: "secreto-de-pruebas-con-mas-de-32-caracteres" },
  },
});
