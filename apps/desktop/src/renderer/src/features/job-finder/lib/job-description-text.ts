export function jobDescriptionToText(value: string | null | undefined): string {
  if (!value) {
    return ''
  }

  const parser = new DOMParser()
  const firstPass = parser.parseFromString(value, 'text/html').body.textContent ?? ''
  const trimmedFirstPass = firstPass.replace(/\s+/g, ' ').trim()

  // Some sources persist HTML as escaped text (&lt;div...&gt;). Parse once more
  // when the decoded text still looks like markup so the UI shows readable copy.
  if (/(?:&lt;[a-z]|&lt;|&gt;)/i.test(value)) {
    const normalizedMarkupPass = trimmedFirstPass.replace(/></g, '> <')

    return parser
      .parseFromString(normalizedMarkupPass, 'text/html')
      .body
      .textContent
      ?.replace(/\s+/g, ' ')
      .trim() ?? ''
  }

  return trimmedFirstPass
}
