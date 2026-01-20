<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EfLibraryEntry;
use App\Models\EfProfile;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class EfCatalogController extends Controller
{
    public function index(Request $request)
    {
        $catalog = strtoupper((string) ($request->query('catalog') ?? 'AR5'));
        $scope = strtolower((string) ($request->query('scope') ?? 'stationary'));

        if (!Schema::hasTable('ef_profiles') || !Schema::hasTable('ef_library_entries')) {
            return response()->json([
                'ok' => false,
                'catalog' => $catalog,
                'options' => [],
                'message' => 'EF library tables not migrated (ef_profiles, ef_library_entries).',
            ], 500);
        }

        $profileCode = match ($catalog) {
            'AR5' => 'AR5',
            'OTHER' => 'EF1',
            default => null,
        };

        if ($profileCode === null) {
            return response()->json([
                'ok' => true,
                'catalog' => $catalog,
                'options' => [],
                'warning' => 'Unknown catalog requested.',
            ]);
        }

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

        return response()->json([
            'ok' => true,
            'catalog' => $catalog,
            'source' => 'db',
            'options' => $options,
            'warning' => $options ? null : "EF library empty for {$profileCode} scope={$scope}. Run EfLibrarySeeder.",
        ]);
    }
}

