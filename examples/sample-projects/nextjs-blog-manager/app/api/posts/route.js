import { createPost, listPosts } from '../../../lib/posts.js';

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ posts: listPosts() });
}

export async function POST(request) {
  try {
    const post = createPost(await request.json());
    return Response.json({ post }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}
