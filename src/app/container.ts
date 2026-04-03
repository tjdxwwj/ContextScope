/**
 * 依赖注入容器配置
 */

import 'reflect-metadata';
import { Container } from 'inversify';
import { SqliteClient } from '../infrastructure/database/sqlite.client.js';
import { RequestSqliteRepository } from '../infrastructure/database/repositories/request-sqlite.repository.js';
import { TaskSqliteRepository } from '../infrastructure/database/repositories/task-sqlite.repository.js';
import { ReductionLogSqliteRepository } from '../infrastructure/database/repositories/reduction-log-sqlite.repository.js';
import { RequestService } from '../domain/request/request.service.js';
import { TaskService } from '../domain/task/task.service.js';
import { ContextReducerService } from '../domain/context-reducer/context-reducer.service.js';
import { IRequestRepository } from '../domain/request/request.repository.js';
import { ITaskRepository } from '../domain/task/task.repository.js';
import type { IReductionLogRepository } from '../domain/context-reducer/reduction-log.repository.js';
import { HooksRouter } from '../infrastructure/http/routes/hooks.router.js';
import { HttpServer } from './server.js';
import { ApiRouter } from '../infrastructure/http/routes/api.router.js';
import { StaticRouter } from '../infrastructure/http/routes/static.router.js';
import { ConsoleLogger, type ILogger } from '../shared/logger.js';
import { TYPES } from './types.js';

export { TYPES };

/**
 * 创建 DI 容器
 */
export function createContainer(): Container {
  const container = new Container();

  // Infrastructure
  container.bind<SqliteClient>(TYPES.SqliteClient).to(SqliteClient).inSingletonScope();
  container.bind<ILogger>(TYPES.Logger).toConstantValue(new ConsoleLogger('ContextScope'));

  // Repositories
  container.bind<IRequestRepository>(TYPES.IRequestRepository).to(RequestSqliteRepository);
  container.bind<ITaskRepository>(TYPES.ITaskRepository).to(TaskSqliteRepository);
  container.bind<IReductionLogRepository>(TYPES.IReductionLogRepository).to(ReductionLogSqliteRepository);

  // Domain Services
  container.bind<RequestService>(TYPES.RequestService).to(RequestService);
  container.bind<TaskService>(TYPES.TaskService).to(TaskService);
  container.bind<ContextReducerService>(TYPES.ContextReducerService).to(ContextReducerService);

  // HTTP Routes
  container.bind<HooksRouter>(TYPES.HooksRouter).to(HooksRouter);
  container.bind<ApiRouter>(TYPES.ApiRouter).to(ApiRouter);
  container.bind<StaticRouter>(TYPES.StaticRouter).to(StaticRouter);

  // HTTP Server
  container.bind<HttpServer>(TYPES.HttpServer).to(HttpServer);

  return container;
}
