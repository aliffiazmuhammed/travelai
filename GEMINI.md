# GEMINI Code Assistant Context

## Project Overview

This is a full-stack web application with a React frontend and a Node.js/Express backend. The project is structured as a monorepo with two main directories: `frontend` and `backend`.

**Frontend:**

The frontend is a modern web application built with the following technologies:

*   **Framework:** React
*   **Build Tool:** Vite
*   **Language:** TypeScript
*   **UI Components:** shadcn-ui
*   **Styling:** Tailwind CSS

**Backend:**

The backend is a RESTful API server built with:

*   **Runtime:** Node.js
*   **Framework:** Express
*   **Database:** MongoDB with Mongoose for object data modeling

## Building and Running

### Frontend

To run the frontend development server:

```sh
cd frontend
npm install
npm run dev
```

To build the frontend for production:

```sh
cd frontend
npm run build
```

### Backend

To run the backend server:

1.  Create a `.env` file in the `backend` directory and add your MongoDB connection string:

    ```
    MONGODB_URI=your_mongodb_uri_here
    ```

2.  Run the server:

    ```sh
    cd backend
    npm install
    npm start
    ```

## Development Conventions

*   **Path Aliases:** The frontend uses the `@` alias for the `src` directory. This is configured in both `tsconfig.json` and `vite.config.ts`.
*   **Code Style:** The project uses ESLint for linting. You can run `npm run lint` in the `frontend` directory to check for code style issues.
*   **API Communication:** The frontend is expected to communicate with the backend API, which runs on a different port. The backend uses the `cors` middleware to allow cross-origin requests.
