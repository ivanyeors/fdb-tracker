CREATE TABLE IF NOT EXISTS "public"."telegram_sessions" (
  "id" text PRIMARY KEY,
  "session_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now()
);

ALTER TABLE "public"."telegram_sessions" ENABLE ROW LEVEL SECURITY;
