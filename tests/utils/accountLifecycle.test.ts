import { describe, expect, it, vi } from "vitest"

import { API_CREDENTIAL_PROFILES_CONFIG_VERSION } from "~/types/apiCredentialProfiles"
import { saveTokenToApiCredentialProfilesFromKeyManagementPage } from "~~/e2e/utils/accountLifecycle"

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

    const saveButton = {
      click: vi.fn(async () => {
        profiles = [existingProfile, createdProfile]
      }),
    }
    const row = {
      getByTestId: vi.fn(() => saveButton),
    } as any

    await expect(
      saveTokenToApiCredentialProfilesFromKeyManagementPage({
        serviceWorker,
        page: {} as any,
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
    expect(saveButton.click).toHaveBeenCalledOnce()
  })
})
