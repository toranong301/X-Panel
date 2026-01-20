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
        'other_diesel_pct',
        'other_biodiesel_pct',
        'other_gasoline_pct',
        'other_ethanol_pct',
        'other_biodiesel_density_kg_per_l',
        'other_ethanol_density_kg_per_l',
        'months_json',
        'total',
    ];

    protected $casts = [
        'months_json' => 'array',
        'total' => 'float',
        'other_diesel_pct' => 'float',
        'other_biodiesel_pct' => 'float',
        'other_gasoline_pct' => 'float',
        'other_ethanol_pct' => 'float',
        'other_biodiesel_density_kg_per_l' => 'float',
        'other_ethanol_density_kg_per_l' => 'float',
    ];

    public function cycle(): BelongsTo
    {
        return $this->belongsTo(Cycle::class);
    }
}
