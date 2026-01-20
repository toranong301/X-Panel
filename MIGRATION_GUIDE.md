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
- `attachment_links` (evidence files linked to scope records)
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

## 5) Template updates (required for MBAX + CFO 2026)

If you are using older copies of the Excel templates, ensure they contain:

- Hidden sheets + tables: `_DATA_SCOPE11` (`tblScope11Stationary`), `_FR041_SEL` (`tblFR041Sel`)
- MBAX: `Screen scope 3` input cells are writable (C..H, K for rows 3..45)
- MBAX: `Fr-04.1` Scope 3 list block is writable (B..D rows 51..56)

From repo root:

- `php scripts/update-vsheet-base.php backend/storage/app/templates/mbax/MBAX-TGO-11102567-Demo.xlsx`
- `php scripts/update-vsheet-base.php backend/storage/app/templates/mbax/VSheetCFO_BASE_2026.xlsx`
