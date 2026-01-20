<?php

namespace App\Services\Export;

use App\Models\Cycle;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

class FullWorkbookExportService
{
    private array $mappingCache = [];

    /**
     * @return array{ok: bool, warnings: array<int, array{code: string, message: string}>}
     */
    public function apply(Cycle $cycle, Spreadsheet $spreadsheet, string $templateId): array
    {
        $mapping = $this->loadMapping($templateId);
        if (!$mapping) {
            return [
                'ok' => true,
                'warnings' => [
                    [
                        'code' => 'MAPPING_MISSING',
                        'message' => "No export mapping found for templateId={$templateId}.",
                    ],
                ],
            ];
        }

        $data = is_array($cycle->data_json ?? null) ? $cycle->data_json : [];
        $writers = is_array($mapping['writers'] ?? null) ? $mapping['writers'] : [];
        $screenRowMap = [];

        if (is_array($writers['fr01'] ?? null)) {
            $this->writeFr01($spreadsheet, $data, $writers['fr01']);
        }

        if (is_array($writers['scope12'] ?? null)) {
            $this->writeScope12Mobile($spreadsheet, $data, $writers['scope12']);
        }

        if (is_array($writers['scope141'] ?? null)) {
            $this->writeScope141Refrigerants($spreadsheet, $data, $writers['scope141']);
        }

        if (is_array($writers['scope142'] ?? null)) {
            $this->writeScope142FireSuppression($spreadsheet, $data, $writers['scope142']);
        }

        if (is_array($writers['scope143'] ?? null)) {
            $this->writeScope143Septic($spreadsheet, $data, $writers['scope143']);
        }

        if (is_array($writers['scope144'] ?? null)) {
            $this->writeScope144Fertilizer($spreadsheet, $data, $writers['scope144']);
        }

        if (is_array($writers['scope145'] ?? null)) {
            $this->writeScope145Wwtp($spreadsheet, $data, $writers['scope145']);
        }

        if (is_array($writers['scope21'] ?? null)) {
            $this->writeScope21PurchasedElectricity($spreadsheet, $data, $writers['scope21']);
        }

        if (is_array($writers['screenScope3'] ?? null)) {
            $screenRowMap = $this->writeScreenScope3($spreadsheet, $data, $writers['screenScope3']);
        }

        if (is_array($writers['fr032'] ?? null)) {
            $this->writeFr032($spreadsheet, $data, $writers['fr032'], $screenRowMap);
        }

        if (is_array($writers['fr041Scope3'] ?? null)) {
            $this->writeFr041Scope3($spreadsheet, $data, $writers['fr041Scope3'], $screenRowMap);
        }

        return ['ok' => true, 'warnings' => []];
    }

    private function loadMapping(string $templateId): array
    {
        $templateId = trim($templateId);
        if ($templateId === '') return [];

        if (isset($this->mappingCache[$templateId])) {
            return $this->mappingCache[$templateId];
        }

        $rel = match ($templateId) {
            'MBAX_TGO_11102567' => 'resources/export/mappings/mbax_tgo_demo.json',
            'VSHEET_CFO' => 'resources/export/mappings/vsheetcfo_base_2025.json',
            'VSHEET_CFO_2025' => 'resources/export/mappings/vsheetcfo_base_2025.json',
            'VSHEET_CFO_2026' => 'resources/export/mappings/vsheetcfo_base_2026.json',
            default => '',
        };

        if ($rel === '') {
            $this->mappingCache[$templateId] = [];
            return [];
        }

        $path = base_path($rel);
        if (!is_file($path)) {
            $this->mappingCache[$templateId] = [];
            return [];
        }

        $decoded = json_decode(file_get_contents($path) ?: '', true);
        $this->mappingCache[$templateId] = is_array($decoded) ? $decoded : [];
        return $this->mappingCache[$templateId];
    }

