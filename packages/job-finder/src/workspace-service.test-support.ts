export * from "./workspace-service.test-fixtures";
export * from "./workspace-service.test-runtimes";
export * from "./workspace-service.test-findings";
export * from "./workspace-service.test-harness";

export function parsePhaseFromSiteLabel(siteLabel: string): string {
  const normalizedLabel = siteLabel.toLowerCase();

  if (normalizedLabel.includes("access auth probe")) {
    return "access_auth_probe";
  }
  if (normalizedLabel.includes("site structure mapping")) {
    return "site_structure_mapping";
  }
  if (normalizedLabel.includes("search filter probe")) {
    return "search_filter_probe";
  }
  if (normalizedLabel.includes("job detail validation")) {
    return "job_detail_validation";
  }
  if (normalizedLabel.includes("apply path validation")) {
    return "apply_path_validation";
  }

  return "replay_verification";
}
