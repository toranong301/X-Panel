<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ef_overrides', function (Blueprint $table) {
            $table->id();
            $table->string('catalog', 20)->default('EF1');
            $table->string('scope', 50)->default('stationary');
            $table->unsignedInteger('year')->nullable();

            $table->string('ef_id', 200);
            $table->string('name', 500)->nullable();
            $table->string('unit', 50)->nullable();

            $table->decimal('co2', 18, 10)->nullable();
            $table->decimal('fossil_ch4', 18, 10)->nullable();
            $table->decimal('ch4', 18, 10)->nullable();
            $table->decimal('n2o', 18, 10)->nullable();
            $table->decimal('total', 18, 10)->nullable();
            $table->string('source', 500)->nullable();

            $table->timestamps();

            $table->unique(['catalog', 'scope', 'year', 'ef_id'], 'ef_overrides_key');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ef_overrides');
    }
};

