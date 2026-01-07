<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Fr041Config extends Model
{
    protected $fillable = [
        'cycle_id',
        'sheet_id',
        'section',
        'selected_row_ids',
        'options',
    ];

    protected $casts = [
        'selected_row_ids' => 'array',
        'options' => 'array',
    ];
}
