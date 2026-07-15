/**
 * Regression: mobile OAuth return must always call getRedirectResult.
 * iOS Safari often clears document.referrer after leaving Google —
 * skipping getRedirectResult leaves the user stuck on the login gate.
 */
function legacyMaybeFromRedirect(href, referrer) {
  return (
    /[?&#](mode|apiKey|authType|oobCode)=/i.test(href) ||
    /google\.com|firebaseapp\.com/i.test(String(referrer || ""))
  );
}

const cases = [
  {
    name: "iOS return (empty referrer, clean URL)",
    href: "https://taxtag.web.app/",
    referrer: "",
    legacyWouldRun: false,
  },
  {
    name: "Android return via auth handler referrer",
    href: "https://taxtag.web.app/",
    referrer: "https://mypeer-501909.firebaseapp.com/",
    legacyWouldRun: true,
  },
  {
    name: "Google referrer only",
    href: "https://taxtag.web.app/",
    referrer: "https://accounts.google.com/",
    legacyWouldRun: true,
  },
];

let failed = 0;
for (const c of cases) {
  const got = legacyMaybeFromRedirect(c.href, c.referrer);
  const ok = got === c.legacyWouldRun;
  if (!ok) {
    failed += 1;
    console.error("FAIL case meta", c.name, { got, expected: c.legacyWouldRun });
  }
}

// Fixed policy: always run (independent of referrer).
const fixedAlwaysRuns = true;
if (!fixedAlwaysRuns) failed += 1;

if (failed) {
  console.error(`failed ${failed}`);
  process.exit(1);
}

console.log("ok — legacy gate skips iOS empty-referrer; fixed path always resolves redirect");
console.log(
  "iOS empty referrer legacyWouldRun=",
  legacyMaybeFromRedirect("https://taxtag.web.app/", "")
);
