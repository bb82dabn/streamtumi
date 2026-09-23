import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import resolveConfig from "../app.config.ts";

const appConfig = JSON.parse(readFileSync(new URL("../app.json", import.meta.url), "utf8")).expo;

function resolve(environment = {}) {
  const names = ["NODE_ENV", "EXPO_PUBLIC_API_ORIGIN", "EXPO_PUBLIC_APP_HOST"];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  Object.assign(process.env, environment);
  try {
    return resolveConfig({ config: appConfig });
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

test("release config applies platform floors, build versions, and valid icons", () => {
  const resolved = resolve();
  const buildProperties = resolved.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === "expo-build-properties");

  assert.equal(resolved.orientation, "portrait");
  assert.equal(resolved.ios.supportsTablet, false);
  assert.match(resolved.ios.buildNumber, /^[1-9]\d*$/);
  assert.equal(Number.isInteger(resolved.android.versionCode) && resolved.android.versionCode > 0, true);
  assert.equal(resolved.ios.infoPlist.ITSAppUsesNonExemptEncryption, false);
  assert.equal(buildProperties[1].ios.deploymentTarget, "16.4");
  assert.equal(buildProperties[1].android.minSdkVersion, 29);
  assert.equal(existsSync(new URL(`../${resolved.icon}`, import.meta.url)), true);
  assert.equal(existsSync(new URL(`../${resolved.android.adaptiveIcon.foregroundImage}`, import.meta.url)), true);
});

test("configured host claims every supported link path", () => {
  const resolved = resolve({
    NODE_ENV: "production",
    EXPO_PUBLIC_API_ORIGIN: "https://api.example.test",
    EXPO_PUBLIC_APP_HOST: "watch.example.test",
  });
  const data = resolved.android.intentFilters[0].data;
  assert.deepEqual(resolved.ios.associatedDomains, ["applinks:watch.example.test"]);
  assert.deepEqual(new Set(data.map((item) => item.host)), new Set(["watch.example.test"]));
  assert.equal(data.some((item) => item.pathPrefix === "/watch/"), true);
  assert.equal(data.some((item) => item.pathPrefix === "/listen/"), true);
  assert.equal(data.some((item) => item.pathPrefix === "/verify-email"), true);
  assert.equal(data.length, 3);
});

test("development uses local self-hosting defaults", () => {
  const resolved = resolve();
  assert.deepEqual(resolved.ios.associatedDomains, ["applinks:localhost"]);
  assert.deepEqual(new Set(resolved.android.intentFilters[0].data.map((item) => item.host)), new Set(["localhost"]));
});

test("production requires explicit API and app hosts", () => {
  assert.throws(() => resolve({ NODE_ENV: "production" }), /EXPO_PUBLIC_API_ORIGIN is required/);
  assert.throws(() => resolve({
    NODE_ENV: "production",
    EXPO_PUBLIC_API_ORIGIN: "https://api.example.test",
  }), /EXPO_PUBLIC_APP_HOST is required/);
});

test("cloud-build and removed integrations are absent", () => {
  const dependencies = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).dependencies;
  const removedDependencies = ["@sentry/react-native", "expo-apple-authentication", "expo-web-browser", "react-native-google-cast"];
  assert.deepEqual(removedDependencies.filter((name) => name in dependencies), []);
  assert.equal(existsSync(new URL("../eas.json", import.meta.url)), false);
  assert.equal(existsSync(new URL("../.easignore", import.meta.url)), false);
});
