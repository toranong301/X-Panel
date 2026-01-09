<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Cycle;
use App\Models\Fr041Config;
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

        return response()->json([
            'ok' => true,
            'sheetId' => self::SHEET_ID,
            'section' => self::SECTION_SCOPE11,
            'selectedRowIds' => $fr041['selectedRowIds'] ?? $config?->selected_row_ids ?? [],
            'options' => $fr041['options'] ?? $config?->options ?? new \stdClass(),
        ]);
    }

    public function update(Request $request, Cycle $cycle)
    {
        if (!Schema::hasTable('fr041_configs')) {
            return response()->json($this->defaultConfig());
        }

        $payload = $request->validate([
            'selectedRowIds' => ['nullable', 'array'],
            'selectedRowIds.*' => ['string', 'max:200'],
            'options' => ['nullable', 'array'],
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

        $data = is_array($cycle->data_json ?? null) ? $cycle->data_json : [];
        $fr041 = is_array($data['fr041Config'] ?? null) ? $data['fr041Config'] : [];
        $fr041['selectedRowIds'] = $selected;
        $fr041['options'] = $mergedOptions;
        $data['fr041Config'] = $fr041;
        $cycle->data_json = $data;
        $cycle->save();

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
}
