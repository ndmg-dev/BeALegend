from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import get_settings
from app.errors import CONTENT_TYPE, register_error_handlers
from app.rate_limit import limiter
from app.routers import auth, exercises, health, sync

settings = get_settings()

app = FastAPI(
    title="BeALegend API",
    version="0.1.0",
    description="Treino, refeicoes, gastos e habitos — API multiusuario com RLS.",
)

app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

register_error_handlers(app)


@app.exception_handler(RateLimitExceeded)
async def _rate_limited(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        media_type=CONTENT_TYPE,
        content={
            "type": "https://bealegend.app/problems/rate-limited",
            "title": "Muitas requisicoes",
            "status": 429,
            "detail": "Limite de requisicoes excedido. Tente novamente em instantes.",
            "instance": request.url.path,
        },
    )


app.include_router(health.router)
app.include_router(auth.router)
app.include_router(exercises.router)
app.include_router(sync.router)
