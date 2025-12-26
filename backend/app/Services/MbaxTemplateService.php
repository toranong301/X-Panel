<?php

namespace App\Services;

use App\Models\Attachment;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Worksheet\Drawing;

class MbaxTemplateService
{
    private const TEMPLATE_ID = 'MBAX_TGO_11102567';

    public function __construct(private TemplateRegistry $registry)
    {
    }

    public function loadTemplate(?string $sheetName = null, ?string $range = null): Spreadsheet
    {
        $path = $this->resolveTemplatePath();

        if ($sheetName && $range) {
            $reader = IOFactory::createReader('Xlsx');
            $reader->setReadFilter(new SheetRangeReadFilter($sheetName, $range));
            $reader->setLoadSheetsOnly([$sheetName]);
            return $reader->load($path);
        }

        return IOFactory::load($path);
    }

    public function applyData(
        Spreadsheet $spreadsheet,
        array $data,
        array $attachments = [],
        ?string $sheetName = null,
        ?string $range = null
    ): void {
        $this->writeFr01($spreadsheet, $data, $sheetName, $range);
        $this->writeFr02($spreadsheet, $data, $attachments, $sheetName, $range);
        $this->writeFr031($spreadsheet, $data, $attachments, $sheetName, $range);
        $this->writeScope11Stationary($spreadsheet, $data, $sheetName, $range);
        $this->writeScope12Mobile($spreadsheet, $data, $sheetName, $range);
    }

    public function buildPreview(Spreadsheet $spreadsheet, string $sheetName, string $range): array
    {
        $rangeInfo = $this->parseRange($range);
        $ws = $spreadsheet->getSheetByName($sheetName);
        if (!$ws) {
            throw new \RuntimeException("Sheet '{$sheetName}' not found.");
        }

        $columns = [];
        for ($c = $rangeInfo['startCol']; $c <= $rangeInfo['endCol']; $c++) {
            $columns[] = Coordinate::stringFromColumnIndex($c);
        }

        $rows = [];
        for ($r = $rangeInfo['startRow']; $r <= $rangeInfo['endRow']; $r++) {
            $cells = [];
            for ($c = $rangeInfo['startCol']; $c <= $rangeInfo['endCol']; $c++) {
                $cell = $ws->getCellByColumnAndRow($c, $r);
                $cells[] = $this->formatPreviewCell($cell);
            }
            $rows[] = [
                'rowNumber' => $r,
                'cells' => $cells,
            ];
        }

        return [
            'sheetName' => $sheetName,
            'columns' => $columns,
            'rows' => $rows,
            'range' => $range,
        ];
    }

    public function resolveTemplatePath(): string
    {
        $mapping = $this->registry->getTemplate(self::TEMPLATE_ID);
        $envKey = $mapping['path']['env'] ?? 'MBAX_TEMPLATE_PATH';
        $fallbackRel = $mapping['path']['fallback'] ?? 'frontend/src/assets/templates/mbax/MBAX-TGO-11102567-Demo.xlsx';

        $envPath = env($envKey);
        if ($envPath && file_exists($envPath)) {
            return $envPath;
        }

        $fallback = base_path($fallbackRel);
        if (!file_exists($fallback)) {
            throw new \RuntimeException('MBAX template not found. Set MBAX_TEMPLATE_PATH.');
        }

        return $fallback;
    }

