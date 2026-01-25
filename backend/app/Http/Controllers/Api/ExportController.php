<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Cycle;
use App\Models\Export;
use App\Models\Fr041Config;
use App\Models\Scope11StationaryItem;
use App\Services\Export\FullWorkbookExportService;
use App\Services\Export\Scope11HiddenTableExportService;
use App\Services\MbaxTemplateService;
use App\Services\Scope11PayloadService;
use App\Services\TemplateRegistry;
use App\Services\ValidationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use PhpOffice\PhpSpreadsheet\IOFactory;

class ExportController extends Controller
{
    public function store(
        Request $request,
        Cycle $cycle,
        MbaxTemplateService $mbax,
        TemplateRegistry $registry,
        FullWorkbookExportService $fullExport,
        Scope11HiddenTableExportService $scope11Export,
        Scope11PayloadService $scope11Payload,
        ValidationService $validation
    )
    {
        $payload = $request->validate([
            'templateId' => ['nullable', 'string', 'max:200'],
        ]);

        $templateId = trim((string) ($payload['templateId'] ?? ''));
        if ($templateId === '') {
            $templateId = $this->resolveTemplateId($cycle, $registry);
        }
        $template = $registry->getTemplate($templateId);
        if (!$template) {
            return response()->json([
                'ok' => false,
                'code' => 'INVALID_TEMPLATE',
                'message' => 'Unknown templateId.',
            ], 422);
        }

        $export = Export::query()->create([
            'cycle_id' => $cycle->id,
            'status' => 'processing',
        ]);

        try {
            $templateIdRequested = $templateId;
            $templateIdUsed = $templateId;
            $warnings = [];

            $spreadsheet = $mbax->loadTemplate(null, null, $templateIdUsed);

            $profile = $this->resolveProfileForTemplateId($cycle, $templateIdUsed, $registry);
            if ($profile) {
                $this->assertRequiredSheets($spreadsheet, $profile['requiredSheets'] ?? []);
                $this->assertHiddenTables($spreadsheet, $profile['hiddenTables'] ?? []);
            }

            $validationResult = $validation->validateCycle($cycle);
            if (!($validationResult['ok'] ?? false)) {
                $export->status = 'failed';
                $export->error_message = 'Validation failed; cannot export.';
                $export->save();

                return response()->json([
                    'ok' => false,
                    'code' => 'VALIDATION_FAILED',
                    'message' => 'Validation failed; cannot export.',
                    'errors' => $validationResult['errors'] ?? [],
                    'warnings' => $validationResult['warnings'] ?? [],
                ], 422);
            }

            $selectedRowIds = $this->loadFr041SelectionRowIds($cycle->id);
            $payloadScope11 = $scope11Payload->buildPayload($cycle);
            $items = is_array($payloadScope11['items'] ?? null) ? $payloadScope11['items'] : [];
            $splitEnabled = (bool) ($payloadScope11['splitEnabled'] ?? false);

            $scope11Export->startTrace();
            $scope11Export->writeToSpreadsheet($spreadsheet, $payloadScope11);
            if ($spreadsheet->getSheetByName('_FR041_SEL')) {
                $selectionRows = $payloadScope11['fr041SelectionRows'] ?? [];
                if (!$selectionRows) {
                    $selectionRows = $scope11Payload->buildFr041SelectionRows($cycle);
                }
                if ($selectionRows) {
                    $scope11Export->writeFr041SelectionRows($spreadsheet, $selectionRows);
                } else {
                    $scope11Export->writeSelectionToSpreadsheet($spreadsheet, $selectedRowIds);
                }
            }
            $trace = $scope11Export->endTrace();

            $fullResult = $fullExport->apply($cycle, $spreadsheet, $templateIdUsed);
            if (!empty($fullResult['warnings'] ?? [])) {
                $warnings = array_merge($warnings, $fullResult['warnings']);
            }

            $formulaRefs = $this->collectFormulaReferences($spreadsheet, [
                '_DATA_SCOPE11',
                'TBLSCOPE11STATIONARY',
                '_FR041_SEL',
                'TBLFR041SEL',
            ]);

            $writer = IOFactory::createWriter($spreadsheet, 'Xlsx');
            if (method_exists($writer, 'setPreCalculateFormulas')) {
                $writer->setPreCalculateFormulas(false);
            }

            $exportDir = storage_path('app/exports');
            if (!is_dir($exportDir)) {
                mkdir($exportDir, 0775, true);
            }

            $relXlsx = 'exports/' . $export->id . '.xlsx';
            $relTrace = 'exports/' . $export->id . '_trace.json';
            $xlsxPath = storage_path('app/' . $relXlsx);
            $tracePath = storage_path('app/' . $relTrace);

            $writer->save($xlsxPath);

            $traceDoc = [
                'exportId' => $export->id,
                'cycleId' => $cycle->id,
                'templateIdRequested' => $templateIdRequested,
                'templateIdUsed' => $templateIdUsed,
                'profileId' => $profile['id'] ?? null,
                'generatedAt' => now()->toIso8601String(),
                'warnings' => $warnings,
                'scope11' => [
                    'itemCount' => count($items),
                    'splitEnabled' => $splitEnabled,
                ],
                'fr041' => [
                    'selectedRowIds' => $selectedRowIds,
                ],
                'trace' => $trace,
                'formulaReferences' => $formulaRefs,
            ];
            file_put_contents(
                $tracePath,
                json_encode($traceDoc, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
            );

            $export->status = 'completed';
            $export->file_path = $relXlsx;
            $export->trace_path = $relTrace;
            $export->save();

            $filename = 'VSheetCFO_' . $cycle->id . '_' . now()->format('Ymd_His') . '.xlsx';
            return response()->download($xlsxPath, $filename, [
                'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            ]);
        } catch (\InvalidArgumentException $e) {
            $export->status = 'failed';
            $export->error_message = $e->getMessage();
            $export->save();
            return response()->json(['message' => $e->getMessage()], 422);
        } catch (\RuntimeException $e) {
            $export->status = 'failed';
            $export->error_message = $e->getMessage();
            $export->save();
            if (str_contains($e->getMessage(), 'MBAX template not found')) {
                return response()->json([
                    'message' => 'Template missing',
                    'code' => 'TEMPLATE_NOT_FOUND',
                ], 500);
            }
            if (str_contains($e->getMessage(), 'PhpSpreadsheet')) {
                return response()->json([
                    'message' => 'Spreadsheet engine missing',
                    'code' => 'DEPENDENCY_MISSING',
                ], 500);
            }
            return response()->json(['message' => $e->getMessage()], 500);
        } catch (\Throwable $e) {
            $export->status = 'failed';
            $export->error_message = $e->getMessage();
            $export->save();
            return response()->json(['message' => 'Export failed.'], 500);
        }
    }

    public function show(Export $export)
    {
        return response()->json([
            'id' => $export->id,
            'cycle_id' => $export->cycle_id,
            'status' => $export->status,
            'file_path' => $export->file_path,
            'trace_path' => $export->trace_path ?? null,
            'download_url' => null,
            'error_message' => $export->error_message,
            'created_at' => $export->created_at,
        ]);
    }

    private function assertRequiredSheets(\PhpOffice\PhpSpreadsheet\Spreadsheet $spreadsheet, array $requiredSheets): void
    {
        foreach ($requiredSheets as $sheetName) {
            if (!is_string($sheetName) || trim($sheetName) === '') {
                continue;
            }
            if (!$spreadsheet->getSheetByName($sheetName)) {
                throw new \RuntimeException("Missing required sheet: {$sheetName}");
            }
        }
    }

    private function assertHiddenTables(\PhpOffice\PhpSpreadsheet\Spreadsheet $spreadsheet, array $hiddenTables): void
    {
        if (!is_array($hiddenTables)) return;
        foreach ($hiddenTables as $table) {
            if (!is_array($table)) continue;
            $sheetName = $table['sheet'] ?? '';
            $tableName = $table['tableName'] ?? '';
            if (!is_string($sheetName) || !is_string($tableName) || $sheetName === '' || $tableName === '') {
                continue;
            }
            $sheet = $spreadsheet->getSheetByName($sheetName);
            if (!$sheet) {
                throw new \RuntimeException("Missing required sheet: {$sheetName}");
            }
            $found = false;
            foreach ($sheet->getTableCollection() as $tbl) {
                if (strcasecmp($tbl->getName(), $tableName) === 0) {
                    $found = true;
                    break;
                }
            }
            if (!$found) {
                throw new \RuntimeException("Missing required table: {$tableName} on sheet {$sheetName}");
            }
        }
    }

    private function resolveTemplateId(Cycle $cycle, TemplateRegistry $registry): string
    {
        if (isset($cycle->template_id) && is_string($cycle->template_id) && trim($cycle->template_id) !== '') {
            $resolved = $registry->resolveTemplateIdForProfile($cycle->template_id);
            if ($resolved) {
                return $resolved;
            }
        }

        $data = $cycle->data_json ?? [];
        $fromData = is_array($data) ? ($data['templateId'] ?? $data['template_id'] ?? null) : null;
        if (is_string($fromData) && trim($fromData) !== '') {
            return trim($fromData);
        }

        $year = is_numeric($cycle->year ?? null) ? (int) $cycle->year : null;
        if ($year !== null && $year >= 2026 && $this->templateExists($registry, 'VSHEET_CFO_2026')) {
            return 'VSHEET_CFO_2026';
        }
        if ($this->templateExists($registry, 'VSHEET_CFO_2025')) {
            return 'VSHEET_CFO_2025';
        }
        if ($this->templateExists($registry, 'VSHEET_CFO')) {
            return 'VSHEET_CFO';
        }

        return MbaxTemplateService::DEFAULT_TEMPLATE_ID;
    }

    private function templateExists(TemplateRegistry $registry, string $templateId): bool
    {
        $mapping = $registry->getTemplate($templateId);
        if (!$mapping) return false;

        $envKey = $mapping['path']['env'] ?? null;
        if (is_string($envKey) && $envKey !== '') {
            $envPath = env($envKey);
            if (is_string($envPath) && $envPath !== '' && is_file($envPath)) {
                return true;
            }
        }

        $fallbackRel = $mapping['path']['fallback'] ?? null;
        if (is_string($fallbackRel) && $fallbackRel !== '') {
            $fallback = base_path($fallbackRel);
            if (is_file($fallback)) return true;

            $basename = basename(str_replace('\\', '/', $fallbackRel));
            if ($basename !== '') {
                $altDirs = [
                    base_path('../shared/templates/mbax'),
                    base_path('../frontend/src/assets/templates/mbax'),
                ];
                foreach ($altDirs as $dir) {
                    $candidate = rtrim($dir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $basename;
                    if (is_file($candidate)) return true;
                }
            }
        }

        return false;
    }

    private function loadFr041SelectionRowIds(int $cycleId): array
    {
        $config = Fr041Config::query()
            ->where('cycle_id', $cycleId)
            ->where('sheet_id', 'fr041')
            ->where('section', 'scope1_stationary')
            ->first();

        $rows = $config?->selected_row_ids ?? [];
        return is_array($rows) ? $rows : [];
    }

    private function emptyMonths(): array
    {
        $out = [];
        for ($i = 1; $i <= 12; $i++) {
            $out['M' . $i] = null;
        }
        return $out;
    }

    private function hasAnyMonthValue(array $months): bool
    {
        for ($i = 1; $i <= 12; $i++) {
            $key = 'M' . $i;
            if (!array_key_exists($key, $months)) {
                continue;
            }
            $value = $months[$key];
            if ($value === null || $value === '') {
                continue;
            }
            if (is_numeric($value)) {
                return true;
            }
        }
        return false;
    }

    private function resolveProfileForTemplateId(Cycle $cycle, string $templateId, TemplateRegistry $registry): ?array
    {
        $profileId = isset($cycle->template_id) && is_string($cycle->template_id) && trim($cycle->template_id) !== ''
            ? strtolower(trim($cycle->template_id))
            : '';

        $profile = $profileId !== '' ? $registry->getProfile($profileId) : null;
        if ($profile && strcasecmp((string) ($profile['templateId'] ?? ''), $templateId) === 0) {
            return $profile;
        }

        foreach ($registry->listProfiles() as $candidate) {
            if (!is_array($candidate)) {
                continue;
            }
            if (strcasecmp((string) ($candidate['templateId'] ?? ''), $templateId) === 0) {
                return $candidate;
            }
        }

        return $profile;
    }

    private function collectFormulaReferences(\PhpOffice\PhpSpreadsheet\Spreadsheet $spreadsheet, array $needles, int $limit = 500): array
    {
        $needlesUpper = array_values(array_filter(array_map(
            fn ($n) => strtoupper(trim((string) $n)),
            $needles
        )));

        $out = [];
        foreach ($spreadsheet->getWorksheetIterator() as $ws) {
            $collection = $ws->getCellCollection();
            $coords = [];
            if (method_exists($collection, 'getCoordinates')) {
                $coords = $collection->getCoordinates();
            } elseif (method_exists($collection, 'getSortedCoordinates')) {
                $coords = $collection->getSortedCoordinates();
            }

            foreach ($coords as $coord) {
                $cell = $ws->getCell($coord);
                if (!$cell->isFormula()) {
                    continue;
                }
                $formula = (string) $cell->getValue();
                $formulaUpper = strtoupper($formula);

                $matchedNeedles = [];
                foreach ($needlesUpper as $needle) {
                    if ($needle !== '' && str_contains($formulaUpper, $needle)) {
                        $matchedNeedles[] = $needle;
                    }
                }
                if (!$matchedNeedles) {
                    continue;
                }

                $out[] = [
                    'sheet' => $ws->getTitle(),
                    'cell' => $coord,
                    'formula' => $formula,
                    'matched' => $matchedNeedles,
                ];

                if (count($out) >= $limit) {
                    return $out;
                }
            }
        }

        return $out;
    }
}
