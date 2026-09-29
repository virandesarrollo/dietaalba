"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  TrendingUp,
  Trash2,
  X,
} from "lucide-react";
import { AccountMenu } from "@/components/AccountMenu";
import { GymProgressDialog } from "@/components/GymProgressDialog";
import { useConfirmDialog } from "@/components/ConfirmDialogProvider";
import {
  type RoleCode,
} from "@/lib/authz.js";
import {
  adjustWorkoutValue,
  buildWorkoutExerciseCards,
  decideFocusTrapTarget,
  formatWorkoutDate,
  groupAvailableExercises,
  validateWorkoutSet,
} from "@/lib/gym-workouts.js";
import {
  deriveFeatureCapabilities,
  normalizeFeatureRows,
} from "@/lib/feature-permissions.js";
import { madridDateString } from "@/lib/historical-date.js";
import { buildWorkoutBlocks, type WorkoutSuperset } from "@/lib/gym-supersets.js";
import { formatWorkoutShareText } from "@/lib/gym-workout-share.js";
import { supabase } from "@/lib/supabase";
import { advanceAuthIdentity } from "@/lib/view-capabilities-guard.js";

type Membership = { id: string; group_id: string };
type ExerciseGroup = {
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};
type Exercise = {
  code: string;
  name: string;
  group_id: string;
  is_active: boolean;
  gym_exercise_groups: ExerciseGroup | ExerciseGroup[];
};
type DailyExercise = {
  id: string;
  exercise_code: string;
  exercise_name_snapshot: string;
  position: number | null;
  created_at: string;
};
type WorkoutSet = {
  id: string;
  exercise_code: string;
  weight_kg: number;
  reps: number;
  is_completed: boolean;
  created_at: string;
};
type RoleRow = { role_code: string };
type CopySource = {
  date: string;
  exercises: DailyExercise[];
  sets: WorkoutSet[];
};

function shiftDate(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + amount);
  return value.toISOString().slice(0, 10);
}

