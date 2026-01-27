<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Cycle;
use App\Services\EfCatalogLoaderService;
use App\Services\TemplateRegistry;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class CycleEfCatalogController extends Controller
{
    public function index(
        Request $request,
        Cycle $cycle,
        TemplateRegistry $registry,
        EfCatalogLoaderService $loader
    ) {
        try {
            $catalogRaw = strtoupper(trim((string) $request->query('catalog', 'AR5')));
            $scope = strtolower(trim((string) $request->query('scope', 'stationary')));

            $result = $loader->loadCycleCatalog($cycle, $catalogRaw, $scope, $registry);
            return response()->json($result);
        } catch (\Throwable $e) {
            Log::warning('Cycle EF catalog failed', [
                'cycleId' => $cycle->id,
                'catalog' => $request->query('catalog'),
                'scope' => $request->query('scope'),
                'error' => $e->getMessage(),
            ]);
            return response()->json([
                'ok' => true,
                'catalog' => strtoupper(trim((string) $request->query('catalog', 'AR5'))),
                'options' => [],
                'warning' => $e->getMessage(),
            ]);
        }
    }
}
