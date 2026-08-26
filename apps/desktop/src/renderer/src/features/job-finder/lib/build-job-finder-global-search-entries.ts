import type { JobFinderWorkspaceSnapshot } from "@unemployed/contracts";
import type { JobFinderGlobalSearchEntry } from "./job-finder-global-search";
import { buildJobFinderContextRoute } from "./job-finder-context-navigation";

export function buildJobFinderGlobalSearchEntries(
  workspace: JobFinderWorkspaceSnapshot,
): readonly JobFinderGlobalSearchEntry[] {
  const campaigns = workspace.campaigns ?? [];
  const discoveryJobs = workspace.discoveryJobs ?? [];
  const applicationRecords = workspace.applicationRecords ?? [];
  const tailoredAssets = workspace.tailoredAssets ?? [];
  const resumeExportArtifacts = workspace.resumeExportArtifacts ?? [];

  const companyEntries: JobFinderGlobalSearchEntry[] =
    workspace.intelligence?.companies?.map((company) => ({
      campaignId: null,
      href: `/job-finder/companies/${company.id}`,
      id: company.id,
      kind: "company" as const,
      metadata: [
        company.canonicalName,
        ...company.aliases.map((alias) => alias.alias),
        ...company.domains.map((domain) => domain.domain),
        company.preference,
      ],
      subtitle: [
        `${company.jobIds.length} job${company.jobIds.length === 1 ? "" : "s"}`,
        `${company.applicationRecordIds.length} application${company.applicationRecordIds.length === 1 ? "" : "s"}`,
        company.preference,
      ].join(" · "),
      title: company.canonicalName,
    })) ?? [];

  const campaignIdsByJobId = new Map<string, Set<string>>();
  for (const campaign of campaigns) {
    for (const jobId of campaign.jobIds ?? []) {
      const campaignIds = campaignIdsByJobId.get(jobId) ?? new Set<string>();
      campaignIds.add(campaign.id);
      campaignIdsByJobId.set(jobId, campaignIds);
    }
  }
  const campaignNameById = new Map(
    campaigns.map((campaign) => [campaign.id, campaign.name]),
  );
  // A null or stale activeCampaignId means no searchable plan scope. Valid
  // planless workspaces must still surface every job, application, and
  // document record instead of returning none — including records that carry
  // another plan's campaign id, which keep their own campaign metadata and
  // label. When an active plan resolves, scope those records to its jobs so
  // unrelated plans drop out; campaign and company entries always remain
  // searchable as shared context.
  const resolvesActivePlan = campaigns.some(
    (campaign) => campaign.id === workspace.activeCampaignId,
  );
  const campaignLabelFor = (campaignId: string | null) =>
    campaignId ? (campaignNameById.get(campaignId) ?? "Campaign") : null;
  const isInActivePlan = (jobId: string) =>
    campaignIdsByJobId.get(jobId)?.has(workspace.activeCampaignId) ?? false;
  const isInSearchScope = resolvesActivePlan ? isInActivePlan : () => true;
  const campaignIdForJob = resolvesActivePlan
    ? (jobId: string) => (isInActivePlan(jobId) ? workspace.activeCampaignId : null)
    : (jobId: string) =>
        campaigns.find((campaign) =>
          campaignIdsByJobId.get(jobId)?.has(campaign.id),
        )?.id ?? null;

  const campaignEntries: JobFinderGlobalSearchEntry[] = campaigns.map(
    (campaign) => ({
      campaignId: campaign.id,
      href: `/job-finder/campaigns?campaignId=${encodeURIComponent(campaign.id)}`,
      id: campaign.id,
      kind: "campaign",
      metadata: [campaign.mode, campaign.status, campaign.description],
      subtitle: `${campaign.mode === "precision" ? "Precision" : "Scale"} mode · ${campaign.status}`,
      title: campaign.name,
    }),
  );
  const jobEntries: JobFinderGlobalSearchEntry[] = discoveryJobs
    .filter((job) => isInSearchScope(job.id))
    .map((job) => ({
      campaignId: campaignIdForJob(job.id),
      href: buildJobFinderContextRoute("/job-finder/discovery", {
        jobId: job.id,
      }),
      id: job.id,
      kind: "job",
      metadata: [
        job.company,
        job.location,
        ...(job.workMode ?? []),
        job.status,
        ...(job.matchAssessment?.reasons ?? []),
      ].filter((value): value is string => typeof value === "string"),
      subtitle: [job.company, job.location, campaignLabelFor(campaignIdForJob(job.id))]
        .filter(Boolean)
        .join(" · "),
      title: job.title,
    }));
  const applicationEntries: JobFinderGlobalSearchEntry[] = applicationRecords
    .filter((record) => isInSearchScope(record.jobId))
    .map((record) => ({
      campaignId: campaignIdForJob(record.jobId),
      href: buildJobFinderContextRoute("/job-finder/applications", {
        applicationRecordId: record.id,
      }),
      id: record.id,
      kind: "application",
      metadata: [
        record.company,
        record.status,
        record.lastActionLabel,
        record.nextActionLabel,
        ...(record.crm?.tags ?? []),
      ].filter((value): value is string => typeof value === "string"),
      subtitle: [
        record.company,
        (record.status ?? "").replaceAll("_", " "),
        campaignLabelFor(campaignIdForJob(record.jobId)),
      ]
        .filter(Boolean)
        .join(" · "),
      title: record.title,
    }));
  const documentEntries: JobFinderGlobalSearchEntry[] = [
    ...tailoredAssets
      .filter((asset) => isInSearchScope(asset.jobId))
      .map((asset) => ({
        campaignId: campaignIdForJob(asset.jobId),
        href: `/job-finder/review-queue/${asset.jobId}/resume`,
        id: asset.id,
        kind: "document" as const,
        metadata: [asset.templateName, asset.status, asset.version],
        subtitle: [
          asset.templateName,
          asset.status,
          campaignLabelFor(campaignIdForJob(asset.jobId)),
        ]
          .filter(Boolean)
          .join(" · "),
        title: asset.label,
      })),
    ...resumeExportArtifacts
      .filter((artifact) => isInSearchScope(artifact.jobId))
      .map((artifact) => ({
        campaignId: campaignIdForJob(artifact.jobId),
        href: `/job-finder/review-queue/${artifact.jobId}/resume`,
        id: artifact.id,
        kind: "document" as const,
        metadata: [artifact.templateId, artifact.format, artifact.filePath],
        subtitle: [
          (artifact.templateId ?? "").replaceAll("_", " "),
          `${(artifact.format ?? "").toUpperCase()} export`,
          campaignLabelFor(campaignIdForJob(artifact.jobId)),
        ]
          .filter(Boolean)
          .join(" · "),
        title: artifact.filePath.split(/[\\/]/).at(-1) ?? "Resume export",
      })),
  ];

  return [
    ...campaignEntries,
    ...jobEntries,
    ...applicationEntries,
    ...documentEntries,
    ...companyEntries,
  ];
}
