<?php

namespace Tests\Feature;

use App\Models\Cycle;
use App\Models\EfLibraryEntry;
use App\Models\EfProfile;
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
}

