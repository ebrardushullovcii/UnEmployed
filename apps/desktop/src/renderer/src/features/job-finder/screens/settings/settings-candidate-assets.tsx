import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CandidateAsset,
  CandidateAssetConsentScope,
  CandidateAssetKind,
  CandidateAssetRetention,
} from "@unemployed/contracts";
import { Button } from "@renderer/components/ui/button";
import {
  CollectionNoMatches,
  CollectionSearchToolbar,
  matchesCollectionSearch,
} from "../../components/collection-search-toolbar";
import { FormSelect } from "../../components/form-select";
import { usePersistedCollectionView } from "../../hooks/use-persisted-collection-view";

const kindOptions = [
  { value: "resume", label: "Resume" },
  { value: "cover_letter", label: "Cover letter" },
  { value: "application_response", label: "Application response" },
  { value: "portfolio", label: "Portfolio" },
  { value: "work_sample", label: "Work sample" },
  { value: "transcript", label: "Transcript" },
  { value: "certificate", label: "Certificate" },
  { value: "image", label: "Image" },
  { value: "other", label: "Other document" },
] as const;

const consentOptions = [
  { value: "private_storage_only", label: "Store privately only" },
  {
    value: "job_application_attachment",
    label: "Allow as an application attachment",
  },
  { value: "assistant_context", label: "Allow as assistant context" },
] as const;

const retentionOptions = [
  { value: "until_deleted", label: "Until I remove it" },
  { value: "30_days", label: "30 days" },
  { value: "90_days", label: "90 days" },
] as const;

