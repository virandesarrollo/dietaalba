'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useMemo, useRef, useCallback, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Session } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { AppMobileNavigation } from '@/components/AppMobileNavigation';
import { deriveAppViews, deriveAvailableViews, deriveCapabilities, type RoleCode } from '@/lib/authz.js';
import { AccountMenu } from '@/components/AccountMenu';
import { useConfirmDialog } from '@/components/ConfirmDialogProvider';
import { isHistoricalDate, isOutsideCorrectionWindow, madridDateString } from '@/lib/historical-date';
import { decideFocusTrapTarget } from '@/lib/gym-workouts.js';
import { MAX_MEAL_OPTIONS, sortMealOptions, groupMealOptions, applyExclusiveSelection, reconcileMealSelection } from '@/lib/meal-options.js';
import {
  createLatestRequestGuard,
  createMutationLock,
  deriveFeatureCapabilities,
  deriveReviewMap,
  normalizeFeatureRows,
} from '@/lib/feature-permissions';
import { 
  Check, 
  ExternalLink, 
  Star, 
  ChevronLeft, 
  ChevronRight, 
  Utensils, 
  MessageSquare, 
  Sparkles,
  X, 
  Copy, 
  CheckCheck, 
  Plus, 
  Edit3, 
  Trash2, 
  Send,
  ChevronDown,
  ArrowLeftRight
} from 'lucide-react';

type Meal = {
  id: string;
  date: string;
  meal_type: string;
  title: string;
  ingredients?: string | null;
  recipe_url?: string | null;
  is_free_meal?: boolean;
  free_meal_label?: string | null;
  is_completed: boolean;
  option_order?: number | null;
  meal_order?: number | null;
  created_at?: string | null;
  kcal?: number | null;
};

type RecipeReview = {
  id?: string;
  recipe_title: string;
  rating?: number;
  notes?: string | null;
  updated_at?: string;
};

type Recipe = {
  id?: string;
  title: string;
  meal_type: string;
  ingredients?: string | null;
  recipe_url?: string | null;
};
type SnackLog = { id: string; recorded_at: string; text: string; kcal?: number | null };
type NightBingeLog = SnackLog;

type SourceDay = {
  date: string;
  meals: Meal[];
};

