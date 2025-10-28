import { Stack, Redirect } from "expo-router";
import { useSession } from "@/context/SessionProvider";

export default function HostLayout() {
  const { session, loading } = useSession();
  if (loading) return null;
  if (!session) return <Redirect href="/(auth)" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
