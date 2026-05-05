"""
Proxy server to forward requests to the TypeScript backend.
The TypeScript backend runs via tsx on port 3210.
"""
import os
import subprocess
import threading
import time
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
import httpx

app = FastAPI()

# Allow all CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BACKEND_URL = "http://127.0.0.1:3210"
backend_process = None

def start_backend():
    """Start the TypeScript backend server"""
    global backend_process
    try:
        backend_process = subprocess.Popen(
            ["npx", "tsx", "src/index.ts"],
            cwd="/app/backend",
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            env={**os.environ, "PORT": "3210"}
        )
        # Stream output
        for line in iter(backend_process.stdout.readline, b''):
            print(f"[TS Backend] {line.decode().strip()}")
    except Exception as e:
        print(f"Failed to start TypeScript backend: {e}")

# Start TypeScript backend in a separate thread
threading.Thread(target=start_backend, daemon=True).start()

# Wait for backend to start
time.sleep(3)

@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
async def proxy(request: Request, path: str):
    """Proxy all requests to TypeScript backend"""
    async with httpx.AsyncClient(timeout=60.0) as client:
        # Build the target URL
        url = f"{BACKEND_URL}/{path}"
        if request.query_params:
            url += f"?{request.query_params}"
        
        # Get request body if any
        body = await request.body()
        
        # Forward all headers
        headers = dict(request.headers)
        headers.pop("host", None)
        
        try:
            response = await client.request(
                method=request.method,
                url=url,
                headers=headers,
                content=body,
            )
            
            return Response(
                content=response.content,
                status_code=response.status_code,
                headers=dict(response.headers),
            )
        except httpx.RequestError as e:
            return Response(
                content=f'{{"error": "Backend unavailable: {str(e)}"}}',
                status_code=502,
                media_type="application/json"
            )

@app.on_event("shutdown")
def shutdown_event():
    """Cleanup backend process on shutdown"""
    global backend_process
    if backend_process:
        backend_process.terminate()
