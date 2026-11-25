import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { extractTextFromPdf } from '../lib/pdfTextExtractor';
import { generateStudyTasksFromExams } from '../lib/geminiScheduleExtractor';

const AppContext = createContext(null);

export const defaultUser = {
  id: '',
  name: 'Student',
  email: '',
  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  institution: '',
  program: '',
  term: '',
  gpa: '',
  studyStreak: 0,
  dailyGoalHours: 4.0,
  todayCompletedHours: 0,
  preferredTheme: 'light',
  notifications: {
    emailAlerts: true,
    dueReminders: true,
    streakUpdates: true,
    weeklyReport: true
  }
};

// Check and purge legacy hardcoded mock data from localStorage
const purgeLegacyMockData = () => {
  const legacyKeys = [
    { key: 'learnmate_user', test: (u) => u?.id === 'usr_1' || u?.name === 'Alex Rivera' },
    { key: 'learnmate_timetable', test: (arr) => Array.isArray(arr) && arr.some((x) => x?.id === 'tt_1') },
    { key: 'learnmate_assignments', test: (arr) => Array.isArray(arr) && arr.some((x) => x?.id === 'asg_1') },
    { key: 'learnmate_notes', test: (arr) => Array.isArray(arr) && arr.some((x) => x?.id === 'note_1') },
    { key: 'learnmate_exams', test: (arr) => Array.isArray(arr) && arr.some((x) => x?.id === 'ex_1') },
    { key: 'learnmate_tasks', test: (arr) => Array.isArray(arr) && arr.some((x) => x?.id === 'st_1') },
    { key: 'learnmate_quiz_scores', test: (obj) => obj && obj.quiz_1 && obj.quiz_1.score === 4 && obj.quiz_1.total === 4 },
    { key: 'learnmate_quizzes', test: (arr) => Array.isArray(arr) && arr.some((x) => x?.id === 'quiz_1') }
  ];

  legacyKeys.forEach(({ key, test }) => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (test(parsed)) {
          localStorage.removeItem(key);
        }
      }
    } catch {
      localStorage.removeItem(key);
    }
  });
};

// Run purge once at evaluation
purgeLegacyMockData();

