# CRX self-update install policy templates

These files configure the mandatory Chromium policies that let a self-hosted `.crx` install and auto-update outside the stores, as described in [Chromium self-updating install](../../docs/docs/chromium-crx-self-update.md).

| File | Target |
| --- | --- |
| `chrome-install-policy.reg` | Windows, Google Chrome |
| `edge-install-policy.reg` | Windows, Microsoft Edge |
| `chrome-install-policy.mobileconfig` | macOS, Google Chrome |
| `edge-install-policy.mobileconfig` | macOS, Microsoft Edge |

## Before you use them

- Windows Edge requires an Active Directory domain-joined device; Entra-only joined devices are insufficient unless hybrid joined. Importing the registry file does not satisfy this prerequisite. See [Microsoft's prerequisites](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-manage-extensions-webstore#prerequisites).
- `ExtensionInstallSources` trusts both the project GitHub path and `release-assets.githubusercontent.com`, a shared host serving other repositories. Both the CRX URL and its referrer must match, but a matching project page could link to another CRX on that host. `ExtensionInstallAllowlist` only exempts IDs from a blocklist; these templates do not set a global blocklist and do not restrict installation to All API Hub. Import only if you accept that broader trust, verify the source and installed ID, and have an administrator merge any existing policies instead of overwriting them.
- The files already carry the release extension id `oligofghjlogjhmnhnhccnobbginfgmp`; it must match the `appid` in the published `updates.xml`. If the signing key is ever replaced the id changes and these files must be updated.
- Windows: import the `.reg` file from an administrator shell; the policies live under `HKEY_LOCAL_MACHINE`, which is what makes them mandatory. User-level (`HKCU`) edits are ignored.
- macOS: run the profile through MDM or double-click it to install it as a system profile. A user-level plist is not treated as a forced policy.
- Edge on macOS uses `com.microsoft.Edge` in `PayloadType`; the `.mobileconfig` here already does that.

Linux needs no configuration.

Policy semantics: [installation sources](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/extensioninstallsources) and [allowlist exemptions](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/extensioninstallallowlist).
