<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Cycle;

class Scope3Controller extends Controller
{
    public function summary(Cycle $cycle)
    {
        $data = $cycle->data_json ?? [];
        if (!is_array($data)) $data = [];

        $inventory = is_array($data['inventory'] ?? null) ? $data['inventory'] : [];
        $rows = array_filter($inventory, fn ($row) => is_array($row) && (int) ($row['scope'] ?? 0) === 3);

        $bySection = [];
        foreach ($rows as $row) {
            $sectionId = $this->resolveSectionId($row);
            if ($sectionId === '') continue;
            $bySection[$sectionId][] = $row;
        }

        $categories = [];
        foreach ($this->sectionDefinitions() as $def) {
            $sectionId = $def['sectionId'];
            $items = $bySection[$sectionId] ?? [];
            $filtered = array_values(array_filter($items, fn ($row) => $this->rowHasData($row)));
            $itemCount = count($filtered);

            $totalQty = 0.0;
            $unitHint = null;
            foreach ($filtered as $row) {
                $qty = $this->num($row['quantityPerYear'] ?? null);
                if ($qty !== null) $totalQty += $qty;
                $unit = trim((string) ($row['unit'] ?? ''));
                if ($unit !== '') {
                    $unitHint = $unitHint === null ? $unit : ($unitHint === $unit ? $unitHint : '');
                }
            }

            $categories[] = [
                'sectionId' => $sectionId,
                'title' => $def['title'],
                'hasData' => $itemCount > 0,
                'itemCount' => $itemCount,
                'totalQty' => $itemCount > 0 ? $totalQty : null,
                'unitHint' => $unitHint ?: null,
            ];
        }

        return response()->json([
            'ok' => true,
            'categories' => $categories,
        ]);
    }

    public function items(Cycle $cycle, string $sectionId)
    {
        $data = $cycle->data_json ?? [];
        if (!is_array($data)) $data = [];

        $inventory = is_array($data['inventory'] ?? null) ? $data['inventory'] : [];
        $includeOnly = filter_var(request()->query('includeOnly'), FILTER_VALIDATE_BOOLEAN);
        $selectionMap = $includeOnly ? $this->loadSelectionMap($data) : [];

        $items = [];
        foreach ($inventory as $row) {
            if (!is_array($row)) continue;
            if ((int) ($row['scope'] ?? 0) !== 3) continue;
            if ($this->resolveSectionId($row) !== $sectionId) continue;
            if (!$this->rowHasData($row)) continue;

            $itemId = (string) ($row['id'] ?? '');
            $itemLabel = trim((string) ($row['itemLabel'] ?? ''));
            if ($itemLabel === '') $itemLabel = trim((string) ($row['itemName'] ?? ''));

            if ($includeOnly && !$this->isSelected($selectionMap, $sectionId, $itemId, $itemLabel)) {
                continue;
            }

            $qty = $this->num($row['quantityPerYear'] ?? null);
            $fuelKey = (string) ($row['fuelKey'] ?? '');

            $items[] = [
                'itemId' => $itemId !== '' ? $itemId : $this->slug($itemLabel),
                'itemName' => $itemLabel,
                'evidence' => trim((string) ($row['dataEvidence'] ?? '')),
                'unit' => trim((string) ($row['unit'] ?? '')),
                'qty' => $qty,
                'activityKey' => $fuelKey,

                // FR-04.1 reuse shape (Scope11StationaryItem-like)
                'rowId' => $itemId !== '' ? $itemId : $this->slug($itemLabel),
                'itemLabel' => $itemLabel,
                'fuelKey' => $fuelKey,
                'otherType' => $row['otherType'] ?? null,
                'months' => new \stdClass(),
                'total' => $qty,
            ];
        }

        return response()->json([
            'ok' => true,
            'sectionId' => $sectionId,
            'items' => $items,
        ]);
    }

    private function resolveSectionId(array $row): string
    {
        $subScope = trim((string) ($row['subScope'] ?? ''));
        if (str_starts_with($subScope, '3.')) return $subScope;

        $tgoNo = (string) ($row['tgoNo'] ?? '');
        if (preg_match('/3\.\d+(?:\.\d+)?/', $tgoNo, $m)) {
            return $m[0];
        }
        return '';
    }

    private function rowHasData(array $row): bool
    {
        $label = trim((string) ($row['itemLabel'] ?? $row['itemName'] ?? ''));
        if ($label === '') return false;

        $qty = $this->num($row['quantityPerYear'] ?? null);
        return $qty !== null && $qty !== 0.0;
    }

    private function num($value): ?float
    {
        if ($value === null || $value === '') return null;
        if (!is_numeric($value)) return null;
        return (float) $value;
    }

    private function slug(string $s): string
    {
        $s = strtolower(trim($s));
        $s = preg_replace('/\s+/', '-', $s);
        $s = preg_replace('/[^a-z0-9\\-_.]+/', '', $s);
        return $s ?: 'item';
    }

    private function loadSelectionMap(array $data): array
    {
        $map = [];
        $stored = $data['fr032Selection'] ?? null;
        if (is_array($stored)) {
            return $stored;
        }

        $rows = is_array($data['fr03_2'] ?? null) ? $data['fr03_2'] : [];
        foreach ($rows as $row) {
            if (!is_array($row)) continue;
            $sectionId = (string) ($row['subScope'] ?? '');
            $itemLabel = trim((string) ($row['itemLabel'] ?? ''));
            if ($sectionId === '' || $itemLabel === '') continue;
            $selection = (string) ($row['selection'] ?? '');
            if ($selection !== 'เลือกประเมิน') continue;
            $map[$sectionId][] = [
                'itemName' => $itemLabel,
                'include' => true,
            ];
        }
        return $map;
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

    private function sectionDefinitions(): array
    {
        return [
            ['sectionId' => '3.1', 'title' => 'Purchased Goods & Services'],
            ['sectionId' => '3.2', 'title' => 'Capital goods'],
            ['sectionId' => '3.3', 'title' => 'Fuel- and energy related activities'],
            ['sectionId' => '3.4', 'title' => 'Upstream transportation and distribution'],
            ['sectionId' => '3.5', 'title' => 'Waste generated in operations'],
            ['sectionId' => '3.6', 'title' => 'Business travel'],
            ['sectionId' => '3.7', 'title' => 'Employee commuting'],
            ['sectionId' => '3.8', 'title' => 'Upstream leased assets'],
            ['sectionId' => '3.9', 'title' => 'Downstream transportation and distribution'],
            ['sectionId' => '3.10', 'title' => 'Processing of sold products'],
            ['sectionId' => '3.11', 'title' => 'Use of sold products'],
            ['sectionId' => '3.12', 'title' => 'End-of-life treatment of sold products'],
            ['sectionId' => '3.13', 'title' => 'Downstream leased assets'],
            ['sectionId' => '3.14', 'title' => 'Franchises'],
            ['sectionId' => '3.15', 'title' => 'Investments'],
        ];
    }
}
