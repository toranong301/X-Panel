<?php

namespace Tests\Unit;

use App\Services\Export\Scope11HiddenTableExportService;
use PHPUnit\Framework\TestCase;

class Scope11SplitRowsTest extends TestCase
{
    public function test_split_rows_for_b7_and_e20(): void
    {
        $service = new Scope11HiddenTableExportService();

        $payload = [
            'splitEnabled' => true,
            'items' => [
                [
                    'rowId' => 'ROW_B7',
                    'label' => 'Diesel B7',
                    'evidence' => 'Invoice',
                    'unit' => 'L',
                    'fuelKey' => 'B7',
                    'blendProfile' => 'B7',
                    'months' => [
                        'M1' => 200,
                        'M2' => 340,
                    ],
                ],
                [
                    'rowId' => 'ROW_E20',
                    'label' => 'Gasohol E20',
                    'evidence' => 'Receipt',
                    'unit' => 'L',
                    'fuelKey' => 'E20',
                    'blendProfile' => 'E20',
                    'months' => [
                        'M1' => 100,
                    ],
                ],
            ],
        ];

        $result = $service->previewPayload($payload);
        $rows = $result['splitRows'] ?? [];

        $this->assertCount(2, $rows);

        $b7 = $rows[0];
        $this->assertSame('B7', $b7['fuelKey']);
        $this->assertSame(540.0, $b7['total']);
        $this->assertSame(502.2, $b7['dieselL']);
        $this->assertSame(37.8, $b7['biodieselL']);
        $this->assertSame(32.89, $b7['biodieselKg']);

        $e20 = $rows[1];
        $this->assertSame('E20', $e20['fuelKey']);
        $this->assertSame(100.0, $e20['total']);
        $this->assertSame(80.0, $e20['gasolineL']);
        $this->assertSame(20.0, $e20['ethanolL']);
        $this->assertSame(15.8, $e20['ethanolKg']);
    }
}