    private function writeFr01(Spreadsheet $spreadsheet, array $data, ?string $sheetName, ?string $range): void
    {
        if ($sheetName && $sheetName !== 'Fr-01') return;
        $ws = $spreadsheet->getSheetByName('Fr-01');
        if (!$ws) return;

        $fr01 = $data['fr01'] ?? null;
        if (!$fr01) return;

        $this->setCellValueSafely($ws, 'B6', $fr01['orgName'] ?? null, $range);
        $this->setCellValueSafely($ws, 'G4', $fr01['preparedBy'] ?? null, $range);
        $this->setCellValueSafely($ws, 'J4', $this->toBuddhistExcelDate($fr01['preparedDate'] ?? null), $range, true);

        $dataPeriod = $fr01['dataPeriod'] ?? [];
        $periodText = $this->toThaiBuddhistRange($dataPeriod['start'] ?? null, $dataPeriod['end'] ?? null);
        if ($periodText) $this->setCellValueSafely($ws, 'H36', $periodText, $range);

        $basePeriod = $fr01['baseYearPeriod'] ?? [];
        $baseText = $this->toThaiBuddhistRange($basePeriod['start'] ?? null, $basePeriod['end'] ?? null);
        if ($baseText) $this->setCellValueSafely($ws, 'H38', $baseText, $range);

        $this->setCellValueSafely($ws, 'H37', $fr01['production']['value'] ?? null, $range);
        $this->setCellValueSafely($ws, 'J37', $fr01['production']['unit'] ?? null, $range);
        $this->setCellValueSafely($ws, 'H39', $fr01['baseYearProduction']['value'] ?? null, $range);

        $products = is_array($fr01['orgInfoLines'] ?? null) ? $fr01['orgInfoLines'] : [];
        for ($i = 0; $i < 5; $i++) {
            $value = trim((string) ($products[$i] ?? ''));
            $this->setCellValueSafely($ws, 'G' . (41 + $i), $value ?: null, $range);
        }

        $this->setCellValueSafely($ws, 'I46', $fr01['contactAddress'] ?? null, $range);
        $this->setCellValueSafely($ws, 'I47', $this->toBuddhistExcelDate($fr01['registrationDate'] ?? null), $range, true);
    }

    private function writeFr02(Spreadsheet $spreadsheet, array $data, array $attachments, ?string $sheetName, ?string $range): void
    {
        if ($sheetName && $sheetName !== 'Fr-02') return;
        $ws = $spreadsheet->getSheetByName('Fr-02');
        if (!$ws) return;

        $imagePath = $this->resolveAttachmentPath($attachments, 'fr02_org_chart');
        if ($imagePath) {
            $this->addImage($ws, $imagePath, 'A6');
            return;
        }

        $fr02 = $data['fr02'] ?? null;
        if (!$fr02) return;

        $dataUrl = (string) ($fr02['orgChartImage'] ?? '');
        $this->addImageFromDataUrl($ws, $dataUrl, 'A6');
    }

    private function writeFr031(Spreadsheet $spreadsheet, array $data, array $attachments, ?string $sheetName, ?string $range): void
    {
        if ($sheetName && $sheetName !== 'Fr-03.1') return;
        $ws = $spreadsheet->getSheetByName('Fr-03.1');
        if (!$ws) return;

        $imagePath = $this->resolveAttachmentPath($attachments, 'fr031_org_structure');
        if ($imagePath) {
            $this->addImage($ws, $imagePath, 'A7');
        } else {
            $fr031 = $data['fr031'] ?? null;
            $dataUrl = (string) ($fr031['orgStructureImage'] ?? '');
            $this->addImageFromDataUrl($ws, $dataUrl, 'A7');
        }

        $fr031 = $data['fr031'] ?? null;
        if ($fr031) {
            $this->setCellValueSafely($ws, 'K35', $this->toBuddhistExcelDate($fr031['completedDate'] ?? null), $range, true);
        }
    }

