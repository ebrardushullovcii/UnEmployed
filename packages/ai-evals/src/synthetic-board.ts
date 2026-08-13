function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

interface SyntheticJob {
  readonly id: string;
  readonly title: string;
  readonly company: string;
  readonly location: string;
  readonly description: string;
}

export function buildSyntheticBoardHtml(input: {
  readonly title: string;
  readonly summary: string;
  readonly jobCount: number;
  readonly fixtureKind: string;
  readonly url: string;
}): string {
  const currentUrl = new URL(input.url);
  const engineeringJobs: SyntheticJob[] = Array.from(
    { length: Math.max(1, input.jobCount) },
    (_, index) => ({
      id: String(index + 1),
      title: index % 2 === 0 ? "Frontend Engineer" : "Platform Engineer",
      company: `Example Labs ${index + 1}`,
      location: "Remote",
      description: "React, TypeScript, testing",
    }),
  );
  const renderCards = (jobs: readonly SyntheticJob[], tracking = false) =>
    jobs
      .map(
        (job, index) =>
          `<article data-job-card data-job-id="${escapeHtml(job.id)}" data-title="${escapeHtml(job.title.toLowerCase())}"><h2>${escapeHtml(job.title)}</h2><p data-company>${escapeHtml(job.company)}</p><p data-location>${escapeHtml(job.location)}</p><p>${escapeHtml(job.description)}</p><a href="https://jobs.example.com/jobs/${escapeHtml(job.id)}${tracking ? `?utm_source=${index % 2 === 0 ? "feed" : "newsletter"}` : ""}">View ${escapeHtml(job.title)}</a></article>`,
      )
      .join("");
  const renderStructuredJobs = (jobs: readonly SyntheticJob[]) =>
    `<script type="application/ld+json">${JSON.stringify(
      jobs.map((job) => ({
        "@context": "https://schema.org",
        "@type": "JobPosting",
        identifier: { value: job.id },
        title: job.title,
        description: job.description,
        hiringOrganization: {
          "@type": "Organization",
          name: job.company,
        },
        jobLocation: {
          "@type": "Place",
          addressLocality: job.location,
        },
        jobLocationType: "TELECOMMUTE",
        url: `https://jobs.example.com/jobs/${job.id}`,
      })),
    )}</script>`;
  const renderJobContext = () =>
    `<section><h2>About these roles</h2><p>Join a product engineering team building accessible customer workflows with React and TypeScript. Engineers collaborate with design, quality, and platform partners to ship reliable web experiences.</p><h3>Responsibilities</h3><p>Build and review production features, improve automated testing, investigate reliability issues, and document technical decisions for teammates.</p><h3>Qualifications</h3><p>Professional software development experience, clear written communication, and practical experience delivering tested applications in a collaborative environment.</p></section>`;
  const salesCard =
    '<article data-job-card data-title="sales manager"><h2>Sales Manager</h2><p>Example Sales</p><p>Onsite — Sales</p><a href="https://jobs.example.com/jobs/sales">View Sales Manager</a></article>';
  const styles = `<style>body{font-family:Arial,sans-serif;margin:0;color:#17202a}header,nav,form,main,footer{padding:18px 28px}header{background:#17324d;color:white}nav{display:flex;gap:22px;background:#eef3f7}form{display:flex;gap:12px}input,button{padding:10px;font-size:16px}main{display:grid;grid-template-columns:repeat(2,minmax(280px,1fr));gap:16px}article{border:1px solid #aeb9c4;padding:16px;border-radius:8px}article h2{margin-top:0}.banner{background:#fff0c7;padding:16px}.overlay{position:fixed;inset:0;background:#0008;display:flex;align-items:center;justify-content:center}.dialog{background:white;padding:30px;width:430px;border-radius:10px}.hidden{display:none}.pagination{grid-column:1/-1}</style>`;
  const shell = (body: string, controls = "") =>
    `<!doctype html><html><head><meta charset="utf-8"><title>Example Careers</title>${styles}</head><body><header><h1>Example Careers</h1><p>Public opportunities</p></header>${controls}<main id="results">${body}</main><footer>Public synthetic evaluation board.</footer></body></html>`;

  if (
    input.fixtureKind === "login_redirect" ||
    currentUrl.pathname === "/login"
  ) {
    return shell(
      "<section><h2>Sign in required</h2><p>You must authenticate before viewing listings.</p><label>Email <input></label><button>Sign in</button></section>",
    );
  }
  if (input.fixtureKind === "broken_route") {
    return shell(
      '<section><h2>Listings unavailable</h2><p>The jobs route returned a download-only response and no HTML listings.</p><a href="/downloads/jobs.csv">Download jobs.csv</a></section>',
    );
  }
  if (
    input.fixtureKind === "jobs_route" &&
    currentUrl.pathname !== "/careers/jobs"
  ) {
    return shell(
      '<section><h2>Careers</h2><p>Explore opportunities.</p><a href="/careers/jobs">View open jobs</a></section>',
    );
  }
  if (
    input.fixtureKind === "one_navigation" &&
    currentUrl.pathname !== "/jobs"
  ) {
    return shell(
      '<section><h2>Build with us</h2><p>Learn about our teams.</p><a href="/jobs">Open roles</a></section>',
    );
  }
  if (input.fixtureKind === "workday" || input.fixtureKind === "pagination") {
    const detailId = currentUrl.pathname.match(/^\/jobs\/(\d+)$/)?.[1];
    if (detailId) {
      const job =
        engineeringJobs.find((candidate) => candidate.id === detailId) ??
        engineeringJobs[0]!;
      return shell(
        `${renderCards([job])}${renderJobContext()}${renderStructuredJobs([job])}`,
      );
    }
    const page = currentUrl.searchParams.get("page") ?? "1";
    return page === "2"
      ? shell(
          `${renderCards(engineeringJobs)}${renderJobContext()}${renderStructuredJobs(engineeringJobs)}`,
        )
      : shell(
          `${salesCard}<a class="pagination" href="/jobs?page=2">Next page</a>`,
        );
  }
  if (input.fixtureKind === "multilingual_board") {
    return shell(
      renderCards([
        {
          id: "frontend-prishtina",
          title: "Zhvillues Frontend",
          company: "Studio Dardania",
          location: "Prishtinë / Remote",
          description: "React, TypeScript — 2 ditë",
        },
        {
          id: "platform-remote",
          title: "Inxhinier Platforme",
          company: "Kosova Cloud",
          location: "Remote",
          description: "Node.js, PostgreSQL — 6 ditë",
        },
      ]),
    );
  }
  if (
    input.fixtureKind === "route_drift" ||
    input.fixtureKind === "tracking_routes"
  ) {
    const twoJobs = engineeringJobs.slice(0, 2);
    return shell(`${renderCards(twoJobs, true)}${renderCards(twoJobs, true)}`);
  }
  if (input.fixtureKind === "infinite_scroll") {
    const firstBatch = engineeringJobs.slice(0, 2);
    const secondBatch = engineeringJobs.slice(2);
    return `${shell(renderCards(firstBatch))}<script>let appended=false;addEventListener('scroll',()=>{if(appended)return;appended=true;document.querySelector('#results').insertAdjacentHTML('beforeend',${JSON.stringify(renderCards(secondBatch))});});</script>`;
  }

  const searchBehavior =
    input.fixtureKind === "fake_filters"
      ? "document.querySelector('#status').textContent='Search submitted; results unchanged';"
      : "const q=document.querySelector('#query').value.toLowerCase();document.querySelectorAll('[data-job-card]').forEach(card=>card.classList.toggle('hidden',!card.dataset.title.includes(q)));history.pushState({},'',`/jobs?query=${encodeURIComponent(q)}`);document.querySelector('#status').textContent='Results updated';";
  const controls = `<nav><a href="/jobs">Open roles</a><a href="/login">Optional sign in</a></nav><form onsubmit="event.preventDefault();${searchBehavior}"><label>Search jobs <input id="query" name="query" placeholder="Search by role"></label><button type="submit">Search</button><output id="status"></output></form>`;
  const optionalBanner =
    input.fixtureKind === "guest_search" ||
    input.fixtureKind === "guest_surface"
      ? '<div class="banner" id="guest">You can browse as a guest. <a href="/login">Sign in</a> <button onclick="this.parentElement.remove()">Dismiss</button></div>'
      : "";
  const cookieOverlay =
    input.fixtureKind === "cookie_overlay"
      ? '<div class="overlay"><div class="dialog"><h2>Cookie preferences</h2><p>Choose optional cookies.</p><button onclick="this.closest(\'.overlay\').remove()">Reject all</button><button onclick="this.closest(\'.overlay\').remove()">Accept</button></div></div>'
      : "";
  return shell(
    `${renderCards(engineeringJobs)}${salesCard}${cookieOverlay}`,
    `${optionalBanner}${controls}`,
  );
}
