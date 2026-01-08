<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use PhpOffice\PhpSpreadsheet\IOFactory;

class EfAr5Controller extends Controller
{
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

    /**
     * Parse Stationary Combustion EF block without Excel Tables.
     * Looks for "Stationary Combustion" section, then header row with CO2/N2O, then reads rows until next section.
     */
    private function parseStationaryBlock(\PhpOffice\PhpSpreadsheet\Worksheet\Worksheet $ws): array
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

    public function index(Request $request)
    {
        $templateKey = (string) ($request->query('templateKey') ?? 'mbax');
        $section = strtolower((string) ($request->query('section') ?? 'stationary'));

        $path = storage_path("app/templates/{$templateKey}/VSheetCFO_BASE.xlsx");
        if (!file_exists($path)) {
            return response()->json(['ok' => false, 'message' => "Template not found: {$path}"], 404);
        }

        $spreadsheet = IOFactory::load($path);
        $ws = $spreadsheet->getSheetByName('EF TGO AR5');
        if (!$ws) {
            return response()->json(['ok' => false, 'message' => 'Missing sheet: EF TGO AR5'], 422);
        }

        $tableName = $section === 'stationary' ? 'T_EF_AR5_SC' : 'T_EF_AR5';
        $table = null;
        foreach ($ws->getTableCollection() as $tbl) {
            if (method_exists($tbl, 'getName') && $tbl->getName() === $tableName) {
                $table = $tbl;
                break;
            }
        }

        if (!$table) {
            $names = [];
            foreach ($ws->getTableCollection() as $tbl) {
                $names[] = method_exists($tbl, 'getName') ? $tbl->getName() : '(unknown)';
            }

            if ($section === 'stationary' && count($names) === 0) {
                $opts = $this->parseStationaryBlock($ws);
                return response()->json([
                    'ok' => true,
                    'source' => 'fallback-range',
                    'options' => $opts,
                    'warning' => 'No Excel tables found on EF TGO AR5; using fallback parsing. Create T_EF_AR5_SC later to remove this warning.',
                ]);
            }

            return response()->json([
                'ok' => false,
                'message' => "Missing table: {$tableName} (create an Excel Table on EF TGO AR5 for this section)",
                'availableTables' => $names,
            ], 422);
        }

        $range = $table->getRange();
        $data = $ws->rangeToArray($range, null, true, true, true);
        $rows = array_values($data);
        if (count($rows) < 2) {
            return response()->json(['ok' => true, 'options' => []]);
        }

        $header = array_map(fn ($v) => trim((string) $v), array_values($rows[0]));
        $options = [];
        for ($i = 1; $i < count($rows); $i++) {
            $row = array_values($rows[$i]);
            $obj = [];
            for ($j = 0; $j < count($header); $j++) {
                $key = $header[$j] !== '' ? $header[$j] : "col{$j}";
                $obj[$key] = $row[$j] ?? null;
            }
            if (!isset($obj['efId']) || trim((string) $obj['efId']) === '') {
                continue;
            }
            $options[] = $obj;
        }

        return response()->json(['ok' => true, 'options' => $options]);
    }
}
