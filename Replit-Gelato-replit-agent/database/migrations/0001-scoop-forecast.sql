CREATE TABLE IF NOT EXISTS gelato_forecast_settings (
  branch_id uuid PRIMARY KEY REFERENCES branches(id) ON DELETE CASCADE,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  country_code text NOT NULL,
  timezone text NOT NULL
);
