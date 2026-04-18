import { fireEvent, render as rtlRender, screen } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { describe, expect, it, vi } from "vitest"

import { TokenSearchBar } from "~/features/KeyManagement/components/TokenSearchBar"
import { testI18n } from "~~/tests/test-utils/i18n"

describe("TokenSearchBar", () => {
  it("clears the token search from the shared input clear button", () => {
    const setSearchTerm = vi.fn()

    rtlRender(
      <I18nextProvider i18n={testI18n}>
        <TokenSearchBar searchTerm="sk-live" setSearchTerm={setSearchTerm} />
      </I18nextProvider>,
    )

    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.clear" }),
    )

    expect(setSearchTerm).toHaveBeenCalledWith("")
  })
})