    private function writeFr01(Spreadsheet $spreadsheet, array $data, array $cfg): void
    {
        $ws = $spreadsheet->getSheetByName((string) ($cfg['sheet'] ?? 'Fr-01'));
        if (!$ws) return;

        $fr01 = is_array($data['fr01'] ?? null) ? $data['fr01'] : [];
        if (!$fr01) return;

        $cells = is_array($cfg['cells'] ?? null) ? $cfg['cells'] : [];

        $this->setCellIfWritable($ws, (string) ($cells['orgName'] ?? 'B6'), $fr01['orgName'] ?? null);
        $this->setCellIfWritable($ws, (string) ($cells['preparedBy'] ?? 'G4'), $fr01['preparedBy'] ?? null);
        $this->setCellIfWritable(
            $ws,
            (string) ($cells['preparedDate'] ?? 'J4'),
            $this->toBuddhistDate($fr01['preparedDate'] ?? null),
            true
        );

        $dataPeriod = is_array($fr01['dataPeriod'] ?? null) ? $fr01['dataPeriod'] : [];
        $periodText = $this->toThaiBuddhistRange($dataPeriod['start'] ?? null, $dataPeriod['end'] ?? null);
        $this->setCellIfWritable($ws, (string) ($cells['periodText'] ?? 'H36'), $periodText ?: null);

        $basePeriod = is_array($fr01['baseYearPeriod'] ?? null) ? $fr01['baseYearPeriod'] : [];
        $baseText = $this->toThaiBuddhistRange($basePeriod['start'] ?? null, $basePeriod['end'] ?? null);
        $this->setCellIfWritable($ws, (string) ($cells['baseYearText'] ?? 'H38'), $baseText ?: null);

        $prod = is_array($fr01['production'] ?? null) ? $fr01['production'] : [];
        $this->setCellIfWritable($ws, (string) ($cells['productionValue'] ?? 'H37'), $prod['value'] ?? null, true);
        $this->setCellIfWritable($ws, (string) ($cells['productionUnit'] ?? 'J37'), $prod['unit'] ?? null);

        $baseProd = is_array($fr01['baseYearProduction'] ?? null) ? $fr01['baseYearProduction'] : [];
        $this->setCellIfWritable(
            $ws,
            (string) ($cells['baseYearProductionValue'] ?? 'H39'),
            $baseProd['value'] ?? null,
            true
        );

        $lines = is_array($fr01['orgInfoLines'] ?? null) ? $fr01['orgInfoLines'] : [];
        $startRow = (int) ($cells['orgInfoStartRow'] ?? 41);
        $col = (string) ($cells['orgInfoColumn'] ?? 'G');
        $max = (int) ($cells['orgInfoMaxLines'] ?? 5);
        for ($i = 0; $i < $max; $i++) {
            $text = trim((string) ($lines[$i] ?? ''));
            $this->setCellIfWritable($ws, $col . ($startRow + $i), $text !== '' ? $text : null);
        }

        $this->setCellIfWritable($ws, (string) ($cells['contactAddress'] ?? 'I46'), $fr01['contactAddress'] ?? null);
        $this->setCellIfWritable(
            $ws,
            (string) ($cells['registrationDate'] ?? 'I47'),
            $this->toBuddhistDate($fr01['registrationDate'] ?? null),
            true
        );
    }

    private function writeScope12Mobile(Spreadsheet $spreadsheet, array $data, array $cfg): void
    {
        $ws = $spreadsheet->getSheetByName((string) ($cfg['sheet'] ?? '1.2 Mobile'));
        if (!$ws) return;

        $monthCols = array_values($cfg['monthColumns'] ?? []);
        if (count($monthCols) !== 12) return;

        $slots = is_array($cfg['slots'] ?? null) ? $cfg['slots'] : [];
        $single = is_array($cfg['single'] ?? null) ? $cfg['single'] : [];

        $dieselB7Rows = array_values($slots['DIESEL_B7_ONROAD']['rows'] ?? []);
        $dieselB10Rows = array_values($slots['DIESEL_B10_ONROAD']['rows'] ?? []);
        $gasohol9195Rows = array_values($slots['GASOHOL_9195']['rows'] ?? []);
        $gasoholE20Rows = array_values($slots['GASOHOL_E20']['rows'] ?? []);
        $offroadForkliftRow = (int) ($single['DIESEL_B7_OFFROAD'] ?? 58);

        $clearRows = array_values(
            array_unique(
                array_merge(
                    $dieselB7Rows,
                    $dieselB10Rows,
                    $gasohol9195Rows,
                    $gasoholE20Rows,
                    [$offroadForkliftRow]
                )
            )
        );
        foreach ($clearRows as $r) {
            foreach ($monthCols as $col) {
                $this->setCellIfWritable($ws, $col . $r, null, true);
            }
        }

        $rows = $this->filterInventory($data, 1, '1.2');
        $byFuel = [];
        foreach ($rows as $row) {
            $fuelKey = strtoupper(trim((string) ($row['fuelKey'] ?? '')));
            if ($fuelKey === '') continue;
            $byFuel[$fuelKey][] = $row;
        }

        $this->fillSlots($ws, $monthCols, $dieselB7Rows, $byFuel['DIESEL_B7_ONROAD'] ?? []);
        $this->fillSlots($ws, $monthCols, $dieselB10Rows, $byFuel['DIESEL_B10_ONROAD'] ?? []);
        $this->fillSlots($ws, $monthCols, $gasohol9195Rows, $byFuel['GASOHOL_9195'] ?? []);
        $this->fillSlots($ws, $monthCols, $gasoholE20Rows, $byFuel['GASOHOL_E20'] ?? []);

        $offroad = ($byFuel['DIESEL_B7_OFFROAD'][0] ?? null);
        if (is_array($offroad)) {
            $months = $this->normalizeMonthArray($offroad['quantityMonthly'] ?? []);
            for ($i = 0; $i < 12; $i++) {
                $this->setCellIfWritable($ws, $monthCols[$i] . $offroadForkliftRow, $months[$i], true);
            }
        }
    }

