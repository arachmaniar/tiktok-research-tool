// Engagement Score (per post) = views + (likes x 2) + (comments x 3) + (shares x 4)
export type PostEngagementInput = {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
};

export function postEngagementScore(post: PostEngagementInput): number {
  return (post.views ?? 0) + (post.likes ?? 0) * 2 + (post.comments ?? 0) * 3 + (post.shares ?? 0) * 4;
}
