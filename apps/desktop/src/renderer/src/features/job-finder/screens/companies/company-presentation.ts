import type {
  CompanyEntity,
  CompanyPreference,
  CompanySalaryOfferEvidence,
} from "@unemployed/contracts";

export const companyPreferenceLabels: Record<
  CompanyPreference,
  string
> = {
  neutral: "Neutral",
  follow: "Follow",
  prefer: "Prefer",
  review: "Require review",
  exclude: "Exclude",
};

export const companyPreferenceTones: Record<
  CompanyPreference,
  "neutral" | "active" | "positive" | "critical" | "muted"
> = {
  neutral: "neutral",
  follow: "active",
  prefer: "positive",
  review: "critical",
  exclude: "muted",
};

export const companySalaryOfferEvidenceKindLabels: Record<
  CompanySalaryOfferEvidence["kind"],
  string
> = {
  listed_salary: "Listed salary",
  offer: "Offer",
  benefits: "Benefits",
  note: "Note",
};

function formatMoney(
  currency: string | null,
  minimum: number | null,
  maximum: number | null,
  period: CompanySalaryOfferEvidence["period"],
): string | null {
  if (currency === null || (minimum === null && maximum === null)) {
    return null;
  }
  const currencySymbol =
    currency === "USD"
      ? "$"
      : currency === "EUR"
        ? "€"
        : currency === "GBP"
          ? "£"
          : `${currency} `;
  const formatAmount = (amount: number) =>
    new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 0,
    }).format(amount);
  const periodLabel = period === "hour" ? "/hr" : period === "month" ? "/mo" : "/yr";
  const range =
    minimum !== null && maximum !== null && minimum !== maximum
      ? `${currencySymbol}${formatAmount(minimum)}–${formatAmount(maximum)}${periodLabel}`
      : `${currencySymbol}${formatAmount(minimum ?? maximum ?? 0)}${periodLabel}`;
  return range;
}

export function describeCompanySalaryOfferEvidence(
  evidence: CompanySalaryOfferEvidence,
): string {
  const parts: string[] = [];
  const money = formatMoney(
    evidence.currency,
    evidence.minimum,
    evidence.maximum,
    evidence.period,
  );
  if (money) parts.push(money);
  if (evidence.offerStatus && evidence.offerStatus !== "none") {
    parts.push(`Status: ${evidence.offerStatus}`);
  }
  if (parts.length === 0) {
    return "No amounts recorded";
  }
  return parts.join(" · ");
}

export function companySearchTokens(company: CompanyEntity): string[] {
  return [
    company.canonicalName,
    ...company.aliases.map((alias) => alias.alias),
    ...company.domains.map((domain) => domain.domain),
    companyPreferenceLabels[company.preference],
    ...company.contacts.map((contact) => `${contact.name} ${contact.role ?? ""}`),
    ...company.notes.map((note) => note.body),
    ...company.sourceHistory.map((ref) => ref.sourceId),
  ];
}

export function countCompanyOpenings(
  company: CompanyEntity,
  jobsByStatus: ReadonlyMap<string, string>,
): { current: number; previous: number; total: number } {
  let current = 0;
  let previous = 0;
  for (const jobId of company.jobIds) {
    const status = jobsByStatus.get(jobId);
    if (!status) continue;
    // Statuses mirror the pure projection: active statuses count as current,
    // everything else (closed/archived) counts as previous.
    if (
      [
        "discovered",
        "shortlisted",
        "drafting",
        "ready_for_review",
        "approved",
        "submitted",
        "assessment",
        "interview",
        "offer",
      ].includes(status)
    ) {
      current += 1;
    } else {
      previous += 1;
    }
  }
  return { current, previous, total: company.jobIds.length };
}
