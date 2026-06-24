/**
 * URL da API AWS (RDS). Defina antes de carregar os módulos de dados:
 *   window.PORTAL_AWS_API_URL = "https://sua-api.amazonaws.com";
 */
export function getPortalAwsApiUrl() {
  return (typeof window !== "undefined" && window.PORTAL_AWS_API_URL) || "";
}

export function awsApiEnabled() {
  return Boolean(getPortalAwsApiUrl());
}

export async function awsFetch(path, { method = "GET", body, token, apiKey } = {}) {
  const apiUrl = getPortalAwsApiUrl();
  if (!apiUrl) throw new Error("PORTAL_AWS_API_URL não configurada");
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  if (apiKey) headers["X-Portal-Api-Key"] = apiKey;
  const res = await fetch(`${apiUrl.replace(/\/$/, "")}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store"
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.erro || `HTTP ${res.status}`);
  return data;
}

export async function firebaseIdToken() {
  const { getAuth } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
  const { app } = await import("./portal-firestore.js");
  const auth = getAuth(app);
  if (typeof auth.authStateReady === "function") await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) throw new Error("Usuário não autenticado");
  return user.getIdToken();
}
