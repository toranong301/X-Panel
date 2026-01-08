<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

class EfCatalogController extends Controller
{
    public function index(Request $request)
    {
        $templateKey = (string) ($request->query('templateKey') ?? 'mbax');
        $catalog = strtoupper((string) ($request->query('catalog') ?? 'AR5'));
        $scope = strtolower((string) ($request->query('scope') ?? 'stationary'));

        $path = storage_path("app/templates/{$templateKey}/VSheetCFO_BASE.xlsx");
        if (!file_exists($path)) {
            return response()->json(['ok' => false, 'message' => "Template not found: {$path}"], 404);
        }

        $spreadsheet = IOFactory::load($path);
        if ($catalog === 'AR5') {
            return $this->loadAr5($spreadsheet, $scope);
        }

        if ($catalog === 'OTHER') {
            return $this->loadOther($spreadsheet);
        }

        return response()->json([
            'ok' => true,
            'catalog' => $catalog,
            'options' => [],
            'warning' => 'Unknown catalog requested.',
        ]);
    }

    private function loadAr5($spreadsheet, string $scope)
    {
        $ws = $spreadsheet->getSheetByName('EF TGO AR5');
        if (!$ws) {
            return response()->json([
                'ok' => true,
                'catalog' => 'AR5',
                'options' => [],
                'warning' => 'Missing sheet: EF TGO AR5',
            ]);
        }

        $tableName = $scope === 'stationary' ? 'T_EF_AR5_SC' : 'T_EF_AR5';
        $table = $this->findTable($ws, $tableName);
        if ($table) {
            $options = $this->parseTable($ws, $table->getRange(), 'AR5');
            return response()->json([
                'ok' => true,
                'catalog' => 'AR5',
                'source' => 'table',
                'options' => $options,
            ]);
        }

        $names = [];
        foreach ($ws->getTableCollection() as $tbl) {
            $names[] = method_exists($tbl, 'getName') ? $tbl->getName() : '(unknown)';
        }

        if ($scope === 'stationary' && count($names) === 0) {
            $options = $this->parseAr5Stationary($ws);
            return response()->json([
                'ok' => true,
                'catalog' => 'AR5',
                'source' => 'fallback-range',
                'options' => $options,
                'warning' => 'No Excel tables found on EF TGO AR5; using fallback parsing.',
            ]);
        }

        return response()->json([
            'ok' => true,
            'catalog' => 'AR5',
            'options' => [],
            'warning' => "Missing table: {$tableName}",
            'availableTables' => $names,
        ]);
    }

    private function loadOther($spreadsheet)
    {
        $sheetNames = ['EF (1)', 'EF other', 'EF Other'];
        $ws = null;
        foreach ($sheetNames as $name) {
            $ws = $spreadsheet->getSheetByName($name);
            if ($ws) break;
        }

        if (!$ws) {
            return response()->json([
                'ok' => true,
                'catalog' => 'OTHER',
                'options' => [],
                'warning' => 'Missing sheet: EF (1) or EF other',
            ]);
        }

        $table = $this->firstTable($ws);
        if ($table) {
            $options = $this->parseTable($ws, $table->getRange(), 'OTHER');
            return response()->json([
                'ok' => true,
                'catalog' => 'OTHER',
                'source' => 'table',
                'options' => $options,
            ]);
        }

        return response()->json([
            'ok' => true,
            'catalog' => 'OTHER',
            'options' => [],
            'warning' => 'No Excel tables found on EF (1)/EF other.',
        ]);
    }

    private function findTable(Worksheet $ws, string $tableName)
    {
        foreach ($ws->getTableCollection() as $tbl) {
            if (method_exists($tbl, 'getName') && $tbl->getName() === $tableName) {
                return $tbl;
            }
        }
        return null;
    }

    private function firstTable(Worksheet $ws)
    {
        foreach ($ws->getTableCollection() as $tbl) {
            return $tbl;
        }
        return null;
    }

