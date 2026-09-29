DO $$ BEGIN
  CREATE TYPE "job_type" AS ENUM ('Remote', 'Full-time', 'Part-time', 'Contract', 'Hybrid');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "jobs" (
  "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "title" varchar(240) NOT NULL,
  "companyName" varchar(240) NOT NULL,
  "location" varchar(240) NOT NULL,
  "jobType" "job_type" NOT NULL,
  "category" varchar(120) NOT NULL,
  "salaryRange" varchar(120),
  "description" text NOT NULL,
  "requirements" text NOT NULL,
  "applicationContact" varchar(320) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "isActive" boolean NOT NULL DEFAULT true
);
