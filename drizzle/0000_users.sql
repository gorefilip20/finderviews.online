DO $$ BEGIN
  CREATE TYPE "user_role" AS ENUM ('user', 'admin');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "users" (
  "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "openId" varchar(64) NOT NULL UNIQUE,
  "name" text,
  "email" varchar(320),
  "loginMethod" varchar(64),
  "role" "user_role" NOT NULL DEFAULT 'user',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "lastSignedIn" timestamptz NOT NULL DEFAULT now()
);
