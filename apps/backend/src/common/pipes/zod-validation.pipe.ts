// Zod-based validation pipe. Use by adding `@Body(new ZodValidationPipe(schema))`
// to a route handler — replaces the missing class-validator ValidationPipe.
//
// Throws BadRequestException with a structured `code: 'VALIDATION_ERROR'`
// payload that the HttpExceptionFilter maps to the API envelope.

import { BadRequestException, PipeTransform, ArgumentMetadata } from '@nestjs/common';
import type { ZodSchema, ZodError, ZodIssue } from 'zod';

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Request body failed validation',
        issues: this.flattenIssues(result.error),
      });
    }
    return result.data;
  }

  private flattenIssues(error: ZodError): Array<{ path: string; message: string }> {
    return error.issues.map((i: ZodIssue) => ({
      path: i.path.join('.'),
      message: i.message,
    }));
  }
}
