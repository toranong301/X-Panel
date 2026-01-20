# Changelog

## Unreleased

- Backend: add DB-backed EF library (`ef_profiles`, `ef_library_entries`) and stop parsing EF from Excel templates at runtime.
- Backend: persist Scope 1.1 UI rows in DB (`scope11_stationary_items`) and export from DB payload.
- Backend: add EF(1) override table (`ef_overrides`) used by resolver.
- Backend: add Scope 1.1 calculation pipeline (`emission_results`, `POST /api/cycles/{cycle}/scope11/stationary/recalc`).
- Backend: add review/lock/summary endpoints (`/api/cycles/{cycle}/validations`, `/lock`, `/unlock`, `/summary`) and block writes when locked.
- Export/Preview: Scope 1.1 + FR-04.1 selection now sourced from DB (hidden-sheet write via `_DATA_SCOPE11` + `_FR041_SEL`).
- Frontend: add Summary + Review/Lock pages and handle locked-cycle export/preview by skipping `updateCycleData` on HTTP 423.
