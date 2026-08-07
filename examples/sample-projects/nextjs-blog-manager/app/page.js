import Link from 'next/link';
import { listPosts } from '../lib/posts.js';

export const dynamic = 'force-dynamic';

function formatDate(value) {
  if (!value) return 'Not published';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value));
}

export default function HomePage() {
  const posts = listPosts();
  const publishedCount = posts.filter((post) => post.status === 'published').length;
  const draftCount = posts.length - publishedCount;

  return (
    <main className="shell">
      <header className="topbar">
        <Link className="wordmark" href="/">Field Notes</Link>
        <nav aria-label="Primary navigation">
          <Link href="/">Posts</Link>
          <Link className="button button-small" href="/posts/new">New post</Link>
        </nav>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">Editorial workspace</p>
          <h1>Make room for the next good idea.</h1>
          <p className="lede">A focused home for drafting, refining, and publishing useful notes.</p>
        </div>
        <div className="stats" aria-label="Post summary">
          <span><strong>{publishedCount}</strong> published</span>
          <span><strong>{draftCount}</strong> drafts</span>
        </div>
      </section>

      <section className="section-heading">
        <div>
          <p className="eyebrow">Your library</p>
          <h2>Recent posts</h2>
        </div>
        <Link className="text-link" href="/posts/new">Start a draft <span aria-hidden="true">→</span></Link>
      </section>

      <div className="post-grid">
        {posts.map((post) => (
          <article className="post-card" key={post.id}>
            <div className="card-meta">
              <span className={`status status-${post.status}`}>{post.status}</span>
              <span>{formatDate(post.publishedAt || post.updatedAt)}</span>
            </div>
            <h3><Link href={`/posts/${post.slug}`}>{post.title}</Link></h3>
            <p>{post.excerpt}</p>
            <div className="card-footer">
              <span>{post.author}</span>
              <Link className="text-link" href={`/posts/${post.slug}`}>Read <span aria-hidden="true">↗</span></Link>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
