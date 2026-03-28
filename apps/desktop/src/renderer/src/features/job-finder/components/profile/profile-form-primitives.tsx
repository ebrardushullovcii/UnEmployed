import { Input } from '@renderer/components/ui/input'
import { Textarea } from '@renderer/components/ui/textarea'
import { cn } from '@renderer/lib/cn'

export const profileInputClassName =
  'h-11 rounded-(--radius-field) border border-(--field-border) bg-(--field) px-[0.82rem] py-0 text-(length:--text-field) leading-none tracking-normal text-foreground placeholder:text-muted-foreground focus-visible:border-[rgba(235,233,225,0.35)] focus-visible:bg-(--field-strong)'

export const profileTextareaClassName =
  'rounded-(--radius-field) border border-(--field-border) bg-(--field) px-[0.82rem] py-[0.72rem] text-(length:--text-field) leading-[1.45] tracking-normal text-foreground placeholder:text-muted-foreground focus-visible:border-[rgba(235,233,225,0.35)] focus-visible:bg-(--field-strong)'

export const profileTextareaCompactClassName = `${profileTextareaClassName} min-h-(--textarea-compact) max-h-(--textarea-compact)`

export const profileTextareaDefaultClassName = `${profileTextareaClassName} min-h-(--textarea-default) max-h-(--textarea-default)`

export const profileTextareaTallClassName = `${profileTextareaClassName} min-h-(--textarea-tall) max-h-(--textarea-tall)`

export const profileSelectTriggerClassName =
  'h-11! rounded-(--radius-field) border border-(--field-border) bg-(--field) px-[0.82rem] py-0 text-(length:--text-field) normal-case leading-none tracking-normal text-foreground data-[placeholder]:text-muted-foreground focus-visible:border-[rgba(235,233,225,0.35)] focus-visible:bg-(--field-strong)'

export function ProfileInput(props: React.ComponentProps<typeof Input>) {
  const { className, ...rest } = props
  return <Input className={cn(profileInputClassName, className)} {...rest} />
}

export function ProfileTextarea(props: React.ComponentProps<typeof Textarea>) {
  const { className, ...rest } = props
  return <Textarea className={cn(profileTextareaDefaultClassName, className)} {...rest} />
}
