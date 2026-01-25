<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('scope11_stationary_items', function (Blueprint $table) {
            $table->boolean('tank_mode_enabled')->default(false)->after('other_ethanol_density_kg_per_l');
            $table->decimal('tank_count', 18, 6)->nullable()->after('tank_mode_enabled');
            $table->decimal('kg_per_tank', 18, 6)->nullable()->after('tank_count');
            $table->string('tank_target_month', 5)->nullable()->after('kg_per_tank');
            $table->decimal('computed_kg', 18, 6)->nullable()->after('tank_target_month');
        });
    }

    public function down(): void
    {
        Schema::table('scope11_stationary_items', function (Blueprint $table) {
            $table->dropColumn([
                'tank_mode_enabled',
                'tank_count',
                'kg_per_tank',
                'tank_target_month',
                'computed_kg',
            ]);
        });
    }
};
