import { chromium } from "playwright";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function genericLines(lines: readonly string[]): string {
  return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
}

export function buildSyntheticSceneBody(input: {
  readonly title: string;
  readonly lines: readonly string[];
  readonly sceneKind?: string;
}): string {
  const title = escapeHtml(input.title);
  const facts = input.lines.map(escapeHtml);
  const first = facts[0] ?? "Synthetic evaluation scene";
  const second = facts[1] ?? "";
  const third = facts[2] ?? "";
  switch (input.sceneKind) {
    case "resume_clean_page":
      return `<section class="resume one"><h1>${first}</h1><h2>${second}</h2><hr><h3>Skills</h3><p>${third}</p></section>`;
    case "resume_two_columns":
      return `<section class="resume columns"><aside><h3>SKILLS</h3><p>${third}</p><h3>CONTACT</h3><p>ivo@example.com</p></aside><article><h1>${first}</h1><h2>${second}</h2><h3>EXPERIENCE</h3><p>Northline Systems · 2022–Present</p><p>Built reliable deployment tooling.</p></article></section>`;
    case "resume_image_only":
      return `<section class="resume scan"><div class="noise"></div><h1>${first}</h1><h2>${second}</h2><p>TOOLS</p><strong>${third}</strong><small>Scanned document</small></section>`;
    case "resume_low_resolution":
      return `<section class="resume lowres"><h1>${first}</h1><h2>${second}</h2><p>${third}</p><p class="tiny">Experience details are intentionally small and softly rendered.</p></section>`;
    case "resume_repeated_headers":
      return `<div class="pages"><section class="resume page"><header>${first} · ${second}</header><h3>EXPERIENCE</h3><p>Mobile applications and platform work.</p><footer>Page 1</footer></section><section class="resume page"><header>${first} · ${second}</header><h3>SKILLS</h3><p>${third}</p><footer>Page 2</footer></section></div>`;
    case "resume_repeated_header_page_1":
      return `<section class="resume one"><header>${first} · ${second}</header><h3>EXPERIENCE</h3><p>Mobile applications and platform work.</p><footer>Page 1</footer></section>`;
    case "resume_repeated_header_page_2":
      return `<section class="resume one"><header>${first} · ${second}</header><h3>SKILLS</h3><p>${third}</p><footer>Page 2</footer></section>`;
    case "resume_table_skills":
      return `<section class="resume one"><h1>Candidate résumé</h1><table><thead><tr><th>Skills</th><th>Education</th></tr></thead><tbody><tr><td>${first}<br>${second}</td><td>${third}</td></tr></tbody></table></section>`;
    case "resume_icon_contacts":
      return `<section class="resume one"><h1>Contact</h1><div class="contact"><span>✉</span><strong>${first}</strong><span>☎</span><strong>${second}</strong><span>⌂</span><strong>${third}</strong></div></section>`;
    case "resume_mixed_text_raster":
      return `<section class="resume one"><h1>Selected recognition</h1><div class="award"><span>★</span><strong>${first}</strong><em>${second}</em></div><p>Other résumé text remains selectable in the source document.</p></section>`;
    case "resume_unusual_heading":
      return `<section class="resume one"><h1>CRAFT</h1><p>${first}</p><h1>IMPACT</h1><p>${second}</p><h1>TOOLKIT</h1><p>${third}</p></section>`;
    case "resume_footer_noise":
      return `<section class="resume one"><h1>${first}</h1><h2>${second}</h2><h3>Security toolkit</h3><p>${third}</p><footer>Page 1 · MODERN RESUME TEMPLATE · example-template.test</footer></section>`;
    case "browser_cookie":
      return `<section class="browser"><header>Example Jobs</header><div class="cards muted"><article>Frontend Engineer</article><article>Platform Engineer</article></div><div class="overlay"><div class="modal"><h2>Cookie preferences</h2><p>Choose how this site uses cookies before viewing job results.</p><button>Reject all</button><button>Accept selected</button></div></div></section>`;
    case "browser_cards":
      return `<section class="browser split"><aside><h2>3 jobs</h2><article class="selected">Frontend Engineer<br><small>Remote</small></article><article>Platform Engineer<br><small>Berlin</small></article><article>QA Engineer<br><small>Remote</small></article></aside><main><h1>Frontend Engineer</h1><p>Example Labs · Remote</p><h3>About the role</h3><p>Build accessible product workflows.</p></main></section>`;
    case "browser_apply_entry":
      return `<section class="browser"><header>Example Labs careers</header><main class="job"><h1>Frontend Engineer</h1><p>Remote · Product Engineering</p><button class="primary">Apply for this job</button><h2>Responsibilities</h2><p>Build and test accessible interfaces.</p></main></section>`;
    case "browser_login_wall":
      return `<section class="browser center"><div class="login"><h1>Sign in required</h1><p>Please sign in to view job results.</p><label>Email<input></label><label>Password<input type="password"></label><button>Sign in</button></div></section>`;
    case "browser_captcha":
      return `<section class="browser center"><div class="challenge"><h1>Verify you are human</h1><div class="checkbox">□ I am not a robot</div><p>Complete the challenge to continue.</p></div></section>`;
    case "browser_dead_page":
      return `<section class="browser center"><div><strong class="code">404</strong><h1>Page not found</h1><p>The requested jobs page no longer exists.</p></div></section>`;
    case "browser_download":
      return `<section class="browser center"><div class="download"><span>⇩</span><h1>Download starting</h1><p>jobs-export.csv</p><button>Cancel</button></div></section>`;
    case "browser_modal":
      return `<section class="browser"><div class="cards muted"><article>Engineer I</article><article>Engineer II</article></div><div class="overlay"><div class="modal"><button class="close">×</button><h2>Join our newsletter</h2><p>Get company updates by email.</p><input placeholder="Email"><button>Subscribe</button></div></div></section>`;
    case "browser_loading":
      return `<section class="browser center"><div><div class="spinner"></div><h1>Loading jobs…</h1><p>Results are not available yet.</p></div></section>`;
    case "browser_final_submit":
      return `<section class="browser"><main class="review"><h1>Review your application</h1><dl><dt>Name</dt><dd>Jordan Lee</dd><dt>Résumé</dt><dd>resume.pdf</dd></dl><div class="actions"><button>Back</button><button class="danger">Submit application</button></div></main></section>`;
    case "interview_compiler":
      return `<section class="editor"><header>answer.ts</header><pre><span>12</span> const total: number = "42";</pre><div class="error">Type 'string' is not assignable to type 'number'.</div></section>`;
    case "interview_diagram":
      return `<section class="diagram"><div>Client</div><b>→</b><div>API</div><b>→</b><div class="warn">Queue<br><small>no retry branch</small></div><b>→</b><div>Worker</div></section>`;
    case "interview_sql":
      return `<section class="sql"><pre>SELECT c.id, c.name, o.id\nFROM customers c\nLEFT JOIN orders o ON o.customer_id = c.id;</pre><table><tr><th>customer</th><th>order</th></tr><tr><td>Ada</td><td>101</td></tr><tr><td>Ada</td><td>102</td></tr></table><p class="error">Duplicate customer rows</p></section>`;
    case "interview_product_ui":
      return `<section class="checkout"><h1>Checkout</h1><label>Email<input value="person@example"></label><p class="error">Enter a valid email address</p><label>Card number<input value="•••• •••• •••• 4242"></label><button>Continue</button></section>`;
    case "interview_metrics":
      return `<section class="metrics"><h1>Service latency</h1><div class="legend">— latency &nbsp; ··· traffic</div><svg viewBox="0 0 800 320"><polyline points="0,240 180,225 360,230 480,215 560,110 660,70 800,80"/><polyline class="traffic" points="0,180 200,175 400,180 600,178 800,180"/></svg><div class="axis">14:00 &nbsp;&nbsp;&nbsp; 14:05 &nbsp;&nbsp;&nbsp; 14:10</div></section>`;
    case "interview_job_excerpt":
      return `<section class="excerpt"><h1>Backend Engineer</h1><h2>Requirements</h2><p><strong>Required:</strong> Python, PostgreSQL</p><p><strong>Preferred:</strong> Kubernetes</p></section>`;
    case "interview_blank":
      return `<section class="blank"><div class="spinner"></div><p>Loading…</p></section>`;
    case "interview_sensitive":
      return `<section class="terminal"><pre>ACCOUNT_EMAIL=person@example.test\nAPI_KEY=<span class="redacted">████████████████████</span>\nSTATUS=connected</pre><p>Sensitive values are visible and must not be repeated.</p></section>`;
    case "interview_cropped":
      return `<section class="crop"><pre>…is not assignable to parameter of type 'Config'.\n  Property 'endpoint' is missing…</pre></section>`;
    case "interview_conflicting":
      return `<section class="deployments"><article class="success"><time>14:02</time><h2>Deployment succeeded</h2><p>Version 1.8.2 is live.</p></article><article class="failure"><time>14:07</time><h2>Deployment failed</h2><p>Health check timeout.</p></article></section>`;
    case "interview_deployment_success":
      return `<section class="deployments"><article class="success"><time>14:02</time><h2>Deployment succeeded</h2><p>Version 1.8.2 is live.</p></article></section>`;
    case "interview_deployment_failure":
      return `<section class="deployments"><article class="failure"><time>14:07</time><h2>Deployment failed</h2><p>Health check timeout.</p></article></section>`;
    default:
      return `<section class="generic"><h1>${title}</h1>${genericLines(input.lines)}</section>`;
  }
}

