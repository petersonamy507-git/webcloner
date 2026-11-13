import asyncio
import json
from typing import Any

from app.config import ROOT

WORKER_TIMEOUT_SECONDS = 600
WORKER_CONCURRENCY = asyncio.Semaphore(8)


async def run_node_worker(action: str, **params: Any) -> dict:
    payload = json.dumps({"action": action, **params})
    async with WORKER_CONCURRENCY:
        proc = await asyncio.create_subprocess_exec(
            "node",
            str(ROOT / "server" / "worker.mjs"),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(ROOT),
        )
        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(payload.encode()), timeout=WORKER_TIMEOUT_SECONDS
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            raise RuntimeError(f"Node worker timed out after {WORKER_TIMEOUT_SECONDS}s.")

    if not stdout:
        msg = stderr.decode().strip() or "Node worker failed"
        raise RuntimeError(msg)

    try:
        result = json.loads(stdout.decode())
    except json.JSONDecodeError:
        msg = stderr.decode().strip() or stdout.decode().strip() or "Node worker returned invalid output."
        raise RuntimeError(msg)

    if proc.returncode != 0 and not result.get("error"):
        msg = stderr.decode().strip() or f"Node worker exited with code {proc.returncode}."
        raise RuntimeError(msg)

    if not result.get("success", True) and result.get("error"):
        raise RuntimeError(result["error"])
    return result