    private function writeScope141Refrigerants(Spreadsheet $spreadsheet, array $data, array $cfg): void
    {
        $ws = $spreadsheet->getSheetByName((string) ($cfg['sheet'] ?? '1.4.1 สารทำความเย็น'));
        if (!$ws) return;

        $monthCols = array_values($cfg['monthColumns'] ?? []);
        if (count($monthCols) !== 12) return;

        $rowMap = is_array($cfg['rows'] ?? null) ? $cfg['rows'] : [];
        $cols = is_array($cfg['columns'] ?? null) ? $cfg['columns'] : [];

        $inv = $this->filterInventory($data, 1, '1.4.1');
        $byFuelKey = [];
        foreach ($inv as $row) {
            $fuelKey = strtoupper(trim((string) ($row['fuelKey'] ?? '')));
            if ($fuelKey === '') continue;
            $byFuelKey[$fuelKey] = $row;
        }

        foreach ($rowMap as $fuelKey => $excelRow) {
            $excelRow = (int) $excelRow;
            if ($excelRow <= 0) continue;

            $item = is_array($byFuelKey[strtoupper($fuelKey)] ?? null) ? $byFuelKey[strtoupper($fuelKey)] : null;
            if ($item) {
                $this->setCellIfWritable(
                    $ws,
                    ((string) ($cols['itemLabel'] ?? 'A')) . $excelRow,
                    $item['itemLabel'] ?? null
                );
                $this->setCellIfWritable($ws, ((string) ($cols['location'] ?? 'B')) . $excelRow, $item['remark'] ?? null);
                $this->setCellIfWritable(
                    $ws,
                    ((string) ($cols['evidence'] ?? 'C')) . $excelRow,
                    $item['dataEvidence'] ?? null
                );

                $months = $this->normalizeMonthArray($item['quantityMonthly'] ?? []);
                for ($m = 0; $m < 12; $m++) {
                    $this->setCellIfWritable($ws, $monthCols[$m] . $excelRow, $months[$m], true);
                }
            } else {
                for ($m = 0; $m < 12; $m++) {
                    $this->setCellIfWritable($ws, $monthCols[$m] . $excelRow, null, true);
                }
            }
        }
    }

    private function writeScope142FireSuppression(Spreadsheet $spreadsheet, array $data, array $cfg): void
    {
        $ws = $spreadsheet->getSheetByName((string) ($cfg['sheet'] ?? '1.4.2 สารดับเพลิง'));
        if (!$ws) return;

        $startRow = (int) ($cfg['startRow'] ?? 4);
        $maxRows = (int) ($cfg['maxRows'] ?? 10);
        $monthCols = array_values($cfg['monthColumns'] ?? []);
        $cols = is_array($cfg['columns'] ?? null) ? $cfg['columns'] : [];

        if (count($monthCols) !== 12) return;

        for ($i = 0; $i < $maxRows; $i++) {
            $r = $startRow + $i;
            foreach (['A', 'B', 'C', 'D'] as $col) {
                $this->setCellIfWritable($ws, $col . $r, null);
            }
            for ($m = 0; $m < 12; $m++) {
                $this->setCellIfWritable($ws, $monthCols[$m] . $r, null, true);
            }
        }

        $items = $this->filterInventory($data, 1, '1.4.2');
        usort($items, fn ($a, $b) => (int) ($a['slotNo'] ?? 0) <=> (int) ($b['slotNo'] ?? 0));

        for ($i = 0; $i < min(count($items), $maxRows); $i++) {
            $it = $items[$i];
            if (!is_array($it)) continue;

            $r = $startRow + $i;
            $this->setCellIfWritable(
                $ws,
                ((string) ($cols['itemLabel'] ?? 'A')) . $r,
                $it['itemLabel'] ?? null
            );
            $this->setCellIfWritable($ws, ((string) ($cols['location'] ?? 'B')) . $r, $it['remark'] ?? null);
            $this->setCellIfWritable($ws, ((string) ($cols['evidence'] ?? 'C')) . $r, $it['dataEvidence'] ?? null);
            $this->setCellIfWritable($ws, ((string) ($cols['unit'] ?? 'D')) . $r, $it['unit'] ?? null);

            $months = $this->normalizeMonthArray($it['quantityMonthly'] ?? []);
            for ($m = 0; $m < 12; $m++) {
                $this->setCellIfWritable($ws, $monthCols[$m] . $r, $months[$m], true);
            }
        }
    }

    private function writeScope143Septic(Spreadsheet $spreadsheet, array $data, array $cfg): void
    {
        $ws = $spreadsheet->getSheetByName((string) ($cfg['sheet'] ?? '1.4.3 Septic'));
        if (!$ws) return;

        $label = (string) ($cfg['monthLabel'] ?? 'ม.ค.');
        $labelCol = (string) ($cfg['monthLabelColumn'] ?? 'A');
        $peopleCol = (string) ($cfg['peopleColumn'] ?? 'B');
        $offCol = (string) ($cfg['daysOffColumn'] ?? 'E');
        $maxGroups = (int) ($cfg['maxGroups'] ?? 4);

        $janRows = [];
        for ($r = 1; $r <= 300; $r++) {
            $text = $this->cellText($ws->getCell($labelCol . $r)->getValue());
            if ($text === $label) {
                $janRows[] = $r;
            }
        }
        if (!$janRows) return;

        $items = $this->filterInventory($data, 1, '1.4.3');

        $find = function (string $fuelKey, int $slotNo) use ($items) {
            $fuelKey = strtoupper($fuelKey);
            foreach ($items as $row) {
                if (!is_array($row)) continue;
                if (strtoupper(trim((string) ($row['fuelKey'] ?? ''))) !== $fuelKey) continue;
                if ((int) ($row['slotNo'] ?? 0) !== $slotNo) continue;
                return $row;
            }
            return null;
        };

        $groups = min($maxGroups, count($janRows));
        for ($g = 0; $g < $groups; $g++) {
            $janRow = (int) $janRows[$g];
            $groupNo = $g + 1;

            for ($m = 0; $m < 12; $m++) {
                $this->setCellIfWritable($ws, $peopleCol . ($janRow + $m), null, true);
                $this->setCellIfWritable($ws, $offCol . ($janRow + $m), null, true);
            }

            $people = $find('SEPTIC_P', $groupNo);
            $off = $find('SEPTIC_OFF', $groupNo);
            $peopleMonths = $this->normalizeMonthArray($people['quantityMonthly'] ?? []);
            $offMonths = $this->normalizeMonthArray($off['quantityMonthly'] ?? []);

            for ($m = 0; $m < 12; $m++) {
                $this->setCellIfWritable($ws, $peopleCol . ($janRow + $m), $peopleMonths[$m], true);
                $this->setCellIfWritable($ws, $offCol . ($janRow + $m), $offMonths[$m], true);
            }
        }
    }

