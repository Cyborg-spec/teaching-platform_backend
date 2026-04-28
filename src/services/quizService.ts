import { db } from '../config/firebase';
import { Quiz, QuizResponse, QuizAnswer } from '../models/types';
import { AppError } from '../utils/appError';
import { docsToObjects, now } from '../utils/firestoreHelpers';
import { coinService } from '../services/coinService';
import { notificationService } from '../services/notificationService';

export class QuizService {
  private quizzesCollection = db.collection('quizzes');
  private responsesCollection = db.collection('quiz_responses');

  /**
   * Create a quiz
   */
  async create(data: Omit<Quiz, 'id' | 'createdAt'>): Promise<Quiz> {
    const quizData = {
      ...data,
      createdAt: now(),
    };

    const docRef = await this.quizzesCollection.add(quizData);
    return { id: docRef.id, ...quizData } as Quiz;
  }

  /**
   * Update a quiz
   */
  async update(quizId: string, data: Partial<Quiz>): Promise<void> {
    const doc = await this.quizzesCollection.doc(quizId).get();
    if (!doc.exists) throw AppError.notFound('Quiz', quizId);
    await this.quizzesCollection.doc(quizId).update(data);
  }

  /**
   * Get a quiz by ID
   */
  async getById(quizId: string): Promise<Quiz> {
    const doc = await this.quizzesCollection.doc(quizId).get();
    if (!doc.exists) throw AppError.notFound('Quiz', quizId);
    return { id: doc.id, ...doc.data() } as Quiz;
  }

  /**
   * Get quizzes for a group
   */
  async getForGroup(groupId: string): Promise<Quiz[]> {
    const snapshot = await this.quizzesCollection
      .where('groupId', '==', groupId)
      .orderBy('createdAt', 'desc')
      .get();
    return docsToObjects<Quiz>(snapshot);
  }

  /**
   * Open a quiz for students
   */
  async open(quizId: string): Promise<void> {
    const quiz = await this.getById(quizId);

    // Notify students
    const groupDoc = await db.collection('groups').doc(quiz.groupId).get();
    if (groupDoc.exists) {
      const studentIds = groupDoc.data()?.studentIds || [];
      await notificationService.notifyQuizAvailable(studentIds, quiz.title, quiz.groupId);
    }

    await this.quizzesCollection.doc(quizId).update({
      isActive: true,
      opensAt: now(),
    });
  }

  /**
   * Close a quiz
   */
  async close(quizId: string): Promise<void> {
    await this.quizzesCollection.doc(quizId).update({
      isActive: false,
      closesAt: now(),
    });
  }

  /**
   * Submit quiz answers (student)
   */
  async submitAnswers(
    quizId: string,
    studentId: string,
    groupId: string,
    answers: { questionId: string; selectedAnswer: string }[],
    timeSpent: number
  ): Promise<QuizResponse> {
    const quiz = await this.getById(quizId);

    if (!quiz.isActive) {
      throw AppError.badRequest('QUIZ_NOT_ACTIVE', 'This quiz is no longer accepting responses');
    }

    // Check if student already submitted
    const existingResponse = await this.responsesCollection
      .where('quizId', '==', quizId)
      .where('studentId', '==', studentId)
      .limit(1)
      .get();

    if (!existingResponse.empty) {
      throw AppError.conflict('ALREADY_SUBMITTED', 'You have already submitted answers for this quiz');
    }

    // Grade answers
    const gradedAnswers: QuizAnswer[] = answers.map((answer) => {
      const question = quiz.questions.find((q) => q.id === answer.questionId);
      if (!question) return {
        questionId: answer.questionId,
        selectedAnswer: answer.selectedAnswer,
        isCorrect: false,
        pointsAwarded: 0,
      };

      const isCorrect = question.correctAnswer.toLowerCase().trim() === answer.selectedAnswer.toLowerCase().trim();
      return {
        questionId: answer.questionId,
        selectedAnswer: answer.selectedAnswer,
        isCorrect,
        pointsAwarded: isCorrect ? question.points : 0,
      };
    });

    const score = gradedAnswers.reduce((sum, a) => sum + a.pointsAwarded, 0);
    const totalPoints = quiz.questions.reduce((sum, q) => sum + q.points, 0);
    const percentage = totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0;

    const responseData: Omit<QuizResponse, 'id'> = {
      quizId,
      studentId,
      groupId,
      answers: gradedAnswers,
      score,
      totalPoints,
      percentage,
      completedAt: now(),
      timeSpent,
    };

    const docRef = await this.responsesCollection.add(responseData);

    // Award coins
    const correctCount = gradedAnswers.filter((a) => a.isCorrect).length;
    const coinsPerCorrect = quiz.coinsPerCorrect || 5;
    const perfectBonus = quiz.perfectScoreBonus || 20;
    let totalCoins = correctCount * coinsPerCorrect;
    if (percentage === 100) totalCoins += perfectBonus;

    if (totalCoins > 0) {
      await coinService.awardCoins(
        studentId,
        groupId,
        totalCoins,
        percentage === 100 ? `Quiz "${quiz.title}" - Perfect Score!` : `Quiz "${quiz.title}" - ${correctCount} correct`,
        'quiz',
        quizId,
        'system'
      );
    }

    return { id: docRef.id, ...responseData } as QuizResponse;
  }

  /**
   * Get results for a quiz (teacher view)
   */
  async getResults(quizId: string): Promise<{
    quiz: Quiz;
    responses: QuizResponse[];
    summary: {
      totalStudents: number;
      averageScore: number;
      averagePercentage: number;
      questionBreakdown: { questionId: string; correctCount: number; incorrectCount: number }[];
    };
  }> {
    const quiz = await this.getById(quizId);
    const snapshot = await this.responsesCollection
      .where('quizId', '==', quizId)
      .get();
    const responses = docsToObjects<QuizResponse>(snapshot);

    // Calculate summary
    const totalStudents = responses.length;
    const averageScore = totalStudents > 0
      ? responses.reduce((sum, r) => sum + r.score, 0) / totalStudents
      : 0;
    const averagePercentage = totalStudents > 0
      ? responses.reduce((sum, r) => sum + r.percentage, 0) / totalStudents
      : 0;

    const questionBreakdown = quiz.questions.map((q) => {
      const answersForQ = responses.flatMap((r) => r.answers.filter((a) => a.questionId === q.id));
      return {
        questionId: q.id,
        correctCount: answersForQ.filter((a) => a.isCorrect).length,
        incorrectCount: answersForQ.filter((a) => !a.isCorrect).length,
      };
    });

    return { quiz, responses, summary: { totalStudents, averageScore, averagePercentage, questionBreakdown } };
  }

  /**
   * Get student's own result
   */
  async getStudentResult(quizId: string, studentId: string): Promise<QuizResponse | null> {
    const snapshot = await this.responsesCollection
      .where('quizId', '==', quizId)
      .where('studentId', '==', studentId)
      .limit(1)
      .get();

    if (snapshot.empty) return null;
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as QuizResponse;
  }
}

export const quizService = new QuizService();
