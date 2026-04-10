-- 008_contact_groups.sql
-- Contact groups for campaign segmentation + schema updates from doc v2

-- ── Contact Groups ───────────────────────────────────────
CREATE TABLE contact_groups (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    name        text        NOT NULL,
    description text,
    created_at  timestamptz DEFAULT now(),
    updated_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_contact_groups_user_id ON contact_groups (user_id);

CREATE TRIGGER trg_contact_groups_updated_at
    BEFORE UPDATE ON contact_groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Contact-Group membership (many-to-many) ──────────────
CREATE TABLE contact_group_members (
    contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE NOT NULL,
    group_id   uuid REFERENCES contact_groups(id) ON DELETE CASCADE NOT NULL,
    PRIMARY KEY (contact_id, group_id)
);

-- ── Add variables column to contacts ─────────────────────
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS variables jsonb DEFAULT '{}';

-- ── Add group_id to campaigns ────────────────────────────
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES contact_groups(id);

-- ── RLS on new tables ────────────────────────────────────
ALTER TABLE contact_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY contact_groups_own ON contact_groups
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY contact_group_members_own ON contact_group_members
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM contact_groups g
            WHERE g.id = contact_group_members.group_id AND g.user_id = auth.uid()
        )
    );
