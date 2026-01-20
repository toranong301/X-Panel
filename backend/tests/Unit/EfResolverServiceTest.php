<?php

namespace Tests\Unit;

use App\Models\Cycle;
use App\Models\EfLibraryEntry;
use App\Models\EfOverride;
use App\Models\EfProfile;
use App\Services\EfResolverService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EfResolverServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_ef1_year_override_takes_precedence_over_null_year(): void
    {
        $ar5 = EfProfile::query()->create(['code' => 'AR5', 'label' => 'TGO AR5']);
        $ef1 = EfProfile::query()->create(['code' => 'EF1', 'label' => 'EF (1)']);

        EfLibraryEntry::query()->create([
            'ef_profile_id' => $ef1->id,
            'scope' => 'stationary',
            'ef_id' => 'SC_GAS_DIESEL_OIL_L',
            'name' => 'Diesel',
            'unit' => 'L',
            'co2' => 0,
            'fossil_ch4' => 0,
            'ch4' => 0,
            'n2o' => 0,
            'total' => 10,
            'source' => 'seed',
        ]);

        EfOverride::query()->create([
            'catalog' => 'EF1',
            'scope' => 'stationary',
            'year' => null,
            'ef_id' => 'SC_GAS_DIESEL_OIL_L',
            'total' => 111,
            'source' => 'default',
        ]);
        EfOverride::query()->create([
            'catalog' => 'EF1',
            'scope' => 'stationary',
            'year' => 2025,
            'ef_id' => 'SC_GAS_DIESEL_OIL_L',
            'total' => 222,
            'source' => 'year',
        ]);

        $cycle = Cycle::query()->create([
            'year' => 2025,
            'name' => 'Test',
            'data_json' => [],
            'template_id' => 'mbax',
        ]);

        $svc = new EfResolverService();
        $resolved = $svc->resolveScope11($cycle, [
            'rowId' => 'DIESEL_B7_STATIONARY',
            'fuelKey' => 'B7',
            'unit' => 'L',
            'label' => 'Diesel',
        ]);

        $this->assertTrue($resolved['ok'] ?? false);
        $this->assertSame('ef_override', $resolved['resolvedFrom'] ?? null);
        $this->assertSame('AR5', $ar5->code);
        $this->assertSame(222.0, (float) ($resolved['ef']['total'] ?? 0));
    }
}

