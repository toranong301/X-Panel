<?php

namespace App\Services\Export;

use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Worksheet\Table;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

class Scope11HiddenTableExportService
{
    private const TABLE_NAME = 'tblScope11Stationary';
    private const SHEET_NAME = '_DATA_SCOPE11';
    private const KEY_COLUMN = 'A';
    private const VALUE_COLUMN = 'B';
    private const START_ROW = 2;

    /**
     * @return array{path: string, missingKeys: string[]}
     */
    public function export(array $payload): array
    {
        if (!class_exists(IOFactory::class)) {
            throw new \RuntimeException('PhpSpreadsheet not installed.');
        }

        $templatePath = $this->resolveTemplatePath();

        $spreadsheet = IOFactory::load($templatePath);
        $ws = $spreadsheet->getSheetByName(self::SHEET_NAME);
        if (!$ws) {
            throw new \RuntimeException('Missing worksheet: ' . self::SHEET_NAME);
        }

        $normalizedPayload = $this->normalizePayload($payload);
        $this->writeScope11Table($ws, $normalizedPayload['items'], (bool) $normalizedPayload['splitEnabled'], $normalizedPayload['headerMonths'] ?? null, $normalizedPayload['periodYear'] ?? null);

        $tempBase = tempnam(sys_get_temp_dir(), 'scope11_export_');
        if (!$tempBase) {
            throw new \RuntimeException('Failed to create export temp file.');
        }
        $tempPath = $tempBase . '.xlsx';

        $writer = IOFactory::createWriter($spreadsheet, 'Xlsx');
        $writer->save($tempPath);

        return [
            'path' => $tempPath,
            'missingKeys' => [],
        ];
    }

    /**
     * @return array{
     *   ok: bool,
     *   splitEnabled: bool,
     *   items: array<int, array<string, mixed>>,
     *   unknownRowIds: string[],
     *   warnings: array
     * }
     */
    public function previewPayload(array $payload): array
    {
        $normalizedPayload = $this->normalizePayload($payload);
        $splitRows = $this->computeSplitRows(
            $normalizedPayload['items'] ?? [],
            (bool) ($normalizedPayload['splitEnabled'] ?? false)
        );
        $linkCheck = $this->buildLinkCheck($splitRows);

        return [
            'ok' => true,
            'splitEnabled' => $normalizedPayload['splitEnabled'],
            'periodYear' => $normalizedPayload['periodYear'] ?? null,
            'headerMonths' => $normalizedPayload['headerMonthsRaw'] ?? null,
            'itemsPreview' => $this->buildPreviewRows($normalizedPayload['items']),
            'splitRows' => $splitRows,
            'linkCheck' => $linkCheck,
        ];
    }

    /**
     * @return array{0: array<string,int>, 1: int, 2?: string[]}
     */
    private function collectScope11RowMap(Spreadsheet $spreadsheet, bool $includeKeys = false): array
    {
        $ws = $spreadsheet->getSheetByName(self::SHEET_NAME);
        if (!$ws) {
            return $includeKeys ? [[], self::START_ROW - 1, []] : [[], self::START_ROW - 1];
        }

        $map = [];
        $keys = [];
        $row = self::START_ROW;
        while (true) {
            $key = trim((string) $ws->getCell(self::KEY_COLUMN . $row)->getValue());
            if ($key === '') {
                break;
            }
            $map[$key] = $row;
            $keys[] = $key;
            $row += 1;
        }

        return $includeKeys ? [$map, $row - 1, $keys] : [$map, $row - 1];
    }

    private function clearValueColumn($ws, int $lastRow): void
    {
        if ($lastRow < self::START_ROW) {
            return;
        }
        for ($row = self::START_ROW; $row <= $lastRow; $row++) {
            $this->writeValue($ws, self::VALUE_COLUMN . $row, null);
        }
    }

    private function writeValue($ws, string $cell, $value): void
    {
        if ($value === null || $value === '') {
            $ws->setCellValue($cell, null);
            return;
        }

        if (is_bool($value)) {
            $ws->setCellValueExplicit($cell, $value ? 1 : 0, DataType::TYPE_NUMERIC);
            return;
        }

        if (is_int($value) || is_float($value) || (is_string($value) && is_numeric($value))) {
            $ws->setCellValueExplicit($cell, (float) $value, DataType::TYPE_NUMERIC);
            return;
        }

        $ws->setCellValueExplicit($cell, (string) $value, DataType::TYPE_STRING);
    }

