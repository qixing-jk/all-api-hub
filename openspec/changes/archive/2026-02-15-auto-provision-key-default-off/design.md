## Context

The `account-key-auto-provisioning` capability allows automatically ensuring an eligible account has at least one API token by creating a default token when the remote token list is empty. This is controlled by the user preference `autoProvisionKeyOnAccountAdd`.

The current OpenSpec requirement states the setting defaults to enabled, and the implementation follows that behavior (including a `true` fallback when preferences cannot be read). We want to switch the default to disabled to make the behavior opt-in and reduce surprising upstream writes.

## Goals / Non-Goals

**Goals:**

- Default `autoProvisionKeyOnAccountAdd` to disabled for new installs and for existing installs where the field is missing.
- Keep the setting functional: enabling it should restore the existing auto-provision-on-add behavior.
- Ensure preference-read failures fall back to the configured default (disabled) rather than force-enabling provisioning.
- Align OpenSpec requirements with the implementation to avoid spec drift.

**Non-Goals:**

- Do not force-change users who already have an explicit stored value (e.g., `true`) for this preference.
- Do not change the token provisioning flow, eligibility gating, or manual bulk repair behavior.

## Decisions

- **Default source of truth:** Set `DEFAULT_PREFERENCES.autoProvisionKeyOnAccountAdd = false` and treat it as the fallback value wherever the preference is read.
  - *Rationale:* Keeps behavior consistent and avoids hard-coded `true` fallbacks that can diverge from defaults.
- **No breaking migration:** Rely on preference defaulting/merge behavior so that only missing values adopt the new default; explicit stored values remain respected.
  - *Rationale:* Avoids surprising changes for users who intentionally enabled the feature.

## Risks / Trade-offs

- **Users may expect keys to exist after adding an account** → Mitigation: the toggle remains available and manual “repair missing keys” is still present.
- **Spec/implementation drift risk** → Mitigation: update the spec requirement and archive the change to sync main specs.

## Migration Plan

- Ship the new default (`false`) and ensure account-add behavior uses `DEFAULT_PREFERENCES` for fallbacks.
- No data migration is required; missing preference values will be persisted with the new default on next preference load.
- Rollback is a revert of the default value and fallback behavior.
