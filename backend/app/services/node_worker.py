import asyncio
import json
from typing import Any, Callable, Optional

from app.config import ROOT

WORKER_TIMEOUT_SECONDS = 600
WORKER_CONCURRENCY = asyncio.Semaphore(8)
PROGRESS_PREFIX = "@@progress "


async def run_node_worker(
    action: str,
    on_progress: Optional[Callable[[dict], None]] = None,
    on_start: Optional[Callable[[asyncio.subprocess.Process], None]] = None,
    **params: Any,
) -> dict:
    """Run one action in server/worker.mjs. Progress lines on stderr go to `on_progress`."""
    payload = json.dumps({"action": action, **params}).encode()
    async with WORKER_CONCURRENCY:
        proc = await asyncio.create_subprocess_exec(
            "node",
            str(ROOT / "server" / "worker.mjs"),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(ROOT),
            limit=4 * 1024 * 1024,
        )
        if on_start:
            on_start(proc)

        async def read_stderr() -> str:
            kept = []
            while True:
                try:
                    raw = await proc.stderr.readline()
                except ValueError:  # a single enormous log line; skip it
                    continue
                if not raw:
                    break
                line = raw.decode(errors="replace").rstrip("\n")
                if line.startswith(PROGRESS_PREFIX):
                    if on_progress:
                        try:
                            on_progress(json.loads(line[len(PROGRESS_PREFIX):]))
                        except Exception:  # noqa: BLE001 - progress is best-effort
                            pass
                else:
                    kept.append(line)
            return "\n".join(kept)

        async def run() -> tuple[bytes, str]:
            proc.stdin.write(payload)
            await proc.stdin.drain()
            proc.stdin.close()
            stdout_task = asyncio.create_task(proc.stdout.read())
            stderr_text = await read_stderr()
            stdout = await stdout_task
            await proc.wait()
            return stdout, stderr_text

        try:
            stdout, stderr = await asyncio.wait_for(run(), timeout=WORKER_TIMEOUT_SECONDS)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            raise RuntimeError(f"Node worker timed out after {WORKER_TIMEOUT_SECONDS}s.")

    if not stdout:
        if proc.returncode and proc.returncode < 0:
            raise RuntimeError("The job was stopped.")
        raise RuntimeError(stderr.strip() or "Node worker failed")

    try:
        result = json.loads(stdout.decode())
    except json.JSONDecodeError:
        raise RuntimeError(stderr.strip() or stdout.decode().strip() or "Node worker returned invalid output.")

    if proc.returncode != 0 and not result.get("error"):
        raise RuntimeError(stderr.strip() or f"Node worker exited with code {proc.returncode}.")

    if not result.get("success", True) and result.get("error"):
        raise RuntimeError(result["error"])
    return result
