# CPF Mock Data Removal Plan

**Scope:** Remove all mock/hardcoded data from the CPF page and wire to real APIs. DB schema is in place (migrations 003–007).

---

## Mock Data Locations (CPF Page Only)

All mock data is in [`app/(app)/dashboard/cpf/page.tsx`](app/(app)/dashboard/cpf/page.tsx):

| Location | Mock Data | Replacement |
|----------|-----------|-------------|
| Lines 29–32 | `mockProjection` – 26-year SA growth chart | `/api/cpf/retirement` → `extendedProjection` (map `total` → `balance`) |
| Lines 34–38 | `retirementBenchmarks` – uses hardcoded `cpfSA = 15000` | Derive from `currentCpf.total` from retirement API |
| Lines 27 | `cpfSA = 15000` | Remove; use real CPF total |
| `HousingTab` (140–168) | Hardcoded: $120k, $15k, $135k, $45k | New `/api/cpf/housing` or aggregate `cpf_housing_usage`; show 0 when empty |
| `LoansTab` (170–204) | Hardcoded: $120k CPF, $80k cash, $185k balance, $1,200 payment | `/api/loans?profileId=...`; filter `use_cpf_oa`; show empty state when no loans |

**No other mock data** in the app (tests use `vi.mock` for unit tests; form placeholders like "e.g. 60,000" are input hints, not mock data).

---

## Implementation

### 1. Retirement Tab

- Fetch `GET /api/cpf/retirement?profileId=...` (already exists).
- **LineChart:** Use `extendedProjection` (or `projectionToAge55`), map to `{ year, balance: total }`.
- **Benchmark cards:** Use `currentCpf.total` instead of `cpfSA` to compute BRS/FRS/ERS percentages.
- Remove `mockProjection`, `retirementBenchmarks`, and `cpfSA`.

### 2. Housing Tab

- Add `GET /api/cpf/housing?profileId=...` that:
  - Fetches loans with `use_cpf_oa = true` for the profile.
  - Joins `cpf_housing_usage` and aggregates `principal_withdrawn`, `accrued_interest`.
  - Returns `{ oaUsed, accruedInterest, refundDue, vlRemaining }` (vlRemaining can be 0 for now if valuation logic is not implemented).
- Wire `HousingTab` to this API; show `0` or "—" when no data.

### 3. Loans Tab

- Fetch `GET /api/loans?profileId=...`.
- Filter loans where `use_cpf_oa === true`.
- For each loan, show: name, principal, outstanding (from `loan_repayments` or principal if no repayments), monthly payment (from amortization).
- Show empty state when no CPF loans.

### 4. Data Flow

- `CpfPage` already fetches `/api/cpf/balances` for Overview.
- Add fetches for `/api/cpf/retirement`, `/api/cpf/housing`, `/api/loans`.
- Pass data into `RetirementTab`, `HousingTab`, `LoansTab` as props.
- Handle loading and empty states.

---

## Files to Modify

| File | Changes |
|------|---------|
| [`app/(app)/dashboard/cpf/page.tsx`](app/(app)/dashboard/cpf/page.tsx) | Remove mock data; fetch retirement, housing, loans; pass real data to tabs |
| New: `app/api/cpf/housing/route.ts` | Aggregate `cpf_housing_usage` for profile's loans with `use_cpf_oa` |

---

## Summary

- **Retirement:** Use existing `/api/cpf/retirement` for projection and benchmarks.
- **Housing:** Add `/api/cpf/housing` and wire tab to real data.
- **Loans:** Use existing `/api/loans`, filter CPF loans, show real loan data.
- **Overview:** Already uses real data from `/api/cpf/balances`.
