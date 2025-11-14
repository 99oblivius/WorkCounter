import bcrypt from 'bcrypt';
import crypto from 'crypto';

/**
 * Password Service - Handles secure password hashing and validation
 * Uses bcrypt with cost factor 12 for secure password storage
 */
export class PasswordService {
  // Cost factor for bcrypt (12 = ~0.3s per hash, good balance of security and performance)
  private static readonly SALT_ROUNDS = 12;

  /**
   * Hash a password using bcrypt
   * @param password - Plain text password to hash
   * @returns Promise<string> - Bcrypt hash
   */
  static async hashPassword(password: string): Promise<string> {
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  /**
   * Verify a password against a bcrypt hash
   * @param password - Plain text password to verify
   * @param hash - Bcrypt hash to compare against
   * @returns Promise<boolean> - True if password matches
   * @throws Error if verification fails due to invalid hash or other bcrypt errors
   */
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(password, hash);
    } catch (error) {
      // SECURITY: Log authentication failures for monitoring potential attacks
      console.error('[SECURITY] Password verification failed:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
        // Note: Do NOT log the password or hash for security reasons
      });

      // Re-throw the error instead of silently returning false
      // This allows calling code to distinguish between:
      // - Wrong password (returns false)
      // - System error (throws exception)
      throw new Error('Password verification failed: Invalid hash or system error');
    }
  }

  /**
   * Generate a cryptographically secure random password
   * @param length - Password length (default: 16)
   * @returns string - Random password
   */
  static generatePassword(length: number = 16): string {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    const randomBytes = crypto.randomBytes(length);
    let password = '';

    for (let i = 0; i < length; i++) {
      password += charset[randomBytes[i] % charset.length];
    }

    // Ensure password meets complexity requirements
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasDigit = /[0-9]/.test(password);

    if (!hasLower || !hasUpper || !hasDigit) {
      // Recursive retry if password doesn't meet requirements
      return this.generatePassword(length);
    }

    return password;
  }

  /**
   * Validate password strength
   * SECURITY FIX: Enhanced password validation with common password checks
   * @param password - Password to validate
   * @returns { valid: boolean; errors: string[] }
   */
  static validatePassword(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!password) {
      errors.push('Password is required');
      return { valid: false, errors };
    }

    // Length checks
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }

    if (password.length > 128) {
      errors.push('Password must be less than 128 characters');
    }

    // Character type checks
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    // SECURITY: Check for common/weak passwords
    const commonPasswords = [
      'password', 'pass1234', 'admin', 'admin123',
      'qwerty', 'qwerty123', '12345678', 'abcd1234',
      'welcome', 'welcome1', 'welcome123', 'changeme',
      'letmein', 'monkey', 'dragon', 'master',
    ];

    const lowerPassword = password.toLowerCase();
    if (commonPasswords.some(common => lowerPassword.includes(common))) {
      errors.push('Password is too common or contains a common pattern');
    }

    // SECURITY: Check for sequential characters
    const hasSequential = /(?:abc|bcd|cde|def|012|123|234|345|456|567|678|789)/i.test(password);
    if (hasSequential) {
      errors.push('Password contains sequential characters');
    }

    // SECURITY: Check for keyboard patterns
    const keyboardPatterns = /(?:qwert|asdfg|zxcvb)/i;
    if (keyboardPatterns.test(password)) {
      errors.push('Password contains keyboard patterns');
    }

    // SECURITY: Check for repeated characters
    const hasRepeatedChars = /(.)\1{2,}/.test(password);
    if (hasRepeatedChars) {
      errors.push('Password contains too many repeated characters');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if password has been pwned using k-anonymity
   * (Optional - requires API call to haveibeenpwned.com)
   * For now, just returns false (not implemented)
   */
  static async isPasswordPwned(password: string): Promise<boolean> {
    // TODO: Implement HIBP API check with k-anonymity
    // For now, skip this check
    return false;
  }
}
