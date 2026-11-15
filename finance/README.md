# AtDev public finance ledger

This folder contains a small, dependency-free ledger for recording AtDev income and expenses. It starts empty intentionally: no costs or income have been invented.

## Record format

Each entry includes:
- Date (ISO `YYYY-MM-DD`).
- Type: `income` or `expense`.
- Category (for example: `hosting`, `domain`, `donation`, `professional-service`, `development`, `other`).
- Amount and original ISO currency code.
- Status: `confirmed` or `planned`.
- Project and a short public description.
- Optional public reference (for example, a public receipt or release note).

Keep personal and payment information out of the ledger. Use anonymous labels for donations unless the contributor explicitly agrees to public attribution. Never add bank/card details, private invoices, access tokens, or addresses.

## Commands

From the repository root:

```sh
npm run finance:report
npm run finance:add -- '{"date":"2026-11-14","type":"expense","category":"hosting","amount":4.99,"currency":"USD","status":"planned","project":"AtDev Cloud","description":"Example planned monthly hosting cost"}'
```

The example is illustrative only; do not treat it as a real transaction. Use `status: "confirmed"` only after a transaction actually occurs.

The report keeps currencies separate and separates confirmed totals from planned amounts. It does not convert currencies or connect to payment providers.

## Files

- `ledger.json`: public entries; currently empty.
- `schema.json`: JSON Schema for entry validation.
- `../scripts/finance-ledger.mjs`: validator and report generator.

Corrections should be made transparently and explained in the entry notes or commit history.
