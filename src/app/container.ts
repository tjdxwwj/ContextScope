/**
 * 依赖注入容器配置
 */

import 'reflect-metadata';
import { Container } from 'inversify';
import { SqliteClient } from '../infrastructure/database/sqlite.client.js';
import { RequestSqliteRepository } from '../infrastructure/database/repositories/request-sqlite.repository.js';
import { TaskSqliteRepository } from '../infrastructure/database/repositories/task-sqlite.repository.js';
import { RequestService } from '../domain/request/request.service.js';
import { TaskService } from '../domain/task/task.service.js';
import { IRequestRepository } from '../domain/request/request.repository.js';
import { ITaskRepository } from '../domain/task/task.repository.js';
import { HooksRouter } from '../infrastructure/http/routes/hooks.router.js';
import { HttpServer } from './server.js';

/**
 * 依赖注入符号
 */
export const TYPES = {
  SqliteClient: Symbol.for('SqliteClient'),
  IRequestRepository: Symbol.for('IRequestRepository'),
  ITaskRepository: Symbol.for('ITaskRepository'),
  RequestService: Symbol.for('RequestService'),
  TaskService: Symbol.for('TaskService'),
  HooksRouter: Symbol.for('HooksRouter'),
  HttpServer: Symbol.for('HttpServer'),
};

/**
 * 创建 DI 容器
 */
export function createContainer(): Container {
  const container = new Container();

  // Infrastructure
  container.bind<SqliteClient>(TYPES.SqliteClient).to(SqliteClient).inSingletonScope();
  
  // Repositories
  container.bind<IRequestRepository>(TYPES.IRequestRepository).to(RequestSqliteRepository);
  container.bind<ITaskRepository>(TYPES.ITaskRepository).to(TaskSqliteRepository);
  
  // Domain Services
  container.bind<RequestService>(TYPES.RequestService).to(RequestService);
  container.bind<TaskService>(TYPES.TaskService).to(TaskService);
  
  // HTTP Routes
  container.bind<HooksRouter>(TYPES.HooksRouter).to(HooksRouter);
  
  // HTTP Server
  container.bind<HttpServer>(TYPES.HttpServer).to(HttpServer);

  return container;
}