export const AppProvider = ({ children }) => {
  const [supabaseReady] = useState(isSupabaseConfigured());
  const [authLoading, setAuthLoading] = useState(true);
  const [session, setSession] = useState(null);

  // User state
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('learnmate_user');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.name !== 'Alex Rivera' && parsed?.id !== 'usr_1') {
          return parsed;
        }
      }
    } catch {}
    return defaultUser;
  });

  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('learnmate_auth') === 'true';
  });

  // Data states - strictly initialized to empty arrays
  const [timetable, setTimetable] = useState(() => {
    try {
      const saved = localStorage.getItem('learnmate_timetable');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && !parsed.some((x) => x?.id === 'tt_1')) {
          return parsed;
        }
      }
    } catch {}
    return [];
  });

  const [assignments, setAssignments] = useState(() => {
    try {
      const saved = localStorage.getItem('learnmate_assignments');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && !parsed.some((x) => x?.id === 'asg_1')) {
          return parsed;
        }
      }
    } catch {}
    return [];
  });

  const [notes, setNotes] = useState(() => {
    try {
      const saved = localStorage.getItem('learnmate_notes');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && !parsed.some((x) => x?.id === 'note_1')) {
          return parsed;
        }
      }
    } catch {}
    return [];
  });

  const [noteFiles, setNoteFiles] = useState(() => {
    try {
      const saved = localStorage.getItem('learnmate_note_files');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [noteFolders, setNoteFolders] = useState(() => {
    try {
      const saved = localStorage.getItem('learnmate_note_folders');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [exams, setExams] = useState(() => {
    try {
      const saved = localStorage.getItem('learnmate_exams');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && !parsed.some((x) => x?.id === 'ex_1')) {
          return parsed;
        }
      }
    } catch {}
    return [];
  });

  const [studyTasks, setStudyTasks] = useState(() => {
    try {
      const saved = localStorage.getItem('learnmate_tasks');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && !parsed.some((x) => x?.id === 'st_1')) {
          return parsed;
        }
      }
    } catch {}
    return [];
  });

  const [studySessions, setStudySessions] = useState(() => {
    try {
      const saved = localStorage.getItem('learnmate_sessions');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  const [quizzes, setQuizzes] = useState(() => {
    try {
      const saved = localStorage.getItem('learnmate_quizzes');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && !parsed.some((x) => x?.id === 'quiz_1')) {
          return parsed;
        }
      }
    } catch {}
    return [];
  });

  const [quizScores, setQuizScores] = useState(() => {
    try {
      const saved = localStorage.getItem('learnmate_quiz_scores');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && !parsed.quiz_1) {
          return parsed;
        }
      }
    } catch {}
    return {};
  });

  // PDF-Generated Quizzes & Attempt History
  const [generatedQuizzes, setGeneratedQuizzes] = useState(() => {
    try {
      const saved = localStorage.getItem('learnmate_generated_quizzes');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  const [quizAttempts, setQuizAttempts] = useState(() => {
    try {
      const saved = localStorage.getItem('learnmate_quiz_attempts');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  const [globalSearch, setGlobalSearch] = useState('');
  const [toastMessage, setToastMessage] = useState(null);

  // ============================================================================
  // AI DOUBT SOLVER STATE
  // ============================================================================
  const [aiConversations, setAiConversations] = useState(() => {
    try {
      const saved = localStorage.getItem('learnmate_ai_conversations');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  const [activeAiConversationId, setActiveAiConversationId] = useState(() => {
    try {
      return localStorage.getItem('learnmate_active_ai_conversation') || null;
    } catch {}
    return null;
  });

  const [aiMessages, setAiMessages] = useState([]);
  const [aiStatus, setAiStatus] = useState(() => ({
    isConfigured: isSupabaseConfigured(),
    model: 'Gemini 3.5 Flash-Lite',
    provider: 'Google Gemini (Supabase Edge Function)',
  }));
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);

  // Active documents attached to conversations (persists across turns so students can ask follow-ups)
  const [conversationDocuments, setConversationDocuments] = useState(() => {
    try {
      const saved = localStorage.getItem('learnmate_ai_conv_docs');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });

  const setConversationDocument = useCallback((convId, doc) => {
    if (!convId) return;
    setConversationDocuments((prev) => {
      const updated = { ...prev, [convId]: doc };
      try {
        localStorage.setItem('learnmate_ai_conv_docs', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);

  const clearConversationDocument = useCallback((convId) => {
    if (!convId) return;
    setConversationDocuments((prev) => {
      const updated = { ...prev };
      delete updated[convId];
      try {
        localStorage.setItem('learnmate_ai_conv_docs', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);

  // Helper Toast
  const showToast = useCallback((message, type = 'success') => {
    setToastMessage({ message, type });
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  // ============================================================================
  // DATABASE SYNC HELPERS (Supabase)
  // ============================================================================

  const loadUserDataFromSupabase = useCallback(async (userId, userEmail, userMeta) => {
    if (!supabaseReady || !userId) return;

    try {
      // 1. Load Profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profileData) {
        setUser((prev) => ({
          ...prev,
          id: profileData.id,
          name: profileData.full_name || prev.name || 'Student',
          email: profileData.email || userEmail || prev.email || '',
          institution: profileData.institution || '',
          program: profileData.program || '',
          term: profileData.term || '',
          studyStreak: profileData.study_streak ?? 0,
          avatar: profileData.avatar_url || prev.avatar || defaultUser.avatar,
        }));
      } else if (userMeta) {
        setUser((prev) => ({
          ...prev,
          id: userId,
          name: userMeta.full_name || userMeta.name || 'Student',
          email: userEmail || prev.email || '',
          institution: userMeta.institution || '',
          program: userMeta.program || '',
        }));
      }

      // 2. Load Timetable
      const { data: ttData, error: ttErr } = await supabase
        .from('timetable')
        .select('*')
        .order('created_at', { ascending: true });

      if (!ttErr) {
        setTimetable((ttData || []).map((item) => ({
          id: item.id,
          day: item.day,
          subject: item.subject,
          code: item.code,
          startTime: item.start_time,
          endTime: item.end_time,
          time: item.time,
          room: item.room || 'TBA',
          instructor: item.instructor || 'TBA',
          type: item.type || 'Lecture',
          color: item.color || 'blue',
        })));
      }

      // 3. Load Assignments
      const { data: asgData, error: asgErr } = await supabase
        .from('assignments')
        .select('*')
        .order('due_date', { ascending: true });

      if (!asgErr) {
        setAssignments((asgData || []).map((asg) => {
          const diffDays = asg.due_date
            ? Math.ceil((new Date(asg.due_date) - new Date()) / (1000 * 60 * 60 * 24))
            : 0;
          return {
            id: asg.id,
            title: asg.title,
            subject: asg.subject,
            courseCode: asg.course_code || asg.subject,
            dueDate: asg.due_date,
            daysLeft: diffDays,
            status: asg.status || 'pending',
            priority: asg.priority || 'medium',
            progress: asg.progress || 0,
            description: asg.description || '',
          };
        }));
      }

      // 4. Load Notes
      const { data: noteData, error: noteErr } = await supabase
        .from('notes')
        .select('*')
        .order('created_at', { ascending: false });

      if (!noteErr) {
        setNotes((noteData || []).map((n) => ({
          id: n.id,
          title: n.title,
          content: n.content,
          subject: n.subject,
          favorite: n.favorite || false,
          tags: ['General'],
          updatedAt: n.updated_at ? new Date(n.updated_at).toLocaleDateString() : 'Recently',
        })));
      }

      // 4b. Load Smart Note Folders
      try {
        const { data: folderData, error: folderErr } = await supabase
          .from('note_folders')
          .select('*')
          .order('name', { ascending: true });

        if (!folderErr && folderData) {
          setNoteFolders(folderData.map((f) => ({
            id: f.id,
            name: f.name,
            parentId: f.parent_id,
            subject: f.subject || '',
            module: f.module || '',
            topic: f.topic || '',
            color: f.color || '#52796F',
            createdAt: f.created_at,
          })));
        }
      } catch (err) {
        console.warn('Note folders fetch notice:', err.message);
      }

      // 4c. Load Smart Note Files
      try {
        const { data: fileData, error: fileErr } = await supabase
          .from('note_files')
          .select('*')
          .order('created_at', { ascending: false });

        if (!fileErr && fileData) {
          setNoteFiles(fileData.map((f) => ({
            id: f.id,
            folderId: f.folder_id,
            title: f.title,
            fileName: f.file_name,
            filePath: f.file_path,
            fileSize: Number(f.file_size) || 0,
            fileType: f.file_type,
            fileExt: f.file_ext,
            subject: f.subject || '',
            module: f.module || '',
            topic: f.topic || '',
            favorite: f.favorite || false,
            storageBucket: f.storage_bucket || 'smart_notes',
            description: f.description || '',
            createdAt: f.created_at,
            updatedAt: f.updated_at,
          })));
        }
      } catch (err) {
        console.warn('Note files fetch notice:', err.message);
      }

      // 5. Load Exams
      const { data: examData, error: examErr } = await supabase
        .from('exams')
        .select('*')
        .order('exam_date', { ascending: true });

      if (!examErr) {
        setExams((examData || []).map((e) => {
          let examName = e.syllabus || 'Exam';
          let time = '';
          let startTime = '';
          let endTime = '';
          let duration = '';
          let sessionName = '';
          let day = '';

          // Check if syllabus contains serialized metadata JSON
          if (e.syllabus && typeof e.syllabus === 'string' && e.syllabus.startsWith('{')) {
            try {
              const meta = JSON.parse(e.syllabus);
              if (meta.examName) examName = meta.examName;
              if (meta.time) time = meta.time;
              if (meta.startTime) startTime = meta.startTime;
              if (meta.endTime) endTime = meta.endTime;
              if (meta.duration) duration = meta.duration;
              if (meta.session) sessionName = meta.session;
              if (meta.day) day = meta.day;
            } catch (pErr) {
              // Plain text syllabus fallback
            }
          }

          // If time is still not set, extract from exam_date if timestamp contains hours/minutes
          let dateStr = '';
          if (e.exam_date) {
            const dateObj = new Date(e.exam_date);
            if (!isNaN(dateObj.getTime())) {
              dateStr = dateObj.toISOString().split('T')[0];
              if (!time) {
                const hours = dateObj.getHours();
                const mins = dateObj.getMinutes();
                if (hours !== 0 || mins !== 0) {
                  const ampm = hours >= 12 ? 'PM' : 'AM';
                  const formattedHours = hours % 12 || 12;
                  const formattedMins = String(mins).padStart(2, '0');
                  startTime = `${formattedHours}:${formattedMins} ${ampm}`;
                  time = startTime;
                }
              }
            }
          }

          if (!time) {
            time = startTime ? (endTime ? `${startTime} - ${endTime}` : startTime) : '10:00 AM - 12:00 PM';
          }
          if (!startTime && time) {
            startTime = time.split('-')[0]?.trim() || '10:00 AM';
          }
          if (!endTime && time && time.includes('-')) {
            endTime = time.split('-')[1]?.trim() || '';
          }
          if (!day && dateStr) {
            const d = new Date(dateStr);
            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            day = days[d.getDay()] || 'Monday';
          }

          return {
            id: e.id,
            subject: e.subject,
            code: e.code || '',
            examName,
            syllabus: examName,
            date: dateStr,
            day,
            dayOfWeek: day,
            time,
            startTime,
            endTime,
            duration: duration || '1h 15m',
            session: sessionName || (startTime.includes('PM') ? 'Afternoon' : 'Morning'),
            venue: e.room || 'Main Hall',
            room: e.room || 'Main Hall',
            status: e.status || 'upcoming',
            weight: e.weight || '30%',
            topics: Array.isArray(e.topics) ? e.topics : [],
          };
        }));
      }

      // 6. Load Study Sessions
      const { data: sessData, error: sessErr } = await supabase
        .from('study_sessions')
        .select('*')
        .order('created_at', { ascending: false });

      if (!sessErr && sessData) {
        setStudySessions(sessData.map((s) => ({
          id: s.id,
          subject: s.subject,
          duration: s.duration,
          startTime: s.start_time,
          status: s.completion_status || 'completed'
        })));
      }

      // 7. Load Quizzes
      const { data: quizRecords, error: quizErr } = await supabase
        .from('quizzes')
        .select('*')
        .order('completion_timestamp', { ascending: false });

      if (!quizErr && quizRecords) {
        const scoresMap = {};
        quizRecords.forEach((q) => {
          scoresMap[q.id] = {
            score: q.score,
            total: q.total_questions,
            percentage: q.total_questions > 0 ? Math.round((q.score / q.total_questions) * 100) : 0,
            title: q.title,
            subject: q.subject,
            date: q.completion_timestamp ? new Date(q.completion_timestamp).toLocaleDateString() : 'Recently'
          };
        });
        setQuizScores(scoresMap);
      }

      // 8. Load Generated Quizzes (PDF Quizzes)
      try {
        const { data: genQuizData, error: genQuizErr } = await supabase
          .from('generated_quizzes')
          .select('*')
          .order('created_at', { ascending: false });

        if (!genQuizErr && genQuizData) {
          setGeneratedQuizzes(genQuizData.map((q) => ({
            id: q.id,
            title: q.title,
            subject: q.subject,
            difficulty: q.difficulty,
            questionType: q.question_type,
            numQuestions: q.num_questions,
            sourcePdfName: q.source_pdf_name,
            questions: Array.isArray(q.questions) ? q.questions : [],
            createdAt: q.created_at,
          })));
        }
      } catch (gqErr) {
        console.warn('Supabase generated_quizzes sync notice:', gqErr.message);
      }

      // 9. Load Quiz Attempts & History
      try {
        const { data: attemptsData, error: attemptsErr } = await supabase
          .from('quiz_attempts')
          .select('*')
          .order('completed_at', { ascending: false });

        if (!attemptsErr && attemptsData) {
          setQuizAttempts(attemptsData.map((a) => ({
            id: a.id,
            quizId: a.quiz_id,
            quizTitle: a.quiz_title,
            subject: a.subject,
            score: a.score,
            totalQuestions: a.total_questions,
            percentage: a.percentage,
            answers: a.answers || {},
            completedAt: a.completed_at,
          })));
        }
      } catch (attErr) {
        console.warn('Supabase quiz_attempts sync notice:', attErr.message);
      }

      // 10. Load AI Conversations
      const { data: convData, error: convErr } = await supabase
        .from('ai_conversations')
        .select('*')
        .order('updated_at', { ascending: false });

      if (!convErr && convData) {
        const mappedConvs = convData.map((c) => ({
          id: c.id,
          title: c.title,
          createdAt: c.created_at,
          updatedAt: c.updated_at,
        }));
        setAiConversations(mappedConvs);
        if (mappedConvs.length > 0 && !activeAiConversationId) {
          setActiveAiConversationId(mappedConvs[0].id);
        }
      }
    } catch (err) {
      console.warn('LearnMate Supabase sync notice:', err.message);
    }
  }, [supabaseReady, activeAiConversationId]);

  // ============================================================================
  // SUPABASE AUTHENTICATION & SESSION PERSISTENCE
  // ============================================================================

  useEffect(() => {
    if (!supabaseReady) {
      setAuthLoading(false);
      return;
    }

    // Check active session on initial page load
    supabase.auth.getSession().then(({ data: { session: activeSession } }) => {
      if (activeSession?.user) {
        setSession(activeSession);
        setIsAuthenticated(true);
        loadUserDataFromSupabase(
          activeSession.user.id,
          activeSession.user.email,
          activeSession.user.user_metadata
        );
      } else {
        const localAuth = localStorage.getItem('learnmate_auth') === 'true';
        setIsAuthenticated(localAuth);
      }
      setAuthLoading(false);
    });

    // Listen to Supabase Auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        setIsAuthenticated(true);
        loadUserDataFromSupabase(
          newSession.user.id,
          newSession.user.email,
          newSession.user.user_metadata
        );
      } else if (event === 'SIGNED_OUT') {
        setIsAuthenticated(false);
        setSession(null);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [supabaseReady, loadUserDataFromSupabase]);

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem('learnmate_user', JSON.stringify(user));
  }, [user]);

  useEffect(() => {
    localStorage.setItem('learnmate_timetable', JSON.stringify(timetable));
  }, [timetable]);

  useEffect(() => {
    localStorage.setItem('learnmate_assignments', JSON.stringify(assignments));
  }, [assignments]);

  useEffect(() => {
    localStorage.setItem('learnmate_notes', JSON.stringify(notes));
  }, [notes]);

  useEffect(() => {
    localStorage.setItem('learnmate_note_files', JSON.stringify(noteFiles));
  }, [noteFiles]);

  useEffect(() => {
    localStorage.setItem('learnmate_note_folders', JSON.stringify(noteFolders));
  }, [noteFolders]);

  useEffect(() => {
    localStorage.setItem('learnmate_exams', JSON.stringify(exams));
  }, [exams]);

  useEffect(() => {
    localStorage.setItem('learnmate_tasks', JSON.stringify(studyTasks));
  }, [studyTasks]);

  useEffect(() => {
    localStorage.setItem('learnmate_sessions', JSON.stringify(studySessions));
  }, [studySessions]);

  useEffect(() => {
    localStorage.setItem('learnmate_quizzes', JSON.stringify(quizzes));
  }, [quizzes]);

  useEffect(() => {
    localStorage.setItem('learnmate_quiz_scores', JSON.stringify(quizScores));
  }, [quizScores]);

  useEffect(() => {
    localStorage.setItem('learnmate_generated_quizzes', JSON.stringify(generatedQuizzes));
  }, [generatedQuizzes]);

  useEffect(() => {
    localStorage.setItem('learnmate_quiz_attempts', JSON.stringify(quizAttempts));
  }, [quizAttempts]);

  useEffect(() => {
    localStorage.setItem('learnmate_auth', isAuthenticated ? 'true' : 'false');
  }, [isAuthenticated]);

  useEffect(() => {
    localStorage.setItem('learnmate_ai_conversations', JSON.stringify(aiConversations));
  }, [aiConversations]);

  useEffect(() => {
    if (activeAiConversationId) {
      localStorage.setItem('learnmate_active_ai_conversation', activeAiConversationId);
    } else {
      localStorage.removeItem('learnmate_active_ai_conversation');
    }
  }, [activeAiConversationId]);

  // ============================================================================
  // AUTH METHODS
  // ============================================================================

  const formatAuthErrorMessage = (err) => {
    const msg = typeof err === 'string' ? err : err?.message || String(err || '');
    if (/User already registered|already exists|unique_email/i.test(msg)) {
      return 'An account with this email address already exists. Please sign in instead.';
    }
    if (/Password should be at least/i.test(msg)) {
      return 'Password must be at least 6 characters long.';
    }
    if (/rate limit|over_email_send_rate_limit/i.test(msg)) {
      return 'Too many requests. Please wait a moment before trying again.';
    }
    if (/invalid email/i.test(msg)) {
      return 'Please enter a valid student email address.';
    }
    if (/invalid login credentials|invalid_grant/i.test(msg)) {
      return 'Invalid email or password. Please check your credentials and try again.';
    }
    if (/Email not confirmed/i.test(msg)) {
      return 'Email confirmation is currently enabled in your Supabase project. To enable instant registration without email verification, go to Supabase Dashboard ➔ Authentication ➔ Providers ➔ Email, and turn OFF "Confirm email".';
    }
    if (/Error sending confirmation email/i.test(msg)) {
      return 'Supabase attempted to send a confirmation email. To allow instant registration without email delivery, go to Supabase Dashboard ➔ Authentication ➔ Providers ➔ Email, and turn OFF "Confirm email".';
    }
    return msg;
  };

  const signupUser = async (formData) => {
    const email = (formData.email || '').trim().toLowerCase();
    const password = formData.password || '';
    const name = (formData.name || '').trim();
    const institution = (formData.institution || '').trim();
    const program = (formData.program || '').trim();

    if (!supabaseReady) {
      // Local/Guest fallback
      setIsAuthenticated(true);
      localStorage.setItem('learnmate_auth', 'true');
      setUser({
        ...defaultUser,
        id: `usr_${Date.now()}`,
        name: name || 'Student User',
        email,
        institution,
        program,
      });
      showToast('Account created! (Local offline mode)');
      return { success: true };
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
            institution,
            program,
          },
        },
      });

      if (error) {
        return { success: false, error: formatAuthErrorMessage(error) };
      }

      // Check if user already exists (Supabase returns empty identities array when email is taken)
      if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        return {
          success: false,
          error: 'An account with this email address already exists. Please sign in instead.',
          code: 'USER_ALREADY_EXISTS',
          email,
        };
      }

      // Direct active session from signUp (when "Confirm email" is OFF in Supabase)
      if (data?.session) {
        setSession(data.session);
        setIsAuthenticated(true);
        localStorage.setItem('learnmate_auth', 'true');
        loadUserDataFromSupabase(data.user.id, data.user.email, data.user.user_metadata);
        showToast('Welcome to LearnMate! Account created.');
        return { success: true, session: data.session };
      }

      // If user was created but no session was returned, perform immediate sign-in
      if (data?.user) {
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (!signInErr && signInData?.session) {
          setSession(signInData.session);
          setIsAuthenticated(true);
          localStorage.setItem('learnmate_auth', 'true');
          loadUserDataFromSupabase(signInData.user.id, signInData.user.email, signInData.user.user_metadata);
          showToast('Welcome to LearnMate! Account created.');
          return { success: true, session: signInData.session };
        }

        if (signInErr && /Email not confirmed/i.test(signInErr.message)) {
          return {
            success: false,
            error: 'Email confirmation is still turned ON in your Supabase project. In Supabase Dashboard ➔ Authentication ➔ Providers ➔ Email, turn OFF "Confirm email" to enable instant registration.',
          };
        }
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: formatAuthErrorMessage(err) };
    }
  };

  const resendConfirmationEmail = async () => {
    return { success: true, message: 'Email confirmation is disabled.' };
  };

  const loginUser = async (rawEmail, password) => {
    const email = (rawEmail || '').trim().toLowerCase();
    if (!supabaseReady) {
      setIsAuthenticated(true);
      localStorage.setItem('learnmate_auth', 'true');
      setUser((prev) => ({
        ...prev,
        email: email || prev.email,
        name: prev.name || 'Student'
      }));
      showToast('Signed in successfully! (Local offline mode)');
      return { success: true };
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return {
          success: false,
          error: formatAuthErrorMessage(error),
          email,
        };
      }

      if (data?.session) {
        setSession(data.session);
        setIsAuthenticated(true);
        localStorage.setItem('learnmate_auth', 'true');
        loadUserDataFromSupabase(data.user.id, data.user.email, data.user.user_metadata);
        showToast('Welcome back! Logged in successfully.');
        return { success: true };
      }

      return { success: false, error: 'Unable to establish session.' };
    } catch (err) {
      return { success: false, error: formatAuthErrorMessage(err) };
    }
  };

  const loginDemoUser = () => {
    setIsAuthenticated(true);
    localStorage.setItem('learnmate_auth', 'true');
    setUser({
      ...defaultUser,
      id: 'usr_guest',
      name: 'Guest Student',
      email: 'guest@learnmate.local',
      institution: '',
      program: 'My Studies'
    });
    setTimetable([]);
    setAssignments([]);
    setNotes([]);
    setExams([]);
    setStudyTasks([]);
    setStudySessions([]);
    setQuizzes([]);
    setQuizScores({});
    showToast('Signed in in Guest Mode');
    return { success: true };
  };

  const logoutUser = async () => {
    if (supabaseReady && session) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn('Signout note:', err.message);
      }
    }
    setSession(null);
    setIsAuthenticated(false);
    setUser(defaultUser);
    setTimetable([]);
    setAssignments([]);
    setNotes([]);
    setNoteFiles([]);
    setNoteFolders([]);
    setExams([]);
    setStudyTasks([]);
    setStudySessions([]);
    setQuizzes([]);
    setQuizScores({});
    setGeneratedQuizzes([]);
    setQuizAttempts([]);
    localStorage.removeItem('learnmate_user');
    localStorage.removeItem('learnmate_timetable');
    localStorage.removeItem('learnmate_assignments');
    localStorage.removeItem('learnmate_notes');
    localStorage.removeItem('learnmate_note_files');
    localStorage.removeItem('learnmate_note_folders');
    localStorage.removeItem('learnmate_exams');
    localStorage.removeItem('learnmate_tasks');
    localStorage.removeItem('learnmate_sessions');
    localStorage.removeItem('learnmate_quizzes');
    localStorage.removeItem('learnmate_quiz_scores');
    localStorage.removeItem('learnmate_generated_quizzes');
    localStorage.removeItem('learnmate_quiz_attempts');
    localStorage.removeItem('learnmate_ai_conversations');
    localStorage.removeItem('learnmate_active_ai_conversation');
    localStorage.setItem('learnmate_auth', 'false');
    setAiConversations([]);
    setActiveAiConversationId(null);
    setAiMessages([]);
    showToast('Logged out of LearnMate.', 'info');
  };

  const updateUser = async (updatedFields) => {
    setUser((prev) => ({ ...prev, ...updatedFields }));

    if (supabaseReady && session?.user) {
      try {
        await supabase
          .from('profiles')
          .update({
            full_name: updatedFields.name,
            institution: updatedFields.institution,
            program: updatedFields.program,
            term: updatedFields.term,
            avatar_url: updatedFields.avatar,
            updated_at: new Date().toISOString(),
          })
          .eq('id', session.user.id);
      } catch (err) {
        console.warn('Profile update notice:', err.message);
      }
    }

    showToast('Profile updated successfully!');
  };

  // ============================================================================
  // TIMETABLE ACTIONS
  // ============================================================================

  const addClass = async (classItem) => {
    const tempId = `tt_${Date.now()}`;
    const startTime = classItem.startTime || (classItem.time ? classItem.time.split('-')[0]?.trim() : null);
    const endTime = classItem.endTime || (classItem.time ? classItem.time.split('-')[1]?.trim() : null);
    const newClass = { ...classItem, id: tempId, startTime, endTime };

    if (supabaseReady && session?.user) {
      try {
        const { data, error } = await supabase
          .from('timetable')
          .insert([{
            user_id: session.user.id,
            subject: classItem.subject,
            code: classItem.code,
            day: classItem.day,
            start_time: startTime,
            end_time: endTime,
            time: classItem.time,
            room: classItem.room || 'TBA',
            instructor: classItem.instructor || 'TBA',
            type: classItem.type || 'Lecture',
            color: classItem.color || 'blue',
          }])
          .select()
          .single();

        if (!error && data) {
          setTimetable((prev) => [...prev, {
            id: data.id,
            day: data.day,
            subject: data.subject,
            code: data.code,
            startTime: data.start_time,
            endTime: data.end_time,
            time: data.time,
            room: data.room,
            instructor: data.instructor,
            type: data.type,
            color: data.color,
          }]);
          showToast(`Added ${classItem.subject} to timetable`);
          return;
        }
      } catch (err) {
        console.warn('Supabase addClass notice:', err.message);
      }
    }

    setTimetable((prev) => [...prev, newClass]);
    showToast(`Added ${classItem.subject} to timetable`);
  };

  const addMultipleClasses = async (newClasses = []) => {
    if (!Array.isArray(newClasses) || newClasses.length === 0) return { addedCount: 0, skippedCount: 0 };

    // Deduplicate against existing timetable items
    const nonDuplicates = newClasses.filter((newItem) => {
      return !timetable.some((existing) => {
        const sameDay = existing.day?.toLowerCase() === newItem.day?.toLowerCase();
        const sameCode = existing.code?.toLowerCase() === newItem.code?.toLowerCase();
        const sameTime = existing.time?.replace(/\s+/g, '').toLowerCase() === newItem.time?.replace(/\s+/g, '').toLowerCase();
        const sameSubject = existing.subject?.toLowerCase() === newItem.subject?.toLowerCase();
        return sameDay && (sameCode || (sameTime && sameSubject));
      });
    });

    const skippedCount = newClasses.length - nonDuplicates.length;
    if (nonDuplicates.length === 0) {
      showToast('No new classes added. All detected classes already exist in your timetable.', 'info');
      return { addedCount: 0, skippedCount };
    }

    if (supabaseReady && session?.user) {
      try {
        const rowsToInsert = nonDuplicates.map((item) => ({
          user_id: session.user.id,
          subject: item.subject,
          code: item.code || 'COURSE',
          day: item.day,
          start_time: item.startTime || (item.time ? item.time.split('-')[0]?.trim() : null),
          end_time: item.endTime || (item.time ? item.time.split('-')[1]?.trim() : null),
          time: item.time,
          room: item.room || 'TBA',
          instructor: item.instructor || 'Faculty',
          type: item.type || 'Lecture',
          color: item.color || 'blue',
        }));

        const { data, error } = await supabase
          .from('timetable')
          .insert(rowsToInsert)
          .select();

        if (!error && Array.isArray(data) && data.length > 0) {
          const insertedClasses = data.map((d) => ({
            id: d.id,
            day: d.day,
            subject: d.subject,
            code: d.code,
            startTime: d.start_time,
            endTime: d.end_time,
            time: d.time,
            room: d.room,
            instructor: d.instructor,
            type: d.type,
            color: d.color,
          }));

          setTimetable((prev) => [...prev, ...insertedClasses]);
          showToast(`✨ Added ${insertedClasses.length} classes to your timetable!${skippedCount > 0 ? ` (${skippedCount} duplicates skipped)` : ''}`);
          return { addedCount: insertedClasses.length, skippedCount };
        }
      } catch (err) {
        console.warn('Supabase addMultipleClasses notice:', err.message);
      }
    }

    // Fallback: local state & localStorage
    const localAssigned = nonDuplicates.map((item, idx) => ({
      ...item,
      id: item.id || `tt_batch_${Date.now()}_${idx}`,
      startTime: item.startTime || (item.time ? item.time.split('-')[0]?.trim() : null),
      endTime: item.endTime || (item.time ? item.time.split('-')[1]?.trim() : null),
    }));

    setTimetable((prev) => [...prev, ...localAssigned]);
    showToast(`✨ Added ${localAssigned.length} classes to your timetable!${skippedCount > 0 ? ` (${skippedCount} duplicates skipped)` : ''}`);
    return { addedCount: localAssigned.length, skippedCount };
  };

  const updateClass = async (id, updatedFields) => {
    setTimetable((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updatedFields } : item))
    );

    if (supabaseReady && session?.user) {
      try {
        const { id: _ignoredId, user_id: _ignoredUserId, created_at: _ignoredCreatedAt, ...cleanUpdates } = updatedFields;
        await supabase
          .from('timetable')
          .update(cleanUpdates)
          .eq('id', id);
      } catch (err) {
        console.warn('Supabase updateClass notice:', err.message);
      }
    }
    showToast('Class schedule updated');
  };

  const deleteClass = async (id) => {
    setTimetable((prev) => prev.filter((item) => item.id !== id));

    if (supabaseReady && session?.user) {
      try {
        await supabase
          .from('timetable')
          .delete()
          .eq('id', id);
      } catch (err) {
        console.warn('Supabase deleteClass notice:', err.message);
      }
    }

    showToast('Class removed from timetable', 'info');
  };

  // ============================================================================
  // ASSIGNMENT ACTIONS
  // ============================================================================

  const addAssignment = async (asg) => {
    const tempId = `asg_${Date.now()}`;
    const diffDays = asg.dueDate
      ? Math.ceil((new Date(asg.dueDate) - new Date()) / (1000 * 60 * 60 * 24))
      : 0;

    const newAsg = {
      ...asg,
      id: tempId,
      daysLeft: diffDays,
      progress: 0,
      status: 'pending'
    };

    if (supabaseReady && session?.user) {
      try {
        const { data, error } = await supabase
          .from('assignments')
          .insert([{
            user_id: session.user.id,
            title: asg.title,
            description: asg.description || '',
            subject: asg.subject,
            course_code: asg.courseCode || asg.subject,
            due_date: asg.dueDate || new Date().toISOString().split('T')[0],
            priority: asg.priority || 'medium',
            status: 'pending',
            progress: 0,
          }])
          .select()
          .single();

        if (!error && data) {
          setAssignments((prev) => [{
            id: data.id,
            title: data.title,
            subject: data.subject,
            courseCode: data.course_code,
            dueDate: data.due_date,
            daysLeft: diffDays,
            status: data.status,
            priority: data.priority,
            progress: data.progress,
            description: data.description,
          }, ...prev]);
          showToast('New assignment created!');
          return;
        }
      } catch (err) {
        console.warn('Supabase addAssignment notice:', err.message);
      }
    }

    setAssignments((prev) => [newAsg, ...prev]);
    showToast('New assignment created!');
  };

  const updateAssignment = async (id, updatedFields) => {
    setAssignments((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updatedFields } : item))
    );

    if (supabaseReady && session?.user) {
      try {
        const dbFields = {};
        if (updatedFields.title) dbFields.title = updatedFields.title;
        if (updatedFields.subject) dbFields.subject = updatedFields.subject;
        if (updatedFields.courseCode) dbFields.course_code = updatedFields.courseCode;
        if (updatedFields.dueDate) dbFields.due_date = updatedFields.dueDate;
        if (updatedFields.priority) dbFields.priority = updatedFields.priority;
        if (updatedFields.status) dbFields.status = updatedFields.status;
        if (updatedFields.progress !== undefined) dbFields.progress = updatedFields.progress;
        if (updatedFields.description !== undefined) dbFields.description = updatedFields.description;

        await supabase.from('assignments').update(dbFields).eq('id', id);
      } catch (err) {
        console.warn('Supabase updateAssignment notice:', err.message);
      }
    }
    showToast('Assignment updated');
  };

  const toggleAssignmentStatus = async (id) => {
    let nextStatus = 'completed';
    let nextProgress = 100;

    setAssignments((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          nextStatus = item.status === 'completed' ? 'pending' : 'completed';
          nextProgress = nextStatus === 'completed' ? 100 : item.progress === 100 ? 50 : item.progress;
          return {
            ...item,
            status: nextStatus,
            progress: nextProgress
          };
        }
        return item;
      })
    );

    if (supabaseReady && session?.user) {
      try {
        await supabase
          .from('assignments')
          .update({
            status: nextStatus,
            progress: nextProgress,
          })
          .eq('id', id);
      } catch (err) {
        console.warn('Supabase toggleAssignment notice:', err.message);
      }
    }

    showToast('Assignment status updated');
  };

  const deleteAssignment = async (id) => {
    setAssignments((prev) => prev.filter((item) => item.id !== id));

    if (supabaseReady && session?.user) {
      try {
        await supabase
          .from('assignments')
          .delete()
          .eq('id', id);
      } catch (err) {
        console.warn('Supabase deleteAssignment notice:', err.message);
      }
    }

    showToast('Assignment deleted', 'info');
  };

  // ============================================================================
  // NOTES ACTIONS
  // ============================================================================

  const addNote = async (note) => {
    const tempId = `note_${Date.now()}`;
    const newNote = {
      ...note,
      id: tempId,
      updatedAt: 'Just now',
      favorite: false,
      tags: note.tags || ['General']
    };

    if (supabaseReady && session?.user) {
      try {
        const { data, error } = await supabase
          .from('notes')
          .insert([{
            user_id: session.user.id,
            title: note.title,
            content: note.content || '',
            subject: note.subject || 'General Studies',
            favorite: false,
          }])
          .select()
          .single();

        if (!error && data) {
          setNotes((prev) => [{
            id: data.id,
            title: data.title,
            content: data.content,
            subject: data.subject,
            favorite: data.favorite,
            tags: note.tags || ['General'],
            updatedAt: 'Just now',
          }, ...prev]);
          showToast('Note created successfully!');
          return;
        }
      } catch (err) {
        console.warn('Supabase addNote notice:', err.message);
      }
    }

    setNotes((prev) => [newNote, ...prev]);
    showToast('Note created successfully!');
  };

  const updateNote = async (id, updatedFields) => {
    setNotes((prev) =>
      prev.map((note) =>
        note.id === id ? { ...note, ...updatedFields, updatedAt: 'Just now' } : note
      )
    );

    if (supabaseReady && session?.user) {
      try {
        const dbFields = {};
        if (updatedFields.title !== undefined) dbFields.title = updatedFields.title;
        if (updatedFields.content !== undefined) dbFields.content = updatedFields.content;
        if (updatedFields.subject !== undefined) dbFields.subject = updatedFields.subject;
        if (updatedFields.favorite !== undefined) dbFields.favorite = updatedFields.favorite;
        dbFields.updated_at = new Date().toISOString();

        await supabase
          .from('notes')
          .update(dbFields)
          .eq('id', id);
      } catch (err) {
        console.warn('Supabase updateNote notice:', err.message);
      }
    }

    showToast('Note updated!');
  };

  const deleteNote = async (id) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));

    if (supabaseReady && session?.user) {
      try {
        await supabase
          .from('notes')
          .delete()
          .eq('id', id);
      } catch (err) {
        console.warn('Supabase deleteNote notice:', err.message);
      }
    }

    showToast('Note removed', 'info');
  };

  const toggleFavoriteNote = async (id) => {
    let nextFav = false;
    setNotes((prev) =>
      prev.map((n) => {
        if (n.id === id) {
          nextFav = !n.favorite;
          return { ...n, favorite: nextFav };
        }
        return n;
      })
    );

    if (supabaseReady && session?.user) {
      try {
        await supabase
          .from('notes')
          .update({ favorite: nextFav })
          .eq('id', id);
      } catch (err) {
        console.warn('Supabase toggleFavoriteNote notice:', err.message);
      }
    }
  };

  // ============================================================================
  // SMART NOTES ACTIONS (Supabase Storage & Folders)
  // ============================================================================

  const MAX_NOTE_FILE_SIZE = 20 * 1024 * 1024; // 20MB limit
  const ALLOWED_NOTE_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
  const ALLOWED_NOTE_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png'];

  const validateNoteFile = (file) => {
    if (!file) return { valid: false, error: 'No file selected.' };
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const type = file.type || '';
    const isAllowedExt = ALLOWED_NOTE_EXTENSIONS.includes(ext);
    const isAllowedMime = ALLOWED_NOTE_MIME_TYPES.includes(type.toLowerCase()) || isAllowedExt;

    if (!isAllowedExt && !isAllowedMime) {
      return {
        valid: false,
        error: `"${file.name}" has an unsupported format. Allowed formats: PDF, JPG, JPEG, PNG.`,
      };
    }

    if (file.size > MAX_NOTE_FILE_SIZE) {
      return {
        valid: false,
        error: `"${file.name}" exceeds the 20MB limit (${(file.size / (1024 * 1024)).toFixed(1)}MB).`,
      };
    }

    return { valid: true };
  };

  const uploadNoteFiles = async (fileList, metadata = {}, onProgress = null) => {
    const rawFiles = Array.from(fileList || []);
    if (rawFiles.length === 0) {
      return { success: false, error: 'No files selected for upload.' };
    }

    // Pre-validate all files
    for (const f of rawFiles) {
      const check = validateNoteFile(f);
      if (!check.valid) {
        showToast(check.error, 'error');
        return { success: false, error: check.error };
      }
    }

    const uploadedRecords = [];
    const totalFiles = rawFiles.length;

    for (let i = 0; i < totalFiles; i++) {
      const file = rawFiles[i];
      if (onProgress) {
        onProgress(Math.round(((i) / totalFiles) * 100), file.name);
      }

      const tempId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `file_${Date.now()}_${i}`;
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      const cleanBaseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const userId = session?.user?.id || 'local_student';
      const folderPathSegment = metadata.folderId || 'root';
      const storagePath = `${userId}/${folderPathSegment}/${Date.now()}_${Math.random().toString(36).substring(2, 6)}_${cleanFileName}`;
      const mimeType = file.type || (ext === 'pdf' ? 'application/pdf' : `image/${ext}`);
      const nowIso = new Date().toISOString();

      let previewUrl = '';
      let savedToDb = false;
      let recordId = tempId;

      // Primary: Upload to Supabase Storage and DB
      if (supabaseReady && session?.user) {
        try {
          const { error: storageErr } = await supabase.storage
            .from('smart_notes')
            .upload(storagePath, file, {
              cacheControl: '3600',
              upsert: false,
            });

          if (!storageErr) {
            // Retrieve signed URL for immediate preview
            const { data: signedData } = await supabase.storage
              .from('smart_notes')
              .createSignedUrl(storagePath, 3600 * 24);
            if (signedData?.signedUrl) {
              previewUrl = signedData.signedUrl;
            }

            // Insert into note_files table
            const { data: dbData, error: dbErr } = await supabase
              .from('note_files')
              .insert([{
                user_id: session.user.id,
                folder_id: metadata.folderId || null,
                title: metadata.title || cleanBaseName,
                file_name: file.name,
                file_path: storagePath,
                file_size: file.size,
                file_type: mimeType,
                file_ext: ext,
                subject: metadata.subject || '',
                module: metadata.module || '',
                topic: metadata.topic || '',
                favorite: false,
                storage_bucket: 'smart_notes',
                description: metadata.description || '',
              }])
              .select()
              .single();

            if (!dbErr && dbData) {
              recordId = dbData.id;
              savedToDb = true;
            }
          } else {
            console.warn('Supabase storage upload notice:', storageErr.message);
          }
        } catch (err) {
          console.warn('Upload exception:', err.message);
        }
      }

      // Offline / Local fallback preview URL
      if (!previewUrl) {
        try {
          previewUrl = URL.createObjectURL(file);
        } catch {}
      }

      const fileRecord = {
        id: recordId,
        folderId: metadata.folderId || null,
        title: metadata.title || cleanBaseName,
        fileName: file.name,
        filePath: storagePath,
        fileSize: file.size,
        fileType: mimeType,
        fileExt: ext,
        subject: metadata.subject || '',
        module: metadata.module || '',
        topic: metadata.topic || '',
        favorite: false,
        storageBucket: 'smart_notes',
        description: metadata.description || '',
        createdAt: nowIso,
        updatedAt: nowIso,
        previewUrl: previewUrl,
        isLocalFallback: !savedToDb,
      };

      uploadedRecords.push(fileRecord);
    }

    if (onProgress) {
      onProgress(100, 'Complete');
    }

    setNoteFiles((prev) => [...uploadedRecords, ...prev]);
    showToast(`Successfully uploaded ${uploadedRecords.length} file${uploadedRecords.length > 1 ? 's' : ''}!`);
    return { success: true, count: uploadedRecords.length, files: uploadedRecords };
  };

  const deleteNoteFile = async (id) => {
    const file = noteFiles.find((f) => f.id === id);
    setNoteFiles((prev) => prev.filter((f) => f.id !== id));

    if (supabaseReady && session?.user && file) {
      try {
        if (file.filePath && file.storageBucket) {
          await supabase.storage
            .from(file.storageBucket)
            .remove([file.filePath]);
        }
        await supabase
          .from('note_files')
          .delete()
          .eq('id', id);
      } catch (err) {
        console.warn('Supabase deleteNoteFile notice:', err.message);
      }
    }

    showToast('File removed', 'info');
  };

  const renameNoteFile = async (id, updates) => {
    setNoteFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...updates, updatedAt: new Date().toISOString() } : f))
    );

    if (supabaseReady && session?.user) {
      try {
        const dbUpdates = {};
        if (updates.title !== undefined) dbUpdates.title = updates.title;
        if (updates.subject !== undefined) dbUpdates.subject = updates.subject;
        if (updates.module !== undefined) dbUpdates.module = updates.module;
        if (updates.topic !== undefined) dbUpdates.topic = updates.topic;
        if (updates.folderId !== undefined) dbUpdates.folder_id = updates.folderId;
        if (updates.description !== undefined) dbUpdates.description = updates.description;
        dbUpdates.updated_at = new Date().toISOString();

        await supabase
          .from('note_files')
          .update(dbUpdates)
          .eq('id', id);
      } catch (err) {
        console.warn('Supabase renameNoteFile notice:', err.message);
      }
    }

    showToast('Note updated!');
  };

  const toggleFavoriteNoteFile = async (id) => {
    let nextFav = false;
    setNoteFiles((prev) =>
      prev.map((f) => {
        if (f.id === id) {
          nextFav = !f.favorite;
          return { ...f, favorite: nextFav };
        }
        return f;
      })
    );

    if (supabaseReady && session?.user) {
      try {
        await supabase
          .from('note_files')
          .update({ favorite: nextFav })
          .eq('id', id);
      } catch (err) {
        console.warn('Supabase toggleFavoriteNoteFile notice:', err.message);
      }
    }
  };

  const downloadNoteFile = async (file) => {
    if (!file) return;

    try {
      showToast(`Preparing download for ${file.fileName}...`, 'info');
      let url = file.previewUrl;

      if ((!url || url.startsWith('http')) && supabaseReady && file.filePath) {
        const { data } = await supabase.storage
          .from(file.storageBucket || 'smart_notes')
          .createSignedUrl(file.filePath, 300, { download: file.fileName });
        if (data?.signedUrl) {
          url = data.signedUrl;
        }
      }

      if (url) {
        const resp = await fetch(url);
        const blob = await resp.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = file.fileName || `${file.title}.${file.fileExt}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
        showToast('Download started!');
      } else {
        throw new Error('Could not generate download link.');
      }
    } catch (err) {
      console.warn('Download error:', err);
      showToast('Download failed. Please check network connection.', 'error');
    }
  };

  const getNoteFilePreviewUrl = async (file) => {
    if (!file) return '';
    if (file.previewUrl && !file.previewUrl.includes('expires=')) {
      return file.previewUrl;
    }

    if (supabaseReady && file.filePath) {
      try {
        const { data } = await supabase.storage
          .from(file.storageBucket || 'smart_notes')
          .createSignedUrl(file.filePath, 3600);
        if (data?.signedUrl) {
          setNoteFiles((prev) =>
            prev.map((f) => (f.id === file.id ? { ...f, previewUrl: data.signedUrl } : f))
          );
          return data.signedUrl;
        }
      } catch (err) {
        console.warn('Error creating signed preview url:', err);
      }
    }

    return file.previewUrl || '';
  };

  const createNoteFolder = async ({ name, parentId = null, subject = '', module = '', topic = '', color = '#52796F' }) => {
    const trimmed = (name || '').trim();
    if (!trimmed) {
      showToast('Please enter a folder name.', 'error');
      return null;
    }

    const tempId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `folder_${Date.now()}`;
    const nowIso = new Date().toISOString();

    const newFolder = {
      id: tempId,
      name: trimmed,
      parentId: parentId || null,
      subject: subject || '',
      module: module || '',
      topic: topic || '',
      color: color || '#52796F',
      createdAt: nowIso,
    };

    if (supabaseReady && session?.user) {
      try {
        const { data, error } = await supabase
          .from('note_folders')
          .insert([{
            user_id: session.user.id,
            name: trimmed,
            parent_id: parentId || null,
            subject: subject || '',
            module: module || '',
            topic: topic || '',
            color: color || '#52796F',
          }])
          .select()
          .single();

        if (!error && data) {
          const created = {
            id: data.id,
            name: data.name,
            parentId: data.parent_id,
            subject: data.subject || '',
            module: data.module || '',
            topic: data.topic || '',
            color: data.color || '#52796F',
            createdAt: data.created_at,
          };
          setNoteFolders((prev) => [created, ...prev]);
          showToast(`Folder "${trimmed}" created!`);
          return created;
        }
      } catch (err) {
        console.warn('Supabase createNoteFolder notice:', err.message);
      }
    }

    setNoteFolders((prev) => [newFolder, ...prev]);
    showToast(`Folder "${trimmed}" created!`);
    return newFolder;
  };

  const renameNoteFolder = async (folderId, newName) => {
    const trimmed = (newName || '').trim();
    if (!trimmed) return;

    setNoteFolders((prev) =>
      prev.map((f) => (f.id === folderId ? { ...f, name: trimmed } : f))
    );

    if (supabaseReady && session?.user) {
      try {
        await supabase
          .from('note_folders')
          .update({ name: trimmed, updated_at: new Date().toISOString() })
          .eq('id', folderId);
      } catch (err) {
        console.warn('Supabase renameNoteFolder notice:', err.message);
      }
    }

    showToast('Folder renamed!');
  };

  const deleteNoteFolder = async (folderId) => {
    setNoteFolders((prev) => prev.filter((f) => f.id !== folderId && f.parentId !== folderId));
    setNoteFiles((prev) => prev.filter((f) => f.folderId !== folderId));

    if (supabaseReady && session?.user) {
      try {
        await supabase
          .from('note_folders')
          .delete()
          .eq('id', folderId);
      } catch (err) {
        console.warn('Supabase deleteNoteFolder notice:', err.message);
      }
    }

    showToast('Folder deleted', 'info');
  };

  // ============================================================================
  // EXAM ACTIONS
  // ============================================================================

  const addExam = async (exam) => {
    const tempId = `ex_${Date.now()}`;
    const examDateStr = exam.date || new Date().toISOString().split('T')[0];
    const examStartTime = exam.startTime || (exam.time ? exam.time.split('-')[0]?.trim() : '10:00 AM');
    const examEndTime = exam.endTime || (exam.time && exam.time.includes('-') ? exam.time.split('-')[1]?.trim() : '12:00 PM');
    const examTime = exam.time || `${examStartTime} - ${examEndTime}`;

    let combinedIso = new Date().toISOString();
    try {
      const [year, month, day] = examDateStr.split('-').map(Number);
      let hours = 10;
      let minutes = 0;
      if (examStartTime) {
        const timeMatch = examStartTime.match(/(\d+):(\d+)\s*(AM|PM)?/i);
        if (timeMatch) {
          hours = parseInt(timeMatch[1], 10);
          minutes = parseInt(timeMatch[2], 10);
          const isPm = (timeMatch[3] || '').toUpperCase() === 'PM';
          if (isPm && hours < 12) hours += 12;
          if (!isPm && hours === 12) hours = 0;
        }
      }
      const combinedDate = new Date(year, month - 1, day, hours, minutes);
      if (!isNaN(combinedDate.getTime())) {
        combinedIso = combinedDate.toISOString();
      }
    } catch (e) {
      combinedIso = exam.date ? new Date(exam.date).toISOString() : new Date().toISOString();
    }

    const syllabusPayload = JSON.stringify({
      examName: exam.examName || exam.syllabus || 'Exam',
      time: examTime,
      startTime: examStartTime,
      endTime: examEndTime,
      duration: exam.duration || '1h 15m',
      session: exam.session || (examStartTime.includes('PM') ? 'Afternoon' : 'Morning'),
      day: exam.day || exam.dayOfWeek || ''
    });

    const newExam = {
      ...exam,
      id: tempId,
      examName: exam.examName || exam.syllabus || 'Exam',
      venue: exam.venue || exam.room || 'Main Hall',
      room: exam.venue || exam.room || 'Main Hall',
      date: examDateStr,
      startTime: examStartTime,
      endTime: examEndTime,
      time: examTime,
      duration: exam.duration || '1h 15m',
      session: exam.session || (examStartTime.includes('PM') ? 'Afternoon' : 'Morning'),
      day: exam.day || exam.dayOfWeek || '',
      dayOfWeek: exam.day || exam.dayOfWeek || '',
      topics: exam.topics || []
    };

    if (supabaseReady && session?.user) {
      try {
        const { data, error } = await supabase
          .from('exams')
          .insert([{
            user_id: session.user.id,
            subject: exam.subject,
            code: exam.code || '',
            exam_date: combinedIso,
            syllabus: syllabusPayload,
            room: exam.venue || exam.room || 'Main Hall',
            weight: exam.weight || '30%',
            topics: exam.topics || [],
          }])
          .select()
          .single();

        if (!error && data) {
          setExams((prev) => [...prev, {
            ...newExam,
            id: data.id,
          }]);
          showToast('Exam scheduled!');
          return;
        }
      } catch (err) {
        console.warn('Supabase addExam notice:', err.message);
      }
    }

    setExams((prev) => [...prev, newExam]);
    showToast('Exam scheduled!');
  };

  const addMultipleExams = async (newExams = [], createStudyPlan = true, overwriteDuplicates = false) => {
    if (!Array.isArray(newExams) || newExams.length === 0) return { addedCount: 0, skippedCount: 0, updatedCount: 0, generatedTasksCount: 0 };

    let toInsert = [];
    let toUpdate = [];
    let skipped = [];

    newExams.forEach((newItem) => {
      const existingMatch = exams.find((existing) => {
        const sameSubject = existing.subject?.toLowerCase() === newItem.subject?.toLowerCase();
        const sameDate = existing.date === newItem.date;
        const sameCode = existing.code && newItem.code && existing.code.toLowerCase() === newItem.code.toLowerCase();
        return (sameSubject && sameDate) || (sameCode && sameDate);
      });

      if (existingMatch) {
        if (overwriteDuplicates) {
          toUpdate.push({ ...newItem, id: existingMatch.id });
        } else {
          skipped.push(newItem);
        }
      } else {
        toInsert.push(newItem);
      }
    });

    if (toInsert.length === 0 && toUpdate.length === 0) {
      showToast('No new changes. All detected exams already exist in your schedule.', 'info');
      return { addedCount: 0, updatedCount: 0, skippedCount: skipped.length, generatedTasksCount: 0 };
    }

    let insertedExams = [];

    // 1. Process Updates if overwrite is selected
    if (toUpdate.length > 0) {
      for (const item of toUpdate) {
        await updateExam(item.id, item);
      }
    }

    // 2. Process Inserts
    if (toInsert.length > 0) {
      if (supabaseReady && session?.user) {
        try {
          const rowsToInsert = toInsert.map((item) => {
            const itemDateStr = item.date || new Date().toISOString().split('T')[0];
            const itemStartTime = item.startTime || (item.time ? item.time.split('-')[0]?.trim() : '10:00 AM');
            const itemEndTime = item.endTime || (item.time && item.time.includes('-') ? item.time.split('-')[1]?.trim() : '12:00 PM');
            const itemTime = item.time || `${itemStartTime} - ${itemEndTime}`;

            let combinedIso = new Date().toISOString();
            try {
              const [year, month, day] = itemDateStr.split('-').map(Number);
              let hours = 10;
              let minutes = 0;
              if (itemStartTime) {
                const timeMatch = itemStartTime.match(/(\d+):(\d+)\s*(AM|PM)?/i);
                if (timeMatch) {
                  hours = parseInt(timeMatch[1], 10);
                  minutes = parseInt(timeMatch[2], 10);
                  const isPm = (timeMatch[3] || '').toUpperCase() === 'PM';
                  if (isPm && hours < 12) hours += 12;
                  if (!isPm && hours === 12) hours = 0;
                }
              }
              const combinedDate = new Date(year, month - 1, day, hours, minutes);
              if (!isNaN(combinedDate.getTime())) {
                combinedIso = combinedDate.toISOString();
              }
            } catch (e) {
              combinedIso = item.date ? new Date(item.date).toISOString() : new Date().toISOString();
            }

            const syllabusPayload = JSON.stringify({
              examName: item.examName || item.syllabus || 'Semester Exam',
              time: itemTime,
              startTime: itemStartTime,
              endTime: itemEndTime,
              duration: item.duration || '1h 15m',
              session: item.session || (itemStartTime.includes('PM') ? 'Afternoon' : 'Morning'),
              day: item.day || item.dayOfWeek || ''
            });

            return {
              user_id: session.user.id,
              subject: item.subject,
              code: item.code || '',
              exam_date: combinedIso,
              syllabus: syllabusPayload,
              room: item.venue || item.room || 'Main Hall',
              weight: item.weight || '35%',
              topics: item.topics || [],
            };
          });

          const { data, error } = await supabase
            .from('exams')
            .insert(rowsToInsert)
            .select();

          if (!error && Array.isArray(data) && data.length > 0) {
            insertedExams = data.map((d, dIdx) => {
              const original = toInsert[dIdx] || {};
              return {
                ...original,
                id: d.id,
                subject: d.subject,
                code: d.code,
                examName: original.examName || d.syllabus || 'Semester Exam',
                syllabus: d.syllabus,
                date: original.date || (d.exam_date ? new Date(d.exam_date).toISOString().split('T')[0] : ''),
                time: original.time || '10:00 AM - 12:00 PM',
                startTime: original.startTime || '10:00 AM',
                endTime: original.endTime || '12:00 PM',
                day: original.day || original.dayOfWeek || 'Monday',
                dayOfWeek: original.day || original.dayOfWeek || 'Monday',
                duration: original.duration || '1h 15m',
                session: original.session || 'Morning',
                venue: d.room || original.venue || 'Main Hall',
                room: d.room || original.venue || 'Main Hall',
                status: d.status || 'upcoming',
                weight: d.weight,
                topics: d.topics || original.topics || [],
              };
            });
            setExams((prev) => [...prev, ...insertedExams]);
          }
        } catch (err) {
          console.warn('Supabase addMultipleExams notice:', err.message);
        }
      }

      if (insertedExams.length === 0) {
        insertedExams = toInsert.map((item, idx) => ({
          ...item,
          id: item.id || `ex_batch_${Date.now()}_${idx}`,
          venue: item.venue || item.room || 'Main Hall',
          room: item.venue || item.room || 'Main Hall',
        }));
        setExams((prev) => [...prev, ...insertedExams]);
      }
    }

    // Optionally generate personalized study plan
    let generatedTasksCount = 0;
    const allProcessed = [...insertedExams, ...toUpdate];
    if (createStudyPlan && allProcessed.length > 0) {
      const newStudyTasks = generateStudyTasksFromExams(allProcessed);
      if (newStudyTasks.length > 0) {
        setStudyTasks((prev) => [...newStudyTasks, ...prev]);
        generatedTasksCount = newStudyTasks.length;
      }
    }

    const summaryParts = [];
    if (insertedExams.length > 0) summaryParts.push(`Added ${insertedExams.length} new exams`);
    if (toUpdate.length > 0) summaryParts.push(`Updated ${toUpdate.length} existing exams`);
    if (skipped.length > 0) summaryParts.push(`Skipped ${skipped.length} duplicates`);
    if (generatedTasksCount > 0) summaryParts.push(`Created ${generatedTasksCount} study tasks`);

    showToast(summaryParts.join(' • '));
    return {
      addedCount: insertedExams.length,
      updatedCount: toUpdate.length,
      skippedCount: skipped.length,
      generatedTasksCount
    };
  };

  const updateExam = async (id, updatedFields) => {
    if (!id || !updatedFields) return;

    let updatedRecord = null;
    setExams((prev) =>
      prev.map((exam) => {
        if (exam.id === id) {
          updatedRecord = {
            ...exam,
            ...updatedFields,
            venue: updatedFields.venue || updatedFields.room || exam.venue,
            room: updatedFields.venue || updatedFields.room || exam.room,
          };
          return updatedRecord;
        }
        return exam;
      })
    );

    if (supabaseReady && session?.user && updatedRecord) {
      try {
        const itemDateStr = updatedRecord.date || new Date().toISOString().split('T')[0];
        const itemStartTime = updatedRecord.startTime || (updatedRecord.time ? updatedRecord.time.split('-')[0]?.trim() : '10:00 AM');
        const itemEndTime = updatedRecord.endTime || (updatedRecord.time && updatedRecord.time.includes('-') ? updatedRecord.time.split('-')[1]?.trim() : '12:00 PM');
        const itemTime = updatedRecord.time || `${itemStartTime} - ${itemEndTime}`;

        let combinedIso = new Date().toISOString();
        try {
          const [year, month, day] = itemDateStr.split('-').map(Number);
          let hours = 10;
          let minutes = 0;
          if (itemStartTime) {
            const timeMatch = itemStartTime.match(/(\d+):(\d+)\s*(AM|PM)?/i);
            if (timeMatch) {
              hours = parseInt(timeMatch[1], 10);
              minutes = parseInt(timeMatch[2], 10);
              const isPm = (timeMatch[3] || '').toUpperCase() === 'PM';
              if (isPm && hours < 12) hours += 12;
              if (!isPm && hours === 12) hours = 0;
            }
          }
          const combinedDate = new Date(year, month - 1, day, hours, minutes);
          if (!isNaN(combinedDate.getTime())) {
            combinedIso = combinedDate.toISOString();
          }
        } catch (e) {
          combinedIso = updatedRecord.date ? new Date(updatedRecord.date).toISOString() : new Date().toISOString();
        }

        const syllabusPayload = JSON.stringify({
          examName: updatedRecord.examName || updatedRecord.syllabus || 'Exam',
          time: itemTime,
          startTime: itemStartTime,
          endTime: itemEndTime,
          duration: updatedRecord.duration || '1h 15m',
          session: updatedRecord.session || (itemStartTime.includes('PM') ? 'Afternoon' : 'Morning'),
          day: updatedRecord.day || updatedRecord.dayOfWeek || ''
        });

        await supabase
          .from('exams')
          .update({
            subject: updatedRecord.subject,
            code: updatedRecord.code || '',
            exam_date: combinedIso,
            syllabus: syllabusPayload,
            room: updatedRecord.venue || updatedRecord.room || 'Main Hall',
            weight: updatedRecord.weight || '30%',
            topics: updatedRecord.topics || [],
          })
          .eq('id', id);
      } catch (err) {
        console.warn('Supabase updateExam notice:', err.message);
      }
    }

    showToast('Exam updated successfully!');
  };

  const toggleExamTopic = async (examId, topicId) => {
    let updatedTopics = [];
    setExams((prev) =>
      prev.map((exam) => {
        if (exam.id === examId) {
          updatedTopics = (exam.topics || []).map((t) =>
            t.id === topicId ? { ...t, done: !t.done } : t
          );
          return { ...exam, topics: updatedTopics };
        }
        return exam;
      })
    );

    if (supabaseReady && session?.user) {
      try {
        await supabase
          .from('exams')
          .update({ topics: updatedTopics })
          .eq('id', examId);
      } catch (err) {
        console.warn('Supabase toggleExamTopic notice:', err.message);
      }
    }
  };

  const deleteExam = async (id) => {
    setExams((prev) => prev.filter((e) => e.id !== id));

    if (supabaseReady && session?.user) {
      try {
        await supabase
          .from('exams')
          .delete()
          .eq('id', id);
      } catch (err) {
        console.warn('Supabase deleteExam notice:', err.message);
      }
    }

    showToast('Exam removed', 'info');
  };

  // ============================================================================
  // STUDY TASKS & SESSIONS
  // ============================================================================

  const toggleStudyTask = (id) => {
    setStudyTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
  };

  const addStudyTask = async (task) => {
    const newTask = {
      ...task,
      id: `st_${Date.now()}`,
      minutes: Number(task.minutes) || 30,
      subject: task.subject || 'General Study',
      completed: false
    };
    setStudyTasks((prev) => [newTask, ...prev]);

    if (supabaseReady && session?.user) {
      try {
        await supabase
          .from('study_sessions')
          .insert([{
            user_id: session.user.id,
            subject: task.subject || 'General Study',
            duration: Number(task.minutes) || 30,
            completion_status: 'completed',
          }]);
      } catch (err) {
        console.warn('Supabase study_session log notice:', err.message);
      }
    }

    showToast('Task added to daily goals!');
  };

  const deleteStudyTask = (id) => {
    setStudyTasks((prev) => prev.filter((t) => t.id !== id));
    showToast('Task removed from plan', 'info');
  };

  const addStudySession = async (sessionData) => {
    const newSession = {
      id: `sess_${Date.now()}`,
      subject: sessionData.subject || 'General Study',
      duration: Number(sessionData.duration) || 25,
      startTime: new Date().toISOString(),
      status: 'completed'
    };
    setStudySessions((prev) => [newSession, ...prev]);

    if (supabaseReady && session?.user) {
      try {
        await supabase
          .from('study_sessions')
          .insert([{
            user_id: session.user.id,
            subject: sessionData.subject || 'General Study',
            duration: Number(sessionData.duration) || 25,
            completion_status: 'completed',
          }]);
      } catch (err) {
        console.warn('Supabase study session notice:', err.message);
      }
    }
  };

  // ============================================================================
  // QUIZZES ACTIONS (User Created & Scored)
  // ============================================================================

  const addQuiz = (quiz) => {
    const newQuiz = {
      ...quiz,
      id: `quiz_${Date.now()}`,
      questionsCount: quiz.questions?.length || 0,
      durationMinutes: Math.max(3, Math.round((quiz.questions?.length || 1) * 2.5)),
      badgeColor: quiz.difficulty === 'Hard' ? 'lavender' : quiz.difficulty === 'Intermediate' ? 'blue' : 'emerald'
    };
    setQuizzes((prev) => [newQuiz, ...prev]);
    showToast(`Quiz "${quiz.title}" created!`);
  };

  const deleteQuiz = (quizId) => {
    setQuizzes((prev) => prev.filter((q) => q.id !== quizId));
    setQuizScores((prev) => {
      const copy = { ...prev };
      delete copy[quizId];
      return copy;
    });
    showToast('Quiz removed', 'info');
  };

  const saveQuizResult = async (quizId, score, total, quizTitle = 'Practice Quiz', subject = 'General') => {
    const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
    setQuizScores((prev) => ({
      ...prev,
      [quizId]: {
        score,
        total,
        percentage,
        title: quizTitle,
        subject,
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      }
    }));

    if (supabaseReady && session?.user) {
      try {
        await supabase
          .from('quizzes')
          .insert([{
            user_id: session.user.id,
            title: quizTitle,
            subject: subject,
            score,
            total_questions: total,
          }]);
      } catch (err) {
        console.warn('Supabase quiz result log notice:', err.message);
      }
    }

    showToast(`Quiz completed! Score: ${score}/${total} (${percentage}%)`);
  };

  // ============================================================================
  // PDF-TO-QUIZ GENERATOR (Powered by Google Gemini via Supabase Edge Function)
  // ============================================================================

  const generateQuizFromPdf = async ({
    file = null,
    pdfBase64 = null,
    pdfText = null,
    fileName = 'Study Document.pdf',
    numQuestions = 5,
    difficulty = 'Medium',
    questionType = 'MCQ',
    subject = ''
  }) => {
    let base64Payload = pdfBase64;
    let actualFileName = fileName;
    let extractedText = typeof pdfText === 'string' ? pdfText.trim() : '';
    let isScanned = false;

    // 1. If File/Blob is provided, extract text and clean base64
    if (file) {
      actualFileName = file.name || fileName;

      // Extract text if not already provided
      if (!extractedText) {
        try {
          console.log('[LearnMate Quiz Generator] Extracting text from PDF file:', actualFileName);
          const extraction = await extractTextFromPdf(file);
          if (extraction && extraction.text) {
            extractedText = extraction.text.trim();
            isScanned = !!extraction.isScanned;
            console.log(`[LearnMate Quiz Generator] Extracted ${extraction.pageCount} pages, ${extraction.charCount} characters (Scanned: ${isScanned})`);
          }
        } catch (extErr) {
          console.warn('[LearnMate Quiz Generator] PDF text extraction notice:', extErr.message);
        }
      }

      // Convert to clean base64
      if (!base64Payload) {
        try {
          base64Payload = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const res = reader.result;
              const clean = typeof res === 'string'
                ? res.replace(/^data:[^;]+;base64,/, '')
                : '';
              resolve(clean);
            };
            reader.onerror = (e) => reject(e);
            reader.readAsDataURL(file);
          });
        } catch (err) {
          console.warn('[LearnMate Quiz Generator] File to base64 conversion notice:', err);
        }
      }
    }

    // Verify we have document content
    if (!extractedText && !base64Payload) {
      const errMsg = 'Please upload a readable PDF document to generate quiz questions.';
      showToast(errMsg, 'error');
      return { success: false, error: errMsg };
    }

    const rawBaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
    const cleanBaseUrl = rawBaseUrl.trim().replace(/\/rest(\/v\d+)?\/?$/i, '').replace(/\/+$/, '');
    const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
    const authToken = session?.access_token || anonKey;

    if (!cleanBaseUrl || !anonKey) {
      const errMsg = 'Supabase credentials missing in .env. Please check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.';
      showToast(errMsg, 'error');
      return { success: false, error: errMsg };
    }

    showToast('Analyzing PDF with Google Gemini AI...', 'info');

    // Helper: Parse, validate and normalize quiz JSON
    const parseAndValidateQuiz = (rawString, fallbackTitle) => {
      if (!rawString || typeof rawString !== 'string') return null;
      let text = rawString.trim();

      // Strip markdown code fences if present
      if (text.startsWith('```')) {
        text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      }

      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch (e1) {
        // Fallback: extract substring between first { and last }
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start !== -1 && end !== -1 && end > start) {
          try {
            parsed = JSON.parse(text.substring(start, end + 1));
          } catch (e2) {
            console.warn('[LearnMate Quiz Generator] Substring JSON parse failed:', e2);
          }
        }
      }

      if (!parsed || typeof parsed !== 'object') return null;

      const rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : [];
      if (rawQuestions.length === 0) return null;

      const normalizedQuestions = rawQuestions.map((q, idx) => {
        let options = Array.isArray(q.options) ? q.options.map(String) : [];
        if (options.length < 2) {
          options = ['Option A', 'Option B', 'Option C', 'Option D'];
        }

        let answerIdx = 0;
        if (typeof q.answer === 'number' && q.answer >= 0 && q.answer < options.length) {
          answerIdx = q.answer;
        } else if (typeof q.answer === 'string') {
          const upper = q.answer.trim().toUpperCase();
          if (['A', 'B', 'C', 'D'].includes(upper)) {
            answerIdx = upper.charCodeAt(0) - 65;
          } else {
            const foundIdx = options.findIndex((opt) => opt.toLowerCase() === q.answer.trim().toLowerCase());
            if (foundIdx !== -1) answerIdx = foundIdx;
          }
        }

        return {
          id: q.id || `q_${idx + 1}`,
          question: q.question || `Question ${idx + 1}`,
          options,
          answer: answerIdx,
          explanation: q.explanation || 'Refer to the source document for more details.',
        };
      });

      return {
        title: parsed.title || fallbackTitle,
        subject: parsed.subject || subject || 'General',
        difficulty: parsed.difficulty || difficulty,
        questionType: parsed.questionType || questionType,
        questions: normalizedQuestions,
      };
    };

    let generatedQuiz = null;
    let lastError = null;

    // STRATEGY 1: Attempt dedicated Edge Function `generate-quiz`
    try {
      const edgeUrl = `${cleanBaseUrl}/functions/v1/generate-quiz`;
      console.log('[LearnMate Quiz Generator] Requesting generate-quiz endpoint:', edgeUrl);

      const response = await fetch(edgeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': anonKey,
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          pdfBase64: base64Payload,
          pdfText: extractedText,
          fileName: actualFileName,
          numQuestions: Number(numQuestions) || 5,
          difficulty: difficulty || 'Medium',
          questionType: questionType || 'MCQ',
          subject: subject || '',
        }),
      });

      if (response.ok) {
        const responseData = await response.json().catch(() => null);
        if (responseData?.ok && responseData?.quiz) {
          generatedQuiz = parseAndValidateQuiz(
            typeof responseData.quiz === 'string' ? responseData.quiz : JSON.stringify(responseData.quiz),
            `${actualFileName.replace(/\.pdf$/i, '')} Quiz`
          );
        }
      } else if (response.status === 404) {
        console.info('[LearnMate Quiz Generator] generate-quiz is not deployed (404). Falling back to active ai-doubt-solver...');
      } else {
        const errJson = await response.json().catch(() => null);
        lastError = errJson?.error || `Generation failed with status ${response.status}`;
      }
    } catch (edgeEx) {
      console.warn('[LearnMate Quiz Generator] Primary edge function notice:', edgeEx.message);
    }

    // STRATEGY 2: Seamless fallback to active, deployed Gemini Edge Function `ai-doubt-solver`
    if (!generatedQuiz) {
      try {
        const solverUrl = `${cleanBaseUrl}/functions/v1/ai-doubt-solver`;
        console.log('[LearnMate Quiz Generator] Invoking active Gemini edge function:', solverUrl);

        const promptDocumentContent = extractedText
          ? extractedText.substring(0, 100000)
          : `[Attached PDF Document: ${actualFileName}]`;

        const quizPrompt = `You are an expert academic tutor and quiz generator powered by Google Gemini.
Generate a high-quality ${numQuestions}-question ${questionType} practice quiz strictly based on the following document content.

DOCUMENT TITLE: ${actualFileName}
SUBJECT / TOPIC: ${subject || 'General'}
DIFFICULTY: ${difficulty}
QUESTION FORMAT: ${questionType}

DOCUMENT CONTENT:
"""
${promptDocumentContent}
"""

CRITICAL INSTRUCTIONS:
1. Strict Grounding: Every question, option, and explanation MUST be directly supported by the document text above. Do not hallucinate or include external unmentioned facts.
2. For MCQ: Provide exactly 4 distinct options per question.
3. For True/False: Provide exactly 2 options: ["True", "False"].
4. Identify the correct answer by its zero-based index (0, 1, 2, or 3) in the "answer" field.
5. Provide a clear, thorough explanation citing the exact text or concept from the document in the "explanation" field.
6. Format your output STRICTLY as a single valid JSON object. Do not include markdown code fences (like \`\`\`json) and no conversational preamble.

REQUIRED JSON FORMAT:
{
  "title": "${actualFileName.replace(/\.pdf$/i, '')} Practice Quiz",
  "subject": "${subject || 'General'}",
  "difficulty": "${difficulty}",
  "questionType": "${questionType}",
  "questions": [
    {
      "id": "q_1",
      "question": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": 0,
      "explanation": "Clear explanation citing the document..."
    }
  ]
}`;

        const solverRes = await fetch(solverUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': anonKey,
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify({ question: quizPrompt }),
        });

        if (solverRes.ok) {
          const solverData = await solverRes.json().catch(() => null);
          const rawAnswer = extractAnswerText(solverData);
          if (rawAnswer) {
            generatedQuiz = parseAndValidateQuiz(rawAnswer, `${actualFileName.replace(/\.pdf$/i, '')} Quiz`);
          }
        } else {
          const errData = await solverRes.json().catch(() => null);
          lastError = errData?.error || `Gemini Edge Function returned status ${solverRes.status}`;
        }
      } catch (solverEx) {
        console.error('[LearnMate Quiz Generator] Fallback Gemini invocation error:', solverEx);
        lastError = solverEx.message;
      }
    }

    if (!generatedQuiz || !Array.isArray(generatedQuiz.questions) || generatedQuiz.questions.length === 0) {
      const finalMsg = lastError || 'Failed to generate quiz from PDF. Please ensure the PDF contains readable text.';
      showToast(finalMsg, 'error');
      return { success: false, error: finalMsg };
    }

    const quizId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `quiz_gen_${Date.now()}`;

    const newQuizRecord = {
      id: quizId,
      title: generatedQuiz.title || `${actualFileName.replace(/\.pdf$/i, '')} Quiz`,
      subject: generatedQuiz.subject || subject || 'General',
      difficulty: generatedQuiz.difficulty || difficulty,
      questionType: generatedQuiz.questionType || questionType,
      numQuestions: generatedQuiz.questions.length,
      sourcePdfName: actualFileName,
      questions: generatedQuiz.questions,
      createdAt: new Date().toISOString(),
    };

    // Update state and local storage
    setGeneratedQuizzes((prev) => [newQuizRecord, ...prev]);

    // Save to Supabase if database table exists
    if (supabaseReady && session?.user) {
      try {
        const { data: dbData, error: dbErr } = await supabase
          .from('generated_quizzes')
          .insert([{
            user_id: session.user.id,
            title: newQuizRecord.title,
            subject: newQuizRecord.subject,
            difficulty: newQuizRecord.difficulty,
            question_type: newQuizRecord.questionType,
            num_questions: newQuizRecord.numQuestions,
            source_pdf_name: newQuizRecord.sourcePdfName,
            questions: newQuizRecord.questions,
          }])
          .select()
          .single();

        if (!dbErr && dbData) {
          newQuizRecord.id = dbData.id;
        }
      } catch (dbEx) {
        console.warn('Supabase save generated quiz notice:', dbEx.message);
      }
    }

    showToast(`Quiz ready! ${newQuizRecord.questions.length} questions created with Gemini.`);
    return { success: true, quiz: newQuizRecord };
  };

  const saveQuizAttempt = async ({ quizId, quizTitle, subject, score, total, answers = {} }) => {
    const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
    const attemptId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `att_${Date.now()}`;
    const nowIso = new Date().toISOString();

    const attemptRecord = {
      id: attemptId,
      quizId: quizId || null,
      quizTitle: quizTitle || 'Practice Quiz',
      subject: subject || 'General',
      score,
      totalQuestions: total,
      percentage,
      answers,
      completedAt: nowIso,
    };

    setQuizAttempts((prev) => [attemptRecord, ...prev]);

    // Update quizScores for backward compatibility
    if (quizId) {
      setQuizScores((prev) => ({
        ...prev,
        [quizId]: {
          score,
          total,
          percentage,
          title: quizTitle,
          subject,
          date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        }
      }));
    }

    if (supabaseReady && session?.user) {
      try {
        await supabase
          .from('quiz_attempts')
          .insert([{
            user_id: session.user.id,
            quiz_id: quizId && String(quizId).includes('-') ? quizId : null,
            quiz_title: quizTitle,
            subject: subject,
            score,
            total_questions: total,
            percentage,
            answers,
          }]);

        await supabase
          .from('quizzes')
          .insert([{
            user_id: session.user.id,
            title: quizTitle,
            subject: subject,
            score,
            total_questions: total,
          }]);
      } catch (err) {
        console.warn('Supabase save quiz attempt notice:', err.message);
      }
    }

    showToast(`Attempt recorded! Score: ${score}/${total} (${percentage}%)`);
    return attemptRecord;
  };

  const deleteGeneratedQuiz = async (quizId) => {
    setGeneratedQuizzes((prev) => prev.filter((q) => q.id !== quizId));
    setQuizAttempts((prev) => prev.filter((a) => a.quizId !== quizId));

    if (supabaseReady && session?.user) {
      try {
        await supabase.from('generated_quizzes').delete().eq('id', quizId);
      } catch (err) {
        console.warn('Supabase delete generated quiz notice:', err.message);
      }
    }

    showToast('Generated quiz removed', 'info');
  };

  const deleteQuizAttempt = async (attemptId) => {
    setQuizAttempts((prev) => prev.filter((a) => a.id !== attemptId));

    if (supabaseReady && session?.user) {
      try {
        await supabase.from('quiz_attempts').delete().eq('id', attemptId);
      } catch (err) {
        console.warn('Supabase delete quiz attempt notice:', err.message);
      }
    }

    showToast('Quiz attempt removed from history', 'info');
  };

  // ============================================================================
  // AI DOUBT SOLVER METHODS
  // ============================================================================

  const checkAiStatus = useCallback(async () => {
    if (isSupabaseConfigured()) {
      const status = {
        isConfigured: true,
        model: 'Gemini 3.5 Flash-Lite',
        provider: 'Google Gemini (Supabase Edge Function)',
      };
      setAiStatus(status);
      return status;
    }

    const status = {
      isConfigured: false,
      model: 'Gemini 3.5 Flash-Lite',
      provider: 'Google Gemini (Supabase Edge Function)',
    };
    setAiStatus(status);
    return status;
  }, []);

  // Check backend AI status on mount
  useEffect(() => {
    checkAiStatus();
  }, [checkAiStatus]);

  // Load messages for a given conversation
  const loadAiMessages = useCallback(async (convId) => {
    if (!convId) {
      setAiMessages([]);
      return;
    }

    if (supabaseReady && session?.user) {
      try {
        const { data, error } = await supabase
          .from('ai_messages')
          .select('*')
          .eq('conversation_id', convId)
          .order('created_at', { ascending: true });

        if (!error && data) {
          const mapped = data.map((m) => ({
            id: m.id,
            conversationId: m.conversation_id,
            role: m.role,
            content: m.content,
            createdAt: m.created_at,
          }));
          setAiMessages(mapped);
          return;
        }
      } catch (err) {
        console.warn('Supabase ai_messages fetch notice:', err.message);
      }
    }

    // LocalStorage fallback
    try {
      const saved = localStorage.getItem(`learnmate_ai_msgs_${convId}`);
      if (saved) {
        setAiMessages(JSON.parse(saved));
        return;
      }
    } catch {}
    setAiMessages([]);
  }, [supabaseReady, session]);

  // Reload messages when active conversation switches
  useEffect(() => {
    if (activeAiConversationId) {
      loadAiMessages(activeAiConversationId);
    } else {
      setAiMessages([]);
    }
  }, [activeAiConversationId, loadAiMessages]);

  const selectAiConversation = (convId) => {
    setActiveAiConversationId(convId);
    setAiError(null);
  };

  const createAiConversation = async (initialTitle = 'New Doubt') => {
    const newId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `conv_${Date.now()}`;
    const now = new Date().toISOString();

    const newConv = {
      id: newId,
      title: initialTitle,
      createdAt: now,
      updatedAt: now,
    };

    setAiConversations((prev) => [newConv, ...prev.filter((c) => c.id !== newId)]);
    setActiveAiConversationId(newId);
    setAiMessages([]);
    setAiError(null);

    // Save to Supabase if session active
    if (supabaseReady && session?.user) {
      try {
        await supabase.from('ai_conversations').insert([{
          id: newId,
          user_id: session.user.id,
          title: initialTitle,
          created_at: now,
          updated_at: now,
        }]);
      } catch (err) {
        console.warn('Supabase create conversation notice:', err.message);
      }
    }

    return newConv;
  };

  const renameAiConversation = async (convId, newTitle) => {
    const trimmed = (newTitle || '').trim();
    if (!trimmed) return;

    setAiConversations((prev) =>
      prev.map((c) => (c.id === convId ? { ...c, title: trimmed, updatedAt: new Date().toISOString() } : c))
    );

    if (supabaseReady && session?.user) {
      try {
        await supabase
          .from('ai_conversations')
          .update({ title: trimmed, updated_at: new Date().toISOString() })
          .eq('id', convId);
      } catch (err) {
        console.warn('Supabase rename conversation notice:', err.message);
      }
    }
  };

  const deleteAiConversation = async (convId) => {
    setAiConversations((prev) => {
      const filtered = prev.filter((c) => c.id !== convId);
      if (activeAiConversationId === convId) {
        setActiveAiConversationId(filtered.length > 0 ? filtered[0].id : null);
      }
      return filtered;
    });

    clearConversationDocument(convId);

    try {
      localStorage.removeItem(`learnmate_ai_msgs_${convId}`);
    } catch {}

    if (supabaseReady && session?.user) {
      try {
        await supabase.from('ai_conversations').delete().eq('id', convId);
      } catch (err) {
        console.warn('Supabase delete conversation notice:', err.message);
      }
    }

    showToast('Conversation deleted', 'info');
  };

  /**
   * Helper to parse any response format returned by the Gemini Supabase Edge Function
   */
  const extractAnswerText = (data) => {
    if (!data) return '';
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        const nested = extractAnswerText(parsed);
        if (nested) return nested;
      } catch {
        return data.trim();
      }
    }
    if (typeof data.answer === 'string') return data.answer.trim();
    if (typeof data.response === 'string') return data.response.trim();
    if (typeof data.text === 'string') return data.text.trim();
    if (typeof data.reply === 'string') return data.reply.trim();
    if (typeof data.solution === 'string') return data.solution.trim();
    if (typeof data.output === 'string') return data.output.trim();
    if (typeof data.result === 'string') return data.result.trim();
    if (typeof data.content === 'string') return data.content.trim();
    if (data.message) {
      if (typeof data.message === 'string') return data.message.trim();
      if (typeof data.message?.content === 'string') return data.message.content.trim();
    }
    if (Array.isArray(data.candidates) && data.candidates[0]?.content?.parts) {
      const partsText = data.candidates[0].content.parts
        .map((p) => p.text || '')
        .join('')
        .trim();
      if (partsText) return partsText;
    }
    if (Array.isArray(data.choices) && data.choices[0]?.message?.content) {
      return data.choices[0].message.content.trim();
    }
    if (data.data) {
      const nested = extractAnswerText(data.data);
      if (nested) return nested;
    }
    if (typeof data === 'object' && data !== null) {
      const stringKeys = Object.keys(data).filter(
        (k) => typeof data[k] === 'string' && data[k].trim().length > 0 && k !== 'id' && k !== 'model'
      );
      if (stringKeys.length === 1) {
        return data[stringKeys[0]].trim();
      }
    }
    return '';
  };

  const sendAiDoubt = async (rawPrompt, attachment = null) => {
    let prompt = (rawPrompt || '').trim();

    // 1. Ensure conversation exists
    let convId = activeAiConversationId;

    // Check if there is an active document for this conversation
    const existingDoc = convId ? conversationDocuments[convId] : null;
    const effectiveDoc = attachment || existingDoc || null;

    // If text prompt is empty, synthesize a descriptive prompt based on the attachment
    if (!prompt && effectiveDoc) {
      if (effectiveDoc.type === 'pdf') {
        prompt = `Please review this study document ("${effectiveDoc.fileName}"), break down the key academic concepts, and answer any doubts or questions within it step-by-step.`;
      } else {
        prompt = 'Please examine this image carefully, read any equations, text, or diagrams, and solve the problem step-by-step.';
      }
    }

    if (!prompt) return { success: false, error: 'Please enter a question or attach a document/photo to ask.' };

    setAiLoading(true);
    setAiError(null);

    try {
      const autoTitle = prompt.length > 36 ? `${prompt.substring(0, 36)}...` : prompt;
      if (!convId || !aiConversations.some((c) => c.id === convId)) {
        const newConv = await createAiConversation(autoTitle);
        convId = newConv.id;
        if (attachment) {
          setConversationDocument(convId, attachment);
        }
      } else {
        // If current title is 'New Doubt', update with the topic
        const currentConv = aiConversations.find((c) => c.id === convId);
        if (currentConv && currentConv.title === 'New Doubt') {
          renameAiConversation(convId, autoTitle);
        }
        if (attachment) {
          setConversationDocument(convId, attachment);
        }
      }

      // 2. Add user message optimistically
      const userMsgId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `msg_u_${Date.now()}`;
      const userMsgTime = new Date().toISOString();

      const userMessage = {
        id: userMsgId,
        conversationId: convId,
        role: 'user',
        content: prompt,
        attachment: attachment ? {
          type: attachment.type,
          fileName: attachment.fileName,
          fileSize: attachment.fileSize,
          formattedSize: attachment.formattedSize,
          mimeType: attachment.mimeType,
          previewUrl: attachment.previewUrl,
          pageCount: attachment.pageCount,
        } : (existingDoc ? {
          type: existingDoc.type,
          fileName: existingDoc.fileName,
          fileSize: existingDoc.fileSize,
          formattedSize: existingDoc.formattedSize,
          mimeType: existingDoc.mimeType,
          previewUrl: existingDoc.previewUrl,
          pageCount: existingDoc.pageCount,
          isFollowUp: true,
        } : null),
        createdAt: userMsgTime,
      };

      const updatedHistory = [...aiMessages, userMessage];
      setAiMessages(updatedHistory);

      // Persist user message locally
      try {
        localStorage.setItem(`learnmate_ai_msgs_${convId}`, JSON.stringify(updatedHistory));
      } catch {}

      // Persist user message in Supabase
      if (supabaseReady && session?.user) {
        try {
          await supabase.from('ai_messages').insert([{
            id: userMsgId,
            conversation_id: convId,
            user_id: session.user.id,
            role: 'user',
            content: prompt,
            created_at: userMsgTime,
          }]);
        } catch (err) {
          console.warn('Supabase user msg insert notice:', err.message);
        }
      }

      // 3. Prepare valid JSON payload for Supabase Edge Function (ai-doubt-solver)
      let questionWithContext = prompt;
      if (effectiveDoc) {
        if (effectiveDoc.extractedText && effectiveDoc.extractedText.trim()) {
          questionWithContext = `${prompt}\n\n[ATTACHED ACADEMIC DOCUMENT: "${effectiveDoc.fileName}" (${effectiveDoc.pageCount || 1} pages)]:\n${effectiveDoc.extractedText.slice(0, 60000)}`;
        } else if (effectiveDoc.type === 'pdf') {
          questionWithContext = `${prompt}\n\n[ATTACHED PDF DOCUMENT: "${effectiveDoc.fileName}" (${effectiveDoc.pageCount || 1} pages, ${effectiveDoc.formattedSize || ''})]`;
        }
      }

      const priorMessages = aiMessages
        .slice(-8)
        .filter((m) => m && typeof m.content === 'string' && m.content.trim())
        .map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content.trim(),
        }));

      const requestPayload = {
        question: questionWithContext,
      };

      if (priorMessages.length > 0) {
        requestPayload.messages = priorMessages;
      }

      if (effectiveDoc) {
        requestPayload.attachment = {
          type: effectiveDoc.type,
          fileName: effectiveDoc.fileName,
          mimeType: effectiveDoc.mimeType,
          base64: effectiveDoc.base64,
          extractedText: effectiveDoc.extractedText,
          pageCount: effectiveDoc.pageCount,
        };
      }

      let replyText = '';
      let usedModel = 'Gemini 3.5 Flash-Lite';
      let lastErrorMessage = '';

      const rawBaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
      const cleanBaseUrl = rawBaseUrl.trim().replace(/\/rest(\/v\d+)?\/?$/i, '').replace(/\/+$/, '');
      const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
      const authToken = session?.access_token || anonKey;

      if (!cleanBaseUrl || !anonKey) {
        lastErrorMessage = 'Supabase is not configured. Please check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.';
      } else {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 35000);

        try {
          const edgeFunctionUrl = `${cleanBaseUrl}/functions/v1/ai-doubt-solver`;
          const response = await fetch(edgeFunctionUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': anonKey,
              'Authorization': `Bearer ${authToken}`,
            },
            body: JSON.stringify(requestPayload),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          const rawText = await response.text();
          let edgeData = null;
          if (rawText) {
            try {
              edgeData = JSON.parse(rawText);
            } catch {
              edgeData = null;
            }
          }

          if (!response.ok) {
            const detailedMsg = edgeData?.error || edgeData?.message || response.statusText || '';
            const lower = String(detailedMsg).toLowerCase();

            if (response.status === 401 || lower.includes('unauthorized') || lower.includes('jwt') || lower.includes('invalid token')) {
              lastErrorMessage = 'Authentication failed (401): Please verify that your Supabase Anon Key is valid or sign in again.';
            } else if (response.status === 404 || lower.includes('not found')) {
              lastErrorMessage = 'Edge Function "ai-doubt-solver" was not found (404). Please deploy it in Supabase.';
            } else if (response.status === 429 || lower.includes('rate limit') || lower.includes('too many requests')) {
              lastErrorMessage = detailedMsg || 'Google Gemini is receiving too many requests right now. Please wait a few seconds and try again.';
            } else if (response.status === 503 || response.status === 502 || response.status === 504 || response.status === 500 || lower.includes('high demand') || lower.includes('overloaded')) {
              lastErrorMessage = detailedMsg || 'Google Gemini is currently experiencing high demand. Please wait a moment and try your question again.';
            } else {
              lastErrorMessage = detailedMsg || `Request failed with status ${response.status}. Please try again.`;
            }
          } else if (edgeData) {
            replyText = typeof edgeData.answer === 'string'
              ? edgeData.answer.trim()
              : extractAnswerText(edgeData);

            if (edgeData.model) {
              usedModel = edgeData.model;
            }
            if (!replyText && edgeData.error) {
              lastErrorMessage = typeof edgeData.error === 'string'
                ? edgeData.error
                : (edgeData.error.message || JSON.stringify(edgeData.error));
            }
          } else {
            lastErrorMessage = 'Received an invalid response from the AI Doubt Solver. Please try again.';
          }
        } catch (invokeErr) {
          clearTimeout(timeoutId);
          console.warn('[Supabase Edge Function invocation notice]:', invokeErr.message);
          if (invokeErr.name === 'AbortError') {
            lastErrorMessage = 'The AI Tutor took too long to respond. Please wait a moment and try again.';
          } else {
            lastErrorMessage = 'Unable to reach the AI Doubt Solver service. Please check your internet connection and try again.';
          }
        }
      }

      if (!replyText) {
        const finalError = lastErrorMessage || 'Unable to receive an answer from Google Gemini right now. Please try again in a moment.';
        setAiError(finalError);
        setAiLoading(false);
        return { success: false, error: finalError };
      }

      // 5. Append assistant reply
      const assistantMsgId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `msg_a_${Date.now()}`;
      const assistantMsgTime = new Date().toISOString();

      if (usedModel) {
        setAiStatus((prev) => ({
          ...prev,
          model: usedModel,
          provider: 'Google Gemini (Supabase Edge Function)',
          isConfigured: true,
        }));
      }

      const assistantMessage = {
        id: assistantMsgId,
        conversationId: convId,
        role: 'assistant',
        content: replyText,
        createdAt: assistantMsgTime,
      };

      const finalHistory = [...updatedHistory, assistantMessage];
      setAiMessages(finalHistory);

      // Persist assistant message locally
      try {
        localStorage.setItem(`learnmate_ai_msgs_${convId}`, JSON.stringify(finalHistory));
      } catch {}

      // Persist assistant message in Supabase
      if (supabaseReady && session?.user) {
        try {
          await supabase.from('ai_messages').insert([{
            id: assistantMsgId,
            conversation_id: convId,
            user_id: session.user.id,
            role: 'assistant',
            content: replyText,
            created_at: assistantMsgTime,
          }]);

          // Update conversation timestamp
          await supabase
            .from('ai_conversations')
            .update({ updated_at: assistantMsgTime })
            .eq('id', convId);
        } catch (err) {
          console.warn('Supabase assistant msg insert notice:', err.message);
        }
      }

      setAiLoading(false);
      return { success: true, answer: replyText };
    } catch (networkErr) {
      const msg = `AI Doubt Solver request failed: ${networkErr.message || 'Unknown error'}`;
      setAiError(msg);
      setAiLoading(false);
      return { success: false, error: msg };
    }
  };

  return (
    <AppContext.Provider
      value={{
        user,
        updateUser,
        isAuthenticated,
        authLoading,
        session,
        isSupabaseConfigured: supabaseReady,
        loginUser,
        loginDemoUser,
        signupUser,
        resendConfirmationEmail,
        logoutUser,
        timetable,
        addClass,
        addMultipleClasses,
        updateClass,
        deleteClass,
        assignments,
        addAssignment,
        updateAssignment,
        toggleAssignmentStatus,
        deleteAssignment,
        notes,
        addNote,
        updateNote,
        deleteNote,
        toggleFavoriteNote,
        // Smart Notes (Files & Folders)
        noteFiles,
        noteFolders,
        validateNoteFile,
        uploadNoteFiles,
        deleteNoteFile,
        renameNoteFile,
        toggleFavoriteNoteFile,
        downloadNoteFile,
        getNoteFilePreviewUrl,
        createNoteFolder,
        renameNoteFolder,
        deleteNoteFolder,
        exams,
        addExam,
        addMultipleExams,
        updateExam,
        toggleExamTopic,
        deleteExam,
        studyTasks,
        toggleStudyTask,
        addStudyTask,
        deleteStudyTask,
        studySessions,
        addStudySession,
        quizzes,
        addQuiz,
        deleteQuiz,
        quizScores,
        saveQuizResult,
        // PDF-to-Quiz Generator & Attempts
        generatedQuizzes,
        quizAttempts,
        generateQuizFromPdf,
        saveQuizAttempt,
        deleteGeneratedQuiz,
        deleteQuizAttempt,
        globalSearch,
        setGlobalSearch,
        toastMessage,
        showToast,
        // AI Doubt Solver
        aiConversations,
        activeAiConversationId,
        aiMessages,
        aiStatus,
        aiLoading,
        aiError,
        checkAiStatus,
        selectAiConversation,
        createAiConversation,
        renameAiConversation,
        deleteAiConversation,
        sendAiDoubt,
        conversationDocuments,
        setConversationDocument,
        clearConversationDocument
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
