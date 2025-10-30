# WorkCounter

A production-ready time tracking web application for contractors and freelancers, built with a modern tech stack and self-hosted authentication.

## Features

### Work Management
- Create, edit, and delete projects/works
- Organize by client, hourly rate, tags, and status
- Search and filter capabilities
- Archive completed projects

### Time Tracking
- Start/pause/resume timers with millisecond precision
- Multiple time sessions per work
- Visual session history
- Real-time elapsed time display
- One active timer at a time (prevents accidental double tracking)

### Timeline & Activity Logging
- Add timestamped notes during or after work sessions
- Categorize activities (Development, Design, Meeting, etc.)
- Complete timeline view per project
- Edit and manage timeline entries

### Reporting & Analytics
- Total time tracking per project
- Estimated earnings calculation based on hourly rates
- Session statistics and breakdowns
- Date range filtering

### Production Features
- Self-hosted authentication via Authentik (OAuth2/OIDC)
- PostgreSQL database with ACID compliance
- Session-based authentication with secure cookies
- Graceful shutdown handling
- Health check endpoints
- Docker-based deployment

## Tech Stack

- **Backend**: Node.js, TypeScript, Express
- **Frontend**: React, TypeScript, Vite, Tailwind CSS
- **Database**: PostgreSQL 16
- **Authentication**: Authentik (self-hosted OIDC)
- **Caching**: Redis
- **Deployment**: Docker Compose v2

## Prerequisites

- Docker and Docker Compose v2
- A VPS or server with reverse proxy configured
- Domain or subdomain for Authentik authentication

## Quick Start

### 1. Clone and Configure

```bash
git clone <repository-url>
cd WorkCounter
cp .env.example .env
```

### 2. Configure Environment Variables

Edit `.env` and set the following:

```bash
# Database
DB_USER=workcounter
DB_PASSWORD=<strong-password>

# Sessions (min 32 characters)
SESSION_SECRET=<generate-random-32-char-string>

# Authentik (min 50 characters)
AUTHENTIK_SECRET_KEY=<generate-random-50-char-string>

# Ports (adjust as needed for your reverse proxy)
FRONTEND_PORT=3000
BACKEND_PORT=3001
AUTHENTIK_PORT=9000

# URLs (adjust to match your domain/setup)
FRONTEND_URL=https://work.yourdomain.com
BACKEND_URL=https://api-work.yourdomain.com
AUTHENTIK_URL=https://auth.yourdomain.com
```

**Generate secure secrets:**
```bash
# For SESSION_SECRET (32+ chars)
openssl rand -hex 32

# For AUTHENTIK_SECRET_KEY (50+ chars)
openssl rand -hex 50
```

### 3. Configure Authentik

Before starting the stack, you need to configure Authentik OAuth application:

1. Start only the required services first:
```bash
docker compose up -d postgres redis authentik-server authentik-worker
```

2. Access Authentik at `http://localhost:9000` (or your configured domain)

3. Complete initial setup:
   - Create admin account
   - Login to admin panel

4. Create OAuth2/OIDC Provider:
   - Go to Applications → Providers
   - Click "Create"
   - Choose "OAuth2/OpenID Provider"
   - Name: `WorkCounter`
   - Authorization flow: `default-authentication-flow`
   - Client type: `Confidential`
   - Redirect URIs: `http://localhost:3001/api/auth/callback` (adjust for production)
   - Save and note the **Client ID** and **Client Secret**

5. Create Application:
   - Go to Applications → Applications
   - Click "Create"
   - Name: `WorkCounter`
   - Slug: `workcounter`
   - Provider: Select the provider you just created
   - Save

6. Update `.env` with Authentik credentials:
```bash
AUTHENTIK_CLIENT_ID=<client-id-from-step-4>
AUTHENTIK_CLIENT_SECRET=<client-secret-from-step-4>
```

### 4. Start All Services

```bash
docker compose down
docker compose up -d
```

### 5. Run Database Migrations

```bash
docker compose exec backend npm run db:migrate
```

### 6. Access the Application

