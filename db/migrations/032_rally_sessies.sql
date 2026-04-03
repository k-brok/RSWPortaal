-- 032_rally_sessies.sql
-- Station-sessies voor het QR-scan systeem (httpOnly cookie per scanner).
-- Vervangt localStorage-gebaseerde stationkeuze door server-side sessies.
-- Hierdoor kunnen alle actieve scanners op een station zichtbaar worden gemaakt
-- en kunnen patrouilles pas doorgaan na afmelding ("vertrokken").

-- Sessies: bijhouden welke scanner op welk station zit
CREATE TABLE rally_station_sessies (
  id            INT          NOT NULL AUTO_INCREMENT,
  station_id    INT          NOT NULL,
  sessie_token  CHAR(64)     NOT NULL UNIQUE,
  aangemaakt_op DATETIME     NOT NULL DEFAULT NOW(),
  verlopen_op   DATETIME     NOT NULL,
  PRIMARY KEY (id),
  INDEX idx_sessie_token (sessie_token),
  INDEX idx_station      (station_id),
  CONSTRAINT fk_rss_station FOREIGN KEY (station_id)
    REFERENCES rally_stations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Statusuitbreiding patrouille_bezoeken:
--   op_post   = patrouille gescand, nog aanwezig
--   vertrokken = patrouille afgemeld, mag door naar volgende post
-- Bestaande waarden blijven behouden voor backward compatibility.
ALTER TABLE patrouille_bezoeken
  MODIFY COLUMN status
    ENUM('aangekomen','bezig','voltooid','op_post','vertrokken')
    NOT NULL DEFAULT 'aangekomen';
