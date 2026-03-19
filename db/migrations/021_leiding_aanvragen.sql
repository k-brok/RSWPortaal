-- 021_leiding_aanvragen.sql — Aanvragen van zelf-geregistreerde leiding voor groepskoppeling

CREATE TABLE IF NOT EXISTS leiding_aanvragen (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  gebruiker_id   INT          NOT NULL,
  groep_id       INT          NOT NULL,
  status         ENUM('in_behandeling','goedgekeurd','afgewezen') NOT NULL DEFAULT 'in_behandeling',
  opmerking      TEXT         NULL,       -- notitie van de aanvrager
  behandeld_door INT          NULL,
  reden_afwijzing TEXT        NULL,
  aangemaakt_op  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  behandeld_op   DATETIME     NULL,
  FOREIGN KEY (gebruiker_id)   REFERENCES gebruikers(id) ON DELETE CASCADE,
  FOREIGN KEY (groep_id)       REFERENCES groepen(id)    ON DELETE CASCADE,
  FOREIGN KEY (behandeld_door) REFERENCES gebruikers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
