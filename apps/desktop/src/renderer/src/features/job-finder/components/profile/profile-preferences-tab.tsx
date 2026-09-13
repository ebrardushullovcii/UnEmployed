import type { ResumeApplicationMode } from "@unemployed/contracts";
import type { UseFieldArrayReturn, UseFormReturn } from "react-hook-form";
import type {
  ProfileEditorValues,
  SearchPreferencesEditorValues,
} from "../../lib/profile-editor";
import { ProfilePreferencesEligibilitySection } from "./profile-preferences-eligibility-section";
import { ProfilePreferencesTargetingSection } from "./profile-preferences-sections";
import type { ProfileFieldArrayKeyName } from "./profile-field-array-types";

interface ProfilePreferencesTabProps {
  busy: boolean;
  customAnswerArray: UseFieldArrayReturn<
    ProfileEditorValues,
    "answerBank.customAnswers",
    ProfileFieldArrayKeyName
  >;
  preferencesForm: UseFormReturn<SearchPreferencesEditorValues>;
  profileForm: UseFormReturn<ProfileEditorValues>;
  resumeApplicationMode?: ResumeApplicationMode;
  onSelectResumeApplicationMode?: (mode: ResumeApplicationMode) => void;
}

export function ProfilePreferencesTab({
  busy,
  customAnswerArray,
  preferencesForm,
  profileForm,
  resumeApplicationMode,
  onSelectResumeApplicationMode,
}: ProfilePreferencesTabProps) {
  return (
    <div className="grid gap-6">
      <ProfilePreferencesEligibilitySection
        busy={busy}
        customAnswerArray={customAnswerArray}
        profileForm={profileForm}
      />
      <ProfilePreferencesTargetingSection
        preferencesForm={preferencesForm}
        {...(resumeApplicationMode ? { resumeApplicationMode } : {})}
        {...(onSelectResumeApplicationMode
          ? { onSelectResumeApplicationMode }
          : {})}
      />
    </div>
  );
}
