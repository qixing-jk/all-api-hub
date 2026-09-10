import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import CopyKeyDialog from "~/features/AccountManagement/components/CopyKeyDialog"
import { server } from "~~/tests/msw/server"
import {
  buildApiToken,
  buildDisplaySiteData,
} from "~~/tests/test-utils/factories"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

vi.mock("~/utils/browser/tempWindowFetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/browser/tempWindowFetch")>()),
  canUseTempWindowFetch: vi.fn().mockResolvedValue(false),
}))

describe("CopyKeyDialog APIyi family defaults", () => {
  it.each([
    { label: "plaintext", key: "apiyi-existing-test-key", reveals: 0 },
    { label: "masked", key: "apiyi-********-key", reveals: 1 },
  ])(
    "copies an existing $label key without a creation-only warning",
    async ({ key, reveals }) => {
      const account = buildDisplaySiteData({
        siteType: SITE_TYPES.APIYI,
        baseUrl: "https://api.apiyi.com",
        name: "APIyi",
      })
      const token = buildApiToken({
        name: "Existing APIyi key",
        key,
      })
      let revealRequests = 0
      const inventoryPages: string[] = []
      server.use(
        http.get(`${account.baseUrl}/api/token/`, ({ request }) => {
          const page = new URL(request.url).searchParams.get("p") ?? ""
          inventoryPages.push(page)
          return HttpResponse.json({
            success: true,
            data: page === "0" ? [token] : [],
          })
        }),
        http.post(`${account.baseUrl}/api/token/${token.id}/key`, () => {
          revealRequests += 1
          return HttpResponse.json({
            success: true,
            data: { key: "apiyi-existing-test-key" },
          })
        }),
      )
      const user = userEvent.setup()
      const writeText = vi.spyOn(navigator.clipboard, "writeText")

      render(
        <CopyKeyDialog isOpen={true} onClose={() => {}} account={account} />,
        { withFeatureGuidanceProvider: true },
      )

      await screen.findByText("ui:dialog.copyKey.title")
      expect(
        screen.queryByText("keyManagement:keyDetails.createResponseOnlySecret"),
      ).not.toBeInTheDocument()
      await user.click(await screen.findByText(token.name))
      await user.click(
        screen.getByRole("button", { name: "ui:dialog.copyKey.copy" }),
      )

      await waitFor(() =>
        expect(writeText).toHaveBeenCalledWith("sk-apiyi-existing-test-key"),
      )
      expect(revealRequests).toBe(reveals)
      expect(inventoryPages).toEqual(["0", "1"])
    },
  )
})
