/**
 * One vocabulary for the resume tailoring styles, shared by guided setup and
 * Preferences so the same setting never carries two names or two warnings.
 */
export const TAILORING_MODE_DESCRIPTIONS: Record<string, string> = {
  conservative:
    "Keep your wording and structure; tighten phrasing and highlight what matches the job.",
  balanced:
    "Adapt emphasis and wording to the role while keeping the shape of your experience familiar.",
  aggressive:
    "Substantially rewrite, combine, or elaborate supported experience into the strongest form you can prove. Small deliberate stretches — evidenced years rounded up by one toward the job's ask, technologies the job asks for that your experience makes credible, and the job's requested technologies added to your skills — help clear screening for the first interview. Review and confirm every generated line yourself.",
};

export const STRONG_REWRITE_WARNING =
  "Strong rewrite reshapes supported experience and can add small, deliberate stretches meant to get you the first interview: evidenced years may round up by one toward the job's ask, and technologies the job asks for may appear when your saved experience makes them credible. The job's requested technologies are also added to your skills section. Every such line and skill is flagged, counted in the draft notes, and stays review-required until you confirm it — the interview is where you prove each claim. Job Finder never auto-approves or submits applications.";