    private function writeScope11Stationary(Spreadsheet $spreadsheet, array $data, ?string $sheetName, ?string $range): void
    {
        $mapping = $this->registry->getMapping(self::TEMPLATE_ID, 'scope11');
        $targetSheet = $mapping['sheet'] ?? '1.1 Stationary ';
        if ($sheetName && $sheetName !== $targetSheet) return;

        $ws = $spreadsheet->getSheetByName($targetSheet);
        if (!$ws) return;

        $monthCols = $mapping['monthColumns'] ?? ['E','F','G','H','I','J','K','L','M','N','O','P'];
        $rowsByFuel = $this->buildFuelMap($data, '1.1');

        $map = [];
        foreach (($mapping['rows'] ?? []) as $rowDef) {
            $fuelKey = $rowDef['fuelKey'] ?? null;
            $row = $rowDef['row'] ?? null;
            if ($fuelKey && $row) {
                $map[$fuelKey] = (int) $row;
            }
        }
        if (!$map) {
            $map = [
                'DIESEL_B7_STATIONARY' => 9,
                'GASOHOL_9195_STATIONARY' => 10,
                'ACETYLENE_TANK5_MAINT_2' => 12,
                'ACETYLENE_TANK5_MAINT_3' => 14,
            ];
        }

        foreach ($map as $fuelKey => $excelRow) {
            $months = $rowsByFuel[$fuelKey]['months'] ?? null;
            $this->writeMonthlyCells($ws, $excelRow, $monthCols, $months, $range);
        }
    }

    private function writeScope12Mobile(Spreadsheet $spreadsheet, array $data, ?string $sheetName, ?string $range): void
    {
        $mapping = $this->registry->getMapping(self::TEMPLATE_ID, 'scope12');
        $targetSheet = $mapping['sheet'] ?? '1.2 Mobile';
        if ($sheetName && $sheetName !== $targetSheet) return;

        $ws = $spreadsheet->getSheetByName($targetSheet);
        if (!$ws) return;

        $monthCols = $mapping['monthColumns'] ?? ['G','H','I','J','K','L','M','N','O','P','Q','R'];

        $rows = $this->buildFuelList($data, '1.2');
        $rowsByFuel = [];
        foreach ($rows as $row) {
            $rowsByFuel[$row['fuelKey']][] = $row;
        }

        $slots = $mapping['slots'] ?? [];
        $dieselB7Rows = $slots['DIESEL_B7_ONROAD']['rows'] ?? range(15, 41, 2);
        $dieselB10Rows = $slots['DIESEL_B10_ONROAD']['rows'] ?? range(16, 42, 2);
        $gasohol9195Rows = $slots['GASOHOL_9195']['rows'] ?? range(45, 55, 2);
        $gasoholE20Rows = $slots['GASOHOL_E20']['rows'] ?? range(46, 56, 2);
        $offroadForkliftRow = $mapping['single']['DIESEL_B7_OFFROAD'] ?? 58;

        $this->fillMobileSlots($ws, $monthCols, $dieselB7Rows, $rowsByFuel['DIESEL_B7_ONROAD'] ?? [], $range);
        $this->fillMobileSlots($ws, $monthCols, $dieselB10Rows, $rowsByFuel['DIESEL_B10_ONROAD'] ?? [], $range);
        $this->fillMobileSlots($ws, $monthCols, $gasohol9195Rows, $rowsByFuel['GASOHOL_9195'] ?? [], $range);
        $this->fillMobileSlots($ws, $monthCols, $gasoholE20Rows, $rowsByFuel['GASOHOL_E20'] ?? [], $range);

        $offroad = $rowsByFuel['DIESEL_B7_OFFROAD'][0] ?? null;
        if ($offroad) {
            $this->writeMonthlyCells($ws, $offroadForkliftRow, $monthCols, $offroad['months'] ?? null, $range);
        }
    }

    private function fillMobileSlots($ws, array $monthCols, array $slots, array $items, ?string $range): void
    {
        $used = [];
        $withSlot = array_values(array_filter($items, fn ($x) => isset($x['slotNo'])));
        usort($withSlot, fn ($a, $b) => ($a['slotNo'] ?? 0) <=> ($b['slotNo'] ?? 0));

        foreach ($withSlot as $item) {
            $idx = (int) ($item['slotNo'] ?? 0) - 1;
            if ($idx < 0 || $idx >= count($slots) || isset($used[$idx])) continue;
            $this->writeMonthlyCells($ws, $slots[$idx], $monthCols, $item['months'] ?? null, $range);
            $used[$idx] = true;
        }

        $withoutSlot = array_values(array_filter($items, fn ($x) => !isset($x['slotNo'])));
        $ptr = 0;
        foreach ($withoutSlot as $item) {
            while ($ptr < count($slots) && isset($used[$ptr])) $ptr++;
            if ($ptr >= count($slots)) break;
            $this->writeMonthlyCells($ws, $slots[$ptr], $monthCols, $item['months'] ?? null, $range);
            $used[$ptr] = true;
            $ptr++;
        }
    }

