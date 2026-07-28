import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});

const results = [];
for (const [label, viewport] of Object.entries({
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
})) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Code, talk and share files—directly with your peers." }).waitFor();
  const featureCount = await page.locator(".feature-grid article").count();
  const dimensions = await page.evaluate(() => ({
    width: globalThis.document.documentElement.clientWidth,
    scrollWidth: globalThis.document.documentElement.scrollWidth,
  }));
  if (featureCount !== 12) throw new Error(`${label} rendered ${featureCount} feature cards.`);
  if (dimensions.scrollWidth > dimensions.width) {
    throw new Error(`${label} landing page has horizontal overflow: ${JSON.stringify(dimensions)}`);
  }
  if (errors.length) throw new Error(`${label} landing errors: ${errors.join(" | ")}`);
  results.push({ label, featureCount, dimensions });
  await page.close();
}

const joinPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await joinPage.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
await joinPage.getByLabel("Invite link or room ID").fill("A1b2C3");
await joinPage.getByRole("button", { name: "Join room" }).click();
await joinPage.waitForURL(/\/A1b2C3$/, { timeout: 15_000 });
results.push({ label: "join", path: new globalThis.URL(joinPage.url()).pathname });
await joinPage.close();

const customPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await customPage.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
await customPage.getByLabel("Invite link or room ID").fill("ab");
await customPage.getByRole("button", { name: "Create using this custom ID" }).click();
await customPage.getByRole("alert").getByText(/3–64/).waitFor();
await customPage.getByLabel("Invite link or room ID").fill("my_team-room");
await customPage.getByRole("button", { name: "Create using this custom ID" }).click();
await customPage.waitForURL(/\/my_team-room$/, { timeout: 15_000 });
results.push({ label: "custom-room", path: new globalThis.URL(customPage.url()).pathname });
await customPage.close();

const createPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await createPage.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
await createPage.getByRole("button", { name: "Create a new room" }).click();
await createPage.waitForURL(/\/[A-Za-z0-9]{6}$/, { timeout: 15_000 });
const createdRoomId = new globalThis.URL(createPage.url()).pathname.slice(1);
const onboarding = createPage.getByLabel("Your display name");
if (await onboarding.isVisible()) {
  await onboarding.fill("Landing owner");
  await createPage.getByRole("button", { name: "Enter workspace" }).click();
}
await createPage.getByLabel("Collaborative code editor").waitFor({ timeout: 20_000 });
await createPage.locator(".share-button").click();
const inviteDialog = createPage.getByRole("dialog", { name: "Invite people" });
await inviteDialog.getByLabel("Password", { exact: true }).waitFor();
await inviteDialog.getByLabel("Confirm password").waitFor();
results.push({ label: "create", roomId: createdRoomId, invitePasswordFields: true });
await createPage.close();

const directPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await directPage.goto("http://127.0.0.1:5173/DirectRoom42", { waitUntil: "domcontentloaded" });
await directPage.getByText("Preparing your room…").or(directPage.getByLabel("Collaborative code editor")).first().waitFor();
if (await directPage.locator(".landing-page").count()) throw new Error("Direct room link opened the landing page.");
results.push({ label: "direct-room", bypassedLanding: true });
await directPage.close();

await browser.close();
globalThis.console.log(JSON.stringify(results, null, 2));
