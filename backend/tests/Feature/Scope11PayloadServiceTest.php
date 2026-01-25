<?php

namespace Tests\Feature;

use App\Models\Cycle;
use App\Models\Fr041Config;
use App\Models\Scope11StationaryItem;
use App\Services\Scope11PayloadService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class Scope11PayloadServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_build_payload_includes_fr041_selection_lines_with_ef(): void
    {
        $cycle = Cycle::create([
            'year' => 2025,
            'name' => 'Payload cycle',
            'data_json' => [],
        ]);

        Scope11StationaryItem::create([
            'cycle_id' => $cycle->id,
            'row_id' => 'ROW_B7',
            'fuel_key' => 'B7',
            'item_label' => 'Diesel B7',
            'unit' => 'L',
            'months_json' => ['M1' => 100],
        ]);

        Fr041Config::create([
            'cycle_id' => $cycle->id,
            'sheet_id' => 'fr041',
            'section' => 'scope1_stationary',
            'selected_row_ids' => ['ROW_B7'],
            'options' => [
                'selections_v2' => [
                    [
                        'lineId' => 'ROW_B7::DIESEL_L',
                        'parentRowId' => 'ROW_B7',
                        'component' => 'DIESEL_L',
                        'include' => true,
                        'efCatalog' => 'AR5',
                        'efId' => 'E1',
                    ],
                    [
                        'lineId' => 'ROW_B7::BIODIESEL_KG',
                        'parentRowId' => 'ROW_B7',
                        'component' => 'BIODIESEL_KG',
                        'include' => true,
                        'efCatalog' => 'AR5',
                        'efId' => 'E2',
                    ],
                ],
            ],
        ]);

        $service = app(Scope11PayloadService::class);
        $payload = $service->buildPayload($cycle);

        $this->assertArrayHasKey('fr041SelectionLines', $payload);
        $this->assertFalse($payload['fr041SelectionLegacyFallback']);
        $this->assertEmpty($payload['fr041SelectionMissingEfLineIds']);

        $lines = $payload['fr041SelectionLines'];
        $this->assertCount(2, $lines);

        $dieselLine = collect($lines)->first(fn ($line) => ($line['component'] ?? '') === 'DIESEL_L');
        $this->assertNotNull($dieselLine);
        $this->assertEquals('ROW_B7::DIESEL_L', $dieselLine['lineId']);
        $this->assertEquals('AR5', $dieselLine['efCatalog']);
        $this->assertEquals('L', $dieselLine['unit']);
        $this->assertEquals(93.0, $dieselLine['qty']);

        $biodieselLine = collect($lines)->first(fn ($line) => ($line['component'] ?? '') === 'BIODIESEL_KG');
        $this->assertNotNull($biodieselLine);
        $this->assertEquals('ROW_B7::BIODIESEL_KG', $biodieselLine['lineId']);
        $this->assertEquals('kg', $biodieselLine['unit']);
        $this->assertEquals(6.09, $biodieselLine['qty']);
    }
}
