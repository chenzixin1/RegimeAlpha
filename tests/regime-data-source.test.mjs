import assert from "node:assert/strict";
import test from "node:test";
import { onRequestGet as exportRegimeData } from "../functions/api/export.js";
import { loadRegimeDataFromService } from "../lib/regime-data-source.js";

const CURRENT_SNAPSHOT = {
  metadata: { dataThrough: "2026-08-28" },
  summary: {
    latest: { weekEnd: "2026-08-28", code: "sideways_quiet" },
    assets: { latest: [] }
  },
  regimes: [{ weekEnd: "2026-08-28", code: "sideways_quiet" }],
  assetRegimes: []
};

test("loads market data through the updater service binding", async () => {
  let requestedUrl;
  const data = await loadRegimeDataFromService({
    REGIME_DATA_SERVICE: {
      async fetch(request) {
        requestedUrl = request.url;
        return Response.json(CURRENT_SNAPSHOT);
      }
    }
  }, "https://regimealpha.chenzixin.uk/api/export?symbol=SPY");

  assert.equal(requestedUrl, "https://regimealpha.chenzixin.uk/data/regimes.json");
  assert.equal(data.metadata.dataThrough, "2026-08-28");
});

test("fails closed instead of falling back to checked-in static data", async () => {
  await assert.rejects(
    loadRegimeDataFromService({}, "https://regimealpha.chenzixin.uk/api/export"),
    /REGIME_DATA_SERVICE is not configured/
  );
});

test("rejects incomplete service snapshots", async () => {
  await assert.rejects(
    loadRegimeDataFromService({
      REGIME_DATA_SERVICE: { fetch: async () => Response.json({ metadata: {} }) }
    }),
    /incomplete snapshot/
  );
});

test("rejects snapshots whose metadata and latest week disagree", async () => {
  await assert.rejects(
    loadRegimeDataFromService({
      REGIME_DATA_SERVICE: {
        fetch: async () => Response.json({
          metadata: { dataThrough: "2026-08-28" },
          summary: { latest: { weekEnd: "2026-08-17" } }
        })
      }
    }),
    /inconsistent snapshot/
  );
});

test("exports the snapshot returned by the updater service binding", async () => {
  const response = await exportRegimeData({
    request: new Request("https://regimealpha.chenzixin.uk/api/export"),
    env: {
      REGIME_DATA_SERVICE: { fetch: async () => Response.json(CURRENT_SNAPSHOT) }
    }
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-regime-data-through"), "2026-08-28");
  assert.equal(payload.metadata.dataThrough, "2026-08-28");
  assert.equal(payload.latest.weekEnd, "2026-08-28");
});
