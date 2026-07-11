const DEFAULT_BASE_URL = "https://api.massive.com";

export function resolveMassiveConfig(source = {}) {
  const apiKey = String(source.MASSIVE_API_KEY || "").trim();
  const baseUrl = normalizeOrigin(source.MASSIVE_BASE_URL || DEFAULT_BASE_URL);
  const wsUrl = source.MASSIVE_WS_URL ? normalizeOrigin(source.MASSIVE_WS_URL) : null;
  const allowInsecure = String(source.MASSIVE_ALLOW_INSECURE_HTTP || "") === "1";

  if (!apiKey) throw new Error("MASSIVE_API_KEY is not configured.");
  for (const url of [baseUrl, wsUrl].filter(Boolean)) {
    if (["http:", "ws:"].includes(url.protocol) && !allowInsecure) {
      throw new Error(`Refusing insecure Massive transport for ${url.origin}. Set MASSIVE_ALLOW_INSECURE_HTTP=1 to opt in.`);
    }
  }

  return { apiKey, baseUrl, wsUrl, allowInsecure };
}

export function redactMassiveSecret(value, apiKey = "") {
  let output = String(value || "");
  if (apiKey) output = output.split(apiKey).join("<redacted>");
  return output.replace(/([?&](?:apiKey|api_key)=)[^&\s]+/gi, "$1<redacted>");
}

function normalizeOrigin(value) {
  const url = new URL(String(value));
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url;
}

