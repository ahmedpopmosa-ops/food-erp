import './env';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp, setupOpenApi } from './bootstrap';
import { config } from './config';

async function main() {
  config(); // fail fast on invalid environment
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app);
  setupOpenApi(app);
  app.enableShutdownHooks();
  await app.listen(config().API_PORT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
