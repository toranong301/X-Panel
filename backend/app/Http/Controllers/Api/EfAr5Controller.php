<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use PhpOffice\PhpSpreadsheet\IOFactory;

class EfAr5Controller extends Controller
{
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
