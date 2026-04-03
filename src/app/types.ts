/**
 * 依赖注入符号（独立文件，避免循环依赖）
 */

export const TYPES = {
  SqliteClient: Symbol.for('SqliteClient'),
  IRequestRepository: Symbol.for('IRequestRepository'),
  ITaskRepository: Symbol.for('ITaskRepository'),
  IReductionLogRepository: Symbol.for('IReductionLogRepository'),
  RequestService: Symbol.for('RequestService'),
  TaskService: Symbol.for('TaskService'),
  ContextReducerService: Symbol.for('ContextReducerService'),
  Logger: Symbol.for('Logger'),
  HooksRouter: Symbol.for('HooksRouter'),
  ApiRouter: Symbol.for('ApiRouter'),
  StaticRouter: Symbol.for('StaticRouter'),
  HttpServer: Symbol.for('HttpServer'),
};
