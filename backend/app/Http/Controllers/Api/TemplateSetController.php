<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\TemplateSetRegistry;

class TemplateSetController extends Controller
{
    public function index(TemplateSetRegistry $registry)
    {
        $sets = $registry->listSets();
        $out = array_map(function (array $set) {
            return [
                'id' => $set['id'] ?? '',
                'label' => $set['label'] ?? '',
                'templates' => $set['templates'] ?? [],
            ];
        }, $sets);

        return response()->json([
            'ok' => true,
            'templateSets' => $out,
        ]);
    }
}
