<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('scope11_stationary_items', function (Blueprint $table) {
            $table->decimal('other_diesel_pct', 9, 6)->nullable()->after('other_type');
            $table->decimal('other_biodiesel_pct', 9, 6)->nullable()->after('other_diesel_pct');
            $table->decimal('other_gasoline_pct', 9, 6)->nullable()->after('other_biodiesel_pct');
            $table->decimal('other_ethanol_pct', 9, 6)->nullable()->after('other_gasoline_pct');
            $table->decimal('other_biodiesel_density_kg_per_l', 12, 6)->nullable()->after('other_ethanol_pct');
            $table->decimal('other_ethanol_density_kg_per_l', 12, 6)->nullable()->after('other_biodiesel_density_kg_per_l');
        });
    }

    public function down(): void
    {
        Schema::table('scope11_stationary_items', function (Blueprint $table) {
            $table->dropColumn([
                'other_diesel_pct',
                'other_biodiesel_pct',
                'other_gasoline_pct',
                'other_ethanol_pct',
                'other_biodiesel_density_kg_per_l',
                'other_ethanol_density_kg_per_l',
            ]);
        });
    }
};

