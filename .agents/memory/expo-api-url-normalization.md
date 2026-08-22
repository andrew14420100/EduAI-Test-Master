---
name: Expo API URL normalization
description: Avoid malformed native API requests when the configured Expo API URL already includes a protocol.
---

The mobile client must treat an API configuration value as either a complete URL or a hostname, never blindly prepend `https://`.

**Why:** A full `https://...` value was being prefixed again, producing an invalid URL and Android reported only “Network request failed” before the backend received the request.

**How to apply:** Normalize the value once at the API boundary and reuse the normalized base for generated client calls and direct fetches. Keep the production API URL in the native app configuration as a complete HTTPS URL.