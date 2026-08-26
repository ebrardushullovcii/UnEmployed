import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@unemployed/ai-providers": path.resolve(
        currentDir,
        "packages/ai-providers/src/index.ts",
      ),
      "@renderer": path.resolve(currentDir, "apps/desktop/src/renderer/src"),
      "@unemployed/browser-runtime": path.resolve(
        currentDir,
        "packages/browser-runtime/src/index.ts",
      ),
      "@unemployed/contracts": path.resolve(
        currentDir,
        "packages/contracts/src/index.ts",
      ),
      "@unemployed/db": path.resolve(currentDir, "packages/db/src/index.ts"),
      "@unemployed/job-finder/discovery-ordering": path.resolve(
        currentDir,
        "packages/job-finder/src/discovery-ordering.ts",
      ),
      "@unemployed/job-finder/resume-record-identity": path.resolve(
        currentDir,
        "packages/job-finder/src/resume-record-identity.ts",
      ),
      "@unemployed/job-finder/source-health": path.resolve(
        currentDir,
        "packages/job-finder/src/source-health.ts",
      ),
      "@unemployed/job-finder": path.resolve(
        currentDir,
        "packages/job-finder/src/index.ts",
      ),
      "@unemployed/knowledge-base": path.resolve(
        currentDir,
        "packages/knowledge-base/src/index.ts",
      ),
    },
  },
  test: {
    setupFiles: [path.resolve(currentDir, "apps/desktop/src/test/setup.ts")],
    include: ["**/*.test.{ts,tsx}"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "**/.tmp/**",
      "**/apps/desktop/.tmp/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportOnFailure: true,
      include: [
        "apps/desktop/src/**/*.{js,jsx,mjs,cjs,ts,tsx}",
        "packages/*/src/**/*.{js,jsx,mjs,cjs,ts,tsx}",
      ],
      exclude: [
        "**/*.test.*",
        "**/*.d.*",
        "**/*fixtures.*",
        "**/test-fixtures/**",
        "**/.tmp/**",
        "**/coverage/**",
        "packages/job-finder/src/internal/workspace-discovery-ledger.performance.test.ts",
        "packages/job-finder/src/workspace-service.discovery-ledger-performance.test.ts",
      ],
    },
  },
});
