from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql://supabase_admin@localhost:5432/postgres"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Agent
    agent_secret: str = "dev-agent-secret"

    # Anthropic — keys live in DB only (system_config or ai_config.encrypted_api_key).
    # `mock_llm` short-circuits all LLM calls for dev/tests.
    claude_model: str = "claude-sonnet-4-5"
    claude_haiku_model: str = "claude-haiku-4-5"
    mock_llm: bool = False

    # Encryption
    encryption_key: str = "0123456789abcdef0123456789abcdef"

    # Rate limiting
    whatsapp_rate_limit: int = 50  # messages per second
    composer_concurrency: int = 10  # max parallel LLM calls

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
