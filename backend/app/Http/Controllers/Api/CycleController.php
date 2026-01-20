<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Cycle;
use App\Models\Fr041Config;
use App\Models\Scope11StationaryItem;
use App\Services\EfResolverService;
use App\Services\MbaxTemplateService;
use App\Services\Scope11PayloadService;
use App\Services\SheetRegistry;
use App\Services\TemplateRegistry;
use App\Services\Export\Scope11HiddenTableExportService;
use App\Exceptions\TemplateNotFoundException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Reader\Xlsx;

class CycleController extends Controller
{
    /**
     * Prefer base workbook to avoid demo/customer templates missing hidden tables.
     */
    private function resolveTemplateBasePath(string $templateId, TemplateRegistry $registry): string
    {
        $mapping = $registry->getTemplate($templateId);
        $envKey = $mapping['path']['env'] ?? null;
        if (is_string($envKey) && $envKey !== '') {
            $envPath = env($envKey);
            if (is_string($envPath) && $envPath !== '' && is_file($envPath)) {
                return $envPath;
            }
        }

        $fallbackRel = $mapping['path']['fallback'] ?? null;
        if (is_string($fallbackRel) && $fallbackRel !== '') {
            $fallback = base_path($fallbackRel);
            if (is_file($fallback)) return $fallback;
        }

        throw new \RuntimeException("Template workbook not found for templateId={$templateId}");
    }

    /**
     * Load spreadsheet with explicit sheet list to prevent missing required hidden sheets.
     */
    private function loadSpreadsheet(string $path, array $loadSheetsOnly = []): \PhpOffice\PhpSpreadsheet\Spreadsheet
    {
        if (!$loadSheetsOnly) {
            return IOFactory::load($path);
        }

        $reader = new Xlsx();
        $reader->setReadDataOnly(false);
        $reader->setLoadSheetsOnly(array_values(array_unique($loadSheetsOnly)));
        return $reader->load($path);
    }

    /**
     * Default preview sheets (visible + references) — extend as needed.
     */
    private function defaultPreviewSheets(): array
    {
        return [
            'Fr-01',
            'Fr-02',
            'Fr-03.1',
            'Fr-03.2',
            'Fr-04.1',
            'Fr-04.2',
            'Fr-05',
            'EF TGO AR4',
            'EF TGO AR5',
            'บันทึกการปรับปรุง',
            '_FR041_SEL',
        ];
    }
    public function index()
    {
        return response()->json(
            Cycle::query()
                ->orderByDesc('id')
                ->get(['id', 'year', 'name', 'template_id'])
        );
    }

    public function store(Request $request, TemplateRegistry $registry)
    {
        $payload = $request->validate([
            'year' => ['required', 'integer'],
            'name' => ['required', 'string', 'max:255'],
            'data_json' => ['nullable', 'array'],
        ]);

        $year = (int) $payload['year'];
        $defaultProfile = $year >= 2026 ? 'vsheet_cfo_2026' : 'vsheet_cfo_2025';
        if (!$registry->getProfile($defaultProfile)) {
            $defaultProfile = 'mbax';
        }

        $cycle = Cycle::create([
            'year' => $payload['year'],
            'name' => $payload['name'],
            'data_json' => $payload['data_json'] ?? null,
            'template_id' => $defaultProfile,
        ]);

        return response()->json($cycle);
    }

    public function show(Cycle $cycle)
    {
        return response()->json($cycle);
    }

    public function updateData(Request $request, Cycle $cycle)
    {
        if ($cycle->locked_at) {
            return response()->json([
                'ok' => false,
                'code' => 'CYCLE_LOCKED',
                'message' => 'This reporting period is locked.',
            ], 423);
        }

        $payload = $request->validate([
            'data_json' => ['nullable', 'array'],
            'data' => ['nullable', 'array'],
        ]);

        $cycle->data_json = $payload['data_json'] ?? $payload['data'] ?? [];
        $cycle->save();

        return response()->json([
            'id' => $cycle->id,
            'updated' => true,
            'previewVersion' => optional($cycle->updated_at)->toIso8601String(),
        ]);
    }

