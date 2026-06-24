-- Portal CIOP — schema PostgreSQL (AWS RDS / Aurora)
-- Rode: npm run db:migrate (em backend/)

CREATE TABLE IF NOT EXISTS liberacao_linhas (
  data_iso DATE NOT NULL,
  row_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  atualizado_por TEXT,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (data_iso, row_id)
);

CREATE INDEX IF NOT EXISTS idx_liberacao_data ON liberacao_linhas (data_iso);

CREATE TABLE IF NOT EXISTS terminais_snapshot (
  id TEXT PRIMARY KEY DEFAULT 'atual',
  payload JSONB NOT NULL,
  fonte TEXT,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Snapshots somente leitura (import via GitHub Actions)
CREATE TABLE IF NOT EXISTS incidentes_snapshot (
  id TEXT PRIMARY KEY DEFAULT 'atual',
  payload JSONB NOT NULL,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS autuacoes_snapshot (
  id TEXT PRIMARY KEY DEFAULT 'atual',
  payload JSONB NOT NULL,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS folha_snapshot (
  id TEXT PRIMARY KEY DEFAULT 'atual',
  payload JSONB NOT NULL,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pontualidade_snapshot (
  cenario TEXT NOT NULL,
  payload JSONB NOT NULL,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (cenario)
);
