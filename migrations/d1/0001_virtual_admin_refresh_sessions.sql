-- Allow refresh sessions for the environment-managed virtual Super Admin.
-- The application explicitly removes sessions when database users are changed;
-- access validation also requires the referenced user to still resolve.
CREATE TABLE `admin_refresh_sessions_next` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `expires_at` integer NOT NULL,
  `created_at` integer NOT NULL
);

INSERT INTO `admin_refresh_sessions_next` (`id`, `user_id`, `expires_at`, `created_at`)
SELECT `id`, `user_id`, `expires_at`, `created_at`
FROM `admin_refresh_sessions`;

DROP TABLE `admin_refresh_sessions`;
ALTER TABLE `admin_refresh_sessions_next` RENAME TO `admin_refresh_sessions`;
