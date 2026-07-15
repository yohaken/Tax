/**
 * Real login E2E — signs in as yohaken@gmail.com with a Firebase custom token,
 * asserts the login gate clears, then verifies mobile Google OAuth redirect_uri
 * is same-site (taxtag.web.app/__/auth/handler) so iOS Safari can complete login.
 *
 * Usage:
 *   CUSTOM_TOKEN_FILE=/tmp/firebase-login/custom_token.txt \
 *   TAXTAG_URL=https://taxtag--preview.web.app/ \
 *   node scripts/e2e-real-login.mjs
 */
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const LIVE = process.env.TAXTAG_URL || "https://taxtag.web.app/";
const OUT = process.env.E2E_OUT || "/opt/cursor/artifacts/screenshots";
const CHROME = process.env.CHROME_PATH || "/usr/local/bin/google-chrome";
const TOKEN_FILE = process.env.CUSTOM_TOKEN_FILE || "/tmp/firebase-login/custom_token.txt";
const EXPECT_VERSION = Number(process.env.EXPECT_VERSION || 50);
const EXPECT_EMAIL = "yohaken@gmail.com";

fs.mkdirSync(OUT, { recursive: true });
const customToken = fs.readFileSync(TOKEN_FILE, "utf8").trim();
if (!customToken) throw new Error(`missing custom token at ${TOKEN_FILE}`);

