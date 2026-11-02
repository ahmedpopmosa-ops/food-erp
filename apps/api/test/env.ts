// Test configuration: always the dedicated test database, never the development one.
// CI may point at another server with TEST_DATABASE_URL / TEST_DATABASE_OWNER_URL.
const host = process.env.TEST_DB_HOST ?? 'localhost:5433';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? `postgresql://ros_app:ros_app_dev@${host}/restaurant_os_test?schema=public`;
process.env.DATABASE_OWNER_URL =
  process.env.TEST_DATABASE_OWNER_URL ?? `postgresql://postgres:postgres@${host}/restaurant_os_test?schema=public`;
process.env.APP_BASE_URL = 'http://web.test';
process.env.ARGON2_MEMORY_KIB = '8192';
process.env.ARGON2_TIME_COST = '1';
process.env.MAIL_TRANSPORT = 'log';
process.env.POS_PIN_ITERATIONS = '1000';

export {};
