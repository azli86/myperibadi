export const PENDING_SHARED_CHAT_TOKEN_STORAGE_KEY = "pendingSharedChatToken"
export const PENDING_SHARED_TRANSACTION_TOKEN_STORAGE_KEY = "pendingSharedTransactionToken"
export const SHARED_CHAT_TOKEN_QUERY_KEY = "shared"
export const SHARED_TRANSACTION_TOKEN_QUERY_KEY = "shared_txn"

export const SHARED_TRANSACTION_PIN_BYPASS_STORAGE_KEY_PREFIX = "sharedTransactionPinBypass"
export const ACTIVE_SHARED_TRANSACTION_TOKEN_STORAGE_KEY_PREFIX = "activeSharedTransactionToken"

export function getSharedTransactionPinBypassStorageKey(sessionId: string): string {
  return `${SHARED_TRANSACTION_PIN_BYPASS_STORAGE_KEY_PREFIX}:${sessionId}`
}

export function getActiveSharedTransactionTokenStorageKey(sessionId: string): string {
  return `${ACTIVE_SHARED_TRANSACTION_TOKEN_STORAGE_KEY_PREFIX}:${sessionId}`
}
