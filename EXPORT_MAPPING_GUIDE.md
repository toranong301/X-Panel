# Export mapping guide

## Where mappings live

- Backend mapping registry: `backend/resources/export/mappings/*.json`
- Runtime writer: `backend/app/Services/Export/FullWorkbookExportService.php`

## How it works

1) Export loads a clean template `.xlsx`.
2) Scope 1.1 is written into hidden tables (`_DATA_SCOPE11`, `_FR041_SEL`) via `Scope11HiddenTableExportService`.
3) The rest of the workbook is populated via `FullWorkbookExportService` using the selected template mapping JSON.
4) Export writes **values only** (never overwrites formula cells).

## Adding a new writer (new sheet or section)

1) Add writer config in the template mapping JSON (example: `backend/resources/export/mappings/mbax_tgo_demo.json`).
2) Implement a `writeXxx()` method in `backend/app/Services/Export/FullWorkbookExportService.php`.
3) Call the writer from `FullWorkbookExportService::apply()` when `writers['yourKey']` exists.

## Template safety rules

- Always start from the template file on disk (do not reuse prior workbooks).
- Clear previous input ranges before writing new values (to avoid “ghost rows”).
- Skip formula cells (the writer helpers already do this).
- If a template needs structural changes (hidden tables / input cells), update it using `scripts/update-vsheet-base.php`.

