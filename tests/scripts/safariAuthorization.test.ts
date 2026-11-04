import { expect, it } from "vitest"

import {
  decodeHostedRunnerPassword,
  safariAuthorizationDialog,
  unneededWebsitePermissionDialog,
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

it("denies only the generated trial's unrelated public-directory permission prompt", () => {
  const trial = "All API Hub Native Cookie Trial 20261104084950096"
  const prompt = {
    app: "Safari",
    text: `The extension “${trial}” would like to access ldoh.105117.xyz.`,
    buttons: ["Allow for One Day", "Deny", "Always Allow"],
  }
  expect(unneededWebsitePermissionDialog([prompt], trial)).toBe(true)
  expect(unneededWebsitePermissionDialog([prompt], "All API Hub")).toBe(false)
  expect(
    unneededWebsitePermissionDialog(
      [
        {
          ...prompt,
          text: prompt.text.replace("ldoh.105117.xyz", "localhost"),
        },
      ],
      trial,
    ),
  ).toBe(false)
  expect(
    unneededWebsitePermissionDialog(
      [{ ...prompt, buttons: ["Always Allow"] }],
      trial,
    ),
  ).toBe(false)
  expect(
    unneededWebsitePermissionDialog([{ ...prompt, app: "Mail" }], trial),
  ).toBe(false)
})
