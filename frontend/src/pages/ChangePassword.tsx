import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Clock, Eye, EyeOff, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';
import { authApi } from '../services/api';

export default function ChangePassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isForced = searchParams.get('force') === 'true';

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const validatePassword = (password: string): string[] => {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    // Validate inputs
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('All fields are required');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    // Validate password strength
    const validationErrors = validatePassword(newPassword);
    if (validationErrors.length > 0) {
      setError(validationErrors.join('. '));
      return;
    }

    setIsLoading(true);

    try {
      await authApi.changePassword(currentPassword, newPassword);
      setSuccess(true);

      // Navigate to dashboard after 2 seconds
      setTimeout(() => {
        navigate('/dashboard');
      }, 2000);
    } catch (err: any) {
      console.error('Password change failed:', err);

      if (err.response?.status === 401) {
        setError('Current password is incorrect');
      } else if (err.response?.status === 400) {
        const details = err.response.data.details;
        if (details && Array.isArray(details)) {
          setError(details.join('. '));
        } else {
          setError(err.response.data.error || 'Password does not meet requirements');
        }
      } else {
        setError('Failed to change password. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-bg">
      <div className="card max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <Clock size={48} className="text-blue-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-100">Change Password</h1>
          <p className="mt-2 text-gray-400">
            {isForced
              ? 'You must change your password before continuing'
              : 'Update your account password'}
          </p>
        </div>

        {!isForced && (
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center space-x-2 text-gray-400 hover:text-gray-300 text-sm"
          >
            <ArrowLeft size={16} />
            <span>Back to Dashboard</span>
          </button>
        )}

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          {error && (
            <div className="bg-red-500 bg-opacity-10 border border-red-500 border-opacity-30 rounded-lg p-4 flex items-start space-x-3">
              <AlertCircle className="text-red-400 flex-shrink-0 mt-0.5" size={20} />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-green-500 bg-opacity-10 border border-green-500 border-opacity-30 rounded-lg p-4 flex items-start space-x-3">
              <CheckCircle className="text-green-400 flex-shrink-0 mt-0.5" size={20} />
              <p className="text-sm text-green-400">
                Password changed successfully! Redirecting to dashboard...
              </p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-300 mb-2">
                Current Password
              </label>
              <div className="relative">
                <input
                  id="currentPassword"
                  name="currentPassword"
                  type={showCurrentPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="input w-full pr-10"
                  placeholder="Enter your current password"
                  disabled={isLoading || success}
                />
                <button
                  type="button"
                  onPointerDown={() => setShowCurrentPassword(true)}
                  onPointerUp={() => setShowCurrentPassword(false)}
                  onPointerLeave={() => setShowCurrentPassword(false)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
                  tabIndex={-1}
                >
                  {showCurrentPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-gray-300 mb-2">
                New Password
              </label>
              <div className="relative">
                <input
                  id="newPassword"
                  name="newPassword"
                  type={showNewPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="input w-full pr-10"
                  placeholder="Enter your new password"
                  disabled={isLoading || success}
                />
                <button
                  type="button"
                  onPointerDown={() => setShowNewPassword(true)}
                  onPointerUp={() => setShowNewPassword(false)}
                  onPointerLeave={() => setShowNewPassword(false)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
                  tabIndex={-1}
                >
                  {showNewPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-2">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input w-full pr-10"
                  placeholder="Confirm your new password"
                  disabled={isLoading || success}
                />
                <button
                  type="button"
                  onPointerDown={() => setShowConfirmPassword(true)}
                  onPointerUp={() => setShowConfirmPassword(false)}
                  onPointerLeave={() => setShowConfirmPassword(false)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-blue-500 bg-opacity-10 border border-blue-500 border-opacity-30 rounded-lg p-4">
            <p className="text-sm text-blue-400 font-medium mb-2">Password Requirements:</p>
            <ul className="text-xs text-gray-400 space-y-1 list-disc list-inside">
              <li>At least 8 characters long</li>
              <li>Contains at least one uppercase letter</li>
              <li>Contains at least one lowercase letter</li>
              <li>Contains at least one number</li>
            </ul>
          </div>

          <button
            type="submit"
            disabled={isLoading || success}
            className="w-full btn btn-primary text-lg py-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Changing Password...' : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
