import { expect, it } from "vitest"

import { safariAuthorizationDialog } from "~~/e2e/safari/authorization"

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
