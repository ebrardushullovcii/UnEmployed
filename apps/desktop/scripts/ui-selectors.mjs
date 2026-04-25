export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function formatVisibleRunId(runId) {
  return runId.length <= 8 ? runId : runId.slice(-8)
}

export async function selectApplicationRecord(window, title, company) {
  const recordButton = window.getByRole('button', {
    name: new RegExp(
      `^${escapeRegExp(title)}(?!\\w)\\s+${escapeRegExp(company)}(?!\\w)$`,
      'i',
    ),
  }).first()
  await recordButton.waitFor({ timeout: 10000 })
  await recordButton.click()
}
