---
name: hermes-mcp-integration
description: Designs, implements, audits, tests, and deploys the multi-user Hermes Agent remote MCP integration for Budget by Digitalport. Use whenever working on Hermes, MCP transport, personal MCP tokens, MCP tools, transaction create/update permissions, revocation, audit logs, or MCP security.
compatibility: Budget by Digitalport FastAPI/PostgreSQL backend; remote MCP client supporting Streamable HTTP or documented Hermes transport.
---

# Hermes MCP Integration

Build the smallest secure multi-user remote MCP integration. Read this file fully before changing MCP code.

## Non-negotiable policy

- Every Budget user may create and revoke their own Hermes connection.
- Derive `user_id` exclusively from the authenticated MCP credential. Never accept `user_id`, email, or `sessionId` from tool arguments.
- Default all capabilities to read-only.
- The only writes allowed:
  - create one transaction
  - preview changes to one transaction
  - update one transaction after explicit confirmation
- Never expose delete, bulk write, arbitrary REST, arbitrary SQL, shell, admin, wallet mutation, category mutation, loan mutation, subscription mutation, debt mutation, or account mutation tools.
- Never send secrets, auth tokens, raw credentials, or unnecessary PII to Hermes/model context.
- Reuse existing application services and validation. Never access unscoped records.

## Required documentation gate

Before implementing transport/config compatibility, obtain and read current Hermes remote MCP documentation. Confirm:

1. Supported transport: Streamable HTTP preferred; SSE only if Hermes requires it.
2. Authorization-header configuration support.
3. MCP protocol/version requirements.
4. Remote server URL/config syntax.
5. Whether Hermes supports OAuth discovery. Do not invent compatibility.

If docs are unavailable, implement no transport assumptions. Ask for the documentation URL.

## Authentication baseline

Use per-user personal MCP tokens for the minimum compatible release unless Hermes OAuth support is confirmed.

- Generate at least 32 random bytes using Python `secrets`.
- Prefix tokens for identification, e.g. `bdp_mcp_`.
- Show plaintext exactly once.
- Store only a SHA-256 digest plus metadata in PostgreSQL.
- Accept token only as `Authorization: Bearer <token>` over HTTPS.
- Never accept tokens in query parameters.
- Never log the Authorization header or plaintext token.
- Token record fields: owner user ID, digest, name, scopes, created time, expiry, last-used time, revoked time.
- Allow list, revoke, rotate. Rotation creates a new token then revokes the old token.
- Fixed scopes: `finance:read`, `transactions:create`, `transactions:update`.
- Apply per-token and per-user rate limits.

Upgrade to OAuth 2.1 Authorization Code + PKCE only after confirmed Hermes support. No custom OAuth protocol.

## MCP tool allowlist

Read-only:

- `get_financial_summary`
- `list_wallets`
- `list_transactions`
- `get_transaction`
- `list_categories`
- `get_budgets`
- `list_subscriptions`
- `list_loans`
- `list_debts`
- `get_financial_analysis`

Write:

- `create_transaction`
- `preview_transaction_update`
- `update_transaction`

No generic `call_api` tool.

## Write safeguards

### Create transaction

- Require an idempotency key.
- Validate type, amount, date, description lengths, wallet ownership, category ownership, and accepted enum values.
- Reject unknown fields.
- Return the created transaction plus audit ID.

### Update transaction

1. `preview_transaction_update` accepts transaction ID, explicit patch, and `expected_updated_at`.
2. Verify transaction ownership and allowed fields.
3. Return before/after values plus a cryptographically random, single-use confirmation token.
4. Store only confirmation-token digest. Bind it to user, MCP token, transaction, exact normalized patch, and expiry.
5. `update_transaction` requires that token. Expire after five minutes or first use.
6. Recheck ownership, optimistic concurrency, wallet/category ownership, and normalized patch before commit.
7. Consume token atomically with update.

Never allow update of ownership IDs, internal linkage IDs, audit fields, or deletion state.

## API boundary

Expose a dedicated MCP endpoint, ideally `/mcp`, separate from browser REST routes. Add only the minimum token-management routes needed by the authenticated portal UI. Keep browser session auth and MCP token auth separate.

Return safe MCP errors. Do not expose stack traces, SQL, filesystem paths, secrets, or existence of another user's records.

## Audit requirements

Record:

- MCP token ID, never plaintext
- owner user ID
- tool name
- timestamp
- success/failure
- latency
- safe error code
- target record ID where applicable
- redacted before/after fields for writes
- idempotency result

Do not store Authorization headers or model free-text unless explicitly necessary and redacted.

## Implementation workflow

1. Inspect `AGENTS.md`, existing auth, transaction schemas/routes/services, DB startup migrations, rate-limiting patterns, and audit facilities.
2. Verify Hermes docs using the documentation gate.
3. Write a concise threat checklist: cross-user access, token leakage, replay, duplicate create, stale update, confirmation replay, over-posting, logs.
4. Implement the fewest files possible. Prefer stdlib. Add no dependency unless MCP framing cannot be implemented safely with installed packages.
5. Add DB constraints/indexes for unique token digest, expiry/revocation lookup, idempotency, confirmation uniqueness/use.
6. Add one small runnable security-focused test covering:
   - user A cannot read/update user B
   - delete tool absent
   - duplicate idempotency key does not duplicate transactions
   - confirmation token single-use
   - stale update rejected
7. Do not run lint unless explicitly requested.
8. Build/restart API as requested by project conventions. Web deploy: `./build_web.sh && ./restart_web.sh`.
9. Report exact endpoint, Hermes config example, scopes, test result, and remaining ceiling.

## Review checklist

Reject the change if any answer is no:

- Is every query scoped by credential-derived user ID?
- Are tools registered from a static allowlist?
- Is deletion impossible through MCP?
- Are token plaintext and Authorization headers absent from DB/logs?
- Are write schemas strict and field-limited?
- Is create idempotent?
- Is update previewed, confirmed, single-use, and concurrency-safe?
- Can users revoke their own token?
- Are rate limits and audits present?
- Did a cross-user isolation test run?

## Deliberate ceiling

`ponytail:` Initial personal bearer tokens depend on secure user-side token storage. Upgrade to OAuth 2.1 Authorization Code + PKCE when Hermes documentation confirms compatible remote MCP OAuth discovery and redirect behavior.
