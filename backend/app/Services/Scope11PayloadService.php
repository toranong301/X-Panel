<?php

namespace App\Services;

use App\Models\Cycle;
use App\Models\Fr041Config;
use App\Models\Scope11StationaryItem;
use Illuminate\Support\Facades\Schema;

class Scope11PayloadService
{
    public function __construct(private EfResolverService $efResolver)
    {
    }

    /**
     * Build the hidden-table payload for Scope 1.1 export/preview.
     */
    public function buildPayload(Cycle $cycle): array
    {
        $items = [];
        $splitEnabled = false;

        $selectedRowIds = $this->loadSelectedRowIds($cycle->id);
        $selectedMap = array_fill_keys($selectedRowIds, true);

        $rows = $this->loadStationaryItems($cycle);
        foreach ($rows as $row) {
            $rowId = trim((string) ($row->row_id ?? ''));
            if ($rowId === '') {
                continue;
            }

            $months = $this->normalizeMonths(is_array($row->months_json ?? null) ? $row->months_json : []);

            $unit = strtoupper(trim((string) ($row->unit ?? 'L')));
            if ($unit === 'L' && $this->hasAnyMonthValue($months)) {
                $splitEnabled = true;
            }

            $items[] = [
                'rowId' => $rowId,
                'fuelKey' => trim((string) ($row->fuel_key ?? '')),
                'label' => trim((string) ($row->item_label ?? '')),
                'evidence' => trim((string) ($row->evidence ?? '')),
                'unit' => $unit === 'KG' ? 'kg' : 'L',
                'otherType' => $row->other_type ?? null,
                'otherDieselPct' => $row->other_diesel_pct ?? null,
                'otherBiodieselPct' => $row->other_biodiesel_pct ?? null,
                'otherGasolinePct' => $row->other_gasoline_pct ?? null,
                'otherEthanolPct' => $row->other_ethanol_pct ?? null,
                'otherBiodieselDensityKgPerL' => $row->other_biodiesel_density_kg_per_l ?? null,
                'otherEthanolDensityKgPerL' => $row->other_ethanol_density_kg_per_l ?? null,
                'months' => $months,
                'includeFr041' => isset($selectedMap[$rowId]) ? true : null,
            ];
        }

        $helperResult = $this->resolveFr041Selections($cycle);
        $fr041SelectionLines = $this->buildFr041SelectionLines($rows, $helperResult);
        $fr041SelectionRows = $this->buildFr041SelectionRows($cycle, $helperResult);

        return [
            'splitEnabled' => $splitEnabled,
            'periodYear' => $cycle->year ?? null,
            'headerMonths' => $this->emptyMonths(),
            'items' => $items,
            'fr041SelectionLines' => $fr041SelectionLines,
            'fr041SelectionRows' => $fr041SelectionRows,
            'fr041SelectionLegacyFallback' => $helperResult->legacyFallbackUsed,
            'fr041SelectionMissingEfLineIds' => $helperResult->missingEfLineIds,
            'fr041SelectionInvalidCatalogLineIds' => $helperResult->invalidCatalogLineIds,
        ];
    }

    /**
     * Build FR-04.1 selection rows for writing into `_FR041_SEL` table.
     */
    public function buildFr041SelectionRows(Cycle $cycle, ?Fr041SelectionsV2HelperResult $helperResult = null): array
    {
        $helper = $helperResult ?? $this->resolveFr041Selections($cycle);
        if ($helper->legacyFallbackUsed) {
            return $this->buildLegacyFr041SelectionRows($cycle);
        }

        $rows = $this->loadStationaryItems($cycle);
        $selectionLines = $this->buildFr041SelectionLines($rows, $helper);
        if (!$selectionLines) {
            return [];
        }

        return $this->mapSelectionLinesToRows($selectionLines);
    }

