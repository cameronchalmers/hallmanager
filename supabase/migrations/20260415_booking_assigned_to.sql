ALTER TABLE bookings
  ADD COLUMN assigned_to uuid REFERENCES users(id) ON DELETE SET NULL;
