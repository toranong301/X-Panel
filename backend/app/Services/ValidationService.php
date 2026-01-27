<?php

namespace App\Services;

use App\Models\Cycle;
use App\Models\EmissionResult;
use App\Models\Fr041Config;
use App\Models\Scope11StationaryItem;
use App\Services\Fr041SelectionsV2Helper;
use Illuminate\Support\Facades\Schema;

class ValidationService
{
    public function __construct(
        private EfResolverService $efResolver,
        private EfViewService $efViewService,
        private TemplateRegistry $templateRegistry
    ) {
    }

    /**
     * @return array{ok: bool, errors: array<int, array>, warnings: array<int, array>}
     */
    public function validateCycle(Cycle $cycle): array
    {
        $errors = [];
        $warnings = [];

        if (!Schema::hasTable('ef_profiles') || !Schema::hasTable('ef_library_entries')) {
            $errors[] = [
                'code' => 'EF_LIBRARY_MISSING',
                'message' => 'EF library not migrated (ef_profiles, ef_library_entries).',
            ];
        }

        $this->validateScope11($cycle, $errors, $warnings);
        $this->validateLockedRecalcState($cycle, $errors);

        return [
            'ok' => count($errors) === 0,
            'errors' => $errors,
            'warnings' => $warnings,
        ];
    }

    private function validateScope11(Cycle $cycle, array &$errors, array &$warnings): void
    {
        if (!Schema::hasTable('scope11_stationary_items')) {
            return;
        }

        $rows = Scope11StationaryItem::query()
            ->where('cycle_id', $cycle->id)
            ->orderBy('id')
            ->get();

        $config = $this->loadFr041Config($cycle->id);
        $effectiveConfig = $config ?? new Fr041Config();
        $cycleYear = is_numeric($cycle->year ?? null) ? (int) $cycle->year : null;
        $helperResult = Fr041SelectionsV2Helper::resolve($effectiveConfig, $cycleYear, $rows->all());

        if ($helperResult->legacyFallbackUsed) {
            $warnings[] = [
                'scope' => '1.1',
                'code' => 'LEGACY_FR041_FALLBACK',
                'message' => 'FR-04.1 selections_v2 is missing; using legacy selections.',
            ];
        } else {
            $this->applySelectionLineErrors($helperResult, $errors, $cycleYear);
        }

        $useLegacyEfSelection = $helperResult->legacyFallbackUsed;
        $efViewMap = $useLegacyEfSelection ? [] : $this->buildEfViewMap($cycle);
        if (!$useLegacyEfSelection && $helperResult->includedLines) {
            foreach ($helperResult->includedLines as $line) {
                $efKeyRaw = trim((string) ($line['efKey'] ?? ''));
                if ($efKeyRaw === '') {
                    continue;
                }
                $efKey = strtoupper($efKeyRaw);
                if (!array_key_exists($efKey, $efViewMap)) {
                    $warnings[] = [
                        'scope' => '1.1',
                        'rowId' => $line['parentRowId'] ?? null,
                        'code' => 'EF_NOT_FOUND',
                        'message' => 'EF not found in EF_VIEW.',
                    ];
                }
            }
        }

        if ($rows->count() === 0) {
            $warnings[] = [
                'scope' => '1.1',
                'code' => 'NO_ROWS',
                'message' => 'No Scope 1.1 rows found.',
            ];
            return;
        }

        foreach ($rows as $row) {
            $rowId = trim((string) ($row->row_id ?? ''));
            if ($rowId === '') {
                $errors[] = [
                    'scope' => '1.1',
                    'code' => 'ROWID_MISSING',
                    'message' => 'Scope 1.1 rowId is missing.',
                ];
                continue;
            }

            $months = is_array($row->months_json ?? null) ? $row->months_json : [];
            $hasActivity = $this->hasAnyMonthValue($months);

            $evidence = trim((string) ($row->evidence ?? ''));
            if ($hasActivity && $evidence === '') {
                $warnings[] = [
                    'scope' => '1.1',
                    'rowId' => $rowId,
                    'code' => 'EVIDENCE_MISSING',
                    'message' => 'Evidence is missing for a row with activity.',
                ];
            }

            if (!$hasActivity) {
                continue;
            }

            if ($useLegacyEfSelection) {
                $item = [
                    'rowId' => $rowId,
                    'fuelKey' => (string) ($row->fuel_key ?? ''),
                    'unit' => (string) ($row->unit ?? ''),
                    'label' => (string) ($row->item_label ?? ''),
                ];

                $efIdOverride = $this->loadEfSelectionByRowId($cycle->id)[$rowId] ?? null;
                $resolved = $this->efResolver->resolveScope11($cycle, $item, $efIdOverride);
                if (!($resolved['ok'] ?? false)) {
                    $errors[] = [
                        'scope' => '1.1',
                        'rowId' => $rowId,
                        'code' => $resolved['code'] ?? 'EF_RESOLVE_ERROR',
                        'message' => $resolved['message'] ?? 'EF resolve failed.',
                    ];
                    continue;
                }

                $ef = (array) ($resolved['ef'] ?? []);
                $total = $ef['total'] ?? null;
                if ($total === null || $total === '') {
                    $errors[] = [
                        'scope' => '1.1',
                        'rowId' => $rowId,
                        'code' => 'EF_TOTAL_MISSING',
                        'message' => 'EF total is missing.',
                    ];
                }
            }
        }
    }

