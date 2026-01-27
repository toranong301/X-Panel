<?php

namespace App\Services;

use App\Models\Cycle;
use App\Models\EfLibraryEntry;
use App\Models\EfOverride;
use App\Models\EfProfile;
use App\Models\Fr041Config;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use PhpOffice\PhpSpreadsheet\Reader\Xlsx;

class EfCatalogLoaderService
{
    /**
     * @return array{ok: bool, catalog: string, options: array<int, array<string, mixed>>, warning?: string|null}
     */
    public function loadCycleCatalog(Cycle $cycle, string $catalogRaw, string $scope, TemplateRegistry $registry): array
    {
        $scope = strtolower(trim($scope));
        $year = is_numeric($cycle->year ?? null) ? (int) $cycle->year : null;
        $catalog = $this->normalizeCatalog($catalogRaw, $year);

        $templateSetId = null;
        try {
            $config = Fr041Config::query()->where('cycle_id', $cycle->id)->first();
            $templateSetId = $config && is_array($config->options ?? null)
                ? ($config->options['templateSetId'] ?? null)
                : null;
        } catch (\Throwable $e) {
            $templateSetId = null;
        }

        if (in_array($catalog, ['AR5', 'AR5V2'], true)) {
            $fromTemplate = $this->loadEfFromTemplate($cycle, $catalog, $registry);
            if (!$fromTemplate['options'] ?? []) {
                $fallback = $this->loadEfFromDb($catalog, $scope, $year);
                if (!empty($fallback['options'] ?? [])) {
                    $fallback['warning'] = $fromTemplate['warning'] ?? $fallback['warning'] ?? null;
                    return $fallback;
                }
            }
            return $fromTemplate;
        }

        if ($catalog === 'EF1') {
            $fromTemplate = $this->loadEf1FromTemplate($cycle, $registry, $templateSetId);
            if (!$fromTemplate['options'] ?? []) {
                $fallback = $this->loadEf1FromFallbackTemplate($registry);
                if (!empty($fallback['options'] ?? [])) {
                    $fallback['warning'] = $fromTemplate['warning'] ?? $fallback['warning'] ?? null;
                    return $fallback;
                }
            }
            if (!$fromTemplate['options'] ?? []) {
                $fallback = $this->loadEfFromDb($catalog, $scope, $year);
                if (!empty($fallback['options'] ?? [])) {
                    $fallback['warning'] = $fromTemplate['warning'] ?? $fallback['warning'] ?? null;
                    return $fallback;
                }
            }
            return $fromTemplate;
        }

        return $this->loadEfFromDb($catalog, $scope, $year);
    }

    /**
     * @return array{ok: bool, catalog: string, options: array<int, array<string, mixed>>, warning?: string|null}
     */
    private function loadEfFromDb(string $catalog, string $scope, ?int $year): array
    {
        if (!Schema::hasTable('ef_profiles') || !Schema::hasTable('ef_library_entries')) {
            return [
                'ok' => true,
                'catalog' => $catalog,
                'options' => [],
                'warning' => 'EF library tables not migrated (ef_profiles, ef_library_entries).',
            ];
        }

        $profileCode = match ($catalog) {
            'AR5V2' => 'AR5V2',
            'EF1' => 'EF1',
            default => 'AR5',
        };

        $profile = EfProfile::query()->where('code', $profileCode)->first();
        if (!$profile) {
            return [
                'ok' => true,
                'catalog' => $catalog,
                'options' => [],
                'warning' => "EF profile not found: {$profileCode}. Seed ef_profiles first.",
            ];
        }

        $entries = EfLibraryEntry::query()
            ->where('ef_profile_id', $profile->id)
            ->where('scope', $scope)
            ->orderBy('ef_id')
            ->get();

        $options = [];
        foreach ($entries as $entry) {
            $options[] = [
                'efCatalog' => $catalog,
                'efId' => $entry->ef_id,
                'Name' => $entry->name,
                'Unit' => $entry->unit,
                'CO2' => $entry->co2,
                'Fossil CH4' => $entry->fossil_ch4,
                'FossilCH4' => $entry->fossil_ch4,
                'CH4' => $entry->ch4,
                'N2O' => $entry->n2o,
                'Total' => $entry->total,
                'Source' => $entry->source,
            ];
        }

        if ($catalog === 'EF1' && Schema::hasTable('ef_overrides')) {
            $overrides = $this->loadEfOverrides($scope, $year);
            $options = $this->mergeOverrides($options, $overrides);
        }

        $warning = $options
            ? null
            : "EF library empty for profile={$profileCode} scope={$scope}. Run EfLibrarySeeder.";

        return [
            'ok' => true,
            'catalog' => $catalog,
            'options' => $options,
            'warning' => $warning,
        ];
    }

