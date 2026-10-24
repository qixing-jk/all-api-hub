import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import {
  WEB_AI_API_CHECK_RULE_LIST,
  WEB_AI_API_CHECK_RULE_SYNTAX,
  WEB_AI_API_CHECK_SITE_ACCESS_MODE,
} from "~/services/verification/webAiApiCheck/siteRuleConstants"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  seedUserPreferences,
} from "~~/e2e/utils/commonUserFlows"
import {
  getPlasmoStorageRawValue,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { captureVisualViews } from "~~/e2e/utils/visualCapture"

test("web API detection settings overview", async ({
  context,
  page,
  extensionId,
  extensionDir,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await forceExtensionLanguage(page, "zh-CN")
  await seedUserPreferences(await getServiceWorker(context), {
    webAiApiCheck: {
      autoDetect: {
        enabled: true,
        siteAccess: {
          mode: WEB_AI_API_CHECK_SITE_ACCESS_MODE.ALL,
          include: [],
          exclude: ["private.example.com"],
        },
      },
    },
  })
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}?tab=webAiApiCheck#basic`,
  )
  const section = page.locator("#web-ai-api-check")
  await expect(
    section.getByRole("switch", { name: "启用自动检测", exact: true }),
  ).toBeVisible()
  await expect(section.locator('[data-slot="card"]')).toHaveCount(1)
  await expect(section.locator("details")).toHaveCount(0)
  await expect(
    section.getByRole("switch", { name: "启用增强自动检测", exact: true }),
  ).toBeVisible()
  await expect(
    section.locator("#web-ai-api-check-key-cleanup-patterns"),
  ).toBeVisible()
  await expect(section.getByText("已保存", { exact: true })).toHaveCount(0)
  const websiteRules = section.getByRole("region", {
    name: "网站黑白名单",
    exact: true,
  })
  await expect(
    websiteRules.getByRole("heading", { name: "网站黑白名单", exact: true }),
  ).toBeVisible()
  await expect(
    websiteRules.getByText(
      "设置哪些网站可以出现自动检测提示，不影响手动测试。",
      { exact: true },
    ),
  ).toBeVisible()
  await expect(
    websiteRules.getByRole("group", {
      name: "同时命中时，谁优先？",
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    websiteRules.getByText("private.example.com", { exact: true }),
  ).toBeVisible()
  await expect(
    websiteRules.getByRole("button", { name: "展开全部", exact: true }),
  ).toHaveCount(0)
  const whitelistHeader = page.locator("#web-ai-api-check-included-sites")
  await expect(async () => {
    const title = (await whitelistHeader
      .getByRole("heading", { name: "白名单", exact: true })
      .boundingBox())!
    const description = (await whitelistHeader
      .getByText("允许在匹配的网页中提示。", { exact: true })
      .boundingBox())!
    expect(
      Math.abs(
        title.y + title.height / 2 - description.y - description.height / 2,
      ),
    ).toBeLessThan(2)
  }).toPass()
  await captureVisualViews({
    page,
    ready: section,
    id: "site-rules-overview",
    extensionDir,
  })
  if (process.env.AAH_VISUAL_CAPTURE_DIR) {
    await section.screenshot({
      path: `${process.env.AAH_VISUAL_CAPTURE_DIR}/site-rules-full-panel.png`,
      animations: "disabled",
    })
  }
})

test("edits site rules through a secondary dialog using real browser tab choices", async ({
  context,
  page,
  extensionId,
  extensionDir,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await forceExtensionLanguage(page, "en")
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, {
    language: "en",
    webAiApiCheck: {
      autoDetect: {
        enabled: true,
        siteRules: null,
        siteAccess: {
          mode: WEB_AI_API_CHECK_SITE_ACCESS_MODE.ALL,
          include: [],
          exclude: [],
        },
      },
    },
  })
  await context.route("https://docs.example.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<title>Docs example tab</title><h1>API documentation</h1>",
    }),
  )
  const docs = await context.newPage()
  await docs.goto("https://docs.example.test/guide/42?lang=en")
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}?tab=webAiApiCheck#basic`,
  )
  const section = page.locator("#web-ai-api-check")
  await expect(
    section.getByRole("button", { name: "Add to whitelist", exact: true }),
  ).toBeVisible()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  const readRules = async () =>
    JSON.parse(
      await getPlasmoStorageRawValue<string>(
        worker,
        STORAGE_KEYS.USER_PREFERENCES,
      ),
    ).webAiApiCheck.autoDetect.siteRules
  await section
    .getByRole("button", { name: "Add to whitelist", exact: true })
    .click()
  const editor = page.getByRole("dialog", {
    name: "Add to whitelist",
    exact: true,
  })
  const picker = editor.getByRole("combobox", {
    name: "Choose from open tabs",
    exact: true,
  })
  await picker.fill("Docs example")
  await page
    .getByRole("option", {
      name: "Docs example tab — https://docs.example.test",
      exact: true,
    })
    .click()
  const content = editor.getByRole("textbox", {
    name: "Rule content",
    exact: true,
  })
  await expect(content).toHaveValue("*://docs.example.test/*")
  expect(await readRules()).toBeNull()
  await captureVisualViews({
    page,
    ready: editor,
    id: "site-rules-dialog",
    extensionDir,
  })
  await editor
    .getByRole("button", { name: "This page only", exact: true })
    .click()
  await expect(content).toHaveValue(
    "https://docs.example.test/guide/42?lang=en",
  )
  await editor.getByRole("button", { name: "Add", exact: true }).click()
  await expect(editor).toHaveCount(0)
  await expect
    .poll(async () => (await readRules()).whitelist)
    .toEqual([
      {
        syntax: "exact",
        pattern: "https://docs.example.test/guide/42?lang=en",
      },
    ])
  await section
    .getByRole("button", { name: "Add to blacklist", exact: true })
    .click()
  const blacklistEditor = page.getByRole("dialog", {
    name: "Add to blacklist",
    exact: true,
  })
  await blacklistEditor
    .getByRole("textbox", { name: "Rule content", exact: true })
    .fill("docs.example.test\ndocs.example.test")
  await blacklistEditor
    .getByRole("button", { name: "Add", exact: true })
    .click()
  await expect
    .poll(async () => (await readRules()).blacklist)
    .toEqual([{ syntax: "wildcard", pattern: "*://docs.example.test/*" }])
  await section.getByText("Try a URL", { exact: true }).click()
  await section
    .getByRole("textbox", { name: "Try a URL", exact: true })
    .fill("https://docs.example.test/guide/42?lang=en")
  await expect(
    section.getByRole("status").filter({
      hasText: "No prompts · Matches both lists; blacklist takes priority",
    }),
  ).toBeVisible()
  await section
    .getByRole("button", { name: "Whitelist first", exact: true })
    .click()
  await expect(
    section.getByRole("status").filter({
      hasText: "Prompts allowed · Matches both lists; whitelist takes priority",
    }),
  ).toBeVisible()
  await expect.poll(async () => (await readRules()).priority).toBe("whitelist")
  await section
    .getByRole("button", { name: "Add to blacklist", exact: true })
    .click()
  await blacklistEditor
    .getByRole("textbox", { name: "Rule content", exact: true })
    .fill("unsaved.example.org")
  await page.keyboard.press("Escape")
  await expect(blacklistEditor).toHaveCount(0)
  await expect(
    section.getByRole("button", { name: "Add to blacklist", exact: true }),
  ).toBeFocused()
  await section
    .getByRole("button", { name: "Add to blacklist", exact: true })
    .click()
  await expect(
    blacklistEditor.getByRole("textbox", { name: "Rule content", exact: true }),
  ).toHaveValue("unsaved.example.org")
  await blacklistEditor
    .getByRole("button", { name: "Cancel", exact: true })
    .click()
  await page.reload()
  await expect(
    section.getByText("https://docs.example.test/guide/42?lang=en", {
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    section.getByRole("button", { name: "Whitelist first", exact: true }),
  ).toHaveAttribute("aria-pressed", "true")
  await captureVisualViews({
    page,
    ready: section,
    id: "site-rules-saved",
    extensionDir,
  })
})

