import type { ApplicationRecord } from "@unemployed/contracts";
import {
  formatStatusLabel,
  getApplicationTone,
} from "../../lib/job-finder-utils";
import type { BadgeTone } from "../../lib/job-finder-types";
import { FINISH_IN_JOB_FINDER_BROWSER_LIST_NEXT_STEP } from "../../lib/job-finder-browser-handoff-copy";
import {
  SITE_BLOCKED_AUTOMATIC_PREP_LIST_NEXT_STEP,
  applicationRecordLooksSiteBlocked,
} from "./applications-detail-panel-helpers";

const SERVICE_WORKER_LIKE_NEXT_STEP = /service worker/i;

/**
 * The runtime records an autosave/attachment pause as "Complete the affected
 * step manually in the open application, or cancel". The detail panel already
 * says the truthful thing for that pause, so list rows must say it too instead
 * of exposing the raw runtime phrasing.
 */
const MANUAL_OPEN_APPLICATION_FINISH_NEXT_STEP =
  /complete the (?:affected|resume) step manually in the open application/i;

function shouldPresentConsentState(record: ApplicationRecord): boolean {
  return (
    record.status === "drafting" ||
    record.status === "ready_for_review" ||
    record.status === "approved"
  );
}

export function getApplicationLatestActivityLabel(
  record: ApplicationRecord,
): string {
  if (record.lastAttemptState === "unsupported") {
    return "Manual apply only";
  }

  if (record.lastAttemptState === "failed") {
    return "Attempt failed";
  }

  if (record.lastAttemptState === "submitted") {
    return record.lastActionLabel || "Submitted";
  }

  if (
    shouldPresentConsentState(record) &&
    record.lastAttemptState === "paused" &&
    applicationRecordLooksSiteBlocked(record)
  ) {
    return "Automatic prep paused";
  }

  if (
    shouldPresentConsentState(record) &&
    record.lastAttemptState === "paused"
  ) {
    return record.nextActionLabel ?? "Needs follow-up";
  }

  if (
    shouldPresentConsentState(record) &&
    record.consentSummary.status === "requested"
  ) {
    return record.consentSummary.pendingCount > 1
      ? `${record.consentSummary.pendingCount} consent decisions waiting`
      : "Consent decision waiting";
  }

  if (
    shouldPresentConsentState(record) &&
    record.consentSummary.status === "approved"
  ) {
    return "Consent approved";
  }

  if (
    shouldPresentConsentState(record) &&
    record.consentSummary.status === "declined"
  ) {
    return "Consent declined";
  }

  if (!shouldPresentConsentState(record)) {
    return record.lastActionLabel;
  }

  return record.lastActionLabel;
}

/**
 * The plain answer to the question the record never answered: *did I apply,
 * and is anything of mine on that site?*
 *
 * The round-eight review found one application described by seven different
 * state words — NEEDS YOU five times, plus "Needs follow-up", plus a Tracker
 * stage of "Preparing" — and none of them said "Not submitted". This is the
 * one sentence that does, and it leads the detail pane uncollapsed.
 *
 * It is deliberately conservative: only a recorded submission says submitted.
 * Preparing, pausing and blocking all say not submitted, because that is what
 * is true — Job Finder never submits.
 */
export function getApplicationSubmissionAnswer(
  record: ApplicationRecord,
  employerName?: string | null,
): { headline: string; detail: string; submitted: boolean } {
  const employer = employerName?.trim() || record.company?.trim() || null;
  const submitted =
    record.lastAttemptState === "submitted" ||
    ["submitted", "assessment", "interview", "offer"].includes(record.status);

  if (submitted) {
    return {
      headline: "You recorded this as submitted.",
      detail: employer
        ? `Job Finder never sends an application — this is the outcome you recorded after sending it to ${employer} yourself.`
        : "Job Finder never sends an application — this is the outcome you recorded after sending it yourself.",
      submitted: true,
    };
  }

  return {
    headline: "Not submitted.",
    detail: employer
      ? `This application has not been sent to ${employer}. Check the preparation details below, then review the fields and resume in the Job Finder browser before sending it.`
      : "This application has not been sent. Check the preparation details below, then review the fields and resume in the Job Finder browser before sending it.",
    submitted: false,
  };
}

