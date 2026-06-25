const MOBILIBUS = "https://mobilibus.com/api";

function corsHeaders(contentType = "application/json") {
  return {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-store"
  };
}

function resolveApiPath(event) {
  const rawPath = event.rawPath || event.path || "";
  if (rawPath.startsWith("/bus2/")) return rawPath.slice("/bus2/".length);
  if (rawPath === "/bus2") return "";
  if (event.pathParameters?.proxy) return event.pathParameters.proxy;
  return rawPath.replace(/^\//, "");
}

export async function handler(event) {
  const method = event.requestContext?.http?.method || event.httpMethod || "GET";
  if (method === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(), body: "" };
  }

  if (method === "GET" && (event.rawPath === "/" || event.rawPath === "")) {
    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        ok: true,
        service: "portal-ciop-bus2-proxy",
        usage: "Use /bus2/{mobilibus-api-path} — ex.: /bus2/vehicles?origin=web&trip_id=…&route_id=…"
      })
    };
  }

  if (method === "GET" && (event.rawPath === "/health" || event.path === "/health")) {
    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ ok: true, service: "portal-ciop-bus2-proxy" })
    };
  }

  const apiPath = resolveApiPath(event);
  const qs = event.rawQueryString ? `?${event.rawQueryString}` : "";
  const url = `${MOBILIBUS}/${apiPath}${qs}`;

  try {
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
  } catch (err) {
    return {
      statusCode: 502,
      headers: corsHeaders(),
      body: JSON.stringify({ ok: false, erro: err.message || "Falha ao consultar Bus2" })
    };
  }
}
