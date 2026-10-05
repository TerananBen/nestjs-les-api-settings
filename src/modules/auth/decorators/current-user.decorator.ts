import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { KeycloakUserPayload } from '../strategies/jwt.strategy';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): KeycloakUserPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

export const CurrentRole = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.primary_role || 'User';
  },
);

export const ProjectId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return (
      request.projectId ||
      request.headers['x-project-id'] ||
      request.headers['x-project'] ||
      request.headers['x-tenant-id'] ||
      request.user?.project_id
    );
  },
);
