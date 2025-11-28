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
app.use(cors());
app.use(express.json());
app.use(cookieParser());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/itinery', itineryRoutes);

app.get('/', (req, res) => {
  res.send('API is running...');
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
