namespace LibraryCatalog;

public sealed record LibraryBook(
    string Isbn,
    string Title,
    string Author,
    int PublishedYear,
    bool Available);

public sealed record CreateBookRequest(
    string? Isbn,
    string? Title,
    string? Author,
    int PublishedYear,
    bool Available = true);

public sealed record HealthResponse(
    string Status,
    string Service,
    string Persistence,
    int BookCount);
