import { expect } from "vitest"

import {
  KILO_CODE_EXPORT_TARGET_OPTIONS,
  KILO_CODE_EXPORT_TARGETS,
  type KiloCodeExportTarget,
} from "~/services/integrations/kiloCodeExport"

import { screen, within } from "./render"

const GUIDANCE_KEYS_BY_TARGET = {
  [KILO_CODE_EXPORT_TARGETS.KiloV7]: [
    "ui:dialog.kiloCode.help.kiloV7CatalogInstructions",
    "ui:dialog.kiloCode.help.kiloV7DownloadInstructions",
    "ui:dialog.kiloCode.help.kiloV7CopyInstructions",
    "ui:dialog.kiloCode.help.kiloV7ApiKeyEditorNote",
  ],
  [KILO_CODE_EXPORT_TARGETS.Legacy]: [
    "ui:dialog.kiloCode.help.legacySingleModelInstructions",
    "ui:dialog.kiloCode.help.legacyDownloadInstructions",
    "ui:dialog.kiloCode.help.legacyCopyInstructions",
  ],
} as const satisfies Record<KiloCodeExportTarget, readonly string[]>

const SETTINGS_SIZE_GUIDANCE_KEYS = {
  single: "ui:dialog.kiloCode.messages.settingsFileTooLargeSingle",
  multiple: "ui:dialog.kiloCode.messages.settingsFileTooLargeMultiple",
} as const

/** Assert the visible Kilo export guidance and hide guidance for other targets. */
export function expectKiloCodeUsageGuidance(target: KiloCodeExportTarget) {
  const instructionsKeys = GUIDANCE_KEYS_BY_TARGET[target]
  const oppositeTargetInstructionsKeys = KILO_CODE_EXPORT_TARGET_OPTIONS.filter(
    (candidate) => candidate !== target,
  ).flatMap((candidate) => GUIDANCE_KEYS_BY_TARGET[candidate])
  const usageAlert = screen
    .getByText("ui:dialog.kiloCode.help.usageTitle")
    .closest<HTMLElement>('[role="alert"]')!
  const securityAlert = screen
    .getByText("ui:dialog.kiloCode.warning.title")
    .closest<HTMLElement>('[role="alert"]')!

  const renderedInstructions = instructionsKeys.map((instructionsKey) => {
    const renderedInstruction = within(usageAlert).getByText(instructionsKey)
    expect(renderedInstruction).toBeVisible()
    return renderedInstruction
  })
  for (let index = 1; index < renderedInstructions.length; index += 1) {
    expect(
      renderedInstructions[index - 1].compareDocumentPosition(
        renderedInstructions[index],
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  }
  for (const instructionsKey of oppositeTargetInstructionsKeys) {
    expect(screen.queryByText(instructionsKey)).not.toBeInTheDocument()
  }
  expect(screen.getAllByRole("alert").indexOf(usageAlert)).toBeLessThan(
    screen.getAllByRole("alert").indexOf(securityAlert),
  )
  expect(
    screen.queryByText("ui:dialog.kiloCode.help.afterExportTitle"),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByText("ui:dialog.kiloCode.help.manualTitle"),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByText("ui:dialog.kiloCode.help.kiloV7Title"),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByText("ui:dialog.kiloCode.help.legacyTitle"),
  ).not.toBeInTheDocument()
}

/** Assert that oversized-export recovery matches the dialog's selection scope. */
export function expectKiloCodeSettingsSizeGuidance(
  scope: keyof typeof SETTINGS_SIZE_GUIDANCE_KEYS,
) {
  const expectedKey = SETTINGS_SIZE_GUIDANCE_KEYS[scope]
  const oppositeKey =
    SETTINGS_SIZE_GUIDANCE_KEYS[scope === "single" ? "multiple" : "single"]

  expect(screen.getByText(expectedKey)).toBeVisible()
  expect(screen.queryByText(oppositeKey)).not.toBeInTheDocument()
}
