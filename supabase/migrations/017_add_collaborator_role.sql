-- 017_add_collaborator_role.sql
-- Add 'collaborator' to user_role enum (staff member with limited admin powers)

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'collaborator';
