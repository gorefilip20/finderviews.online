CREATE TABLE `application_tracking` (
  `id` int AUTO_INCREMENT NOT NULL,
  `jobId` int NOT NULL,
  `status` enum('Wishlist','Applied','Interviewing','Offered','Rejected') NOT NULL DEFAULT 'Wishlist',
  `notes` text,
  `appliedDate` timestamp NULL,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `application_tracking_id` PRIMARY KEY(`id`),
  CONSTRAINT `application_tracking_job_id_unique` UNIQUE(`jobId`)
);
