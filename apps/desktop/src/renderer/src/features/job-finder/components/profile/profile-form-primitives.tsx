import { Input } from "@renderer/components/ui/input";
import { Textarea } from "@renderer/components/ui/textarea";
import { cn } from "@renderer/lib/cn";

export const profileInputClassName =
  "h-11 rounded-(--radius-field) border border-(--field-border) bg-(--field) px-[0.82rem] py-0 text-(length:--text-field) leading-none tracking-normal text-foreground placeholder:text-muted-foreground focus-visible:border-(--field-focus-border) focus-visible:bg-(--field-strong) focus-visible:shadow-[var(--field-focus-shadow)]";

export const profileTextareaClassName =
  "rounded-(--radius-field) border border-(--field-border) bg-(--field) px-[0.82rem] py-[0.72rem] text-(length:--text-field) leading-[1.45] tracking-normal text-foreground placeholder:text-muted-foreground focus-visible:border-(--field-focus-border) focus-visible:bg-(--field-strong) focus-visible:shadow-[var(--field-focus-shadow)]";

export const profileTextareaCompactClassName = `${profileTextareaClassName} min-h-(--textarea-compact) max-h-(--textarea-compact)`;

export const profileTextareaDefaultClassName = `${profileTextareaClassName} min-h-(--textarea-default) max-h-(--textarea-default)`;

export const profileTextareaTallClassName = `${profileTextareaClassName} min-h-(--textarea-tall) max-h-(--textarea-tall)`;

/**
 * Starts at the control's own `rows` and grows with its content instead of
 * reserving a fixed block. Long optional prose fields otherwise render as a
 * wall of identical empty boxes before the user has typed anything.
 */
export const profileTextareaAutoGrowClassName = `${profileTextareaClassName} [field-sizing:content]`;

export const profileSelectTriggerClassName =
  "h-11! rounded-(--radius-field) border border-(--field-border) bg-(--field) px-[0.82rem] py-0 text-(length:--text-field) normal-case leading-none tracking-normal text-foreground data-[placeholder]:text-muted-foreground focus-visible:border-(--field-focus-border) focus-visible:bg-(--field-strong) focus-visible:shadow-[var(--field-focus-shadow)]";

export function ProfileInput(props: React.ComponentProps<typeof Input>) {
  const { className, ...rest } = props;
  return <Input className={cn(profileInputClassName, className)} {...rest} />;
}

export function ProfileTextarea(props: React.ComponentProps<typeof Textarea>) {
  const { className, ...rest } = props;
  return (
    <Textarea
      className={cn(profileTextareaDefaultClassName, className)}
      {...rest}
    />
  );
}

export function ProfileAutoGrowTextarea(
  props: React.ComponentProps<typeof Textarea>,
) {
  const { className, ...rest } = props;
  return (
    <Textarea
      className={cn(profileTextareaAutoGrowClassName, className)}
      {...rest}
    />
  );
}

/**
 * One-line explanation under a field. Used where several fields could be
 * confused for each other, so each one says where its value is actually used.
 */
export function ProfileFieldHint(props: {
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <p
      className="text-(length:--text-description) leading-5 text-foreground-muted"
      {...(props.id ? { id: props.id } : {})}
    >
      {props.children}
    </p>
  );
}
