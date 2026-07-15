/** Mobile login must open Google OAuth without redirect_uri_mismatch (popup path). */
import puppeteer from "puppeteer-core";

const LIVE = process.env.TAXTAG_URL || "https://taxtag.web.app/";
const EXPECT_VERSION = Number(process.env.EXPECT_VERSION || 52);
const CHROME = process.env.CHROME_PATH || "/usr/local/bin/google-chrome";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
await page.setUserAgent(
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
);
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await page.goto(LIVE, { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector("#btn-auth-hero", { timeout: 20000 });

const boot = await page.evaluate(() => document.getElementById("login-build")?.textContent || "");
const ver = Number((boot.match(/v(\d+)/) || [])[1] || 0);
if (ver < EXPECT_VERSION) {
  console.error("FAIL version", boot);
  process.exit(1);
}
console.log("PASS version", boot);

// Wait for Firebase init so loginWithGoogle does not await init before popup
await page.waitForFunction(() => /ตรวจสอบ|ต้องเข้า|พร้อม|ล็อกอิน/i.test(document.getElementById("sync-status")?.textContent || ""), {
  timeout: 15000,
});
await new Promise((r) => setTimeout(r, 1500));

await page.click("#btn-auth-hero");
await new Promise((r) => setTimeout(r, 4000));
const urls = (await browser.pages()).map((p) => p.url());
console.log("pages", urls.map((u) => u.slice(0, 180)));

const joined = urls.join("\n");
const mismatch = /redirect_uri_mismatch|authError=/i.test(joined);
const google = /accounts\.google\.com/i.test(joined);
const handler = /mypeer-501909\.firebaseapp\.com%2F__%2Fauth%2Fhandler|mypeer-501909\.firebaseapp\.com\/__\/auth\/handler/i.test(joined);

if (!google) {
  console.error("FAIL did not open Google");
  process.exit(1);
}
if (mismatch) {
  console.error("FAIL redirect_uri_mismatch");
  process.exit(1);
}
if (!handler) {
  console.error("FAIL expected firebaseapp.com /__/auth/handler in OAuth URL");
  process.exit(1);
}
console.log("PASS mobile popup oauth opens Google with registered handler");
await browser.close();
