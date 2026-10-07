// Auth screens (login / password reset) have no shell.
// Everything is session-dependent and client-fetched: never prerender.
export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-bg">{children}</div>;
}
