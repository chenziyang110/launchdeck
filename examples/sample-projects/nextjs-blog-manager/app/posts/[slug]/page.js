import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPostBySlug } from '../../../lib/posts.js';

export const dynamic = 'force-dynamic';

function formatDate(value) {
  if (!value) return 'Draft';
  return new Intl.DateTimeFormat('en', { dateStyle: 'long' }).format(new Date(value));
}

export default async function PostPage({ params }) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  return (
    <main className="shell narrow-shell">
      <header className="topbar">
        <Link className="wordmark" href="/">Field Notes</Link>
        <nav aria-label="Post actions">
          <Link className="text-link" href="/">All posts</Link>
          <Link className="button button-small" href={`/posts/${post.slug}/edit`}>Edit post</Link>
        </nav>
      </header>
      <article className="reading-pane">
        <div className="card-meta">
          <span className={`status status-${post.status}`}>{post.status}</span>
          <span>{formatDate(post.publishedAt || post.updatedAt)}</span>
        </div>
        <h1>{post.title}</h1>
        <p className="article-dek">{post.excerpt}</p>
        <p className="byline">By {post.author}</p>
        <div className="article-body">
          {post.body.split('\n\n').map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </div>
        <div className="article-tags">{post.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>
      </article>
    </main>
  );
}
