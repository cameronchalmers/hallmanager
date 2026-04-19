CREATE POLICY IF NOT EXISTS "Admins can manage site credentials" ON site_credentials
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY IF NOT EXISTS "Site admins can manage their site credentials" ON site_credentials
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('site_admin', 'manager')
      AND site_id = ANY(site_ids)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('site_admin', 'manager')
      AND site_id = ANY(site_ids)
    )
  );
