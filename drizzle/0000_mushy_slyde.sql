CREATE TABLE `assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`course` text NOT NULL,
	`title` text NOT NULL,
	`due_at` integer,
	`estimate_minutes` integer DEFAULT 30 NOT NULL,
	`status` text DEFAULT 'not_started' NOT NULL,
	`requires_student` integer DEFAULT false NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT '"2026-10-15T15:53:56.953Z"' NOT NULL
);
