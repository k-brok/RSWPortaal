-- 013_plattegrond_publiceer.sql
-- Granulaire publicatie-flags voor de plattegrond.
-- subkamp_gepubliceerd: leiding + publiek ziet welke patrouille in welk subkamp zit.
-- nummers_gepubliceerd:  leiding ziet het nummer van hun eigen patrouille.

ALTER TABLE plattegronden
  ADD COLUMN subkamp_gepubliceerd  TINYINT(1) NOT NULL DEFAULT 0 AFTER gepubliceerd,
  ADD COLUMN nummers_gepubliceerd   TINYINT(1) NOT NULL DEFAULT 0 AFTER subkamp_gepubliceerd;
