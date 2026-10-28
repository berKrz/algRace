CREATE TYPE "public"."algorithm" AS ENUM('bubble', 'insertion', 'merge', 'quick', 'tim', 'counting', 'radix', 'heap');--> statement-breakpoint
CREATE TYPE "public"."consumer" AS ENUM('settler', 'referee');--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payload" jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processed_events" (
	"outbox_id" uuid NOT NULL,
	"consumer" "consumer" NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processed_events_outbox_id_consumer_pk" PRIMARY KEY("outbox_id","consumer")
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" char(6) NOT NULL,
	"rounds_total" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rooms_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "round_algorithms" (
	"round_id" uuid NOT NULL,
	"algorithm" "algorithm" NOT NULL,
	"execution_time" interval,
	"process_marker" varchar,
	CONSTRAINT "round_algorithms_round_id_algorithm_pk" PRIMARY KEY("round_id","algorithm")
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"dataset_seed" bigint NOT NULL,
	"dataset_size" integer NOT NULL,
	"distribution_type" varchar NOT NULL,
	"value_range_min" integer NOT NULL,
	"value_range_max" integer NOT NULL,
	"winner_algorithm" "algorithm",
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "rounds_room_number_unique" UNIQUE("room_id","number")
);
--> statement-breakpoint
ALTER TABLE "round_algorithms" ADD CONSTRAINT "round_algorithms_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;