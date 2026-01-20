<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ef_library_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('ef_profile_id')->constrained('ef_profiles')->cascadeOnDelete();
            $table->string('scope', 50)->default('stationary');
            $table->string('ef_id', 200);
            $table->string('name', 500)->nullable();
            $table->string('unit', 50)->nullable();
            $table->decimal('co2', 18, 10)->nullable();
            $table->decimal('fossil_ch4', 18, 10)->nullable();
            $table->decimal('ch4', 18, 10)->nullable();
            $table->decimal('n2o', 18, 10)->nullable();
            $table->decimal('total', 18, 10)->nullable();
            $table->string('source', 500)->nullable();
            $table->json('meta_json')->nullable();
            $table->timestamps();

            $table->unique(['ef_profile_id', 'scope', 'ef_id'], 'ef_library_profile_scope_ef');
            $table->index(['scope', 'ef_id'], 'ef_library_scope_ef');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ef_library_entries');
    }
};

