/**
 * Production smoke test — single-domain Tax hub (mynote-tax.web.app).
 * Usage: node scripts/smoke-tax-hub.mjs
 *        EXPECT_VERSION=70 node scripts/smoke-tax-hub.mjs
 */
const HUB = process.env.TAXTAG_URL || "https://mynote-tax.web.app";
const LEGACY = process.env.LEGACY_MYTAX_URL || "https://mynote-mytax.web.app";
const EXPECT_VERSION = Number(process.env.EXPECT_VERSION || 70);

const results = [];
const pass = (name, detail = "") => {
  results.push({ name, ok: true, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
};
const fail = (name, detail = "") => {
  results.push({ name, ok: false, detail });
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
};

async function fetchRaw(url, { redirect = "follow" } = {}) {
  const res = await fetch(url, { redirect });
  const text = await res.text();
  return { status: res.status, text, url: res.url, redirected: res.redirected };
}

async function main() {
  const base = HUB.replace(/\/$/, "");

  const build = await fetchRaw(`${base}/js/build.js`);
  if (build.status !== 200) fail("taxtag-build-js", `HTTP ${build.status}`);
  else {
    const ver = Number((build.text.match(/version:\s*(\d+)/) || [])[1] || 0);
    if (ver >= EXPECT_VERSION) pass("taxtag-version", `v${ver} (>= v${EXPECT_VERSION})`);
    else fail("taxtag-version", `v${ver} < v${EXPECT_VERSION}`);
  }

  const home = await fetchRaw(`${base}/`);
  if (home.status !== 200) fail("taxtag-home", `HTTP ${home.status}`);
  else pass("taxtag-home", "200");

  if (home.text.includes('class="tax-hub-nav"')) pass("taxtag-bottom-nav");
  else fail("taxtag-bottom-nav", "missing tax-hub-nav");

  for (const href of ['href="/filings"', 'href="/calc"']) {
    if (home.text.includes(href)) pass("same-origin-nav", href);
    else fail("same-origin-nav", `missing ${href}`);
  }

  if (home.text.includes("mynote-mytax.web.app")) {
    fail("no-cross-domain-links", "HTML still references mynote-mytax.web.app");
  } else {
    pass("no-cross-domain-links");
  }

  for (const path of ["/filings", "/calc"]) {
    const r = await fetchRaw(`${base}${path}`);
    if (r.status === 200) pass("hub-route", `${path} → 200`);
    else fail("hub-route", `${path} → HTTP ${r.status}`);
  }

  const legacy = await fetchRaw(`${LEGACY}/filings`, { redirect: "manual" });
  if (legacy.status >= 301 && legacy.status <= 308) {
    pass("legacy-redirect", `${LEGACY}/filings → ${legacy.status}`);
  } else if (legacy.url.startsWith(base)) {
    pass("legacy-redirect", `follows to ${legacy.url}`);
  } else {
    fail("legacy-redirect", `HTTP ${legacy.status} (expected 301 to ${base})`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
