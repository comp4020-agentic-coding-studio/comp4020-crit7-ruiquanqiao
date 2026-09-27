DROP TABLE `incompatibilities`;--> statement-breakpoint
DROP TABLE `offerings`;--> statement-breakpoint
DROP TABLE `requisite_nodes`;--> statement-breakpoint
ALTER TABLE `courses` DROP COLUMN `units`;--> statement-breakpoint
ALTER TABLE `courses` DROP COLUMN `career`;--> statement-breakpoint
ALTER TABLE `courses` DROP COLUMN `description`;--> statement-breakpoint
ALTER TABLE `courses` DROP COLUMN `requisite_text`;--> statement-breakpoint
ALTER TABLE `courses` DROP COLUMN `requisite_source`;--> statement-breakpoint
ALTER TABLE `courses` DROP COLUMN `requisite_reading`;--> statement-breakpoint
ALTER TABLE `courses` DROP COLUMN `caveat`;--> statement-breakpoint
ALTER TABLE `courses` DROP COLUMN `excluded_programs`;