<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Cycle;
use App\Services\EmissionCalcService;
use Illuminate\Http\Request;

class EmissionCalcController extends Controller
{
    public function recalcScope11(Request $request, Cycle $cycle, EmissionCalcService $calc)
    {
        $result = $calc->recalcScope11($cycle);
        $status = ($result['ok'] ?? false) ? 200 : 422;

        return response()->json($result, $status);
    }
}

