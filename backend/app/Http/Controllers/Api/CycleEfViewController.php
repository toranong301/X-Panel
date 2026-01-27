<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Cycle;
use App\Services\EfViewService;
use App\Services\TemplateRegistry;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class CycleEfViewController extends Controller
{
    public function index(
        Request $request,
        Cycle $cycle,
        TemplateRegistry $registry,
        EfViewService $efView
    ) {
        $scope = strtolower(trim((string) $request->query('scope', 'stationary')));

        try {
            $options = $efView->build($cycle, $scope, $registry);
            return response()->json([
                'ok' => true,
                'options' => $options,
            ]);
        } catch (\Throwable $e) {
            Log::warning('Cycle EF view failed', [
                'cycleId' => $cycle->id,
                'scope' => $scope,
                'error' => $e->getMessage(),
            ]);
            return response()->json([
                'ok' => true,
                'options' => [],
                'warning' => $e->getMessage(),
            ]);
        }
    }
}
