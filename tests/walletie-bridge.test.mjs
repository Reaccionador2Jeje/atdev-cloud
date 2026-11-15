import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (await readFile(new URL("../src/worker.template.js", import.meta.url), "utf8"))
  .replace("__ATDEV_INDEX_HTML__", JSON.stringify("<!doctype html><title>test</title>"));
const { default: worker } = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));

const request = body => new Request("https://cloud.example.com/internal/v1/walletie/grants", {
  method: "POST",
  headers: { "content-type": "application/json", "x-atdev-rewards-token": "r".repeat(40) },
  body: JSON.stringify(body)
});

test("rejects grant calls without the trusted reward token", async () => {
  const req = new Request("https://cloud.example.com/internal/v1/walletie/grants", {
    method: "POST", headers: { "content-type": "application/json" }, body: "{}"
  });
  const response = await worker.fetch(req, {});
  assert.equal(response.status, 401);
});

test("requires Walletie service configuration", async () => {
  const response = await worker.fetch(request({}), { ATDEV_REWARDS_TOKEN: "r".repeat(40) });
  assert.equal(response.status, 503);
});

test("validates reward grant payload before forwarding", async () => {
  const response = await worker.fetch(request({
    owner_id: "user-123", amount: 0, source: "game.reward",
    reference_id: "event-123", idempotency_key: "event-key-123"
  }), {
    ATDEV_REWARDS_TOKEN: "r".repeat(40),
    WALLETIE_SERVICE_TOKEN: "w".repeat(40),
    WALLETIE_URL: "https://walletie.example.com"
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /amount/);
});

test("forwards a validated grant to Walletie and preserves its status", async () => {
  const originalFetch = globalThis.fetch;
  let forwarded;
  globalThis.fetch = async (url, init) => {
    forwarded = { url: String(url), init };
    return Response.json({ transaction: { id: "tx-1" }, replayed: false }, { status: 201 });
  };
  try {
    const response = await worker.fetch(request({
      owner_id: "user-123", amount: 15, source: "librecoding.lesson",
      reference_id: "lesson-123", idempotency_key: "lesson-event-123"
    }), {
      ATDEV_REWARDS_TOKEN: "r".repeat(40),
      WALLETIE_SERVICE_TOKEN: "w".repeat(40),
      WALLETIE_URL: "https://walletie.example.com"
    });
    assert.equal(response.status, 201);
    assert.equal(forwarded.url, "https://walletie.example.com/internal/v1/credits");
    assert.equal(forwarded.init.headers["x-walletie-service-token"], "w".repeat(40));
    assert.deepEqual(JSON.parse(forwarded.init.body), {
      owner_id: "user-123", amount: 15, source: "librecoding.lesson",
      reference_id: "lesson-123", idempotency_key: "lesson-event-123"
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
