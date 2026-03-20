-- 027_catering.sql — Catering aanmeldingen voor leiding en vrijwilligers

-- Voeg catering instellingen toe aan edities (prijs per rol, aan/uit schakelaar)
ALTER TABLE edities
  ADD COLUMN catering_actief TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN catering_prijs_leiding DECIMAL(10,2) DEFAULT NULL,
  ADD COLUMN catering_prijs_vrijwilliger DECIMAL(10,2) DEFAULT NULL;

-- Catering aanvragen per gebruiker per editie
CREATE TABLE IF NOT EXISTS catering_aanvragen (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  editie_id         INT NOT NULL,
  gebruiker_id      INT NOT NULL,
  rol               ENUM('leiding', 'vrijwilliger') NOT NULL,
  aantal_personen   INT NOT NULL DEFAULT 1,
  opmerking         TEXT DEFAULT NULL,
  aangemeld_op      DATETIME DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_catering_editie    FOREIGN KEY (editie_id)    REFERENCES edities(id)    ON DELETE CASCADE,
  CONSTRAINT fk_catering_gebruiker FOREIGN KEY (gebruiker_id) REFERENCES gebruikers(id) ON DELETE CASCADE,

  -- Eén aanvraag per gebruiker per editie
  UNIQUE KEY unique_catering_aanvraag (editie_id, gebruiker_id)
);
