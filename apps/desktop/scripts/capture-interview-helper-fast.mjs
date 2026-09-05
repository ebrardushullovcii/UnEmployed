process.env.UI_CAPTURE_LABEL ??= "interview-helper-fast";
process.env.UI_INTERVIEW_HELPER_PROVIDER_MODE = "deterministic";

await import("./capture-interview-helper.mjs");
