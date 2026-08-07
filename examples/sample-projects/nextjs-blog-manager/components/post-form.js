'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const EMPTY_POST = {
  title: '',
  excerpt: '',
  body: '',
  author: 'Editorial desk',
  status: 'draft',
  tags: []
};

export default function PostForm({ initialPost = null }) {
  const router = useRouter();
  const [form, setForm] = useState(() => ({
    ...(initialPost || EMPTY_POST),
    tags: initialPost?.tags || []
  }));
  const [tagText, setTagText] = useState(initialPost?.tags?.join(', ') || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const isEditing = Boolean(initialPost);

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const endpoint = isEditing ? `/api/posts/${initialPost.slug}` : '/api/posts';
    const method = isEditing ? 'PATCH' : 'POST';
    const payload = {
      ...form,
      tags: tagText.split(',').map((tag) => tag.trim()).filter(Boolean)
    };

    try {
      const response = await fetch(endpoint, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to save the post');
      router.push(`/posts/${result.post.slug}`);
      router.refresh();
    } catch (saveError) {
      setError(saveError.message);
      setSaving(false);
    }
  }

  return (
    <form className="post-form" onSubmit={submit}>
      <label>
        Title
        <input name="title" value={form.title} onChange={updateField} required maxLength={120} />
      </label>
      <label>
        Short description
        <input name="excerpt" value={form.excerpt} onChange={updateField} maxLength={180} />
      </label>
      <label>
        Body
        <textarea name="body" value={form.body} onChange={updateField} required rows={12} />
      </label>
      <div className="form-row">
        <label>
          Author
          <input name="author" value={form.author} onChange={updateField} required />
        </label>
        <label>
          Status
          <select name="status" value={form.status} onChange={updateField}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </label>
      </div>
      <label>
        Tags <span className="hint">comma separated</span>
        <input value={tagText} onChange={(event) => setTagText(event.target.value)} placeholder="writing, ideas" />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button className="button" type="submit" disabled={saving}>{saving ? 'Saving…' : isEditing ? 'Save changes' : 'Create post'}</button>
        <button className="button button-quiet" type="button" onClick={() => router.back()} disabled={saving}>Cancel</button>
      </div>
    </form>
  );
}