test("site rule editor remains usable on a narrow dark settings page", async ({
  context,
  page,
  extensionId,
  extensionDir,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await forceExtensionLanguage(page, "en")
  await seedUserPreferences(await getServiceWorker(context), {
    language: "en",
    themeMode: "dark",
    webAiApiCheck: {
      autoDetect: {
        enabled: true,
        siteRules: null,
        siteAccess: {
          mode: WEB_AI_API_CHECK_SITE_ACCESS_MODE.ALL,
          include: [],
          exclude: [],
        },
      },
    },
  })
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}?tab=webAiApiCheck#basic`,
  )
  await page
    .getByRole("button", { name: "Add to blacklist", exact: true })
    .click()
  const dialog = page.getByRole("dialog", {
    name: "Add to blacklist",
    exact: true,
  })
  await expect(
    dialog.getByRole("heading", { name: "Add to blacklist", exact: true }),
  ).toBeVisible()
  await dialog
    .getByRole("textbox", { name: "Rule content", exact: true })
    .fill("https://docs.example.org/guide/42")
  await expect(
    dialog.getByRole("button", { name: "Add", exact: true }),
  ).toBeInViewport()
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true)
  await expect(page.locator("html")).toHaveClass(/dark/)
  await captureVisualViews({
    page,
    ready: dialog,
    id: "site-rules-mobile-dialog",
    extensionDir,
  })
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(dialog).toHaveCount(0)
})

