/**
 * Seed script — creates initial data for development/testing
 * Run: npm run seed
 */
import dotenv from 'dotenv';
dotenv.config();

import { auth, db } from '../config/firebase';
import { now } from '../utils/firestoreHelpers';

async function seed() {
  console.log('🌱 Starting seed...\n');

  try {
    // 1. Create admin user
    console.log('Creating admin user...');
    let adminUser;
    try {
      adminUser = await auth.getUserByEmail('admin@codeacademy.com');
      console.log('  Admin user already exists, skipping...');
    } catch {
      adminUser = await auth.createUser({
        email: 'admin@codeacademy.com',
        password: 'Admin123!',
        displayName: 'Platform Admin',
      });
      await auth.setCustomUserClaims(adminUser.uid, { role: 'admin', groupId: null });
      await db.collection('users').doc(adminUser.uid).set({
        email: 'admin@codeacademy.com',
        displayName: 'Platform Admin',
        role: 'admin',
        groupId: null,
        avatarUrl: null,
        isActive: true,
        mustChangePassword: false,
        createdAt: now(),
        lastLoginAt: now(),
      });
      console.log('  ✅ Admin created: admin@codeacademy.com / Admin123!');
    }

    // 2. Create teacher user
    console.log('Creating teacher user...');
    let teacherUser;
    try {
      teacherUser = await auth.getUserByEmail('teacher@codeacademy.com');
      console.log('  Teacher user already exists, skipping...');
    } catch {
      teacherUser = await auth.createUser({
        email: 'teacher@codeacademy.com',
        password: 'Teacher123!',
        displayName: 'Mr. Smith',
      });
      await auth.setCustomUserClaims(teacherUser.uid, { role: 'teacher', groupId: null });
      await db.collection('users').doc(teacherUser.uid).set({
        email: 'teacher@codeacademy.com',
        displayName: 'Mr. Smith',
        role: 'teacher',
        groupId: null,
        avatarUrl: null,
        isActive: true,
        mustChangePassword: false,
        createdAt: now(),
        lastLoginAt: now(),
      });
      console.log('  ✅ Teacher created: teacher@codeacademy.com / Teacher123!');
    }

    // 3. Create group
    console.log('Creating group...');
    const groupRef = db.collection('groups').doc('monday-group');
    const groupDoc = await groupRef.get();
    if (!groupDoc.exists) {
      await groupRef.set({
        name: 'Monday Group',
        teacherId: teacherUser.uid,
        studentIds: [],
        monthIndex: 0,
        createdAt: now(),
        isActive: true,
        coinStoreItems: [
          { id: 'skip_task', name: 'Skip a Task', description: 'Skip one homework task', cost: 100, category: 'privilege', isAvailable: true, unlocksAtMonth: 0, icon: '⏭️' },
          { id: 'extra_hint', name: 'Extra Hint', description: 'Get an extra hint during a lesson', cost: 30, category: 'privilege', isAvailable: true, unlocksAtMonth: 0, icon: '💡' },
          { id: 'choose_theme', name: 'Choose Blooket Theme', description: 'Pick the Blooket theme for next lesson', cost: 50, category: 'privilege', isAvailable: true, unlocksAtMonth: 0, icon: '🎨' },
          { id: 'teacher_challenge', name: 'Challenge the Teacher', description: 'Challenge the teacher to solve a coding puzzle', cost: 150, category: 'privilege', isAvailable: true, unlocksAtMonth: 2, icon: '🏆' },
          { id: 'custom_avatar', name: 'Custom Avatar', description: 'Get a custom-designed avatar', cost: 75, category: 'digital', isAvailable: true, unlocksAtMonth: 1, icon: '🎭' },
        ],
      });
      console.log('  ✅ Group created: Monday Group');
    } else {
      console.log('  Group already exists, skipping...');
    }

    // 4. Create student users
    const students = [
      { email: 'ali@codeacademy.com', name: 'Ali Khan', password: 'Student123!' },
      { email: 'sara@codeacademy.com', name: 'Sara Johnson', password: 'Student123!' },
      { email: 'james@codeacademy.com', name: 'James Wilson', password: 'Student123!' },
      { email: 'maya@codeacademy.com', name: 'Maya Patel', password: 'Student123!' },
    ];

    console.log('Creating student users...');
    const studentIds: string[] = [];
    for (const student of students) {
      let studentUser;
      try {
        studentUser = await auth.getUserByEmail(student.email);
        console.log(`  ${student.name} already exists, skipping...`);
      } catch {
        studentUser = await auth.createUser({
          email: student.email,
          password: student.password,
          displayName: student.name,
        });
        await auth.setCustomUserClaims(studentUser.uid, { role: 'student', groupId: 'monday-group' });
        await db.collection('users').doc(studentUser.uid).set({
          email: student.email,
          displayName: student.name,
          role: 'student',
          groupId: 'monday-group',
          avatarUrl: null,
          isActive: true,
          mustChangePassword: false,
          createdAt: now(),
          lastLoginAt: now(),
        });

        // Create coin account
        await db.collection('coins').doc(studentUser.uid).set({
          studentId: studentUser.uid,
          groupId: 'monday-group',
          totalCoins: Math.floor(Math.random() * 100) + 20,
          weeklyCoins: Math.floor(Math.random() * 30),
          monthlyCoins: Math.floor(Math.random() * 50) + 10,
          allTimeCoins: Math.floor(Math.random() * 100) + 20,
          transactions: [],
        });

        console.log(`  ✅ Student created: ${student.email} / ${student.password}`);
      }
      studentIds.push(studentUser.uid);
    }

    // Update group with student IDs
    await groupRef.update({ studentIds });
    console.log(`  Updated group with ${studentIds.length} students`);

    // 5. Import sample curriculum
    console.log('Creating sample curriculum...');
    const curriculumRef = db.collection('curriculum');
    const existingCurriculum = await curriculumRef.where('monthNumber', '==', 1).get();

    if (existingCurriculum.empty) {
      await curriculumRef.add({
        monthNumber: 1,
        title: 'Python Fundamentals Pt.1',
        description: 'Variables, input, conditions, loops, functions, lists, strings.',
        domain: 'Fundamentals',
        lessonCount: 4,
        lessons: [
          {
            id: 'lesson_1_1',
            lessonNumber: 1,
            title: 'Variables & Input',
            coreConcept: 'Variables, input(), int()/float()/str() conversion',
            hook: 'The computer has no memory between lines — unless you give it one. Variables are like labelled jars for data.',
            warmUp: 'Ask kids: what is the difference between a name and a number?',
            teachingBlockA: {
              title: 'Variables',
              durationMinutes: 20,
              content: '## Variables\n\nA variable is a named container that stores data. Think of it like a labelled jar — you write a name on the jar and put something inside.\n\n### Key Rules\n- Variable names must start with a letter or underscore\n- No spaces allowed (use underscores)\n- Python is case-sensitive',
              codeExamples: [
                { language: 'python', code: 'name = "Ali"\nage = 12\nheight = 1.55\nprint(type(name))  # <class \'str\'>\nprint(type(age))   # <class \'int\'>', explanation: 'Three core types: str, int, float. Use type() to check.' },
                { language: 'python', code: 'favourite_colour = "blue"\nFavourite_Colour = "red"\n# These are TWO DIFFERENT variables!', explanation: 'Python is case-sensitive — be careful with naming!' },
              ],
            },
            teachingBlockB: {
              title: 'Input & Type Conversion',
              durationMinutes: 20,
              content: '## Input\n\nThe `input()` function always returns a string. If you need a number, you must convert it.\n\n### Type Conversion\n- `int()` — converts to integer\n- `float()` — converts to decimal\n- `str()` — converts to string',
              codeExamples: [
                { language: 'python', code: 'name = input("What is your name? ")\nage = int(input("How old are you? "))\nprint(f"Hi {name}, you will be {age + 1} next year!")', explanation: 'input() always returns a string — wrap with int() for numbers' },
              ],
            },
            energyReset: { type: 'predict_output' as const, prompt: 'x = 5\nx = x + 3\nprint(x)', answer: '8' },
            task: {
              description: 'Create a Mad Libs program that asks the user for several inputs and creates a funny story.',
              minimumVersion: '3 inputs, one sentence output',
              extensionVersion: 'Add a number input, do math with it, format output nicely',
              isFinishAtHome: false,
              estimatedMinutes: 20,
            },
            bufferNote: 'If short on time, skip float conversion. Cover it at the start of next lesson.',
            blooketQuestions: [
              { question: 'What does input() always return?', correctAnswer: 'A string', incorrectAnswers: ['An integer', 'A float', 'A boolean'] },
              { question: 'What does int("5") do?', correctAnswer: 'Converts the string "5" to the integer 5', incorrectAnswers: ['Prints the number 5', 'Creates a variable called int', 'Nothing, it causes an error'] },
              { question: 'Which variable name is valid in Python?', correctAnswer: 'my_name', incorrectAnswers: ['my name', '2names', 'my-name'] },
            ],
          },
          {
            id: 'lesson_1_2',
            lessonNumber: 2,
            title: 'Conditions & If Statements',
            coreConcept: 'if/elif/else, comparison operators, boolean logic',
            hook: 'Every video game you play makes thousands of decisions per second. "If the player presses jump AND they are on the ground, then jump." That is an if statement.',
            warmUp: 'Ask: Give me a real-life if/else decision you made today?',
            teachingBlockA: {
              title: 'If / Else',
              durationMinutes: 20,
              content: '## If Statements\n\nAn if statement lets your program make decisions.\n\n### Syntax\n```python\nif condition:\n    # do something\nelse:\n    # do something different\n```\n\n### Comparison Operators\n- `==` equal to\n- `!=` not equal to\n- `>` `<` `>=` `<=`',
              codeExamples: [
                { language: 'python', code: 'age = int(input("How old are you? "))\nif age >= 13:\n    print("You can create a social media account")\nelse:\n    print("You need to wait a bit longer")', explanation: 'The condition after "if" must be True or False' },
              ],
            },
            teachingBlockB: {
              title: 'Elif & Nested Conditions',
              durationMinutes: 20,
              content: '## Elif\n\nUse `elif` (else if) when you have more than two options.\n\n```python\nif score >= 90:\n    grade = "A"\nelif score >= 80:\n    grade = "B"\nelif score >= 70:\n    grade = "C"\nelse:\n    grade = "Try again"\n```',
              codeExamples: [
                { language: 'python', code: 'temp = int(input("Temperature? "))\nif temp > 30:\n    print("It\'s hot! 🥵")\nelif temp > 20:\n    print("Nice weather! 😎")\nelif temp > 10:\n    print("A bit chilly 🧥")\nelse:\n    print("Freezing! ❄️")', explanation: 'Python checks conditions top-to-bottom and stops at the first True one' },
              ],
            },
            energyReset: { type: 'find_bug' as const, prompt: 'x = 10\nif x = 10:\n    print("ten")', answer: 'Should be == not = in the condition' },
            task: {
              description: 'Create a quiz game that asks 3 questions with if/elif/else scoring.',
              minimumVersion: '3 multiple choice questions, track score, show result',
              extensionVersion: 'Add different difficulty levels, timer pressure',
              isFinishAtHome: false,
              estimatedMinutes: 25,
            },
            bufferNote: 'Nested conditions are stretch content — only cover if group is ahead.',
            blooketQuestions: [
              { question: 'What symbol means "equal to" in Python conditions?', correctAnswer: '==', incorrectAnswers: ['=', '===', '=>'] },
              { question: 'What happens if no condition is True and there is no else?', correctAnswer: 'Nothing happens', incorrectAnswers: ['Python crashes', 'It prints False', 'It runs the first block'] },
            ],
          },
          {
            id: 'lesson_1_3',
            lessonNumber: 3,
            title: 'Loops — While & For',
            coreConcept: 'while loops, for loops, range(), break/continue',
            hook: 'Without loops, if you wanted to print "Hello" 100 times, you\'d need 100 print statements. With a loop: 2 lines.',
            warmUp: 'Count backwards from 10 out loud. You just performed a loop!',
            teachingBlockA: {
              title: 'While Loops',
              durationMinutes: 20,
              content: '## While Loops\n\nA while loop repeats as long as a condition is True.\n\n⚠️ **Warning:** If the condition never becomes False, you get an infinite loop!',
              codeExamples: [
                { language: 'python', code: 'count = 1\nwhile count <= 5:\n    print(f"Count: {count}")\n    count += 1\nprint("Done!")', explanation: 'The loop runs 5 times, then stops when count becomes 6' },
              ],
            },
            teachingBlockB: {
              title: 'For Loops & Range',
              durationMinutes: 20,
              content: '## For Loops\n\nFor loops iterate over a sequence (like a range of numbers or a list).\n\n```python\nfor i in range(5):  # 0, 1, 2, 3, 4\n    print(i)\n```',
              codeExamples: [
                { language: 'python', code: 'for i in range(1, 11):\n    print(f"{i} x 7 = {i * 7}")', explanation: 'range(1, 11) gives numbers 1 through 10' },
              ],
            },
            energyReset: { type: 'challenge_60s' as const, prompt: 'Write a loop that prints all even numbers from 2 to 20', answer: 'for i in range(2, 21, 2): print(i)' },
            task: {
              description: 'Create a number guessing game with a while loop.',
              minimumVersion: 'Random number 1-20, give hints (higher/lower), count guesses',
              extensionVersion: 'Add difficulty levels, max guess limit, play again option',
              isFinishAtHome: true,
              estimatedMinutes: 25,
            },
            bufferNote: 'If running long, skip break/continue — cover next lesson.',
            blooketQuestions: [
              { question: 'What does range(5) produce?', correctAnswer: '0, 1, 2, 3, 4', incorrectAnswers: ['1, 2, 3, 4, 5', '0, 1, 2, 3, 4, 5', '5'] },
            ],
          },
          {
            id: 'lesson_1_4',
            lessonNumber: 4,
            title: 'Functions',
            coreConcept: 'def, parameters, return values, scope',
            hook: 'Functions are like recipes — you write them once and use them whenever you need them.',
            warmUp: 'What instructions would you give someone to make a sandwich? That\'s a function!',
            teachingBlockA: {
              title: 'Defining Functions',
              durationMinutes: 20,
              content: '## Functions\n\nA function is a reusable block of code that performs a specific task.\n\n```python\ndef greet(name):\n    print(f"Hello, {name}!")\n```',
              codeExamples: [
                { language: 'python', code: 'def calculate_area(width, height):\n    area = width * height\n    return area\n\nresult = calculate_area(5, 3)\nprint(f"Area: {result}")', explanation: 'def creates a function, return sends back a value' },
              ],
            },
            teachingBlockB: {
              title: 'Return Values & Scope',
              durationMinutes: 20,
              content: '## Return vs Print\n\n- `print()` shows output on screen\n- `return` sends a value back to the code that called the function\n\nVariables inside a function are **local** — they don\'t exist outside.',
              codeExamples: [
                { language: 'python', code: 'def is_even(number):\n    return number % 2 == 0\n\nprint(is_even(4))   # True\nprint(is_even(7))   # False', explanation: 'Functions can return any type — here it returns a boolean' },
              ],
            },
            energyReset: { type: 'quick_vote' as const, prompt: 'Is this the same? print("hi") vs return "hi"', answer: 'No! print shows on screen, return sends the value back to the caller' },
            task: {
              description: 'Create a "toolbox" of useful functions.',
              minimumVersion: '3 functions: greeting, calculator, and a checker (e.g., is_even)',
              extensionVersion: 'Add functions that call other functions, default parameters',
              isFinishAtHome: false,
              estimatedMinutes: 20,
            },
            bufferNote: 'Scope is difficult — if kids are struggling, use the "room analogy" (variables in a room stay in that room).',
            blooketQuestions: [
              { question: 'What keyword starts a function definition?', correctAnswer: 'def', incorrectAnswers: ['function', 'func', 'define'] },
              { question: 'What does return do?', correctAnswer: 'Sends a value back to the caller', incorrectAnswers: ['Prints to the screen', 'Ends the program', 'Creates a new variable'] },
            ],
          },
        ],
        offlineLesson: {
          title: 'The Stolen Server',
          format: 'Escape Room',
          description: 'Python logic puzzles themed around recovering a stolen server. Teams solve coding challenges written on cards to progress through rooms.',
          duration: 120,
          materials: ['Printed puzzle sheets (4 sets)', 'Answer key for teacher', 'Timer', 'Prizes', 'Lock boxes (optional)'],
          rules: ['Teams of 2-3', 'Cannot share answers between teams', 'Hints cost 10 coins', 'Must show working for each puzzle'],
          prizes: 'First team: 100 coins each. Second team: 60 coins each. All participants: 20 coins.',
        },
        createdAt: now(),
        updatedAt: now(),
        createdBy: teacherUser.uid,
      });
      console.log('  ✅ Sample curriculum created: Python Fundamentals Pt.1 (4 lessons)');
    } else {
      console.log('  Curriculum already exists, skipping...');
    }

    // 6. Create platform settings
    console.log('Creating platform settings...');
    await db.collection('settings').doc('platform').set({
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
    }, { merge: true });
    console.log('  ✅ Platform settings configured');

    console.log('\n✨ Seed complete!\n');
    console.log('Login credentials:');
    console.log('  Admin:   admin@codeacademy.com   / Admin123!');
    console.log('  Teacher: teacher@codeacademy.com / Teacher123!');
    console.log('  Student: ali@codeacademy.com     / Student123!');
    console.log('  Student: sara@codeacademy.com    / Student123!');
    console.log('  Student: james@codeacademy.com   / Student123!');
    console.log('  Student: maya@codeacademy.com    / Student123!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }
}

seed();
