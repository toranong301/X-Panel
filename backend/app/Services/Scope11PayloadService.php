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

        if (Schema::hasTable('scope11_stationary_items')) {
            $rows = Scope11StationaryItem::query()
                ->where('cycle_id', $cycle->id)
                ->orderBy('id')
                ->get()
                ->all();

            foreach ($rows as $row) {
                $rowId = trim((string) ($row->row_id ?? ''));
                if ($rowId === '') continue;

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
                    'months' => $months,
                    'includeFr041' => isset($selectedMap[$rowId]) ? true : null,
                ];
            }
        }

        return [
            'splitEnabled' => $splitEnabled,
            'periodYear' => $cycle->year ?? null,
            'headerMonths' => $this->emptyMonths(),
            'items' => $items,
        ];
    }

    /**
     * Build FR-04.1 selection rows for writing into `_FR041_SEL` table.
     */
    public function buildFr041SelectionRows(Cycle $cycle): array
    {
        $selectedRowIds = $this->loadSelectedRowIds($cycle->id);
        if (!$selectedRowIds) {
            return [];
        }

        $efSelectionByRowId = $this->loadEfSelectionByRowId($cycle->id);

        $itemsByRowId = [];
        if (Schema::hasTable('scope11_stationary_items')) {
            $rows = Scope11StationaryItem::query()
                ->where('cycle_id', $cycle->id)
                ->orderBy('id')
                ->get()
                ->all();
            foreach ($rows as $row) {
                $rowId = trim((string) ($row->row_id ?? ''));
                if ($rowId === '') continue;
                $itemsByRowId[$rowId] = $row;
            }
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

    private function loadSelectedRowIds(int $cycleId): array
    {
        if (!Schema::hasTable('fr041_configs')) {
            return [];
        }

        $config = Fr041Config::query()
            ->where('cycle_id', $cycleId)
            ->where('sheet_id', 'fr041')
            ->where('section', 'scope1_stationary')
            ->first();

        $rows = $config?->selected_row_ids ?? [];
        return is_array($rows) ? array_values(array_filter(array_map('strval', $rows))) : [];
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
}

