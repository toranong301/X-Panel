<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fr041_configs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('cycle_id');
            $table->string('sheet_id', 50);
            $table->string('section', 100);
            $table->json('selected_row_ids')->nullable();
            $table->json('options')->nullable();
            $table->timestamps();

            $table->unique(['cycle_id', 'sheet_id', 'section'], 'fr041_configs_cycle_section');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fr041_configs');
    }
};