function formatByteSize(byteSize: number) {
  if (byteSize < 1024) return `${byteSize} B`;
  if (byteSize < 1024 * 1024) return `${Math.round(byteSize / 1024)} KB`;
  return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(timestamp: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(new Date(timestamp));
}

function formatRetention(retention: CandidateAssetRetention) {
  if (retention === "until_deleted") return "kept until removed";
  return retention === "30_days" ? "30-day retention" : "90-day retention";
}

export function SettingsCandidateAssets() {
  const mountedRef = useRef(true);
  const [assets, setAssets] = useState<readonly CandidateAsset[]>([]);
  const [kind, setKind] = useState<CandidateAssetKind>("work_sample");
  const [consentScope, setConsentScope] = useState<CandidateAssetConsentScope>(
    "private_storage_only",
  );
  const [retention, setRetention] =
    useState<CandidateAssetRetention>("until_deleted");
  const [restoreRetention, setRestoreRetention] = useState<
    Readonly<Record<string, CandidateAssetRetention>>
  >({});
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [status, setStatus] = useState("Loading your private asset library…");
  const view = usePersistedCollectionView("candidate-assets", "comfortable");
  const deferredQuery = useDeferredValue(view.query);

  const refreshAssets = useCallback(async (successMessage?: string) => {
    if (mountedRef.current) {
      setLoadState("loading");
      if (!successMessage) {
        setStatus("Loading your private asset library…");
      }
    }
    try {
      const result = await window.unemployed.jobFinder.listCandidateAssets({
        includeDeleted: true,
      });
      if (!mountedRef.current) return false;
      setAssets(result.assets);
      const activeCount = result.assets.filter(
        (asset) => asset.deletedAt === null,
      ).length;
      const trashCount = result.assets.length - activeCount;
      setLoadState("ready");
      setStatus(
        successMessage ??
          (result.assets.length === 0
            ? "No extra documents or assets have been imported."
            : `${activeCount} active; ${trashCount} in Trash.`),
      );
      return true;
    } catch {
      if (!mountedRef.current) return false;
      setLoadState("error");
      setStatus("Could not load the asset library.");
      return false;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refreshAssets();
    return () => {
      mountedRef.current = false;
    };
  }, [refreshAssets]);

  async function importAsset() {
    if (pendingAction) return;
    setPendingAction("import");
    setStatus("Waiting for a file selection…");
    try {
      const result = await window.unemployed.jobFinder.importCandidateAsset({
        kind,
        sensitivity: "sensitive",
        consentScope,
        retention,
      });
      if (result.status === "cancelled") {
        setStatus("Import cancelled. No file was copied.");
      } else {
        await refreshAssets(
          `${result.asset.originalName} is stored privately on this device.`,
        );
      }
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "The selected asset could not be imported.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function deleteAsset(assetId: string) {
    if (pendingAction) return;
    setPendingAction(assetId);
    try {
      await window.unemployed.jobFinder.deleteCandidateAsset({
        assetId,
      });
      await refreshAssets("Asset moved to Trash for 7 days.");
    } catch {
      setStatus("The asset could not be removed. Try again.");
    } finally {
      setPendingAction(null);
    }
  }

  async function restoreAsset(assetId: string) {
    if (pendingAction) return;
    const selectedRetention = restoreRetention[assetId] ?? "until_deleted";
    setPendingAction(`restore:${assetId}`);
    try {
      const result = await window.unemployed.jobFinder.restoreCandidateAsset({
        assetId,
        retention: selectedRetention,
      });
      await refreshAssets(
        `${result.asset.originalName} was restored with a fresh retention clock.`,
      );
    } catch {
      setStatus("The asset could not be restored. It may have been purged.");
    } finally {
      setPendingAction(null);
    }
  }

  const visibleAssets = useMemo(
    () =>
      assets.filter((asset) =>
        matchesCollectionSearch(deferredQuery, [
          asset.originalName,
          asset.kind,
          asset.consentScope,
          asset.retention,
          asset.deletedAt ? "trash removed expired" : "active",
        ]),
      ),
    [assets, deferredQuery],
  );
  const activeAssets = visibleAssets.filter(
    (asset) => asset.deletedAt === null,
  );
  const trashedAssets = visibleAssets.filter(
    (asset) => asset.deletedAt !== null,
  );
  const controlsDisabled = pendingAction !== null || loadState === "loading";

  return (
    <section className="surface-panel-shell grid gap-4 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
      <div className="grid gap-1.5">
        <p className="text-[10px] uppercase tracking-(--tracking-badge) text-muted-foreground">
          Documents &amp; assets
        </p>
        <h2 className="font-display text-lg font-semibold text-(--text-headline)">
          Keep reusable application material on this device
        </h2>
        <p className="text-sm leading-6 text-foreground-soft">
          Imported files are copied into private app-owned storage. Models and
          this screen receive metadata only—not raw paths or file bytes. Choose
          a broader consent scope only when you intend to use the asset later.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="grid gap-1.5 text-sm text-foreground-soft">
          <label htmlFor="candidate-asset-kind">Asset type</label>
          <FormSelect
            disabled={controlsDisabled}
            onValueChange={(value) => setKind(value as CandidateAssetKind)}
            options={kindOptions}
            triggerId="candidate-asset-kind"
            value={kind}
          />
        </div>
        <div className="grid gap-1.5 text-sm text-foreground-soft">
          <label htmlFor="candidate-asset-consent">Consent scope</label>
          <FormSelect
            disabled={controlsDisabled}
            onValueChange={(value) =>
              setConsentScope(value as CandidateAssetConsentScope)
            }
            options={consentOptions}
            triggerId="candidate-asset-consent"
            value={consentScope}
          />
        </div>
        <div className="grid gap-1.5 text-sm text-foreground-soft">
          <label htmlFor="candidate-asset-retention">Retention</label>
          <FormSelect
            disabled={controlsDisabled}
            onValueChange={(value) =>
              setRetention(value as CandidateAssetRetention)
            }
            options={retentionOptions}
            triggerId="candidate-asset-retention"
            value={retention}
          />
          <p className="text-(length:--text-description)">
            Timed retention starts after the import succeeds.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={controlsDisabled}
          onClick={() => void importAsset()}
          pending={pendingAction === "import"}
          type="button"
          variant="secondary"
        >
          Choose file to import
        </Button>
        <p
          aria-live="polite"
          className="text-(length:--text-description) text-foreground-soft"
          role="status"
        >
          {status}
        </p>
        {loadState === "error" ? (
          <Button
            disabled={pendingAction !== null}
            onClick={() => void refreshAssets()}
            size="compact"
            type="button"
            variant="ghost"
          >
            Retry
          </Button>
        ) : null}
      </div>

      {assets.length > 0 ? (
        <CollectionSearchToolbar
          className="px-0"
          label="Find a document"
          onQueryChange={view.setQuery}
          placeholder="Search name, type, consent, retention, or Trash"
          query={view.query}
          totalCount={assets.length}
          visibleCount={visibleAssets.length}
        />
      ) : null}

      {assets.length > 0 && visibleAssets.length === 0 ? (
        <CollectionNoMatches
          noun="documents"
          onClear={() => view.setQuery("")}
          query={view.query}
        />
      ) : null}

      {activeAssets.length > 0 ? (
        <ul className="grid gap-2" aria-label="Imported candidate assets">
          {activeAssets.map((asset) => (
            <li
              className="flex flex-wrap items-center justify-between gap-3 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/45 px-3 py-3"
              key={asset.id}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-(--text-headline)">
                  {asset.originalName}
                </p>
                <p className="text-(length:--text-description) text-foreground-soft">
                  {asset.kind.replaceAll("_", " ")} ·{" "}
                  {formatByteSize(asset.byteSize)} ·{" "}
                  {asset.consentScope.replaceAll("_", " ")} ·{" "}
                  {formatRetention(asset.retention)}
                </p>
                {asset.lifecycle?.expiresAt ? (
                  <p className="text-(length:--text-description) text-foreground-soft">
                    Moves to Trash on {formatDate(asset.lifecycle.expiresAt)}.
                  </p>
                ) : null}
              </div>
              <Button
                aria-label={`Remove ${asset.originalName}`}
                disabled={controlsDisabled}
                onClick={() => void deleteAsset(asset.id)}
                pending={pendingAction === asset.id}
                size="compact"
                type="button"
                variant="ghost"
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {trashedAssets.length > 0 ? (
        <div className="grid gap-2 border-t border-(--surface-panel-border) pt-4">
          <div className="grid gap-1">
            <h3 className="text-sm font-semibold text-(--text-headline)">
              Trash
            </h3>
            <p className="text-(length:--text-description) text-foreground-soft">
              Removed and expired assets are unavailable everywhere. Restore
              within 7 days or the app deletes the stored file and record.
            </p>
          </div>
          <ul className="grid gap-2" aria-label="Candidate asset Trash">
            {trashedAssets.map((asset) => {
              const selectedRetention =
                restoreRetention[asset.id] ?? "until_deleted";
              return (
                <li
                  className="grid gap-3 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/45 px-3 py-3 md:grid-cols-[minmax(0,1fr)_minmax(12rem,auto)_auto] md:items-end"
                  key={asset.id}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-(--text-headline)">
                      {asset.originalName}
                    </p>
                    <p className="text-(length:--text-description) text-foreground-soft">
                      {asset.lifecycle?.deletionReason === "expired"
                        ? "Expired"
                        : "Removed"}
                      {asset.lifecycle?.purgeAt
                        ? ` · delete after ${formatDate(asset.lifecycle.purgeAt)}`
                        : ""}
                    </p>
                  </div>
                  <div className="grid gap-1.5 text-sm text-foreground-soft">
                    <label htmlFor={`candidate-asset-restore-${asset.id}`}>
                      Restore retention
                    </label>
                    <FormSelect
                      disabled={controlsDisabled}
                      onValueChange={(value) =>
                        setRestoreRetention((current) => ({
                          ...current,
                          [asset.id]: value as CandidateAssetRetention,
                        }))
                      }
                      options={retentionOptions}
                      triggerId={`candidate-asset-restore-${asset.id}`}
                      value={selectedRetention}
                    />
                  </div>
                  <Button
                    aria-label={`Restore ${asset.originalName}`}
                    disabled={controlsDisabled}
                    onClick={() => void restoreAsset(asset.id)}
                    pending={pendingAction === `restore:${asset.id}`}
                    size="compact"
                    type="button"
                    variant="secondary"
                  >
                    Restore
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
