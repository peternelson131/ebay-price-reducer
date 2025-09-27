# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Architecture

This is a full-stack application with a clear separation of concerns:

- **`backend/`** - Server-side application with structured directories:
  - `src/config/` - Application configuration
  - `src/database/` - Database connections and migrations
  - `src/jobs/` - Background job processing
  - `src/middleware/` - Express.js middleware functions
  - `src/models/` - Data models and schemas
  - `src/routes/` - API route definitions
  - `src/services/` - Business logic layer
  - `src/utils/` - Utility functions
  - `tests/` - Backend test files

- **`frontend/`** - Client-side application with React-like structure:
  - `public/` - Static assets
  - `src/components/` - Reusable UI components
  - `src/constants/` - Application constants
  - `src/hooks/` - Custom React hooks
  - `src/pages/` - Page components
  - `src/services/` - API client services
  - `src/store/` - State management
  - `src/utils/` - Frontend utility functions

- **`docs/`** - Project documentation

## Development Commands

Since package.json files are currently empty, common development commands will need to be configured. Typical commands for this structure would include:

### Backend
```bash
cd backend
npm install
npm run dev        # Start development server
npm run build      # Build for production
npm run test       # Run tests
npm run lint       # Lint code
```

### Frontend
```bash
cd frontend
npm install
npm run dev        # Start development server
npm run build      # Build for production
npm run test       # Run tests
npm run lint       # Lint code
```

### Docker
```bash
docker-compose up    # Start all services
docker-compose down  # Stop all services
```

## Development Notes

- Backend follows MVC pattern with services layer
- Frontend uses component-based architecture
- Tests are separated by domain (backend/frontend)
- Docker Compose is available for containerized development