import { applyDecorators, HttpStatus, PipeTransform } from '@nestjs/common';
import { ApiBody, ApiQuery } from '@nestjs/swagger';
import type { ZodTypeAny, z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { AppError } from './errors';

export class ZodPipe<S extends ZodTypeAny> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new AppError(
        HttpStatus.BAD_REQUEST,
        'validation',
        'Validation failed',
        result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }
    return result.data;
  }
}

// Typed loosely on purpose: zod-to-json-schema's generic signature makes tsc recurse excessively.
const toJsonSchema = zodToJsonSchema as unknown as (schema: unknown, options: object) => Record<string, unknown>;

function jsonSchema(schema: ZodTypeAny) {
  return toJsonSchema(schema, { target: 'openApi3', $refStrategy: 'none' });
}

/** Documents a Zod-validated request body in OpenAPI (validation itself is done by ZodPipe). */
export const ApiZodBody = (schema: ZodTypeAny) => applyDecorators(ApiBody({ schema: jsonSchema(schema) }));

/** Documents Zod-validated query parameters in OpenAPI. */
export const ApiZodQuery = (schema: ZodTypeAny) => {
  const props = (jsonSchema(schema).properties ?? {}) as Record<string, Record<string, unknown>>;
  return applyDecorators(...Object.entries(props).map(([name, s]) => ApiQuery({ name, required: false, schema: s })));
};
