import type { JobFinderWorkspaceSnapshot } from "@unemployed/contracts";
import type { JobFinderGlobalSearchEntry } from "./job-finder-global-search";
import { buildJobFinderContextRoute } from "./job-finder-context-navigation";

export function buildJobFinderGlobalSearchEntries(
  workspace: JobFinderWorkspaceSnapshot,
): readonly JobFinderGlobalSearchEntry[] {
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

  const campaignByJobId = new Map<string, string>();
  for (const campaign of workspace.campaigns) {
    for (const jobId of campaign.jobIds) {
      if (!campaignByJobId.has(jobId)) campaignByJobId.set(jobId, campaign.id);
    }
  }
  const campaignNameById = new Map(
    workspace.campaigns.map((campaign) => [campaign.id, campaign.name]),
  );
  const campaignLabelForJob = (jobId: string) => {
    const campaignId = campaignByJobId.get(jobId);
    return campaignId ? (campaignNameById.get(campaignId) ?? "Campaign") : null;
  };

  const campaignEntries: JobFinderGlobalSearchEntry[] = workspace.campaigns.map(
    (campaign) => ({
      campaignId: campaign.id,
      href: "/job-finder/campaigns",
      id: campaign.id,
      kind: "campaign",
      metadata: [campaign.mode, campaign.status, campaign.description],
      subtitle: `${campaign.mode === "precision" ? "Precision" : "Scale"} mode · ${campaign.status}`,
      title: campaign.name,
    }),
  );
  const jobEntries: JobFinderGlobalSearchEntry[] = workspace.discoveryJobs.map(
    (job) => ({
      campaignId: campaignByJobId.get(job.id) ?? null,
      href: buildJobFinderContextRoute("/job-finder/discovery", {
        jobId: job.id,
      }),
      id: job.id,
      kind: "job",
      metadata: [
        job.company,
        job.location,
        ...job.workMode,
        job.status,
        ...job.matchAssessment.reasons,
      ].filter((value): value is string => typeof value === "string"),
      subtitle: [job.company, job.location, campaignLabelForJob(job.id)]
        .filter(Boolean)
        .join(" · "),
      title: job.title,
    }),
  );
  const applicationEntries: JobFinderGlobalSearchEntry[] =
    workspace.applicationRecords.map((record) => ({
      campaignId: campaignByJobId.get(record.jobId) ?? null,
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
        record.status.replaceAll("_", " "),
        campaignLabelForJob(record.jobId),
      ]
        .filter(Boolean)
        .join(" · "),
      title: record.title,
    }));
  const documentEntries: JobFinderGlobalSearchEntry[] = [
    ...workspace.tailoredAssets.map((asset) => ({
      campaignId: campaignByJobId.get(asset.jobId) ?? null,
      href: `/job-finder/review-queue/${asset.jobId}/resume`,
      id: asset.id,
      kind: "document" as const,
      metadata: [asset.templateName, asset.status, asset.version],
      subtitle: [
        asset.templateName,
        asset.status,
        campaignLabelForJob(asset.jobId),
      ]
        .filter(Boolean)
        .join(" · "),
      title: asset.label,
    })),
    ...workspace.resumeExportArtifacts.map((artifact) => ({
      campaignId: campaignByJobId.get(artifact.jobId) ?? null,
      href: `/job-finder/review-queue/${artifact.jobId}/resume`,
      id: artifact.id,
      kind: "document" as const,
      metadata: [artifact.templateId, artifact.format, artifact.filePath],
      subtitle: [
        artifact.templateId.replaceAll("_", " "),
        `${artifact.format.toUpperCase()} export`,
        campaignLabelForJob(artifact.jobId),
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
