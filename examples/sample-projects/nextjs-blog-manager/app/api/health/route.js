import { getPersistenceInfo, listPosts } from '../../../lib/posts.js';

export const dynamic = 'force-dynamic';

export function GET() {
  const posts = listPosts();
  return Response.json({
    status: 'ok',
    service: 'nextjs-blog-manager',
    version: 1,
    posts: posts.length,
    persistence: getPersistenceInfo()
  });
}
