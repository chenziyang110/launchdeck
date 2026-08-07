# Spring Boot Orders

Spring Boot Orders is a small HTTP service for browsing and creating orders.
It uses a local file-backed H2 database, so the project runs without a hosted
database or other service. The committed seed fixture is inserted idempotently
when the application starts.

## Requirements

- Java 17 or newer
- Maven 3.9 or newer

The `pom.xml` pins Spring Boot 3.4.5 and uses its dependency management for
repeatable transitive versions. Maven's POM is the native dependency manifest
for this project; Maven does not have a separate dependency lockfile format.

## Install and test

Install dependencies and run the native test suite from this directory:

```bash
mvn -B -ntp test
```

Package an executable jar when needed:

```bash
mvn -B -ntp package
```

## Run

The service listens on `127.0.0.1:8107` by default:

```bash
mvn -B -ntp spring-boot:run
```

Override the port for an isolated run with `PORT`:

```bash
PORT=9107 mvn -B -ntp spring-boot:run
```

On Windows PowerShell:

```powershell
$env:PORT = "9107"
mvn -B -ntp spring-boot:run
```

The database path defaults to `data/orders` and can be changed with
`ORDERS_DB_PATH`. The seed path defaults to `data/seed.json` and can be
changed with `ORDERS_SEED_PATH`.

## HTTP API

Check readiness and the number of seeded orders:

```bash
curl http://127.0.0.1:8107/health
```

List the deterministic seed orders:

```bash
curl http://127.0.0.1:8107/api/orders
```

Fetch one order:

```bash
curl http://127.0.0.1:8107/api/orders/ord-1001
```

Create an order:

```bash
curl -X POST http://127.0.0.1:8107/api/orders \
  -H 'content-type: application/json' \
  -d '{"customer":"Northwind Bakery","status":"PENDING","totalCents":2599}'
```

## Cleanup

Stop the foreground process with `Ctrl+C`. Remove generated build and local
database files after stopping if they are no longer needed:

```bash
mvn -B -ntp clean
rm -f data/orders*.mv.db data/orders*.trace.db
```

On Windows PowerShell:

```powershell
mvn -B -ntp clean
Remove-Item -Force -ErrorAction SilentlyContinue data\orders*.mv.db, data\orders*.trace.db
```

The committed `data/seed.json` is source data and should be kept.
