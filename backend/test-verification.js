/**
 * Quick Verification Tests for Refactored Code
 *
 * Run with: node test-verification.js
 */

import fs from 'fs';
import path from 'path';

console.log('=== Backend Refactoring Verification ===\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${error.message}`);
    failed++;
  }
}

// Test 1: SQL Injection Fix
test('SQL injection fix - parameterized query', () => {
  const content = fs.readFileSync('src/services/auditService.ts', 'utf8');
  if (content.includes("INTERVAL '${days}")) {
    throw new Error('SQL injection vulnerability still present');
  }
  if (!content.includes("INTERVAL '1 days' * $1")) {
    throw new Error('Parameterized query not found');
  }
  if (!content.includes('Number.isInteger(days)')) {
    throw new Error('Input validation not found');
  }
});

// Test 2: Transaction Atomicity Fix - UserSettings
test('UserSettings transaction fix', () => {
  const content = fs.readFileSync('src/models/UserSettings.ts', 'utf8');
  if (content.includes("query('BEGIN'")) {
    throw new Error('Old broken transaction pattern still present');
  }
  if (!content.includes('withTransaction')) {
    throw new Error('withTransaction not used');
  }
});

// Test 3: Transaction Atomicity Fix - WorkGroup
test('WorkGroup transaction fix', () => {
  const content = fs.readFileSync('src/models/WorkGroup.ts', 'utf8');
  if (content.includes('getClient()')) {
    throw new Error('Manual transaction management still present');
  }
  if (!content.includes('withTransaction')) {
    throw new Error('withTransaction not used');
  }
});

// Test 4: SSE Service Refactoring
test('SSE service refactored with generic manager', () => {
  const content = fs.readFileSync('src/services/sseService.ts', 'utf8');
  if (!content.includes('class SSEConnectionManager')) {
    throw new Error('Generic SSEConnectionManager class not found');
  }
  if (content.includes('setupUserConnection(') && content.includes('setupConnection(') && !content.includes('SSEConnectionManager')) {
    throw new Error('Duplicate methods might still exist');
  }
});

// Test 5: Abstract Cache Base Class
test('AbstractCache base class exists', () => {
  if (!fs.existsSync('src/services/cache/AbstractCache.ts')) {
    throw new Error('AbstractCache.ts not found');
  }
  const content = fs.readFileSync('src/services/cache/AbstractCache.ts', 'utf8');
  if (!content.includes('export abstract class AbstractCache')) {
    throw new Error('AbstractCache class not exported');
  }
});

// Test 6: Cache Refactoring - Permission Cache
test('PermissionCache extends AbstractCache', () => {
  const content = fs.readFileSync('src/services/cache/permissionCache.ts', 'utf8');
  if (!content.includes('extends AbstractCache')) {
    throw new Error('PermissionCache does not extend AbstractCache');
  }
});

// Test 7: Cache Refactoring - Work Access Cache
test('WorkAccessCache extends AbstractCache', () => {
  const content = fs.readFileSync('src/services/cache/workAccessCache.ts', 'utf8');
  if (!content.includes('extends AbstractCache')) {
    throw new Error('WorkAccessCache does not extend AbstractCache');
  }
});

// Test 8: Cache Refactoring - Settings Cache
test('SettingsCache extends AbstractCache', () => {
  const content = fs.readFileSync('src/services/cache/settingsCache.ts', 'utf8');
  if (!content.includes('extends AbstractCache')) {
    throw new Error('SettingsCache does not extend AbstractCache');
  }
});

// Test 9: New Middleware - parseNumericParams
test('parseNumericParams middleware exists', () => {
  if (!fs.existsSync('src/middleware/parseNumericParams.ts')) {
    throw new Error('parseNumericParams.ts not found');
  }
  const content = fs.readFileSync('src/middleware/parseNumericParams.ts', 'utf8');
  if (!content.includes('export function parseNumericParams')) {
    throw new Error('parseNumericParams function not exported');
  }
});

// Test 10: New Middleware - validatePagination
test('validatePagination middleware exists', () => {
  if (!fs.existsSync('src/middleware/validatePagination.ts')) {
    throw new Error('validatePagination.ts not found');
  }
  const content = fs.readFileSync('src/middleware/validatePagination.ts', 'utf8');
  if (!content.includes('export function validatePagination')) {
    throw new Error('validatePagination function not exported');
  }
});

// Test 11: New Middleware - ownerProtection
test('ownerProtection middleware exists', () => {
  if (!fs.existsSync('src/middleware/ownerProtection.ts')) {
    throw new Error('ownerProtection.ts not found');
  }
  const content = fs.readFileSync('src/middleware/ownerProtection.ts', 'utf8');
  if (!content.includes('export function preventDangerousModification')) {
    throw new Error('preventDangerousModification function not exported');
  }
});

// Test 12: New Middleware - requireOwnership
test('requireOwnership middleware exists', () => {
  if (!fs.existsSync('src/middleware/requireOwnership.ts')) {
    throw new Error('requireOwnership.ts not found');
  }
  const content = fs.readFileSync('src/middleware/requireOwnership.ts', 'utf8');
  if (!content.includes('export function requireOwnership')) {
    throw new Error('requireOwnership function not exported');
  }
});

// Test 13: Custom Error Classes
test('Custom error classes exist', () => {
  if (!fs.existsSync('src/utils/errors.ts')) {
    throw new Error('errors.ts not found');
  }
  const content = fs.readFileSync('src/utils/errors.ts', 'utf8');
  const errorClasses = [
    'AppError',
    'ValidationError',
    'UnauthorizedError',
    'ForbiddenError',
    'NotFoundError',
    'ConflictError'
  ];
  for (const errorClass of errorClasses) {
    if (!content.includes(`export class ${errorClass}`)) {
      throw new Error(`${errorClass} not found`);
    }
  }
});

// Test 14: Enhanced Error Handler
test('ErrorHandler enhanced with custom errors', () => {
  const content = fs.readFileSync('src/middleware/errorHandler.ts', 'utf8');
  if (!content.includes("import { AppError")) {
    throw new Error('AppError not imported in errorHandler');
  }
  if (!content.includes('fromDatabaseError')) {
    throw new Error('Database error mapping not found');
  }
});

// Test 15: Compiled Output Exists
test('TypeScript compilation successful', () => {
  if (!fs.existsSync('dist/middleware/parseNumericParams.js')) {
    throw new Error('parseNumericParams.js not compiled');
  }
  if (!fs.existsSync('dist/utils/errors.js')) {
    throw new Error('errors.js not compiled');
  }
  if (!fs.existsSync('dist/services/cache/AbstractCache.js')) {
    throw new Error('AbstractCache.js not compiled');
  }
});

console.log('\n=== Results ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}`);

if (failed === 0) {
  console.log('\n✓ All verifications passed!');
  process.exit(0);
} else {
  console.log('\n✗ Some verifications failed.');
  process.exit(1);
}
