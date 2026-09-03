import { useId } from "react";
import { Checkbox } from "@renderer/components/ui/checkbox";
import { cn } from "@renderer/lib/utils";

interface CheckboxFieldProps {
  checked: boolean;
  className?: string;
  inputId?: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}

export function CheckboxField({
  checked,
  className,
  inputId,
  label,
  onCheckedChange,
}: CheckboxFieldProps) {
  // The control Radix renders is a `button[role="checkbox"]`, not a form input,
  // so a wrapping `<label>` alone does not reliably name it: assistive
  // technology and `getByRole("checkbox", { name })` both saw an unnamed
  // control with the visible text sitting beside it as a separate node. The
  // visible text is therefore the control's own explicit accessible name.
  const generatedLabelId = useId();
  const labelId = `${inputId ?? generatedLabelId}-checkbox-field-label`;

  return (
    <label
      htmlFor={inputId}
      className={cn(
        "surface-card-tint flex min-h-11 items-center gap-3 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-3 text-(length:--text-field) normal-case tracking-normal text-foreground-soft",
        className,
      )}
    >
      <Checkbox
        aria-labelledby={labelId}
        id={inputId}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <span id={labelId}>{label}</span>
    </label>
  );
}
