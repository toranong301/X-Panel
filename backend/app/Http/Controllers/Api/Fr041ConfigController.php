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

        $config = Fr041Config::query()
            ->where('cycle_id', $cycle->id)
            ->where('sheet_id', self::SHEET_ID)
            ->where('section', self::SECTION_SCOPE11)
            ->first();

        return response()->json([
            'ok' => true,
            'sheetId' => self::SHEET_ID,
            'section' => self::SECTION_SCOPE11,
            'selectedRowIds' => $config?->selected_row_ids ?? [],
            'options' => $config?->options ?? new \stdClass(),
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
        $options = is_array($payload['options'] ?? null) ? $payload['options'] : null;

        $config = Fr041Config::updateOrCreate(
            [
                'cycle_id' => $cycle->id,
                'sheet_id' => self::SHEET_ID,
                'section' => self::SECTION_SCOPE11,
            ],
            [
                'selected_row_ids' => $selected,
                'options' => $options,
            ]
        );

        return response()->json([
            'ok' => true,
            'sheetId' => $config->sheet_id,
            'section' => $config->section,
            'selectedRowIds' => $config->selected_row_ids ?? [],
            'options' => $config->options ?? new \stdClass(),
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
