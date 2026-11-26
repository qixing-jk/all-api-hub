import { expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { readShellLiveConfig } from "~~/scripts/suites/shell/config.mjs"

it("loads separate native login credentials and optional System tokens from local env", () => {
  const targets = readShellLiveConfig("all", {
    APIYI_USERNAME: "apiyi-user",
    APIYI_PASSWORD: "  exact password  ",
    LAOZHANG_USERNAME: "laozhang-user",
    LAOZHANG_PASSWORD: "other-password",
    LAOZHANG_ACCESS_TOKEN: "existing-system-token",
    LAOZHANG_USER_ID: "42",
  })
  expect(targets).toMatchObject([
    {
      id: "apiyi",
      origin: "https://api.apiyi.com",
      username: "apiyi-user",
      password: "  exact password  ",
      accessToken: "",
    },
    {
      id: "laozhang",
      origin: "https://api2.laozhang.ai",
      username: "laozhang-user",
      password: "other-password",
      accessToken: "existing-system-token",
      expectedUserId: "42",
    },
  ])
})

it("rejects unknown sites and credential destinations outside each provider", () => {
  expect(() => readShellLiveConfig("typo", {})).toThrow(/site/)
  for (const origin of [
    "https://api.apiyi.com.attacker.invalid",
    "https://api2.laozhang.ai",
    "http://api.apiyi.com",
    "https://api.apiyi.com/login",
    "https://user:secret@api.apiyi.com",
    "https://api.apiyi.com?token=secret",
    "https://api.apiyi.com:1234",
  ]) {
    expect(() =>
      readShellLiveConfig(SITE_TYPES.APIYI, { APIYI_BASE_URL: origin }),
    ).toThrow("APIYI_BASE_URL must be an official console origin")
  }
  expect(
    readShellLiveConfig(SITE_TYPES.LAOZHANG, {
      LAOZHANG_BASE_URL: "https://api.laozhang.ai/",
    })[0]?.origin,
  ).toBe("https://api.laozhang.ai")
})
