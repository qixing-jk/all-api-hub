import type { Page } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import type { SiteBookmark, TagStore } from "~/types"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredBookmark,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredBookmarks,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  getPlasmoStorageRawValue,
  getServiceWorker,
  setPlasmoStorageValue,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

/**
 *
 */
async function readStoredBookmarks(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
): Promise<SiteBookmark[]> {
  const raw = await getPlasmoStorageRawValue<unknown>(
    serviceWorker,
    STORAGE_KEYS.ACCOUNTS,
  )

  if (typeof raw !== "string") return []

  try {
    const parsed = JSON.parse(raw) as { bookmarks?: SiteBookmark[] }
    return Array.isArray(parsed.bookmarks) ? parsed.bookmarks : []
  } catch {
    return []
  }
}

/**
 *
 */
async function readStoredBookmarkState(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
): Promise<{
  bookmarks: SiteBookmark[]
  pinnedAccountIds: string[]
  orderedAccountIds: string[]
}> {
  const raw = await getPlasmoStorageRawValue<unknown>(
    serviceWorker,
    STORAGE_KEYS.ACCOUNTS,
  )

  if (typeof raw !== "string") {
    return { bookmarks: [], pinnedAccountIds: [], orderedAccountIds: [] }
  }

  try {
    const parsed = JSON.parse(raw) as {
      bookmarks?: SiteBookmark[]
      pinnedAccountIds?: string[]
      orderedAccountIds?: string[]
    }
    return {
      bookmarks: Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [],
      pinnedAccountIds: Array.isArray(parsed.pinnedAccountIds)
        ? parsed.pinnedAccountIds
        : [],
      orderedAccountIds: Array.isArray(parsed.orderedAccountIds)
        ? parsed.orderedAccountIds
        : [],
    }
  } catch {
    return { bookmarks: [], pinnedAccountIds: [], orderedAccountIds: [] }
  }
}

/**
 *
 */
function getBookmarkRow(page: Page, name: string) {
  return page
    .getByRole("button", { name })
    .locator("xpath=ancestor::div[contains(@class, 'group')][1]")
}

/**
 *
 */
async function getBookmarkButtonY(page: Page, name: string) {
  const box = await page.getByRole("button", { name }).first().boundingBox()

  if (!box) {
    throw new Error(`Could not resolve bookmark row for ${name}`)
  }

  return box.y
}

/**
 *
 */
async function openBookmarkActionsMenu(page: Page, name: string) {
  const row = getBookmarkRow(page, name)
  await row.hover()
  await row.getByRole("button", { name: "More" }).click()
}

/**
 *
 */
async function dragBookmarkHandle(
  page: Page,
  sourceIndex: number,
  targetIndex: number,
) {
  const handles = page.getByRole("button", { name: "Reorder bookmarks" })
  const sourceHandle = handles.nth(sourceIndex)
  const targetHandle = handles.nth(targetIndex)

  await sourceHandle.scrollIntoViewIfNeeded()
  await targetHandle.scrollIntoViewIfNeeded()

  const sourceBox = await sourceHandle.boundingBox()
  const targetBox = await targetHandle.boundingBox()

  if (!sourceBox || !targetBox) {
    throw new Error("Could not resolve bookmark drag handles")
  }

  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2,
    sourceBox.y + sourceBox.height / 2,
  )
  await page.mouse.down()
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
    { steps: 12 },
  )
  await page.mouse.up()
}

/**
 *
 */
async function seedStoredTagStore(
  serviceWorker: Awaited<ReturnType<typeof getServiceWorker>>,
  tagStore: TagStore,
) {
  await setPlasmoStorageValue(serviceWorker, STORAGE_KEYS.TAG_STORE, tagStore)
}

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
})

test("adds a bookmark from bookmark management and persists it", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#bookmark`,
  )
  await waitForExtensionRoot(page)

  await page.getByRole("button", { name: "Add Bookmark" }).click()

  const dialog = page.getByRole("dialog")
  await expect(dialog.getByPlaceholder("e.g. Admin Console")).toBeVisible()
  await dialog.getByPlaceholder("e.g. Admin Console").fill("Docs Portal")
  await dialog
    .getByPlaceholder("https://example.com/...")
    .fill("https://example.com/portal")
  await dialog
    .getByPlaceholder("Optional notes...")
    .fill("Primary documentation entrypoint")
  await dialog.getByRole("button", { name: "Add Bookmark" }).click()

  await expect(page.getByRole("button", { name: "Docs Portal" })).toBeVisible()

  await expect
    .poll(async () => {
      const bookmarks = await readStoredBookmarks(serviceWorker)
      return (
        bookmarks.find((bookmark) => bookmark.name === "Docs Portal") ?? null
      )
    })
    .toMatchObject({
      name: "Docs Portal",
      url: "https://example.com/portal",
      notes: "Primary documentation entrypoint",
    })
})

