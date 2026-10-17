CREATE TABLE `events` (
	`game_id` text NOT NULL,
	`seq` integer NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`game_id`, `seq`)
);
--> statement-breakpoint
CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`learning` text DEFAULT 'real' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`state` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `moves` (
	`game_id` text NOT NULL,
	`player_id` text NOT NULL,
	`username` text DEFAULT '' NOT NULL,
	`seq` integer NOT NULL,
	`skill` text,
	`points` integer NOT NULL,
	`rubric` integer NOT NULL,
	`round` integer,
	`why` text DEFAULT '' NOT NULL,
	`source` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`game_id`, `player_id`, `seq`)
);
--> statement-breakpoint
CREATE INDEX `moves_username_game` ON `moves` (`username`,`game_id`);--> statement-breakpoint
CREATE TABLE `people` (
	`username` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`answers` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `playtests` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`report` text NOT NULL,
	`created_at` integer NOT NULL
);
