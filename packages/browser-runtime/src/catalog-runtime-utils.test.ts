import { describe, expect, test } from 'vitest'
import { matchesAnyPhrase, normalizeText, parseSalaryFloor } from './catalog-runtime-utils'

describe('catalog runtime utils', () => {
  test('normalizes diacritics consistently', () => {
    expect(normalizeText('São Paulo')).toBe('sao paulo')
    expect(normalizeText('Sao Paulo')).toBe('sao paulo')
  })

  test('ignores implausible small non-salary numbers when parsing salary floors', () => {
    expect(parseSalaryFloor('100% employer match and salary range 120k - 140k')).toBe(120000)
    expect(parseSalaryFloor('Compensation: 95k/yr plus bonus')).toBe(95000)
    expect(parseSalaryFloor('Base salary 120000/year')).toBe(120000)
    expect(parseSalaryFloor('Base salary 120k + 20k bonus')).toBe(120000)
    expect(parseSalaryFloor('Comp plan has a 50/50 split and 120k base')).toBe(120000)
    expect(parseSalaryFloor('Remote 24/7 support with compensation of 95000 USD')).toBe(95000)
    expect(parseSalaryFloor('Compensation: 1.2M total target cash')).toBe(1200000)
    expect(parseSalaryFloor('Compensation: 80-100k')).toBe(80000)
    expect(parseSalaryFloor('Compensation: 1-1.2M total target cash')).toBe(1000000)
    expect(parseSalaryFloor('Compensation: 60/hr')).toBe(124800)
    expect(parseSalaryFloor('Compensation: 5-7k/mo')).toBe(60000)
  })

  test('matches whole tokens instead of raw substrings', () => {
    expect(matchesAnyPhrase('Senior Java Engineer', ['java'])).toBe(true)
    expect(matchesAnyPhrase('Senior JavaScript Engineer', ['java'])).toBe(false)
    expect(matchesAnyPhrase('New York City', ['new york'])).toBe(true)
  })
})
