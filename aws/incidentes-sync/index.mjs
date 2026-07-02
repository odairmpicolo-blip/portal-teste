export async function handler(event = {}) {
  return {
    ok: false,
    disabled: true,
    repository: "portal-teste",
    message: "Atualizacao de incidentes desativada no portal-teste. Use o repositorio portalCIOP.",
    requestedMode: event.mode || process.env.SYNC_MODE || "full"
  };
}