    private function loadSelectedRowIds(int $cycleId): array
    {
        $config = $this->fetchFr041Config($cycleId);
        $rows = $config?->selected_row_ids ?? [];
        return is_array($rows) ? array_values(array_filter(array_map('strval', $rows))) : [];
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
            $out[$key] = array_key_exists($key, $months) ? $this->normalizeNumber($months[$key]) : null;
        }
        return $out;
    }

    private function normalizeNumber($value): ?float
    {
        if ($value === null) return null;
        if (is_string($value) && trim($value) === '') return null;
        if (is_numeric($value)) return (float) $value;
        return null;
    }

    private function hasAnyMonthValue(array $months): bool
    {
        foreach ($months as $v) {
            if ($v !== null && is_numeric($v) && (float) $v !== 0.0) return true;
        }
        return false;
    }

    private function emptyMonths(): array
    {
        $out = [];
        for ($i = 1; $i <= 12; $i++) {
            $out['M' . $i] = null;
        }
        return $out;
    }

    private function loadStationaryItems(Cycle $cycle): array
    {
        if (!Schema::hasTable('scope11_stationary_items')) {
            return [];
        }
        return Scope11StationaryItem::query()
            ->where('cycle_id', $cycle->id)
            ->orderBy('id')
            ->get()
            ->all();
    }

    private function resolveFr041Selections(Cycle $cycle): Fr041SelectionsV2HelperResult
    {
        $config = $this->fetchFr041Config($cycle->id);
        $cycleYear = is_numeric($cycle->year ?? null) ? (int) $cycle->year : null;
        return Fr041SelectionsV2Helper::resolve($config ?? new Fr041Config(), $cycleYear);
    }

    /**
     * @param Scope11StationaryItem[] $rows
     */
    private function buildFr041SelectionLines(array $rows, Fr041SelectionsV2HelperResult $helper): array
    {
        if ($helper->legacyFallbackUsed || empty($helper->includedLines)) {
            return [];
        }

        $rowsById = [];
        foreach ($rows as $row) {
            $rowId = trim((string) ($row->row_id ?? ''));
            if ($rowId === '') {
                continue;
            }
            $rowsById[$rowId] = $row;
        }

        $lines = [];
        foreach ($helper->includedLines as $lineId => $line) {
            $parentRowId = $line['parentRowId'] ?? '';
            $row = $rowsById[$parentRowId] ?? null;
            if (!$row) {
                continue;
            }

            $months = is_array($row->months_json ?? null) ? $row->months_json : [];
            $total = $this->rowTotalFromMonths($months);
            $componentQty = $this->componentQuantity($row, (string) ($line['component'] ?? ''), $total);
            if (!$componentQty) {
                continue;
            }

            $lines[] = [
                'lineId' => $lineId,
                'parentRowId' => $parentRowId,
                'component' => (string) ($line['component'] ?? ''),
                'componentLabel' => $this->componentLabel((string) ($line['component'] ?? '')),
                'fuelKey' => (string) ($row->fuel_key ?? ''),
                'label' => trim((string) ($row->item_label ?? '')),
                'evidence' => trim((string) ($row->evidence ?? '')),
                'unit' => $componentQty['unit'],
                'qty' => $componentQty['value'],
                'efCatalog' => (string) ($line['efCatalog'] ?? ''),
                'efId' => (string) ($line['efId'] ?? ''),
            ];
        }

        return $lines;
    }

    private function componentQuantity(Scope11StationaryItem $row, string $component, float $totalLiters): ?array
    {
        $unit = strtoupper(trim((string) ($row->unit ?? 'L')));
        if ($unit !== 'L') {
            if ($component === 'DIESEL_L') {
                return [
                    'unit' => $unit,
                    'value' => $this->round2($totalLiters),
                ];
            }
            return null;
        }

        $fuelKey = $this->normalizeFuelKeyForComponents((string) ($row->fuel_key ?? ''));
        $spec = $this->componentSpec($fuelKey, $component);
        if (!$spec) {
            return null;
        }

        $value = $totalLiters * ($spec['ratio'] ?? 0.0);
        if ($spec['unit'] === 'kg' && isset($spec['density'])) {
            $value = $value * $spec['density'];
        }

        return [
            'unit' => $spec['unit'],
            'value' => $this->round2($value),
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
        if (!$componentMap) {
            return $component === 'DIESEL_L' ? ['ratio' => 1.0, 'unit' => 'L'] : null;
        }

        return $componentMap[$component] ?? null;
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

    private function rowTotalFromMonths(array $months): float
    {
        $total = 0.0;
        foreach ($months as $value) {
            if (is_numeric($value)) {
                $total += (float) $value;
            }
        }
        return $total;
    }

    private function componentLabel(string $component): string
    {
        if ($component === 'DIESEL_L') return 'Diesel';
        if ($component === 'BIODIESEL_KG') return 'Biodiesel';
        if ($component === 'GASOLINE_L') return 'Gasoline';
        if ($component === 'ETHANOL_KG') return 'Ethanol';
        return $component;
    }

    private function mapSelectionLinesToRows(array $selectionLines): array
    {
        $out = [];
        $rowNo = 11;
        foreach ($selectionLines as $line) {
            $lineId = (string) ($line['lineId'] ?? '');
            if ($lineId === '') {
                continue;
            }

            $label = (string) ($line['label'] ?? '');
            $componentLabel = (string) ($line['componentLabel'] ?? $this->componentLabel((string) ($line['component'] ?? '')));
            $itemName = $label !== '' ? "{$label} ({$componentLabel})" : $componentLabel;

            $out[] = [
                'rowNo' => $rowNo,
                'rowId' => $lineId,
                'itemId' => $lineId,
                'itemName' => $itemName,
                'sectionId' => '1.1',
                'fuelKey' => (string) ($line['fuelKey'] ?? ''),
                'evidence' => (string) ($line['evidence'] ?? ''),
                'unit' => (string) ($line['unit'] ?? ''),
                'qty' => array_key_exists('qty', $line) ? $line['qty'] : null,
                'efCatalog' => (string) ($line['efCatalog'] ?? ''),
                'efId' => (string) ($line['efId'] ?? ''),
            ];

            $rowNo += 1;
        }

        return $out;
    }

    private function round2(float $value): float
    {
        return round($value, 2);
    }

    private function buildLegacyFr041SelectionRows(Cycle $cycle): array
    {
        $selectedRowIds = $this->loadSelectedRowIds($cycle->id);
        if (!$selectedRowIds) {
            return [];
        }

        $efSelectionByRowId = $this->loadEfSelectionByRowId($cycle->id);

        $itemsByRowId = [];
        $rows = $this->loadStationaryItems($cycle);
        foreach ($rows as $row) {
            $rowId = trim((string) ($row->row_id ?? ''));
            if ($rowId === '') {
                continue;
            }
            $itemsByRowId[$rowId] = $row;
        }

        $out = [];
        $rowNo = 11;
        foreach ($selectedRowIds as $rowId) {
            $it = $itemsByRowId[$rowId] ?? null;
            $efIdOverride = $efSelectionByRowId[$rowId] ?? null;

            $payloadItem = [
                'rowId' => $rowId,
                'fuelKey' => (string) ($it?->fuel_key ?? ''),
                'unit' => (string) ($it?->unit ?? ''),
                'label' => (string) ($it?->item_label ?? ''),
            ];
            $resolved = $this->efResolver->resolveScope11($cycle, $payloadItem, $efIdOverride);
            $ef = is_array($resolved['ef'] ?? null) ? $resolved['ef'] : [];

            $out[] = [
                'rowNo' => $rowNo,
                'rowId' => $rowId,
                'itemId' => $rowId,
                'itemName' => (string) ($it?->item_label ?? ''),
                'sectionId' => '1.1',
                'fuelKey' => (string) ($it?->fuel_key ?? ''),
                'evidence' => (string) ($it?->evidence ?? ''),
                'unit' => (string) ($it?->unit ?? ''),
                'qty' => $it?->total ?? null,
                'efCatalog' => (string) ($ef['efProfile'] ?? ''),
                'efId' => (string) ($ef['efId'] ?? ($efIdOverride ?? '')),
            ];

            $rowNo += 1;
        }

        return $out;
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
}