test("adds multiple tab sites with independent row configuration and compact inline actions", async ({
  context,
  page,
  extensionId,
  extensionDir,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await forceExtensionLanguage(page, "en")
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, {
    language: "en",
    webAiApiCheck: {
      autoDetect: {
        enabled: true,
        siteRules: {
          priority: WEB_AI_API_CHECK_RULE_LIST.BLACKLIST,
          whitelist: [],
          blacklist: [],
        },
      },
    },
  })
  for (const [host, title] of [
    ["one.example.test", "First site"],
    ["two.example.test", "Second site"],
  ]) {
    await context.route(`https://${host}/**`, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<title>${title}</title>`,
      }),
    )
    const tab = await context.newPage()
    await tab.goto(
      `https://${host}/docs/a-very-long-path-that-should-shrink-before-the-row-actions?lang=en`,
    )
  }
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}?tab=webAiApiCheck#basic`,
  )
  const section = page.locator("#web-ai-api-check")
  await section
    .getByRole("button", { name: "Add to whitelist", exact: true })
    .click()
  const dialog = page.getByRole("dialog", {
    name: "Add to whitelist",
    exact: true,
  })
  const picker = dialog.getByRole("combobox", {
    name: "Choose from open tabs",
    exact: true,
  })
  await picker.fill("First site")
  await page
    .getByRole("option", {
      name: "First site — https://one.example.test",
      exact: true,
    })
    .click()
  await dialog
    .getByRole("button", { name: "This page only", exact: true })
    .click()
  await picker.fill("Second site")
  await page
    .getByRole("option", {
      name: "Second site — https://two.example.test",
      exact: true,
    })
    .click()
  const rows = dialog.getByRole("group", { name: "Rule content", exact: true })
  await expect(rows).toHaveCount(2)
  await expect(
    rows.nth(0).getByRole("combobox", { name: "Rule syntax", exact: true }),
  ).toContainText("Exact URL")
  await expect(
    rows.nth(1).getByRole("textbox", { name: "Rule content", exact: true }),
  ).toHaveValue("*://two.example.test/*")
  await captureVisualViews({
    page,
    ready: dialog,
    id: "site-rules-multirow-dialog",
    extensionDir,
  })
  await dialog.getByRole("button", { name: "Add", exact: true }).click()
  const readRules = async () =>
    JSON.parse(
      await getPlasmoStorageRawValue<string>(
        worker,
        STORAGE_KEYS.USER_PREFERENCES,
      ),
    ).webAiApiCheck.autoDetect.siteRules
  await expect
    .poll(async () => (await readRules()).whitelist)
    .toEqual([
      {
        syntax: "exact",
        pattern:
          "https://one.example.test/docs/a-very-long-path-that-should-shrink-before-the-row-actions?lang=en",
      },
      { syntax: "wildcard", pattern: "*://two.example.test/*" },
    ])
  await expect(
    section.getByRole("status").filter({ hasText: "Saved" }),
  ).toHaveCount(0)
  await section.getByText("Try a URL", { exact: true }).click()
  await section
    .getByRole("textbox", { name: "Try a URL", exact: true })
    .fill(
      "https://one.example.test/docs/a-very-long-path-that-should-shrink-before-the-row-actions?lang=en",
    )
  await expect(section.getByRole("status")).toHaveText(
    "Prompts allowed · Matches the whitelist",
  )
  const entry = section.locator("li").filter({ hasText: "one.example.test" })
  const url = entry.locator("code")
  const edit = entry.getByRole("button", { name: "Edit", exact: true })
  const remove = entry.getByRole("button", { name: "Remove", exact: true })
  await expect(edit).toBeVisible()
  await expect(remove).toBeVisible()
  await expect(async () => {
    const a = (await url.boundingBox())!,
      b = (await edit.boundingBox())!,
      c = (await remove.boundingBox())!
    expect(Math.abs(a.y + a.height / 2 - b.y - b.height / 2)).toBeLessThan(2)
    expect(b.x).toBeGreaterThanOrEqual(a.x + a.width)
    expect(c.x).toBeGreaterThan(b.x)
  }).toPass()
  expect(
    await url.evaluate((node) => node.scrollWidth > node.clientWidth),
  ).toBe(true)
  await captureVisualViews({
    page,
    ready: section,
    id: "site-rules-inline-actions",
    extensionDir,
  })
  await edit.click()
  const editDialog = page.getByRole("dialog", {
    name: "Edit rule",
    exact: true,
  })
  await expect(
    editDialog.getByRole("combobox", { name: "Rule syntax", exact: true }),
  ).toContainText("Exact URL")
  await editDialog.getByRole("button", { name: "Cancel", exact: true }).click()
  await remove.click()
  await expect.poll(async () => (await readRules()).whitelist.length).toBe(1)
})

