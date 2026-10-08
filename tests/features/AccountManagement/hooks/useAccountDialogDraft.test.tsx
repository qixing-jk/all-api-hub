import { act, renderHook } from "@testing-library/react"
import { expect, it } from "vitest"

import { DIALOG_MODES } from "~/constants/dialogModes"
import { useAccountDialogDraft } from "~/features/AccountManagement/components/AccountDialog/form/useAccountDialogDraft"

it("keeps manually edited balance independent from other account fields", () => {
  const { result } = renderHook(() =>
    useAccountDialogDraft({
      mode: DIALOG_MODES.ADD,
      url: "https://example.com",
    }),
  )
  act(() => {
    result.current.setManualBalanceUsd("123.45")
    result.current.setSiteName("My site")
  })
  expect(result.current.draft.manualBalanceUsd).toBe("123.45")
  expect(result.current.draft.siteName).toBe("My site")
})
