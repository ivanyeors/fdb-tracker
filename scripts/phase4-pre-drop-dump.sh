#!/usr/bin/env bash
# Pre-drop dump for Phase 4 migrations 068–072. Free-tier substitute for
# Supabase PITR — captures a logical copy of the tables this stage will
# mutate so we can restore if the drop reveals a bug.
#
# Usage:
#   ./scripts/phase4-pre-drop-dump.sh <stage>
#     stage = a | b | c | d | e | all
#
# Env (one or the other; same convention as scripts/reset-supabase.ts):
#   DATABASE_URL or SUPABASE_DB_URL
#     Get from Supabase Dashboard → Project Settings → Database →
#     Connection string. The pooler URL works fine for pg_dump.
#
# Output:
#   ./phase4-dumps/phase4-<stage>-<UTC timestamp>.sql
#
# Restore (if a stage breaks something):
#   psql "$DATABASE_URL" -f phase4-dumps/phase4-<stage>-<ts>.sql
#   The dump uses --data-only --column-inserts so re-applying it inserts
#   plaintext rows back into whatever columns currently exist. If the
#   drop has already removed the column you need, restore the column
#   first (re-apply the relevant ADD migration) before re-applying the
#   dump.

set -euo pipefail

STAGE="${1:-}"
if [[ -z "$STAGE" ]]; then
  echo "Usage: $0 <a|b|c|d|e|all>" >&2
  exit 2
fi

DB_URL="${DATABASE_URL:-${SUPABASE_DB_URL:-}}"
if [[ -z "$DB_URL" ]]; then
  echo "Error: set DATABASE_URL or SUPABASE_DB_URL." >&2
  echo "  Supabase Dashboard → Project Settings → Database → Connection string." >&2
  exit 2
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "Error: pg_dump not found. Install postgresql client tools:" >&2
  echo "  macOS:  brew install libpq && brew link --force libpq" >&2
  echo "  Linux:  apt-get install postgresql-client" >&2
  exit 2
fi

# Tables per stage. Each list mirrors the corresponding migration's scope.
declare -a TABLES
case "$STAGE" in
  a)
    TABLES=(
      public.tax_relief_inputs
      public.tax_relief_auto
      public.income_config
      public.income_history
    )
    ;;
  b)
    TABLES=(
      public.cpf_balances
      public.cpf_healthcare_config
    )
    ;;
  c)
    TABLES=(
      public.tax_noa_data
      public.tax_giro_schedule
    )
    ;;
  d)
    TABLES=(
      public.monthly_cashflow
      public.insurance_policies
    )
    ;;
  e)
    TABLES=(
      public.bank_transactions
    )
    ;;
  all)
    TABLES=(
      public.tax_relief_inputs
      public.tax_relief_auto
      public.income_config
      public.income_history
      public.cpf_balances
      public.cpf_healthcare_config
      public.tax_noa_data
      public.tax_giro_schedule
      public.monthly_cashflow
      public.insurance_policies
      public.bank_transactions
    )
    ;;
  *)
    echo "Unknown stage: $STAGE (expected a, b, c, d, e, or all)" >&2
    exit 2
    ;;
esac

mkdir -p phase4-dumps
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="phase4-dumps/phase4-${STAGE}-${TS}.sql"

# -t flags repeated per table.
TABLE_ARGS=()
for t in "${TABLES[@]}"; do
  TABLE_ARGS+=(-t "$t")
done

echo "Dumping ${#TABLES[@]} table(s) for stage $STAGE → $OUT"
for t in "${TABLES[@]}"; do
  echo "  • $t"
done

# --column-inserts produces one INSERT per row with explicit column names,
# which makes the dump robust if a future migration reorders columns. The
# trade-off is verbosity; fine at this scale (≤1k rows on dev).
pg_dump "$DB_URL" \
  --data-only \
  --column-inserts \
  --no-owner --no-acl \
  "${TABLE_ARGS[@]}" \
  -f "$OUT"

echo
echo "✅ Dump complete: $OUT"
echo "   Size: $(wc -c < "$OUT" | awk '{printf "%.1f KB\n", $1/1024}')"
echo
case "$STAGE" in
  a)   NEXT_MIG="068" ;;
  b)   NEXT_MIG="069" ;;
  c)   NEXT_MIG="070" ;;
  d)   NEXT_MIG="071" ;;
  e)   NEXT_MIG="072" ;;
  all) NEXT_MIG="068-072" ;;
esac
echo "Apply migration ${NEXT_MIG} next."
