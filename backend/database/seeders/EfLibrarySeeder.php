<?php

namespace Database\Seeders;

use App\Models\EfLibraryEntry;
use App\Models\EfProfile;
use Illuminate\Database\Seeder;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

class EfLibrarySeeder extends Seeder
{
    public function run(): void
    {
        if (!class_exists(IOFactory::class)) {
            $this->command?->warn('PhpSpreadsheet not installed; skipping EfLibrarySeeder.');
            return;
        }

        $this->importAr5Stationary();
        $this->importEf1Stationary();
        $this->importAr5V2Stationary();
    }

    private function importAr5Stationary(): void
    {
        $profile = EfProfile::query()->where('code', 'AR5')->first();
        if (!$profile) {
            $this->command?->warn('Missing ef profile AR5; skipping AR5 import.');
            return;
        }

        $path = $this->firstExistingPath([
            storage_path('app/templates/mbax/VSheetCFO_BASE_2025.xlsx'),
            storage_path('app/templates/mbax/VSheetCFO_BASE.xlsx'),
            base_path('../shared/templates/mbax/VSheetCFO_BASE_2025.xlsx'),
            base_path('../shared/templates/mbax/VSheetCFO_BASE.xlsx'),
            base_path('../frontend/src/assets/templates/mbax/VSheetCFO_BASE_2025.xlsx'),
            base_path('../frontend/src/assets/templates/mbax/VSheetCFO_BASE.xlsx'),
        ]);
        if (!$path) {
            $this->command?->warn('Missing template file for EF import: VSheetCFO_BASE_2025.xlsx');
            return;
        }

        $spreadsheet = IOFactory::load($path);
        $ws = $spreadsheet->getSheetByName('EF TGO AR5');
        if (!$ws) {
            $this->command?->warn('Missing sheet: EF TGO AR5');
            return;
        }

        $rows = $this->parseStationaryBlock($ws);
        foreach ($rows as $row) {
            $efId = trim((string) ($row['efId'] ?? ''));
            if ($efId === '') continue;

            EfLibraryEntry::query()->updateOrCreate(
                [
                    'ef_profile_id' => $profile->id,
                    'scope' => 'stationary',
                    'ef_id' => $efId,
                ],
                [
                    'name' => $this->strOrNull($row['Name'] ?? null),
                    'unit' => $this->strOrNull($row['Unit'] ?? null),
                    'co2' => $this->numOrNull($row['CO2'] ?? null),
                    'fossil_ch4' => $this->numOrNull($row['Fossil CH4'] ?? $row['FossilCH4'] ?? null),
                    'ch4' => $this->numOrNull($row['CH4'] ?? null),
                    'n2o' => $this->numOrNull($row['N2O'] ?? null),
                    'total' => $this->numOrNull($row['Total'] ?? null),
                    'source' => $this->strOrNull($row['Source'] ?? null),
                    'meta_json' => [
                        'seed' => [
                            'template' => basename($path),
                            'sheet' => $ws->getTitle(),
                            'parser' => 'stationary-block',
                        ],
                    ],
                ]
            );
        }
    }

    private function importAr5V2Stationary(): void
    {
        $profile = EfProfile::query()->where('code', 'AR5V2')->first();
        if (!$profile) {
            return;
        }

        $path = $this->firstExistingPath([
            storage_path('app/templates/mbax/VSheetCFO_BASE_2026.xlsx'),
            base_path('../shared/templates/mbax/VSheetCFO_BASE_2026.xlsx'),
            base_path('../frontend/src/assets/templates/mbax/VSheetCFO_BASE_2026.xlsx'),
        ]);
        if (!$path) {
            return;
        }

        $spreadsheet = IOFactory::load($path);
        $ws = $spreadsheet->getSheetByName('EF TGO AR5 V2');
        if (!$ws) {
            return;
        }

        $rows = $this->parseStationaryBlock($ws);
        foreach ($rows as $row) {
            $efId = trim((string) ($row['efId'] ?? ''));
            if ($efId === '') continue;

            EfLibraryEntry::query()->updateOrCreate(
                [
                    'ef_profile_id' => $profile->id,
                    'scope' => 'stationary',
                    'ef_id' => $efId,
                ],
                [
                    'name' => $this->strOrNull($row['Name'] ?? null),
                    'unit' => $this->strOrNull($row['Unit'] ?? null),
                    'co2' => $this->numOrNull($row['CO2'] ?? null),
                    'fossil_ch4' => $this->numOrNull($row['Fossil CH4'] ?? $row['FossilCH4'] ?? null),
                    'ch4' => $this->numOrNull($row['CH4'] ?? null),
                    'n2o' => $this->numOrNull($row['N2O'] ?? null),
                    'total' => $this->numOrNull($row['Total'] ?? null),
                    'source' => $this->strOrNull($row['Source'] ?? null),
                    'meta_json' => [
                        'seed' => [
                            'template' => basename($path),
                            'sheet' => $ws->getTitle(),
                            'parser' => 'stationary-block',
                        ],
                    ],
                ]
            );
        }
    }

