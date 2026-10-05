// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest"

import {
  compatibleStoredUserHint,
  resolveNewApiStoredUserHint,
} from "~/services/accountBrowserSession/newApiStoredUserHint"

afterEach(() => localStorage.removeItem("user"))

it("reads compatible identity storage when no site type is known yet", () => {
  localStorage.setItem("user", JSON.stringify({ id: 7, username: "example" }))
  const hint = resolveNewApiStoredUserHint()
  expect(hint).toBe(compatibleStoredUserHint)
  expect(hint.isPresent()).toBe(true)
  expect(hint.read()).toEqual({ id: 7, username: "example" })
})