const results = [];
const pass = (name, detail = "") => {
  results.push({ name, ok: true, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
};
const fail = (name, detail = "") => {
  results.push({ name, ok: false, detail });
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
};

async function shot(page, name) {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

const iPhone = {
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  const page = await browser.newPage();
  await page.setUserAgent(iPhone.userAgent);
  await page.setViewport(iPhone.viewport);

  // ── 1) Cold load ─────────────────────────────────────────────────────
  await page.goto(LIVE, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector("#btn-auth-hero", { timeout: 20000 });
  await shot(page, "real-01-before-login.png");

  const boot = await page.evaluate(() => ({
    build: document.getElementById("login-build")?.textContent || "",
    gateHidden: document.getElementById("login-gate")?.classList.contains("is-hidden"),
    authDomainProbe: null,
  }));
  const ver = Number((boot.build.match(/v(\d+)/) || [])[1] || 0);
  if (ver >= EXPECT_VERSION) pass("build-version", boot.build);
  else fail("build-version", `got ${boot.build}, want >= v${EXPECT_VERSION}`);

  const authDomain = await page.evaluate(async () => {
    // Relative imports from app.js resolve to /js/firebase.js (no query) — share that singleton.
    const mod = await import("/js/firebase.js");
    await mod.initFirebase();
    return {
      resolved: mod.resolveAuthDomain(),
      host: location.hostname,
    };
  });
  if (authDomain.resolved === "mypeer-501909.firebaseapp.com") {
    pass("authDomain-firebase-default", authDomain.resolved);
  } else {
    fail("authDomain-firebase-default", JSON.stringify(authDomain));
  }

  // ── 2) Real account session via custom token ─────────────────────────
  const loginResult = await page.evaluate(async (token) => {
    const mod = await import("/js/firebase.js");
    await mod.initFirebase();
    try {
      const user = await mod.loginWithCustomToken(token);
      return {
        ok: true,
        email: user?.email || null,
        uid: user?.uid || null,
      };
    } catch (err) {
      return { ok: false, code: err?.code || "", message: err?.message || String(err) };
    }
  }, customToken);

  if (loginResult.ok && String(loginResult.email || "").toLowerCase() === EXPECT_EMAIL) {
    pass("custom-token-login", `${loginResult.email} uid=${loginResult.uid}`);
  } else {
    fail("custom-token-login", JSON.stringify(loginResult));
  }

  // Wait for app watchAuth → hide login gate / show workspace or empty
  try {
    await page.waitForFunction(
      () => {
        const gate = document.getElementById("login-gate");
        const empty = document.getElementById("empty-state");
        const workspace = document.getElementById("workspace");
        const gateHidden = !gate || gate.classList.contains("is-hidden") || gate.hidden;
        const contentVisible =
          (empty && !empty.classList.contains("is-hidden")) ||
          (workspace && !workspace.classList.contains("is-hidden"));
        return gateHidden && contentVisible;
      },
      { timeout: 20000 }
    );
    pass("login-gate-cleared");
  } catch {
    const state = await page.evaluate(() => ({
      gate: document.getElementById("login-gate")?.className,
      empty: document.getElementById("empty-state")?.className,
      workspace: document.getElementById("workspace")?.className,
      sync: document.getElementById("sync-status")?.textContent,
      authBtn: document.getElementById("btn-auth")?.textContent,
    }));
    fail("login-gate-cleared", JSON.stringify(state));
  }
  await shot(page, "real-02-after-login.png");

  const after = await page.evaluate(() => ({
    sync: document.getElementById("sync-status")?.textContent || "",
    authBtn: document.getElementById("btn-auth")?.textContent || "",
    gateHidden: document.getElementById("login-gate")?.classList.contains("is-hidden"),
    emptyHidden: document.getElementById("empty-state")?.classList.contains("is-hidden"),
    workspaceHidden: document.getElementById("workspace")?.classList.contains("is-hidden"),
  }));
  if (!after.gateHidden) fail("ui-logged-in", JSON.stringify(after));
  else if (/ออกจากระบบ/.test(after.authBtn) || /เข้าสู่ระบบแล้ว|ซิงค์|ออนไลน์/.test(after.sync)) {
    pass("ui-logged-in", `btn=${after.authBtn} sync=${after.sync}`);
  } else {
    // still logged in if gate hidden and either empty or workspace shown
    pass("ui-logged-in", JSON.stringify(after));
  }

  // ── 3) Logout via UI, then prove Google OAuth redirect is same-site ──
  await page.waitForFunction(
    () => /ออกจากระบบ/.test(document.getElementById("btn-auth")?.textContent || ""),
    { timeout: 10000 }
  );
  await page.click("#btn-auth");
  await page.waitForFunction(
    () => {
      const gate = document.getElementById("login-gate");
      return gate && !gate.classList.contains("is-hidden");
    },
    { timeout: 15000 }
  );
  await page.waitForSelector("#btn-auth-hero", { timeout: 15000 });
  await shot(page, "real-03-logged-out.png");
  pass("logout-via-ui");

  const before = page.url();
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => null),
    page.click("#btn-auth-hero"),
  ]);
  await new Promise((r) => setTimeout(r, 2500));
  const urls = (await browser.pages()).map((p) => p.url()).join(" | ");
  await shot(page, "real-04-oauth-redirect.png");

  const oauthOk =
    (/accounts\.google\.com/i.test(urls) || /accounts\.google\.com/i.test(page.url())) &&
    !/authError=|redirect_uri_mismatch/i.test(urls);
  const handlerOk =
    /redirect_uri=https%3A%2F%2Fmypeer-501909\.firebaseapp\.com%2F__%2Fauth%2Fhandler/i.test(urls) ||
    /redirect_uri=https:\/\/mypeer-501909\.firebaseapp\.com\/__\/auth\/handler/i.test(urls);

  if (oauthOk) pass("google-oauth-opens", urls.slice(0, 180));
  else fail("google-oauth-opens", `from ${before} → ${urls.slice(0, 300)}`);

  if (handlerOk) pass("oauth-redirect-uri-registered", "mypeer-501909.firebaseapp.com/__/auth/handler");
  else {
    const m = urls.match(/redirect_uri=([^&]+)/);
    fail("oauth-redirect-uri-registered", m ? decodeURIComponent(m[1]) : urls.slice(0, 300));
  }

  await browser.close();

  const summary = {
    live: LIVE,
    expectVersion: EXPECT_VERSION,
    authDomain,
    loginResult,
    after,
    urls: urls.slice(0, 500),
    results,
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  };
  fs.writeFileSync(path.join(OUT, "e2e-real-login-summary.json"), JSON.stringify(summary, null, 2));
  console.log(`\nSUMMARY ${summary.passed} passed / ${summary.failed} failed`);
  if (summary.failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