    private function importEf1Stationary(): void
    {
        $profile = EfProfile::query()->where('code', 'EF1')->first();
        if (!$profile) {
            return;
        }

        $path = $this->firstExistingPath([
            storage_path('app/templates/mbax/MBAX-TGO-11102567-Demo.xlsx'),
            base_path('../shared/templates/mbax/MBAX-TGO-11102567-Demo.xlsx'),
            base_path('../frontend/src/assets/templates/mbax/MBAX-TGO-11102567-Demo.xlsx'),
        ]);
        if (!$path) {
            return;
        }

        $spreadsheet = IOFactory::load($path);
        $ws = $spreadsheet->getSheetByName('EF (1)');
        if (!$ws) {
            return;
        }

        $rows = $this->parseEfTableByHeader($ws, 'EF1');
        foreach ($rows as $row) {
            $efId = trim((string) ($row['efId'] ?? ''));
            if ($efId === '') continue;

            EfLibraryEntry::query()->updateOrCreate(
                [
                    'ef_profile_id' => $profile->id,
                    'scope' => 'stationary',
                    'ef_id' => $efId,
                ],
                [
                    'name' => $this->strOrNull($row['Name'] ?? null),
                    'unit' => $this->strOrNull($row['Unit'] ?? null),
                    'co2' => $this->numOrNull($row['CO2'] ?? null),
                    'fossil_ch4' => $this->numOrNull($row['Fossil CH4'] ?? $row['FossilCH4'] ?? null),
                    'ch4' => $this->numOrNull($row['CH4'] ?? null),
                    'n2o' => $this->numOrNull($row['N2O'] ?? null),
                    'total' => $this->numOrNull($row['Total'] ?? null),
                    'source' => $this->strOrNull($row['Source'] ?? null),
                    'meta_json' => [
                        'seed' => [
                            'template' => basename($path),
                            'sheet' => $ws->getTitle(),
                            'parser' => 'header-scan',
                        ],
                    ],
                ]
            );
        }
    }

