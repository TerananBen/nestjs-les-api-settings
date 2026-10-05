import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { JwksClient } from 'jwks-rsa';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const jwksRsa = require('jwks-rsa');
import { getKeycloakConfig } from '../../../config/keycloak.config';

export interface KeycloakUserPayload {
  sub: string;
  preferred_username?: string;
  email?: string;
  given_name?: string;
  family_name?: string;
  name?: string;
  realm_access?: {
    roles?: string[];
  };
  resource_access?: Record<string, { roles?: string[] }>;
  project_id?: string;
  tenant_id?: string;
  roles: string[];
  primary_role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(JwtStrategy.name);
  private static jwksClients = new Map<string, JwksClient>();

  constructor() {
    const config = getKeycloakConfig();

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['RS256'],
      secretOrKeyProvider: (request, rawJwtToken, done) => {
        try {
          if (!rawJwtToken) {
            return done(new UnauthorizedException('Token is missing'), undefined);
          }

          // Decode token header and payload to extract kid and issuer
          const parts = rawJwtToken.split('.');
          if (parts.length < 2) {
            return done(new UnauthorizedException('Invalid JWT format'), undefined);
          }

          const header = JSON.parse(Buffer.from(parts[0], 'base64').toString('utf8'));
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));

          // Resolve JWKS URI: prefer token's issuer or fallback to configured Keycloak JWKS URI
          let jwksUri = config.jwksUri;
          if (payload.iss && typeof payload.iss === 'string' && payload.iss.includes('/realms/')) {
            const cleanIssuer = payload.iss.replace(/\/+$/, '');
            jwksUri = `${cleanIssuer}/protocol/openid-connect/certs`;
          }

          // Get or instantiate cached JWKS client for this URI
          let client = JwtStrategy.jwksClients.get(jwksUri);
          if (!client) {
            const createJwksClient = typeof (jwksRsa as any) === 'function' ? (jwksRsa as any) : (jwksRsa as any).default || jwksRsa;
            client = createJwksClient({
              cache: true,
              rateLimit: true,
              jwksRequestsPerMinute: 10,
              jwksUri,
            });
            JwtStrategy.jwksClients.set(jwksUri, client);
          }

          client.getSigningKey(header.kid, (err, key) => {
            if (err || !key) {
              return done(
                new UnauthorizedException(`Failed to retrieve signing key: ${err?.message}`),
                undefined,
              );
            }
            done(null, key.getPublicKey());
          });
        } catch (error: any) {
          done(new UnauthorizedException(`Token validation error: ${error.message}`), undefined);
        }
      },
    });
  }

  async validate(payload: any): Promise<KeycloakUserPayload> {
    if (!payload || !payload.sub) {
      throw new UnauthorizedException('Invalid token payload: missing sub claim');
    }

    const isSystemRole = (role: string) =>
      role.startsWith('default-roles') ||
      role.startsWith('manage-') ||
      role.startsWith('view-') ||
      role.startsWith('query-') ||
      role.startsWith('create-') ||
      ['offline_access', 'uma_authorization', 'uma_protection', 'admin'].includes(role);

    // 1. Extract client roles (prioritize azp/issuing client, then all project clients in resource_access)
    const clientRoles: string[] = [];
    if (payload.azp && payload.resource_access?.[payload.azp]?.roles) {
      const azpRoles = (payload.resource_access[payload.azp].roles || []).filter((r: string) => !isSystemRole(r));
      clientRoles.push(...azpRoles);
    }

    if (payload.resource_access && typeof payload.resource_access === 'object') {
      for (const [clientId, resource] of Object.entries<any>(payload.resource_access)) {
        if (!['account', 'broker'].includes(clientId) && Array.isArray(resource?.roles)) {
          const roles = resource.roles.filter((r: string) => !isSystemRole(r));
          clientRoles.push(...roles);
        }
      }
    }

    // 2. Extract realm roles
    const realmRoles = (payload.realm_access?.roles || []).filter((r: string) => !isSystemRole(r));

    const isSuperAdmin =
      realmRoles.some((r: string) => r.toLowerCase() === 'superadmin') ||
      clientRoles.some((r: string) => r.toLowerCase() === 'superadmin');

    // Combine roles: If SuperAdmin, realm SuperAdmin takes highest priority across all projects
    const filteredRoles = isSuperAdmin
      ? Array.from(new Set(['SuperAdmin', ...realmRoles, ...clientRoles]))
      : Array.from(new Set([...clientRoles, ...realmRoles]));

    const primaryRole =
      filteredRoles[0] ||
      (payload.role as string) ||
      (payload.user_role as string) ||
      'User';

    return {
      sub: payload.sub,
      preferred_username: payload.preferred_username,
      email: payload.email,
      given_name: payload.given_name,
      family_name: payload.family_name,
      name: payload.name,
      realm_access: payload.realm_access,
      resource_access: payload.resource_access,
      project_id: payload.project_id || payload.tenant_id,
      tenant_id: payload.tenant_id || payload.project_id,
      roles: filteredRoles,
      primary_role: primaryRole,
    };
  }
}
