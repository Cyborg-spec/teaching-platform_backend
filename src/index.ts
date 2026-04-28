import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

// Routes
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import curriculumRoutes from './routes/curriculum';
import groupRoutes from './routes/groups';
import lessonRoutes from './routes/lessons';
import lessonLogRoutes from './routes/lessonLogs';
import quizRoutes from './routes/quizzes';
import taskSubmissionRoutes from './routes/taskSubmissions';
import coinRoutes from './routes/coins';
import catchupRoutes from './routes/catchup';
import aiPromptRoutes from './routes/aiPrompt';
import notificationRoutes from './routes/notifications';
import studentRoutes from './routes/student';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============= MIDDLEWARE =============

// Security
app.use(helmet());

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:4200',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' } },
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many authentication attempts' } },
});

app.use('/api/v1/auth', authLimiter);
app.use('/api/v1/', generalLimiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ============= ROUTES =============

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/curriculum', curriculumRoutes);
app.use('/api/v1/groups', groupRoutes);
app.use('/api/v1/lessons', lessonRoutes);
app.use('/api/v1/lesson-logs', lessonLogRoutes);
app.use('/api/v1/quizzes', quizRoutes);
app.use('/api/v1/task-submissions', taskSubmissionRoutes);
app.use('/api/v1/coins', coinRoutes);
app.use('/api/v1/catchup-meetings', catchupRoutes);
app.use('/api/v1/ai-prompt', aiPromptRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/student', studentRoutes);

// Health check
app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============= ERROR HANDLING =============

app.use(notFoundHandler);
app.use(errorHandler);

// ============= START =============

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📋 API Base: http://localhost:${PORT}/api/v1`);
  console.log(`🔥 Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
