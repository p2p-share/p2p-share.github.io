import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";

const [indexHtml, fallbackHtml] = await Promise.all([
  readFile("dist/index.html", "utf8"),
  readFile("dist/404.html", "utf8"),
]);
if (indexHtml !== fallbackHtml) {
  throw new Error("The GitHub Pages 404 fallback does not match the production SPA entry.");
}
if (!indexHtml.includes('src="/assets/')) {
  throw new Error("Production assets are not root-relative for clean room paths.");
}

const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
await page.goto("http://127.0.0.1:4173/abc", { waitUntil: "domcontentloaded" });
await page.getByLabel("Your display name").or(page.getByLabel("Collaborative code editor")).first().waitFor({ timeout: 30_000 });
if (new URL(page.url()).pathname !== "/abc") throw new Error(`Clean room path changed unexpectedly: ${page.url()}`);
if (await page.locator(".landing-page").count()) throw new Error("A clean room path opened the landing page.");

await page.goto("http://127.0.0.1:4173/#room=Legacy42", { waitUntil: "domcontentloaded" });
await page.getByLabel("Your display name").or(page.getByLabel("Collaborative code editor")).first().waitFor({ timeout: 30_000 });
if (new URL(page.url()).pathname !== "/Legacy42") throw new Error(`Legacy room URL was not upgraded: ${page.url()}`);

await browser.close();
globalThis.console.log(JSON.stringify({
  cleanPath: "/abc",
  legacyUpgradedTo: "/Legacy42",
  fallbackMatchesIndex: true,
}, null, 2));
