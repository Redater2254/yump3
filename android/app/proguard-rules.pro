# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# yump3 native modules (referenced from MainApplication)
-keep class com.android.yustream.** { *; }

# youtubedl-android (bundled python runtime, reflection/JNI)
-keep class com.yausername.** { *; }

# react-native-track-player (TurboModule interop parses @ReactMethod via reflection)
-keep class com.doublesymmetry.trackplayer.** { *; }

-dontwarn com.fasterxml.jackson.**
