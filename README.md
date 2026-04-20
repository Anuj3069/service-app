# Service Booking Platform (Backend)

A production-ready REST API for a Service Booking Platform (MVP). It supports customer registrations, worker matching, service browsing, and booking flows. Built using **Node.js, Express, and MongoDB**.

## 🚀 Features

- **Authentication System:** JWT-based robust authentication (Access + Refresh tokens) for customers and providers.
- **Service Catalog:** Discover services and categories.
- **Worker Matching Engine:** Real-time worker availability matching algorithms.
- **Booking Management:** Create, track, and expire bookings seamlessly.
- **Review System:** Rate and review workers for completed jobs.
- **Architecture:** Controller-Service-Repository architecture pattern.
- **Security:** Helmet, CORS, Data Sanitization, Request Validation (Joi).
- **Quality:** Extensively tested with `Jest` and `Supertest`. Includes custom error handling and structured logging (`Winston`).

---

## 🛠️ Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** MongoDB (with Mongoose)
- **Validation:** Joi
- **Testing:** Jest + SuperTest + MongoDB Memory Server
- **Security & Utilities:** BcryptJS, JSONWebToken, Helmet, Cors, Winston for Logging.

---

## 💻 Getting Started

### Prerequisites
- Node.js (v18 or higher recommended)
- MongoDB instance (Local or Atlas)

### 1. Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/Anuj3069/service-app.git
cd service-app
npm install
```

### 2. Environment Variables

Create a `.env` file in the root directory. You can use `.env.example` as a template:

```bash
cp .env.example .env
```

Ensure the following variables are correctly configured:

```env
# Application
NODE_ENV=development
PORT=3000

# MongoDB
MONGODB_URI=mongodb://localhost:27017/service-booking-dev

# JWT Configuration
JWT_SECRET=your-super-secret-key-change-in-production
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=your-refresh-secret-key-change-in-production
JWT_REFRESH_EXPIRES_IN=7d

# Booking Flow
BOOKING_EXPIRY_MINUTES=2

# Logging
LOG_LEVEL=debug
```

### 3. Database Seeding

To quickly populate your local database with base services and dummy providers:

```bash
# Seed all data
npm run seed

# Or run individual seeders
npm run seed:services
npm run seed:providers
```

### 4. Running the App

```bash
# Development mode (with Nodemon)
npm run dev

# Production mode
npm start
```

---

## 🧪 Testing

The platform is covered by integration and unit tests.

```bash
# Run tests
npm test

# Run tests with coverage report
npm run test:coverage

# Watch mode
npm run test:watch
```

---

## 📂 Project Structure

```text
src/
├── app.js                 # Express app setup and middleware routing
├── config/                # Environment variables, logger, database setup
├── modules/               # Domain-driven modules (Auth, Booking, Match, Provider, Review, Service)
│   ├── [module]/
│   │   ├── *.controller.js # Endpoint handlers processing HTTP requests
│   │   ├── *.service.js    # Core business logic
│   │   ├── *.repository.js # Database interactions
│   │   ├── *.model.js      # Mongoose Schemas
│   │   ├── *.routes.js     # Express routers
│   │   └── *.validation.js # Joi schemas
├── seeds/                 # DB Seeding scripts
└── shared/                # Code shared globally
    ├── middleware/        # auth, error handler, validation middlewares
    └── utils/             # api-response formatters, constants, errors
tests/                     # Integration and Unit tests
```

---

## 📝 License

ISC License