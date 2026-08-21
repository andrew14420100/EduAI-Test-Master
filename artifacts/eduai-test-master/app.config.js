const appJson = require('./app.json');

module.exports = () => ({
  ...appJson,
  expo: {
    ...appJson.expo,
    extra: {
      ...(appJson.expo.extra || {}),
      apiDomain: process.env.EXPO_PUBLIC_DOMAIN || process.env.REPLIT_INTERNAL_APP_DOMAIN || process.env.REPLIT_DEV_DOMAIN || '',
      clerkPublishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || process.env.CLERK_PUBLISHABLE_KEY || '',
      clerkProxyUrl: process.env.EXPO_PUBLIC_CLERK_PROXY_URL || '',
    },
  },
});