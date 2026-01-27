<?php

namespace Tests\Feature;

use App\Models\Cycle;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class Scope11StationaryRoundTripTest extends TestCase
{
    use RefreshDatabase;

    private function apiHeaders(): array
    {
        return ['X-API-KEY' => env('API_KEY', 'devkey')];
    }

    public function test_put_then_get_returns_saved_rows(): void
    {
        $cycle = Cycle::create([
            'year' => 2025,
            'name' => 'Scope11 Roundtrip',
            'data_json' => [],
        ]);

        $payload = [
            'items' => [
                [
                    'rowId' => 'ROW_A',
                    'itemLabel' => 'Diesel B7',
                    'evidenceType' => 'invoice',
                    'evidenceOther' => null,
                    'evidence' => 'Invoice',
                    'unit' => 'L',
                    'fuelKey' => 'B7',
                    'otherType' => null,
                    'otherDieselPct' => null,
                    'otherBiodieselPct' => null,
                    'otherGasolinePct' => null,
                    'otherEthanolPct' => null,
                    'otherBiodieselDensityKgPerL' => null,
                    'otherEthanolDensityKgPerL' => null,
                    'tankModeEnabled' => false,
                    'tankCount' => null,
                    'kgPerTank' => null,
                    'tankTargetMonth' => null,
                    'computedKg' => null,
                    'months' => [
                        'M1' => 100,
                        'M2' => 50,
                    ],
                ],
                [
                    'rowId' => 'ROW_B',
                    'itemLabel' => 'Other Fuel',
                    'evidenceType' => 'other',
                    'evidenceOther' => 'Custom doc',
                    'evidence' => 'Custom doc',
                    'unit' => 'kg',
                    'fuelKey' => 'OTHER',
                    'otherType' => 'Test',
                    'otherDieselPct' => 50,
                    'otherBiodieselPct' => 50,
                    'otherGasolinePct' => null,
                    'otherEthanolPct' => null,
                    'otherBiodieselDensityKgPerL' => 0.87,
                    'otherEthanolDensityKgPerL' => null,
                    'tankModeEnabled' => true,
                    'tankCount' => 2,
                    'kgPerTank' => 10,
                    'tankTargetMonth' => 'M3',
                    'computedKg' => 20,
                    'months' => [
                        'M3' => 20,
                    ],
                ],
            ],
        ];

        $put = $this->putJson(
            "/api/cycles/{$cycle->id}/scope11/stationary/items",
            $payload,
            $this->apiHeaders()
        );
        $put->assertStatus(200);
        $put->assertJson(['ok' => true, 'saved' => 2]);

        $get = $this->getJson(
            "/api/cycles/{$cycle->id}/scope11/stationary/items",
            $this->apiHeaders()
        );
        $get->assertStatus(200);
        $items = $get->json('items');
        $this->assertCount(2, $items);

        $rowA = collect($items)->firstWhere('rowId', 'ROW_A');
        $this->assertNotNull($rowA);
        $this->assertSame('Diesel B7', $rowA['itemLabel']);
        $this->assertSame('invoice', $rowA['evidenceType']);
        $this->assertSame('L', $rowA['unit']);
        $this->assertSame('B7', $rowA['fuelKey']);
        $this->assertSame(100.0, (float) $rowA['months']['M1']);
        $this->assertSame(50.0, (float) $rowA['months']['M2']);

        $rowB = collect($items)->firstWhere('rowId', 'ROW_B');
        $this->assertNotNull($rowB);
        $this->assertSame('Other Fuel', $rowB['itemLabel']);
        $this->assertSame('other', $rowB['evidenceType']);
        $this->assertSame('Custom doc', $rowB['evidenceOther']);
        $this->assertSame('KG', $rowB['unit']);
        $this->assertSame('OTHER', $rowB['fuelKey']);
        $this->assertSame(50.0, (float) $rowB['otherDieselPct']);
        $this->assertSame(50.0, (float) $rowB['otherBiodieselPct']);
        $this->assertSame(0.87, (float) $rowB['otherBiodieselDensityKgPerL']);
        $this->assertSame(2.0, (float) $rowB['tankCount']);
        $this->assertSame(10.0, (float) $rowB['kgPerTank']);
        $this->assertSame('M3', $rowB['tankTargetMonth']);
        $this->assertSame(20.0, (float) $rowB['computedKg']);
    }
}
