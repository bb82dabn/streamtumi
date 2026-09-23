/// <reference types="expo/types" />

declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_API_ORIGIN?: string;
    EXPO_PUBLIC_APP_HOST?: string;
  }
}