    private function loadEfFromTemplate(Cycle $cycle, string $catalog, TemplateRegistry $registry): array
    {
        try {
            $templateId = $this->resolveEfTemplateId($cycle, $registry);
            if (!$templateId) {
                return [
                    'ok' => true,
                    'catalog' => $catalog,
                    'options' => [],
                    'warning' => 'Template not resolved for EF catalog.',
                ];
            }

            $path = $this->resolveTemplatePath($templateId, $registry);
            $usedFallback = false;
            if (!$path && $this->templateExists($registry, 'MBAX_TGO_11102567')) {
                $fallbackId = 'MBAX_TGO_11102567';
                $fallbackPath = $this->resolveTemplatePath($fallbackId, $registry);
                if ($fallbackPath) {
                    $path = $fallbackPath;
                    $templateId = $fallbackId;
                    $usedFallback = true;
                }
            }
            if (!$path) {
                return [
                    'ok' => true,
                    'catalog' => $catalog,
                    'options' => [],
                    'warning' => 'Template file not found for EF catalog.',
                ];
            }

            $sheetName = $this->resolveEfSheetName($catalog);
            if ($sheetName === '') {
                return [
                    'ok' => true,
                    'catalog' => $catalog,
                    'options' => [],
                    'warning' => 'EF sheet name not resolved.',
                ];
            }

            $warning = null;
            try {
                $options = $this->readEfSheet($path, $sheetName, $catalog);
            } catch (\Throwable $e) {
                if ($catalog === 'AR5V2') {
                    $fallbackSheet = $this->resolveEfSheetName('AR5');
                    $options = $this->readEfSheet($path, $fallbackSheet, $catalog);
                    $warning = 'AR5V2 sheet missing; using AR5 sheet from template.';
                } else {
                    throw $e;
                }
            }
            Log::debug('EF catalog loaded from template', [
                'cycleId' => $cycle->id,
                'catalog' => $catalog,
                'templateId' => $templateId,
                'sheet' => $sheetName,
                'count' => count($options),
            ]);
            if (!$warning) {
                $warning = $options ? null : "EF sheet empty: {$sheetName}";
            }
            if ($usedFallback && $options) {
                $warning = $warning ? $warning . ' (fallback template)' : 'Loaded from fallback template.';
            }

            return [
                'ok' => true,
                'catalog' => $catalog,
                'options' => $options,
                'warning' => $warning,
            ];
        } catch (\Throwable $e) {
            Log::warning('EF template load failed', [
                'cycleId' => $cycle->id,
                'catalog' => $catalog,
                'error' => $e->getMessage(),
            ]);
            return [
                'ok' => true,
                'catalog' => $catalog,
                'options' => [],
                'warning' => 'EF sheet missing or parse failed: ' . $e->getMessage(),
            ];
        }
    }

    private function loadEf1FromTemplate(Cycle $cycle, TemplateRegistry $registry, $templateSetId = null): array
    {
        try {
            $templateId = $this->resolveEfTemplateId($cycle, $registry);
            if (!$templateId) {
                return [
                    'ok' => true,
                    'catalog' => 'EF1',
                    'options' => [],
                    'warning' => 'Template not resolved for EF1 catalog.',
                ];
            }

            $path = $this->resolveTemplatePath($templateId, $registry);
            if (!$path) {
                return [
                    'ok' => true,
                    'catalog' => 'EF1',
                    'options' => [],
                    'warning' => 'Template file not found for EF1 catalog.',
                ];
            }

            $sheetName = $this->resolveEf1SheetNameFromFile($path);
            if (!$sheetName) {
                Log::warning('EF1 sheet not found in template', [
                    'cycleId' => $cycle->id,
                    'templateSetId' => $templateSetId,
                    'templateId' => $templateId,
                    'templatePath' => $path,
                ]);
                return [
                    'ok' => true,
                    'catalog' => 'EF1',
                    'options' => [],
                    'warning' => 'EF1 sheet not found in template.',
                ];
            }

            $meta = [];
            $options = $this->readEf1Sheet($path, $sheetName, $meta);
            Log::info('EF1 catalog loaded from template', [
                'cycleId' => $cycle->id,
                'templateSetId' => $templateSetId,
                'templateId' => $templateId,
                'templatePath' => $path,
                'sheet' => $sheetName,
                'sectionFound' => $meta['combustionFound'] ?? false,
                'subsectionFound' => $meta['stationaryFound'] ?? false,
                'rows' => count($options),
            ]);
            $warning = null;
            if (!$options) {
                if (!($meta['stationaryFound'] ?? false)) {
                    $warning = 'EF1 sheet found but Stationary combustion section not found';
                } else {
                    $warning = "EF1 sheet empty: {$sheetName}";
                }
            }

            return [
                'ok' => true,
                'catalog' => 'EF1',
                'options' => $options,
                'warning' => $warning,
            ];
        } catch (\Throwable $e) {
            Log::warning('EF1 template load failed', [
                'cycleId' => $cycle->id,
                'error' => $e->getMessage(),
            ]);
            return [
                'ok' => true,
                'catalog' => 'EF1',
                'options' => [],
                'warning' => 'EF1 sheet missing or parse failed: ' . $e->getMessage(),
            ];
        }
    }

