-- Runs once, on first boot of an empty data volume.
-- The API never connects as the owner: it connects as bealegend_app, which is
-- not the table owner and therefore cannot escape Row-Level Security.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bealegend_app') THEN
    EXECUTE format('CREATE ROLE bealegend_app LOGIN PASSWORD %L',
                   coalesce(current_setting('bealegend.app_password', true), 'changeme_app'));
  END IF;
END
$$;

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO bealegend_app;
