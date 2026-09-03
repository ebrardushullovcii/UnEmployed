import { Controller, type UseFormReturn } from "react-hook-form";
import { Checkbox } from "@renderer/components/ui/checkbox";
import type { ProfileEditorValues } from "../../lib/profile-editor";
import { joinListInput, parseListInput } from "../../lib/job-finder-utils";

function linkDisplayName(
  link: ProfileEditorValues["links"][number],
  index: number,
): string {
  const label = link.label.trim();
  if (label) {
    return label;
  }

  return link.kind
    ? `${link.kind.charAt(0).toUpperCase()}${link.kind.slice(1)} link`
    : `Public link ${index + 1}`;
}

export function PreferredApplicationLinksField(props: {
  fieldId: string;
  profileForm: UseFormReturn<ProfileEditorValues>;
}) {
  const links = props.profileForm.watch("links");

  return (
    <Controller
      control={props.profileForm.control}
      name="applicationIdentity.preferredLinkIds"
      render={({ field }) => {
        const selectedIds = new Set(parseListInput(field.value));

        return (
          <fieldset
            className="grid min-w-0 gap-3 md:col-span-2"
            id={props.fieldId}
          >
            <legend className="text-sm font-medium text-foreground">
              Links to include on applications
            </legend>
            <p className="text-sm leading-6 text-foreground-soft">
              Choose from the public links saved in Background. The application
              will use the label and URL, never an internal ID.
            </p>
            {links.length > 0 ? (
              <div className="grid gap-2">
                {links.map((link, index) => {
                  const checkboxId = `${props.fieldId}-${link.id}`;
                  const checked = selectedIds.has(link.id);

                  return (
                    <label
                      className="flex cursor-pointer items-start gap-3 rounded-(--radius-field) border border-border/35 bg-background/55 p-3"
                      htmlFor={checkboxId}
                      key={link.id}
                    >
                      <Checkbox
                        checked={checked}
                        id={checkboxId}
                        onCheckedChange={(nextChecked) => {
                          const nextIds = new Set(selectedIds);
                          if (nextChecked === true) {
                            nextIds.add(link.id);
                          } else {
                            nextIds.delete(link.id);
                          }
                          field.onChange(joinListInput([...nextIds]));
                        }}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-foreground">
                          {linkDisplayName(link, index)}
                        </span>
                        <span className="block break-all text-sm leading-6 text-foreground-soft">
                          {link.url.trim() ||
                            "Add this link’s URL in Background before selecting it."}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-(--radius-field) border border-dashed border-border/45 p-3 text-sm leading-6 text-foreground-soft">
                No public links are saved yet. Add LinkedIn, a portfolio, or
                another profile in Background first.
              </p>
            )}
          </fieldset>
        );
      }}
    />
  );
}
