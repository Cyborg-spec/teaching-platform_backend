import { Request, Response, NextFunction } from 'express';
import { userService } from '../services/userService';
import { groupService } from '../services/groupService';
import { AuthenticatedRequest } from '../models/types';
import { AppError } from '../utils/appError';
import { db } from '../config/firebase';
import { coinService } from '../services/coinService';

export class AdminController {
  // ============= USERS =============

  async getUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { role, groupId, isActive, search } = req.query;
      const users = await userService.getAll({
        role: role as any,
        groupId: groupId as string,
        isActive: isActive !== undefined ? isActive === 'true' : undefined,
        search: search as string,
      });
      res.json({ data: users });
    } catch (error) {
      next(error);
    }
  }

  async getUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await userService.getById(req.params.userId);
      res.json({ data: user });
    } catch (error) {
      next(error);
    }
  }

  async updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await userService.update(req.params.userId, req.body);
      res.json({ message: 'User updated successfully' });
    } catch (error) {
      next(error);
    }
  }

  async deactivateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await userService.deactivate(req.params.userId);
      res.json({ message: 'User deactivated successfully' });
    } catch (error) {
      next(error);
    }
  }

  async deleteUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await userService.delete(req.params.userId);
      res.json({ message: 'User deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  async reactivateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await userService.reactivate(req.params.userId);
      res.json({ message: 'User reactivated successfully' });
    } catch (error) {
      next(error);
    }
  }

  async bulkDeactivate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await userService.bulkDeactivate(req.body.userIds);
      res.json({ message: `${req.body.userIds.length} users deactivated` });
    } catch (error) {
      next(error);
    }
  }

  async bulkMoveGroup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await userService.bulkMoveToGroup(req.body.userIds, req.body.groupId);
      res.json({ message: `${req.body.userIds.length} users moved to group` });
    } catch (error) {
      next(error);
    }
  }

  // ============= GROUPS =============

  async getGroups(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { isActive, teacherId } = req.query;
      const groups = await groupService.getAll({
        isActive: isActive !== undefined ? isActive === 'true' : undefined,
        teacherId: teacherId as string,
      });
      res.json({ data: groups });
    } catch (error) {
      next(error);
    }
  }

  async getGroup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const group = await groupService.getById(req.params.groupId);
      const students = await groupService.getStudents(req.params.groupId);
      res.json({ data: { ...group, students } });
    } catch (error) {
      next(error);
    }
  }

  async createGroup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const group = await groupService.create(req.body);
      res.status(201).json({ data: group, message: 'Group created successfully' });
    } catch (error) {
      next(error);
    }
  }

  async updateGroup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await groupService.update(req.params.groupId, req.body);
      res.json({ message: 'Group updated successfully' });
    } catch (error) {
      next(error);
    }
  }

  async archiveGroup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await groupService.archive(req.params.groupId);
      res.json({ message: 'Group archived successfully' });
    } catch (error) {
      next(error);
    }
  }

  // ============= DASHBOARD =============

  async getDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const [userCounts, groups] = await Promise.all([
        userService.getCounts(),
        groupService.getAll({ isActive: true }),
      ]);

      // Get recent lesson logs this week
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      const lessonLogsSnapshot = await db.collection('lesson_logs')
        .where('createdAt', '>=', oneWeekAgo)
        .get();

      // Get recent activity (last 20 events)
      const recentActivity = await this.getRecentActivity();

      res.json({
        data: {
          userCounts,
          totalGroups: groups.length,
          activeGroups: groups.filter((g) => g.isActive).length,
          lessonsLoggedThisWeek: lessonLogsSnapshot.size,
          recentActivity,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  private async getRecentActivity(): Promise<any[]> {
    const activities: any[] = [];

    // Recent submissions
    const submissions = await db.collection('task_submissions')
      .orderBy('submittedAt', 'desc')
      .limit(5)
      .get();
    submissions.docs.forEach((doc) => {
      activities.push({
        type: 'submission',
        ...doc.data(),
        id: doc.id,
        timestamp: doc.data().submittedAt,
      });
    });

    // Recent quiz responses
    const quizResponses = await db.collection('quiz_responses')
      .orderBy('completedAt', 'desc')
      .limit(5)
      .get();
    quizResponses.docs.forEach((doc) => {
      activities.push({
        type: 'quiz_completion',
        ...doc.data(),
        id: doc.id,
        timestamp: doc.data().completedAt,
      });
    });

    // Sort by timestamp and take top 20
    activities.sort((a, b) => {
      const aTime = a.timestamp?.toDate?.() || new Date(0);
      const bTime = b.timestamp?.toDate?.() || new Date(0);
      return bTime.getTime() - aTime.getTime();
    });

    return activities.slice(0, 20);
  }

  // ============= REPORTS =============

  async getLessonLogReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { groupId, startDate, endDate } = req.query;
      let query: FirebaseFirestore.Query = db.collection('lesson_logs');

      if (groupId) query = query.where('groupId', '==', groupId);
      if (startDate) query = query.where('date', '>=', new Date(startDate as string));
      if (endDate) query = query.where('date', '<=', new Date(endDate as string));

      const snapshot = await query.orderBy('date', 'desc').get();
      const logs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

      res.json({ data: logs });
    } catch (error) {
      next(error);
    }
  }

  async getQuizReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { groupId, startDate, endDate } = req.query;
      let query: FirebaseFirestore.Query = db.collection('quiz_responses');

      if (groupId) query = query.where('groupId', '==', groupId);

      const snapshot = await query.orderBy('completedAt', 'desc').get();
      const responses = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

      res.json({ data: responses });
    } catch (error) {
      next(error);
    }
  }

  async getCoinReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { groupId } = req.query;
      let query: FirebaseFirestore.Query = db.collection('coins');

      if (groupId) query = query.where('groupId', '==', groupId);

      const snapshot = await query.get();
      const coinAccounts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

      res.json({ data: coinAccounts });
    } catch (error) {
      next(error);
    }
  }

  async awardCoins(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { studentId, groupId, amount, reason } = req.body;
      const adminId = (req as unknown as AuthenticatedRequest).user?.uid || 'admin';
      
      await coinService.awardCoins(
        studentId,
        groupId,
        amount,
        reason || 'Admin manual award',
        'admin',
        null,
        adminId
      );
      
      res.json({ message: `Awarded ${amount} coins to student` });
    } catch (error) {
      next(error);
    }
  }

  // ============= SETTINGS =============

  async getSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const doc = await db.collection('settings').doc('platform').get();
      const defaultSettings = {
        coinDefaults: {
          taskCompleted: 10,
          quizCorrectAnswer: 5,
          quizPerfectScore: 20,
          lessonAttendance: 5,
          blooketWin: 20,
          helpingClassmate: 10,
          goodQuestion: 15,
          catchupAttended: 15,
          onTimeSubmission: 5,
        },
        platformName: 'Code Academy',
        aiProvider: 'none',
      };

      res.json({ data: doc.exists ? doc.data() : defaultSettings });
    } catch (error) {
      next(error);
    }
  }

  async updateSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await db.collection('settings').doc('platform').set(req.body, { merge: true });
      res.json({ message: 'Settings updated successfully' });
    } catch (error) {
      next(error);
    }
  }
}

export const adminController = new AdminController();
