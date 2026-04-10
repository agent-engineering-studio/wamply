-- 005_agent_memory.sql
-- Agent cross-campaign memory store

CREATE TABLE agent_memory (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid        REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    key        text        NOT NULL,
    value      jsonb       NOT NULL DEFAULT '{}',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(user_id, key)
);

CREATE INDEX idx_agent_memory_user_id ON agent_memory (user_id);

CREATE TRIGGER trg_agent_memory_updated_at
    BEFORE UPDATE ON agent_memory
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
