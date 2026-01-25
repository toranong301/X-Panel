<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Cycle;
use App\Models\Fr041Config;
use App\Models\Scope11StationaryItem;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class Fr041ConfigController extends Controller
{
    private const SHEET_ID = 'fr041';
    private const SECTION_SCOPE11 = 'scope1_stationary';

    public function show(Cycle $cycle)
    {
        if (!Schema::hasTable('fr041_configs')) {
            return response()->json($this->defaultConfig());
        }

        $data = is_array($cycle->data_json ?? null) ? $cycle->data_json : [];
        $fr041 = is_array($data['fr041Config'] ?? null) ? $data['fr041Config'] : [];

        $config = Fr041Config::query()
            ->where('cycle_id', $cycle->id)
            ->where('sheet_id', self::SHEET_ID)
            ->where('section', self::SECTION_SCOPE11)
            ->first();

        $selectedRowIds = $fr041['selectedRowIds'] ?? $config?->selected_row_ids ?? [];
        $selectedRowIds = is_array($selectedRowIds) ? $selectedRowIds : [];

        $options = $this->resolveOptions($fr041['options'] ?? null, $config?->options ?? null);
        $options = $this->ensureSelectionsV2($cycle, $config, $options);

        return response()->json([
            'ok' => true,
            'sheetId' => self::SHEET_ID,
            'section' => self::SECTION_SCOPE11,
            'selectedRowIds' => $selectedRowIds,
            'options' => $options ?: new \stdClass(),
        ]);
    }

    public function update(Request $request, Cycle $cycle)
    {
        if ($cycle->locked_at) {
            return response()->json([
                'ok' => false,
                'code' => 'CYCLE_LOCKED',
                'message' => 'This reporting period is locked.',
            ], 423);
        }

        if (!Schema::hasTable('fr041_configs')) {
            return response()->json($this->defaultConfig());
        }

        $payload = $request->validate([
            'selectedRowIds' => ['nullable', 'array'],
            'selectedRowIds.*' => ['string', 'max:200'],
            'options' => ['nullable', 'array'],
            'options.selections_v2' => ['nullable', 'array'],
        ]);

        $selected = array_values(array_unique(array_filter(
            $payload['selectedRowIds'] ?? [],
            fn ($value) => is_string($value) && trim($value) !== ''
        )));
        $optionsInput = $request->input('options');
        $options = is_array($optionsInput) ? $optionsInput : [];
        if (!$options) {
            $rawPayload = json_decode($request->getContent(), true);
            $options = is_array($rawPayload['options'] ?? null) ? $rawPayload['options'] : [];
        }

        $existing = Fr041Config::query()
            ->where('cycle_id', $cycle->id)
            ->where('sheet_id', self::SHEET_ID)
            ->where('section', self::SECTION_SCOPE11)
            ->first();
        $existingOptions = is_array($existing?->options ?? null) ? $existing->options : [];
        $mergedOptions = array_merge($existingOptions, $options);

        $config = Fr041Config::updateOrCreate(
            [
                'cycle_id' => $cycle->id,
                'sheet_id' => self::SHEET_ID,
                'section' => self::SECTION_SCOPE11,
            ],
            [
                'selected_row_ids' => $selected,
                'options' => $mergedOptions,
            ]
        );

        $this->persistFr041ConfigData($cycle, $config, $mergedOptions, $selected);

        return response()->json([
            'ok' => true,
            'sheetId' => $config->sheet_id,
            'section' => $config->section,
            'selectedRowIds' => $config->selected_row_ids ?? [],
            'options' => $mergedOptions ?: ($config->options ?? new \stdClass()),
        ]);
    }

    private function defaultConfig(): array
    {
        return [
            'ok' => true,
            'sheetId' => self::SHEET_ID,
            'section' => self::SECTION_SCOPE11,
            'selectedRowIds' => [],
            'options' => ['templateSetId' => 'vsheet_base'],
        ];
    }

    private function resolveOptions($payloadOptions, $dbOptions): array
    {
        $payload = $this->normalizeOptionsValue($payloadOptions);
        if (is_array($payload)) {
            return $payload;
        }
        $db = $this->normalizeOptionsValue($dbOptions);
        if (is_array($db)) {
            return $db;
        }
        return [];
    }

    private function normalizeOptionsValue($value): ?array
    {
        if (is_array($value)) {
            return $value;
        }
        if (is_object($value)) {
            return json_decode(json_encode($value), true);
        }
        return null;
    }

    private function ensureSelectionsV2(Cycle $cycle, ?Fr041Config $config, array $options): array
    {
        $existing = $this->extractSelectionsV2($options);
        if ($existing !== null) {
            $options['selections_v2'] = $existing;
            return $options;
        }

        if (!$config) {
            return $options;
        }

        $rowIds = is_array($config->selected_row_ids) ? $config->selected_row_ids : [];
        if (!$rowIds) {
            return $options;
        }

        $derived = $this->buildSelectionsFromRowIds($cycle, $rowIds);
        if (!$derived) {
            return $options;
        }

        $options['selections_v2'] = $derived;
        $this->persistFr041ConfigData($cycle, $config, $options, $rowIds);
        return $options;
    }

    private function extractSelectionsV2(array $options): ?array
    {
        if (!array_key_exists('selections_v2', $options)) {
            return null;
        }
        $value = $options['selections_v2'];
        return is_array($value) ? $value : null;
    }

    private function buildSelectionsFromRowIds(Cycle $cycle, array $rowIds): array
    {
        if (!$rowIds) {
            return [];
        }

        $rows = Scope11StationaryItem::query()
            ->where('cycle_id', $cycle->id)
            ->whereIn('row_id', $rowIds)
            ->orderBy('row_id')
            ->get();

        $out = [];
        foreach ($rows as $row) {
            $fuelKey = strtoupper(trim((string) $row->fuel_key));
            $components = $this->componentsForFuelKey($fuelKey);
            foreach ($components as $component) {
                $out[] = [
                    'lineId' => "{$row->row_id}::{$component}",
                    'parentRowId' => $row->row_id,
                    'component' => $component,
                    'include' => true,
                    'efCatalog' => null,
                    'efId' => null,
                ];
            }
        }

        return $out;
    }

    private function componentsForFuelKey(string $fuelKey): array
    {
        $normalized = preg_replace('/[^A-Z0-9]/', '', strtoupper($fuelKey));
        if (in_array($normalized, ['B7', 'B10'], true)) {
            return ['DIESEL_L', 'BIODIESEL_KG'];
        }
        if (in_array($normalized, ['9195', 'E20'], true)) {
            return ['GASOLINE_L', 'ETHANOL_KG'];
        }
        if ($normalized === 'OTHER') {
            return ['DIESEL_L'];
        }
        return ['DIESEL_L'];
    }

    private function persistFr041ConfigData(Cycle $cycle, Fr041Config $config, array $options, array $selectedRowIds): void
    {
        $config->options = $options;
        $config->save();

        $data = is_array($cycle->data_json ?? null) ? $cycle->data_json : [];
        $fr041 = is_array($data['fr041Config'] ?? null) ? $data['fr041Config'] : [];
        $fr041['selectedRowIds'] = $selectedRowIds;
        $fr041['options'] = $options;
        $data['fr041Config'] = $fr041;
        $cycle->data_json = $data;
        $cycle->save();
    }
}
