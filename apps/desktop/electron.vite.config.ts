import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const aiProvidersPath = path.resolve(
  currentDir,
  "../../packages/ai-providers/src/index.ts",
);
const browserAgentPath = path.resolve(
  currentDir,
  "../../packages/browser-agent/src/index.ts",
);
const browserRuntimePath = path.resolve(
  currentDir,
  "../../packages/browser-runtime/src/index.ts",
);
const contractsPath = path.resolve(
  currentDir,
  "../../packages/contracts/src/index.ts",
);
const corePath = path.resolve(currentDir, "../../packages/core/src/index.ts");
const dbPath = path.resolve(currentDir, "../../packages/db/src/index.ts");
const interviewHelperPath = path.resolve(
  currentDir,
  "../../packages/interview-helper/src/index.ts",
);
const jobFinderDiscoveryOrderingPath = path.resolve(
  currentDir,
  "../../packages/job-finder/src/discovery-ordering.ts",
);
const jobFinderResumeRecordIdentityPath = path.resolve(
  currentDir,
  "../../packages/job-finder/src/resume-record-identity.ts",
);
const jobFinderSourceHealthPath = path.resolve(
  currentDir,
  "../../packages/job-finder/src/source-health.ts",
);
const jobFinderApplicationSubmissionRuntimeMainPath = path.resolve(
  currentDir,
  "../../packages/job-finder/src/application-submission-runtime-main.ts",
);
const jobFinderPath = path.resolve(
  currentDir,
  "../../packages/job-finder/src/index.ts",
);
const knowledgeBasePath = path.resolve(
  currentDir,
  "../../packages/knowledge-base/src/index.ts",
);
const osIntegrationPath = path.resolve(
  currentDir,
  "../../packages/os-integration/src/index.ts",
);

const workspaceAliases = {
  "@unemployed/ai-providers": aiProvidersPath,
  "@unemployed/browser-agent": browserAgentPath,
  "@unemployed/browser-runtime": browserRuntimePath,
  "@unemployed/contracts": contractsPath,
  "@unemployed/core": corePath,
  "@unemployed/db": dbPath,
  "@unemployed/interview-helper": interviewHelperPath,
  "@unemployed/job-finder/discovery-ordering": jobFinderDiscoveryOrderingPath,
  "@unemployed/job-finder/resume-record-identity":
    jobFinderResumeRecordIdentityPath,
  "@unemployed/job-finder/source-health": jobFinderSourceHealthPath,
  "@unemployed/job-finder": jobFinderPath,
  "@unemployed/knowledge-base": knowledgeBasePath,
  "@unemployed/os-integration": osIntegrationPath,
};

const mainWorkspaceAliases = {
  ...workspaceAliases,
  "@unemployed/job-finder/application-submission-runtime-main":
    jobFinderApplicationSubmissionRuntimeMainPath,
};

export default defineConfig({
  main: {
    resolve: {
      alias: mainWorkspaceAliases,
    },
    build: {
      rollupOptions: {
        external: [
          "playwright",
          "playwright-core",
          "chromium-bidi",
          "jsdom",
          "@mozilla/readability",
          // Bundling ws turns its optional native `bufferutil` require into an
          // empty module, so masked frames over 48 bytes from the CDP client
          // crash main ("bufferUtil.unmask is not a function"). Load it as
          // the installed dependency instead.
          "ws",
        ],
        output: {
          format: "cjs",
          entryFileNames: "[name].cjs",
          chunkFileNames: "[name]-[hash].cjs",
        },
      },
    },
  },
  preload: {
    resolve: {
      alias: workspaceAliases,
    },
    build: {
      rollupOptions: {
        input: {
          index: path.resolve(currentDir, "src/preload/index.ts"),
          // Bridge-free page preload for the embedded browser (ADR 0017).
          "browser-page": path.resolve(
            currentDir,
            "src/preload/browser-page.ts",
          ),
        },
        output: {
          format: "cjs",
          entryFileNames: "[name].cjs",
          chunkFileNames: "[name]-[hash].cjs",
        },
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        ...workspaceAliases,
        "@renderer": path.resolve(currentDir, "src/renderer/src"),
      },
    },
    plugins: [tailwindcss(), react()] as never,
  },
});
