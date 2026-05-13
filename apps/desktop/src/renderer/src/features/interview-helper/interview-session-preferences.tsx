import type {
  InterviewWorkspaceSnapshot,
  SaveInterviewSetupInput,
} from "@unemployed/contracts";
import { Camera, Languages, SlidersHorizontal } from "lucide-react";

const transcriptionLanguages = [
  { value: "en-US", label: "English US" },
  { value: "en-GB", label: "English UK" },
  { value: "es-ES", label: "Spanish" },
  { value: "fr-FR", label: "French" },
  { value: "de-DE", label: "German" },
  { value: "tr-TR", label: "Turkish" },
] as const;

const cueSensitivityOptions = [
  { value: "conservative", label: "Conservative" },
  { value: "balanced", label: "Balanced" },
  { value: "manual_only", label: "Manual only" },
] as const;

export function InterviewSessionPreferences(props: {
  workspace: InterviewWorkspaceSnapshot;
  pending: boolean;
  onSave: (input: SaveInterviewSetupInput) => void;
}) {
  const setup = props.workspace.setup;

  return (
    <div className="grid gap-3 rounded-(--radius-small) border border-border-subtle bg-black/20 p-3">
      <div className="grid gap-2">
        <label
          className="flex items-center gap-2 text-[0.72rem] font-bold uppercase tracking-(--tracking-badge) text-muted-foreground"
          htmlFor="interview-transcription-language"
        >
          <Languages className="size-3.5" />
          Transcript language
        </label>
        <select
          className="h-9 rounded-(--radius-small) border border-border-subtle bg-black/30 px-2 text-[0.78rem] text-foreground"
          disabled={props.pending}
          id="interview-transcription-language"
          onChange={(event) => {
            props.onSave({ transcriptionLanguage: event.target.value });
          }}
          value={setup.transcriptionLanguage}
        >
          {transcriptionLanguages.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-2">
        <label
          className="flex items-center gap-2 text-[0.72rem] font-bold uppercase tracking-(--tracking-badge) text-muted-foreground"
          htmlFor="interview-cue-sensitivity"
        >
          <SlidersHorizontal className="size-3.5" />
          Cue sensitivity
        </label>
        <select
          className="h-9 rounded-(--radius-small) border border-border-subtle bg-black/30 px-2 text-[0.78rem] text-foreground"
          disabled={props.pending}
          id="interview-cue-sensitivity"
          onChange={(event) => {
            props.onSave({
              cueSensitivity:
                event.target.value as SaveInterviewSetupInput["cueSensitivity"],
            });
          }}
          value={setup.cueSensitivity}
        >
          {cueSensitivityOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-start gap-3 border-t border-border-subtle pt-3 text-[0.82rem]">
        <input
          checked={setup.autoCaptureOnCue}
          className="mt-1 size-4 accent-(--info-text)"
          disabled={props.pending}
          onChange={(event) => {
            props.onSave({ autoCaptureOnCue: event.target.checked });
          }}
          type="checkbox"
        />
        <span className="grid gap-1">
          <span className="flex items-center gap-2">
            <Camera className="size-3.5 text-(--info-text)" />
            Auto screenshot on cue
          </span>
          <span className="text-[0.72rem] leading-5 text-muted-foreground">
            {setup.autoCaptureOnCue
              ? "Automatic cues include a temporary visual batch."
              : "Manual screenshot hotkeys control visual context."}
          </span>
        </span>
      </label>
    </div>
  );
}
