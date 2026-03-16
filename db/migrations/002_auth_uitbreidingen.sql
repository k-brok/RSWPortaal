-- ============================================================
-- 002_auth_uitbreidingen.sql — Velden voor e-mailwijziging
-- ============================================================

ALTER TABLE gebruikers
  ADD COLUMN email_wijzig_token    VARCHAR(255) NULL AFTER reset_token_verloopt,
  ADD COLUMN email_wijzig_nieuw    VARCHAR(255) NULL AFTER email_wijzig_token,
  ADD COLUMN email_wijzig_verloopt DATETIME     NULL AFTER email_wijzig_nieuw;
