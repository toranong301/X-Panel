<?php

namespace App\Services;

use App\Models\Cycle;
use App\Models\Fr041Config;
use App\Models\Scope11StationaryItem;
use Illuminate\Support\Facades\Schema;

class ValidationService
{
    public function __construct(private EfResolverService $efResolver)
    {
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

        $efSelectionByRowId = $this->loadEfSelectionByRowId($cycle->id);

        $rows = Scope11StationaryItem::query()
            ->where('cycle_id', $cycle->id)
            ->orderBy('id')
            ->get();

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

            $item = [
                'rowId' => $rowId,
                'fuelKey' => (string) ($row->fuel_key ?? ''),
                'unit' => (string) ($row->unit ?? ''),
                'label' => (string) ($row->item_label ?? ''),
            ];

            $efIdOverride = $efSelectionByRowId[$rowId] ?? null;
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
