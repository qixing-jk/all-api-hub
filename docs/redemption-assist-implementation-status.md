# Redemption Assist Feature - Implementation Status

## Overview
This document tracks the progress of implementing the Redemption Assist feature as specified in the ticket: "Redemption Assist (revised): in-page toast, auto, custom check-in only"

## ✅ Completed Components

### 1. Type Definitions
- **Location**: `types/redemptionAssist.ts`, `types/messages.ts`
- **Features**:
  - `RedemptionAssistConfig`: User preference configuration
  - `RedemptionAccountCandidate`: Account selection data structure
  - `RedemptionAction`, `RedemptionStatus`, `RedemptionResult`: Flow types
  - Message types for content ↔ background communication:
    - `REDEMPTION_PROMPT`
    - `REDEMPTION_DECISION`
    - `REDEMPTION_RESULT`

### 2. User Preferences Integration
- **Location**: `services/userPreferences.ts`, `contexts/UserPreferencesContext.tsx`
- **Features**:
  - Added `redemptionAssist: RedemptionAssistConfig` to UserPreferences interface
  - Default configuration: `{ enabled: true }`
  - Reset method: `resetRedemptionAssist()`
  - Context provider methods: `updateRedemptionAssist()`, `resetRedemptionAssist()`
  - Exposed in context as `redemptionAssist` property

### 3. Redemption Service
- **Location**: `services/redeemService.ts`
- **Features**:
  - `isPossibleRedemptionCode(code: string): boolean`
    - Validates 32-character hexadecimal codes
    - Case-insensitive, trims whitespace
    - Pattern: `/^[a-f0-9]{32}$/i`
  - `redeemCodeForAccount(accountId: string, code: string): Promise<RedemptionResult>`
    - Calls `/api/user/topup` endpoint
    - Handles account validation
    - Returns success/error with localized messages
    - Includes site-specific error details

### 4. Account Storage Helpers
- **Location**: `services/accountStorage.ts`
- **Features**:
  - `getAccountsByCheckInUrl(url: string): Promise<SiteAccount[]>`
    - Matches accounts by `checkIn.customCheckInUrl`
    - Performs origin matching (protocol + hostname + port)
    - Path prefix matching with normalization
    - Handles URL parsing errors gracefully

### 5. Translation Files
- **Locations**: `locales/zh_CN/redemptionAssist.json`, `locales/en/redemptionAssist.json`
- **Keys**:
  - `title`, `description`: Feature metadata
  - `enabled`, `enabledDesc`: Settings toggle
  - `toast.*`: In-page toast prompts and actions
  - `messages.*`: Success/error messages
  - `errors.*`: Error messages
  - `accountSelect.*`: Account selection UI
- **Settings tabs updated**: `locales/{zh_CN,en}/settings.json`

### 6. Settings UI
- **Location**: `entrypoints/options/pages/BasicSettings/components/RedemptionAssistTab.tsx`
- **Features**:
  - Settings section with enable/disable toggle
  - Integrated into BasicSettings page as new tab
  - Reset functionality with confirmation dialog
  - Uses unified `SettingSection` component pattern
  - Anchor ID: `#redemption-assist`

### 7. Tests
- **Location**: `tests/services/redeemService.test.ts`
- **Coverage**:
  - `isPossibleRedemptionCode()` validation tests
  - Valid 32-char hex codes (lowercase, uppercase, mixed)
  - Invalid formats (wrong length, non-hex chars, empty/null/undefined)
  - Whitespace trimming
  - Case-insensitivity
  - ✅ All tests passing

## 🚧 Remaining Work

### 1. Content Script - Code Detection & Toast UI
- **File to create**: `entrypoints/content/redemption-assist.ts` (placeholder exists)
- **Requirements**:
  - Check if current URL matches any account's `customCheckInUrl`
  - Listen to clipboard API (best-effort, gated by browser policies)
  - Scan visible text nodes on page load and mutations
  - Listen to paste events
  - Detect codes using `isPossibleRedemptionCode()`
  - Send detection to background script
  - Render in-page toast component when prompted by background

### 2. Toast Component
- **File to create**: `components/RedemptionToast.tsx` or inline in content script
- **Requirements**:
  - Prompt toast:
    - Title: "检测到兑换码，是否兑换？"
    - Display code with mask/unmask toggle
    - Actions: [自动兑换] [手动兑换] [取消]
    - Optional checkbox: "本代码10分钟内不再提示"
  - Result toast:
    - Success: Show site name and success message
    - Error: Show error and [改为手动兑换] button
  - Queue management: Max 3 prompts, skip beyond
  - Styling: Should not conflict with page styles, use shadow DOM or scoped styles

