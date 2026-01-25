<?php

namespace Tests\Unit;

use App\Models\Fr041Config;
use App\Services\Fr041SelectionsV2Helper;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class Fr041SelectionsV2HelperTest extends TestCase
{
    use RefreshDatabase;

    public function test_2025_allows_ar5_and_mark_invalid_ar5v2(): void
    {
        $config = new Fr041Config();
        $config->options = [
            'selections_v2' => [
                [
                    'lineId' => 'ROW1::DIESEL_L',
                    'parentRowId' => 'ROW1',
                    'component' => 'DIESEL_L',
                    'include' => true,
                    'efCatalog' => 'AR5',
                    'efId' => 'E1',
                ],
                [
                    'lineId' => 'ROW1::BIODIESEL_KG',
                    'parentRowId' => 'ROW1',
                    'component' => 'BIODIESEL_KG',
                    'include' => true,
                    'efCatalog' => 'AR5V2',
                    'efId' => 'E2',
                ],
            ],
        ];

        $result = Fr041SelectionsV2Helper::resolve($config, 2025);

        $this->assertFalse($result->legacyFallbackUsed);
        $this->assertCount(2, $result->includedLines);
        $this->assertEqualsCanonicalizing(['ROW1::BIODIESEL_KG'], $result->invalidCatalogLineIds);
    }

    public function test_2026_allows_ar5v2_and_marks_ar5_invalid(): void
    {
        $config = new Fr041Config();
        $config->options = [
            'selections_v2' => [
                [
                    'lineId' => 'ROW2::GASOLINE_L',
                    'parentRowId' => 'ROW2',
                    'component' => 'GASOLINE_L',
                    'include' => true,
                    'efCatalog' => 'AR5',
                    'efId' => 'E3',
                ],
                [
                    'lineId' => 'ROW2::ETHANOL_KG',
                    'parentRowId' => 'ROW2',
                    'component' => 'ETHANOL_KG',
                    'include' => true,
                    'efCatalog' => 'AR5V2',
                    'efId' => 'E4',
                ],
            ],
        ];

        $result = Fr041SelectionsV2Helper::resolve($config, 2026);

        $this->assertFalse($result->legacyFallbackUsed);
        $this->assertEqualsCanonicalizing(['ROW2::GASOLINE_L'], $result->invalidCatalogLineIds);
        $this->assertEmpty($result->missingEfLineIds);
    }

    public function test_missing_ef_detected_for_included_line(): void
    {
        $config = new Fr041Config();
        $config->options = [
            'selections_v2' => [
                [
                    'lineId' => 'ROW3::DIESEL_L',
                    'parentRowId' => 'ROW3',
                    'component' => 'DIESEL_L',
                    'include' => true,
                    'efCatalog' => '',
                    'efId' => '',
                ],
            ],
        ];

        $result = Fr041SelectionsV2Helper::resolve($config, 2025);

        $this->assertTrue(in_array('ROW3::DIESEL_L', $result->missingEfLineIds, true));
        $this->assertFalse($result->legacyFallbackUsed);
    }
}
