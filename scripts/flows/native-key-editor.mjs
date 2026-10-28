import { KEY_MANAGEMENT_TEST_IDS as keys } from "../../src/features/KeyManagement/testIds.ts"

/** Wait for an accepted native editor and a provider-selected field. */
export async function waitForNativeKeyEditor(
  page,
  { readyField, timeoutMs = 30_000 },
) {
  const editor = page.getByTestId(keys.nativeEditor)
  await editor.waitFor({ state: "visible", timeout: timeoutMs })
  await page
    .getByTestId(keys.nativeEditorLoading)
    .waitFor({ state: "hidden", timeout: timeoutMs })
  const field =
    typeof readyField === "string" || readyField instanceof RegExp
      ? editor.getByLabel(readyField)
      : readyField
  await field.waitFor({
    state: "visible",
    timeout: timeoutMs,
  })
  return editor
}

/** Open create/edit using the caller's actual action and accepted field. */
export async function openNativeKeyEditor(
  page,
  { trigger, readyField, timeoutMs = 30_000 },
) {
  await trigger.click({ timeout: timeoutMs })
  return waitForNativeKeyEditor(page, { readyField, timeoutMs })
}

/** Submit once; the caller owns provider readback and uncertain-write recovery. */
export async function submitNativeKeyEditor(
  page,
  { timeoutMs = 30_000, waitForClose = true } = {},
) {
  const submit = page.getByTestId(keys.nativeEditorSubmitButton)
  await page.getByTestId(keys.nativeEditor).waitFor({
    state: "visible",
    timeout: timeoutMs,
  })
  // Playwright waits for enabled/actionable state before the one dispatch.
  await submit.click({ timeout: timeoutMs })
  // Some suites must retain an upstream ID before any later UI assertion fails.
  if (!waitForClose) return
  try {
    await submit.waitFor({ state: "hidden", timeout: timeoutMs })
  } catch (cause) {
    throw new Error(
      "Native editor did not close after submit; do not replay a dispatched write. Read back the provider result before recovery.",
      { cause },
    )
  }
}
