<?php

namespace App\Services;

use App\Models\Fr041Config;

class Fr041SelectionsV2Helper
{
    /**
     * @param array<int, mixed> $scopeRows
     */
    public static function resolve(Fr041Config $config, $cycleYear, array $scopeRows = []): Fr041SelectionsV2HelperResult
    {
        $options = is_array($config->options) ? $config->options : [];
        $rawSelections = self::normalizeSelections(array_key_exists('selections_v2', $options) ? $options['selections_v2'] : null);
        $allowedCatalogs = self::allowedCatalogs($cycleYear);
        $rowsById = self::mapRowsById($scopeRows);
        $legacyRowIds = self::normalizeRowIds($config->selected_row_ids ?? []);
        $legacyEfSelection = self::normalizeEfSelectionByRowId($options['efSelectionByRowId'] ?? null);
        $legacyFallbackUsed = false;

        if ($rawSelections === null || count($rawSelections) === 0) {
            if ($legacyRowIds) {
                $legacyFallbackUsed = true;
                $rawSelections = self::buildLegacySelections($legacyRowIds, $legacyEfSelection, $allowedCatalogs);
            } else {
                return new Fr041SelectionsV2HelperResult([], [], [], false);
            }
        }

        $includedLines = [];
        $missingEfLineIds = [];
        $invalidCatalogLineIds = [];

        foreach ($rawSelections as $entry) {
            $data = self::normalizeSelectionEntry($entry);
            if (!$data['include'] || $data['lineId'] === '') {
                continue;
            }

            $row = $rowsById[$data['parentRowId']] ?? null;
            $qty = self::componentQty($row, $data['component']);
            $unit = self::componentUnit($data['component']);
            $sourceItemLabel = self::rowString($row, 'item_label');
            $evidence = self::rowString($row, 'evidence');
            $fuelKey = self::rowString($row, 'fuel_key');

            $efCatalog = $data['efCatalog'] !== '' ? strtoupper($data['efCatalog']) : '';
            $efId = $data['efId'];
            $efKey = ($efCatalog !== '' && $efId !== '') ? $efCatalog . '::' . $efId : '';

            $includedLines[$data['lineId']] = [
                'lineId' => $data['lineId'],
                'parentRowId' => $data['parentRowId'],
                'component' => $data['component'],
                'qty' => $qty,
                'unit' => $unit,
                'efCatalog' => $efCatalog,
                'efId' => $efId,
                'efKey' => $efKey !== '' ? $efKey : null,
                'sourceItemLabel' => $sourceItemLabel !== '' ? $sourceItemLabel : null,
                'evidence' => $evidence !== '' ? $evidence : null,
                'fuelKey' => $fuelKey !== '' ? $fuelKey : null,
                'sectionId' => '1.1',
            ];

            if ($efCatalog !== '' && !in_array($efCatalog, $allowedCatalogs, true)) {
                $invalidCatalogLineIds[] = $data['lineId'];
            }

            if ($efCatalog === '' || $efId === '') {
                $missingEfLineIds[] = $data['lineId'];
            }
        }

        return new Fr041SelectionsV2HelperResult($includedLines, $missingEfLineIds, $invalidCatalogLineIds, $legacyFallbackUsed);
    }

    private static function normalizeSelections($raw): ?array
    {
        if ($raw === null) {
            return null;
        }
        if (is_array($raw)) {
            return $raw;
        }
        if (is_object($raw)) {
            return json_decode(json_encode($raw), true);
        }
        return null;
    }

    private static function normalizeSelectionEntry($entry): array
    {
        if (is_object($entry)) {
            $entry = json_decode(json_encode($entry), true);
        }
        if (!is_array($entry)) {
            $entry = [];
        }
        $lineId = StringHelper::normalizeString($entry['lineId'] ?? '');
        $parentRowId = StringHelper::normalizeString($entry['parentRowId'] ?? '');
        $component = strtoupper(StringHelper::normalizeString($entry['component'] ?? ''));
        $efCatalog = StringHelper::normalizeString($entry['efCatalog'] ?? '');
        $efId = StringHelper::normalizeString($entry['efId'] ?? '');
        $efKey = StringHelper::normalizeString($entry['efKey'] ?? '');
        if ($efKey !== '' && ($efCatalog === '' || $efId === '')) {
            $parts = explode('::', $efKey, 2);
            if (count($parts) === 2) {
                if ($efCatalog === '') {
                    $efCatalog = trim($parts[0]);
                }
                if ($efId === '') {
                    $efId = trim($parts[1]);
                }
            }
        }
        if ($lineId === '' && $parentRowId !== '' && $component !== '') {
            $lineId = $parentRowId . '::' . $component;
        }
        return [
            'lineId' => $lineId,
            'parentRowId' => $parentRowId,
            'component' => $component,
            'include' => filter_var($entry['include'] ?? false, FILTER_VALIDATE_BOOLEAN),
            'efCatalog' => $efCatalog,
            'efId' => $efId,
        ];
    }

