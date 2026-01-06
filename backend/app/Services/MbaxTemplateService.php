<?php

namespace App\Services;

use App\Exceptions\TemplateNotFoundException;
use App\Models\Attachment;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Cell\DataValidation;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\NumberFormat;
use PhpOffice\PhpSpreadsheet\Worksheet\Drawing;
use PhpOffice\PhpSpreadsheet\Worksheet\Table;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

class MbaxTemplateService
{
    public const DEFAULT_TEMPLATE_ID = 'MBAX_TGO_11102567';
    private const SCOPE11_TABLE_START_ROW = 2;
    private const SCOPE11_TABLE_MAX_ROWS = 200;
    private const SCOPE11_DEFAULT_FUEL_KEYS = [
        'DIESEL_B7_STATIONARY',
        'GASOHOL_9195_STATIONARY',
        'ACETYLENE_TANK5_MAINT_2',
        'ACETYLENE_TANK5_MAINT_3',
    ];
    private const DEFAULT_BIODIESEL_DENSITY = 0.87;
    private const DEFAULT_ETHANOL_DENSITY = 0.79;
    private const FR041_META_SHEET = '_FR041_META';
    private const FR041_META_TABLE = 'tblFR041_Sections';
    private const FR041_AVAILABLE_COL = 'H';
    private const FR041_AVAILABLE_START_ROW = 2;
    private const FR041_AVAILABLE_END_ROW = 50;
    private const FR041_SHEET = 'Fr-04.1';
    private const FR041_SELECT_CELL = 'B2';
    private const FR041_SHEETNAME_CELL = 'C2';
    private const FR041_MONTHLY_START_ROW = 11;
    private const FR041_MONTHLY_END_ROW = 40;
    private const FR041_MONTHLY_START_COL = 'BA';
    private const FR041_SPLIT_START_COL = 'BQ';
    private const FR041_SUPPORTED_SECTION_CODES = ['1.1'];

    public function __construct(private TemplateRegistry $registry)
    {
    }

