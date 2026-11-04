import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { config } from './config.js';
import { configureApp } from './setup.js';

const app = await NestFactory.create<NestExpressApplication>(AppModule);
app.set('trust proxy', config.TRUST_PROXY);
configureApp(app);
app.enableShutdownHooks();
await app.listen(config.PORT);
