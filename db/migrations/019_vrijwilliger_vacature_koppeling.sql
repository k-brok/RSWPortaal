-- 019_vrijwilliger_vacature_koppeling.sql — Koppel vacature aan vrijwilliger-inschrijving

ALTER TABLE vrijwilliger_inschrijvingen
  ADD COLUMN vacature_id INT NULL AFTER taakvorkeur,
  ADD CONSTRAINT fk_vrijw_inschrijving_vacature
    FOREIGN KEY (vacature_id) REFERENCES vrijwilliger_vacatures(id) ON DELETE SET NULL;
