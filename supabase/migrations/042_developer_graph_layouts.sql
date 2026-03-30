-- Stores developer graph layout positions per household
CREATE TABLE developer_graph_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  graph_key TEXT NOT NULL DEFAULT 'calculation-network',
  positions JSONB NOT NULL DEFAULT '{}',
  viewport JSONB, -- { x, y, zoom }
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (household_id, graph_key)
);

-- RLS
ALTER TABLE developer_graph_layouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own graph layouts"
  ON developer_graph_layouts
  FOR ALL
  USING (household_id IN (
    SELECT id FROM households WHERE id = household_id
  ));

-- Index
CREATE INDEX idx_developer_graph_layouts_household
  ON developer_graph_layouts(household_id, graph_key);
