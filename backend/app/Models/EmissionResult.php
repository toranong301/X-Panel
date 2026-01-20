<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmissionResult extends Model
{
    protected $table = 'emission_results';

    protected $fillable = [
        'cycle_id',
        'scope',
        'row_id',
        'status',
        'error_message',
        'ef_profile',
        'ef_id',
        'ef_used_snapshot_json',
        'qty_months_json',
        'tco2e_months_json',
        'total_tco2e',
    ];

    protected $casts = [
        'ef_used_snapshot_json' => 'array',
        'qty_months_json' => 'array',
        'tco2e_months_json' => 'array',
        'total_tco2e' => 'float',
    ];

    public function cycle(): BelongsTo
    {
        return $this->belongsTo(Cycle::class);
    }
}

