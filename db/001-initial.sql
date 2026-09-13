CREATE TABLE IF NOT EXISTS cases (
  id uuid PRIMARY KEY,
  owner text NOT NULL,
  scenario text NOT NULL,
  order_data jsonb NOT NULL,
  stock integer NOT NULL CHECK (stock >= 0),
  messages jsonb NOT NULL DEFAULT '[]',
  run_token uuid,
  run_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cases_owner ON cases(owner, created_at DESC);
CREATE TABLE IF NOT EXISTS proposals (
  id uuid PRIMARY KEY,
  case_id uuid NOT NULL UNIQUE REFERENCES cases(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  reason text NOT NULL,
  policy_version text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
CREATE TABLE IF NOT EXISTS replacements (
  id uuid PRIMARY KEY,
  proposal_id uuid NOT NULL UNIQUE REFERENCES proposals(id),
  case_id uuid NOT NULL UNIQUE REFERENCES cases(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  kind text NOT NULL,
  detail jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
