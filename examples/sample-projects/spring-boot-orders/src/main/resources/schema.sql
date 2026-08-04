CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(64) PRIMARY KEY,
    customer_name VARCHAR(160) NOT NULL,
    status VARCHAR(32) NOT NULL,
    total_cents BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at, id);
