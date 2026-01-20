<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Cycle;
use App\Models\Scope11StationaryItem;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class Scope11StationaryController extends Controller
{
    public function items(Cycle $cycle)
    {
        try {
            $year = $cycle->year ?? null;

            if (Schema::hasTable('scope11_stationary_items')) {
                $rows = Scope11StationaryItem::query()
                    ->where('cycle_id', $cycle->id)
                    ->orderBy('id')
                    ->get()
                    ->all();

                $rowsById = [];
                foreach ($rows as $row) {
                    $rid = trim((string) ($row->row_id ?? ''));
                    if ($rid !== '') {
                        $rowsById[$rid] = $row;
                    }
                }

                $items = [];
                $splitEnabled = false;
                $defaultRowIds = $this->defaultScope11RowIds();

                foreach ($defaultRowIds as $rowId) {
                    $row = $rowsById[$rowId] ?? null;
                    $months = $this->normalizeMonths(is_array($row?->months_json ?? null) ? $row->months_json : []);
                    $total = $this->sumMonths($months);
                    $unitRaw = strtoupper(trim((string) ($row?->unit ?? $this->defaultUnitForScope11RowId($rowId))));
                    $unit = $unitRaw !== '' ? $unitRaw : 'L';
                    if ($unit === 'L' && $this->hasAnyMonthValue($months)) {
                        $splitEnabled = true;
                    }

                    $items[] = [
                        'rowId' => $rowId,
                        'itemLabel' => (string) ($row?->item_label ?? ''),
                        'evidenceType' => $row?->evidence_type ?? null,
                        'evidenceOther' => $row?->evidence_other ?? null,
                        'evidence' => (string) ($row?->evidence ?? ''),
                        'unit' => $unit,
                        'fuelKey' => (string) ($row?->fuel_key ?? $this->defaultFuelKeyForScope11RowId($rowId)),
                        'otherType' => $row?->other_type ?? null,
                        'months' => $months,
                        'total' => $total,
                    ];
                }

                foreach ($rows as $row) {
                    $rowId = trim((string) ($row->row_id ?? ''));
                    if ($rowId === '' || in_array($rowId, $defaultRowIds, true)) {
                        continue;
                    }

                    $months = $this->normalizeMonths(is_array($row->months_json ?? null) ? $row->months_json : []);
                    $total = $this->sumMonths($months);
                    $unit = strtoupper(trim((string) ($row->unit ?? 'L')));
                    if ($unit === 'L' && $this->hasAnyMonthValue($months)) {
                        $splitEnabled = true;
                    }

                    $items[] = [
                        'rowId' => (string) ($row->row_id ?? ''),
                        'itemLabel' => (string) ($row->item_label ?? ''),
                        'evidenceType' => $row->evidence_type ?? null,
                        'evidenceOther' => $row->evidence_other ?? null,
                        'evidence' => (string) ($row->evidence ?? ''),
                        'unit' => (string) ($row->unit ?? 'L'),
                        'fuelKey' => (string) ($row->fuel_key ?? ''),
                        'otherType' => $row->other_type ?? null,
                        'months' => $months,
                        'total' => $total,
                    ];
                }

                return response()->json([
                    'ok' => true,
                    'splitEnabled' => $splitEnabled,
                    'periodYear' => $year,
                    'headerMonths' => $this->emptyMonths(),
                    'items' => $items,
                ]);
            }
        } catch (\Throwable $e) {
            return response()->json([
                'ok' => false,
                'message' => $e->getMessage(),
                'items' => [],
            ]);
        }

        // fallback: legacy inventory-based payload (older flow)
        $data = $cycle->data_json ?? [];
        $data = is_array($data) ? $data : [];
        $payload = $this->buildScope11PayloadFromCycleData($data);
        $items = array_map(function (array $item) {
            $months = $this->normalizeMonths($item['months'] ?? []);
            $total = $this->sumMonths($months);
            return [
                'rowId' => (string) ($item['rowId'] ?? ''),
                'itemLabel' => (string) ($item['label'] ?? ''),
                'evidence' => (string) ($item['evidence'] ?? ''),
                'unit' => (string) ($item['unit'] ?? ''),
                'fuelKey' => (string) ($item['fuelKey'] ?? ''),
                'otherType' => $item['otherType'] ?? null,
                'months' => $months,
                'total' => $total,
            ];
        }, $payload['items'] ?? []);

        return response()->json([
            'ok' => true,
            'splitEnabled' => (bool) ($payload['splitEnabled'] ?? false),
            'periodYear' => $payload['periodYear'] ?? null,
            'headerMonths' => $this->normalizeMonths($payload['headerMonths'] ?? []),
            'items' => $items,
        ]);
    }

    public function save(Request $request, Cycle $cycle)
    {
        if ($cycle->locked_at) {
            return response()->json([
                'ok' => false,
                'code' => 'CYCLE_LOCKED',
                'message' => 'This reporting period is locked.',
            ], 423);
        }

        if (!Schema::hasTable('scope11_stationary_items')) {
            return response()->json(['ok' => false, 'message' => 'Missing table: scope11_stationary_items']);
        }

        $payload = $request->validate([
            'items' => ['required', 'array'],
            'items.*.rowId' => ['required', 'string', 'max:200'],
            'items.*.itemLabel' => ['nullable', 'string', 'max:500'],
            'items.*.evidenceType' => ['nullable', 'string', 'max:50'],
            'items.*.evidenceOther' => ['nullable'],
            'items.*.evidence' => ['nullable'],
            'items.*.unit' => ['nullable', 'string', 'max:50'],
            'items.*.fuelKey' => ['nullable', 'string', 'max:50'],
            'items.*.otherType' => ['nullable'],
            'items.*.months' => ['required', 'array'],
        ]);

        $items = array_values(array_filter($payload['items'] ?? [], fn ($it) => is_array($it)));
        $rowIds = [];

        DB::beginTransaction();
        try {
            foreach ($items as $item) {
                $rowId = trim((string) ($item['rowId'] ?? ''));
                if ($rowId === '') {
                    continue;
                }
                $rowIds[] = $rowId;

                $months = $this->normalizeMonths(is_array($item['months'] ?? null) ? $item['months'] : []);
                $total = $this->sumMonths($months);

                $evidenceType = $this->normalizeEvidenceType($item['evidenceType'] ?? null, $item['evidence'] ?? null);
                $evidenceOther = null;
                $evidence = null;
                if ($evidenceType !== null) {
                    $evidenceOther = $evidenceType === 'other'
                        ? trim((string) ($item['evidenceOther'] ?? ($item['evidence'] ?? '')))
                        : null;
                    $evidence = $this->resolveEvidenceLabel($evidenceType, $evidenceOther);
                    if (trim((string) $evidence) === '') {
                        $evidence = null;
                        $evidenceOther = null;
                        $evidenceType = null;
                    }
                }

                Scope11StationaryItem::updateOrCreate(
                    [
                        'cycle_id' => $cycle->id,
                        'row_id' => $rowId,
                    ],
                    [
                        'item_label' => isset($item['itemLabel']) ? (string) $item['itemLabel'] : null,
                        'evidence_type' => $evidenceType,
                        'evidence_other' => $evidenceOther ?: null,
                        'evidence' => $evidence ?: null,
                        'unit' => strtoupper(trim((string) ($item['unit'] ?? 'L'))) ?: 'L',
                        'fuel_key' => isset($item['fuelKey']) ? (string) $item['fuelKey'] : null,
                        'other_type' => isset($item['otherType']) ? (string) $item['otherType'] : null,
                        'months_json' => $months,
                        'total' => $total,
                    ]
                );
            }

            Scope11StationaryItem::query()
                ->where('cycle_id', $cycle->id)
                ->when($rowIds, fn ($q) => $q->whereNotIn('row_id', $rowIds))
                ->delete();

            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();
            return response()->json([
                'ok' => false,
                'message' => $e->getMessage(),
            ]);
        }

        return response()->json([
            'ok' => true,
            'saved' => count($rowIds),
        ]);
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

    private function normalizeMonths(array $months): array
    {
        $out = [];
        for ($i = 1; $i <= 12; $i++) {
            $key = 'M' . $i;
            $out[$key] = array_key_exists($key, $months) ? $this->normalizeNumber($months[$key]) : null;
        }
        return $out;
    }

    private function sumMonths(array $months): ?float
    {
        $hasValue = false;
        $total = 0.0;
        foreach ($months as $value) {
            if ($value !== null && is_numeric($value)) {
                $hasValue = true;
                $total += (float) $value;
            }
        }
        return $hasValue ? $total : null;
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
            if ($v !== null && is_numeric($v)) return true;
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

    private function normalizeEvidenceType($rawType, $rawEvidence): ?string
    {
        $type = strtolower(trim((string) ($rawType ?? '')));
        if (in_array($type, ['invoice', 'cash_invoice', 'po', 'other'], true)) {
            return $type;
        }

        $evidence = trim((string) ($rawEvidence ?? ''));
        if ($evidence === '') return null;
        if ($evidence === 'ใบกำกับภาษี') return 'invoice';
        if ($evidence === 'บิลเงินสด/ใบกำกับภาษี') return 'cash_invoice';
        if ($evidence === 'ใบสั่งซื้อ') return 'po';
        return 'other';
    }

    private function resolveEvidenceLabel(string $type, ?string $otherText): string
    {
        if ($type === 'invoice') return 'ใบกำกับภาษี';
        if ($type === 'cash_invoice') return 'บิลเงินสด/ใบกำกับภาษี';
        if ($type === 'po') return 'ใบสั่งซื้อ';
        if ($type === 'other') return trim((string) ($otherText ?? ''));
        return '';
    }

    /**
     * @return array<int, string>
     */
    private function defaultScope11RowIds(): array
    {
        return [
            'DIESEL_B7_STATIONARY',
            'GASOHOL_9195_STATIONARY',
            'ACETYLENE_TANK5_MAINT_2',
            'ACETYLENE_TANK5_MAINT_3',
        ];
    }

    private function defaultFuelKeyForScope11RowId(string $rowId): string
    {
        return match ($rowId) {
            'DIESEL_B7_STATIONARY' => 'B7',
            'GASOHOL_9195_STATIONARY' => '91/95',
            default => 'OTHER',
        };
    }

    private function defaultUnitForScope11RowId(string $rowId): string
    {
        return match ($rowId) {
            'DIESEL_B7_STATIONARY', 'GASOHOL_9195_STATIONARY' => 'L',
            default => 'L',
        };
    }
}
