<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Cycle;
use App\Models\EmissionResult;
use App\Services\EmissionCalcService;
use App\Services\ValidationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class CycleReviewController extends Controller
{
    public function validations(Cycle $cycle, ValidationService $validation)
    {
        return response()->json($validation->validateCycle($cycle));
    }

    public function lock(Request $request, Cycle $cycle, ValidationService $validation)
    {
        $payload = $request->validate([
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        if ($cycle->locked_at) {
            return response()->json([
                'ok' => true,
                'locked' => true,
                'locked_at' => optional($cycle->locked_at)->toIso8601String(),
                'message' => 'Already locked.',
            ]);
        }

        $result = $validation->validateCycle($cycle);
        if (!($result['ok'] ?? false)) {
            return response()->json([
                'ok' => false,
                'message' => 'Validation failed; cannot lock.',
                'errors' => $result['errors'] ?? [],
                'warnings' => $result['warnings'] ?? [],
            ], 422);
        }

        $cycle->locked_at = now();
        $cycle->locked_reason = $payload['reason'] ?? null;
        $cycle->save();

        return response()->json([
            'ok' => true,
            'locked' => true,
            'locked_at' => optional($cycle->locked_at)->toIso8601String(),
        ]);
    }

    public function unlock(Cycle $cycle)
    {
        $cycle->locked_at = null;
        $cycle->locked_reason = null;
        $cycle->save();

        return response()->json([
            'ok' => true,
            'locked' => false,
        ]);
    }

    public function summary(Cycle $cycle, EmissionCalcService $calc)
    {
        if (!Schema::hasTable('emission_results')) {
            return response()->json([
                'ok' => false,
                'message' => 'Missing table: emission_results',
            ], 500);
        }

        $rows = EmissionResult::query()
            ->where('cycle_id', $cycle->id)
            ->where('scope', '1.1')
            ->get();

        if ($rows->count() === 0) {
            $calc->recalcScope11($cycle);
            $rows = EmissionResult::query()
                ->where('cycle_id', $cycle->id)
                ->where('scope', '1.1')
                ->get();
        }

        $months = [];
        for ($i = 1; $i <= 12; $i++) {
            $months['M' . $i] = 0.0;
        }

        foreach ($rows as $row) {
            $m = is_array($row->tco2e_months_json ?? null) ? $row->tco2e_months_json : [];
            for ($i = 1; $i <= 12; $i++) {
                $key = 'M' . $i;
                $value = $m[$key] ?? null;
                if ($value === null || $value === '') continue;
                if (!is_numeric($value)) continue;
                $months[$key] += (float) $value;
            }
        }

        $total = array_sum(array_values($months));

        return response()->json([
            'ok' => true,
            'cycleId' => $cycle->id,
            'scopes' => [
                [
                    'scope' => '1.1',
                    'tco2eMonths' => $this->roundMonths($months),
                    'totalTco2e' => round($total, 6),
                ],
            ],
        ]);
    }

    private function roundMonths(array $months): array
    {
        $out = [];
        foreach ($months as $k => $v) {
            $out[$k] = round((float) $v, 6);
        }
        return $out;
    }
}

