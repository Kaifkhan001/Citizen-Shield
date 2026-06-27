// Zod-based validation pipe. Use by adding
//   @Body(new ZodValidationPipe(schema))
//   @Query(new ZodValidationPipe(schema))
//   @Param('id', new ZodParamPipe(uuidSchema))
// to a route handler — replaces the missing class-validator ValidationPipe.
//
// Throws BadRequestException with a structured `code: VALIDATION_ERROR`
// payload that the HttpExceptionFilter maps to the API envelope. The error
// message is contextual to where the value came from (body, query, param).

import { BadRequestException, PipeTransform, ArgumentMetadata } from '@nestjs/common';
import type { ZodSchema, ZodError, ZodIssue } from 'zod';
import { ErrorCode } from '@citizen-shield/errors';

const TYPE_TO_LOCATION: Record<ArgumentMetadata['type'], string> = {
  body: 'body',
  query: 'query',
  param: 'param',
  custom: 'input',
};

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown, metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const location = TYPE_TO_LOCATION[metadata.type] ?? 'input';
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: `Request ${location} failed validation`,
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

/**
 * Convenience alias for `@Param(name, new ZodParamPipe(schema))` so the call
 * site reads naturally. Same semantics as `ZodValidationPipe`; the alias
 * exists only to make intent obvious at the decorator.
 */
export class ZodParamPipe<T> extends ZodValidationPipe<T> {}
