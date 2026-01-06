<?php

return [
    'scope11' => [
        'template_path' => env('SCOPE11_TEMPLATE_PATH', ''),
        'template_dir' => env('SCOPE11_TEMPLATE_DIR', ''),
        'preview_range' => env('SCOPE11_PREVIEW_RANGE', 'E9:P14'),
        'preview_sheet' => env('SCOPE11_PREVIEW_SHEET', '1.1 Stationary '),
        'density' => [
            'biodieselKgPerL' => env('SCOPE11_BIODIESEL_KG_PER_L', 0.87),
            'ethanolKgPerL' => env('SCOPE11_ETHANOL_KG_PER_L', 0.79),
        ],
    ],
];
