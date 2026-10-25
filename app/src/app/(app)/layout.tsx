// Every signed-in screen lives under this layout: AppState + the shell
// (sidebar / tab bar / profile panel / status banners).
import { AppStateProvider } from "@/store/app-state";
import { AppShell } from "@/components/shell/AppShell";
import { AppOpenTracker } from "@/components/shell/AppOpenTracker";

// Everything is session-dependent and client-fetched: never prerender.
export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppStateProvider>
      <AppOpenTracker />
      <AppShell>{children}</AppShell>
    </AppStateProvider>
  );
}