export function getApplicationStagePresentation(record: ApplicationRecord): {
  label: string;
  tone: BadgeTone;
} {
  if (
    shouldPresentConsentState(record) &&
    record.lastAttemptState === "unsupported"
  ) {
    // Attention, not failure: the site cannot be prepared automatically, so
    // the user finishes it themselves. `warning` (F44) says that without the
    // failure hue that `critical` claimed before the tone existed.
    return { label: "Manual apply only", tone: "warning" };
  }

  if (
    shouldPresentConsentState(record) &&
    record.lastAttemptState === "failed"
  ) {
    return { label: "Needs recovery", tone: "critical" };
  }

  // A paused run that recorded its own gate (sign in, finish a step in the
  // browser) files it as a "requested" consent, but the user is not being
  // asked to consent to anything: the site is waiting on them. When the run
  // saved what to do next, that is the stage.
  if (
    shouldPresentConsentState(record) &&
    record.consentSummary.status === "requested" &&
    record.lastAttemptState === "paused" &&
    record.nextActionLabel
  ) {
    return { label: "Needs you", tone: "active" };
  }

  if (
    shouldPresentConsentState(record) &&
    record.consentSummary.status === "requested"
  ) {
    return { label: "Waiting on consent", tone: "active" };
  }

  if (
    shouldPresentConsentState(record) &&
    record.lastAttemptState === "paused" &&
    record.consentSummary.status !== "declined"
  ) {
    // Site-blocked finish-yourself pauses need stronger list contrast than the
    // default active steel chip. `warning` (F44) supplies it without the
    // failure hue: nothing failed, the user has to finish on the site.
    return {
      label: "Needs you",
      tone: applicationRecordLooksSiteBlocked(record) ? "warning" : "active",
    };
  }

  if (
    shouldPresentConsentState(record) &&
    record.consentSummary.status === "approved"
  ) {
    if (record.lastAttemptState === "submitted") {
      return { label: "Submitted", tone: getApplicationTone("submitted") };
    }

    return { label: "Ready after consent", tone: "active" };
  }

  if (
    shouldPresentConsentState(record) &&
    record.consentSummary.status === "declined"
  ) {
    return { label: "Consent declined", tone: "critical" };
  }

  return {
    label: formatStatusLabel(record.status),
    tone: getApplicationTone(record.status),
  };
}

export function getApplicationNextStepLabel(record: ApplicationRecord): string {
  if (record.lastAttemptState === "submitted") {
    return record.nextActionLabel ?? "No next step saved";
  }

  if (
    shouldPresentConsentState(record) &&
    record.lastAttemptState === "unsupported"
  ) {
    return record.nextActionLabel ?? "Manual apply only";
  }

  if (
    shouldPresentConsentState(record) &&
    record.lastAttemptState === "failed"
  ) {
    return record.nextActionLabel ?? "Needs recovery";
  }

  if (
    shouldPresentConsentState(record) &&
    record.lastAttemptState === "paused" &&
    applicationRecordLooksSiteBlocked(record)
  ) {
    return SITE_BLOCKED_AUTOMATIC_PREP_LIST_NEXT_STEP;
  }

  if (
    shouldPresentConsentState(record) &&
    record.consentSummary.status === "requested" &&
    record.lastAttemptState === "paused" &&
    record.nextActionLabel
  ) {
    return record.nextActionLabel;
  }

  if (
    shouldPresentConsentState(record) &&
    record.consentSummary.status === "requested"
  ) {
    return "Choose continue or skip in Consent requests below.";
  }

  if (
    shouldPresentConsentState(record) &&
    record.consentSummary.status === "approved"
  ) {
    return (
      record.nextActionLabel ??
      "Review the prepared application before any later execution step."
    );
  }

  if (
    shouldPresentConsentState(record) &&
    record.consentSummary.status === "declined"
  ) {
    return (
      record.nextActionLabel ??
      "Restart the run if you want to try again later."
    );
  }

  return record.nextActionLabel ?? "No next step saved";
}

export function getApplicationReadableNextStepLabel(
  label: string | null | undefined,
): string | null {
  const trimmed = label?.trim();

  if (!trimmed) {
    return null;
  }

  if (
    /inspect the application page manually|job site blocked|reset (?:the (?:job finder )?)?browser in safeguards/i.test(
      trimmed,
    ) ||
    SERVICE_WORKER_LIKE_NEXT_STEP.test(trimmed)
  ) {
    return SITE_BLOCKED_AUTOMATIC_PREP_LIST_NEXT_STEP;
  }

  if (/sign in manually,? then retry preparation/i.test(trimmed)) {
    return "Sign in on the site in the Job Finder browser, then run preparation again";
  }

  if (MANUAL_OPEN_APPLICATION_FINISH_NEXT_STEP.test(trimmed)) {
    // List rows get the compact one-line form; the detail pane carries the
    // full instruction naming the window and the confirm action.
    return FINISH_IN_JOB_FINDER_BROWSER_LIST_NEXT_STEP;
  }

  if (
    /review the prepared application and submit manually when ready/i.test(
      trimmed,
    )
  ) {
    return "Submit the prepared application manually";
  }

  if (
    /review the prepared application before any later execution step/i.test(
      trimmed,
    )
  ) {
    return "Submit the prepared application manually";
  }

  if (/review the pending submit approval in applications/i.test(trimmed)) {
    return "Review the pending safe preparation approval";
  }

  if (/review the queued run approval in applications/i.test(trimmed)) {
    return "Review the prepared run approval";
  }

  return trimmed;
}
