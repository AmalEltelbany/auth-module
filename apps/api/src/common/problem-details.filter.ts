import { STATUS_CODES } from 'node:http';
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { ProblemDetails } from '@auth-module/shared/types';

// Every error leaves the API as RFC 9457 problem details. Unknown errors become
// a bare 500 so stack traces and driver messages never reach the client.
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const { httpAdapter } = this.adapterHost;
    const res = host.switchToHttp().getResponse();
    const body = this.toProblem(exception);

    httpAdapter.setHeader(res, 'Content-Type', 'application/problem+json');
    httpAdapter.reply(res, body, body.status);
  }

  private toProblem(exception: unknown): ProblemDetails {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const { message, errors } = (typeof response === 'object' ? response : { message: response }) as {
        message?: unknown;
        errors?: ProblemDetails['errors'];
      };
      return {
        type: 'about:blank',
        title: STATUS_CODES[status] ?? 'Error',
        status,
        ...(typeof message === 'string' && { detail: message }),
        ...(errors && { errors }),
      };
    }

    if (isDuplicateKeyError(exception)) {
      const path = Object.keys(exception.keyPattern ?? {})[0] ?? '';
      return {
        type: 'about:blank',
        title: STATUS_CODES[409]!,
        status: 409,
        detail: 'Already exists',
        errors: [{ path, message: path === 'email' ? 'Email is already registered' : 'Already exists' }],
      };
    }

    this.logger.error(exception instanceof Error ? exception.stack : exception);
    return { type: 'about:blank', title: STATUS_CODES[500]!, status: 500 };
  }
}

function isDuplicateKeyError(e: unknown): e is { code: 11000; keyPattern?: Record<string, unknown> } {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 11000;
}