- Frontend: `http://localhost:3000` (or your configured URL)
- Backend API: `http://localhost:3001`
- Authentik: `http://localhost:9000`

## Development

### Backend Development

```bash
cd backend
npm install
npm run dev
```

The backend runs on port 3001 with hot reload via `tsx watch`.

### Frontend Development

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on port 3000 with Vite's hot module replacement.

## Architecture

```
┌─────────────────────────────────────────┐
│         Docker Compose Stack            │
├─────────────────────────────────────────┤
│ authentik-server (OIDC provider)        │
│ authentik-worker (background tasks)     │
│ postgres (shared database)              │
│ redis (session storage)                 │
│ backend (Express API - port 3001)       │
│ frontend (React SPA - port 3000)        │
└─────────────────────────────────────────┘
```

### Database Schema

- **users**: User accounts linked to Authentik IDs
- **works**: Projects/tasks with metadata
- **time_sessions**: Time tracking sessions
- **timeline_entries**: Activity logs within sessions

## API Endpoints

### Authentication
- `GET /api/auth/login` - Get Authentik login URL
- `GET /api/auth/callback` - OAuth callback handler
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/me` - Get current user

### Works
- `GET /api/works` - List all works (with filters)
- `GET /api/works/:id` - Get work details
- `POST /api/works` - Create new work
- `PATCH /api/works/:id` - Update work
- `DELETE /api/works/:id` - Delete work

### Time Sessions
- `GET /api/sessions/running` - Get currently running session
- `GET /api/sessions/work/:workId` - Get sessions for a work
- `POST /api/sessions/start` - Start new session
- `POST /api/sessions/:id/stop` - Stop session
- `DELETE /api/sessions/:id` - Delete session

### Timeline
- `GET /api/timeline/work/:workId` - Get timeline entries
- `POST /api/timeline` - Create timeline entry
- `PATCH /api/timeline/:id` - Update entry
- `DELETE /api/timeline/:id` - Delete entry

### Statistics
- `GET /api/stats/overview` - Get overview stats
- `GET /api/stats/today` - Get today's stats

## Production Deployment

### Reverse Proxy Configuration

Configure your reverse proxy (nginx, Caddy, Traefik) to route:

- Frontend: `work.yourdomain.com` → `localhost:3000`
- Backend: `api-work.yourdomain.com` → `localhost:3001`
- Authentik: `auth.yourdomain.com` → `localhost:9000`

Example Nginx configuration:

```nginx
server {
    listen 443 ssl http2;
    server_name work.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

server {
    listen 443 ssl http2;
    server_name api-work.yourdomain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

server {
    listen 443 ssl http2;
    server_name auth.yourdomain.com;

    location / {
        proxy_pass http://localhost:9000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Security Considerations

1. Always use HTTPS in production
2. Set strong, unique secrets for `SESSION_SECRET` and `AUTHENTIK_SECRET_KEY`
3. Use strong database password
4. Configure firewall to only expose necessary ports
5. Regularly update Docker images
6. Enable Authentik's 2FA for admin accounts
7. Regular database backups

### Backups

PostgreSQL data is stored in Docker volumes. To backup:

```bash
docker compose exec postgres pg_dump -U workcounter workcounter > backup.sql
```

To restore:

```bash
cat backup.sql | docker compose exec -T postgres psql -U workcounter workcounter
```

## Troubleshooting

### Authentication Issues

1. Verify Authentik is running: `docker compose ps`
2. Check Authentik logs: `docker compose logs authentik-server`
3. Verify OAuth client ID and secret match in `.env`
4. Ensure redirect URIs match exactly in Authentik config

### Database Connection Issues

1. Check PostgreSQL is running: `docker compose ps postgres`
2. Verify connection settings in `.env`
3. Check logs: `docker compose logs backend`
4. Ensure migrations ran: `docker compose exec backend npm run db:migrate`

### Frontend Not Loading

1. Check frontend container: `docker compose ps frontend`
2. Verify API URL in build args (docker-compose.yml)
3. Check browser console for errors
4. Verify backend is accessible

## License

MIT

## Support

For issues and feature requests, please open an issue on the repository.