    private function writeScope144Fertilizer(Spreadsheet $spreadsheet, array $data, array $cfg): void
    {
        $ws = $spreadsheet->getSheetByName((string) ($cfg['sheet'] ?? '1.4.4 ปุ๋ย'));
        if (!$ws) return;

        $startRow = (int) ($cfg['startRow'] ?? 4);
        $maxRows = (int) ($cfg['maxRows'] ?? 10);
        $monthCols = array_values($cfg['monthColumns'] ?? []);
        if (count($monthCols) !== 12) return;

        $cols = is_array($cfg['columns'] ?? null) ? $cfg['columns'] : [];

        for ($i = 0; $i < $maxRows; $i++) {
            $r = $startRow + $i;
            foreach (['A', 'B', 'C'] as $col) {
                $this->setCellIfWritable($ws, $col . $r, null);
            }
            for ($m = 0; $m < 12; $m++) {
                $this->setCellIfWritable($ws, $monthCols[$m] . $r, null, true);
            }
        }

        $items = $this->filterInventory($data, 1, '1.4.4');
        usort($items, fn ($a, $b) => (int) ($a['slotNo'] ?? 0) <=> (int) ($b['slotNo'] ?? 0));

        for ($i = 0; $i < min(count($items), $maxRows); $i++) {
            $it = $items[$i];
            if (!is_array($it)) continue;

            $r = $startRow + $i;
            $this->setCellIfWritable($ws, ((string) ($cols['itemLabel'] ?? 'A')) . $r, $it['itemLabel'] ?? null);
            $this->setCellIfWritable($ws, ((string) ($cols['evidence'] ?? 'B')) . $r, $it['dataEvidence'] ?? null);
            $this->setCellIfWritable($ws, ((string) ($cols['unit'] ?? 'C')) . $r, $it['unit'] ?? null);

            $months = $this->normalizeMonthArray($it['quantityMonthly'] ?? []);
            for ($m = 0; $m < 12; $m++) {
                $this->setCellIfWritable($ws, $monthCols[$m] . $r, $months[$m], true);
            }
        }
    }

    private function writeScope145Wwtp(Spreadsheet $spreadsheet, array $data, array $cfg): void
    {
        $ws = $spreadsheet->getSheetByName((string) ($cfg['sheet'] ?? '1.4.5 ระบบบำบัดน้ำเสีย WWTP'));
        if (!$ws) return;

        $quality = is_array($cfg['quality'] ?? null) ? $cfg['quality'] : [];
        $meter = is_array($cfg['meter'] ?? null) ? $cfg['meter'] : [];

        $this->writeScope145Quality($ws, $data, $quality);
        $this->writeScope145Meter($ws, $data, $meter);
    }

    private function writeScope145Quality(Worksheet $ws, array $data, array $cfg): void
    {
        $startRow = (int) ($cfg['startRow'] ?? 4);
        $maxRows = (int) ($cfg['maxRows'] ?? 10);
        $monthCols = array_values($cfg['monthColumns'] ?? []);
        if (count($monthCols) !== 12) return;

        $cols = is_array($cfg['columns'] ?? null) ? $cfg['columns'] : [];

        for ($i = 0; $i < $maxRows; $i++) {
            $r = $startRow + $i;
            foreach (['A', 'B', 'C', 'D', 'E'] as $col) {
                $this->setCellIfWritable($ws, $col . $r, null);
            }
            for ($m = 0; $m < 12; $m++) {
                $this->setCellIfWritable($ws, $monthCols[$m] . $r, null, true);
            }
        }

        $items = array_values(
            array_filter(
                $this->filterInventory($data, 1, '1.4.5'),
                fn ($x) => is_array($x) && strtoupper(trim((string) ($x['fuelKey'] ?? ''))) === 'WWTP_QUAL'
            )
        );
        usort($items, fn ($a, $b) => (int) ($a['slotNo'] ?? 0) <=> (int) ($b['slotNo'] ?? 0));

        for ($i = 0; $i < min(count($items), $maxRows); $i++) {
            $it = $items[$i];
            if (!is_array($it)) continue;

            $r = $startRow + $i;
            $parsed = $this->parseWwtpRemark($it['remark'] ?? '');

            $this->setCellIfWritable($ws, ((string) ($cols['itemLabel'] ?? 'A')) . $r, $it['itemLabel'] ?? null);
            $this->setCellIfWritable($ws, ((string) ($cols['system'] ?? 'B')) . $r, $parsed['system'] ?? null);
            $this->setCellIfWritable($ws, ((string) ($cols['evidence'] ?? 'C')) . $r, $it['dataEvidence'] ?? null);
            $this->setCellIfWritable($ws, ((string) ($cols['unit'] ?? 'D')) . $r, $it['unit'] ?? null);
            $this->setCellIfWritable($ws, ((string) ($cols['standard'] ?? 'E')) . $r, $parsed['standard'] ?? null, true);

            $months = $this->normalizeMonthArray($it['quantityMonthly'] ?? []);
            for ($m = 0; $m < 12; $m++) {
                $this->setCellIfWritable($ws, $monthCols[$m] . $r, $months[$m], true);
            }
        }
    }

