-- ─────────────────────────────────────────────────────────────────
-- 028_rally_herontwerp.sql
--
-- Rally systeem herontwerp: twee typen (tocht & spelmiddag), routes
-- met vaste volgorde per patrouille, en aankomst-volgorde-punten.
--
-- Tocht:    vaste route per patrouille, valideer volgorde bij scan,
--           punten op basis van aankomstpositie (1e/2e/3e ...)
-- Spelmiddag: vrij scannen, geen volgorde, spellen tellen.
-- ─────────────────────────────────────────────────────────────────

-- 1. Rally-type op categorieniveau
--    NULL = nog niet ingesteld, wordt gezet door organisator
ALTER TABLE editie_categorieen
  ADD COLUMN rally_type ENUM('tocht','spelmiddag') NULL DEFAULT NULL
  AFTER wegingspercentage;

-- 2. Routes per jurymomenten (alleen tocht)
CREATE TABLE IF NOT EXISTS rally_routes (
  id            INT          NOT NULL AUTO_INCREMENT,
  jurymoment_id INT          NOT NULL,
  naam          VARCHAR(100) NOT NULL,
  aangemaakt_op TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_rr_moment FOREIGN KEY (jurymoment_id)
    REFERENCES jurymomenten(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Volgorde van stations per route
CREATE TABLE IF NOT EXISTS rally_route_stations (
  id         INT NOT NULL AUTO_INCREMENT,
  route_id   INT NOT NULL,
  station_id INT NOT NULL,
  volgorde   INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_route_station (route_id, station_id),
  CONSTRAINT fk_rrs_route   FOREIGN KEY (route_id)   REFERENCES rally_routes(id)  ON DELETE CASCADE,
  CONSTRAINT fk_rrs_station FOREIGN KEY (station_id) REFERENCES rally_stations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Patrouille gekoppeld aan een route (max 1 route per patrouille per moment,
--    gegarandeerd via app-logica: bij nieuw toewijzen verwijder oud eerst)
CREATE TABLE IF NOT EXISTS patrouille_routes (
  id            INT       NOT NULL AUTO_INCREMENT,
  patrouille_id INT       NOT NULL,
  route_id      INT       NOT NULL,
  aangemaakt_op TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pat_route (patrouille_id, route_id),
  CONSTRAINT fk_pr_route FOREIGN KEY (route_id)
    REFERENCES rally_routes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Aankomstpunten per positie per jurymomenten (tocht)
--    positie 1 = eerste aankomst, 2 = tweede, etc.
--    Vervangt de statische aankomst_punten op rally_station_criteria.
CREATE TABLE IF NOT EXISTS rally_aankomst_punten (
  id            INT           NOT NULL AUTO_INCREMENT,
  jurymoment_id INT           NOT NULL,
  positie       INT           NOT NULL,        -- 1-based
  punten        DECIMAL(8,2)  NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_moment_positie (jurymoment_id, positie),
  CONSTRAINT fk_rap_moment FOREIGN KEY (jurymoment_id)
    REFERENCES jurymomenten(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. aankomst_positie opslaan op het bezoek zodat tracking de volgorde toont
ALTER TABLE patrouille_bezoeken
  ADD COLUMN aankomst_positie INT NULL DEFAULT NULL
  AFTER status;
