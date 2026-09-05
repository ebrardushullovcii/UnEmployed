import { Plus } from "lucide-react";
import { Button } from "@renderer/components/ui/button";

/**
 * Skills the tailored draft dropped for space used to render as one grey
 * paragraph — "Skills not shown: Azure, Docker, Kubernetes, …" — roughly six
 * thousand pixels below the editor, with nothing to click, while the bottom
 * quarter of the exported page was blank. Each dropped skill is an
 * already-saved candidate fact, so putting it back is a one-click decision the
 * user should be able to make beside the skills editor it belongs to.
 */
export function ResumeMissingSkillChips(props: {
  disabled: boolean;
  onAddSkill: (skill: string) => void;
  skills: readonly string[];
}) {
  if (props.skills.length === 0) {
    return null;
  }

  return (
    <div
      className="grid min-w-0 gap-2 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/40 px-3 py-2.5"
      data-resume-missing-skill-chips
    >
      <div className="grid gap-0.5">
        <p className="text-(length:--text-small) font-semibold leading-5 text-(--text-headline)">
          {props.skills.length}{" "}
          {props.skills.length === 1 ? "skill is" : "skills are"} not on the
          page
        </p>
        <p className="text-(length:--text-tiny) leading-4 text-foreground-soft">
          These come from your saved profile. Add the ones this job asks for.
        </p>
      </div>
      <ul className="flex min-w-0 flex-wrap gap-1.5">
        {props.skills.map((skill) => (
          <li className="min-w-0" key={skill}>
            <Button
              aria-label={`Add ${skill} to this section`}
              className="max-w-full whitespace-normal text-left"
              data-resume-missing-skill-chip={skill}
              disabled={props.disabled}
              onClick={() => props.onAddSkill(skill)}
              size="compact"
              type="button"
              variant="secondary"
            >
              <Plus aria-hidden="true" className="size-3.5 shrink-0" />
              {skill}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
