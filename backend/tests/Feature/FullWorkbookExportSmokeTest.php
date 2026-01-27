<?php

namespace Tests\Feature;

use App\Models\Cycle;
use App\Models\EfLibraryEntry;
use App\Models\EfProfile;
use App\Models\Fr041Config;
use App\Models\Scope11StationaryItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PhpOffice\PhpSpreadsheet\IOFactory;
use Tests\TestCase;

class FullWorkbookExportSmokeTest extends TestCase
{
    use RefreshDatabase;

    private function apiHeaders(): array
    {
        return ['X-API-KEY' => env('API_KEY', 'devkey')];
    }

    public function test_export_generates_single_xlsx_with_expected_sheets_and_values(): void
    {
        $tpl = base_path('../shared/templates/mbax/MBAX-TGO-11102567-Demo.xlsx');
        if (!is_file($tpl)) {
            $this->markTestSkipped('MBAX template missing: ' . $tpl);
        }

        putenv('MBAX_TEMPLATE_PATH=' . $tpl);
        $_ENV['MBAX_TEMPLATE_PATH'] = $tpl;
        $_SERVER['MBAX_TEMPLATE_PATH'] = $tpl;

        $ar5 = EfProfile::query()->create(['code' => 'AR5', 'label' => 'TGO AR5']);
        EfProfile::query()->create(['code' => 'EF1', 'label' => 'EF (1)']);
        EfLibraryEntry::query()->create([
            'ef_profile_id' => $ar5->id,
            'scope' => 'stationary',
            'ef_id' => 'SC_GAS_DIESEL_OIL_L',
            'name' => 'Diesel',
            'unit' => 'L',
            'total' => 2.7,
            'source' => 'test',
        ]);

        $cycle = Cycle::query()->create([
            'year' => 2025,
            'name' => 'Test Cycle',
            'template_id' => 'mbax',
            'data_json' => [
                'fr01' => [
                    'orgName' => 'ACME Co',
                    'preparedBy' => 'Tester',
                    'preparedDate' => '2025-01-01',
                    'dataPeriod' => ['start' => '2025-01-01', 'end' => '2025-12-31'],
                    'baseYearPeriod' => ['start' => '2024-01-01', 'end' => '2024-12-31'],
                    'production' => ['value' => 123, 'unit' => 't'],
                    'baseYearProduction' => ['value' => 111],
                    'orgInfoLines' => ['Line 1'],
                    'contactAddress' => 'Somewhere',
                    'registrationDate' => '2020-01-01',
                ],
                'inventory' => [
                    [
                        'id' => 'S3:3.1:item_a',
                        'scope' => 3,
                        'subScope' => '3.1',
                        'tgoNo' => 'Scope 3.1',
                        'isoScope' => 'Scope 4.1 in ISO 14064-1',
                        'categoryLabel' => 'Purchased Goods & Services',
                        'itemLabel' => 'Item A',
                        'unit' => 'kg',
                        'quantityPerYear' => 1000,
                        'remark' => 'note',
                        'dataEvidence' => 'invoice',
                        'ef' => 1.5,
                        'efEvidence' => 'source',
                    ],
                ],
                'fr03_2' => [
                    [
                        'key' => '3.1|Item A',
                        'subScope' => '3.1',
                        'isoNo' => '4.1',
                        'categoryLabel' => 'Purchased Goods & Services',
                        'itemLabel' => 'Item A',
                        'ghgTco2e' => 1.5,
                        'sharePct' => 100,
                        'assessment' => 'มีนัยสำคัญ',
                        'selection' => 'เลือกประเมิน',
                    ],
                ],
            ],
        ]);

        Scope11StationaryItem::query()->create([
            'cycle_id' => $cycle->id,
            'row_id' => 'DIESEL_B7_STATIONARY',
            'item_label' => 'Diesel B7',
            'evidence' => 'Invoice',
            'unit' => 'L',
            'fuel_key' => 'B7',
            'months_json' => ['M1' => 123],
            'total' => 123,
        ]);

        $resp = $this->postJson(
            "/api/cycles/{$cycle->id}/export",
            ['templateId' => 'MBAX_TGO_11102567'],
            $this->apiHeaders()
        );

        file_put_contents('php://stderr', $resp->getContent());


        $resp->assertStatus(200);
        $resp->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        $file = $resp->baseResponse->getFile();
        $this->assertNotNull($file);
        $this->assertFileExists($file->getPathname());

        $reader = IOFactory::createReader('Xlsx');
        $reader->setReadDataOnly(false);
        $out = $reader->load($file->getPathname());

        $this->assertNotNull($out->getSheetByName('_DATA_SCOPE11'));
        $this->assertNotNull($out->getSheetByName('Screen scope 3'));
        $this->assertNotNull($out->getSheetByName('Fr-03.2'));
        $this->assertNotNull($out->getSheetByName('Fr-04.1'));

        $wsScreen = $out->getSheetByName('Screen scope 3');
        $this->assertSame('Item A', $wsScreen->getCell('C3')->getValue());
        $this->assertSame('kg', $wsScreen->getCell('D3')->getValue());
        $this->assertSame(1000.0, (float) $wsScreen->getCell('E3')->getValue());
        $this->assertSame(1.5, (float) $wsScreen->getCell('H3')->getValue());

        $wsFr032 = $out->getSheetByName('Fr-03.2');
        $this->assertSame('มีนัยสำคัญ', $wsFr032->getCell('K22')->getValue());
        $this->assertSame('เลือกประเมิน', $wsFr032->getCell('L22')->getValue());

        $wsFr041 = $out->getSheetByName('Fr-04.1');
        $this->assertSame('Item A', $wsFr041->getCell('B51')->getValue());
        $this->assertSame('kg', $wsFr041->getCell('C51')->getValue());
        $this->assertSame(1000.0, (float) $wsFr041->getCell('D51')->getValue());

        $wsFr01 = $out->getSheetByName('Fr-01');
        $this->assertSame('ACME Co', $wsFr01->getCell('B6')->getValue());
    }

