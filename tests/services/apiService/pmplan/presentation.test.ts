import { createInstance } from "i18next"
import { expect, it } from "vitest"

import { getKeyResourcePresentationPolicy } from "~/features/KeyManagement/presentation/keyResourcePresentationPolicy"
import { getNativeKeyResourceEditorPresentation } from "~/features/KeyManagement/presentation/nativeKeyResourceFieldPolicy"
import enKeys from "~/locales/en/keyManagement.json"

it("explains dynamic model access, inherited rolling limits and required custom expiry", async () => {
  const i18n = createInstance()
  await i18n.init({ lng: "en", resources: { en: { keyManagement: enKeys } } })
  const fields = getNativeKeyResourceEditorPresentation("pmplan", "create")
    .policy.fields
  expect(
    fields.find((field) => field.fieldId === "models")?.resolveHelp?.(i18n.t),
  ).toContain("future")
  expect(
    fields.find((field) => field.fieldId === "models")?.resolveHelp?.(i18n.t),
  ).toContain("rolling")
  expect(
    fields
      .find((field) => field.fieldId === "expiresAt")
      ?.resolveHelp?.(i18n.t),
  ).toContain("future")
  expect(
    fields
      .find((field) => field.fieldId === "expiresAt")
      ?.resolveHelp?.(i18n.t),
  ).not.toContain("empty")
})

it("uses the native PM-Plan editor and cards", () => {
  expect(getKeyResourcePresentationPolicy("pmplan")).toMatchObject({
    editor: "pmplan",
    card: "native",
  })
})
