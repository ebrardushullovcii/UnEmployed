import { normalizeText } from "./shared";

type AdministrativeAreaDefinition = {
  country: "Canada" | "United States";
  name: string;
  postalCode: string;
};

const administrativeAreas: readonly AdministrativeAreaDefinition[] = [
  { country: "United States", name: "Alabama", postalCode: "AL" },
  { country: "United States", name: "Alaska", postalCode: "AK" },
  { country: "United States", name: "Arizona", postalCode: "AZ" },
  { country: "United States", name: "Arkansas", postalCode: "AR" },
  { country: "United States", name: "California", postalCode: "CA" },
  { country: "United States", name: "Colorado", postalCode: "CO" },
  { country: "United States", name: "Connecticut", postalCode: "CT" },
  { country: "United States", name: "Delaware", postalCode: "DE" },
  { country: "United States", name: "District of Columbia", postalCode: "DC" },
  { country: "United States", name: "Florida", postalCode: "FL" },
  { country: "United States", name: "Georgia", postalCode: "GA" },
  { country: "United States", name: "Hawaii", postalCode: "HI" },
  { country: "United States", name: "Idaho", postalCode: "ID" },
  { country: "United States", name: "Illinois", postalCode: "IL" },
  { country: "United States", name: "Indiana", postalCode: "IN" },
  { country: "United States", name: "Iowa", postalCode: "IA" },
  { country: "United States", name: "Kansas", postalCode: "KS" },
  { country: "United States", name: "Kentucky", postalCode: "KY" },
  { country: "United States", name: "Louisiana", postalCode: "LA" },
  { country: "United States", name: "Maine", postalCode: "ME" },
  { country: "United States", name: "Maryland", postalCode: "MD" },
  { country: "United States", name: "Massachusetts", postalCode: "MA" },
  { country: "United States", name: "Michigan", postalCode: "MI" },
  { country: "United States", name: "Minnesota", postalCode: "MN" },
  { country: "United States", name: "Mississippi", postalCode: "MS" },
  { country: "United States", name: "Missouri", postalCode: "MO" },
  { country: "United States", name: "Montana", postalCode: "MT" },
  { country: "United States", name: "Nebraska", postalCode: "NE" },
  { country: "United States", name: "Nevada", postalCode: "NV" },
  { country: "United States", name: "New Hampshire", postalCode: "NH" },
  { country: "United States", name: "New Jersey", postalCode: "NJ" },
  { country: "United States", name: "New Mexico", postalCode: "NM" },
  { country: "United States", name: "New York", postalCode: "NY" },
  { country: "United States", name: "North Carolina", postalCode: "NC" },
  { country: "United States", name: "North Dakota", postalCode: "ND" },
  { country: "United States", name: "Ohio", postalCode: "OH" },
  { country: "United States", name: "Oklahoma", postalCode: "OK" },
  { country: "United States", name: "Oregon", postalCode: "OR" },
  { country: "United States", name: "Pennsylvania", postalCode: "PA" },
  { country: "United States", name: "Rhode Island", postalCode: "RI" },
  { country: "United States", name: "South Carolina", postalCode: "SC" },
  { country: "United States", name: "South Dakota", postalCode: "SD" },
  { country: "United States", name: "Tennessee", postalCode: "TN" },
  { country: "United States", name: "Texas", postalCode: "TX" },
  { country: "United States", name: "Utah", postalCode: "UT" },
  { country: "United States", name: "Vermont", postalCode: "VT" },
  { country: "United States", name: "Virginia", postalCode: "VA" },
  { country: "United States", name: "Washington", postalCode: "WA" },
  { country: "United States", name: "West Virginia", postalCode: "WV" },
  { country: "United States", name: "Wisconsin", postalCode: "WI" },
  { country: "United States", name: "Wyoming", postalCode: "WY" },
  { country: "United States", name: "American Samoa", postalCode: "AS" },
  { country: "United States", name: "Guam", postalCode: "GU" },
  {
    country: "United States",
    name: "Northern Mariana Islands",
    postalCode: "MP",
  },
  { country: "United States", name: "Puerto Rico", postalCode: "PR" },
  {
    country: "United States",
    name: "U.S. Virgin Islands",
    postalCode: "VI",
  },
  {
    country: "United States",
    name: "U.S. Minor Outlying Islands",
    postalCode: "UM",
  },
  { country: "Canada", name: "Alberta", postalCode: "AB" },
  { country: "Canada", name: "British Columbia", postalCode: "BC" },
  { country: "Canada", name: "Manitoba", postalCode: "MB" },
  { country: "Canada", name: "New Brunswick", postalCode: "NB" },
  { country: "Canada", name: "Newfoundland and Labrador", postalCode: "NL" },
  { country: "Canada", name: "Nova Scotia", postalCode: "NS" },
  { country: "Canada", name: "Ontario", postalCode: "ON" },
  { country: "Canada", name: "Prince Edward Island", postalCode: "PE" },
  { country: "Canada", name: "Quebec", postalCode: "QC" },
  { country: "Canada", name: "Saskatchewan", postalCode: "SK" },
];

const administrativeAreaByAlias = new Map<
  string,
  AdministrativeAreaDefinition
>();
for (const area of administrativeAreas) {
  administrativeAreaByAlias.set(normalizeText(area.postalCode), area);
  if (area.name !== "Georgia") {
    administrativeAreaByAlias.set(normalizeText(area.name), area);
  }
}

const administrativeAreaByPostalCode = new Map(
  administrativeAreas.map((area) => [area.postalCode, area] as const),
);

export function canonicalizeLocationAliases(value: string): string {
  const trimmed = value.trim();
  const exactPostalArea = administrativeAreaByPostalCode.get(
    trimmed.toUpperCase(),
  );
  if (exactPostalArea) {
    return exactPostalArea.name;
  }

  return value.replace(
    /(^|,\s*)([A-Z]{2})(?=\s*(?:[,;/|]|\bor\b|$))/giu,
    (match, prefix: string, postalCode: string) => {
      const area = administrativeAreaByPostalCode.get(postalCode.toUpperCase());
      return area ? `${prefix}${area.name}` : match;
    },
  );
}

export function inferAdministrativeAreaCountry(
  values: readonly (string | null | undefined)[],
): AdministrativeAreaDefinition["country"] | null {
  for (const value of values) {
    if (!value) {
      continue;
    }

    const normalizedValue = normalizeText(value).replace(
      /\s+\d{5}(?:\s+\d{4})?$/u,
      "",
    );
    const area = administrativeAreaByAlias.get(normalizedValue);
    if (area) {
      return area.country;
    }
  }

  return null;
}
