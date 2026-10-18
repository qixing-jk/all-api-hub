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

it("marks explicit login edits and clears independently from other fields", () => {
  const { result } = renderHook(() =>
    useAccountDialogDraft({
      mode: DIALOG_MODES.ADD,
      url: "https://example.com",
    }),
  )
  const login = {
    methodId: "password",
    credentials: { username: "alice", password: "secret" },
  }
  act(() => {
    result.current.setSiteName("Retained")
    result.current.setLogin(login)
  })
  expect(result.current.draft.login).toEqual(login)
  expect(result.current.draft.loginChanged).toBe(true)
  act(() => result.current.setLogin(undefined))
  expect(result.current.draft.login).toBeUndefined()
  expect(result.current.draft.loginChanged).toBe(true)
  expect(result.current.draft.siteName).toBe("Retained")
})
