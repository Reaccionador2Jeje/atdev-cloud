# AtDev Billing — Hybrid plans (AtDev Cloud)

**Status:** proposal only. Existing open-source/self-hosted functionality remains free; no real payments are enabled.

## Hybrid model

Users may self-host AtDev Cloud without a subscription. Optional AtDev-operated hosting can offer convenience and managed capacity. Do not put authentication, export, or basic project portability behind a paywall.

## Proposed plans (CLP/month; exploratory)

| Plan | Reference price | Benefits |
| --- | ---: | --- |
| Self-hosted / Free | $0 | Open-source deployment and basic project usage |
| Hosted Starter | $990 | Small hosted project quota and basic file storage |
| Hosted Plus | $1,990 | Higher project, API, and storage quotas |
| Hosted Developer | $2,490 | Additional environments, usage metrics, and team conveniences |

Prices are not approved launch prices. Calculate D1/R2/Worker usage, bandwidth, support, payment fees, and taxes before offering hosted capacity.

## Suggested entitlements

- `cloud.projects.max`
- `cloud.api.requests.monthly`
- `cloud.storage.bytes`
- `cloud.environments.max`
- `cloud.analytics.advanced`

Enforce quotas in authenticated Worker routes, not in browser code. Resolve the user's plan from trusted server-side entitlements. Missing Billing service must fall back safely to Free limits; it must never grant elevated access.

## Identity and data boundaries

Use existing AtDev Cloud account IDs as the identity source. Do not duplicate password hashes or credentials in Billing. Store only the minimum subscription reference and entitlement metadata. Never store card numbers, CVV, bank credentials, or payment-provider secrets in this repository.

## Launch gates

Document usage metering, quota reset behavior, cancellation, expiry, refunds, data export/deletion, and service outage handling. Keep checkout disabled until an adult account owner has reviewed payment-provider eligibility, legal/tax obligations, and operational costs.
