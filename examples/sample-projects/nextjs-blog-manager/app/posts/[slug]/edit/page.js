import Link from 'next/link';
import { notFound } from 'next/navigation';
import PostForm from '../../../../components/post-form.js';
import { getPostBySlug } from '../../../../lib/posts.js';

export const dynamic = 'force-dynamic';

export default async function EditPostPage({ params }) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  return (
    <main className="shell narrow-shell">
      <header className="topbar">
        <Link className="wordmark" href="/">Field Notes</Link>
        <Link className="text-link" href={`/posts/${post.slug}`}>Cancel <span aria-hidden="true">↗</span></Link>
      </header>
      <div className="form-heading">
        <p className="eyebrow">Edit entry</p>
        <h1>Shape the story.</h1>
        <p className="lede">Changes are saved to the local editorial store.</p>
      </div>
      <PostForm initialPost={post} />
    </main>
  );
}
