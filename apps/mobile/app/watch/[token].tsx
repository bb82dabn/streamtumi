import { Redirect, useLocalSearchParams } from "expo-router";

export default function WatchDeepLink() {
  const params = useLocalSearchParams<{ token: string | string[] }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  if (!token) return <Redirect href="/(tabs)/guide" />;
  return <Redirect href={{ pathname: "/station/[token]", params: { token, source: "watch" } }} />;
}
