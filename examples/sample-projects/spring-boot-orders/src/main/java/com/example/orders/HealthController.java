package com.example.orders;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {
    private final OrderService orderService;

    public HealthController(OrderService orderService) {
        this.orderService = orderService;
    }

    @GetMapping("/health")
    public HealthResponse health() {
        return new HealthResponse(
                "ok",
                "spring-boot-orders",
                "h2-file",
                orderService.count()
        );
    }

    public record HealthResponse(
            String status,
            String service,
            String database,
            long seededOrders
    ) {
    }
}
