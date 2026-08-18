import assert from "node:assert/strict";
import test from "node:test";
import {
  buildUpserts,
  chunkUtf8,
  snapshotIdFor,
  validateRegimePayload
} from "../workers/regime-d1-store.js";

function fixturePayload() {
  return {
    metadata: {
      dataThrough: "2026-08-17",
      requestedEnd: "2026-08-18",
      generatedAt: "2026-08-17T23:40:38.500Z"
    },
    regimes: [{ weekEnd: "2026-08-17" }],
    assetRegimes: [],
    summary: { latest: { weekEnd: "2026-08-17" } }
  };
}

test("validates required snapshot fields", () => {
  assert.equal(validateRegimePayload(fixturePayload()).metadata.dataThrough, "2026-08-17");
  assert.throws(() => validateRegimePayload({}), /metadata\.dataThrough/);
  assert.throws(() => validateRegimePayload({ ...fixturePayload(), regimes: [] }), /non-empty/);
  assert.throws(() => validateRegimePayload({
    ...fixturePayload(),
    metadata: { ...fixturePayload().metadata, dataThrough: "2026-02-31" }
  }), /dates are invalid/);
  assert.throws(() => validateRegimePayload({
    ...fixturePayload(),
    metadata: { ...fixturePayload().metadata, dataThrough: "2026-08-19" }
  }), /dates are invalid/);
  assert.throws(() => validateRegimePayload({
    ...fixturePayload(),
    summary: { latest: { weekEnd: "2026-08-10" } }
  }), /latest week must match/);
  assert.throws(() => validateRegimePayload({
    ...fixturePayload(),
    regimes: [{ weekEnd: "2026-08-17" }, { weekEnd: "2026-08-10" }]
  }), /strictly ordered/);
});

test("builds stable snapshot ids without punctuation", () => {
  assert.equal(
    snapshotIdFor(fixturePayload(), "01234567-89ab-cdef-0123-456789abcdef"),
    "2026-08-17-0123456789abcdef01234567"
  );
});

test("chunks UTF-8 without splitting surrogate pairs", () => {
  const value = "市场🙂regime".repeat(20);
  const chunks = chunkUtf8(value, 31);
  assert.equal(chunks.join(""), value);
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.ok(Buffer.byteLength(chunk) <= 31);
    assert.equal(chunk.includes("\uFFFD"), false);
  }
});

test("packs D1 upserts below the binding parameter limit", () => {
  const prepared = [];
  const db = {
    prepare(sql) {
      return {
        bind(...values) {
          prepared.push({ sql, values });
          return { sql, values };
        }
      };
    }
  };
  const rows = Array.from({ length: 25 }, (_, index) => ["snapshot", `S${index}`, index]);
  const statements = buildUpserts(db, {
    table: "assets",
    columns: ["snapshot_id", "symbol", "asset_json"],
    rows,
    conflict: "snapshot_id, symbol",
    update: ["asset_json"]
  });
  assert.equal(statements.length, 1);
  assert.ok(prepared[0].values.length <= 96);
  assert.match(prepared[0].sql, /ON CONFLICT\("snapshot_id", "symbol"\)/);
});

test("rejects unsafe SQL identifiers", () => {
  const db = { prepare() { throw new Error("should not prepare"); } };
  assert.throws(() => buildUpserts(db, {
    table: "assets; DROP TABLE assets",
    columns: ["symbol"],
    rows: [["SPY"]],
    conflict: "symbol",
    update: ["symbol"]
  }), /Unsafe SQL identifier/);
});