test("edits a stored bookmark from bookmark management and persists the change", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedStoredBookmarks(serviceWorker, [
    createStoredBookmark({
      id: "stored-bookmark-1",
      name: "Original Bookmark",
      url: "https://example.com/original",
      notes: "Original note",
    }),
  ])

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#bookmark`,
  )
  await waitForExtensionRoot(page)

  await page.getByText("Original Bookmark").hover()
  await page.getByRole("button", { name: "Edit" }).click()

  const dialog = page.getByRole("dialog")
  await expect(dialog.getByPlaceholder("e.g. Admin Console")).toBeVisible()

  await dialog.getByPlaceholder("e.g. Admin Console").fill("Updated Bookmark")
  await dialog
    .getByPlaceholder("https://example.com/...")
    .fill("https://example.com/updated")
  await dialog.getByPlaceholder("Optional notes...").fill("Updated note")
  await dialog.getByRole("button", { name: "Save" }).click()

  await expect(
    page.getByRole("button", { name: "Updated Bookmark" }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "https://example.com/updated" }),
  ).toBeVisible()

  await expect
    .poll(async () => {
      const bookmarks = await readStoredBookmarks(serviceWorker)
      return (
        bookmarks.find((bookmark) => bookmark.id === "stored-bookmark-1") ??
        null
      )
    })
    .toMatchObject({
      id: "stored-bookmark-1",
      name: "Updated Bookmark",
      url: "https://example.com/updated",
      notes: "Updated note",
    })
})

test("filters bookmarks by normalized URL tokens and restores the list when cleared", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedStoredBookmarks(serviceWorker, [
    createStoredBookmark({
      id: "stored-bookmark-1",
      name: "Portal Docs",
      url: "https://portal.example.com/docs/?tab=keys#top",
      notes: "Manage model and key settings",
    }),
    createStoredBookmark({
      id: "stored-bookmark-2",
      name: "Billing Console",
      url: "https://billing.example.com/console",
      notes: "Subscription management",
    }),
  ])

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#bookmark`,
  )
  await waitForExtensionRoot(page)

  const searchInput = page.getByPlaceholder("Search bookmarks...")
  await expect(searchInput).toBeVisible()

  await searchInput.fill("portal.example.com/docs manage")
  await expect(page.getByRole("button", { name: "Portal Docs" })).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Billing Console" }),
  ).toHaveCount(0)

  await page.getByRole("button", { name: "Clear" }).click()

  await expect(page.getByRole("button", { name: "Portal Docs" })).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Billing Console" }),
  ).toBeVisible()
})

test("filters bookmarks by selected tags and restores all results via the all-tags chip", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedStoredBookmarks(serviceWorker, [
    createStoredBookmark({
      id: "stored-bookmark-1",
      name: "Alpha Docs",
      url: "https://example.com/alpha",
      tagIds: ["team-alpha"],
    }),
    createStoredBookmark({
      id: "stored-bookmark-2",
      name: "Beta Docs",
      url: "https://example.com/beta",
      tagIds: ["team-beta"],
    }),
    createStoredBookmark({
      id: "stored-bookmark-3",
      name: "Shared Docs",
      url: "https://example.com/shared",
      tagIds: [],
    }),
  ])
  await seedStoredTagStore(serviceWorker, {
    version: 1,
    tagsById: {
      "team-alpha": {
        id: "team-alpha",
        name: "Team Alpha",
        createdAt: 1,
        updatedAt: 1,
      },
      "team-beta": {
        id: "team-beta",
        name: "Team Beta",
        createdAt: 2,
        updatedAt: 2,
      },
    },
  })

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#bookmark`,
  )
  await waitForExtensionRoot(page)

  await expect(page.getByRole("button", { name: /Team Alpha/i })).toBeVisible()
  await expect(page.getByRole("button", { name: /Team Beta/i })).toBeVisible()

  await page.getByRole("button", { name: /Team Alpha/i }).click()
  await expect(page.getByRole("button", { name: "Alpha Docs" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Beta Docs" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Shared Docs" })).toHaveCount(0)

  await page.getByRole("button", { name: /Team Beta/i }).click()
  await expect(page.getByRole("button", { name: "Alpha Docs" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Beta Docs" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Shared Docs" })).toHaveCount(0)

  await page.getByRole("button", { name: /All tags/i }).click()
  await expect(page.getByRole("button", { name: "Alpha Docs" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Beta Docs" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Shared Docs" })).toBeVisible()
})

