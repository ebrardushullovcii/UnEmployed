import { Input } from '@renderer/components/ui/input'
import { Textarea } from '@renderer/components/ui/textarea'
import { cn } from '@renderer/lib/cn'

export const profileInputClassName =
  'h-11 rounded-[var(--radius-field)] border border-[var(--field-border)] bg-[var(--field)] px-[0.82rem] py-0 text-[var(--text-field)] leading-none tracking-normal text-foreground placeholder:text-muted-foreground focus-visible:border-[rgba(235,233,225,0.35)] focus-visible:bg-[var(--field-strong)]'

export const profileTextareaClassName =
  'rounded-[var(--radius-field)] border border-[var(--field-border)] bg-[var(--field)] px-[0.82rem] py-[0.72rem] text-[var(--text-field)] leading-[1.45] tracking-normal text-foreground placeholder:text-muted-foreground focus-visible:border-[rgba(235,233,225,0.35)] focus-visible:bg-[var(--field-strong)]'

export const profileTextareaCompactClassName = `${profileTextareaClassName} min-h-[var(--textarea-compact)] max-h-[var(--textarea-compact)]`

export const profileTextareaDefaultClassName = `${profileTextareaClassName} min-h-[var(--textarea-default)] max-h-[var(--textarea-default)]`

export const profileTextareaTallClassName = `${profileTextareaClassName} min-h-[var(--textarea-tall)] max-h-[var(--textarea-tall)]`

export const profileSelectTriggerClassName =
  '!h-11 rounded-[var(--radius-field)] border border-[var(--field-border)] bg-[var(--field)] px-[0.82rem] py-0 text-[var(--text-field)] normal-case leading-none tracking-normal text-foreground data-[placeholder]:text-muted-foreground focus-visible:border-[rgba(235,233,225,0.35)] focus-visible:bg-[var(--field-strong)]'

export function ProfileInput(props: React.ComponentProps<typeof Input>) {
  const { className, ...rest } = props
  return <Input className={cn(profileInputClassName, className)} {...rest} />
}

export function ProfileTextarea(props: React.ComponentProps<typeof Textarea>) {
  const { className, ...rest } = props
  return <Textarea className={cn(profileTextareaDefaultClassName, className)} {...rest} />
}
