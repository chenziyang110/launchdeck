package com.example.orders;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;

public record CreateOrderRequest(
        @NotBlank String customer,
        @NotBlank String status,
        @Positive long totalCents
) {
}
