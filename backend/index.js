import express from 'express';
import cors from 'cors';
import connectDB from './db.js';
import 'dotenv/config';
import authRoutes from './src/api/auth/auth.routes.js';
import cookieParser from 'cookie-parser';
import itineryRoutes from './src/api/itinery/itinery.routes.js';

const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors({
  origin: "*",
  credentials: true,
}));

app.use(express.json());
app.use(cookieParser());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/itinery', itineryRoutes);

app.get('/', (req, res) => {
  res.send('API is running...');
});

const PORT = process.env.PORT || 5000;

// Only start the server if we are not in a Vercel environment
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export default app;
