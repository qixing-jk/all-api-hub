# Storage Guidance

Read this when adding or changing a persistent store, a storage key, or a write that crosses extension contexts.

## Every read-modify-write runs under one lock

The options page, the popup, the content script, and the service worker are separate JS contexts writing the same `chrome.storage.local` keys. A store that reads a value, changes part of it, and writes the whole object back will silently discard a concurrent write unless the read and the write happen under the same lock.

- Take the lock with `withExtensionStorageWriteLock(<name>, ...)` from `~/services/core/storageWriteLock`, and register the name in `STORAGE_LOCKS` (`~/services/core/storageKeys`) so the next author can find it.
- Read **inside** the lock. A value read before the lock is a snapshot, and writing a snapshot back is the defect: it reverts whatever landed in between, with no error anywhere.
- Keep the critical section as short and as synchronous as the store allows. Awaiting unrelated work inside it widens the window, and awaiting a nested lock on the same name deadlocks — the lock is not reentrant.

## Expose a mutation, not a whole-object setter

The store owns the transaction; callers describe how the next value derives from the current one.

- Give the store one mutation entry point shaped like `AccountConfigStore.mutate` (`(current) => { result, changed }`) or `AutoCheckinStorage.updateStatus` (`(current) => { patch, result }`).
- Return derived values through `result` rather than assigning to a variable captured from the caller's scope; the caller may be a background flow whose notifications and analytics need what the write produced.
- Do not export a setter that accepts a whole stored object. If callers can hand over a value they assembled earlier, the snapshot bug comes back — that is why `saveStatus` is no longer part of `AutoCheckinStorage`.
- The read method stays public. Only the write path is restricted.

## Do not write on a failed read

`chrome.storage` reads fail. A store that folds a failed read into "nothing stored" will write the new value on top of an unknown base and drop the stored data. Distinguish "no value stored" from "could not read", and skip the write in the second case.

## Outside writers must join the lock

Tests, migrations, and manual repair tools that write a locked key with a raw `chrome.storage.local.set` bypass the lock, so a locked cycle that read just before the write can still land just after it. Pass the lock to the write helper — `setPlasmoStorageValue(..., { lock })` for E2E, with `seedAutoCheckinStatus` in `e2e/utils/commonUserFlows.ts` as the reference.
