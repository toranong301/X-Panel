<?php

namespace Tests\Feature;

use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use Tests\TestCase;

class Scope11ExportLinkageTest extends TestCase
{
    private function apiHeaders(): array
    {
        return ['X-API-KEY' => env('API_KEY', 'devkey')];
    }

    public function test_scope11_export_preserves_fr041_and_stationary_formulas(): void
    {
        $templatePath = base_path('storage/app/templates/mbax/VSheetCFO_BASE.xlsx');
        if (!is_file($templatePath)) {
            $this->markTestSkipped('Scope11 template missing: ' . $templatePath);
        }

        putenv('SCOPE11_TEMPLATE_PATH=' . $templatePath);
        putenv('SCOPE11_TEMPLATE_DIR=');
        config([
            'export.scope11.template_path' => $templatePath,
            'export.scope11.template_dir' => '',
        ]);

        $payload = [
            'splitEnabled' => true,
            'items' => [
                [
                    'rowId' => 'DIESEL_B7_STATIONARY',
                    'fuelKey' => 'B7',
                    'label' => 'Diesel B7',
                    'evidence' => 'Invoice',
                    'unit' => 'L',
                    'blendProfile' => 'B7',
                    'months' => [
                        'M1' => 123,
                    ],
                ],
                [
                    'rowId' => 'GASOHOL_9195_STATIONARY',
                    'fuelKey' => '91/95',
                    'label' => 'Gasohol 91/95',
                    'evidence' => 'Invoice',
                    'unit' => 'L',
                    'blendProfile' => 'GASOHOL_91_95',
                    'months' => [
                        'M2' => 456,
                    ],
                ],
            ],
        ];

        $resp = $this->postJson('/api/exports/scope11/xlsx', $payload, $this->apiHeaders());
        $resp->assertStatus(200);

        $file = $resp->baseResponse->getFile();
        $this->assertNotNull($file);
        $this->assertFileExists($file->getPathname());

        $reader = IOFactory::createReader('Xlsx');
        $reader->setReadDataOnly(false);
        $out = $reader->load($file->getPathname());

        $wsFr041 = $out->getSheetByName('Fr-04.1');
        $this->assertNotNull($wsFr041);

        $this->assertFormulaContains($wsFr041, 'B11', 'tblScope11Stationary');
        $this->assertFormulaContains($wsFr041, 'C11', 'tblScope11Stationary');
        $this->assertFormulaContains($wsFr041, 'D11', 'tblScope11Stationary');
        $this->assertFormulaContains($wsFr041, 'D12', 'tblScope11Stationary');
        $this->assertFormulaContains($wsFr041, 'D14', 'tblScope11Stationary');
        $this->assertFormulaContains($wsFr041, 'D15', 'tblScope11Stationary');

        $wsStationary = $out->getSheetByName('1.1 Stationary ');
        $this->assertNotNull($wsStationary);
        $this->assertFormulaContains($wsStationary, 'C9', 'tblScope11Stationary');
        $this->assertFormulaContains($wsStationary, 'E9', 'tblScope11Stationary');
    }

    private function assertFormulaContains(Worksheet $sheet, string $cell, string $needle): void
    {
        $target = $sheet->getCell($cell);
        $this->assertTrue($target->isFormula(), "Expected formula in {$sheet->getTitle()}!{$cell}");
        $value = (string) $target->getValue();
        $normalized = ltrim(trim($value), '=');
        $this->assertStringContainsString($needle, $normalized, "Unexpected formula in {$sheet->getTitle()}!{$cell}");
    }
}
