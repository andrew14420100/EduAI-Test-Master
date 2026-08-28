---
name: Expo Go notifications
description: Keep notification registration compatible with Expo Go after remote Android push support was removed.
---

Expo Go cannot register Android remote push notifications for SDK 53 and newer. Notification setup must detect the Store Client execution environment and skip remote registration/listeners there, while native standalone or development builds may keep the full notification flow.

**Why:** Calling remote notification APIs from Expo Go raises a fatal runtime error before the app can render.

**How to apply:** Guard notification handlers, permission/token registration, response listeners, and scheduled notification calls with the Expo execution environment; do not remove native notification support from installable builds.