    private function loadEf1FromFallbackTemplate(TemplateRegistry $registry): array
    {
        $fallbackTemplateId = $this->templateExists($registry, 'MBAX_TGO_11102567')
            ? 'MBAX_TGO_11102567'
            : null;

        if (!$fallbackTemplateId) {
            return [
                'ok' => true,
                'catalog' => 'EF1',
                'options' => [],
                'warning' => 'EF1 fallback template not available.',
            ];
        }

        try {
            $path = $this->resolveTemplatePath($fallbackTemplateId, $registry);
            if (!$path) {
                return [
                    'ok' => true,
                    'catalog' => 'EF1',
                    'options' => [],
                    'warning' => 'EF1 fallback template file not found.',
                ];
            }

            $sheetName = $this->resolveEf1SheetNameFromFile($path);
            if (!$sheetName) {
                return [
                    'ok' => true,
                    'catalog' => 'EF1',
                    'options' => [],
                    'warning' => 'EF1 fallback sheet not found in template.',
                ];
            }

            $meta = [];
            $options = $this->readEf1Sheet($path, $sheetName, $meta);

            return [
                'ok' => true,
                'catalog' => 'EF1',
                'options' => $options,
                'warning' => $options ? 'EF1 catalog loaded from fallback template.' : 'EF1 fallback template has no rows.',
            ];
        } catch (\Throwable $e) {
            return [
                'ok' => true,
                'catalog' => 'EF1',
                'options' => [],
                'warning' => 'EF1 fallback load failed: ' . $e->getMessage(),
            ];
        }
    }

    private function resolveEfTemplateId(Cycle $cycle, TemplateRegistry $registry): ?string
    {
        $templateId = null;
        if (isset($cycle->template_id) && is_string($cycle->template_id)) {
            $resolved = $registry->resolveTemplateIdForProfile($cycle->template_id);
            if ($resolved) {
                $templateId = $resolved;
            }
        }

        $raw = strtoupper(trim((string) ($cycle->template_id ?? '')));
        if (!$templateId) {
            if (str_contains($raw, '2026') && $this->templateExists($registry, 'VSHEET_CFO_2026')) {
                $templateId = 'VSHEET_CFO_2026';
            } elseif (str_contains($raw, '2025') && $this->templateExists($registry, 'VSHEET_CFO_2025')) {
                $templateId = 'VSHEET_CFO_2025';
            }
        }

        if (!$templateId) {
            $year = is_numeric($cycle->year ?? null) ? (int) $cycle->year : null;
            if ($year !== null && $year >= 2026 && $this->templateExists($registry, 'VSHEET_CFO_2026')) {
                $templateId = 'VSHEET_CFO_2026';
            } elseif ($this->templateExists($registry, 'VSHEET_CFO_2025')) {
                $templateId = 'VSHEET_CFO_2025';
            } elseif ($this->templateExists($registry, 'VSHEET_CFO')) {
                $templateId = 'VSHEET_CFO';
            }
        }

        return $templateId;
    }

    private function templateExists(TemplateRegistry $registry, string $templateId): bool
    {
        $template = $registry->getTemplate($templateId);
        return !empty($template);
    }

