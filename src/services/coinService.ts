import { db } from '../config/firebase';
import { CoinAccount, CoinTransaction, CoinStorePurchase } from '../models/types';
import { AppError } from '../utils/appError';
import { now } from '../utils/firestoreHelpers';
import { v4 as uuidv4 } from 'uuid';
import { FieldValue } from 'firebase-admin/firestore';

export class CoinService {
  private coinsCollection = db.collection('coins');
  private purchasesCollection = db.collection('coin_store_purchases');

  /**
   * Award coins to a student
   */
  async awardCoins(
    studentId: string,
    groupId: string,
    amount: number,
    reason: string,
    sourceType: CoinTransaction['sourceType'],
    sourceId: string | null,
    awardedBy: string
  ): Promise<void> {
    const coinRef = this.coinsCollection.doc(studentId);
    const doc = await coinRef.get();

    const transaction: CoinTransaction = {
      id: uuidv4(),
      amount,
      reason,
      sourceType,
      sourceId,
      awardedBy,
      timestamp: now(),
    };

    if (!doc.exists) {
      // Create new coin account
      await coinRef.set({
        studentId,
        groupId,
        totalCoins: amount,
        weeklyCoins: amount,
        monthlyCoins: amount,
        allTimeCoins: amount,
        transactions: [transaction],
      });
    } else {
      // Update existing account
      const currentData = doc.data()!;
      const transactions = [transaction, ...(currentData.transactions || [])].slice(0, 200);

      await coinRef.update({
        totalCoins: FieldValue.increment(amount),
        weeklyCoins: FieldValue.increment(amount),
        monthlyCoins: FieldValue.increment(amount),
        allTimeCoins: FieldValue.increment(amount),
        transactions,
      });
    }
  }

  /**
   * Deduct coins from a student
   */
  async deductCoins(
    studentId: string,
    amount: number,
    reason: string,
    sourceType: CoinTransaction['sourceType'],
    sourceId: string | null,
    deductedBy: string
  ): Promise<void> {
    const coinRef = this.coinsCollection.doc(studentId);
    const doc = await coinRef.get();

    if (!doc.exists) {
      throw AppError.notFound('CoinAccount', studentId);
    }

    const currentData = doc.data()!;
    if (currentData.totalCoins < amount) {
      throw AppError.badRequest('INSUFFICIENT_COINS', 'Not enough coins for this transaction');
    }

    const transaction: CoinTransaction = {
      id: uuidv4(),
      amount: -amount,
      reason,
      sourceType,
      sourceId,
      awardedBy: deductedBy,
      timestamp: now(),
    };

    const transactions = [transaction, ...(currentData.transactions || [])].slice(0, 200);

    await coinRef.update({
      totalCoins: FieldValue.increment(-amount),
      weeklyCoins: FieldValue.increment(-amount),
      monthlyCoins: FieldValue.increment(-amount),
      allTimeCoins: FieldValue.increment(-amount),
      transactions,
    });
  }

  /**
   * Get coin account for a student
   */
  async getAccount(studentId: string): Promise<CoinAccount | null> {
    const doc = await this.coinsCollection.doc(studentId).get();
    if (!doc.exists) return null;
    return doc.data() as CoinAccount;
  }

