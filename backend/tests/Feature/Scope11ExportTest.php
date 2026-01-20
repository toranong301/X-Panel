<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\File;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use Tests\TestCase;

class Scope11ExportTest extends TestCase
{
    private function apiHeaders(): array
    {
        return ['X-API-KEY' => env('API_KEY', 'devkey')];
    }

    public function test_scope11_export_writes_values_to_hidden_table(): void
    {
        $templateDir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'scope11_template_' . uniqid();
        File::ensureDirectoryExists($templateDir);
        $templatePath = $templateDir . DIRECTORY_SEPARATOR . 'SCOPE11.xlsx';

        putenv('SCOPE11_TEMPLATE_PATH=');
        putenv('SCOPE11_TEMPLATE_DIR=' . $templateDir);
        config([
            'export.scope11.template_path' => '',
            'export.scope11.template_dir' => $templateDir,
        ]);

        $spreadsheet = new Spreadsheet();
        $wsData = $spreadsheet->getActiveSheet();
        $wsData->setTitle('_DATA_SCOPE11');
        $headers = [
            'RowId',
            'ItemLabel',
            'Unit',
            'Evidence',
            'BlendProfile',
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
        ];
        foreach ($headers as $idx => $header) {
            $cell = Coordinate::stringFromColumnIndex($idx + 1) . '1';
            $wsData->setCellValue($cell, $header);
        }

        $writer = IOFactory::createWriter($spreadsheet, 'Xlsx');
        $writer->save($templatePath);

        $payload = [
            'splitEnabled' => true,
            'items' => [
                [
                    'rowId' => 'DIESEL_B7_STATIONARY',
                    'label' => 'Diesel B7',
                    'evidence' => 'Invoice',
                    'unit' => 'L',
                    'blendProfile' => 'B7',
                    'months' => [
                        'M1' => 123,
                        'M2' => 456,
                    ],
                ],
            ],
        ];

        $resp = $this->postJson('/api/exports/scope11/xlsx', $payload, $this->apiHeaders());
        $resp->assertStatus(200);
        $resp->assertHeader(
            'content-type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );

        $file = $resp->baseResponse->getFile();
        $this->assertNotNull($file);
        $this->assertFileExists($file->getPathname());

        $out = IOFactory::load($file->getPathname());
        $outSheet = $out->getSheetByName('_DATA_SCOPE11');
        $this->assertSame('DIESEL_B7_STATIONARY', $outSheet->getCell('A2')->getValue());
        $this->assertSame('Diesel B7', $outSheet->getCell('B2')->getValue());
        $this->assertSame('L', $outSheet->getCell('C2')->getValue());
        $this->assertSame('Invoice', $outSheet->getCell('D2')->getValue());
        $this->assertSame('B7', $outSheet->getCell('E2')->getValue());
        $this->assertSame(123.0, $outSheet->getCell('F2')->getValue());
        $this->assertSame(456.0, $outSheet->getCell('G2')->getValue());

        @unlink($templatePath);
        File::deleteDirectory($templateDir);
        putenv('SCOPE11_TEMPLATE_DIR=');
    }
}
