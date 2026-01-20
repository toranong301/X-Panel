<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!app()->environment(['local', 'development', 'demo'])) {
            return;
        }
        if (!Schema::hasTable('cycles')) {
            return;
        }

        $exists = DB::table('cycles')->where('id', 17)->exists();
        if ($exists) {
            return;
        }

        DB::table('cycles')->insert([
            'id' => 17,
            'year' => 2025,
            'name' => 'Demo Cycle 17',
            'template_id' => 'vsheet_cfo_2025',
            'data_json' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        if (!Schema::hasTable('cycles')) {
            return;
        }
        DB::table('cycles')->where('id', 17)->delete();
    }
};