    /**
     * Parse Stationary Combustion EF block without Excel Tables.
     * Looks for "Stationary Combustion" section, then header row with CO2/N2O, then reads rows until next section.
     */
    private function parseStationaryBlock(Worksheet $ws): array
    {
        $grid = $ws->toArray(null, true, true, true);

        $startRow = null;
        foreach ($grid as $rNum => $row) {
            $joined = '';
            foreach ($row as $cell) $joined .= ' ' . $this->norm((string) $cell);
            if (str_contains($joined, 'stationary combustion')) {
                $startRow = (int) $rNum;
                break;
            }
        }
        if (!$startRow) return [];

        $hdrRow = null;
        // some templates have the CO2/CH4/N2O header above the "Stationary Combustion" row
        for ($r = $startRow; $r >= max(1, $startRow - 80); $r--) {
            if (!isset($grid[$r])) continue;
            $hasCo2 = false;
            $hasN2o = false;
            foreach ($grid[$r] as $cell) {
                $h = $this->norm((string) $cell);
                if ($h === 'co2') $hasCo2 = true;
                if ($h === 'n2o') $hasN2o = true;
            }
            if ($hasCo2 && $hasN2o) {
                $hdrRow = $r;
                break;
            }
        }
        if (!$hdrRow) {
            for ($r = $startRow; $r < $startRow + 80; $r++) {
                if (!isset($grid[$r])) continue;
                $hasCo2 = false;
                $hasN2o = false;
                foreach ($grid[$r] as $cell) {
                    $h = $this->norm((string) $cell);
                    if ($h === 'co2') $hasCo2 = true;
                    if ($h === 'n2o') $hasN2o = true;
                }
                if ($hasCo2 && $hasN2o) {
                    $hdrRow = $r;
                    break;
                }
            }
        }
        if (!$hdrRow) return [];

        $cols = [
            'Name' => null,
            'Unit' => null,
            'CO2' => null,
            'Fossil CH4' => null,
            'CH4' => null,
            'N2O' => null,
            'Total' => null,
            'Source' => null,
        ];

        foreach (($grid[$hdrRow] ?? []) as $col => $cell) {
            $h = $this->norm((string) $cell);
            if ($h === 'co2') $cols['CO2'] = $col;
            if (str_contains($h, 'fossil') && str_contains($h, 'ch4')) $cols['Fossil CH4'] = $col;
            if ($h === 'ch4') $cols['CH4'] = $col;
            if ($h === 'n2o') $cols['N2O'] = $col;
            if (str_contains($h, 'total')) $cols['Total'] = $col;
            if (str_contains($h, 'source') || str_contains($h, 'ที่มา')) $cols['Source'] = $col;
        }

        $topHdr = $grid[$hdrRow - 1] ?? [];
        foreach ($topHdr as $col => $cell) {
            $h = $this->norm((string) $cell);
            if ($h === 'name' || $h === 'ชื่อ') $cols['Name'] = $col;
            if ($h === 'unit' || $h === 'units' || $h === 'หน่วย') $cols['Unit'] = $col;
        }

        if (!$cols['Name'] && $cols['Unit']) {
            $letters = array_keys($grid[$hdrRow] ?? []);
            $idx = array_search($cols['Unit'], $letters, true);
            if ($idx !== false && $idx > 0) $cols['Name'] = $letters[$idx - 1];
        }
        $cols['Name'] = $cols['Name'] ?: 'A';
        $cols['Unit'] = $cols['Unit'] ?: 'B';

        $out = [];
        $blankStreak = 0;
        $stopWords = ['mobile combustion', 'electricity', 'refrigerants'];

        $dataStartRow = max($hdrRow + 1, $startRow + 1);
        for ($r = $dataStartRow; $r < $dataStartRow + 400; $r++) {
            if (!isset($grid[$r])) break;
            $row = $grid[$r];

            $joined = '';
            foreach ($row as $cell) $joined .= ' ' . $this->norm((string) $cell);
            foreach ($stopWords as $w) {
                if (str_contains($joined, $w)) {
                    break 2;
                }
            }

            $name = (string) ($row[$cols['Name']] ?? '');
            $unit = (string) ($row[$cols['Unit']] ?? '');
            $nameN = $this->norm($name);

            if ($nameN === '' || $nameN === '-') {
                $blankStreak++;
                if ($blankStreak >= 8) break;
                continue;
            }
            $blankStreak = 0;

            if (str_contains($nameN, 'stationary combustion')) continue;

            $out[] = [
                'efId' => $this->efIdForStationary($name, $unit),
                'Name' => $name,
                'Unit' => $unit,
                'CO2' => $cols['CO2'] ? ($row[$cols['CO2']] ?? null) : null,
                'Fossil CH4' => $cols['Fossil CH4'] ? ($row[$cols['Fossil CH4']] ?? null) : null,
                'CH4' => $cols['CH4'] ? ($row[$cols['CH4']] ?? null) : null,
                'N2O' => $cols['N2O'] ? ($row[$cols['N2O']] ?? null) : null,
                'Total' => $cols['Total'] ? ($row[$cols['Total']] ?? null) : null,
                'Source' => $cols['Source'] ? ($row[$cols['Source']] ?? null) : null,
            ];
        }

        return $out;
    }

    private function parseEfTableByHeader(Worksheet $ws, string $catalogKey): array
    {
        $columns = $this->scanEfHeaderColumns($ws);
        $headerRow = (int) ($columns['_headerRow'] ?? 0);
        unset($columns['_headerRow']);

        if (!$headerRow || !$columns) {
            return [];
        }

        $colEfId = $columns['efId']['letter'] ?? null;
        if (!$colEfId) {
            return [];
        }

        $out = [];
        $blankStreak = 0;
        for ($r = $headerRow + 1; $r <= $headerRow + 800; $r++) {
            $efId = trim((string) $ws->getCell($colEfId . $r)->getValue());
            if ($efId === '') {
                $blankStreak += 1;
                if ($blankStreak >= 30) break;
                continue;
            }
            $blankStreak = 0;

            $row = [
                'efCatalog' => $catalogKey,
                'efId' => $efId,
            ];
            foreach ($columns as $key => $col) {
                if (!is_array($col) || !isset($col['letter'])) continue;
                if ($key === 'efId') continue;
                $letter = $col['letter'];
                $row[$key] = $ws->getCell($letter . $r)->getCalculatedValue();
            }

            if (array_key_exists('Fossil CH4', $row) && !array_key_exists('FossilCH4', $row)) {
                $row['FossilCH4'] = $row['Fossil CH4'];
            }

            $out[] = $row;
        }

        return $out;
    }

