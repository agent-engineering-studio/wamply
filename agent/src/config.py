from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql://supabase_admin@localhost:5432/postgres"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Agent
    agent_secret: str = "dev-agent-secret"

    # Anthropic
    anthropic_api_key: str = ""
    claude_model: str = "claude-sonnet-4-20250514"
    claude_haiku_model: str = "claude-haiku-4-5-20251001"
    mock_llm: bool = False

    # WhatsApp
    whatsapp_api_url: str = "http://localhost:9090"

    # Encryption
    encryption_key: str = "0123456789abcdef0123456789abcdef"

    # Rate limiting
    whatsapp_rate_limit: int = 50  # messages per second
    composer_concurrency: int = 10  # max parallel LLM calls

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
