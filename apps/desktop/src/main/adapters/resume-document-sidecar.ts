import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ResumeParserWorkerResponseSchema,
  type ResumeParserWorkerRequest,
  type ResumeParserWorkerResponse,
} from "@unemployed/contracts";

const DEFAULT_PARSER_TIMEOUT_MS = 45_000;
const SIDECAR_BINARY_NAME = process.platform === "win32"
  ? "resume_parser_sidecar.exe"
  : "resume_parser_sidecar";
const SIDECAR_PLATFORM_DIR = `${process.platform}-${process.arch}`;

type SidecarCommandCandidate = {
  command: string;
  args: string[];
  label: string;
  env?: NodeJS.ProcessEnv;
};

type SidecarBundleManifest = {
  signature?: string;
  bundledRequirements?: string[];
  targets?: Record<string, {
    ready?: boolean;
    platform?: string;
    arch?: string;
    binaryPath?: string;
    pythonRoot?: string;
    pythonCommand?: string;
  }>;
};

function uniquePaths(values: readonly string[]): string[] {
  const seen = new Set<string>();

  return values.filter((value) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return false;
    }

    const normalized = process.platform === "win32"
      ? trimmed.toLowerCase()
      : trimmed;

    if (seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
}

function getGeneratedSidecarRootCandidates(): string[] {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const resourcesPath = typeof process.resourcesPath === "string"
    ? process.resourcesPath
    : null;

  return uniquePaths(
    [
      path.join(currentDir, "..", "..", "dist", "resume-parser-sidecar"),
      path.join(process.cwd(), "dist", "resume-parser-sidecar"),
      path.join(process.cwd(), "../dist", "resume-parser-sidecar"),
      resourcesPath ? path.join(resourcesPath, "resume-parser-sidecar") : "",
    ].filter(Boolean),
  );
}

function readBundledSidecarManifest(): { manifestPath: string; manifest: SidecarBundleManifest } | null {
  for (const root of getGeneratedSidecarRootCandidates()) {
    const manifestPath = path.join(root, "manifest.json");

    if (!existsSync(manifestPath)) {
      continue;
    }

    try {
      return {
        manifestPath,
        manifest: JSON.parse(readFileSync(manifestPath, "utf8")) as SidecarBundleManifest,
      };
    } catch {
      continue;
    }
  }

  return null;
}

function logBundledSidecarAvailability() {
  const manifestEntry = readBundledSidecarManifest();

  if (!manifestEntry) {
    console.warn("[ResumeImport] No bundled resume parser sidecar manifest was found. The app may rely on Python fallback paths.");
    return;
  }

  const targetKey = `${process.platform}-${process.arch}`;
  const currentTarget = manifestEntry.manifest.targets?.[targetKey];
  const availableTargets = Object.keys(manifestEntry.manifest.targets ?? {});

  if (currentTarget?.ready) {
    console.log(
      `[ResumeImport] Bundled resume parser sidecar ready for ${targetKey}. Available targets: ${availableTargets.join(", ") || "none"}`,
    );
    return;
  }

  console.warn(
    `[ResumeImport] Bundled resume parser sidecar is missing for ${targetKey}. Available targets: ${availableTargets.join(", ") || "none"}`,
  );
}

const sidecarAvailability = { logged: false };

/** @internal — exported only for test reset */
export function _resetSidecarAvailabilityLogged(): void {
  sidecarAvailability.logged = false;
}

function getBundledSidecarBinaryPath(): string | null {
  const override = process.env.UNEMPLOYED_RESUME_PARSER_SIDECAR_BINARY_PATH?.trim();
  const candidates = uniquePaths([
    override ?? "",
    ...getGeneratedSidecarRootCandidates().map((root) =>
      path.join(root, "bin", SIDECAR_PLATFORM_DIR, SIDECAR_BINARY_NAME)
    ),
  ]);

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function getPythonPathEntriesForScript(scriptPath: string): string[] {
  const override = process.env.UNEMPLOYED_RESUME_PARSER_PYTHONPATH?.trim();
  const scriptDir = path.dirname(scriptPath);

  return uniquePaths([
    override ?? "",
    path.join(scriptDir, "site-packages"),
    path.join(scriptDir, ".python-packages"),
  ].filter((candidate) => Boolean(candidate) && existsSync(candidate)));
}

function buildCandidateEnv(extraPythonPaths: readonly string[] = []): NodeJS.ProcessEnv | undefined {
  if (extraPythonPaths.length === 0) {
    return undefined;
  }

  const combinedPythonPath = uniquePaths([
    ...extraPythonPaths,
    process.env.PYTHONPATH ?? "",
  ].filter(Boolean)).join(path.delimiter);

  return {
    ...process.env,
    PYTHONPATH: combinedPythonPath,
  };
}

function buildPythonCommandCandidate(
  command: string,
  scriptPath: string,
): SidecarCommandCandidate {
  const trimmed = command.trim();
  const env = buildCandidateEnv(getPythonPathEntriesForScript(scriptPath));

  if (trimmed.toLowerCase() === "py") {
    const candidate: SidecarCommandCandidate = {
      command: trimmed,
      args: ["-3", scriptPath],
      label: `${trimmed} -3`,
      ...(env ? { env } : {}),
    };

    return candidate;
  }

  const candidate: SidecarCommandCandidate = {
    command: trimmed,
    args: [scriptPath],
    label: trimmed,
    ...(env ? { env } : {}),
  };

  return candidate;
}

function getResumeParserSidecarScriptPath(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const builtCandidate = path.join(currentDir, "scripts", "resume_parser_sidecar.py");
  const generatedCandidates = getGeneratedSidecarRootCandidates().map((root) =>
    path.join(root, "python", "resume_parser_sidecar.py")
  );
  const repoCandidateA = path.join(
    process.cwd(),
    "src/main/adapters/scripts/resume_parser_sidecar.py",
  );
  const repoCandidateB = path.join(
    process.cwd(),
    "../src/main/adapters/scripts/resume_parser_sidecar.py",
  );
  const overrideCandidate = process.env.UNEMPLOYED_RESUME_PARSER_SIDECAR_PATH?.trim();

  const candidates = [
    overrideCandidate,
    ...generatedCandidates,
    builtCandidate,
    repoCandidateA,
    repoCandidateB,
  ]
    .filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Python resume parser sidecar script not found. Tried: ${candidates.join(", ")}`,
  );
}

function resolveBundledScriptPathFromManifest(): string | null {
  const manifestEntry = readBundledSidecarManifest();
  const currentTarget = manifestEntry?.manifest.targets?.[SIDECAR_PLATFORM_DIR];
  const pythonRoot = typeof currentTarget?.pythonRoot === "string"
    ? currentTarget.pythonRoot
    : null;

  if (!pythonRoot) {
    return null;
  }

  const candidate = path.join(pythonRoot, "resume_parser_sidecar.py");
  return existsSync(candidate) ? candidate : null;
}

function getSidecarCommandCandidates(scriptPath: string): SidecarCommandCandidate[] {
  const override = process.env.UNEMPLOYED_RESUME_PARSER_PYTHON?.trim();
  const bundledBinaryPath = getBundledSidecarBinaryPath();
  const candidates: SidecarCommandCandidate[] = [];

  if (bundledBinaryPath) {
    candidates.push({
      command: bundledBinaryPath,
      args: [],
      label: path.basename(bundledBinaryPath),
    });
  }

  if (override) {
    candidates.push(buildPythonCommandCandidate(override, scriptPath));
    return candidates;
  }

  const commands = process.platform === "win32"
    ? ["py", "python", "python3"]
    : ["python3", "python", "py"];

  candidates.push(...commands.map((command) => buildPythonCommandCandidate(command, scriptPath)));
  return candidates;
}

function createSidecarFailureResponse(input: {
  request: ResumeParserWorkerRequest;
  message: string;
  warnings?: readonly string[];
}): ResumeParserWorkerResponse {
  return ResumeParserWorkerResponseSchema.parse({
    requestId: input.request.requestId,
    ok: false,
    primaryParserKind: null,
    parserKinds: [],
    route: null,
    parserManifest: {
      workerKind: "python_sidecar",
      workerVersion: null,
      manifestVersion: "019-python-sidecar-v1",
      runtimeLabel: null,
      availableCapabilities: [],
      executorVersions: {},
    },
    quality: {
      score: 0,
      textDensity: null,
      tokenCount: 0,
      lineCount: 0,
      blockCount: 0,
      columnLikelihood: null,
      readingOrderConfidence: null,
      nativeTextCoverage: null,
      ocrConfidence: null,
      imageCoverageRatio: null,
      invalidUnicodeRatio: null,
    },
    qualityWarnings: [],
    warnings: [...(input.warnings ?? [])],
    pages: [],
    blocks: [],
    fullText: null,
    errorMessage: input.message,
  });
}

function isMissingCommandError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? error.code : null;
  return code === "ENOENT";
}

async function invokeSidecarCandidate(input: {
  candidate: SidecarCommandCandidate;
  request: ResumeParserWorkerRequest;
  timeoutMs: number;
}): Promise<ResumeParserWorkerResponse> {
  return await new Promise<ResumeParserWorkerResponse>((resolve, reject) => {
    const child = spawn(input.candidate.command, input.candidate.args, {
      env: input.candidate.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      callback();
    };

    const timer = setTimeout(() => {
      child.kill();
      finish(() => {
        reject(
          new Error(
            `Python resume parser sidecar timed out after ${input.timeoutMs}ms (${input.candidate.label}).`,
          ),
        );
      });
    }, input.timeoutMs);

    child.once("error", (error) => {
      finish(() => reject(error));
    });

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.once("close", (code) => {
      finish(() => {
        try {
          if (!stdout.trim()) {
            throw new Error(
              code === 0
                ? `Python resume parser sidecar returned no output (${input.candidate.label}).`
                : `Python resume parser sidecar exited with code ${code ?? "unknown"} (${input.candidate.label}). ${stderr.trim() || "No stderr output."}`,
            );
          }

          const parsed = JSON.parse(stdout) as unknown;
          resolve(ResumeParserWorkerResponseSchema.parse(parsed));
        } catch (error) {
          const details = stderr.trim();
          const message =
            error instanceof Error
              ? error.message
              : "Python resume parser sidecar returned invalid output.";

          reject(
            new Error(
              details
                ? `${message} ${details}`
                : message,
            ),
          );
        }
      });
    });

    child.stdin.write(JSON.stringify(input.request));
    child.stdin.end();
  });
}

export async function runResumeParserSidecar(
  request: ResumeParserWorkerRequest,
  timeoutMs = DEFAULT_PARSER_TIMEOUT_MS,
): Promise<ResumeParserWorkerResponse> {
  if (!sidecarAvailability.logged) {
    sidecarAvailability.logged = true;
    logBundledSidecarAvailability();
  }

  const bundledBinaryPath = getBundledSidecarBinaryPath();
  let scriptPath: string | null = null;

  try {
    scriptPath = getResumeParserSidecarScriptPath();
  } catch (error) {
    if (!bundledBinaryPath) {
      return createSidecarFailureResponse({
        request,
        message:
          error instanceof Error
            ? error.message
            : "Python resume parser sidecar script is unavailable.",
        warnings: [
          "Python resume parser sidecar script could not be located, so desktop import will fall back to the embedded parser.",
        ],
      });
    }

    scriptPath = resolveBundledScriptPathFromManifest();
  }

  if (!scriptPath && !bundledBinaryPath) {
    return createSidecarFailureResponse({
      request,
      message: "Python resume parser sidecar script is unavailable.",
      warnings: [
        "Python resume parser sidecar script could not be located, so desktop import will fall back to the embedded parser.",
      ],
    });
  }

  const candidates = scriptPath
    ? getSidecarCommandCandidates(scriptPath)
    : bundledBinaryPath
      ? [{ command: bundledBinaryPath, args: [], label: path.basename(bundledBinaryPath) }]
      : [];
  let lastError: unknown = null;

  for (const candidate of candidates) {
    try {
      return await invokeSidecarCandidate({
        candidate,
        request,
        timeoutMs,
      });
    } catch (error) {
      lastError = error;

      if (isMissingCommandError(error)) {
        continue;
      }

      break;
    }
  }

  const fallbackMessage = lastError instanceof Error
    ? lastError.message
    : "Python resume parser sidecar could not be started.";

  return createSidecarFailureResponse({
    request,
    message: fallbackMessage,
    warnings: [
      "Python resume parser sidecar could not complete, so desktop import will fall back to the embedded parser.",
    ],
  });
}
