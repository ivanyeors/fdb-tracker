-- Migration: Telegram Profile Link and OCBC Money Lock Date Added

ALTER TABLE "public"."profiles" 
ADD COLUMN IF NOT EXISTS "telegram_chat_id" text,
ADD COLUMN IF NOT EXISTS "telegram_link_token" text,
ADD COLUMN IF NOT EXISTS "telegram_last_used" timestamp with time zone;

ALTER TABLE "public"."bank_accounts"
ADD COLUMN IF NOT EXISTS "locked_amount" numeric(12,2) DEFAULT 0;

ALTER TABLE "public"."investments"
ADD COLUMN IF NOT EXISTS "date_added" date;

