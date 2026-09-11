CREATE TABLE `courts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_courts_name` ON `courts` (`name`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`court_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`joined_at` integer NOT NULL,
	`hopped_on_at` integer,
	FOREIGN KEY (`court_id`) REFERENCES `courts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_memberships_user` ON `memberships` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_memberships_court_status_joined` ON `memberships` (`court_id`,`status`,`joined_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_users_role` ON `users` (`role`);