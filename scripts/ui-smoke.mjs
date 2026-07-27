import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});

async function exercise(viewport, label) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });
  const onboarding = page.getByLabel("Your display name");
  if (await onboarding.isVisible()) {
    await onboarding.fill(`Smoke ${label}`);
    await page.getByRole("button", { name: "Enter workspace" }).click();
  }
  await page.getByLabel("Collaborative code editor").waitFor();
  await page.keyboard.press("Control+Shift+P");
  await page.getByRole("dialog", { name: "Command palette" }).waitFor();
  await page.getByPlaceholder("Type a command…").fill("Analyze active");
  await page.getByRole("button", { name: /Analyze active file/ }).click();
  await page.getByRole("complementary", { name: "Developer workbench" }).waitFor();
  const workbench = page.getByRole("complementary", { name: "Developer workbench" });
  await workbench.locator(".workbench-tabs").getByRole("button", { name: "preview" }).click();
  await page.getByTitle("Sandboxed local project preview").waitFor();
  await page.frameLocator('iframe[title="Sandboxed local project preview"]').getByRole("heading", { name: "Local preview" }).waitFor();
  const previewFrame = page.getByTitle("Sandboxed local project preview");
  const sandbox = await previewFrame.getAttribute("sandbox");
  if (sandbox !== "allow-scripts") throw new Error(`${label} preview sandbox is unexpectedly permissive: ${sandbox}`);
  const previewPolicy = await page.frameLocator('iframe[title="Sandboxed local project preview"]')
    .locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  if (!previewPolicy?.includes("connect-src 'none'") || !previewPolicy.includes("form-action 'none'")) {
    throw new Error(`${label} preview CSP is incomplete.`);
  }
  const dimensions = await page.evaluate(() => ({
    width: globalThis.innerWidth,
    scrollWidth: globalThis.document.documentElement.scrollWidth,
  }));
  await page.screenshot({ path: `dist/ui-smoke-${label}.png`, fullPage: true });
  await context.close();
  return { label, errors, dimensions };
}

const results = [
  await exercise({ width: 1440, height: 900 }, "desktop"),
  await exercise({ width: 390, height: 844 }, "mobile"),
];
await browser.close();

for (const result of results) {
  if (result.errors.length) throw new Error(`${result.label} browser errors:\n${result.errors.join("\n")}`);
  if (result.dimensions.scrollWidth > result.dimensions.width) {
    throw new Error(`${result.label} has horizontal overflow: ${JSON.stringify(result.dimensions)}`);
  }
}
globalThis.console.log(JSON.stringify(results, null, 2));
