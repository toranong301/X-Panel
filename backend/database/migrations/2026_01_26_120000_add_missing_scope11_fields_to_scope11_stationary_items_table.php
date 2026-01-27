<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('scope11_stationary_items')) {
            return;
        }

        $table = 'scope11_stationary_items';

        if (!Schema::hasColumn($table, 'other_diesel_pct')) {
            Schema::table($table, function (Blueprint $table) {
                $table->decimal('other_diesel_pct', 9, 6)->nullable();
            });
        }
        if (!Schema::hasColumn($table, 'other_biodiesel_pct')) {
            Schema::table($table, function (Blueprint $table) {
                $table->decimal('other_biodiesel_pct', 9, 6)->nullable();
            });
        }
        if (!Schema::hasColumn($table, 'other_gasoline_pct')) {
            Schema::table($table, function (Blueprint $table) {
                $table->decimal('other_gasoline_pct', 9, 6)->nullable();
            });
        }
        if (!Schema::hasColumn($table, 'other_ethanol_pct')) {
            Schema::table($table, function (Blueprint $table) {
                $table->decimal('other_ethanol_pct', 9, 6)->nullable();
            });
        }
        if (!Schema::hasColumn($table, 'other_biodiesel_density_kg_per_l')) {
            Schema::table($table, function (Blueprint $table) {
                $table->decimal('other_biodiesel_density_kg_per_l', 12, 6)->nullable();
            });
        }
        if (!Schema::hasColumn($table, 'other_ethanol_density_kg_per_l')) {
            Schema::table($table, function (Blueprint $table) {
                $table->decimal('other_ethanol_density_kg_per_l', 12, 6)->nullable();
            });
        }
        if (!Schema::hasColumn($table, 'tank_mode_enabled')) {
            Schema::table($table, function (Blueprint $table) {
                $table->boolean('tank_mode_enabled')->default(false);
            });
        }
        if (!Schema::hasColumn($table, 'tank_count')) {
            Schema::table($table, function (Blueprint $table) {
                $table->decimal('tank_count', 18, 6)->nullable();
            });
        }
        if (!Schema::hasColumn($table, 'kg_per_tank')) {
            Schema::table($table, function (Blueprint $table) {
                $table->decimal('kg_per_tank', 18, 6)->nullable();
            });
        }
        if (!Schema::hasColumn($table, 'tank_target_month')) {
            Schema::table($table, function (Blueprint $table) {
                $table->string('tank_target_month', 5)->nullable();
            });
        }
        if (!Schema::hasColumn($table, 'computed_kg')) {
            Schema::table($table, function (Blueprint $table) {
                $table->decimal('computed_kg', 18, 6)->nullable();
            });
        }
    }

    public function down(): void
    {
        if (!Schema::hasTable('scope11_stationary_items')) {
            return;
        }

        $table = 'scope11_stationary_items';
        $columns = [
            'other_diesel_pct',
            'other_biodiesel_pct',
            'other_gasoline_pct',
            'other_ethanol_pct',
            'other_biodiesel_density_kg_per_l',
            'other_ethanol_density_kg_per_l',
            'tank_mode_enabled',
            'tank_count',
            'kg_per_tank',
            'tank_target_month',
            'computed_kg',
        ];

        $toDrop = array_values(array_filter($columns, fn ($col) => Schema::hasColumn($table, $col)));
        if (!$toDrop) {
            return;
        }

        Schema::table($table, function (Blueprint $table) use ($toDrop) {
            $table->dropColumn($toDrop);
        });
    }
};
