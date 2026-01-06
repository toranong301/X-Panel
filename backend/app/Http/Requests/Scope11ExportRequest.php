<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class Scope11ExportRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $monthRules = [];
        $headerMonthRules = [];
        for ($i = 1; $i <= 12; $i++) {
            $monthRules["items.*.months.M{$i}"] = ['nullable', 'numeric'];
            $headerMonthRules["headerMonths.M{$i}"] = ['nullable', 'numeric'];
        }

        return [
            'splitEnabled' => ['required', 'boolean'],
            'periodYear' => ['nullable', 'numeric'],
            'headerMonths' => ['nullable', 'array'],
            'items' => ['required', 'array'],
            'items.*.rowId' => ['required', 'string'],
            'items.*.fuelKey' => ['nullable', 'string'],
            'items.*.label' => ['nullable', 'string'],
            'items.*.evidence' => ['nullable', 'string'],
            'items.*.unit' => ['required', 'in:L,kg'],
            'items.*.otherType' => ['nullable', 'string'],
            'items.*.months' => ['nullable', 'array'],
            ...$monthRules,
            ...$headerMonthRules,
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            $items = $this->input('items');
            if (!is_array($items)) {
                return;
            }
            foreach ($items as $idx => $item) {
                if (!is_array($item)) {
                    continue;
                }
                $months = $item['months'] ?? null;
                if ($months !== null && !is_array($months)) {
                    $validator->errors()->add("items.{$idx}.months", 'Months must be an object.');
                }
            }

            $headerMonths = $this->input('headerMonths');
            if ($headerMonths !== null && !is_array($headerMonths)) {
                $validator->errors()->add('headerMonths', 'Header months must be an object.');
            }
        });
    }

    public function payload(): array
    {
        return $this->validated();
    }
}
