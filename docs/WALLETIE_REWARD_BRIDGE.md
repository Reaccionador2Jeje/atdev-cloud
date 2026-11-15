# Walletie reward bridge

AtDev Cloud exposes a trusted backend bridge that forwards approved reward events to Walletie.

## Endpoint

`POST /internal/v1/walletie/grants`

Required header:

```http
x-atdev-rewards-token: <ATDEV_REWARDS_TOKEN>
Content-Type: application/json
```

Example body:

```json
{
  "owner_id": "existing-atdev-cloud-user-id",
  "amount": 15,
  "source": "librecoding.lesson",
  "reference_id": "completed-lesson-123",
  "idempotency_key": "librecoding-lesson-123"
}
```

The endpoint validates the caller token, amount, source identifier, reference and idempotency key, then forwards the request to Walletie's `/internal/v1/credits`. Walletie remains the only service that changes balances or writes ledger entries. The target account must exist in AtDev Cloud.

## Worker secrets and variables

Configure these on the AtDev Cloud Worker:

- `ATDEV_REWARDS_TOKEN`: a private random secret of at least 32 characters. Only trusted reward-producing backends may know it.
- `WALLETIE_SERVICE_TOKEN`: the same secret configured on Walletie's `WALLETIE_SERVICE_TOKEN`.
- `WALLETIE_URL`: the HTTPS base URL of the Walletie Worker.

Do not put any of these values in browser JavaScript, mobile apps, repositories, or public configuration. Never call this endpoint directly from an untrusted client.

## Important limits

This bridge authenticates a trusted backend caller; it does not prove that a lesson, game achievement, or other reward actually happened. Each product must validate its own reward event before calling this endpoint. Use a stable idempotency key derived from the event ID so retries cannot grant the same reward twice.

Credits are virtual only. Do not use this API for real-money value, deposits, withdrawals, or cash redemption.
