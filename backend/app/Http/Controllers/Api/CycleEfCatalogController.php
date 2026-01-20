<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Cycle;
use App\Models\EfLibraryEntry;
use App\Models\EfOverride;
use App\Models\EfProfile;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class CycleEfCatalogController extends Controller
{
    public function index(Request $request, Cycle $cycle)
    {
        $catalogRaw = strtoupper(trim((string) $request->query('catalog', 'AR5')));
        $scope = strtolower(trim((string) $request->query('scope', 'stationary')));
        $year = is_numeric($cycle->year ?? null) ? (int) $cycle->year : null;

        $catalog = $this->normalizeCatalog($catalogRaw, $year);

        if (!Schema::hasTable('ef_profiles') || !Schema::hasTable('ef_library_entries')) {
            return response()->json([
                'ok' => false,
                'catalog' => $catalog,
                'options' => [],
                'message' => 'EF library tables not migrated (ef_profiles, ef_library_entries).',
            ], 500);
        }

        $profileCode = match ($catalog) {
            'AR5V2' => 'AR5V2',
            'EF1' => 'EF1',
            default => 'AR5',
        };

        $profile = EfProfile::query()->where('code', $profileCode)->first();
        if (!$profile) {
            return response()->json([
                'ok' => false,
                'catalog' => $catalog,
                'options' => [],
                'message' => "EF profile not found: {$profileCode}. Seed ef_profiles first.",
            ], 500);
        }

        $entries = EfLibraryEntry::query()
            ->where('ef_profile_id', $profile->id)
            ->where('scope', $scope)
            ->orderBy('ef_id')
            ->get();

        $options = [];
        foreach ($entries as $entry) {
            $options[] = [
                'efCatalog' => $catalog,
                'efId' => $entry->ef_id,
                'Name' => $entry->name,
                'Unit' => $entry->unit,
                'CO2' => $entry->co2,
                'Fossil CH4' => $entry->fossil_ch4,
                'FossilCH4' => $entry->fossil_ch4,
                'CH4' => $entry->ch4,
                'N2O' => $entry->n2o,
                'Total' => $entry->total,
                'Source' => $entry->source,
            ];
        }

        if ($catalog === 'EF1' && Schema::hasTable('ef_overrides')) {
            $overrides = $this->loadEfOverrides($scope, $year);
            $options = $this->mergeOverrides($options, $overrides);
        }

        $warning = $options ? null : "EF library empty for profile={$profileCode} scope={$scope}. Run EfLibrarySeeder.";

        return response()->json([
            'ok' => true,
            'catalog' => $catalog,
            'options' => $options,
            'warning' => $warning,
        ]);
    }

    private function normalizeCatalog(string $catalog, ?int $year): string
    {
        $catalog = strtoupper(trim($catalog));

        if ($catalog === 'EF(1)' || $catalog === 'EF1') {
            return 'EF1';
        }
        if ($catalog === 'AR5V2') {
            return ($year !== null && $year < 2026) ? 'AR5' : 'AR5V2';
        }
        if ($catalog === 'AR5') {
            return ($year !== null && $year >= 2026) ? 'AR5V2' : 'AR5';
        }

        return 'AR5';
    }

    private function loadEfOverrides(string $scope, ?int $year): array
    {
        if (!class_exists(EfOverride::class) || !Schema::hasTable('ef_overrides')) {
            return [];
        }

        $q = EfOverride::query()
            ->where('catalog', 'EF1')
            ->where('scope', $scope);

        if ($year !== null) {
            $q->where(function ($q) use ($year) {
                $q->whereNull('year')->orWhere('year', $year);
            })->orderByRaw('CASE WHEN year IS NULL THEN 0 ELSE 1 END')->orderBy('year', 'asc');
        } else {
            $q->orderByRaw('CASE WHEN year IS NULL THEN 0 ELSE 1 END');
        }

        $rows = $q->get()->all();

        $out = [];
        foreach ($rows as $row) {
            $out[] = [
                'efCatalog' => 'EF1',
                'efId' => $row->ef_id,
                'Name' => $row->name,
                'Unit' => $row->unit,
                'CO2' => $row->co2,
                'Fossil CH4' => $row->fossil_ch4,
                'FossilCH4' => $row->fossil_ch4,
                'CH4' => $row->ch4,
                'N2O' => $row->n2o,
                'Total' => $row->total,
                'Source' => $row->source,
            ];
        }

        return $out;
    }

    private function mergeOverrides(array $base, array $overrides): array
    {
        if (!$overrides) return $base;

        $map = [];
        foreach ($base as $row) {
            $id = trim((string) ($row['efId'] ?? ''));
            if ($id !== '') $map[$id] = $row;
        }
        foreach ($overrides as $row) {
            $id = trim((string) ($row['efId'] ?? ''));
            if ($id === '') continue;
            $map[$id] = array_merge($map[$id] ?? [], $row);
        }

        return array_values($map);
    }
}

