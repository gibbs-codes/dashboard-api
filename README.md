# Dashboard API

A comprehensive Node.js backend API that aggregates data from multiple sources (CTA Transit, OpenWeatherMap, and Lifestack) to power a personal dashboard application. Built with Express.js, WebSocket support for real-time updates, and intelligent caching.

## Features

- **Multi-Source Data Aggregation**: Combines transit, weather, calendar, and task data
- **Real-Time Updates**: WebSocket server broadcasts data every 30 seconds
- **Intelligent Caching**: Service-level caching (30s for transit, 10min for weather)
- **Mode-Based Profiles**: Filter dashboard data by mode (personal, guest, transit, morning, work)
- **Graceful Error Handling**: Partial failures don't break the entire dashboard
- **Health Monitoring**: Detailed status endpoint for operational visibility

## Table of Contents

- [Installation](#installation)
- [Environment Setup](#environment-setup)
- [API Documentation](#api-documentation)
- [WebSocket Events](#websocket-events)
- [Dashboard Modes](#dashboard-modes)
- [Development](#development)
- [Deployment](#deployment)
- [Testing](#testing)
- [Architecture](#architecture)

## Installation

### Prerequisites

- Node.js 16.x or higher
- npm or yarn
- Active API keys for:
  - CTA Bus Tracker API
  - CTA Train Tracker API
  - OpenWeatherMap API
- Lifestack API running (for calendar/tasks)

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/gibbs-codes/dashboard-api.git
   cd dashboard-api
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys and configuration
   ```

4. **Start the server**
   ```bash
   # Development mode with auto-reload
   npm run dev

   # Production mode
   npm start
   ```

The server will start on `http://localhost:3001` (or your configured PORT).

## Environment Setup

Create a `.env` file in the project root with the following variables:

```bash
# Server Configuration
PORT=3001
NODE_ENV=development

# Cache Configuration
CACHE_TTL=300

# Timezone
TIMEZONE=America/New_York

# CORS Configuration
CORS_ORIGIN=http://localhost:3000

# CTA API Keys (get from https://www.transitchicago.com/developers/)
CTA_BUS_API_KEY=your_cta_bus_api_key_here
CTA_TRAIN_API_KEY=your_cta_train_api_key_here

# OpenWeatherMap API (get from https://openweathermap.org/api)
OPENWEATHER_API_KEY=your_openweathermap_api_key_here
WEATHER_LAT=41.8781  # Chicago coordinates
WEATHER_LON=-87.6298

# Lifestack API
LIFESTACK_URL=http://localhost:3000
```

### Getting API Keys

1. **CTA API Keys**: Register at [CTA Developers](https://www.transitchicago.com/developers/)
2. **OpenWeatherMap**: Sign up at [OpenWeatherMap](https://openweathermap.org/api)
3. **Lifestack**: Run the Lifestack API locally or point to your deployment

## API Documentation

Base URL: `http://localhost:3001/api`

### Health & Status

#### `GET /health`
Basic health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "uptime": 123.45
}
```

#### `GET /status`
Detailed server status including WebSocket connections, cache stats, and service health.

**Response:**
```json
{
  "success": true,
  "data": {
    "server": {
      "status": "healthy",
      "uptime": 123.45,
      "environment": "development",
      "timestamp": "2025-01-15T10:30:00.000Z"
    },
    "websocket": {
      "activeConnections": 3,
      "enabled": true
    },
    "scheduler": {
      "isRunning": true,
      "schedule": "*/30 * * * * *",
      "lastRefreshTime": "2025-01-15T10:29:30.000Z",
      "refreshCount": 245,
      "errorCount": 0
    },
    "cache": {
      "keys": 8,
      "hits": 1234,
      "misses": 56,
      "hitRate": "95.66%"
    },
    "profile": {
      "currentMode": "personal",
      "modeName": "Personal",
      "lastChanged": "2025-01-15T08:00:00.000Z"
    },
    "services": {
      "lifestack": {
        "status": "healthy",
        "url": "http://localhost:3000"
      },
      "transit": {
        "status": "operational",
        "cacheEnabled": true,
        "cacheTTL": 30
      },
      "weather": {
        "status": "operational",
        "cacheEnabled": true,
        "cacheTTL": 600
      }
    }
  }
}
```

### Dashboard

#### `GET /api/dashboard`
Get aggregated dashboard data for current mode.

**Response:**
```json
{
  "success": true,
  "data": {
    "mode": "personal",
    "weather": {
      "temp": 45,
      "condition": "Cloudy",
      "feelsLike": 42,
      "humidity": 65,
      "high": 48,
      "low": 40,
      "icon": "04d"
    },
    "transit": {
      "buses": {
        "east": [
          { "minutesAway": 3, "destination": "Illinois Center" },
          { "minutesAway": 15, "destination": "Illinois Center" }
        ],
        "west": [
          { "minutesAway": 5, "destination": "Pulaski" }
        ]
      },
      "red": {
        "north": [
          { "minutesAway": 2, "destination": "Howard" }
        ]
      },
      "brown": {
        "north": [
          { "minutesAway": 4, "destination": "Kimball" }
        ]
      }
    },
    "events": [...],
    "tasks": [...],
    "nextEvent": {...},
    "timestamp": "2025-01-15T10:30:00.000Z"
  }
}
```

#### `GET /api/dashboard/data?mode=guest`
Get dashboard data for specific mode (overrides current mode).

**Query Parameters:**
- `mode` (optional): One of `personal`, `guest`, `transit`, `morning`, `work`

#### `GET /api/dashboard/refresh`
Force immediate refresh of dashboard data.

#### `POST /api/dashboard/mode`
Change the current dashboard mode.

**Request Body:**
```json
{
  "mode": "guest"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "mode": "guest",
    "previousMode": "personal",
    "lastChanged": "2025-01-15T10:30:00.000Z",
    "message": "Mode changed to guest"
  }
}
```

#### `GET /api/dashboard/modes`
Get list of all available dashboard modes.

### Profile

#### `GET /api/profile`
Get current profile information.

**Response:**
```json
{
  "success": true,
  "data": {
    "mode": "personal",
    "name": "Personal",
    "description": "Full dashboard with calendar, tasks, weather, and transit",
    "includes": {
      "weather": true,
      "transit": true,
      "calendar": true,
      "tasks": true,
      "nextEvent": true
    },
    "lastChanged": "2025-01-15T08:00:00.000Z"
  }
}
```

#### `POST /api/profile`
Change profile mode.

**Request Body:**
```json
{
  "mode": "morning"
}
```

#### `GET /api/profile/history`
Get mode change history (last 10 changes).

#### `POST /api/profile/reset`
Reset profile to default mode (personal).

### Transit

#### `GET /api/transit/all`
Get all transit data (buses and trains).

#### `GET /api/transit/buses`
Get Route 77 bus predictions (eastbound and westbound).

#### `GET /api/transit/trains`
Get Red Line and Brown Line train predictions.

### Weather

#### `GET /api/weather/current`
Get current weather data.

**Response:**
```json
{
  "success": true,
  "data": {
    "temp": 45,
    "condition": "Cloudy",
    "feelsLike": 42,
    "humidity": 65,
    "high": 48,
    "low": 40,
    "icon": "04d",
    "description": "overcast clouds",
    "windSpeed": 12,
    "lastUpdated": "2025-01-15T10:30:00.000Z"
  }
}
```

#### `GET /api/weather/forecast`
Get 5-day weather forecast.

### Calendar

#### `GET /api/calendar/today`
Get today's calendar events from Lifestack.

#### `GET /api/calendar/next`
Get the next upcoming event.

### Tasks

#### `GET /api/tasks/all`
Get all tasks from Lifestack.

#### `GET /api/tasks/urgent`
Get urgent tasks (due within 24 hours or overdue).

## WebSocket Events

Connect to WebSocket server at `ws://localhost:3001`

### Server → Client Events

All events follow this format:
```json
{
  "event": "event_name",
  "data": {...},
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

#### `connection`
Sent when client first connects.

**Data:**
```json
{
  "message": "Connected to Dashboard API WebSocket",
  "clientId": 1
}
```

#### `dashboard:update`
Broadcasted every 30 seconds with latest dashboard data.

**Data:** Same as `/api/dashboard` response

#### `profile:changed`
Sent when dashboard mode changes.

**Data:**
```json
{
  "mode": "guest",
  "name": "Guest",
  "description": "Public information only - weather and transit",
  "includes": {...},
  "lastChanged": "2025-01-15T10:30:00.000Z"
}
```

#### `pong`
Response to `ping` command.

**Data:**
```json
{
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

#### `error`
Sent when client command fails.

**Data:**
```json
{
  "message": "Error description",
  "command": "setMode"
}
```

### Client → Server Commands

Send commands as JSON:

#### `setMode`
Change dashboard mode.

```json
{
  "command": "setMode",
  "payload": {
    "mode": "guest"
  }
}
```

#### `refresh`
Request immediate dashboard refresh.

```json
{
  "command": "refresh"
}
```

#### `ping`
Ping server (get pong response).

```json
{
  "command": "ping"
}
```

### Automatic Features

- **Ping/Pong Keepalive**: Server pings every 15 seconds
- **Dashboard Updates**: Automatic broadcasts every 30 seconds
- **Reconnection**: Clients should implement reconnection logic

## Dashboard Modes

The API supports 5 different dashboard modes:

| Mode | Description | Includes |
|------|-------------|----------|
| **personal** | Full dashboard with all data | Weather, Transit, Calendar, Tasks, Next Event |
| **guest** | Public information only | Weather, Transit |
| **transit** | Transit information only | Transit |
| **morning** | Morning briefing | Weather, Transit, Next Event, Urgent Tasks |
| **work** | Work focus | Calendar, Tasks, Next Event |

## Development

### Project Structure

```
dashboard-api/
├── config/              # Configuration files
│   ├── ctaStops.js      # CTA stop IDs
│   └── modes.js         # Dashboard mode definitions
├── src/
│   ├── aggregators/     # Data aggregation logic
│   │   └── dashboardAggregator.js
│   ├── cache/           # Cache implementations
│   ├── middleware/      # Express middleware
│   │   ├── errorHandler.js
│   │   └── requestLogger.js
│   ├── routes/          # API route handlers
│   │   ├── calendar.js
│   │   ├── dashboard.js
│   │   ├── profile.js
│   │   ├── tasks.js
│   │   ├── transit.js
│   │   └── weather.js
│   ├── scheduler/       # Scheduled jobs
│   │   └── refreshScheduler.js
│   ├── services/        # External API clients
│   │   ├── lifestackClient.js
│   │   ├── transitService.js
│   │   └── weatherService.js
│   ├── utils/           # Utility modules
│   │   ├── cacheManager.js
│   │   ├── logger.js
│   │   └── modeManager.js
│   └── websocket/       # WebSocket handling
│       └── wsHandler.js
├── server.js            # Main entry point
├── package.json
└── .env
```

### Scripts

```bash
# Development with auto-reload
npm run dev

# Production
npm start

# Run tests (when implemented)
npm test
```

### Adding New Features

1. **New API Endpoint**: Create route in `src/routes/`
2. **New External Service**: Create client in `src/services/`
3. **New Dashboard Mode**: Add to `config/modes.js`
4. **New Data Source**: Update `dashboardAggregator.js`

### Code Style

- ES6+ JavaScript (CommonJS modules)
- Async/await for asynchronous operations
- Consistent error handling with try/catch
- Logging for all major operations

## Deployment

### Environment Variables

Ensure all required environment variables are set in production:
- Set `NODE_ENV=production`
- Use production URLs for `LIFESTACK_URL` and `CORS_ORIGIN`
- Keep API keys secure (use secrets management)

### Process Management

Use PM2 or similar for production:

```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start server.js --name dashboard-api

# Save PM2 config
pm2 save

# Setup PM2 startup
pm2 startup
```

### Reverse Proxy

Use nginx or similar for:
- SSL/TLS termination
- Load balancing
- Rate limiting

Example nginx config:
```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Docker

Create `Dockerfile`:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["node", "server.js"]
```

Build and run:
```bash
docker build -t dashboard-api .
docker run -p 3001:3001 --env-file .env dashboard-api
```

## Testing

### Automated Test Suite

The project includes a comprehensive test script that validates all endpoints:

```bash
# Run the test suite
./test.sh
```

The test script will:
- ✓ Check if server is running
- ✓ Test all REST endpoints (health, status, dashboard, profile, transit, weather, calendar, tasks)
- ✓ Validate response formats match the API documentation
- ✓ Test request validation (invalid modes, missing parameters)
- ✓ Test WebSocket connection
- ✓ Provide detailed pass/fail output for each test

**Prerequisites:**
- Server must be running: `npm run dev`
- Optional: Install `jq` for JSON validation: `brew install jq` (macOS) or `apt-get install jq` (Linux)
- Optional: Install `websocat` for WebSocket testing: `brew install websocat` (macOS)

**Example Output:**
```
━━━ Health & Status Endpoints ━━━
✓ PASS - GET /health
✓ PASS - GET /status

━━━ Dashboard Endpoints ━━━
✓ PASS - GET /api/dashboard
✓ PASS - GET /api/dashboard/data
✓ PASS - POST /api/dashboard/mode

Test Summary:
  Total Tests:  28
  Passed:       28
  Failed:       0

✓ All tests passed!
```

### Manual Testing

**Quick Health Check:**
```bash
curl http://localhost:3001/health
```

**Test Dashboard Endpoint:**
```bash
curl http://localhost:3001/api/dashboard
```

**Change Mode:**
```bash
curl -X POST http://localhost:3001/api/profile \
  -H "Content-Type: application/json" \
  -d '{"mode":"guest"}'
```

### WebSocket Testing

**Using websocat:**
```bash
# Install websocat
brew install websocat  # macOS
# or cargo install websocat

# Connect to WebSocket
websocat ws://localhost:3001

# Send ping command
{"command": "ping"}

# Change mode
{"command": "setMode", "payload": {"mode": "guest"}}

# Request refresh
{"command": "refresh"}
```

**Using browser DevTools:**
```javascript
// Open browser console and connect
const ws = new WebSocket('ws://localhost:3001');

ws.onmessage = (event) => {
  console.log('Received:', JSON.parse(event.data));
};

// Send commands
ws.send(JSON.stringify({command: 'ping'}));
ws.send(JSON.stringify({command: 'setMode', payload: {mode: 'guest'}}));
```

### Integration Testing

Test with actual API keys to verify:
- ✓ CTA transit data retrieval
- ✓ Weather data retrieval
- ✓ Lifestack integration
- ✓ Cache behavior (hit/miss rates)
- ✓ WebSocket broadcasts every 30 seconds
- ✓ Error handling with invalid API keys
- ✓ Graceful degradation when services fail

### Unit Testing (Future)

Recommended frameworks:
- Jest for unit tests
- Supertest for API testing
- ws for WebSocket testing

## Architecture

### Data Flow

1. **HTTP Request** → Express Router → Service → External API → Cache → Response
2. **WebSocket Connection** → wsHandler → Initial Data → Periodic Updates
3. **Scheduler** → Dashboard Aggregator → Services → Broadcast via WebSocket

### Caching Strategy

- **Transit Data**: 30-second TTL (frequent updates needed)
- **Weather Data**: 10-minute TTL (less frequent changes)
- **Lifestack Data**: No caching (handled by Lifestack)

### Error Handling

- Service-level failures return fallback data
- Dashboard aggregator handles partial failures
- WebSocket errors logged but don't crash server
- Scheduler errors logged and retry on next interval

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

ISC

## Support

For issues, questions, or contributions:
- GitHub Issues: [https://github.com/gibbs-codes/dashboard-api/issues](https://github.com/gibbs-codes/dashboard-api/issues)
- Documentation: See this README

## Acknowledgments

- CTA for transit data API
- OpenWeatherMap for weather data API
- Express.js and ws for server infrastructure
