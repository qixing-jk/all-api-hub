import { expect, it } from "vitest"

import {
  safariAuthorizationDialog,
  unsignedExtensionPasswordDialog,
} from "~~/e2e/safari/authorization"

it("recognizes the runner's Safari control request and requires an Allow button", () => {
  expect(
    safariAuthorizationDialog([
      {
        app: "SecurityAgent",
        text: "“hosted-compute-agent” wants access to control “Safari”.",
        buttons: ["Don’t Allow", "Allow"],
      },
    ]),
  ).toBe("SecurityAgent")
})

it("only authenticates Safari's unsigned-extension dialog", () => {
  expect(
    unsignedExtensionPasswordDialog([
      {
        app: "Safari",
        text: "Safari is trying to allow unsigned extensions. Enter the password for the user “Anka” to allow this.",
        buttons: ["Cancel", "OK"],
      },
    ]),
  ).toBe(true)
  expect(
    unsignedExtensionPasswordDialog([
      {
        app: "Safari",
        text: "Enter the password to view saved passwords",
        buttons: ["OK"],
      },
    ]),
  ).toBe(false)
})

it("does not authorize requests for other applications or incomplete dialogs", () => {
  expect(
    safariAuthorizationDialog([
      {
        app: "SecurityAgent",
        text: "“hosted-compute-agent” wants access to control “Mail”.",
        buttons: ["Allow"],
      },
      { app: "Safari", text: "Safari website permission", buttons: ["Allow"] },
    ]),
  ).toBeUndefined()
})
