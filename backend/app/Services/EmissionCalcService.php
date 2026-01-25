<?php

namespace App\Services;

use App\Models\Cycle;
use App\Models\EmissionResult;
use App\Models\Fr041Config;
use App\Models\Scope11StationaryItem;
use Illuminate\Support\Facades\Schema;

class EmissionCalcService
{
    public function __construct(private EfResolverService $efResolver)
    {
    }

    /**
     * Recalculate Scope 1.1 stationary combustion for a cycle.
     *
     * @return array{ok: bool, errors: array<int, array>, results: array<int, array>, summary: array}
     */
    public function recalcScope11(Cycle $cycle): array
    {
        if (!Schema::hasTable('scope11_stationary_items')) {
            return [
                'ok' => false,
                'errors' => [['code' => 'MISSING_TABLE', 'message' => 'Missing table: scope11_stationary_items']],
                'results' => [],
                'summary' => [],
            ];
        }

        $cycleYear = is_numeric($cycle->year ?? null) ? (int) $cycle->year : null;
        $config = $this->fetchFr041Config($cycle->id);
        $helperResult = Fr041SelectionsV2Helper::resolve($config ?? new Fr041Config(), $cycleYear);
        $efSelectionByRowId = $this->loadEfSelectionByRowId($cycle->id);

        $rows = Scope11StationaryItem::query()
            ->where('cycle_id', $cycle->id)
            ->orderBy('id')
            ->get();
        $selectionLinesByRow = $this->selectionLinesByRow($helperResult);

        $results = [];
        $errors = [];

        $summaryMonths = $this->emptyMonthsZero();

        foreach ($rows as $row) {
            $rowId = trim((string) ($row->row_id ?? ''));
            if ($rowId === '') {
                continue;
            }

            $months = is_array($row->months_json ?? null) ? $row->months_json : [];
            $qtyMonths = $this->normalizeMonths($months);
            $hasActivity = $this->hasAnyMonthValue($qtyMonths);

            $item = [
                'rowId' => $rowId,
                'fuelKey' => (string) ($row->fuel_key ?? ''),
                'unit' => (string) ($row->unit ?? ''),
                'label' => (string) ($row->item_label ?? ''),
            ];

            if (!$hasActivity) {
                $this->upsertEmissionResult($cycle->id, $rowId, [
                    'status' => 'ok',
                    'error_message' => null,
                    'ef_profile' => null,
                    'ef_id' => null,
                    'ef_used_snapshot_json' => null,
                    'qty_months_json' => $qtyMonths,
                    'tco2e_months_json' => $this->emptyMonthsNull(),
                    'total_tco2e' => null,
                ]);

                $results[] = [
                    'rowId' => $rowId,
                    'ef' => null,
                    'qtyMonths' => $qtyMonths,
                    'tco2eMonths' => $this->emptyMonthsNull(),
                    'totalTco2e' => null,
                ];

                continue;
            }

            $componentLines = $selectionLinesByRow[$rowId] ?? [];
            if (!$helperResult->legacyFallbackUsed && $componentLines) {
                if ($this->processRowWithSelectionLines(
                    $cycle,
                    $row,
                    $qtyMonths,
                    $componentLines,
                    $summaryMonths,
                    $results,
                    $errors
                )) {
                    continue;
                }
            }

            $efIdOverride = $efSelectionByRowId[$rowId] ?? null;
            $resolved = $this->efResolver->resolveScope11($cycle, $item, $efIdOverride);
            if (!($resolved['ok'] ?? false)) {
                $errors[] = [
                    'rowId' => $rowId,
                    'code' => $resolved['code'] ?? 'EF_RESOLVE_ERROR',
                    'message' => $resolved['message'] ?? 'EF resolve failed.',
                ];

                $this->upsertEmissionResult($cycle->id, $rowId, [
                    'status' => 'error',
                    'error_message' => $resolved['message'] ?? 'EF resolve failed.',
                    'ef_profile' => null,
                    'ef_id' => $efIdOverride ?: null,
                    'ef_used_snapshot_json' => null,
                    'qty_months_json' => $qtyMonths,
                    'tco2e_months_json' => $this->emptyMonthsNull(),
                    'total_tco2e' => null,
                ]);

                continue;
            }

            $ef = (array) ($resolved['ef'] ?? []);
            $efTotal = $this->numOrNull($ef['total'] ?? null);
            if ($efTotal === null) {
                $errors[] = [
                    'rowId' => $rowId,
                    'code' => 'EF_TOTAL_MISSING',
                    'message' => 'EF total is missing.',
                ];
            }

            $tco2eMonths = [];
            $totalTco2e = 0.0;
            $hasValue = false;

            for ($m = 1; $m <= 12; $m++) {
                $key = 'M' . $m;
                $qty = $this->numOrNull($qtyMonths[$key] ?? null);
                if ($qty === null) {
                    $tco2eMonths[$key] = null;
                    continue;
                }
                if ($efTotal === null) {
                    $tco2eMonths[$key] = null;
                    continue;
                }

                $tco2e = ($qty * $efTotal) / 1000.0;
                $tco2eMonths[$key] = $this->round6($tco2e);
                $totalTco2e += (float) $tco2eMonths[$key];
                $hasValue = true;

                $summaryMonths[$key] = $this->round6((float) ($summaryMonths[$key] ?? 0.0) + (float) $tco2eMonths[$key]);
            }

            $totalTco2eValue = $hasValue ? $this->round6($totalTco2e) : null;

            $snapshot = [
                'resolvedFrom' => $resolved['resolvedFrom'] ?? null,
                'efProfile' => $ef['efProfile'] ?? null,
                'efId' => $ef['efId'] ?? null,
                'name' => $ef['name'] ?? null,
                'unit' => $ef['unit'] ?? null,
                'co2' => $ef['co2'] ?? null,
                'fossil_ch4' => $ef['fossil_ch4'] ?? null,
                'ch4' => $ef['ch4'] ?? null,
                'n2o' => $ef['n2o'] ?? null,
                'total' => $ef['total'] ?? null,
                'source' => $ef['source'] ?? null,
            ];

            $this->upsertEmissionResult($cycle->id, $rowId, [
                'status' => $efTotal === null ? 'error' : 'ok',
                'error_message' => $efTotal === null ? 'EF total is missing.' : null,
                'ef_profile' => (string) ($ef['efProfile'] ?? ''),
                'ef_id' => (string) ($ef['efId'] ?? ''),
                'ef_used_snapshot_json' => $snapshot,
                'qty_months_json' => $qtyMonths,
                'tco2e_months_json' => $tco2eMonths,
                'total_tco2e' => $totalTco2eValue,
            ]);

            $results[] = [
                'rowId' => $rowId,
                'ef' => $snapshot,
                'qtyMonths' => $qtyMonths,
                'tco2eMonths' => $tco2eMonths,
                'totalTco2e' => $totalTco2eValue,
            ];
        }

        return [
            'ok' => count($errors) === 0,
            'errors' => $errors,
            'results' => $results,
            'summary' => [
                'scope' => '1.1',
                'tco2eMonths' => $summaryMonths,
                'totalTco2e' => $this->sumMonths($summaryMonths),
            ],
        ];
    }

