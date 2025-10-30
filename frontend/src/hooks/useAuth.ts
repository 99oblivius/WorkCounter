import { useQuery } from '@tanstack/react-query';
import { authApi } from '../services/api';

export function useAuth() {
  const { data: user, isLoading, error } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      try {
        const response = await authApi.getMe();
        return response.data;
      } catch (err) {
        return null;
      }
    },
    retry: false,
  });

  return {
    user,
    isAuthenticated: !!user,
    isLoading,
    error,
  };
}
