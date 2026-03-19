-- Migratie 001: Programma systeem
-- Uitvoeren: mysql -u user -p rsw_portaal < 001_programma.sql

-- Jurymomenten: zichtbaarheid in programma
ALTER TABLE jurymomenten
  ADD COLUMN in_programma TINYINT(1) NOT NULL DEFAULT 0;

-- Programma-items: vrije items per editie (opening, prijsuitreiking, etc.)
CREATE TABLE IF NOT EXISTS programma_items (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  editie_id     INT NOT NULL,
  naam          VARCHAR(255) NOT NULL,
  omschrijving  TEXT NULL,
  start_tijd    DATETIME NOT NULL,
  eind_tijd     DATETIME NULL,
  aangemaakt_op DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  bijgewerkt_op DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pi_editie FOREIGN KEY (editie_id) REFERENCES edities(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
