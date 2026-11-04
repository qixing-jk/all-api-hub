import { expect, it } from "vitest"

import {
  decodeHostedRunnerPassword,
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

it("decodes the hosted image's local auto-login format without its zero padding", () => {
  expect(
    decodeHostedRunnerPassword(
      Uint8Array.from([9, 236, 33, 87, 210, 188, 221, 234, 163, 185, 31]),
    ),
  ).toBe("test")
  expect(() => decodeHostedRunnerPassword(new Uint8Array())).toThrow()
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
