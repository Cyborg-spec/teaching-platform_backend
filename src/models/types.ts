import { Timestamp } from 'firebase-admin/firestore';

// ==================== USER & AUTH ====================

export type UserRole = 'admin' | 'teacher' | 'student';

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  groupId: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  language: string;
  createdAt: Timestamp;
  lastLoginAt: Timestamp;
}

export interface CreateUserDTO {
  email: string;
  displayName: string;
  role: UserRole;
  groupId?: string | null;
  temporaryPassword: string;
  language?: string;
}

// ==================== GROUPS ====================

export interface Group {
  id: string;
  name: string;
  teacherId: string;
  studentIds: string[];
  monthIndex: number;
  createdAt: Timestamp;
  isActive: boolean;
  coinStoreItems: CoinStoreItem[];
}

export interface CreateGroupDTO {
  name: string;
  teacherId: string;
  studentIds?: string[];
}

// ==================== CURRICULUM ====================

export interface Curriculum {
  id: string;
  monthNumber: number;
  title: string;
  description: string;
  domain: string;
  lessonCount: number;
  lessons: Lesson[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}

export interface Lesson {
  id: string;
  lessonNumber: number;
  title: string;
  teacherPdfUrl: string | null;
  studentPdfUrl: string | null;
  homeworkPdfUrl: string | null;
}

// (Removed legacy blocks like TeachingBlock, EnergyReset, TaskDefinition)

// ==================== LESSON DOCUMENTS (top-level) ====================

export interface LessonDocument {
  id: string;
  monthId: string;
  groupId: string;
  lessonNumber: number;
  title: string;
  teacherPdfUrl: string | null;
  studentPdfUrl: string | null;
  homeworkPdfUrl: string | null;
  status: 'planned' | 'in_progress' | 'completed';
  scheduledDate: Timestamp | null;
  completedDate: Timestamp | null;
}

// ==================== LESSON LOGS ====================

export interface LessonLog {
  id: string;
  lessonId: string;
  groupId: string;
  teacherId: string;
  date: Timestamp;
  attendees: string[];
  absentees: string[];
  paceRating: 1 | 2 | 3;
  energyRating: 1 | 2 | 3;
  conceptsFullyUnderstood: string[];
  conceptsPartiallyUnderstood: string[];
  conceptsNotUnderstood: string[];
  topicsCovered: string[];
  topicsSkipped: string[];
  bufferUsed: boolean;
  energyResetUsed: boolean;
  energyResetType: string | null;
  studentNotes: StudentNote[];
  generalNotes: string;
  nextLessonAdjustments: string;
  quizResults: QuizResult[];
  catchupNeeded: string[];
  isDraft: boolean;
  createdAt: Timestamp;
}

export interface StudentNote {
  studentId: string;
  understanding: 'strong' | 'adequate' | 'struggling';
  engagement: 'high' | 'medium' | 'low';
  note: string;
}

export interface QuizResult {
  studentId: string;
  questionId: string;
  wasCorrect: boolean;
}

// ==================== QUIZZES ====================

export interface Quiz {
  id: string;
  lessonId: string;
  groupId: string;
  title: string;
  questions: QuizQuestion[];
  createdBy: string;
  createdAt: Timestamp;
  isActive: boolean;
  opensAt: Timestamp | null;
  closesAt: Timestamp | null;
  showOneAtATime: boolean;
  timeLimitMinutes: number | null;
  coinsPerCorrect: number;
  perfectScoreBonus: number;
}

export interface QuizQuestion {
  id: string;
  text: string;
  type: 'multiple_choice' | 'true_false' | 'short_answer';
  options: string[];
  correctAnswer: string;
  points: number;
  explanation: string | null;
}

export interface QuizResponse {
  id: string;
  quizId: string;
  studentId: string;
  groupId: string;
  answers: QuizAnswer[];
  score: number;
  totalPoints: number;
  percentage: number;
  completedAt: Timestamp;
  timeSpent: number;
}

export interface QuizAnswer {
  questionId: string;
  selectedAnswer: string;
  isCorrect: boolean;
  pointsAwarded: number;
}

// ==================== TASKS & SUBMISSIONS ====================

export interface Task {
  id: string;
  lessonId: string;
  groupId: string;
  title: string;
  pdfUrl: string | null;
  dueDate: Timestamp | null;
  isFinishAtHome: boolean;
}

export interface TaskSubmission {
  id: string;
  taskId: string;
  studentId: string;
  groupId: string;
  lessonId: string;
  code: string;
  notes: string;
  fileUrls: string[];
  status: 'submitted' | 'reviewed' | 'needs_revision';
  teacherFeedback: string | null;
  coinsAwarded: number;
  submittedAt: Timestamp;
  reviewedAt: Timestamp | null;
}

// ==================== COINS ====================

export interface CoinAccount {
  studentId: string;
  groupId: string;
  totalCoins: number;
  weeklyCoins: number;
  monthlyCoins: number;
  allTimeCoins: number;
  transactions: CoinTransaction[];
}

export interface CoinTransaction {
  id: string;
  amount: number;
  reason: string;
  sourceType: 'task' | 'quiz' | 'attendance' | 'blooket' | 'helpfulness' | 'catchup' | 'purchase' | 'admin' | 'other';
  sourceId: string | null;
  awardedBy: string;
  timestamp: Timestamp;
}

export interface CoinStoreItem {
  id: string;
  name: string;
  description: string;
  cost: number;
  category: 'digital' | 'physical' | 'privilege';
  isAvailable: boolean;
  unlocksAtMonth: number;
  icon: string;
}

export interface CoinStorePurchase {
  id: string;
  studentId: string;
  groupId: string;
  itemId: string;
  itemName: string;
  cost: number;
  status: 'pending' | 'fulfilled' | 'rejected';
  teacherNote: string | null;
  purchasedAt: Timestamp;
  fulfilledAt: Timestamp | null;
}

// ==================== CATCH-UP MEETINGS ====================

export interface CatchupMeeting {
  id: string;
  studentId: string;
  groupId: string;
  teacherId: string;
  scheduledAt: Timestamp;
  completedAt: Timestamp | null;
  topicsCovered: string[];
  notes: string;
  analogiesUsed: string[];
  coinsAwarded: number;
  status: 'scheduled' | 'completed' | 'cancelled';
  outcome: string;
}

// ==================== AI PROMPTS ====================

export interface AIPrompt {
  id: string;
  groupId: string;
  lessonLogId: string;
  nextLessonId: string;
  generatedPrompt: string;
  generatedAt: Timestamp;
  generatedBy: string;
  usageNotes: string | null;
  aiResponse: string | null;
}

// ==================== NOTIFICATIONS ====================

export interface Notification {
  id: string;
  userId: string;
  type: 'quiz_available' | 'task_reviewed' | 'purchase_fulfilled' | 'purchase_rejected' | 'catchup_scheduled' | 'catchup_flagged' | 'new_submission' | 'system';
  title: string;
  message: string;
  read: boolean;
  actionUrl: string | null;
  createdAt: Timestamp;
}

// ==================== PLATFORM SETTINGS ====================

export interface PlatformSettings {
  coinDefaults: {
    taskCompleted: number;
    quizCorrectAnswer: number;
    quizPerfectScore: number;
    lessonAttendance: number;
    blooketWin: number;
    helpingClassmate: number;
    goodQuestion: number;
    catchupAttended: number;
    onTimeSubmission: number;
  };
  platformName: string;
  aiProvider: 'anthropic' | 'openai' | 'none';
}

// ==================== REQUEST EXTENSIONS ====================

export interface AuthenticatedRequest {
  user: {
    uid: string;
    email: string;
    role: UserRole;
    groupId: string | null;
  };
}
