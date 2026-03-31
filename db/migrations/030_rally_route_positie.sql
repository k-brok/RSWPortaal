-- 030_rally_route_positie.sql
-- Route-stations worden nu positie-gebaseerd: een station mag meerdere keren voorkomen.
-- is_start zit op de positie in de route, niet op het station zelf.

-- Verwijder UNIQUE constraint zodat een station meerdere keren in een route kan (bijv. A-B-C-D-A)
-- De FK fk_rrs_route gebruikt de UNIQUE KEY als index voor route_id;
-- eerst een aparte index aanmaken zodat de FK iets heeft om op te leunen.
ALTER TABLE rally_route_stations
  ADD INDEX idx_rrs_route (route_id);

ALTER TABLE rally_route_stations
  DROP KEY uq_route_station;

-- Startpost-markering per route-positie (ipv per station)
ALTER TABLE rally_route_stations
  ADD COLUMN is_start TINYINT(1) NOT NULL DEFAULT 0;

-- is_start en is_circulair zijn verplaatst — opruimen
ALTER TABLE rally_stations DROP COLUMN is_start;
ALTER TABLE rally_routes   DROP COLUMN is_circulair;
