import asyncio
import time


class TokenBucketRateLimiter:
    """Async token bucket rate limiter for WhatsApp API calls."""

    def __init__(self, rate: int = 50, burst: int | None = None):
        self.rate = rate  # tokens per second
        self.burst = burst or rate
        self.tokens = float(self.burst)
        self.last_refill = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            now = time.monotonic()
            elapsed = now - self.last_refill
            self.tokens = min(self.burst, self.tokens + elapsed * self.rate)
            self.last_refill = now

            if self.tokens < 1:
                wait_time = (1 - self.tokens) / self.rate
                await asyncio.sleep(wait_time)
                self.tokens = 0
            else:
                self.tokens -= 1
