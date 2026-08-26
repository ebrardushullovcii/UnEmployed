import type { ApplicationPrivacyReceipt } from "@unemployed/contracts";
import {
  CheckCircle2,
  Download,
  Fingerprint,
  LockKeyhole,
  Monitor,
  Send,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { formatStatusLabel } from "@renderer/features/job-finder/lib/job-finder-utils";
import { Button } from "@renderer/components/ui";

const LEGACY_LINEAGE_EXPORT_UNAVAILABLE_REASON =
  "This legacy receipt predates exact application-record linking, so Job Finder cannot export its packet.";

function ReceiptGroup(props: {
  icon: typeof Monitor;
  label: string;
  children: ReactNode;
}) {
  const Icon = props.icon;

  return (
    <div className="grid gap-1 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/40 px-3 py-3">
      <div className="flex items-center gap-2">
        <Icon aria-hidden="true" className="size-4 text-primary" />
        <strong>{props.label}</strong>
      </div>
      <div className="text-(length:--text-small) leading-6 text-foreground-soft">
        {props.children}
      </div>
    </div>
  );
}

export function ApplicationsDetailPanelPrivacyReceiptSection(props: {
  onExport: () => Promise<void>;
  receipt: ApplicationPrivacyReceipt | null;
}) {
  const { onExport, receipt } = props;
  const [isExporting, setIsExporting] = useState(false);
  if (!receipt) {
    return null;
  }

  // Modern receipts carry exact application-record lineage; anything else
  // predates exact linking and keeps the honest legacy explanation. Lineage
  // is read only from the persisted receipt — never inferred.
  const hasExactLineage = Boolean(receipt.lineage.applicationRecordId);
  const heading = hasExactLineage
    ? "Preparation receipt"
    : "Historical application data receipt";

  return (
    <section className="surface-card-tint grid gap-3 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h3 className="label-mono-xs text-primary">{heading}</h3>
          <p className="text-(length:--text-small) leading-6 text-foreground-soft">
            {receipt.destination.origin}
            {receipt.destination.safePath} · {receipt.resume.fileName}
          </p>{" "}
          <p className="text-(length:--text-small) leading-6 text-muted-foreground">
            Exported JSON contains personal application answers. Store it
            securely.
          </p>
          <p className="text-(length:--text-small) leading-6 text-foreground-soft">
            {hasExactLineage
              ? "This receipt records what Job Finder stored during this preparation. Its authority fields describe only what this preparation was authorized to do and do not grant or describe current authority. Job Finder cannot submit applications; only the employer site can confirm its outcome."
              : "This legacy receipt records what an earlier preparation flow stored for this run. Historical authority fields do not grant or describe current authority. Job Finder cannot submit applications; only the employer site can confirm its outcome."}
          </p>
        </div>
        <Button
          disabled={isExporting || !hasExactLineage}
          onClick={() => {
            setIsExporting(true);
            void onExport().finally(() => setIsExporting(false));
          }}
          size="compact"
          title={
            hasExactLineage
              ? undefined
              : LEGACY_LINEAGE_EXPORT_UNAVAILABLE_REASON
          }
          type="button"
          variant="secondary"
        >
          <Download aria-hidden="true" className="size-4" />
          {isExporting ? "Exporting…" : "Export packet"}
        </Button>
      </div>

      {!hasExactLineage ? (
        <p
          className="text-(length:--text-small) leading-6 text-muted-foreground"
          role="note"
        >
          {LEGACY_LINEAGE_EXPORT_UNAVAILABLE_REASON} Everything Job Finder
          recorded about this preparation stays visible on this page.
        </p>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <ReceiptGroup icon={Monitor} label="Stayed local">
          {receipt.stayedLocal.length > 0
            ? receipt.stayedLocal.map(formatStatusLabel).join(", ")
            : "No local-only data was recorded for this preparation."}
        </ReceiptGroup>

        <ReceiptGroup icon={Send} label="Sent to a model">
          {receipt.modelUse.length > 0
            ? receipt.modelUse
                .map(
                  (entry) =>
                    `${formatStatusLabel(entry.purpose)} via ${entry.providerLabel}`,
                )
                .join(", ")
            : "Nothing was sent to a model during application preparation."}
        </ReceiptGroup>

        <ReceiptGroup icon={Fingerprint} label="Resume fingerprint">
          {receipt.resume.sha256 ? (
            <span className="grid gap-1">
              <code
                aria-label={`Resume SHA-256 ${receipt.resume.sha256}`}
                className="break-all font-mono text-foreground"
                title={receipt.resume.sha256}
              >
                SHA-256 {receipt.resume.sha256.slice(0, 12)}…
                {receipt.resume.sha256.slice(-12)}
              </code>
              <span>
                Confirms the exact resume bytes used for this preparation.
              </span>
            </span>
          ) : (
            <>
              SHA-256 was not recorded for this{" "}
              {hasExactLineage ? "preparation" : "legacy receipt"}. Re-import or
              re-export the resume before a future application to enable byte
              verification.
            </>
          )}
        </ReceiptGroup>

        <ReceiptGroup icon={CheckCircle2} label="Written to the site">
          {receipt.externalWrites.length > 0 ? (
            <>
              {receipt.externalWrites
                .map((entry) => entry.fieldLabel)
                .join(", ")}
              <span className="mt-1 block">
                Preparation writes Job Finder observed on this run. They do not
                confirm how the site stored the data or what it did next.
              </span>
            </>
          ) : (
            "No prepared field or resume attachment was recorded as written to the site."
          )}
        </ReceiptGroup>

        <ReceiptGroup
          icon={LockKeyhole}
          label={hasExactLineage ? "Safety record" : "Historical safety record"}
        >
          {hasExactLineage ? (
            <>
              {receipt.accountCreationAuthorized
                ? "This preparation marked account creation as authorized. "
                : "Account creation stayed unauthorized for this preparation. "}
              {receipt.finalSubmitAuthorized
                ? "Final submit was marked authorized at the time. "
                : "Final submit stayed disabled. "}
              {receipt.finalSubmitOccurred
                ? "This receipt records a final-submit action for this run."
                : "No final-submit action was recorded."}{" "}
              These fields are not proof of the site's outcome and do not
              represent a capability in the current product.
            </>
          ) : (
            <>
              {receipt.accountCreationAuthorized
                ? "Legacy data marked account creation as authorized. "
                : "Legacy data marked account creation as not authorized. "}
              {receipt.finalSubmitAuthorized
                ? "Legacy data marked final submit as authorized. "
                : "Legacy data marked final submit as disabled. "}
              {receipt.finalSubmitOccurred
                ? "Legacy data recorded a final-submit action for this run."
                : "Legacy data recorded no final-submit action."}{" "}
              These historical fields are not proof of the site's outcome and do
              not represent a capability in the current product.
            </>
          )}
        </ReceiptGroup>
      </div>

      <p className="text-(length:--text-small) leading-6 text-foreground-soft">
        Current product boundary: Job Finder prepares application data only. You
        review and submit on the employer site yourself. Treat this receipt only
        as historical preparation data.
      </p>
    </section>
  );
}
