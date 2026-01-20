<?php

namespace Tests\Unit;

use App\Services\MbaxTemplateService;
use App\Services\TemplateRegistry;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PHPUnit\Framework\TestCase;

class Scope11StationaryTableTest extends TestCase
{
    public function test_empty_scope11_table_clears_existing_rows(): void
    {
        $service = new MbaxTemplateService(new TemplateRegistry());
        $spreadsheet = new Spreadsheet();
        $ws = $spreadsheet->createSheet();
        $ws->setTitle('_DATA_SCOPE11');

        $headers = [
            'RowId',
            'ItemLabel',
            'FuelType',
            'Evidence',
            'Unit',
            'M1',
            'M2',
            'M3',
            'M4',
            'M5',
            'M6',
            'M7',
            'M8',
            'M9',
            'M10',
            'M11',
            'M12',
            'OtherDieselPct',
            'OtherBiodieselPct',
            'OtherGasolinePct',
            'OtherEthanolPct',
            'OtherBiodieselDensityKgPerL',
            'OtherEthanolDensityKgPerL',
        ];

        foreach ($headers as $i => $header) {
            $cell = Coordinate::stringFromColumnIndex($i + 1) . '1';
            $ws->setCellValue($cell, $header);
        }

        $ws->setCellValue('A2', 'OLD_ROW');
        $ws->setCellValue('F2', 123);

        $ref = new \ReflectionClass($service);
        $method = $ref->getMethod('writeScope11StationaryTable');
        $method->setAccessible(true);
        $method->invoke($service, $ws, []);

        $this->assertNull($ws->getCell('A2')->getValue());
        $this->assertNull($ws->getCell('F2')->getValue());
    }
}
