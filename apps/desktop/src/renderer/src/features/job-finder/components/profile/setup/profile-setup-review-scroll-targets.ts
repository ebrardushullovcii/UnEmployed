import type { ProfileSetupReviewItem } from './profile-setup-screen-helpers'

function getReviewItemInferenceText(item: ProfileSetupReviewItem): string {
  return [item.label, item.reason, item.proposedValue ?? '', item.sourceSnippet ?? '']
    .join(' ')
    .toLowerCase()
}

function inferExperienceField(item: ProfileSetupReviewItem): string {
  const text = getReviewItemInferenceText(item)

  if (/\bremote\b|\bhybrid\b|\bonsite\b|on-site|work mode/.test(text)) {
    return 'work-mode'
  }

  if (/company url|company website|employer website|website/.test(text)) {
    return 'company-url'
  }

  if (/employment type|full-time|part-time|contract|freelance/.test(text)) {
    return 'employment-type'
  }

  if (/\blocation\b|city|region|country/.test(text)) {
    return 'location'
  }

  if (/start date|started|from /.test(text)) {
    return 'start-date'
  }

  if (/summary|overview|achievement|impact|bullet/.test(text)) {
    return 'summary'
  }

  if (/end date|ended|until|\bpresent\b|\bcurrent role\b/.test(text)) {
    return 'end-date'
  }

  if (/\bcompany\b|employer|organization|organisation/.test(text)) {
    return 'company-name'
  }

  return 'title'
}

function inferEducationField(item: ProfileSetupReviewItem): string {
  const text = getReviewItemInferenceText(item)

  if (/field of study|major|subject/.test(text)) {
    return 'field-of-study'
  }

  if (/\blocation\b|campus|city|country/.test(text)) {
    return 'location'
  }

  if (/start date|started|from /.test(text)) {
    return 'start-date'
  }

  if (/end date|graduated|until|completed/.test(text)) {
    return 'end-date'
  }

  if (/summary|highlight|highlights/.test(text)) {
    return 'summary'
  }

  if (/degree|diploma|certificate/.test(text)) {
    return 'degree'
  }

  return 'school-name'
}

function inferCertificationField(item: ProfileSetupReviewItem): string {
  const text = getReviewItemInferenceText(item)

  if (/issuer|issued by/.test(text)) {
    return 'issuer'
  }

  if (/issue date|issued on/.test(text)) {
    return 'issue-date'
  }

  if (/expiry|expires|expiration/.test(text)) {
    return 'expiry-date'
  }

  if (/credential url|url|link/.test(text)) {
    return 'credential-url'
  }

  return 'name'
}

function inferProjectField(item: ProfileSetupReviewItem): string {
  const text = getReviewItemInferenceText(item)

  if (/repository|repo/.test(text)) {
    return 'repository-url'
  }

  if (/case study/.test(text)) {
    return 'case-study-url'
  }

  if (/project url|website|demo|link|url/.test(text)) {
    return 'project-url'
  }

  if (/project type|type/.test(text)) {
    return 'project-type'
  }

  if (/role/.test(text)) {
    return 'role'
  }

  if (/impact|outcome|result/.test(text)) {
    return 'outcome'
  }

  if (/summary|overview/.test(text)) {
    return 'summary'
  }

  return 'name'
}

function inferLinkField(item: ProfileSetupReviewItem): string {
  const text = getReviewItemInferenceText(item)

  if (/\burl\b|https?:\/\//.test(text)) {
    return 'url'
  }

  if (/kind|type|linkedin|github|portfolio|website/.test(text)) {
    return 'kind'
  }

  return 'label'
}

function inferLanguageField(item: ProfileSetupReviewItem): string {
  const text = getReviewItemInferenceText(item)

  if (/proficiency|fluency|level|c2|c1|b2|b1|a2|a1|native/.test(text)) {
    return 'proficiency'
  }

  if (/interview/.test(text)) {
    return 'interview-preference'
  }

  if (/note|context/.test(text)) {
    return 'notes'
  }

  return 'language'
}

function inferProofField(item: ProfileSetupReviewItem): string {
  const text = getReviewItemInferenceText(item)

  if (/hero metric|metric|percentage|%|reduced|increased|grew/.test(text)) {
    return 'hero-metric'
  }

  if (/supporting context|context/.test(text)) {
    return 'supporting-context'
  }

  if (/claim|achievement|proof/.test(text)) {
    return 'claim'
  }

  return 'title'
}