    /**
     * @return array<string, array{rowId: string, field: string}>
     */
    private function buildCellMapping(Spreadsheet $spreadsheet): array
    {
        $sheetName = (string) config('export.scope11.preview_sheet', '1.1 Stationary ');
        $range = (string) config('export.scope11.preview_range', 'E9:P14');
        $ws = $spreadsheet->getSheetByName($sheetName);
        if (!$ws) {
            return [];
        }

        $rangeInfo = $this->parseRange($range);
        $mapping = [];
        for ($r = $rangeInfo['startRow']; $r <= $rangeInfo['endRow']; $r++) {
            for ($c = $rangeInfo['startCol']; $c <= $rangeInfo['endCol']; $c++) {
                $addr = Coordinate::stringFromColumnIndex($c) . $r;
                $cell = $ws->getCell($addr);
                if (!$cell->isFormula()) {
                    continue;
                }
                $formula = (string) $cell->getValue();
                $parsed = $this->parseScope11Formula($formula);
                if (!$parsed) {
                    continue;
                }
                $mapping[$addr] = $parsed;
            }
        }

        return $mapping;
    }

    private function parseScope11Formula(string $formula): ?array
    {
        $raw = ltrim(trim($formula), '=');
        $patterns = [
            '/INDEX\(\s*' . self::TABLE_NAME . '\[(?<field>[^\]]+)\]\s*,\s*MATCH\(\s*"(?<rowid>[^"]+)"\s*,\s*' . self::TABLE_NAME . '\[RowId\]\s*,\s*0\s*\)\s*\)/i',
            '/INDEX\(\s*' . self::TABLE_NAME . '\[(?<field>[^\]]+)\]\s*,\s*MATCH\(\s*\'(?<rowid>[^\']+)\'\s*,\s*' . self::TABLE_NAME . '\[RowId\]\s*,\s*0\s*\)\s*\)/i',
        ];

        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $raw, $match)) {
                return [
                    'rowId' => trim((string) ($match['rowid'] ?? '')),
                    'field' => trim((string) ($match['field'] ?? '')),
                ];
            }
        }
        return null;
    }

    /**
     * @return array{rows: array<string, array<string, mixed>>, unknownKeys: string[], missingKeys: string[]}
     */
    private function resolveRowsFromPayload(array $payload, array $mapping): array
    {
        $normalizedMapping = [];
        foreach ($mapping as $cell => $info) {
            $normalizedMapping[strtoupper($cell)] = $info;
        }

        $rows = [];
        $unknownKeys = [];
        foreach ($payload as $cell => $value) {
            $cellKey = strtoupper(trim((string) $cell));
            if ($cellKey === '') {
                continue;
            }
            $info = $normalizedMapping[$cellKey] ?? null;
            if (!$info) {
                $unknownKeys[] = $cellKey;
                continue;
            }
            $rowId = (string) ($info['rowId'] ?? '');
            $field = (string) ($info['field'] ?? '');
            if ($rowId === '' || $field === '') {
                continue;
            }
            if (!isset($rows[$rowId])) {
                $rows[$rowId] = [];
            }
            $rows[$rowId][$field] = $value;
        }

        $payloadKeySet = array_fill_keys(array_keys($payload), true);
        $missingKeys = [];
        foreach (array_keys($normalizedMapping) as $cell) {
            if (!isset($payloadKeySet[$cell])) {
                $missingKeys[] = $cell;
            }
        }

        return [
            'rows' => $rows,
            'unknownKeys' => $unknownKeys,
            'missingKeys' => $missingKeys,
        ];
    }

    private function writeScope11Table($ws, array $items, bool $splitEnabled, ?array $headerMonths, ?int $periodYear): void
    {
        $tableRange = $this->resolveTableRange($ws);
        $headerRow = $tableRange['headerRow'];
        $startRow = $tableRange['startRow'];
        $endRow = $tableRange['endRow'];
        $startCol = $tableRange['startCol'];
        $endCol = $tableRange['endCol'];

        $headerMap = $this->buildHeaderMap($ws, $headerRow, $startCol, $endCol);

        for ($r = $startRow; $r <= $endRow; $r++) {
            for ($c = $startCol; $c <= $endCol; $c++) {
                $cellRef = Coordinate::stringFromColumnIndex($c) . $r;
                $ws->setCellValue($cellRef, null);
            }
        }

        $maxRows = $endRow - $startRow + 1;
        $itemsToWrite = $this->appendHeaderMonthsRows($items, $headerMonths, $periodYear, $headerMap);
        $itemsToWrite = $this->appendSplitFlagRow($itemsToWrite, $splitEnabled, $headerMap);
        for ($i = 0; $i < count($itemsToWrite) && $i < $maxRows; $i++) {
            $data = $itemsToWrite[$i] ?? [];
            $rowId = (string) ($data['rowId'] ?? '');
            if ($rowId === '') {
                continue;
            }
            $excelRow = $startRow + $i;

            $rowIdCol = $headerMap['ROWID'] ?? null;
            if ($rowIdCol) {
                $this->writeValue($ws, $rowIdCol . $excelRow, $rowId);
            }

            $labelCol = $headerMap['ITEMLABEL'] ?? null;
            if ($labelCol) {
                $label = $data['label'] ?? $this->labelFromRowId($rowId);
                $this->writeValue($ws, $labelCol . $excelRow, $label);
            }

            $valueCol = $headerMap['VALUE'] ?? null;
            if ($valueCol && array_key_exists('value', $data)) {
                $this->writeValue($ws, $valueCol . $excelRow, $data['value']);
            }

            $unitCol = $headerMap['UNIT'] ?? null;
            if ($unitCol) {
                $this->writeValue($ws, $unitCol . $excelRow, $data['unit'] ?? null);
            }

            $evidenceCol = $headerMap['EVIDENCE'] ?? null;
            if ($evidenceCol) {
                $this->writeValue($ws, $evidenceCol . $excelRow, $data['evidence'] ?? null);
            }

            $blendCol = $headerMap['BLENDPROFILE'] ?? null;
            if ($blendCol) {
                $this->writeValue($ws, $blendCol . $excelRow, $data['blendProfile'] ?? null);
            }

            $months = is_array($data['months'] ?? null) ? $data['months'] : [];
            for ($m = 1; $m <= 12; $m++) {
                $field = 'M' . $m;
                $col = $headerMap[$field] ?? null;
                if (!$col) {
                    continue;
                }
                if (!array_key_exists($field, $months) || $months[$field] === null || $months[$field] === '') {
                    $ws->setCellValue($col . $excelRow, '');
                    continue;
                }
                $this->writeValue($ws, $col . $excelRow, $months[$field]);
            }
        }
    }

    private function buildPreviewRows(array $items): array
    {
        $out = [];
        $monthFields = [];
        for ($i = 1; $i <= 12; $i++) {
            $monthFields[] = 'M' . $i;
        }

        foreach ($items as $item) {
            $rowId = (string) ($item['rowId'] ?? '');
            $fields = is_array($item['months'] ?? null) ? $item['months'] : [];
            $months = [];
            foreach ($monthFields as $field) {
                $months[$field] = array_key_exists($field, $fields) ? $fields[$field] : null;
            }

            $hasNumber = false;
            $total = 0;
            foreach ($months as $value) {
                if (is_numeric($value)) {
                    $hasNumber = true;
                    $total += (float) $value;
                }
            }

            $out[] = [
                'rowId' => $rowId,
                'label' => $item['label'] ?? '',
                'evidence' => $item['evidence'] ?? '',
                'unit' => $item['unit'] ?? 'L',
                'months' => $months,
                'total' => $hasNumber ? $total : null,
            ];
        }

        return $out;
    }

    private function labelFromRowId(string $rowId): string
    {
        $label = str_replace('_', ' ', trim($rowId));
        return $label === '' ? 'Scope 1.1 Item' : $label;
    }

    private function buildHeaderMap($ws, int $row, int $startCol, int $endCol): array
    {
        $map = [];
        for ($c = $startCol; $c <= $endCol; $c++) {
            $cellRef = Coordinate::stringFromColumnIndex($c) . $row;
            $value = strtoupper(trim((string) $ws->getCell($cellRef)->getValue()));
            if ($value === '') {
                continue;
            }
            $map[$value] = Coordinate::stringFromColumnIndex($c);
        }
        return $map;
    }

    private function resolveTableRange($ws): array
    {
        $table = null;
        try {
            $table = $this->findTable($ws->getParent(), $ws, self::TABLE_NAME);
        } catch (\RuntimeException $e) {
            $table = null;
        }

        if ($table && method_exists($table, 'getRange')) {
            $rangeInfo = $this->parseRange($table->getRange());
            return [
                'headerRow' => $rangeInfo['startRow'],
                'startRow' => $rangeInfo['startRow'] + 1,
                'endRow' => $rangeInfo['endRow'],
                'startCol' => $rangeInfo['startCol'],
                'endCol' => $rangeInfo['endCol'],
            ];
        }

        $headerRow = 1;
        $maxCols = max($ws->getHighestColumn() ? Coordinate::columnIndexFromString($ws->getHighestColumn()) : 1, 1);
        return [
            'headerRow' => $headerRow,
            'startRow' => self::START_ROW,
            'endRow' => self::START_ROW + 199,
            'startCol' => 1,
            'endCol' => $maxCols,
        ];
    }

    private function normalizePayload(array $payload): array
    {
        $items = [];
        $rawItems = is_array($payload['items'] ?? null) ? $payload['items'] : [];
        foreach ($rawItems as $item) {
            if (!is_array($item)) {
                continue;
            }
            $rowId = trim((string) ($item['rowId'] ?? ''));
            if ($rowId === '') {
                continue;
            }
            $monthsIn = is_array($item['months'] ?? null) ? $item['months'] : [];
            $months = [];
            for ($m = 1; $m <= 12; $m++) {
                $key = 'M' . $m;
                if (!array_key_exists($key, $monthsIn)) {
                    continue;
                }
                $months[$key] = $this->normalizeValue($monthsIn[$key]);
            }

            $items[] = [
                'rowId' => $rowId,
                'fuelKey' => trim((string) ($item['fuelKey'] ?? '')),
                'label' => trim((string) ($item['label'] ?? '')),
                'evidence' => trim((string) ($item['evidence'] ?? '')),
                'unit' => strtoupper(trim((string) ($item['unit'] ?? 'L'))),
                'blendProfile' => isset($item['blendProfile']) ? trim((string) $item['blendProfile']) : null,
                'otherType' => isset($item['otherType']) ? trim((string) $item['otherType']) : null,
                'months' => $months,
            ];
        }

        $headerMonthsRaw = is_array($payload['headerMonths'] ?? null) ? $payload['headerMonths'] : null;
        $headerMonths = null;
        if (is_array($headerMonthsRaw)) {
            $headerMonths = [];
            for ($m = 1; $m <= 12; $m++) {
                $key = 'M' . $m;
                if (!array_key_exists($key, $headerMonthsRaw)) {
                    continue;
                }
                $headerMonths[$key] = $this->normalizeValue($headerMonthsRaw[$key]);
            }
        }

        $periodYear = null;
        if (array_key_exists('periodYear', $payload) && $payload['periodYear'] !== null && $payload['periodYear'] !== '') {
            $periodYear = is_numeric($payload['periodYear']) ? (int) $payload['periodYear'] : null;
        }

        return [
            'splitEnabled' => (bool) ($payload['splitEnabled'] ?? false),
            'periodYear' => $periodYear,
            'headerMonthsRaw' => $headerMonthsRaw,
            'headerMonths' => $headerMonths,
            'items' => $items,
        ];
    }

    private function normalizeValue($value)
    {
        if (is_string($value)) {
            $trimmed = trim($value);
            return $trimmed === '' ? null : $trimmed;
        }
        return $value;
    }

    private function computeSplitRows(array $items, bool $splitEnabled): array
    {
        $hasBlend = false;
        $splitKeys = ['B7', 'B10', '91/95', 'E20'];
        foreach ($items as $item) {
            $fuelKey = strtoupper((string) ($item['fuelKey'] ?? ''));
            if (in_array($fuelKey, $splitKeys, true)) {
                $hasBlend = true;
                break;
            }
        }
        if (!$splitEnabled && !$hasBlend) {
            return [];
        }

        $rows = [];

        foreach ($items as $item) {
            $unit = strtoupper((string) ($item['unit'] ?? ''));
            $months = is_array($item['months'] ?? null) ? $item['months'] : [];
            $total = 0.0;
            foreach ($months as $value) {
                if (is_numeric($value)) {
                    $total += (float) $value;
                }
            }
            if ($total === 0.0) {
                continue;
            }

            $fuelKey = strtoupper((string) ($item['fuelKey'] ?? ''));
            if ($fuelKey === 'GASOHOL_91_95') {
                $fuelKey = '91/95';
            }
            if ($fuelKey === 'GASOHOL_E20') {
                $fuelKey = 'E20';
            }

            if (!in_array($fuelKey, ['B7', 'B10', '91/95', 'E20'], true)) {
                continue;
            }

            $row = [
                'itemLabel' => (string) ($item['label'] ?? ''),
                'fuelKey' => (string) $fuelKey,
                'evidence' => (string) ($item['evidence'] ?? ''),
                'unit' => (string) ($item['unit'] ?? ''),
                'total' => $this->round2($total),
                'dieselL' => null,
                'biodieselL' => null,
                'biodieselKg' => null,
                'gasolineL' => null,
                'ethanolL' => null,
                'ethanolKg' => null,
            ];

            if ($unit !== 'L') {
                continue;
            }

            if ($fuelKey === 'B7') {
                $dieselL = $total * 0.93;
                $biodieselL = $total * 0.07;
                $row['dieselL'] = $this->round2($dieselL);
                $row['biodieselL'] = $this->round2($biodieselL);
                $row['biodieselKg'] = $this->round2($biodieselL * 0.87);
            } elseif ($fuelKey === 'B10') {
                $dieselL = $total * 0.9;
                $biodieselL = $total * 0.1;
                $row['dieselL'] = $this->round2($dieselL);
                $row['biodieselL'] = $this->round2($biodieselL);
                $row['biodieselKg'] = $this->round2($biodieselL * 0.87);
            } elseif ($fuelKey === '91/95') {
                $gasolineL = $total * 0.9;
                $ethanolL = $total * 0.1;
                $row['gasolineL'] = $this->round2($gasolineL);
                $row['ethanolL'] = $this->round2($ethanolL);
                $row['ethanolKg'] = $this->round2($ethanolL * 0.79);
            } elseif ($fuelKey === 'E20') {
                $gasolineL = $total * 0.8;
                $ethanolL = $total * 0.2;
                $row['gasolineL'] = $this->round2($gasolineL);
                $row['ethanolL'] = $this->round2($ethanolL);
                $row['ethanolKg'] = $this->round2($ethanolL * 0.79);
            }

            $rows[] = $row;
        }

        return $rows;
    }

    private function round2(float $value): float
    {
        return round($value, 2);
    }

    private function buildLinkCheck(array $splitRows): array
    {
        $totals = [
            'dieselL' => 0.0,
            'gasolineL' => 0.0,
            'biodieselKg' => 0.0,
            'ethanolKg' => 0.0,
        ];
        $hasValue = [
            'dieselL' => false,
            'gasolineL' => false,
            'biodieselKg' => false,
            'ethanolKg' => false,
        ];

        foreach ($splitRows as $row) {
            foreach ($totals as $key => $sum) {
                $value = $row[$key] ?? null;
                if (is_numeric($value)) {
                    $totals[$key] += (float) $value;
                    $hasValue[$key] = true;
                }
            }
        }

        return [
            'dieselL' => $hasValue['dieselL'] ? $this->round2($totals['dieselL']) : null,
            'gasolineL' => $hasValue['gasolineL'] ? $this->round2($totals['gasolineL']) : null,
            'biodieselKg' => $hasValue['biodieselKg'] ? $this->round2($totals['biodieselKg']) : null,
            'ethanolKg' => $hasValue['ethanolKg'] ? $this->round2($totals['ethanolKg']) : null,
        ];
    }

    private function appendSplitFlagRow(array $items, bool $splitEnabled, array $headerMap): array
    {
        $rowIdCol = $headerMap['ROWID'] ?? null;
        if (!$rowIdCol) {
            return $items;
        }

        $valueCol = $headerMap['VALUE'] ?? $headerMap['ITEMLABEL'] ?? null;
        if (!$valueCol) {
            return $items;
        }

        $items[] = [
            'rowId' => 'SCOPE11_1_1_SPLIT_ENABLED',
            'label' => $splitEnabled ? 'TRUE' : 'FALSE',
            'value' => $splitEnabled ? 'TRUE' : 'FALSE',
            'unit' => null,
            'evidence' => null,
            'blendProfile' => null,
            'months' => [],
        ];

        return $items;
    }


    private function appendHeaderMonthsRows(array $items, ?array $headerMonths, ?int $periodYear, array $headerMap): array
    {
        if (!is_array($headerMonths)) {
            return $items;
        }

        $rowIdCol = $headerMap['ROWID'] ?? null;
        if (!$rowIdCol) {
            return $items;
        }

        $valueCol = $headerMap['VALUE'] ?? $headerMap['ITEMLABEL'] ?? null;
        if (!$valueCol) {
            return $items;
        }

        for ($m = 1; $m <= 12; $m++) {
            $key = 'M' . $m;
            $value = array_key_exists($key, $headerMonths) ? $headerMonths[$key] : null;
            $items[] = [
                'rowId' => 'HEADER_' . $key,
                'label' => $periodYear ? "HEADER_{$key}_{$periodYear}" : 'HEADER_' . $key,
                'value' => $value,
                'unit' => null,
                'evidence' => null,
                'blendProfile' => null,
                'months' => [],
            ];
        }

        return $items;
    }

    private function resolveTemplatePath(): string
    {
        $attemptedPaths = [];
        $attemptedDirs = [];

        $envPath = trim((string) env('SCOPE11_TEMPLATE_PATH', ''));
        $configPath = trim((string) config('export.scope11.template_path'));
        $templatePath = $envPath !== '' ? $envPath : $configPath;
        if ($templatePath !== '') {
            $attemptedPaths[] = $templatePath;
            if (is_file($templatePath)) {
                return $templatePath;
            }
        }

        $envDir = trim((string) env('SCOPE11_TEMPLATE_DIR', ''));
        $configDir = trim((string) config('export.scope11.template_dir'));
        $templateDir = $envDir !== '' ? $envDir : $configDir;
        if ($templateDir !== '') {
            $attemptedDirs[] = $templateDir;
            $candidate = $this->pickTemplateFromDir($templateDir);
            if ($candidate) {
                return $candidate;
            }
        }

        $fallbackA = storage_path('app/templates/SCOPE11.xlsx');
        $attemptedPaths[] = $fallbackA;
        if (is_file($fallbackA)) {
            return $fallbackA;
        }

        $fallbackB = base_path('../shared/templates/mbax/SCOPE11.xlsx');
        $attemptedPaths[] = $fallbackB;
        if (is_file($fallbackB)) {
            return $fallbackB;
        }

        $fallbackDir = base_path('../shared/templates/mbax');
        $attemptedDirs[] = $fallbackDir;
        $candidate = $this->pickTemplateFromDir($fallbackDir);
        if ($candidate) {
            return $candidate;
        }

        $pathsText = $attemptedPaths ? implode(', ', $attemptedPaths) : '(none)';
        $dirsText = $attemptedDirs ? implode(', ', $attemptedDirs) : '(none)';
        throw new \RuntimeException(
            "SCOPE11 template not found. Checked paths: {$pathsText}. Checked dirs: {$dirsText}."
        );
    }

    private function pickTemplateFromDir(string $dir): ?string
    {
        if (!is_dir($dir)) {
            return null;
        }

        $glob = glob(rtrim($dir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . '*.xlsx') ?: [];
        if (!$glob) {
            return null;
        }

        usort($glob, function ($a, $b) {
            $aName = strtoupper(basename($a));
            $bName = strtoupper(basename($b));
            $aScore = (str_contains($aName, 'SCOPE11') ? 2 : 0) + (str_contains($aName, 'MBAX') ? 1 : 0);
            $bScore = (str_contains($bName, 'SCOPE11') ? 2 : 0) + (str_contains($bName, 'MBAX') ? 1 : 0);
            if ($aScore !== $bScore) {
                return $bScore <=> $aScore;
            }
            return strcmp($aName, $bName);
        });

        return $glob[0] ?? null;
    }

    private function parseRange(string $range): array
    {
        $clean = strtoupper(trim(str_replace('$', '', $range)));
        if (!preg_match('/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/', $clean, $m)) {
            throw new \InvalidArgumentException("Invalid range: {$range}");
        }
        return [
            'startCol' => Coordinate::columnIndexFromString($m[1]),
            'startRow' => (int) $m[2],
            'endCol' => Coordinate::columnIndexFromString($m[3]),
            'endRow' => (int) $m[4],
        ];
    }

    private function findTable(Spreadsheet $spreadsheet, Worksheet $sheet, string $tableName): Table
    {
        $sheetName = $sheet->getTitle();
        foreach ($spreadsheet->getTableCollection() as $table) {
            if (strcasecmp($table->getName(), $tableName) !== 0) {
                continue;
            }
            $tableSheet = method_exists($table, 'getWorksheet') ? $table->getWorksheet() : null;
            if ($tableSheet && $tableSheet->getTitle() !== $sheetName) {
                continue;
            }
            return $table;
        }

        throw new \RuntimeException("Table not found: {$tableName} on sheet {$sheetName}");
    }
}
