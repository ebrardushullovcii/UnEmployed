import type { NormalizedCompensation } from '@unemployed/contracts'

export function formatNormalizedCompensation(
  compensation: NormalizedCompensation | null | undefined,
): string | null {
  if (!compensation) {
    return null
  }

  const currencyPrefix = compensation.currency ? `${compensation.currency} ` : ''
  const interval = compensation.interval ? ` / ${compensation.interval}` : ''
  const minAmount = compensation.minAmount !== null ? `${currencyPrefix}${compensation.minAmount.toLocaleString()}` : null
  const maxAmount = compensation.maxAmount !== null ? `${currencyPrefix}${compensation.maxAmount.toLocaleString()}` : null
  const directRange = [minAmount, maxAmount].filter(Boolean).join(' – ')

  if (directRange) {
    return `${directRange}${interval}`
  }

  const annualizedRange = [compensation.minAnnualUsd, compensation.maxAnnualUsd]
    .filter((value): value is number => value !== null)
    .map((value) => `USD ${value.toLocaleString()}`)
    .join(' – ')

  return annualizedRange ? `${annualizedRange} annualized` : null
}
