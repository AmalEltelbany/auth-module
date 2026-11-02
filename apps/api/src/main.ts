import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { config } from './config.js';
import { configureApp } from './setup.js';

const app = configureApp(await NestFactory.create(AppModule));
app.enableShutdownHooks();
await app.listen(config.PORT);
