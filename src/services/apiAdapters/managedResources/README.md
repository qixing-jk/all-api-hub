# Native managed-resource adapters

Each supported managed site has a directory (`axonHub/`, `newApi/`, `octopus/`, etc.). Its `index.ts` implements the native resource registration. It is a composition entrypoint, not a barrel of internal helpers.

Provider-specific editor projections, display facts, native operations and migration policies stay inside that site's directory. Cross-site code belongs in `shared/`; the New API family shares its facts and field policies in `newApiFamily/`. The registry, factory and channel-import workflow remain at the root.

Import the site directory for its registration, and import a specific internal module for an operation or policy. Do not make an internal module import its own registration entrypoint. Tests mirror this layout under `tests/services/apiAdapters/managedResources/`.

## Display contract

The table columns named by `tableFieldIds` and detail rows named by `detailFieldIds` use one accepted projection. Every declared field needs:

1. A projected `ResourceDisplayFact` with the matching field id. A declaration without a fact never appears.
2. A label from the table column or editor field policy. Display-only fields need an entry in `getManagedResourcePresentationSemantics(siteType).detailFieldLabels`; raw field ids are not user-facing labels.
3. A cell presentation. Shared detail cells cover the union of table and detail fields, so a detail-only field does not need a table column. `fieldValuePresentations` may target any displayed field.

Preserve adapter-controlled disclosure of secrets and upstream diagnostic messages. A value's presence in an upstream payload does not make it safe to display.

Extend the existing projection/presentation cases under `tests/features/ManagedSiteChannels/` when changing this contract.
