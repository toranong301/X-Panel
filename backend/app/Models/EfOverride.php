<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EfOverride extends Model
{
    protected $table = 'ef_overrides';

    protected $fillable = [
        'catalog',
        'scope',
        'year',
        'ef_id',
        'name',
        'unit',
        'co2',
        'fossil_ch4',
        'ch4',
        'n2o',
        'total',
        'source',
    ];
}

