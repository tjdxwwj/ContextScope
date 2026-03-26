/**
 * 应用错误基类
 */

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 业务逻辑错误
 */
export class DomainError extends AppError {
  constructor(message: string, code: string = 'DOMAIN_ERROR') {
    super(message, 400, code);
  }
}

/**
 * 资源未找到
 */
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const message = id 
      ? `${resource} not found with id: ${id}`
      : `${resource} not found`;
    super(message, 404, 'NOT_FOUND');
  }
}

/**
 * 验证错误
 */
export class ValidationError extends AppError {
  constructor(message: string, public readonly field?: string) {
    super(message, 422, 'VALIDATION_ERROR');
  }
}

/**
 * 数据库错误
 */
export class DatabaseError extends AppError {
  constructor(message: string, public readonly originalError?: Error) {
    super(message, 500, 'DATABASE_ERROR', false);
  }
}
