import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { authApi } from '../services/api';
import { useAuth } from '../hooks/useAuth';

export default function Login() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  const handleLogin = async () => {
    try {
      const response = await authApi.getLoginUrl();
      window.location.href = response.data.authUrl;
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="card max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <Clock size={48} className="text-blue-500" />
          </div>
          <h1 className="text-3xl font-bold text-gray-100">WorkCounter</h1>
          <p className="mt-2 text-gray-400">
            Professional time tracking for contractors
          </p>
        </div>

        <div className="mt-8">
          <button
            onClick={handleLogin}
            className="w-full btn btn-primary text-lg py-3"
          >
            Sign In
          </button>
        </div>

        <div className="mt-6 text-center text-sm text-gray-500">
          <p>Secure authentication powered by Authentik</p>
        </div>
      </div>
    </div>
  );
}
