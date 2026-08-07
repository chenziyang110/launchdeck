package com.example.orders;

import java.io.IOException;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class OrderService {
    private final OrderRepository orderRepository;
    private final ObjectMapper objectMapper;
    private final Path seedPath;

    public OrderService(
            OrderRepository orderRepository,
            ObjectMapper objectMapper,
            @Value("${orders.seed-path:data/seed.json}") String seedPath
    ) {
        this.orderRepository = orderRepository;
        this.objectMapper = objectMapper;
        this.seedPath = Path.of(seedPath);
    }

    public void seed() {
        try (Reader reader = Files.newBufferedReader(seedPath, StandardCharsets.UTF_8)) {
            List<SeedOrder> seedOrders = objectMapper.readValue(reader, new TypeReference<>() {
            });
            for (SeedOrder seedOrder : seedOrders) {
                if (!orderRepository.existsById(seedOrder.id())) {
                    orderRepository.insert(new Order(
                            seedOrder.id(),
                            seedOrder.customer(),
                            seedOrder.status(),
                            seedOrder.totalCents(),
                            Instant.parse(seedOrder.createdAt())
                    ));
                }
            }
        } catch (IOException | RuntimeException exception) {
            throw new IllegalStateException("Unable to load order seed data from " + seedPath, exception);
        }
    }

    public List<Order> findAll() {
        return orderRepository.findAll();
    }

    public Optional<Order> findById(String id) {
        return orderRepository.findById(id);
    }

    public Order create(CreateOrderRequest request) {
        Order order = new Order(
                "ord-" + UUID.randomUUID(),
                request.customer().trim(),
                request.status().trim().toUpperCase(),
                request.totalCents(),
                Instant.now()
        );
        orderRepository.insert(order);
        return order;
    }

    public long count() {
        return orderRepository.count();
    }

    private record SeedOrder(
            String id,
            String customer,
            String status,
            long totalCents,
            String createdAt
    ) {
    }
}
