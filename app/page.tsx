'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Check, ExternalLink, Star, ChevronLeft, ChevronRight, Utensils, MessageSquare, Sparkles, X } from 'lucide-react';

type Meal = {
  id: string;
  date: string;
  meal_type: string;
  title: string;
  ingredients?: string;
  recipe_url?: string;
  is_free_meal?: boolean;
  free_meal_label?: string;
  is_completed: boolean;
};

type RecipeReview = {
  recipe_title: string;
  rating?: number;
  notes?: string;
};

const MOTIVATIONAL_QUOTES = [
  "Un día a la vez, lo estás haciendo genial ✨",
  "Nutre tu cuerpo con amor y constancia 🌸",
  "Cada pequeña elección suma hacia tu mejor versión 🌿",
  "La disciplina es regalarte lo que deseas a largo plazo 💕",
  "Brilla de adentro hacia afuera 💫",
  "Siente el progreso, no busques la perfección 🩰",
];

export default function Home() {
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [reviews, setReviews] = useState<Record<string, RecipeReview>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [quoteIndex, setQuoteIndex] = useState<number>(0);

  // Estado para la ventana de notas/ratings
  const [activeRecipe, setActiveRecipe] = useState<string | null>(null);
  const [currentRating, setCurrentRating] = useState<number>(5);
  const [currentNotes, setCurrentNotes] = useState<string>('');
  const [savingReview, setSavingReview] = useState<boolean>(false);

  useEffect(() => {
    // Frase aleatoria o diaria
    const dayOfYear = Math.floor((new Date().getTime() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 1000 / 60 / 60 / 24);
    setQuoteIndex(dayOfYear % MOTIVATIONAL_QUOTES.length);
  }, []);

  useEffect(() => {
    fetchData();
  }, [selectedDate]);

  async function fetchData() {
    setLoading(true);

    // Cargar comidas
    const { data: mealsData } = await supabase
      .from('daily_plan')
      .select('*')
      .eq('date', selectedDate)
      .order('created_at', { ascending: true });

    if (mealsData) setMeals((mealsData as Meal[]) || []);

    // Cargar notas/ratings globales por receta
    const { data: reviewsData } = await supabase
      .from('recipe_reviews')
      .select('*');

    if (reviewsData) {
      const reviewMap: Record<string, RecipeReview> = {};
      reviewsData.forEach((rev: any) => {
        reviewMap[rev.recipe_title] = rev;
      });
      setReviews(reviewMap);
    }

    setLoading(false);
  }

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

  return (
    <main className="min-h-screen bg-[#FAF7F2] text-slate-700 pb-24 max-w-md mx-auto relative font-sans">
      {/* Header Aesthetic */}
      <header className="bg-gradient-to-br from-pink-100 via-purple-100 to-blue-100 pt-10 pb-6 px-6 rounded-b-[2.5rem] shadow-sm border-b border-pink-100/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="text-pink-400" size={18} />
            <span className="text-xs font-semibold uppercase tracking-widest text-pink-500">Mantra Diario</span>
          </div>
          <div className="w-8 h-8 bg-white/70 backdrop-blur-md rounded-full flex items-center justify-center text-xs font-bold text-pink-500 shadow-sm border border-pink-200">
            A✨
          </div>
        </div>

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
      </header>

      {/* Lista de Comidas */}
      <section className="px-5 mt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-800 tracking-wide">Menú del día</h2>
          <span className="text-xs text-pink-500 bg-pink-50 px-3 py-1 rounded-full font-medium">
            {meals.filter(m => m.is_completed).length} de {meals.length} hecho
          </span>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-400 text-sm font-light">Cargando tus recetas... 🌸</div>
        ) : meals.length === 0 ? (
          <div className="bg-white p-8 rounded-3xl text-center shadow-sm border border-pink-50">
            <Utensils className="mx-auto text-pink-200 mb-2" size={32} />
            <p className="text-slate-400 text-sm font-light">Día de descanso o sin plan cargado.</p>
          </div>
        ) : (
          <div className="space-y-3.5">
            {meals.map((meal) => {
              const review = reviews[meal.title];
              return (
                <div 
                  key={meal.id} 
                  className={`bg-white p-4 rounded-3xl shadow-sm border border-slate-100 transition-all ${
                    meal.is_completed ? 'opacity-60 bg-slate-50/80' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 pr-3">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-purple-600 bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-100">
                          {meal.meal_type}
                        </span>
                        {meal.is_free_meal && (
                          <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-100">
                            {meal.free_meal_label || 'Libre'}
                          </span>
                        )}
                      </div>

                      <h3 className={`font-medium text-slate-800 text-sm ${meal.is_completed ? 'line-through text-slate-400' : ''}`}>
                        {meal.title}
                      </h3>

                      {meal.ingredients && (
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed font-light">
                          {meal.ingredients}
                        </p>
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
                      className={`w-9 h-9 rounded-2xl flex items-center justify-center transition-all ${
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

      {/* Modal para Editar Nota de Receta */}
      {activeRecipe && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-xl border border-pink-100 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-800 pr-4">{activeRecipe}</h3>
              <button onClick={() => setActiveRecipe(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-3">Valora este plato (se guardará una única nota para esta receta):</p>

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
              placeholder="Escribe tus impresiones (ej: 'Me encantó la salsa', 'Usar menos sal la próxima vez'...)"
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
    </main>
  );
}