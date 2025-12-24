# AGENTS.md

## Project layout
- Angular project is under /frontend (always cd frontend before npm commands)

## Setup commands
- cd frontend
- npm ci || npm install
- npm run build

## Dev commands
- cd frontend
- npm run start (or npm start if that's what package.json provides)

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

## Files to edit for this feature
- frontend/src/app/core/export/templates/mbax-tgo-11102567/mbax.adapter.ts
- frontend/src/app/core/services/canonical-ghg.service.ts
