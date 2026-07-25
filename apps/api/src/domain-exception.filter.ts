import { Catch, HttpException, HttpStatus } from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import { DomainError } from "@growth-manager/domain";
import type { AuthenticatedRequest } from "./request-context.js";

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  public catch(error: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<AuthenticatedRequest>();
    const response = context.getResponse<{
      status: (status: number) => { send: (body: unknown) => void };
    }>();
    const requestId =
      request.tenantContext?.requestId ??
      this.header(request.headers["x-request-id"]) ??
      crypto.randomUUID();

    if (error instanceof DomainError) {
      response.status(this.statusFor(error.code)).send({
        error: {
          code: error.code,
          message: error.message,
          request_id: requestId,
          retryable: error.retryable
        }
      });
      return;
    }

    if (error instanceof HttpException) {
      response.status(error.getStatus()).send({
        error: {
          code: "GM-HTTP-REQUEST",
          message: error.message,
          request_id: requestId,
          retryable: false
        }
      });
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
      error: {
        code: "GM-INTERNAL-UNEXPECTED",
        message: "Não foi possível concluir a operação.",
        request_id: requestId,
        retryable: true
      }
    });
  }

  private statusFor(code: string): number {
    if (code.startsWith("GM-AUTHZ")) return HttpStatus.FORBIDDEN;
    if (code.includes("NOT-FOUND")) return HttpStatus.NOT_FOUND;
    if (code.includes("CONFLICT")) return HttpStatus.CONFLICT;
    if (code.includes("VALIDATION")) return HttpStatus.UNPROCESSABLE_ENTITY;
    return HttpStatus.BAD_REQUEST;
  }

  private header(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
  }
}