    private function writeScope145Meter(Worksheet $ws, array $data, array $cfg): void
    {
        $startRow = (int) ($cfg['startRow'] ?? 13);
        $maxRows = (int) ($cfg['maxRows'] ?? 20);
        $monthCols = array_values($cfg['monthColumns'] ?? []);
        if (count($monthCols) !== 12) return;

        $cols = is_array($cfg['columns'] ?? null) ? $cfg['columns'] : [];

        for ($i = 0; $i < $maxRows; $i++) {
            $r = $startRow + $i;
            foreach (['A', 'B', 'C'] as $col) {
                $this->setCellIfWritable($ws, $col . $r, null);
            }
            for ($m = 0; $m < 12; $m++) {
                $this->setCellIfWritable($ws, $monthCols[$m] . $r, null, true);
            }
        }

        $items = array_values(
            array_filter(
                $this->filterInventory($data, 1, '1.4.5'),
                fn ($x) => is_array($x) && strtoupper(trim((string) ($x['fuelKey'] ?? ''))) === 'WWTP_METER'
            )
        );
        usort($items, fn ($a, $b) => (int) ($a['slotNo'] ?? 0) <=> (int) ($b['slotNo'] ?? 0));

        for ($i = 0; $i < min(count($items), $maxRows); $i++) {
            $it = $items[$i];
            if (!is_array($it)) continue;

            $r = $startRow + $i;
            $this->setCellIfWritable($ws, ((string) ($cols['location'] ?? 'A')) . $r, $it['itemLabel'] ?? null);
            $this->setCellIfWritable($ws, ((string) ($cols['evidence'] ?? 'B')) . $r, $it['dataEvidence'] ?? null);
            $this->setCellIfWritable($ws, ((string) ($cols['unit'] ?? 'C')) . $r, $it['unit'] ?? null);

            $months = $this->normalizeMonthArray($it['quantityMonthly'] ?? []);
            for ($m = 0; $m < 12; $m++) {
                $this->setCellIfWritable($ws, $monthCols[$m] . $r, $months[$m], true);
            }
        }
    }

    /**
     * @return array{system: string, standard: float|null}
     */
    private function parseWwtpRemark($raw): array
    {
        $text = trim((string) ($raw ?? ''));
        if ($text === '') return ['system' => '', 'standard' => null];

        $system = $text;
        $standard = null;

        if (preg_match('/standard\\s*=\\s*([0-9.]+)/i', $text, $m)) {
            $standard = is_numeric($m[1]) ? (float) $m[1] : null;
            $system = preg_replace('/\\s*\\|\\s*standard\\s*=\\s*[^|]+/i', '', $text) ?? $text;
            $system = trim($system);
        }

        return ['system' => $system, 'standard' => $standard];
    }

    private function writeScope21PurchasedElectricity(Spreadsheet $spreadsheet, array $data, array $cfg): void
    {
        $ws = $spreadsheet->getSheetByName((string) ($cfg['sheet'] ?? 'Scope 2.1 Purchased Electricity'));
        if (!$ws) return;

        $monthCols = array_values($cfg['monthColumns'] ?? []);
        if (count($monthCols) !== 12) return;

        $labelCol = (string) ($cfg['labelColumn'] ?? 'A');
        $sourceCol = (string) ($cfg['sourceColumn'] ?? 'B');
        $evidenceCol = (string) ($cfg['evidenceColumn'] ?? 'C');
        $unitCol = (string) ($cfg['unitColumn'] ?? 'D');
        $totalCol = (string) ($cfg['totalColumn'] ?? 'E');
        $scanMax = (int) ($cfg['scanMaxRow'] ?? 250);

        $firstMonth = $monthCols[0];
        $lastMonth = $monthCols[11];

        $dataRows = [];
        for ($r = 1; $r <= $scanMax; $r++) {
            $cell = $ws->getCell($totalCol . $r);
            if (!$cell->isFormula()) continue;
            $formula = (string) ($cell->getValue() ?? '');
            if ($formula === '') continue;
            if (preg_match('/SUM\\(\\s*' . preg_quote($firstMonth . $r, '/') . '\\s*:\\s*' . preg_quote($lastMonth . $r, '/') . '\\s*\\)/i', $formula)) {
                $dataRows[] = $r;
            }
        }
        if (!$dataRows) return;

        foreach ($dataRows as $r) {
            $this->setCellIfWritable($ws, $labelCol . $r, null);
            $this->setCellIfWritable($ws, $sourceCol . $r, null);
            $this->setCellIfWritable($ws, $evidenceCol . $r, null);
            $this->setCellIfWritable($ws, $unitCol . $r, null);
            foreach ($monthCols as $col) {
                $this->setCellIfWritable($ws, $col . $r, null, true);
            }
        }

        $items = $this->filterInventory($data, 2, '2.1');
        usort($items, fn ($a, $b) => (int) ($a['slotNo'] ?? 0) <=> (int) ($b['slotNo'] ?? 0));

        $assigned = [];
        foreach ($items as $it) {
            if (!is_array($it)) continue;
            $idx = (int) ($it['slotNo'] ?? 0) - 1;
            if ($idx < 0 || $idx >= count($dataRows) || isset($assigned[$idx])) continue;
            $assigned[$idx] = $it;
        }

        $ptr = 0;
        foreach ($items as $it) {
            if (!is_array($it)) continue;
            $idx = (int) ($it['slotNo'] ?? 0) - 1;
            if ($idx >= 0 && $idx < count($dataRows) && isset($assigned[$idx]) && $assigned[$idx] === $it) {
                continue;
            }
            while ($ptr < count($dataRows) && isset($assigned[$ptr])) $ptr++;
            if ($ptr >= count($dataRows)) break;
            $assigned[$ptr] = $it;
            $ptr += 1;
        }

        foreach ($assigned as $idx => $it) {
            if (!is_array($it)) continue;
            $r = (int) $dataRows[(int) $idx];

            $this->setCellIfWritable($ws, $labelCol . $r, $it['itemLabel'] ?? null);
            $this->setCellIfWritable($ws, $sourceCol . $r, $it['remark'] ?? null);
            $this->setCellIfWritable($ws, $evidenceCol . $r, $it['dataEvidence'] ?? null);
            $this->setCellIfWritable($ws, $unitCol . $r, $it['unit'] ?? null);

            $months = $this->normalizeMonthArray($it['quantityMonthly'] ?? []);
            for ($m = 0; $m < 12; $m++) {
                $this->setCellIfWritable($ws, $monthCols[$m] . $r, $months[$m], true);
            }
        }
    }

