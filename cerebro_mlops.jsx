import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, Brain, AlertTriangle, Check, Inbox, Archive, BookOpen, Flame, Upload, X, Trophy, Download, Timer, Play, Pause, RotateCcw } from 'lucide-react';

const STORAGE_KEY = 'mlops-brain-v2';
const LAST_DASHBOARD_KEY = 'mlops-brain-last-dashboard';

const CATEGORIES = {
  deep: {
    label: 'Profundo',
    tagline: 'Lo usas seguido o te desbloquea el resto',
    icon: Flame,
    accent: '#c15f3c',
    accentSoft: '#f3dfd2',
    hint: 'Máximo 2 a la vez',
  },
  reference: {
    label: 'Referencia',
    tagline: 'Consulta 1-2 veces y guarda el link',
    icon: BookOpen,
    accent: '#6f7358',
    accentSoft: '#e8e6d8',
    hint: 'Sin compromiso',
  },
  backlog: {
    label: 'Backlog',
    tagline: 'Interesante, no urgente',
    icon: Archive,
    accent: '#8a7a66',
    accentSoft: '#ebe4d6',
    hint: 'Revisa los viernes',
  },
  done: {
    label: 'Completado',
    tagline: 'Dominado. Ya es parte de tu arsenal',
    icon: Trophy,
    accent: '#5f7f69',
    accentSoft: '#dce9df',
    hint: 'Tu historial de logros',
  },
};

const MOVE_ORDER = ['deep', 'reference', 'backlog'];
const EFFORT_OPTIONS = [1, 2, 3, 5, 8, 13];
const FOCUS_SECONDS = 45 * 60;
const BREAK_SECONDS = 5 * 60;
const SORT_OPTIONS = {
  recent: 'Reciente',
  depth: 'Mayor profundidad',
  effort: 'Mayor esfuerzo',
  time: 'Menor tiempo',
  target: 'Fecha objetivo',
};

const C = {
  bg: '#f4efe6',
  bgAlt: '#ebe3d6',
  surface: '#fbf7ef',
  surfaceElevated: '#fffaf2',
  ink: '#23211d',
  inkSoft: '#5e584f',
  muted: '#8b8173',
  mutedLight: '#b9ad9b',
  line: '#d8cebd',
  lineSoft: '#e6ddcf',
  accent: '#c15f3c',
  accentDark: '#8f4128',
};

function formatDaysAgo(iso) {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const days = Math.floor((now - then) / (1000 * 60 * 60 * 24));
  if (days === 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}sem`;
  return `${Math.floor(days / 30)}m`;
}

function formatTimer(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function normalizeTopic(topic) {
  const { note, ...topicWithoutNote } = topic;
  return {
    ...topicWithoutNote,
    subtasks: topic.subtasks || [],
    effortPoints: Number.isFinite(Number(topic.effortPoints)) ? Number(topic.effortPoints) : 1,
    timeHours: Number.isFinite(Number(topic.timeHours)) ? Number(topic.timeHours) : 1,
    targetDate: topic.targetDate || '',
    completedAt: topic.completedAt || '',
  };
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function getPlanningTotals(topics) {
  return topics.reduce(
    (totals, topic) => ({
      effort: totals.effort + (Number(topic.effortPoints) || 0),
      hours: totals.hours + (Number(topic.timeHours) || 0),
      due: totals.due + (topic.targetDate ? 1 : 0),
    }),
    { effort: 0, hours: 0, due: 0 }
  );
}

function getTargetDateTime(topic) {
  if (!topic.targetDate) return Number.POSITIVE_INFINITY;
  const time = new Date(`${topic.targetDate}T00:00:00`).getTime();
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

function formatTargetDate(date) {
  if (!date) return '';
  return new Date(`${date}T00:00:00`).toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
  });
}

function getTargetLabel(date) {
  if (!date) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${date}T00:00:00`);
  const days = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) return `Vencido ${Math.abs(days)}d`;
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Manana';
  return formatTargetDate(date);
}

function sortTopics(topics, sortMode) {
  return [...topics].sort((a, b) => {
    if (sortMode === 'depth') return getTopicDepth(b) - getTopicDepth(a);
    if (sortMode === 'effort') return (Number(b.effortPoints) || 0) - (Number(a.effortPoints) || 0);
    if (sortMode === 'time') return (Number(a.timeHours) || 0) - (Number(b.timeHours) || 0);
    if (sortMode === 'target') return getTargetDateTime(a) - getTargetDateTime(b);
    return new Date(b.movedAt || b.createdAt || 0).getTime() - new Date(a.movedAt || a.createdAt || 0).getTime();
  });
}

