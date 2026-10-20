import { Module, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import * as redisStore from 'cache-manager-redis-store';

import typeorm from './config/typeorm';
import redis from './config/redis';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TableOrder } from './entities';
import DatabaseModule from './database.module';
import { authByKey } from './middleware/authByKey.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [typeorm, redis],
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const redisConfig = configService.get('redis');
        return {
          store: redisStore,
          host: redisConfig.host,
          port: redisConfig.port,
          password: redisConfig.password,
          db: redisConfig.db,
          ttl: 86400 * 30, // 1 day in seconds (default TTL for all cache entries)
        };
      },
    }),
    TypeOrmModule.forFeature([TableOrder]),
    DatabaseModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer) {
    consumer.apply(authByKey).forRoutes(AppController);
  }
}
