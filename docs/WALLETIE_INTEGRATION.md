# Walletie integration

AtDev Cloud is the identity provider currently accepted by Walletie V1. It issues HS256 bearer tokens backed by the D1 users table that Walletie already checks.

## Current status

- AtDev Cloud JWTs can authenticate a user against Walletie V1.
- The shared D1 database contains Walletie's wallet and append-only transaction tables.
- AtDev Cloud does not yet grant Walletie credits automatically.
- No automatic credit grant is made for project creation, file uploads, storage usage, or database queries.

## Trusted reward grants

When a future AtDev Cloud feature has a clearly defined, validated reward event, its trusted server code may call Walletie's internal POST /internal/v1/credits endpoint.

The call must:
- Run only in trusted Worker/server code.
- Use a dedicated WALLETIE_SERVICE_TOKEN stored as a Cloudflare secret.
- Derive the account ID from the verified AtDev Cloud user context, never from an untrusted request field.
- Use a stable idempotency key per reward event.
- Validate eligibility and prevent repeated reward claims before calling Walletie.

Do not expose the service token in dashboard JavaScript, SDKs, project code, API responses, or logs. Do not configure or deploy this integration until the service token and Walletie endpoint are provisioned securely.

## Identity roadmap

AtDev Accounts is a separate OIDC provider using RS256/JWKS. Walletie V1 currently accepts AtDev Cloud HS256 tokens only. Any move to AtDev Accounts SSO requires explicit token validation and a migration-safe mapping of existing account IDs and wallet balances. Email-only account matching is not sufficient.

## Product policy

Walletie credits are virtual and have no monetary value. AtDev Cloud's core backend, database, and storage features must not become inaccessible because a user has no credits.
