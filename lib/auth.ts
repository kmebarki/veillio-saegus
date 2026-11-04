import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { nextCookies } from 'better-auth/next-js'

import { pool } from '@/lib/db'
import { sendPasswordResetEmail, sendVerificationEmail } from '@/lib/email'

export const auth = betterAuth({
  database: pool,
  baseURL:
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.V0_RUNTIME_URL),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 12,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      void sendPasswordResetEmail({ email: user.email, name: user.name, url }).catch((error: unknown) => {
        console.error('Password reset email delivery failed', error instanceof Error ? error.message : error)
      })
    },
  },
  rateLimit: {
    enabled: true,
    storage: 'database',
    window: 60,
    max: 60,
    customRules: {
      '/sign-in/email': { window: 60, max: 5 },
      '/sign-up/email': { window: 3600, max: 10 },
      '/request-password-reset': { window: 3600, max: 5 },
      '/reset-password': { window: 600, max: 10 },
      '/send-verification-email': { window: 3600, max: 5 },
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      const invitation = await pool.query(
        `SELECT 1 FROM "invitations" WHERE lower("email") = lower($1) AND "status" = 'Pending' AND "expiresAt" > now() LIMIT 1`,
        [user.email],
      )
      if (invitation.rowCount && invitation.rowCount > 0) return
      void sendVerificationEmail({ email: user.email, name: user.name, url }).catch((error: unknown) => {
        console.error('Verification email delivery failed', error instanceof Error ? error.message : error)
      })
    },
  },
  user: {
    additionalFields: {
      role: { type: 'string', required: false, defaultValue: 'reader', input: false },
      status: { type: 'string', required: false, defaultValue: 'active', input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const existingUser = await pool.query('SELECT 1 FROM "user" LIMIT 1')
          return {
            data: {
              ...user,
              role: existingUser.rowCount === 0 ? 'super_admin' : 'reader',
              status: 'active',
            },
          }
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          const result = await pool.query('SELECT "status" FROM "user" WHERE "id" = $1', [session.userId])
          if (result.rows[0]?.status === 'suspended') {
            throw new APIError('FORBIDDEN', { message: 'ACCOUNT_SUSPENDED' })
          }
        },
        after: async (session) => {
          await pool.query('UPDATE "user" SET "lastLoginAt" = now() WHERE "id" = $1', [session.userId])
        },
      },
    },
  },
  trustedOrigins: [
    ...(process.env.NODE_ENV === 'development'
      ? [
          'http://localhost:3000',
          'https://localhost:3000',
          ...(process.env.V0_RUNTIME_URL ? [process.env.V0_RUNTIME_URL] : []),
          ...(process.env.V0_DEV_APP_URL ? [process.env.V0_DEV_APP_URL] : []),
          ...(process.env.V0_BUILD_URL ? [process.env.V0_BUILD_URL] : []),
          ...(process.env.V0_SANDBOX_URL ? [process.env.V0_SANDBOX_URL] : []),
        ]
      : []),
    ...(process.env.NODE_ENV === 'production'
      ? [
          ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
          ...(process.env.VERCEL_PROJECT_PRODUCTION_URL ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`] : []),
        ]
      : []),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  plugins: [nextCookies()],
  ...(process.env.NODE_ENV === 'development'
    ? {
        advanced: {
          defaultCookieAttributes: {
            sameSite: 'none' as const,
            secure: true,
            partitioned: true,
          },
        },
      }
    : {}),
})
