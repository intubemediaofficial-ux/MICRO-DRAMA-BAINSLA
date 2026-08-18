import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16),
  STREAM_TOKEN_SECRET: z.string().min(16),
  OTP_DEV_CODE: z.string().default("123456"),
  MEDIA_DIR: z.string().default("./public/media"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});
export const env = schema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  SESSION_SECRET: process.env.SESSION_SECRET,
  STREAM_TOKEN_SECRET: process.env.STREAM_TOKEN_SECRET,
  OTP_DEV_CODE: process.env.OTP_DEV_CODE,
  MEDIA_DIR: process.env.MEDIA_DIR,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});