    /**
     * @return array<int, array{subScope: string, itemLabel: string, unit: string|null, quantity: float|null}>
     */
    private function writeScreenScope3(Spreadsheet $spreadsheet, array $data, array $cfg): array
    {
        $ws = $spreadsheet->getSheetByName((string) ($cfg['sheet'] ?? 'Screen scope 3'));
        if (!$ws) return [];

        $startRow = (int) ($cfg['startRow'] ?? 2);
        $endRow = (int) ($cfg['endRow'] ?? 45);
        $cols = is_array($cfg['columns'] ?? null) ? $cfg['columns'] : [];

        $items = $this->filterInventory($data, 3, null);

        $byTgo = [];
        foreach ($items as $it) {
            if (!is_array($it)) continue;
            $tgoNo = trim((string) ($it['tgoNo'] ?? ''));
            if ($tgoNo === '') continue;
            $byTgo[$tgoNo][] = $it;
        }

        $groups = [];
        for ($r = $startRow; $r <= $endRow; $r++) {
            $tgoNo = trim((string) ($ws->getCell(((string) ($cols['tgoNo'] ?? 'A')) . $r)->getValue() ?? ''));
            if (!preg_match('/^scope\\s*3\\./i', $tgoNo)) continue;
            $groups[] = ['row' => $r, 'tgoNo' => $tgoNo];
        }
        if (!$groups) return [];

        $groups[] = ['row' => $endRow + 1, 'tgoNo' => '__END__'];

        $rowMap = [];
        for ($g = 0; $g < count($groups) - 1; $g++) {
            $groupRow = (int) $groups[$g]['row'];
            $tgoNo = (string) $groups[$g]['tgoNo'];
            $subScope = preg_replace('/^scope\\s*/i', '', $tgoNo) ?? $tgoNo;
            $subScope = trim($subScope);

            $itemsInGroup = array_values($byTgo[$tgoNo] ?? []);
            $itemIdx = 0;

            $rowStart = $groupRow + 1;
            $rowEnd = ((int) $groups[$g + 1]['row']) - 1;
            for ($r = $rowStart; $r <= $rowEnd; $r++) {
                $this->setCellIfWritable($ws, ((string) ($cols['itemLabel'] ?? 'C')) . $r, null);
                $this->setCellIfWritable($ws, ((string) ($cols['unit'] ?? 'D')) . $r, null);
                $this->setCellIfWritable($ws, ((string) ($cols['quantity'] ?? 'E')) . $r, null, true);
                $this->setCellIfWritable($ws, ((string) ($cols['remark'] ?? 'F')) . $r, null);
                $this->setCellIfWritable($ws, ((string) ($cols['dataEvidence'] ?? 'G')) . $r, null);
                $this->setCellIfWritable($ws, ((string) ($cols['ef'] ?? 'H')) . $r, null, true);
                $this->setCellIfWritable($ws, ((string) ($cols['efEvidence'] ?? 'K')) . $r, null);

                if ($itemIdx >= count($itemsInGroup)) {
                    continue;
                }

                $it = $itemsInGroup[$itemIdx];
                $itemIdx += 1;

                $itemLabel = trim((string) ($it['itemLabel'] ?? ''));
                $unit = trim((string) ($it['unit'] ?? ''));
                $qty = $this->numOrNull($it['quantityPerYear'] ?? null);

                $this->setCellIfWritable($ws, ((string) ($cols['itemLabel'] ?? 'C')) . $r, $itemLabel !== '' ? $itemLabel : null);
                $this->setCellIfWritable($ws, ((string) ($cols['unit'] ?? 'D')) . $r, $unit !== '' ? $unit : null);
                $this->setCellIfWritable($ws, ((string) ($cols['quantity'] ?? 'E')) . $r, $qty, true);
                $this->setCellIfWritable($ws, ((string) ($cols['remark'] ?? 'F')) . $r, $it['remark'] ?? null);
                $this->setCellIfWritable($ws, ((string) ($cols['dataEvidence'] ?? 'G')) . $r, $it['dataEvidence'] ?? null);
                $this->setCellIfWritable($ws, ((string) ($cols['ef'] ?? 'H')) . $r, $this->numOrNull($it['ef'] ?? null), true);
                $this->setCellIfWritable($ws, ((string) ($cols['efEvidence'] ?? 'K')) . $r, $it['efEvidence'] ?? null);

                if ($itemLabel !== '') {
                    $rowMap[$r] = [
                        'subScope' => $subScope,
                        'itemLabel' => $itemLabel,
                        'unit' => $unit !== '' ? $unit : null,
                        'quantity' => $qty,
                    ];
                }
            }
        }

        return $rowMap;
    }

