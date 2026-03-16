import { useEffect, useState } from 'react'
import { applicationStatusValues, suiteModules } from '@unemployed/contracts'

export function App() {
  const [platform, setPlatform] = useState('loading')

  useEffect(() => {
    void window.unemployed.ping().then((response) => {
      setPlatform(response.platform)
    })
  }, [])

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Agent-first desktop suite</p>
        <h1>UnEmployed</h1>
        <p className="lede">
          One Electron shell for job discovery, application workflows, interview prep,
          live assistance, and shared context.
        </p>
        <div className="meta-row">
          <span>Platform: {platform}</span>
          <span>Statuses: {applicationStatusValues.length}</span>
          <span>Modules: {suiteModules.join(' · ')}</span>
        </div>
      </section>

      <section className="grid">
        <article className="card">
          <h2>Job Finder</h2>
          <p>
            Profile import, browser runtime, draft generation, batch review, and the
            application table start here.
          </p>
        </article>
        <article className="card">
          <h2>Interview Helper</h2>
          <p>
            Prep workspaces, transcript-aware suggestions, overlay cues, and session
            history will plug into this shell next.
          </p>
        </article>
        <article className="card">
          <h2>Repo Contract</h2>
          <p>
            Canonical docs, package guides, and generated agent adapters are already
            wired so the next agent can keep moving without starting cold.
          </p>
        </article>
      </section>
    </main>
  )
}

