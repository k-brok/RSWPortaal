-- 004_editie_uitbreidingen.sql — Systeem-actief vlag + LSW-datum aan edities

ALTER TABLE edities
  ADD COLUMN lsw_datum DATE     NULL    AFTER datum,
  ADD COLUMN actief    TINYINT(1) NOT NULL DEFAULT 0 AFTER uitslagen_gepubliceerd;

-- Zorg dat er maximaal één actieve editie tegelijk kan zijn (afgedwongen via applicatie-laag,
-- niet via UNIQUE omdat NULL-rijen niet meetellen in sommige MySQL-versies)
