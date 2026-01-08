<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Cycle;
use Illuminate\Http\Request;

class Fr032SelectionController extends Controller
{
    public function show(Request $request, Cycle $cycle)
    {
        $sectionId = trim((string) ($request->query('sectionId') ?? ''));
        if ($sectionId === '') {
            return response()->json([
                'ok' => true,
                'sectionId' => '',
                'selections' => [],
            ]);
        }

        $data = $cycle->data_json ?? [];
        if (!is_array($data)) $data = [];

        $stored = $data['fr032Selection'] ?? [];
        $selections = [];

        if (is_array($stored) && isset($stored[$sectionId]) && is_array($stored[$sectionId])) {
            $selections = array_values($stored[$sectionId]);
        } else {
            $selections = $this->buildSelectionsFromCanonical($data, $sectionId);
        }

        return response()->json([
            'ok' => true,
            'sectionId' => $sectionId,
            'selections' => $selections,
        ]);
    }

    public function store(Request $request, Cycle $cycle)
    {
        $payload = $request->validate([
            'sectionId' => ['required', 'string', 'max:20'],
            'selections' => ['required', 'array'],
            'selections.*.itemId' => ['nullable', 'string', 'max:200'],
            'selections.*.itemName' => ['nullable', 'string', 'max:500'],
            'selections.*.include' => ['required', 'boolean'],
            'selections.*.reason' => ['nullable', 'string', 'max:1000'],
            'selections.*.efCatalog' => ['nullable', 'string', 'max:20'],
            'selections.*.efId' => ['nullable', 'string', 'max:200'],
        ]);

        $sectionId = trim((string) $payload['sectionId']);
        $selections = array_values($payload['selections'] ?? []);

        $data = $cycle->data_json ?? [];
        if (!is_array($data)) $data = [];

        $stored = $data['fr032Selection'] ?? [];
        if (!is_array($stored)) $stored = [];
        $stored[$sectionId] = $selections;
        $data['fr032Selection'] = $stored;

        $cycle->data_json = $data;
        $cycle->save();

        return response()->json([
            'ok' => true,
            'sectionId' => $sectionId,
            'selections' => $selections,
        ]);
    }

    private function buildSelectionsFromCanonical(array $data, string $sectionId): array
    {
        $rows = is_array($data['fr03_2'] ?? null) ? $data['fr03_2'] : [];
        $out = [];
        foreach ($rows as $row) {
            if (!is_array($row)) continue;
            if ((string) ($row['subScope'] ?? '') !== $sectionId) continue;
            if ((string) ($row['selection'] ?? '') !== 'เลือกประเมิน') continue;
            $itemLabel = trim((string) ($row['itemLabel'] ?? ''));
            if ($itemLabel === '') continue;
            $out[] = [
                'itemId' => '',
                'itemName' => $itemLabel,
                'include' => true,
            ];
        }
        return $out;
    }
}
