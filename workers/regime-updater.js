const DATA_KEY = "regimes/latest.json";
const STATUS_KEY = "regimes/status.json";
const HISTORY_PREFIX = "regimes/history/";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/data/regimes.json") {
      return serveRegimeData(env);
    }

    if (url.pathname === "/api/regime-update/status") {
      return serveStatus(env);
    }

    if (url.pathname === "/api/regime-update/run") {
      if (!isAuthorized(request, env)) {
        return json({ error: "Unauthorized" }, 401);
      }
      const dispatched = await dispatchWorkflow(env, { reason: "manual" });
      return json(dispatched, dispatched.ok ? 202 : 502);
    }

    if (url.pathname === "/api/regime-update/publish") {
      if (!isAuthorized(request, env)) {
        return json({ error: "Unauthorized" }, 401);
      }
      if (request.method !== "POST") {
        return json({ error: "POST required" }, 405);
      }
      const published = await publishRegimeData(request, env);
      ctx.waitUntil(writeStatus(env, published));
      return json(published, published.ok ? 200 : 400);
    }

    return json(
      {
        service: "regimealpha-updater",
        endpoints: ["/data/regimes.json", "/api/regime-update/status", "/api/regime-update/run"]
      },
      200
    );
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(dispatchWorkflow(env, { reason: "cron", cron: event.cron }).then((status) => writeStatus(env, status)));
  }
};

async function serveRegimeData(env) {
  const body = await env.REGIME_KV.get(DATA_KEY);
  if (!body) {
    return json(
      {
        error: "Regime data has not been published yet.",
        statusUrl: "/api/regime-update/status"
      },
      503
    );
  }

  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300, stale-while-revalidate=3600",
      "access-control-allow-origin": "*"
    }
  });
}

async function serveStatus(env) {
  const body = await env.REGIME_KV.get(STATUS_KEY);
  if (!body) {
    return json({
      ok: false,
      message: "No Worker update has completed yet.",
      generatedAt: new Date().toISOString()
    });
  }
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*"
    }
  });
}

async function dispatchWorkflow(env, context = {}) {
  const owner = env.GITHUB_OWNER || "chenzixin1";
  const repo = env.GITHUB_REPO || "RegimeAlpha";
  const workflowId = env.GITHUB_WORKFLOW_ID || "update-regime-kv.yml";
  const startedAt = new Date().toISOString();

  if (!env.GITHUB_DISPATCH_TOKEN) {
    return {
      ok: false,
      phase: "dispatch",
      error: "GITHUB_DISPATCH_TOKEN is not configured.",
      startedAt
    };
  }

  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      "user-agent": "regimealpha-updater-worker"
    },
    body: JSON.stringify({
      ref: "main",
      inputs: {
        reason: context.reason || "worker"
      }
    })
  });

  const status = {
    ok: response.status === 204,
    phase: "dispatch",
    reason: context.reason || "unknown",
    cron: context.cron || null,
    workflow: workflowId,
    githubStatus: response.status,
    startedAt,
    finishedAt: new Date().toISOString()
  };

  if (!status.ok) {
    status.error = await response.text();
  }

  return status;
}

async function publishRegimeData(request, env) {
  const startedAt = new Date().toISOString();
  const body = await request.text();
  let payload;

  try {
    payload = JSON.parse(body);
  } catch {
    return {
      ok: false,
      phase: "publish",
      startedAt,
      finishedAt: new Date().toISOString(),
      error: "Request body is not valid JSON."
    };
  }

  const dataThrough = payload?.metadata?.dataThrough;
  if (!dataThrough || !payload?.summary?.latest || !Array.isArray(payload?.regimes)) {
    return {
      ok: false,
      phase: "publish",
      startedAt,
      finishedAt: new Date().toISOString(),
      error: "Payload does not look like RegimeAlpha data."
    };
  }

  await env.REGIME_KV.put(DATA_KEY, `${body.trim()}\n`, {
    metadata: {
      dataThrough,
      generatedAt: payload.metadata.generatedAt
    }
  });
  await env.REGIME_KV.put(`${HISTORY_PREFIX}${dataThrough}.json`, `${body.trim()}\n`, {
    metadata: {
      generatedAt: payload.metadata.generatedAt
    }
  });

  return {
    ok: true,
    phase: "publish",
    startedAt,
    finishedAt: new Date().toISOString(),
    dataThrough,
    requestedEnd: payload.metadata.requestedEnd,
    generatedAt: payload.metadata.generatedAt,
    bytes: body.length,
    weeks: payload.regimes.length,
    latest: {
      weekEnd: payload.summary.latest.weekEnd,
      code: payload.summary.latest.code,
      labelZh: payload.summary.latest.labelZh,
      ret13w: payload.summary.latest.metrics?.ret13w,
      confidence: payload.summary.latest.confidence
    }
  };
}

async function writeStatus(env, status) {
  await env.REGIME_KV.put(STATUS_KEY, `${JSON.stringify(status, null, 2)}\n`);
}

function isAuthorized(request, env) {
  if (!env.UPDATE_TOKEN) return false;
  const url = new URL(request.url);
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  return bearer === env.UPDATE_TOKEN || url.searchParams.get("token") === env.UPDATE_TOKEN;
}

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "cache-control": "no-store",
      "access-control-allow-origin": "*"
    }
  });
}