    private function upsertEmissionResult(int $cycleId, string $rowId, array $data): void
    {
        if (!Schema::hasTable('emission_results')) {
            return;
        }

        EmissionResult::query()->updateOrCreate(
            [
                'cycle_id' => $cycleId,
                'scope' => '1.1',
                'row_id' => $rowId,
            ],
            $data
        );
    }

    private function selectionLinesByRow(Fr041SelectionsV2HelperResult $helperResult): array
    {
        if ($helperResult->legacyFallbackUsed) {
            return [];
        }

        $out = [];
        foreach ($helperResult->includedLines as $lineId => $line) {
            $parentRowId = trim((string) ($line['parentRowId'] ?? ''));
            if ($parentRowId === '' || $lineId === '') {
                continue;
            }
            $out[$parentRowId][$lineId] = $line;
        }

        return $out;
    }

    private function processRowWithSelectionLines(
        Cycle $cycle,
        Scope11StationaryItem $row,
        array $qtyMonths,
        array $componentLines,
        array &$summaryMonths,
        array &$results,
        array &$errors
    ): bool {
        $rowId = trim((string) ($row->row_id ?? ''));
        if ($rowId === '') {
            return false;
        }

        $rowTco2eMonths = $this->emptyMonthsNull();
        $totalTco2e = 0.0;
        $hasValue = false;
        $status = 'ok';
        $errorMessage = null;
        $lineSnapshots = [];

        foreach ($componentLines as $lineId => $line) {
            $component = trim((string) ($line['component'] ?? ''));
            if ($component === '') {
                continue;
            }

            $componentData = $this->componentDataForLine($row, $component, $qtyMonths);
            if (!$componentData) {
                continue;
            }

            if (!$this->hasAnyMonthValue($componentData['months'])) {
                continue;
            }

            $componentLabel = $this->componentLabel($component);
            $efId = trim((string) ($line['efId'] ?? ''));
            if ($efId === '') {
                $status = 'error';
                $message = "Missing EF for component {$componentLabel}.";
                $errors[] = [
                    'rowId' => $rowId,
                    'code' => 'MISSING_EF',
                    'message' => $message,
                ];
                $errorMessage = $errorMessage ?? $message;
                continue;
            }

            $payloadItem = [
                'rowId' => $lineId,
                'fuelKey' => (string) ($row->fuel_key ?? ''),
                'unit' => $componentData['unit'],
                'label' => trim((string) ($row->item_label ?? '')),
            ];
            $resolved = $this->efResolver->resolveScope11($cycle, $payloadItem, $efId);
            if (!($resolved['ok'] ?? false)) {
                $status = 'error';
                $message = $resolved['message'] ?? 'EF resolve failed.';
                $errors[] = [
                    'rowId' => $rowId,
                    'code' => $resolved['code'] ?? 'EF_RESOLVE_ERROR',
                    'message' => $message,
                ];
                $errorMessage = $errorMessage ?? $message;
                continue;
            }

            $ef = (array) ($resolved['ef'] ?? []);
            $efTotal = $this->numOrNull($ef['total'] ?? null);
            if ($efTotal === null) {
                $status = 'error';
                $message = 'EF total is missing.';
                $errors[] = [
                    'rowId' => $rowId,
                    'code' => 'EF_TOTAL_MISSING',
                    'message' => $message,
                ];
                $errorMessage = $errorMessage ?? $message;
                continue;
            }

            foreach ($componentData['months'] as $key => $qty) {
                if ($qty === null) {
                    continue;
                }
                $componentTco2e = ($qty * $efTotal) / 1000.0;
                $rounded = $this->round6($componentTco2e);
                $rowTco2eMonths[$key] = $this->round6((float) ($rowTco2eMonths[$key] ?? 0.0) + $rounded);
                $summaryMonths[$key] = $this->round6((float) ($summaryMonths[$key] ?? 0.0) + $rounded);
                $totalTco2e += $rounded;
                $hasValue = true;
            }

            $lineSnapshots[] = [
                'lineId' => $lineId,
                'component' => $component,
                'efProfile' => $ef['efProfile'] ?? null,
                'efId' => $ef['efId'] ?? null,
                'name' => $ef['name'] ?? null,
                'unit' => $ef['unit'] ?? null,
                'total' => $ef['total'] ?? null,
                'resolvedFrom' => $resolved['resolvedFrom'] ?? null,
            ];
        }

        $totalTco2eValue = $hasValue ? $this->round6($totalTco2e) : null;
        $status = $status === 'error' ? 'error' : 'ok';

        $snapshot = [
            'lines' => $lineSnapshots,
        ];

        $this->upsertEmissionResult($cycle->id, $rowId, [
            'status' => $status,
            'error_message' => $errorMessage,
            'ef_profile' => null,
            'ef_id' => null,
            'ef_used_snapshot_json' => $snapshot,
            'qty_months_json' => $qtyMonths,
            'tco2e_months_json' => $rowTco2eMonths,
            'total_tco2e' => $totalTco2eValue,
        ]);

        $results[] = [
            'rowId' => $rowId,
            'ef' => $snapshot,
            'qtyMonths' => $qtyMonths,
            'tco2eMonths' => $rowTco2eMonths,
            'totalTco2e' => $totalTco2eValue,
        ];

        return true;
    }

