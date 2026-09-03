import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";

export function useAuth() {
  const queryClient = useQueryClient();
  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      await queryClient.invalidateQueries();
    },
  });

  return {
    user: meQuery.data ?? null,
    loading: meQuery.isLoading,
    isAuthenticated: Boolean(meQuery.data),
    logout: () => logoutMutation.mutate(),
  };
}
