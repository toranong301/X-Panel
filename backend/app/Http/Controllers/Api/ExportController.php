<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Cycle;
use App\Models\Export;
use App\Models\Fr041Config;
use App\Models\Scope11StationaryItem;
use App\Services\Export\FullWorkbookExportService;
use App\Services\Export\Scope11HiddenTableExportService;
use App\Services\Export\SpreadsheetDiskCache;
use App\Services\EfViewService;
use App\Services\Fr041SelectionsV2Helper;
use App\Services\MbaxTemplateService;
use App\Services\Scope11PayloadService;
use App\Services\TemplateRegistry;
use App\Services\ValidationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Log;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Settings;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

class ExportController extends Controller
{
    private const SCOPE11_DATA_SHEET = '_DATA_SCOPE11';
    private const MODE_LEAN = 'lean';
    private const MODE_FULL_LITE = 'full-lite';
    private const MODE_FULL = 'full';
    private const DEFAULT_MODE = self::MODE_FULL;

    public function store(
        Request $request,
        Cycle $cycle,
        MbaxTemplateService $mbax,
        TemplateRegistry $registry,
        FullWorkbookExportService $fullExport,
        Scope11HiddenTableExportService $scope11Export,
        Scope11PayloadService $scope11Payload,
        EfViewService $efView,
        ValidationService $validation
    )
    {
        $payload = $request->validate([
            'templateId' => ['nullable', 'string', 'max:200'],
        ]);

        $mode = $this->resolveMode($request);
        $templateId = trim((string) ($payload['templateId'] ?? ''));
        if ($templateId === '') {
            $templateId = $this->resolveTemplateId($cycle, $registry);
        }

        $template = null;
        if ($mode === self::MODE_FULL) {
            $template = $registry->getTemplate($templateId);
            if (!$template) {
                return response()->json([
                    'ok' => false,
                    'code' => 'INVALID_TEMPLATE',
                    'message' => 'Unknown templateId.',
                ], 422);
            }
        }

        $export = Export::query()->create([
            'cycle_id' => $cycle->id,
            'status' => 'processing',
        ]);

        Log::info('EXPORT_START', [
            'cycle_id' => $cycle->id,
            'mode' => $mode,
            'template_requested' => $templateId,
        ]);

        $cacheDir = $this->resolveSpreadsheetCacheDir();
        Settings::setCache(new SpreadsheetDiskCache($cacheDir));

        $templateIdRequested = $templateId;
        $templateIdUsed = $templateId;
        $warnings = [];

        try {
            $payloadScope11 = $scope11Payload->buildPayload($cycle);
            $items = is_array($payloadScope11['items'] ?? null) ? $payloadScope11['items'] : [];
            $splitEnabled = (bool) ($payloadScope11['splitEnabled'] ?? false);
            $selectionRows = $payloadScope11['fr041SelectionRows'] ?? [];
            if (!$selectionRows) {
                $selectionRows = $scope11Payload->buildFr041SelectionRows($cycle);
            }
            $selectedRowIds = $this->loadFr041SelectionRowIds($cycle->id);

            $validationResult = $validation->validateCycle($cycle);
            if (! ($validationResult['ok'] ?? false)) {
                $export->status = 'failed';
                $export->error_message = 'Validation failed; cannot export.';
                $export->save();

                return $this->errorResponse(
                    $cycle->id,
                    $templateIdUsed,
                    $mode,
                    'Validation failed; cannot export.',
                    $validationResult['errors'] ?? [],
                    422
                );
            }

            if ($mode === self::MODE_LEAN) {
                $this->logExportStep('ENTER_LEAN_MODE', [
                    'cycle_id' => $cycle->id,
                    'rows' => count($selectionRows),
                ]);

                $efViewOptions = $efView->build($cycle, 'stationary', $registry);
                return $this->runLeanExport(
                    $export,
                    $cycle,
                    $items,
                    $selectionRows,
                    $efViewOptions,
                    $mode,
                    $selectedRowIds,
                    $warnings,
                    $splitEnabled
                );
            }

            if ($mode === self::MODE_FULL_LITE) {
                $this->logExportStep('ENTER_FULL_LITE_MODE', [
                    'cycle_id' => $cycle->id,
                    'rows' => count($selectionRows),
                ]);

                $efViewOptions = $efView->build($cycle, 'stationary', $registry);
                return $this->runFullLiteExport(
                    $export,
                    $cycle,
                    $items,
                    $selectionRows,
                    $efViewOptions,
                    $mode,
                    $selectedRowIds,
                    $warnings,
                    $splitEnabled,
                    $payloadScope11
                );
            }

            $currentStep = 'LOAD_TEMPLATE';
            $this->logExportStep($currentStep, [
                'cycle_id' => $cycle->id,
                'template_requested' => $templateId,
            ]);
            $spreadsheet = $mbax->loadTemplate(null, null, $templateIdUsed);
            $scope11Export->ensureScope11SheetExists($spreadsheet);
            $this->logExportStep('LOAD_TEMPLATE_OK', [
                'cycle_id' => $cycle->id,
                'template' => $templateIdUsed,
            ]);
            $this->logMemoryUsage('LOAD_TEMPLATE');

            $profile = $this->resolveProfileForTemplateId($cycle, $templateIdUsed, $registry);
            if (!$spreadsheet->getSheetByName('_FR041_SEL')) {
                $spreadsheet->createSheet()->setTitle('_FR041_SEL');
            }
            if ($profile) {
                $this->assertRequiredSheets($spreadsheet, $profile['requiredSheets'] ?? []);
                $this->assertHiddenTables($spreadsheet, $profile['hiddenTables'] ?? []);
            }

            $this->logExportStep('BUILD_SCOPE11', [
                'cycle_id' => $cycle->id,
                'items' => count($items),
                'splitEnabled' => $splitEnabled,
            ]);
            $scope11Export->startTrace();
            $scope11Export->writeToSpreadsheet($spreadsheet, $payloadScope11);
            if ($spreadsheet->getSheetByName('_FR041_SEL')) {
                if ($selectionRows) {
                    $scope11Export->writeFr041SelectionRows($spreadsheet, $selectionRows);
                } else {
                    $scope11Export->writeSelectionToSpreadsheet($spreadsheet, $selectedRowIds);
                }
            }
            $this->logMemoryUsage('BUILD_SCOPE11');

            $this->logExportStep('WRITE_FR041', [
                'cycle_id' => $cycle->id,
                'fr041_rows' => count($selectionRows),
            ]);
            $efViewOptions = $efView->build($cycle, 'stationary', $registry);
            $this->logMemoryUsage('WRITE_FR041');

            $this->logExportStep('LOAD_EF_VIEW', [
                'cycle_id' => $cycle->id,
                'ef_options' => count($efViewOptions),
            ]);
            $this->writeEfViewSheet($spreadsheet, $efViewOptions);
            $this->writeFr041EfViewFormulas($spreadsheet, $selectionRows);
            $trace = $scope11Export->endTrace();
            $this->logMemoryUsage('LOAD_EF_VIEW');

            $currentStep = 'SAVE_FILE';
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
            if (method_exists($writer, 'setUseDiskCaching')) {
                $writer->setUseDiskCaching(true, $this->resolveSpreadsheetTempDir());
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
            $this->logExportStep($currentStep, [
                'cycle_id' => $cycle->id,
                'template' => $templateIdUsed,
                'path' => $xlsxPath,
                'size' => is_file($xlsxPath) ? filesize($xlsxPath) : null,
            ]);
            $this->logMemoryUsage('SAVE_FILE');

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
            $this->logExportFailure('ARGUMENT', $cycle->id, $templateIdUsed, $e);
            return $this->errorResponse(
                $cycle->id,
                $templateIdUsed,
                $mode,
                $e->getMessage(),
                [],
                422
            );
        } catch (\RuntimeException $e) {
            $export->status = 'failed';
            $export->error_message = $e->getMessage();
            $export->save();
            $this->logExportFailure('RUNTIME', $cycle->id, $templateIdUsed, $e);
            $message = $e->getMessage();
            if (str_contains($message, 'MBAX template not found')) {
                $message = 'Template missing';
            }
            if (str_contains($message, 'PhpSpreadsheet')) {
                $message = 'Spreadsheet engine missing';
            }
            return $this->errorResponse(
                $cycle->id,
                $templateIdUsed,
                $mode,
                $message,
                [],
                500
            );
        } catch (\Throwable $e) {
            $export->status = 'failed';
            $export->error_message = $e->getMessage();
            $export->save();
            $this->logExportFailure('GENERAL', $cycle->id, $templateIdUsed, $e);
            $payload = [
                'ok' => false,
                'message' => $e->getMessage(),
                'cycle_id' => $cycle->id,
                'template_id' => $templateIdUsed,
                'mode' => $mode,
            ];
            if (config('app.debug')) {
                $payload['debug'] = [
                    'file' => $e->getFile(),
                    'line' => $e->getLine(),
                    'trace' => $this->sanitizeTrace($e->getTrace()),
                ];
            }
            return response()->json($payload, 500);
        } finally {
            Settings::setCache(null);
        }
    }

    public function debug(
        Cycle $cycle,
        TemplateRegistry $registry,
        Scope11PayloadService $scope11Payload,
        EfViewService $efView
    ) {
        $payloadScope11 = $scope11Payload->buildPayload($cycle);
        $items = is_array($payloadScope11['items'] ?? null) ? $payloadScope11['items'] : [];
        $selectionRows = $payloadScope11['fr041SelectionRows'] ?? $scope11Payload->buildFr041SelectionRows($cycle);
        $efViewOptions = $efView->build($cycle, 'stationary', $registry);

        $rows = Scope11StationaryItem::query()
            ->where('cycle_id', $cycle->id)
            ->orderBy('id')
            ->get()
            ->all();
        $config = $this->loadFr041Config($cycle->id);
        $cycleYear = is_numeric($cycle->year ?? null) ? (int) $cycle->year : null;
        $helperResult = Fr041SelectionsV2Helper::resolve($config ?? new Fr041Config(), $cycleYear, $rows);

        $efMap = [];
        foreach ($efViewOptions as $option) {
            if (!is_array($option)) {
                continue;
            }
            $efKey = strtoupper(trim((string) ($option['efKey'] ?? '')));
            if ($efKey === '') {
                continue;
            }
            $efMap[$efKey] = true;
        }

        $efFound = 0;
        $efMissing = 0;
        foreach ($helperResult->includedLines as $line) {
            $efKey = strtoupper(trim((string) ($line['efKey'] ?? '')));
            if ($efKey !== '' && isset($efMap[$efKey])) {
                $efFound++;
                continue;
            }
            $efMissing++;
        }

        return response()->json([
            'ok' => true,
            'cycle_id' => $cycle->id,
            'mode' => self::DEFAULT_MODE,
            'items_count' => count($items),
            'selection_rows' => count($selectionRows),
            'included_lines' => count($helperResult->includedLines),
            'missing_ef_lines' => count($helperResult->missingEfLineIds),
            'ef_found' => $efFound,
            'ef_missing' => $efMissing,
            'ef_view_options' => count($efViewOptions),
            'ef_view_samples' => array_slice(array_values($efViewOptions), 0, 10),
            'fr041_rows' => array_slice($selectionRows, 0, 10),
        ]);
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
            if (strcasecmp(trim($sheetName), self::SCOPE11_DATA_SHEET) === 0) {
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
            if (strcasecmp($tableName, 'tblScope11Stationary') === 0) {
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

    private function logExportStep(string $step, array $context = []): void
    {
        Log::info('EXPORT_STEP', array_merge(['step' => $step], $context));
    }

    private function logExportFailure(string $phase, int $cycleId, string $templateId, \Throwable $e): void
    {
        Log::error('EXPORT_STEP_FAILED', [
            'phase' => $phase,
            'cycle_id' => $cycleId,
            'template_id' => $templateId,
            'message' => $e->getMessage(),
            'file' => $e->getFile(),
            'line' => $e->getLine(),
            'trace' => $e->getTraceAsString(),
        ]);
    }

    /**
     * @param array<int, array<string, mixed>> $trace
     * @return array<int, array<string, mixed>>
     */
    private function sanitizeTrace(array $trace): array
    {
        $out = [];
        foreach ($trace as $frame) {
            $out[] = [
                'file' => $frame['file'] ?? null,
                'line' => $frame['line'] ?? null,
                'function' => $frame['function'] ?? null,
                'class' => $frame['class'] ?? null,
            ];
        }
        return $out;
    }

    private function resolveMode(Request $request): string
    {
        $mode = strtolower(trim((string) $request->query('mode', self::DEFAULT_MODE)));
        $allowed = [self::MODE_LEAN, self::MODE_FULL_LITE, self::MODE_FULL];
        return in_array($mode, $allowed, true) ? $mode : self::DEFAULT_MODE;
    }

    private function resolveSpreadsheetCacheDir(): string
    {
        $dir = storage_path('app/phpspreadsheet-cache');
        if (!is_dir($dir)) {
            mkdir($dir, 0775, true);
        }
        return $dir;
    }

    private function errorResponse(int $cycleId, string $templateId, string $mode, string $message, array $errors = [], int $status = 500)
    {
        $payload = [
            'ok' => false,
            'message' => $message,
            'errors' => $errors,
            'cycle_id' => $cycleId,
            'template_id' => $templateId,
            'mode' => $mode,
        ];
        return response()->json($payload, $status);
    }

    private function resolveSpreadsheetTempDir(): string
    {
        $dir = storage_path('app/phpspreadsheet-temp');
        if (!is_dir($dir)) {
            mkdir($dir, 0775, true);
        }
        return $dir;
    }

    private function logMemoryUsage(string $tag): void
    {
        $this->logExportStep('MEMORY_' . strtoupper($tag), [
            'usage' => memory_get_usage(true),
            'peak' => memory_get_peak_usage(true),
        ]);
    }

    private function runLeanExport(
        Export $export,
        Cycle $cycle,
        array $items,
        array $selectionRows,
        array $efViewOptions,
        string $mode,
        array $selectedRowIds,
        array $warnings,
        bool $splitEnabled
    )
    {
        $spreadsheet = new Spreadsheet();
        $spreadsheet->removeSheetByIndex(0);

        $this->writeEfViewSheet($spreadsheet, $efViewOptions);
        $this->logExportStep('LEAN_EF_VIEW', [
            'cycle_id' => $cycle->id,
            'options' => count($efViewOptions),
        ]);
        $this->logMemoryUsage('LEAN_EF_VIEW');

        $frSheet = $spreadsheet->createSheet();
        $frSheet->setTitle('Fr-04.1');
        $rowsWritten = $this->writeLeanFr041Sheet($frSheet, $selectionRows);
        $this->logExportStep('LEAN_FR041', [
            'cycle_id' => $cycle->id,
            'rows' => $rowsWritten,
        ]);
        $this->logMemoryUsage('LEAN_FR041');

        $writer = IOFactory::createWriter($spreadsheet, 'Xlsx');
        if (method_exists($writer, 'setPreCalculateFormulas')) {
            $writer->setPreCalculateFormulas(false);
        }
        if (method_exists($writer, 'setUseDiskCaching')) {
            $writer->setUseDiskCaching(true, $this->resolveSpreadsheetTempDir());
        }

        $exportDir = storage_path('app/exports');
        if (!is_dir($exportDir)) {
            mkdir($exportDir, 0775, true);
        }

        $relXlsx = 'exports/lean_' . $export->id . '.xlsx';
        $relTrace = 'exports/' . $export->id . '_trace.json';
        $xlsxPath = storage_path('app/' . $relXlsx);
        $tracePath = storage_path('app/' . $relTrace);

        $writer->save($xlsxPath);
        $this->logExportStep('LEAN_SAVE_FILE', [
            'cycle_id' => $cycle->id,
            'path' => $xlsxPath,
            'size' => is_file($xlsxPath) ? filesize($xlsxPath) : null,
        ]);
        $this->logMemoryUsage('LEAN_SAVE_FILE');

        $traceDoc = [
            'exportId' => $export->id,
            'cycleId' => $cycle->id,
            'mode' => $mode,
            'generatedAt' => now()->toIso8601String(),
            'warnings' => $warnings,
            'scope11' => [
                'itemCount' => count($items),
                'splitEnabled' => $splitEnabled,
            ],
            'fr041' => [
                'selectedRowIds' => $selectedRowIds,
                'includedRows' => $this->countIncludedRows($selectionRows),
            ],
        ];

        file_put_contents(
            $tracePath,
            json_encode($traceDoc, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
        );

        $export->status = 'completed';
        $export->file_path = $relXlsx;
        $export->trace_path = $relTrace;
        $export->save();

        $filename = 'VSheetCFO_' . $cycle->id . '_' . now()->format('Ymd_His') . '_lean.xlsx';
        return response()->download($xlsxPath, $filename, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }

    private function runFullLiteExport(
        Export $export,
        Cycle $cycle,
        array $items,
        array $selectionRows,
        array $efViewOptions,
        string $mode,
        array $selectedRowIds,
        array $warnings,
        bool $splitEnabled,
        array $payloadScope11
    ) {
        $spreadsheet = new Spreadsheet();
        $spreadsheet->removeSheetByIndex(0);

        $dataSheet = $spreadsheet->createSheet();
        $dataSheet->setTitle(self::SCOPE11_DATA_SHEET);
        $rowsWritten = $this->writeDataScope11Sheet($dataSheet, $payloadScope11);
        $this->logExportStep('FULL_LITE_DATA', [
            'cycle_id' => $cycle->id,
            'rows' => $rowsWritten,
        ]);
        $this->logMemoryUsage('FULL_LITE_DATA');

        $this->writeEfViewSheet($spreadsheet, $efViewOptions);
        $this->logExportStep('FULL_LITE_EF_VIEW', [
            'cycle_id' => $cycle->id,
            'options' => count($efViewOptions),
        ]);
        $this->logMemoryUsage('FULL_LITE_EF_VIEW');

        $frSheet = $spreadsheet->createSheet();
        $frSheet->setTitle('Fr-04.1');
        $frRows = $this->writeLeanFr041Sheet($frSheet, $selectionRows);
        $this->logExportStep('FULL_LITE_FR041', [
            'cycle_id' => $cycle->id,
            'rows' => $frRows,
        ]);
        $this->logMemoryUsage('FULL_LITE_FR041');

        $writer = IOFactory::createWriter($spreadsheet, 'Xlsx');
        if (method_exists($writer, 'setPreCalculateFormulas')) {
            $writer->setPreCalculateFormulas(false);
        }
        if (method_exists($writer, 'setUseDiskCaching')) {
            $writer->setUseDiskCaching(true, $this->resolveSpreadsheetTempDir());
        }

        $exportDir = storage_path('app/exports');
        if (!is_dir($exportDir)) {
            mkdir($exportDir, 0775, true);
        }

        $relXlsx = 'exports/full_lite_' . $export->id . '.xlsx';
        $relTrace = 'exports/' . $export->id . '_trace.json';
        $xlsxPath = storage_path('app/' . $relXlsx);
        $tracePath = storage_path('app/' . $relTrace);

        $writer->save($xlsxPath);
        $this->logExportStep('FULL_LITE_SAVE_FILE', [
            'cycle_id' => $cycle->id,
            'path' => $xlsxPath,
            'size' => is_file($xlsxPath) ? filesize($xlsxPath) : null,
        ]);
        $this->logMemoryUsage('FULL_LITE_SAVE_FILE');

        $traceDoc = [
            'exportId' => $export->id,
            'cycleId' => $cycle->id,
            'mode' => $mode,
            'generatedAt' => now()->toIso8601String(),
            'warnings' => $warnings,
            'scope11' => [
                'itemCount' => count($items),
                'splitEnabled' => $splitEnabled,
            ],
            'fr041' => [
                'selectedRowIds' => $selectedRowIds,
                'includedRows' => $this->countIncludedRows($selectionRows),
            ],
        ];

        file_put_contents(
            $tracePath,
            json_encode($traceDoc, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
        );

        $export->status = 'completed';
        $export->file_path = $relXlsx;
        $export->trace_path = $relTrace;
        $export->save();

        $filename = 'VSheetCFO_' . $cycle->id . '_' . now()->format('Ymd_His') . '_full_lite.xlsx';
        return response()->download($xlsxPath, $filename, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }

    private function countIncludedRows(array $rows): int
    {
        $count = 0;
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            if (filter_var($row['include'] ?? null, FILTER_VALIDATE_BOOLEAN)) {
                $count++;
            }
        }
        return $count;
    }

    private function writeDataScope11Sheet(Worksheet $ws, array $payloadScope11): int
    {
        $items = is_array($payloadScope11['items'] ?? null) ? $payloadScope11['items'] : [];
        $months = [];
        for ($i = 1; $i <= 12; $i++) {
            $months[] = 'M' . $i;
        }
        $headers = array_merge(
            ['rowId', 'itemLabel', 'unit', 'fuelKey', 'evidence', 'total'],
            $months
        );

        foreach ($headers as $idx => $header) {
            $cell = Coordinate::stringFromColumnIndex($idx + 1) . '1';
            $ws->setCellValue($cell, $header);
        }

        foreach (array_values($items) as $idx => $item) {
            if (!is_array($item)) {
                continue;
            }
            $rowNo = $idx + 2;
            $this->writeEfViewValue($ws, 1, $rowNo, $item['rowId'] ?? null);
            $this->writeEfViewValue($ws, 2, $rowNo, $item['itemLabel'] ?? $item['itemName'] ?? null);
            $this->writeEfViewValue($ws, 3, $rowNo, $item['unit'] ?? null);
            $this->writeEfViewValue($ws, 4, $rowNo, $item['fuelKey'] ?? null);
            $this->writeEfViewValue($ws, 5, $rowNo, $item['evidence'] ?? null);
            $this->writeEfViewValue($ws, 6, $rowNo, $item['total'] ?? null);
            $monthsData = is_array($item['months'] ?? $item['months_json'] ?? null)
                ? $item['months'] ?? $item['months_json']
                : [];
            foreach ($months as $monthIdx => $monthKey) {
                $this->writeEfViewValue($ws, 7 + $monthIdx, $rowNo, $monthsData[$monthKey] ?? null);
            }
        }

        return max(count($items), 0);
    }

    private function writeLeanFr041Sheet(Worksheet $ws, array $selectionRows): int
    {
        $headers = [
            'RowId',
            'ItemName',
            'Unit',
            'Qty',
            'EfCatalog',
            'EfId',
            'EfKey',
            'CO2',
            'Fossil CH4',
            'CH4',
            'N2O',
            'SF6',
            'NF3',
            'HFCs',
            'PFCs',
            'Other',
            'Total',
            'TonCO2e',
        ];

        foreach ($headers as $idx => $header) {
            $cell = Coordinate::stringFromColumnIndex($idx + 1) . '1';
            $ws->setCellValue($cell, $header);
        }

        $rowIndex = 2;
        foreach ($selectionRows as $row) {
            if (!is_array($row)) {
                continue;
            }
            $include = array_key_exists('include', $row)
                ? filter_var($row['include'], FILTER_VALIDATE_BOOLEAN)
                : true;
            if (!$include) {
                continue;
            }
            $rowNo = $rowIndex++;
            $qty = $this->normalizeQuantity($row['qty'] ?? $row['total'] ?? null);
            $efKey = $this->leanEfKey($row);
            $ws->setCellValue('A' . $rowNo, (string) ($row['rowId'] ?? ''));
            $ws->setCellValue('B' . $rowNo, (string) ($row['itemName'] ?? $row['itemLabel'] ?? ''));
            $ws->setCellValue('C' . $rowNo, (string) ($row['unit'] ?? ''));
            $ws->setCellValue('D' . $rowNo, $qty);
            $ws->setCellValue('E' . $rowNo, (string) ($row['efCatalog'] ?? ''));
            $ws->setCellValue('F' . $rowNo, (string) ($row['efId'] ?? ''));
            $ws->setCellValue('G' . $rowNo, $efKey ?: null);

            $keyCell = '$G' . $rowNo;
            $this->setFormula($ws, 'H' . $rowNo, $this->buildEfViewLookup($keyCell, 'F'));
            $this->setFormula($ws, 'I' . $rowNo, $this->buildEfViewLookup($keyCell, 'G'));
            $this->setFormula($ws, 'J' . $rowNo, $this->buildEfViewLookup($keyCell, 'H'));
            $this->setFormula($ws, 'K' . $rowNo, $this->buildEfViewLookup($keyCell, 'I'));
            $this->setFormula($ws, 'L' . $rowNo, $this->buildEfViewLookup($keyCell, 'J'));
            $this->setFormula($ws, 'M' . $rowNo, $this->buildEfViewLookup($keyCell, 'K'));
            $this->setFormula($ws, 'N' . $rowNo, $this->buildEfViewLookup($keyCell, 'L'));
            $this->setFormula($ws, 'O' . $rowNo, $this->buildEfViewLookup($keyCell, 'M'));
            $this->setFormula($ws, 'P' . $rowNo, $this->buildEfViewLookup($keyCell, 'N'));
            $this->setFormula($ws, 'Q' . $rowNo, $this->buildEfViewLookup($keyCell, 'O'));
            $this->setFormula($ws, 'R' . $rowNo, $this->buildLeanTonFormula('D' . $rowNo, 'Q' . $rowNo));
        }

        return $rowIndex - 2;
    }

    private function buildLeanTonFormula(string $qtyCell, string $totalCell): string
    {
        return '=IF(OR(' . $qtyCell . '="",' . $totalCell . '=""),"",(' . $qtyCell . '*' . $totalCell . ')/1000)';
    }

    private function leanEfKey(array $row): string
    {
        $catalog = trim((string) ($row['efCatalog'] ?? ''));
        $efId = trim((string) ($row['efId'] ?? ''));
        if ($catalog === '' || $efId === '') {
            return '';
        }
        return strtoupper($catalog . '::' . $efId);
    }

    private function normalizeQuantity($value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (is_numeric($value)) {
            return (float) $value;
        }
        $trimmed = trim((string) $value);
        return $trimmed === '' ? null : (float) $trimmed;
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

    private function writeEfViewSheet(\PhpOffice\PhpSpreadsheet\Spreadsheet $spreadsheet, array $options): void
    {
        $sheetName = 'EF_VIEW';
        $ws = $spreadsheet->getSheetByName($sheetName);
        if (!$ws) {
            $ws = new Worksheet($spreadsheet, $sheetName);
            $spreadsheet->addSheet($ws);
        }

        $headers = [
            'efKey',
            'catalog',
            'efId',
            'name',
            'unit',
            'CO2',
            'Fossil CH4',
            'CH4',
            'N2O',
            'SF6',
            'NF3',
            'HFCs',
            'PFCs',
            'Other',
            'Total',
            'Source',
        ];

        $maxRow = max(count($options) + 1, 1);
        $maxCol = count($headers);
        for ($r = 1; $r <= $maxRow; $r++) {
            for ($c = 1; $c <= $maxCol; $c++) {
                $cell = Coordinate::stringFromColumnIndex($c) . $r;
                $ws->setCellValue($cell, null);
            }
        }

        foreach ($headers as $idx => $header) {
            $cell = Coordinate::stringFromColumnIndex($idx + 1) . '1';
            $ws->setCellValue($cell, $header);
        }

        foreach (array_values($options) as $idx => $row) {
            if (!is_array($row)) {
                continue;
            }
            $rowNo = $idx + 2;
            $this->writeEfViewValue($ws, 1, $rowNo, $row['efKey'] ?? null);
            $this->writeEfViewValue($ws, 2, $rowNo, $row['catalog'] ?? null);
            $this->writeEfViewValue($ws, 3, $rowNo, $row['efId'] ?? null);
            $this->writeEfViewValue($ws, 4, $rowNo, $row['name'] ?? null);
            $this->writeEfViewValue($ws, 5, $rowNo, $row['unit'] ?? null);
            $this->writeEfViewValue($ws, 6, $rowNo, $row['CO2'] ?? null);
            $this->writeEfViewValue($ws, 7, $rowNo, $row['Fossil CH4'] ?? null);
            $this->writeEfViewValue($ws, 8, $rowNo, $row['CH4'] ?? null);
            $this->writeEfViewValue($ws, 9, $rowNo, $row['N2O'] ?? null);
            $this->writeEfViewValue($ws, 10, $rowNo, $row['SF6'] ?? null);
            $this->writeEfViewValue($ws, 11, $rowNo, $row['NF3'] ?? null);
            $this->writeEfViewValue($ws, 12, $rowNo, $row['HFCs'] ?? null);
            $this->writeEfViewValue($ws, 13, $rowNo, $row['PFCs'] ?? null);
            $this->writeEfViewValue($ws, 14, $rowNo, $row['Other'] ?? null);
            $this->writeEfViewValue($ws, 15, $rowNo, $row['Total'] ?? null);
            $this->writeEfViewValue($ws, 16, $rowNo, $row['Source'] ?? null);
        }
    }

    private function writeEfViewValue(Worksheet $ws, int $col, int $row, $value): void
    {
        $cellRef = Coordinate::stringFromColumnIndex($col) . $row;
        if ($value === null || $value === '') {
            $ws->setCellValue($cellRef, null);
            return;
        }

        if (is_numeric($value)) {
            $ws->setCellValueExplicit($cellRef, (float) $value, DataType::TYPE_NUMERIC);
            return;
        }

        $ws->setCellValueExplicit($cellRef, (string) $value, DataType::TYPE_STRING);
    }

    private function writeFr041EfViewFormulas(\PhpOffice\PhpSpreadsheet\Spreadsheet $spreadsheet, array $selectionRows): void
    {
        $ws = $spreadsheet->getSheetByName('Fr-04.1');
        if (!$ws) return;

        $header = strtoupper(trim((string) $ws->getCell('E9')->getValue()));
        if ($header !== 'CO2') {
            return;
        }

        $efKeyByRow = [];
        foreach ($selectionRows as $row) {
            if (!is_array($row)) continue;
            $rowNo = (int) ($row['rowNo'] ?? 0);
            if ($rowNo <= 0) continue;
            $efKey = trim((string) ($row['efKey'] ?? ''));
            if ($efKey === '') {
                $catalog = trim((string) ($row['efCatalog'] ?? ''));
                $efId = trim((string) ($row['efId'] ?? ''));
                if ($catalog === '' || $efId === '') {
                    continue;
                }
                $efKey = $catalog . '::' . $efId;
            }
            $efKeyByRow[$rowNo] = strtoupper($efKey);
        }

        $efKeyCol = 'AZ';
        if (method_exists($ws->getColumnDimension($efKeyCol), 'setVisible')) {
            $ws->getColumnDimension($efKeyCol)->setVisible(false);
        }

        $startRow = 11;
        $endRow = 40;
        for ($row = $startRow; $row <= $endRow; $row++) {
            $efKey = $efKeyByRow[$row] ?? null;
            $ws->setCellValue($efKeyCol . $row, $efKey ?: null);
            $keyCell = '$' . $efKeyCol . $row;

            $this->setFormula($ws, 'E' . $row, $this->buildEfViewLookup($keyCell, 'F'));
            $this->setFormula($ws, 'F' . $row, $this->buildEfViewLookup($keyCell, 'G'));
            $this->setFormula($ws, 'G' . $row, $this->buildEfViewLookup($keyCell, 'H'));
            $this->setFormula($ws, 'H' . $row, $this->buildEfViewLookup($keyCell, 'I'));
            $this->setFormula($ws, 'I' . $row, $this->buildEfViewLookup($keyCell, 'J'));
            $this->setFormula($ws, 'J' . $row, $this->buildEfViewLookup($keyCell, 'K'));
            $this->setFormula($ws, 'K' . $row, $this->buildEfViewLookup($keyCell, 'L'));
            $this->setFormula($ws, 'L' . $row, $this->buildEfViewLookup($keyCell, 'M'));
            $this->setFormula($ws, 'O' . $row, $this->buildEfViewLookup($keyCell, 'N'));
            $this->setFormula($ws, 'Q' . $row, $this->buildEfViewLookup($keyCell, 'O'));
        }
    }

    private function setFormula(Worksheet $ws, string $cell, string $formula): void
    {
        $target = $ws->getCell($cell);
        if ($target->isFormula()) {
            $current = strtoupper((string) $target->getValue());
            if (str_contains($current, 'EF_VIEW')) {
                return;
            }
        }
        $target->setValue($formula);
    }

    private function buildEfViewLookup(string $keyCell, string $targetCol): string
    {
        return '=IF(' . $keyCell . '="",0,XLOOKUP(' . $keyCell . ',EF_VIEW!$A:$A,EF_VIEW!$' . $targetCol . ':$' . $targetCol . ',0))';
    }
}
