import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { UrlStoreService } from './storage/url-store.service';
import { UrlController } from './urls/url.controller';

@Module({
  controllers: [HealthController, UrlController],
  providers: [UrlStoreService],
})
export class AppModule {}
