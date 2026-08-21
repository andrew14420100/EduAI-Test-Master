# Native theme restart check

This check requires an Android debug build installed on an emulator or device,
with a signed-in test account, plus `adb`, Maestro, and ImageMagick.

The runner opens a development-only deep link to seed `eduai:theme:<user id>`
for the signed-in account through the app's real AsyncStorage code, force-stops the process, then polls
the device surface during the next cold launch. It fails if any captured dark
scenario frame is light, or if the no-preference scenario never becomes light.

```sh
EDUAI_ANDROID_PACKAGE=com.eduai.testmaster \
pnpm --filter @workspace/eduai-test-master run test:theme-restart
```

The frame directory can be retained for inspection with
`EDUAI_THEME_FRAMES=/tmp/eduai-theme-frames`. The helper is development-only
and the deep-link seed is not available in production builds.