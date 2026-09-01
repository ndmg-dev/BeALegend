from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    allowed_hosts: str = "localhost,127.0.0.1,test,testserver"

    database_url: str = "postgresql+asyncpg://bealegend_app:changeme_app@localhost:5432/bealegend"
    database_owner_url: str = "postgresql+asyncpg://bealegend:changeme@localhost:5432/bealegend"

    jwt_secret: str = "dev-only-change-me"
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 30

    # Configuráveis para que a suíte E2E possa afrouxá-los sem que alguém
    # acabe apagando o limite do código por atrapalhar teste.
    rate_limit_register: str = "5/hour"
    rate_limit_login: str = "10/minute"
    rate_limit_refresh: str = "60/minute"

    cors_origins: str = "http://localhost:5173"
    cookie_secure: bool = False
    cookie_domain: str = ""
    # Caminho VISTO PELO NAVEGADOR, não a rota interna da API. O Caddy (e o
    # proxy do Vite) publicam a API sob /api e removem o prefixo antes de
    # chegar aqui — um cookie com path "/auth" simplesmente nunca seria
    # enviado de volta, e a sessão morreria a cada reload.
    refresh_cookie_path: str = "/api/auth"

    # Insights de nutrição por IA. Feature opcional: sem chave/flag, os
    # endpoints respondem 204 e o worker não gera nada.
    nutrition_insights_enabled: bool = False
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    openai_base_url: str = "https://api.openai.com/v1"
    openai_timeout_seconds: int = 20

    # Segredo que um cron externo (cron-job.org) manda no header X-Cron-Secret
    # para chamar POST /internal/tick — substitui o worker na Vercel.
    cron_secret: str = ""

    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = "mailto:admin@example.com"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def allowed_host_list(self) -> list[str]:
        return [host.strip() for host in self.allowed_hosts.split(",") if host.strip()]

    @model_validator(mode="after")
    def production_secrets_are_explicit(self):
        if self.app_env == "production" and self.jwt_secret == "dev-only-change-me":
            raise ValueError("JWT_SECRET precisa ser configurado em producao")
        if (
            self.app_env == "production"
            and self.nutrition_insights_enabled
            and not self.openai_api_key
        ):
            raise ValueError(
                "NUTRITION_INSIGHTS_ENABLED sem OPENAI_API_KEY em producao: "
                "cairia no provider fake e serviria texto canned"
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