    private function resolveTemplatePath(string $templateId, TemplateRegistry $registry): ?string
    {
        $mapping = $registry->getTemplate($templateId);
        if (!$mapping) return null;

        $envKey = $mapping['path']['env'] ?? null;
        if (is_string($envKey) && $envKey !== '') {
            $envPath = env($envKey);
            if (is_string($envPath) && $envPath !== '' && is_file($envPath)) {
                return $envPath;
            }
        }

        $fallbackRel = $mapping['path']['fallback'] ?? '';
        if (is_string($fallbackRel) && $fallbackRel !== '') {
            $fallback = base_path($fallbackRel);
            if (is_file($fallback)) return $fallback;
        }

        $basename = basename(str_replace('\\', '/', $fallbackRel ?: ($templateId . '.xlsx')));
        if ($basename !== '') {
            $candidates = [
                base_path('../shared/templates/' . $basename),
                base_path('../shared/templates/mbax/' . $basename),
                base_path('../frontend/src/assets/templates/mbax/' . $basename),
                base_path('storage/app/templates/mbax/' . $basename),
            ];
            foreach ($candidates as $candidate) {
                if (is_file($candidate)) {
                    return $candidate;
                }
            }
        }

        return null;
    }

    private function resolveEfSheetName(string $catalog): string
    {
        return match ($catalog) {
            'AR5V2' => 'EF TGO AR5 V2',
            'AR5' => 'EF TGO AR5',
            'EF1' => 'EF (1)',
            default => '',
        };
    }

    private function resolveEf1SheetNameFromFile(string $path): ?string
    {
        if (!class_exists(Xlsx::class)) {
            throw new \RuntimeException('PhpSpreadsheet not installed.');
        }

        $reader = new Xlsx();
        $names = $reader->listWorksheetNames($path);
        $candidates = ['EF (1)', 'EF(1)', 'EF1', 'EF 1', 'EF_1'];

        foreach ($names as $name) {
            $normalized = strtoupper(preg_replace('/\s+/', '', (string) $name));
            foreach ($candidates as $candidate) {
                $candidateNorm = strtoupper(preg_replace('/\s+/', '', $candidate));
                if ($normalized === $candidateNorm) {
                    return $name;
                }
            }
        }

        return null;
    }

    private function readEfSheet(string $path, string $sheetName, string $catalog): array
    {
        if (!class_exists(Xlsx::class)) {
            throw new \RuntimeException('PhpSpreadsheet not installed.');
        }

        $reader = new Xlsx();
        $reader->setReadDataOnly(true);
        $reader->setLoadSheetsOnly([$sheetName]);
        $spreadsheet = $reader->load($path);
        $sheet = $spreadsheet->getSheetByName($sheetName);
        if (!$sheet) {
            throw new \RuntimeException("Sheet not found: {$sheetName}");
        }

        $highestRow = $sheet->getHighestRow();
        $options = [];

        for ($row = 1; $row <= $highestRow; $row++) {
            $name = trim((string) $sheet->getCell('B' . $row)->getValue());
            $unit = trim((string) $sheet->getCell('C' . $row)->getValue());
            if ($name === '' || $unit === '') {
                continue;
            }

            if (strcasecmp($name, 'ชื่อ') === 0 || strcasecmp($name, 'name') === 0) {
                continue;
            }
            if (strcasecmp($unit, 'units') === 0 || strcasecmp($unit, 'unit') === 0) {
                continue;
            }

            $rawEfId = trim((string) $sheet->getCell('A' . $row)->getValue());
            $efId = $rawEfId !== '' ? $rawEfId : $this->buildEfId($name, $unit);
            if ($efId === '') {
                continue;
            }

            $co2 = $this->normalizeNumber($sheet->getCell('D' . $row)->getValue());
            $fossilCh4 = $this->normalizeNumber($sheet->getCell('E' . $row)->getValue());
            $ch4 = $this->normalizeNumber($sheet->getCell('F' . $row)->getValue());
            $n2o = $this->normalizeNumber($sheet->getCell('G' . $row)->getValue());
            $total = $this->normalizeNumber($sheet->getCell('H' . $row)->getValue());
            $source = trim((string) $sheet->getCell('I' . $row)->getValue());

            $options[] = [
                'efCatalog' => $catalog,
                'efId' => $efId,
                'Name' => $name,
                'Unit' => $unit,
                'CO2' => $co2,
                'Fossil CH4' => $fossilCh4,
                'FossilCH4' => $fossilCh4,
                'CH4' => $ch4,
                'N2O' => $n2o,
                'Total' => $total,
                'Source' => $source !== '' ? $source : null,
            ];
        }

        return $options;
    }

