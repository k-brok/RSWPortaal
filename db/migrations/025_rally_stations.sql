-- 025_rally_stations.sql
-- Rally stations als losse entiteiten (niet gekoppeld aan subkampen).
-- Elk station bepaalt zelf welke criteria het beoordeelt en wat de aankomstpunten zijn.

-- Stations per rally moment
CREATE TABLE rally_stations (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  jurymoment_id INT NOT NULL,
  naam          VARCHAR(100) NOT NULL,
  token         VARCHAR(64)  NOT NULL UNIQUE,
  volgorde      INT NOT NULL DEFAULT 0,
  aangemaakt_op TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (jurymoment_id) REFERENCES jurymomenten(id) ON DELETE CASCADE
);

-- Welke criteria een station kan beoordelen + aankomstpunten per criterium
CREATE TABLE rally_station_criteria (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  station_id      INT NOT NULL,
  criterium_id    INT NOT NULL,
  aankomst_punten INT NOT NULL DEFAULT 0,
  volgorde        INT NOT NULL DEFAULT 0,
  UNIQUE KEY uniq_sc (station_id, criterium_id),
  FOREIGN KEY (station_id)   REFERENCES rally_stations(id)  ON DELETE CASCADE,
  FOREIGN KEY (criterium_id) REFERENCES editie_criteria(id) ON DELETE CASCADE
);

-- Scores ingevoerd via rally scan (per station, patrouille en criterium)
CREATE TABLE rally_scores (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  station_id    INT NOT NULL,
  patrouille_id INT NOT NULL,
  criterium_id  INT NOT NULL,
  score         DECIMAL(8,2) NOT NULL DEFAULT 0,
  bijgewerkt_op TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_rs (station_id, patrouille_id, criterium_id),
  FOREIGN KEY (station_id) REFERENCES rally_stations(id) ON DELETE CASCADE
);

-- Patrouille bezoeken uitbreiden: station_id voor rally (subkamp_id blijft voor reguliere jury)
ALTER TABLE patrouille_bezoeken
  ADD COLUMN station_id INT NULL AFTER jurymoment_id,
  ADD UNIQUE KEY uniek_bezoek_station (station_id, patrouille_id),
  ADD CONSTRAINT fk_pb_rally_station FOREIGN KEY (station_id) REFERENCES rally_stations(id) ON DELETE CASCADE;

-- subkamp_id nullable maken zodat rally bezoeken geen subkamp nodig hebben
ALTER TABLE patrouille_bezoeken
  MODIFY COLUMN subkamp_id INT NULL;

-- score_niveau kolom is niet meer nodig (stations definiëren zelf hun criteria)
-- Kolom blijft bestaan voor backward compatibility met bestaande data
