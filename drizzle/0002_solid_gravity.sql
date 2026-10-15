CREATE TABLE `user_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`state` text DEFAULT '{}' NOT NULL,
	`updated_at` integer DEFAULT '"2026-10-15T16:42:15.667Z"' NOT NULL
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`course` text NOT NULL,
	`title` text NOT NULL,
	`due_at` integer,
	`estimate_minutes` integer DEFAULT 30 NOT NULL,
	`status` text DEFAULT 'not_started' NOT NULL,
	`requires_student` integer DEFAULT false NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT '"2026-10-15T16:42:15.667Z"' NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_assignments`("id", "course", "title", "due_at", "estimate_minutes", "status", "requires_student", "completed", "created_at") SELECT "id", "course", "title", "due_at", "estimate_minutes", "status", "requires_student", "completed", "created_at" FROM `assignments`;--> statement-breakpoint
DROP TABLE `assignments`;--> statement-breakpoint
ALTER TABLE `__new_assignments` RENAME TO `assignments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_assignments_completed_due` ON `assignments` (`completed`,`due_at`);