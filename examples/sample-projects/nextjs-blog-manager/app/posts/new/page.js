import Link from 'next/link';
import PostForm from '../../../components/post-form.js';

export default function NewPostPage() {
  return (
    <main className="shell narrow-shell">
      <header className="topbar">
        <Link className="wordmark" href="/">Field Notes</Link>
        <Link className="text-link" href="/">Back to posts <span aria-hidden="true">↗</span></Link>
      </header>
      <div className="form-heading">
        <p className="eyebrow">New entry</p>
        <h1>Write something worth keeping.</h1>
        <p className="lede">Capture the idea first. You can shape it later.</p>
      </div>
      <PostForm />
    </main>
  );
}
