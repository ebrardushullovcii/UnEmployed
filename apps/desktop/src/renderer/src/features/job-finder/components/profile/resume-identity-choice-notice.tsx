import type { CandidateProfile } from "@unemployed/contracts";
import {
  describeResumeIdentityOwnershipChoice,
  resolveResumeIdentity,
} from "@unemployed/job-finder/resume-identity";
import { Button } from "@renderer/components/ui/button";

export function ResumeIdentityChoiceNotice(props: {
  profile: CandidateProfile;
  onKeepResumeName: () => void;
  onUseProfileName: () => void;
}) {
  const resolution = resolveResumeIdentity(props.profile);
  if (resolution.mismatchReasons.length === 0) {
    return null;
  }

  const choice = describeResumeIdentityOwnershipChoice(props.profile);
  const sourceName = choice.sourceFullName ?? "the imported resume";
  const profileName = choice.profileFullName ?? "your profile";

  return (
    <div
      className="grid min-w-0 gap-3 rounded-(--radius-field) border border-(--warning-border) bg-(--warning-surface) px-4 py-3"
      data-testid="resume-identity-choice"
      role="alert"
    >
      <p className="text-(length:--text-small) leading-6 text-(--warning-text)">
        Preparation is paused because the imported resume says “{sourceName}”
        while your profile says “{profileName}”; choose which name belongs on
        this resume before preparing jobs.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={props.onUseProfileName}
          size="compact"
          type="button"
          variant="primary"
        >
          Use my profile name for this resume
        </Button>
        <Button
          onClick={props.onKeepResumeName}
          size="compact"
          type="button"
          variant="outline"
        >
          Keep the resume&apos;s name
        </Button>
      </div>
    </div>
  );
}