    private function scanEfHeaderColumns(Worksheet $ws): array
    {
        $maxCols = \PhpOffice\PhpSpreadsheet\Cell\Coordinate::columnIndexFromString($ws->getHighestColumn() ?: 'A');
        $maxCols = min(60, $maxCols);
        $maxRows = min(250, $ws->getHighestRow());

        $grid = $ws->rangeToArray(
            'A1:' . \PhpOffice\PhpSpreadsheet\Cell\Coordinate::stringFromColumnIndex($maxCols) . $maxRows,
            null,
            true,
            true,
            true
        );

        $headerRow = 0;
        for ($r = 1; $r <= $maxRows; $r++) {
            $row = $grid[$r] ?? [];
            $joined = strtolower(trim(implode(' ', array_map('strval', $row))));
            if (str_contains($joined, 'efid') || str_contains($joined, 'ef id')) {
                $headerRow = $r;
                break;
            }
        }
        if (!$headerRow) return [];

        $header = $grid[$headerRow] ?? [];
        $cols = ['_headerRow' => $headerRow];
        foreach ($header as $letter => $value) {
            $h = strtolower(trim((string) $value));
            if ($h === 'efid' || $h === 'ef id' || $h === 'id') $cols['efId'] = ['letter' => $letter];
            if ($h === 'name') $cols['Name'] = ['letter' => $letter];
            if ($h === 'unit') $cols['Unit'] = ['letter' => $letter];
            if ($h === 'co2') $cols['CO2'] = ['letter' => $letter];
            if ($h === 'ch4') $cols['CH4'] = ['letter' => $letter];
            if ($h === 'n2o') $cols['N2O'] = ['letter' => $letter];
            if (str_contains($h, 'fossil') && str_contains($h, 'ch4')) $cols['Fossil CH4'] = ['letter' => $letter];
            if (str_contains($h, 'total')) $cols['Total'] = ['letter' => $letter];
            if (str_contains($h, 'source')) $cols['Source'] = ['letter' => $letter];
        }
        return $cols;
    }

    private function norm(string $s): string
    {
        $s = strtolower(trim($s));
        $s = preg_replace('/\s+/', ' ', $s);
        return $s ?? '';
    }

    private function slug(string $s): string
    {
        $s = strtolower(trim($s));
        $s = preg_replace('/[^a-z0-9]+/', '_', $s);
        $s = trim($s, '_');
        return $s ?: 'x';
    }

    private function efIdForStationary(string $name, string $unit): string
    {
        $n = $this->norm($name);
        $u = $this->norm($unit);
        $isL = str_starts_with($u, 'lit');

        if (str_contains($n, 'gas/diesel') && $isL) return 'SC_GAS_DIESEL_OIL_L';
        if (str_contains($n, 'motor gasoline') && $isL) return 'SC_MOTOR_GASOLINE_L';
        if ($n === 'lpg' && $isL) return 'SC_LPG_L';

        $unitKey = $isL ? 'L' : (str_contains($u, 'kg') ? 'KG' : strtoupper($this->slug($u)));
        return 'SC_' . strtoupper($this->slug($name)) . '_' . $unitKey;
    }

    private function numOrNull($value): ?float
    {
        if ($value === null) return null;
        if (is_string($value) && trim($value) === '') return null;
        if (!is_numeric($value)) return null;
        $n = (float) $value;
        return is_finite($n) ? $n : null;
    }

    private function strOrNull($value): ?string
    {
        if ($value === null) return null;
        $s = trim((string) $value);
        return $s === '' ? null : $s;
    }

    /**
     * @param array<int, string> $candidates
     */
    private function firstExistingPath(array $candidates): ?string
    {
        foreach ($candidates as $path) {
            $path = trim((string) $path);
            if ($path !== '' && is_file($path)) {
                return $path;
            }
        }
        return null;
    }
}
