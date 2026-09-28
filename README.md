# yump3

A fully on-device YouTube music downloader & player for Android. No backend server, no account —
the app itself searches YouTube and downloads/transcodes audio to MP3 with embedded cover art and ID3 tags.

## Features

- On-device YouTube search (yt-dlp `ytsearch`)
- On-device download + MP3 transcode with **embedded thumbnail** and metadata (`--embed-thumbnail --add-metadata`)
- Files are saved with the **real title** as the filename: `<title> [<youtubeId>].mp3`
- Local library, playlists, likes (stored on device)
- Player with background playback, sleep timer, smart transition (BPM/key matching), haptics
- Storage in app-specific external dir: `Android/media/com.yump3/yump3/`

## Tech

- Expo / React Native (bare, `newArchEnabled`)
- `youtubedl-android` (yt-dlp + ffmpeg bundled) — see license note below
- `react-native-track-player` for audio

## License — GPL-3.0

This app bundles **`youtubedl-android`**, which is licensed **GPL-3.0**. Because the library is
linked and distributed inside this app, the **entire app must be licensed under GPL-3.0** and the
complete corresponding source must be made available to anyone you distribute it to.

- `youtubedl-android` — GPL-3.0 (https://github.com/yausername/youtubedl-android)
- `yt-dlp` — Unlicense (public domain)
- `ffmpeg` — LGPL/GPL depending on the build

By using this app for distribution you agree to comply with GPL-3.0.

## Build

```bash
npm install
cd android && gradlew assembleRelease
# -> android/app/build/outputs/apk/release/app-release.apk
```

Only `arm64-v8a` is built by default (`android/gradle.properties` → `reactNativeArchitectures`).
Add other ABIs there and in `android/app/build.gradle` if needed.
