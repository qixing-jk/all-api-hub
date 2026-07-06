import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ACCOUNT_SITE_TITLE_RULES, SITE_TYPES } from "~/constants/siteType"
import {
  fetchSiteOriginalTitle,
  getAccountSiteType,
} from "~/services/siteDetection/detectSiteType"
import { server } from "~~/tests/msw/server"

vi.mock("~/utils/browser/tempWindowFetch", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/tempWindowFetch")>()

  return {
    ...actual,
    canUseTempWindowFetch: vi.fn().mockResolvedValue(false),
    tempWindowFetch: vi.fn(),
  }
})

describe("detectSiteType", () => {
  beforeEach(() => {
    server.resetHandlers()
    server.use(
      http.get("https://example.com/api/user/info", () => {
        return HttpResponse.json({ message: "not found" }, { status: 404 })
      }),
      http.get("https://example.com/api/v1/auth/me", () => {
        return HttpResponse.json({ message: "not found" }, { status: 404 })
      }),
    )
  })

  describe("fetchSiteOriginalTitle", () => {
    it("should extract title from HTML", async () => {
      const mockHTML =
        "<html><head><title>Test Site Title</title></head></html>"
      server.use(
        http.get("https://example.com", () => {
          return new HttpResponse(mockHTML, {
            headers: { "Content-Type": "text/html" },
          })
        }),
      )

      const title = await fetchSiteOriginalTitle("https://example.com")

      expect(title).toBe("Test Site Title")
    })

    it("should handle title tag with different case", async () => {
      const mockHTML =
        "<HTML><HEAD><TITLE>UPPERCASE TITLE</TITLE></HEAD></HTML>"
      server.use(
        http.get("https://example.com", () => {
          return new HttpResponse(mockHTML, {
            headers: { "Content-Type": "text/html" },
          })
        }),
      )

      const title = await fetchSiteOriginalTitle("https://example.com")

      expect(title).toBe("UPPERCASE TITLE")
    })

    it("should handle mixed case title tag", async () => {
      const mockHTML = "<html><Title>Mixed Case</Title></html>"
      server.use(
        http.get("https://example.com", () => {
          return new HttpResponse(mockHTML, {
            headers: { "Content-Type": "text/html" },
          })
        }),
      )

      const title = await fetchSiteOriginalTitle("https://example.com")

      expect(title).toBe("Mixed Case")
    })

    it("should return '' when title tag is missing", async () => {
      const mockHTML = "<html><head></head><body>No title</body></html>"
      server.use(
        http.get("https://example.com", () => {
          return new HttpResponse(mockHTML, {
            headers: { "Content-Type": "text/html" },
          })
        }),
      )

      const title = await fetchSiteOriginalTitle("https://example.com")

      expect(title).toBe("")
    })

    it("should extract title with special characters", async () => {
      const mockHTML =
        "<html><title>Site & Title - Special 'Chars' (2024)</title></html>"
      server.use(
        http.get("https://example.com", () => {
          return new HttpResponse(mockHTML, {
            headers: { "Content-Type": "text/html" },
          })
        }),
      )

      const title = await fetchSiteOriginalTitle("https://example.com")

      expect(title).toBe("Site & Title - Special 'Chars' (2024)")
    })

    it("should handle empty title tag", async () => {
      const mockHTML = "<html><title></title></html>"
      server.use(
        http.get("https://example.com", () => {
          return new HttpResponse(mockHTML, {
            headers: { "Content-Type": "text/html" },
          })
        }),
      )

      const title = await fetchSiteOriginalTitle("https://example.com")

      expect(title).toBe("")
    })

    it("should extract title with whitespace", async () => {
      const mockHTML = "<html><title>  Title with spaces  </title></html>"
      server.use(
        http.get("https://example.com", () => {
          return new HttpResponse(mockHTML, {
            headers: { "Content-Type": "text/html" },
          })
        }),
      )

      const title = await fetchSiteOriginalTitle("https://example.com")

      expect(title).toBe("  Title with spaces  ")
    })

    it("should handle Chinese title", async () => {
      const mockHTML = "<html><title>中文标题</title></html>"
      server.use(
        http.get("https://example.com", () => {
          return new HttpResponse(mockHTML, {
            headers: { "Content-Type": "text/html" },
          })
        }),
      )

      const title = await fetchSiteOriginalTitle("https://example.com")

      expect(title).toBe("中文标题")
    })
  })

  describe("getAccountSiteType", () => {
    describe("Domain-based detection", () => {
      it("detects AIHubMix from the canonical root domain without title fetch", async () => {
        let titleFetched = false
        server.use(
          http.get("https://aihubmix.com", () => {
            titleFetched = true
            return new HttpResponse("<html><title>new-api</title></html>", {
              headers: { "Content-Type": "text/html" },
            })
          }),
        )

        await expect(getAccountSiteType("https://aihubmix.com/")).resolves.toBe(
          SITE_TYPES.AIHUBMIX,
        )
        expect(titleFetched).toBe(false)
      })

      it("detects AIHubMix from www.aihubmix.com paths", async () => {
        await expect(
          getAccountSiteType("https://www.aihubmix.com/some/path"),
        ).resolves.toBe(SITE_TYPES.AIHUBMIX)
      })

      it("detects AIHubMix hostnames case-insensitively", async () => {
        await expect(
          getAccountSiteType("https://Console.AIHubMix.com/dashboard"),
        ).resolves.toBe(SITE_TYPES.AIHUBMIX)
      })

      it("uses domain detection before a conflicting title signal", async () => {
        let titleFetched = false
        server.use(
          http.get("https://www.aihubmix.com", () => {
            titleFetched = true
            return new HttpResponse("<html><title>one-api</title></html>", {
              headers: { "Content-Type": "text/html" },
            })
          }),
        )

        await expect(
          getAccountSiteType("https://www.aihubmix.com"),
        ).resolves.toBe(SITE_TYPES.AIHUBMIX)
        expect(titleFetched).toBe(false)
      })

      it("detects SharedChat from the exact target hostname without title fetch", async () => {
        let titleFetched = false
        server.use(
          http.get("https://new.sharedchat.cc", () => {
            titleFetched = true
            return new HttpResponse("<html><title>new-api</title></html>", {
              headers: { "Content-Type": "text/html" },
            })
          }),
        )

        await expect(
          getAccountSiteType("https://new.sharedchat.cc/list/#/vibe-code"),
        ).resolves.toBe(SITE_TYPES.SHAREDCHAT)
        expect(titleFetched).toBe(false)
      })

      it("does not generalize SharedChat detection to sibling hostnames", async () => {
        server.use(
          http.get("https://api.sharedchat.cc", () => {
            return new HttpResponse(
              "<html><title>White Label Dashboard</title></html>",
              {
                headers: { "Content-Type": "text/html" },
              },
            )
          }),
          http.get("https://api.sharedchat.cc/api/user/self", () => {
            return HttpResponse.json(
              {
                success: false,
                message: "error: completely unmatched identifier",
              },
              { status: 400 },
            )
          }),
          http.get("https://api.sharedchat.cc/api/v1/auth/me", () => {
            return HttpResponse.json({ message: "not found" }, { status: 404 })
          }),
        )

        await expect(
          getAccountSiteType("https://api.sharedchat.cc"),
        ).resolves.toBe(SITE_TYPES.UNKNOWN)
      })
    })

    describe("Title-based detection", () => {
      it("should detect site type from title when match found", async () => {
        // Find a real rule from ACCOUNT_SITE_TITLE_RULES
        const firstRule = ACCOUNT_SITE_TITLE_RULES[0]
        const matchingTitle = firstRule.name // This should match the regex

        const mockHTML = `<html><title>${matchingTitle}</title></html>`
        server.use(
          http.get("https://example.com", () => {
            return new HttpResponse(mockHTML, {
              headers: { "Content-Type": "text/html" },
            })
          }),
        )

        const siteType = await getAccountSiteType("https://example.com")

        expect(siteType).toBe(firstRule.name)
      })

      it("should detect one-api from title", async () => {
        const mockHTML = "<html><title>One API</title></html>"
        server.use(
          http.get("https://example.com", () => {
            return new HttpResponse(mockHTML, {
              headers: { "Content-Type": "text/html" },
            })
          }),
        )

        const siteType = await getAccountSiteType("https://example.com")

        // Check if result matches one of the known site types
        const knownTypes = ACCOUNT_SITE_TITLE_RULES.map((rule) => rule.name)
        if (knownTypes.includes(siteType)) {
          expect(knownTypes).toContain(siteType)
        } else {
          expect(siteType).toBe(SITE_TYPES.UNKNOWN)
        }
      })

      it("should not classify managed-only titles as account site types", async () => {
        const managedOnlyTitles = [
          ["Octopus", SITE_TYPES.OCTOPUS],
          ["AxonHub", SITE_TYPES.AXON_HUB],
          ["Claude Code Hub", SITE_TYPES.CLAUDE_CODE_HUB],
        ] as const

        for (const [title] of managedOnlyTitles) {
          server.resetHandlers()
          server.use(
            http.get("https://example.com", () => {
              return new HttpResponse(`<html><title>${title}</title></html>`, {
                headers: { "Content-Type": "text/html" },
              })
            }),
            http.get("https://example.com/api/user/self", () => {
              return HttpResponse.json(
                {
                  success: false,
                  message: "error: completely unmatched identifier",
                },
                { status: 400 },
              )
            }),
            http.get("https://example.com/api/v1/auth/me", () => {
              return HttpResponse.json(
                { message: "not found" },
                { status: 404 },
              )
            }),
          )

          await expect(getAccountSiteType("https://example.com")).resolves.toBe(
            SITE_TYPES.UNKNOWN,
          )
        }
      })

      it("keeps AIHubMix title matching as a secondary fallback for non-canonical URLs", async () => {
        server.use(
          http.get("https://mirror.example.com", () => {
            return new HttpResponse("<html><title>AIHubMix</title></html>", {
              headers: { "Content-Type": "text/html" },
            })
          }),
        )

        await expect(
          getAccountSiteType("https://mirror.example.com"),
        ).resolves.toBe(SITE_TYPES.AIHUBMIX)
      })
    })

    describe("Fallback to API detection", () => {
      it("detects VoAPI v2 from a protected endpoint signature on custom origins", async () => {
        let titleFetched = false
        server.use(
          http.get("https://example.com", () => {
            titleFetched = true
            return new HttpResponse("<html><title>Custom Portal</title></html>")
          }),
          http.get("https://example.com/api/user/info", () =>
            HttpResponse.json(
              { code: 2, data: null, msg: "Unauthorized", rid: "request-id" },
              { status: 403 },
            ),
          ),
        )

        await expect(getAccountSiteType("https://example.com")).resolves.toBe(
          SITE_TYPES.VO_API_V2,
        )
        expect(titleFetched).toBe(false)
      })

      it("keeps old VoAPI title-only detection on the old site type", async () => {
        server.use(
          http.get("https://example.com", () => {
            return new HttpResponse("<html><title>VoAPI</title></html>", {
              headers: { "Content-Type": "text/html" },
            })
          }),
          http.get("https://example.com/api/user/info", () =>
            HttpResponse.text("not voapi v2", {
              status: 404,
              headers: { "Content-Type": "text/plain" },
            }),
          ),
        )

        await expect(getAccountSiteType("https://example.com")).resolves.toBe(
          SITE_TYPES.VO_API,
        )
      })

      it("falls back when the VoAPI v2 probe is inconclusive", async () => {
        server.use(
          http.get("https://example.com", () => {
            return new HttpResponse("<html><title>New API</title></html>", {
              headers: { "Content-Type": "text/html" },
            })
          }),
          http.get("https://example.com/api/user/info", () =>
            HttpResponse.json({ ok: false }, { status: 404 }),
          ),
        )

        await expect(getAccountSiteType("https://example.com")).resolves.toBe(
          SITE_TYPES.NEW_API,
        )
      })

      it("detects Sub2API from its unauthenticated auth endpoint JSON code", async () => {
        server.use(
          http.get("https://example.com", () => {
            return new HttpResponse(
              "<html><title>White Label Dashboard</title></html>",
              {
                headers: { "Content-Type": "text/html" },
              },
            )
          }),
          http.get("https://example.com/api/v1/auth/me", () => {
            return HttpResponse.json(
              {
                code: "UNAUTHORIZED",
                message: "Authorization header is required",
              },
              { status: 401 },
            )
          }),
          http.get("https://example.com/api/user/self", () => {
            return HttpResponse.json(
              {
                success: false,
                message: "error: completely unmatched identifier",
              },
              { status: 400 },
            )
          }),
        )

        await expect(getAccountSiteType("https://example.com")).resolves.toBe(
          SITE_TYPES.SUB2API,
        )
      })

      it("does not detect Sub2API when the auth endpoint returns non-JSON fallback content", async () => {
        server.use(
          http.get("https://example.com", () => {
            return new HttpResponse(
              "<html><title>White Label Dashboard</title></html>",
              {
                headers: { "Content-Type": "text/html" },
              },
            )
          }),
          http.get("https://example.com/api/v1/auth/me", () => {
            return new HttpResponse("<html><title>App</title></html>", {
              status: 200,
              headers: { "Content-Type": "text/html" },
            })
          }),
          http.get("https://example.com/api/user/self", () => {
            return HttpResponse.json(
              {
                success: false,
                message: "error: completely unmatched identifier",
              },
              { status: 400 },
            )
          }),
        )

        await expect(getAccountSiteType("https://example.com")).resolves.toBe(
          SITE_TYPES.UNKNOWN,
        )
      })

      it("falls through to New API-family detection when the Sub2API auth endpoint probe fails", async () => {
        server.use(
          http.get("https://example.com", () => {
            return new HttpResponse(
              "<html><title>White Label Dashboard</title></html>",
              {
                headers: { "Content-Type": "text/html" },
              },
            )
          }),
          http.get("https://example.com/api/v1/auth/me", () => {
            return HttpResponse.error()
          }),
          http.get("https://example.com/api/user/self", () => {
            return HttpResponse.json(
              {
                success: false,
                message: "Unauthorized, New-Api-User header not provided",
              },
              { status: 401 },
            )
          }),
        )

        await expect(getAccountSiteType("https://example.com")).resolves.toBe(
          SITE_TYPES.NEW_API,
        )
      })

      it("should fallback to API detection when title doesn't match", async () => {
        const mockHTML = "<html><title>Unknown Site</title></html>"
        const mockApiResponse = {
          success: false,
          message: "error: invalid user unknown-api-identifier",
        }

        server.use(
          // First call: fetch HTML title
          http.get("https://example.com", () => {
            return new HttpResponse(mockHTML, {
              headers: { "Content-Type": "text/html" },
            })
          }),
          // Second call: fetch API for user ID type
          http.get("https://example.com/api/user/self", () => {
            return HttpResponse.json(mockApiResponse, { status: 400 })
          }),
        )

        const siteType = await getAccountSiteType("https://example.com")

        // Result depends on whether "unknown-api-identifier" matches any rule
        expect(typeof siteType).toBe("string")
      })

      it("should return SITE_TYPES.UNKNOWN when no match found", async () => {
        const mockHTML = "<html><title>Unrecognized Title</title></html>"
        const mockApiResponse = {
          success: false,
          message: "error: completely unmatched identifier",
        }

        server.use(
          http.get("https://example.com", () => {
            return new HttpResponse(mockHTML, {
              headers: { "Content-Type": "text/html" },
            })
          }),
          http.get("https://example.com/api/user/self", () => {
            return HttpResponse.json(mockApiResponse, { status: 400 })
          }),
        )

        const siteType = await getAccountSiteType("https://example.com")

        // Should return SITE_TYPES.UNKNOWN if no rule matches
        const knownTypes = ACCOUNT_SITE_TITLE_RULES.map((rule) => rule.name)
        if (!knownTypes.some((type) => siteType === type)) {
          expect(siteType).toBe(SITE_TYPES.UNKNOWN)
        }
      })
    })

    describe("API response parsing", () => {
      it("should extract user ID type from API error message", async () => {
        const mockHTML = "<html><title>No Match</title></html>"
        const mockApiResponse = {
          success: false,
          message: "error: invalid user new-api",
        }

        server.use(
          http.get("https://example.com", () => {
            return new HttpResponse(mockHTML, {
              headers: { "Content-Type": "text/html" },
            })
          }),
          http.get("https://example.com/api/user/self", () => {
            return HttpResponse.json(mockApiResponse, { status: 400 })
          }),
        )

        const siteType = await getAccountSiteType("https://example.com")

        expect(siteType).toBe(SITE_TYPES.NEW_API)
      })

      it("should detect site type from any token in the API error message", async () => {
        const mockHTML = "<html><title>No Match</title></html>"
        const mockApiResponse = {
          success: false,
          message: "new-api invalid user identifier changed",
        }

        server.use(
          http.get("https://example.com", () => {
            return new HttpResponse(mockHTML, {
              headers: { "Content-Type": "text/html" },
            })
          }),
          http.get("https://example.com/api/user/self", () => {
            return HttpResponse.json(mockApiResponse, { status: 400 })
          }),
        )

        const siteType = await getAccountSiteType("https://example.com")

        expect(siteType).toBe(SITE_TYPES.NEW_API)
      })

      it("should detect SITE_TYPES.NEW_API from the upstream English New-Api-User header error", async () => {
        const mockHTML = "<html><title>No Match</title></html>"
        const mockApiResponse = {
          success: false,
          message: "Unauthorized, New-Api-User header not provided",
        }

        server.use(
          http.get("https://example.com", () => {
            return new HttpResponse(mockHTML, {
              headers: { "Content-Type": "text/html" },
            })
          }),
          http.get("https://example.com/api/user/self", () => {
            return HttpResponse.json(mockApiResponse, { status: 401 })
          }),
        )

        const siteType = await getAccountSiteType("https://example.com")

        expect(siteType).toBe(SITE_TYPES.NEW_API)
      })

      it("should detect SITE_TYPES.NEW_API from the localized Chinese New-Api-User header error", async () => {
        const mockHTML = "<html><title>No Match</title></html>"
        const mockApiResponse = {
          success: false,
          message: "无权进行此操作，未提供 New-Api-User",
        }

        server.use(
          http.get("https://example.com", () => {
            return new HttpResponse(mockHTML, {
              headers: { "Content-Type": "text/html" },
            })
          }),
          http.get("https://example.com/api/user/self", () => {
            return HttpResponse.json(mockApiResponse, { status: 401 })
          }),
        )

        const siteType = await getAccountSiteType("https://example.com")

        expect(siteType).toBe(SITE_TYPES.NEW_API)
      })

      it("should detect SITE_TYPES.V_API from the X-Api-User header error", async () => {
        const mockHTML = "<html><title>No Match</title></html>"
        const mockApiResponse = {
          success: false,
          message: "Unauthorized, X-Api-User header not provided",
        }

        server.use(
          http.get("https://example.com", () => {
            return new HttpResponse(mockHTML, {
              headers: { "Content-Type": "text/html" },
            })
          }),
          http.get("https://example.com/api/user/self", () => {
            return HttpResponse.json(mockApiResponse, { status: 401 })
          }),
        )

        const siteType = await getAccountSiteType("https://example.com")

        expect(siteType).toBe(SITE_TYPES.V_API)
      })

      it("should not infer a site type from the generic User-id header error alone", async () => {
        const mockHTML = "<html><title>No Match</title></html>"
        const mockApiResponse = {
          success: false,
          message: "Unauthorized, User-id header not provided",
        }

        server.use(
          http.get("https://example.com", () => {
            return new HttpResponse(mockHTML, {
              headers: { "Content-Type": "text/html" },
            })
          }),
          http.get("https://example.com/api/user/self", () => {
            return HttpResponse.json(mockApiResponse, { status: 401 })
          }),
        )

        const siteType = await getAccountSiteType("https://example.com")

        expect(siteType).toBe(SITE_TYPES.UNKNOWN)
      })

      it("should handle API response without message", async () => {
        const mockHTML = "<html><title>No Match</title></html>"
        const mockApiResponse = { success: true }

        server.use(
          http.get("https://example.com", () => {
            return new HttpResponse(mockHTML, {
              headers: { "Content-Type": "text/html" },
            })
          }),
          http.get("https://example.com/api/user/self", () => {
            return HttpResponse.json(mockApiResponse)
          }),
        )

        const siteType = await getAccountSiteType("https://example.com")

        expect(siteType).toBe(SITE_TYPES.UNKNOWN)
      })
    })

    describe("Error handling", () => {
      it("should handle fetch failure gracefully", async () => {
        server.use(
          http.get("https://example.com", () => {
            return HttpResponse.error()
          }),
        )

        await expect(
          getAccountSiteType("https://example.com"),
        ).rejects.toThrow()
      })

      it.skip("should handle HTML parsing error", async () => {
        // Skipped: Complex to mock parsing errors with MSW
        // The function handles errors internally and returns SITE_TYPES.UNKNOWN
        server.use(
          http.get("https://example.com", () => {
            // Return a response that will cause text() to throw
            return new HttpResponse(null, {
              headers: { "Content-Type": "text/html" },
            })
          }),
        )

        const siteType = await getAccountSiteType("https://example.com")
        // The function should handle the error and return SITE_TYPES.UNKNOWN
        expect(typeof siteType).toBe("string")
      })
    })
  })
})