    private function writeFr032(Spreadsheet $spreadsheet, array $data, array $cfg, array $screenRowMap): void
    {
        $ws = $spreadsheet->getSheetByName((string) ($cfg['sheet'] ?? 'Fr-03.2'));
        if (!$ws) return;

        $startRow = (int) ($cfg['startRow'] ?? 21);
        $endRow = (int) ($cfg['endRow'] ?? 200);
        $cols = is_array($cfg['columns'] ?? null) ? $cfg['columns'] : [];

        $sigRows = is_array($data['fr03_2'] ?? null) ? $data['fr03_2'] : [];
        $sigByKey = [];
        foreach ($sigRows as $row) {
            if (!is_array($row)) continue;
            $key = trim((string) ($row['key'] ?? ''));
            if ($key === '') {
                $subScope = trim((string) ($row['subScope'] ?? ''));
                $itemLabel = trim((string) ($row['itemLabel'] ?? ''));
                if ($subScope !== '' && $itemLabel !== '') {
                    $key = $subScope . '|' . $itemLabel;
                }
            }
            if ($key === '') continue;
            $sigByKey[$key] = $row;
        }

        $assessmentCol = (string) ($cols['assessment'] ?? 'K');
        $selectionCol = (string) ($cols['selection'] ?? 'L');
        $categoryCol = (string) ($cols['categoryLabel'] ?? 'C');

        for ($r = $startRow; $r <= $endRow; $r++) {
            $this->setCellIfWritable($ws, $assessmentCol . $r, null);
            $this->setCellIfWritable($ws, $selectionCol . $r, null);

            $cell = $ws->getCell($categoryCol . $r);
            if (!$cell->isFormula()) continue;

            $screenRow = $this->parseLinkedRowFromFormula((string) ($cell->getValue() ?? ''));
            if (!$screenRow) continue;
            $mapped = $screenRowMap[$screenRow] ?? null;
            if (!is_array($mapped)) continue;

            $key = trim((string) ($mapped['subScope'] ?? '')) . '|' . trim((string) ($mapped['itemLabel'] ?? ''));
            if (!isset($sigByKey[$key])) continue;
            $sig = $sigByKey[$key];

            $assessment = trim((string) ($sig['assessment'] ?? ''));
            $selection = trim((string) ($sig['selection'] ?? ''));

            $this->setCellIfWritable($ws, $assessmentCol . $r, $assessment !== '' ? $assessment : null);
            $this->setCellIfWritable($ws, $selectionCol . $r, $selection !== '' ? $selection : null);
        }
    }

    private function writeFr041Scope3(Spreadsheet $spreadsheet, array $data, array $cfg, array $screenRowMap): void
    {
        $ws = $spreadsheet->getSheetByName((string) ($cfg['sheet'] ?? 'Fr-04.1'));
        if (!$ws) return;

        $startRow = (int) ($cfg['startRow'] ?? 51);
        $maxRows = (int) ($cfg['maxRows'] ?? 6);
        $itemLabelCol = (string) ($cfg['itemLabelColumn'] ?? 'B');
        $unitCol = (string) ($cfg['unitColumn'] ?? 'C');
        $qtyCol = (string) ($cfg['qtyColumn'] ?? 'D');

        $sigRows = is_array($data['fr03_2'] ?? null) ? $data['fr03_2'] : [];
        $sigByKey = [];
        foreach ($sigRows as $row) {
            if (!is_array($row)) continue;
            $key = trim((string) ($row['key'] ?? ''));
            if ($key === '') continue;
            $sigByKey[$key] = $row;
        }

        $selected = [];
        ksort($screenRowMap);
        foreach ($screenRowMap as $mapped) {
            if (!is_array($mapped)) continue;
            $key = trim((string) ($mapped['subScope'] ?? '')) . '|' . trim((string) ($mapped['itemLabel'] ?? ''));
            $sig = $sigByKey[$key] ?? null;
            if (!is_array($sig)) continue;
            if (trim((string) ($sig['selection'] ?? '')) !== 'เลือกประเมิน') continue;
            $selected[] = $mapped;
        }

        for ($i = 0; $i < $maxRows; $i++) {
            $r = $startRow + $i;
            $this->setCellIfWritable($ws, $itemLabelCol . $r, null);
            $this->setCellIfWritable($ws, $unitCol . $r, null);
            $this->setCellIfWritable($ws, $qtyCol . $r, null, true);

            $item = $selected[$i] ?? null;
            if (!is_array($item)) continue;

            $this->setCellIfWritable($ws, $itemLabelCol . $r, $item['itemLabel'] ?? null);
            $this->setCellIfWritable($ws, $unitCol . $r, $item['unit'] ?? null);
            $this->setCellIfWritable($ws, $qtyCol . $r, $item['quantity'] ?? null, true);
        }
    }