    private static function allowedCatalogs($cycleYear): array
    {
        if ($cycleYear !== null && $cycleYear >= 2026) {
            return ['AR5V2', 'EF1'];
        }
        return ['AR5', 'EF1'];
    }

    private static function normalizeRowIds($value): array
    {
        $rows = is_array($value) ? $value : [];
        $out = [];
        foreach ($rows as $rowId) {
            $key = StringHelper::normalizeString($rowId);
            if ($key === '') continue;
            $out[] = $key;
        }
        return array_values(array_unique($out));
    }

    private static function normalizeEfSelectionByRowId($value): array
    {
        $map = is_array($value) ? $value : [];
        $out = [];
        foreach ($map as $rowId => $efId) {
            $key = StringHelper::normalizeString($rowId);
            $val = StringHelper::normalizeString($efId);
            if ($key === '' || $val === '') continue;
            $out[$key] = $val;
        }
        return $out;
    }

    private static function buildLegacySelections(array $rowIds, array $efSelectionByRowId, array $allowedCatalogs): array
    {
        $out = [];
        $defaultCatalog = $allowedCatalogs[0] ?? '';
        foreach ($rowIds as $rowId) {
            $efId = $efSelectionByRowId[$rowId] ?? '';
            $efCatalog = '';
            if ($efId !== '') {
                $efCatalog = str_starts_with(strtoupper($efId), 'EF1_') ? 'EF1' : $defaultCatalog;
            }
            $out[] = [
                'lineId' => $rowId . '::DIESEL_L',
                'parentRowId' => $rowId,
                'component' => 'DIESEL_L',
                'include' => true,
                'efCatalog' => $efCatalog,
                'efId' => $efId,
            ];
        }
        return $out;
    }

    /**
     * @param array<int, mixed> $rows
     * @return array<string, mixed>
     */
    private static function mapRowsById(array $rows): array
    {
        $out = [];
        foreach ($rows as $row) {
            $rowId = self::rowString($row, 'row_id');
            if ($rowId === '') continue;
            $out[$rowId] = $row;
        }
        return $out;
    }

    private static function rowString($row, string $field): string
    {
        if (is_array($row)) {
            return StringHelper::normalizeString($row[$field] ?? '');
        }
        if (is_object($row)) {
            return StringHelper::normalizeString($row->{$field} ?? '');
        }
        return '';
    }

    private static function componentQty($row, string $component): ?float
    {
        if (!$row || $component === '') {
            return null;
        }

        $months = null;
        if (is_array($row)) {
            $months = $row['months_json'] ?? null;
        } elseif (is_object($row)) {
            $months = $row->months_json ?? null;
        }
        $total = self::totalFromMonths(is_array($months) ? $months : []);
        if ($total === null) {
            return null;
        }

        $unit = strtolower(trim((string) (is_array($row) ? ($row['unit'] ?? '') : ($row->unit ?? ''))));
        if ($unit !== 'l') {
            return null;
        }

        $fuelKey = self::rowString($row, 'fuel_key');
        $otherType = self::rowString($row, 'other_type');
        $blendKey = self::resolveBlendKey($fuelKey, $otherType);
        $supported = ['B7', 'B10', '91/95', 'E20'];
        if (!in_array($blendKey, $supported, true)) {
            if ($component === 'DIESEL_L') {
                return self::round2($total);
            }
            return null;
        }

        $blend = self::computeBlendFromAnnualL($total, $blendKey);
        return match ($component) {
            'DIESEL_L' => self::round2($blend['dieselL']),
            'BIODIESEL_KG' => self::round2($blend['biodieselKg']),
            'GASOLINE_L' => self::round2($blend['gasolineL']),
            'ETHANOL_KG' => self::round2($blend['ethanolKg']),
            default => null,
        };
    }

