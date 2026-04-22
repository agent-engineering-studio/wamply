from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://supabase_admin:postgres@supabase-db:5432/postgres"
    redis_url: str = "redis://redis:6379"
    jwt_secret: str = "super-secret-jwt-token-with-at-least-32-characters-long"
    agent_secret: str = "dev-agent-secret-change-in-production"
    encryption_key: str = "0123456789abcdef0123456789abcdef"
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    supabase_service_role_key: str = ""
    # Anthropic keys live in DB only (system_config or ai_config.encrypted_api_key).
    claude_model: str = "claude-sonnet-4-5"
    claude_haiku_model: str = "claude-haiku-4-5"
    mock_llm: bool = False

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
