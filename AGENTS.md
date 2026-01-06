# AGENTS.md

## Project layout
- Angular project is under /frontend (always cd frontend before npm commands)

## Setup commands
- cd frontend
- npm ci || npm install
- npm run build

## Dev commands (frontend)
- cd frontend
- npm run start (or npm start if that's what package.json provides)

## Dev commands (backend)
- cd backend
- php artisan serve (ensure API_KEY is set in .env)

## Hard rules (Excel export)
- Single source of truth = UI payload.
- Preview/Export must match UI values 100%.
- Do NOT read old workbook values or v-sheet values to fill data.
- Use Option 2: Hidden sheet data table.
- Backend writes ONLY to hidden sheet table "_DATA_SCOPE11" (values column).
- Visible sheet(s) must pull values via formulas from "_DATA_SCOPE11" only.
- On every request: start from a clean template xlsx and clear hidden table values first to avoid ghost rows.
- Keep formulas/positions from template only.
- Payload MUST be row-based: items[] with rowId + months (M1..M12). No cell-key payload (E9/F9...).
- Empty inputs must stay empty (null/""/omitted). Never default to 0.
- Backend writes ONLY to hidden sheet table "_DATA_SCOPE11".
- Visible sheet pulls ONLY via formulas from the hidden table.
- Derived fuel split section (Diesel/Biodiesel/Gasoline/Ethanol) is controlled by splitEnabled flag and calculated from hidden table only.
- Preview dialog must render a table (rows/months), not a raw key-value list.

## Key rules (Excel export)
- Never overwrite formulas in the Excel template. Write input cells only.
- Scope 1.1 sheet name is "1.1 Stationary " (note trailing space)
  - Write monthly inputs ONLY: E9:P9, E10:P10, E12:P12, E14:P14
- Scope 1.2 sheet name is "1.2 Mobile"
  - Monthly columns: G..R (month 1..12)
  - Row slots:
    - Diesel B7 on-road: 15..41 step 2
    - Diesel B10 on-road: 16..42 step 2
    - Gasohol 91/95: 45..55 step 2
    - Gasohol E20: 46..56 step 2
    - Diesel B7 off-road forklift: row 58

## Coding style
- Prefer small diffs.
- Keep existing APIs unless necessary.

## Files to edit for this feature
- frontend/src/app/core/export/templates/mbax-tgo-11102567/mbax.adapter.ts
- frontend/src/app/core/services/canonical-ghg.service.ts