    public function updateTemplate(Request $request, Cycle $cycle, TemplateRegistry $registry)
    {
        if ($cycle->locked_at) {
            return response()->json([
                'ok' => false,
                'code' => 'CYCLE_LOCKED',
                'message' => 'This reporting period is locked.',
            ], 423);
        }

        $payload = $request->validate([
            'templateId' => ['required', 'string', 'max:200'],
        ]);

        $templateId = strtolower(trim((string) $payload['templateId']));
        if ($templateId === '' || !$registry->getProfile($templateId)) {
            return response()->json([
                'code' => 'INVALID_TEMPLATE',
                'message' => 'Unknown templateId.',
            ], 422);
        }

        $cycle->template_id = $templateId;
        $cycle->save();

        return response()->json([
            'id' => $cycle->id,
            'templateId' => $cycle->template_id,
            'updated' => true,
        ]);
    }

    public function preview(
        Request $request,
        Cycle $cycle,
        MbaxTemplateService $mbax,
        TemplateRegistry $registry,
        SheetRegistry $sheetRegistry,
        Scope11HiddenTableExportService $scope11Export,
        Scope11PayloadService $scope11Payload
    )
    {
        try {
            $cycle->refresh();
            $payload = $request->validate([
                'sheetId' => ['nullable', 'string', 'max:200'],
                'templateKey' => ['nullable', 'string', 'max:200'],
            ]);

            $rawSheetId = trim((string) (
                $request->query('sheetKey')
                ?? $request->input('sheetKey')
                ?? ($payload['sheetId'] ?? null)
                ?? $request->query('sheetId')
                ?? $request->input('sheetId')
                ?? 'fr041'
            ));
            if ($rawSheetId === '') {
                $rawSheetId = 'fr041';
            }
            $sheetKey = strtolower($rawSheetId);
            if ($sheetKey === 'fr-04.1') {
                $sheetKey = 'fr041';
            }

            $profileId = isset($cycle->template_id) && is_string($cycle->template_id) && trim($cycle->template_id) !== ''
                ? strtolower(trim($cycle->template_id))
                : 'mbax';
            $profile = $registry->getProfile($profileId);
            if (!$profile) {
                return response()->json([
                    'code' => 'INVALID_TEMPLATE',
                    'message' => 'Unknown templateId.',
                ], 422);
            }

            $templateId = $this->resolveTemplateId($cycle, $registry);
            $templateKey = trim((string) ($payload['templateKey'] ?? $request->query('templateKey', '')));
            if ($templateKey !== '') {
                $templateId = $this->normalizeTemplateKey($templateKey, $registry) ?? $templateId;
            }
            if ($sheetKey === 'fr041') {
                $year = is_numeric($cycle->year ?? null) ? (int) $cycle->year : null;
                if ($year !== null && $year >= 2026 && $this->templateExists($registry, 'VSHEET_CFO_2026')) {
                    $templateId = 'VSHEET_CFO_2026';
                } elseif ($this->templateExists($registry, 'VSHEET_CFO_2025')) {
                    $templateId = 'VSHEET_CFO_2025';
                } elseif ($this->templateExists($registry, 'VSHEET_CFO')) {
                    $templateId = 'VSHEET_CFO';
                }
            }
            $template = $registry->getTemplate($templateId);
            if (!$template) {
                return response()->json([
                    'code' => 'INVALID_TEMPLATE',
                    'message' => 'Unknown templateId.',
                ], 422);
            }

            $sheetIdMap = [
                'fr041' => ['sheetId' => 'FR041', 'sheetName' => 'Fr-04.1'],
                'scope11_stationary' => ['sheetId' => 'SCOPE11_STATIONARY', 'sheetName' => '1.1 Stationary '],
            ];
            $normalizedSheetId = $sheetIdMap[$sheetKey]['sheetId'] ?? $sheetRegistry->normalizeSheetId($rawSheetId);
            $requiredSheets = $this->resolveRequiredSheets($profile['requiredSheets'] ?? [], $sheetKey);
            $requiredTables = $this->resolveRequiredTables($profile['hiddenTables'] ?? [], $sheetKey);
            $allowedSheetIds = $sheetRegistry->listSheetIds($templateId);
            $workbookSheetNames = [];
            if (!$allowedSheetIds) {
                try {
                    $pathForAllowed = $this->resolveTemplateBasePath($templateId, $registry);
                    $previewSheetNames = $this->defaultPreviewSheets();
                    $requiredForAllowed = array_unique(array_merge($previewSheetNames, $requiredSheets ?? []));
                    $probe = $this->loadSpreadsheet($pathForAllowed, $requiredForAllowed);
                    $workbookSheetNames = $probe->getSheetNames();
                    $allowedSheetIds = array_values(array_unique(array_map(
                        fn ($name) => $sheetRegistry->normalizeSheetId($name),
                        $workbookSheetNames
                    )));
                } catch (\Throwable $e) {
                    $workbookSheetNames = [];
                }
            }
            if (!in_array($normalizedSheetId, $allowedSheetIds, true)) {
                return response()->json([
                    'code' => 'INVALID_SHEET_ID',
                    'message' => 'Invalid sheetId.',
                    'allowed' => $allowedSheetIds,
                    'workbookSheets' => $workbookSheetNames,
                ], 422);
            }

            $sheetConfig = $sheetRegistry->getSheet($templateId, $normalizedSheetId);
            if (!$sheetConfig) {
                return response()->json([
                    'code' => 'INVALID_SHEET_ID',
                    'message' => 'Sheet mapping missing.',
                ], 422);
            }

            $sheet = (string) ($sheetIdMap[$sheetKey]['sheetName'] ?? ($sheetConfig['name'] ?? ''));
            $range = trim((string) ($sheetConfig['previewRange'] ?? ''));
            if (trim($sheet) === '') {
                return response()->json([
                    'code' => 'INVALID_SHEET_ID',
                    'message' => 'Sheet mapping missing.',
                ], 422);
            }
            if ($range === '') {
                return response()->json([
                    'code' => 'INVALID_RANGE',
                    'message' => 'Preview range missing.',
                ], 422);
            }

            $data = $cycle->data_json ?? [];
            if (!is_array($data)) {
                $data = [];
            }
            if ($sheetKey === 'fr041' && !$this->hasPreviewData($data, $normalizedSheetId)) {
                $blocks = $this->normalizePreviewBlocks(
                    $this->resolvePreviewBlocks($profile, $sheetKey, [
                        ['id' => 'header', 'range' => 'A1:K10'],
                        ['id' => 'main', 'range' => 'A11:AO70'],
                    ])
                );
                return response()->json([
                    'ok' => true,
                    'sheetId' => $sheetKey,
                    'sheetName' => $sheet,
                    'blocks' => [
                        $this->buildEmptyPreviewBlock($sheet, $blocks[0]['range'], $blocks[0]['id']),
                        $this->buildEmptyPreviewBlock($sheet, $blocks[1]['range'], $blocks[1]['id']),
                    ],
                ]);
            }

            try {
                $resolvedPath = $this->resolveTemplateBasePath($templateId, $registry);
                $loadSheetsOnly = array_merge($this->defaultPreviewSheets(), $requiredSheets);
                $spreadsheet = $this->loadSpreadsheet($resolvedPath, $loadSheetsOnly);
                $this->assertRequiredSheets($spreadsheet, $requiredSheets);
                $this->assertHiddenTables($spreadsheet, $requiredTables);
            } catch (\RuntimeException $e) {
                if ($sheetKey === 'fr041') {
                    Log::warning('FR-04.1 template missing required sheet, fallback to MBAX', [
                        'cycleId' => $cycle->id,
                        'templateId' => $templateId,
                        'error' => $e->getMessage(),
                    ]);
                    $templateId = MbaxTemplateService::DEFAULT_TEMPLATE_ID;
                    $resolvedPath = $this->resolveTemplateBasePath($templateId, $registry);
                    $loadSheetsOnly = array_merge($this->defaultPreviewSheets(), $requiredSheets);
                    $spreadsheet = $this->loadSpreadsheet($resolvedPath, $loadSheetsOnly);
                    $this->assertRequiredSheets($spreadsheet, $requiredSheets);
                    $this->assertHiddenTables($spreadsheet, $requiredTables);
                } else {
                    throw $e;
                }
            }

            if (isset($resolvedPath)) {
                Log::debug('Preview resolved template', [
                    'cycleId' => $cycle->id,
                    'sheetId' => $sheetKey,
                    'templateId' => $templateId,
                    'templatePath' => $resolvedPath,
                    'sheetNames' => array_map(fn ($s) => $s->getTitle(), $spreadsheet->getAllSheets()),
                    'loadSheetsOnly' => $loadSheetsOnly ?? [],
                ]);
            }

            if (!$spreadsheet->getSheetByName($sheet)) {
                return response()->json([
                    'ok' => false,
                    'message' => "Sheet not found: {$sheet}",
                    'availableSheets' => $spreadsheet->getSheetNames(),
                ], 422);
            }
            $mbax->applyData(
                $spreadsheet,
                $data,
                $cycle->attachments()->get()->all(),
                $sheet,
                $range,
                $templateId
            );
            if ($sheetKey === 'fr041') {
                $payloadScope11 = $scope11Payload->buildPayload($cycle);
                if (empty($payloadScope11['items'] ?? [])) {
                    $legacy = $this->buildScope11PayloadFromCycleData($data);
                    if (!empty($legacy['items'] ?? [])) {
                        $payloadScope11 = $legacy;
                    }
                }

                $scope11Export->writeToSpreadsheet($spreadsheet, $payloadScope11);

                if ($spreadsheet->getSheetByName('_FR041_SEL')) {
                    $selectionRows = $scope11Payload->buildFr041SelectionRows($cycle);
                    if ($selectionRows) {
                        $scope11Export->writeFr041SelectionRows($spreadsheet, $selectionRows);
                    } else {
                        $legacyRows = $this->loadFr041SelectionRowsFromData($data);
                        if ($legacyRows) {
                            $scope11Export->writeFr041SelectionRows($spreadsheet, $legacyRows);
                        } else {
                            $selection = $this->loadFr041SelectionRowIds($cycle->id);
                            $scope11Export->writeSelectionToSpreadsheet($spreadsheet, $selection);
                        }
                    }
                }
            }
            if ($sheetKey === 'fr041') {
                $blocksDef = $this->normalizePreviewBlocks(
                    $this->resolvePreviewBlocks($profile, $sheetKey, [
                        ['id' => 'header', 'range' => 'A1:K10'],
                        ['id' => 'main', 'range' => 'A11:AO70'],
                    ])
                );
                $blocks = [
                    $this->buildPreviewBlock($mbax, $spreadsheet, $sheet, $blocksDef[0]['range'], $blocksDef[0]['id']),
                    $this->buildPreviewBlockWithFallback(
                        $mbax,
                        $spreadsheet,
                        $sheet,
                        $blocksDef[1]['range'],
                        'A11:AO120',
                        $blocksDef[1]['id']
                    ),
                ];
                return response()->json([
                    'ok' => true,
                    'sheetId' => $sheetKey,
                    'sheetName' => $sheet,
                    'blocks' => $blocks,
                    'previewVersion' => optional($cycle->updated_at)->toIso8601String(),
                ]);
            }

            $preview = $mbax->buildPreview($spreadsheet, $sheet, $range);
            $preview['previewVersion'] = optional($cycle->updated_at)->toIso8601String();
            return response()->json($preview);
        } catch (\InvalidArgumentException $e) {
            return response()->json([
                'code' => 'INVALID_RANGE',
                'message' => $e->getMessage(),
            ], 422);
        } catch (\RuntimeException $e) {
            if (str_contains($e->getMessage(), 'Sheet')) {
                return response()->json([
                    'code' => 'INVALID_SHEET_ID',
                    'message' => $e->getMessage(),
                ], 422);
            }
            throw $e;
        } catch (\Throwable $e) {
            Log::error('Preview failed', [
                'cycleId' => $cycle->id,
                'sheetId' => $request->query('sheetId'),
                'error' => $e->getMessage(),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
            ]);
            return response()->json([
                'ok' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function dashboardSections(Cycle $cycle, EfResolverService $efResolver)
    {
        $defs = [
            ['sectionId' => '1.1', 'title' => '1.1 Stationary Combustion', 'scope' => 'Scope 1'],
            ['sectionId' => '1.2', 'title' => '1.2 Mobile Combustion', 'scope' => 'Scope 1'],
            ['sectionId' => '1.3', 'title' => '1.3 Process Emission', 'scope' => 'Scope 1'],
            ['sectionId' => '1.4', 'title' => '1.4 Fugitive Emission', 'scope' => 'Scope 1'],
            ['sectionId' => '1.5', 'title' => '1.5 Biomass Emission', 'scope' => 'Scope 1'],
            ['sectionId' => '2.1', 'title' => '2.1 Purchased Electricity', 'scope' => 'Scope 2'],
            ['sectionId' => '2.2', 'title' => '2.2 Purchased Energy', 'scope' => 'Scope 2'],
            ['sectionId' => '3.1', 'title' => '3.1 Purchased Goods & Services', 'scope' => 'Scope 3'],
            ['sectionId' => '3.2', 'title' => '3.2 Capital goods', 'scope' => 'Scope 3'],
            ['sectionId' => '3.3', 'title' => '3.3 Fuel- and energy-related activities', 'scope' => 'Scope 3'],
            ['sectionId' => '3.4', 'title' => '3.4 Upstream transportation and distribution', 'scope' => 'Scope 3'],
            ['sectionId' => '3.5', 'title' => '3.5 Waste generated in operations', 'scope' => 'Scope 3'],
            ['sectionId' => '3.6', 'title' => '3.6 Business travel', 'scope' => 'Scope 3'],
            ['sectionId' => '3.7', 'title' => '3.7 Employee commuting', 'scope' => 'Scope 3'],
            ['sectionId' => '3.8', 'title' => '3.8 Upstream leased assets', 'scope' => 'Scope 3'],
            ['sectionId' => '3.9', 'title' => '3.9 Downstream transportation and distribution', 'scope' => 'Scope 3'],
            ['sectionId' => '3.10', 'title' => '3.10 Processing of sold products', 'scope' => 'Scope 3'],
            ['sectionId' => '3.11', 'title' => '3.11 Use of sold products', 'scope' => 'Scope 3'],
            ['sectionId' => '3.12', 'title' => '3.12 End-of-life treatment of sold products', 'scope' => 'Scope 3'],
            ['sectionId' => '3.13', 'title' => '3.13 Downstream leased assets', 'scope' => 'Scope 3'],
            ['sectionId' => '3.14', 'title' => '3.14 Franchises', 'scope' => 'Scope 3'],
            ['sectionId' => '3.15', 'title' => '3.15 Investments', 'scope' => 'Scope 3'],
        ];

        $data = $cycle->data_json ?? [];
        $data = is_array($data) ? $data : [];
        $inventory = is_array($data['inventory'] ?? null) ? $data['inventory'] : [];

        $sections = array_values(array_map(function (array $entry) use ($cycle, $inventory, $efResolver) {
            $sectionId = (string) ($entry['sectionId'] ?? '');
            $status = [
                'hasData' => false,
                'missingEvidenceCount' => 0,
                'missingEfCount' => 0,
            ];

            if ($sectionId === '1.1') {
                $status = $this->buildScope11Status($cycle, $efResolver);
            } elseif (str_starts_with($sectionId, '3.')) {
                $status = $this->buildInventoryStatus($inventory, $sectionId, 3, true);
            } elseif (str_starts_with($sectionId, '2.')) {
                $status = $this->buildInventoryStatus($inventory, $sectionId, 2, false);
            } elseif (str_starts_with($sectionId, '1.')) {
                $status = $this->buildInventoryStatus($inventory, $sectionId, 1, false);
            }

            $status['ok'] = !($status['hasData'] ?? false) || (((int) ($status['missingEvidenceCount'] ?? 0)) === 0 && ((int) ($status['missingEfCount'] ?? 0)) === 0);

            return [
                'sectionId' => $sectionId,
                'title' => $entry['title'],
                'scope' => $entry['scope'],
                'status' => $status,
            ];
        }, $defs));

        return response()->json([
            'ok' => true,
            'sections' => $sections,
        ]);
    }

    private function buildInventoryStatus(array $inventory, string $sectionId, int $scopeNo, bool $requireEf): array
    {
        $hasData = false;
        $missingEvidence = 0;
        $missingEf = 0;

        foreach ($inventory as $row) {
            if (!is_array($row)) continue;
            if ((int) ($row['scope'] ?? 0) !== $scopeNo) continue;

            $rowSectionId = $scopeNo === 3 ? $this->resolveScope3SectionId($row) : (string) ($row['subScope'] ?? '');
            if ($rowSectionId !== $sectionId) continue;

            $hasActivity = $this->inventoryRowHasActivity($row);
            if (!$hasActivity) continue;

            $hasData = true;

            $evidence = trim((string) ($row['dataEvidence'] ?? $row['evidence'] ?? ''));
            if ($evidence === '') {
                $missingEvidence += 1;
            }

            if ($requireEf) {
                $ef = $row['ef'] ?? null;
                if (!is_numeric($ef)) {
                    $missingEf += 1;
                }
            }
        }

        return [
            'hasData' => $hasData,
            'missingEvidenceCount' => $missingEvidence,
            'missingEfCount' => $missingEf,
        ];
    }

    private function inventoryRowHasActivity(array $row): bool
    {
        $monthly = is_array($row['quantityMonthly'] ?? null) ? $row['quantityMonthly'] : [];
        $hasMonth = false;
        foreach ($monthly as $value) {
            if ($value === null || $value === '') continue;
            if (!is_numeric($value)) continue;
            if ((float) $value !== 0.0) {
                $hasMonth = true;
                break;
            }
        }

        if ($hasMonth) {
            return true;
        }

        $qty = $row['quantityPerYear'] ?? null;
        return is_numeric($qty) && (float) $qty !== 0.0;
    }

    private function resolveScope3SectionId(array $row): string
    {
        $subScope = trim((string) ($row['subScope'] ?? ''));
        if (str_starts_with($subScope, '3.')) return $subScope;

        $tgoNo = (string) ($row['tgoNo'] ?? '');
        if (preg_match('/3\\.(\\d+(?:\\.\\d+)?)/', $tgoNo, $m)) {
            return '3.' . $m[1];
        }
        return '';
    }

    private function buildScope11Status(Cycle $cycle, EfResolverService $efResolver): array
    {
        $hasData = false;
        $missingEvidence = 0;
        $missingEf = 0;

        if (!Schema::hasTable('scope11_stationary_items') || !Schema::hasTable('ef_profiles') || !Schema::hasTable('ef_library_entries')) {
            return [
                'hasData' => false,
                'missingEvidenceCount' => 0,
                'missingEfCount' => 0,
            ];
        }

        $rows = Scope11StationaryItem::query()
            ->where('cycle_id', $cycle->id)
            ->orderBy('id')
            ->get();

        foreach ($rows as $row) {
            $rowId = trim((string) ($row->row_id ?? ''));
            if ($rowId === '') continue;

            $months = is_array($row->months_json ?? null) ? $row->months_json : [];
            $hasActivity = $this->hasAnyMonthValue($months);
            if (!$hasActivity) {
                continue;
            }

            $hasData = true;

            $evidence = trim((string) ($row->evidence ?? ''));
            if ($evidence === '') {
                $missingEvidence += 1;
            }

            $item = [
                'rowId' => $rowId,
                'fuelKey' => (string) ($row->fuel_key ?? ''),
                'unit' => (string) ($row->unit ?? ''),
                'label' => (string) ($row->item_label ?? ''),
            ];
            $resolved = $efResolver->resolveScope11($cycle, $item, null);
            if (!($resolved['ok'] ?? false)) {
                $missingEf += 1;
            }
        }

        return [
            'hasData' => $hasData,
            'missingEvidenceCount' => $missingEvidence,
            'missingEfCount' => $missingEf,
        ];
    }

    private function buildScope11PayloadFromCycleData(array $data): array
    {
        $items = [];
        $rows = is_array($data['inventory'] ?? null) ? $data['inventory'] : [];
        $derived = ['BIODIESEL_STATIONARY', 'ETHANOL_STATIONARY'];

        foreach ($rows as $row) {
            if (!is_array($row)) continue;
            if ((string) ($row['subScope'] ?? '') !== '1.1') continue;

            $fuelKeyRaw = trim((string) ($row['fuelKey'] ?? ''));
            if ($fuelKeyRaw !== '' && in_array(strtoupper($fuelKeyRaw), $derived, true)) {
                continue;
            }

            $rowId = $fuelKeyRaw !== '' ? $fuelKeyRaw : (string) ($row['id'] ?? '');
            if ($rowId === '') continue;

            $unitRaw = strtolower(trim((string) ($row['unit'] ?? 'L')));
            $unit = $unitRaw === 'kg' ? 'kg' : 'L';

            $fuelKey = $this->resolveScope11FuelKey($row);

            $months = [];
            $monthly = is_array($row['quantityMonthly'] ?? null) ? $row['quantityMonthly'] : [];
            for ($i = 0; $i < 12; $i++) {
                if (!array_key_exists($i, $monthly)) continue;
                $value = $monthly[$i];
                if ($value === null || $value === '') continue;
                $months['M' . ($i + 1)] = $value;
            }

            $items[] = [
                'rowId' => $rowId,
                'fuelKey' => $fuelKey,
                'label' => trim((string) ($row['itemLabel'] ?? '')),
                'evidence' => trim((string) ($row['dataEvidence'] ?? '')),
                'unit' => $unit,
                'otherType' => isset($row['otherType']) ? (string) $row['otherType'] : null,
                'months' => $months,
            ];
        }

        $splitEnabled = false;
        foreach ($items as $item) {
            if (($item['unit'] ?? '') !== 'L') continue;
            if (!empty($item['months'])) {
                $splitEnabled = true;
                break;
            }
        }

        $headerMonths = is_array($data['scope11HeaderMonths'] ?? null) ? $data['scope11HeaderMonths'] : null;
        $periodYear = $data['scope11PeriodYear'] ?? null;

        return [
            'splitEnabled' => $splitEnabled,
            'periodYear' => $periodYear,
            'headerMonths' => $headerMonths,
            'items' => $items,
        ];
    }

    private function resolveScope11FuelKey(array $row): string
    {
        $fuelType = strtoupper(trim((string) ($row['fuelType'] ?? '')));
        if ($fuelType !== '') {
            return $fuelType === '91/95' ? '91/95' : $fuelType;
        }

        $fuelKey = strtoupper(trim((string) ($row['fuelKey'] ?? '')));
        if ($fuelKey === '') return 'OTHER';
        if (str_contains($fuelKey, 'DIESEL_B7')) return 'B7';
        if (str_contains($fuelKey, 'DIESEL_B10')) return 'B10';
        if (str_contains($fuelKey, 'GASOHOL_9195') || str_contains($fuelKey, '9195')) return '91/95';
        if (str_contains($fuelKey, 'GASOHOL_E20') || str_contains($fuelKey, 'E20')) return 'E20';
        if (str_contains($fuelKey, 'LPG')) return 'LPG';
        if (str_contains($fuelKey, 'FUEL_OIL') || str_contains($fuelKey, 'OIL')) return 'FUEL_OIL';
        return 'OTHER';
    }

    private function buildPreviewBlock(
        MbaxTemplateService $mbax,
        \PhpOffice\PhpSpreadsheet\Spreadsheet $spreadsheet,
        string $sheetName,
        string $range,
        string $id
    ): array {
        $preview = $mbax->buildPreview($spreadsheet, $sheetName, $range);
        return [
            'id' => $id,
            'range' => $range,
            'columns' => $preview['columns'] ?? [],
            'rows' => $preview['rows'] ?? [],
        ];
    }

    private function buildPreviewBlockWithFallback(
        MbaxTemplateService $mbax,
        \PhpOffice\PhpSpreadsheet\Spreadsheet $spreadsheet,
        string $sheetName,
        string $range,
        string $fallbackRange,
        string $id
    ): array {
        try {
            return $this->buildPreviewBlock($mbax, $spreadsheet, $sheetName, $range, $id);
        } catch (\InvalidArgumentException $e) {
            return $this->buildPreviewBlock($mbax, $spreadsheet, $sheetName, $fallbackRange, $id);
        }
    }

    private function resolvePreviewBlocks(array $profile, string $sheetKey, array $fallback): array
    {
        $ranges = $profile['previewRanges'][$sheetKey]['blocks'] ?? null;
        if (!is_array($ranges) || count($ranges) < 2) {
            return $fallback;
        }
        return $ranges;
    }

    private function normalizePreviewBlocks(array $blocks): array
    {
        $normalized = [];
        foreach ($blocks as $block) {
            if (!is_array($block)) continue;
            $id = trim((string) ($block['id'] ?? ''));
            $range = trim((string) ($block['range'] ?? ''));
            if ($id === '' || $range === '') continue;
            $normalized[] = ['id' => $id, 'range' => $range];
        }
        return count($normalized) >= 2 ? $normalized : $blocks;
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

    private function hasPreviewData(array $data, string $sheetId): bool
    {
        if (!$data) return false;
        $inventory = $data['inventory'] ?? [];
        if (!is_array($inventory) || !$inventory) {
            return false;
        }

        if ($sheetId === 'SCOPE11_STATIONARY') {
            return $this->hasInventoryForScope($inventory, '1.1');
        }
        if ($sheetId === 'FR041') {
            return $this->hasInventoryForScope($inventory, '1.1') || $this->hasInventoryForScope($inventory, '1.2');
        }

        return true;
    }

    private function hasInventoryForScope(array $inventory, string $subScope): bool
    {
        foreach ($inventory as $row) {
            if (!is_array($row)) continue;
            if ((string) ($row['subScope'] ?? '') !== $subScope) continue;
            return true;
        }
        return false;
    }

    private function buildEmptyPreview(string $sheetName, string $range): array
    {
        $rangeInfo = $this->parseRange($range);
        $columns = [];
        for ($c = $rangeInfo['startCol']; $c <= $rangeInfo['endCol']; $c++) {
            $columns[] = Coordinate::stringFromColumnIndex($c);
        }

        $rows = [];
        for ($r = $rangeInfo['startRow']; $r <= $rangeInfo['endRow']; $r++) {
            $cells = [];
            for ($c = $rangeInfo['startCol']; $c <= $rangeInfo['endCol']; $c++) {
                $addr = Coordinate::stringFromColumnIndex($c) . $r;
                $cells[] = [
                    'addr' => $addr,
                    'raw' => null,
                    'formula' => null,
                    'computed' => null,
                    'display' => null,
                    'calcError' => null,
                    'type' => 'text',
                ];
            }
            $rows[] = [
                'rowNumber' => $r,
                'cells' => $cells,
            ];
        }

        return [
            'sheetName' => $sheetName,
            'columns' => $columns,
            'rows' => $rows,
            'range' => $range,
        ];
    }

    private function buildEmptyPreviewBlock(string $sheetName, string $range, string $id): array
    {
        $preview = $this->buildEmptyPreview($sheetName, $range);
        return [
            'id' => $id,
            'range' => $range,
            'columns' => $preview['columns'],
            'rows' => $preview['rows'],
        ];
    }

    private function parseRange(string $range): array
    {
        $clean = strtoupper(trim(str_replace('$', '', $range)));
        if (!preg_match('/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/', $clean, $m)) {
            throw new \InvalidArgumentException("Invalid range: {$range}");
        }
        return [
            'startCol' => Coordinate::columnIndexFromString($m[1]),
            'startRow' => (int) $m[2],
            'endCol' => Coordinate::columnIndexFromString($m[3]),
            'endRow' => (int) $m[4],
        ];
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

    private function normalizeTemplateKey(string $templateKey, TemplateRegistry $registry): ?string
    {
        $raw = strtolower(trim($templateKey));
        if ($raw === '') return null;
        $profile = $registry->getProfile($raw);
        if ($profile) {
            return $registry->resolveTemplateIdForProfile($raw);
        }
        $template = $registry->getTemplate($templateKey);
        if ($template) {
            return $templateKey;
        }
        return null;
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

    private function loadFr041SelectionRowsFromData(array $data): array
    {
        $rows = $data['fr041Selection'] ?? $data['fr041Selections'] ?? null;
        return is_array($rows) ? $rows : [];
    }

    private function resolveRequiredSheets(array $requiredSheets, string $sheetKey): array
    {
        if ($sheetKey !== 'fr041') {
            return array_values(array_filter($requiredSheets, function ($name) {
                $normalized = strtoupper(trim((string) $name));
                return $normalized !== '_DATA_SCOPE11' && $normalized !== '_FR041_SEL';
            }));
        }
        return $requiredSheets;
    }

    private function resolveRequiredTables(array $hiddenTables, string $sheetKey): array
    {
        if ($sheetKey !== 'fr041') {
            return [];
        }
        return $hiddenTables;
    }
}
