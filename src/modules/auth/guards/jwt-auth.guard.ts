import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    if (err || !user) {
      const message = info?.message || err?.message || 'Unauthorized access: Invalid or missing Keycloak JWT token';
      throw new UnauthorizedException(message);
    }

    const request = context.switchToHttp().getRequest();
    // Attach user to request
    request.user = user;

    // Attach project_id from X-Project-Id header, query, or token
    const headerProjectId =
      request.headers['x-project-id'] ||
      request.headers['x-project'] ||
      request.headers['x-tenant-id'];

    request.projectId = headerProjectId || user.project_id;

    return user;
  }
}
