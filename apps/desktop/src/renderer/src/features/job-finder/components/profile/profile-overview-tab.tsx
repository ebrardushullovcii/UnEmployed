import type { AgentProviderStatus, CandidateProfile, JobSearchPreferences } from '@unemployed/contracts'
import { Badge } from '../../../../components/ui/badge'
import { Button } from '../../../../components/ui/button'
import { Chip } from '../../../../components/ui/chip'
import { PreferenceList } from '../preference-list'
import { StatusBadge } from '../status-badge'
import { formatDateOnly, formatResumeAnalysisSummary, formatStatusLabel, getAssetTone } from '../../lib/job-finder-utils'

interface ProfileOverviewTabProps {
  agentProvider: AgentProviderStatus
  busy: boolean
  onAnalyzeProfileFromResume: () => void
  onImportResume: () => void
  profile: CandidateProfile
  searchPreferences: JobSearchPreferences
}

export function ProfileOverviewTab({
  agentProvider,
  busy,
  onAnalyzeProfileFromResume,
  onImportResume,
  profile,
  searchPreferences
}: ProfileOverviewTabProps) {
  return (
    <div className="grid gap-6">
      <div className="grid gap-1 border border-border/20 bg-border/20">
        <section className="grid gap-1 md:grid-cols-12">
          <div className="border border-border/10 bg-background p-6 md:col-span-3">
            <h2 className="font-display text-sm font-bold uppercase tracking-[0.16em] text-foreground">01_SOURCE_FILE</h2>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">UPLOAD NEW CV OR RE-PROCESS EXISTING DATA STREAM.</p>
            <div className="mt-8 font-mono text-[10px] uppercase tracking-[0.08em] text-primary/70">FORMATS: PDF, DOCX, TXT</div>
          </div>
          <div className="group relative flex items-center justify-center overflow-hidden border border-border/10 bg-secondary p-8 md:col-span-9">
            <div className="absolute inset-0 bg-primary/5 opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="relative z-10 grid place-items-center gap-4 text-center">
              <div className="grid h-16 w-16 place-items-center border-2 border-dashed border-border hover:border-primary">
                <span className="font-display text-3xl text-muted-foreground">+</span>
              </div>
              <div>
                <Button variant="link" disabled={busy} onClick={onImportResume} type="button">REPLACE_SOURCE_MANIFEST</Button>
                <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">CURRENT: {profile.baseResume.fileName}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-1 md:grid-cols-12">
          <div className="border border-border/10 bg-background p-6 md:col-span-3">
            <h2 className="font-display text-sm font-bold uppercase tracking-[0.16em] text-foreground">02_IDENTITY_PARSE</h2>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">EXTRACTED CORE COMPETENCIES AND HISTORICAL LOGS.</p>
            <div className="mt-8 inline-flex border border-border/20 bg-secondary px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">MATCH_ACCURACY: 98%</div>
          </div>
          <div className="grid border border-border/10 bg-background md:col-span-9 md:grid-cols-3">
            <div className="border-b border-r border-border/10 p-6">
              <label className="mb-2 block font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">PRIMARY_ROLE</label>
              <p className="font-display text-lg font-bold uppercase text-foreground">{profile.headline}</p>
            </div>
            <div className="border-b border-r border-border/10 p-6">
              <label className="mb-2 block font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">EXPERIENCE_EPOCH</label>
              <p className="font-display text-lg font-bold uppercase text-foreground">{profile.yearsExperience}_YEARS_ACTIVE</p>
            </div>
            <div className="border-b border-border/10 p-6">
              <label className="mb-2 block font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">CORE_STACK</label>
              <div className="flex flex-wrap gap-1">
                {(profile.skillGroups.highlightedSkills.length > 0 ? profile.skillGroups.highlightedSkills : profile.skills)
                  .slice(0, 4)
                  .map((skill) => <Chip key={skill}>{skill}</Chip>)}
              </div>
            </div>
            <div className="border-r border-border/10 p-6">
              <label className="mb-2 block font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">LAST_ASSIGNMENT</label>
              <p className="font-display text-sm font-medium uppercase text-foreground">{profile.experiences[0]?.companyName ?? profile.currentLocation}</p>
            </div>
            <div className="border-r border-border/10 p-6">
              <label className="mb-2 block font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">EDUCATION_CERT</label>
              <p className="font-display text-sm font-medium uppercase text-foreground">{profile.education[0]?.schoolName ?? 'NO_FORMAL_RECORD'}</p>
            </div>
            <div className="flex items-center justify-between bg-secondary p-6 transition-colors hover:bg-surface-strong">
              <div>
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-primary">FULL_MANIFEST_READOUT</span>
                <p className="text-[10px] text-muted-foreground">VIEW ALL EXTRACTED NODES</p>
              </div>
              <span className="font-display text-primary">&gt;</span>
            </div>
          </div>
        </section>

        <section className="grid gap-1 md:grid-cols-12">
          <div className="border border-border/10 bg-background p-6 md:col-span-3">
            <h2 className="font-display text-sm font-bold uppercase tracking-[0.16em] text-foreground">03_TACTICAL_PARAMS</h2>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">CALIBRATE DISCOVERY ENGINE FOR TARGETED SEARCH.</p>
            <div className="mt-8">
              <div className="h-1 w-full overflow-hidden bg-secondary"><div className="h-full w-3/4 bg-primary" /></div>
              <span className="mt-2 block font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">PARAM_DENSITY: OPTIMIZED</span>
            </div>
          </div>
          <div className="border border-border/10 bg-background p-8 md:col-span-9">
            <div className="grid gap-8 md:grid-cols-2">
              <div className="space-y-4">
                <PreferenceList label="TARGET_ROLES" values={searchPreferences.targetRoles} />
                <PreferenceList label="LOCATIONS_GEO" values={searchPreferences.locations} compact />
              </div>
              <div className="space-y-6">
                <PreferenceList compact label="MODALITY" values={searchPreferences.workModes.map(formatStatusLabel)} />
                <div>
                  <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">MIN_BASE_REMUNERATION (K_USD)</span>
                  <div className="mt-2 flex items-center gap-4">
                    <div className="h-1 w-full bg-secondary"><div className="h-full w-3/4 bg-primary" /></div>
                    <span className="font-mono text-sm font-bold text-primary">{searchPreferences.minimumSalaryUsd ?? 160}K+</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-[0.42rem] border border-border-subtle bg-[rgba(17,17,17,0.9)] p-6 grid content-start gap-[1.2rem]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="text-[0.68rem] uppercase tracking-[0.11em] text-foreground-muted">Resume intake and provenance</p>
            <StatusBadge tone={agentProvider.kind === 'openai_compatible' ? 'positive' : 'active'}>{agentProvider.label}</StatusBadge>
          </div>
          <div className="grid min-h-[4.8rem] content-center gap-1.5 rounded-[0.42rem] border border-border-subtle bg-white/2 p-4">
            <strong>{profile.baseResume.fileName}</strong>
            <span>Uploaded {formatDateOnly(profile.baseResume.uploadedAt)}</span>
            <StatusBadge tone={getAssetTone(profile.baseResume.extractionStatus === 'ready' ? 'ready' : profile.baseResume.extractionStatus === 'failed' ? 'failed' : profile.baseResume.extractionStatus === 'needs_text' ? 'queued' : 'generating')}>
              {formatStatusLabel(profile.baseResume.extractionStatus)}
            </StatusBadge>
            {profile.baseResume.lastAnalyzedAt && profile.baseResume.analysisProviderLabel ? (
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={profile.baseResume.analysisProviderKind === 'openai_compatible' ? 'positive' : 'active'}>
                  {profile.baseResume.analysisProviderKind === 'openai_compatible' ? 'AI parsed' : 'Fallback parsed'}
                </StatusBadge>
                <span className="text-[0.78rem] uppercase tracking-[0.08em] text-foreground-muted">{profile.baseResume.analysisProviderLabel}</span>
              </div>
            ) : null}
            <div className="flex flex-wrap items-stretch gap-2.5">
              <Button variant="secondary" size="compact" disabled={busy} onClick={onImportResume} type="button">Replace resume</Button>
              <Button variant="primary" size="compact" disabled={busy} onClick={onAnalyzeProfileFromResume} type="button">Analyze saved resume text</Button>
            </div>
          </div>
          <p className="text-[0.84rem] leading-6 text-foreground-muted">{profile.baseResume.textContent ? 'Stored resume text is ready for structured extraction, tailoring, and validation.' : 'PDF, DOCX, TXT, and Markdown resumes can be stored locally. If extraction misses content, paste clean text below so the agent can continue.'}</p>
          {profile.baseResume.lastAnalyzedAt && profile.baseResume.analysisProviderLabel ? <div className="rounded-[0.42rem] border border-border-subtle bg-white/2 p-4"><p className="text-[0.9rem] leading-6 text-foreground-soft">{formatResumeAnalysisSummary(profile)}</p></div> : null}
          {profile.baseResume.analysisWarnings.length > 0 ? <PreferenceList label="Review notes" values={profile.baseResume.analysisWarnings} /> : null}
        </section>

        <section className="rounded-[0.42rem] border border-border-subtle bg-[rgba(17,17,17,0.9)] p-6 grid content-start gap-[1.2rem]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="text-[0.68rem] uppercase tracking-[0.11em] text-foreground-muted">Structured coverage</p>
            <Badge variant="section">Plan-backed fields now live in code</Badge>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid content-start gap-4 rounded-[0.42rem] border border-dashed border-border-strong bg-white/2 p-4">
              <p className="text-[0.68rem] uppercase tracking-[0.11em] text-foreground-muted">Candidate record</p>
              <div className="grid gap-3 md:grid-cols-2">
                <div><span>Experience entries</span><strong>{profile.experiences.length}</strong></div>
                <div><span>Education entries</span><strong>{profile.education.length}</strong></div>
                <div><span>Projects</span><strong>{profile.projects.length}</strong></div>
                <div><span>Proof links</span><strong>{profile.links.length}</strong></div>
              </div>
            </div>
            <div className="grid content-start gap-4 rounded-[0.42rem] border border-dashed border-border-strong bg-white/2 p-4">
              <p className="text-[0.68rem] uppercase tracking-[0.11em] text-foreground-muted">Targeting rules</p>
              <div className="grid items-start gap-3 md:grid-cols-2">
                <PreferenceList label="Target roles" values={searchPreferences.targetRoles} />
                <PreferenceList label="Job families" values={searchPreferences.jobFamilies} />
                <PreferenceList label="Locations" values={searchPreferences.locations} />
                <PreferenceList label="Industries" values={searchPreferences.targetIndustries} />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