    public function test_export_with_selections_v2_2025_ar5_ef1(): void
    {
        $this->prepareMbaxTemplate();

        $cycle = Cycle::query()->create([
            'year' => 2025,
            'name' => 'Selection cycle 2025',
            'template_id' => 'mbax',
            'data_json' => [],
        ]);

        Scope11StationaryItem::query()->create([
            'cycle_id' => $cycle->id,
            'row_id' => 'ROW_B7',
            'item_label' => 'Diesel B7',
            'unit' => 'L',
            'fuel_key' => 'B7',
            'months_json' => ['M1' => 100],
            'total' => 100,
        ]);

        Fr041Config::query()->create([
            'cycle_id' => $cycle->id,
            'sheet_id' => 'fr041',
            'section' => 'scope1_stationary',
            'selected_row_ids' => ['ROW_B7'],
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
                    [
                        'lineId' => 'ROW_B7::BIODIESEL_KG',
                        'parentRowId' => 'ROW_B7',
                        'component' => 'BIODIESEL_KG',
                        'include' => true,
                        'efCatalog' => 'EF1',
                        'efId' => 'EF1_BIODIESEL',
                    ],
                ],
            ],
        ]);

        $resp = $this->postJson(
            "/api/cycles/{$cycle->id}/export",
            ['templateId' => 'MBAX_TGO_11102567'],
            $this->apiHeaders()
        );

        file_put_contents('php://stderr', $resp->getContent());

        $resp->assertStatus(200);
        $resp->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        $file = $resp->baseResponse->getFile();
        $this->assertNotNull($file);
        $this->assertFileExists($file->getPathname());

        $reader = IOFactory::createReader('Xlsx');
        $reader->setReadDataOnly(false);
        $out = $reader->load($file->getPathname());
        $selectionSheet = $out->getSheetByName('_FR041_SEL');
        $this->assertNotNull($selectionSheet);

        $headerMap = $this->selectionHeaderMap($selectionSheet);
        $this->assertSelectionRowEf($selectionSheet, $headerMap, 'ROW_B7::DIESEL_L', 'AR5', 'AR5_DIESEL');
        $this->assertSelectionRowEf($selectionSheet, $headerMap, 'ROW_B7::BIODIESEL_KG', 'EF1', 'EF1_BIODIESEL');
    }

    public function test_export_with_selections_v2_2026_ar5v2_ef1(): void
    {
        $this->prepareMbaxTemplate();

        $cycle = Cycle::query()->create([
            'year' => 2026,
            'name' => 'Selection cycle 2026',
            'template_id' => 'mbax',
            'data_json' => [],
        ]);

        Scope11StationaryItem::query()->create([
            'cycle_id' => $cycle->id,
            'row_id' => 'ROW_B7',
            'item_label' => 'Diesel B7',
            'unit' => 'L',
            'fuel_key' => 'B7',
            'months_json' => ['M1' => 200],
            'total' => 200,
        ]);

        Fr041Config::query()->create([
            'cycle_id' => $cycle->id,
            'sheet_id' => 'fr041',
            'section' => 'scope1_stationary',
            'selected_row_ids' => ['ROW_B7'],
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
                    [
                        'lineId' => 'ROW_B7::BIODIESEL_KG',
                        'parentRowId' => 'ROW_B7',
                        'component' => 'BIODIESEL_KG',
                        'include' => true,
                        'efCatalog' => 'EF1',
                        'efId' => 'EF1_BIODIESEL',
                    ],
                ],
            ],
        ]);

        $resp = $this->postJson(
            "/api/cycles/{$cycle->id}/export",
            ['templateId' => 'MBAX_TGO_11102567'],
            $this->apiHeaders()
        );

        $resp->assertStatus(200);
        $resp->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        $file = $resp->baseResponse->getFile();
        $this->assertNotNull($file);
        $this->assertFileExists($file->getPathname());

        $reader = IOFactory::createReader('Xlsx');
        $reader->setReadDataOnly(false);
        $out = $reader->load($file->getPathname());
        $selectionSheet = $out->getSheetByName('_FR041_SEL');
        $this->assertNotNull($selectionSheet);

        $headerMap = $this->selectionHeaderMap($selectionSheet);
        $this->assertSelectionRowEf($selectionSheet, $headerMap, 'ROW_B7::DIESEL_L', 'AR5V2', 'AR5V2_DIESEL');
        $this->assertSelectionRowEf($selectionSheet, $headerMap, 'ROW_B7::BIODIESEL_KG', 'EF1', 'EF1_BIODIESEL');
    }

    public function test_export_component_lines_and_tonco2e_formula(): void
    {
        $this->prepareMbaxTemplate();

        $cycle = Cycle::query()->create([
            'year' => 2025,
            'name' => 'Selection formula cycle',
            'template_id' => 'mbax',
            'data_json' => [],
        ]);

        Scope11StationaryItem::query()->create([
            'cycle_id' => $cycle->id,
            'row_id' => 'ROW_B7',
            'item_label' => 'Diesel B7',
            'unit' => 'L',
            'fuel_key' => 'B7',
            'months_json' => ['M1' => 100],
            'total' => 100,
        ]);

        Fr041Config::query()->create([
            'cycle_id' => $cycle->id,
            'sheet_id' => 'fr041',
            'section' => 'scope1_stationary',
            'selected_row_ids' => ['ROW_B7'],
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
                    [
                        'lineId' => 'ROW_B7::BIODIESEL_KG',
                        'parentRowId' => 'ROW_B7',
                        'component' => 'BIODIESEL_KG',
                        'include' => true,
                        'efCatalog' => 'EF1',
                        'efId' => 'EF1_BIODIESEL',
                    ],
                ],
            ],
        ]);

        $resp = $this->postJson(
            "/api/cycles/{$cycle->id}/export",
            ['templateId' => 'MBAX_TGO_11102567'],
            $this->apiHeaders()
        );

        $resp->assertStatus(200);
        $file = $resp->baseResponse->getFile();
        $this->assertNotNull($file);
        $this->assertFileExists($file->getPathname());

        $reader = IOFactory::createReader('Xlsx');
        $reader->setReadDataOnly(false);
        $out = $reader->load($file->getPathname());

        $selectionSheet = $out->getSheetByName('_FR041_SEL');
        $this->assertNotNull($selectionSheet);
        $headerMap = $this->selectionHeaderMap($selectionSheet);
        $this->assertNotNull($this->findSelectionRow($selectionSheet, $headerMap, 'ROW_B7::DIESEL_L'));
        $this->assertNotNull($this->findSelectionRow($selectionSheet, $headerMap, 'ROW_B7::BIODIESEL_KG'));

        $fr041 = $out->getSheetByName('Fr-04.1');
        $this->assertNotNull($fr041);
        $totalFormula = (string) $fr041->getCell('Q11')->getValue();
        $this->assertStringContainsString('EF_VIEW', strtoupper($totalFormula));
        $tonFormula = (string) $fr041->getCell('AO11')->getValue();
        $this->assertStringContainsString('D11', strtoupper($tonFormula));
        $this->assertStringContainsString('Q11', strtoupper($tonFormula));
    }

    private function prepareMbaxTemplate(): void
    {
        $tpl = base_path('../shared/templates/mbax/MBAX-TGO-11102567-Demo.xlsx');
        if (!is_file($tpl)) {
            $this->markTestSkipped('MBAX template missing: ' . $tpl);
        }
        putenv('MBAX_TEMPLATE_PATH=' . $tpl);
        $_ENV['MBAX_TEMPLATE_PATH'] = $tpl;
        $_SERVER['MBAX_TEMPLATE_PATH'] = $tpl;
    }

    private function selectionHeaderMap($sheet): array
    {
        $map = [];
        $highestCol = $sheet->getHighestColumn() ?? 'A';
        $limit = Coordinate::columnIndexFromString($highestCol);
        for ($col = 1; $col <= $limit; $col++) {
            $letter = Coordinate::stringFromColumnIndex($col);
            $value = $sheet->getCell($letter . '1')->getValue();
            if ($value === null || $value === '') {
                continue;
            }
            $map[strtoupper(trim((string) $value))] = $letter;
        }
        return $map;
    }

    private function findSelectionRow($sheet, array $headerMap, string $rowId): ?int
    {
        $rowIdCol = $headerMap['ROWID'] ?? null;
        if (!$rowIdCol) {
            return null;
        }

        $highestRow = $sheet->getHighestRow();
        for ($row = 2; $row <= $highestRow; $row++) {
            $value = $sheet->getCell($rowIdCol . $row)->getValue();
            if ((string) $value === $rowId) {
                return $row;
            }
        }
        return null;
    }

    private function assertSelectionRowEf($sheet, array $headerMap, string $rowId, string $catalog, string $efId): void
    {
        $row = $this->findSelectionRow($sheet, $headerMap, $rowId);
        $this->assertNotNull($row, "Expected selection row {$rowId} to exist.");

        $catalogCol = $headerMap['EFCATALOG'] ?? null;
        $this->assertNotNull($catalogCol, 'Missing EFCATALOG column in selection sheet.');
        $this->assertSame($catalog, (string) $sheet->getCell($catalogCol . $row)->getValue());

        $efIdCol = $headerMap['EFID'] ?? null;
        $this->assertNotNull($efIdCol, 'Missing EFID column in selection sheet.');
        $this->assertSame($efId, (string) $sheet->getCell($efIdCol . $row)->getValue());
    }
}
