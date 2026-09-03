/**
 * Main-process-only application submission composition seam.
 *
 * Keep this capability on an explicit subpath so renderer and preload code do
 * not accidentally receive it through the general Job Finder barrel.
 */
export {
  composeApplicationSubmissionRuntime,
  runApplicationSubmissionRuntime,
  type ApplicationSubmissionBrowserRuntime,
  type ApplicationSubmissionRuntimeInput,
  type ApplicationSubmissionRuntimeResult,
} from "./internal/application-submission-runtime";
