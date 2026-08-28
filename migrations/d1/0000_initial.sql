-- Beaver Cloudflare schema. D1 migrations are applied by Wrangler.
CREATE TABLE IF NOT EXISTS `users` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `email` text NOT NULL,
  `password` text NOT NULL,
  `role` text NOT NULL DEFAULT 'author',
  `email_verified` integer NOT NULL DEFAULT 0,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS `users_email_unique` ON `users` (`email`);

CREATE TABLE IF NOT EXISTS `admin_two_factor` (
  `user_id` text PRIMARY KEY NOT NULL,
  `secret` text NOT NULL,
  `enabled` integer NOT NULL DEFAULT 0,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE TABLE IF NOT EXISTS `admin_refresh_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `expires_at` integer NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `token` text NOT NULL,
  `expires_at` integer NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS `password_reset_tokens_token_unique` ON `password_reset_tokens` (`token`);

CREATE TABLE IF NOT EXISTS `posts` (
  `id` text PRIMARY KEY NOT NULL,
  `title` text NOT NULL,
  `slug` text NOT NULL,
  `type` text NOT NULL DEFAULT 'post',
  `status` text NOT NULL DEFAULT 'draft',
  `excerpt` text,
  `description` text,
  `tags` text,
  `sections` text,
  `custom_field_values` text,
  `meta_title` text,
  `meta_description` text,
  `featured_image` text,
  `gallery` text,
  `author_id` text NOT NULL,
  `published_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `deleted_at` integer
);
CREATE UNIQUE INDEX IF NOT EXISTS `posts_slug_unique` ON `posts` (`slug`);
CREATE INDEX IF NOT EXISTS `posts_deleted_at_idx` ON `posts` (`deleted_at`, `type`, `updated_at`);

CREATE TABLE IF NOT EXISTS `categories` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `slug` text NOT NULL,
  `type` text NOT NULL DEFAULT 'post',
  `description` text,
  `image` text,
  `status` text NOT NULL DEFAULT 'published',
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS `categories_slug_unique` ON `categories` (`slug`);

CREATE TABLE IF NOT EXISTS `post_categories` (
  `id` text PRIMARY KEY NOT NULL,
  `post_id` text NOT NULL,
  `category_id` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `media` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `name` text NOT NULL,
  `file_name` text NOT NULL,
  `mime_type` text NOT NULL,
  `size` integer NOT NULL,
  `url` text NOT NULL,
  `thumbnail_url` text,
  `alt` text,
  `caption` text,
  `width` integer,
  `height` integer,
  `folder` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE TABLE IF NOT EXISTS `menus` (
  `id` text PRIMARY KEY NOT NULL,
  `title` text NOT NULL,
  `url` text NOT NULL,
  `type` text NOT NULL,
  `position` integer NOT NULL DEFAULT 0,
  `parent_id` text,
  `css_class` text,
  `target` text,
  `image` text,
  `status` text NOT NULL DEFAULT 'published',
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`parent_id`) REFERENCES `menus` (`id`)
);

CREATE TABLE IF NOT EXISTS `settings` (
  `key` text PRIMARY KEY NOT NULL,
  `value` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE TABLE IF NOT EXISTS `contact_submissions` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `email` text NOT NULL,
  `subject` text,
  `message` text NOT NULL,
  `ip_address` text,
  `user_agent` text,
  `created_at` integer NOT NULL
);
CREATE INDEX IF NOT EXISTS `contact_submissions_created_at_idx` ON `contact_submissions` (`created_at`);
CREATE INDEX IF NOT EXISTS `contact_submissions_email_created_at_idx` ON `contact_submissions` (`email`, `created_at`);

CREATE TABLE IF NOT EXISTS `activity_logs` (
  `id` text PRIMARY KEY NOT NULL,
  `actor_id` text,
  `actor_name` text,
  `actor_email` text,
  `action` text NOT NULL,
  `resource` text NOT NULL,
  `resource_id` text,
  `metadata` text,
  `ip_address` text,
  `user_agent` text,
  `success` integer NOT NULL DEFAULT 1,
  `status_code` integer NOT NULL DEFAULT 200,
  `created_at` integer NOT NULL
);
CREATE INDEX IF NOT EXISTS `activity_logs_created_at_idx` ON `activity_logs` (`created_at`);
CREATE INDEX IF NOT EXISTS `activity_logs_actor_created_at_idx` ON `activity_logs` (`actor_id`, `created_at`);
CREATE INDEX IF NOT EXISTS `activity_logs_resource_created_at_idx` ON `activity_logs` (`resource`, `resource_id`, `created_at`);
