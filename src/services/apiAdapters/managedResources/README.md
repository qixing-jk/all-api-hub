# Native managed-resource adapters

Each supported managed site has a directory (`axonHub/`, `newApi/`, `octopus/`, etc.). Its `index.ts` implements the native resource registration. It is a composition entrypoint, not a barrel of internal helpers.

Provider-specific editor projections, display facts, native operations and migration policies stay inside that site's directory. Cross-site code belongs in `shared/`; the New API family shares its facts and field policies in `newApiFamily/`. The registry, factory and channel-import workflow remain at the root.

Import the site directory for its registration, and import a specific internal module for an operation or policy. Do not make an internal module import its own registration entrypoint. Tests mirror this layout under `tests/services/apiAdapters/managedResources/`.
