import { HttpException, type HttpStatus } from '@nestjs/common';

export class DomainError extends HttpException {
  constructor(code: string, message: string, status: HttpStatus) {
    super({ code, message }, status);
  }
}
