import { db } from '../config/firebase';
import { AIPrompt, LessonLog, LessonDocument } from '../models/types';
import { AppError } from '../utils/appError';
import { now } from '../utils/firestoreHelpers';
import { lessonService } from './lessonService';
import { curriculumService } from './curriculumService';

export class AIPromptService {
  private collection = db.collection('ai_prompts');

  /**
   * Generate prompt text from lesson log and next lesson data
   */
  async generatePrompt(data: {
    groupId: string;
    lessonLogId: string;
    nextLessonId: string;
    additionalContext?: string;
    includeStudentObservations?: boolean;
  }, teacherId: string): Promise<AIPrompt> {
    // Fetch all required data
    const [log, group, nextLesson] = await Promise.all([
      lessonService.getLog(data.lessonLogId),
      db.collection('groups').doc(data.groupId).get(),
      lessonService.getLesson(data.nextLessonId),
    ]);

    const groupData = group.data()!;

    // Get teacher info
    const teacherDoc = await db.collection('users').doc(teacherId).get();
    const teacherName = teacherDoc.data()?.displayName || 'Teacher';

    // Get previous lesson info
    const prevLesson = await lessonService.getLesson(log.lessonId);

    // Get student names for attendees
    const attendeeNames = await this.getStudentNames(log.attendees);
    const absenteeNames = await this.getStudentNames(log.absentees);
    const catchupNames = await this.getStudentNames(log.catchupNeeded || []);

    // Get curriculum data for next lesson
    const curriculumMonths = await curriculumService.getAll();
    const currentMonth = curriculumMonths.find(c => c.id === nextLesson.monthId);
    const nextCurriculumLesson = currentMonth?.lessons.find(l => l.lessonNumber === nextLesson.lessonNumber);

    // Build student observations
    let studentObservations = '';
    if (data.includeStudentObservations !== false && log.studentNotes?.length > 0) {
      const noteLines = await Promise.all(
        log.studentNotes.map(async (note) => {
          const names = await this.getStudentNames([note.studentId]);
          return `- ${names[0]}: Understanding: ${note.understanding}, Engagement: ${note.engagement}${note.note ? `, Note: ${note.note}` : ''}`;
        })
      );
      studentObservations = noteLines.join('\n');
    }

    // Build quiz misses
    let quizMisses = 'No quiz data available';
    if (log.quizResults?.length > 0) {
      const missedByMultiple = this.findMissedByMultiple(log.quizResults);
      if (missedByMultiple.length > 0) {
        quizMisses = missedByMultiple.map(m => `- Question "${m.questionId}" missed by ${m.count} students`).join('\n');
      } else {
        quizMisses = 'All questions answered well';
      }
    }

    const paceDescriptions: Record<number, string> = { 1: 'Too slow', 2: 'Perfect', 3: 'Too fast' };
    const energyDescriptions: Record<number, string> = { 1: 'Low energy', 2: 'Good', 3: 'High energy' };

    // Generate the prompt
    const prompt = `You are helping a programming teacher adapt their upcoming lesson for a small group of 11-13 year olds.

## GROUP CONTEXT
Group: ${groupData.name}
Students: ${groupData.studentIds?.length || 0} students, ages 11-13
Current month: ${currentMonth?.title || 'Unknown'}
Teacher: ${teacherName}

## PREVIOUS LESSON SUMMARY (Lesson ${prevLesson.lessonNumber} — ${prevLesson.title})
Date: ${log.date ? new Date(log.date as any).toLocaleDateString() : 'Unknown'}
Attendance: ${attendeeNames.join(', ')} (${absenteeNames.length > 0 ? absenteeNames.join(', ') + ' absent' : 'no absences'})
Pace: ${paceDescriptions[log.paceRating] || 'Unknown'}
Energy level: ${energyDescriptions[log.energyRating] || 'Unknown'}

Concepts fully understood: ${log.conceptsFullyUnderstood?.join(', ') || 'None recorded'}
Concepts partially understood: ${log.conceptsPartiallyUnderstood?.join(', ') || 'None recorded'}
Concepts not well understood: ${log.conceptsNotUnderstood?.join(', ') || 'None recorded'}
Topics skipped: ${log.topicsSkipped?.join(', ') || 'None'}
Buffer used: ${log.bufferUsed ? 'Yes' : 'No'}

Quiz results — questions missed by 2+ students:
${quizMisses}

${studentObservations ? `Student-specific observations:\n${studentObservations}` : ''}

Students needing catch-up this week: ${catchupNames.length > 0 ? catchupNames.join(', ') : 'None'}

Teacher's notes: ${log.generalNotes || 'None'}
Teacher's planned adjustments: ${log.nextLessonAdjustments || 'None'}

## UPCOMING LESSON (Lesson ${nextLesson.lessonNumber} — ${nextLesson.title})
Core concept: ${(nextLesson as any).coreConceptSummary || (nextCurriculumLesson as any)?.coreConcept || ''}
Hook: ${(nextLesson as any).hookText || (nextCurriculumLesson as any)?.hook || ''}
Warm-up: ${(nextCurriculumLesson as any)?.warmUp || ''}
Teaching Block A: ${(nextLesson as any).teachingBlocks?.[0]?.title || ''} — ${(nextLesson as any).teachingBlocks?.[0]?.content?.substring(0, 200) || ''}
Teaching Block B: ${(nextLesson as any).teachingBlocks?.[1]?.title || ''} — ${(nextLesson as any).teachingBlocks?.[1]?.content?.substring(0, 200) || ''}
Energy reset planned: ${(nextCurriculumLesson as any)?.energyReset?.type || 'Not specified'}
Task: ${(nextLesson as any).task?.description || ''} (min: ${(nextLesson as any).task?.minimumVersion || ''} / ext: ${(nextLesson as any).task?.extensionVersion || ''})
Buffer note: ${(nextLesson as any).bufferNote || 'None'}

${data.additionalContext ? `## ADDITIONAL CONTEXT FROM TEACHER\n${data.additionalContext}\n` : ''}
## YOUR TASK
Based on the previous lesson data above, suggest specific adaptations for the upcoming lesson:

1. Opening adjustments — should anything be re-taught in the first 5 minutes? What concept and how?
2. Teaching Block A adjustments — any emphasis changes, different analogies, or pacing notes based on what struggled last time?
3. Energy Reset — is the planned reset appropriate given the energy level? Suggest a specific prompt for it.
4. Task adjustments — should the minimum version be simplified or extended based on understanding? For which students?
5. Student-specific strategies — for each student flagged as struggling, suggest one specific approach.
6. Catch-up meeting topics — for the students who need catch-up meetings, what specifically should be covered and with what different analogy from the lesson?
7. One thing to watch for — what is the single most likely point of confusion in this lesson given this group's history?

Be specific and practical. Reference the actual concepts by name. Keep suggestions brief.`;

    // Save the prompt
    const promptData: Omit<AIPrompt, 'id'> = {
      groupId: data.groupId,
      lessonLogId: data.lessonLogId,
      nextLessonId: data.nextLessonId,
      generatedPrompt: prompt,
      generatedAt: now(),
      generatedBy: teacherId,
      usageNotes: null,
      aiResponse: null,
    };

    const docRef = await this.collection.add(promptData);
    return { id: docRef.id, ...promptData } as AIPrompt;
  }

  /**
   * Call AI API with the generated prompt
   */
  async generateWithAI(promptId: string): Promise<string> {
    const doc = await this.collection.doc(promptId).get();
    if (!doc.exists) throw AppError.notFound('AIPrompt', promptId);

    const promptData = doc.data() as AIPrompt;
    const provider = process.env.AI_PROVIDER || 'none';

    if (provider === 'none') {
      throw AppError.badRequest('AI_NOT_CONFIGURED', 'No AI provider is configured. Add an API key in settings.');
    }

    let response = '';

    if (provider === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
      response = await this.callAnthropic(promptData.generatedPrompt);
    } else if (provider === 'openai' && process.env.OPENAI_API_KEY) {
      response = await this.callOpenAI(promptData.generatedPrompt);
    } else {
      throw AppError.badRequest('AI_NOT_CONFIGURED', `API key for ${provider} is not set`);
    }

    // Save the AI response
    await this.collection.doc(promptId).update({ aiResponse: response });

    return response;
  }

  private async callAnthropic(prompt: string): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      throw AppError.internal(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json() as any;
    return data.content?.[0]?.text || '';
  }

  private async callOpenAI(prompt: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      throw AppError.internal(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json() as any;
    return data.choices?.[0]?.message?.content || '';
  }

  /**
   * Get prompt history for a group
   */
  async getHistory(groupId: string): Promise<AIPrompt[]> {
    const snapshot = await this.collection
      .where('groupId', '==', groupId)
      .orderBy('generatedAt', 'desc')
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AIPrompt));
  }

  /**
   * Update usage notes
   */
  async updateNotes(promptId: string, usageNotes: string): Promise<void> {
    await this.collection.doc(promptId).update({ usageNotes });
  }

  private findMissedByMultiple(results: any[]): { questionId: string; count: number }[] {
    const missCounts = new Map<string, number>();
    for (const result of results) {
      if (!result.wasCorrect) {
        missCounts.set(result.questionId, (missCounts.get(result.questionId) || 0) + 1);
      }
    }
    return Array.from(missCounts.entries())
      .filter(([_, count]) => count >= 2)
      .map(([questionId, count]) => ({ questionId, count }));
  }

  private async getStudentNames(studentIds: string[]): Promise<string[]> {
    const names: string[] = [];
    for (const id of studentIds) {
      const doc = await db.collection('users').doc(id).get();
      names.push(doc.data()?.displayName || 'Unknown');
    }
    return names;
  }
}

export const aiPromptService = new AIPromptService();
