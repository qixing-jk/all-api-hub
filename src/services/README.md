# Service ownership and file layout

Service directories own product operations and protocol behavior. Keep React state
in features and keep storage transactions with their existing store owners.

Large services group related implementations by responsibility:

| Service | Responsibility directories |
| --- | --- |
| Accounts | `keys`, `identity`, `metrics`, `editing`, `refresh`; existing detection, persistence, storage and post-save owners remain separate |
| Managed sites | `configuration`, `migration`, `matching`, `batchImport`, `providers` |
| OpenRouter adapter | `account`, `keys`, `models` |
| Sub2API API implementation | `auth`, `checkin`, `account`, `models` |
| WebDAV and cloud sync | `autoSync`, `backup`, `sync`, `transport` |
| Product analytics | `facts`, `diagnostics`, `runtime`, `configuration`; event contracts and action entrypoints stay at the root |

Managed-site provider implementations with several helper modules have a provider
directory, such as `providers/newApi`. Their `index.ts` contains the actual service
implementation. A provider implemented by one file can remain a single file.

Keep concrete entrypoints that already implement a public operation, such as the
OpenRouter capability definition and the cloud-sync provider services. Import
helpers from their concrete owners; do not introduce forwarding barrels just to
give each new directory an index.

Shared adapter contracts remain in `apiAdapters/contracts`, and cross-feature
product contracts remain in `src/types`. These deliberately collect the shared
interfaces consumed by different implementations. Technical utility namespaces
also group independent, reusable platform and core operations.

Tests live in `tests/services` and mirror responsibility directories where they
exercise an individual owner. Tests spanning several owners can stay at their
service or integration level.
