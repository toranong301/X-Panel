<?php

namespace App\Services;

use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\DefinedName;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Worksheet\Table;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

class TemplateInspector
{
    /**
     * @return array<int, array{templateId: string, path: string}>
     */
    public function locateTemplates(): array
    {
        $root = storage_path('app/templates/mbax');
        $candidates = [
            'VSheetCFO_BASE_2025.xlsx' => 'VSHEET_CFO_2025',
            'VSheetCFO_BASE_2026.xlsx' => 'VSHEET_CFO_2026',
            'MBAX-TGO-11102567-Demo.xlsx' => 'MBAX_TGO_11102567',
        ];

        $found = [];
        foreach ($candidates as $filename => $templateId) {
            $path = $this->findFileByName($root, $filename);
            if (!$path) {
                continue;
            }
            $found[] = [
                'templateId' => $templateId,
                'path' => $path,
            ];
        }

        return $found;
    }

    public function inspectAndWriteAll(string $outputDir): array
    {
        $templates = $this->locateTemplates();
        $results = [];

        if (!is_dir($outputDir)) {
            @mkdir($outputDir, 0777, true);
        }

        foreach ($templates as $tpl) {
            $mapping = $this->inspectTemplate($tpl['templateId'], $tpl['path']);
            $outPath = rtrim($outputDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $tpl['templateId'] . '.json';
            file_put_contents(
                $outPath,
                json_encode($mapping, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
            );
            $results[] = [
                'templateId' => $tpl['templateId'],
                'path' => $tpl['path'],
                'output' => $outPath,
                'sheetCount' => count($mapping['sheets'] ?? []),
                'efSheets' => array_keys($mapping['efSheets'] ?? []),
            ];
        }

        return $results;
    }

    /**
     * @return array<string, mixed>
     */
    public function inspectTemplate(string $templateId, string $path): array
    {
        $spreadsheet = IOFactory::load($path);

        $sheets = [];
        foreach ($spreadsheet->getSheetNames() as $idx => $name) {
            $sheets[] = ['index' => $idx, 'name' => $name];
        }

        $efSheets = $this->inspectEfSheets($spreadsheet);
        $scope11 = $this->inspectScope11($spreadsheet);
        $hiddenTables = $this->inspectHiddenTables($spreadsheet);
        $namedRanges = $this->inspectNamedRanges($spreadsheet);

        return [
            'templateId' => $templateId,
            'file' => [
                'path' => $path,
                'basename' => basename($path),
                'sizeBytes' => is_file($path) ? filesize($path) : null,
            ],
            'sheets' => $sheets,
            'efSheets' => $efSheets,
            'scope11' => $scope11,
            'hiddenTables' => $hiddenTables,
            'namedRanges' => $namedRanges,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function inspectEfSheets(Spreadsheet $spreadsheet): array
    {
        $out = [];

        $defs = [
            'AR5' => 'EF TGO AR5',
            'AR5V2' => 'EF TGO AR5 V2',
            'EF1' => 'EF (1)',
        ];

        foreach ($defs as $key => $sheetName) {
            $ws = $spreadsheet->getSheetByName($sheetName);
            if (!$ws) {
                continue;
            }

            $out[$key] = [
                'sheetName' => $sheetName,
                'tables' => $this->listTables($ws),
                'detected' => $this->detectEfHeaderAndColumns($ws),
            ];
        }

        return $out;
    }

    /**
     * @return array<string, mixed>
     */
    private function detectEfHeaderAndColumns(Worksheet $ws): array
    {
        $maxCols = min(60, Coordinate::columnIndexFromString($ws->getHighestColumn() ?: 'A'));
        $maxRows = min(250, $ws->getHighestRow());
        $grid = $ws->rangeToArray(
            'A1:' . Coordinate::stringFromColumnIndex($maxCols) . $maxRows,
            null,
            true,
            true,
            true
        );

        $headerRow = null;
        for ($r = 1; $r <= $maxRows; $r++) {
            $row = $grid[$r] ?? [];
            $joined = $this->norm(implode(' ', array_map('strval', $row)));
            if ($joined === '') continue;
            if (str_contains($joined, 'efid') || str_contains($joined, 'ef id')) {
                $headerRow = $r;
                break;
            }
        }

        if (!$headerRow) {
            return [
                'headerRow' => null,
                'startRow' => null,
                'columns' => new \stdClass(),
            ];
        }

        $row = $grid[$headerRow] ?? [];
        $columns = [];
        foreach ($row as $letter => $value) {
            $key = $this->mapEfHeader((string) $value);
            if (!$key) continue;
            $columns[$key] = [
                'letter' => $letter,
                'index' => Coordinate::columnIndexFromString($letter),
                'header' => trim((string) $value),
            ];
        }

        return [
            'headerRow' => $headerRow,
            'startRow' => $headerRow + 1,
            'columns' => $columns ?: new \stdClass(),
        ];
    }

    private function mapEfHeader(string $raw): ?string
    {
        $h = $this->norm($raw);
        $h = str_replace(['(', ')', '[', ']', ':', ';', ',', '.', '’', '\'', '"'], ' ', $h);
        $h = $this->norm($h);

        if ($h === 'efid' || $h === 'ef id' || $h === 'id') return 'efId';
        if ($h === 'name' || $h === 'ชื่อ' || str_contains($h, 'fuel')) return 'Name';
        if ($h === 'unit' || $h === 'units' || $h === 'หน่วย') return 'Unit';
        if ($h === 'co2') return 'CO2';
        if (str_contains($h, 'fossil') && str_contains($h, 'ch4')) return 'Fossil CH4';
        if ($h === 'fossil ch4') return 'Fossil CH4';
        if ($h === 'ch4') return 'CH4';
        if ($h === 'n2o') return 'N2O';
        if (str_contains($h, 'total')) return 'Total';
        if (str_contains($h, 'source') || str_contains($h, 'ที่มา')) return 'Source';

        return null;
    }

    /**
     * @return array<string, mixed>
     */
    private function inspectScope11(Spreadsheet $spreadsheet): array
    {
        $ws = $spreadsheet->getSheetByName('1.1 Stationary ');
        if (!$ws) {
            return [
                'sheetName' => null,
                'mainInput' => null,
                'splitSection' => null,
            ];
        }

        return [
            'sheetName' => '1.1 Stationary ',
            'mainInput' => $this->detectScope11MainInput($ws),
            'splitSection' => $this->detectScope11SplitSection($ws),
        ];
    }

    private function detectScope11MainInput(Worksheet $ws): array
    {
        $maxCols = min(26, Coordinate::columnIndexFromString($ws->getHighestColumn() ?: 'A'));
        $maxRows = min(120, $ws->getHighestRow());
        $grid = $ws->rangeToArray(
            'A1:' . Coordinate::stringFromColumnIndex($maxCols) . $maxRows,
            null,
            true,
            true,
            true
        );

        $headerRow = null;
        for ($r = 1; $r <= $maxRows; $r++) {
            $row = $grid[$r] ?? [];
            $joined = $this->norm(implode(' ', array_map('strval', $row)));
            if ($joined === '') continue;

            $score = 0;
            if (str_contains($joined, 'รายการ') || str_contains($joined, 'item')) $score++;
            if (str_contains($joined, 'หลักฐาน') || str_contains($joined, 'evidence')) $score++;
            if (str_contains($joined, 'หน่วย') || str_contains($joined, 'unit')) $score++;
            if (str_contains($joined, 'รวม') || str_contains($joined, 'total')) $score++;
            if ($score >= 3) {
                $headerRow = $r;
                break;
            }
        }

        if (!$headerRow) {
            return [
                'headerRow' => null,
                'startRow' => null,
                'columns' => new \stdClass(),
            ];
        }

        $row = $grid[$headerRow] ?? [];
        $cols = [];

        foreach ($row as $letter => $value) {
            $h = $this->norm((string) $value);
            if ($h === '') continue;

            if (!isset($cols['itemLabel']) && (str_contains($h, 'รายการ') || str_contains($h, 'item'))) {
                $cols['itemLabel'] = $letter;
                continue;
            }
            if (!isset($cols['evidence']) && (str_contains($h, 'หลักฐาน') || str_contains($h, 'evidence'))) {
                $cols['evidence'] = $letter;
                continue;
            }
            if (!isset($cols['unit']) && (str_contains($h, 'หน่วย') || str_contains($h, 'unit'))) {
                $cols['unit'] = $letter;
                continue;
            }
            if (!isset($cols['total']) && (str_contains($h, 'รวม') || str_contains($h, 'total'))) {
                $cols['total'] = $letter;
                continue;
            }

            $m = null;
            if (preg_match('/^m?\\s*(\\d{1,2})$/i', trim((string) $value), $mm)) {
                $idx = (int) $mm[1];
                if ($idx >= 1 && $idx <= 12) {
                    $m = $idx;
                }
            }
            if ($m !== null) {
                $cols['M' . $m] = $letter;
            }
        }

        return [
            'headerRow' => $headerRow,
            'startRow' => $headerRow + 1,
            'columns' => $this->decorateColumns($cols),
        ];
    }

    private function detectScope11SplitSection(Worksheet $ws): array
    {
        $maxCols = min(40, Coordinate::columnIndexFromString($ws->getHighestColumn() ?: 'A'));
        $maxRows = min(220, $ws->getHighestRow());
        $grid = $ws->rangeToArray(
            'A1:' . Coordinate::stringFromColumnIndex($maxCols) . $maxRows,
            null,
            true,
            true,
            true
        );

        $headerRow = null;
        for ($r = 1; $r <= $maxRows; $r++) {
            $row = $grid[$r] ?? [];
            $joined = $this->norm(implode(' ', array_map('strval', $row)));
            if ($joined === '') continue;
            if (str_contains($joined, 'diesel') && str_contains($joined, 'biodiesel')) {
                $headerRow = $r;
                break;
            }
        }

        if (!$headerRow) {
            return [
                'headerRow' => null,
                'startRow' => null,
                'columns' => new \stdClass(),
            ];
        }

        $row = $grid[$headerRow] ?? [];
        $cols = [];
        foreach ($row as $letter => $value) {
            $h = $this->norm((string) $value);
            if ($h === '') continue;

            if (!isset($cols['dieselL']) && str_contains($h, 'diesel') && str_contains($h, 'l')) $cols['dieselL'] = $letter;
            if (!isset($cols['biodieselL']) && str_contains($h, 'biodiesel') && str_contains($h, 'l')) $cols['biodieselL'] = $letter;
            if (!isset($cols['biodieselKg']) && str_contains($h, 'biodiesel') && str_contains($h, 'kg')) $cols['biodieselKg'] = $letter;
            if (!isset($cols['gasolineL']) && str_contains($h, 'gasoline') && str_contains($h, 'l')) $cols['gasolineL'] = $letter;
            if (!isset($cols['ethanolL']) && str_contains($h, 'ethanol') && str_contains($h, 'l')) $cols['ethanolL'] = $letter;
            if (!isset($cols['ethanolKg']) && str_contains($h, 'ethanol') && str_contains($h, 'kg')) $cols['ethanolKg'] = $letter;
        }

        return [
            'headerRow' => $headerRow,
            'startRow' => $headerRow + 1,
            'columns' => $this->decorateColumns($cols),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function inspectHiddenTables(Spreadsheet $spreadsheet): array
    {
        $out = [];
        foreach (['_DATA_SCOPE11', '_FR041_SEL'] as $sheetName) {
            $ws = $spreadsheet->getSheetByName($sheetName);
            if (!$ws) continue;
            $out[$sheetName] = [
                'sheetName' => $sheetName,
                'tables' => $this->listTables($ws),
            ];
        }
        return $out;
    }

    /**
     * @return array<int, array{name: string, range: string}>
     */
    private function listTables(Worksheet $ws): array
    {
        $tables = [];
        foreach ($ws->getTableCollection() as $table) {
            $name = method_exists($table, 'getName') ? (string) $table->getName() : '';
            $range = method_exists($table, 'getRange') ? (string) $table->getRange() : '';
            $tables[] = [
                'name' => $name,
                'range' => $range,
            ];
        }
        return $tables;
    }

    /**
     * @return array<int, array{name: string, value: string}>
     */
    private function inspectNamedRanges(Spreadsheet $spreadsheet): array
    {
        $out = [];
        $names = $spreadsheet->getDefinedNames() ?? [];
        foreach ($names as $name) {
            if (!$name instanceof DefinedName) continue;
            $out[] = [
                'name' => $name->getName(),
                'value' => (string) $name->getValue(),
            ];
        }
        return $out;
    }

    /**
     * @param array<string, string> $cols
     * @return array<string, array{letter: string, index: int}>
     */
    private function decorateColumns(array $cols): array
    {
        $out = [];
        foreach ($cols as $key => $letter) {
            $out[$key] = [
                'letter' => $letter,
                'index' => Coordinate::columnIndexFromString($letter),
            ];
        }
        return $out;
    }

    private function findFileByName(string $root, string $filename): ?string
    {
        $direct = rtrim($root, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $filename;
        if (is_file($direct)) return $direct;

        if (!is_dir($root)) return null;
        $it = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS)
        );
        foreach ($it as $file) {
            if (!$file instanceof \SplFileInfo) continue;
            if (strcasecmp($file->getFilename(), $filename) === 0) {
                return $file->getPathname();
            }
        }
        return null;
    }

    private function norm(string $s): string
    {
        $s = strtolower(trim($s));
        $s = preg_replace('/\\s+/', ' ', $s) ?? '';
        return $s;
    }
}

