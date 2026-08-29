import { trpc } from "@/lib/trpc";
import { startLogin } from "@/const";

/**
 * Single source of truth for "is someone signed in". Auth failures resolve to a
 * signed-out state rather than throwing, so a page never blanks because of a stale cookie.
 */
export function useAuth() {
  const query = trpc.auth.me.useQuery(undefined, {
    retry: false,
    staleTime: 60_000,
  });
  const utils = trpc.useUtils();
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
      void utils.invalidate();
    },
  });

  return {
    user: query.data ?? null,
    isSignedIn: Boolean(query.data),
    /** Alias kept so existing callers reading `isAuthenticated` keep working. */
    isAuthenticated: Boolean(query.data),
    isLoading: query.isLoading,
    loading: query.isLoading,
    login: startLogin,
    logout: () => logout.mutate(),
    isLoggingOut: logout.isPending,
    refetch: query.refetch,
  };
}
