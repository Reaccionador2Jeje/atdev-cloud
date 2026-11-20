# AtDev Cloud — Ecosystem Integration

Status: coordination plan. Existing D1 identity and project ownership behavior remains authoritative unless a reviewed migration says otherwise.

## Responsibilities
- Keep D1 as the authoritative account and project metadata store described by the current README.
- Keep R2 access behind authenticated, owner-scoped Worker routes.
- Treat AtDev DB as an optional SQL service, not a replacement for D1 identity storage.
- Keep local development and production storage differences explicit.

## Integration rules
1. Do not silently migrate user IDs or password hashes.
2. Never expose service tokens to browser code.
3. Enforce project ownership at every read/write boundary.
4. Use bounded request sizes, explicit CORS allowlists and stable error responses.
5. Keep the AtDev DB proxy disabled unless its endpoint and token are configured.
6. Add contract tests for account compatibility, project isolation and proxy authentication.

## Next verifiable tasks
- Document exact environment variables for each deployment.
- Test that one project cannot access another project's records or files.
- Add health/readiness checks that do not disclose secrets.
- Document rollback steps for D1 migrations and Worker deployments.

## Identity
AtDev Accounts and AtDev Cloud must not become competing sources of truth. Any future OIDC integration needs a written mapping for subject IDs, account linking, session expiry, logout and recovery before implementation.