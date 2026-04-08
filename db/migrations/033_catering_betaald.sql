-- 033_catering_betaald.sql
-- Voegt betaalstatus en handmatige org-entries toe aan catering_aanvragen

-- Stap 1: Maak losse indexes aan zodat de FK's een index hebben na het droppen van de UNIQUE KEY
SET @idx_editie = (
    SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name   = 'catering_aanvragen'
      AND index_name   = 'idx_catering_editie'
);
SET @sql = IF(@idx_editie = 0,
    'ALTER TABLE catering_aanvragen ADD INDEX idx_catering_editie (editie_id)',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_gebruiker = (
    SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name   = 'catering_aanvragen'
      AND index_name   = 'idx_catering_gebruiker'
);
SET @sql = IF(@idx_gebruiker = 0,
    'ALTER TABLE catering_aanvragen ADD INDEX idx_catering_gebruiker (gebruiker_id)',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Stap 2: Drop FK's die afhangen van de UNIQUE KEY
SET @fk_editie = (
    SELECT COUNT(*) FROM information_schema.table_constraints
    WHERE table_schema    = DATABASE()
      AND table_name      = 'catering_aanvragen'
      AND constraint_name = 'fk_catering_editie'
      AND constraint_type = 'FOREIGN KEY'
);
SET @sql = IF(@fk_editie > 0,
    'ALTER TABLE catering_aanvragen DROP FOREIGN KEY fk_catering_editie',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_gebruiker = (
    SELECT COUNT(*) FROM information_schema.table_constraints
    WHERE table_schema    = DATABASE()
      AND table_name      = 'catering_aanvragen'
      AND constraint_name = 'fk_catering_gebruiker'
      AND constraint_type = 'FOREIGN KEY'
);
SET @sql = IF(@fk_gebruiker > 0,
    'ALTER TABLE catering_aanvragen DROP FOREIGN KEY fk_catering_gebruiker',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Stap 3: Drop de UNIQUE KEY (nu vrij van FK-afhankelijkheid)
SET @unique_exists = (
    SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name   = 'catering_aanvragen'
      AND index_name   = 'unique_catering_aanvraag'
);
SET @sql = IF(@unique_exists > 0,
    'ALTER TABLE catering_aanvragen DROP INDEX unique_catering_aanvraag',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Stap 4: Maak gebruiker_id nullable voor handmatige (niet-gebruiker) entries
ALTER TABLE catering_aanvragen MODIFY COLUMN gebruiker_id INT NULL;

-- Stap 5: Voeg 'overig' toe aan rol ENUM
ALTER TABLE catering_aanvragen MODIFY COLUMN rol ENUM('leiding', 'vrijwilliger', 'overig') NOT NULL;

-- Stap 6: Nieuwe kolommen
ALTER TABLE catering_aanvragen ADD COLUMN IF NOT EXISTS betaald        TINYINT(1)   NOT NULL DEFAULT 0 AFTER opmerking;
ALTER TABLE catering_aanvragen ADD COLUMN IF NOT EXISTS handmatig_naam VARCHAR(150) NULL              AFTER betaald;

-- Stap 7: Herstel FK's (gebruiken nu de losse indexes uit stap 1)
SET @fk_editie = (
    SELECT COUNT(*) FROM information_schema.table_constraints
    WHERE table_schema    = DATABASE()
      AND table_name      = 'catering_aanvragen'
      AND constraint_name = 'fk_catering_editie'
      AND constraint_type = 'FOREIGN KEY'
);
SET @sql = IF(@fk_editie = 0,
    'ALTER TABLE catering_aanvragen ADD CONSTRAINT fk_catering_editie FOREIGN KEY (editie_id) REFERENCES edities(id) ON DELETE CASCADE',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_gebruiker = (
    SELECT COUNT(*) FROM information_schema.table_constraints
    WHERE table_schema    = DATABASE()
      AND table_name      = 'catering_aanvragen'
      AND constraint_name = 'fk_catering_gebruiker'
      AND constraint_type = 'FOREIGN KEY'
);
SET @sql = IF(@fk_gebruiker = 0,
    'ALTER TABLE catering_aanvragen ADD CONSTRAINT fk_catering_gebruiker FOREIGN KEY (gebruiker_id) REFERENCES gebruikers(id) ON DELETE CASCADE',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
