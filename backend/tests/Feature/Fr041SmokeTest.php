<?php

namespace Tests\Feature;

use App\Models\Cycle;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class Fr041SmokeTest extends TestCase
{
    use RefreshDatabase;

    private function apiHeaders(): array
    {
        return ['X-API-KEY' => env('API_KEY', 'devkey')];
    }

    public function test_cycle_ef_catalog_returns_ok(): void
    {
        $cycle = Cycle::create([
            'year' => 2025,
            'name' => 'EF Catalog Smoke',
            'template_id' => 'mbax',
            'data_json' => [],
        ]);

        $resp = $this->getJson(
            "/api/cycles/{$cycle->id}/ef/catalog?catalog=AR5&scope=stationary",
            $this->apiHeaders()
        );

        $resp->assertStatus(200);
        $resp->assertJson([
            'ok' => true,
            'catalog' => 'AR5',
        ]);
        $options = $resp->json('options');
        $this->assertIsArray($options);
        $this->assertNotEmpty($options);
        $this->assertNotEmpty($options[0]['efId'] ?? null);
    }

    public function test_preview_fr041_returns_ok(): void
    {
        $cycle = Cycle::create([
            'year' => 2025,
            'name' => 'Preview Smoke',
            'template_id' => 'mbax',
            'data_json' => [],
        ]);

        $resp = $this->getJson(
            "/api/cycles/{$cycle->id}/preview?sheetId=fr041&ts=0",
            $this->apiHeaders()
        );

        $resp->assertStatus(200);
        $resp->assertJson([
            'ok' => true,
            'sheetId' => 'fr041',
        ]);
    }
}
