# New API Security Verification

> For site owners or administrators of systems based on the New API series (New API, DoneHub, Veloera, etc.). When you perform sensitive operations in the extension (e.g., viewing hidden channel keys, modifying critical settings, batch synchronization, etc.), you may need to complete a security verification.

## Why is Verification Needed?

To ensure account security, New API systems usually audit administrator operations. If the following features are enabled in your backend, the extension will guide you through the corresponding verification process:

1. **Two-Factor Authentication (2FA/OTP)**: Requires a 6-digit verification code at login.
2. **Secure Verification**: Requires identity re-confirmation when reading channel keys or making sensitive API calls.
3. **Passkey or Manual Login**: In some environments where login sessions cannot be obtained automatically via the interface, you will be guided to the web interface to complete the login.

## Common Verification Flows

### 1. Login Verification Code
When you first connect to a self-hosted site, or when your login status expires, the extension will pop up a verification window:
- Please open your authenticator app (e.g., Google Authenticator, Bitwarden, etc.).
- Enter the 6-digit verification code and submit.
- Once verified, the extension will automatically save the login session, and subsequent operations will not prompt for verification during the validity period.

### 2. Secondary Verification for Sensitive Operations
In **"Self-hosted Site Management"**, if you attempt to:
- Click **"Show Key"** to view the real key of a channel.
- Perform **"Channel Migration"** which requires extracting private information from the source site.

The extension will pop up a request for a secondary verification code. This is usually the same as your login verification code but has a shorter validity period.

### 3. Passkey or Manual Guidance
If your site is configured with Passkey (WebAuthn) or other verification methods that the extension cannot handle automatically:
- The extension will display **"Manual Verification Required"**.
- Click **"Go to Site to Complete Verification"** and follow the instructions in the pop-up window.
- Once completed, return to the extension and click **"Verification Completed"** to continue.

## Common Issues

| Issue | Solution |
|------|----------|
| **Verification Code Error** | 1. Check if your phone time is synchronized with the server.<br>2. Ensure you are entering the 2FA code for the correct site. |
| **Verification Box Won't Pop Up** | Ensure your `Admin Token` and User ID are correctly configured and that you have sufficient administrative permissions. |
| **Frequent Session Expiration** | Some systems have very short session validity or have IP binding enabled. We recommend checking the backend security settings. |
| **Can't Find 2FA Settings** | Please enable two-factor authentication on the **"Personal Settings"** page of your self-hosted site. |

## Related Documents

- [Self-hosted Site Management](./self-hosted-site-management.md)
- [Managed Site Model Synchronization](./managed-site-model-sync.md)