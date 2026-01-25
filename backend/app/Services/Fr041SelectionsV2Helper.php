<?php

namespace App\Services;

use App\Models\Fr041Config;

class Fr041SelectionsV2Helper
{
    public static function resolve(Fr041Config $config, $cycleYear): Fr041SelectionsV2HelperResult
    {
        $options = is_array($config->options) ? $config->options : [];
        $rawSelections = self::normalizeSelections(array_key_exists('selections_v2', $options) ? $options['selections_v2'] : null);

        if ($rawSelections === null) {
            return new Fr041SelectionsV2HelperResult([], [], [], true);
        }

        $allowedCatalogs = self::allowedCatalogs($cycleYear);
        $includedLines = [];
        $missingEfLineIds = [];
        $invalidCatalogLineIds = [];

        foreach ($rawSelections as $entry) {
            $data = self::normalizeSelectionEntry($entry);
            if (!$data['include'] || $data['lineId'] === '') {
                continue;
            }

            $includedLines[$data['lineId']] = [
                'parentRowId' => $data['parentRowId'],
                'component' => $data['component'],
                'efCatalog' => $data['efCatalog'],
                'efId' => $data['efId'],
            ];

            if ($data['efCatalog'] && !in_array(strtoupper($data['efCatalog']), $allowedCatalogs, true)) {
                $invalidCatalogLineIds[] = $data['lineId'];
            }

            if (!$data['efCatalog'] || !$data['efId']) {
                $missingEfLineIds[] = $data['lineId'];
            }
        }

        return new Fr041SelectionsV2HelperResult($includedLines, $missingEfLineIds, $invalidCatalogLineIds, false);
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
        return [
            'lineId' => StringHelper::normalizeString($entry['lineId'] ?? ''),
            'parentRowId' => StringHelper::normalizeString($entry['parentRowId'] ?? ''),
            'component' => StringHelper::normalizeString($entry['component'] ?? ''),
            'include' => filter_var($entry['include'] ?? false, FILTER_VALIDATE_BOOLEAN),
            'efCatalog' => StringHelper::normalizeString($entry['efCatalog'] ?? ''),
            'efId' => StringHelper::normalizeString($entry['efId'] ?? ''),
        ];
    }

    private static function allowedCatalogs($cycleYear): array
    {
        if ($cycleYear !== null && $cycleYear >= 2026) {
            return ['AR5V2', 'EF1'];
        }
        return ['AR5', 'EF1'];
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
