<?php

namespace App\Services;

use App\Models\Cycle;
use App\Models\EfLibraryEntry;
use App\Models\EfOverride;
use App\Models\EfProfile;

class EfResolverService
{
    public function resolveScope11(
        Cycle $cycle,
        array $item,
        ?string $efIdOverride = null
    ): array {
        $scope = 'stationary';
        $year = is_numeric($cycle->year ?? null) ? (int) $cycle->year : null;

        $defaultProfile = $this->resolveDefaultProfile($cycle);
        $ef1Profile = EfProfile::query()->where('code', 'EF1')->first();

        $efId = trim((string) ($efIdOverride ?? ''));
        $resolvedFrom = $efId !== '' ? 'activity_override' : 'default_map';
        if ($efId === '') {
            $efId = $this->defaultEfIdForFuelKey(
                (string) ($item['fuelKey'] ?? ''),
                (string) ($item['unit'] ?? '')
            );
        }
        if ($efId === '') {
            $rowId = trim((string) ($item['rowId'] ?? ''));
            if ($rowId !== '') {
                $resolvedFrom = 'row_id';
                $efId = $rowId;
            }
        }
        if ($efId === '') {
            return [
                'ok' => false,
                'code' => 'MISSING_EF_ID',
                'message' => 'No EF mapping for item.',
            ];
        }

        $entry = $this->findEntryByEfId([$ef1Profile, $defaultProfile], $scope, $efId);
        if (!$entry) {
            return [
                'ok' => false,
                'code' => 'EF_NOT_FOUND',
                'message' => "EF not found in library: {$efId}",
                'efId' => $efId,
            ];
        }

        $profileCode = $entry->profile?->code;
        $resolved = [
            'efProfile' => $profileCode,
            'efId' => $entry->ef_id,
            'name' => $entry->name,
            'unit' => $entry->unit,
            'co2' => $entry->co2,
            'fossil_ch4' => $entry->fossil_ch4,
            'ch4' => $entry->ch4,
            'n2o' => $entry->n2o,
            'total' => $entry->total,
            'source' => $entry->source,
        ];

        if ($profileCode === 'EF1') {
            $override = $this->loadEf1Override($scope, $year, $entry->ef_id);
            if ($override) {
                $resolvedFrom = 'ef_override';
                $resolved = array_merge($resolved, [
                    'name' => $override->name ?? $resolved['name'],
                    'unit' => $override->unit ?? $resolved['unit'],
                    'co2' => $override->co2 ?? $resolved['co2'],
                    'fossil_ch4' => $override->fossil_ch4 ?? $resolved['fossil_ch4'],
                    'ch4' => $override->ch4 ?? $resolved['ch4'],
                    'n2o' => $override->n2o ?? $resolved['n2o'],
                    'total' => $override->total ?? $resolved['total'],
                    'source' => $override->source ?? $resolved['source'],
                ]);
            }
        }

        return [
            'ok' => true,
            'resolvedFrom' => $resolvedFrom,
            'ef' => $resolved,
        ];
    }

    private function resolveDefaultProfile(Cycle $cycle): EfProfile
    {
        $year = is_numeric($cycle->year ?? null) ? (int) $cycle->year : null;
        if ($year !== null && $year >= 2026) {
            $profile = EfProfile::query()->where('code', 'AR5V2')->first();
            if ($profile) return $profile;
        }

        $profile = EfProfile::query()->where('code', 'AR5')->first();
        if ($profile) return $profile;

        // last resort (should never happen if seeded)
        return EfProfile::query()->firstOrCreate(
            ['code' => 'AR5'],
            ['label' => 'TGO AR5']
        );
    }

    private function loadEf1Override(string $scope, ?int $year, string $efId): ?EfOverride
    {
        if (!class_exists(EfOverride::class)) {
            return null;
        }

        $q = EfOverride::query()
            ->where('catalog', 'EF1')
            ->where('scope', $scope)
            ->where('ef_id', $efId);

        if ($year !== null) {
            $q->where(function ($q) use ($year) {
                $q->where('year', $year)->orWhereNull('year');
            })->orderByRaw('CASE WHEN year IS NULL THEN 1 ELSE 0 END')->orderBy('year', 'desc');
        } else {
            $q->orderByRaw('CASE WHEN year IS NULL THEN 1 ELSE 0 END');
        }

        return $q->first();
    }

    /**
     * @param array<int, EfProfile|null> $profiles
     */
    private function findEntryByEfId(array $profiles, string $scope, string $efId): ?EfLibraryEntry
    {
        $profileIds = array_values(array_filter(array_map(
            fn ($p) => $p?->id,
            $profiles
        )));
        if (!$profileIds) return null;

        return EfLibraryEntry::query()
            ->whereIn('ef_profile_id', $profileIds)
            ->where('scope', $scope)
            ->where('ef_id', $efId)
            ->with('profile')
            ->first();
    }

    private function defaultEfIdForFuelKey(string $fuelKey, string $unit): string
    {
        $key = strtoupper(trim($fuelKey));
        $unitKey = strtolower(trim($unit));
        if ($unitKey !== '' && $unitKey !== 'l' && $unitKey !== 'kg') {
            // keep default mapping; unit mismatches should be handled by validation
        }

        if ($key === 'B7' || $key === 'B10') return 'SC_GAS_DIESEL_OIL_L';
        if ($key === '91/95' || $key === 'E20') return 'SC_MOTOR_GASOLINE_L';
        if ($key === 'LPG') return 'SC_LPG_L';
        return '';
    }
}
