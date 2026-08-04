using System.Text.Json;
using LibraryCatalog;

var testRoot = Path.Combine(Path.GetTempPath(), $"library-catalog-tests-{Guid.NewGuid():N}");
Directory.CreateDirectory(testRoot);

try
{
    var seedPath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "data", "seed.json"));
    var storePath = Path.Combine(testRoot, "catalog.json");
    var store = new LibraryStore(storePath, seedPath);

    await store.InitializeAsync();
    var seededBooks = await store.ListAsync();
    Assert(seededBooks.Count == 4, "the deterministic seed contains four books");
    Assert(seededBooks[0].Title == "A Field Guide to Small Stars", "seed ordering is deterministic");
    Assert((await store.FindAsync("9780140328721"))?.Author == "Mara Ellis", "seed lookup works");

    await store.InitializeAsync();
    Assert((await store.ListAsync()).Count == 4, "initialization is idempotent");

    var added = new LibraryBook("9780000000001", "A New Shelf", "Casey Lin", 2026, true);
    Assert(await store.AddAsync(added), "new books can be persisted");
    Assert(!await store.AddAsync(added), "duplicate ISBNs are rejected");

    var reopened = new LibraryStore(storePath, seedPath);
    await reopened.InitializeAsync();
    Assert((await reopened.FindAsync(added.Isbn))?.Title == added.Title, "persisted books survive reopening");

    var storedJson = await File.ReadAllTextAsync(storePath);
    using var document = JsonDocument.Parse(storedJson);
    Assert(document.RootElement.GetArrayLength() == 5, "the local JSON store contains the seed and added book");
    Assert(PortConfiguration.GetPort(null) == PortConfiguration.DefaultPort, "the default port is stable");
    Assert(PortConfiguration.GetPort("6107") == 6107, "the port is overridable");

    Console.WriteLine("Library catalog tests passed.");
}
finally
{
    if (Directory.Exists(testRoot))
    {
        Directory.Delete(testRoot, recursive: true);
    }
}

static void Assert(bool condition, string description)
{
    if (!condition)
    {
        throw new InvalidOperationException($"Assertion failed: {description}");
    }
}
