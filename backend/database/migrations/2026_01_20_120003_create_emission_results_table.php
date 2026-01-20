<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('emission_results', function (Blueprint $table) {
            $table->id();
            $table->foreignId('cycle_id')->constrained('cycles')->cascadeOnDelete();
            $table->string('scope', 50)->default('1.1');
            $table->string('row_id', 200);

            $table->string('status', 20)->default('ok'); // ok|error
            $table->longText('error_message')->nullable();

            $table->string('ef_profile', 50)->nullable();
            $table->string('ef_id', 200)->nullable();
            $table->json('ef_used_snapshot_json')->nullable();

            $table->json('qty_months_json')->nullable();
            $table->json('tco2e_months_json')->nullable();
            $table->decimal('total_tco2e', 18, 6)->nullable();
            $table->timestamps();

            $table->unique(['cycle_id', 'scope', 'row_id'], 'emission_results_cycle_scope_row');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('emission_results');
    }
};

