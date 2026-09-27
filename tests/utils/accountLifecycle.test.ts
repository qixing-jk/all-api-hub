import { describe, expect, it, vi } from "vitest"

import { API_CREDENTIAL_PROFILES_CONFIG_VERSION } from "~/types/apiCredentialProfiles"
import {
  deleteTokensMatchingNameFromKeyManagementPage,
  saveTokenToApiCredentialProfilesFromKeyManagementPage,
} from "~~/e2e/utils/accountLifecycle"

describe("account lifecycle E2E utilities", () => {
  it("waits for a newly created API profile instead of reusing an existing match", async () => {
    const existingProfile = {
      id: "existing-profile",
      name: "E2E profile",
      apiType: "openai-compatible",
      baseUrl: "https://example.com",
      apiKey: "sk-existing",
      tagIds: [],
      notes: "",
      createdAt: 1,
      updatedAt: 1,
    }
    const createdProfile = {
      ...existingProfile,
      id: "created-profile",
      apiKey: "sk-created",
    }
    let profiles = [existingProfile]

    const serviceWorker = {
      evaluate: vi.fn(
        async (
          runInWorker: (storageKey: string) => Promise<unknown>,
          storageKey: string,
        ) => {
          const previousChrome = (globalThis as any).chrome
          ;(globalThis as any).chrome = {
            runtime: {},
            storage: {
              local: {
                get: (
                  key: string,
                  callback: (stored: Record<string, unknown>) => void,
                ) => {
                  callback({
                    [key]: JSON.stringify({
                      version: API_CREDENTIAL_PROFILES_CONFIG_VERSION,
                      profiles,
                      lastUpdated: Date.now(),
                    }),
                  })
                },
              },
            },
          }

          try {
            return await runInWorker(storageKey)
          } finally {
            ;(globalThis as any).chrome = previousChrome
          }
        },
      ),
    } as any

    const associationButton = {
      click: vi.fn(),
    }
    const saveButton = {
      click: vi.fn(async () => {
        profiles = [existingProfile, createdProfile]
      }),
    }
    const row = {
      getByTestId: vi.fn(() => associationButton),
    } as any
    const page = {
      getByTestId: vi.fn(() => saveButton),
    } as any

    await expect(
      saveTokenToApiCredentialProfilesFromKeyManagementPage({
        serviceWorker,
        page,
        row,
        expectedProfile: {
          name: "E2E profile",
          baseUrl: "https://example.com",
        },
        openProfilesPage: false,
      }),
    ).resolves.toMatchObject({
      id: "created-profile",
    })

    expect(row.getByTestId).toHaveBeenCalledOnce()
    expect(page.getByTestId).toHaveBeenCalledOnce()
    expect(associationButton.click).toHaveBeenCalledOnce()
    expect(saveButton.click).toHaveBeenCalledOnce()
  })
})

describe("key management refresh readiness", () => {
  function createKeyManagementPage(loadErrorText?: string) {
    const headerRefreshButton = {
      isEnabled: vi.fn().mockResolvedValue(true),
    }
    // The product renders a second "Refresh Key List" action inside the
    // key-list load-error empty state, which makes an unscoped lookup
    // resolve to two elements in Playwright's strict mode.
    const ambiguousRefreshButton = {
      isEnabled: vi
        .fn()
        .mockRejectedValue(
          new Error(
            "strict mode violation: getByRole('button', { name: 'Refresh Key List' }) resolved to 2 elements",
          ),
        ),
    }
    const loadErrorAlert = {
      isVisible: vi.fn().mockResolvedValue(Boolean(loadErrorText)),
      innerText: vi.fn().mockResolvedValue(loadErrorText ?? ""),
    }

    const page = {
      getByRole: vi.fn((role: string) => {
        if (role === "group") {
          return { getByRole: vi.fn(() => headerRefreshButton) }
        }
        if (role === "alert") {
          return { filter: vi.fn(() => loadErrorAlert) }
        }
        if (role === "button") return ambiguousRefreshButton
        if (role === "heading") {
          return { allTextContents: vi.fn().mockResolvedValue([]) }
        }
        throw new Error(`Unexpected role query: ${role}`)
      }),
      getByTestId: vi.fn(() => ({
        waitFor: vi.fn().mockRejectedValue(new Error("not visible")),
        isVisible: vi.fn().mockResolvedValue(false),
      })),
    }

    return { page: page as any, headerRefreshButton }
  }

  it("reads the refresh action from the header action group", async () => {
    const { page, headerRefreshButton } = createKeyManagementPage()

    await expect(
      deleteTokensMatchingNameFromKeyManagementPage({
        page,
        nameMatcher: () => false,
      }),
    ).resolves.toBeUndefined()

    expect(headerRefreshButton.isEnabled).toHaveBeenCalled()
  })

  it("surfaces the key-list load error instead of an opaque timeout", async () => {
    const { page } = createKeyManagementPage(
      "Failed to load keys The extension could not load keys for this account. Error: Could not load scopes",
    )

    await expect(
      deleteTokensMatchingNameFromKeyManagementPage({
        page,
        nameMatcher: () => false,
      }),
    ).rejects.toThrow("Could not load scopes")
  })
})
