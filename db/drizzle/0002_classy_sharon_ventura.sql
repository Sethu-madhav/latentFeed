CREATE TABLE "retired_sources" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text,
	"retired_at" timestamp with time zone DEFAULT now() NOT NULL
);
