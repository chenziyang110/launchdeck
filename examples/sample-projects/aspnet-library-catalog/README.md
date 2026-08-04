# ASP.NET Library Catalog

A standalone ASP.NET Core 8 library catalog API. It uses a JSON file as local
persistence, so it can be copied and run without a database server. A fresh
copy is seeded with the same four books on every start; seed insertion is
idempotent and existing books are preserved.

## Requirements

- .NET 8 SDK or newer
- `curl` for the optional API examples

## Install

No global install is required. From this directory, restore the locked native
project dependencies:

```bash
dotnet restore tests/LibraryCatalog.Tests.csproj --locked-mode
```

The application uses only the ASP.NET Core framework supplied by the .NET SDK;
`packages.lock.json` records the dependency graph for reproducible restores.

## Test

Run the deterministic native test harness:

```bash
dotnet run --no-restore --project tests/LibraryCatalog.Tests.csproj
```

The tests verify repeatable seeding, sorted results, duplicate rejection,
file-backed persistence after reopening, and the default/overridden port rules.

## Run

Start the API in the foreground:

```bash
dotnet run --no-restore
```

It listens on `http://127.0.0.1:5217` by default. Override the port with
`PORT`:

```bash
PORT=6107 dotnet run --no-restore
```

On Windows PowerShell:

```powershell
$env:PORT = "6107"
dotnet run --no-restore
```

Check readiness and list the seeded books:

```bash
curl http://127.0.0.1:5217/health
curl http://127.0.0.1:5217/api/books
```

The API provides `GET /api/books/{isbn}` and accepts a new book with
`POST /api/books`:

```bash
curl -X POST http://127.0.0.1:5217/api/books \
  -H 'content-type: application/json' \
  -d '{"isbn":"9780000000001","title":"A New Shelf","author":"Casey Lin","publishedYear":2026,"available":true}'
```

The default local store is `data/catalog.json`. Set `LIBRARY_DATA_PATH` to
place it elsewhere, which is useful when running isolated copies:

```bash
LIBRARY_DATA_PATH=/tmp/library-catalog.json dotnet run --no-restore
```

## Cleanup

Stop the foreground process with `Ctrl+C`. After stopping, remove the generated
store if it is no longer needed:

```bash
rm -f data/catalog.json
```

On Windows PowerShell:

```powershell
Remove-Item -LiteralPath data/catalog.json -ErrorAction SilentlyContinue
```

Build and test output under `bin/` and `obj/` is ignored and can be removed
with `dotnet clean` when desired. Do not commit the generated store or build
output.
