-- 018_vrijwilliger_vacatures.sql — Vacatures (vrijwilligerstaken) per editie

CREATE TABLE IF NOT EXISTS vrijwilliger_vacatures (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  editie_id         INT          NOT NULL,
  naam              VARCHAR(255) NOT NULL,
  omschrijving      TEXT         NULL,
  max_vrijwilligers INT          NULL,       -- NULL = onbeperkt
  aangemaakt_op     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  bijgewerkt_op     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (editie_id) REFERENCES edities(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
