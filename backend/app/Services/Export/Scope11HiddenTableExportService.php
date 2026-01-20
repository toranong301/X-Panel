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
    private const FR041_SEL_TABLE_NAME = 'tblFR041Sel';
    private const FR041_SEL_SHEET_NAME = '_FR041_SEL';
    private const KEY_COLUMN = 'A';
    private const VALUE_COLUMN = 'B';
    private const START_ROW = 2;

    private bool $traceEnabled = false;
    private array $traceWrites = [];
    private array $traceClearedRanges = [];

    public function startTrace(): void
    {
        $this->traceEnabled = true;
        $this->traceWrites = [];
        $this->traceClearedRanges = [];
    }

    /**
     * @return array{writes: array<int, array{sheet: string, cell: string, value: mixed}>, clearedRanges: array<int, array{sheet: string, range: string, reason: string}>}
     */
    public function endTrace(): array
    {
        $out = [
            'writes' => $this->traceWrites,
            'clearedRanges' => $this->traceClearedRanges,
        ];
        $this->traceEnabled = false;
        return $out;
    }

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

    public function writeToSpreadsheet(Spreadsheet $spreadsheet, array $payload): void
    {
        $ws = $spreadsheet->getSheetByName(self::SHEET_NAME);
        if (!$ws) {
            throw new \RuntimeException('Missing worksheet: ' . self::SHEET_NAME);
        }

        $normalizedPayload = $this->normalizePayload($payload);
        $this->writeScope11Table(
            $ws,
            $normalizedPayload['items'],
            (bool) $normalizedPayload['splitEnabled'],
            $normalizedPayload['headerMonths'] ?? null,
            $normalizedPayload['periodYear'] ?? null
        );
    }

    public function writeSelectionToSpreadsheet(Spreadsheet $spreadsheet, array $selectedRowIds): void
    {
        $ws = $spreadsheet->getSheetByName(self::FR041_SEL_SHEET_NAME);
        if (!$ws) {
            throw new \RuntimeException('Missing worksheet: ' . self::FR041_SEL_SHEET_NAME);
        }

        $tableRange = $this->resolveSelectionTableRange($ws);
        $this->traceClearRange(
            $ws->getTitle(),
            Coordinate::stringFromColumnIndex($tableRange['startCol']) . $tableRange['startRow'] . ':' . Coordinate::stringFromColumnIndex($tableRange['endCol']) . $tableRange['endRow'],
            'clear_selection_table'
        );
        $headerMap = $this->buildHeaderMap($ws, $tableRange['headerRow'], $tableRange['startCol'], $tableRange['endCol']);
        $rowIdCol = $headerMap['ROWID'] ?? null;
        $includeCol = $headerMap['INCLUDE'] ?? null;
        if (!$rowIdCol || !$includeCol) {
            return;
        }

        for ($r = $tableRange['startRow']; $r <= $tableRange['endRow']; $r++) {
            $this->writeValue($ws, $rowIdCol . $r, null);
            $this->writeValue($ws, $includeCol . $r, null);
        }

        $rows = array_values(array_filter(array_map('trim', array_map('strval', $selectedRowIds))));
        $maxRows = $tableRange['endRow'] - $tableRange['startRow'] + 1;
        for ($i = 0; $i < count($rows) && $i < $maxRows; $i++) {
            $excelRow = $tableRange['startRow'] + $i;
            $this->writeValue($ws, $rowIdCol . $excelRow, $rows[$i]);
            $this->writeValue($ws, $includeCol . $excelRow, 1);
        }
    }

    public function writeFr041SelectionRows(Spreadsheet $spreadsheet, array $rows): void
    {
        $ws = $spreadsheet->getSheetByName(self::FR041_SEL_SHEET_NAME);
        if (!$ws) {
            throw new \RuntimeException('Missing worksheet: ' . self::FR041_SEL_SHEET_NAME);
        }

        $tableRange = $this->resolveSelectionTableRange($ws);
        $this->traceClearRange(
            $ws->getTitle(),
            Coordinate::stringFromColumnIndex($tableRange['startCol']) . $tableRange['startRow'] . ':' . Coordinate::stringFromColumnIndex($tableRange['endCol']) . $tableRange['endRow'],
            'clear_selection_table'
        );
        $headerMap = $this->buildHeaderMap($ws, $tableRange['headerRow'], $tableRange['startCol'], $tableRange['endCol']);

        for ($r = $tableRange['startRow']; $r <= $tableRange['endRow']; $r++) {
            for ($c = $tableRange['startCol']; $c <= $tableRange['endCol']; $c++) {
                $cellRef = Coordinate::stringFromColumnIndex($c) . $r;
                $this->writeValue($ws, $cellRef, null);
            }
        }

        $normalized = $this->normalizeFr041SelectionRows($rows);
        if (!$normalized) {
            return;
        }

        $maxRows = $tableRange['endRow'] - $tableRange['startRow'] + 1;
        for ($i = 0; $i < count($normalized) && $i < $maxRows; $i++) {
            $excelRow = $tableRange['startRow'] + $i;
            $row = $normalized[$i];

            $this->writeIfColumn($ws, $headerMap, 'ROWNO', $excelRow, $row['rowNo'] ?? null);
            $this->writeIfColumn($ws, $headerMap, 'ROWID', $excelRow, $row['rowId'] ?? null);
            $this->writeIfColumn($ws, $headerMap, 'ITEMID', $excelRow, $row['itemId'] ?? null);
            $this->writeIfColumn($ws, $headerMap, 'ITEMNAME', $excelRow, $row['itemName'] ?? null);
            $this->writeIfColumn($ws, $headerMap, 'SECTIONID', $excelRow, $row['sectionId'] ?? null);
            $this->writeIfColumn($ws, $headerMap, 'FUELKEY', $excelRow, $row['fuelKey'] ?? null);
            $this->writeIfColumn($ws, $headerMap, 'EVIDENCE', $excelRow, $row['evidence'] ?? null);
            $this->writeIfColumn($ws, $headerMap, 'UNIT', $excelRow, $row['unit'] ?? null);
            $this->writeIfColumn($ws, $headerMap, 'QTY', $excelRow, $row['qty'] ?? null);
            $this->writeIfColumn($ws, $headerMap, 'EFCATALOG', $excelRow, $row['efCatalog'] ?? null);
            $this->writeIfColumn($ws, $headerMap, 'EFID', $excelRow, $row['efId'] ?? null);
            $this->writeIfColumn($ws, $headerMap, 'INCLUDE', $excelRow, 1);
        }
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

        $this->traceWrite($ws, $cell, $value);

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

    private function writeIfColumn($ws, array $headerMap, string $key, int $row, $value): void
    {
        $col = $headerMap[$key] ?? null;
        if (!$col) return;
        $this->writeValue($ws, $col . $row, $value);
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

        $this->traceClearRange(
            $ws->getTitle(),
            Coordinate::stringFromColumnIndex($startCol) . $startRow . ':' . Coordinate::stringFromColumnIndex($endCol) . $endRow,
            'clear_scope11_table'
        );

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
            $valueCol = $headerMap['VALUE'] ?? null;
            if (array_key_exists('value', $data) && !$valueCol && $labelCol) {
                $this->writeValue($ws, $labelCol . $excelRow, $data['value']);
            } elseif ($labelCol) {
                $label = $data['label'] ?? $this->labelFromRowId($rowId);
                $this->writeValue($ws, $labelCol . $excelRow, $label);
            }

            $fuelTypeCol = $headerMap['FUELTYPE'] ?? $headerMap['FUELKEY'] ?? null;
            if ($fuelTypeCol) {
                $this->writeValue($ws, $fuelTypeCol . $excelRow, $data['fuelKey'] ?? null);
            }

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

            $includeFr041Col = $headerMap['INCLUDEFR041'] ?? null;
            if ($includeFr041Col && array_key_exists('includeFr041', $data)) {
                $this->writeValue($ws, $includeFr041Col . $excelRow, $data['includeFr041'] ?? null);
            }

            $otherDieselPctCol = $headerMap['OTHERDIESELPCT'] ?? null;
            if ($otherDieselPctCol && array_key_exists('otherDieselPct', $data)) {
                $this->writeValue($ws, $otherDieselPctCol . $excelRow, $data['otherDieselPct'] ?? null);
            }

            $otherBiodieselPctCol = $headerMap['OTHERBIODIESELPCT'] ?? null;
            if ($otherBiodieselPctCol && array_key_exists('otherBiodieselPct', $data)) {
                $this->writeValue($ws, $otherBiodieselPctCol . $excelRow, $data['otherBiodieselPct'] ?? null);
            }

            $otherGasolinePctCol = $headerMap['OTHERGASOLINEPCT'] ?? null;
            if ($otherGasolinePctCol && array_key_exists('otherGasolinePct', $data)) {
                $this->writeValue($ws, $otherGasolinePctCol . $excelRow, $data['otherGasolinePct'] ?? null);
            }

            $otherEthanolPctCol = $headerMap['OTHERETHANOLPCT'] ?? null;
            if ($otherEthanolPctCol && array_key_exists('otherEthanolPct', $data)) {
                $this->writeValue($ws, $otherEthanolPctCol . $excelRow, $data['otherEthanolPct'] ?? null);
            }

            $otherBiodieselDensityCol = $headerMap['OTHERBIODIESELDENSITYKGPERL'] ?? null;
            if ($otherBiodieselDensityCol && array_key_exists('otherBiodieselDensityKgPerL', $data)) {
                $this->writeValue($ws, $otherBiodieselDensityCol . $excelRow, $data['otherBiodieselDensityKgPerL'] ?? null);
            }

            $otherEthanolDensityCol = $headerMap['OTHERETHANOLDENSITYKGPERL'] ?? null;
            if ($otherEthanolDensityCol && array_key_exists('otherEthanolDensityKgPerL', $data)) {
                $this->writeValue($ws, $otherEthanolDensityCol . $excelRow, $data['otherEthanolDensityKgPerL'] ?? null);
            }

            $months = is_array($data['months'] ?? null) ? $data['months'] : [];
            for ($m = 1; $m <= 12; $m++) {
                $field = 'M' . $m;
                $col = $headerMap[$field] ?? null;
                if (!$col) {
                    continue;
                }
                if (!array_key_exists($field, $months)) {
                    continue;
                }
                $value = $months[$field];
                if ($value === null || $value === '') {
                    continue;
                }
                $this->writeValue($ws, $col . $excelRow, $value);
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

    private function normalizeFr041SelectionRows(array $rows): array
    {
        $out = [];
        $rowNo = 11;
        foreach ($rows as $row) {
            if (!is_array($row)) continue;
            $itemId = (string) ($row['itemId'] ?? $row['rowId'] ?? '');
            $itemName = (string) ($row['itemName'] ?? $row['itemLabel'] ?? '');
            if ($itemId === '' && $itemName === '') continue;

            $rowNoRaw = $row['rowNo'] ?? null;
            $rowNoValue = (is_numeric($rowNoRaw) ? (int) $rowNoRaw : $rowNo);

            $out[] = [
                'rowNo' => $rowNoValue,
                'rowId' => (string) ($row['rowId'] ?? $row['itemId'] ?? ''),
                'itemId' => $itemId,
                'itemName' => $itemName,
                'sectionId' => (string) ($row['sectionId'] ?? ''),
                'fuelKey' => (string) ($row['fuelKey'] ?? ''),
                'evidence' => (string) ($row['evidence'] ?? ''),
                'unit' => (string) ($row['unit'] ?? ''),
                'qty' => $this->normalizeValue($row['qty'] ?? $row['total'] ?? null),
                'efCatalog' => (string) ($row['efCatalog'] ?? ''),
                'efId' => (string) ($row['efId'] ?? ''),
            ];

            $rowNo += 1;
        }

        return $out;
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

    private function resolveSelectionTableRange($ws): array
    {
        $table = null;
        try {
            $table = $this->findTable($ws->getParent(), $ws, self::FR041_SEL_TABLE_NAME);
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

            $includeRaw = null;
            if (array_key_exists('includeFr041', $item) || array_key_exists('includeFR041', $item)) {
                $includeRaw = $item['includeFr041'] ?? $item['includeFR041'] ?? null;
            }
            $includeFr041 = null;
            if ($includeRaw !== null && $includeRaw !== '') {
                $includeBool = filter_var($includeRaw, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
                if ($includeBool === null && is_numeric($includeRaw)) {
                    $includeBool = ((int) $includeRaw) === 1;
                }
                $includeFr041 = $includeBool ? true : null;
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
                'includeFr041' => $includeFr041,
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
            if ($trimmed === '') {
                return null;
            }
            if (is_numeric($trimmed)) {
                return (float) $trimmed;
            }
            return $trimmed;
        }
        return $value;
    }

    private function traceClearRange(string $sheetName, string $range, string $reason): void
    {
        if (!$this->traceEnabled) {
            return;
        }
        $this->traceClearedRanges[] = [
            'sheet' => $sheetName,
            'range' => $range,
            'reason' => $reason,
        ];
    }

    private function traceWrite($ws, string $cell, $value): void
    {
        if (!$this->traceEnabled) {
            return;
        }

        if ($value === null || $value === '') {
            return;
        }

        $normalized = $value;
        if (is_bool($value)) {
            $normalized = $value ? 1 : 0;
        } elseif (is_int($value) || is_float($value) || (is_string($value) && is_numeric($value))) {
            $normalized = (float) $value;
        } elseif (!is_string($value)) {
            $normalized = (string) $value;
        }

        $this->traceWrites[] = [
            'sheet' => method_exists($ws, 'getTitle') ? (string) $ws->getTitle() : '',
            'cell' => $cell,
            'value' => $normalized,
        ];
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
        foreach ($sheet->getTableCollection() as $table) {
            if (strcasecmp($table->getName(), $tableName) !== 0) {
                continue;
            }
            return $table;
        }

        throw new \RuntimeException("Table not found: {$tableName} on sheet {$sheetName}");
    }
}