### 3. Background Script - Detection Orchestration
- **File to update**: `entrypoints/background.ts`
- **Requirements**:
  - Listen for detection messages from content scripts
  - Check if feature is enabled via `userPreferences.redemptionAssist.enabled`
  - Maintain dedup cache: `{url, code}` with 10-minute TTL
  - Implement cool-down period (3-5s) to avoid repeated prompts
  - On detection:
    - Find matching accounts via `accountStorage.getAccountsByCheckInUrl()`
    - Send `REDEMPTION_PROMPT` to content script with account candidates
  - On decision from content:
    - **Auto**: Call `redeemService.redeemCodeForAccount()`
    - **Manual**: Trigger `_openRedeemPage()`, copy code to clipboard
    - Send `REDEMPTION_RESULT` back to content script
  - Handle account selection if multiple matches

### 4. Account Selection Flow
- **Integration**: Use existing `useAccountSearch` hook and search UI
- **Requirements**:
  - When multiple accounts match, show account selection in toast or modal
  - Allow user to search/filter accounts
  - Once selected, continue with auto or manual redeem
  - Could be a lightweight overlay invoked from toast

### 5. Dedup & Cache Service
- **File to create**: `services/redemptionDetection/dedupCache.ts`
- **Requirements**:
  - Store `{url, code}` pairs with timestamps
  - TTL: 10 minutes
  - Cleanup expired entries periodically
  - Check if `{url, code}` seen recently
  - Cool-down timer: 3-5 seconds between same detection

### 6. Browser Permissions & Manifest
- **File to update**: `wxt.config.ts` or manifest configuration
- **Requirements**:
  - Add `clipboardRead` permission (optional, for clipboard detection)
  - Dynamically generate host permissions for stored `customCheckInUrl` patterns
  - Keep minimal scope - only pages with custom check-in URLs
  - Content script registration for dynamic URL list

### 7. Messaging Integration
- **Files to update**: `utils/browserApi.ts` or create messaging helpers
- **Requirements**:
  - Message passing between content script and background
  - Type-safe message handlers
  - Handle message timeouts and errors
  - Ensure message flow: detection → prompt → decision → result

### 8. Additional Tests
- **Files to create**:
  - `tests/services/accountStorage.test.ts` (add URL matching tests)
  - `tests/services/redemptionDetection/dedupCache.test.ts`
  - `tests/services/redemptionDetection/detection.test.ts`
  - Integration tests for messaging flow
- **Coverage needed**:
  - URL → account mapping with various URL patterns
  - Dedup cache behavior and expiration
  - Cool-down timer
  - Message passing and error handling
  - Toast rendering and user interactions

## Technical Notes

### URL Matching Strategy
The implemented `getAccountsByCheckInUrl()` method:
1. Parses both target URL and stored `customCheckInUrl`
2. Matches origin exactly (protocol + hostname + port)
3. For path matching:
   - Exact match if paths are identical
   - Prefix match: normalizes check-in path with trailing slash
   - Example: `https://example.com/check-in` matches `https://example.com/check-in/sub-page`

### API Endpoint
The redemption API endpoint is `/api/user/topup` with:
- Method: POST
- Body: `{ key: <code> }`
- Auth: Uses account's `authType` and access token
- Response: Standard API response format `{ success: boolean, message?: string }`

### Translation Integration
The feature uses i18next for translations. All user-facing strings should use:
```typescript
import { t } from "i18next"
t("redemptionAssist:toast.title") // "检测到兑换码，是否兑换？"
```

## Next Steps (Priority Order)

1. **Implement dedup cache service** - Foundation for preventing duplicate prompts
2. **Add background message handlers** - Orchestration layer
3. **Implement content script detection** - Core detection logic
4. **Create toast component** - User interaction layer
5. **Integrate account selection** - Multi-account handling
6. **Add comprehensive tests** - Quality assurance
7. **Update manifest/permissions** - Browser API access
8. **End-to-end testing** - Full flow validation

## Testing Checklist

- [ ] Code detection works on custom check-in pages
- [ ] No detection on non-matching pages
- [ ] Toggle in settings enables/disables feature
- [ ] Auto redeem calls correct API and shows success/error
- [ ] Manual redeem opens correct page and copies code
- [ ] Dedup prevents duplicate prompts within 10 minutes
- [ ] Cool-down prevents flapping
- [ ] Multiple accounts trigger selection UI
- [ ] Single account proceeds without selection
- [ ] Toast UI renders correctly without breaking page styles
- [ ] All translations display correctly in zh_CN and en

## Dependencies

- Existing account search infrastructure (`features/AccountManagement/hooks/useAccountSearch.ts`)
- Browser messaging utilities (`utils/browserApi.ts`)
- Account storage system (`services/accountStorage.ts`)
- User preferences system (`services/userPreferences.ts`)
