from slowapi import Limiter
from slowapi.util import get_remote_address

# In-memory by default; swap the storage_uri for Redis when the API runs
# with more than one worker process.
limiter = Limiter(key_func=get_remote_address, default_limits=[])
