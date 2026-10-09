# Feature ownership and file layout

Feature directories own product behavior, including UI shared by several pages.
Within a large feature, group files by workflow: keep the components, React hooks,
state models, and presentation helpers for one workflow together. A hook being a
hook is not enough reason to put it in a feature-wide `hooks/` directory.

The main workflow directories are:

| Feature | Workflow directories |
| --- | --- |
| Account dialog | `detection`, `form`, `checkin`, `saving`, `postSave`, `recovery`, `workspace` |
| Account list | `rows`, `filtering`, `bulk`, `ordering`; the list entrypoint composes these workflows |
| API credential profiles | `editor`, `list`, `allowance`, `associations`, `export`, `verification`, `workspace` |
| Key management | `resources`, `inventory`, `associations`, `managedSite`, `batchExport`, `repair`, `workspace` |
| Model list | `catalog`, `filtering`, `groups`, `pricing`, `verification`, `keySelection`, `presentation` |
| Managed site channels | `editor`, `detail`, `table`, `filters`, `migration`, `deletion`, `modelSync`, `verification`, `workspace` |
| Automatic check-in | `results`, `readiness`, `table`, `pretrigger`, `workspace` |
| Usage analytics | `data`, `filtering`, `charts`, `export`, `workspace` |
| Balance history | `data`, `filtering`, `reporting`, `workspace` |
| Managed site model sync | `data`, `commands`, `results`, `status`, `filters`, `workspace` |
| Site bookmarks | `list`, `editor` |
| Token provisioning | `creation`, `secretDelivery` |
| Import and export | `backup`, `webdav`, `cloudSync` |
| Options overview | `attention`, `automation`, `configuration`, `usage`, `actions`, `permissions`, `workspace` |

Account management's data and action providers live with `data` and `actions`;
dialog state and recovery live in `dialogs`; entrypoint composition lives in
`workspace`. The refresh settings tab keeps its protection bypass settings and
history in `protectionBypass`.

`CredentialExport` owns common export actions and the export dialogs used across
account and credential surfaces. `KiloCodeExport` owns Kilo Code's account export
workflow and its shared model-selection UI. `ManagedSiteWidgets` owns reusable
managed-site configuration, assessment, link, and import UI. Automatic check-in UI
opening and completion belong to `AutoCheckin/pretrigger`.

`Verification/api` and `Verification/cli` own the shared product verification
dialogs; `UpdateLog` owns release history UI. The reusable channel-creation dialog
lives under `ManagedSiteChannels/editor/ChannelDialog`, alongside the channel
editor workflows that it opens.

Keep generic UI primitives in `src/components/ui`, branding in
`src/components/icons`, and application-wide layout widgets in `src/components`.
Shared technical hooks stay in `src/hooks`; preference, analytics, and verification
hooks have their own groups. Product-specific hooks belong to their feature.

Import concrete owners directly inside a feature. Use an explicit public barrel
only when several consumers need a deliberate, small public interface, as with
`ResourceEditor`. Directory creation alone does not require an `index.ts`.
Keep existing runtime entrypoints and lazy-loading boundaries intact.

Tests live under `tests/` and mirror their owner's workflow directory. A test
covering several workflows can remain at the feature or integration level.
