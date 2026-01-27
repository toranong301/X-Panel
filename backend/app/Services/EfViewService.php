<?php

namespace App\Services;

use App\Models\Cycle;

class EfViewService
{
    public function __construct(private EfCatalogLoaderService $loader)
    {
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function build(Cycle $cycle, string $scope, TemplateRegistry $registry): array
    {
        $catalogs = $this->allowedCatalogs($cycle);
        $out = [];
        $seen = [];

        foreach ($catalogs as $catalog) {
            $resp = $this->loader->loadCycleCatalog($cycle, $catalog, $scope, $registry);
            $rows = is_array($resp['options'] ?? null) ? $resp['options'] : [];

            foreach ($rows as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $efId = trim((string) ($row['efId'] ?? ''));
                if ($efId === '') {
                    continue;
                }
                $rowCatalog = strtoupper(trim((string) ($row['efCatalog'] ?? $resp['catalog'] ?? $catalog)));
                if ($rowCatalog === '') {
                    $rowCatalog = strtoupper($catalog);
                }

                $efKey = $rowCatalog . '::' . $efId;
                if (isset($seen[$efKey])) {
                    continue;
                }
                $seen[$efKey] = true;

                $out[] = [
                    'efKey' => $efKey,
                    'catalog' => $rowCatalog,
                    'efId' => $efId,
                    'name' => (string) ($row['Name'] ?? $row['name'] ?? ''),
                    'unit' => (string) ($row['Unit'] ?? $row['unit'] ?? ''),
                    'CO2' => $this->readNumber($row, ['CO2', 'co2']),
                    'Fossil CH4' => $this->readNumber($row, ['Fossil CH4', 'FossilCH4', 'fossil_ch4', 'fossilCh4']),
                    'CH4' => $this->readNumber($row, ['CH4', 'ch4']),
                    'N2O' => $this->readNumber($row, ['N2O', 'n2o']),
                    'SF6' => $this->readNumber($row, ['SF6', 'sf6']),
                    'NF3' => $this->readNumber($row, ['NF3', 'nf3']),
                    'HFCs' => $this->readNumber($row, ['HFCs', 'hfcs']),
                    'PFCs' => $this->readNumber($row, ['PFCs', 'pfcs']),
                    'Other' => $this->readNumber($row, ['Other', 'other']),
                    'Total' => $this->readNumber($row, ['Total', 'total']),
                    'Source' => $this->readText($row['Source'] ?? $row['source'] ?? null),
                ];
            }
        }

        return $out;
    }

    /**
     * @return array<int, string>
     */
    private function allowedCatalogs(Cycle $cycle): array
    {
        $year = is_numeric($cycle->year ?? null) ? (int) $cycle->year : null;
        if ($year !== null && $year >= 2026) {
            return ['AR5V2', 'EF1'];
        }
        return ['AR5', 'EF1'];
    }

    private function readNumber(array $row, array $keys): ?float
    {
        foreach ($keys as $key) {
            if (!array_key_exists($key, $row)) {
                continue;
            }
            $value = $row[$key];
            if ($value === null) {
                return null;
            }
            if (is_string($value) && trim($value) === '') {
                return null;
            }
            if (is_numeric($value)) {
                return (float) $value;
            }
        }
        return null;
    }

    private function readText($value): ?string
    {
        $text = trim((string) ($value ?? ''));
        return $text === '' ? null : $text;
    }
}
