-- 017_vrijwilligers.sql — Vrijwilliger-inschrijvingen per editie

CREATE TABLE IF NOT EXISTS vrijwilliger_inschrijvingen (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  editie_id       INT          NOT NULL,
  gebruiker_id    INT          NOT NULL,
  taakvorkeur     VARCHAR(255) NULL,
  opmerking       TEXT         NULL,
  status          ENUM('aangemeld','bevestigd','afgewezen') NOT NULL DEFAULT 'aangemeld',
  aangemaakt_op   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  bijgewerkt_op   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_editie_gebruiker (editie_id, gebruiker_id),
  FOREIGN KEY (editie_id)    REFERENCES edities(id)    ON DELETE CASCADE,
  FOREIGN KEY (gebruiker_id) REFERENCES gebruikers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
