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
  if (label === "desktop") await page.locator(".share-button").click();
  else await page.getByLabel("Room actions").getByRole("button", { name: "Share", exact: true }).click();
  const inviteDialog = page.getByRole("dialog", { name: "Invite people" });
  await inviteDialog.waitFor();
  if (await inviteDialog.locator("textarea").count()) {
    throw new Error("Invite dialog exposes raw connection payloads before they are requested.");
  }
  await inviteDialog.getByRole("button", { name: "Create editable invite" }).click();
  await inviteDialog.getByLabel("One-time invite").waitFor({ timeout: 20_000 });
  if (await inviteDialog.locator(".signal-details textarea").count()) {
    throw new Error("Invite dialog exposes the full invite URL by default.");
  }
  await inviteDialog.getByRole("button", { name: "Show QR" }).click();
  await inviteDialog.getByRole("img", { name: "QR code for One-time invite" }).waitFor();
  await page.screenshot({ path: `dist/invite-flow-${label}.png`, fullPage: true });
  await inviteDialog.getByRole("button", { name: "Close" }).click();
  if (label === "desktop") {
    await page.getByRole("button", { name: "Open group chat" }).click();
    if (await page.locator(".app").getAttribute("data-active-panel") !== "chat") {
      throw new Error("Desktop chat did not become the sole active workspace panel.");
    }
    await page.getByRole("button", { name: "Open version logs" }).click();
    if (await page.locator(".app").getAttribute("data-active-panel") !== "activity") {
      throw new Error("Desktop activity did not replace the previously open panel.");
    }
    await page.getByRole("button", { name: "Open version logs" }).click();
  } else {
    const mobileNav = page.getByLabel("Room actions");
    await mobileNav.getByRole("button", { name: "Project" }).click();
    await mobileNav.getByRole("button", { name: "Chat" }).click();
    if (await page.locator(".app").getAttribute("data-active-panel") !== "chat") {
      throw new Error("Mobile chat did not replace the project sheet.");
    }
    const chatBox = await page.getByRole("complementary", { name: "Group chat" }).boundingBox();
    if (!chatBox || chatBox.height > viewport.height * 0.72 || chatBox.y < viewport.height * 0.2) {
      throw new Error(`Mobile feature sheet covers too much editor space: ${JSON.stringify(chatBox)}`);
    }
    await mobileNav.getByRole("button", { name: "Chat" }).click();
  }
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
  await workbench.getByRole("button", { name: "Close workbench" }).click();
  if (label === "desktop") {
    const millionLines = globalThis.Buffer.from("x\n".repeat(1_000_000));
    await page.locator('input[type="file"][hidden]').first().setInputFiles({
      name: "million-lines.txt",
      mimeType: "text/plain",
      buffer: millionLines,
    });
    await page.getByText("1000001 lines", { exact: true }).waitFor({ timeout: 60_000 });
  }
  if (label === "desktop") await page.getByRole("button", { name: "Open direct file sharing" }).click();
  else await page.getByLabel("Room actions").getByRole("button", { name: "Files", exact: true }).click();
  const sharedFiles = page.getByRole("complementary", { name: "Shared files" });
  await sharedFiles.waitFor();
  await sharedFiles.locator('input[type="file"]').setInputFiles({
    name: "hello.txt",
    mimeType: "text/plain",
    buffer: globalThis.Buffer.from("Hello from p2p"),
  });
  await sharedFiles.getByText("hello.txt", { exact: true }).waitFor();
  await sharedFiles.getByRole("button", { name: "Preview hello.txt" }).click();
  await page.getByRole("dialog").getByText("Hello from p2p", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Close", exact: true }).click();
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
