-- Accounts, and reader state re-keyed per user.
--
-- Hand-corrected after generation. drizzle-kit emitted the primary-key drops
-- as commented-out TODOs (it can't yet look up the constraint name), ordered
-- the composite PKs before the columns they cite, and added `user_id NOT NULL`
-- to tables that already held rows. All three fail against a real database.

CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp with time zone,
	"image" text,
	"password_hash" text,
	"role" text DEFAULT 'reader' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Existing reader state predates accounts, so there is no user it could belong
-- to and `user_id NOT NULL` cannot be backfilled. It is three rows total (two
-- read marks and one watermark) and every one of them is reconstructible just
-- by using the app, so they are discarded rather than guessed at.
TRUNCATE TABLE "article_reads";--> statement-breakpoint
TRUNCATE TABLE "saved_articles";--> statement-breakpoint
TRUNCATE TABLE "reader_state";--> statement-breakpoint

ALTER TABLE "article_reads" DROP CONSTRAINT "article_reads_pkey";--> statement-breakpoint
ALTER TABLE "article_reads" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "article_reads" ADD CONSTRAINT "article_reads_user_id_article_id_pk" PRIMARY KEY("user_id","article_id");--> statement-breakpoint
ALTER TABLE "article_reads" ADD CONSTRAINT "article_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "article_reads_user_idx" ON "article_reads" USING btree ("user_id");--> statement-breakpoint

ALTER TABLE "saved_articles" DROP CONSTRAINT "saved_articles_pkey";--> statement-breakpoint
ALTER TABLE "saved_articles" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_articles" ADD CONSTRAINT "saved_articles_user_id_article_id_pk" PRIMARY KEY("user_id","article_id");--> statement-breakpoint
ALTER TABLE "saved_articles" ADD CONSTRAINT "saved_articles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_articles_user_idx" ON "saved_articles" USING btree ("user_id");--> statement-breakpoint

ALTER TABLE "reader_state" DROP CONSTRAINT "reader_state_pkey";--> statement-breakpoint
ALTER TABLE "reader_state" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "reader_state" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "reader_state" ADD CONSTRAINT "reader_state_pkey" PRIMARY KEY("user_id");--> statement-breakpoint
ALTER TABLE "reader_state" ADD CONSTRAINT "reader_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
