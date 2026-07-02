#!/bin/bash
# Incidentes TCGL: use o repositório portalCIOP no Mac (GitHub Actions desativado).
set -euo pipefail

CIOP_ROOT="${CIOP_PORTAL_ROOT:-$HOME/portalCIOP}"
INSTALLER="$CIOP_ROOT/scripts/instalar-agendamento-incidentes.sh"

if [[ ! -f "$INSTALLER" ]]; then
  echo "Repositório portalCIOP não encontrado em: $CIOP_ROOT"
  echo "Clone ou ajuste CIOP_PORTAL_ROOT e execute:"
  echo "  bash scripts/instalar-agendamento-incidentes.sh"
  exit 1
fi

exec bash "$INSTALLER"
