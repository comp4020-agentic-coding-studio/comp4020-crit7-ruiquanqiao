CREATE TABLE `courses` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`units` integer NOT NULL,
	`subject` text NOT NULL,
	`level` integer NOT NULL,
	`career` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`requisite_text` text DEFAULT '' NOT NULL,
	`requisite_source` text NOT NULL,
	`requisite_reading` text,
	`caveat` integer DEFAULT false NOT NULL,
	`excluded_programs` text DEFAULT '' NOT NULL,
	`stub` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `incompatibilities` (
	`course_code` text NOT NULL,
	`other_code` text NOT NULL,
	PRIMARY KEY(`course_code`, `other_code`),
	FOREIGN KEY (`course_code`) REFERENCES `courses`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`other_code`) REFERENCES `courses`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `offerings` (
	`course_code` text NOT NULL,
	`session` text NOT NULL,
	PRIMARY KEY(`course_code`, `session`),
	FOREIGN KEY (`course_code`) REFERENCES `courses`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `plan_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` text NOT NULL,
	`course_code` text NOT NULL,
	`term` text NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_code`) REFERENCES `courses`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_items_plan_id_course_code_unique` ON `plan_items` (`plan_id`,`course_code`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`program` text DEFAULT 'MCOMP' NOT NULL,
	`start_term` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `requisite_nodes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`course_code` text NOT NULL,
	`parent_id` integer,
	`position` integer NOT NULL,
	`kind` text NOT NULL,
	`ref` text,
	`concurrent` integer DEFAULT false NOT NULL,
	`units` integer,
	`level` integer,
	FOREIGN KEY (`course_code`) REFERENCES `courses`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_id`) REFERENCES `requisite_nodes`(`id`) ON UPDATE no action ON DELETE no action
);
