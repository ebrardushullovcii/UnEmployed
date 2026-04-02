import { describe, expect, test } from 'vitest'
import {
  parseInteractiveElementsFromAriaSnapshot,
  prioritizeInteractiveElements,
  type InteractiveElementCandidate
} from './tools'

describe('interactive element helpers', () => {
  test('parses interactive elements from aria snapshots', () => {
    const snapshot = [
      '- navigation "Primary nav" [ref=e1]',
      '- button "Show all" [ref=e12]',
      '- searchbox "Search by title, skill, or company" [ref=e18]',
      '- link "Home" [ref=e2]'
    ].join('\n')

    expect(parseInteractiveElementsFromAriaSnapshot(snapshot)).toEqual([
      { role: 'button', name: 'Show all' },
      { role: 'searchbox', name: 'Search by title, skill, or company' },
      { role: 'link', name: 'Home' }
    ])
  })

  test('prioritizes search, filters, and show-all controls above navigation noise', () => {
    const candidates: InteractiveElementCandidate[] = [
      { role: 'link', name: 'Home' },
      { role: 'navigation', name: 'Jobs' },
      { role: 'link', name: 'Messaging' },
      { role: 'link', name: 'Notifications' },
      { role: 'button', name: 'Show all' },
      { role: 'searchbox', name: 'Search by title, skill, or company' },
      { role: 'button', name: 'Location filter' },
      { role: 'button', name: 'Industry filter' },
      { role: 'link', name: 'Software Engineer' },
      { role: 'button', name: 'Show all' }
    ]

    const prioritized = prioritizeInteractiveElements(candidates, 6)

    expect(prioritized.slice(0, 5)).toEqual(
      expect.arrayContaining([
        { role: 'button', name: 'Show all', index: 0 },
        { role: 'button', name: 'Show all', index: 1 },
        { role: 'searchbox', name: 'Search by title, skill, or company', index: 0 },
        { role: 'button', name: 'Location filter', index: 0 },
        { role: 'button', name: 'Industry filter', index: 0 }
      ])
    )
    expect(prioritized.some((candidate) => candidate.name === 'Home')).toBe(false)
    expect(prioritized.some((candidate) => candidate.role === 'navigation')).toBe(false)
  })
})
