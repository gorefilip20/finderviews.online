DO $$ BEGIN
  CREATE TYPE "tracking_status" AS ENUM ('Wishlist', 'Applied', 'Interviewing', 'Offered', 'Rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "application_tracking" (
  "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "jobId" integer NOT NULL,
  "status" "tracking_status" NOT NULL DEFAULT 'Wishlist',
  "notes" text,
  "appliedDate" timestamptz,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "application_tracking_job_id_unique" UNIQUE ("jobId")
);
