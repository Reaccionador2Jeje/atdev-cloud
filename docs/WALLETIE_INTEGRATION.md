# Walletie integration

AtDev Cloud is the identity provider currently accepted by Walletie V1. It issues HS256 bearer tokens backed by the D1 users table that Walletie already checks.

## Current status

- AtDev Cloud JWTs can authenticate a user against Walletie V1.
- The shared D1 database contains Walletie's wallet and append-only transaction tables.
- A trusted backend bridge is implemented at `POST /internal/v1/walletie/grants`.
- No automatic credit grant is made for project creation, file uploads, storage usage, or database queries; product-specific reward validation is still required.

## Trusted reward grants

A trusted reward-producing backend may call AtDev Cloud's `POST /internal/v1/walletie/grants` bridge after validating its own reward event. AtDev Cloud forwards the request to Walletie's internal `POST /internal/v1/credits` endpoint. See [the bridge contract](WALLETIE_REWARD_BRIDGE.md).

The call must:
- Run only in trusted Worker/server code.
- Authenticate to AtDev Cloud with `ATDEV_REWARDS_TOKEN` stored as a Worker secret.
- Configure `WALLETIE_SERVICE_TOKEN` and `WALLETIE_URL` on the AtDev Cloud Worker; keep the Walletie service token secret.
- Derive the account ID from the verified AtDev Cloud user context, never from an untrusted request field.
- Use a stable idempotency key per reward event.
- Validate eligibility and prevent repeated reward claims before calling Walletie.

Do not expose the service token in dashboard JavaScript, SDKs, project code, API responses, or logs. Do not configure or deploy this integration until the service token and Walletie endpoint are provisioned securely.

## Identity roadmap

AtDev Accounts is a separate OIDC provider using RS256/JWKS. Walletie V1 currently accepts AtDev Cloud HS256 tokens only. Any move to AtDev Accounts SSO requires explicit token validation and a migration-safe mapping of existing account IDs and wallet balances. Email-only account matching is not sufficient.

## Product policy

Walletie credits are virtual and have no monetary value. AtDev Cloud's core backend, database, and storage features must not become inaccessible because a user has no credits.
