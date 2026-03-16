-- ============================================================
-- 001_init.sql — Kern-schema RSW Portaal
-- ============================================================

-- Verenigingen (koepelorganisaties van groepen)
CREATE TABLE IF NOT EXISTS verenigingen (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  naam          VARCHAR(255) NOT NULL,
  aangemaakt_op DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Groepen (scouting-afdelingen, gekoppeld aan vereniging)
CREATE TABLE IF NOT EXISTS groepen (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  naam           VARCHAR(255) NOT NULL,
  vereniging_id  INT          NOT NULL,
  aangemaakt_op  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (vereniging_id) REFERENCES verenigingen(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Gebruikers
CREATE TABLE IF NOT EXISTS gebruikers (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  naam                    VARCHAR(255)  NOT NULL,
  email                   VARCHAR(255)  NOT NULL UNIQUE,
  wachtwoord_hash         VARCHAR(255)  NOT NULL,
  rol                     ENUM('admin','organisator','leiding','vrijwilliger','jury','spelbegeleider') NOT NULL DEFAULT 'leiding',
  groep_id                INT           NULL,
  geverifieerd            TINYINT(1)    NOT NULL DEFAULT 0,
  verificatie_token       VARCHAR(255)  NULL,
  reset_token             VARCHAR(255)  NULL,
  reset_token_verloopt    DATETIME      NULL,
  aangemaakt_op           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  bijgewerkt_op           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (groep_id) REFERENCES groepen(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Refresh tokens (JWT)
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  gebruiker_id   INT          NOT NULL,
  token_hash     VARCHAR(255) NOT NULL,
  verloopt_op    DATETIME     NOT NULL,
  aangemaakt_op  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (gebruiker_id) REFERENCES gebruikers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Edities (jaarlijkse wedstrijden)
CREATE TABLE IF NOT EXISTS edities (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  naam                    VARCHAR(255)   NOT NULL,
  jaar                    YEAR           NOT NULL,
  datum                   DATE           NULL,
  locatie                 VARCHAR(255)   NULL,
  inschrijving_open       TINYINT(1)     NOT NULL DEFAULT 0,
  uitslagen_gepubliceerd  TINYINT(1)     NOT NULL DEFAULT 0,
  max_groepen             INT            NOT NULL DEFAULT 36,
  aangemaakt_op           DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  bijgewerkt_op           DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Categorie-templates (globaal, herbruikbaar per editie)
CREATE TABLE IF NOT EXISTS categorie_templates (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  naam          VARCHAR(255)   NOT NULL,
  omschrijving  TEXT           NULL,
  actief        TINYINT(1)     NOT NULL DEFAULT 1,
  aangemaakt_op DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Editie-categorieën (snapshot van template bij aanmaken editie)
CREATE TABLE IF NOT EXISTS editie_categorieen (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  editie_id           INT            NOT NULL,
  template_id         INT            NULL,
  naam                VARCHAR(255)   NOT NULL,
  tijdvenster_start   TIME           NULL,
  tijdvenster_eind    TIME           NULL,
  wegingspercentage   DECIMAL(5,2)   NOT NULL DEFAULT 0,
  volgorde            INT            NOT NULL DEFAULT 0,
  aangemaakt_op       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (editie_id)   REFERENCES edities(id)              ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES categorie_templates(id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
