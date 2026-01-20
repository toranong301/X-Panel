<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Scope11StationaryItem extends Model
{
    protected $table = 'scope11_stationary_items';

    protected $fillable = [
        'cycle_id',
        'row_id',
        'item_label',
        'evidence_type',
        'evidence_other',
        'evidence',
        'unit',
        'fuel_key',
        'other_type',
        'months_json',
        'total',
    ];

    protected $casts = [
        'months_json' => 'array',
        'total' => 'float',
    ];

    public function cycle(): BelongsTo
    {
        return $this->belongsTo(Cycle::class);
    }
}