export default function CerebroMLOps() {
  const [topics, setTopics] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [pendingDeep, setPendingDeep] = useState(null);
  const [toast, setToast] = useState(null);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [sortMode, setSortMode] = useState('recent');
  const [recentlyCompletedId, setRecentlyCompletedId] = useState(null);
  const [draggingTopicId, setDraggingTopicId] = useState(null);
  const [dragOverCategory, setDragOverCategory] = useState(null);
  const [timerMode, setTimerMode] = useState('focus');
  const [timerSeconds, setTimerSeconds] = useState(FOCUS_SECONDS);
  const [timerRunning, setTimerRunning] = useState(false);
  const [lastCapturedId, setLastCapturedId] = useState(null);
  const inputRef = useRef(null);
  const backupInputRef = useRef(null);
  const doneSectionRef = useRef(null);
  const captureDashboardRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const result = await window.storage.get(STORAGE_KEY);
        if (result && result.value) {
          const loaded = JSON.parse(result.value);
          // Migrate: ensure every topic has planning fields.
          const migrated = loaded.map(normalizeTopic);
          setTopics(migrated);
        }
        const dashboardResult = await window.storage.get(LAST_DASHBOARD_KEY);
        if (dashboardResult && dashboardResult.value) {
          setLastCapturedId(dashboardResult.value);
        }
      } catch (e) {
        // empty state
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (loading) return;
    (async () => {
      try {
        await window.storage.set(STORAGE_KEY, JSON.stringify(topics));
      } catch (e) {
        console.error('Storage failed', e);
      }
    })();
  }, [topics, loading]);

  useEffect(() => {
    if (loading) return;
    (async () => {
      try {
        await window.storage.set(LAST_DASHBOARD_KEY, lastCapturedId || '');
      } catch (e) {
        console.error('Dashboard state failed', e);
      }
    })();
  }, [lastCapturedId, loading]);

  useEffect(() => {
    if (!timerRunning) return undefined;
    const interval = window.setInterval(() => {
      setTimerSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [timerRunning]);

  useEffect(() => {
    if (timerSeconds > 0) return;
    setTimerRunning(false);
    if (timerMode === 'focus') {
      setTimerMode('break');
      setTimerSeconds(BREAK_SECONDS);
      showToast('Foco completado. Toma 5 minutos de descanso.');
    } else {
      setTimerMode('focus');
      setTimerSeconds(FOCUS_SECONDS);
      showToast('Descanso terminado. Vuelve al foco.');
    }
  }, [timerSeconds, timerMode]);

  useEffect(() => {
    if (!lastCapturedId) return undefined;
    const timeout = window.setTimeout(() => {
      captureDashboardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
    return () => window.clearTimeout(timeout);
  }, [lastCapturedId]);

  useEffect(() => {
    if (loading || !lastCapturedId) return;
    if (!topics.some((topic) => topic.id === lastCapturedId)) {
      setLastCapturedId(null);
    }
  }, [topics, lastCapturedId, loading]);

  const deepTopics = topics.filter((t) => t.category === 'deep');
  const deepCount = deepTopics.length;

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(null), 2500);
  };

  const revealCompletedTopic = (id) => {
    setRecentlyCompletedId(id);
    setTimeout(() => {
      doneSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    setTimeout(() => setRecentlyCompletedId(null), 3500);
  };

  const resetTimer = (mode = timerMode) => {
    setTimerRunning(false);
    setTimerMode(mode);
    setTimerSeconds(mode === 'focus' ? FOCUS_SECONDS : BREAK_SECONDS);
  };

  const switchTimerMode = () => {
    resetTimer(timerMode === 'focus' ? 'break' : 'focus');
  };

  const exportBackup = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const backup = {
      app: 'cerebro-mlops',
      version: 2,
      exportedAt: new Date().toISOString(),
      topics,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cerebro-mlops-backup-${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast('Backup exportado.');
  };

  const importBackup = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text());
      const importedTopics = Array.isArray(parsed) ? parsed : parsed.topics;
      if (!Array.isArray(importedTopics)) {
        throw new Error('Invalid backup');
      }

      const confirmed = window.confirm(
        'Importar este backup reemplazara el tablero actual. Continuar?'
      );
      if (!confirmed) return;

      setTopics(importedTopics.map(normalizeTopic));
      setLastCapturedId(null);
      showToast(`Backup importado: ${importedTopics.length} temas.`);
    } catch (e) {
      showToast('No pude importar ese backup.');
    }
  };

  const addTopic = () => {
    const clean = input.trim();
    if (!clean) return;
    const newTopic = {
      id: Date.now().toString(),
      title: clean,
      category: 'backlog',
      createdAt: new Date().toISOString(),
      movedAt: new Date().toISOString(),
      subtasks: [],
      effortPoints: 1,
      timeHours: 1,
      targetDate: '',
    };
    setTopics([newTopic, ...topics]);
    setLastCapturedId(newTopic.id);
    setInput('');
    showToast('Capturado en Backlog');
  };

  const moveTopicRaw = (id, newCategory) => {
    const now = new Date().toISOString();
    setTopics((currentTopics) =>
      currentTopics.map((t) =>
        t.id === id
          ? {
              ...t,
              category: newCategory,
              movedAt: now,
              completedAt: newCategory === 'done' ? t.completedAt || now : '',
            }
          : t
      )
    );
  };

  const moveTopic = (id, newCategory) => {
    if (newCategory === 'deep' && deepCount >= 2) {
      setPendingDeep(id);
      return;
    }
    moveTopicRaw(id, newCategory);
  };

  const handleDragStart = (topicId, event) => {
    setDraggingTopicId(topicId);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', topicId);
    }
  };

  const clearDragState = () => {
    setDraggingTopicId(null);
    setDragOverCategory(null);
  };

  const handleDropTopic = (targetCategory, event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!CATEGORIES[targetCategory]) {
      clearDragState();
      return;
    }

    const topicId = event.dataTransfer?.getData('text/plain') || draggingTopicId;
    const topic = topics.find((t) => t.id === topicId);
    clearDragState();
    if (!topic || topic.category === targetCategory) return;

    if (targetCategory === 'done') {
      markAsDone(topicId);
      return;
    }

    moveTopic(topicId, targetCategory);
    showToast(`Movido a ${CATEGORIES[targetCategory].label}.`);
  };

  const allowDropOnCategory = (categoryKey, event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    setDragOverCategory(categoryKey);
  };

  const confirmReplaceDeep = (replaceId) => {
    setTopics(
      topics.map((t) => {
        if (t.id === replaceId) {
          return { ...t, category: 'backlog', movedAt: new Date().toISOString() };
        }
        if (t.id === pendingDeep) {
          return { ...t, category: 'deep', movedAt: new Date().toISOString() };
        }
        return t;
      })
    );
    setPendingDeep(null);
    showToast('Swap hecho. Mantén el foco.');
  };

  const deleteTopic = (id) => {
    setTopics(topics.filter((t) => t.id !== id));
    if (lastCapturedId === id) setLastCapturedId(null);
  };

  const selectCapturedCategory = (topicId, categoryKey) => {
    const topic = topics.find((t) => t.id === topicId);
    if (!topic || topic.category === categoryKey) return;

    if (categoryKey === 'deep' && deepCount >= 2 && topic.category !== 'deep') {
      moveTopic(topicId, categoryKey);
      showToast('Elige que frente profundo sale.');
      return;
    }

    moveTopic(topicId, categoryKey);
    showToast(`Clasificado en ${CATEGORIES[categoryKey].label}.`);
  };

  const updateTopicPlanning = (topicId, updates) => {
    setTopics(
      topics.map((t) =>
        t.id === topicId
          ? {
              ...t,
              ...updates,
              effortPoints:
                updates.effortPoints !== undefined
                  ? clampNumber(updates.effortPoints, 1, 13)
                  : t.effortPoints,
              timeHours:
                updates.timeHours !== undefined
                  ? Math.round(clampNumber(updates.timeHours, 0.25, 120) * 4) / 4
                  : t.timeHours,
              targetDate:
                updates.targetDate !== undefined
                  ? updates.targetDate
                  : t.targetDate || '',
            }
          : t
      )
    );
  };

  const addSubtask = (topicId, text) => {
    const clean = text.trim();
    if (!clean) return;
    setTopics(
      topics.map((t) =>
        t.id === topicId
          ? {
              ...t,
              subtasks: [
                ...(t.subtasks || []),
                {
                  id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                  text: clean,
                  done: false,
                },
              ],
            }
          : t
      )
    );
  };

  const toggleSubtask = (topicId, subtaskId) => {
    const topic = topics.find((t) => t.id === topicId);
    const previewSubtasks = (topic?.subtasks || []).map((s) =>
      s.id === subtaskId ? { ...s, done: !s.done } : s
    );
    const shouldMoveToDone =
      topic &&
      topic.category !== 'done' &&
      previewSubtasks.length > 0 &&
      previewSubtasks.every((s) => s.done);

    setTopics((currentTopics) =>
      currentTopics.map((t) => {
        if (t.id !== topicId) return t;

        const updatedSubtasks = (t.subtasks || []).map((s) =>
          s.id === subtaskId ? { ...s, done: !s.done } : s
        );
        const allSubtasksDone = updatedSubtasks.length > 0 && updatedSubtasks.every((s) => s.done);

        if (allSubtasksDone && t.category !== 'done') {
          return {
            ...t,
            category: 'done',
            movedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            subtasks: updatedSubtasks,
          };
        }

        return {
          ...t,
          subtasks: updatedSubtasks,
        };
      })
    );

    if (shouldMoveToDone) {
      revealCompletedTopic(topicId);
      showToast('Todas las subtareas listas. Tema movido a Completado.');
    }
  };

  const deleteSubtask = (topicId, subtaskId) => {
    setTopics(
      topics.map((t) =>
        t.id === topicId
          ? { ...t, subtasks: (t.subtasks || []).filter((s) => s.id !== subtaskId) }
          : t
      )
    );
  };

  const markAsDone = (id) => {
    revealCompletedTopic(id);
    setTopics((currentTopics) =>
      currentTopics.map((t) =>
        t.id === id
          ? { ...t, category: 'done', movedAt: new Date().toISOString(), completedAt: new Date().toISOString() }
          : t
      )
    );
    showToast('Tema completado. ¡Bien hecho!');
  };

  const reopenTopic = (id) => {
    setTopics(
      topics.map((t) =>
        t.id === id
          ? { ...t, category: 'backlog', movedAt: new Date().toISOString(), completedAt: '' }
          : t
      )
    );
    showToast('Reabierto en Backlog.');
  };

  const bulkImport = (itemsByCategory) => {
    // itemsByCategory: { deep: string[], reference: string[], backlog: string[] }
    const now = new Date().toISOString();
    let baseId = Date.now();
    const newTopics = [];
    let overflowCount = 0;

    // Deep: respect existing deep count + max 2 total
    const currentDeep = topics.filter((t) => t.category === 'deep').length;
    const availableDeepSlots = Math.max(0, 2 - currentDeep);
    const deepToImport = itemsByCategory.deep.slice(0, availableDeepSlots);
    const deepOverflow = itemsByCategory.deep.slice(availableDeepSlots);
    overflowCount = deepOverflow.length;

    deepToImport.forEach((title) => {
      newTopics.push({
        id: String(baseId++),
        title,
        category: 'deep',
        createdAt: now,
        movedAt: now,
        subtasks: [],
        effortPoints: 1,
        timeHours: 1,
        targetDate: '',
      });
    });

    // Deep overflow goes to backlog
    [...deepOverflow, ...itemsByCategory.reference].forEach((title, i) => {
      const isOverflow = i < deepOverflow.length;
      newTopics.push({
        id: String(baseId++),
        title,
        category: isOverflow ? 'backlog' : 'reference',
        createdAt: now,
        movedAt: now,
        subtasks: [],
        effortPoints: 1,
        timeHours: 1,
        targetDate: '',
      });
    });

    itemsByCategory.backlog.forEach((title) => {
      newTopics.push({
        id: String(baseId++),
        title,
        category: 'backlog',
        createdAt: now,
        movedAt: now,
        subtasks: [],
        effortPoints: 1,
        timeHours: 1,
        targetDate: '',
      });
    });

    setTopics([...newTopics, ...topics]);
    setShowBulkImport(false);

    if (overflowCount > 0) {
      showToast(`Importados. ${overflowCount} de Deep se fueron a Backlog (límite 2).`);
    } else {
      const total = newTopics.length;
      showToast(`${total} tema${total !== 1 ? 's' : ''} importado${total !== 1 ? 's' : ''}.`);
    }
  };

  const cycleCategory = (id, direction) => {
    const topic = topics.find((t) => t.id === id);
    if (!topic) return;
    const idx = MOVE_ORDER.indexOf(topic.category);
    const next = direction === 'up' ? idx - 1 : idx + 1;
    if (next < 0 || next >= MOVE_ORDER.length) return;
    moveTopic(id, MOVE_ORDER[next]);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') addTopic();
  };

  const today = new Date();
  const dayName = today.toLocaleDateString('es-CO', { weekday: 'long' });
  const dateStr = today.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
  });
  const lastCapturedTopic = lastCapturedId ? topics.find((t) => t.id === lastCapturedId) : null;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: C.bg,
        color: C.ink,
        fontFamily: '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif',
        padding: '40px 28px 80px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=IBM+Plex+Sans:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        
        * { box-sizing: border-box; }
        ::selection { background: ${C.accent}; color: ${C.surface}; }
        input::placeholder { color: ${C.mutedLight}; }
        button { font-family: inherit; cursor: pointer; }
        
        .card-hover { transition: all 0.2s ease; }
        .card-hover:hover { 
          border-color: ${C.muted} !important; 
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(42, 37, 32, 0.06);
        }
        .card-hover:hover .card-actions { opacity: 1 !important; }

        .paper-texture {
          position: absolute;
          inset: 0;
          opacity: 0.5;
          pointer-events: none;
          background-image: 
            radial-gradient(circle at 20% 30%, rgba(179, 71, 30, 0.04) 0%, transparent 50%),
            radial-gradient(circle at 80% 70%, rgba(85, 107, 71, 0.04) 0%, transparent 50%);
        }

        .grain {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.4;
          mix-blend-mode: multiply;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.2 0 0 0 0 0.15 0 0 0 0 0.1 0 0 0 0.08 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
        }

        @keyframes pulse-soft {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        .pulse { animation: pulse-soft 2.5s ease-in-out infinite; }

        @keyframes slide-in {
          from { opacity: 0; transform: translate(-50%, 8px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        .slide-in { animation: slide-in 0.3s ease-out; }

        @keyframes fade-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .fade-in { animation: fade-in 0.2s ease-out; }
      `}</style>

      <div className="paper-texture" />
      <div className="grain" />

      <div
        style={{
          maxWidth: 1240,
          margin: '0 auto',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Header */}
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 40,
            borderBottom: `1px solid ${C.line}`,
            paddingBottom: 28,
            gap: 24,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 10,
              }}
            >
              <Brain size={20} color={C.accent} strokeWidth={1.5} />
              <span
                style={{
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: 10,
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                  color: C.muted,
                }}
              >
                Cerebro · MLOps
              </span>
            </div>
            <h1
              style={{
                fontFamily: '"Instrument Serif", Georgia, serif',
                fontWeight: 400,
                fontSize: 48,
                lineHeight: 1.05,
                margin: 0,
                letterSpacing: '-0.02em',
                color: C.ink,
              }}
            >
              Menos ruido.{' '}
              <span style={{ fontStyle: 'italic', color: C.accent }}>
                Más señal.
              </span>
            </h1>
            <p
              style={{
                color: C.inkSoft,
                fontSize: 14,
                marginTop: 14,
                maxWidth: 560,
                lineHeight: 1.6,
                fontWeight: 400,
              }}
            >
              Captura todo lo que te aparezca. Clasifícalo en tres cajas.
              La regla manda: máximo 2 frentes profundos a la vez.
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 16,
              flexWrap: 'wrap',
              justifyContent: 'flex-end',
            }}
          >
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button
                onClick={exportBackup}
                style={{
                  background: 'transparent',
                  border: `1px solid ${C.line}`,
                  color: C.inkSoft,
                  padding: '10px 16px',
                  fontSize: 11,
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  fontWeight: 500,
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  borderRadius: 2,
                  fontFamily: '"IBM Plex Mono", monospace',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = C.ink;
                  e.currentTarget.style.color = C.ink;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = C.line;
                  e.currentTarget.style.color = C.inkSoft;
                }}
              >
                <Download size={12} strokeWidth={2} />
                Exportar backup
              </button>

              <button
                onClick={() => backupInputRef.current?.click()}
                style={{
                  background: 'transparent',
                  border: `1px solid ${C.line}`,
                  color: C.inkSoft,
                  padding: '10px 16px',
                  fontSize: 11,
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  fontWeight: 500,
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  borderRadius: 2,
                  fontFamily: '"IBM Plex Mono", monospace',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = C.ink;
                  e.currentTarget.style.color = C.ink;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = C.line;
                  e.currentTarget.style.color = C.inkSoft;
                }}
              >
                <Upload size={12} strokeWidth={2} />
                Importar backup
              </button>

              <input
                ref={backupInputRef}
                type="file"
                accept="application/json,.json"
                onChange={importBackup}
                style={{ display: 'none' }}
              />
            </div>

            <button
              onClick={() => setShowBulkImport(true)}
              style={{
                background: 'transparent',
                border: `1px solid ${C.line}`,
                color: C.inkSoft,
                padding: '10px 16px',
                fontSize: 11,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                fontWeight: 500,
                transition: 'all 0.15s ease',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                borderRadius: 2,
                fontFamily: '"IBM Plex Mono", monospace',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = C.ink;
                e.currentTarget.style.color = C.ink;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = C.line;
                e.currentTarget.style.color = C.inkSoft;
              }}
            >
              <Upload size={12} strokeWidth={2} />
              Importar temas
            </button>

            <div
              style={{
                textAlign: 'right',
                fontFamily: '"IBM Plex Mono", monospace',
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: C.muted,
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                }}
              >
                {dayName}
              </div>
              <div
                style={{
                  fontFamily: '"Instrument Serif", serif',
                  fontSize: 22,
                  color: C.ink,
                  marginTop: 4,
                  letterSpacing: '-0.01em',
                }}
              >
                {dateStr}
              </div>
            </div>
          </div>
        </header>

        <DeepSlotsIndicator count={deepCount} />
        <FocusTimer
          mode={timerMode}
          seconds={timerSeconds}
          running={timerRunning}
          onStart={() => setTimerRunning(true)}
          onPause={() => setTimerRunning(false)}
          onReset={() => resetTimer()}
          onSwitchMode={switchTimerMode}
        />

        {/* Quick capture */}
        <div
          style={{
            marginTop: 28,
            marginBottom: 40,
            background: C.surfaceElevated,
            border: `1px solid ${C.line}`,
            borderRadius: 3,
            padding: '4px 4px 4px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            boxShadow: '0 1px 2px rgba(42, 37, 32, 0.03)',
          }}
        >
          <Inbox size={16} color={C.muted} strokeWidth={1.5} />
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Captura un tema nuevo… (Enter para guardar en Backlog)"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: C.ink,
              fontSize: 14,
              padding: '16px 0',
              fontFamily: 'inherit',
              letterSpacing: '0.005em',
              minWidth: 0,
            }}
          />
          <button
            onClick={addTopic}
            style={{
              background: input.trim() ? C.accent : C.bgAlt,
              color: input.trim() ? C.surface : C.muted,
              border: 'none',
              padding: '12px 22px',
              fontSize: 11,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              fontWeight: 500,
              transition: 'all 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              borderRadius: 2,
              fontFamily: '"IBM Plex Mono", monospace',
              flexShrink: 0,
            }}
          >
            <Plus size={14} strokeWidth={2} />
            Capturar
          </button>
        </div>

        {lastCapturedTopic && (
          <CaptureDashboard
            dashboardRef={captureDashboardRef}
            topic={lastCapturedTopic}
            topics={topics}
            onDismiss={() => setLastCapturedId(null)}
            onSelectCategory={selectCapturedCategory}
            onUpdatePlanning={updateTopicPlanning}
            onAddSubtask={addSubtask}
          />
        )}

        <BoardControls sortMode={sortMode} onSortChange={setSortMode} />

        {/* Board columns */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
            gap: 20,
          }}
        >
          {['deep', 'reference', 'backlog'].map((key) => {
            const cat = CATEGORIES[key];
            return (
              <Column
                key={key}
                categoryKey={key}
                category={cat}
                topics={sortTopics(topics.filter((t) => t.category === key), sortMode)}
                onMove={cycleCategory}
                onDelete={deleteTopic}
                onAddSubtask={addSubtask}
                onToggleSubtask={toggleSubtask}
                onDeleteSubtask={deleteSubtask}
                onUpdatePlanning={updateTopicPlanning}
                onMarkAsDone={markAsDone}
                onDropTopic={handleDropTopic}
                onDragOverCategory={allowDropOnCategory}
                onDragLeaveCategory={() => setDragOverCategory(null)}
                onDragStartTopic={handleDragStart}
                onDragEndTopic={clearDragState}
                draggingTopicId={draggingTopicId}
                isDragOver={dragOverCategory === key}
              />
            );
          })}
        </div>

        <StableDoneSection
          sectionRef={doneSectionRef}
          category={CATEGORIES.done}
          topics={sortTopics(topics.filter((t) => t.category === 'done'), sortMode)}
          highlightedId={recentlyCompletedId}
          onReopen={reopenTopic}
          onDelete={deleteTopic}
          onDropTopic={handleDropTopic}
          onDragOverCategory={allowDropOnCategory}
          onDragLeaveCategory={() => setDragOverCategory(null)}
          onDragStartTopic={handleDragStart}
          onDragEndTopic={clearDragState}
          draggingTopicId={draggingTopicId}
          isDragOver={dragOverCategory === 'done'}
        />

        {topics.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              marginTop: 60,
              color: C.muted,
              fontSize: 13,
            }}
          >
            <p style={{ fontFamily: '"Instrument Serif", serif', fontSize: 22, color: C.inkSoft, fontStyle: 'italic' }}>
              El cerebro está vacío.
            </p>
            <p>Empieza capturando eso que te ronda desde hace días.</p>
          </div>
        )}

        <BrainDepthMap topics={topics} />
        <TopicGraphMap topics={topics} />

        <footer
          style={{
            marginTop: 80,
            paddingTop: 36,
            borderTop: `1px solid ${C.line}`,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 36,
          }}
        >
          <Principle
            num="01"
            title="Prioriza por uso, no por hype"
            body="Primero lo que tocas esta semana en el trabajo. Después el fundamento que te desbloquea. Al final lo tendencia."
          />
          <Principle
            num="02"
            title="Dos frentes profundos, no más"
            body="Si quieres entrar a un tercero, saca otro. No hay atajo. El foco se gana rechazando, no sumando."
          />
          <Principle
            num="03"
            title="Revisa el Backlog cada viernes"
            body="30 minutos. Borra lo que ya no importa. Decide qué entra la próxima semana. La mayoría caduca sola."
          />
        </footer>
      </div>

      {pendingDeep && (
        <SwapModal
          deepTopics={deepTopics}
          incoming={topics.find((t) => t.id === pendingDeep)}
          onConfirm={confirmReplaceDeep}
          onCancel={() => setPendingDeep(null)}
        />
      )}

      {showBulkImport && (
        <BulkImportModal
          onImport={bulkImport}
          onCancel={() => setShowBulkImport(false)}
          currentDeepCount={deepCount}
        />
      )}

      {toast && (
        <div
          className="slide-in"
          style={{
            position: 'fixed',
            bottom: 36,
            left: '50%',
            background: C.ink,
            color: C.surface,
            padding: '12px 22px',
            fontSize: 12,
            letterSpacing: '0.03em',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontWeight: 400,
            borderRadius: 2,
            boxShadow: '0 8px 24px rgba(42, 37, 32, 0.2)',
            fontFamily: '"IBM Plex Mono", monospace',
          }}
        >
          <Check size={14} strokeWidth={2.5} color={C.accent} />
          {toast}
        </div>
      )}
    </div>
  );
}

function BoardControls({ sortMode, onSortChange }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 10,
        margin: '-22px 0 28px',
        flexWrap: 'wrap',
      }}
    >
      <span
        style={{
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: 10,
          color: C.muted,
          textTransform: 'uppercase',
          letterSpacing: '0.16em',
        }}
      >
        Ordenar por
      </span>
      <select
        value={sortMode}
        onChange={(e) => onSortChange(e.target.value)}
        title="Ordenar temas"
        style={{
          background: C.surfaceElevated,
          border: `1px solid ${C.line}`,
          borderRadius: 2,
          color: C.ink,
          padding: '9px 12px',
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: 11,
          letterSpacing: '0.06em',
          outline: 'none',
          cursor: 'pointer',
        }}
      >
        {Object.entries(SORT_OPTIONS).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}

const STARTER_SUBTASKS = [
  'Definir resultado esperado',
  'Encontrar fuente base',
  'Crear primer entregable',
];

function getRelatedTopics(topic, topics) {
  const keywords = getTopicKeywords(topic.title);
  if (keywords.length === 0) return [];
  const keywordSet = new Set(keywords);

  return topics
    .filter((candidate) => candidate.id !== topic.id)
    .map((candidate) => {
      const shared = getTopicKeywords(candidate.title).filter((word) => keywordSet.has(word));
      return {
        topic: candidate,
        shared,
        score: shared.length,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || getTopicDepth(b.topic) - getTopicDepth(a.topic));
}

function CaptureMetric({ label, value, accent }) {
  return (
    <div
      style={{
        borderLeft: `2px solid ${accent}`,
        paddingLeft: 10,
        minWidth: 112,
      }}
    >
      <div
        style={{
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: 9,
          color: C.muted,
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          marginBottom: 5,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: '"Instrument Serif", serif',
          fontSize: 28,
          lineHeight: 1,
          color: C.ink,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function getTopicProgressStats(topic) {
  const subtasks = topic.subtasks || [];
  const doneCount = subtasks.filter((subtask) => subtask.done).length;
  const subtaskProgress = subtasks.length > 0 ? doneCount / subtasks.length : 0;
  const hasTarget = Boolean(topic.targetDate);
  const planScore = [Number(topic.effortPoints) > 0, Number(topic.timeHours) > 0, hasTarget]
    .filter(Boolean).length / 3;

  return {
    doneCount,
    totalSubtasks: subtasks.length,
    subtaskProgress,
    depth: getTopicDepth(topic),
    planScore,
    overall: Math.round(((subtaskProgress * 0.45) + (getTopicDepth(topic) / 100 * 0.35) + (planScore * 0.2)) * 100),
  };
}

function CaptureProgressChart({ topic, accent, accentSoft }) {
  const stats = getTopicProgressStats(topic);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - stats.overall / 100);
  const bars = [
    { label: 'Subtareas', value: stats.subtaskProgress },
    { label: 'Profundidad', value: stats.depth / 100 },
    { label: 'Plan', value: stats.planScore },
  ];

  return (
    <div
      style={{
        background: C.surfaceElevated,
        border: `1px solid ${C.lineSoft}`,
        borderRadius: 3,
        padding: 16,
        display: 'grid',
        gridTemplateColumns: '120px minmax(0, 1fr)',
        gap: 16,
        alignItems: 'center',
        marginBottom: 18,
      }}
    >
      <svg
        viewBox="0 0 120 120"
        role="img"
        aria-label={`Progreso general ${stats.overall}%`}
        style={{ width: 120, height: 120, display: 'block' }}
      >
        <circle cx="60" cy="60" r={radius} fill={accentSoft} opacity="0.45" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={C.lineSoft}
          strokeWidth="10"
        />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={accent}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform="rotate(-90 60 60)"
        />
        <text
          x="60"
          y="56"
          textAnchor="middle"
          fontFamily="Instrument Serif, serif"
          fontSize="28"
          fill={C.ink}
        >
          {stats.overall}
        </text>
        <text
          x="60"
          y="75"
          textAnchor="middle"
          fontFamily="IBM Plex Mono, monospace"
          fontSize="9"
          fill={C.muted}
          letterSpacing="1.2"
        >
          AVANCE
        </text>
      </svg>

      <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
        {bars.map((bar) => (
          <div key={bar.label}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 10,
                marginBottom: 5,
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: 10,
                color: C.muted,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              <span>{bar.label}</span>
              <span>{Math.round(bar.value * 100)}%</span>
            </div>
            <div
              style={{
                height: 6,
                background: C.lineSoft,
                borderRadius: 6,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.max(0, Math.min(100, bar.value * 100))}%`,
                  height: '100%',
                  background: accent,
                  borderRadius: 6,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CaptureDashboard({
  dashboardRef,
  topic,
  topics,
  onDismiss,
  onSelectCategory,
  onUpdatePlanning,
  onAddSubtask,
}) {
  const category = CATEGORIES[topic.category] || CATEGORIES.backlog;
  const Icon = category.icon;
  const subtasks = topic.subtasks || [];
  const progressStats = getTopicProgressStats(topic);
  const doneCount = progressStats.doneCount;
  const depth = getTopicDepth(topic);
  const related = getRelatedTopics(topic, topics).slice(0, 3);
  const activeCount = topics.filter((item) => item.category !== 'done').length;
  const completedCount = topics.filter((item) => item.category === 'done').length;
  const existingSubtasks = new Set(subtasks.map((subtask) => subtask.text.toLowerCase()));
  const targetLabel = topic.targetDate ? formatTargetDate(topic.targetDate) : 'Sin fecha';

  return (
    <section
      ref={dashboardRef}
      className="fade-in"
      style={{
        margin: '-16px 0 34px',
        background: C.surface,
        border: `1px solid ${category.accent}`,
        borderRadius: 3,
        padding: 24,
        boxShadow: `0 0 0 3px ${category.accentSoft}, 0 8px 28px rgba(42, 37, 32, 0.08)`,
        scrollMarginTop: 20,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 18,
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          borderBottom: `1px solid ${C.line}`,
          paddingBottom: 18,
          marginBottom: 18,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 10,
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: category.accentSoft,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Icon size={14} color={category.accent} strokeWidth={1.8} />
            </div>
            <span
              style={{
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: 10,
                color: category.accent,
                textTransform: 'uppercase',
                letterSpacing: '0.18em',
                fontWeight: 500,
              }}
            >
              Dashboard del tema
            </span>
          </div>
          <h2
            style={{
              fontFamily: '"Instrument Serif", serif',
              fontSize: 34,
              lineHeight: 1.08,
              fontWeight: 400,
              color: C.ink,
              margin: 0,
              letterSpacing: '-0.015em',
              overflowWrap: 'anywhere',
            }}
          >
            {topic.title}
          </h2>
          <div
            style={{
              marginTop: 10,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: 10,
              color: C.muted,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            <span>{category.label}</span>
            <span>{formatDaysAgo(topic.createdAt || topic.movedAt)}</span>
            <span>{targetLabel}</span>
          </div>
        </div>

        <button
          onClick={onDismiss}
          title="Cerrar dashboard"
          style={{
            background: 'transparent',
            border: 'none',
            color: C.muted,
            padding: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <X size={18} strokeWidth={1.7} />
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))',
          gap: 24,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <CaptureProgressChart topic={topic} accent={category.accent} accentSoft={category.accentSoft} />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(112px, 1fr))',
              gap: 16,
              marginBottom: 22,
            }}
          >
            <CaptureMetric label="Profundidad" value={depth} accent={category.accent} />
            <CaptureMetric label="Subtareas" value={`${doneCount}/${subtasks.length}`} accent={category.accent} />
            <CaptureMetric label="Activos" value={activeCount} accent={category.accent} />
            <CaptureMetric label="Hechos" value={completedCount} accent={category.accent} />
          </div>

          <div
            style={{
              borderTop: `1px solid ${C.lineSoft}`,
              paddingTop: 18,
              marginTop: 4,
            }}
          >
            <div
              style={{
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: 10,
                color: C.muted,
                textTransform: 'uppercase',
                letterSpacing: '0.16em',
                marginBottom: 10,
              }}
            >
              Plan
            </div>
            <PlanningControls
              effortPoints={Number(topic.effortPoints) || 1}
              timeHours={Number(topic.timeHours) || 1}
              targetDate={topic.targetDate || ''}
              accent={category.accent}
              onChange={(updates) => onUpdatePlanning(topic.id, updates)}
            />
          </div>

          <div
            style={{
              borderTop: `1px solid ${C.lineSoft}`,
              paddingTop: 18,
              marginTop: 18,
            }}
          >
            <div
              style={{
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: 10,
                color: C.muted,
                textTransform: 'uppercase',
                letterSpacing: '0.16em',
                marginBottom: 10,
              }}
            >
              Primera descomposicion
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {STARTER_SUBTASKS.map((label) => {
                const alreadyAdded = existingSubtasks.has(label.toLowerCase());
                return (
                  <button
                    key={label}
                    onClick={() => onAddSubtask(topic.id, label)}
                    disabled={alreadyAdded}
                    style={{
                      background: alreadyAdded ? C.bgAlt : C.surfaceElevated,
                      border: `1px solid ${alreadyAdded ? C.lineSoft : category.accent}`,
                      color: alreadyAdded ? C.muted : category.accent,
                      padding: '8px 10px',
                      borderRadius: 2,
                      fontFamily: '"IBM Plex Mono", monospace',
                      fontSize: 10,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      cursor: alreadyAdded ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {alreadyAdded ? 'Listo' : '+'} {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div
          style={{
            borderLeft: `1px solid ${C.line}`,
            paddingLeft: 24,
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: 10,
              color: C.muted,
              textTransform: 'uppercase',
              letterSpacing: '0.16em',
              marginBottom: 12,
            }}
          >
            Clasificacion
          </div>
          <div style={{ display: 'grid', gap: 8, marginBottom: 22 }}>
            {['deep', 'reference', 'backlog'].map((key) => {
              const option = CATEGORIES[key];
              const OptionIcon = option.icon;
              const active = topic.category === key;
              return (
                <button
                  key={key}
                  onClick={() => onSelectCategory(topic.id, key)}
                  style={{
                    background: active ? option.accentSoft : 'transparent',
                    border: `1px solid ${active ? option.accent : C.lineSoft}`,
                    color: active ? option.accent : C.inkSoft,
                    padding: '12px 14px',
                    borderRadius: 2,
                    display: 'grid',
                    gridTemplateColumns: '22px minmax(0, 1fr)',
                    gap: 10,
                    alignItems: 'center',
                    textAlign: 'left',
                  }}
                >
                  <OptionIcon size={15} strokeWidth={1.8} />
                  <span style={{ minWidth: 0 }}>
                    <span
                      style={{
                        display: 'block',
                        fontFamily: '"IBM Plex Mono", monospace',
                        fontSize: 10,
                        textTransform: 'uppercase',
                        letterSpacing: '0.14em',
                        fontWeight: 500,
                      }}
                    >
                      {option.label}
                    </span>
                    <span
                      style={{
                        display: 'block',
                        marginTop: 4,
                        color: C.muted,
                        fontSize: 12,
                        lineHeight: 1.35,
                      }}
                    >
                      {option.tagline}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div
            style={{
              borderTop: `1px solid ${C.lineSoft}`,
              paddingTop: 18,
            }}
          >
            <div
              style={{
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: 10,
                color: C.muted,
                textTransform: 'uppercase',
                letterSpacing: '0.16em',
                marginBottom: 12,
              }}
            >
              Temas relacionados
            </div>
            {related.length === 0 ? (
              <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.5 }}>
                Sin relaciones detectadas todavia.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {related.map((item) => {
                  const relatedCategory = CATEGORIES[item.topic.category] || CATEGORIES.backlog;
                  return (
                    <div
                      key={item.topic.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '9px minmax(0, 1fr)',
                        gap: 9,
                        alignItems: 'start',
                      }}
                    >
                      <span
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: '50%',
                          background: relatedCategory.accent,
                          marginTop: 5,
                        }}
                      />
                      <div style={{ minWidth: 0 }}>
                        <div
                          title={item.topic.title}
                          style={{
                            color: C.ink,
                            fontSize: 13,
                            lineHeight: 1.35,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {item.topic.title}
                        </div>
                        <div
                          style={{
                            marginTop: 4,
                            fontFamily: '"IBM Plex Mono", monospace',
                            color: C.muted,
                            fontSize: 9,
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                          }}
                        >
                          {relatedCategory.label} / {item.shared.join(', ')}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function FocusTimer({ mode, seconds, running, onStart, onPause, onReset, onSwitchMode }) {
  const isFocus = mode === 'focus';
  const total = isFocus ? FOCUS_SECONDS : BREAK_SECONDS;
  const progress = total > 0 ? 1 - seconds / total : 0;
  const accent = isFocus ? CATEGORIES.deep.accent : CATEGORIES.done.accent;
  const accentSoft = isFocus ? CATEGORIES.deep.accentSoft : CATEGORIES.done.accentSoft;

  return (
    <div
      style={{
        marginTop: 16,
        padding: '16px 20px',
        background: C.surfaceElevated,
        border: `1px solid ${C.line}`,
        borderRadius: 3,
        boxShadow: '0 1px 2px rgba(42, 37, 32, 0.03)',
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        flexWrap: 'wrap',
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: '50%',
          background: accentSoft,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Timer size={17} color={accent} strokeWidth={1.7} />
      </div>

      <div style={{ flex: '1 1 230px', minWidth: 220 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            marginBottom: 8,
          }}
        >
          <span
            style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: 10,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: accent,
              fontWeight: 500,
            }}
          >
            {isFocus ? 'Foco 45 min' : 'Descanso 5 min'}
          </span>
          <span
            style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: 10,
              color: C.muted,
            }}
          >
            {running ? 'corriendo' : 'pausado'}
          </span>
        </div>
        <div
          style={{
            height: 5,
            background: C.lineSoft,
            borderRadius: 5,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${Math.min(100, Math.max(0, progress * 100))}%`,
              background: accent,
              transition: 'width 0.2s ease',
            }}
          />
        </div>
      </div>

      <div
        style={{
          fontFamily: '"Instrument Serif", serif',
          fontSize: 36,
          color: C.ink,
          minWidth: 92,
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.02em',
        }}
      >
        {formatTimer(seconds)}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <TimerButton onClick={running ? onPause : onStart} title={running ? 'Pausar' : 'Iniciar'} accent={accent}>
          {running ? <Pause size={13} strokeWidth={2} /> : <Play size={13} strokeWidth={2} />}
        </TimerButton>
        <TimerButton onClick={onReset} title="Reiniciar" accent={accent}>
          <RotateCcw size={13} strokeWidth={2} />
        </TimerButton>
        <button
          onClick={onSwitchMode}
          style={{
            background: 'transparent',
            border: `1px solid ${C.line}`,
            color: C.inkSoft,
            padding: '9px 12px',
            borderRadius: 2,
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
          }}
        >
          {isFocus ? 'Descanso' : 'Foco'}
        </button>
      </div>
    </div>
  );
}

function TimerButton({ children, onClick, title, accent }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 34,
        height: 34,
        background: accent,
        color: C.surface,
        border: 'none',
        borderRadius: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </button>
  );
}

function PlanningSummary({ totals, accent }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        marginTop: 12,
        flexWrap: 'wrap',
      }}
    >
      <MetricPill value={`${totals.effort} pts`} accent={accent} />
      <MetricPill value={`${totals.hours}h`} accent={accent} />
      <MetricPill value={`${totals.due} fecha${totals.due === 1 ? '' : 's'}`} accent={accent} muted />
    </div>
  );
}

function MetricPill({ value, accent, muted }) {
  return (
    <span
      style={{
        background: muted ? C.bgAlt : C.surfaceElevated,
        border: `1px solid ${muted ? C.lineSoft : accent}`,
        color: muted ? C.inkSoft : accent,
        borderRadius: 2,
        padding: '4px 7px',
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: 10,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {value}
    </span>
  );
}

function DeepSlotsIndicator({ count }) {
  const isFull = count >= 2;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '18px 22px',
        background: isFull ? CATEGORIES.deep.accentSoft : C.surfaceElevated,
        border: `1px solid ${isFull ? '#e0c1ad' : C.line}`,
        borderRadius: 3,
        boxShadow: '0 1px 2px rgba(42, 37, 32, 0.03)',
        flexWrap: 'wrap',
      }}
    >
      <Flame
        size={16}
        color={isFull ? C.accent : C.muted}
        strokeWidth={1.5}
        className={isFull ? 'pulse' : ''}
      />
      <span
        style={{
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: 10,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: isFull ? C.accentDark : C.inkSoft,
          flex: 1,
          minWidth: 120,
        }}
      >
        Frentes profundos activos
      </span>
      <div style={{ display: 'flex', gap: 6 }}>
        {[0, 1].map((s) => (
          <div
            key={s}
            style={{
              width: 28,
              height: 4,
              background: s < count ? C.accent : C.lineSoft,
              transition: 'background 0.2s',
              borderRadius: 2,
            }}
          />
        ))}
      </div>
      <span
        style={{
          fontFamily: '"Instrument Serif", serif',
          fontSize: 20,
          color: isFull ? C.accent : C.ink,
          minWidth: 36,
          textAlign: 'right',
          letterSpacing: '-0.01em',
        }}
      >
        {count}
        <span style={{ color: C.mutedLight }}>/2</span>
      </span>
    </div>
  );
}

function Column({
  categoryKey,
  category,
  topics,
  onMove,
  onDelete,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  onUpdatePlanning,
  onMarkAsDone,
  onDropTopic,
  onDragOverCategory,
  onDragLeaveCategory,
  onDragStartTopic,
  onDragEndTopic,
  draggingTopicId,
  isDragOver,
}) {
  const Icon = category.icon;
  const totals = getPlanningTotals(topics);
  return (
    <div
      onDragOver={(e) => onDragOverCategory(categoryKey, e)}
      onDrop={(e) => onDropTopic(categoryKey, e)}
      style={{
        background: C.surface,
        border: `1px solid ${isDragOver ? category.accent : C.line}`,
        borderRadius: 3,
        padding: 22,
        minHeight: 320,
        boxShadow: isDragOver ? `0 0 0 3px ${category.accentSoft}` : '0 1px 2px rgba(42, 37, 32, 0.03)',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      <div style={{ marginBottom: 22 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 8,
          }}
        >
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              background: category.accentSoft,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon size={13} color={category.accent} strokeWidth={1.8} />
          </div>
          <h2
            style={{
              fontFamily: '"Instrument Serif", serif',
              fontSize: 24,
              fontWeight: 400,
              margin: 0,
              color: C.ink,
              letterSpacing: '-0.015em',
            }}
          >
            {category.label}
          </h2>
          <span
            style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: 11,
              color: C.muted,
              marginLeft: 'auto',
              fontVariantNumeric: 'tabular-nums',
              background: C.bgAlt,
              padding: '2px 8px',
              borderRadius: 10,
            }}
          >
            {topics.length}
          </span>
        </div>
        <p
          style={{
            fontSize: 12,
            color: C.inkSoft,
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          {category.tagline}
        </p>
        <p
          style={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: 9,
            color: category.accent,
            margin: '6px 0 0',
            textTransform: 'uppercase',
            letterSpacing: '0.18em',
            fontWeight: 500,
          }}
        >
          {category.hint}
        </p>
        <PlanningSummary totals={totals} accent={category.accent} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {topics.length === 0 ? (
          <div
            style={{
              padding: '28px 0',
              textAlign: 'center',
              color: C.mutedLight,
              fontSize: 12,
              fontStyle: 'italic',
              fontFamily: '"Instrument Serif", serif',
            }}
          >
            vacío
          </div>
        ) : (
          topics.map((t) => (
            <TopicCard
              key={t.id}
              topic={t}
              accent={category.accent}
              accentSoft={category.accentSoft}
              canMoveUp={categoryKey !== 'deep'}
              canMoveDown={categoryKey !== 'backlog'}
              onMoveUp={() => onMove(t.id, 'up')}
              onMoveDown={() => onMove(t.id, 'down')}
              onDelete={() => onDelete(t.id)}
              onAddSubtask={(text) => onAddSubtask(t.id, text)}
              onToggleSubtask={(subId) => onToggleSubtask(t.id, subId)}
              onDeleteSubtask={(subId) => onDeleteSubtask(t.id, subId)}
              onUpdatePlanning={(updates) => onUpdatePlanning(t.id, updates)}
              onMarkAsDone={() => onMarkAsDone(t.id)}
              onDragStart={(event) => onDragStartTopic(t.id, event)}
              onDragEnd={onDragEndTopic}
              dragging={draggingTopicId === t.id}
            />
          ))
        )}
      </div>
    </div>
  );
}

function DoneColumn({ sectionRef, category, topics, highlightedId, onReopen, onDelete }) {
  const Icon = category.icon;
  const totals = getPlanningTotals(topics);

  return (
    <div
      ref={sectionRef}
      style={{
        background: C.surface,
        border: `1px solid ${highlightedId ? category.accent : C.line}`,
        borderRadius: 3,
        padding: 22,
        minHeight: 320,
        boxShadow: highlightedId ? `0 0 0 3px ${category.accentSoft}` : '0 1px 2px rgba(42, 37, 32, 0.03)',
        scrollMarginTop: 18,
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
      }}
    >
      <div style={{ marginBottom: 22 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 8,
          }}
        >
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              background: category.accentSoft,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon size={13} color={category.accent} strokeWidth={1.8} />
          </div>
          <h2
            style={{
              fontFamily: '"Instrument Serif", serif',
              fontSize: 24,
              fontWeight: 400,
              margin: 0,
              color: C.ink,
              letterSpacing: '-0.015em',
            }}
          >
            {category.label}
          </h2>
          <span
            style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: 11,
              color: C.muted,
              marginLeft: 'auto',
              fontVariantNumeric: 'tabular-nums',
              background: C.bgAlt,
              padding: '2px 8px',
              borderRadius: 10,
            }}
          >
            {topics.length}
          </span>
        </div>
        <p
          style={{
            fontSize: 12,
            color: C.inkSoft,
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          {category.tagline}
        </p>
        <p
          style={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: 9,
            color: category.accent,
            margin: '6px 0 0',
            textTransform: 'uppercase',
            letterSpacing: '0.18em',
            fontWeight: 500,
          }}
        >
          {category.hint}
        </p>
        <PlanningSummary totals={totals} accent={category.accent} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {topics.length === 0 ? (
          <div
            style={{
              padding: '28px 0',
              textAlign: 'center',
              color: C.mutedLight,
              fontSize: 12,
              fontStyle: 'italic',
              fontFamily: '"Instrument Serif", serif',
            }}
          >
            vacio
          </div>
        ) : (
          topics.map((t) => (
            <DoneCard
              key={t.id}
              topic={t}
              category={category}
              highlighted={t.id === highlightedId}
              onReopen={() => onReopen(t.id)}
              onDelete={() => onDelete(t.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function TopicCard({
  topic,
  accent,
  accentSoft,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onDelete,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  onUpdatePlanning,
  onMarkAsDone,
  onDragStart,
  onDragEnd,
  dragging,
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [subtaskInput, setSubtaskInput] = useState('');
  const subtaskInputRef = useRef(null);
  const subtasks = topic.subtasks || [];
  const doneCount = subtasks.filter((s) => s.done).length;
  const total = subtasks.length;
  const effortPoints = Number.isFinite(Number(topic.effortPoints)) ? Number(topic.effortPoints) : 1;
  const timeHours = Number.isFinite(Number(topic.timeHours)) ? Number(topic.timeHours) : 1;
  const targetDate = topic.targetDate || '';
  const progress = total > 0 ? doneCount / total : 0;
  const allDone = total > 0 && doneCount === total;

  useEffect(() => {
    if (isAdding && subtaskInputRef.current) {
      subtaskInputRef.current.focus();
    }
  }, [isAdding]);

  const handleSubmitSubtask = () => {
    if (subtaskInput.trim()) {
      onAddSubtask(subtaskInput);
      setSubtaskInput('');
    }
    setIsAdding(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmitSubtask();
    } else if (e.key === 'Escape') {
      setSubtaskInput('');
      setIsAdding(false);
    }
  };

  return (
    <div
      className="card-hover fade-in"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        background: C.surfaceElevated,
        border: `1px solid ${C.lineSoft}`,
        padding: '13px 15px',
        borderRadius: 3,
        position: 'relative',
        cursor: dragging ? 'grabbing' : 'grab',
        opacity: dragging ? 0.48 : 1,
        outline: dragging ? `2px solid ${accent}` : 'none',
        outlineOffset: 2,
      }}
    >
      {/* Progress bar */}
      {total > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            background: C.lineSoft,
            borderRadius: '3px 3px 0 0',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progress * 100}%`,
              background: accent,
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 8,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13.5,
              color: C.ink,
              lineHeight: 1.5,
              wordBreak: 'break-word',
              fontWeight: 400,
              textDecoration: allDone ? 'line-through' : 'none',
              opacity: allDone ? 0.6 : 1,
            }}
          >
            {topic.title}
          </div>
          <div
            style={{
              fontSize: 10,
              color: C.muted,
              marginTop: 6,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              fontFamily: '"IBM Plex Mono", monospace',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: accent, fontSize: 8 }}>●</span>
              {formatDaysAgo(topic.movedAt)}
            </span>
            {total > 0 && (
              <span
                style={{
                  fontVariantNumeric: 'tabular-nums',
                  color: allDone ? accent : C.muted,
                  fontWeight: allDone ? 500 : 400,
                }}
              >
                {doneCount}/{total}
              </span>
            )}
            {targetDate && (
              <span style={{ color: getTargetLabel(targetDate).startsWith('Vencido') ? C.accent : C.muted }}>
                {getTargetLabel(targetDate)}
              </span>
            )}
          </div>

          <PlanningControls
            effortPoints={effortPoints}
            timeHours={timeHours}
            targetDate={targetDate}
            accent={accent}
            onChange={onUpdatePlanning}
          />
        </div>

        <div
          className="card-actions"
          style={{
            display: 'flex',
            gap: 2,
            opacity: 0,
            transition: 'opacity 0.15s',
          }}
        >
          {onMarkAsDone && (
            <IconButton onClick={onMarkAsDone} title="Marcar como Completado" done>
              <Check size={12} strokeWidth={2.2} />
            </IconButton>
          )}
          {canMoveUp && (
            <IconButton onClick={onMoveUp} title="Subir prioridad">
              <ArrowUp size={12} strokeWidth={1.8} />
            </IconButton>
          )}
          {canMoveDown && (
            <IconButton onClick={onMoveDown} title="Bajar prioridad">
              <ArrowDown size={12} strokeWidth={1.8} />
            </IconButton>
          )}
          <IconButton onClick={onDelete} title="Eliminar" danger>
            <Trash2 size={12} strokeWidth={1.8} />
          </IconButton>
        </div>
      </div>

      {/* Subtasks list */}
      {total > 0 && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 10,
            borderTop: `1px dashed ${C.lineSoft}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {subtasks.map((sub) => (
            <SubtaskItem
              key={sub.id}
              subtask={sub}
              accent={accent}
              accentSoft={accentSoft}
              onToggle={() => onToggleSubtask(sub.id)}
              onDelete={() => onDeleteSubtask(sub.id)}
            />
          ))}
        </div>
      )}

      {/* Add subtask */}
      <div style={{ marginTop: total > 0 ? 8 : 10 }}>
        {isAdding ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: C.bg,
              border: `1px solid ${accent}`,
              borderRadius: 2,
              padding: '6px 10px',
            }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                border: `1.5px solid ${C.mutedLight}`,
                borderRadius: 2,
                flexShrink: 0,
              }}
            />
            <input
              ref={subtaskInputRef}
              value={subtaskInput}
              onChange={(e) => setSubtaskInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSubmitSubtask}
              placeholder="Nueva subtarea…"
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: C.ink,
                fontSize: 12,
                fontFamily: 'inherit',
                padding: '2px 0',
                minWidth: 0,
              }}
            />
          </div>
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            style={{
              background: 'transparent',
              border: 'none',
              color: C.muted,
              padding: '4px 6px',
              fontSize: 11,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontFamily: '"IBM Plex Mono", monospace',
              letterSpacing: '0.05em',
              transition: 'color 0.15s',
              marginLeft: -6,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = accent)}
            onMouseLeave={(e) => (e.currentTarget.style.color = C.muted)}
          >
            <Plus size={12} strokeWidth={2} />
            {total === 0 ? 'Agregar subtarea' : 'Agregar'}
          </button>
        )}
      </div>
    </div>
  );
}

function PlanningControls({ effortPoints, timeHours, targetDate, accent, onChange }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))',
        gap: 8,
        marginTop: 10,
      }}
    >
      <label
        style={{
          background: C.bg,
          border: `1px solid ${C.lineSoft}`,
          borderRadius: 2,
          padding: '7px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: 9,
            color: C.muted,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            flexShrink: 0,
          }}
        >
          Pts
        </span>
        <select
          value={effortPoints}
          onChange={(e) => onChange({ effortPoints: Number(e.target.value) })}
          title="Puntos de esfuerzo"
          style={{
            flex: 1,
            minWidth: 0,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: accent,
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: 11,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          {EFFORT_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>

      <label
        style={{
          background: C.bg,
          border: `1px solid ${C.lineSoft}`,
          borderRadius: 2,
          padding: '7px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: 9,
            color: C.muted,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            flexShrink: 0,
          }}
        >
          Hrs
        </span>
        <input
          type="number"
          min="0.25"
          max="120"
          step="0.25"
          value={timeHours}
          onChange={(e) => onChange({ timeHours: e.target.value })}
          title="Tiempo estimado en horas"
          style={{
            flex: 1,
            minWidth: 0,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: accent,
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: 11,
            fontWeight: 500,
          }}
        />
      </label>

      <label
        style={{
          background: C.bg,
          border: `1px solid ${C.lineSoft}`,
          borderRadius: 2,
          padding: '7px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: 9,
            color: C.muted,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            flexShrink: 0,
          }}
        >
          Obj
        </span>
        <input
          type="date"
          value={targetDate}
          onChange={(e) => onChange({ targetDate: e.target.value })}
          title="Fecha objetivo"
          style={{
            flex: 1,
            minWidth: 0,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: targetDate ? accent : C.muted,
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: 10,
            fontWeight: 500,
          }}
        />
      </label>
    </div>
  );
}

function SubtaskItem({ subtask, accent, accentSoft, onToggle, onDelete }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '3px 6px 3px 0',
        borderRadius: 2,
        transition: 'background 0.15s',
        background: hover ? C.bg : 'transparent',
        marginLeft: -6,
        marginRight: -6,
        paddingLeft: 6,
        paddingRight: 6,
      }}
    >
      <button
        onClick={onToggle}
        style={{
          width: 14,
          height: 14,
          border: `1.5px solid ${subtask.done ? accent : C.mutedLight}`,
          background: subtask.done ? accent : 'transparent',
          borderRadius: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          padding: 0,
          transition: 'all 0.15s',
          cursor: 'pointer',
        }}
      >
        {subtask.done && <Check size={10} strokeWidth={3} color={C.surface} />}
      </button>
      <span
        onClick={onToggle}
        style={{
          flex: 1,
          fontSize: 12.5,
          color: subtask.done ? C.muted : C.inkSoft,
          textDecoration: subtask.done ? 'line-through' : 'none',
          lineHeight: 1.5,
          cursor: 'pointer',
          wordBreak: 'break-word',
        }}
      >
        {subtask.text}
      </span>
      {hover && (
        <button
          onClick={onDelete}
          style={{
            background: 'transparent',
            border: 'none',
            color: C.mutedLight,
            padding: 2,
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer',
            transition: 'color 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = C.accent)}
          onMouseLeave={(e) => (e.currentTarget.style.color = C.mutedLight)}
        >
          <X size={12} strokeWidth={1.8} />
        </button>
      )}
    </div>
  );
}

function IconButton({ children, onClick, title, danger, done }) {
  const [hover, setHover] = useState(false);
  const hoverBg = done ? CATEGORIES.done.accentSoft : danger ? '#f3ded4' : C.bgAlt;
  const hoverColor = done ? CATEGORIES.done.accent : danger ? C.accent : C.ink;
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? hoverBg : 'transparent',
        color: hover ? hoverColor : C.muted,
        border: 'none',
        padding: 6,
        borderRadius: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  );
}

const BRAIN_NODE_POSITIONS = [
  [142, 174],
  [214, 120],
  [304, 94],
  [420, 100],
  [534, 132],
  [612, 190],
  [566, 266],
  [456, 306],
  [338, 312],
  [230, 274],
  [166, 226],
  [280, 188],
  [390, 184],
  [502, 220],
  [366, 246],
  [250, 226],
  [468, 146],
  [580, 166],
  [316, 142],
  [420, 274],
  [196, 184],
  [526, 274],
  [324, 230],
  [462, 226],
];

const GRAPH_HUBS = {
  deep: { x: 190, y: 128 },
  reference: { x: 380, y: 112 },
  backlog: { x: 570, y: 128 },
  done: { x: 730, y: 240 },
};

const GRAPH_STOP_WORDS = new Set([
  'para',
  'con',
  'por',
  'los',
  'las',
  'del',
  'una',
  'uno',
  'que',
  'este',
  'esta',
  'como',
  'general',
  'tema',
]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getTopicDepth(topic) {
  const subtasks = topic.subtasks || [];
  const doneCount = subtasks.filter((s) => s.done).length;
  const total = subtasks.length;
  const effortPoints = Number.isFinite(Number(topic.effortPoints)) ? Number(topic.effortPoints) : 1;
  const timeHours = Number.isFinite(Number(topic.timeHours)) ? Number(topic.timeHours) : 1;
  const baseByCategory = {
    deep: 72,
    reference: 44,
    backlog: 24,
    done: 88,
  };
  const progress = total > 0 ? doneCount / total : 0;
  const subtaskBonus = Math.min(total * 5, 18);
  const progressBonus = Math.round(progress * 10);
  const effortBonus = Math.min(effortPoints * 2, 18);
  const timeBonus = Math.min(Math.round(timeHours * 1.2), 14);
  const daysUntilTarget = topic.targetDate
    ? Math.round((getTargetDateTime(topic) - new Date().setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24))
    : Number.POSITIVE_INFINITY;
  const urgencyBonus = daysUntilTarget <= 0 ? 10 : daysUntilTarget <= 7 ? 6 : daysUntilTarget <= 14 ? 3 : 0;
  return clamp((baseByCategory[topic.category] || 24) + subtaskBonus + progressBonus + effortBonus + timeBonus + urgencyBonus, 10, 100);
}

function getBrainNodePosition(index) {
  const [x, y] = BRAIN_NODE_POSITIONS[index % BRAIN_NODE_POSITIONS.length];
  const lap = Math.floor(index / BRAIN_NODE_POSITIONS.length);
  if (lap === 0) return { x, y };
  return {
    x: clamp(x + ((index % 5) - 2) * 14, 110, 640),
    y: clamp(y + ((lap % 3) - 1) * 16, 82, 328),
  };
}

function getTopicKeywords(title) {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !GRAPH_STOP_WORDS.has(word))
    .slice(0, 8);
}

function getSharedKeywords(left, right) {
  const rightWords = new Set(right.keywords);
  return left.keywords.filter((word) => rightWords.has(word));
}

function getGraphTopicPosition(categoryKey, index, total) {
  const hub = GRAPH_HUBS[categoryKey] || GRAPH_HUBS.backlog;
  const angle = (Math.PI * 2 * index) / Math.max(total, 1) - Math.PI / 2;
  const ring = total > 5 ? 108 : 86;
  const wobble = index % 2 === 0 ? 14 : -10;
  return {
    x: clamp(hub.x + Math.cos(angle) * (ring + wobble), 64, 836),
    y: clamp(hub.y + Math.sin(angle) * (ring - wobble), 72, 392),
  };
}

function buildGraphNodes(topics) {
  const categoryCounts = topics.reduce((counts, topic) => {
    const key = topic.category || 'backlog';
    return { ...counts, [key]: (counts[key] || 0) + 1 };
  }, {});
  const categorySeen = {};

  return topics.slice(0, 36).map((topic) => {
    const categoryKey = topic.category || 'backlog';
    const category = CATEGORIES[categoryKey] || CATEGORIES.backlog;
    const index = categorySeen[categoryKey] || 0;
    categorySeen[categoryKey] = index + 1;
    const position = getGraphTopicPosition(categoryKey, index, categoryCounts[categoryKey] || 1);
    const depth = getTopicDepth(topic);
    return {
      id: topic.id,
      topic,
      category,
      categoryKey,
      depth,
      keywords: getTopicKeywords(topic.title),
      radius: 7 + depth * 0.08,
      ...position,
    };
  });
}

function buildGraphEdges(nodes) {
  const categoryEdges = nodes.map((node) => ({
    id: `cat-${node.id}`,
    type: 'category',
    from: node,
    to: GRAPH_HUBS[node.categoryKey] || GRAPH_HUBS.backlog,
    color: node.category.accent,
    width: 1.2,
    opacity: 0.34,
  }));

  const relationEdges = [];
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const shared = getSharedKeywords(nodes[i], nodes[j]);
      if (shared.length === 0) continue;
      relationEdges.push({
        id: `rel-${nodes[i].id}-${nodes[j].id}`,
        type: 'relation',
        from: nodes[i],
        to: nodes[j],
        keywords: shared,
        color: nodes[i].categoryKey === nodes[j].categoryKey ? nodes[i].category.accent : C.muted,
        width: Math.min(1 + shared.length * 0.55, 2.8),
        opacity: Math.min(0.26 + shared.length * 0.12, 0.68),
      });
    }
  }

  return [
    ...categoryEdges,
    ...relationEdges
      .sort((a, b) => b.keywords.length - a.keywords.length)
      .slice(0, 42),
  ];
}

function BrainDepthMap({ topics }) {
  const nodes = topics
    .map((topic, index) => {
      const depth = getTopicDepth(topic);
      const category = CATEGORIES[topic.category] || CATEGORIES.backlog;
      const position = getBrainNodePosition(index);
      return {
        topic,
        depth,
        category,
        radius: 6 + depth * 0.12,
        ...position,
      };
    })
    .sort((a, b) => b.depth - a.depth);

  const topNodes = nodes.slice(0, 6);
  const totalEffort = topics.reduce((sum, topic) => sum + (Number(topic.effortPoints) || 0), 0);
  const totalHours = topics.reduce((sum, topic) => sum + (Number(topic.timeHours) || 0), 0);
  const totalDue = topics.filter((topic) => topic.targetDate).length;

  return (
    <section
      style={{
        marginTop: 52,
        background: C.surface,
        border: `1px solid ${C.line}`,
        borderRadius: 3,
        padding: 24,
        boxShadow: '0 1px 2px rgba(42, 37, 32, 0.03)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 20,
          marginBottom: 20,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 8,
            }}
          >
            <Brain size={17} color={C.accent} strokeWidth={1.5} />
            <span
              style={{
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: 10,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: C.muted,
              }}
            >
              Cerebro visual
            </span>
          </div>
          <h2
            style={{
              fontFamily: '"Instrument Serif", serif',
              fontSize: 30,
              lineHeight: 1.05,
              fontWeight: 400,
              margin: 0,
              color: C.ink,
              letterSpacing: '-0.015em',
            }}
          >
            Mapa de profundidad
          </h2>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
          }}
        >
          <div
            style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: 10,
              color: C.ink,
              background: C.bgAlt,
              border: `1px solid ${C.lineSoft}`,
              padding: '6px 9px',
              borderRadius: 2,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            {totalEffort} pts / {totalHours}h / {totalDue} fechas
          </div>
          {Object.entries(CATEGORIES).map(([key, cat]) => (
            <div
              key={key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: 10,
                color: C.inkSoft,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: cat.accent,
                  display: 'inline-block',
                }}
              />
              {cat.label}
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 24,
          alignItems: 'stretch',
        }}
      >
        <div
          style={{
            flex: '1 1 520px',
            minWidth: 260,
            background: C.surfaceElevated,
            border: `1px solid ${C.lineSoft}`,
            borderRadius: 3,
            minHeight: 300,
            overflow: 'hidden',
          }}
        >
          <svg
            viewBox="0 0 760 420"
            role="img"
            aria-label="Mapa visual de profundidad por tema"
            style={{
              width: '100%',
              height: '100%',
              minHeight: 300,
              display: 'block',
            }}
          >
            <path
              d="M144 226c-38-22-50-76-22-114 20-27 50-38 82-31 22-39 70-58 116-44 20-21 56-25 82-8 18 12 30 30 33 50 42-8 86 13 106 51 36 2 68 27 80 62 14 41-4 85-42 107-8 43-45 72-88 73-28 34-82 40-119 12-43 18-94 5-123-30-42 4-82-18-99-55-32-7-56-35-56-68 0-2 0-4 0-5z"
              fill="#fffaf2"
              stroke={C.line}
              strokeWidth="2"
            />
            <path
              d="M380 54c-15 34-12 70 8 102 14 22 16 54-2 78-16 22-17 52 0 82 10 17 10 34 0 50"
              fill="none"
              stroke={C.lineSoft}
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M182 171c32-30 80-35 118-12M196 257c42-8 78 3 108 31M448 148c52-22 106-8 138 32M456 290c45 3 84-12 112-44M284 92c22 26 30 54 24 84M508 96c-18 30-19 62-3 96"
              fill="none"
              stroke={C.lineSoft}
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity="0.8"
            />

            {nodes.slice(0, 28).map((node, index) => {
              const next = nodes[index + 1];
              if (!next) return null;
              return (
                <line
                  key={`edge-${node.topic.id}`}
                  x1={node.x}
                  y1={node.y}
                  x2={next.x}
                  y2={next.y}
                  stroke={C.lineSoft}
                  strokeWidth="1"
                  opacity="0.55"
                />
              );
            })}

            {nodes.slice(0, 28).map((node, index) => (
              <g key={node.topic.id}>
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={node.radius + 5}
                  fill={node.category.accentSoft}
                  opacity={0.45 + node.depth / 220}
                />
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={node.radius}
                  fill={node.category.accent}
                  opacity={0.72 + node.depth / 360}
                  stroke={C.surfaceElevated}
                  strokeWidth="2"
                />
                <text
                  x={node.x}
                  y={node.y + 3.5}
                  textAnchor="middle"
                  fontFamily="IBM Plex Mono, monospace"
                  fontSize="10"
                  fill={C.surface}
                  fontWeight="500"
                >
                  {index + 1}
                </text>
                <title>{`${node.topic.title} - ${node.depth}/100`}</title>
              </g>
            ))}
          </svg>
        </div>

        <div
          style={{
            flex: '1 1 250px',
            borderLeft: `1px solid ${C.line}`,
            paddingLeft: 22,
            minHeight: 300,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: 10,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: C.muted,
              marginBottom: 14,
            }}
          >
            Mayor profundidad
          </div>

          {topNodes.length === 0 ? (
            <div
              style={{
                color: C.muted,
                fontSize: 13,
                lineHeight: 1.5,
                marginTop: 8,
              }}
            >
              Sin temas todavia.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topNodes.map((node, index) => (
                <div
                  key={`rank-${node.topic.id}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '24px minmax(0, 1fr) 48px',
                    gap: 10,
                    alignItems: 'center',
                    paddingBottom: 10,
                    borderBottom: index === topNodes.length - 1 ? 'none' : `1px solid ${C.lineSoft}`,
                  }}
                >
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: node.category.accent,
                      color: C.surface,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: '"IBM Plex Mono", monospace',
                      fontSize: 10,
                      fontWeight: 500,
                    }}
                  >
                    {index + 1}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        color: C.ink,
                        fontSize: 13,
                        lineHeight: 1.35,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={node.topic.title}
                    >
                      {node.topic.title}
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        fontFamily: '"IBM Plex Mono", monospace',
                        fontSize: 9,
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                        color: node.category.accent,
                      }}
                    >
                      {node.category.label} / {node.topic.effortPoints || 1} pts / {node.topic.timeHours || 1}h
                      {node.topic.targetDate ? ` / Obj ${formatTargetDate(node.topic.targetDate)}` : ''}
                    </div>
                  </div>
                  <div
                    style={{
                      fontFamily: '"Instrument Serif", serif',
                      color: node.category.accent,
                      fontSize: 22,
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {node.depth}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function TopicGraphMap({ topics }) {
  const nodes = buildGraphNodes(topics);
  const edges = buildGraphEdges(nodes);
  const relationEdges = edges.filter((edge) => edge.type === 'relation');
  const topConnected = nodes
    .map((node) => ({
      ...node,
      links: relationEdges.filter((edge) => edge.from.id === node.id || edge.to.id === node.id).length,
    }))
    .sort((a, b) => b.links - a.links || b.depth - a.depth)
    .slice(0, 6);

  return (
    <section
      style={{
        marginTop: 28,
        background: C.surface,
        border: `1px solid ${C.line}`,
        borderRadius: 3,
        padding: 24,
        boxShadow: '0 1px 2px rgba(42, 37, 32, 0.03)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 20,
          marginBottom: 20,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 8,
            }}
          >
            <Brain size={17} color={C.accent} strokeWidth={1.5} />
            <span
              style={{
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: 10,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: C.muted,
              }}
            >
              Grafo de conocimiento
            </span>
          </div>
          <h2
            style={{
              fontFamily: '"Instrument Serif", serif',
              fontSize: 30,
              lineHeight: 1.05,
              fontWeight: 400,
              margin: 0,
              color: C.ink,
              letterSpacing: '-0.015em',
            }}
          >
            Mapa de grafos
          </h2>
        </div>

        <div
          style={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: 10,
            color: C.ink,
            background: C.bgAlt,
            border: `1px solid ${C.lineSoft}`,
            padding: '6px 9px',
            borderRadius: 2,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          {nodes.length} nodos / {relationEdges.length} relaciones
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 24,
          alignItems: 'stretch',
        }}
      >
        <div
          style={{
            flex: '1 1 560px',
            minWidth: 260,
            background: C.surfaceElevated,
            border: `1px solid ${C.lineSoft}`,
            borderRadius: 3,
            minHeight: 340,
            overflow: 'hidden',
          }}
        >
          <svg
            viewBox="0 0 900 460"
            role="img"
            aria-label="Grafo de relaciones entre temas"
            style={{
              width: '100%',
              height: '100%',
              minHeight: 340,
              display: 'block',
            }}
          >
            <rect x="0" y="0" width="900" height="460" fill={C.surfaceElevated} />

            {Object.entries(GRAPH_HUBS).map(([key, hub]) => {
              const category = CATEGORIES[key];
              return (
                <g key={`hub-${key}`}>
                  <circle
                    cx={hub.x}
                    cy={hub.y}
                    r="31"
                    fill={category.accentSoft}
                    stroke={category.accent}
                    strokeWidth="1.5"
                  />
                  <circle cx={hub.x} cy={hub.y} r="8" fill={category.accent} />
                  <text
                    x={hub.x}
                    y={hub.y + 50}
                    textAnchor="middle"
                    fontFamily="IBM Plex Mono, monospace"
                    fontSize="10"
                    fill={C.inkSoft}
                    textTransform="uppercase"
                  >
                    {category.label}
                  </text>
                </g>
              );
            })}

            {edges.map((edge) => (
              <line
                key={edge.id}
                x1={edge.from.x}
                y1={edge.from.y}
                x2={edge.to.x}
                y2={edge.to.y}
                stroke={edge.color}
                strokeWidth={edge.width}
                opacity={edge.opacity}
                strokeLinecap="round"
              >
                {edge.keywords && <title>{edge.keywords.join(', ')}</title>}
              </line>
            ))}

            {nodes.map((node) => (
              <g key={`node-${node.id}`}>
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={node.radius + 7}
                  fill={node.category.accentSoft}
                  opacity="0.58"
                />
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={node.radius}
                  fill={node.category.accent}
                  stroke={C.surfaceElevated}
                  strokeWidth="2"
                  opacity="0.9"
                />
                <text
                  x={node.x}
                  y={node.y + 3.5}
                  textAnchor="middle"
                  fontFamily="IBM Plex Mono, monospace"
                  fontSize="9"
                  fill={C.surface}
                  fontWeight="500"
                >
                  {node.depth}
                </text>
                <title>
                  {`${node.topic.title} / ${node.category.label} / ${node.keywords.join(', ')}`}
                </title>
              </g>
            ))}
          </svg>
        </div>

        <div
          style={{
            flex: '1 1 260px',
            borderLeft: `1px solid ${C.line}`,
            paddingLeft: 22,
            minHeight: 340,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: 10,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: C.muted,
              marginBottom: 14,
            }}
          >
            Nodos mas conectados
          </div>

          {nodes.length === 0 ? (
            <div
              style={{
                color: C.muted,
                fontSize: 13,
                lineHeight: 1.5,
                marginTop: 8,
              }}
            >
              Sin temas todavia.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topConnected.map((node, index) => (
                <div
                  key={`connected-${node.id}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '24px minmax(0, 1fr) 44px',
                    gap: 10,
                    alignItems: 'center',
                    paddingBottom: 10,
                    borderBottom: index === topConnected.length - 1 ? 'none' : `1px solid ${C.lineSoft}`,
                  }}
                >
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: node.category.accent,
                      color: C.surface,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: '"IBM Plex Mono", monospace',
                      fontSize: 10,
                      fontWeight: 500,
                    }}
                  >
                    {index + 1}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        color: C.ink,
                        fontSize: 13,
                        lineHeight: 1.35,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={node.topic.title}
                    >
                      {node.topic.title}
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        fontFamily: '"IBM Plex Mono", monospace',
                        fontSize: 9,
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                        color: node.category.accent,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {node.keywords.length > 0 ? node.keywords.join(' / ') : node.category.label}
                    </div>
                  </div>
                  <div
                    style={{
                      fontFamily: '"Instrument Serif", serif',
                      color: node.category.accent,
                      fontSize: 22,
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {node.links}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Principle({ num, title, body }) {
  return (
    <div>
      <div
        style={{
          fontFamily: '"Instrument Serif", serif',
          fontSize: 38,
          color: C.accent,
          fontStyle: 'italic',
          lineHeight: 1,
          marginBottom: 12,
          letterSpacing: '-0.02em',
        }}
      >
        {num}
      </div>
      <h3
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.15em',
          color: C.ink,
          margin: '0 0 10px',
          fontWeight: 500,
          fontFamily: '"IBM Plex Mono", monospace',
        }}
      >
        {title}
      </h3>
      <p
        style={{
          fontSize: 13,
          color: C.inkSoft,
          lineHeight: 1.65,
          margin: 0,
        }}
      >
        {body}
      </p>
    </div>
  );
}

function SwapModal({ deepTopics, incoming, onConfirm, onCancel }) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(42, 37, 32, 0.5)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.surface,
          border: `1px solid ${C.line}`,
          padding: 34,
          maxWidth: 500,
          width: '100%',
          borderRadius: 4,
          boxShadow: '0 20px 60px rgba(42, 37, 32, 0.25)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <AlertTriangle size={16} color={C.accent} strokeWidth={1.5} />
          <span
            style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: 10,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: C.accent,
              fontWeight: 500,
            }}
          >
            Límite alcanzado
          </span>
        </div>

        <h3
          style={{
            fontFamily: '"Instrument Serif", serif',
            fontSize: 30,
            fontWeight: 400,
            margin: '0 0 14px',
            lineHeight: 1.15,
            color: C.ink,
            letterSpacing: '-0.015em',
          }}
        >
          Ya tienes 2 frentes profundos.
        </h3>

        <p style={{ fontSize: 14, color: C.inkSoft, lineHeight: 1.6, marginBottom: 26 }}>
          Para subir <span style={{ color: C.ink, fontWeight: 500 }}>"{incoming?.title}"</span> a
          Profundo, uno tiene que bajar. Elige cuál sale:
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
          {deepTopics.map((t) => (
            <button
              key={t.id}
              onClick={() => onConfirm(t.id)}
              style={{
                background: C.surfaceElevated,
                border: `1px solid ${C.lineSoft}`,
                padding: '14px 18px',
                color: C.ink,
                textAlign: 'left',
                fontSize: 13.5,
                fontFamily: 'inherit',
                transition: 'all 0.15s',
                borderRadius: 3,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = C.accent;
                e.currentTarget.style.background = CATEGORIES.deep.accentSoft;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = C.lineSoft;
                e.currentTarget.style.background = C.surfaceElevated;
              }}
            >
              <div>{t.title}</div>
              <div
                style={{
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: 10,
                  color: C.muted,
                  marginTop: 5,
                  letterSpacing: '0.03em',
                }}
              >
                lleva {formatDaysAgo(t.movedAt)} en profundo → se va a Backlog
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={onCancel}
          style={{
            background: 'transparent',
            border: `1px solid ${C.line}`,
            color: C.inkSoft,
            padding: '12px 20px',
            fontSize: 11,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            width: '100%',
            fontFamily: '"IBM Plex Mono", monospace',
            borderRadius: 2,
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = C.bgAlt;
            e.currentTarget.style.color = C.ink;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = C.inkSoft;
          }}
        >
          Cancelar, mejor lo dejo en Backlog
        </button>
      </div>
    </div>
  );
}

function StableDoneSection({
  sectionRef,
  category,
  topics,
  highlightedId,
  onReopen,
  onDelete,
  onDropTopic,
  onDragOverCategory,
  onDragStartTopic,
  onDragEndTopic,
  draggingTopicId,
  isDragOver,
}) {
  const Icon = category.icon;
  const totals = getPlanningTotals(topics);

  return (
    <div
      ref={sectionRef}
      onDragOver={(e) => onDragOverCategory('done', e)}
      onDrop={(e) => onDropTopic('done', e)}
      style={{
        marginTop: 32,
        background: C.surface,
        border: `1px solid ${highlightedId || isDragOver ? category.accent : C.line}`,
        borderRadius: 3,
        padding: 22,
        minHeight: 260,
        boxShadow: highlightedId || isDragOver ? `0 0 0 3px ${category.accentSoft}` : '0 1px 2px rgba(42, 37, 32, 0.03)',
        scrollMarginTop: 18,
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      <div style={{ marginBottom: 22 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 8,
          }}
        >
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              background: category.accentSoft,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon size={13} color={category.accent} strokeWidth={1.8} />
          </div>
          <h2
            style={{
              fontFamily: '"Instrument Serif", serif',
              fontSize: 24,
              fontWeight: 400,
              margin: 0,
              color: C.ink,
              letterSpacing: '-0.015em',
            }}
          >
            {category.label}
          </h2>
          <span
            style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: 11,
              color: C.muted,
              marginLeft: 'auto',
              fontVariantNumeric: 'tabular-nums',
              background: C.bgAlt,
              padding: '2px 8px',
              borderRadius: 10,
            }}
          >
            {topics.length}
          </span>
        </div>
        <p
          style={{
            fontSize: 12,
            color: C.inkSoft,
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          {category.tagline}
        </p>
        <p
          style={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: 9,
            color: category.accent,
            margin: '6px 0 0',
            textTransform: 'uppercase',
            letterSpacing: '0.18em',
            fontWeight: 500,
          }}
        >
          Arrastra aqui para completar
        </p>
        <PlanningSummary totals={totals} accent={category.accent} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {topics.length === 0 ? (
          <div
            style={{
              padding: '28px 0',
              textAlign: 'center',
              color: C.mutedLight,
              fontSize: 12,
              fontStyle: 'italic',
              fontFamily: '"Instrument Serif", serif',
            }}
          >
            vacio
          </div>
        ) : (
          topics.map((t) => (
            <DoneCard
              key={t.id}
              topic={t}
              category={category}
              highlighted={t.id === highlightedId}
              onReopen={() => onReopen(t.id)}
              onDelete={() => onDelete(t.id)}
              onDragStart={(event) => onDragStartTopic(t.id, event)}
              onDragEnd={onDragEndTopic}
              dragging={draggingTopicId === t.id}
            />
          ))
        )}
      </div>
    </div>
  );
}

function DoneSection({
  sectionRef,
  category,
  topics,
  highlightedId,
  onReopen,
  onDelete,
  onDropTopic,
  onDragOverCategory,
  onDragLeaveCategory,
  onDragStartTopic,
  onDragEndTopic,
  draggingTopicId,
  isDragOver,
}) {
  const [expanded, setExpanded] = useState(true);
  const Icon = category.icon;
  const totals = getPlanningTotals(topics);

  useEffect(() => {
    if (highlightedId) setExpanded(true);
  }, [highlightedId]);

  return (
    <div
      ref={sectionRef}
      onDragOver={(e) => onDragOverCategory('done', e)}
      onDrop={(e) => onDropTopic('done', e)}
      style={{
        marginTop: 32,
        background: C.surface,
        border: `1px solid ${highlightedId || isDragOver ? category.accent : C.line}`,
        borderRadius: 3,
        overflow: 'hidden',
        boxShadow: highlightedId || isDragOver ? `0 0 0 3px ${category.accentSoft}` : '0 1px 2px rgba(42, 37, 32, 0.03)',
        scrollMarginTop: 18,
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
      }}
    >
      {/* Header - clickable to expand/collapse */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '18px 22px',
          background: 'transparent',
          border: 'none',
          fontFamily: 'inherit',
          textAlign: 'left',
          transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = C.bgAlt)}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: category.accentSoft,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon size={13} color={category.accent} strokeWidth={1.8} />
        </div>
        <h2
          style={{
            fontFamily: '"Instrument Serif", serif',
            fontSize: 22,
            fontWeight: 400,
            margin: 0,
            color: C.ink,
            letterSpacing: '-0.015em',
            flex: 1,
          }}
        >
          {category.label}
        </h2>
        <span
          style={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: 11,
            color: C.muted,
            fontVariantNumeric: 'tabular-nums',
            background: C.bgAlt,
            padding: '2px 8px',
            borderRadius: 10,
          }}
        >
          {topics.length} {topics.length === 1 ? 'tema' : 'temas'}
        </span>
        <span
          style={{
            fontSize: 16,
            color: C.muted,
            transition: 'transform 0.2s',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          ▾
        </span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div
          style={{
            padding: '0 22px 22px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 8,
          }}
        >
          <p
            style={{
              gridColumn: '1 / -1',
              fontSize: 12,
              color: C.inkSoft,
              margin: '0 0 12px',
              lineHeight: 1.5,
            }}
          >
            {category.tagline}
          </p>
          <div style={{ gridColumn: '1 / -1', marginBottom: 8 }}>
            <PlanningSummary totals={totals} accent={category.accent} />
          </div>
          {topics.length === 0 ? (
            <div
              style={{
                gridColumn: '1 / -1',
                background: C.surfaceElevated,
                border: `1px dashed ${C.lineSoft}`,
                borderRadius: 3,
                padding: '18px 20px',
                color: C.muted,
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              Todavia no hay temas completados. Marca un tema con el check para enviarlo aqui.
            </div>
          ) : (
            topics.map((t) => (
              <DoneCard
                key={t.id}
                topic={t}
                category={category}
                highlighted={t.id === highlightedId}
                onReopen={() => onReopen(t.id)}
                onDelete={() => onDelete(t.id)}
                onDragStart={(event) => onDragStartTopic(t.id, event)}
                onDragEnd={onDragEndTopic}
                dragging={draggingTopicId === t.id}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function DoneCard({ topic, category, highlighted, onReopen, onDelete, onDragStart, onDragEnd, dragging }) {
  const [hover, setHover] = useState(false);
  const subtasks = topic.subtasks || [];
  const doneCount = subtasks.filter((s) => s.done).length;
  const total = subtasks.length;
  const effortPoints = Number.isFinite(Number(topic.effortPoints)) ? Number(topic.effortPoints) : 1;
  const timeHours = Number.isFinite(Number(topic.timeHours)) ? Number(topic.timeHours) : 1;
  const targetDate = topic.targetDate || '';

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: highlighted ? category.accentSoft : C.surfaceElevated,
        border: `1px solid ${highlighted ? category.accent : C.lineSoft}`,
        padding: '12px 14px',
        borderRadius: 3,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        transition: 'all 0.2s',
        borderColor: highlighted ? category.accent : hover ? C.muted : C.lineSoft,
        boxShadow: highlighted ? '0 4px 14px rgba(61, 122, 95, 0.16)' : 'none',
        cursor: dragging ? 'grabbing' : 'grab',
        opacity: dragging ? 0.48 : 1,
        outline: dragging ? `2px solid ${category.accent}` : 'none',
        outlineOffset: 2,
      }}
    >
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: category.accent,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        <Check size={10} strokeWidth={3} color={C.surface} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            color: C.ink,
            lineHeight: 1.5,
            wordBreak: 'break-word',
            fontWeight: highlighted ? 500 : 400,
          }}
        >
          {topic.title}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginTop: 4,
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: 10,
            color: C.muted,
          }}
        >
          <span>Completado {formatDaysAgo(topic.movedAt)}</span>
          <span>{effortPoints} pts</span>
          <span>{timeHours}h</span>
          {targetDate && <span>Obj {formatTargetDate(targetDate)}</span>}
          {total > 0 && <span>{doneCount}/{total} subtareas</span>}
        </div>
      </div>

      {hover && (
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          <button
            onClick={onReopen}
            title="Reabrir en Backlog"
            style={{
              background: 'transparent',
              border: 'none',
              color: C.muted,
              padding: 5,
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              borderRadius: 2,
              transition: 'all 0.15s',
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: 10,
              gap: 4,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = C.ink;
              e.currentTarget.style.background = C.bgAlt;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = C.muted;
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <Archive size={11} strokeWidth={1.8} />
            Reabrir
          </button>
          <button
            onClick={onDelete}
            title="Eliminar"
            style={{
              background: 'transparent',
              border: 'none',
              color: C.mutedLight,
              padding: 5,
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              borderRadius: 2,
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = C.accent)}
            onMouseLeave={(e) => (e.currentTarget.style.color = C.mutedLight)}
          >
            <Trash2 size={11} strokeWidth={1.8} />
          </button>
        </div>
      )}
    </div>
  );
}

function BulkImportModal({ onImport, onCancel, currentDeepCount }) {
  // Pre-relleno con la clasificación de los 10 temas que acordamos
  const [deep, setDeep] = useState(
    `Framework MLOps interno (documentación + nueva versión)
Monitoring & Serving en SageMaker (drift, Model Monitor, endpoints)`
  );
  const [reference, setReference] = useState(
    `AWS Step Functions
AWS EventBridge`
  );
  const [backlog, setBacklog] = useState(
    `Feature Store (concepto general)
Feature Store (arquitectura)`
  );

  const parseLines = (text) =>
    text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

  const handleImport = () => {
    onImport({
      deep: parseLines(deep),
      reference: parseLines(reference),
      backlog: parseLines(backlog),
    });
  };

  const deepLines = parseLines(deep).length;
  const refLines = parseLines(reference).length;
  const backlogLines = parseLines(backlog).length;
  const total = deepLines + refLines + backlogLines;

  const availableSlots = Math.max(0, 2 - currentDeepCount);
  const deepOverflow = Math.max(0, deepLines - availableSlots);

  const sections = [
    {
      key: 'deep',
      label: 'Profundo',
      value: deep,
      setValue: setDeep,
      count: deepLines,
      accent: CATEGORIES.deep.accent,
      accentSoft: CATEGORIES.deep.accentSoft,
      icon: CATEGORIES.deep.icon,
      warning: deepOverflow > 0
        ? `${deepOverflow} de estos se irán a Backlog (ya tienes ${currentDeepCount}/2 activos)`
        : null,
    },
    {
      key: 'reference',
      label: 'Referencia',
      value: reference,
      setValue: setReference,
      count: refLines,
      accent: CATEGORIES.reference.accent,
      accentSoft: CATEGORIES.reference.accentSoft,
      icon: CATEGORIES.reference.icon,
    },
    {
      key: 'backlog',
      label: 'Backlog',
      value: backlog,
      setValue: setBacklog,
      count: backlogLines,
      accent: CATEGORIES.backlog.accent,
      accentSoft: CATEGORIES.backlog.accentSoft,
      icon: CATEGORIES.backlog.icon,
    },
  ];

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(42, 37, 32, 0.5)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        padding: 20,
        overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.surface,
          border: `1px solid ${C.line}`,
          padding: 34,
          maxWidth: 680,
          width: '100%',
          borderRadius: 4,
          boxShadow: '0 20px 60px rgba(42, 37, 32, 0.25)',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 20,
          }}
        >
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 12,
              }}
            >
              <Upload size={16} color={C.accent} strokeWidth={1.5} />
              <span
                style={{
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: 10,
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                  color: C.accent,
                  fontWeight: 500,
                }}
              >
                Importar en lote
              </span>
            </div>
            <h3
              style={{
                fontFamily: '"Instrument Serif", serif',
                fontSize: 30,
                fontWeight: 400,
                margin: 0,
                lineHeight: 1.15,
                color: C.ink,
                letterSpacing: '-0.015em',
              }}
            >
              Un tema por línea.
            </h3>
          </div>
          <button
            onClick={onCancel}
            style={{
              background: 'transparent',
              border: 'none',
              color: C.muted,
              padding: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>

        <p style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.6, marginBottom: 24 }}>
          Ya te prerrellené con la clasificación que acordamos. Edita lo que quieras — separa los
          temas por salto de línea. Líneas vacías se ignoran.
        </p>

        {/* Sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 24 }}>
          {sections.map((sec) => {
            const Icon = sec.icon;
            return (
              <div key={sec.key}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: sec.accentSoft,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon size={11} color={sec.accent} strokeWidth={1.8} />
                  </div>
                  <span
                    style={{
                      fontFamily: '"IBM Plex Mono", monospace',
                      fontSize: 11,
                      letterSpacing: '0.15em',
                      textTransform: 'uppercase',
                      color: C.ink,
                      fontWeight: 500,
                    }}
                  >
                    {sec.label}
                  </span>
                  <span
                    style={{
                      fontFamily: '"IBM Plex Mono", monospace',
                      fontSize: 10,
                      color: C.muted,
                      marginLeft: 'auto',
                    }}
                  >
                    {sec.count} {sec.count === 1 ? 'tema' : 'temas'}
                  </span>
                </div>
                <textarea
                  value={sec.value}
                  onChange={(e) => sec.setValue(e.target.value)}
                  rows={Math.max(3, sec.count + 1)}
                  style={{
                    width: '100%',
                    background: C.surfaceElevated,
                    border: `1px solid ${C.lineSoft}`,
                    borderRadius: 3,
                    padding: '12px 14px',
                    color: C.ink,
                    fontSize: 13,
                    fontFamily: '"IBM Plex Sans", sans-serif',
                    lineHeight: 1.6,
                    outline: 'none',
                    resize: 'vertical',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = sec.accent;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = C.lineSoft;
                  }}
                />
                {sec.warning && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      marginTop: 6,
                      fontFamily: '"IBM Plex Mono", monospace',
                      fontSize: 10,
                      color: C.accent,
                      letterSpacing: '0.03em',
                    }}
                  >
                    <AlertTriangle size={11} strokeWidth={1.8} />
                    {sec.warning}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            paddingTop: 20,
            borderTop: `1px solid ${C.line}`,
          }}
        >
          <span
            style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: 11,
              color: C.muted,
              flex: 1,
            }}
          >
            Total: {total} {total === 1 ? 'tema' : 'temas'}
          </span>
          <button
            onClick={onCancel}
            style={{
              background: 'transparent',
              border: `1px solid ${C.line}`,
              color: C.inkSoft,
              padding: '10px 18px',
              fontSize: 11,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              fontFamily: '"IBM Plex Mono", monospace',
              borderRadius: 2,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleImport}
            disabled={total === 0}
            style={{
              background: total > 0 ? C.accent : C.bgAlt,
              color: total > 0 ? C.surface : C.muted,
              border: 'none',
              padding: '10px 22px',
              fontSize: 11,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              fontWeight: 500,
              fontFamily: '"IBM Plex Mono", monospace',
              borderRadius: 2,
              cursor: total > 0 ? 'pointer' : 'not-allowed',
            }}
          >
            Importar {total > 0 && `(${total})`}
          </button>
        </div>
      </div>
    </div>
  );
}
