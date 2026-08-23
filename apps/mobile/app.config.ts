import type { ConfigContext, ExpoConfig } from 'expo/config';

function appLinkDomain(): string {
  const configured = (process.env.EXPO_PUBLIC_APP_LINK_DOMAIN ?? '').trim();
  if (!configured) return '';

  try {
    const value = configured.includes('://') ? configured : `https://${configured}`;
    return new URL(value).hostname;
  } catch {
    throw new Error('EXPO_PUBLIC_APP_LINK_DOMAIN must be a valid hostname');
  }
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const domain = appLinkDomain();
  const baseConfig: ExpoConfig = {
    ...config,
    name: config.name ?? '책결',
    slug: config.slug ?? 'bookgyeol',
  };
  if (!domain) return baseConfig;

  return {
    ...baseConfig,
    ios: {
      ...baseConfig.ios,
      associatedDomains: [`applinks:${domain}`],
    },
    android: {
      ...baseConfig.android,
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          category: ['BROWSABLE', 'DEFAULT'],
          data: [
            { scheme: 'https', host: domain, pathPrefix: '/invite/' },
            { scheme: 'https', host: domain, pathPrefix: '/group-invite/' },
          ],
        },
      ],
    },
  };
};
