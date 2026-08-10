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

  return (
    <section className="surface-card-tint grid gap-3 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h3 className="label-mono-xs text-primary">
            Application data receipt
          </h3>
          <p className="text-(length:--text-small) leading-6 text-foreground-soft">
            {receipt.destination.origin}
            {receipt.destination.safePath} · {receipt.resume.fileName}
          </p>{" "}
          <p className="text-(length:--text-small) leading-6 text-muted-foreground">
            Exported JSON contains personal application answers. Store it
            securely.
          </p>
        </div>
        <Button
          disabled={isExporting}
          onClick={() => {
            setIsExporting(true);
            void onExport().finally(() => setIsExporting(false));
          }}
          size="compact"
          type="button"
          variant="secondary"
        >
          <Download aria-hidden="true" className="size-4" />
          {isExporting ? "Exporting…" : "Export packet"}
        </Button>
      </div>

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
            "SHA-256 was not recorded for this legacy receipt. Re-import or re-export the resume before a future application to enable byte verification."
          )}
        </ReceiptGroup>

        <ReceiptGroup icon={CheckCircle2} label="Written to the site">
          {receipt.externalWrites.length > 0
            ? receipt.externalWrites.map((entry) => entry.fieldLabel).join(", ")
            : "No prepared field was verified as written to the site."}
        </ReceiptGroup>

        <ReceiptGroup icon={LockKeyhole} label="Safety boundary">
          {receipt.accountCreationAuthorized
            ? "Account creation was authorized. "
            : "Account creation was not authorized. "}
          {receipt.finalSubmitAuthorized
            ? "Final submit was authorized. "
            : "Final submit was disabled. "}
          {receipt.finalSubmitOccurred
            ? "The site reports a completed submission."
            : "No application was submitted."}
        </ReceiptGroup>
      </div>
    </section>
  );
}
