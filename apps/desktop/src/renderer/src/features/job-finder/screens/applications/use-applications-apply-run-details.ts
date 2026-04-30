import { useEffect, useRef, useState } from "react";
import type { ApplyRunDetails } from "@unemployed/contracts";
import { pickLatestIsoTimestamp } from "./applications-screen-helpers";

interface UseApplicationsApplyRunDetailsInput {
  jobId: string | null;
  onGetApplyRunDetails: (
    runId: string,
    jobId: string,
  ) => Promise<ApplyRunDetails>;
  runId: string | null;
  runUpdatedAt: string | null;
}

export function useApplicationsApplyRunDetails(
  input: UseApplicationsApplyRunDetailsInput,
) {
  const { jobId, onGetApplyRunDetails, runId, runUpdatedAt } = input;
  const [applyRunDetails, setApplyRunDetails] =
    useState<ApplyRunDetails | null>(null);
  const [applyRunDetailsTarget, setApplyRunDetailsTarget] = useState<{
    jobId: string;
    runId: string;
  } | null>(null);
  const [applyRunDetailsStatus, setApplyRunDetailsStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [applyRunDetailsError, setApplyRunDetailsError] = useState<
    string | null
  >(null);
  const lastFetchedApplyRunRef = useRef<{
    jobId: string;
    runId: string;
    updatedAt: string | null;
  } | null>(null);
  const statusRef = useRef(applyRunDetailsStatus);
  const targetRef = useRef(applyRunDetailsTarget);

  useEffect(() => {
    statusRef.current = applyRunDetailsStatus;
    targetRef.current = applyRunDetailsTarget;
  }, [applyRunDetailsStatus, applyRunDetailsTarget]);

  useEffect(() => {
    let cancelled = false;

    if (!jobId || !runId) {
      lastFetchedApplyRunRef.current = null;
      setApplyRunDetails(null);
      setApplyRunDetailsTarget(null);
      setApplyRunDetailsStatus("idle");
      setApplyRunDetailsError(null);
      return () => {
        cancelled = true;
      };
    }

    const currentTarget = targetRef.current;
    const currentStatus = statusRef.current;
    const lastFetchedUpdatedAt = lastFetchedApplyRunRef.current?.updatedAt;
    const selectedRunUpdatedAtMs =
      runUpdatedAt == null ? Number.NaN : Date.parse(runUpdatedAt);
    const lastFetchedUpdatedAtMs =
      lastFetchedUpdatedAt == null ? Number.NaN : Date.parse(lastFetchedUpdatedAt);
    const hasValidParsedUpdatedAt =
      !Number.isNaN(selectedRunUpdatedAtMs) &&
      !Number.isNaN(lastFetchedUpdatedAtMs);

    if (
      lastFetchedApplyRunRef.current?.jobId === jobId &&
      lastFetchedApplyRunRef.current?.runId === runId &&
      currentTarget?.jobId === jobId &&
      currentTarget?.runId === runId &&
      (runUpdatedAt == null ||
        (lastFetchedUpdatedAt != null &&
          hasValidParsedUpdatedAt &&
          selectedRunUpdatedAtMs <= lastFetchedUpdatedAtMs))
    ) {
      return () => {
        cancelled = true;
      };
    }

    if (
      currentStatus === "loading" &&
      currentTarget?.jobId === jobId &&
      currentTarget?.runId === runId
    ) {
      return () => {
        cancelled = true;
      };
    }

    setApplyRunDetails(null);
    setApplyRunDetailsTarget({ jobId, runId });
    setApplyRunDetailsStatus("loading");
    setApplyRunDetailsError(null);

    void onGetApplyRunDetails(runId, jobId)
      .then((details) => {
        if (cancelled) {
          return;
        }

        lastFetchedApplyRunRef.current = {
          jobId,
          runId,
          updatedAt: pickLatestIsoTimestamp(
            details.run.updatedAt,
            details.result?.updatedAt,
            runUpdatedAt,
          ),
        };
        setApplyRunDetails(details);
        setApplyRunDetailsStatus("ready");
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        lastFetchedApplyRunRef.current = null;
        setApplyRunDetails(null);
        setApplyRunDetailsTarget(null);
        setApplyRunDetailsStatus("error");
        setApplyRunDetailsError(
          error instanceof Error
            ? error.message
            : "Apply run details could not be loaded.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [jobId, onGetApplyRunDetails, runId, runUpdatedAt]);

  return {
    applyRunDetails,
    applyRunDetailsError,
    applyRunDetailsStatus,
    applyRunDetailsTarget,
  };
}
