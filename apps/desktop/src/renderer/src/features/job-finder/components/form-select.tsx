import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'

interface FormSelectProps {
  onValueChange: (value: string) => void
  options: ReadonlyArray<{ label: string; value: string }>
  placeholder?: string
  value: string
}

const EMPTY_VALUE = '__empty__'

export function FormSelect({ onValueChange, options, placeholder, value }: FormSelectProps) {
  return (
    <Select onValueChange={(nextValue) => onValueChange(nextValue === EMPTY_VALUE ? '' : nextValue)} value={value || EMPTY_VALUE}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value || EMPTY_VALUE} value={option.value || EMPTY_VALUE}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