    private function componentDataForLine(
        Scope11StationaryItem $row,
        string $component,
        array $months
    ): ?array {
        $unit = strtoupper(trim((string) ($row->unit ?? 'L')));
        $normalized = [];
        for ($m = 1; $m <= 12; $m++) {
            $key = 'M' . $m;
            $normalized[$key] = $this->numOrNull($months[$key] ?? null);
        }

        if ($unit !== 'L') {
            if ($component !== 'DIESEL_L') {
                return null;
            }
            return [
                'unit' => $unit,
                'months' => $normalized,
            ];
        }

        $fuelKey = $this->normalizeFuelKeyForComponents((string) ($row->fuel_key ?? ''));
        $spec = $this->componentSpec($fuelKey, $component);
        if (!$spec) {
            return null;
        }

        $componentMonths = [];
        for ($m = 1; $m <= 12; $m++) {
            $key = 'M' . $m;
            $qty = $normalized[$key];
            if ($qty === null) {
                $componentMonths[$key] = null;
                continue;
            }
            $value = $qty * ($spec['ratio'] ?? 0.0);
            if ($spec['unit'] === 'kg' && isset($spec['density'])) {
                $value *= (float) $spec['density'];
            }
            $componentMonths[$key] = $this->round6($value);
        }

        return [
            'unit' => $spec['unit'],
            'months' => $componentMonths,
        ];
    }