    public function loadTemplate(
        ?string $sheetName = null,
        ?string $range = null,
        ?string $templateId = null
    ): Spreadsheet
    {
        if (!class_exists(IOFactory::class)) {
            throw new \RuntimeException('PhpSpreadsheet not installed.');
        }
        $path = $this->resolveTemplatePath($templateId ?: self::DEFAULT_TEMPLATE_ID);

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
        ?string $range = null,
        ?string $templateId = null
    ): void {
        $this->writeFr01($spreadsheet, $data, $sheetName, $range);
        $this->writeFr02($spreadsheet, $data, $attachments, $sheetName, $range);
        $this->writeFr031($spreadsheet, $data, $attachments, $sheetName, $range);
        $this->writeScope11Stationary($spreadsheet, $data, $sheetName, $range, $templateId);
        $this->writeScope12Mobile($spreadsheet, $data, $sheetName, $range, $templateId);
        $this->writeFr041Meta($spreadsheet, $data);
        $this->writeFr041DynamicFormulas($spreadsheet);
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
                $addr = Coordinate::stringFromColumnIndex($c) . $r;
                $cell = $ws->getCell($addr);
                $cells[] = $this->formatPreviewCell($cell, $addr);
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

    public function resolveTemplatePath(string $templateId): string
    {
        $mapping = $this->registry->getTemplate($templateId);
        $envKey = $mapping['path']['env'] ?? 'MBAX_TEMPLATE_PATH';
        $fallbackRel = $mapping['path']['fallback'] ?? '../frontend/src/assets/templates/mbax/MBAX-TGO-11102567-Demo.xlsx';

        $envPath = env($envKey);
        if ($envPath && file_exists($envPath)) {
            return $envPath;
        }

        $templateDir = env('MBAX_TEMPLATE_DIR') ?: base_path('storage/app/templates/mbax');
        $attempted = [];

        $dirRegistryPath = rtrim($templateDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'template-registry.json';
        if (is_file($dirRegistryPath)) {
            $attempted[] = $dirRegistryPath;
            $raw = file_get_contents($dirRegistryPath);
            $decoded = json_decode($raw ?: '', true);
            if (is_array($decoded) && isset($decoded[$templateId]['filename'])) {
                $candidate = rtrim($templateDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $decoded[$templateId]['filename'];
                $attempted[] = $candidate;
                if (is_file($candidate)) {
                    return $candidate;
                }
            }
        }

        $fallback = base_path($fallbackRel);
        $attempted[] = $fallback;
        if (is_file($fallback)) {
            return $fallback;
        }

        $candidateA = rtrim($templateDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $templateId . '.xlsx';
        $attempted[] = $candidateA;
        if (is_file($candidateA)) {
            return $candidateA;
        }

        $hyphenId = str_replace('_', '-', $templateId);
        $candidateB = rtrim($templateDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $hyphenId . '.xlsx';
        $attempted[] = $candidateB;
        if (is_file($candidateB)) {
            return $candidateB;
        }

        $glob = glob(rtrim($templateDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . '*.xlsx') ?: [];
        $matches = array_filter($glob, function ($path) {
            $name = basename($path);
            return stripos($name, 'MBAX') === 0 && stripos($name, '11102567') !== false;
        });
        if ($matches) {
            usort($matches, function ($a, $b) {
                $aDemo = stripos(basename($a), 'demo') !== false;
                $bDemo = stripos(basename($b), 'demo') !== false;
                if ($aDemo === $bDemo) return strcmp($a, $b);
                return $aDemo ? 1 : -1;
            });
            foreach ($matches as $match) {
                $attempted[] = $match;
            }
            $preferred = $matches[0];
            if (is_file($preferred)) {
                return $preferred;
            }
        }

        throw new TemplateNotFoundException($templateId, $templateDir, $attempted);
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

    private function writeScope11Stationary(
        Spreadsheet $spreadsheet,
        array $data,
        ?string $sheetName,
        ?string $range,
        ?string $templateId
    ): void
    {
        $mapping = $this->registry->getMapping($templateId ?: self::DEFAULT_TEMPLATE_ID, 'scope11');
        $targetSheet = $mapping['sheet'] ?? '1.1 Stationary ';
        if ($sheetName && $sheetName !== $targetSheet) return;

        $wsData = $spreadsheet->getSheetByName('_DATA_SCOPE11');
        if (!$wsData) return;

        $rows = $this->buildScope11TableRows($data);
        $this->writeScope11StationaryTable($wsData, $rows);
    }

    private function buildScope11TableRows(array $data): array
    {
        $rows = array_values($this->filterInventoryRows($data, '1.1'));
        $byFuel = [];
        $byType = [];
        foreach ($rows as $idx => $row) {
            $fuelKey = $this->normalizeFuelKey($row);
            if ($fuelKey) {
                $byFuel[$fuelKey][] = $idx;
            }
            $fuelType = strtoupper(trim((string) ($row['fuelType'] ?? '')));
            if ($fuelType) {
                $byType[$fuelType][] = $idx;
            }
        }

        $defaultFuelTypes = [
            'DIESEL_B7_STATIONARY' => 'B7',
            'GASOHOL_9195_STATIONARY' => '91/95',
        ];

        $used = [];
        $output = [];
        foreach (self::SCOPE11_DEFAULT_FUEL_KEYS as $fuelKey) {
            $row = null;
            $idx = $byFuel[$fuelKey][0] ?? null;
            if ($idx !== null) {
                $row = $rows[$idx] ?? null;
                $used[$idx] = true;
            } elseif (isset($defaultFuelTypes[$fuelKey])) {
                $typeKey = $defaultFuelTypes[$fuelKey];
                $typeList = $byType[$typeKey] ?? [];
                foreach ($typeList as $typeIdx) {
                    if (isset($used[$typeIdx])) continue;
                    $row = $rows[$typeIdx] ?? null;
                    $used[$typeIdx] = true;
                    break;
                }
            }
            $output[] = $this->mapScope11TableRow($row, $fuelKey, true);
        }

        foreach ($rows as $idx => $row) {
            if (isset($used[$idx])) continue;
            $fuelKey = $this->normalizeFuelKey($row);
            if (!$fuelKey) continue;
            if (in_array($fuelKey, self::SCOPE11_DEFAULT_FUEL_KEYS, true)) continue;
            $output[] = $this->mapScope11TableRow($row, $fuelKey, false);
        }

        return $output;
    }

    private function mapScope11TableRow(?array $row, string $fuelKey, bool $forceRowId): array
    {
        $rowId = $forceRowId ? $fuelKey : (string) ($row['id'] ?? $fuelKey);
        $fuelType = $this->resolveScope11FuelType($row, $fuelKey);
        $months = $row ? $this->normalizeMonths($row) : array_fill(0, 12, 0);
        $spec = $this->extractOtherBlendSpec($row, $fuelType);

        return [
            'rowId' => $rowId,
            'itemLabel' => (string) ($row['itemLabel'] ?? ''),
            'fuelType' => $fuelType,
            'evidence' => (string) ($row['dataEvidence'] ?? ''),
            'unit' => (string) ($row['unit'] ?? ''),
            'months' => $months,
            'other' => $spec,
        ];
    }

    private function resolveScope11FuelType(?array $row, string $fuelKey): string
    {
        $raw = strtoupper(trim((string) ($row['fuelType'] ?? '')));
        if ($raw !== '') return $raw;

        $key = strtoupper(trim($fuelKey));
        if (str_contains($key, 'DIESEL_B7')) return 'B7';
        if (str_contains($key, 'DIESEL_B10')) return 'B10';
        if (str_contains($key, 'GASOHOL_9195') || str_contains($key, '9195')) return '91/95';
        if (str_contains($key, 'GASOHOL_E20') || str_contains($key, 'E20')) return 'E20';
        if (str_contains($key, 'LPG')) return 'LPG';
        if (str_contains($key, 'FUEL_OIL') || str_contains($key, 'OIL')) return 'น้ำมันเตา';
        return 'OTHER';
    }

    private function extractOtherBlendSpec(?array $row, string $fuelType): array
    {
        if (strtoupper($fuelType) !== 'OTHER') {
            return [
                'dieselPct' => null,
                'biodieselPct' => null,
                'gasolinePct' => null,
                'ethanolPct' => null,
                'biodieselDensity' => null,
                'ethanolDensity' => null,
            ];
        }

        $spec = $row['blendSpec'] ?? [];
        if (!is_array($spec)) $spec = [];
        $density = $spec['density'] ?? [];
        if (!is_array($density)) $density = [];

        $biodieselDensity =
            $density['biodieselKgPerL']
                ?? $spec['biodieselDensityKgPerL']
                ?? self::DEFAULT_BIODIESEL_DENSITY;
        $ethanolDensity =
            $density['ethanolKgPerL']
                ?? $spec['ethanolDensityKgPerL']
                ?? self::DEFAULT_ETHANOL_DENSITY;

        return [
            'dieselPct' => $spec['dieselPct'] ?? null,
            'biodieselPct' => $spec['biodieselPct'] ?? null,
            'gasolinePct' => $spec['gasolinePct'] ?? null,
            'ethanolPct' => $spec['ethanolPct'] ?? null,
            'biodieselDensity' => $biodieselDensity,
            'ethanolDensity' => $ethanolDensity,
        ];
    }

    private function writeScope11StationaryTable($ws, array $rows): void
    {
        $columns = [
            'RowId',
            'ItemLabel',
            'FuelType',
            'Evidence',
            'Unit',
            'M1',
            'M2',
            'M3',
            'M4',
            'M5',
            'M6',
            'M7',
            'M8',
            'M9',
            'M10',
            'M11',
            'M12',
            'OtherDieselPct',
            'OtherBiodieselPct',
            'OtherGasolinePct',
            'OtherEthanolPct',
            'OtherBiodieselDensityKgPerL',
            'OtherEthanolDensityKgPerL',
        ];

        $startRow = self::SCOPE11_TABLE_START_ROW;
        $endRow = $startRow + self::SCOPE11_TABLE_MAX_ROWS - 1;
        for ($r = $startRow; $r <= $endRow; $r++) {
            for ($c = 1; $c <= count($columns); $c++) {
                $cellRef = Coordinate::stringFromColumnIndex($c) . $r;
                $this->clearCellIfEditable($ws, $cellRef);
            }
        }

        foreach (array_values($rows) as $idx => $row) {
            if ($idx >= self::SCOPE11_TABLE_MAX_ROWS) break;
            $r = $startRow + $idx;
            $this->setCellValueSafely($ws, 'A' . $r, $row['rowId'] ?? null, null);
            $this->setCellValueSafely($ws, 'B' . $r, $row['itemLabel'] ?? null, null);
            $this->setCellValueSafely($ws, 'C' . $r, $row['fuelType'] ?? null, null);
            $this->setCellValueSafely($ws, 'D' . $r, $row['evidence'] ?? null, null);
            $this->setCellValueSafely($ws, 'E' . $r, $row['unit'] ?? null, null);

            $months = is_array($row['months'] ?? null) ? $row['months'] : [];
            for ($m = 0; $m < 12; $m++) {
                $value = (float) ($months[$m] ?? 0);
                $cellRef = Coordinate::stringFromColumnIndex(6 + $m) . $r;
                $this->setCellValueSafely($ws, $cellRef, $value ? $value : null, null, true);
            }

            $other = is_array($row['other'] ?? null) ? $row['other'] : [];
            $this->setCellValueSafely($ws, 'R' . $r, $other['dieselPct'] ?? null, null, true);
            $this->setCellValueSafely($ws, 'S' . $r, $other['biodieselPct'] ?? null, null, true);
            $this->setCellValueSafely($ws, 'T' . $r, $other['gasolinePct'] ?? null, null, true);
            $this->setCellValueSafely($ws, 'U' . $r, $other['ethanolPct'] ?? null, null, true);
            $this->setCellValueSafely($ws, 'V' . $r, $other['biodieselDensity'] ?? null, null, true);
            $this->setCellValueSafely($ws, 'W' . $r, $other['ethanolDensity'] ?? null, null, true);
        }
    }

    private function normalizeFuelKey(array $row): string
    {
        $fuelKey = $row['fuelKey'] ?? null;
        if (!$fuelKey && isset($row['meta']) && is_array($row['meta'])) {
            $fuelKey = $row['meta']['fuelKey'] ?? null;
        }
        return strtoupper(trim((string) ($fuelKey ?? '')));
    }

    private function findInventoryRow(array $data, string $fuelKey, string $subScope): ?array
    {
        $inventory = $data['inventory'] ?? [];
        if (!is_array($inventory)) return null;
        foreach ($inventory as $row) {
            if (!is_array($row)) continue;
            if ((string) ($row['subScope'] ?? '') !== $subScope) continue;
            $key = strtoupper(trim((string) ($row['fuelKey'] ?? '')));
            if ($key === strtoupper($fuelKey)) return $row;
        }
        return null;
    }

    private function writeScope12Mobile(
        Spreadsheet $spreadsheet,
        array $data,
        ?string $sheetName,
        ?string $range,
        ?string $templateId
    ): void
    {
        $mapping = $this->registry->getMapping($templateId ?: self::DEFAULT_TEMPLATE_ID, 'scope12');
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

    private function writeFr041Meta(Spreadsheet $spreadsheet, array $data): void
    {
        $sections = $this->buildFr041Sections($data);
        $ws = $this->ensureFr041MetaSheet($spreadsheet);

        $headers = ['sectionCode', 'sectionTitle', 'sheetName', 'hasData', 'sortOrder'];
        foreach ($headers as $idx => $header) {
            $this->setCellByColRow($ws, $idx + 1, 1, $header);
        }

        $maxRows = max(count($sections), 1);
        $clearRows = max($maxRows + 1, self::FR041_AVAILABLE_END_ROW);
        for ($row = 2; $row <= $clearRows; $row++) {
            for ($col = 1; $col <= count($headers); $col++) {
                $this->setCellByColRow($ws, $col, $row, null);
            }
        }

        foreach ($sections as $idx => $section) {
            $row = $idx + 2;
            $ws->setCellValue('A' . $row, $section['sectionCode']);
            $ws->setCellValue('B' . $row, $section['sectionTitle']);
            $ws->setCellValue('C' . $row, $section['sheetName']);
            $ws->setCellValue('D' . $row, $section['hasData'] ? 1 : 0);
            $ws->setCellValue('E' . $row, $section['sortOrder']);
        }

        $tableRange = 'A1:E' . ($maxRows + 1);
        $table = null;
        try {
            $table = $this->findTable($spreadsheet, $ws, self::FR041_META_TABLE);
        } catch (\RuntimeException $e) {
            $table = null;
        }
        if ($table) {
            $table->setRange($tableRange);
        } else {
            $ws->addTable(new Table($tableRange, self::FR041_META_TABLE));
        }

        for ($row = self::FR041_AVAILABLE_START_ROW; $row <= self::FR041_AVAILABLE_END_ROW; $row++) {
            $ws->setCellValue(self::FR041_AVAILABLE_COL . $row, null);
        }

        $available = array_values(array_filter($sections, fn ($s) => (bool) ($s['hasData'] ?? false)));
        usort($available, fn ($a, $b) => ($a['sortOrder'] ?? 0) <=> ($b['sortOrder'] ?? 0));
        foreach ($available as $idx => $section) {
            $row = self::FR041_AVAILABLE_START_ROW + $idx;
            if ($row > self::FR041_AVAILABLE_END_ROW) break;
            $ws->setCellValue(self::FR041_AVAILABLE_COL . $row, $section['sectionTitle']);
        }
    }

    private function writeFr041DynamicFormulas(Spreadsheet $spreadsheet): void
    {
        $ws = $spreadsheet->getSheetByName(self::FR041_SHEET);
        if (!$ws) return;

        $dv = $ws->getCell(self::FR041_SELECT_CELL)->getDataValidation();
        $dv->setType(DataValidation::TYPE_LIST);
        $dv->setAllowBlank(true);
        $dv->setShowDropDown(true);
        $dv->setFormula1('=_FR041_META!$H$2:$H$50');

        $sheetCellRef = '$C$2';
        $helper = '=IF(' . self::FR041_SELECT_CELL . '="","",XLOOKUP(' . self::FR041_SELECT_CELL . ',tblFR041_Sections[sectionTitle],tblFR041_Sections[sheetName],""))';
        $this->setFormulaIfWritable($ws, self::FR041_SHEETNAME_CELL, $helper);

        $startColIndex = Coordinate::columnIndexFromString(self::FR041_MONTHLY_START_COL);
        $splitColIndex = Coordinate::columnIndexFromString(self::FR041_SPLIT_START_COL);

        for ($row = self::FR041_MONTHLY_START_ROW; $row <= self::FR041_MONTHLY_END_ROW; $row++) {
            $rowExpr = 'ROW()-2';
            $itemCol = Coordinate::stringFromColumnIndex($startColIndex) . $row;
            $this->setFormulaIfWritable($ws, $itemCol, $this->buildIndirectFormula($sheetCellRef, 'A', $rowExpr));

            $columns = ['B', 'C', 'D'];
            foreach ($columns as $offset => $sourceCol) {
                $targetCol = Coordinate::stringFromColumnIndex($startColIndex + 1 + $offset) . $row;
                $this->setFormulaIfWritable(
                    $ws,
                    $targetCol,
                    $this->buildIndirectFormula($sheetCellRef, $sourceCol, $rowExpr, $itemCol)
                );
            }

            for ($i = 0; $i < 12; $i++) {
                $monthCol = Coordinate::stringFromColumnIndex($startColIndex + 4 + $i) . $row;
                $sourceCol = Coordinate::stringFromColumnIndex(5 + $i);
                $this->setFormulaIfWritable(
                    $ws,
                    $monthCol,
                    $this->buildIndirectFormula($sheetCellRef, $sourceCol, $rowExpr, $itemCol)
                );
            }

            $splitRowExpr = 'ROW()-7';
            $splitSourceCols = ['G', 'H', 'I', 'J', 'K', 'L'];
            foreach ($splitSourceCols as $idx => $sourceCol) {
                $targetCol = Coordinate::stringFromColumnIndex($splitColIndex + $idx) . $row;
                $this->setFormulaIfWritable(
                    $ws,
                    $targetCol,
                    $this->buildSplitFormula($sheetCellRef, $itemCol, $sourceCol, $splitRowExpr)
                );
            }
        }
    }

    private function ensureFr041MetaSheet(Spreadsheet $spreadsheet): Worksheet
    {
        $ws = $spreadsheet->getSheetByName(self::FR041_META_SHEET);
        if ($ws) {
            $ws->setSheetState(Worksheet::SHEETSTATE_HIDDEN);
            return $ws;
        }

        $ws = new Worksheet($spreadsheet, self::FR041_META_SHEET);
        $ws->setSheetState(Worksheet::SHEETSTATE_HIDDEN);
        $spreadsheet->addSheet($ws);
        return $ws;
    }

    private function buildFr041Sections(array $data): array
    {
        $defs = $this->fr041SectionDefinitions();
        $sections = [];
        foreach ($defs as $def) {
            $sheetName = $def['sheetName'] ?? '';
            $isSupported = in_array($def['sectionCode'], self::FR041_SUPPORTED_SECTION_CODES, true);
            $hasData = $isSupported && $sheetName !== '' && $this->sectionHasData($data, $def['sectionCode']);
            $sections[] = [
                'sectionCode' => $def['sectionCode'],
                'sectionTitle' => $def['sectionTitle'],
                'sheetName' => $sheetName,
                'hasData' => $hasData,
                'sortOrder' => $def['sortOrder'],
            ];
        }
        return $sections;
    }

    private function fr041SectionDefinitions(): array
    {
        return [
            ['sectionCode' => '1.1', 'sectionTitle' => '1.1 Stationary combustion', 'sheetName' => '1.1 Stationary ', 'sortOrder' => 110],
            ['sectionCode' => '1.2', 'sectionTitle' => '1.2 Mobile combustion', 'sheetName' => '1.2 Mobile', 'sortOrder' => 120],
            ['sectionCode' => '1.4.1', 'sectionTitle' => '1.4.1 Fugitive emissions', 'sheetName' => '1.4.1 สารทำความเย็น', 'sortOrder' => 141],
            ['sectionCode' => '1.4.2', 'sectionTitle' => '1.4.2 Fire suppression', 'sheetName' => '1.4.2 สารดับเพลิง', 'sortOrder' => 142],
            ['sectionCode' => '1.4.3', 'sectionTitle' => '1.4.3 Septic', 'sheetName' => '1.4.3 Septic', 'sortOrder' => 143],
            ['sectionCode' => '1.4.4', 'sectionTitle' => '1.4.4 Fertilizer', 'sheetName' => '1.4.4 ปุ๋ย', 'sortOrder' => 144],
            ['sectionCode' => '1.4.5', 'sectionTitle' => '1.4.5 WWTP', 'sheetName' => '1.4.5 ระบบบำบัดน้ำเสีย WWTP', 'sortOrder' => 145],
            ['sectionCode' => '2.1', 'sectionTitle' => '2.1 Purchased Electricity', 'sheetName' => 'Scope 2.1 Purchased Electricity', 'sortOrder' => 210],
            ['sectionCode' => '3.1.1', 'sectionTitle' => '3.1.1 Purchased Goods', 'sheetName' => 'Scope 3.1.1 วัตถุดิบผลิต', 'sortOrder' => 311],
            ['sectionCode' => '3.1.2', 'sectionTitle' => '3.1.2 Water', 'sheetName' => 'Scope 3.1.2 น้ำประปา', 'sortOrder' => 312],
            ['sectionCode' => '3.1.3', 'sectionTitle' => '3.1.3 Paper', 'sheetName' => 'Scope 3.1.3 กระดาษ A4', 'sortOrder' => 313],
            ['sectionCode' => '3.1.4', 'sectionTitle' => '3.1.4 Employee transport', 'sheetName' => 'Scope 3.1.4 จ้างเหมารถพนักงาน', 'sortOrder' => 314],
            ['sectionCode' => '3.2', 'sectionTitle' => '3.2 Capital goods', 'sheetName' => '', 'sortOrder' => 320],
            ['sectionCode' => '3.3', 'sectionTitle' => '3.3 Fuel and energy-related', 'sheetName' => '', 'sortOrder' => 330],
            ['sectionCode' => '3.4', 'sectionTitle' => '3.4 Upstream transportation', 'sheetName' => 'Scope 3.4', 'sortOrder' => 340],
            ['sectionCode' => '3.5', 'sectionTitle' => '3.5 Waste generated', 'sheetName' => 'Scope 3.5', 'sortOrder' => 350],
            ['sectionCode' => '3.6', 'sectionTitle' => '3.6 Business travel', 'sheetName' => '', 'sortOrder' => 360],
            ['sectionCode' => '3.7', 'sectionTitle' => '3.7 Employee commuting', 'sheetName' => 'Scope 3.7', 'sortOrder' => 370],
            ['sectionCode' => '3.8', 'sectionTitle' => '3.8 Upstream leased assets', 'sheetName' => '', 'sortOrder' => 380],
            ['sectionCode' => '3.9', 'sectionTitle' => '3.9 Downstream transport', 'sheetName' => 'Scope 3.9', 'sortOrder' => 390],
            ['sectionCode' => '3.10', 'sectionTitle' => '3.10 Processing of sold products', 'sheetName' => '', 'sortOrder' => 3100],
            ['sectionCode' => '3.11', 'sectionTitle' => '3.11 Use of sold products', 'sheetName' => '', 'sortOrder' => 3110],
            ['sectionCode' => '3.12', 'sectionTitle' => '3.12 End-of-life', 'sheetName' => 'Scope 3.12', 'sortOrder' => 3120],
            ['sectionCode' => '3.13', 'sectionTitle' => '3.13 Downstream leased assets', 'sheetName' => '', 'sortOrder' => 3130],
            ['sectionCode' => '3.14', 'sectionTitle' => '3.14 Franchises', 'sheetName' => '', 'sortOrder' => 3140],
            ['sectionCode' => '3.15', 'sectionTitle' => '3.15 Investments', 'sheetName' => '', 'sortOrder' => 3150],
        ];
    }

    private function sectionHasData(array $data, string $sectionCode): bool
    {
        $inventory = $data['inventory'] ?? [];
        if (!is_array($inventory)) return false;

        foreach ($inventory as $row) {
            if (!is_array($row)) continue;
            if ((string) ($row['subScope'] ?? '') !== $sectionCode) continue;
            if ($this->rowHasData($row)) return true;
        }

        return false;
    }

    private function rowHasData(array $row): bool
    {
        $label = trim((string) ($row['itemLabel'] ?? ''));
        $fuelKey = trim((string) ($row['fuelKey'] ?? ''));
        if ($label === '' && $fuelKey === '') return false;

        if (isset($row['quantityPerYear']) && $this->isNonEmptyValue($row['quantityPerYear'])) {
            return true;
        }

        if (isset($row['quantityMonthly']) && is_array($row['quantityMonthly'])) {
            foreach ($row['quantityMonthly'] as $value) {
                if ($this->isNonEmptyValue($value)) return true;
            }
        }

        if (isset($row['months']) && is_array($row['months'])) {
            foreach ($row['months'] as $month) {
                $value = is_array($month) ? ($month['qty'] ?? null) : $month;
                if ($this->isNonEmptyValue($value)) return true;
            }
        }

        return false;
    }

    private function isNonEmptyValue($value): bool
    {
        if ($value === null || $value === '') return false;
        if (is_numeric($value)) return (float) $value !== 0.0;
        return true;
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

    private function setFormulaIfWritable($ws, string $cellRef, string $formula): void
    {
        $cell = $ws->getCell($cellRef);
        if ($cell->isFormula()) return;
        if ($cell->getValue() !== null && $cell->getValue() !== '') return;
        $cell->setValue($formula);
    }

    private function setCellByColRow(Worksheet $sheet, int $col, int $row, $value): void
    {
        $cell = Coordinate::stringFromColumnIndex($col) . $row;
        $sheet->setCellValue($cell, $value);
    }

    private function buildIndirectFormula(string $sheetCellRef, string $sourceCol, string $rowExpr, ?string $guardCell = null): string
    {
        $quote = "'";
        $guard = $guardCell ?: $sheetCellRef;
        return '=IF(' . $guard . '="","",INDIRECT("' . $quote . '"&' . $sheetCellRef . '&"' . $quote . '!' . $sourceCol . '"&' . $rowExpr . '))';
    }

    private function buildSplitFormula(string $sheetCellRef, string $itemCell, string $sourceCol, string $rowExpr): string
    {
        $quote = "'";
        return '=IF(AND(' . $itemCell . '<>"",' . $sheetCellRef . '="1.1 Stationary "),INDIRECT("' . $quote . '"&' . $sheetCellRef . '&"' . $quote . '!' . $sourceCol . '"&' . $rowExpr . '),"")';
    }

    private function clearScope11StationaryInputs($ws, array $monthCols, array $rows, array $summaryRows, array $summaryCols): void
    {
        foreach ($summaryRows as $row) {
            foreach ($summaryCols as $col) {
                $this->clearCellIfEditable($ws, $col . $row);
            }
        }
        foreach ($rows as $row) {
            foreach (['A', 'B', 'C'] as $col) {
                $this->clearCellIfEditable($ws, $col . $row);
            }
            foreach ($monthCols as $col) {
                $this->clearCellIfEditable($ws, $col . $row);
            }
        }
    }

    private function clearCellIfEditable($ws, string $cellRef): void
    {
        $cell = $ws->getCell($cellRef);
        if ($cell->isFormula()) return;
        $cell->setValue(null);
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

    private function formatPreviewCell($cell, string $addr): array
    {
        $raw = $cell->getValue();
        $formula = $cell->isFormula() ? (string) $cell->getValue() : null;
        $computed = null;
        $display = null;
        $calcError = null;

        if ($cell->isFormula()) {
            try {
                $computed = $cell->getCalculatedValue();
            } catch (\Throwable $e) {
                $calcError = $e->getMessage();
            }
        } else {
            $computed = $raw;
        }

        $formatCode = $cell->getStyle()->getNumberFormat()->getFormatCode();
        $computedValue = $computed instanceof \PhpOffice\PhpSpreadsheet\RichText\RichText
            ? $computed->getPlainText()
            : $computed;
        $rawValue = $raw instanceof \PhpOffice\PhpSpreadsheet\RichText\RichText
            ? $raw->getPlainText()
            : $raw;

        if ($computedValue === null || $computedValue === '') {
            $display = '';
        } else {
            $display = NumberFormat::toFormattedString($computedValue, $formatCode);
        }
        if ($calcError) {
            $display = $formula ?? (is_string($rawValue) ? $rawValue : (string) $rawValue);
        }

        $type = 'text';
        if ($cell->isFormula()) {
            $type = 'formula';
        } elseif (is_numeric($computedValue)) {
            $type = 'number';
        }

        return [
            'addr' => $addr,
            'raw' => $rawValue,
            'formula' => $formula,
            'computed' => $computedValue,
            'display' => $display,
            'calcError' => $calcError,
            'type' => $type,
        ];
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