    private function readEf1Sheet(string $path, string $sheetName, array &$meta = []): array
    {
        if (!class_exists(Xlsx::class)) {
            throw new \RuntimeException('PhpSpreadsheet not installed.');
        }

        $reader = new Xlsx();
        $reader->setReadDataOnly(true);
        $reader->setLoadSheetsOnly([$sheetName]);
        $spreadsheet = $reader->load($path);
        $sheet = $spreadsheet->getSheetByName($sheetName);
        if (!$sheet) {
            throw new \RuntimeException("Sheet not found: {$sheetName}");
        }

        $highestRow = $sheet->getHighestRow();
        $options = [];
        $inCombustion = false;
        $stationaryStartRow = null;
        $section = '';
        $meta = [
            'combustionFound' => false,
            'stationaryFound' => false,
        ];

        for ($row = 1; $row <= $highestRow; $row++) {
            $colA = trim((string) $sheet->getCell('A' . $row)->getValue());
            $colB = trim((string) $sheet->getCell('B' . $row)->getValue());
            $colC = trim((string) $sheet->getCell('C' . $row)->getValue());
            $colD = trim((string) $sheet->getCell('D' . $row)->getValue());
            $colE = trim((string) $sheet->getCell('E' . $row)->getValue());

            if ($this->isEf1CombustionStart($colA, $colC)) {
                $inCombustion = true;
                $meta['combustionFound'] = true;
                $section = '';
                continue;
            }

            if ($inCombustion && $this->isEf1CombustionEnd($colC)) {
                break;
            }

            if (!$inCombustion) {
                continue;
            }

            if (!$meta['stationaryFound'] && stripos($colB, 'Stationary combustion') !== false) {
                $meta['stationaryFound'] = true;
                $section = 'Stationary combustion';
                if ($stationaryStartRow === null) {
                    $stationaryStartRow = $row;
                }
            }

            if ($colA !== '') {
                $section = $colA;
                if (stripos($section, 'Stationary combustion') !== false) {
                    $meta['stationaryFound'] = true;
                    if ($stationaryStartRow === null) {
                        $stationaryStartRow = $row;
                    }
                } elseif ($meta['stationaryFound'] && $stationaryStartRow !== null && $row > $stationaryStartRow) {
                    break;
                }
            }

            if ($section === '' || stripos($section, 'Stationary combustion') === false) {
                continue;
            }

            if ($colB === '') {
                continue;
            }

            if (stripos($colC, 'CO2') !== false && stripos($colD, 'CH4') !== false) {
                continue;
            }

            $efId = $this->mapEf1StationaryId($colB);
            if ($efId === null) {
                continue;
            }

            $name = $this->mapEf1StationaryName($efId);

            $co2 = $this->normalizeNumber($sheet->getCell('C' . $row)->getValue());
            $ch4 = $this->normalizeNumber($sheet->getCell('D' . $row)->getValue());
            $n2o = $this->normalizeNumber($sheet->getCell('E' . $row)->getValue());
            $ncv = $this->normalizeNumber($sheet->getCell('F' . $row)->getValue());
            $source = trim((string) $sheet->getCell('G' . $row)->getValue());

            $unit = 'kg';
            if ($ncv !== null && $ncv > 0) {
                $co2 = $co2 !== null ? $co2 * $ncv : null;
                $ch4 = $ch4 !== null ? $ch4 * $ncv : null;
                $n2o = $n2o !== null ? $n2o * $ncv : null;
            }

            $total = null;
            if ($co2 !== null || $ch4 !== null || $n2o !== null) {
                $total = ($co2 ?? 0) + ($ch4 ?? 0) * 28 + ($n2o ?? 0) * 265;
            }

            $options[] = [
                'efCatalog' => 'EF1',
                'efId' => $efId,
                'Name' => $name,
                'Unit' => $unit,
                'CO2' => $co2,
                'Fossil CH4' => 0,
                'FossilCH4' => 0,
                'CH4' => $ch4,
                'N2O' => $n2o,
                'SF6' => 0,
                'NF3' => 0,
                'HFCs' => 0,
                'PFCs' => 0,
                'Total' => $total,
                'Source' => $source !== '' ? $source : null,
            ];
        }

        return $options;
    }

    private function isEf1CombustionHeader(string $colC): bool
    {
        return stripos($colC, 'GHG emission') !== false;
    }

