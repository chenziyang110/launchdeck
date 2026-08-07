import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { UrlStoreService } from '../storage/url-store.service';
import { CreateLinkInput } from './url.types';

@Controller()
export class UrlController {
  constructor(private readonly store: UrlStoreService) {}

  @Get('api/links')
  list() {
    return { links: this.store.list() };
  }

  @Get('api/links/:slug')
  get(@Param('slug') slug: string) {
    const link = this.store.find(slug);
    if (!link) {
      throw new NotFoundException('Short link not found.');
    }
    return link;
  }

  @Post('api/links')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: CreateLinkInput) {
    try {
      return await this.store.create(body ?? {});
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create short link.';
      if (message.includes('already exists')) {
        throw new ConflictException(message);
      }
      throw new BadRequestException(message);
    }
  }

  @Get('r/:slug')
  async redirect(@Param('slug') slug: string, @Res() response: Response): Promise<void> {
    const link = await this.store.recordClick(slug);
    if (!link) {
      throw new NotFoundException('Short link not found.');
    }
    response.redirect(HttpStatus.FOUND, link.url);
  }
}
