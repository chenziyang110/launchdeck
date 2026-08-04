import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';

describe('URL shortener', () => {
  let app: INestApplication;
  let temporaryDirectory: string;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'nestjs-url-shortener-'));
    process.env.URL_STORE_PATH = join(temporaryDirectory, 'urls.json');

    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.URL_STORE_PATH;
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('reports a ready persistence-backed health surface', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok', service: 'nestjs-url-shortener', persistence: 'file' });
  });

  it('loads deterministic seed links and lists them', async () => {
    const response = await request(app.getHttpServer()).get('/api/links').expect(200);

    expect(response.body.links).toHaveLength(3);
    expect(response.body.links.map((link: { slug: string }) => link.slug)).toEqual([
      'docs',
      'homepage',
      'status',
    ]);
  });

  it('creates a link, persists it, and redirects through the short URL', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/links')
      .send({ url: 'https://example.org/articles/42', slug: 'article-42' })
      .expect(201);

    expect(created.body).toMatchObject({
      slug: 'article-42',
      url: 'https://example.org/articles/42',
      clicks: 0,
    });

    await request(app.getHttpServer())
      .get('/r/article-42')
      .expect(302)
      .expect('Location', 'https://example.org/articles/42');

    await request(app.getHttpServer())
      .get('/api/links/article-42')
      .expect(200)
      .expect((response) => {
        expect(response.body.clicks).toBe(1);
      });
  });

  it('rejects duplicate custom slugs without overwriting persisted data', async () => {
    await request(app.getHttpServer())
      .post('/api/links')
      .send({ url: 'https://example.org/first', slug: 'same-link' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/links')
      .send({ url: 'https://example.org/second', slug: 'same-link' })
      .expect(409);

    await request(app.getHttpServer())
      .get('/api/links/same-link')
      .expect(200)
      .expect((response) => {
        expect(response.body.url).toBe('https://example.org/first');
      });
  });
});
