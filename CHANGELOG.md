# Changelog

## Unreleased

- Backend: add DB-backed EF library (`ef_profiles`, `ef_library_entries`) and stop parsing EF from Excel templates at runtime.
- Backend: persist Scope 1.1 UI rows in DB (`scope11_stationary_items`) and export from DB payload.
- Backend: add EF(1) override table (`ef_overrides`) used by resolver.
- Backend: add Scope 1.1 calculation pipeline (`emission_results`, `POST /api/cycles/{cycle}/scope11/stationary/recalc`).
- Backend: add review/lock/summary endpoints (`/api/cycles/{cycle}/validations`, `/lock`, `/unlock`, `/summary`) and block writes when locked.
- Export/Preview: Scope 1.1 + FR-04.1 selection now sourced from DB (hidden-sheet write via `_DATA_SCOPE11` + `_FR041_SEL`).
- Backend: add evidence attachments + linking (`attachments`, `attachment_links`) and API endpoints for upload/list/link/unlink/download.
- Export: add full-workbook writer (`FullWorkbookExportService`) + template mappings; export produces a single populated `.xlsx` for the selected template.
- Templates: update MBAX + CFO 2026 templates to include required hidden sheets/tables and make Scope 3 + FR-04.1 Scope 3 blocks writable for export.
- Frontend: add Summary + Review/Lock pages and handle locked-cycle export/preview by skipping `updateCycleData` on HTTP 423.
- Frontend: add Scope Navigator + additional scope entry pages + Evidence Vault UI.
