import https from "node:https";

const MOBILIBUS = "https://mobilibus.com/api";
/** BusTime TCGL entrega cadeia TLS incompleta; Node rejeita sem rejectUnauthorized. */
const MOV1_HTTPS_AGENT = new https.Agent({ rejectUnauthorized: false });
const BUSTIME_BASE = (process.env.BUSTIME_BASE_URL || "https://csr.mov1.com.br/bustime/api/v3").replace(/\/+$/, "");
const BUSTIME_KEY = process.env.BUSTIME_API_KEY || "";
const BUSTIME_REFERER = process.env.BUSTIME_REFERER || "https://csr.mov1.com.br/map";

function corsHeaders(contentType = "application/json") {
  return {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-store"
  };
}

function resolveBus2Path(event) {
  const rawPath = event.rawPath || event.path || "";
  if (rawPath.startsWith("/bus2/")) return rawPath.slice("/bus2/".length);
  if (rawPath === "/bus2") return "";
  if (event.pathParameters?.proxy) return event.pathParameters.proxy;
  return rawPath.replace(/^\//, "");
}

function resolveMov1Action(event) {
  const rawPath = event.rawPath || event.path || "";
  const trimmed = rawPath.replace(/^\/mov1\/?/, "");
  const action = trimmed.split("/").filter(Boolean)[0];
  return action || "getvehicles";
}

async function proxyBus2(event) {
  const apiPath = resolveBus2Path(event);
  const qs = event.rawQueryString ? `?${event.rawQueryString}` : "";
  const url = `${MOBILIBUS}/${apiPath}${qs}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(24000)
  });
  const body = await res.text();
  return {
    statusCode: res.status,
    headers: corsHeaders(res.headers.get("content-type") || "application/json"),
    body
  };
}

async function httpsGetText(url, headers, timeoutMs = 24000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers, agent: MOV1_HTTPS_AGENT }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ statusCode: res.statusCode || 502, body }));
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error("timeout")));
  });
}

async function proxyMov1(event) {
  const action = resolveMov1Action(event);
  const params = new URLSearchParams(event.rawQueryString || "");
  params.set("requestType", action);
  if (BUSTIME_KEY) params.set("key", BUSTIME_KEY);
  params.set("format", "json");

  const url = `${BUSTIME_BASE}/${action}?${params.toString()}`;
  const res = await httpsGetText(url, {
    Accept: "application/json",
    Referer: BUSTIME_REFERER,
    Origin: new URL(BUSTIME_REFERER).origin,
    "User-Agent": "Mozilla/5.0 (compatible; PortalCIOP/1.0)"
  });
  return {
    statusCode: res.statusCode,
    headers: corsHeaders("application/json"),
    body: res.body
  };
}

export async function handler(event) {
  const method = event.requestContext?.http?.method || event.httpMethod || "GET";
  if (method === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(), body: "" };
  }

  const rawPath = event.rawPath || event.path || "";

  if (method === "GET" && (rawPath === "/" || rawPath === "")) {
    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        ok: true,
        service: "portal-ciop-live-proxy",
        usage: {
          mov1: "GET /mov1/getvehicles?rt=203 — BusTime csr.mov1.com.br",
          bus2: "GET /bus2/vehicles?... — Mobilibus (legado)"
        }
      })
    };
  }

  if (method === "GET" && (rawPath === "/health" || event.path === "/health")) {
    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ ok: true, service: "portal-ciop-live-proxy", bustime: !!BUSTIME_KEY })
    };
  }

  try {
    if (rawPath.startsWith("/mov1")) return await proxyMov1(event);
    if (rawPath.startsWith("/bus2")) return await proxyBus2(event);
    return {
      statusCode: 404,
      headers: corsHeaders(),
      body: JSON.stringify({ ok: false, erro: "Use /mov1/... ou /bus2/..." })
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: corsHeaders(),
      body: JSON.stringify({
        ok: false,
        erro: err.cause?.message || err.message || "Falha no proxy ao vivo"
      })
    };
  }
}
