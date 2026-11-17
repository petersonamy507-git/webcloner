import os

import uvicorn

if __name__ == "__main__":
    # Auto-reload restarts the server on every code change, which kills clones that are
    # running. Opt in while developing the backend: API_RELOAD=1 npm run api
    reload = os.environ.get("API_RELOAD") == "1"
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=reload)
