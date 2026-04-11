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

    class Config:
        env_file = ".env"


settings = Settings()
