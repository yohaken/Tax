/**
 * Production smoke test — Tax hub (mynote-tax + mynote-mytax).
 * Usage: node scripts/smoke-tax-hub.mjs
 *        EXPECT_VERSION=69 node scripts/smoke-tax-hub.mjs
 */
const TAXTAG = process.env.TAXTAG_URL || "https://mynote-tax.web.app/";
const MYTAX = process.env.MYTAX_URL || "https://mynote-mytax.web.app";
const EXPECT_VERSION = Number(process.env.EXPECT_VERSION || 69);

const results = [];
const pass = (name, detail = "") => {
  results.push({ name, ok: true, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
};
const fail = (name, detail = "") => {
  results.push({ name, ok: false, detail });
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
};

async function fetchText(url) {
  const res = await fetch(url, { redirect: "follow" });
  const text = await res.text();
  return { status: res.status, text, url: res.url };
}

async function main() {
  const build = await fetchText(`${TAXTAG.replace(/\/$/, "")}/js/build.js`);
  if (build.status !== 200) fail("taxtag-build-js", `HTTP ${build.status}`);
  else {
    const ver = Number((build.text.match(/version:\s*(\d+)/) || [])[1] || 0);
    if (ver >= EXPECT_VERSION) pass("taxtag-version", `v${ver} (>= v${EXPECT_VERSION})`);
    else fail("taxtag-version", `v${ver} < v${EXPECT_VERSION}`);
  }

  const home = await fetchText(TAXTAG);
  if (home.status !== 200) fail("taxtag-home", `HTTP ${home.status}`);
  else pass("taxtag-home", "200");

  if (home.text.includes('class="tax-hub-nav"')) pass("taxtag-bottom-nav");
  else fail("taxtag-bottom-nav", "missing tax-hub-nav");

  const navLinks = [
    'href="https://mynote-mytax.web.app/filings"',
    'href="https://mynote-mytax.web.app/calc"',
  ];
  for (const href of navLinks) {
    if (home.text.includes(href)) pass("taxtag-nav-link", href);
    else fail("taxtag-nav-link", `missing ${href}`);
  }

  if (home.text.includes('id="login-gate"')) {
    const gateMatch = home.text.match(/<section class="hero" id="login-gate">[\s\S]*?<\/section>/);
    const gateHtml = gateMatch?.[0] || "";
    if (gateHtml.includes("mynote-mytax.web.app")) {
      fail("no-duplicate-hero-links", "login-gate still links to my-tax");
    } else {
      pass("no-duplicate-hero-links");
    }
  } else {
    pass("no-duplicate-hero-links");
  }

  for (const path of ["/", "/filings", "/calc"]) {
    const r = await fetchText(`${MYTAX}${path}`);
    if (r.status === 200) pass("mytax-route", `${path} → 200`);
    else fail("mytax-route", `${path} → HTTP ${r.status}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