    private function parseTable(Worksheet $ws, string $range, string $catalog): array
    {
        $data = $ws->rangeToArray($range, null, true, true, true);
        $rows = array_values($data);
        if (count($rows) < 2) return [];

        $header = array_map(fn ($v) => trim((string) $v), array_values($rows[0]));
        $mappedHeader = array_map(fn ($v) => $this->normalizeHeader($v), $header);

        $options = [];
        for ($i = 1; $i < count($rows); $i++) {
            $row = array_values($rows[$i]);
            $obj = ['efCatalog' => $catalog];
            for ($j = 0; $j < count($mappedHeader); $j++) {
                $key = $mappedHeader[$j] !== '' ? $mappedHeader[$j] : "col{$j}";
                $obj[$key] = $row[$j] ?? null;
            }
            if (!isset($obj['efId']) || trim((string) $obj['efId']) === '') {
                continue;
            }
            $options[] = $obj;
        }

        return $options;
    }

    private function normalizeHeader(string $header): string
    {
        $raw = trim($header);
        $norm = strtolower($raw);
        $norm = preg_replace('/\s+/', ' ', $norm);

        if (preg_match('/^ef\s*id$/i', $raw)) return 'efId';
        if (preg_match('/^efid$/i', $raw)) return 'efId';
        if ($norm === 'name' || $norm === 'ชื่อ') return 'Name';
        if ($norm === 'unit' || $norm === 'units' || $norm === 'หน่วย') return 'Unit';
        if ($norm === 'co2') return 'CO2';
        if ($norm === 'ch4') return 'CH4';
        if (str_contains($norm, 'fossil') && str_contains($norm, 'ch4')) return 'Fossil CH4';
        if ($norm === 'n2o') return 'N2O';
        if (str_contains($norm, 'total')) return 'Total';
        if (str_contains($norm, 'source') || str_contains($norm, 'ที่มา')) return 'Source';

        return $raw;
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

    private function parseAr5Stationary(Worksheet $ws): array
    {
        $max = $ws->getHighestRow();
        $start = null;
        for ($r = 1; $r <= $max; $r++) {
            $a = (string) $ws->getCell("A{$r}")->getValue();
            if (stripos($a, 'Stationary Combustion') !== false) {
                $start = $r + 1;
                break;
            }
        }
        if (!$start) return [];

        $out = [];
        $blank = 0;
        $stopWords = ['mobile combustion', 'electricity', 'refrigerants'];

        for ($r = $start; $r <= min($start + 300, $max); $r++) {
            $a = (string) $ws->getCell("A{$r}")->getValue();
            $aNorm = $this->norm($a);
            foreach ($stopWords as $w) {
                if (str_contains($aNorm, $w)) {
                    break 2;
                }
            }

            $name = (string) $ws->getCell("B{$r}")->getValue();
            $unit = (string) $ws->getCell("C{$r}")->getValue();
            if ($this->norm($name) === '' && $this->norm($a) !== '') {
                $name = (string) $ws->getCell("A{$r}")->getValue();
                $unit = (string) $ws->getCell("B{$r}")->getValue();
            }

            if ($this->norm($name) === '') {
                $blank++;
                if ($blank >= 10) break;
                continue;
            }
            $blank = 0;

            $out[] = [
                'efCatalog' => 'AR5',
                'efId' => $this->efIdForStationary($name, $unit),
                'Name' => $name,
                'Unit' => $unit,
                'CO2' => $ws->getCell("D{$r}")->getCalculatedValue(),
                'Fossil CH4' => $ws->getCell("E{$r}")->getCalculatedValue(),
                'CH4' => $ws->getCell("F{$r}")->getCalculatedValue(),
                'N2O' => $ws->getCell("G{$r}")->getCalculatedValue(),
                'Total' => $ws->getCell("H{$r}")->getCalculatedValue(),
                'Source' => $ws->getCell("I{$r}")->getValue(),
            ];
        }

        return $out;
    }

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
        for ($r = $startRow; $r < $startRow + 80; $r++) {
            if (!isset($grid[$r])) continue;
            $joined = '';
            foreach ($grid[$r] as $cell) $joined .= ' ' . $this->norm((string) $cell);
            if (str_contains($joined, 'co2') && str_contains($joined, 'n2o')) {
                $hdrRow = $r;
                break;
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
            if ($h === 'unit' || $h === 'units') $cols['Unit'] = $col;
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

        for ($r = $hdrRow + 1; $r < $hdrRow + 400; $r++) {
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
                'efCatalog' => 'AR5',
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
}
