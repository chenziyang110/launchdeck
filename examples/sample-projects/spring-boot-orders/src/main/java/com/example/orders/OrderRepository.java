package com.example.orders;

import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class OrderRepository {
    private static final RowMapper<Order> ORDER_ROW_MAPPER = (resultSet, rowNumber) -> new Order(
            resultSet.getString("id"),
            resultSet.getString("customer_name"),
            resultSet.getString("status"),
            resultSet.getLong("total_cents"),
            resultSet.getTimestamp("created_at").toInstant()
    );

    private final JdbcTemplate jdbcTemplate;

    public OrderRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<Order> findAll() {
        return jdbcTemplate.query(
                "SELECT id, customer_name, status, total_cents, created_at "
                        + "FROM orders ORDER BY created_at, id",
                ORDER_ROW_MAPPER
        );
    }

    public Optional<Order> findById(String id) {
        return jdbcTemplate.query(
                "SELECT id, customer_name, status, total_cents, created_at "
                        + "FROM orders WHERE id = ?",
                ORDER_ROW_MAPPER,
                id
        ).stream().findFirst();
    }

    public boolean existsById(String id) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM orders WHERE id = ?",
                Integer.class,
                id
        );
        return count != null && count > 0;
    }

    public void insert(Order order) {
        jdbcTemplate.update(
                "INSERT INTO orders (id, customer_name, status, total_cents, created_at) "
                        + "VALUES (?, ?, ?, ?, ?)",
                order.id(),
                order.customer(),
                order.status(),
                order.totalCents(),
                Timestamp.from(order.createdAt())
        );
    }

    public long count() {
        Long count = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM orders", Long.class);
        return count == null ? 0 : count;
    }
}
