"""RFC 7807 problem details."""

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

CONTENT_TYPE = "application/problem+json"


class ProblemException(HTTPException):
    def __init__(
        self,
        status_code: int,
        title: str,
        detail: str | None = None,
        type_: str = "about:blank",
        **extra: object,
    ) -> None:
        super().__init__(status_code=status_code, detail=detail)
        self.title = title
        self.type_ = type_
        self.extra = extra


def _problem(status: int, title: str, detail: str | None, type_: str, request: Request, **extra):
    body: dict[str, object] = {
        "type": type_,
        "title": title,
        "status": status,
        "instance": str(request.url.path),
    }
    if detail:
        body["detail"] = detail
    body.update(extra)
    return JSONResponse(status_code=status, content=body, media_type=CONTENT_TYPE)


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ProblemException)
    async def _problem_handler(request: Request, exc: ProblemException):
        return _problem(exc.status_code, exc.title, exc.detail, exc.type_, request, **exc.extra)

    @app.exception_handler(HTTPException)
    async def _http_handler(request: Request, exc: HTTPException):
        return _problem(exc.status_code, str(exc.detail), None, "about:blank", request)

    @app.exception_handler(RequestValidationError)
    async def _validation_handler(request: Request, exc: RequestValidationError):
        return _problem(
            422,
            "Requisicao invalida",
            "Um ou mais campos nao passaram na validacao.",
            "https://bealegend.app/problems/validation",
            request,
            errors=[
                {"loc": list(e["loc"]), "msg": e["msg"], "type": e["type"]} for e in exc.errors()
            ],
        )
