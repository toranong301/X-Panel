<?php

namespace Tests\Feature;

use App\Models\Cycle;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ApiEndpointsTest extends TestCase
{
    use RefreshDatabase;

    private function apiHeaders(): array
    {
        return ['X-API-KEY' => env('API_KEY', 'devkey')];
    }

    public function test_health_endpoint_returns_ok(): void
    {
        $resp = $this->getJson('/api/health');
        $resp->assertStatus(200);
        $resp->assertJson([
            'status' => 'ok',
        ]);
    }

    public function test_cycles_endpoint_returns_array(): void
    {
        $resp = $this->getJson('/api/cycles', $this->apiHeaders());
        $resp->assertStatus(200);
        $this->assertIsArray($resp->json());
    }

    public function test_preview_invalid_sheet_id_returns_422(): void
    {
        $cycle = Cycle::create([
            'year' => 2025,
            'name' => 'Test Cycle',
            'data_json' => [],
        ]);

        $resp = $this->getJson("/api/cycles/{$cycle->id}/preview?sheetId=NO_SUCH_SHEET", $this->apiHeaders());
        $resp->assertStatus(422);
        $resp->assertJson([
            'code' => 'INVALID_SHEET_ID',
        ]);
    }
}
