# Native managed-resource adapters

Each supported managed site has a registration module (`axonHub.ts`, `newApi.ts`, `octopus.ts`, etc.). It is a composition entrypoint, not a barrel of internal helpers.

Provider-specific editor projections, display facts, native operations and migration policies sit alongside the registration module with a matching provider prefix, such as `axonHubNativeOperations.ts`. Shared helpers, the registry, factory and channel-import workflow also live here; New API family facts and field policies use the `newApiFamily` prefix.

Import the provider registration module for its registration, and import a specific module for an operation or policy. Do not make an internal module import its own registration entrypoint. Tests live under `tests/services/apiAdapters/managedResources/`, with registration suites in provider subdirectories such as `axonHub/index.test.ts` and helper suites at the root.
