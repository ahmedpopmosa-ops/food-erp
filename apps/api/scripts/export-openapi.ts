// Writes apps/api/openapi.json from the running route metadata (no database connection is opened).
import '../src/env';
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { buildOpenApi, configureApp } from '../src/bootstrap';

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  configureApp(app);
  const doc = buildOpenApi(app);
  const out = resolve(__dirname, '../openapi.json');
  writeFileSync(out, JSON.stringify(doc, null, 2) + '\n');
  console.warn(`OpenAPI written to ${out} (${Object.keys(doc.paths).length} paths)`);
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
