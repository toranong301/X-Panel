# Migration guide (Blueprint foundations)

## 1) Backend migrations + seed

From repo root:

- `cd backend`
- `php artisan migrate`
- `php artisan db:seed`

This adds:

- `ef_profiles`, `ef_library_entries` (EF Library in DB)
- `ef_overrides` (EF(1) override values in DB)
- `scope11_stationary_items` (Scope 1.1 monthly activity rows)
- `emission_results` (calculation output + EF snapshot)
- `cycles.locked_at`, `cycles.locked_reason` (locking)

## 2) EF library behavior change

EF endpoints no longer parse EF values from Excel templates at runtime. If EF lists are empty:

- Re-run `php artisan db:seed` (or just `php artisan db:seed --class=Database\\Seeders\\EfLibrarySeeder`)

## 3) Locking behavior

When a cycle is locked:

- Writes are rejected with HTTP `423` for:
  - `PUT /api/cycles/{cycle}/data`
  - `PUT /api/cycles/{cycle}/template`
  - `PUT /api/cycles/{cycle}/scope11/stationary/items`
  - `PUT /api/cycles/{cycle}/fr041/config`
  - `POST /api/cycles/{cycle}/attachments`
  - `POST /api/cycles/{cycle}/fr032/selection`
  - `POST /api/cycles/{cycle}/fr041/selection`

Exports remain available.

## 4) How to run calc + export (API examples)

- Validate: `GET /api/cycles/{cycle}/validations`
- Recalc Scope 1.1: `POST /api/cycles/{cycle}/scope11/stationary/recalc`
- Summary: `GET /api/cycles/{cycle}/summary`
- Lock: `POST /api/cycles/{cycle}/lock` body `{ "reason": "Reviewed" }`
- Unlock: `POST /api/cycles/{cycle}/unlock`
- Export: `POST /api/cycles/{cycle}/export`
