export const REQUIRED_MASSIVE_BASE_URL = "https://api.massiveprivateserver.site";
export const REQUIRED_MASSIVE_WS_URL = "wss://socket.massiveprivateserver.site";

export function resolveMassiveConfig(source = {}) {
  const apiKey = String(source.MASSIVE_API_KEY || "").trim();
  const baseUrl = normalizeOrigin(source.MASSIVE_BASE_URL || REQUIRED_MASSIVE_BASE_URL);
  const wsUrl = source.MASSIVE_WS_URL ? normalizeOrigin(source.MASSIVE_WS_URL) : null;

  if (!apiKey) throw new Error("MASSIVE_API_KEY is not configured.");
  if (baseUrl.origin !== REQUIRED_MASSIVE_BASE_URL) {
    throw new Error(`Massive REST requests must use ${REQUIRED_MASSIVE_BASE_URL}.`);
  }
  if (wsUrl && wsUrl.origin !== REQUIRED_MASSIVE_WS_URL) {
    throw new Error(`Massive WebSocket requests must use ${REQUIRED_MASSIVE_WS_URL}.`);
  }

  return { apiKey, baseUrl, wsUrl, allowInsecure: false };
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
