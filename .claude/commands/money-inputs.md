# Money Input Guide

Apply when adding or editing forms that capture dollar amounts (balances, income, loans, premiums, tax reliefs, CPF withdrawals).

## Rule: Use CurrencyInput

```tsx
import { CurrencyInput } from "@/components/ui/currency-input"

<CurrencyInput
  value={amount}
  onChange={(val) => setAmount(val ?? 0)}
  placeholder="0.00"
/>
```

**Never** use `<Input type="number">` for dollar amounts. Native number inputs have awkward stepping, locale issues, and no cent precision.

## What CurrencyInput Provides

- Fixed 2 decimal places (`decimalsLimit` / `decimalScale` = 2)
- Comma thousands separator
- Period decimal separator
- `transformRawValue` for comma-as-decimal normalization
- Wraps `react-currency-input-field`

## When NOT to Use CurrencyInput

| Field type | Use instead |
|-----------|------------|
| Integers (birth year, tenure months, counts) | `<Input type="number">` |
| Unit quantities (shares, ounces) | `<Input type="number" step="any" min={0} />` |
| Percentage rates (loan %, interest %) | `<Input type="number" step={0.01} />` |

## Negative Values

- Default: positive/zero only (`allowNegativeValue` is false).
- Pass `allowNegativeValue` only when signed cash is valid (e.g., investment account cash balance).

## onChange API

- Receives `number | null`. Normalize to `0` for required fields, or `null` for optional fields.

## Backend Storage

- Send JSON numbers in API requests.
- Database: prefer `numeric(…, 2)` or equivalent column types.
- Rounding to 2dp before persist is optional if the DB/Zod already constrains precision.

## Implementation

See `components/ui/currency-input.tsx` for the wrapper implementation.
