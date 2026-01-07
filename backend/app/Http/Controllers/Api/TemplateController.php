<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\TemplateRegistry;

class TemplateController extends Controller
{
    public function index(TemplateRegistry $registry)
    {
        $profiles = $registry->listProfiles();
        $out = array_map(function (array $profile) {
            return [
                'id' => $profile['id'] ?? '',
                'label' => $profile['label'] ?? '',
                'uiFlags' => $profile['uiFlags'] ?? new \stdClass(),
                'previewRanges' => $profile['previewRanges'] ?? new \stdClass(),
            ];
        }, $profiles);

        return response()->json([
            'ok' => true,
            'templates' => $out,
        ]);
    }
}
