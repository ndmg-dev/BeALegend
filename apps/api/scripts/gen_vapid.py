"""Gera um par de chaves VAPID para Web Push (fase 6).

    python scripts/gen_vapid.py

Imprime JSON com as duas chaves em base64url sem padding, no formato que o
`pywebpush` espera e que o navegador aceita como `applicationServerKey`.
A pública vai para o cliente no momento da subscription; a privada nunca sai
do servidor.
"""

import base64
import json

from cryptography.hazmat.primitives.asymmetric import ec


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def gerar() -> dict[str, str]:
    private_key = ec.generate_private_key(ec.SECP256R1())
    numbers = private_key.public_key().public_numbers()
    # Ponto nao comprimido: 0x04 || X (32 bytes) || Y (32 bytes)
    public_raw = b"\x04" + numbers.x.to_bytes(32, "big") + numbers.y.to_bytes(32, "big")
    private_raw = private_key.private_numbers().private_value.to_bytes(32, "big")
    return {"public": _b64(public_raw), "private": _b64(private_raw)}


if __name__ == "__main__":
    print(json.dumps(gerar()))
