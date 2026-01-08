<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Cycle;

class Fr041SourcesController extends Controller
{
    public function index(Cycle $cycle)
    {
        $data = $cycle->data_json ?? [];
        if (!is_array($data)) {
            $data = [];
        }

        $selectionMap = $this->loadSelectionMap($data);
        $sources = [];
        foreach ($this->sectionDefinitions() as $def) {
            $endpoint = $this->endpointForSection($cycle->id, $def['sectionCode']);
            if ($endpoint === null) {
                continue;
            }

            if (!$this->sectionHasData($data, $def['sectionCode'], $selectionMap)) {
                continue;
            }

            $sources[] = [
                'sectionId' => $def['sectionCode'],
                'sectionTitle' => $def['sectionTitle'],
                'sheetName' => $def['sheetName'],
                'endpoint' => $endpoint,
                'scope' => $def['scope'] ?? null,
                'sourceType' => str_starts_with($def['sectionCode'], '3.') ? 'scope3' : 'scope11',
                'itemCountIncluded' => $this->countIncluded($data, $def['sectionCode'], $selectionMap),
            ];
        }

        return response()->json([
            'ok' => true,
            'sources' => $sources,
        ]);
    }

    private function endpointForSection(int $cycleId, string $sectionCode): ?string
    {
        return match ($sectionCode) {
            '1.1' => "/api/cycles/{$cycleId}/scope11/stationary/items",
            '3.1', '3.2', '3.3', '3.4', '3.5', '3.6', '3.7', '3.8', '3.9', '3.10', '3.11', '3.12', '3.13', '3.14', '3.15'
                => "/api/cycles/{$cycleId}/scope3/{$sectionCode}/items?includeOnly=1",
            default => null,
        };
    }

    private function sectionDefinitions(): array
    {
        return [
            ['sectionCode' => '1.1', 'sectionTitle' => '1.1 Stationary combustion', 'sheetName' => '1.1 Stationary ', 'scope' => 'stationary'],
            ['sectionCode' => '1.2', 'sectionTitle' => '1.2 Mobile combustion', 'sheetName' => '1.2 Mobile', 'scope' => 'mobile'],
            ['sectionCode' => '1.4.1', 'sectionTitle' => '1.4.1 Fugitive emissions', 'sheetName' => '1.4.1 สารทำความเย็น', 'scope' => 'refrigerant'],
            ['sectionCode' => '1.4.2', 'sectionTitle' => '1.4.2 Fire suppression', 'sheetName' => '1.4.2 สารดับเพลิง', 'scope' => 'refrigerant'],
            ['sectionCode' => '1.4.3', 'sectionTitle' => '1.4.3 Septic', 'sheetName' => '1.4.3 Septic', 'scope' => 'scope3'],
            ['sectionCode' => '1.4.4', 'sectionTitle' => '1.4.4 Fertilizer', 'sheetName' => '1.4.4 ปุ๋ย', 'scope' => 'scope3'],
            ['sectionCode' => '1.4.5', 'sectionTitle' => '1.4.5 WWTP', 'sheetName' => '1.4.5 ระบบบำบัดน้ำเสีย WWTP', 'scope' => 'scope3'],
            ['sectionCode' => '2.1', 'sectionTitle' => '2.1 Purchased Electricity', 'sheetName' => 'Scope 2.1 Purchased Electricity', 'scope' => 'electricity'],
            ['sectionCode' => '3.1.1', 'sectionTitle' => '3.1.1 Purchased Goods', 'sheetName' => 'Scope 3.1.1 วัตถุดิบผลิต', 'scope' => 'scope3'],
            ['sectionCode' => '3.1.2', 'sectionTitle' => '3.1.2 Water', 'sheetName' => 'Scope 3.1.2 น้ำประปา', 'scope' => 'scope3'],
            ['sectionCode' => '3.1.3', 'sectionTitle' => '3.1.3 Paper', 'sheetName' => 'Scope 3.1.3 กระดาษ A4', 'scope' => 'scope3'],
            ['sectionCode' => '3.1.4', 'sectionTitle' => '3.1.4 Employee transport', 'sheetName' => 'Scope 3.1.4 จ้างเหมารถพนักงาน', 'scope' => 'scope3'],
            ['sectionCode' => '3.2', 'sectionTitle' => '3.2 Capital goods', 'sheetName' => '', 'scope' => 'scope3'],
            ['sectionCode' => '3.3', 'sectionTitle' => '3.3 Fuel and energy-related', 'sheetName' => '', 'scope' => 'scope3'],
            ['sectionCode' => '3.4', 'sectionTitle' => '3.4 Upstream transportation', 'sheetName' => 'Scope 3.4', 'scope' => 'scope3'],
            ['sectionCode' => '3.5', 'sectionTitle' => '3.5 Waste generated', 'sheetName' => 'Scope 3.5', 'scope' => 'scope3'],
            ['sectionCode' => '3.6', 'sectionTitle' => '3.6 Business travel', 'sheetName' => '', 'scope' => 'scope3'],
            ['sectionCode' => '3.7', 'sectionTitle' => '3.7 Employee commuting', 'sheetName' => 'Scope 3.7', 'scope' => 'scope3'],
            ['sectionCode' => '3.8', 'sectionTitle' => '3.8 Upstream leased assets', 'sheetName' => '', 'scope' => 'scope3'],
            ['sectionCode' => '3.9', 'sectionTitle' => '3.9 Downstream transport', 'sheetName' => 'Scope 3.9', 'scope' => 'scope3'],
            ['sectionCode' => '3.10', 'sectionTitle' => '3.10 Processing of sold products', 'sheetName' => '', 'scope' => 'scope3'],
            ['sectionCode' => '3.11', 'sectionTitle' => '3.11 Use of sold products', 'sheetName' => '', 'scope' => 'scope3'],
            ['sectionCode' => '3.12', 'sectionTitle' => '3.12 End-of-life', 'sheetName' => 'Scope 3.12', 'scope' => 'scope3'],
            ['sectionCode' => '3.13', 'sectionTitle' => '3.13 Downstream leased assets', 'sheetName' => '', 'scope' => 'scope3'],
            ['sectionCode' => '3.14', 'sectionTitle' => '3.14 Franchises', 'sheetName' => '', 'scope' => 'scope3'],
            ['sectionCode' => '3.15', 'sectionTitle' => '3.15 Investments', 'sheetName' => '', 'scope' => 'scope3'],
        ];
    }

