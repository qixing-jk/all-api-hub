## Context

The managed-site channel import flow is triggered from Key Management and other entry points through `useChannelDialog().openWithAccount()` and `openWithCredentials()`. Those helpers resolve the token secret, call the active managed-site provider's `prepareChannelFormData()`, and then open the shared channel dialog with prefilled models.

The nearest existing building blocks are:

- `src/components/dialogs/ChannelDialog/hooks/useChannelDialog.ts`: reuse as the entry point that prepares dialog state and opens the shared create-channel form.
- `src/services/managedSites/providers/{newApi,doneHub,octopus,veloera}.ts`: extend each provider's `prepareChannelFormData()` behavior because that is where the current hard failure happens.
- `src/services/managedSites/utils/fetchTokenScopedModels.ts`: reuse the shared helper that probes only the selected key's live upstream `/models` result.
- `src/components/dialogs/ChannelDialog/components/ChannelDialog.tsx`: reuse the existing editable models picker, which already supports custom manual entry through `CompactMultiSelect allowCustom`.

Today, each provider's `prepareChannelFormData()` directly calls `fetchOpenAICompatibleModelIds(...)` and throws when the result is empty. That means a transient upstream models failure blocks the entire "export key to channel" flow before the user can review or edit the payload, even though the dialog already supports manual model entry.

## Goals / Non-Goals

**Goals:**

- Keep managed-site channel import/export flows usable when upstream model preloading fails.
- Limit automatic channel-model prefill to the selected key's live upstream model list.
- Preserve the existing duplicate-detection, secret-resolution, and channel-save flows.

**Non-Goals:**

- Changing how channel creation validates the final submitted model list.
- Adding a new background model cache or a new cross-provider model service abstraction.
- Changing unrelated export flows such as Kilo Code or CC Switch.

## Decisions

### 1. Keep automatic prefill limited to the key's live upstream model list

Managed-site channel prefill should use only the selected key's live upstream model-list result. Token metadata fields such as `token.models` / `model_limits` and account-wide available-model APIs must not be auto-used as substitute prefill sources for this flow.

Why this approach:

- It preserves the strictest semantics for "models of this key" instead of mixing in broader or stale metadata.
- It avoids treating backend-configured restriction metadata as if it were the current upstream capability result.
- It keeps the dialog honest: when the real key-level probe fails, the UI falls back to manual entry instead of pretending a derived list is authoritative.

Alternative considered:

- Reuse token metadata or account-level available models as fallback prefill candidates.
- Rejected because both can diverge from the selected key's actual upstream `/models` result.

### 2. Treat preload failure as non-blocking, but keep submitted models explicit

If the live upstream model-list cannot be loaded, the dialog should still open with an empty, editable model picker so the user can enter models manually.

Why this approach:

- It matches the user's intent: fetch failure must not block the export/import action itself.
- It avoids inventing a fake placeholder model that could create an incorrect channel silently.
- It keeps the current safety bar that a final channel submission still requires intentional model input.
- It lets the UI tell the user exactly why the model field is empty instead of leaving them to infer it from a failed save attempt.

Alternative considered:

- Auto-insert a default placeholder model so the create action can proceed without user input.
- Rejected because it hides missing data and risks creating broken downstream channels.

### 3. Surface preload failure as explicit warning guidance

Model preload failures during dialog preparation should be logged as non-fatal diagnostics and also passed into the dialog as an explicit warning state when the dialog opens with no automatically loaded models.

Why this approach:

- It keeps the flow unblocked without hiding that automatic prefill failed.
- It gives the operator immediate guidance before they try to save.
- It keeps the warning scoped to the affected entry paths instead of turning the generic dialog hint into conditional logic everywhere.

Alternative considered:

- Rely only on the submit-time `modelsRequired` validation toast.
- Rejected because it waits too long and makes the empty model field look ambiguous.

### 4. Keep failure reporting diagnostic-only unless save is attempted

Model preload failures during dialog preparation should be logged as non-fatal diagnostics and, where needed, surfaced as advisory guidance rather than as a blocking operation failure. The actual blocking point remains channel submission when the model list is still empty.

Why this approach:

- It prevents a noisy fatal toast for a recoverable situation.
- It keeps user-visible failure semantics aligned with the true failure point: creating a channel without models.

Alternative considered:

- Preserve the current fatal error toast from `openWithAccount()`.
- Rejected because it contradicts the desired behavior and prevents manual recovery in the dialog.

## Risks / Trade-offs

- [Live upstream model probing fails transiently] → Open the dialog with an empty editable model picker instead of aborting the flow.
- [Users may miss that prefill failed] → Show a warning banner inside the model section before the user attempts submission.
- [Different provider files can drift in behavior] → Apply the same fallback contract to each provider's `prepareChannelFormData()` and validate the shared flow through the dialog entry points.
