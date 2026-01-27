<?php

namespace Tests\Feature;

use App\Models\Cycle;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EfViewSmokeTest extends TestCase
{
    use RefreshDatabase;

    private function apiHeaders(): array
    {
        return ['X-API-KEY' => env('API_KEY', 'devkey')];
    }

    public function test_ef_view_year_2025_catalogs_and_unique_keys(): void
    {
        $cycle = Cycle::create([
            'year' => 2025,
            'name' => 'EF View 2025',
            'template_id' => 'vsheet_cfo_2025',
            'data_json' => [],
        ]);

        $resp = $this->getJson(
            "/api/cycles/{$cycle->id}/ef/view?scope=stationary",
            $this->apiHeaders()
        );

        $resp->assertStatus(200);
        $resp->assertJson(['ok' => true]);

        $options = $resp->json('options');
        $this->assertIsArray($options);
        $this->assertNotEmpty($options);

        $catalogs = array_unique(array_map(fn ($row) => $row['catalog'] ?? '', $options));
        $this->assertContains('AR5', $catalogs);
        $this->assertContains('EF1', $catalogs);
        $this->assertNotContains('AR5V2', $catalogs);

        $keys = array_values(array_filter(array_map(fn ($row) => $row['efKey'] ?? '', $options)));
        $this->assertCount(count($keys), array_unique($keys));
    }

    public function test_ef_view_year_2026_catalogs_and_unique_keys(): void
    {
        $cycle = Cycle::create([
            'year' => 2026,
            'name' => 'EF View 2026',
            'template_id' => 'vsheet_cfo_2026',
            'data_json' => [],
        ]);

        $resp = $this->getJson(
            "/api/cycles/{$cycle->id}/ef/view?scope=stationary",
            $this->apiHeaders()
        );

        $resp->assertStatus(200);
        $resp->assertJson(['ok' => true]);

        $options = $resp->json('options');
        $this->assertIsArray($options);
        $this->assertNotEmpty($options);

        $catalogs = array_unique(array_map(fn ($row) => $row['catalog'] ?? '', $options));
        $this->assertContains('AR5V2', $catalogs);
        $this->assertContains('EF1', $catalogs);
        $this->assertNotContains('AR5', $catalogs);

        $keys = array_values(array_filter(array_map(fn ($row) => $row['efKey'] ?? '', $options)));
        $this->assertCount(count($keys), array_unique($keys));
    }
}