    private function buildFuelMap(array $data, string $subScope): array
    {
        $rows = $this->filterInventoryRows($data, $subScope);
        $out = [];
        foreach ($rows as $row) {
            $fuelKey = strtoupper(trim((string) ($row['fuelKey'] ?? '')));
            if (!$fuelKey) continue;
            $out[$fuelKey] = [
                'months' => $this->normalizeMonths($row),
            ];
        }
        return $out;
    }

    private function buildFuelList(array $data, string $subScope): array
    {
        $rows = $this->filterInventoryRows($data, $subScope);
        $out = [];
        foreach ($rows as $row) {
            $fuelKey = strtoupper(trim((string) ($row['fuelKey'] ?? '')));
            if (!$fuelKey) continue;
            $out[] = [
                'fuelKey' => $fuelKey,
                'months' => $this->normalizeMonths($row),
                'slotNo' => isset($row['slotNo']) ? (int) $row['slotNo'] : null,
            ];
        }
        return $out;
    }

    private function filterInventoryRows(array $data, string $subScope): array
    {
        $inventory = $data['inventory'] ?? [];
        if (!is_array($inventory)) return [];

        return array_values(array_filter($inventory, function ($row) use ($subScope) {
            $rowScope = (string) ($row['subScope'] ?? '');
            return $rowScope === $subScope;
        }));
    }

    private function normalizeMonths(array $row): array
    {
        if (isset($row['quantityMonthly']) && is_array($row['quantityMonthly'])) {
            return array_slice(array_map('floatval', $row['quantityMonthly']), 0, 12);
        }
        if (isset($row['months']) && is_array($row['months'])) {
            $out = array_fill(0, 12, 0);
            foreach ($row['months'] as $m) {
                $idx = (int) ($m['month'] ?? 0) - 1;
                if ($idx >= 0 && $idx < 12) {
                    $out[$idx] = (float) ($m['qty'] ?? 0);
                }
            }
            return $out;
        }
        return array_fill(0, 12, 0);
    }

    private function writeMonthlyCells($ws, int $row, array $monthCols, ?array $months, ?string $range): void
    {
        $months = $months ?? array_fill(0, 12, 0);
        foreach ($monthCols as $idx => $col) {
            $value = (float) ($months[$idx] ?? 0);
            $cellRef = $col . $row;
            $this->setCellValueSafely($ws, $cellRef, $value === 0.0 ? null : $value, $range, true);
        }
    }

    private function setCellValueSafely($ws, string $cellRef, $value, ?string $range, bool $numeric = false): void
    {
        if ($range && !$this->isCellInRange($cellRef, $range)) return;

        $cell = $ws->getCell($cellRef);
        if ($cell->isFormula()) return;

        if ($numeric && $value !== null && $value !== '') {
            $cell->setValueExplicit($value, DataType::TYPE_NUMERIC);
            return;
        }

        $cell->setValue($value === '' ? null : $value);
    }

