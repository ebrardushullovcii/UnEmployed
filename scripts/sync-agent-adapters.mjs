import { syncCompatibilityLinks, writeGeneratedAdapters } from './lib-agent-adapters.mjs'

await writeGeneratedAdapters()
await syncCompatibilityLinks()
console.log('Synced agent adapters.')
