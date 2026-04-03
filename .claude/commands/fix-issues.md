# Fix Common Runtime Issues

Guide for diagnosing and fixing common React/Next.js runtime errors in this project.

---

## Hydration Mismatch

**Error:** `Hydration failed because the server rendered text didn't match the client.`

### Common Causes
1. **`new Date()` in render path** — server and client execute at different times, producing different values
2. **`typeof window !== "undefined"` branches** — server returns one value, client returns another
3. **`localStorage` / `sessionStorage` reads during initialization** — not available on server
4. **`Math.random()` or other non-deterministic values** in initial render
5. **Locale-dependent formatting** (date formatting, number formatting) differing between server and client

### Fix Pattern: Defer with `mounted` state
```tsx
const [mounted, setMounted] = React.useState(false)
React.useEffect(() => { setMounted(true) }, [])

// Use a stable fallback for SSR, real value after mount
const value = mounted ? computeClientValue() : stableFallback
```

### Fix Pattern: Conditional rendering
```tsx
// Render a placeholder/skeleton on server, real component after mount
{mounted ? <ClientOnlyComponent /> : <Skeleton />}
```

### Fix Pattern: `suppressHydrationWarning`
Only for leaf text nodes where mismatch is harmless (e.g., timestamps displayed to user):
```tsx
<time suppressHydrationWarning>{new Date().toLocaleString()}</time>
```

### Diagnosis Steps
1. Read the error diff — it shows exactly which text node differs (e.g., `+ Mar 2026` vs `- Apr 2026`)
2. Trace the component tree in the error to find the source component
3. Search that component for `new Date()`, `localStorage`, `typeof window`, `Math.random()`
4. Check if a parent provider/hook supplies the value (e.g., context providers)
5. Apply the appropriate fix pattern above

### Previous Fixes
- **MonthYearPicker in TopNav** — `useGlobalMonth` hook was calling `getCurrentMonth()` (uses `new Date()`) during SSR. Fixed by adding `mounted` state to `GlobalMonthProvider` and returning empty string for `effectiveMonth` before mount.

---

## Cannot read properties of null (`parentNode`)

**Error:** `Cannot read properties of null (reading 'parentNode')`

### Common Causes
1. **Browser extensions** modifying DOM before React hydration
2. **Radix/shadcn portaled components** (Popover, Dialog, Select) unmounting while animation is in progress
3. **Conditional rendering** that removes a DOM node while a ref still points to it

### Fix Pattern: Safe unmount
Ensure portaled components are controlled (`open` state) and not conditionally removed from the tree while open.

### Fix Pattern: Error boundary
Wrap sections with portaled components in an error boundary to gracefully recover:
```tsx
<ErrorBoundary fallback={<div>Something went wrong</div>}>
  <ComponentWithPopovers />
</ErrorBoundary>
```

### Diagnosis Steps
1. Check if the error only happens on initial load (likely browser extension interference)
2. Check if it happens when navigating away from a page with open popovers/dialogs
3. Look for conditional renders (`&&`, ternary) around Radix components
4. Test in incognito mode to rule out browser extensions

---

## Adding New Errors

When encountering a new recurring error pattern, add it to this file with:
- The exact error message
- Common causes specific to this project's stack (Next.js 16, React 19, Radix/shadcn, Supabase)
- Fix patterns with code examples
- Diagnosis steps
- Reference to the actual fix in this codebase (file + what was changed)
