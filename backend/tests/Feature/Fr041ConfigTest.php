<?php

namespace Tests\Feature;

use App\Models\Cycle;
use App\Models\Fr041Config;
use App\Models\Scope11StationaryItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class Fr041ConfigTest extends TestCase
{
    use RefreshDatabase;

    private function apiHeaders(): array
    {
        return ['X-API-KEY' => env('API_KEY', 'devkey')];
    }

    public function test_show_auto_upgrades_selected_row_ids_to_selections_v2(): void
    {
        $cycle = Cycle::create([
            'year' => 2025,
            'name' => 'FR-04.1 Cycle',
            'data_json' => [],
        ]);

        Fr041Config::create([
            'cycle_id' => $cycle->id,
            'sheet_id' => 'fr041',
            'section' => 'scope1_stationary',
            'selected_row_ids' => ['ROW_B7', 'ROW_9195'],
        ]);

        Scope11StationaryItem::create([
            'cycle_id' => $cycle->id,
            'row_id' => 'ROW_B7',
            'fuel_key' => 'B7',
            'item_label' => 'Diesel B7',
            'unit' => 'L',
        ]);
        Scope11StationaryItem::create([
            'cycle_id' => $cycle->id,
            'row_id' => 'ROW_9195',
            'fuel_key' => '91/95',
            'item_label' => 'Gasohol 91/95',
            'unit' => 'L',
        ]);

        $resp = $this->getJson("/api/cycles/{$cycle->id}/fr041/config", $this->apiHeaders());
        $resp->assertStatus(200);

        $payload = $resp->json();
        $this->assertArrayHasKey('options', $payload);
        $this->assertArrayHasKey('selections_v2', $payload['options']);
        $this->assertCount(4, $payload['options']['selections_v2']);

        $lineIds = array_column($payload['options']['selections_v2'], 'lineId');
        $this->assertEqualsCanonicalizing([
            'ROW_B7::DIESEL_L',
            'ROW_B7::BIODIESEL_KG',
            'ROW_9195::GASOLINE_L',
            'ROW_9195::ETHANOL_KG',
        ], $lineIds);

        $config = Fr041Config::first();
        $this->assertNotNull($config);
        $this->assertArrayHasKey('selections_v2', $config->options ?? []);
    }

    public function test_update_accepts_selections_v2_in_options(): void
    {
        $cycle = Cycle::create([
            'year' => 2025,
            'name' => 'FR-04.1 Cycle',
            'data_json' => [],
        ]);

        $payload = [
            'selectedRowIds' => ['ROW_OTHER'],
            'options' => [
                'selections_v2' => [
                    [
                        'lineId' => 'ROW_OTHER::DIESEL_L',
                        'parentRowId' => 'ROW_OTHER',
                        'component' => 'DIESEL_L',
                        'include' => true,
                        'efCatalog' => null,
                        'efId' => null,
                    ],
                ],
            ],
        ];

        $resp = $this->putJson("/api/cycles/{$cycle->id}/fr041/config", $payload, $this->apiHeaders());
        $resp->assertStatus(200);

        $config = Fr041Config::first();
        $this->assertNotNull($config);
        $this->assertArrayHasKey('selections_v2', $config->options ?? []);
        $this->assertCount(1, $config->options['selections_v2'] ?? []);
    }

    public function test_update_preserves_existing_options_when_missing_in_payload(): void
    {
        $cycle = Cycle::create([
            'year' => 2025,
            'name' => 'FR-04.1 Merge',
            'data_json' => [],
        ]);

        Fr041Config::create([
            'cycle_id' => $cycle->id,
            'sheet_id' => 'fr041',
            'section' => 'scope1_stationary',
            'selected_row_ids' => ['ROW_OLD'],
            'options' => [
                'templateSetId' => 'vsheet_base',
                'selections_v2' => [
                    [
                        'lineId' => 'ROW_OLD::DIESEL_L',
                        'parentRowId' => 'ROW_OLD',
                        'component' => 'DIESEL_L',
                        'include' => true,
                        'efCatalog' => 'AR5',
                        'efId' => 'EF_OLD',
                    ],
                ],
            ],
        ]);

        $payload = [
            'selectedRowIds' => ['ROW_NEW'],
        ];

        $resp = $this->putJson("/api/cycles/{$cycle->id}/fr041/config", $payload, $this->apiHeaders());
        $resp->assertStatus(200);

        $config = Fr041Config::query()->first();
        $this->assertNotNull($config);
        $this->assertSame('vsheet_base', $config->options['templateSetId'] ?? null);
        $this->assertNotEmpty($config->options['selections_v2'] ?? []);
    }
}
