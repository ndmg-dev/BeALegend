"""UUIDv7 — time-ordered ids (RFC 9562).

The client generates ids for its own records; the server accepts them. This
helper exists for rows the server creates on its own (refresh tokens, seeds)
so both sides produce the same shape of id.
"""

import os
import time
from uuid import UUID


def uuid7() -> UUID:
    ms = int(time.time() * 1000) & 0xFFFFFFFFFFFF
    rand = os.urandom(10)
    b = bytearray(ms.to_bytes(6, "big") + rand)
    b[6] = (b[6] & 0x0F) | 0x70  # version 7
    b[8] = (b[8] & 0x3F) | 0x80  # RFC 4122 variant
    return UUID(bytes=bytes(b))
