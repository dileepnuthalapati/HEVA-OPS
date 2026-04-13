"""
Heva One Rate Limiting — Protect public & auth endpoints from abuse.

Uses SlowAPI with in-memory storage (suitable for single-instance deployments).
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
