export interface KeycloakConfig {
  baseUrl: string;
  realm: string;
  clientId: string;
  clientSecret?: string;
  jwksUri: string;
  issuer: string;
}

export const getKeycloakConfig = (): KeycloakConfig => {
  const baseUrl = (process.env.KEYCLOAK_BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');
  const realm = process.env.KEYCLOAK_REALM || 'master';
  const clientId = process.env.KEYCLOAK_CLIENT_ID || 'user-management-api';
  const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET;

  return {
    baseUrl,
    realm,
    clientId,
    clientSecret,
    jwksUri: `${baseUrl}/realms/${realm}/protocol/openid-connect/certs`,
    issuer: `${baseUrl}/realms/${realm}`,
  };
};