    private static function componentUnit(string $component): string
    {
        return str_ends_with($component, '_KG') ? 'kg' : 'L';
    }

    private static function totalFromMonths(array $months): ?float
    {
        $total = 0.0;
        $hasValue = false;
        foreach ($months as $value) {
            if ($value === null || $value === '') {
                continue;
            }
            if (is_numeric($value)) {
                $total += (float) $value;
                $hasValue = true;
            }
        }
        return $hasValue ? $total : null;
    }

    private static function resolveBlendKey(string $fuelKey, string $otherType): string
    {
        $raw = strtoupper(trim($fuelKey));
        $type = strtoupper(trim($otherType));

        if ($type === 'B7') return 'B7';
        if ($type === 'B10') return 'B10';
        if ($type === '91/95' || $type === '91-95') return '91/95';
        if ($type === 'E20') return 'E20';

        if ($raw === 'B7') return 'B7';
        if ($raw === 'B10') return 'B10';
        if ($raw === '91/95' || $raw === '91-95') return '91/95';
        if ($raw === 'E20') return 'E20';

        if (str_contains($raw, 'DIESEL_B7')) return 'B7';
        if (str_contains($raw, 'DIESEL_B10')) return 'B10';
        if (str_contains($raw, 'GASOHOL_9195') || str_contains($raw, '9195')) return '91/95';
        if (str_contains($raw, 'GASOHOL_E20')) return 'E20';
        if (str_contains($raw, 'CUSTOM_B7')) return 'B7';
        if (str_contains($raw, 'CUSTOM_B10')) return 'B10';
        if (str_contains($raw, 'CUSTOM_GASOHOL_9195') || str_contains($raw, 'CUSTOM_9195') || str_contains($raw, 'CUSTOM_91/95')) return '91/95';
        if (str_contains($raw, 'CUSTOM_E20')) return 'E20';

        return 'OTHER';
    }

    private static function computeBlendFromAnnualL(float $annualL, string $key): array
    {
        $rules = [
            'B7' => ['diesel' => 0.93, 'biodiesel' => 0.07, 'gasoline' => 0.0, 'ethanol' => 0.0],
            'B10' => ['diesel' => 0.9, 'biodiesel' => 0.1, 'gasoline' => 0.0, 'ethanol' => 0.0],
            '91/95' => ['diesel' => 0.0, 'biodiesel' => 0.0, 'gasoline' => 0.9, 'ethanol' => 0.1],
            'E20' => ['diesel' => 0.0, 'biodiesel' => 0.0, 'gasoline' => 0.8, 'ethanol' => 0.2],
        ];
        $rule = $rules[$key] ?? ['diesel' => 1.0, 'biodiesel' => 0.0, 'gasoline' => 0.0, 'ethanol' => 0.0];

        $dieselL = $annualL * $rule['diesel'];
        $biodieselL = $rule['diesel'] > 0 && $rule['biodiesel'] > 0
            ? $annualL - $dieselL
            : $annualL * $rule['biodiesel'];
        $gasolineL = $annualL * $rule['gasoline'];
        $ethanolL = $rule['gasoline'] > 0 && $rule['ethanol'] > 0
            ? $annualL - $gasolineL
            : $annualL * $rule['ethanol'];

        $biodieselKg = $biodieselL * 0.87;
        $ethanolKg = $ethanolL * 0.79;

        return [
            'dieselL' => $dieselL,
            'biodieselL' => $biodieselL,
            'biodieselKg' => $biodieselKg,
            'gasolineL' => $gasolineL,
            'ethanolL' => $ethanolL,
            'ethanolKg' => $ethanolKg,
        ];
    }

    private static function round2(float $value): float
    {
        return round($value, 2);
    }
}

class Fr041SelectionsV2HelperResult
{
    public function __construct(
        public array $includedLines,
        public array $missingEfLineIds,
        public array $invalidCatalogLineIds,
        public bool $legacyFallbackUsed
    ) {
    }
}

class StringHelper
{
    public static function normalizeString($value): string
    {
        $text = is_string($value) ? $value : (is_numeric($value) ? (string) $value : '');
        return trim($text);
    }
}
