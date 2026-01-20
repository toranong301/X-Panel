<?php

namespace Database\Seeders;

use App\Models\EfProfile;
use Illuminate\Database\Seeder;

class EfProfileSeeder extends Seeder
{
    public function run(): void
    {
        EfProfile::query()->firstOrCreate(
            ['code' => 'AR5'],
            ['label' => 'TGO AR5']
        );

        EfProfile::query()->firstOrCreate(
            ['code' => 'AR5V2'],
            ['label' => 'TGO AR5 V2']
        );

        EfProfile::query()->firstOrCreate(
            ['code' => 'AR6'],
            ['label' => 'TGO AR6']
        );

        EfProfile::query()->firstOrCreate(
            ['code' => 'EF1'],
            ['label' => 'EF (1) / Other']
        );
    }
}