    private function sectionHasData(array $data, string $sectionCode, array $selectionMap): bool
    {
        $inventory = $data['inventory'] ?? [];
        if (!is_array($inventory)) return false;

        if (str_starts_with($sectionCode, '3.')) {
            return $this->countIncluded($data, $sectionCode, $selectionMap) > 0;
        }

        foreach ($inventory as $row) {
            if (!is_array($row)) continue;
            if ((string) ($row['subScope'] ?? '') !== $sectionCode) continue;
            if ($this->rowHasData($row)) return true;
        }

        return false;
    }

    private function countIncluded(array $data, string $sectionCode, array $selectionMap): int
    {
        if (!str_starts_with($sectionCode, '3.')) return 0;
        $inventory = $data['inventory'] ?? [];
        if (!is_array($inventory)) return 0;

        $count = 0;
        foreach ($inventory as $row) {
            if (!is_array($row)) continue;
            if ((int) ($row['scope'] ?? 0) !== 3) continue;
            if ($this->resolveSectionId($row) !== $sectionCode) continue;
            if (!$this->rowHasData($row)) continue;

            $itemId = (string) ($row['id'] ?? '');
            $itemLabel = trim((string) ($row['itemLabel'] ?? $row['itemName'] ?? ''));
            if ($this->isSelected($selectionMap, $sectionCode, $itemId, $itemLabel)) {
                $count++;
            }
        }
        return $count;
    }

    private function loadSelectionMap(array $data): array
    {
        $stored = $data['fr032Selection'] ?? null;
        if (is_array($stored)) return $stored;

        $rows = is_array($data['fr03_2'] ?? null) ? $data['fr03_2'] : [];
        $map = [];
        foreach ($rows as $row) {
            if (!is_array($row)) continue;
            if ((string) ($row['selection'] ?? '') !== 'เลือกประเมิน') continue;
            $sectionId = (string) ($row['subScope'] ?? '');
            $itemLabel = trim((string) ($row['itemLabel'] ?? ''));
            if ($sectionId === '' || $itemLabel === '') continue;
            $map[$sectionId][] = [
                'itemName' => $itemLabel,
                'include' => true,
            ];
        }
        return $map;
    }

    private function resolveSectionId(array $row): string
    {
        $subScope = trim((string) ($row['subScope'] ?? ''));
        if (str_starts_with($subScope, '3.')) return $subScope;
        $tgoNo = (string) ($row['tgoNo'] ?? '');
        if (preg_match('/3\.\d+(?:\.\d+)?/', $tgoNo, $m)) {
            return $m[0];
        }
        return $subScope;
    }

    private function isSelected(array $map, string $sectionId, string $itemId, string $itemName): bool
    {
        $rows = $map[$sectionId] ?? [];
        if (!is_array($rows)) return false;

        foreach ($rows as $sel) {
            if (!is_array($sel)) continue;
            if (($sel['include'] ?? false) !== true) continue;
            $selId = trim((string) ($sel['itemId'] ?? ''));
            $selName = trim((string) ($sel['itemName'] ?? ''));
            if ($selId !== '' && $itemId !== '' && $selId === $itemId) return true;
            if ($selName !== '' && $itemName !== '' && $selName === $itemName) return true;
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
}
