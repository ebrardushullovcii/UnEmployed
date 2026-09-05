/**
 * Plain-language labels shared by guided setup and the full Profile editor.
 *
 * These fields intentionally keep legal work facts separate from search
 * preferences. Unknown legal facts stay Not set; the UI must not infer them
 * from a resume or from a preferred work mode.
 */
export const PROFILE_WORK_CONSTRAINT_COPY = {
  authorizedWorkCountries: {
    description: "Where you already have the right to work.",
    label: "Countries where you can work",
    placeholder: "Example: United States, Germany",
  },
  preferredRelocationRegions: {
    description: "A preference, not a work-authorization answer.",
    label: "Places you would consider relocating to",
    placeholder: "Example: Austin, TX, Berlin",
  },
  requiresVisaSponsorship: {
    description: "Yes only if an employer must sponsor you.",
    label: "Would you need employer visa sponsorship?",
  },
  remoteEligible: {
    description: "Whether you can, not whether you prefer it.",
    label: "Can you legally work remotely?",
  },
  willingToRelocate: {
    description: "Whether you would move for a role.",
    label: "Would you relocate?",
  },
  willingToTravel: {
    description: "Whether you would travel for work.",
    label: "Would you travel for work?",
  },
  workModes: {
    description: "Choose the setup you want: remote, hybrid, or onsite.",
    label: "Preferred work modes",
  },
} as const;