    private function componentSpec(string $fuelKey, string $component): ?array
    {
        $mapping = [
            'B7' => [
                'DIESEL_L' => ['ratio' => 0.93, 'unit' => 'L'],
                'BIODIESEL_KG' => ['ratio' => 0.07, 'unit' => 'kg', 'density' => 0.87],
            ],
            'B10' => [
                'DIESEL_L' => ['ratio' => 0.9, 'unit' => 'L'],
                'BIODIESEL_KG' => ['ratio' => 0.1, 'unit' => 'kg', 'density' => 0.87],
            ],
            '9195' => [
                'GASOLINE_L' => ['ratio' => 0.9, 'unit' => 'L'],
                'ETHANOL_KG' => ['ratio' => 0.1, 'unit' => 'kg', 'density' => 0.79],
            ],
            'E20' => [
                'GASOLINE_L' => ['ratio' => 0.8, 'unit' => 'L'],
                'ETHANOL_KG' => ['ratio' => 0.2, 'unit' => 'kg', 'density' => 0.79],
            ],
            'OTHER' => [
                'DIESEL_L' => ['ratio' => 1.0, 'unit' => 'L'],
            ],
        ];

        $componentMap = $mapping[$fuelKey] ?? null;
        if ($componentMap) {
            return $componentMap[$component] ?? null;
        }

        return $component === 'DIESEL_L' ? ['ratio' => 1.0, 'unit' => 'L'] : null;
    }

    private function normalizeFuelKeyForComponents(string $value): string
    {
        $raw = strtoupper(trim($value));
        if ($raw === '') {
            return 'OTHER';
        }
        if (str_contains($raw, 'B7')) {
            return 'B7';
        }
        if (str_contains($raw, 'B10')) {
            return 'B10';
        }
        if (str_contains($raw, '91/95') || str_contains($raw, '9195')) {
            return '9195';
        }
        if (str_contains($raw, 'E20')) {
            return 'E20';
        }
        return 'OTHER';
    }

    private function componentLabel(string $component): string
    {
        if ($component === 'DIESEL_L') return 'Diesel';
        if ($component === 'BIODIESEL_KG') return 'Biodiesel';
        if ($component === 'GASOLINE_L') return 'Gasoline';
        if ($component === 'ETHANOL_KG') return 'Ethanol';
        return $component;
    }

    private function fetchFr041Config(int $cycleId): ?Fr041Config
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

    private function loadEfSelectionByRowId(int $cycleId): array
    {
        $config = $this->fetchFr041Config($cycleId);

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

    private function normalizeMonths(array $months): array
    {
        $out = [];
        for ($i = 1; $i <= 12; $i++) {
            $key = 'M' . $i;
            $out[$key] = array_key_exists($key, $months) ? $this->numOrNull($months[$key]) : null;
        }
        return $out;
    }

    private function emptyMonths(): array
    {
        $out = [];
        for ($i = 1; $i <= 12; $i++) {
            $out['M' . $i] = null;
        }
        return $out;
    }

    private function emptyMonthsNull(): array
    {
        return $this->emptyMonths();
    }

    private function emptyMonthsZero(): array
    {
        $out = [];
        for ($i = 1; $i <= 12; $i++) {
            $out['M' . $i] = 0.0;
        }
        return $out;
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

    private function sumMonths(array $months): ?float
    {
        $total = 0.0;
        $has = false;
        foreach ($months as $v) {
            if ($v === null) continue;
            if (!is_numeric($v)) continue;
            $has = true;
            $total += (float) $v;
        }
        return $has ? $this->round6($total) : null;
    }

    private function numOrNull($value): ?float
    {
        if ($value === null) return null;
        if (is_string($value) && trim($value) === '') return null;
        if (!is_numeric($value)) return null;
        $n = (float) $value;
        return is_finite($n) ? $n : null;
    }

    private function round6(float $value): float
    {
        return round($value + 0.0, 6);
    }
}
