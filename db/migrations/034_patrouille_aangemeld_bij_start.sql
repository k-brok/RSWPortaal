-- 034_patrouille_aangemeld_bij_start.sql
-- Voegt een vlag toe waarmee de organisator/admin kan aangeven dat een patrouille
-- zich heeft aangemeld bij de start van de RSW.

ALTER TABLE patrouilles
  ADD COLUMN aangemeld_bij_start TINYINT(1) NOT NULL DEFAULT 0
      AFTER buiten_mededinging;
