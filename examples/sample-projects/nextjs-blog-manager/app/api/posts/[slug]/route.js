import { deletePost, getPostBySlug, updatePost } from '../../../../lib/posts.js';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  return post ? Response.json({ post }) : Response.json({ error: 'Post not found' }, { status: 404 });
}

export async function PATCH(request, { params }) {
  const { slug } = await params;
  try {
    const post = updatePost(slug, await request.json());
    return post ? Response.json({ post }) : Response.json({ error: 'Post not found' }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}

export async function DELETE(_request, { params }) {
  const { slug } = await params;
  return deletePost(slug)
    ? Response.json({ deleted: true, slug })
    : Response.json({ error: 'Post not found' }, { status: 404 });
}
