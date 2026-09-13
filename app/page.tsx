'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
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
  Calendar, 
  Plus, 
  Edit3, 
  Trash2, 
  Send,
  Heart,
  ChevronDown
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

const MOTIVATIONAL_QUOTES = [
  "Un día a la vez, lo estás haciendo genial ✨",
  "Nutre tu cuerpo con amor y constancia 🌸",
  "Cada pequeña elección suma hacia tu mejor versión 🌿",
  "La disciplina es regalarte lo que deseas a largo plazo 💕",
  "Brilla de adentro hacia afuera 💫",
  "Siente el progreso, no busques la perfección 🩰",
];

const MEAL_TYPES = ['DESAYUNO', 'MEDIA MAÑANA', 'ALMUERZO', 'MERIENDA', 'CENA'];

export default function Home() {
  const [currentTab, setCurrentTab] = useState<'plan' | 'notes'>('plan');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [reviews, setReviews] = useState<Record<string, RecipeReview>>({});
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [quoteIndex, setQuoteIndex] = useState<number>(0);

  // Estado para la ventana de notas/ratings
  const [activeRecipe, setActiveRecipe] = useState<string | null>(null);
  const [currentRating, setCurrentRating] = useState<number>(5);
  const [currentNotes, setCurrentNotes] = useState<string>('');
  const [savingReview, setSavingReview] = useState<boolean>(false);

  // Estado para modal de añadir comida libre
  const [showAddMealModal, setShowAddMealModal] = useState<boolean>(false);
  const [newMealType, setNewMealType] = useState<string>('ALMUERZO');
  const [newMealRecipeTitle, setNewMealRecipeTitle] = useState<string>('');
  const [savingNewMeal, setSavingNewMeal] = useState<boolean>(false);

  // Estado para feedback de copiado al portapapeles
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    const dayOfYear = Math.floor((new Date().getTime() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 1000 / 60 / 60 / 24);
    setQuoteIndex(dayOfYear % MOTIVATIONAL_QUOTES.length);
  }, []);

  useEffect(() => {
    fetchData();
  }, [selectedDate]);

  async function fetchData() {
    setLoading(true);

    // 1. Cargar comidas de la fecha seleccionada
    const { data: mealsData } = await supabase
      .from('daily_plan')
      .select('*')
      .eq('date', selectedDate)
      .order('created_at', { ascending: true });

    if (mealsData) setMeals((mealsData as Meal[]) || []);

    // 2. Cargar todas las notas/ratings por receta
    const { data: reviewsData } = await supabase
      .from('recipe_reviews')
      .select('*')
      .order('updated_at', { ascending: false });

    if (reviewsData) {
      const reviewMap: Record<string, RecipeReview> = {};
      reviewsData.forEach((rev: any) => {
        reviewMap[rev.recipe_title] = rev;
      });
      setReviews(reviewMap);
    }

    // 3. Cargar catálogo de recetas (desde tabla recipes y respaldo desde daily_plan)
    const { data: recipesData } = await supabase
      .from('recipes')
      .select('*')
      .order('title', { ascending: true });

    let allRecipes: Recipe[] = (recipesData as Recipe[]) || [];

    // Por seguridad, aseguramos que cualquier receta previa en daily_plan también aparezca
    const { data: planMeals } = await supabase
      .from('daily_plan')
      .select('title, meal_type, ingredients, recipe_url, is_free_meal');

    if (planMeals) {
      const titlesSet = new Set(allRecipes.map(r => r.title.toLowerCase().trim()));
      planMeals.forEach((m: any) => {
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

    setRecipes(allRecipes);
    setLoading(false);
  }

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

    return Object.fromEntries(Object.entries(groups).filter(([_, list]) => list.length > 0));
  }, [recipes]);

  async function toggleComplete(mealId: string, currentStatus: boolean) {
    const updatedStatus = !currentStatus;
    setMeals(meals.map(m => m.id === mealId ? { ...m, is_completed: updatedStatus } : m));

    await supabase
      .from('daily_plan')
      .update({ is_completed: updatedStatus })
      .eq('id', mealId);
  }

  const changeDate = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  // Selección de receta para una comida libre existente
  const handleSelectRecipeForMeal = async (mealId: string, selectedRecipeTitle: string) => {
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
    setSavingNewMeal(true);
    let title = `${newMealType.charAt(0) + newMealType.slice(1).toLowerCase()} Libre 🎉`;
    let ingredients = 'Comida libre';
    let recipeUrl: string | null = null;

    if (newMealRecipeTitle && newMealRecipeTitle !== '__custom__') {
      const rec = recipes.find(r => r.title === newMealRecipeTitle);
      if (rec) {
        title = rec.title;
        ingredients = rec.ingredients || '';
        recipeUrl = rec.recipe_url || null;
      }
    }

    const newRecord = {
      date: selectedDate,
      meal_type: newMealType,
      title,
      ingredients,
      recipe_url: recipeUrl,
      is_free_meal: true,
      free_meal_label: 'Día Libre',
      is_completed: false,
    };

    const { data, error } = await supabase.from('daily_plan').insert([newRecord]).select();

    if (data && data.length > 0) {
      setMeals([...meals, data[0] as Meal]);
      setShowAddMealModal(false);
      setNewMealRecipeTitle('');
    }
    setSavingNewMeal(false);
  };

  // Modal de notas
  const openReviewModal = (title: string) => {
    setActiveRecipe(title);
    const existing = reviews[title];
    setCurrentRating(existing?.rating || 5);
    setCurrentNotes(existing?.notes || '');
  };

  const saveReview = async () => {
    if (!activeRecipe) return;
    setSavingReview(true);

    const payload = {
      recipe_title: activeRecipe,
      rating: currentRating,
      notes: currentNotes,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('recipe_reviews')
      .upsert(payload, { onConflict: 'recipe_title' });

    if (!error) {
      setReviews(prev => ({
        ...prev,
        [activeRecipe]: payload
      }));
      setActiveRecipe(null);
    }
    setSavingReview(false);
  };

  const deleteReview = async (recipeTitle: string) => {
    if (!window.confirm(`¿Seguro que quieres eliminar la nota de "${recipeTitle}"?`)) return;

    await supabase
      .from('recipe_reviews')
      .delete()
      .eq('recipe_title', recipeTitle);

    setReviews(prev => {
      const next = { ...prev };
      delete next[recipeTitle];
      return next;
    });
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

  // Formato del informe para enviar a la chica
  const reviewedItems = useMemo(() => {
    return Object.values(reviews).filter(r => (r.notes && r.notes.trim()) || r.rating);
  }, [reviews]);

  const generateFullReport = () => {
    if (reviewedItems.length === 0) return '';
    let text = `🌸 *Notas de Comidas - Alba* 🌸\n\n`;
    reviewedItems.forEach((rev, idx) => {
      const stars = '⭐'.repeat(rev.rating || 5);
      text += `${idx + 1}. *${rev.recipe_title}* ${stars} (${rev.rating || 5}/5)\n`;
      if (rev.notes && rev.notes.trim()) {
        text += `   "${rev.notes.trim()}"\n`;
      }
      text += `\n`;
    });
    text += `✨ ¡Seguimos a tope! 💪`;
    return text;
  };

  const fullReportText = generateFullReport();
  const notesCount = reviewedItems.filter(r => r.notes && r.notes.trim()).length;

  return (
    <main className="min-h-screen bg-[#FAF7F2] text-slate-700 pb-28 max-w-md mx-auto relative font-sans">
      {/* Toast de Copiado */}
      {copiedKey && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-slate-900/90 backdrop-blur-md text-white px-4 py-2.5 rounded-2xl text-xs font-medium shadow-xl flex items-center gap-2 border border-pink-500/30 animate-in fade-in slide-in-from-top-3">
          <CheckCheck size={16} className="text-pink-400" />
          <span>
            {copiedKey === 'all' 
              ? '¡Informe completo copiado! Listo para WhatsApp 💖' 
              : '¡Nota copiada al portapapeles! ✨'}
          </span>
        </div>
      )}

      {/* Header Aesthetic */}
      <header className="bg-gradient-to-br from-pink-100 via-purple-100 to-blue-100 pt-10 pb-6 px-6 rounded-b-[2.5rem] shadow-sm border-b border-pink-100/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="text-pink-400" size={18} />
            <span className="text-xs font-semibold uppercase tracking-widest text-pink-500">
              {currentTab === 'plan' ? 'Mantra Diario' : 'Reporte para la chica'}
            </span>
          </div>
          <div className="w-8 h-8 bg-white/70 backdrop-blur-md rounded-full flex items-center justify-center text-xs font-bold text-pink-500 shadow-sm border border-pink-200">
            A
          </div>
        </div>

        {currentTab === 'plan' ? (
          <>
            {/* Frase Motivadora */}
            <p className="text-slate-800 text-base font-medium leading-snug italic mb-5 min-h-[48px] flex items-center">
              "{MOTIVATIONAL_QUOTES[quoteIndex]}"
            </p>

            {/* Selector de Fecha */}
            <div className="flex items-center justify-between bg-white/80 backdrop-blur-md rounded-2xl p-2 shadow-sm border border-pink-100/60">
              <button onClick={() => changeDate(-1)} className="p-2 hover:bg-pink-50 rounded-xl transition-colors text-pink-400">
                <ChevronLeft size={20} />
              </button>
              <span className="font-medium text-xs sm:text-sm capitalize text-slate-700">
                {new Date(selectedDate).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })}
              </span>
              <button onClick={() => changeDate(1)} className="p-2 hover:bg-pink-50 rounded-xl transition-colors text-pink-400">
                <ChevronRight size={20} />
              </button>
            </div>
          </>
        ) : (
          <div className="mt-2 mb-2">
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <span>Notas para la chica</span>
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
                onClick={() => setShowAddMealModal(true)}
                className="text-[11px] text-pink-600 bg-pink-50 hover:bg-pink-100 px-2.5 py-1 rounded-xl font-medium transition-colors flex items-center gap-1 border border-pink-200/60"
                title="Añadir comida libre"
              >
                <Plus size={12} />
                <span>Añadir libre</span>
              </button>
              <span className="text-xs text-pink-500 bg-pink-50 px-3 py-1 rounded-full font-medium">
                {meals.filter(m => m.is_completed).length} de {meals.length} hecho
              </span>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12 text-slate-400 text-sm font-light">Cargando tus recetas... 🌸</div>
          ) : meals.length === 0 ? (
            <div className="bg-white p-8 rounded-3xl text-center shadow-sm border border-pink-50">
              <Utensils className="mx-auto text-pink-200 mb-3" size={36} />
              <h3 className="text-sm font-semibold text-slate-700 mb-1">Día de descanso o libre 🌸</h3>
              <p className="text-slate-400 text-xs font-light mb-5">No tienes comidas prefijadas para este día. Puedes elegir qué recetas tomar hoy.</p>
              <button
                onClick={() => setShowAddMealModal(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-pink-400 to-purple-400 text-white text-xs font-semibold rounded-2xl shadow-md shadow-pink-200 hover:opacity-95 transition-all"
              >
                <Plus size={15} />
                <span>Elegir receta para este día libre</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3.5">
              {meals.map((meal) => {
                const review = reviews[meal.title];
                const isSelectedRecipe = recipes.some(r => r.title === meal.title);

                return (
                  <div 
                    key={meal.id} 
                    className={`bg-white p-4 rounded-3xl shadow-sm border transition-all ${
                      meal.is_completed 
                        ? 'opacity-60 bg-slate-50/80 border-slate-100' 
                        : meal.is_free_meal 
                          ? 'border-amber-200/70 bg-gradient-to-b from-white to-amber-50/20' 
                          : 'border-slate-100'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 pr-3">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-purple-600 bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-100">
                            {meal.meal_type}
                          </span>
                          
                          {/* Badge de comida libre con opción de alternar */}
                          <button
                            onClick={() => toggleMealIsFree(meal.id, meal.is_free_meal)}
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

                        <h3 className={`font-medium text-slate-800 text-sm ${meal.is_completed ? 'line-through text-slate-400' : ''}`}>
                          {meal.title}
                        </h3>

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
                                className="w-full text-xs appearance-none bg-amber-50/70 hover:bg-amber-50 border border-amber-200/90 text-slate-700 rounded-2xl py-2 pl-3 pr-8 font-medium focus:outline-none focus:ring-1 focus:ring-pink-300 focus:border-pink-300 transition-colors"
                              >
                                <option value="__custom__">
                                  ✨ Libre (sin receta fija / personalizada)
                                </option>
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
                          <button
                            onClick={() => openReviewModal(meal.title)}
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
                        </div>

                        {review?.notes && (
                          <p className="text-[11px] text-purple-700 italic mt-2 bg-purple-50/50 p-2 rounded-xl border border-purple-100/50">
                            "{review.notes}"
                          </p>
                        )}
                      </div>

                      <button
                        onClick={() => toggleComplete(meal.id, meal.is_completed)}
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
          )}
        </section>
      )}

      {/* VISTA 2: APARTADO DE NOTAS PARA LA CHICA */}
      {currentTab === 'notes' && (
        <section className="px-5 mt-5 space-y-4">
          {/* Tarjeta de Acciones Rápidas */}
          <div className="bg-white p-5 rounded-3xl shadow-sm border border-pink-100">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-pink-500">Resumen semanal</span>
                <h2 className="text-sm font-bold text-slate-800">Enviar reporte a la chica</h2>
              </div>
              <div className="bg-pink-50 text-pink-600 text-xs px-2.5 py-1 rounded-full font-bold">
                {reviewedItems.length} {reviewedItems.length === 1 ? 'receta' : 'recetas'}
              </div>
            </div>

            {reviewedItems.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-xs font-light">
                <p>Todavía no has añadido notas a las comidas.</p>
                <p className="mt-1 text-[11px]">Pulsa en "Añadir nota" en cualquier plato del menú diario para empezar.</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-slate-500 mb-4 font-light leading-relaxed">
                  Copia el resumen completo con estrellas y comentarios para pegarlo directamente en el chat con tu nutricionista:
                </p>

                <div className="flex flex-col gap-2.5">
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
                </div>

                {/* Previsualización del texto a enviar */}
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block mb-1.5">
                    Vista previa del mensaje:
                  </span>
                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-[11px] text-slate-600 whitespace-pre-line font-mono max-h-48 overflow-y-auto leading-relaxed select-all">
                    {fullReportText}
                  </div>
                </div>
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
                      <div className="flex items-center text-amber-400 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100 shrink-0">
                        <Star size={11} fill="currentColor" />
                        <span className="text-[10px] text-slate-700 ml-1 font-bold">
                          {rev.rating || 5}/5
                        </span>
                      </div>
                    </div>

                    {rev.notes ? (
                      <p className="text-xs text-purple-800 bg-purple-50/60 p-2.5 rounded-2xl border border-purple-100/60 my-2 leading-relaxed italic">
                        "{rev.notes}"
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400 italic my-2">Sin texto de nota (solo valoración)</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 mt-1 border-t border-slate-50 text-xs">
                    <button
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
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openReviewModal(rev.recipe_title)}
                        className="inline-flex items-center gap-1 text-[11px] text-purple-600 hover:text-purple-700 bg-purple-50 px-2 py-1 rounded-xl"
                      >
                        <Edit3 size={12} />
                        <span>Editar</span>
                      </button>

                      <button
                        onClick={() => deleteReview(rev.recipe_title)}
                        className="p-1 text-slate-300 hover:text-rose-500 transition-colors"
                        title="Eliminar nota"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* MODAL PARA EDITAR NOTA / VALORACIÓN DE RECETA */}
      {activeRecipe && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-xl border border-pink-100 animate-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-800 pr-4">{activeRecipe}</h3>
              <button onClick={() => setActiveRecipe(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-3">Valora este plato (se guardará en tu lista de notas para la chica):</p>

            {/* Estrellas */}
            <div className="flex justify-center gap-2 mb-4">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setCurrentRating(star)}
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
              placeholder="Escribe tus impresiones (ej: 'Me encantó la salsa', 'Muy saciante', 'Cambiar el queso la próxima vez'...)"
              className="w-full text-xs p-3 rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-pink-300 focus:ring-1 focus:ring-pink-300 min-h-[90px] mb-4 text-slate-700"
            />

            <button
              onClick={saveReview}
              disabled={savingReview}
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
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-xl border border-pink-100 animate-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-amber-500" />
                <h3 className="text-sm font-semibold text-slate-800">Añadir Comida Libre</h3>
              </div>
              <button onClick={() => setShowAddMealModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3.5 mb-5">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Momento del día:
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {MEAL_TYPES.map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setNewMealType(type)}
                      className={`text-[11px] py-1.5 px-2.5 rounded-xl font-medium border text-center transition-all ${
                        newMealType === type
                          ? 'bg-pink-50 border-pink-300 text-pink-600 font-semibold'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
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
              disabled={savingNewMeal}
              className="w-full py-3 bg-gradient-to-r from-pink-400 to-purple-400 text-white font-semibold text-xs rounded-2xl shadow-md shadow-pink-200 hover:opacity-95 transition-opacity"
            >
              {savingNewMeal ? 'Guardando...' : 'Añadir a este día 🎉'}
            </button>
          </div>
        </div>
      )}

      {/* BARRA DE NAVEGACIÓN INFERIOR AESTHETIC */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/90 backdrop-blur-md border-t border-pink-100/70 py-2.5 px-6 flex items-center justify-around z-40 shadow-[0_-4px_20px_rgba(244,114,182,0.06)]">
        <button
          onClick={() => setCurrentTab('plan')}
          className={`flex flex-col items-center gap-1 py-1 px-5 rounded-2xl transition-all ${
            currentTab === 'plan' 
              ? 'text-pink-500 font-semibold scale-105' 
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Calendar size={20} className={currentTab === 'plan' ? 'stroke-[2.5]' : ''} />
          <span className="text-[11px]">Plan Diario</span>
        </button>

        <button
          onClick={() => setCurrentTab('notes')}
          className={`flex flex-col items-center gap-1 py-1 px-5 rounded-2xl transition-all relative ${
            currentTab === 'notes' 
              ? 'text-pink-500 font-semibold scale-105' 
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <div className="relative">
            <MessageSquare size={20} className={currentTab === 'notes' ? 'stroke-[2.5]' : ''} />
            {notesCount > 0 && (
              <span className="absolute -top-1 -right-2.5 bg-pink-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center shadow-sm">
                {notesCount}
              </span>
            )}
          </div>
          <span className="text-[11px]">Notas chica 💌</span>
        </button>
      </nav>
    </main>
  );
}