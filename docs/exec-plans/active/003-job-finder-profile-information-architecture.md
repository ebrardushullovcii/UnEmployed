# 003 Job Finder Profile Information Architecture

Status: active

## Goal

Redesign the `Job Finder` profile model and profile page so the app stores hiring-relevant candidate data in clearer, more reusable groups for ATS alignment, resume tailoring, browser automation, and future interview workflows.

## Why This Work Exists

The current profile UI proves the resume-import and AI-extraction loop, but it still flattens too much candidate data into a small set of generic fields.

That creates four product problems:

1. Important hiring signals are mixed together instead of being stored separately.
2. Resume tailoring has to infer missing structure from raw text too often.
3. Browser automation and future application-form filling need more explicit field ownership.
4. The UI currently feels like one long edit form instead of an intentional candidate workspace.

## External Guidance Snapshot

This plan is based on current public guidance from major hiring surfaces and profile systems:

- LinkedIn help and profile guidance emphasize structured profile basics, contact info, headline, summary/about, experience, skills, projects, and recommendations.
- ATS-oriented resume guidance consistently favors machine-readable structure, standard section names, explicit dates, clear job titles, and plain text that maps cleanly into searchable fields.
- Recruiting platforms commonly separate candidate identity, contact channels, work eligibility, experience, education, skills, preferences, and recruiter notes instead of storing everything as a single summary blob.

## Design Principles

- Store canonical facts separately from generated text.
- Distinguish candidate identity from search preferences.
- Distinguish reusable candidate data from per-job tailoring inputs.
- Keep ATS-critical fields explicit, normalized, and easy to export.
- Preserve AI-generated interpretations, but never let them replace the raw underlying facts.
- Make the profile page read like a guided workspace, not a spreadsheet.

## Proposed Information Architecture

### 1. Identity And Contact

Purpose: canonical person record and top-of-resume fields.

Recommended fields:

- first name
- middle name
- last name
- preferred display name
- professional headline
- primary email
- secondary email
- primary phone
- current city
- current region/state
- current country
- timezone
- LinkedIn URL
- portfolio URL
- GitHub URL
- personal website

Why it matters:

- Supports ATS-safe resume headers.
- Gives browser automation explicit inputs for application forms.
- Separates public-facing contact data from deeper profile details.

### 2. Work Authorization And Logistics

Purpose: fields commonly needed in applications, screening, and automation.

Recommended fields:

- current work authorization country list
- requires visa sponsorship
- citizenship or work-right notes (optional and user-controlled)
- willing to relocate
- preferred relocation regions
- willing to travel
- remote eligibility
- notice period
- start-date availability
- security-clearance status (optional)

Why it matters:

- These are repeated screening questions in ATS and Easy Apply flows.
- They should not live inside summary text or ad hoc notes.

### 3. Role Targeting

Purpose: what the user wants next, separated from who they are now.

Recommended fields:

- target job titles
- target job families
- target seniority levels
- target industries
- target company stages or sizes
- preferred locations
- excluded locations
- work modes
- compensation minimum
- compensation target
- compensation currency
- employment types
- blocked companies
- preferred companies

Why it matters:

- Keeps search and ranking logic out of the core candidate profile.
- Makes future discovery and scoring rules easier to tune.

### 4. Professional Summary Layer

Purpose: reusable narrative content for resume tailoring and profile generation.

Recommended fields:

- short value proposition (1-2 lines)
- full professional summary
- career themes
- leadership summary
- domain focus summary
- strengths or differentiators

Why it matters:

- Lets the model choose from structured narrative blocks instead of rebuilding everything from raw resume text.
- Makes summary content easier to edit without touching factual records.

### 5. Experience Inventory

Purpose: canonical reusable work history that can feed tailored resumes and ATS forms.

Recommended fields per experience item:

- company name
- company URL (optional)
- title
- employment type
- start month/year
- end month/year
- current role flag
- location
- work mode
- short role summary
- achievements bullet list
- tech stack used
- domain/industry tags
- people-management scope
- budget or ownership scope (optional)

Why it matters:

- ATS and job applications often want structured employment history.
- Tailoring should pull from atomic achievement bullets, not only from one long resume blob.

### 6. Skills And Evidence

Purpose: a richer skill model than one flat tag list.

Recommended fields:

- hard skills
- tools/platforms
- languages/frameworks
- soft skills
- skill proficiency or confidence
- years used (optional)
- last-used date (optional)
- evidence links or related experiences
- highlighted skills for target roles

Why it matters:

- Recruiters search by specific skill keywords.
- Tailoring improves when the system knows which skills are core, recent, or evidenced by experience.

### 7. Education, Certifications, And Credentials

Purpose: structured qualification records for ATS forms and screening.

Recommended fields:

