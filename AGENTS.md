# AGENTS.md

## Cursor Cloud specific instructions

**fdb-tracker** is a Next.js 16 app (App Router + Turbopack) with shadcn/ui v4, Tailwind CSS 4, and TypeScript 5.9. There is no backend, database, or external service dependency.

### Available npm scripts

See `package.json` for the full list. Key commands:

| Task | Command |
|------|---------|
| Dev server | `npm run dev` (port 3000, Turbopack) |
| Lint | `npm run lint` |
| Typecheck | `npm run typecheck` |
| Build | `npm run build` |
| Format | `npm run format` |

### Notes

- The dev server uses Turbopack (`next dev --turbopack`) and supports hot reload out of the box.
- ESLint currently reports 1 warning for an unused `Geist` import in `app/layout.tsx`; this is pre-existing and not a blocker.
- There are no automated tests configured (no Jest, Vitest, or Playwright). Manual browser testing is the current approach.
- Dark mode can be toggled by pressing the `d` key on the homepage (handled by `next-themes` via the `ThemeProvider`).