function StepControl({
  label,
  value,
  delta,
  minimum,
  suffix,
  inputStep,
  onChange,
}: {
  label: string;
  value: number;
  delta: number;
  minimum: number;
  suffix: string;
  inputStep?: number | "any";
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-center text-xs font-semibold text-slate-500">
        {label}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Restar ${label}`}
          onClick={() => onChange(adjustWorkoutValue(value, -delta, minimum))}
          className="min-h-14 min-w-14 rounded-2xl bg-slate-100 text-2xl font-bold text-slate-800"
        >
          −
        </button>
        <label className="min-w-0 flex-1">
          <span className="sr-only">{label}</span>
          <input
            type="number"
            min={minimum}
            step={inputStep ?? (minimum < 1 ? "any" : delta)}
            value={value}
            onChange={(event) => onChange(Number(event.target.value))}
            className="min-h-14 w-full rounded-2xl border text-center text-lg font-bold"
          />
        </label>
        <button
          type="button"
          aria-label={`Sumar ${label}`}
          onClick={() => onChange(adjustWorkoutValue(value, delta, minimum))}
          className="min-h-14 min-w-14 rounded-2xl bg-slate-100 text-2xl font-bold text-slate-800"
        >
          +
        </button>
      </div>
      <p className="mt-1 text-center text-xs text-slate-400">{suffix}</p>
    </div>
  );
}

export default function TrainingPage() {
  const router = useRouter();
  const confirmDialog = useConfirmDialog();
  const today = madridDateString();
  const [workoutDate, setWorkoutDate] = useState(today);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [userId, setUserId] = useState("");
  const [catalog, setCatalog] = useState<Exercise[]>([]);
  const [dailyExercises, setDailyExercises] = useState<DailyExercise[]>([]);
  const [supersets, setSupersets] = useState<WorkoutSuperset[]>([]);
  const [supersetsAvailable, setSupersetsAvailable] = useState(false);
  const [showSupersetPicker, setShowSupersetPicker] = useState(false);
  const [supersetSelection, setSupersetSelection] = useState<string[]>([]);
  const [sets, setSets] = useState<WorkoutSet[]>([]);
  const [gymWeightStep, setGymWeightStep] = useState(1);
  const [showPicker, setShowPicker] = useState(false);
  const [copySources, setCopySources] = useState<string[]>([]);
  const [selectedCopySource, setSelectedCopySource] =
    useState<CopySource | null>(null);
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [loadingCopy, setLoadingCopy] = useState(false);
  const [draftExerciseCode, setDraftExerciseCode] = useState<string | null>(
    null,
  );
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [draftWeight, setDraftWeight] = useState(1);
  const [draftReps, setDraftReps] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [shareFeedback, setShareFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [progressExercise, setProgressExercise] = useState<string | null>(null);
  const [progressExerciseName, setProgressExerciseName] = useState("");
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressError, setProgressError] = useState("");
  const [progressRows, setProgressRows] = useState<
    { workout_date: string; weight_kg: number; reps: number }[]
  >([]);
  const pickerDialogRef = useRef<HTMLElement>(null);
  const pickerTriggerRef = useRef<HTMLButtonElement>(null);
  const pickerWasOpen = useRef(false);
  const progressTriggerRef = useRef<HTMLButtonElement>(null);
  const progressRequestRef = useRef(0);
  const mutationLockRef = useRef(false);
  const mutationTokenRef = useRef(0);
  const workoutGenerationRef = useRef(0);
  const authGenerationRef = useRef(0);
  const currentUserIdRef = useRef<string | null>(null);
  const authInitializedRef = useRef(false);
  const requestGenerationRef = useRef(0);
  const [authIdentity, setAuthIdentity] = useState<{
    generation: number;
    userId: string;
  } | null>(null);

  useEffect(() => {
    if (!showPicker) {
      if (pickerWasOpen.current) {
        pickerWasOpen.current = false;
        pickerTriggerRef.current?.focus();
      }
      return;
    }

    pickerWasOpen.current = true;
    pickerDialogRef.current?.focus();
    function closeWithEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setShowPicker(false);
    }
    document.addEventListener("keydown", closeWithEscape);
    return () => document.removeEventListener("keydown", closeWithEscape);
  }, [showPicker]);

  useEffect(() => {
    if (!showPicker) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showPicker]);

  useEffect(() => {
    let active = true;
    let receivedAuthEvent = false;
    const clearIdentityState = () => {
      setMembership(null);
      setUserId("");
      setCatalog([]);
      setDailyExercises([]);
      setSupersets([]);
      setSupersetsAvailable(false);
      setShowSupersetPicker(false);
      setSupersetSelection([]);
      setShowCopyDialog(false);
      setSelectedCopySource(null);
      setCopySources([]);
      setSets([]);
      setDraftExerciseCode(null);
      setEditingSetId(null);
      setFeedback("");
      setShareFeedback(null);
      progressRequestRef.current += 1;
      setProgressExercise(null);
      setProgressExerciseName("");
      setProgressRows([]);
      setProgressLoading(false);
      setProgressError("");
      setShowPicker(false);
      mutationTokenRef.current += 1;
      mutationLockRef.current = false;
      setSaving(false);
    };
    const applySession = (nextUserId: string | null) => {
      const transition = advanceAuthIdentity(
        {
          initialized: authInitializedRef.current,
          generation: authGenerationRef.current,
          userId: currentUserIdRef.current,
        },
        nextUserId,
      );
      if (!transition.changed) return;
      authInitializedRef.current = transition.state.initialized;
      authGenerationRef.current = transition.state.generation;
      currentUserIdRef.current = transition.state.userId;
      requestGenerationRef.current += 1;
      workoutGenerationRef.current += 1;
      clearIdentityState();
      setLoading(Boolean(nextUserId));
      setAuthIdentity(
        nextUserId
          ? { generation: transition.state.generation, userId: nextUserId }
          : null,
      );
      if (!nextUserId) router.replace("/");
    };
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      receivedAuthEvent = true;
      applySession(session?.user.id ?? null);
    });
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active && !receivedAuthEvent)
          applySession(data.session?.user.id ?? null);
      })
      .catch(() => {
        if (active && !receivedAuthEvent) applySession(null);
      });
    return () => {
      active = false;
      authGenerationRef.current += 1;
      currentUserIdRef.current = null;
      requestGenerationRef.current += 1;
      subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (!authIdentity) return;
    const { generation, userId: activeUserId } = authIdentity;
    const requestGeneration = ++requestGenerationRef.current;
    const requestDate = workoutDate;
    const isCurrent = () =>
      generation === authGenerationRef.current &&
      activeUserId === currentUserIdRef.current &&
      requestGeneration === requestGenerationRef.current &&
      requestDate === workoutDate;
    async function load() {
      setLoading(true);
      setShareFeedback(null);
      progressRequestRef.current += 1;
      setProgressExercise(null);
      setProgressRows([]);
      setProgressLoading(false);
      setProgressError("");
      setShowSupersetPicker(false);
      setSupersetSelection([]);
      setShowCopyDialog(false);
      setSelectedCopySource(null);
      setSupersetsAvailable(false);
      setShowPicker(false);
      setDraftExerciseCode(null);
      setEditingSetId(null);
      try {
        const membershipResult = await supabase
          .from("group_memberships")
          .select("id, group_id")
          .eq("user_id", activeUserId)
          .eq("status", "active")
          .maybeSingle();
        if (!isCurrent()) return;
        const activeMembership = membershipResult.data as Membership | null;
        if (!activeMembership) {
          router.replace("/");
          return;
        }
        const [rolesResult, featuresResult] = await Promise.all([
          supabase
            .from("user_roles")
            .select("role_code")
            .eq("membership_id", activeMembership.id),
          supabase.rpc("get_my_features"),
        ]);
        if (!isCurrent()) return;
        const roles = (rolesResult.data ?? []).map(
          (row) => (row as RoleRow).role_code as RoleCode,
        );
        const isPatient = roles.includes("gym_patient");
        const featureCapabilities = deriveFeatureCapabilities(
          featuresResult.error ? [] : normalizeFeatureRows(featuresResult.data),
        );
        const canTrackGymWorkouts = featureCapabilities.canTrackGymWorkouts;
        if (!isPatient || !canTrackGymWorkouts) {
          router.replace("/");
          return;
        }
        const [catalogResult, dailyResult, setsResult, stepResult, supersetsResult] =
          await Promise.all([
            supabase
              .from("gym_exercises")
              .select(
                "code, name, group_id, is_active, gym_exercise_groups!inner(code, name, sort_order, is_active)",
              )
              .eq("is_active", true)
              .eq("gym_exercise_groups.is_active", true),
            supabase
              .from("gym_workout_exercises")
              .select(
                "id, exercise_code, exercise_name_snapshot, position, created_at",
              )
              .eq("user_id", activeUserId)
              .eq("workout_date", requestDate),
            supabase
              .from("gym_workout_sets")
              .select(
                "id, exercise_code, weight_kg, reps, is_completed, created_at",
              )
              .eq("user_id", activeUserId)
              .eq("workout_date", requestDate)
              .order("created_at"),
            supabase.rpc("get_my_gym_weight_step"),
            supabase
              .from("gym_workout_supersets")
              .select("id, first_exercise_id, second_exercise_id")
              .eq("user_id", activeUserId)
              .eq("workout_date", requestDate),
          ]);
        if (!isCurrent()) return;
        setMembership(activeMembership);
        setUserId(activeUserId);
        setCatalog((catalogResult.data ?? []) as Exercise[]);
        setDailyExercises((dailyResult.data ?? []) as DailyExercise[]);
        setSupersets((supersetsResult.data ?? []) as WorkoutSuperset[]);
        setSupersetsAvailable(!supersetsResult.error);
        setSets((setsResult.data ?? []) as WorkoutSet[]);
        if (typeof stepResult.data === "number" && stepResult.data > 0)
          setGymWeightStep(stepResult.data);
        setFeedback(
          catalogResult.error || dailyResult.error || setsResult.error
            ? "No se pudo cargar el entrenamiento."
            : supersetsResult.error
              ? "No se pudieron cargar las superseries. Recarga la página; si persiste, contacta con el administrador."
              : "",
        );
      } catch {
        if (isCurrent()) setFeedback("No se pudo cargar el entrenamiento.");
      } finally {
        if (isCurrent()) setLoading(false);
      }
    }
    void load();
    return () => {
      requestGenerationRef.current += 1;
    };
  }, [authIdentity, router, workoutDate]);

  const cards = useMemo(
    () => buildWorkoutExerciseCards(dailyExercises, sets),
    [dailyExercises, sets],
  );
  const blocks = useMemo(() => buildWorkoutBlocks(cards, supersets), [cards, supersets]);
  const unpairedCards = blocks.filter((block) => !block.supersetId).flatMap((block) => block.exercises);
  const readOnlySupersets = workoutDate < today;

  async function shareWorkout() {
    try {
      const text = formatWorkoutShareText(formatWorkoutDate(workoutDate), blocks);
      await navigator.clipboard.writeText(text);
      setShareFeedback({ tone: "success", message: "Entrenamiento copiado." });
    } catch {
      setShareFeedback({
        tone: "error",
        message: "No se pudo copiar el entrenamiento.",
      });
    }
  }

  async function saveSuperset(supersetId?: string) {
    if (!membership || mutationLockRef.current || readOnlySupersets || !supersetsAvailable) return;
    if (!supersetId && supersetSelection.length !== 2) return;
    mutationLockRef.current = true;
    const mutationToken = ++mutationTokenRef.current;
    const authGeneration = authGenerationRef.current;
    const mutationUserId = currentUserIdRef.current;
    const mutationGeneration = workoutGenerationRef.current;
    const mutationDate = workoutDate;
    const isCurrent = () => authGeneration === authGenerationRef.current &&
      mutationUserId === currentUserIdRef.current && mutationGeneration === workoutGenerationRef.current;
    setSaving(true);
    setFeedback("");
    try {
      const result = supersetId
        ? await supabase.rpc("separate_my_gym_superset", { p_workout_date: mutationDate, p_superset_id: supersetId })
        : await supabase.rpc("create_my_gym_superset", {
            p_workout_date: mutationDate,
            p_first_exercise_id: supersetSelection[0],
            p_second_exercise_id: supersetSelection[1],
          });
      if (!isCurrent()) return;
      if (result.error) {
        setFeedback("No se pudo guardar la superserie. Recarga el entrenamiento y vuelve a intentarlo.");
        return;
      }
      if (supersetId) setSupersets((current) => current.filter((pair) => pair.id !== supersetId));
      else setSupersets((current) => [...current, result.data as WorkoutSuperset]);
      setShowSupersetPicker(false);
      setSupersetSelection([]);
    } catch {
      if (isCurrent()) setFeedback("No se pudo guardar la superserie. Vuelve a intentarlo.");
    } finally {
      if (mutationToken === mutationTokenRef.current) {
        mutationLockRef.current = false;
        setSaving(false);
      }
    }
  }
  const availableExerciseGroups = useMemo(
    () =>
      groupAvailableExercises(
        catalog,
        dailyExercises.map((exercise) => exercise.exercise_code),
      ),
    [catalog, dailyExercises],
  );

  function changeWorkoutDate(amount: number) {
    if (mutationLockRef.current || saving) return;
    workoutGenerationRef.current += 1;
    setWorkoutDate((current) => shiftDate(current, amount));
  }

  function selectWorkoutDate(nextDate: string) {
    if (!nextDate || mutationLockRef.current || saving) return;
    workoutGenerationRef.current += 1;
    setWorkoutDate(nextDate);
  }

  async function addExercise(exercise: Pick<Exercise, "code" | "name">) {
    if (!membership || mutationLockRef.current) return;
    mutationLockRef.current = true;
    const mutationToken = ++mutationTokenRef.current;
    const authGeneration = authGenerationRef.current;
    const mutationUserId = currentUserIdRef.current;
    const mutationGeneration = workoutGenerationRef.current;
    const mutationDate = workoutDate;
    setSaving(true);
    try {
      const result = await supabase
        .from("gym_workout_exercises")
        .insert({
          user_id: userId,
          group_id: membership.group_id,
          exercise_code: exercise.code,
          workout_date: workoutDate,
        })
        .select(
          "id, exercise_code, exercise_name_snapshot, position, created_at",
        )
        .single();
      if (
        authGeneration !== authGenerationRef.current ||
        mutationUserId !== currentUserIdRef.current ||
        mutationGeneration !== workoutGenerationRef.current ||
        mutationDate !== workoutDate
      )
        return;
      if (result.error || !result.data)
        setFeedback("No se pudo añadir el ejercicio.");
      else {
        setDailyExercises((value) => [...value, result.data as DailyExercise]);
        setShowPicker(false);
      }
    } finally {
      if (mutationToken === mutationTokenRef.current) {
        mutationLockRef.current = false;
        setSaving(false);
      }
    }
  }

  async function beginNew(exerciseCode: string) {
    const previous = [...sets]
      .reverse()
      .find((set) => set.exercise_code === exerciseCode);
    const beginUserId = currentUserIdRef.current;
    const beginGeneration = workoutGenerationRef.current;
    const beginDate = workoutDate;

    let proposal: Pick<WorkoutSet, "weight_kg" | "reps"> | undefined = previous;
    if (!proposal && beginUserId) {
      const result = await supabase
        .from("gym_workout_sets")
        .select("weight_kg, reps")
        .eq("user_id", userId)
        .eq("exercise_code", exerciseCode)
        .lt("workout_date", workoutDate)
        .order("workout_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (
        beginUserId !== currentUserIdRef.current ||
        beginGeneration !== workoutGenerationRef.current ||
        beginDate !== workoutDate
      )
        return;
      proposal = result.data ?? undefined;
    }

    setDraftExerciseCode(exerciseCode);
    setEditingSetId(null);
    setDraftWeight(proposal?.weight_kg ?? gymWeightStep);
    setDraftReps(proposal?.reps ?? 1);
  }

  function beginEdit(set: WorkoutSet) {
    setDraftExerciseCode(set.exercise_code);
    setEditingSetId(set.id);
    setDraftWeight(set.weight_kg);
    setDraftReps(set.reps);
  }

  function cancelDraft() {
    setDraftExerciseCode(null);
    setEditingSetId(null);
  }

  async function showProgress(
    exerciseCode: string,
    exerciseName: string,
    trigger: HTMLButtonElement,
  ) {
    const requestToken = ++progressRequestRef.current;
    const requestUserId = currentUserIdRef.current;
    progressTriggerRef.current = trigger;
    setProgressExercise(exerciseCode);
    setProgressExerciseName(exerciseName);
    setProgressRows([]);
    setProgressError("");
    setProgressLoading(true);
    try {
      const pageSize = 1000;
      const loadedRows: {
        workout_date: string;
        weight_kg: number;
        reps: number;
      }[] = [];
      let offset = 0;
      while (true) {
        const result = await supabase
          .from("gym_workout_sets")
          .select("id, workout_date, weight_kg, reps")
          .eq("user_id", userId)
          .eq("exercise_code", exerciseCode)
          .order("workout_date")
          .order("created_at")
          .order("id")
          .range(offset, offset + pageSize - 1);
        if (
          requestToken !== progressRequestRef.current ||
          requestUserId !== currentUserIdRef.current
        )
          return;
        if (result.error) {
          setProgressError("No se pudo cargar el seguimiento.");
          return;
        }
        const pageRows = (result.data ?? []) as {
          workout_date: string;
          weight_kg: number;
          reps: number;
        }[];
        loadedRows.push(...pageRows);
        if (pageRows.length < pageSize) break;
        offset += pageSize;
      }
      setProgressRows(loadedRows);
    } catch {
      if (
        requestToken === progressRequestRef.current &&
        requestUserId === currentUserIdRef.current
      )
        setProgressError("No se pudo cargar el seguimiento.");
    } finally {
      if (
        requestToken === progressRequestRef.current &&
        requestUserId === currentUserIdRef.current
      )
        setProgressLoading(false);
    }
  }

  const closeProgress = useCallback(() => {
    progressRequestRef.current += 1;
    setProgressExercise(null);
    setProgressLoading(false);
    setProgressError("");
  }, []);

  async function openCopySources() {
    setShowCopyDialog(true);
    setSelectedCopySource(null);
    setLoadingCopy(true);
    setFeedback("");
    const result = await supabase
      .from("gym_workout_exercises")
      .select("workout_date")
      .eq("user_id", userId)
      .gte("workout_date", shiftDate(workoutDate, -20))
      .lt("workout_date", workoutDate)
      .order("workout_date", { ascending: false });
    setCopySources([
      ...new Set((result.data ?? []).map((row) => row.workout_date as string)),
    ]);
    setLoadingCopy(false);
  }

  async function selectCopySource(date: string) {
    setLoadingCopy(true);
    const [exercisesResult, setsResult] = await Promise.all([
      supabase
        .from("gym_workout_exercises")
        .select(
          "id, exercise_code, exercise_name_snapshot, position, created_at",
        )
        .eq("user_id", userId)
        .eq("workout_date", date)
        .order("position"),
      supabase
        .from("gym_workout_sets")
        .select("id, exercise_code, weight_kg, reps, is_completed, created_at")
        .eq("user_id", userId)
        .eq("workout_date", date)
        .order("created_at"),
    ]);
    setSelectedCopySource({
      date,
      exercises: (exercisesResult.data ?? []) as DailyExercise[],
      sets: (setsResult.data ?? []) as WorkoutSet[],
    });
    setLoadingCopy(false);
  }

  async function copySelectedWorkout() {
    if (!selectedCopySource || !membership || mutationLockRef.current || readOnlySupersets || !supersetsAvailable) return;
    const authGeneration = authGenerationRef.current;
    const mutationUserId = currentUserIdRef.current;
    const mutationGeneration = workoutGenerationRef.current;
    const mutationDate = workoutDate;
    const sourceDate = selectedCopySource.date;
    const isCurrent = () => authGeneration === authGenerationRef.current &&
      mutationUserId === currentUserIdRef.current && mutationGeneration === workoutGenerationRef.current;
    const accepted = await confirmDialog({
      title: "Copiar entrenamiento",
      message: "Se copiarán los ejercicios y series como pendientes.",
      confirmLabel: "Copiar",
    });
    if (!accepted || !isCurrent() || mutationLockRef.current) return;
    mutationLockRef.current = true;
    const mutationToken = ++mutationTokenRef.current;
    setSaving(true);
    try {
      const result = await supabase.rpc("copy_my_gym_workout", {
        p_source_date: sourceDate,
        p_target_date: mutationDate,
      });
      if (!isCurrent()) return;
      if (result.error) {
        setFeedback("No se pudo copiar el entrenamiento.");
        return;
      }
      setShowCopyDialog(false);
      setSelectedCopySource(null);
      const [dailyResult, setsResult, supersetsResult] = await Promise.all([
        supabase
          .from("gym_workout_exercises")
          .select(
            "id, exercise_code, exercise_name_snapshot, position, created_at",
          )
          .eq("user_id", userId)
          .eq("workout_date", workoutDate),
        supabase
          .from("gym_workout_sets")
          .select(
            "id, exercise_code, weight_kg, reps, is_completed, created_at",
          )
          .eq("user_id", userId)
          .eq("workout_date", workoutDate)
          .order("created_at"),
        supabase
          .from("gym_workout_supersets")
          .select("id, first_exercise_id, second_exercise_id")
          .eq("user_id", userId)
          .eq("workout_date", workoutDate),
      ]);
      if (!isCurrent()) return;
      setDailyExercises((dailyResult.data ?? []) as DailyExercise[]);
      setSets((setsResult.data ?? []) as WorkoutSet[]);
      setSupersets((supersetsResult.data ?? []) as WorkoutSuperset[]);
      setSupersetsAvailable(!supersetsResult.error);
      if (dailyResult.error || setsResult.error || supersetsResult.error)
        setFeedback("El entrenamiento se copió, pero no se pudo recargar completo. Recarga la página.");
    } catch {
      if (isCurrent()) setFeedback("No se pudo completar la copia. Recarga el entrenamiento antes de volver a intentarlo.");
    } finally {
      if (mutationToken === mutationTokenRef.current) {
        mutationLockRef.current = false;
        setSaving(false);
      }
    }
  }

  async function saveDraft(
    event: FormEvent,
    exerciseCode: string,
    exerciseName: string,
  ) {
    event.preventDefault();
    if (!membership || mutationLockRef.current) return;
    mutationLockRef.current = true;
    const mutationToken = ++mutationTokenRef.current;
    const authGeneration = authGenerationRef.current;
    const mutationUserId = currentUserIdRef.current;
    const mutationGeneration = workoutGenerationRef.current;
    const mutationDate = workoutDate;
    try {
      const validated = validateWorkoutSet({
        weightKg: draftWeight,
        reps: draftReps,
      });
      setSaving(true);
      setFeedback("");
      const query = editingSetId
        ? supabase
            .from("gym_workout_sets")
            .update({ weight_kg: validated.weightKg, reps: validated.reps })
            .eq("id", editingSetId)
            .eq("user_id", userId)
            .eq("workout_date", workoutDate)
        : supabase.from("gym_workout_sets").insert({
            user_id: userId,
            group_id: membership.group_id,
            exercise_code: exerciseCode,
            exercise_name_snapshot: exerciseName,
            workout_date: workoutDate,
            weight_kg: validated.weightKg,
            reps: validated.reps,
            is_completed: false,
          });
      const result = await query
        .select("id, exercise_code, weight_kg, reps, is_completed, created_at")
        .single();
      if (
        authGeneration !== authGenerationRef.current ||
        mutationUserId !== currentUserIdRef.current ||
        mutationGeneration !== workoutGenerationRef.current ||
        mutationDate !== workoutDate
      )
        return;
      if (result.error || !result.data)
        setFeedback(
          editingSetId
            ? "No se pudo actualizar la serie."
            : "No se pudo guardar la serie.",
        );
      else {
        const saved = result.data as WorkoutSet;
        setSets((currentSets) =>
          editingSetId
            ? currentSets.map((set) => (set.id === saved.id ? saved : set))
            : [...currentSets, saved],
        );
        cancelDraft();
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Revisa la serie.");
    } finally {
      if (mutationToken === mutationTokenRef.current) {
        mutationLockRef.current = false;
        setSaving(false);
      }
    }
  }

  async function moveExercise(exercise: DailyExercise, direction: -1 | 1) {
    if (!membership || mutationLockRef.current || readOnlySupersets || !supersetsAvailable) return;
    mutationLockRef.current = true;
    const mutationToken = ++mutationTokenRef.current;
    const authGeneration = authGenerationRef.current;
    const mutationUserId = currentUserIdRef.current;
    const mutationGeneration = workoutGenerationRef.current;
    const mutationDate = workoutDate;
    setSaving(true);
    try {
      setFeedback("");
      const result = await supabase.rpc("move_my_gym_workout_block", {
        p_workout_date: mutationDate,
        p_exercise_id: exercise.id,
        p_direction: direction,
      });
      if (
        authGeneration !== authGenerationRef.current ||
        mutationUserId !== currentUserIdRef.current ||
        mutationGeneration !== workoutGenerationRef.current ||
        mutationDate !== workoutDate
      )
        return;
      if (result.error) setFeedback("No se pudo reordenar el ejercicio.");
      else setDailyExercises((result.data ?? []) as DailyExercise[]);
    } finally {
      if (mutationToken === mutationTokenRef.current) {
        mutationLockRef.current = false;
        setSaving(false);
      }
    }
  }

  async function toggleSetCompleted(set: WorkoutSet) {
    if (!membership || mutationLockRef.current) return;
    mutationLockRef.current = true;
    const mutationToken = ++mutationTokenRef.current;
    const authGeneration = authGenerationRef.current;
    const mutationUserId = currentUserIdRef.current;
    const mutationGeneration = workoutGenerationRef.current;
    const mutationDate = workoutDate;
    setSaving(true);
    try {
      setFeedback("");
      const result = await supabase
        .from("gym_workout_sets")
        .update({ is_completed: !set.is_completed })
        .eq("id", set.id)
        .eq("user_id", userId)
        .eq("group_id", membership.group_id)
        .eq("workout_date", workoutDate)
        .eq("exercise_code", set.exercise_code)
        .select("id, exercise_code, weight_kg, reps, is_completed, created_at")
        .single();
      if (
        authGeneration !== authGenerationRef.current ||
        mutationUserId !== currentUserIdRef.current ||
        mutationGeneration !== workoutGenerationRef.current ||
        mutationDate !== workoutDate
      )
        return;
      if (result.error || !result.data)
        setFeedback("No se pudo actualizar el estado de la serie.");
      else
        setSets((current) =>
          current.map((item) =>
            item.id === set.id ? (result.data as WorkoutSet) : item,
          ),
        );
    } finally {
      if (mutationToken === mutationTokenRef.current) {
        mutationLockRef.current = false;
        setSaving(false);
      }
    }
  }

  async function deleteSet(set: WorkoutSet) {
    if (!membership || mutationLockRef.current) return;
    if (
      !(await confirmDialog({
        title: "Eliminar serie",
        message: "¿Eliminar esta serie?",
        confirmLabel: "Eliminar",
        tone: "danger",
      }))
    )
      return;
    mutationLockRef.current = true;
    const mutationToken = ++mutationTokenRef.current;
    const authGeneration = authGenerationRef.current;
    const mutationUserId = currentUserIdRef.current;
    const mutationGeneration = workoutGenerationRef.current;
    const mutationDate = workoutDate;
    setSaving(true);
    try {
      setFeedback("");
      const result = await supabase
        .from("gym_workout_sets")
        .delete()
        .eq("id", set.id)
        .eq("user_id", userId)
        .eq("group_id", membership.group_id)
        .eq("workout_date", workoutDate)
        .eq("exercise_code", set.exercise_code)
        .select("id")
        .maybeSingle();
      if (
        authGeneration !== authGenerationRef.current ||
        mutationUserId !== currentUserIdRef.current ||
        mutationGeneration !== workoutGenerationRef.current ||
        mutationDate !== workoutDate
      )
        return;
      if (result.error || !result.data)
        setFeedback("No se pudo eliminar la serie.");
      else {
        const deletedId = result.data.id;
        setSets((currentSets) =>
          currentSets.filter((item) => item.id !== deletedId),
        );
        if (editingSetId === set.id) cancelDraft();
      }
    } finally {
      if (mutationToken === mutationTokenRef.current) {
        mutationLockRef.current = false;
        setSaving(false);
      }
    }
  }

  async function deleteDailyExercise(exercise: DailyExercise) {
    if (!membership || mutationLockRef.current) return;
    if (
      !(await confirmDialog({
        title: "Quitar ejercicio",
        message: "¿Quitar este ejercicio y todas sus series?",
        confirmLabel: "Quitar",
        tone: "danger",
      }))
    )
      return;
    mutationLockRef.current = true;
    const mutationToken = ++mutationTokenRef.current;
    const authGeneration = authGenerationRef.current;
    const mutationUserId = currentUserIdRef.current;
    const mutationGeneration = workoutGenerationRef.current;
    const mutationDate = workoutDate;
    setSaving(true);
    try {
      setFeedback("");
      const result = await supabase.rpc("delete_my_gym_workout_exercise", {
        p_exercise_id: exercise.id,
      });
      if (
        authGeneration !== authGenerationRef.current ||
        mutationUserId !== currentUserIdRef.current ||
        mutationGeneration !== workoutGenerationRef.current ||
        mutationDate !== workoutDate
      )
        return;
      if (result.error) setFeedback("No se pudo quitar el ejercicio.");
      else {
        setSupersets((current) => current.filter((pair) =>
          pair.first_exercise_id !== exercise.id && pair.second_exercise_id !== exercise.id));
        setSupersetSelection((current) => current.filter((id) => id !== exercise.id));
        setDailyExercises((current) =>
          current.filter((item) => item.id !== exercise.id),
        );
        setSets((current) =>
          current.filter(
            (item) => item.exercise_code !== exercise.exercise_code,
          ),
        );
        if (draftExerciseCode === exercise.exercise_code) cancelDraft();
      }
    } finally {
      if (mutationToken === mutationTokenRef.current) {
        mutationLockRef.current = false;
        setSaving(false);
      }
    }
  }

  function handlePickerKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;
    const focusable = [
      ...(pickerDialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), summary, [href], [tabindex]:not([tabindex="-1"])',
      ) ?? []),
    ].filter((element) => {
      if (element.hasAttribute("hidden") || element.hasAttribute("disabled"))
        return false;
      const closedDetails = element.closest("details:not([open])");
      return (
        !closedDetails ||
        (element.tagName === "SUMMARY" &&
          element.parentElement === closedDetails)
      );
    });
    if (focusable.length === 0) {
      event.preventDefault();
      pickerDialogRef.current?.focus();
      return;
    }
    const activeElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const target = decideFocusTrapTarget(
      focusable,
      activeElement,
      event.shiftKey,
      activeElement === pickerDialogRef.current,
    );
    if (target) {
      event.preventDefault();
      target.focus();
    }
  }

  if (loading)
    return (
      <main className="theme-page flex min-h-screen items-center justify-center">
        Cargando entrenamiento…
      </main>
    );
  return (
    <main className="theme-page mx-auto min-h-screen max-w-md p-5 pb-28">
      <header className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Día anterior"
          className="min-h-12 min-w-12"
          disabled={saving}
          onClick={() => changeWorkoutDate(-1)}
        >
          <ChevronLeft />
        </button>
        <h1 className="font-bold">Entrenamiento</h1>
        <div className="flex items-center gap-2"><button type="button" aria-label="Día siguiente" className="min-h-12 min-w-12" disabled={saving} onClick={() => changeWorkoutDate(1)}><ChevronRight /></button><AccountMenu /></div>
      </header>
      <label className="relative mb-4 block cursor-pointer text-center text-sm">
        <span aria-hidden="true">{formatWorkoutDate(workoutDate)}</span>
        <input
          type="date"
          aria-label="Seleccionar fecha de entrenamiento"
          value={workoutDate}
          onChange={(event) => selectWorkoutDate(event.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
      {feedback && (
        <p role="alert" className="mb-4 rounded-2xl bg-red-50 p-3 text-red-700">
          {feedback}
        </p>
      )}
      {shareFeedback && (
        <p
          role={shareFeedback.tone === "error" ? "alert" : "status"}
          className={`mb-4 rounded-2xl p-3 ${shareFeedback.tone === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}
        >
          {shareFeedback.message}
        </p>
      )}
      {cards.length > 0 && (
        <div className="mb-4 flex gap-2">
          {!readOnlySupersets && supersetsAvailable && unpairedCards.length >= 2 && (
            <button
              type="button"
              disabled={saving}
              aria-expanded={showSupersetPicker}
              onClick={() => { setSupersetSelection([]); setShowSupersetPicker((current) => !current); }}
              className="min-h-12 flex-1 rounded-2xl bg-indigo-50 font-semibold text-indigo-700"
            >
              + superserie
            </button>
          )}
          <button
            type="button"
            disabled={!supersetsAvailable}
            onClick={() => void shareWorkout()}
            className="min-h-12 flex-1 rounded-2xl bg-slate-100 font-semibold text-slate-800 disabled:opacity-40"
          >
            Compartir...
          </button>
        </div>
      )}
      {showSupersetPicker && (
        <form
          onSubmit={(event) => { event.preventDefault(); void saveSuperset(); }}
          className="mb-4 rounded-3xl bg-white p-4 shadow-sm"
        >
          <fieldset disabled={saving}>
            <legend className="font-semibold">Selecciona dos ejercicios ({supersetSelection.length}/2)</legend>
            <p className="my-2 text-sm text-slate-600">Realiza sus series seguidas. Cada ejercicio conserva su peso y repeticiones.</p>
            {unpairedCards.map((card) => (
              <label key={card.id} className="flex min-h-12 items-center gap-3">
                <input
                  type="checkbox"
                  checked={supersetSelection.includes(card.id)}
                  disabled={supersetSelection.length === 2 && !supersetSelection.includes(card.id)}
                  onChange={(event) => setSupersetSelection((current) => event.target.checked
                    ? [...current, card.id].slice(0, 2) : current.filter((id) => id !== card.id))}
                  className="h-5 w-5"
                />
                {card.name}
              </label>
            ))}
            <div className="mt-3 flex gap-2">
              <button disabled={supersetSelection.length !== 2} className="min-h-12 flex-1 rounded-2xl bg-slate-800 text-white disabled:opacity-40">Guardar superserie</button>
              <button type="button" onClick={() => { setShowSupersetPicker(false); setSupersetSelection([]); }} className="min-h-12 flex-1 rounded-2xl bg-slate-100 text-slate-800">Cancelar</button>
            </div>
          </fieldset>
        </form>
      )}
      {blocks.map((block, blockIndex) => (
        <section key={block.id} aria-label={block.supersetId ? "Superserie de dos ejercicios" : undefined}
          className={block.supersetId ? "mb-4 rounded-3xl border-2 border-indigo-200 bg-indigo-50 p-2" : undefined}>
          {block.supersetId && (
            <div className="flex items-center justify-between gap-2 px-2 pb-2">
              <h2 className="font-bold text-indigo-800">Superserie · 2 ejercicios</h2>
              <button type="button" disabled={saving || readOnlySupersets || !supersetsAvailable}
                onClick={() => void saveSuperset(block.supersetId!)}
                className="min-h-12 rounded-xl px-2 text-sm font-semibold text-indigo-700 disabled:opacity-40">
                Separar ejercicios
              </button>
            </div>
          )}
          {block.exercises.map((card, memberIndex) => (
        <article
          key={card.id}
          className="mb-4 rounded-3xl bg-white p-4 shadow-sm"
        >
          <header className="flex min-h-12 items-center justify-between gap-2 border-b pb-3">
            <h2 className="min-w-0 flex-1 font-bold">{card.name}</h2>
            <div className="flex shrink-0 gap-1">
              {memberIndex === 0 && <>
              <button
                type="button"
                disabled={saving || readOnlySupersets || !supersetsAvailable || blockIndex === 0}
                aria-label={`Subir ${block.supersetId ? "superserie" : card.name}`}
                onClick={() =>
                  void moveExercise(
                    dailyExercises.find((exercise) => exercise.id === card.id)!,
                    -1,
                  )
                }
                className="min-h-12 min-w-12 rounded-xl bg-slate-100 text-slate-800 disabled:opacity-30"
              >
                <ArrowUp aria-hidden="true" className="mx-auto" />
              </button>
              <button
                type="button"
                disabled={saving || readOnlySupersets || !supersetsAvailable || blockIndex === blocks.length - 1}
                aria-label={`Bajar ${block.supersetId ? "superserie" : card.name}`}
                onClick={() =>
                  void moveExercise(
                    dailyExercises.find((exercise) => exercise.id === card.id)!,
                    1,
                  )
                }
                className="min-h-12 min-w-12 rounded-xl bg-slate-100 text-slate-800 disabled:opacity-30"
              >
                <ArrowDown aria-hidden="true" className="mx-auto" />
              </button>
              </>}
              <button
                type="button"
                disabled={saving || (readOnlySupersets && Boolean(block.supersetId))}
                aria-label={`Quitar ${card.name}`}
                onClick={() =>
                  void deleteDailyExercise(
                    dailyExercises.find((exercise) => exercise.id === card.id)!,
                  )
                }
                className="min-h-12 min-w-12 rounded-xl bg-rose-50 text-rose-500"
              >
                <Trash2 aria-hidden="true" className="mx-auto" />
              </button>
            </div>
          </header>
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={(event) =>
              void showProgress(card.exerciseCode, card.name, event.currentTarget)
            }
            className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-indigo-50 text-sm font-semibold text-indigo-700"
          >
            <TrendingUp size={18} aria-hidden="true" />
            Seguimiento
          </button>
          {card.sets.map((item) => {
            const rawSet = sets.find((set) => set.id === item.id)!;
            return editingSetId === item.id ? (
              <form
                key={item.id}
                onSubmit={(event) =>
                  void saveDraft(event, card.exerciseCode, card.name)
                }
                className="border-b py-4"
              >
                <div className="space-y-4">
                  <StepControl
                    label="Peso"
                    value={draftWeight}
                    delta={gymWeightStep}
                    minimum={0.01}
                    suffix="kg"
                    onChange={setDraftWeight}
                  />
                  <StepControl
                    label="Repeticiones"
                    value={draftReps}
                    delta={1}
                    minimum={1}
                    suffix="reps"
                    onChange={setDraftReps}
                  />
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    disabled={saving}
                    className="min-h-14 flex-1 rounded-2xl bg-slate-800 text-white"
                  >
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={cancelDraft}
                    className="min-h-14 flex-1 rounded-2xl bg-slate-100 text-slate-800"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    aria-label={`Eliminar serie ${item.weightKg} kg, ${item.reps} repeticiones`}
                    onClick={() => void deleteSet(rawSet)}
                    className="min-h-14 min-w-14 rounded-2xl bg-rose-50 text-rose-500"
                  >
                    <Trash2 aria-hidden="true" className="mx-auto" />
                  </button>
                </div>
              </form>
            ) : (
              <div
                key={item.id}
                className="flex items-center gap-2 border-b py-2"
              >
                <>
                  <button
                    type="button"
                    disabled={saving}
                    aria-pressed={item.isCompleted}
                    aria-label={
                      item.isCompleted
                        ? "Marcar serie como pendiente"
                        : "Marcar serie como realizada"
                    }
                    onClick={() => void toggleSetCompleted(rawSet)}
                    className={`min-h-14 min-w-14 rounded-2xl ${item.isCompleted ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-800"}`}
                  >
                    <Check
                      aria-hidden="true"
                      className={`mx-auto ${item.isCompleted ? "opacity-100" : "opacity-25"}`}
                    />
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => beginEdit(rawSet)}
                    className={`flex min-h-14 flex-1 items-center justify-between rounded-xl px-3 text-left ${item.isCompleted ? "line-through opacity-50" : ""}`}
                  >
                    <b>{item.weightKg} kg</b>
                    <span>{item.reps} reps</span>
                  </button>
                </>
              </div>
            );
          })}
          {draftExerciseCode === card.exerciseCode && editingSetId === null && (
            <form
              onSubmit={(event) =>
                void saveDraft(event, card.exerciseCode, card.name)
              }
              className="py-4"
            >
              <div className="space-y-4">
                <StepControl
                  label="Peso"
                  value={draftWeight}
                  delta={gymWeightStep}
                  minimum={0.01}
                  suffix="kg"
                  onChange={setDraftWeight}
                />
                <StepControl
                  label="Repeticiones"
                  value={draftReps}
                  delta={1}
                  minimum={1}
                  suffix="reps"
                  onChange={setDraftReps}
                />
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  disabled={saving}
                  className="min-h-14 flex-1 rounded-2xl bg-slate-800 text-white"
                >
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={cancelDraft}
                  className="min-h-14 flex-1 rounded-2xl bg-slate-100 text-slate-800"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
          {draftExerciseCode !== card.exerciseCode && (
            <button
              type="button"
              className="mt-3 min-h-14 w-full rounded-2xl bg-rose-50 text-rose-700"
              onClick={() => void beginNew(card.exerciseCode)}
            >
              Añadir serie
            </button>
          )}
        </article>
          ))}
        </section>
      ))}
      {progressExercise && (
        <GymProgressDialog
          key={progressExercise}
          exerciseName={progressExerciseName}
          rows={progressRows}
          loading={progressLoading}
          error={progressError}
          onClose={closeProgress}
          returnFocusRef={progressTriggerRef}
        />
      )}
      {dailyExercises.length === 0 && (
        <button
          type="button"
          disabled={saving || readOnlySupersets || !supersetsAvailable}
          className="mb-3 min-h-14 w-full rounded-2xl bg-indigo-50 font-semibold text-indigo-700"
          onClick={() => void openCopySources()}
        >
          Copiar entrenamiento anterior
        </button>
      )}
      <button
        ref={pickerTriggerRef}
        type="button"
        className="min-h-14 w-full rounded-2xl bg-slate-800 text-white"
        onClick={() => setShowPicker(true)}
      >
        <Plus className="inline" /> Añadir ejercicio
      </button>
      {showPicker && (
        <div className="fixed inset-0 z-50 bg-slate-950/30">
          <section
            ref={pickerDialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="exercise-picker-title"
            onKeyDown={handlePickerKeyDown}
            className="absolute inset-x-0 bottom-0 mx-auto max-h-[80vh] max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl"
          >
            <div className="flex justify-between">
              <h2 id="exercise-picker-title" className="font-bold">
                Elige ejercicio
              </h2>
              <button
                type="button"
                aria-label="Cerrar selector de ejercicios"
                onClick={() => setShowPicker(false)}
                className="min-h-12 min-w-12"
              >
                <X />
              </button>
            </div>
            {availableExerciseGroups.map((group) => (
              <details key={group.code} className="border-b">
                <summary className="flex min-h-12 cursor-pointer items-center font-semibold">
                  {group.name}
                </summary>
                {group.exercises.map((exercise) => (
                  <button
                    key={exercise.code}
                    disabled={saving}
                    className="min-h-12 w-full pl-4 text-left"
                    onClick={() => void addExercise(exercise as Exercise)}
                  >
                    {exercise.name}
                  </button>
                ))}
              </details>
            ))}
          </section>
        </div>
      )}
      {showCopyDialog && (
        <div className="fixed inset-0 z-50 bg-slate-950/30">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Copiar entrenamiento anterior"
            className="absolute inset-x-0 bottom-0 mx-auto max-h-[80vh] max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-bold">
                {selectedCopySource
                  ? formatWorkoutDate(selectedCopySource.date)
                  : "Entrenamientos anteriores"}
              </h2>
              <button
                type="button"
                aria-label="Cerrar copia de entrenamiento"
                onClick={() => {
                  setShowCopyDialog(false);
                  setSelectedCopySource(null);
                }}
                className="min-h-12 min-w-12"
              >
                <X />
              </button>
            </div>
            {loadingCopy ? (
              <p>Cargando…</p>
            ) : selectedCopySource ? (
              <div className="space-y-3">
                {selectedCopySource.exercises.map((exercise) => (
                  <article
                    key={exercise.id}
                    className="rounded-2xl bg-slate-50 p-3"
                  >
                    <b>{exercise.exercise_name_snapshot}</b>
                    {selectedCopySource.sets
                      .filter(
                        (set) => set.exercise_code === exercise.exercise_code,
                      )
                      .map((set) => (
                        <p key={set.id} className="text-sm text-slate-600">
                          {set.weight_kg} kg × {set.reps} reps
                        </p>
                      ))}
                  </article>
                ))}
                <button
                  type="button"
                  disabled={saving || readOnlySupersets || !supersetsAvailable}
                  className="min-h-14 w-full rounded-2xl bg-slate-800 text-white"
                  onClick={() => void copySelectedWorkout()}
                >
                  Copiar este entrenamiento
                </button>
                <button
                  type="button"
                  className="min-h-12 w-full text-slate-700"
                  onClick={() => setSelectedCopySource(null)}
                >
                  Volver a días
                </button>
              </div>
            ) : copySources.length ? (
              <div className="space-y-2">
                {copySources.map((date) => (
                  <button
                    key={date}
                    type="button"
                    className="min-h-14 w-full rounded-2xl bg-slate-100 px-4 text-left font-semibold text-slate-800"
                    onClick={() => void selectCopySource(date)}
                  >
                    {formatWorkoutDate(date)}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-slate-500">
                No hay entrenamientos en los últimos 20 días.
              </p>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
