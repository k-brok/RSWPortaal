-- 005_categorie_subcategorieen.sql — Weegfactor, subcategorieën en criteria aan templates

ALTER TABLE categorie_templates
  ADD COLUMN wegingspercentage DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER omschrijving;

-- Subcategorieën per categorie-template
CREATE TABLE IF NOT EXISTS template_subcategorieen (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  template_id   INT          NOT NULL,
  naam          VARCHAR(255) NOT NULL,
  volgorde      INT          NOT NULL DEFAULT 0,
  aangemaakt_op DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (template_id) REFERENCES categorie_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Criteria per subcategorie
CREATE TABLE IF NOT EXISTS template_criteria (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  subcategorie_id INT          NOT NULL,
  naam            VARCHAR(255) NOT NULL,
  omschrijving    TEXT         NULL,
  max_score       DECIMAL(8,2) NOT NULL DEFAULT 100,
  volgorde        INT          NOT NULL DEFAULT 0,
  aangemaakt_op   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subcategorie_id) REFERENCES template_subcategorieen(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
