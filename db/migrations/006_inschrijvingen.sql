-- 006_inschrijvingen.sql — Inschrijfysteem: fasen, instellingen, patrouilles & deelnemers

-- Uitbreidingen op edities: inschrijvingsfasen + deelnemersregels
ALTER TABLE edities
  ADD COLUMN voorinschrijving_open  TINYINT(1)   NOT NULL DEFAULT 0
      AFTER inschrijving_open,
  ADD COLUMN voorinschrijving_sluit DATE         NULL
      AFTER voorinschrijving_open,
  ADD COLUMN inschrijving_sluit     DATE         NULL
      AFTER voorinschrijving_sluit,
  ADD COLUMN min_scouts             INT          NOT NULL DEFAULT 5
      AFTER inschrijving_sluit,
  ADD COLUMN max_scouts             INT          NOT NULL DEFAULT 7
      AFTER min_scouts,
  ADD COLUMN min_leeftijd           INT          NULL
      AFTER max_scouts,
  ADD COLUMN max_leeftijd           INT          NULL
      AFTER min_leeftijd,
  ADD COLUMN ouderen_leeftijd       INT          NOT NULL DEFAULT 15
      AFTER max_leeftijd,
  ADD COLUMN max_ouderen_klein      INT          NOT NULL DEFAULT 1
      AFTER ouderen_leeftijd,
  ADD COLUMN max_ouderen_groot      INT          NOT NULL DEFAULT 2
      AFTER max_ouderen_klein,
  ADD COLUMN ouderen_grens          INT          NOT NULL DEFAULT 6
      AFTER max_ouderen_groot,
  ADD COLUMN bm_label               VARCHAR(100) NOT NULL DEFAULT 'Buiten mededinging'
      AFTER ouderen_grens,
  ADD COLUMN bm_max_positie         INT          NOT NULL DEFAULT 2
      AFTER bm_label;

-- Patrouilles (per editie, per groep)
CREATE TABLE IF NOT EXISTS patrouilles (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  editie_id          INT          NOT NULL,
  groep_id           INT          NOT NULL,
  naam               VARCHAR(100) NOT NULL,
  jongste            TINYINT(1)   NOT NULL DEFAULT 0,
  buiten_mededinging TINYINT(1)   NOT NULL DEFAULT 0,
  bm_reden           TEXT         NULL,
  aangemaakt_op      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  bijgewerkt_op      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (editie_id) REFERENCES edities(id)  ON DELETE CASCADE,
  FOREIGN KEY (groep_id)  REFERENCES groepen(id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Deelnemers (scouts per patrouille)
CREATE TABLE IF NOT EXISTS deelnemers (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  patrouille_id INT          NOT NULL,
  voornaam      VARCHAR(100) NOT NULL,
  achternaam    VARCHAR(100) NOT NULL,
  geboortedatum DATE         NOT NULL,
  aangemaakt_op DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patrouille_id) REFERENCES patrouilles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
