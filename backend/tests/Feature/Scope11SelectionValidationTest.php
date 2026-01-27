<?php

namespace Tests\Feature;

use App\Models\Cycle;
use App\Models\Fr041Config;
use App\Models\Scope11StationaryItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class Scope11SelectionValidationTest extends TestCase
{
    use RefreshDatabase;

    private function apiHeaders(): array
    {
        return ['X-API-KEY' => env('API_KEY', 'devkey')];
    }

    public function test_missing_ef_line_reports_validation_error_and_missing_count(): void
    {
        $cycle = Cycle::create([
            'year' => 2025,
            'name' => 'Cycle with missing EF',
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
            'options' => [
                'selections_v2' => [
                    [
                        'lineId' => 'ROW_B7::DIESEL_L',
                        'parentRowId' => 'ROW_B7',
                        'component' => 'DIESEL_L',
                        'include' => true,
                        'efCatalog' => null,
                        'efId' => null,
                    ],
                ],
            ],
        ]);

        $validations = $this->getJson("/api/cycles/{$cycle->id}/validations", $this->apiHeaders());
        $validations->assertStatus(200);
        $errors = $validations->json('errors');
        $this->assertNotEmpty($errors);
        $this->assertNotFalse(
            collect($errors)->first(fn ($error) => isset($error['code']) && $error['code'] === 'MISSING_EF')
        );

        $dashboard = $this->getJson("/api/cycles/{$cycle->id}/dashboard/sections", $this->apiHeaders());
        $dashboard->assertStatus(200);
        $sections = $dashboard->json('sections');
        $stationary = collect($sections)->firstWhere('sectionId', '1.1');
        $this->assertNotNull($stationary);
        $this->assertGreaterThan(0, $stationary['status']['missingEfCount']);
    }

    public function test_year_2025_rejects_ar5v2_catalog(): void
    {
        $cycle = Cycle::create([
            'year' => 2025,
            'name' => 'Cycle with invalid catalog',
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
            'options' => [
                'selections_v2' => [
                    [
                        'lineId' => 'ROW_B7::DIESEL_L',
                        'parentRowId' => 'ROW_B7',
                        'component' => 'DIESEL_L',
                        'include' => true,
                        'efCatalog' => 'AR5V2',
                        'efId' => 'AR5V2_DIESEL',
                    ],
                ],
            ],
        ]);

        $validations = $this->getJson("/api/cycles/{$cycle->id}/validations", $this->apiHeaders());
        $validations->assertStatus(200);
        $errors = $validations->json('errors');
        $this->assertNotEmpty($errors);
        $this->assertNotFalse(
            collect($errors)->first(fn ($error) => isset($error['code']) && $error['code'] === 'INVALID_EF_CATALOG_YEAR')
        );
    }

    public function test_year_2026_rejects_ar5_catalog(): void
    {
        $cycle = Cycle::create([
            'year' => 2026,
            'name' => 'Cycle with invalid catalog 2026',
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
            'options' => [
                'selections_v2' => [
                    [
                        'lineId' => 'ROW_B7::DIESEL_L',
                        'parentRowId' => 'ROW_B7',
                        'component' => 'DIESEL_L',
                        'include' => true,
                        'efCatalog' => 'AR5',
                        'efId' => 'AR5_DIESEL',
                    ],
                ],
            ],
        ]);

        $validations = $this->getJson("/api/cycles/{$cycle->id}/validations", $this->apiHeaders());
        $validations->assertStatus(200);
        $errors = $validations->json('errors');
        $this->assertNotEmpty($errors);
        $this->assertNotFalse(
            collect($errors)->first(fn ($error) => isset($error['code']) && $error['code'] === 'INVALID_EF_CATALOG_YEAR')
        );
    }
}
