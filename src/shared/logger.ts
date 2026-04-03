/**
 * 统一 Logger 接口
 */

export interface ILogger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

/**
 * 基于 console 的默认 Logger 实现
 */
export class ConsoleLogger implements ILogger {
  constructor(private readonly prefix: string = '') {}

  info(message: string, ...args: unknown[]): void {
    console.log(this.format(message), ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    console.warn(this.format(message), ...args);
  }

  error(message: string, ...args: unknown[]): void {
    console.error(this.format(message), ...args);
  }

  debug(message: string, ...args: unknown[]): void {
    console.debug(this.format(message), ...args);
  }

  private format(message: string): string {
    return this.prefix ? `[${this.prefix}] ${message}` : message;
  }
}