test("previews long lists with a faded continuation and independently expands them", async ({
  context,
  page,
  extensionId,
  extensionDir,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await forceExtensionLanguage(page, "zh-CN")
  await seedUserPreferences(await getServiceWorker(context), {
    webAiApiCheck: {
      autoDetect: {
        enabled: true,
        siteRules: {
          priority: WEB_AI_API_CHECK_RULE_LIST.BLACKLIST,
          whitelist: Array.from({ length: 7 }, (_, i) => ({
            syntax: WEB_AI_API_CHECK_RULE_SYNTAX.WILDCARD,
            pattern: `*://allowed-${i}.example.com/*`,
          })),
          blacklist: Array.from({ length: 5 }, (_, i) => ({
            syntax: WEB_AI_API_CHECK_RULE_SYNTAX.WILDCARD,
            pattern: `*://blocked-${i}.example.com/*`,
          })),
        },
      },
    },
  })
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}?tab=webAiApiCheck#basic`,
  )
  const white = page.locator("#web-ai-api-check-included-sites")
  const black = page.locator("#web-ai-api-check-excluded-sites")
  await expect(white.getByRole("listitem")).toHaveCount(3)
  await expect(black.getByRole("listitem")).toHaveCount(3)
  const toggle = white.getByRole("button", { name: "展开全部", exact: true })
  await expect(toggle).toHaveAttribute("aria-expanded", "false")
  await captureVisualViews({
    page,
    ready: page.locator("#web-ai-api-check"),
    id: "site-rules-faded-preview",
    extensionDir,
  })
  await toggle.click()
  await expect(white.getByRole("listitem")).toHaveCount(7)
  await expect(black.getByRole("listitem")).toHaveCount(3)
  await white.getByRole("button", { name: "收起", exact: true }).press("Enter")
  await expect(white.getByRole("listitem")).toHaveCount(3)
  await expect(
    white.getByRole("button", { name: "展开全部", exact: true }),
  ).toBeFocused()
  await white.getByRole("button", { name: "添加到白名单", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await dialog
    .getByRole("textbox", { name: "规则内容", exact: true })
    .fill("new.example.com")
  await dialog.getByRole("button", { name: "添加", exact: true }).click()
  await expect(white.getByRole("listitem")).toHaveCount(8)
})
