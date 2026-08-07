using LibraryCatalog;
using Microsoft.AspNetCore.Hosting;

var builder = WebApplication.CreateBuilder(args);
var port = PortConfiguration.GetPort(Environment.GetEnvironmentVariable("PORT"));
var dataDirectory = Path.Combine(builder.Environment.ContentRootPath, "data");
var storePath = Environment.GetEnvironmentVariable("LIBRARY_DATA_PATH")
    ?? Path.Combine(dataDirectory, "catalog.json");
var seedPath = Environment.GetEnvironmentVariable("LIBRARY_SEED_PATH")
    ?? Path.Combine(dataDirectory, "seed.json");

builder.WebHost.UseUrls($"http://127.0.0.1:{port}");
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase);

var store = new LibraryStore(storePath, seedPath);
await store.InitializeAsync();
builder.Services.AddSingleton(store);

var app = builder.Build();

app.MapGet("/health", async (LibraryStore libraryStore, CancellationToken cancellationToken) =>
{
    var books = await libraryStore.ListAsync(cancellationToken);
    return Results.Ok(new HealthResponse(
        "ok",
        "aspnet-library-catalog",
        "json-file",
        books.Count));
});

app.MapGet("/api/books", async (LibraryStore libraryStore, CancellationToken cancellationToken) =>
    Results.Ok(await libraryStore.ListAsync(cancellationToken)));

app.MapGet("/api/books/{isbn}", async (
    string isbn,
    LibraryStore libraryStore,
    CancellationToken cancellationToken) =>
{
    var book = await libraryStore.FindAsync(isbn, cancellationToken);
    return book is null ? Results.NotFound() : Results.Ok(book);
});

app.MapPost("/api/books", async (
    CreateBookRequest request,
    LibraryStore libraryStore,
    CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(request.Isbn) ||
        string.IsNullOrWhiteSpace(request.Title) ||
        string.IsNullOrWhiteSpace(request.Author) ||
        request.PublishedYear is < 1000 or > 2100)
    {
        return Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["book"] = ["isbn, title, author, and a valid publishedYear are required."]
        });
    }

    var book = new LibraryBook(
        LibraryStore.NormalizeIsbn(request.Isbn),
        request.Title.Trim(),
        request.Author.Trim(),
        request.PublishedYear,
        request.Available);

    if (!await libraryStore.AddAsync(book, cancellationToken))
    {
        return Results.Conflict(new { message = $"A book with ISBN '{book.Isbn}' already exists." });
    }

    return Results.Created($"/api/books/{Uri.EscapeDataString(book.Isbn)}", book);
});

app.Run();

public partial class Program;
