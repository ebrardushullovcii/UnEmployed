export function jobDescriptionToText(value: string | null | undefined): string {
  if (!value) {
    return ''
  }

  return new DOMParser()
    .parseFromString(value, 'text/html')
    .body
    .textContent
    ?.replace(/\s+/g, ' ')
    .trim() ?? ''
}
