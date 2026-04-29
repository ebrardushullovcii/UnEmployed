import { normalizeText } from "./shared";

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeRecordText(value: unknown): string {
  return typeof value === "string" ? normalizeText(value) : "";
}

function normalizeRecordDate(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim().toLowerCase().replace(/\s+/g, " ").replace(/\./g, "");
  if (!trimmed) {
    return "";
  }

  if (trimmed === "present" || trimmed === "current") {
    return "present";
  }

  const isoMonthMatch = trimmed.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (isoMonthMatch) {
    return `${isoMonthMatch[1]}-${isoMonthMatch[2]}`;
  }

  const slashMonthMatch = trimmed.match(/^(\d{1,2})\/(\d{4})$/);
  if (slashMonthMatch) {
    const month = Number.parseInt(slashMonthMatch[1] ?? "", 10);

    if (Number.isInteger(month) && month >= 1 && month <= 12) {
      return `${slashMonthMatch[2]}-${String(month).padStart(2, "0")}`;
    }
  }

  const monthByName: Record<string, string> = {
    jan: "01",
    january: "01",
    feb: "02",
    february: "02",
    mar: "03",
    march: "03",
    apr: "04",
    april: "04",
    may: "05",
    jun: "06",
    june: "06",
    jul: "07",
    july: "07",
    aug: "08",
    august: "08",
    sep: "09",
    sept: "09",
    september: "09",
    oct: "10",
    october: "10",
    nov: "11",
    november: "11",
    dec: "12",
    december: "12",
  };
  const monthYearMatch = trimmed.match(/^([a-z]+)\s+(\d{4})$/);
  if (monthYearMatch) {
    const month = monthByName[monthYearMatch[1] ?? ""];
    const year = monthYearMatch[2] ?? "";
    return month && year ? `${year}-${month}` : trimmed;
  }

  const yearMatch = trimmed.match(/^(\d{4})$/);
  if (yearMatch) {
    return yearMatch[1] ?? trimmed;
  }

  return trimmed;
}

function normalizeRecordEndDate(
  value: unknown,
  isCurrent: unknown,
): string {
  if (isCurrent === true) {
    return "present";
  }

  const normalizedDate = normalizeRecordDate(value);
  return normalizedDate;
}

function fieldsMatch(left: string, right: string): boolean {
  return left.length > 0 && right.length > 0 && left === right;
}

function fieldsCompatible(left: string, right: string): boolean {
  return !left || !right || left === right;
}

function countTruthyFields(values: readonly unknown[]): number {
  return values.reduce<number>((count, value) => {
    if (typeof value === "string") {
      return value.trim().length > 0 ? count + 1 : count;
    }

    if (typeof value === "boolean") {
      return value ? count + 1 : count;
    }

    if (Array.isArray(value)) {
      return value.length > 0 ? count + 1 : count;
    }

    return value !== null && value !== undefined ? count + 1 : count;
  }, 0);
}

export function areEquivalentExperienceRecords(
  left: unknown,
  right: unknown,
): boolean {
  if (!isObjectRecord(left) || !isObjectRecord(right)) {
    return false;
  }

  const leftCompany = normalizeRecordText(left.companyName);
  const rightCompany = normalizeRecordText(right.companyName);
  const leftTitle = normalizeRecordText(left.title);
  const rightTitle = normalizeRecordText(right.title);
  const leftLocation = normalizeRecordText(left.location);
  const rightLocation = normalizeRecordText(right.location);
  const leftStart = normalizeRecordDate(left.startDate);
  const rightStart = normalizeRecordDate(right.startDate);
  const leftEnd = normalizeRecordEndDate(left.endDate, left.isCurrent);
  const rightEnd = normalizeRecordEndDate(right.endDate, right.isCurrent);

  const strongCompany = fieldsMatch(leftCompany, rightCompany);
  const strongTitle = fieldsMatch(leftTitle, rightTitle);
  const strongStart = fieldsMatch(leftStart, rightStart);
  const strongEnd = fieldsMatch(leftEnd, rightEnd);
  const strongLocation = fieldsMatch(leftLocation, rightLocation);
  const companyCompatible = fieldsCompatible(leftCompany, rightCompany);
  const titleCompatible = fieldsCompatible(leftTitle, rightTitle);
  const startCompatible = fieldsCompatible(leftStart, rightStart);
  const endCompatible = fieldsCompatible(leftEnd, rightEnd);

  return (
    (strongTitle && strongStart && companyCompatible && (strongCompany || strongLocation)) ||
    (strongCompany && strongStart && titleCompatible && (strongTitle || strongEnd || strongLocation)) ||
    (strongTitle && strongCompany && (strongStart || strongEnd) && startCompatible && endCompatible)
  );
}

export function areEquivalentEducationRecords(
  left: unknown,
  right: unknown,
): boolean {
  if (!isObjectRecord(left) || !isObjectRecord(right)) {
    return false;
  }

  const leftSchool = normalizeRecordText(left.schoolName);
  const rightSchool = normalizeRecordText(right.schoolName);
  const leftDegree = normalizeRecordText(left.degree);
  const rightDegree = normalizeRecordText(right.degree);
  const leftField = normalizeRecordText(left.fieldOfStudy);
  const rightField = normalizeRecordText(right.fieldOfStudy);
  const leftStart = normalizeRecordDate(left.startDate);
  const rightStart = normalizeRecordDate(right.startDate);
  const leftEnd = normalizeRecordDate(left.endDate);
  const rightEnd = normalizeRecordDate(right.endDate);

  const strongSchool = fieldsMatch(leftSchool, rightSchool);
  const strongDegree = fieldsMatch(leftDegree, rightDegree);
  const strongStart = fieldsMatch(leftStart, rightStart);
  const strongEnd = fieldsMatch(leftEnd, rightEnd);

  return (
    (strongSchool && strongDegree && (strongStart || strongEnd) && fieldsCompatible(leftField, rightField)) ||
    (strongSchool && strongStart && fieldsCompatible(leftDegree, rightDegree) && fieldsCompatible(leftField, rightField))
  );
}

export function scoreExperienceRecordCompleteness(value: unknown): number {
  if (!isObjectRecord(value)) {
    return 0;
  }

  return countTruthyFields([
    value.companyName,
    value.companyUrl,
    value.title,
    value.employmentType,
    value.location,
    value.startDate,
    value.endDate,
    value.isCurrent,
    value.summary,
    value.peopleManagementScope,
    value.ownershipScope,
    value.workMode,
    value.achievements,
    value.skills,
    value.domainTags,
  ]);
}

export function scoreEducationRecordCompleteness(value: unknown): number {
  if (!isObjectRecord(value)) {
    return 0;
  }

  return countTruthyFields([
    value.schoolName,
    value.degree,
    value.fieldOfStudy,
    value.location,
    value.startDate,
    value.endDate,
    value.summary,
  ]);
}
