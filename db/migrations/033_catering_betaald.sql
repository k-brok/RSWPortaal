-- 033_catering_betaald.sql
-- Voegt betaalstatus en handmatige org-entries toe aan catering_aanvragen
-- Gebruikt MariaDB IF NOT EXISTS / IF EXISTS syntax — idempotent

SET FOREIGN_KEY_CHECKS = 0;

-- Verwijder UNIQUE index (compatibel met MySQL < 8.0.29 en MariaDB)
SET @index_exists = (
    SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name   = 'catering_aanvragen'
      AND index_name   = 'unique_catering_aanvraag'
);
SET @sql = IF(@index_exists > 0,
    'ALTER TABLE catering_aanvragen DROP INDEX unique_catering_aanvraag',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Maak gebruiker_id nullable voor handmatige (niet-gebruiker) entries
ALTER TABLE catering_aanvragen MODIFY COLUMN gebruiker_id INT NULL;

-- Voeg 'overig' toe aan rol ENUM
ALTER TABLE catering_aanvragen MODIFY COLUMN rol ENUM('leiding', 'vrijwilliger', 'overig') NOT NULL;

-- Nieuwe kolommen (IF NOT EXISTS zodat herhaling veilig is)
ALTER TABLE catering_aanvragen ADD COLUMN IF NOT EXISTS betaald        TINYINT(1)   NOT NULL DEFAULT 0 AFTER opmerking;
ALTER TABLE catering_aanvragen ADD COLUMN IF NOT EXISTS handmatig_naam VARCHAR(150) NULL              AFTER betaald;

SET FOREIGN_KEY_CHECKS = 1;