    private function validateLockedRecalcState(Cycle $cycle, array &$errors): void
    {
        if (!$cycle->locked_at) {
            return;
        }
        if (!Schema::hasTable('scope11_stationary_items') || !Schema::hasTable('emission_results')) {
            return;
        }

        $rows = Scope11StationaryItem::query()
            ->where('cycle_id', $cycle->id)
            ->get(['row_id', 'months_json', 'updated_at']);

        $hasActivity = false;
        $latestItemAt = null;
        foreach ($rows as $row) {
            $months = is_array($row->months_json ?? null) ? $row->months_json : [];
            if ($this->hasAnyMonthValue($months)) {
                $hasActivity = true;
            }
            if ($row->updated_at && (!$latestItemAt || $row->updated_at->gt($latestItemAt))) {
                $latestItemAt = $row->updated_at;
            }
        }

        if (!$hasActivity) {
            return;
        }

        $latestResultAt = EmissionResult::query()
            ->where('cycle_id', $cycle->id)
            ->where('scope', '1.1')
            ->max('updated_at');

        if (!$latestResultAt) {
            $errors[] = [
                'scope' => '1.1',
                'code' => 'RECALC_REQUIRED',
                'message' => 'Reporting period is locked but emission results are missing; recalculation is required.',
            ];
            return;
        }

        if ($latestItemAt && $latestItemAt->gt($latestResultAt)) {
            $errors[] = [
                'scope' => '1.1',
                'code' => 'RECALC_REQUIRED',
                'message' => 'Reporting period is locked but emission results are out of date; recalculation is required.',
            ];
        }

        $bad = EmissionResult::query()
            ->where('cycle_id', $cycle->id)
            ->where('scope', '1.1')
            ->where('status', '!=', 'ok')
            ->count();

        if ($bad > 0) {
            $errors[] = [
                'scope' => '1.1',
                'code' => 'EMISSION_RESULT_ERROR',
                'message' => 'Reporting period is locked but some emission results are in error state.',
            ];
        }
    }

    private function loadEfSelectionByRowId(int $cycleId): array
    {
        if (!Schema::hasTable('fr041_configs')) {
            return [];
        }

        $config = Fr041Config::query()
            ->where('cycle_id', $cycleId)
            ->where('sheet_id', 'fr041')
            ->where('section', 'scope1_stationary')
            ->first();

        $options = is_array($config?->options ?? null) ? $config->options : [];
        $map = is_array($options['efSelectionByRowId'] ?? null) ? $options['efSelectionByRowId'] : [];

        $out = [];
        foreach ($map as $rowId => $efId) {
            $k = trim((string) $rowId);
            $v = trim((string) $efId);
            if ($k === '' || $v === '') continue;
            $out[$k] = $v;
        }
        return $out;
    }

    private function applySelectionLineErrors(Fr041SelectionsV2HelperResult $helperResult, array &$errors, ?int $cycleYear): void
    {
        foreach ($helperResult->invalidCatalogLineIds as $lineId) {
            $line = $helperResult->includedLines[$lineId] ?? null;
            if (!$line) continue;
            $errors[] = [
                'scope' => '1.1',
                'rowId' => $line['parentRowId'],
                'code' => 'INVALID_EF_CATALOG_YEAR',
                'message' => "EF catalog {$line['efCatalog']} is not allowed for cycle year {$cycleYear}.",
            ];
        }

        foreach ($helperResult->missingEfLineIds as $lineId) {
            $line = $helperResult->includedLines[$lineId] ?? null;
            if (!$line) continue;
            $component = $this->componentLabel($line['component']);
            $errors[] = [
                'scope' => '1.1',
                'rowId' => $line['parentRowId'],
                'code' => 'MISSING_EF',
                'message' => "Missing EF for component {$component}.",
            ];
        }
    }

    private function componentLabel(string $component): string
    {
        if ($component === 'DIESEL_L') return 'Diesel (Stationary combustion)';
        if ($component === 'BIODIESEL_KG') return 'Biodiesel (Stationary combustion)';
        if ($component === 'GASOLINE_L') return 'Gasoline (Stationary combustion)';
        if ($component === 'ETHANOL_KG') return 'Biogasoline (Ethanol) (Stationary combustion)';
        return $component;
    }

    private function buildEfViewMap(Cycle $cycle): array
    {
        $rows = $this->efViewService->build($cycle, 'stationary', $this->templateRegistry);
        $out = [];
        foreach ($rows as $row) {
            if (!is_array($row)) continue;
            $key = strtoupper(trim((string) ($row['efKey'] ?? '')));
            if ($key === '') continue;
            $out[$key] = $row;
        }
        return $out;
    }

    private function loadFr041Config(int $cycleId): ?Fr041Config
    {
        if (!Schema::hasTable('fr041_configs')) {
            return null;
        }

        return Fr041Config::query()
            ->where('cycle_id', $cycleId)
            ->where('sheet_id', 'fr041')
            ->where('section', 'scope1_stationary')
            ->first();
    }

    private function hasAnyMonthValue(array $months): bool
    {
        for ($i = 1; $i <= 12; $i++) {
            $key = 'M' . $i;
            if (!array_key_exists($key, $months)) continue;
            $value = $months[$key];
            if ($value === null || $value === '') continue;
            if (is_numeric($value) && (float) $value !== 0.0) return true;
        }
        return false;
    }
}
