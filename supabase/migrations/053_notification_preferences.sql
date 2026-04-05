-- Per-profile notification preferences
-- "No row" = enabled (backward compatible default)
-- Schedule override columns are NULL = use family default from prompt_schedule

CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  day_of_month INT,
  month_of_year INT,
  time TEXT,
  timezone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, notification_type)
);

CREATE INDEX idx_notification_preferences_profile
  ON notification_preferences (profile_id);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own notification preferences"
  ON notification_preferences FOR ALL
  USING (
    profile_id IN (
      SELECT p.id FROM profiles p
      JOIN families f ON p.family_id = f.id
      JOIN households h ON f.household_id = h.id
    )
  );