    private function isEf1CombustionStart(string $colA, string $colC): bool
    {
        if (stripos($colA, 'การเผาไหม้') !== false) {
            return true;
        }
        return $this->isEf1CombustionHeader($colC);
    }

    private function isEf1CombustionEnd(string $colC): bool
    {
        return stripos($colC, 'CO2 emission') !== false;
    }

    private function mapEf1StationaryId(string $name): ?string
    {
        $key = strtolower(trim($name));
        if ($key === '') return null;
        if (str_contains($key, 'biodiesel')) return 'EF1_STATIONARY_BIODIESEL_KG';
        if (str_contains($key, 'biogasoline') || str_contains($key, 'ethanol')) {
            return 'EF1_STATIONARY_ETHANOL_KG';
        }
        if (str_contains($key, 'diesel')) return 'EF1_STATIONARY_DIESEL_KG';
        if (str_contains($key, 'gasoline')) return 'EF1_STATIONARY_GASOLINE_KG';
        return null;
    }

    private function mapEf1StationaryName(string $efId): string
    {
        return match ($efId) {
            'EF1_STATIONARY_DIESEL_KG' => 'Diesel (Stationary combustion)',
            'EF1_STATIONARY_BIODIESEL_KG' => 'Biodiesel (Stationary combustion)',
            'EF1_STATIONARY_GASOLINE_KG' => 'Gasoline (Stationary combustion)',
            'EF1_STATIONARY_ETHANOL_KG' => 'Biogasoline (Ethanol) (Stationary combustion)',
            default => $efId,
        };
    }

    private function normalizeNumber($value): ?float
    {
        if ($value === null) return null;
        if (is_string($value) && trim($value) === '') return null;
        if (is_numeric($value)) return (float) $value;
        return null;
    }

    private function buildEfId(string $name, string $unit): string
    {
        $base = strtoupper(trim($name));
        $base = preg_replace('/[^A-Z0-9]+/', '_', $base) ?? '';
        $unitKey = strtoupper(trim($unit));
        $unitKey = preg_replace('/[^A-Z0-9]+/', '_', $unitKey) ?? '';
        $id = trim($base . '_' . $unitKey, '_');
        return $id;
    }

    private function normalizeCatalog(string $catalog, ?int $year): string
    {
        $catalog = strtoupper(trim($catalog));

        if ($catalog === 'EF(1)' || $catalog === 'EF1') {
            return 'EF1';
        }
        if ($catalog === 'AR5V2') {
            return ($year !== null && $year < 2026) ? 'AR5' : 'AR5V2';
        }
        if ($catalog === 'AR5') {
            return ($year !== null && $year >= 2026) ? 'AR5V2' : 'AR5';
        }

        return 'AR5';
    }

    private function loadEfOverrides(string $scope, ?int $year): array
    {
        if (!class_exists(EfOverride::class) || !Schema::hasTable('ef_overrides')) {
            return [];
        }

        $q = EfOverride::query()
            ->where('catalog', 'EF1')
            ->where('scope', $scope);

        if ($year !== null) {
            $q->where(function ($q) use ($year) {
                $q->whereNull('year')->orWhere('year', $year);
            })->orderByRaw('CASE WHEN year IS NULL THEN 0 ELSE 1 END')->orderBy('year', 'asc');
        } else {
            $q->orderByRaw('CASE WHEN year IS NULL THEN 0 ELSE 1 END');
        }

        $rows = $q->get()->all();

        $out = [];
        foreach ($rows as $row) {
            $out[] = [
                'efCatalog' => 'EF1',
                'efId' => $row->ef_id,
                'Name' => $row->name,
                'Unit' => $row->unit,
                'CO2' => $row->co2,
                'Fossil CH4' => $row->fossil_ch4,
                'FossilCH4' => $row->fossil_ch4,
                'CH4' => $row->ch4,
                'N2O' => $row->n2o,
                'Total' => $row->total,
                'Source' => $row->source,
            ];
        }

        return $out;
    }

    private function mergeOverrides(array $base, array $overrides): array
    {
        if (!$overrides) return $base;

        $map = [];
        foreach ($base as $row) {
            $id = trim((string) ($row['efId'] ?? ''));
            if ($id !== '') $map[$id] = $row;
        }
        foreach ($overrides as $row) {
            $id = trim((string) ($row['efId'] ?? ''));
            if ($id === '') continue;
            $map[$id] = array_merge($map[$id] ?? [], $row);
        }

        return array_values($map);
    }
}
