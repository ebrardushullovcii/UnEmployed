import type { BrowserSessionRuntime } from "@unemployed/browser-runtime";
import {
  BrowserSourceAccessProbeResultSchema,
  UserActionRequestSchema,
  UserActionVerificationResultSchema,
  type UserActionRequest,
} from "@unemployed/contracts";
import type { JobFinderRepository } from "@unemployed/db";

import { reduceUserActionVerification } from "../user-action-domain";

export function isSourceAccessUserAction(request: UserActionRequest): boolean {
  return request.verification.type === "source_access";
}

export function getUserActionVerificationFlightKey(
  request: UserActionRequest,
): string {
  return `${request.id}:${request.revision}`;
}

function getVerificationEventId(request: UserActionRequest): string {
  return `verification:${request.id}:r${request.revision}`;
}

function normalizeBrowserOrigin(origin: string): string | null {
  try {
    return new URL(origin).origin;
  } catch {
    return null;
  }
}

async function inspectSourceAccess(input: {
  browserRuntime: BrowserSessionRuntime;
  request: UserActionRequest;
}): Promise<"verified" | "still_blocked"> {
  const expectedOrigin =
    input.request.verification.type === "source_access" &&
    input.request.verification.expectedOrigin
      ? normalizeBrowserOrigin(input.request.verification.expectedOrigin)
      : null;

  if (!input.browserRuntime.inspectSourceAccess || !expectedOrigin) {
    return "still_blocked";
  }

  try {
    const result = BrowserSourceAccessProbeResultSchema.safeParse(
      await input.browserRuntime.inspectSourceAccess(
        input.request.scope.source,
        {
          expectedOrigin,
        },
      ),
    );
    const currentOrigin =
      result.success && result.data.currentOrigin
        ? normalizeBrowserOrigin(result.data.currentOrigin)
        : null;
    return result.success &&
      result.data.state === "authenticated" &&
      currentOrigin === expectedOrigin
      ? "verified"
      : "still_blocked";
  } catch {
    return "still_blocked";
  }
}

export async function verifySourceAccessUserAction(input: {
  browserRuntime: BrowserSessionRuntime;
  repository: JobFinderRepository;
  request: UserActionRequest;
}): Promise<UserActionRequest | null> {
  const request = UserActionRequestSchema.parse(input.request);
  if (request.state !== "verifying" || !isSourceAccessUserAction(request)) {
    return null;
  }

  const outcome = await inspectSourceAccess({
    browserRuntime: input.browserRuntime,
    request,
  });
  const currentRequest = await input.repository.getUserActionRequest(
    request.id,
  );

  if (
    !currentRequest ||
    currentRequest.state !== "verifying" ||
    currentRequest.revision !== request.revision
  ) {
    return null;
  }

  const checkedAt = new Date().toISOString();
  const reduction = reduceUserActionVerification(
    currentRequest,
    UserActionVerificationResultSchema.parse({
      requestId: currentRequest.id,
      verificationId: getVerificationEventId(currentRequest),
      expectedRevision: currentRequest.revision,
      outcome,
      checkedAt,
      credentialsPolicy: "browser_only",
      submitAuthorized: false,
      accountCreationAuthorized: false,
    }),
  );

  if (reduction.status === "stale" || !reduction.event) {
    return null;
  }

  const commit = await input.repository.commitUserActionTransition({
    request: reduction.request,
    event: reduction.event,
  });
  return commit.request.state === "resolved"
    ? commit.request
    : null;
}