- education entries with school, degree, field of study, start/end dates
- certifications with issuer, issue date, expiry date, credential URL
- licenses
- courses or continuing education
- awards and honors

Why it matters:

- These are common application sections and often screening filters.
- They should be exportable independently from resume text.

### 8. Projects, Portfolio, And Proof

Purpose: evidence that improves competitiveness for technical and creative roles.

Recommended fields:

- project name
- project type
- project summary
- role on project
- stack/skills used
- outcome or impact
- project URL
- repository URL
- case-study URL
- attachments or artifact references

Why it matters:

- Especially useful for engineering, product, design, and freelance-style histories.
- Gives the agent better material for tailored resume and future cover-letter output.

### 9. Language And Communication Signals

Purpose: structured language ability and communication context.

Recommended fields:

- spoken languages
- proficiency level
- interview language preference
- relocation language notes

Why it matters:

- Common hiring filter for international roles.
- Important for future interview-helper workflows.

### 10. Resume And AI Provenance

Purpose: keep extracted artifacts and trust signals explicit.

Recommended fields:

- source resume documents
- source document type
- extracted text status
- parsed-by provider and model
- parsed-at timestamp
- confidence/review-needed markers
- user-confirmed fields
- AI-generated summaries
- AI-generated tailoring ingredients

Why it matters:

- Users need to know what came from AI, what came from the uploaded document, and what they manually confirmed.
- Prevents silent drift in profile data.

## Recommended Separation In Product State

Use four top-level buckets instead of one overloaded profile object:

1. `candidateIdentity`
   - stable human identity and contact channels
2. `candidateBackground`
   - experience, education, skills, projects, certifications, languages
3. `jobSearchPreferences`
   - targeting, location, compensation, workflow preferences, blocked/preferred companies
4. `profileArtifacts`
   - source resumes, extracted text, AI analyses, confirmations, generated summaries

This split should make downstream tailoring and automation clearer than continuing to grow the current `CandidateProfile` shape indefinitely.

## Recommended Profile Page Structure

### Section Order

1. Overview
   - name, headline, parse status, confidence/review chips, primary CTA
2. Resume Intake
   - source files, extraction status, provider used, re-analyze action
3. Identity And Contact
4. Job Targets
5. Work Eligibility And Logistics
6. Career Summary
7. Skills And Tools
8. Experience Timeline
9. Education And Credentials
10. Projects And Links
11. Review Queue For Missing Or Unconfirmed Fields

### UI Notes

- Replace the long dual-form layout with stacked cards grouped by purpose.
- Add section descriptions so users understand why each group exists.
- Hide advanced/optional fields behind progressive disclosure instead of showing every field at once.
- Show small confidence badges on AI-filled sections: `confirmed`, `needs review`, `empty`, `ai draft`.
- Use tokenized chips only for short enumerable data such as roles, skills, work modes, and locations.
- Avoid giant raw-text areas as primary editing surfaces; use structured repeatable rows first, with raw resume text as a secondary artifact panel.
- Keep the top summary compact and reserve the lower page for detail editing.

## ATS And Automation Priorities

These fields should be treated as highest-priority because they are most reusable across ATS parsing, job search, and browser form-fill:

- legal/display name
- email and phone
- city/region/country
- LinkedIn URL
- work authorization and sponsorship
- target titles
- preferred locations and work modes
- years of experience
- structured experience history with dates
- skills
- education
- certifications
- resume provenance and user confirmation state

## Proposed Rollout

### Phase 1: Contract Reshape

- introduce new normalized contracts for identity, background, and artifacts
- keep backward-compatible adapters from the current profile object
- add provenance and confirmation metadata at the field-group level

### Phase 2: Extraction Mapping

- map resume-analysis output into the new grouped structure
- preserve raw extracted text and AI-derived summaries separately
- mark low-confidence or missing sections for explicit user review

### Phase 3: Profile UI Redesign

- move from the current two-column mixed form to grouped workspace sections
- add repeater editors for experience, education, certifications, projects, and links
- keep discovery preferences visually separate from canonical candidate data

### Phase 4: Tailoring And Automation Integration

- build prompt inputs from grouped data instead of one large profile payload
- use identity/logistics fields for browser automation answers
- use evidence-backed skills and achievements for tailored resume generation

## Open Questions

- How much of work-authorization data should be optional versus first-class in the MVP?
- Should compensation preferences live on the profile page or move entirely to a discovery/settings area?
- Do we want one canonical experience model for both resume output and ATS form-fill, or separate raw/canonical representations?
- Should user confirmation be tracked per field, per section, or per imported resume snapshot?

## Recommended Immediate Next Task

Implement the data-model split first, then redesign the profile page around grouped sections. If the UI is redesigned before the contracts are cleaned up, the current mixed data model will keep leaking into the new layout.