export function getReviewItemScrollTargetId(item: ProfileSetupReviewItem): string | null {
  if (item.target.domain === 'identity') {
    switch (item.target.key) {
      case 'summary':
        return 'profile-setup-field-identity-summary'
      case 'headline':
        return 'profile-setup-field-identity-headline'
      case 'currentLocation':
        return 'profile-setup-field-identity-current-location'
      case 'email':
        return 'profile-setup-field-identity-email'
      case 'phone':
        return 'profile-setup-field-identity-phone'
      case 'portfolioUrl':
        return 'profile-setup-field-identity-portfolio-url'
      case 'linkedinUrl':
        return 'profile-setup-field-identity-linkedin-url'
      case 'yearsExperience':
        return 'profile-setup-field-identity-years-experience'
    }
  }

  if (item.target.domain === 'narrative') {
    switch (item.target.key) {
      case 'professionalStory':
        return 'profile-setup-field-narrative-professional-story'
      case 'nextChapterSummary':
        return 'profile-setup-field-narrative-next-chapter'
      case 'careerTransitionSummary':
        return 'profile-setup-field-narrative-career-transition'
      case 'differentiators':
        return 'profile-setup-field-narrative-differentiators'
      case 'motivationThemes':
        return 'profile-setup-field-narrative-motivation-themes'
    }
  }

  if (item.target.domain === 'answer_bank') {
    switch (item.target.key) {
      case 'availability':
        return 'profile-setup-field-answer-bank-availability'
      case 'visaSponsorship':
        return 'profile-setup-field-answer-bank-visa-sponsorship'
      case 'relocation':
        return 'profile-setup-field-answer-bank-relocation'
      case 'selfIntroduction':
        return 'profile-setup-field-answer-bank-self-introduction'
      case 'careerTransition':
        return 'profile-setup-field-answer-bank-career-transition'
    }
  }

  if (item.target.domain === 'application_identity') {
    switch (item.target.key) {
      case 'preferredEmail':
        return 'profile-setup-field-application-identity-preferred-email'
      case 'preferredPhone':
        return 'profile-setup-field-application-identity-preferred-phone'
      case 'preferredLinkUrls':
        return 'profile-setup-field-application-identity-preferred-links'
    }
  }

  if (item.target.domain === 'work_eligibility') {
    switch (item.target.key) {
      case 'authorizedWorkCountries':
        return 'profile-setup-field-eligibility-authorized-work-countries'
      case 'requiresVisaSponsorship':
        return 'profile-setup-field-eligibility-requires-visa-sponsorship'
      case 'remoteEligible':
        return 'profile-setup-field-eligibility-remote-eligible'
      case 'willingToRelocate':
        return 'profile-setup-field-eligibility-willing-to-relocate'
      case 'willingToTravel':
        return 'profile-setup-field-eligibility-willing-to-travel'
      case 'availableStartDate':
        return 'profile-setup-field-eligibility-available-start-date'
    }
  }

  if (item.target.domain === 'search_preferences') {
    switch (item.target.key) {
      case 'targetRoles':
        return 'profile-setup-field-search-preferences-target-roles'
      case 'locations':
        return 'profile-setup-field-search-preferences-locations'
      case 'workModes':
        return 'profile-setup-field-search-preferences-work-modes'
    }
  }

  if (item.target.domain === 'experience' && item.target.recordId) {
    return `experience-record-${item.target.recordId}-${inferExperienceField(item)}`
  }

  if (item.target.domain === 'education' && item.target.recordId) {
    return `education-record-${item.target.recordId}-${inferEducationField(item)}`
  }

  if (item.target.domain === 'certification' && item.target.recordId) {
    return `certification-record-${item.target.recordId}-${inferCertificationField(item)}`
  }

  if (item.target.domain === 'project' && item.target.recordId) {
    return `project-record-${item.target.recordId}-${inferProjectField(item)}`
  }

  if (item.target.domain === 'link' && item.target.recordId) {
    return `link-record-${item.target.recordId}-${inferLinkField(item)}`
  }

  if (item.target.domain === 'language' && item.target.recordId) {
    return `language-record-${item.target.recordId}-${inferLanguageField(item)}`
  }

  if (item.target.domain === 'proof_point' && item.target.recordId) {
    return `proof-record-${item.target.recordId}-${inferProofField(item)}`
  }

  return null
}
