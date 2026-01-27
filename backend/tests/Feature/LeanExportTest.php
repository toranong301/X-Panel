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

class LeanExportTest extends TestCase
{
    use RefreshDatabase;

    private function apiHeaders(): array
    {
        return ['X-API-KEY' => env('API_KEY', 'devkey')];
    }

    public function test_lean_export_produces_ef_view_and_fr041(): void
    {
        $this->prepareMbaxTemplate();

        $ar5 = EfProfile::query()->create(['code' => 'AR5', 'label' => 'TGO AR5']);
        EfProfile::query()->create(['code' => 'EF1', 'label' => 'EF (1)']);
        EfLibraryEntry::query()->create([
            'ef_profile_id' => $ar5->id,
            'scope' => 'stationary',
            'ef_id' => 'AR5_DIESEL',
            'name' => 'Diesel',
            'unit' => 'L',
            'total' => 2.7,
            'source' => 'test',
        ]);

        $cycle = Cycle::query()->create([
            'year' => 2025,
            'name' => 'Lean Cycle',
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
                ],
            ],
        ]);

        $resp = $this->postJson(
            "/api/cycles/{$cycle->id}/export?mode=lean",
            [],
            $this->apiHeaders()
        );

        $resp->assertStatus(200);
        $resp->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        $file = $resp->baseResponse->getFile();
        $this->assertNotNull($file);
        $reader = IOFactory::createReader('Xlsx');
        $reader->setReadDataOnly(false);
        $workbook = $reader->load($file->getPathname());

        $efSheet = $workbook->getSheetByName('EF_VIEW');
        $this->assertNotNull($efSheet);
        $this->assertGreaterThan(1, $efSheet->getHighestRow());

        $frSheet = $workbook->getSheetByName('Fr-04.1');
        $this->assertNotNull($frSheet);
        $this->assertGreaterThan(1, $frSheet->getHighestRow());

        $formulas = [];
        foreach ($frSheet->getCellCollection()->getCoordinates() as $coord) {
            $cell = $frSheet->getCell($coord);
            if ($cell->isFormula()) {
                $formula = strtoupper((string) $cell->getValue());
                if (str_contains($formula, 'EF_VIEW')) {
                    $formulas[] = $formula;
                }
            }
        }
        $this->assertNotEmpty($formulas, 'Expected at least one EF_VIEW formula in Fr-04.1');
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
}