    private function isCellInRange(string $cellRef, string $range): bool
    {
        $rangeInfo = $this->parseRange($range);
        [$col, $row] = Coordinate::coordinateFromString($cellRef);
        $colIndex = Coordinate::columnIndexFromString($col);

        return $row >= $rangeInfo['startRow']
            && $row <= $rangeInfo['endRow']
            && $colIndex >= $rangeInfo['startCol']
            && $colIndex <= $rangeInfo['endCol'];
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

    private function formatPreviewCell($cell): array
    {
        if ($cell->isFormula()) {
            $formula = ltrim((string) $cell->getValue(), '=');
            return ['display' => '=' . $formula, 'type' => 'formula'];
        }

        $value = $cell->getValue();
        if ($value === null || $value === '') {
            return ['display' => '', 'type' => 'text'];
        }
        if (is_numeric($value)) {
            $formatted = number_format((float) $value, 2, '.', ',');
            $formatted = rtrim(rtrim($formatted, '0'), '.');
            return ['display' => $formatted, 'type' => 'number'];
        }
        if ($value instanceof \DateTimeInterface) {
            return ['display' => $value->format('d/m/Y'), 'type' => 'text'];
        }
        return ['display' => (string) $value, 'type' => 'text'];
    }

    private function toBuddhistExcelDate($value): ?float
    {
        $date = $this->parseDate($value);
        if (!$date) return null;

        $year = (int) $date->format('Y');
        if ($year < 2400) {
            $date = (clone $date)->modify('+543 years');
        }
        return ExcelDate::PHPToExcel($date);
    }

    private function toThaiBuddhistRange($start, $end): string
    {
        $a = $this->parseDate($start);
        $b = $this->parseDate($end);
        if (!$a || !$b) return '';

        $fa = $this->formatThaiDateParts($a);
        $fb = $this->formatThaiDateParts($b);

        if ($fa['year'] === $fb['year']) {
            return "{$fa['day']} {$fa['month']} - {$fb['day']} {$fb['month']} {$fb['year']}";
        }

        return "{$fa['day']} {$fa['month']} {$fa['year']} - {$fb['day']} {$fb['month']} {$fb['year']}";
    }

    private function formatThaiDateParts(\DateTimeInterface $date): array
    {
        $monthNames = [
            1 => 'มกราคม',
            2 => 'กุมภาพันธ์',
            3 => 'มีนาคม',
            4 => 'เมษายน',
            5 => 'พฤษภาคม',
            6 => 'มิถุนายน',
            7 => 'กรกฎาคม',
            8 => 'สิงหาคม',
            9 => 'กันยายน',
            10 => 'ตุลาคม',
            11 => 'พฤศจิกายน',
            12 => 'ธันวาคม',
        ];

        $year = (int) $date->format('Y');
        if ($year < 2400) $year += 543;

        return [
            'day' => (string) (int) $date->format('j'),
            'month' => $monthNames[(int) $date->format('n')] ?? (string) $date->format('n'),
            'year' => (string) $year,
        ];
    }

    private function parseDate($value): ?\DateTimeInterface
    {
        if (!$value) return null;
        if ($value instanceof \DateTimeInterface) return $value;

        try {
            return new \DateTime((string) $value);
        } catch (\Exception) {
            return null;
        }
    }

    private function addImageFromDataUrl($ws, string $dataUrl, string $cell): void
    {
        $match = [];
        if (!preg_match('/^data:image\/(png|jpeg|jpg);base64,(.+)$/i', $dataUrl, $match)) {
            return;
        }
        $ext = strtolower($match[1]) === 'png' ? 'png' : 'jpg';
        $data = base64_decode($match[2], true);
        if ($data === false) return;

        $tmp = tempnam(sys_get_temp_dir(), 'xpanel_img_');
        if (!$tmp) return;
        $tmpFile = $tmp . '.' . $ext;
        file_put_contents($tmpFile, $data);

        $this->addImage($ws, $tmpFile, $cell);

        @unlink($tmpFile);
        @unlink($tmp);
    }

    private function addImage($ws, string $path, string $cell): void
    {
        if (!file_exists($path)) return;

        $drawing = new Drawing();
        $drawing->setPath($path);
        $drawing->setCoordinates($cell);
        $drawing->setResizeProportional(true);
        $drawing->setHeight(420);
        $drawing->setWorksheet($ws);
    }

    private function resolveAttachmentPath(array $attachments, string $kind): ?string
    {
        foreach ($attachments as $attachment) {
            if (($attachment instanceof Attachment) && $attachment->kind === $kind) {
                return storage_path('app/' . ltrim($attachment->path, '/'));
            }
        }
        return null;
    }
}
