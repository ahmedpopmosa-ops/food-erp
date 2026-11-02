import { z } from 'zod';

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
    DATABASE_URL: z.string().url(),
    API_PORT: z.coerce.number().int().default(4000),
    WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
    ADMIN_ORIGIN: z.string().url().default('http://localhost:5174'),
    /** Base URL of the restaurant dashboard, used in invitation and password-reset links. */
    APP_BASE_URL: z.string().url().default('http://localhost:5173'),
    COOKIE_SECURE: bool,
    SESSION_IDLE_HOURS: z.coerce.number().int().min(1).max(72).default(12),
    SESSION_ABSOLUTE_HOURS: z.coerce
      .number()
      .int()
      .min(1)
      .max(24 * 30)
      .default(168),
    ARGON2_MEMORY_KIB: z.coerce.number().int().min(8192).default(65536),
    ARGON2_TIME_COST: z.coerce.number().int().min(1).default(3),
    LOGIN_LOCKOUT_THRESHOLD: z.coerce.number().int().min(3).default(10),
    LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().min(1).default(15),
    /** Only the `log` transport exists today (development/test). Production needs a real adapter. */
    MAIL_TRANSPORT: z.enum(['log']).default('log'),
    /** Ed25519 private key (PKCS#8 DER, base64) signing POS license leases. Generated per process outside production. */
    LEASE_SIGNING_KEY: z.string().optional(),
    /** PBKDF2 iterations for POS PINs set in the dashboard (doc 05 §5). */
    POS_PIN_ITERATIONS: z.coerce.number().int().min(1000).default(600_000),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.LEASE_SIGNING_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['LEASE_SIGNING_KEY'],
        message: 'Required in production (POS licence leases)',
      });
    }
    if (env.NODE_ENV === 'production' && env.MAIL_TRANSPORT === 'log') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MAIL_TRANSPORT'],
        message: 'No production mail adapter is configured; the log transport would drop invitation and reset e-mails',
      });
    }
    if (env.NODE_ENV === 'production' && !env.COOKIE_SECURE) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['COOKIE_SECURE'], message: 'Must be true in production' });
    }
  });

export type AppConfig = z.infer<typeof envSchema>;

let cached: AppConfig | undefined;

/** Validated configuration; the process refuses to start on invalid environment variables. */
export function config(): AppConfig {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error('Invalid environment configuration: ' + JSON.stringify(parsed.error.flatten().fieldErrors));
    }
    cached = parsed.data;
  }
  return cached;
}

export const SESSION_COOKIE = 'ros_session';
export const CSRF_COOKIE = 'ros_csrf';
export const PLATFORM_SESSION_COOKIE = 'ros_op_session';
export const PLATFORM_CSRF_COOKIE = 'ros_op_csrf';
export const PLATFORM_COOKIE_PATH = '/api/v1/platform';
export const CSRF_HEADER = 'x-csrf-token';