    private function parseLinkedRowFromFormula(string $formula): ?int
    {
        $formula = trim($formula);
        if ($formula === '' || $formula[0] !== '=') return null;

        if (preg_match('/!\\$?[A-Z]+\\$?(\\d+)\\b/', $formula, $m)) {
            $n = (int) ($m[1] ?? 0);
            return $n > 0 ? $n : null;
        }

        return null;
    }

    private function cellText($value): string
    {
        if ($value === null) return '';
        if ($value instanceof \DateTimeInterface) return $value->format('Y-m-d');
        if (is_bool($value)) return $value ? '1' : '0';
        return trim((string) $value);
    }

    private function filterInventory(array $data, ?int $scope, ?string $subScope): array
    {
        $inventory = is_array($data['inventory'] ?? null) ? $data['inventory'] : [];
        $out = [];
        foreach ($inventory as $row) {
            if (!is_array($row)) continue;
            if ($scope !== null && (int) ($row['scope'] ?? 0) !== $scope) continue;
            if ($subScope !== null && (string) ($row['subScope'] ?? '') !== $subScope) continue;
            $out[] = $row;
        }
        return $out;
    }

    private function normalizeMonthArray($raw): array
    {
        $out = array_fill(0, 12, null);
        if (!is_array($raw)) return $out;
        for ($i = 0; $i < 12; $i++) {
            if (!array_key_exists($i, $raw)) continue;
            $out[$i] = $this->numOrNull($raw[$i]);
        }
        return $out;
    }

    private function fillSlots(Worksheet $ws, array $monthCols, array $slotRows, array $items): void
    {
        $used = [];
        $withSlot = array_values(
            array_filter($items, fn ($x) => is_array($x) && isset($x['slotNo']) && is_numeric($x['slotNo']))
        );
        usort($withSlot, fn ($a, $b) => (int) ($a['slotNo'] ?? 0) <=> (int) ($b['slotNo'] ?? 0));

        foreach ($withSlot as $it) {
            $idx = (int) ($it['slotNo'] ?? 0) - 1;
            if ($idx < 0 || $idx >= count($slotRows) || isset($used[$idx])) continue;

            $excelRow = (int) $slotRows[$idx];
            $months = $this->normalizeMonthArray($it['quantityMonthly'] ?? []);
            for ($m = 0; $m < 12; $m++) {
                $this->setCellIfWritable($ws, $monthCols[$m] . $excelRow, $months[$m], true);
            }
            $used[$idx] = true;
        }

        $withoutSlot = array_values(
            array_filter($items, fn ($x) => is_array($x) && !(isset($x['slotNo']) && is_numeric($x['slotNo'])))
        );
        $ptr = 0;
        foreach ($withoutSlot as $it) {
            while ($ptr < count($slotRows) && isset($used[$ptr])) $ptr++;
            if ($ptr >= count($slotRows)) break;

            $excelRow = (int) $slotRows[$ptr];
            $months = $this->normalizeMonthArray($it['quantityMonthly'] ?? []);
            for ($m = 0; $m < 12; $m++) {
                $this->setCellIfWritable($ws, $monthCols[$m] . $excelRow, $months[$m], true);
            }
            $used[$ptr] = true;
            $ptr += 1;
        }
    }

    private function setCellIfWritable(Worksheet $ws, string $cellRef, $value, bool $forceNumeric = false): void
    {
        $cellRef = strtoupper(trim($cellRef));
        if ($cellRef === '') return;

        $cell = $ws->getCell($cellRef);
        if ($cell->isFormula()) return;

        if ($value === null || $value === '') {
            $ws->setCellValue($cellRef, null);
            return;
        }

        if ($value instanceof \DateTimeInterface) {
            $ws->setCellValue($cellRef, $value);
            return;
        }

        if ($forceNumeric) {
            $num = $this->numOrNull($value);
            if ($num === null) {
                $ws->setCellValue($cellRef, null);
                return;
            }
            $ws->setCellValueExplicit($cellRef, (float) $num, DataType::TYPE_NUMERIC);
            return;
        }

        if (is_int($value) || is_float($value) || (is_string($value) && is_numeric($value))) {
            $ws->setCellValueExplicit($cellRef, (float) $value, DataType::TYPE_NUMERIC);
            return;
        }

        $ws->setCellValueExplicit($cellRef, (string) $value, DataType::TYPE_STRING);
    }

    private function numOrNull($value): ?float
    {
        if ($value === null) return null;
        if (is_string($value) && trim($value) === '') return null;
        if (is_numeric($value)) return (float) $value;
        return null;
    }

    private function toBuddhistDate($raw): ?\DateTimeInterface
    {
        if ($raw === null || $raw === '') return null;
        try {
            $d = new \DateTime((string) $raw);
        } catch (\Exception $e) {
            return null;
        }

        $y = (int) $d->format('Y');
        if ($y >= 2400) return $d;

        $out = clone $d;
        $out->setDate($y + 543, (int) $d->format('m'), (int) $d->format('d'));
        return $out;
    }

    private function toThaiBuddhistRange($start, $end): string
    {
        $a = $this->toBuddhistDate($start);
        $b = $this->toBuddhistDate($end);
        if (!$a || !$b) return '';

        return $a->format('j/n/Y') . ' - ' . $b->format('j/n/Y');
    }
}
