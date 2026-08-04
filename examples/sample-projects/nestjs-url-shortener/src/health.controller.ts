import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { UrlStoreService } from './storage/url-store.service';

@Controller('health')
export class HealthController {
  constructor(private readonly store: UrlStoreService) {}

  @Get()
  check() {
    if (!this.store.isReady()) {
      throw new ServiceUnavailableException('Persistence is not ready.');
    }

    return {
      status: 'ok',
      service: 'nestjs-url-shortener',
      persistence: 'file',
    };
  }
}
