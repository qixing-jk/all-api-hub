import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { PersonalizedCatalogFallbackNotice } from "~/features/ModelList/components/PersonalizedCatalogFallbackNotice"
import { render, screen } from "~~/tests/test-utils/render"

describe("PersonalizedCatalogFallbackNotice", () => {
  it("keeps the provider-wide catalog visible with an accessible personalized retry", async () => {
    const user = userEvent.setup()
    const retry = vi.fn().mockResolvedValue(undefined)

    render(
      <PersonalizedCatalogFallbackNotice
        fallback={{
          affectedAccountCount: 1,
          failureCategory: "auth",
          message: "The saved credential needs attention.",
          retry,
        }}
      />,
      {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      },
    )

    expect(
      screen.getByText("modelList:personalizedCatalogFallback.title"),
    ).toBeVisible()
    expect(
      screen.getByText("The saved credential needs attention."),
    ).toBeVisible()

    await user.click(
      screen.getByRole("button", {
        name: "modelList:personalizedCatalogFallback.retry",
      }),
    )
    expect(retry).toHaveBeenCalledTimes(1)
  })
})
