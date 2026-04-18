import { fireEvent, render as rtlRender, screen } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { describe, expect, it, vi } from "vitest"

import FilterBar, {
  FILTER_STATUS,
} from "~/features/AutoCheckin/components/FilterBar"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import { testI18n } from "~~/tests/test-utils/i18n"

describe("AutoCheckin FilterBar", () => {
  it("clears the keyword search from the shared input clear button", () => {
    const onKeywordChange = vi.fn()

    rtlRender(
      <I18nextProvider i18n={testI18n}>
        <FilterBar
          accountResults={[
            {
              accountId: "account-1",
              accountName: "Alpha",
              status: CHECKIN_RESULT_STATUS.SUCCESS,
            } as any,
          ]}
          status={FILTER_STATUS.ALL}
          keyword="Alpha"
          onStatusChange={vi.fn()}
          onKeywordChange={onKeywordChange}
        />
      </I18nextProvider>,
    )

    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.clear" }),
    )

    expect(onKeywordChange).toHaveBeenCalledWith("")
  })
})
