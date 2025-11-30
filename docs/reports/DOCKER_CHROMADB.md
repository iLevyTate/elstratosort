# Using ChromaDB with Docker

StratoSort can connect to a ChromaDB server running in Docker instead of managing its own ChromaDB process.

## Quick Start

### 1. Start ChromaDB in Docker

```bash
docker run -d \
  --name chromadb \
  -p 8000:8000 \
  -v chromadb-data:/chroma/chroma \
  chromadb/chroma:latest
```

### 2. Configure StratoSort

Set the environment variable to point to your Docker ChromaDB instance:

**Windows (PowerShell):**

```powershell
$env:CHROMA_SERVER_URL="http://localhost:8000"
npm start
```

**Windows (Command Prompt):**

```cmd
set CHROMA_SERVER_URL=http://localhost:8000
npm start
```

**Linux/Mac:**

```bash
export CHROMA_SERVER_URL=http://localhost:8000
npm start
```

### 3. Verify Connection

Check the StratoSort logs. You should see:

```
[ChromaDB] Successfully initialized vector database
```

Instead of:

```
[STARTUP] Attempting to start chromadb...
```

## Advanced Configuration

### Using Custom Host/Port

If your ChromaDB is running on a different host or port:

```bash
export CHROMA_SERVER_URL=http://192.168.1.100:9000
```

Or set individual components:

```bash
export CHROMA_SERVER_PROTOCOL=http
export CHROMA_SERVER_HOST=192.168.1.100
export CHROMA_SERVER_PORT=9000
```

### Docker Compose

Create a `docker-compose.yml` file:

```yaml
version: '3.8'

services:
  chromadb:
    image: chromadb/chroma:latest
    container_name: stratosort-chromadb
    ports:
      - '8000:8000'
    volumes:
      - chromadb-data:/chroma/chroma
    environment:
      # ============================================================
      # IMPORTANT: Review these settings for production deployments!
      # ============================================================

      # ALLOW_RESET: Enables the reset API endpoint
      # - true:  Allows programmatic deletion of ALL data via API
      # - false: Disables reset endpoint (RECOMMENDED FOR PRODUCTION)
      #
      # WARNING: Setting ALLOW_RESET=true in production allows any client
      # with network access to delete all your vector embeddings!
      # Only use ALLOW_RESET=true for development/testing environments.
      - ALLOW_RESET=false  # Set to true only for development

      # ANONYMIZED_TELEMETRY: Controls anonymous usage data collection
      # - true:  Send anonymized usage statistics to ChromaDB developers
      # - false: Disable all telemetry (no data sent)
      #
      # Privacy consideration: Set to false if your organization has
      # strict data policies or if running in air-gapped environments.
      # Setting to true helps the ChromaDB project improve the software.
      - ANONYMIZED_TELEMETRY=true  # Set to false to disable telemetry
    restart: unless-stopped

volumes:
  chromadb-data:
    driver: local
```

**Development Configuration:**

For local development and testing, you can use more permissive settings:

```yaml
# docker-compose.dev.yml - FOR DEVELOPMENT ONLY
version: '3.8'

services:
  chromadb:
    image: chromadb/chroma:latest
    container_name: stratosort-chromadb-dev
    ports:
      - '8000:8000'
    volumes:
      - chromadb-data-dev:/chroma/chroma
    environment:
      - ALLOW_RESET=true   # Enables reset for testing
      - ANONYMIZED_TELEMETRY=false
    restart: unless-stopped

volumes:
  chromadb-data-dev:
    driver: local
```

Start with:

```bash
docker-compose up -d
```

### Persistent Storage

The `-v chromadb-data:/chroma/chroma` flag ensures your embeddings persist across container restarts.

To back up your data:

```bash
docker run --rm \
  -v chromadb-data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/chromadb-backup.tar.gz /data
```

## Troubleshooting

### Connection Refused

If you see `connect ECONNREFUSED`:

1. Check Docker container is running:

   ```bash
   docker ps | grep chromadb
   ```

2. Check ChromaDB logs:

   ```bash
   docker logs chromadb
   ```

3. Verify port is accessible:
   ```bash
   curl http://localhost:8000/api/v2/heartbeat
   ```

### Firewall Issues

If ChromaDB is on a remote host, ensure:

- Port 8000 is open in the firewall
- Docker is listening on all interfaces (not just 127.0.0.1)

Use this Docker run command for remote access:

```bash
docker run -d \
  --name chromadb \
  -p 0.0.0.0:8000:8000 \
  -v chromadb-data:/chroma/chroma \
  chromadb/chroma:latest
```

### Reset ChromaDB

To clear all collections and start fresh:

```bash
docker stop chromadb
docker rm chromadb
docker volume rm chromadb-data
# Then re-run the docker run command above
```

## Benefits of Docker ChromaDB

- **Isolation**: ChromaDB runs in its own container
- **No Python required**: StratoSort doesn't need Python installed
- **Easy updates**: `docker pull chromadb/chroma:latest`
- **Resource limits**: Use Docker to limit CPU/memory
- **Multiple instances**: Run multiple ChromaDB servers on different ports

## Production Deployment

For production, consider:

1. **Using a specific version** instead of `latest`:

   ```bash
   docker run -d chromadb/chroma:0.4.22
   ```

2. **Setting memory limits**:

   ```bash
   docker run -d --memory="2g" chromadb/chroma:latest
   ```

3. **Using authentication** (if available in your ChromaDB version):

   ```bash
   docker run -d \
     -e CHROMA_SERVER_AUTH_PROVIDER=token \
     -e CHROMA_SERVER_AUTH_TOKEN=your-secret-token \
     chromadb/chroma:latest
   ```

4. **Monitoring**:
   ```bash
   docker stats chromadb
   ```

## Switching Back to Local ChromaDB

To go back to letting StratoSort manage ChromaDB:

1. Stop Docker container:

   ```bash
   docker stop chromadb
   ```

2. Unset environment variable:

   ```bash
   unset CHROMA_SERVER_URL
   ```

3. Restart StratoSort:
   ```bash
   npm start
   ```

StratoSort will automatically start its own ChromaDB process if `CHROMA_SERVER_URL` is not set.
