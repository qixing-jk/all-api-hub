## Why

Users can browse models in the Account Model List UI, but they cannot quickly tell whether they have an enabled API key/token that is actually permitted to use a specific model (e.g., due to model limits on tokens). This leads to avoidable trial-and-error and failed verification/calls when a model looks “available” but no suitable key exists.

## What Changes

- Add a new action in the Account Model List item actions area to create a “corresponding key” for the selected model.
- Add a model→key eligibility check that determines whether the current account has any usable key/token for the selected model.
- When the user triggers create, require/prompt the user to select a key/token that can use the model (or guide them to create one when none exists), and provide clear user-facing feedback.
- Ensure the UX works safely with secrets (no raw key leakage in logs/toasts) and remains consistent with existing Key Management token creation/edit flows.

## Capabilities

### New Capabilities
- `model-key-compatibility`: Determine whether a model is usable for an account based on the account’s available keys/tokens, and provide a guided UI flow to select or create a key/token for that model from the Model List page.

### Modified Capabilities
- (none)

## Impact

- Options UI: Model List page/model item action area, new dialogs or integrations with existing token dialogs.
- Services: token inventory loading and token creation/update APIs for supported site types; local model↔token eligibility logic.
- i18n: new `modelList` (and possibly key-related) strings across locales.
- Tests: component/behavior tests for the new model→key validation and the create/select flow.
