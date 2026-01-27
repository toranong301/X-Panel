<?php

namespace App\Services;

use App\Models\Cycle;
use App\Models\Fr041Config;
use App\Models\Scope11StationaryItem;
use Illuminate\Support\Facades\Schema;

class Scope11PayloadService
{

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

        $helperResult = $this->resolveFr041Selections($cycle, $rows);
        $fr041SelectionLines = $this->buildFr041SelectionLines($helperResult);
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
        $selectionLines = $this->buildFr041SelectionLines($helper);
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

    private function resolveFr041Selections(Cycle $cycle, array $rows = []): Fr041SelectionsV2HelperResult
    {
        $config = $this->fetchFr041Config($cycle->id);
        $cycleYear = is_numeric($cycle->year ?? null) ? (int) $cycle->year : null;
        return Fr041SelectionsV2Helper::resolve($config ?? new Fr041Config(), $cycleYear, $rows);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function buildFr041SelectionLines(Fr041SelectionsV2HelperResult $helper): array
    {
        if (empty($helper->includedLines)) {
            return [];
        }

        return array_values($helper->includedLines);
    }

    private function componentLabel(string $component): string
    {
        if ($component === 'DIESEL_L') return 'Diesel (Stationary combustion)';
        if ($component === 'BIODIESEL_KG') return 'Biodiesel (Stationary combustion)';
        if ($component === 'GASOLINE_L') return 'Gasoline (Stationary combustion)';
        if ($component === 'ETHANOL_KG') return 'Biogasoline (Ethanol) (Stationary combustion)';
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

            $componentLabel = $this->componentLabel((string) ($line['component'] ?? ''));
            $itemName = $componentLabel !== '' ? $componentLabel : (string) ($line['itemLabel'] ?? '');

            $out[] = [
                'rowNo' => $rowNo,
                'rowId' => $lineId,
                'itemId' => $lineId,
                'itemName' => $itemName,
                'sectionId' => (string) ($line['sectionId'] ?? '1.1'),
                'fuelKey' => (string) ($line['fuelKey'] ?? ''),
                'evidence' => (string) ($line['evidence'] ?? ''),
                'unit' => (string) ($line['unit'] ?? ''),
                'qty' => array_key_exists('qty', $line) ? $line['qty'] : null,
                'efCatalog' => (string) ($line['efCatalog'] ?? ''),
                'efId' => (string) ($line['efId'] ?? ''),
                'efKey' => (string) ($line['efKey'] ?? ''),
                'sourceItemLabel' => (string) ($line['sourceItemLabel'] ?? ''),
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
