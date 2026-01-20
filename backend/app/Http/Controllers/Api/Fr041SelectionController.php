<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Cycle;
use Illuminate\Http\Request;

class Fr041SelectionController extends Controller
{
    public function store(Request $request, Cycle $cycle)
    {
        if ($cycle->locked_at) {
            return response()->json([
                'ok' => false,
                'code' => 'CYCLE_LOCKED',
                'message' => 'This reporting period is locked.',
            ], 423);
        }

        $payload = $request->validate([
            'rows' => ['required', 'array'],
            'rows.*.rowNo' => ['nullable'],
            'rows.*.rowId' => ['nullable', 'string', 'max:200'],
            'rows.*.itemId' => ['nullable', 'string', 'max:200'],
            'rows.*.itemLabel' => ['nullable', 'string', 'max:500'],
            'rows.*.itemName' => ['nullable', 'string', 'max:500'],
            'rows.*.sectionId' => ['nullable', 'string', 'max:20'],
            'rows.*.fuelKey' => ['nullable', 'string', 'max:50'],
            'rows.*.evidence' => ['nullable', 'string', 'max:1000'],
            'rows.*.unit' => ['nullable', 'string', 'max:50'],
            'rows.*.qty' => ['nullable'],
            'rows.*.total' => ['nullable'],
            'rows.*.efCatalog' => ['nullable', 'string', 'max:20'],
            'rows.*.efId' => ['nullable', 'string', 'max:200'],
        ]);

        $rows = array_values(array_filter($payload['rows'] ?? [], fn ($row) => is_array($row)));
        $normalized = [];
        $rowNo = 11;
        foreach ($rows as $row) {
            $itemId = (string) ($row['itemId'] ?? $row['rowId'] ?? '');
            $itemName = (string) ($row['itemName'] ?? $row['itemLabel'] ?? '');
            if ($itemId === '' && $itemName === '') continue;

            $rowNoRaw = $row['rowNo'] ?? null;
            $rowNoValue = (is_numeric($rowNoRaw) ? (int) $rowNoRaw : $rowNo);

            $normalized[] = [
                'rowNo' => $rowNoValue,
                'rowId' => (string) ($row['rowId'] ?? $row['itemId'] ?? ''),
                'itemId' => $itemId,
                'itemName' => $itemName,
                'sectionId' => (string) ($row['sectionId'] ?? ''),
                'fuelKey' => (string) ($row['fuelKey'] ?? ''),
                'evidence' => (string) ($row['evidence'] ?? ''),
                'unit' => (string) ($row['unit'] ?? ''),
                'qty' => $row['qty'] ?? $row['total'] ?? null,
                'efCatalog' => (string) ($row['efCatalog'] ?? ''),
                'efId' => (string) ($row['efId'] ?? ''),
            ];

            $rowNo += 1;
        }

        $data = $cycle->data_json ?? [];
        if (!is_array($data)) $data = [];
        $data['fr041Selection'] = $normalized;
        $cycle->data_json = $data;
        $cycle->save();

        return response()->json([
            'ok' => true,
            'rows' => $normalized,
        ]);
    }
}
