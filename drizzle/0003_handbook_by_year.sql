CREATE TABLE `course_incompatibilities` (
	`code` text NOT NULL,
	`year` integer NOT NULL,
	`other_code` text NOT NULL,
	PRIMARY KEY(`code`, `year`, `other_code`),
	FOREIGN KEY (`other_code`) REFERENCES `courses`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `course_offerings` (
	`code` text NOT NULL,
	`year` integer NOT NULL,
	`session` text NOT NULL,
	PRIMARY KEY(`code`, `year`, `session`)
);
--> statement-breakpoint
CREATE TABLE `course_requisite_nodes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`year` integer NOT NULL,
	`parent_id` integer,
	`position` integer NOT NULL,
	`kind` text NOT NULL,
	`ref` text,
	`concurrent` integer DEFAULT false NOT NULL,
	`units` integer,
	`level` integer,
	FOREIGN KEY (`parent_id`) REFERENCES `course_requisite_nodes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `course_versions` (
	`code` text NOT NULL,
	`year` integer NOT NULL,
	`name` text NOT NULL,
	`units` integer NOT NULL,
	`career` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`requisite_text` text DEFAULT '' NOT NULL,
	`requisite_source` text NOT NULL,
	`requisite_reading` text,
	`caveat` integer DEFAULT false NOT NULL,
	`excluded_programs` text DEFAULT '' NOT NULL,
	`taken_twice` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`code`, `year`),
	FOREIGN KEY (`code`) REFERENCES `courses`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rule_courses` (
	`rule_id` integer NOT NULL,
	`code` text NOT NULL,
	PRIMARY KEY(`rule_id`, `code`),
	FOREIGN KEY (`rule_id`) REFERENCES `rules`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`code`) REFERENCES `courses`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rule_sets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`code` text NOT NULL,
	`year` integer NOT NULL,
	`name` text NOT NULL,
	`parent_id` integer,
	`requirement_text` text NOT NULL,
	`encoded` integer NOT NULL,
	`reading` text,
	`offered` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `rule_sets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rule_sets_kind_code_year_unique` ON `rule_sets` (`kind`,`code`,`year`);--> statement-breakpoint
CREATE TABLE `rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rule_set_id` integer NOT NULL,
	`position` integer NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`units` integer NOT NULL,
	`level` integer,
	`subjects` text,
	FOREIGN KEY (`rule_set_id`) REFERENCES `rule_sets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
DROP INDEX `plan_items_plan_id_course_code_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `plan_items_plan_id_course_code_term_unique` ON `plan_items` (`plan_id`,`course_code`,`term`);--> statement-breakpoint
ALTER TABLE `plans` ADD `specialisation` text;