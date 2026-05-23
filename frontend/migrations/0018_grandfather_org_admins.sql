-- Grandfather existing org members into `admin` so role-aware guards in
-- src/auth/org-fns.ts don't suddenly lock long-time members out of member
-- management. The old model treated every member as effectively admin (see
-- the comments above `removeOrgMember` etc. in pre-0017 history); preserve
-- that for rows that pre-date the role column. Owners stay `owner`; future
-- signups still default to `member` via the column default set in 0017.
--
-- No-op on fresh installs (no existing 'member' rows yet).
UPDATE organization_members SET role = 'admin' WHERE role = 'member';
