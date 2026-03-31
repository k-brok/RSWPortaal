-- 029_rally_punten_modus.sql — Flexibele aankomstpuntenmodus voor rally tocht

-- Kies puntmodus per jureermoment
ALTER TABLE jurymomenten
  ADD COLUMN aankomst_punten_modus
    ENUM('geen','per_positie','per_station','per_bezoek') NOT NULL DEFAULT 'geen';

-- Punt­waarde per station (voor per_station modus) + startpost markering
ALTER TABLE rally_stations
  ADD COLUMN punten   DECIMAL(8,2) NULL    DEFAULT NULL,
  ADD COLUMN is_start TINYINT(1)   NOT NULL DEFAULT 0;

-- Rondje-vlag per route (eindigen bij de startpost)
ALTER TABLE rally_routes
  ADD COLUMN is_circulair TINYINT(1) NOT NULL DEFAULT 0;

-- Terugkomsttijd voor rondje-routes (startpost wordt twee keer gescand)
ALTER TABLE patrouille_bezoeken
  ADD COLUMN terugkomst_tijd DATETIME NULL DEFAULT NULL;

-- Punten per bezoek-nr (voor per_bezoek modus)
-- bezoek_nr = 1 is de 1e post die de patrouille bezoekt, 2 = de 2e, etc.
CREATE TABLE IF NOT EXISTS rally_voortgang_punten (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  jurymoment_id INT NOT NULL,
  bezoek_nr     INT NOT NULL,
  punten        DECIMAL(8,2) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_moment_bezoek (jurymoment_id, bezoek_nr),
  FOREIGN KEY (jurymoment_id) REFERENCES jurymomenten(id) ON DELETE CASCADE
);
