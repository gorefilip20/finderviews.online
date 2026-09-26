CREATE TABLE `jobs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `title` varchar(240) NOT NULL,
  `companyName` varchar(240) NOT NULL,
  `location` varchar(240) NOT NULL,
  `jobType` enum('Remote','Full-time','Part-time','Contract','Hybrid') NOT NULL,
  `category` varchar(120) NOT NULL,
  `salaryRange` varchar(120),
  `description` text NOT NULL,
  `requirements` text NOT NULL,
  `applicationContact` varchar(320) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `isActive` boolean NOT NULL DEFAULT true,
  CONSTRAINT `jobs_id` PRIMARY KEY(`id`)
);
