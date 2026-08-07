using System.Text.Json;

namespace LibraryCatalog;

public sealed class LibraryStore
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    private readonly string _storePath;
    private readonly string _seedPath;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private List<LibraryBook> _books = [];

    public LibraryStore(string storePath, string seedPath)
    {
        _storePath = Path.GetFullPath(storePath);
        _seedPath = Path.GetFullPath(seedPath);
    }

    public int SeededBookCount { get; private set; }

    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            var seeds = await ReadBooksAsync(_seedPath, cancellationToken);
            SeededBookCount = seeds.Count;
            Directory.CreateDirectory(Path.GetDirectoryName(_storePath)!);

            var books = File.Exists(_storePath)
                ? await ReadBooksAsync(_storePath, cancellationToken)
                : [];

            var knownIsbns = books
                .Select(book => book.Isbn)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            foreach (var seed in seeds)
            {
                if (knownIsbns.Add(seed.Isbn))
                {
                    books.Add(seed);
                }
            }

            _books = Normalize(books);
            await WriteBooksAsync(_books, cancellationToken);
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<IReadOnlyList<LibraryBook>> ListAsync(CancellationToken cancellationToken = default)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            return Normalize(_books);
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<LibraryBook?> FindAsync(string isbn, CancellationToken cancellationToken = default)
    {
        var normalizedIsbn = NormalizeIsbn(isbn);
        await _gate.WaitAsync(cancellationToken);
        try
        {
            return _books.FirstOrDefault(book =>
                string.Equals(book.Isbn, normalizedIsbn, StringComparison.OrdinalIgnoreCase));
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<bool> AddAsync(LibraryBook book, CancellationToken cancellationToken = default)
    {
        var normalized = book with
        {
            Isbn = NormalizeIsbn(book.Isbn),
            Title = book.Title.Trim(),
            Author = book.Author.Trim()
        };

        await _gate.WaitAsync(cancellationToken);
        try
        {
            if (_books.Any(existing => string.Equals(existing.Isbn, normalized.Isbn, StringComparison.OrdinalIgnoreCase)))
            {
                return false;
            }

            _books.Add(normalized);
            _books = Normalize(_books);
            await WriteBooksAsync(_books, cancellationToken);
            return true;
        }
        finally
        {
            _gate.Release();
        }
    }

    public static string NormalizeIsbn(string isbn) => isbn.Trim().ToUpperInvariant();

    private static List<LibraryBook> Normalize(IEnumerable<LibraryBook> books) => books
        .OrderBy(book => book.Title, StringComparer.OrdinalIgnoreCase)
        .ThenBy(book => book.Isbn, StringComparer.OrdinalIgnoreCase)
        .ToList();

    private static async Task<List<LibraryBook>> ReadBooksAsync(
        string path,
        CancellationToken cancellationToken)
    {
        await using var stream = File.OpenRead(path);
        var books = await JsonSerializer.DeserializeAsync<List<LibraryBook>>(stream, JsonOptions, cancellationToken);
        return books ?? throw new InvalidDataException($"The library data file '{path}' is empty.");
    }

    private async Task WriteBooksAsync(
        IReadOnlyCollection<LibraryBook> books,
        CancellationToken cancellationToken)
    {
        var temporaryPath = $"{_storePath}.{Guid.NewGuid():N}.tmp";
        await using (var stream = File.Create(temporaryPath))
        {
            await JsonSerializer.SerializeAsync(stream, books, JsonOptions, cancellationToken);
        }

        File.Move(temporaryPath, _storePath, overwrite: true);
    }
}

public static class PortConfiguration
{
    public const int DefaultPort = 5217;

    public static int GetPort(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return DefaultPort;
        }

        if (int.TryParse(value, out var port) && port is >= 1 and <= 65535)
        {
            return port;
        }

        throw new InvalidOperationException("PORT must be a number between 1 and 65535.");
    }
}