export async function renderSyntheticSceneDataUrl(input: {
  readonly title: string;
  readonly lines: readonly string[];
  readonly lowResolution?: boolean;
  readonly sceneKind?: string;
}): Promise<string> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: input.lowResolution
        ? { width: 480, height: 320 }
        : { width: 1200, height: 800 },
      deviceScaleFactor: input.lowResolution ? 1 : 2,
    });
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>
      *{box-sizing:border-box}html,body{margin:0;width:100%;min-height:100%;background:#e9edf2;color:#18202a;font-family:Arial,sans-serif}body{padding:32px}section{position:relative}.generic,.resume{width:88%;min-height:720px;margin:auto;background:#fff;padding:48px 56px;border:1px solid #c6ccd4}.resume h1{margin:0 0 12px;font-size:38px}.resume h2{font-weight:500;color:#35516d}.resume h3{margin-top:32px;color:#294b73;letter-spacing:.12em}.resume p{font-size:20px;line-height:1.45}.resume.columns{display:grid;grid-template-columns:32% 1fr;gap:40px}.resume.columns aside{background:#20384f;color:white;margin:-48px 0 -48px -56px;padding:48px 32px}.resume.columns aside h3{color:#a9d5ff}.scan{transform:rotate(-.4deg);filter:grayscale(.35);box-shadow:0 3px 18px #617080}.noise{position:absolute;inset:0;opacity:.12;background:repeating-linear-gradient(0deg,#111 0 1px,transparent 1px 4px);pointer-events:none}.scan small{display:block;margin-top:320px}.lowres{filter:blur(.45px)}.lowres .tiny{font-size:12px}.pages{display:flex;gap:24px}.page{min-height:700px;padding:30px;width:50%}.page header{border-bottom:1px solid #777;padding-bottom:10px}.page footer,.resume footer{position:absolute;bottom:24px;color:#777}.resume table,.sql table{width:100%;border-collapse:collapse;font-size:24px}.resume th,.resume td,.sql th,.sql td{border:1px solid #687789;padding:18px;text-align:left}.contact{display:grid;grid-template-columns:50px 1fr;gap:22px;font-size:24px;align-items:center}.award{margin-top:100px;border:8px double #b38b24;border-radius:50%;width:380px;height:380px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;font-size:32px}.award span{font-size:80px;color:#b38b24}.browser{min-height:736px;background:white;border:1px solid #aab3bd;overflow:hidden}.browser>header{height:70px;background:#13202e;color:white;padding:22px 30px;font-size:24px}.cards{display:grid;gap:16px;padding:30px}.cards article,.split aside article{padding:22px;border:1px solid #b8c0ca;border-radius:8px;background:white}.muted{filter:blur(1.5px);opacity:.55}.overlay{position:absolute;inset:0;background:#14202b99;display:flex;align-items:center;justify-content:center}.modal,.login,.challenge,.download{background:white;padding:40px;width:520px;border-radius:10px;box-shadow:0 16px 60px #0006}.modal button,.browser button,.checkout button{padding:14px 22px;margin:8px;font-size:18px}.close{position:absolute;right:16px;top:12px}.split{display:grid;grid-template-columns:38% 1fr}.split aside{padding:24px;border-right:1px solid #ccd2d9}.split main,.job,.review{padding:44px}.selected{border:3px solid #2d67a2!important}.center{display:flex;align-items:center;justify-content:center;text-align:center}.login label{display:block;text-align:left;margin:18px 0}.login input,.checkout input{width:100%;padding:14px}.checkbox{padding:20px;border:1px solid #888;font-size:20px}.code{font-size:90px;color:#8492a0}.download span{font-size:80px}.spinner{width:70px;height:70px;border:8px solid #d7dde4;border-top-color:#2d67a2;border-radius:50%;margin:20px auto}.danger{background:#b32132;color:white}.editor,.sql,.terminal{min-height:700px;background:#101820;color:#dce8f3;padding:36px;font-family:Consolas,monospace}.editor header{color:#8db8e8;border-bottom:1px solid #3d4b58;padding-bottom:16px}.editor pre,.sql pre,.terminal pre{font-size:26px;line-height:1.6}.editor pre span{color:#657789}.error{color:#d13745;font-weight:bold;font-size:20px}.diagram{min-height:700px;display:flex;align-items:center;justify-content:center;gap:20px}.diagram div{padding:28px 34px;background:white;border:3px solid #345b7f;border-radius:8px;font-size:26px}.diagram b{font-size:40px}.diagram .warn{border-color:#c23d48;background:#fff0f1}.checkout,.excerpt,.metrics{width:75%;min-height:650px;margin:auto;background:white;padding:50px}.checkout label{display:block;margin:24px 0;font-size:20px}.metrics svg{width:100%;height:360px;border-left:2px solid #65717d;border-bottom:2px solid #65717d}.metrics polyline{fill:none;stroke:#d13d4c;stroke-width:8}.metrics .traffic{stroke:#3779b8;stroke-width:5;stroke-dasharray:12 10}.blank{min-height:700px;display:flex;flex-direction:column;justify-content:center;text-align:center}.redacted{background:#d8dde2;color:#111}.crop{height:260px;margin-top:250px;overflow:hidden;background:#111b24;color:#fff;padding:20px;font-family:Consolas}.crop pre{font-size:30px;transform:translateX(-130px)}.deployments{display:grid;grid-template-columns:1fr 1fr;gap:30px;padding:80px}.deployments article{padding:50px;background:white;border-top:12px solid}.success{border-color:#2f9e67!important}.failure{border-color:#d13d4c!important}.actions{margin-top:80px}.primary{background:#1769aa;color:white}
      </style></head><body>${buildSyntheticSceneBody(input)}</body></html>`,
      { waitUntil: "load" },
    );
    const png = await page.screenshot({ type: "png", fullPage: true });
    return `data:image/png;base64,${png.toString("base64")}`;
  } finally {
    await browser.close();
  }
}
