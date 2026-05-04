export const knownSkillPhrases = [
  "React",
  "React Native",
  "TypeScript",
  "JavaScript",
  "C#",
  "Node.js",
  "Node",
  "Next.js",
  "Express.js",
  "ASP.NET",
  ".NET Core",
  ".NET Framework",
  "Entity Framework",
  "MVC",
  "Electron",
  "Playwright",
  "SQLite",
  "Figma",
  "Design Systems",
  "Product Design",
  "UX Strategy",
  "Accessibility",
  "Python",
  "AWS",
  "Azure",
  "SQL Server",
  "MySQL",
  "PostgreSQL",
  "MongoDB",
  "Docker",
  "WebSockets",
  "Postman",
  "Jira",
  "Selenium",
  "Cypress",
  "GraphQL",
  "SQL",
  "CSS",
  "HTML",
  "OAuth",
  "JWT",
  "TailwindCSS",
  "ShadCN",
  "REST APIs",
] as const;

export const knownSoftSkillPhrases = [
  "Leadership",
  "Communication",
  "Problem-solving",
  "Adaptability",
  "Mentoring",
  "Collaboration",
  "Stakeholder alignment",
  "Facilitation",
] as const;

export const resumeSectionHeadings = new Set([
  "ABOUT ME",
  "ABOUT MYSELF",
  "ABOUT",
  "SUMMARY",
  "PROFILE",
  "PERSONAL PROFILE",
  "PROFESSIONAL SUMMARY",
  "SKILLS",
  "TECHNICAL SKILLS",
  "CORE SKILLS",
  "KEY SKILLS",
  "WORK EXPERIENCE",
  "EXPERIENCE",
  "PROJECTS",
  "EDUCATION AND TRAINING",
  "EDUCATION",
  "LANGUAGE SKILLS",
  "CERTIFICATIONS",
]);

export const contactOrMetaPattern =
  /date of birth|nationality|phone|email|website|address|skills|experience|education|frameworks|languages|databases|tools|soft skills/i;

export const headlineKeywordPattern =
  /\b(software|full-stack|frontend|backend|web|react|node|\.net|chief)?\s*(engineer|developer|designer|manager|lead|architect|specialist|consultant|analyst|officer)\b/i;

export const skillSectionAliases = [
  "SKILLS",
  "TECHNICAL SKILLS",
  "CORE SKILLS",
  "KEY SKILLS",
] as const;

export const summarySectionAliases = [
  "ABOUT ME",
  "ABOUT MYSELF",
  "ABOUT",
  "SUMMARY",
  "PROFILE",
  "PERSONAL PROFILE",
  "PROFESSIONAL SUMMARY",
] as const;

export const experienceSectionAliases = [
  "WORK EXPERIENCE",
  "PROFESSIONAL EXPERIENCE",
  "EXPERIENCE",
] as const;

export const skillCategoryHeadingPattern =
  /^(frameworks|programming languages|languages|databases|tools|security(?:\s*&\s*authentication)?|soft skills)$/i;

export const dateRangePattern =
  /((?:\d{1,2}\/\d{1,2}\/\d{4})|(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+)?(?:\d{1,2}\/)?\d{4})\s*[–—-]\s*(current|present|(?:\d{1,2}\/\d{1,2}\/\d{4})|(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+)?(?:\d{1,2}\/)?\d{4})/i;

export const knownPersonalWebsitePlatformDomains = [
  "coursera.org",
  "dev.to",
  "edx.org",
  "facebook.com",
  "github.com",
  "github.io",
  "hashnode.dev",
  "linkedin.com",
  "linkedinlearning.com",
  "medium.com",
  "npmjs.com",
  "stackoverflow.com",
  "substack.com",
  "twitter.com",
  "udemy.com",
  "x.com",
] as const;

export const likelyPersonalWebsitePaths = new Set([
  "",
  "/",
  "/about",
  "/contact",
  "/cv",
  "/home",
  "/portfolio",
  "/resume",
]);
