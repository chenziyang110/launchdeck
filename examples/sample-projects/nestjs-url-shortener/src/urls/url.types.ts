export interface ShortLink {
  slug: string;
  url: string;
  createdAt: string;
  clicks: number;
}

export interface CreateLinkInput {
  url?: unknown;
  slug?: unknown;
}
