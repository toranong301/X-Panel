<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Cycle;
use App\Services\MbaxTemplateService;
use Illuminate\Http\Request;

class CycleController extends Controller
{
    public function store(Request $request)
    {
        $payload = $request->validate([
            'year' => ['required', 'integer'],
            'name' => ['required', 'string', 'max:255'],
            'data_json' => ['nullable', 'array'],
        ]);

        $cycle = Cycle::create([
            'year' => $payload['year'],
            'name' => $payload['name'],
            'data_json' => $payload['data_json'] ?? null,
        ]);

        return response()->json($cycle);
    }

    public function show(Cycle $cycle)
    {
        return response()->json($cycle);
    }

    public function updateData(Request $request, Cycle $cycle)
    {
        $payload = $request->validate([
            'data_json' => ['nullable', 'array'],
            'data' => ['nullable', 'array'],
        ]);

        $cycle->data_json = $payload['data_json'] ?? $payload['data'] ?? [];
        $cycle->save();

        return response()->json(['id' => $cycle->id, 'updated' => true]);
    }

    public function preview(Request $request, Cycle $cycle, MbaxTemplateService $mbax)
    {
        $payload = $request->validate([
            'sheet' => ['required', 'string', 'max:200'],
            'range' => ['nullable', 'string', 'max:50'],
        ]);

        $sheet = $payload['sheet'];
        $range = $payload['range'] ?? 'A1:Z60';

        $spreadsheet = $mbax->loadTemplate($sheet, $range);
        $mbax->applyData($spreadsheet, $cycle->data_json ?? [], $cycle->attachments()->get()->all(), $sheet, $range);

        return response()->json($mbax->buildPreview($spreadsheet, $sheet, $range));
    }
}
