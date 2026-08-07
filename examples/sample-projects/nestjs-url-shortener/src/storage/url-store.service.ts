import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { CreateLinkInput, ShortLink } from '../urls/url.types';

const DEFAULT_STORE_PATH = join(process.cwd(), 'data', 'urls.json');
const SEED_PATH = join(process.cwd(), 'data', 'seed.json');

function isShortLink(value: unknown): value is ShortLink {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<ShortLink>;
  return (
    typeof candidate.slug === 'string' &&
    typeof candidate.url === 'string' &&
    typeof candidate.createdAt === 'string' &&
    Number.isInteger(candidate.clicks) &&
    (candidate.clicks ?? -1) >= 0
  );
}

@Injectable()
export class UrlStoreService implements OnModuleInit {
  private readonly storePath = resolve(process.env.URL_STORE_PATH ?? DEFAULT_STORE_PATH);
  private readonly links = new Map<string, ShortLink>();
  private ready = false;

  async onModuleInit(): Promise<void> {
    await this.load();
  }

  isReady(): boolean {
    return this.ready;
  }

  list(): ShortLink[] {
    return [...this.links.values()].map((link) => ({ ...link }));
  }

  find(slug: string): ShortLink | undefined {
    const link = this.links.get(slug);
    return link ? { ...link } : undefined;
  }

  async create(input: CreateLinkInput): Promise<ShortLink> {
    const url = this.normalizeUrl(input.url);
    const requestedSlug = input.slug === undefined ? undefined : this.normalizeSlug(input.slug);
    const slug = requestedSlug ?? this.generateSlug(url);

    if (this.links.has(slug)) {
      throw new Error(`A link with slug "${slug}" already exists.`);
    }

    const link: ShortLink = {
      slug,
      url,
      createdAt: new Date().toISOString(),
      clicks: 0,
    };
    this.links.set(slug, link);
    await this.persist();
    return { ...link };
  }

  async recordClick(slug: string): Promise<ShortLink | undefined> {
    const link = this.links.get(slug);
    if (!link) {
      return undefined;
    }

    link.clicks += 1;
    await this.persist();
    return { ...link };
  }

  private async load(): Promise<void> {
    await fs.mkdir(dirname(this.storePath), { recursive: true });

    let shouldPersist = false;
    try {
      const contents = await fs.readFile(this.storePath, 'utf8');
      const parsed: unknown = JSON.parse(contents);
      if (!Array.isArray(parsed) || !parsed.every(isShortLink)) {
        throw new Error(`The URL store at ${this.storePath} has an invalid shape.`);
      }
      for (const link of parsed) {
        this.links.set(link.slug, link);
      }
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error;
      }
      shouldPersist = true;
    }

    const seeds = await this.readSeeds();
    for (const seed of seeds) {
      if (!this.links.has(seed.slug)) {
        this.links.set(seed.slug, seed);
        shouldPersist = true;
      }
    }

    if (shouldPersist) {
      await this.persist();
    }
    this.ready = true;
  }

  private async readSeeds(): Promise<ShortLink[]> {
    const contents = await fs.readFile(SEED_PATH, 'utf8');
    const parsed: unknown = JSON.parse(contents);
    if (!Array.isArray(parsed) || !parsed.every(isShortLink)) {
      throw new Error(`The seed file at ${SEED_PATH} has an invalid shape.`);
    }
    return parsed.map((seed) => ({ ...seed }));
  }

  private async persist(): Promise<void> {
    const temporaryPath = `${this.storePath}.tmp-${process.pid}-${Date.now()}`;
    const payload = JSON.stringify(this.list(), null, 2) + '\n';
    await fs.writeFile(temporaryPath, payload, 'utf8');
    await fs.rename(temporaryPath, this.storePath);
  }

  private normalizeUrl(value: unknown): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error('url must be a non-empty string.');
    }

    let parsed: URL;
    try {
      parsed = new URL(value.trim());
    } catch {
      throw new Error('url must be a valid URL.');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('url must use http or https.');
    }
    return parsed.toString();
  }

  private normalizeSlug(value: unknown): string {
    if (typeof value !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
      throw new Error('slug must contain lowercase letters, numbers, and single hyphens.');
    }
    if (value.length < 3 || value.length > 32) {
      throw new Error('slug must be between 3 and 32 characters.');
    }
    return value;
  }

  private generateSlug(url: string): string {
    const digest = createHash('sha256').update(url).digest('hex').slice(0, 8);
    let slug = digest;
    let suffix = 2;
    while (this.links.has(slug)) {
      slug = `${digest}-${suffix}`;
      suffix += 1;
    }
    return slug;
  }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(error && typeof error === 'object' && (error as NodeJS.ErrnoException).code === 'ENOENT');
}