test("reorders bookmarks with the drag handle and persists the manual order", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedStoredBookmarks(serviceWorker, [
    createStoredBookmark({
      id: "stored-bookmark-1",
      name: "Alpha Bookmark",
      url: "https://example.com/alpha",
    }),
    createStoredBookmark({
      id: "stored-bookmark-2",
      name: "Beta Bookmark",
      url: "https://example.com/beta",
    }),
    createStoredBookmark({
      id: "stored-bookmark-3",
      name: "Gamma Bookmark",
      url: "https://example.com/gamma",
    }),
  ])

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#bookmark`,
  )
  await waitForExtensionRoot(page)

  expect(await getBookmarkButtonY(page, "Alpha Bookmark")).toBeLessThan(
    await getBookmarkButtonY(page, "Beta Bookmark"),
  )
  expect(await getBookmarkButtonY(page, "Beta Bookmark")).toBeLessThan(
    await getBookmarkButtonY(page, "Gamma Bookmark"),
  )

  await dragBookmarkHandle(page, 2, 0)

  await expect
    .poll(async () => {
      const config = await readStoredBookmarkState(serviceWorker)
      return [...config.orderedAccountIds]
    })
    .toEqual(["stored-bookmark-3", "stored-bookmark-1", "stored-bookmark-2"])

  expect(await getBookmarkButtonY(page, "Gamma Bookmark")).toBeLessThan(
    await getBookmarkButtonY(page, "Alpha Bookmark"),
  )
  expect(await getBookmarkButtonY(page, "Alpha Bookmark")).toBeLessThan(
    await getBookmarkButtonY(page, "Beta Bookmark"),
  )
})

test("pins and unpins a stored bookmark while persisting pinned order", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedStoredBookmarks(serviceWorker, [
    createStoredBookmark({
      id: "stored-bookmark-1",
      name: "Alpha Bookmark",
      url: "https://example.com/alpha",
    }),
    createStoredBookmark({
      id: "stored-bookmark-2",
      name: "Zulu Bookmark",
      url: "https://example.com/zulu",
    }),
  ])

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#bookmark`,
  )
  await waitForExtensionRoot(page)

  await expect(
    page.getByRole("button", { name: "Alpha Bookmark" }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Zulu Bookmark" }),
  ).toBeVisible()

  expect(await getBookmarkButtonY(page, "Alpha Bookmark")).toBeLessThan(
    await getBookmarkButtonY(page, "Zulu Bookmark"),
  )

  await openBookmarkActionsMenu(page, "Zulu Bookmark")
  await page.getByText("Pin", { exact: true }).click()

  await expect
    .poll(async () => {
      const config = await readStoredBookmarkState(serviceWorker)
      return [...config.pinnedAccountIds]
    })
    .toEqual(["stored-bookmark-2"])

  expect(await getBookmarkButtonY(page, "Zulu Bookmark")).toBeLessThan(
    await getBookmarkButtonY(page, "Alpha Bookmark"),
  )

  await openBookmarkActionsMenu(page, "Zulu Bookmark")
  await page.getByText("Unpin", { exact: true }).click()

  await expect
    .poll(async () => {
      const config = await readStoredBookmarkState(serviceWorker)
      return [...config.pinnedAccountIds]
    })
    .toEqual([])

  expect(await getBookmarkButtonY(page, "Alpha Bookmark")).toBeLessThan(
    await getBookmarkButtonY(page, "Zulu Bookmark"),
  )
})

test("deletes a stored bookmark from bookmark management and removes it from storage", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedStoredBookmarks(serviceWorker, [
    createStoredBookmark({
      id: "stored-bookmark-1",
      name: "Delete Bookmark",
      url: "https://example.com/delete",
    }),
  ])

  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#bookmark`,
  )
  await waitForExtensionRoot(page)

  await expect(
    page.getByRole("button", { name: "Delete Bookmark" }),
  ).toBeVisible()

  await page.getByText("Delete Bookmark").hover()
  await page.getByRole("button", { name: "More" }).click()
  await page.getByText("Delete", { exact: true }).click()

  const dialog = page.getByRole("dialog")
  await expect(dialog.getByText("Delete bookmark?")).toBeVisible()
  await dialog.getByRole("button", { name: "Delete" }).click()

  await expect(
    page.getByRole("button", { name: "Delete Bookmark" }),
  ).toHaveCount(0)

  await expect
    .poll(async () => {
      const bookmarks = await readStoredBookmarks(serviceWorker)
      return bookmarks.some((bookmark) => bookmark.id === "stored-bookmark-1")
    })
    .toBe(false)
})