  /**
   * Get scoreboard for a group
   */
  async getScoreboard(groupId: string, type: 'weekly' | 'monthly' | 'allTime' = 'allTime'): Promise<{
    studentId: string;
    displayName: string;
    avatarUrl: string | null;
    totalCoins: number;
    weeklyCoins: number;
    rank: number;
  }[]> {
    const snapshot = await this.coinsCollection
      .where('groupId', '==', groupId)
      .get();

    const accounts = snapshot.docs.map((doc) => ({
      studentId: doc.id,
      ...doc.data(),
    }));

    // Get display names for all students
    const enriched = (await Promise.all(
      accounts.map(async (account: any) => {
        const userDoc = await db.collection('users').doc(account.studentId).get();
        if (!userDoc.exists) return null; // Filter out deleted users
        
        const userData = userDoc.data();
        if (userData?.groupId !== groupId) return null; // Filter out users moved to another group
        
        const sortField = type === 'weekly' ? account.weeklyCoins
          : type === 'monthly' ? account.monthlyCoins
          : account.totalCoins;

        return {
          studentId: account.studentId,
          displayName: userData?.displayName || 'Unknown',
          avatarUrl: userData?.avatarUrl || null,
          totalCoins: account.totalCoins || 0,
          weeklyCoins: account.weeklyCoins || 0,
          monthlyCoins: account.monthlyCoins || 0,
          sortValue: sortField || 0,
          rank: 0,
        };
      })
    )).filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    // Sort by the appropriate field
    enriched.sort((a, b) => b.sortValue - a.sortValue);

    // Assign ranks
    enriched.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    return enriched;
  }

  /**
   * Redeem a store item
   */
  async redeemItem(
    studentId: string,
    groupId: string,
    itemId: string,
    itemName: string,
    cost: number
  ): Promise<CoinStorePurchase> {
    // Check sufficient coins
    const account = await this.getAccount(studentId);
    if (!account || account.totalCoins < cost) {
      throw AppError.badRequest('INSUFFICIENT_COINS', 'Not enough coins to redeem this item');
    }

    const purchaseData: Omit<CoinStorePurchase, 'id'> = {
      studentId,
      groupId,
      itemId,
      itemName,
      cost,
      status: 'pending',
      teacherNote: null,
      purchasedAt: now(),
      fulfilledAt: null,
    };

    const docRef = await this.purchasesCollection.add(purchaseData);
    return { id: docRef.id, ...purchaseData } as CoinStorePurchase;
  }

  /**
   * Fulfil a store purchase
   */
  async fulfilPurchase(purchaseId: string, teacherNote?: string): Promise<void> {
    const doc = await this.purchasesCollection.doc(purchaseId).get();
    if (!doc.exists) throw AppError.notFound('Purchase', purchaseId);

    const purchase = doc.data() as CoinStorePurchase;
    if (purchase.status !== 'pending') {
      throw AppError.badRequest('INVALID_STATUS', 'This purchase is not pending');
    }

    // Deduct coins
    await this.deductCoins(
      purchase.studentId,
      purchase.cost,
      `Store purchase: ${purchase.itemName}`,
      'purchase',
      purchaseId,
      'system'
    );

    await this.purchasesCollection.doc(purchaseId).update({
      status: 'fulfilled',
      teacherNote: teacherNote || null,
      fulfilledAt: now(),
    });
  }

  /**
   * Reject a store purchase
   */
  async rejectPurchase(purchaseId: string, reason?: string): Promise<void> {
    const doc = await this.purchasesCollection.doc(purchaseId).get();
    if (!doc.exists) throw AppError.notFound('Purchase', purchaseId);

    await this.purchasesCollection.doc(purchaseId).update({
      status: 'rejected',
      teacherNote: reason || null,
    });
  }

  /**
   * Get pending store requests for a group
   */
  async getStoreRequests(groupId: string): Promise<CoinStorePurchase[]> {
    const snapshot = await this.purchasesCollection
      .where('groupId', '==', groupId)
      .where('status', '==', 'pending')
      .orderBy('purchasedAt', 'desc')
      .get();

    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as CoinStorePurchase));
  }

  /**
   * Reset weekly coins for all students
   */
  async resetWeeklyCoins(): Promise<void> {
    const snapshot = await this.coinsCollection.get();
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.update(doc.ref, { weeklyCoins: 0 });
    });
    await batch.commit();
  }

  /**
   * Reset monthly coins for all students
   */
  async resetMonthlyCoins(): Promise<void> {
    const snapshot = await this.coinsCollection.get();
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.update(doc.ref, { monthlyCoins: 0 });
    });
    await batch.commit();
  }
}

export const coinService = new CoinService();