const parseDateString = (dateStr: string) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const formatDateString = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function Home() {
  const router = useRouter();
  const confirmDialog = useConfirmDialog();
  const [session, setSession] = useState<Session | null>(null);
  const [authGeneration, setAuthGeneration] = useState<number>(0);
  const [loadingSession, setLoadingSession] = useState<boolean>(true);
  const [loadingFeatures, setLoadingFeatures] = useState<boolean>(true);
  const [featureError, setFeatureError] = useState<string | null>(null);
  const [featureCapabilities, setFeatureCapabilities] = useState(() => deriveFeatureCapabilities([]));
  const [navigationRoles, setNavigationRoles] = useState<RoleCode[]>([]);
  const { canRateRecipes, canSendReport, canOpenNotes, canAccessSettings, canTrackWater, canTrackSnacks, canTrackNightBinges, canTrackCalories } = featureCapabilities;
  const appNavigationViews = useMemo(() => deriveAppViews(deriveAvailableViews(deriveCapabilities(false, navigationRoles), featureCapabilities)), [featureCapabilities, navigationRoles]);
  const [currentTab, setCurrentTab] = useState<'plan' | 'notes'>('plan');
  const [selectedDate, setSelectedDate] = useState<string>(madridDateString());
  const isHistoricalDay = isHistoricalDate(selectedDate);
  const isOutsidePersonalCorrectionWindow = isOutsideCorrectionWindow(selectedDate);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [waterMl, setWaterMl] = useState(0);
  const [waterGoalMl, setWaterGoalMl] = useState(2000);
  const [waterGlassMl, setWaterGlassMl] = useState(250);
  const [showSnackDialog, setShowSnackDialog] = useState(false);
  const [snackDialogMealType, setSnackDialogMealType] = useState<string | null>(null);
  const [snackText, setSnackText] = useState('');
  const [snackKcal, setSnackKcal] = useState('');
  const [snackTime, setSnackTime] = useState(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()));
  const [snacks, setSnacks] = useState<SnackLog[]>([]);
  const [editingSnack, setEditingSnack] = useState<SnackLog | null>(null);
  const [nightBingeStartTime, setNightBingeStartTime] = useState('22:00');
  const [nightBingeLogs, setNightBingeLogs] = useState<NightBingeLog[]>([]);
  const [showNightBingeDialog, setShowNightBingeDialog] = useState(false);
  const [nightBingeText, setNightBingeText] = useState('');
  const groupedMeals = useMemo(() => groupMealOptions(meals), [meals]);
  const completedCalories = useMemo(() => meals.filter((meal) => meal.is_completed).reduce((total, meal) => total + (meal.kcal ?? 0), 0), [meals]);
  const snackCalories = useMemo(() => snacks.reduce((total, snack) => total + (snack.kcal ?? 0), 0), [snacks]);
  const totalDailyCalories = completedCalories + snackCalories;
  const [planError, setPlanError] = useState<string | null>(null);
  const [mutatingPlan, setMutatingPlan] = useState(false);
  const [planRefreshRequired, setPlanRefreshRequired] = useState(false);
  const [reviews, setReviews] = useState<Record<string, RecipeReview>>({});
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  // Estado para modal de cargar o intercambiar día
  const [showLoadDayModal, setShowLoadDayModal] = useState<boolean>(false);
  const [selectedSourceDate, setSelectedSourceDate] = useState<string>('');
  const [availableSourceDays, setAvailableSourceDays] = useState<SourceDay[]>([]);
  const [loadingSourceDays, setLoadingSourceDays] = useState<boolean>(false);
  const [loadDayMode, setLoadDayMode] = useState<'copy' | 'swap'>('copy');
  const [keepCompletedMeals, setKeepCompletedMeals] = useState<boolean>(true);
  const [applyingDayChange, setApplyingDayChange] = useState<boolean>(false);

  // Estado para la ventana de notas/ratings
  const [activeRecipe, setActiveRecipe] = useState<string | null>(null);
  const [currentRating, setCurrentRating] = useState<number>(5);
  const [currentNotes, setCurrentNotes] = useState<string>('');
  const [savingReview, setSavingReview] = useState<boolean>(false);
  const [mutatingReviews, setMutatingReviews] = useState<boolean>(false);

  // Estado para modal de añadir comida libre
  const [showAddMealModal, setShowAddMealModal] = useState<boolean>(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const activeDialog = canRateRecipes && activeRecipe ? 'review' : showAddMealModal ? 'add-meal' : showLoadDayModal ? 'load-day' : null;
  const [newMealType, setNewMealType] = useState<string>('');
  const [newMealRecipeTitle, setNewMealRecipeTitle] = useState<string>('');
  const [savingNewMeal, setSavingNewMeal] = useState<boolean>(false);

  // Estado para feedback de copiado al portapapeles
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const requestGuardRef = useRef(createLatestRequestGuard());
  const sourceDaysGuardRef = useRef(createLatestRequestGuard());
  const mutationGuardRef = useRef(createLatestRequestGuard());
  const reviewMutationBusyRef = useRef(createMutationLock());
  const planMutationGuardRef = useRef(createLatestRequestGuard());
  const planMutationBusyRef = useRef(createMutationLock());

  useEffect(() => {
    const requestGuard = requestGuardRef.current;
    const sourceDaysGuard = sourceDaysGuardRef.current;
    const planMutationGuard = planMutationGuardRef.current;
    const initialSessionGeneration = requestGuard.currentGeneration();
    const applyAuthSession = (nextSession: Session | null) => {
      const generation = requestGuard.invalidate();
      sourceDaysGuard.invalidate();
      mutationGuardRef.current.invalidate();
      reviewMutationBusyRef.current.reset();
      planMutationGuard.invalidate();
      planMutationBusyRef.current.reset();
      setMutatingPlan(false);
      setApplyingDayChange(false);
      setSavingNewMeal(false);
      setShowAddMealModal(false);
      setPlanError(null);
      setPlanRefreshRequired(false);
      setSession(nextSession);
      setAuthGeneration(generation);
      setMeals([]);
      setWaterMl(0);
      setWaterGoalMl(2000);
      setWaterGlassMl(250);
      setReviews({});
      setRecipes([]);
      setAvailableSourceDays([]);
      setSelectedSourceDate('');
      setShowLoadDayModal(false);
      setLoadingSourceDays(false);
      setFeatureCapabilities(deriveFeatureCapabilities([]));
      setNavigationRoles([]);
      setCurrentTab('plan');
      setActiveRecipe(null);
      setSavingReview(false);
      setMutatingReviews(false);
      setFeatureError(null);
      setLoadingFeatures(Boolean(nextSession));
      setLoading(Boolean(nextSession));
      setLoadingSession(false);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (requestGuard.isGenerationCurrent(initialSessionGeneration)) {
        applyAuthSession(session);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applyAuthSession(session);
    });

    return () => {
      requestGuard.invalidate();
      sourceDaysGuard.invalidate();
      planMutationGuard.invalidate();
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!canOpenNotes) {
      // El permiso puede retirarse mientras la pestaña o el modal están abiertos.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCurrentTab('plan');
      setActiveRecipe(null);
    }
  }, [canOpenNotes]);

  useEffect(() => {
    if (!activeDialog) return;
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocusedRef.current?.focus();
    };
  }, [activeDialog]);

  function closeActiveDialog() {
    if (mutatingReviews || savingNewMeal || applyingDayChange) return;
    setActiveRecipe(null);
    setShowAddMealModal(false);
    setShowLoadDayModal(false);
  }

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeActiveDialog();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), textarea:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const target = decideFocusTrapTarget(focusable, activeElement, event.shiftKey, activeElement === dialogRef.current);
    if (target) {
      event.preventDefault();
      target.focus();
    }
  }

  const fetchData = useCallback(async (dateToFetch?: string) => {
    const targetDate = dateToFetch || selectedDate;
    const userId = session?.user?.id;
    if (!userId) return;

    const requestGuard = requestGuardRef.current;
    const request = requestGuard.startRequest(
      requestGuard.currentGeneration(),
      userId,
      targetDate,
    );
    const commit = (update: () => void) => {
      if (requestGuard.isCurrent(request)) update();
    };

    commit(() => setLoading(true));

    const [featuresResult, membershipResult] = await Promise.all([
      supabase.rpc('get_my_features'),
      supabase.from('group_memberships').select('user_roles(role_code)').eq('user_id', userId).eq('status', 'active').maybeSingle(),
    ]);
    const { data: featuresData, error: featuresError } = featuresResult;
    if (!requestGuard.isCurrent(request)) return;
    const nextCapabilities = featuresError
      ? deriveFeatureCapabilities([])
      : deriveFeatureCapabilities(normalizeFeatureRows(featuresData));

    commit(() => setFeatureCapabilities(nextCapabilities));
    const membership = membershipResult.data as { user_roles?: Array<{ role_code?: RoleCode }> } | null;
    const nextNavigationRoles = membershipResult.error
      ? []
      : (membership?.user_roles ?? []).flatMap((row) => row.role_code ? [row.role_code] : []);
    commit(() => setNavigationRoles(nextNavigationRoles));
    commit(() => setFeatureError(featuresError ? 'No se pudieron cargar algunas funciones.' : null));
    commit(() => setLoadingFeatures(false));

    // 1. Cargar comidas de la fecha seleccionada
    const { data: mealsData, error: mealsError } = await supabase
      .from('daily_plan')
      .select('id, date, meal_type, meal_order, title, ingredients, recipe_url, is_free_meal, free_meal_label, is_completed, option_order, created_at, kcal')
      .eq('date', targetDate)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (!requestGuard.isCurrent(request)) return;

    if (mealsError) {
      console.error('Error cargando comidas:', mealsError);
      commit(() => setMeals([]));
    } else if (mealsData) {
      commit(() => setMeals(sortMealOptions(mealsData as Meal[])));
    } else {
      commit(() => setMeals([]));
    }

    if (nextCapabilities.canTrackWater) {
      const waterResult = await supabase.rpc('get_daily_water', { p_date: targetDate });
      if (requestGuard.isCurrent(request)) commit(() => setWaterMl(typeof waterResult.data === 'number' ? waterResult.data : 0));
      const waterPreferences = await supabase.rpc('get_my_water_preferences');
      if (requestGuard.isCurrent(request) && Array.isArray(waterPreferences.data) && waterPreferences.data[0]) { commit(() => { setWaterGoalMl(waterPreferences.data[0].goal_ml); setWaterGlassMl(waterPreferences.data[0].glass_ml); }); }
    } else {
      commit(() => { setWaterMl(0); setWaterGoalMl(2000); setWaterGlassMl(250); });
    }
    if (nextCapabilities.canTrackSnacks) {
      const { data } = await supabase.rpc('get_my_snack_logs', { p_date: targetDate });
      if (requestGuard.isCurrent(request)) commit(() => setSnacks(Array.isArray(data) ? data as SnackLog[] : []));
    } else commit(() => setSnacks([]));
    if (nextCapabilities.canTrackNightBinges) {
      const [settingsResult, logsResult] = await Promise.all([supabase.rpc('get_my_night_binge_settings'), supabase.rpc('get_my_night_binge_logs', { p_date: targetDate })]);
      if (requestGuard.isCurrent(request)) commit(() => { setNightBingeStartTime(Array.isArray(settingsResult.data) && settingsResult.data[0]?.start_time ? settingsResult.data[0].start_time.slice(0, 5) : '22:00'); setNightBingeLogs(Array.isArray(logsResult.data) ? logsResult.data as NightBingeLog[] : []); });
    } else commit(() => { setNightBingeStartTime('22:00'); setNightBingeLogs([]); });

    // 2. Cargar notas/ratings solo si alguna función autorizada los necesita
    if (nextCapabilities.canOpenNotes) {
      const { data: reviewsData, error: reviewsError } = await supabase
        .from('recipe_reviews')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });
      if (!requestGuard.isCurrent(request)) return;
      const reviewMap = deriveReviewMap<RecipeReview>(reviewsData, reviewsError);
      commit(() => setReviews(reviewMap));
    } else {
      commit(() => setReviews({}));
    }

    // 3. Construir el catálogo solo con recetas del plan del usuario autenticado
    const { data: planMeals } = await supabase
      .from('daily_plan')
      .select('title, meal_type, ingredients, recipe_url, is_free_meal')
      .eq('user_id', userId);
    if (!requestGuard.isCurrent(request)) return;

    const allRecipes: Recipe[] = [];
    if (planMeals) {
      const titlesSet = new Set<string>();
      planMeals.forEach((m: Pick<Meal, 'title' | 'meal_type' | 'ingredients' | 'recipe_url' | 'is_free_meal'>) => {
        if (!m.is_free_meal && m.title && !m.title.includes('Libre') && !titlesSet.has(m.title.toLowerCase().trim())) {
          allRecipes.push({
            title: m.title,
            meal_type: m.meal_type || 'ALMUERZO',
            ingredients: m.ingredients,
            recipe_url: m.recipe_url,
          });
          titlesSet.add(m.title.toLowerCase().trim());
        }
      });
    }

    commit(() => setRecipes(allRecipes));
    commit(() => setLoading(false));
    return !mealsError;
  }, [selectedDate, session]);

  async function saveDailyWater(nextMl: number) {
    if (isOutsidePersonalCorrectionWindow) return;
    setWaterMl(nextMl);
    const { error } = await supabase.rpc('save_daily_water', { p_date: selectedDate, p_ml: nextMl });
    if (error) setPlanError('No se pudo guardar el agua.');
  }

  function snackKcalForSave(): number | null | undefined {
    if (!canTrackCalories || snackKcal.trim() === '') return null;
    const value = Number(snackKcal);
    if (!Number.isInteger(value) || value < 0 || value > 10000) {
      setPlanError('Las kcal del picoteo deben estar entre 0 y 10.000.');
      return undefined;
    }
    return value;
  }

  async function saveSnack() {
    const kcal = snackKcalForSave();
    if (kcal === undefined) return;
    const { error } = await supabase.rpc('save_my_snack_log', { p_text: snackText, p_recorded_time: snackTime, p_kcal: kcal });
    if (error) setPlanError('No se pudo registrar el picoteo.');
    else { setSnackText(''); setSnackKcal(''); setShowSnackDialog(false); setSnackDialogMealType(null); void fetchData(selectedDate); }
  }
  async function updateSnack() { if (!editingSnack) return; const kcal = snackKcalForSave(); if (kcal === undefined) return; const { error } = await supabase.rpc('update_my_snack_log', { p_id: editingSnack.id, p_text: snackText, p_recorded_time: snackTime, p_kcal: kcal }); if (error) setPlanError('No se pudo editar el picoteo.'); else { setEditingSnack(null); setSnackText(''); setSnackKcal(''); void fetchData(selectedDate); } }
  async function deleteSnack() { if (!editingSnack) return; const { error } = await supabase.rpc('delete_my_snack_log', { p_id: editingSnack.id }); if (error) setPlanError('No se pudo borrar el picoteo.'); else { setEditingSnack(null); void fetchData(selectedDate); } }
  async function saveNightBinge() { const { error } = await supabase.rpc('save_my_night_binge_log', { p_text: nightBingeText }); if (error) setPlanError('No se pudo registrar el control nocturno.'); else { setNightBingeText(''); setShowNightBingeDialog(false); void fetchData(selectedDate); } }
  async function saveNightBingeStartTime(value: string) { setNightBingeStartTime(value); const { error } = await supabase.rpc('save_my_night_binge_settings', { p_start_time: value }); if (error) setPlanError('No se pudo guardar la hora nocturna.'); }
  const madridNowTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
  const canShowNightBingeAlarm = canTrackNightBinges && selectedDate === madridDateString() && madridNowTime >= nightBingeStartTime;

  useEffect(() => {
    if (session) {
      fetchData(selectedDate);
    }
  }, [selectedDate, session, authGeneration, fetchData]);

  // Agrupación de recetas por tipo para el desplegable
  const groupedRecipes = useMemo(() => {
    const groups: Record<string, Recipe[]> = {
      '🥗 Almuerzos y Comidas': [],
      '🍲 Cenas': [],
      '🥞 Desayunos': [],
      '🍎 Meriendas y Snacks': [],
      '✨ Otras Recetas': [],
    };

    recipes.forEach(r => {
      const type = (r.meal_type || '').toUpperCase();
      if (type.includes('ALMUERZO') || type.includes('COMIDA')) {
        groups['🥗 Almuerzos y Comidas'].push(r);
      } else if (type.includes('CENA')) {
        groups['🍲 Cenas'].push(r);
      } else if (type.includes('DESAYUNO')) {
        groups['🥞 Desayunos'].push(r);
      } else if (type.includes('MERIENDA') || type.includes('MAÑANA') || type.includes('SNACK')) {
        groups['🍎 Meriendas y Snacks'].push(r);
      } else {
        groups['✨ Otras Recetas'].push(r);
      }
    });

    return Object.fromEntries(Object.entries(groups).filter(([, list]) => list.length > 0));
  }, [recipes]);

  async function selectMealOption(mealId: string, currentStatus: boolean) {
    const userId = session?.user?.id;
    if (!userId || loading || planRefreshRequired || isOutsidePersonalCorrectionWindow) return;
    const targetMeal = meals.find(meal => meal.id === mealId);
    if (!targetMeal) return;
    const mealType = targetMeal.meal_type;
    const lock = planMutationBusyRef.current;
    if (!lock.tryAcquire()) return;
    const guard = planMutationGuardRef.current;
    const mutation = guard.startRequest(guard.currentGeneration(), userId, selectedDate);
    const previousMeals = meals;
    setMutatingPlan(true);
    setPlanError(null);
    setMeals(prev => applyExclusiveSelection(prev, mealId));
    let selectionSaved = false;
    let response: unknown;
    try {
      try {
        const { data, error } = await supabase.rpc('select_meal_option', {
          meal_id: mealId,
          selected: !currentStatus,
        });
        selectionSaved = !error;
        response = data;
      } catch {
        // Una respuesta perdida no permite saber si el servidor llegó a guardar.
      }
      if (!guard.isCurrent(mutation)) return;
      const reconciledMeals = selectionSaved ? reconcileMealSelection(previousMeals, mealId, response) : null;
      if (reconciledMeals) {
        setMeals(reconciledMeals);
        return;
      }
      try {
        const { data: groupData, error: groupError } = await supabase
          .from('daily_plan')
          .select('id, date, meal_type, meal_order, title, ingredients, recipe_url, is_free_meal, free_meal_label, is_completed, option_order, created_at, kcal')
          .eq('user_id', userId)
          .eq('date', selectedDate)
          .eq('meal_type', mealType);
        if (groupError || !Array.isArray(groupData)) throw groupError ?? new Error('No se pudo leer el grupo');
        if (!guard.isCurrent(mutation)) return;
        setMeals(prev => sortMealOptions([...prev.filter(meal => meal.meal_type !== mealType), ...groupData as Meal[]]));
        if (!selectionSaved) {
          const selectionConfirmed = groupData.some(meal => meal.id === mealId && meal.is_completed === !currentStatus)
            && groupData.every(meal => meal.id === mealId || !meal.is_completed);
          setPlanError(selectionConfirmed
            ? 'Selección guardada. La vista se ha actualizado.'
            : 'No se guardó la selección solicitada. La vista muestra el estado actual.');
        }
      } catch {
        if (!guard.isCurrent(mutation)) return;
        if (selectionSaved) {
          setPlanRefreshRequired(true);
          setPlanError('Selección guardada, vista no actualizada. Recarga la vista.');
        } else {
          setMeals(previousMeals);
          setPlanRefreshRequired(true);
          setPlanError('No se pudo confirmar la selección. Recarga la vista antes de continuar.');
        }
      }
    } finally {
      if (guard.isGenerationCurrent(mutation.generation)) {
        lock.release();
        setMutatingPlan(false);
      }
    }
  }

  async function reloadPlanView() {
    const userId = session?.user?.id;
    if (!userId) return;
    const lock = planMutationBusyRef.current;
    if (!lock.tryAcquire()) return;
    const guard = planMutationGuardRef.current;
    const mutation = guard.startRequest(guard.currentGeneration(), userId, selectedDate);
    setMutatingPlan(true);
    try {
      const refreshed = await fetchData(selectedDate);
      if (!guard.isCurrent(mutation)) return;
      if (refreshed) {
        setPlanRefreshRequired(false);
        setPlanError(null);
      }
    } catch {
      if (guard.isCurrent(mutation)) setLoading(false);
    } finally {
      if (guard.isGenerationCurrent(mutation.generation)) {
        lock.release();
        setMutatingPlan(false);
      }
    }
  }

  const changeDate = (days: number) => {
    const d = parseDateString(selectedDate);
    d.setDate(d.getDate() + days);
    selectDate(formatDateString(d));
  };

  const selectDate = (nextDate: string) => {
    requestGuardRef.current.invalidateRequests();
    sourceDaysGuardRef.current.invalidateRequests();
    planMutationGuardRef.current.invalidate();
    planMutationBusyRef.current.reset();
    setMutatingPlan(false);
    setApplyingDayChange(false);
    setSavingNewMeal(false);
    setShowAddMealModal(false);
    setPlanError(null);
    setPlanRefreshRequired(false);
    setLoading(true);
    setMeals([]);
    setAvailableSourceDays([]);
    setSelectedSourceDate('');
    setShowLoadDayModal(false);
    setSelectedDate(nextDate);
  };

  // Selección de receta para una comida libre existente
  const handleSelectRecipeForMeal = async (mealId: string, selectedRecipeTitle: string) => {
    if (isHistoricalDay) return;
    if (planMutationBusyRef.current.isBusy() || planRefreshRequired) return;
    const meal = meals.find(m => m.id === mealId);
    if (!meal) return;

    if (selectedRecipeTitle === '__custom__') {
      const defaultTitle = `${meal.meal_type.charAt(0) + meal.meal_type.slice(1).toLowerCase()} Libre 🎉`;
      const updateData = {
        title: defaultTitle,
        ingredients: meal.free_meal_label || 'Comida libre',
        recipe_url: null,
      };

      setMeals(meals.map(m => m.id === mealId ? { ...m, ...updateData } : m));
      await supabase.from('daily_plan').update(updateData).eq('id', mealId);
      return;
    }

    const selectedRecipe = recipes.find(r => r.title === selectedRecipeTitle);
    if (!selectedRecipe) return;

    const updateData = {
      title: selectedRecipe.title,
      ingredients: selectedRecipe.ingredients || '',
      recipe_url: selectedRecipe.recipe_url || null,
    };

    setMeals(meals.map(m => m.id === mealId ? { ...m, ...updateData } : m));
    await supabase.from('daily_plan').update(updateData).eq('id', mealId);
  };

  // Alternar si una comida es libre o no
  const toggleMealIsFree = async (mealId: string, currentIsFree: boolean | undefined) => {
    if (isHistoricalDay) return;
    if (planMutationBusyRef.current.isBusy() || planRefreshRequired) return;
    const nextIsFree = !currentIsFree;
    const meal = meals.find(m => m.id === mealId);
    if (!meal) return;

    const updateData: Partial<Meal> = {
      is_free_meal: nextIsFree,
      free_meal_label: nextIsFree ? (meal.free_meal_label || 'Libre') : undefined,
    };

    setMeals(meals.map(m => m.id === mealId ? { ...m, ...updateData } : m));
    await supabase.from('daily_plan').update(updateData).eq('id', mealId);
  };

  // Añadir nueva comida libre en días vacíos o adicionales
  const handleAddFreeMeal = async () => {
    if (isHistoricalDay) return;
    const userId = session?.user?.id;
    if (!userId || loading || planRefreshRequired) return;
    const mealType = newMealType.trim();
    if (mealType.length < 1 || mealType.length > 200) {
      setPlanError('El nombre del grupo debe tener entre 1 y 200 caracteres.');
      return;
    }
    const existingMealType = Object.keys(groupedMeals).find((type) => (
      type.localeCompare(mealType, 'es', { sensitivity: 'accent' }) === 0
    ));
    const canonicalMealType = existingMealType ?? mealType;
    const group = groupedMeals[canonicalMealType] ?? [];
    if (group.length >= MAX_MEAL_OPTIONS) {
      setPlanError('Cada comida admite un máximo de 10 opciones.');
      return;
    }
    const nextOptionOrder = Math.max(0, ...group.map(meal => meal.option_order ?? 1)) + 1;
    const nextMealOrder = group[0]?.meal_order ?? Math.max(0, ...meals.map(meal => meal.meal_order ?? 0)) + 1;
    const lock = planMutationBusyRef.current;
    if (!lock.tryAcquire()) return;
    const guard = planMutationGuardRef.current;
    const mutation = guard.startRequest(guard.currentGeneration(), userId, selectedDate);
    setSavingNewMeal(true);
    setMutatingPlan(true);
    setPlanError(null);
    const rec = recipes.find(recipe => recipe.title === newMealRecipeTitle);
    const newRecord = {
      date: selectedDate,
      meal_type: canonicalMealType,
      meal_order: nextMealOrder,
      option_order: nextOptionOrder,
      title: rec?.title ?? `${canonicalMealType.charAt(0) + canonicalMealType.slice(1).toLowerCase()} Libre 🎉`,
      ingredients: rec?.ingredients || 'Comida libre',
      recipe_url: rec?.recipe_url || null,
      is_free_meal: true,
      free_meal_label: 'Día Libre',
      is_completed: false,
      user_id: userId,
    };
    try {
      const { data, error } = await supabase.from('daily_plan').insert([newRecord]).select();
      if (error || !data?.length) throw error ?? new Error('No se devolvió la comida creada');
      if (!guard.isCurrent(mutation)) return;
      setMeals(prev => sortMealOptions([...prev, data[0] as Meal]));
      setShowAddMealModal(false);
      setNewMealRecipeTitle('');
    } catch {
      if (guard.isCurrent(mutation)) setPlanError('No se pudo añadir la opción. Inténtalo de nuevo.');
    } finally {
      if (guard.isGenerationCurrent(mutation.generation)) {
        lock.release();
        setSavingNewMeal(false);
        setMutatingPlan(false);
      }
    }
  };

  const loadAvailableSourceDays = async () => {
    if (isHistoricalDay) return;
    if (planRefreshRequired || planMutationBusyRef.current.isBusy()) return;
    const userId = session?.user?.id;
    if (!userId) return;

    const sourceDaysGuard = sourceDaysGuardRef.current;
    const request = sourceDaysGuard.startRequest(
      sourceDaysGuard.currentGeneration(),
      userId,
      selectedDate,
    );

    setLoadingSourceDays(true);
    setAvailableSourceDays([]);
    setSelectedSourceDate('');
    setShowLoadDayModal(true);
    const { data, error } = await supabase
      .from('daily_plan')
      .select('*')
      .eq('user_id', userId)
      .neq('date', selectedDate)
      .order('date', { ascending: false });
    if (!sourceDaysGuard.isCurrent(request)) return;

    if (error) {
      setAvailableSourceDays([]);
      setSelectedSourceDate('');
    } else {
      const grouped = new Map<string, Meal[]>();
      for (const meal of (data ?? []) as Meal[]) {
        grouped.set(meal.date, [...(grouped.get(meal.date) ?? []), meal]);
      }
      const days = Array.from(grouped, ([date, dayMeals]) => ({ date, meals: sortMealOptions(dayMeals) }));
      setAvailableSourceDays(days);
      setSelectedSourceDate(days[0]?.date ?? '');
    }
    setLoadingSourceDays(false);
  };

  // Cargar o intercambiar el menú de otro día
  const handleApplyDayMenu = async () => {
    if (isHistoricalDay || (loadDayMode === 'swap' && isHistoricalDate(selectedSourceDate))) return;
    const userId = session?.user?.id;
    const sourceDate = selectedSourceDate;
    if (!userId || !sourceDate || sourceDate === selectedDate || loading || planRefreshRequired) return;
    const lock = planMutationBusyRef.current;
    if (!lock.tryAcquire()) return;
    const guard = planMutationGuardRef.current;
    const mutation = guard.startRequest(guard.currentGeneration(), userId, selectedDate);
    setApplyingDayChange(true);
    setMutatingPlan(true);
    setPlanError(null);
    try {
      try {
        const { error } = await supabase.rpc('copy_or_swap_daily_plan_day', {
          target_user: userId,
          source_date: sourceDate,
          target_date: selectedDate,
          operation: loadDayMode,
          keep_completed: keepCompletedMeals,
        });
        if (error) throw error;
      } catch {
        if (!guard.isCurrent(mutation)) return;
        setShowLoadDayModal(false);
        setPlanRefreshRequired(true);
        setPlanError('No se pudo confirmar la operación. Recarga la vista antes de continuar.');
        return;
      }
      if (!guard.isCurrent(mutation)) return;
      setShowLoadDayModal(false);
      setPlanRefreshRequired(true);
      setCopiedKey(loadDayMode === 'swap' ? 'day_swapped' : 'day_applied');
      setTimeout(() => {
        if (guard.isCurrent(mutation)) setCopiedKey(null);
      }, 2500);
      try {
        if (!(await fetchData(selectedDate))) throw new Error('No se pudo recargar el plan');
        if (!guard.isCurrent(mutation)) return;
        setPlanRefreshRequired(false);
      } catch {
        if (!guard.isCurrent(mutation)) return;
        setLoading(false);
        setPlanError('El menú se aplicó, pero la vista no se pudo actualizar. Recarga la vista.');
      }
    } finally {
      if (guard.isGenerationCurrent(mutation.generation)) {
        lock.release();
        setApplyingDayChange(false);
        setMutatingPlan(false);
      }
    }
  };

  // Modal de notas
  const openReviewModal = (title: string) => {
    if (!canRateRecipes || reviewMutationBusyRef.current.isBusy()) return;
    setActiveRecipe(title);
    const existing = reviews[title];
    setCurrentRating(existing?.rating || 5);
    setCurrentNotes(existing?.notes || '');
  };

  const saveReview = async () => {
    if (!canRateRecipes) return;
    if (!activeRecipe) return;
    const userId = session?.user?.id;
    if (!userId) return;
    const reviewMutationLock = reviewMutationBusyRef.current;
    if (!reviewMutationLock.tryAcquire()) return;
    const mutationGuard = mutationGuardRef.current;
    const mutation = mutationGuard.startRequest(
      mutationGuard.currentGeneration(),
      userId,
      activeRecipe,
    );
    setSavingReview(true);
    setMutatingReviews(true);

    const payload = {
      recipe_title: activeRecipe,
      rating: currentRating,
      notes: currentNotes,
      updated_at: new Date().toISOString(),
      user_id: userId
    };

    try {
      const { error } = await supabase
        .from('recipe_reviews')
        .upsert(payload, { onConflict: 'recipe_title' });

      if (!mutationGuard.isCurrent(mutation) || error) return;
      setReviews(prev => ({
        ...prev,
        [activeRecipe]: payload
      }));
      setActiveRecipe(null);
    } finally {
      if (mutationGuard.isGenerationCurrent(mutation.generation)) {
        reviewMutationLock.release();
        setMutatingReviews(false);
        setSavingReview(false);
      }
    }
  };

  const deleteReview = async (recipeTitle: string) => {
    if (!canRateRecipes) return;
    const reviewMutationLock = reviewMutationBusyRef.current;
    if (reviewMutationLock.isBusy()) return;
    if (!(await confirmDialog({ title: 'Eliminar nota', message: `¿Seguro que quieres eliminar la nota de "${recipeTitle}"?`, confirmLabel: 'Eliminar', tone: 'danger' }))) return;
    const userId = session?.user?.id;
    if (!userId) return;
    if (!reviewMutationLock.tryAcquire()) return;
    const mutationGuard = mutationGuardRef.current;
    const mutation = mutationGuard.startRequest(
      mutationGuard.currentGeneration(),
      userId,
      recipeTitle,
    );
    setMutatingReviews(true);

    try {
      const { error } = await supabase
        .from('recipe_reviews')
        .delete()
        .eq('recipe_title', recipeTitle);

      if (!mutationGuard.isCurrent(mutation) || error) return;
      setReviews(prev => {
        const next = { ...prev };
        delete next[recipeTitle];
        return next;
      });
    } finally {
      if (mutationGuard.isGenerationCurrent(mutation.generation)) {
        reviewMutationLock.release();
        setMutatingReviews(false);
      }
    }
  };

  // Copiar al portapapeles (compatible con móviles y navegadores modernos)
  const copyToClipboard = async (text: string, key: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2500);
    } catch (err) {
      console.error('Error al copiar:', err);
    }
  };

  // Formato del informe para compartir
  const reviewedItems = useMemo(() => {
    return Object.values(reviews).filter(r => (r.notes && r.notes.trim()) || r.rating);
  }, [reviews]);

  const generateFullReport = () => {
    if (reviewedItems.length === 0) return '';
    let text = `Resumen semanal:\n\n`;
    reviewedItems.forEach((rev, idx) => {
      text += `${idx + 1}. *${rev.recipe_title}* (${rev.rating || 5}/5)\n`;
      if (rev.notes && rev.notes.trim()) {
        text += `${rev.notes.trim()}\n`;
      }
      text += `\n`;
    });
    text += `¡Seguimos a tope! 💪`;
    return text;
  };

  const fullReportText = generateFullReport();
  if (loadingSession || (session && loadingFeatures)) {
    return (
      <main className="theme-page min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-pink-400 font-medium">Cargando...</div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="theme-page min-h-screen flex items-center justify-center p-6 text-slate-700 font-sans">
        <div className="bg-white w-full max-w-sm rounded-3xl p-8 shadow-xl shadow-pink-100/50 border border-pink-50 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-pink-50 rounded-full flex items-center justify-center mb-6">
            <Sparkles className="text-pink-400" size={32} />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Bienvenida ✨</h1>
          <p className="text-sm text-slate-500 mb-8">Inicia sesión para continuar con tu plan diario de Dieta Alba.</p>
          
          <button
            onClick={() => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })}
            className="w-full bg-white border-2 border-slate-100 hover:border-pink-200 hover:bg-pink-50 text-slate-700 font-semibold py-3 px-4 rounded-2xl transition-all flex items-center justify-center gap-3 shadow-sm hover:shadow-md"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continuar con Google
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="theme-page min-h-screen text-slate-700 pb-28 max-w-md mx-auto relative font-sans">
      <div inert={activeDialog ? true : undefined} aria-hidden={activeDialog ? true : undefined}>
      {featureError && (
        <p className="px-5 pt-3 text-center text-xs text-rose-500" role="alert">{featureError}</p>
      )}
      {/* Toast de Copiado */}
      {copiedKey && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-slate-900/90 backdrop-blur-md text-white px-4 py-2.5 rounded-2xl text-xs font-medium shadow-xl flex items-center gap-2 border border-pink-500/30 animate-in fade-in slide-in-from-top-3">
          <CheckCheck size={16} className="text-pink-400" />
          <span>
            {copiedKey === 'all' 
              ? '¡Informe completo copiado! Listo para WhatsApp 💖' 
              : copiedKey === 'day_applied'
                ? '¡Menú del día actualizado correctamente! ✨'
                : copiedKey === 'day_swapped'
                  ? '¡Días intercambiados correctamente! 🔄'
                  : '¡Nota copiada al portapapeles! ✨'}
          </span>
        </div>
      )}

      {/* Header Aesthetic */}
      <header className="bg-gradient-to-br from-pink-100 via-purple-100 to-blue-100 pt-10 pb-6 px-6 rounded-b-[2.5rem] shadow-sm border-b border-pink-100/50">
        <div className="flex items-start justify-between gap-4 mb-3">
          {currentTab === 'plan' ? (
            <p className="min-w-0 flex-1 pt-2 text-xs font-semibold uppercase tracking-widest text-pink-500">Registro de comidas</p>
          ) : (
            <span className="pt-2 text-xs font-semibold uppercase tracking-widest text-pink-500">Reporte</span>
          )}
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" aria-label="Ver autocontrol semanal" onClick={() => router.push('/self-control')} className="flex min-h-10 min-w-10 items-center justify-center px-1 text-2xl">🔥</button>
            <AccountMenu
              email={session.user.email ?? ''}
              canAccessSettings={canAccessSettings}
            />
          </div>
        </div>
        {canOpenNotes && (
          <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-white/60 p-1" aria-label="Contenido de Mi dieta">
            <button type="button" onClick={() => setCurrentTab('plan')} aria-pressed={currentTab === 'plan'} className={`min-h-12 rounded-xl px-3 text-sm font-semibold transition ${currentTab === 'plan' ? 'bg-white text-pink-500 shadow-sm' : 'text-slate-500'}`}>
              Plan diario
            </button>
            <button type="button" onClick={() => setCurrentTab('notes')} aria-pressed={currentTab === 'notes'} className={`min-h-12 rounded-xl px-3 text-sm font-semibold transition ${currentTab === 'notes' ? 'bg-white text-pink-500 shadow-sm' : 'text-slate-500'}`}>
              Ranking
            </button>
          </div>
        )}

        {currentTab === 'plan' ? (
          <>
            {/* Selector de Fecha */}
            <div className="flex items-center justify-between bg-white/80 backdrop-blur-md rounded-2xl p-2 shadow-sm border border-pink-100/60">
              <button onClick={() => changeDate(-1)} className="p-2 hover:bg-pink-50 rounded-xl transition-colors text-pink-400">
                <ChevronLeft size={20} />
              </button>
              <label className="relative min-w-0 cursor-pointer font-medium text-xs sm:text-sm capitalize text-slate-700">
                <span aria-hidden="true">{parseDateString(selectedDate).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })}</span>
                <input type="date" aria-label="Seleccionar fecha de comidas" value={selectedDate} onChange={(event) => selectDate(event.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
              </label>
              <button onClick={() => changeDate(1)} className="p-2 hover:bg-pink-50 rounded-xl transition-colors text-pink-400">
                <ChevronRight size={20} />
              </button>
            </div>
          </>
        ) : (
          <div className="mt-2 mb-2">
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <span>Notas</span>
              <span className="text-base">💌</span>
            </h1>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed font-light">
              Aquí tienes todas las opiniones y notas que has puesto a las recetas, listas para copiar y enviarle a tu nutricionista.
            </p>
          </div>
        )}
      </header>

      {/* VISTA 1: PLAN DIARIO */}
      {currentTab === 'plan' && (
        <section className="px-5 mt-6">
          {planError && <p className="mb-3 text-sm text-rose-700" role="alert">{planError}</p>}
          {canTrackWater && <section className="mb-4 rounded-3xl bg-cyan-50 p-4 shadow-sm">
            <div className="flex items-center justify-between"><div><h2 className="font-semibold text-slate-800">Registro de agua</h2><p className="text-xs text-slate-500">{(waterMl / 1000).toFixed(2)} L de {(waterGoalMl / 1000).toFixed(2)} L</p></div><span className="text-2xl">💧</span></div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-cyan-100"><div className="h-full bg-cyan-500" style={{ width: `${Math.min(100, waterMl / waterGoalMl * 100)}%` }} /></div>
            <div className="mt-3 flex gap-2"><button type="button" disabled={isOutsidePersonalCorrectionWindow || waterMl === 0} onClick={() => void saveDailyWater(Math.max(0, waterMl - waterGlassMl))} className="min-h-12 flex-1 rounded-2xl bg-white font-bold disabled:opacity-40">− Vaso</button><button type="button" disabled={isOutsidePersonalCorrectionWindow} onClick={() => void saveDailyWater(waterMl + waterGlassMl)} className="min-h-12 flex-1 rounded-2xl bg-cyan-500 font-bold text-white disabled:opacity-40">+ Vaso</button></div>
          </section>}
          {canShowNightBingeAlarm && <section className="mb-4 rounded-3xl border border-indigo-200 bg-indigo-50 p-4"><div className="flex items-center justify-between"><div><h2 className="font-semibold text-slate-800">Control nocturno</h2><p className="text-xs text-slate-600">Alarma desde {nightBingeStartTime}</p></div><button type="button" onClick={() => setShowNightBingeDialog(true)} className="min-h-11 rounded-2xl bg-red-700 px-4 text-xs font-bold text-white">🚨 Alarma nocturna</button></div>{nightBingeLogs.map((log) => <p key={log.id} className="mt-2 rounded-lg bg-white p-2 text-xs text-indigo-900">🚨 {new Date(log.recorded_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}: {log.text}</p>)}{showNightBingeDialog && <div role="alertdialog" aria-label="Registrar control nocturno" className="mt-3 rounded-2xl border-2 border-red-700 bg-white p-4"><h2 className="font-bold text-red-800">Detente: estás poniendo en riesgo tu progreso.</h2><textarea value={nightBingeText} onChange={(event) => setNightBingeText(event.target.value)} maxLength={500} placeholder="Qué has comido" className="mt-3 min-h-20 w-full rounded border p-2" /><div className="mt-2 flex gap-2"><button type="button" onClick={() => setShowNightBingeDialog(false)} className="rounded bg-slate-100 px-3 py-2">Cancelar</button><button type="button" disabled={!nightBingeText.trim()} onClick={() => void saveNightBinge()} className="rounded bg-red-800 px-3 py-2 font-semibold text-white disabled:opacity-40">Registrar</button></div></div>}</section>}
          {canTrackSnacks && snacks.map((snack) => <button key={snack.id} type="button" onClick={() => { if (!isOutsidePersonalCorrectionWindow) { setEditingSnack(snack); setSnackText(snack.text); setSnackKcal(snack.kcal == null ? '' : String(snack.kcal)); setSnackTime(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(snack.recorded_at))); } }} className="mb-3 block w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-left text-xs text-red-800">⚠ Picoteo {new Date(snack.recorded_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}: {snack.text}{canTrackCalories && snack.kcal != null && <span className="ml-2 font-semibold">⚡ {snack.kcal} kcal</span>}{!isOutsidePersonalCorrectionWindow && <span className="ml-2 font-bold">Editar</span>}</button>)}
          {editingSnack && <div className="mb-4 rounded-3xl border-2 border-red-600 bg-white p-5 shadow-lg" role="alertdialog" aria-label="Editar picoteo"><h2 className="text-lg font-bold text-red-800">Editar picoteo</h2><input aria-label="Hora del picoteo" type="time" value={snackTime} onChange={(event) => setSnackTime(event.target.value)} className="mt-3 rounded-xl border p-2" />{canTrackCalories && <input aria-label="Kcal del picoteo" type="number" min="0" max="10000" step="1" value={snackKcal} onChange={(event) => setSnackKcal(event.target.value)} placeholder="Kcal aproximadas" className="ml-2 mt-3 w-40 rounded-xl border p-2" />}<textarea value={snackText} onChange={(event) => setSnackText(event.target.value)} maxLength={500} className="mt-4 min-h-24 w-full rounded-xl border p-3" /><div className="mt-3 flex gap-2"><button type="button" onClick={() => { setEditingSnack(null); setSnackKcal(''); }} className="min-h-11 flex-1 rounded-xl bg-slate-100 font-semibold">Cancelar</button><button type="button" onClick={() => void deleteSnack()} className="min-h-11 flex-1 rounded-xl bg-red-100 font-semibold text-red-800">Borrar</button><button type="button" onClick={() => void updateSnack()} disabled={!snackText.trim()} className="min-h-11 flex-1 rounded-xl bg-red-800 font-semibold text-white disabled:opacity-40">Guardar</button></div></div>}
          {planRefreshRequired && <button type="button" onClick={() => void reloadPlanView()} disabled={mutatingPlan || loading} className="mb-3 rounded-xl bg-purple-50 px-3 py-2 text-sm text-purple-700">Recargar vista</button>}
          <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-slate-800 tracking-wide">Menú del día</h2>
              {meals.some(m => m.is_free_meal) && (
                <span className="text-[10px] font-semibold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-full border border-amber-200">
                  🎉 Día Libre
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void loadAvailableSourceDays()}
                disabled={isHistoricalDay || mutatingPlan || loading || planRefreshRequired}
                className="text-[11px] text-purple-600 bg-purple-50 hover:bg-purple-100 px-2.5 py-1 rounded-xl font-medium transition-colors flex items-center gap-1 border border-purple-200/60 disabled:cursor-not-allowed disabled:opacity-40"
                title="Cargar menú de otro día o intercambiar"
              >
                <ArrowLeftRight size={12} />
                <span>Cargar día</span>
              </button>
              <button
                onClick={() => setShowAddMealModal(true)}
                disabled={isHistoricalDay || mutatingPlan || loading || planRefreshRequired}
                className="text-[11px] text-pink-600 bg-pink-50 hover:bg-pink-100 px-2.5 py-1 rounded-xl font-medium transition-colors flex items-center gap-1 border border-pink-200/60 disabled:cursor-not-allowed disabled:opacity-40"
                title="Añadir comida libre"
              >
                <Plus size={12} />
                <span>Añadir libre</span>
              </button>
            <span className="text-xs text-pink-500 bg-pink-50 px-3 py-1 rounded-full font-medium">
              {Object.values(groupedMeals).filter(options => options.some(meal => meal.is_completed)).length} de {Object.keys(groupedMeals).length} hecho
            </span>
            {canTrackCalories && <span className="text-xs text-amber-700 bg-amber-50 px-3 py-1 rounded-full font-semibold">⚡ {totalDailyCalories} kcal</span>}
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12 text-slate-400 text-sm font-light">Cargando tus recetas... 🌸</div>
          ) : meals.length === 0 ? (
            <div className="bg-white p-8 rounded-3xl text-center shadow-sm border border-pink-50">
              <Utensils className="mx-auto text-pink-200 mb-3" size={36} />
              <h3 className="text-sm font-semibold text-slate-700 mb-1">Día de descanso o libre 🌸</h3>
              <p className="text-slate-400 text-xs font-light mb-5">No tienes comidas prefijadas para este día. Puedes elegir qué recetas tomar hoy o cargar el menú de otro día.</p>
              <div className="flex flex-col sm:flex-row gap-2.5 justify-center">
                <button
                  onClick={() => void loadAvailableSourceDays()}
                  disabled={isHistoricalDay || mutatingPlan || loading || planRefreshRequired}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-pink-400 to-purple-400 text-white text-xs font-semibold rounded-2xl shadow-md shadow-pink-200 hover:opacity-95 transition-all disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ArrowLeftRight size={14} />
                  <span>Cargar menú de otro día</span>
                </button>
                <button
                  onClick={() => setShowAddMealModal(true)}
                  disabled={isHistoricalDay || mutatingPlan || loading || planRefreshRequired}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-2xl transition-all disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Plus size={14} />
                  <span>Añadir comida suelta</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3.5">
              {Object.entries(groupedMeals).map(([mealType, options]) => {
                const groupCompleted = options.some(option => option.is_completed);

                return (<React.Fragment key={mealType}>
                {canTrackSnacks && <section className="py-1 text-center"><button type="button" onClick={() => { setSnackKcal(''); setSnackDialogMealType(mealType); setShowSnackDialog(true); }} disabled={isOutsidePersonalCorrectionWindow} className="min-h-11 rounded-2xl bg-red-600 px-4 text-xs font-bold text-white shadow-md disabled:opacity-40">⚠ Voy a picar</button></section>}
                {showSnackDialog && snackDialogMealType === mealType && <div className="mb-4 rounded-3xl border-2 border-red-600 bg-white p-5 shadow-lg" role="alertdialog" aria-label="Registrar picoteo"><h2 className="text-lg font-bold text-red-800">Te estás cargando tu progreso.</h2><p className="mt-2 text-sm font-semibold text-red-700">No es hambre: es una decisión que aleja tus objetivos. Si lo haces, regístralo.</p><input aria-label="Hora del picoteo" type="time" value={snackTime} onChange={(event) => setSnackTime(event.target.value)} className="mt-3 rounded-xl border p-2" />{canTrackCalories && <input aria-label="Kcal del picoteo" type="number" min="0" max="10000" step="1" value={snackKcal} onChange={(event) => setSnackKcal(event.target.value)} placeholder="Kcal aproximadas" className="ml-2 mt-3 w-40 rounded-xl border p-2" />}<textarea value={snackText} onChange={(event) => setSnackText(event.target.value)} maxLength={500} className="mt-4 min-h-24 w-full rounded-xl border p-3" placeholder="Qué vas a tomar" /><div className="mt-3 flex gap-2"><button type="button" onClick={() => { setShowSnackDialog(false); setSnackDialogMealType(null); setSnackKcal(''); }} className="min-h-11 flex-1 rounded-xl bg-slate-100 font-semibold">No picar</button><button type="button" onClick={() => void saveSnack()} disabled={!snackText.trim()} className="min-h-11 flex-1 rounded-xl bg-red-800 font-semibold text-white disabled:opacity-40">Registrar picoteo</button></div></div>}
                <section key={mealType} aria-label={mealType} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[10px] font-semibold uppercase tracking-wider text-purple-600">{mealType}</h3>
                    {groupCompleted && (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        Comida realizada
                      </span>
                    )}
                  </div>
                  <div role={options.length > 1 ? 'radiogroup' : undefined} aria-label={mealType} className="space-y-2">
                  {options.map((meal, optionIndex) => {
                const review = reviews[meal.title];
                const matchingRecipes = recipes.filter(recipe =>
                  recipe.meal_type.trim().localeCompare(meal.meal_type.trim(), 'es', { sensitivity: 'accent' }) === 0,
                );
                const isSelectedRecipe = matchingRecipes.some(recipe => recipe.title === meal.title);

                return (
                  <div 
                    key={meal.id} 
                    className={`bg-white p-4 rounded-3xl shadow-sm border transition-all ${
                      groupCompleted 
                        ? 'opacity-60 bg-slate-50/80 border-slate-100' 
                        : meal.is_free_meal 
                          ? 'border-amber-200/70 bg-gradient-to-b from-white to-amber-50/20' 
                          : 'border-slate-100'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 pr-3">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          {options.length > 1 && (
                            <span className="text-[10px] font-semibold text-purple-600 bg-purple-50 px-2.5 py-0.5 rounded-full">
                              Opción {optionIndex + 1}
                            </span>
                          )}
                          
                          {/* Badge de comida libre con opción de alternar */}
                          <button
                            onClick={() => toggleMealIsFree(meal.id, meal.is_free_meal)}
                            disabled={isHistoricalDay || mutatingPlan || loading || planRefreshRequired}
                            className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border transition-colors flex items-center gap-1 ${
                              meal.is_free_meal
                                ? 'text-amber-700 bg-amber-100/70 border-amber-200 hover:bg-amber-100'
                                : 'text-slate-400 bg-slate-50 border-slate-200/80 hover:text-amber-600 hover:bg-amber-50'
                            }`}
                            title={meal.is_free_meal ? 'Pulsar para volver a comida estándar' : 'Pulsar para marcar como comida libre'}
                          >
                            <Sparkles size={10} className={meal.is_free_meal ? 'text-amber-500' : 'text-slate-300'} />
                            <span>{meal.is_free_meal ? (meal.free_meal_label || 'Libre 🎉') : 'Hacer libre'}</span>
                          </button>
                        </div>

                        <h3 className={`font-medium text-slate-800 text-sm ${groupCompleted ? 'line-through text-slate-400' : ''}`}>
                          {meal.title}
                        </h3>

                        {canTrackCalories && meal.kcal != null && <p className="mt-1 text-xs font-semibold text-amber-700">⚡ {meal.kcal} kcal aprox.</p>}

                        {meal.ingredients && (
                          <p className="text-xs text-slate-500 mt-1 leading-relaxed font-light">
                            {meal.ingredients}
                          </p>
                        )}

                        {/* DESPLEGABLE PARA ELEGIR RECETA EN COMIDAS / DÍAS LIBRES */}
                        {meal.is_free_meal && (
                          <div className="mt-3 pt-2.5 border-t border-amber-100/80">
                            <label className="block text-[11px] font-semibold text-amber-800 mb-1.5 flex items-center gap-1.5">
                              <Sparkles size={12} className="text-amber-500" />
                              <span>Elegir receta para esta comida libre:</span>
                            </label>
                            
                            <div className="relative">
                              <select
                                value={isSelectedRecipe ? meal.title : '__custom__'}
                                onChange={(e) => handleSelectRecipeForMeal(meal.id, e.target.value)}
                                disabled={isHistoricalDay || mutatingPlan || loading || planRefreshRequired}
                                className="w-full text-xs appearance-none bg-amber-50/70 hover:bg-amber-50 border border-amber-200/90 text-slate-700 rounded-2xl py-2 pl-3 pr-8 font-medium focus:outline-none focus:ring-1 focus:ring-pink-300 focus:border-pink-300 transition-colors"
                              >
                                <option value="__custom__">
                                  ✨ Libre (sin receta fija / personalizada)
                                </option>
                                {matchingRecipes.map(rec => (
                                  <option key={rec.id || rec.title} value={rec.title} className="font-normal text-slate-700 py-1">
                                    {rec.title}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-500 pointer-events-none" />
                            </div>
                          </div>
                        )}

                        {/* Sección de Valoración y Receta */}
                        <div className="flex items-center gap-3 mt-3 pt-2 border-t border-slate-50">
                          {meal.recipe_url && (
                            <a
                              href={meal.recipe_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-pink-500 font-medium hover:underline"
                            >
                              <span>Ver Reel</span>
                              <ExternalLink size={12} />
                            </a>
                          )}

                          {/* Botón para poner/editar Nota Única de la Receta */}
                          {canRateRecipes && (
                            <button
                              onClick={() => openReviewModal(meal.title)}
                              disabled={mutatingReviews}
                              className="inline-flex items-center gap-1 text-xs text-purple-500 font-medium bg-purple-50 hover:bg-purple-100 px-2.5 py-1 rounded-xl transition-colors"
                            >
                              <MessageSquare size={12} />
                              <span>{review?.notes ? 'Ver nota' : 'Añadir nota'}</span>
                              {review?.rating && (
                                <div className="flex items-center ml-1 text-amber-400">
                                  <Star size={10} fill="currentColor" />
                                  <span className="text-[10px] text-slate-600 ml-0.5 font-bold">{review.rating}</span>
                                </div>
                              )}
                            </button>
                          )}
                        </div>

                        {review?.notes && (
                          <p className="text-[11px] text-purple-700 italic mt-2 bg-purple-50/50 p-2 rounded-xl border border-purple-100/50">
                            &quot;{review.notes}&quot;
                          </p>
                        )}
                      </div>

                      <button
                        onClick={() => void selectMealOption(meal.id, meal.is_completed)}
                        role={options.length > 1 ? 'radio' : undefined}
                        aria-checked={options.length > 1 ? meal.is_completed : undefined}
                        aria-pressed={options.length === 1 ? meal.is_completed : undefined}
                        aria-label={options.length > 1 ? `Opción ${optionIndex + 1}: ${meal.title}` : `Completar ${meal.title}`}
                        tabIndex={options.length === 1 || meal.is_completed || (!options.some(option => option.is_completed) && optionIndex === 0) ? 0 : -1}
                        onKeyDown={event => {
                          if (options.length === 1 || !['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(event.key)) return;
                          event.preventDefault();
                          if (planMutationBusyRef.current.isBusy() || planRefreshRequired) return;
                          const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
                          const nextIndex = (optionIndex + direction + options.length) % options.length;
                          const radios = event.currentTarget.closest('[role="radiogroup"]')?.querySelectorAll<HTMLButtonElement>('button[role="radio"]');
                          radios?.[nextIndex]?.focus();
                          const nextMeal = options[nextIndex];
                          if (!nextMeal.is_completed) void selectMealOption(nextMeal.id, false);
                        }}
                        disabled={isOutsidePersonalCorrectionWindow || loading}
                        aria-disabled={mutatingPlan || planRefreshRequired}
                        className={`w-9 h-9 rounded-2xl flex items-center justify-center transition-all shrink-0 ${
                          meal.is_completed
                            ? 'bg-pink-400 text-white shadow-md shadow-pink-200'
                            : 'bg-slate-100 text-slate-300 hover:bg-pink-50 hover:text-pink-300'
                        }`}
                      >
                        <Check size={18} strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                );
                  })}
                  </div>
                </section>
                </React.Fragment>);
              })}
            </div>
          )}
        </section>
      )}

      {/* VISTA 2: APARTADO DE NOTAS */}
      {currentTab === 'notes' && canOpenNotes && (
        <section className="px-5 mt-5 space-y-4">
          {/* Tarjeta de Acciones Rápidas */}
          <div className="bg-white p-5 rounded-3xl shadow-sm border border-pink-100">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-pink-500">Resumen semanal</span>
                <h2 className="text-sm font-bold text-slate-800">Enviar reporte</h2>
              </div>
              <div className="bg-pink-50 text-pink-600 text-xs px-2.5 py-1 rounded-full font-bold">
                {reviewedItems.length} {reviewedItems.length === 1 ? 'receta' : 'recetas'}
              </div>
            </div>

            {reviewedItems.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-xs font-light">
                <p>Todavía no has añadido notas a las comidas.</p>
                <p className="mt-1 text-[11px]">Pulsa en &quot;Añadir nota&quot; en cualquier plato del menú diario para empezar.</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-slate-500 mb-4 font-light leading-relaxed">
                  Copia el resumen completo con estrellas y comentarios para pegarlo directamente en el chat con tu nutricionista:
                </p>

                {canSendReport && <div className="flex flex-col gap-2.5">
                  <button
                    onClick={() => copyToClipboard(fullReportText, 'all')}
                    className="w-full py-3 px-4 bg-gradient-to-r from-pink-400 to-purple-400 text-white text-xs font-semibold rounded-2xl shadow-md shadow-pink-200 hover:opacity-95 transition-all flex items-center justify-center gap-2"
                  >
                    {copiedKey === 'all' ? (
                      <>
                        <CheckCheck size={16} />
                        <span>¡Copiado al portapapeles!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={16} />
                        <span>Copiar todo el informe 📋</span>
                      </>
                    )}
                  </button>

                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(fullReportText)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-2.5 px-4 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold rounded-2xl shadow-sm transition-all flex items-center justify-center gap-2"
                  >
                    <Send size={15} />
                    <span>Enviar directo por WhatsApp 💬</span>
                  </a>
                </div>}

                {/* Previsualización del texto a enviar */}
                {canSendReport && <div className="mt-4 pt-3 border-t border-slate-100">
                  <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block mb-1.5">
                    Vista previa del mensaje:
                  </span>
                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-[11px] text-slate-600 whitespace-pre-line font-mono max-h-48 overflow-y-auto leading-relaxed select-all">
                    {fullReportText}
                  </div>
                </div>}
              </>
            )}
          </div>

          {/* Listado de Tarjetas de Notas Individuales */}
          {reviewedItems.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 px-1">
                Todas las notas registradas ({reviewedItems.length})
              </h3>

              {reviewedItems.map((rev) => (
                <div 
                  key={rev.recipe_title}
                  className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-between transition-all"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <h4 className="font-semibold text-slate-800 text-sm leading-snug">
                        {rev.recipe_title}
                      </h4>
                      <div data-testid="review-rating-readonly" className="flex items-center text-amber-400 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100 shrink-0">
                        <Star size={11} fill="currentColor" />
                        <span className="text-[10px] text-slate-700 ml-1 font-bold">
                          {rev.rating || 5}/5
                        </span>
                      </div>
                    </div>

                    {rev.notes ? (
                      <p className="text-xs text-purple-800 bg-purple-50/60 p-2.5 rounded-2xl border border-purple-100/60 my-2 leading-relaxed italic">
                        &quot;{rev.notes}&quot;
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400 italic my-2">Sin texto de nota (solo valoración)</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 mt-1 border-t border-slate-50 text-xs">
                    {canSendReport && <button
                      onClick={() => {
                        const singleText = `• *${rev.recipe_title}* ${'⭐'.repeat(rev.rating || 5)} (${rev.rating || 5}/5)\n  "${rev.notes || ''}"`;
                        copyToClipboard(singleText, rev.recipe_title);
                      }}
                      className="inline-flex items-center gap-1 text-[11px] text-pink-500 hover:text-pink-600 font-medium"
                    >
                      {copiedKey === rev.recipe_title ? (
                        <>
                          <CheckCheck size={13} className="text-emerald-500" />
                          <span className="text-emerald-600">Copiada</span>
                        </>
                      ) : (
                        <>
                          <Copy size={13} />
                          <span>Copiar esta</span>
                        </>
                      )}
                    </button>}

                    {canRateRecipes && <div className="flex items-center gap-2">
                      <button
                        onClick={() => openReviewModal(rev.recipe_title)}
                        disabled={mutatingReviews}
                        className="inline-flex items-center gap-1 text-[11px] text-purple-600 hover:text-purple-700 bg-purple-50 px-2 py-1 rounded-xl"
                      >
                        <Edit3 size={12} />
                        <span>Editar</span>
                      </button>

                      <button
                        onClick={() => deleteReview(rev.recipe_title)}
                        disabled={mutatingReviews}
                        className="p-1 text-slate-300 hover:text-rose-500 transition-colors"
                        title="Eliminar nota"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      </div>

      {/* MODAL PARA EDITAR NOTA / VALORACIÓN DE RECETA */}
      {canRateRecipes && activeRecipe && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 z-50 animate-in fade-in">
          <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="review-dialog-title" onKeyDown={handleDialogKeyDown} className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-xl border border-pink-100 animate-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between mb-4">
              <h3 id="review-dialog-title" className="text-sm font-semibold text-slate-800 pr-4">{activeRecipe}</h3>
              <button aria-label="Cerrar valoración" onClick={closeActiveDialog} className="p-1 text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-3">Valora este plato (se guardará en tu lista de notas):</p>

            {/* Estrellas */}
            <div className="flex justify-center gap-2 mb-4">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setCurrentRating(star)}
                  disabled={mutatingReviews}
                  className="p-1 transition-transform hover:scale-110"
                >
                  <Star
                    size={24}
                    fill={star <= currentRating ? "#FBBF24" : "none"}
                    className={star <= currentRating ? "text-amber-400" : "text-slate-200"}
                  />
                </button>
              ))}
            </div>

            {/* Campo de Notas */}
            <textarea
              value={currentNotes}
              onChange={(e) => setCurrentNotes(e.target.value)}
              disabled={mutatingReviews}
              placeholder="Escribe tus impresiones (ej: 'Me encantó la salsa', 'Muy saciante', 'Cambiar el queso la próxima vez'...)"
              className="w-full text-xs p-3 rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-pink-300 focus:ring-1 focus:ring-pink-300 min-h-[90px] mb-4 text-slate-700"
            />

            <button
              onClick={saveReview}
              disabled={mutatingReviews}
              className="w-full py-3 bg-gradient-to-r from-pink-400 to-purple-400 text-white font-medium text-xs rounded-2xl shadow-md shadow-pink-200 hover:opacity-95 transition-opacity"
            >
              {savingReview ? 'Guardando...' : 'Guardar Nota'}
            </button>
          </div>
        </div>
      )}

      {/* MODAL PARA AÑADIR COMIDA LIBRE A UN DÍA */}
      {showAddMealModal && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 z-50 animate-in fade-in">
          <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="add-meal-dialog-title" onKeyDown={handleDialogKeyDown} className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-xl border border-pink-100 animate-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-amber-500" />
                <h3 id="add-meal-dialog-title" className="text-sm font-semibold text-slate-800">Añadir Comida Libre</h3>
              </div>
              <button aria-label="Cerrar comida libre" onClick={closeActiveDialog} className="p-1 text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            {planError && <p className="mb-3 text-sm text-rose-700" role="alert">{planError}</p>}
            <div className="space-y-3.5 mb-5">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Momento del día:
                </label>
                <input
                  value={newMealType}
                  onChange={(event) => setNewMealType(event.target.value)}
                  list="existing-meal-groups"
                  maxLength={200}
                  placeholder="Escribe un grupo o elige uno existente"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-700"
                />
                <datalist id="existing-meal-groups">
                  {Object.keys(groupedMeals).map((type) => <option key={type} value={type} />)}
                </datalist>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Elige una receta (opcional):
                </label>
                <div className="relative">
                  <select
                    value={newMealRecipeTitle}
                    onChange={(e) => setNewMealRecipeTitle(e.target.value)}
                    className="w-full text-xs appearance-none bg-slate-50 border border-slate-200 text-slate-700 rounded-2xl py-2.5 pl-3 pr-8 font-medium focus:outline-none focus:border-pink-300 focus:ring-1 focus:ring-pink-300"
                  >
                    <option value="">✨ Libre personalizada (o sin receta)</option>
                    {Object.entries(groupedRecipes).map(([group, groupList]) => (
                      <optgroup key={group} label={group} className="font-semibold text-slate-800 bg-white">
                        {groupList.map(rec => (
                          <option key={rec.id || rec.title} value={rec.title} className="font-normal text-slate-700 py-1">
                            {rec.title}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>

            <button
              onClick={handleAddFreeMeal}
              disabled={savingNewMeal || isHistoricalDay || mutatingPlan || loading || planRefreshRequired}
              className="w-full py-3 bg-gradient-to-r from-pink-400 to-purple-400 text-white font-semibold text-xs rounded-2xl shadow-md shadow-pink-200 hover:opacity-95 transition-opacity"
            >
              {savingNewMeal ? 'Guardando...' : 'Añadir a este día 🎉'}
            </button>
          </div>
        </div>
      )}

      {/* MODAL PARA CARGAR O INTERCAMBIAR MENÚ DE OTRO DÍA */}
      {showLoadDayModal && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 z-50 animate-in fade-in">
          <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="load-day-dialog-title" onKeyDown={handleDialogKeyDown} className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-xl border border-pink-100 animate-in slide-in-from-bottom-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100">
                  <ArrowLeftRight size={16} />
                </div>
                <div>
                  <h3 id="load-day-dialog-title" className="text-sm font-semibold text-slate-800">Menú de otro día</h3>
                  <p className="text-[11px] text-slate-400">
                    Día actual: <span className="font-medium text-slate-600 capitalize">{parseDateString(selectedDate).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' })}</span>
                  </p>
                </div>
              </div>
              <button aria-label="Cerrar menú de otro día" onClick={closeActiveDialog} className="p-1 text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            {planError && <p className="mb-3 text-sm text-rose-700" role="alert">{planError}</p>}
            {/* Selector de Modo: Copiar vs Intercambiar */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100/80 rounded-2xl mb-4 text-xs font-medium">
              <button
                type="button"
                onClick={() => setLoadDayMode('copy')}
                className={`py-2 px-3 rounded-xl transition-all text-center flex items-center justify-center gap-1.5 ${
                  loadDayMode === 'copy'
                    ? 'bg-white text-pink-600 shadow-sm font-semibold'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <span>📥 Copiar a este día</span>
              </button>
              <button
                type="button"
                onClick={() => setLoadDayMode('swap')}
                className={`py-2 px-3 rounded-xl transition-all text-center flex items-center justify-center gap-1.5 ${
                  loadDayMode === 'swap'
                    ? 'bg-white text-purple-600 shadow-sm font-semibold'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <span>🔄 Intercambiar</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-500 mb-2 font-medium">
              {loadDayMode === 'copy' 
                ? 'Puedes copiar un día anterior sin modificarlo. ¿Qué menú quieres cargar en este día?' 
                : 'Intercambiar solo permite hoy o fechas futuras. ¿Con qué día quieres intercambiar?'}
            </p>

            {/* Lista de Días Disponibles */}
            <div className="space-y-2 mb-4 max-h-56 overflow-y-auto pr-1">
              {loadingSourceDays && (
                <p className="rounded-2xl bg-slate-50 p-4 text-center text-xs text-slate-400">Cargando tus días…</p>
              )}
              {!loadingSourceDays && availableSourceDays.length === 0 && (
                <p className="rounded-2xl bg-slate-50 p-4 text-center text-xs text-slate-400">
                  No tienes otros días con comidas para cargar.
                </p>
              )}
              {availableSourceDays.map((dayData) => {
                const isSelected = selectedSourceDate === dayData.date;
                const dayGroups = groupMealOptions(dayData.meals);
                const lunchTitles = (dayGroups.ALMUERZO ?? []).map(meal => meal.title).join(' / ');
                const dinnerTitles = (dayGroups.CENA ?? []).map(meal => meal.title).join(' / ');

                return (
                  <button
                    key={dayData.date}
                    type="button"
                    onClick={() => setSelectedSourceDate(dayData.date)}
                    className={`w-full text-left p-3 rounded-2xl border transition-all ${
                      isSelected
                        ? 'border-pink-300 bg-pink-50/60 ring-2 ring-pink-200/50'
                        : 'border-slate-100 bg-slate-50/50 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-bold ${isSelected ? 'text-pink-600' : 'text-slate-700'}`}>
                        {parseDateString(dayData.date).toLocaleDateString('es-ES', {
                          weekday: 'long', day: 'numeric', month: 'short', year: 'numeric'
                        })}
                      </span>
                      {isSelected && (
                        <span className="w-5 h-5 rounded-full bg-pink-500 text-white flex items-center justify-center text-[10px]">
                          ✓
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 space-y-0.5 font-light">
                      <div className="truncate">🥗 <span className="font-medium text-slate-600">Almuerzo:</span> {lunchTitles}</div>
                      <div className="truncate">🍲 <span className="font-medium text-slate-600">Cena:</span> {dinnerTitles}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Opción de proteger comidas ya completadas */}
            {meals.some(m => m.is_completed) && (
              <label className="flex items-start gap-2.5 p-3 rounded-2xl bg-amber-50/70 border border-amber-200/70 text-amber-800 text-[11px] mb-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={keepCompletedMeals}
                  onChange={(e) => setKeepCompletedMeals(e.target.checked)}
                  className="mt-0.5 rounded text-pink-500 focus:ring-pink-300"
                />
                <div>
                  <span className="font-semibold block">Mantener comidas ya completadas hoy</span>
                  <span className="text-amber-700/80 font-light">
                    Hay {meals.filter(m => m.is_completed).length} comida(s) completada(s) hoy que no se modificarán.
                  </span>
                </div>
              </label>
            )}

            <button
              onClick={handleApplyDayMenu}
              disabled={applyingDayChange || mutatingPlan || loading || planRefreshRequired || loadingSourceDays || !selectedSourceDate || isHistoricalDay || (loadDayMode === 'swap' && isHistoricalDate(selectedSourceDate))}
              className="w-full py-3 bg-gradient-to-r from-pink-400 to-purple-400 text-white font-semibold text-xs rounded-2xl shadow-md shadow-pink-200 hover:opacity-95 transition-opacity flex items-center justify-center gap-2"
            >
              {applyingDayChange ? (
                <span>Aplicando cambios...</span>
              ) : (
                <>
                  <Sparkles size={14} />
                  <span>{loadDayMode === 'copy' ? 'Cargar este menú' : 'Intercambiar con este día'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      <div inert={activeDialog ? true : undefined} aria-hidden={activeDialog ? true : undefined}>
        <AppMobileNavigation current="patient" resolvedViews={appNavigationViews} />
      </div>
    </main>
  );
}
